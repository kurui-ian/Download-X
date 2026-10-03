import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { AppSettings, DownloadTask, GlobalSpeedStats, UrlInspectionResult } from '../main/engine/types';

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
  inspectUrl: (url: string) => Promise<UrlInspectionResult>;
  selectDirectory: () => Promise<string | null>;
  selectTorrentFile: () => Promise<string | null>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<boolean>;
  onTasksUpdated: (callback: (tasks: DownloadTask[]) => void) => () => void;
  onSpeedStats: (callback: (stats: GlobalSpeedStats) => void) => () => void;
  readClipboard: () => Promise<string>;
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
  inspectUrl: (url) => ipcRenderer.invoke('url:inspect', url),
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
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
