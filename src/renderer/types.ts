import type { ElectronAPI, BrowserModalPayload } from '../preload';
import type { 
  DownloadTask, 
  TaskCategory, 
  TaskStatus, 
  AppSettings, 
  GlobalSpeedStats, 
  UrlInspectionResult, 
  ChunkInfo,
  MediaContainerFormat,
  SpeedPreset,
  SpeedLimitConfig,
  TaskEventCallback,
  TaskProgressCallback
} from '../main/engine/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export type { 
  DownloadTask, 
  TaskCategory, 
  TaskStatus, 
  AppSettings, 
  GlobalSpeedStats, 
  UrlInspectionResult, 
  ChunkInfo, 
  BrowserModalPayload,
  MediaContainerFormat,
  SpeedPreset,
  SpeedLimitConfig,
  TaskEventCallback,
  TaskProgressCallback
};

