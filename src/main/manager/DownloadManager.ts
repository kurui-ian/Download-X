import path from 'path';
import fs from 'fs';
import { BrowserWindow, shell, Notification } from 'electron';
import { DownloadTask, GlobalSpeedStats, TaskCategory } from '../engine/types';
import { Downloader } from '../engine/Downloader';
import { 
  inspectUrl, 
  sanitizeFileName, 
  extractFileNameFromUrl, 
  categorizeFileName, 
  normalizeUrl, 
  isNumericOrHashOnly,
  extractYouTubeVideoId,
  fetchYouTubeTitle,
  ensureFileExtension
} from '../engine/inspector';
import { PersistenceStore } from './store';

export interface AddDownloadParams {
  url: string;
  fileName?: string;
  saveDir?: string;
  threadCount?: number;
  autoStart?: boolean;
  forceRedownload?: boolean;
}

export class DownloadManager {
  private store: PersistenceStore;
  private tasks: Map<string, DownloadTask> = new Map();
  private downloaders: Map<string, Downloader> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor(store: PersistenceStore) {
    this.store = store;
    const loadedTasks = this.store.getTasks();
    for (const t of loadedTasks) {
      // Ensure category is accurately categorized for legacy/saved tasks
      if (!t.category || t.category === 'other' || t.category === 'all') {
        t.category = categorizeFileName(t.fileName, '', t.finalUrl || t.url);
      }
      this.tasks.set(t.id, t);
    }

    // Resolve titles for any existing tasks that were named generic or video_xxx
    setTimeout(async () => {
      let changed = false;
      for (const t of this.tasks.values()) {
        const existingExt = path.extname(t.fileName) || path.extname(t.savePath);
        if (isNumericOrHashOnly(t.fileName) || t.fileName.startsWith('video_') || t.fileName.startsWith('download_') || !path.extname(t.fileName)) {
          const ytId = extractYouTubeVideoId(t.finalUrl || t.url);
          if (ytId) {
            try {
              const ytTitle = await fetchYouTubeTitle(ytId);
              if (ytTitle) {
                let newName = ensureFileExtension(ytTitle, '', t.finalUrl || t.url);
                if (!path.extname(newName) && existingExt) {
                  newName = `${newName}${existingExt}`;
                }
                const oldPath = t.savePath;
                const newPath = path.join(path.dirname(oldPath), newName);
                if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
                  try {
                    fs.renameSync(oldPath, newPath);
                  } catch {}
                }
                t.fileName = newName;
                t.savePath = newPath;
                t.category = categorizeFileName(newName, '', t.finalUrl || t.url);
                changed = true;
              }
            } catch {}
          }
        }
        const expectedCat = categorizeFileName(t.fileName, '', t.finalUrl || t.url);
        if (t.category !== expectedCat) {
          t.category = expectedCat;
          changed = true;
        }
      }
      if (changed) {
        this.scheduleSave();
        this.broadcastTasks();
      }
    }, 1200);
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public findDuplicate(rawUrl: string): DownloadTask | null {
    if (!rawUrl || !rawUrl.trim()) return null;
    const norm = normalizeUrl(rawUrl);
    for (const task of this.tasks.values()) {
      if (normalizeUrl(task.url) === norm || (task.finalUrl && normalizeUrl(task.finalUrl) === norm)) {
        return task;
      }
    }
    return null;
  }

  public async addDownload(params: AddDownloadParams): Promise<DownloadTask> {
    const settings = this.store.getSettings();
    let cleanUrl = params.url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // Check for existing duplicate if not explicitly forced
    if (!params.forceRedownload) {
      const existingDuplicate = this.findDuplicate(cleanUrl);
      if (existingDuplicate) {
        if (['downloading', 'queued', 'connecting'].includes(existingDuplicate.status)) {
          return existingDuplicate;
        }
      }
    }

    const saveDir = params.saveDir || settings.downloadDir;
    if (!fs.existsSync(saveDir)) {
      try {
        fs.mkdirSync(saveDir, { recursive: true });
      } catch (e) {
        console.error('Failed to create download directory:', e);
      }
    }

    // Determine initial fileName smartly
    let initialFileName = params.fileName ? sanitizeFileName(params.fileName) : '';
    if (!initialFileName) {
      initialFileName = extractFileNameFromUrl(cleanUrl);
    }

    // Check YouTube video title fallback if name is still numeric or generic
    const ytId = extractYouTubeVideoId(cleanUrl);
    if (ytId && isNumericOrHashOnly(initialFileName)) {
      try {
        const ytTitle = await fetchYouTubeTitle(ytId);
        if (ytTitle) {
          initialFileName = ensureFileExtension(ytTitle, '', cleanUrl);
        }
      } catch {}
    }

    if (!initialFileName) {
      initialFileName = `download_${Date.now()}`;
    }

    let finalPath = path.join(saveDir, initialFileName);
    let counter = 1;
    const ext = path.extname(initialFileName);
    const base = path.basename(initialFileName, ext);
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(saveDir, `${base} (${counter})${ext}`);
      counter++;
    }

