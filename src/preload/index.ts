import { contextBridge, ipcRenderer, webUtils, IpcRendererEvent } from 'electron';
import type { AppSettings, DownloadTask, GlobalSpeedStats, UrlInspectionResult } from '../main/engine/types';

export interface BrowserModalPayload {
  url: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  quality?: string;
  referrer?: string;
  source?: string;
  sourcePageUrl?: string;
  sourcePageTitle?: string;
  mediaType?: 'video' | 'audio' | 'image' | 'file' | 'torrent';
  secondaryAudioUrl?: string;
  forceRedownload?: boolean;
}

export interface ElectronAPI {
  getTasks: () => Promise<DownloadTask[]>;
  checkDuplicate: (url: string) => Promise<DownloadTask | null>;
  addDownload: (params: {
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
  }) => Promise<DownloadTask>;
  pauseDownload: (id: string) => Promise<boolean>;
  resumeDownload: (id: string) => Promise<boolean>;
  cancelDownload: (id: string, deleteFile?: boolean) => Promise<boolean>;
  deleteTask: (id: string, deleteFile?: boolean) => Promise<boolean>;
  pauseAll: () => Promise<boolean>;
  resumeAll: () => Promise<boolean>;
  clearCompleted: () => Promise<boolean>;
  openFile: (id: string) => Promise<boolean>;
  openFolder: (id: string) => Promise<boolean>;
  inspectUrl: (url: string, referrer?: string) => Promise<UrlInspectionResult>;
  selectDirectory: () => Promise<string | null>;
  selectTorrentFile: () => Promise<string | null>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<boolean>;
  onTasksUpdated: (callback: (tasks: DownloadTask[]) => void) => () => void;
  onSpeedStats: (callback: (stats: GlobalSpeedStats) => void) => () => void;
  onSettingsUpdated?: (callback: (settings: AppSettings) => void) => () => void;
  onBrowserOpenAddModal?: (callback: (payload: BrowserModalPayload) => void) => () => void;
  readClipboard: () => Promise<string>;
  getFileThumbnail: (filePath: string) => Promise<string | null>;
  getPathForFile: (file: File) => string;
  setNativeTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>;
  getBridgeStatus?: () => Promise<{ registered: boolean; hostName: string; extensionId: string; manifestPath: string }>;
  registerNativeHost?: (customExtId?: string) => Promise<{ registered: boolean; hostName: string; extensionId: string; manifestPath: string }>;
}

const api: ElectronAPI = {
  getTasks: () => ipcRenderer.invoke('tasks:get'),
  checkDuplicate: (url) => ipcRenderer.invoke('tasks:check-duplicate', url),
  addDownload: (params) => ipcRenderer.invoke('tasks:add', params),
  pauseDownload: (id) => ipcRenderer.invoke('tasks:pause', id),
  resumeDownload: (id) => ipcRenderer.invoke('tasks:resume', id),
  cancelDownload: (id, deleteFile = false) => ipcRenderer.invoke('tasks:cancel', id, deleteFile),
  deleteTask: (id, deleteFile = false) => ipcRenderer.invoke('tasks:delete', id, deleteFile),
  pauseAll: () => ipcRenderer.invoke('tasks:pause-all'),
  resumeAll: () => ipcRenderer.invoke('tasks:resume-all'),
  clearCompleted: () => ipcRenderer.invoke('tasks:clear-completed'),
  openFile: (id) => ipcRenderer.invoke('tasks:open-file', id),
  openFolder: (id) => ipcRenderer.invoke('tasks:open-folder', id),
  inspectUrl: (url, referrer) => ipcRenderer.invoke('url:inspect', url, referrer),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-dir'),
  selectTorrentFile: () => ipcRenderer.invoke('dialog:select-torrent-file'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  onTasksUpdated: (callback) => {
    const handler = (_event: IpcRendererEvent, tasks: DownloadTask[]) => callback(tasks);
    ipcRenderer.on('tasks-updated', handler);
    return () => ipcRenderer.removeListener('tasks-updated', handler);
  },
  onSpeedStats: (callback) => {
    const handler = (_event: IpcRendererEvent, stats: GlobalSpeedStats) => callback(stats);
    ipcRenderer.on('speed-stats', handler);
    return () => ipcRenderer.removeListener('speed-stats', handler);
  },
  onSettingsUpdated: (callback) => {
    const handler = (_event: IpcRendererEvent, settings: AppSettings) => callback(settings);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  },
  onBrowserOpenAddModal: (callback) => {
    const handler = (_event: IpcRendererEvent, payload: BrowserModalPayload) => callback(payload);
    ipcRenderer.on('browser:open-add-modal', handler);
    return () => ipcRenderer.removeListener('browser:open-add-modal', handler);
  },
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  getFileThumbnail: (filePath: string) => ipcRenderer.invoke('app:get-file-thumbnail', filePath),
  getPathForFile: (file: File) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {
      // Fallback
    }
    return (file as any).path || '';
  },
  setNativeTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('app:set-theme', theme),
  getBridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  registerNativeHost: (customExtId?: string) => ipcRenderer.invoke('bridge:register-host', customExtId),
};

contextBridge.exposeInMainWorld('electronAPI', api);
