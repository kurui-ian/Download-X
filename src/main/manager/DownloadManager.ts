import path from 'path';
import fs from 'fs';
import { BrowserWindow, shell, Notification } from 'electron';
import { DownloadTask, GlobalSpeedStats, TaskCategory } from '../engine/types';
import { Downloader } from '../engine/Downloader';
import { TorrentEngine } from '../engine/TorrentEngine';
import { 
  inspectUrl, 
  sanitizeFileName, 
  extractFileNameFromUrl, 
  categorizeFileName, 
  normalizeUrl, 
  isNumericOrHashOnly,
  extractYouTubeVideoId,
  fetchYouTubeTitle,
  ensureFileExtension,
  isOneTimeOrSignedUrl
} from '../engine/inspector';
import { PersistenceStore } from './store';

export interface AddDownloadParams {
  url: string;
  fileName?: string;
  saveDir?: string;
  threadCount?: number;
  autoStart?: boolean;
  forceRedownload?: boolean;
  mimeType?: string;
  fileSize?: number;
  referrer?: string;
  source?: string;
  sourcePageUrl?: string;
  sourcePageTitle?: string;
  quality?: string;
  mediaType?: 'video' | 'audio' | 'image' | 'file' | 'torrent';
  secondaryAudioUrl?: string;
}

export class DownloadManager {
  private store: PersistenceStore;
  private tasks: Map<string, DownloadTask> = new Map();
  private downloaders: Map<string, Downloader> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private activeNotifications: Set<Notification> = new Set();

