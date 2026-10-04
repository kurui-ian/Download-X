import type { ElectronAPI, BrowserModalPayload } from '../preload';
import type { DownloadTask, TaskCategory, TaskStatus, AppSettings, GlobalSpeedStats, UrlInspectionResult, ChunkInfo } from '../main/engine/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export type { DownloadTask, TaskCategory, TaskStatus, AppSettings, GlobalSpeedStats, UrlInspectionResult, ChunkInfo, BrowserModalPayload };