    const taskId = (Date.now().toString(36) + Math.random().toString(36).substring(2, 6)).toLowerCase();
    const threadCount = params.threadCount || settings.defaultConnections || 8;
    const initialCategory = categorizeFileName(path.basename(finalPath), '', cleanUrl);

    const task: DownloadTask = {
      id: taskId,
      url: cleanUrl,
      finalUrl: cleanUrl,
      fileName: path.basename(finalPath),
      savePath: finalPath,
      fileSize: 0,
      downloadedBytes: 0,
      status: 'connecting',
      category: initialCategory,
      supportsRanges: false,
      threadCount: 1,
      chunks: [],
      speed: 0,
      eta: 0,
      progress: 0,
      createdAt: Date.now(),
    };

    // Store and immediately show task in UI!
    this.tasks.set(task.id, task);
    this.scheduleSave();
    this.broadcastTasks();

    // Asynchronously probe and queue
    (async () => {
      try {
        const inspection = await inspectUrl(cleanUrl);
        task.finalUrl = inspection.finalUrl;
        task.fileSize = inspection.fileSize;
        task.supportsRanges = inspection.supportsRanges;
        task.category = inspection.category;
        task.threadCount = inspection.supportsRanges ? threadCount : 1;

        if (!params.fileName && inspection.fileName && inspection.fileName !== task.fileName) {
          if (!isNumericOrHashOnly(inspection.fileName) || isNumericOrHashOnly(task.fileName)) {
            let updatedPath = path.join(saveDir, inspection.fileName);
            let c = 1;
            const uExt = path.extname(inspection.fileName);
            const uBase = path.basename(inspection.fileName, uExt);
            while (fs.existsSync(updatedPath) && updatedPath !== task.savePath) {
              updatedPath = path.join(saveDir, `${uBase} (${c})${uExt}`);
              c++;
            }
            if (fs.existsSync(task.savePath) && task.savePath !== updatedPath) {
              try {
                fs.renameSync(task.savePath, updatedPath);
              } catch {}
            }
            task.fileName = path.basename(updatedPath);
            task.savePath = updatedPath;
            task.category = categorizeFileName(task.fileName, inspection.mimeType, task.finalUrl);
          }
        }

        task.status = params.autoStart !== false ? 'queued' : 'paused';
      } catch (err: any) {
        console.warn('URL inspection warning (will still attempt download):', err.message);
        task.status = params.autoStart !== false ? 'queued' : 'paused';
      }

      this.scheduleSave();
      this.broadcastTasks();

      if (params.autoStart !== false) {
        this.processQueue();
      }
    })();

