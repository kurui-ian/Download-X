import { sanitizeFileName } from '../engine/inspector';

export const MAX_MESSAGE_BYTES = 64 * 1024; // 64 KB max message size
export const MAX_URL_LENGTH = 8192;
export const MAX_FILENAME_LENGTH = 255;
export const MAX_MIME_LENGTH = 128;
export const MAX_QUALITY_LENGTH = 64;
export const MAX_SOURCE_LENGTH = 128;
export const MAX_TITLE_LENGTH = 512;

export type SupportedBridgeMessageType =
  | 'hello'
  | 'ping'
  | 'getStatus'
  | 'getSettings'
  | 'updateSettings'
  | 'checkDuplicate'
  | 'addDownload'
  | 'addMediaDownload'
  | 'openApplication'
  | 'openExistingTask';

const ALLOWED_MESSAGE_TYPES: ReadonlySet<string> = new Set<SupportedBridgeMessageType>([
  'hello',
  'ping',
  'getStatus',
  'getSettings',
  'updateSettings',
  'checkDuplicate',
  'addDownload',
  'addMediaDownload',
  'openApplication',
  'openExistingTask',
]);

const FORBIDDEN_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'executeCommand',
  'runShell',
  'executeScript',
  'eval',
  'spawn',
  'exec',
]);

export interface ValidatedBridgeMessage {
  type: SupportedBridgeMessageType;
  url?: string;
  filename?: string;
  mimeType?: string;
  quality?: string;
  fileSize?: number;
  referrer?: string;
  source?: string;
  sourcePageUrl?: string;
  sourcePageTitle?: string;
  mediaType?: 'video' | 'audio' | 'image' | 'file' | 'torrent';
  secondaryAudioUrl?: string;
  forceRedownload?: boolean;
  openModal?: boolean;
  taskId?: string;
  openFile?: boolean;
  settings?: {
    autoInterceptDownloads?: boolean;
    showMediaDownloadButton?: boolean;
    detectVideos?: boolean;
    detectAudio?: boolean;
    detectImages?: boolean;
    askBeforeIntercepting?: boolean;
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: ValidatedBridgeMessage;
}

export function validateUrlField(rawUrl: unknown): { valid: boolean; url?: string; error?: string } {
  if (typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL must be a string.' };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'URL cannot be empty.' };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL exceeds maximum length (${MAX_URL_LENGTH}).` };
  }

  // Allow magnet:? links
  if (trimmed.toLowerCase().startsWith('magnet:?')) {
    if (!trimmed.toLowerCase().includes('xt=urn:btih:')) {
      return { valid: false, error: 'Invalid magnet URI: missing btih infohash.' };
    }
    return { valid: true, url: trimmed };
  }

  // Only allow http:// and https:// URLs from browser
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: `Unsupported URL protocol: ${parsed.protocol}` };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, error: 'Malformed URL.' };
  }
}

export function validateFilenameField(rawFilename: unknown): { valid: boolean; filename?: string; error?: string } {
  if (rawFilename === undefined || rawFilename === null || rawFilename === '') {
    return { valid: true, filename: undefined };
  }
  if (typeof rawFilename !== 'string') {
    return { valid: false, error: 'Filename must be a string.' };
  }
  if (rawFilename.length > MAX_FILENAME_LENGTH * 2) {
    return { valid: false, error: 'Filename is too long.' };
  }
  // Reject path traversal sequences
  const baseOnly = rawFilename.split(/[/\\]/).pop() || '';
  if (!baseOnly || baseOnly === '.' || baseOnly === '..') {
    return { valid: true, filename: undefined };
  }
  const sanitized = sanitizeFileName(baseOnly).slice(0, MAX_FILENAME_LENGTH);
  return { valid: true, filename: sanitized };
}