  constructor(store: PersistenceStore) {
    this.store = store;
    const settings = this.store.getSettings();
    TorrentEngine.getInstance().setSpeedLimit(settings.speedLimitBytesPerSec || 0);

    const loadedTasks = this.store.getTasks();
    for (const t of loadedTasks) {
      if (t.url && TorrentEngine.getInstance().isTorrentSource(t.url)) {
        t.protocol = 'torrent';
      }
      if (!t.category || t.category === 'other' || t.category === 'all') {
        t.category = t.protocol === 'torrent' ? 'torrent' : categorizeFileName(t.fileName, t.mimeType || '', t.finalUrl || t.url);
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
                let newName = ensureFileExtension(ytTitle, t.mimeType || '', t.finalUrl || t.url);
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
                t.category = categorizeFileName(newName, t.mimeType || '', t.finalUrl || t.url);
                changed = true;
              }
            } catch {}
          }
        }
        const expectedCat = t.protocol === 'torrent' ? 'torrent' : categorizeFileName(t.fileName, t.mimeType || '', t.finalUrl || t.url);
        if (t.category !== expectedCat && t.category === 'other') {
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

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public applySpeedLimit(bytesPerSec: number): void {
    const limit = Math.max(0, bytesPerSec || 0);
    TorrentEngine.getInstance().setSpeedLimit(limit);
    this.rebalanceHttpSpeedLimits(limit);
  }

  private rebalanceHttpSpeedLimits(overrideLimit?: number): void {
    const settings = this.store.getSettings();
    const limit = overrideLimit !== undefined ? overrideLimit : (settings.speedLimitBytesPerSec || 0);
    const activeHttpCount = this.downloaders.size;
    const perTaskLimit = limit > 0 && activeHttpCount > 0 ? Math.floor(limit / activeHttpCount) : limit;
    for (const downloader of this.downloaders.values()) {
      downloader.setSpeedLimit(perTaskLimit);
    }
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getTaskById(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
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
    const isTorrent = TorrentEngine.getInstance().isTorrentSource(cleanUrl);

    if (!isTorrent && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
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
      if (isTorrent) {
        const dnMatch = cleanUrl.match(/dn=([^&]+)/i);
        if (dnMatch) {
          initialFileName = sanitizeFileName(decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')));
        } else if (cleanUrl.toLowerCase().endsWith('.torrent')) {
          initialFileName = path.basename(cleanUrl, '.torrent');
        } else {
          initialFileName = `Torrent_${Date.now()}`;
        }
      } else {
        initialFileName = extractFileNameFromUrl(cleanUrl);
      }
    }

    if (!isTorrent && params.mimeType) {
      initialFileName = ensureFileExtension(initialFileName, params.mimeType, cleanUrl);
    }

    // Check YouTube video title fallback if name is still numeric or generic
    if (!isTorrent) {
      const ytId = extractYouTubeVideoId(cleanUrl) || (params.sourcePageUrl ? extractYouTubeVideoId(params.sourcePageUrl) : null);
      if (ytId && isNumericOrHashOnly(initialFileName)) {
        try {
          const ytTitle = await fetchYouTubeTitle(ytId);
          if (ytTitle) {
            initialFileName = ensureFileExtension(ytTitle, params.mimeType || '', cleanUrl);
          }
        } catch {}
      } else if (params.sourcePageTitle && isNumericOrHashOnly(initialFileName)) {
        initialFileName = ensureFileExtension(sanitizeFileName(params.sourcePageTitle), params.mimeType || '', cleanUrl);
      }
    }

    if (!initialFileName) {
      initialFileName = ensureFileExtension(`download_${Date.now()}`, params.mimeType || '', cleanUrl);
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
    const initialCategory: TaskCategory = isTorrent
      ? 'torrent'
      : categorizeFileName(path.basename(finalPath), params.mimeType || '', cleanUrl);

    const task: DownloadTask = {
      id: taskId,
      url: cleanUrl,
      finalUrl: cleanUrl,
      fileName: path.basename(finalPath),
      savePath: finalPath,
      fileSize: params.fileSize && params.fileSize > 0 ? params.fileSize : 0,
      downloadedBytes: 0,
      status: params.autoStart !== false ? 'connecting' : 'paused',
      category: initialCategory,
      supportsRanges: isTorrent ? true : false,
      threadCount: isTorrent ? 1 : threadCount,
      chunks: [],
      speed: 0,
      eta: 0,
      progress: 0,
      createdAt: Date.now(),
      protocol: isTorrent ? 'torrent' : 'http',
      source: params.source,
      sourcePageUrl: params.sourcePageUrl,
      sourcePageTitle: params.sourcePageTitle,
      referrer: params.referrer || params.sourcePageUrl,
      quality: params.quality,
      mimeType: params.mimeType,
      mediaType: params.mediaType,
      secondaryAudioUrl: params.secondaryAudioUrl,
    };

    // Store and immediately show task in UI!
    this.tasks.set(task.id, task);
    this.scheduleSave();
    this.broadcastTasks();

    const isHlsUrl = cleanUrl.toLowerCase().includes('.m3u8') || cleanUrl.includes('__DLX_SEG_');
    const isSignedOrStream = !isTorrent && (isHlsUrl || isOneTimeOrSignedUrl(cleanUrl) || Boolean(params.source));
    if (isSignedOrStream) {
      if (task.status !== 'paused' && task.status !== 'cancelled') {
        task.status = params.autoStart !== false ? 'queued' : 'paused';
      }
      this.scheduleSave();
      this.broadcastTasks();
      if (task.status === 'queued' && params.autoStart !== false) {
        this.processQueue();
      }
      return task;
    }

    // Asynchronously probe and queue
    (async () => {
      try {
        const inspection = await inspectUrl(cleanUrl, 8, task.referrer);
        // Check if user paused or deleted the task while inspection was in flight
        const currentTask = this.tasks.get(task.id);
        if (!currentTask || currentTask.status === 'paused' || currentTask.status === 'cancelled') {
          return;
        }

        task.finalUrl = inspection.finalUrl;
        if (inspection.fileSize > 0) {
          task.fileSize = inspection.fileSize;
        }
        task.supportsRanges = inspection.supportsRanges;
        task.category = isTorrent ? 'torrent' : (inspection.category !== 'other' ? inspection.category : task.category);
        task.threadCount = inspection.supportsRanges ? threadCount : 1;
        if (inspection.mimeType && inspection.mimeType !== 'application/octet-stream') {
          task.mimeType = inspection.mimeType;
        }
        if (inspection.infoHash) {
          task.infoHash = inspection.infoHash;
        }
        if (inspection.torrentFiles && inspection.torrentFiles.length > 0) {
          task.torrentFiles = inspection.torrentFiles;
        }

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
            if (!isTorrent) {
              task.category = categorizeFileName(task.fileName, inspection.mimeType || task.mimeType || '', task.finalUrl);
            }
          }
        }

        if (task.status !== 'paused' && task.status !== 'cancelled') {
          task.status = params.autoStart !== false ? 'queued' : 'paused';
        }
      } catch (err: any) {
        console.warn('URL inspection warning (will still attempt download):', err.message);
        if (task.status !== 'paused' && task.status !== 'cancelled') {
          task.status = params.autoStart !== false ? 'queued' : 'paused';
        }
      }

      if (!this.tasks.has(task.id)) return;

      this.scheduleSave();
      this.broadcastTasks();

      if (task.status === 'queued' && params.autoStart !== false) {
        this.processQueue();
      }
    })();

    return task;
  }

  public pauseDownload(id: string): void {
    const task = this.tasks.get(id);
    if (!task || task.status === 'completed') return;

    // Immediately mark paused so any in-flight callbacks see 'paused'
    task.status = 'paused';
    task.speed = 0;
    task.uploadSpeed = 0;
    task.eta = 0;

    if (task.protocol === 'torrent' || TorrentEngine.getInstance().isTorrentSource(task.url)) {
      TorrentEngine.getInstance().pauseTorrent(id, task.infoHash);
    }

    const downloader = this.downloaders.get(id);
    if (downloader) {
      downloader.pause();
      this.downloaders.delete(id);
      this.rebalanceHttpSpeedLimits();
    }

    task.status = 'paused';
    task.speed = 0;
    task.uploadSpeed = 0;
    task.eta = 0;
    this.scheduleSave();
    this.broadcastTasks();
    this.processQueue();
  }

  public resumeDownload(id: string): void {
    const task = this.tasks.get(id);
    if (!task || task.status === 'completed') return;

    task.status = 'queued';
    task.errorMessage = undefined;
    this.scheduleSave();
    this.broadcastTasks();
    this.processQueue();
  }

  public cancelDownload(id: string, deleteFile: boolean = false): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'cancelled';
      task.speed = 0;
      task.uploadSpeed = 0;
      task.eta = 0;
    }

    if (task && (task.protocol === 'torrent' || TorrentEngine.getInstance().isTorrentSource(task.url))) {
      TorrentEngine.getInstance().cancelTorrent(id, deleteFile, task.infoHash);
    }

    const downloader = this.downloaders.get(id);
    if (downloader) {
      downloader.cancel(deleteFile);
      this.downloaders.delete(id);
      this.rebalanceHttpSpeedLimits();
    } else if (deleteFile && task && fs.existsSync(task.savePath)) {
      try {
        const stat = fs.statSync(task.savePath);
        if (stat.isDirectory()) {
          fs.rmSync(task.savePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(task.savePath);
        }
      } catch {}
    }

    this.scheduleSave();
    this.broadcastTasks();
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
    for (const [id] of [...this.downloaders.entries()]) {
      this.pauseDownload(id);
    }
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading' || task.status === 'queued' || task.status === 'connecting') {
        if (task.protocol === 'torrent' || TorrentEngine.getInstance().isTorrentSource(task.url)) {
          TorrentEngine.getInstance().pauseTorrent(task.id, task.infoHash);
        }
        task.status = 'paused';
        task.speed = 0;
        task.uploadSpeed = 0;
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
        task.errorMessage = undefined;
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

  public openFolder(id: string, fallbackPath?: string): void {
    const task = this.tasks.get(id);
    const rawTarget = (task && task.savePath) || fallbackPath;
    if (!rawTarget) return;

    const targetPath = path.normalize(rawTarget);
    if (fs.existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
    } else {
      const dirPath = path.dirname(targetPath);
      if (fs.existsSync(dirPath)) {
        shell.openPath(dirPath);
      }
    }
  }

  private showCompletionNotification(completedTask: DownloadTask, isTorrent: boolean = false): void {
    const settings = this.store.getSettings();
    if (!settings.enableNotifications || !Notification.isSupported()) return;

    const notif = new Notification({
      title: isTorrent ? 'Torrent Download Complete' : 'Download Complete',
      body: `${completedTask.fileName} has finished downloading. Click to view in folder.`,
      silent: false,
    });

    this.activeNotifications.add(notif);

    const cleanup = () => {
      this.activeNotifications.delete(notif);
    };

    notif.on('click', () => {
      cleanup();
      this.openFolder(completedTask.id, completedTask.savePath);
    });

    notif.on('close', cleanup);
    notif.show();
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
    if (task.status === 'paused' || task.status === 'cancelled') {
      return;
    }

    if (task.protocol === 'torrent' || TorrentEngine.getInstance().isTorrentSource(task.url)) {
      task.protocol = 'torrent';
      TorrentEngine.getInstance().startTorrent(
        task,
        (updatedTask) => {
          const existing = this.tasks.get(updatedTask.id);
          if (!existing || existing.status === 'paused' || existing.status === 'cancelled') {
            return;
          }
          this.tasks.set(updatedTask.id, updatedTask);
          this.broadcastTasksThrottled();
        },
        (completedTask) => {
          this.tasks.set(completedTask.id, completedTask);
          this.scheduleSave();
          this.broadcastTasks();
          this.showCompletionNotification(completedTask, true);
          this.processQueue();
        },
        (_err, errorTask) => {
          const existing = this.tasks.get(errorTask.id);
          if (!existing || existing.status === 'paused' || existing.status === 'cancelled') {
            return;
          }
          this.tasks.set(errorTask.id, errorTask);
          this.scheduleSave();
          this.broadcastTasks();
          this.processQueue();
        }
      );
      return;
    }

    if (this.downloaders.has(task.id)) {
      return;
    }

    const settings = this.store.getSettings();
    const downloader = new Downloader(task, settings.speedLimitBytesPerSec || 0);
    this.downloaders.set(task.id, downloader);
    this.rebalanceHttpSpeedLimits();

    downloader.on('progress', (updatedTask: DownloadTask) => {
      const existing = this.tasks.get(updatedTask.id);
      if (!existing || existing.status === 'paused' || existing.status === 'cancelled') {
        return;
      }
      this.tasks.set(updatedTask.id, updatedTask);
      this.broadcastTasksThrottled();
    });

    downloader.on('completed', (completedTask: DownloadTask) => {
      this.downloaders.delete(completedTask.id);
      this.rebalanceHttpSpeedLimits();
      this.tasks.set(completedTask.id, completedTask);
      this.scheduleSave();
      this.broadcastTasks();
      this.showCompletionNotification(completedTask, false);
      this.processQueue();
    });

    downloader.on('error', (_err, errorTask: DownloadTask) => {
      this.downloaders.delete(errorTask.id);
      this.rebalanceHttpSpeedLimits();
      const existing = this.tasks.get(errorTask.id);
      if (!existing || existing.status === 'paused' || existing.status === 'cancelled') {
        return;
      }
      this.tasks.set(errorTask.id, errorTask);
      this.scheduleSave();
      this.broadcastTasks();
      this.processQueue();
    });

    downloader.on('paused', (pausedTask: DownloadTask) => {
      this.downloaders.delete(pausedTask.id);
      this.rebalanceHttpSpeedLimits();
      this.tasks.set(pausedTask.id, pausedTask);
      this.scheduleSave();
      this.broadcastTasks();
    });

    downloader.start();
  }

  private lastBroadcastTime = 0;
  private broadcastTrailingTimer: NodeJS.Timeout | null = null;
  private broadcastTasksThrottled(): void {
    const now = Date.now();
    const elapsed = now - this.lastBroadcastTime;
    if (elapsed >= 200) {
      if (this.broadcastTrailingTimer) {
        clearTimeout(this.broadcastTrailingTimer);
        this.broadcastTrailingTimer = null;
      }
      this.lastBroadcastTime = now;
      this.broadcastTasks();
    } else if (!this.broadcastTrailingTimer) {
      this.broadcastTrailingTimer = setTimeout(() => {
        this.broadcastTrailingTimer = null;
        this.lastBroadcastTime = Date.now();
        this.broadcastTasks();
      }, 200 - elapsed);
    }
  }

  public broadcastTasks(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const taskList = this.getTasks();
    const stats: GlobalSpeedStats = {
      totalSpeed: taskList.reduce((acc, t) => acc + (t.status === 'downloading' ? t.speed : 0), 0),
      totalUploadSpeed: taskList.reduce((acc, t) => acc + (t.status === 'downloading' ? (t.uploadSpeed || 0) : 0), 0),
      activeCount: taskList.filter((t) => t.status === 'downloading' || t.status === 'connecting').length,
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
    TorrentEngine.getInstance().shutdown();
    this.store.saveTasks(Array.from(this.tasks.values()));
  }
}