    return task;
  }

  public pauseDownload(id: string): void {
    const downloader = this.downloaders.get(id);
    if (downloader) {
      downloader.pause();
      this.downloaders.delete(id);
    }

    const task = this.tasks.get(id);
    if (task && task.status !== 'completed') {
      task.status = 'paused';
      task.speed = 0;
      task.eta = 0;
      this.scheduleSave();
      this.broadcastTasks();
    }

    this.processQueue();
  }

  public resumeDownload(id: string): void {
    const task = this.tasks.get(id);
    if (!task || task.status === 'completed') return;

    task.status = 'queued';
    this.scheduleSave();
    this.broadcastTasks();
    this.processQueue();
  }

  public cancelDownload(id: string, deleteFile: boolean = false): void {
    const downloader = this.downloaders.get(id);
    if (downloader) {
      downloader.cancel(deleteFile);
      this.downloaders.delete(id);
    } else if (deleteFile) {
      const task = this.tasks.get(id);
      if (task && fs.existsSync(task.savePath)) {
        try {
          fs.unlinkSync(task.savePath);
        } catch {}
      }
    }

    const task = this.tasks.get(id);
    if (task) {
      task.status = 'cancelled';
      task.speed = 0;
      this.scheduleSave();
      this.broadcastTasks();
    }

    this.processQueue();
  }

  public deleteTask(id: string, deleteFile: boolean = false): void {
    this.cancelDownload(id, deleteFile);
    this.tasks.delete(id);
    this.scheduleSave();
    this.broadcastTasks();
    this.processQueue();
  }

  public pauseAll(): void {
    for (const [id] of this.downloaders.entries()) {
      this.pauseDownload(id);
    }
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading' || task.status === 'queued') {
        task.status = 'paused';
        task.speed = 0;
        task.eta = 0;
      }
    }
    this.scheduleSave();
    this.broadcastTasks();
  }

  public resumeAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'paused' || task.status === 'error') {
        task.status = 'queued';
      }
    }
    this.scheduleSave();
    this.broadcastTasks();
    this.processQueue();
  }

  public clearCompleted(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'cancelled') {
        this.tasks.delete(id);
      }
    }
    this.scheduleSave();
    this.broadcastTasks();
  }

  public async openFile(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (task && fs.existsSync(task.savePath)) {
      const result = await shell.openPath(task.savePath);
      return result === '';
    }
    return false;
  }

  public openFolder(id: string): void {
    const task = this.tasks.get(id);
    if (task && fs.existsSync(task.savePath)) {
      shell.showItemInFolder(task.savePath);
    } else if (task) {
      shell.openPath(path.dirname(task.savePath));
    }
  }

  private processQueue(): void {
    const settings = this.store.getSettings();
    const maxConcurrent = settings.maxConcurrentDownloads || 3;

    const activeCount = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'downloading' || t.status === 'connecting'
    ).length;

    if (activeCount >= maxConcurrent) {
      return;
    }

    const availableSlots = maxConcurrent - activeCount;
    const queuedTasks = Array.from(this.tasks.values())
      .filter((t) => t.status === 'queued')
      .slice(0, availableSlots);

    for (const task of queuedTasks) {
      this.startDownloader(task);
    }
  }

  private startDownloader(task: DownloadTask): void {
    if (this.downloaders.has(task.id)) {
      return;
    }

    const downloader = new Downloader(task);
    this.downloaders.set(task.id, downloader);

    downloader.on('progress', (updatedTask: DownloadTask) => {
      this.tasks.set(updatedTask.id, updatedTask);
      this.broadcastTasksThrottled();
    });

    downloader.on('completed', (completedTask: DownloadTask) => {
      this.downloaders.delete(completedTask.id);
      this.tasks.set(completedTask.id, completedTask);
      this.scheduleSave();
      this.broadcastTasks();

      // Show native desktop notification
      const settings = this.store.getSettings();
      if (settings.enableNotifications && Notification.isSupported()) {
        new Notification({
          title: 'Download Complete',
          body: `${completedTask.fileName} has finished downloading.`,
          silent: false,
        }).show();
      }

      this.processQueue();
    });

    downloader.on('error', (_err, errorTask: DownloadTask) => {
      this.downloaders.delete(errorTask.id);
      this.tasks.set(errorTask.id, errorTask);
      this.scheduleSave();
      this.broadcastTasks();
      this.processQueue();
    });

    downloader.on('paused', (pausedTask: DownloadTask) => {
      this.downloaders.delete(pausedTask.id);
      this.tasks.set(pausedTask.id, pausedTask);
      this.scheduleSave();
      this.broadcastTasks();
    });

    downloader.start();
  }

  private lastBroadcastTime = 0;
  private broadcastTasksThrottled(): void {
    const now = Date.now();
    if (now - this.lastBroadcastTime > 300) {
      this.lastBroadcastTime = now;
      this.broadcastTasks();
    }
  }

  public broadcastTasks(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const taskList = this.getTasks();
    const stats: GlobalSpeedStats = {
      totalSpeed: taskList.reduce((acc, t) => acc + (t.status === 'downloading' ? t.speed : 0), 0),
      activeCount: taskList.filter((t) => t.status === 'downloading').length,
      queuedCount: taskList.filter((t) => t.status === 'queued').length,
      completedCount: taskList.filter((t) => t.status === 'completed').length,
    };

    this.mainWindow.webContents.send('tasks-updated', taskList);
    this.mainWindow.webContents.send('speed-stats', stats);
  }

  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.store.saveTasks(Array.from(this.tasks.values()));
    }, 1000);
  }

  public shutdown(): void {
    this.pauseAll();
    this.store.saveTasks(Array.from(this.tasks.values()));
  }
}