export function validateMimeTypeField(rawMime: unknown): { valid: boolean; mimeType?: string; error?: string } {
  if (rawMime === undefined || rawMime === null || rawMime === '') {
    return { valid: true, mimeType: undefined };
  }
  if (typeof rawMime !== 'string') {
    return { valid: false, error: 'MIME type must be a string.' };
  }
  const clean = rawMime.trim().slice(0, MAX_MIME_LENGTH);
  const baseMime = clean.split(';')[0].trim().toLowerCase();
  if (!baseMime) {
    return { valid: true, mimeType: undefined };
  }
  if (!/^[a-z0-9!#$&-^_.+]+\/[a-z0-9!#$&-^_.+]+$/i.test(baseMime)) {
    return { valid: false, error: 'Malformed MIME type.' };
  }
  return { valid: true, mimeType: baseMime };
}

export function validateQualityField(rawQuality: unknown): { valid: boolean; quality?: string; error?: string } {
  if (rawQuality === undefined || rawQuality === null || rawQuality === '') {
    return { valid: true, quality: undefined };
  }
  if (typeof rawQuality !== 'string') {
    return { valid: false, error: 'Quality must be a string.' };
  }
  const clean = rawQuality.replace(/[\r\n\t<>]/g, '').trim().slice(0, MAX_QUALITY_LENGTH);
  return { valid: true, quality: clean || undefined };
}

export function validateFileSizeField(rawSize: unknown): { valid: boolean; fileSize?: number; error?: string } {
  if (rawSize === undefined || rawSize === null || rawSize === '') {
    return { valid: true, fileSize: undefined };
  }
  const num = typeof rawSize === 'number' ? rawSize : Number(rawSize);
  if (!Number.isFinite(num) || num < 0 || num > 100 * 1024 * 1024 * 1024 * 1024) {
    return { valid: false, error: 'Invalid fileSize.' };
  }
  return { valid: true, fileSize: Math.floor(num) };
}

export function validateBridgeMessage(rawPayload: unknown, rawByteLength?: number): ValidationResult {
  if (rawByteLength !== undefined && rawByteLength > MAX_MESSAGE_BYTES) {
    return { valid: false, error: `Message exceeds maximum size of ${MAX_MESSAGE_BYTES} bytes.` };
  }

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { valid: false, error: 'Message payload must be a JSON object.' };
  }

  const msg = rawPayload as Record<string, unknown>;
  const type = msg.type;

  if (typeof type !== 'string' || !type.trim()) {
    return { valid: false, error: 'Message is missing a valid "type" field.' };
  }

  if (FORBIDDEN_MESSAGE_TYPES.has(type)) {
    return { valid: false, error: `Security error: operation "${type}" is strictly forbidden.` };
  }

  if (!ALLOWED_MESSAGE_TYPES.has(type)) {
    return { valid: false, error: `Unsupported message type: "${type}".` };
  }

  const validatedType = type as SupportedBridgeMessageType;
  const result: ValidatedBridgeMessage = { type: validatedType };

  if (validatedType === 'addDownload' || validatedType === 'addMediaDownload' || validatedType === 'checkDuplicate') {
    const urlCheck = validateUrlField(msg.url);
    if (!urlCheck.valid || !urlCheck.url) {
      return { valid: false, error: urlCheck.error || 'Invalid URL.' };
    }
    result.url = urlCheck.url;

    const fnCheck = validateFilenameField(msg.filename ?? msg.fileName);
    if (!fnCheck.valid) {
      return { valid: false, error: fnCheck.error };
    }
    result.filename = fnCheck.filename;

    const mimeCheck = validateMimeTypeField(msg.mimeType);
    if (!mimeCheck.valid) {
      return { valid: false, error: mimeCheck.error };
    }
    result.mimeType = mimeCheck.mimeType;

    const qualityCheck = validateQualityField(msg.quality);
    if (!qualityCheck.valid) {
      return { valid: false, error: qualityCheck.error };
    }
    result.quality = qualityCheck.quality;

    const sizeCheck = validateFileSizeField(msg.fileSize);
    if (!sizeCheck.valid) {
      return { valid: false, error: sizeCheck.error };
    }
    result.fileSize = sizeCheck.fileSize;

    if (typeof msg.referrer === 'string' && msg.referrer.trim()) {
      const refCheck = validateUrlField(msg.referrer);
      if (refCheck.valid) {
        result.referrer = refCheck.url;
      }
    }

    if (typeof msg.sourcePageUrl === 'string' && msg.sourcePageUrl.trim()) {
      const pageCheck = validateUrlField(msg.sourcePageUrl);
      if (pageCheck.valid) {
        result.sourcePageUrl = pageCheck.url;
      }
    }

    if (typeof msg.sourcePageTitle === 'string' && msg.sourcePageTitle.trim()) {
      result.sourcePageTitle = msg.sourcePageTitle.replace(/[\r\n\t<>]/g, '').trim().slice(0, MAX_TITLE_LENGTH);
    }

    if (typeof msg.source === 'string' && msg.source.trim()) {
      result.source = msg.source.replace(/[\r\n\t<>]/g, '').trim().slice(0, MAX_SOURCE_LENGTH);
    } else {
      result.source = 'Browser';
    }

    if (
      typeof msg.mediaType === 'string' &&
      ['video', 'audio', 'image', 'file', 'torrent'].includes(msg.mediaType)
    ) {
      result.mediaType = msg.mediaType as ValidatedBridgeMessage['mediaType'];
    }

    if (typeof msg.secondaryAudioUrl === 'string' && msg.secondaryAudioUrl.trim()) {
      const audioUrlCheck = validateUrlField(msg.secondaryAudioUrl);
      if (audioUrlCheck.valid) {
        result.secondaryAudioUrl = audioUrlCheck.url;
      }
    }

    result.forceRedownload = Boolean(msg.forceRedownload);
    result.openModal = Boolean(msg.openModal);
  }

  if (validatedType === 'openExistingTask') {
    if (typeof msg.taskId !== 'string' || !msg.taskId.trim() || msg.taskId.length > 64) {
      return { valid: false, error: 'Invalid taskId for openExistingTask.' };
    }
    result.taskId = msg.taskId.trim();
    result.openFile = Boolean(msg.openFile);
  }

  if (validatedType === 'updateSettings') {
    if (!msg.settings || typeof msg.settings !== 'object') {
      return { valid: false, error: 'Missing settings object.' };
    }
    const s = msg.settings as Record<string, unknown>;
    result.settings = {};
    if (typeof s.autoInterceptDownloads === 'boolean') result.settings.autoInterceptDownloads = s.autoInterceptDownloads;
    if (typeof s.showMediaDownloadButton === 'boolean') result.settings.showMediaDownloadButton = s.showMediaDownloadButton;
    if (typeof s.detectVideos === 'boolean') result.settings.detectVideos = s.detectVideos;
    if (typeof s.detectAudio === 'boolean') result.settings.detectAudio = s.detectAudio;
    if (typeof s.detectImages === 'boolean') result.settings.detectImages = s.detectImages;
    if (typeof s.askBeforeIntercepting === 'boolean') result.settings.askBeforeIntercepting = s.askBeforeIntercepting;
  }

  return { valid: true, data: result };
}
