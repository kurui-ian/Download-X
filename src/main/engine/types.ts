export type TaskStatus = 
  | 'queued'
  | 'connecting'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

export type TaskCategory = 
  | 'all'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'program'
  | 'other';

export interface ChunkInfo {
  id: number;
  startByte: number;
  endByte: number;
  downloadedBytes: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  speed: number; // bytes per second for this chunk
}

export interface DownloadTask {
  id: string;
  url: string;
  finalUrl: string;
  fileName: string;
  savePath: string;
  fileSize: number; // Total bytes (0 if unknown / stream)
  downloadedBytes: number;
  status: TaskStatus;
  category: TaskCategory;
  supportsRanges: boolean;
  threadCount: number;
  chunks: ChunkInfo[];
  speed: number; // Current bytes/sec
  eta: number; // Estimated seconds remaining
  progress: number; // 0 to 100
  createdAt: number;
  completedAt?: number;
  errorMessage?: string;
}

export interface UrlInspectionResult {
  url: string;
  finalUrl: string;
  fileName: string;
  fileSize: number;
  supportsRanges: boolean;
  mimeType: string;
  category: TaskCategory;
}

export interface AppSettings {
  downloadDir: string;
  maxConcurrentDownloads: number;
  defaultConnections: number; // Default threads per download (e.g. 8)
  speedLimitBytesPerSec: number; // 0 for unlimited
  enableNotifications: boolean;
  monitorClipboard: boolean;
  minimizeToTray: boolean;
}

export interface GlobalSpeedStats {
  totalSpeed: number; // bytes/sec
  activeCount: number;
  queuedCount: number;
  completedCount: number;
}
