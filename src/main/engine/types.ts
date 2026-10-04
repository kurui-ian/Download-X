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
  | 'image'
  | 'document'
  | 'archive'
  | 'program'
  | 'torrent'
  | 'other';

export type TaskProtocol = 'http' | 'torrent';

export interface ChunkInfo {
  id: number;
  startByte: number;
  endByte: number;
  downloadedBytes: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  speed: number; // bytes per second for this chunk
}

export interface TorrentFileInfo {
  name: string;
  path: string;
  length: number;
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

  // Torrent extensions
  protocol?: TaskProtocol;
  infoHash?: string;
  peers?: number;
  uploadSpeed?: number;
  uploadedBytes?: number;
  torrentFiles?: TorrentFileInfo[];

  // Optional browser integration metadata
  source?: string; // e.g. 'Chrome', 'Edge', 'Browser'
  sourcePageUrl?: string;
  sourcePageTitle?: string;
  referrer?: string;
  quality?: string; // e.g. '1080p', '720p', 'Original'
  mimeType?: string;
  mediaType?: 'video' | 'audio' | 'image' | 'file' | 'torrent';
  secondaryAudioUrl?: string; // Future-capable separate audio stream association
}

export interface UrlInspectionResult {
  url: string;
  finalUrl: string;
  fileName: string;
  fileSize: number;
  supportsRanges: boolean;
  mimeType: string;
  category: TaskCategory;
  isTorrent?: boolean;
  infoHash?: string;
  torrentFiles?: TorrentFileInfo[];
}

export interface AppSettings {
  downloadDir: string;
  maxConcurrentDownloads: number;
  defaultConnections: number; // Default threads per download (e.g. 8)
  speedLimitBytesPerSec: number; // 0 for unlimited
  enableNotifications: boolean;
  monitorClipboard: boolean;
  minimizeToTray: boolean;

  // Browser integration settings
  browserIntegrationEnabled?: boolean;
  autoInterceptDownloads?: boolean;
  showMediaDownloadButton?: boolean;
  detectVideos?: boolean;
  detectAudio?: boolean;
  detectImages?: boolean;
  askBeforeIntercepting?: boolean;
}

export interface GlobalSpeedStats {
  totalSpeed: number; // bytes/sec
  activeCount: number;
  queuedCount: number;
  completedCount: number;
  totalUploadSpeed?: number;
}
