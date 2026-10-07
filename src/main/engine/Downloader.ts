import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import EventEmitter from 'events';
import { ChunkInfo, DownloadTask } from './types';
import {
  getRequestHeaders,
  isOneTimeOrSignedUrl,
  extractFileNameFromUrl,
  categorizeFileName,
  resolveHlsMediaPlaylist,
  resolveYouTubeStream,
  fetchBufferWithHeaders,
  keepAliveHttpAgent,
  keepAliveHttpsAgent,
  isNumericOrHashOnly,
  ensureFileExtension,
  sanitizeFileName,
  cleanSourcePageTitle,
} from './inspector';
import { muxFmp4VideoAndAudio } from './fmp4Muxer';

export class Downloader extends EventEmitter {
  private task: DownloadTask;
  private fd: number | null = null;
  private activeRequests: Map<number, http.ClientRequest> = new Map();
  private activeResponses: Map<number, http.IncomingMessage> = new Map();
  private retryTimers: Set<NodeJS.Timeout> = new Set();
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private speedTimer: NodeJS.Timeout | null = null;
  private lastBytesDownloaded: number = 0;
  private lastTickTime: number = Date.now();
  private speedSamples: Array<{ time: number; bytes: number }> = [];
  private maxRetriesPerChunk: number = 5;
  private chunkRetryCounts: Map<number, number> = new Map();

  // Speed throttling state
  private speedLimitBytesPerSec: number = 0;
  private windowStartTime: number = Date.now();
  private windowBytes: number = 0;

  constructor(task: DownloadTask, speedLimitBytesPerSec: number = 0) {
    super();
    this.task = task;
    this.lastBytesDownloaded = task.downloadedBytes;
    this.speedLimitBytesPerSec = Math.max(0, speedLimitBytesPerSec || 0);
  }

  public getTask(): DownloadTask {
    return this.task;
  }

  public setSpeedLimit(bytesPerSec: number): void {
    this.speedLimitBytesPerSec = Math.max(0, bytesPerSec || 0);
    this.windowStartTime = Date.now();
    this.windowBytes = 0;
  }

  private isHlsUrl(urlStr: string): boolean {
    const lower = (urlStr || '').toLowerCase();
    return (
      lower.includes('.m3u8') ||
      lower.includes('__dlx_seg_') ||
      lower.includes('format=m3u8') ||
      lower.includes('type=m3u8')
    );
  }

  private applyStreamThrottle(res: http.IncomingMessage, bytesJustReceived: number): void {
    if (this.speedLimitBytesPerSec <= 0 || this.isPaused || this.isCancelled) {
      return;
    }

    const now = Date.now();
    const elapsedMs = now - this.windowStartTime;
    if (elapsedMs >= 1000) {
      this.windowStartTime = now;
      this.windowBytes = bytesJustReceived;
      return;
    }

    this.windowBytes += bytesJustReceived;
    const expectedMs = (this.windowBytes / this.speedLimitBytesPerSec) * 1000;

    if (expectedMs > elapsedMs + 20) {
      const delayMs = Math.min(1000, Math.round(expectedMs - elapsedMs));
      if (!res.isPaused()) {
        res.pause();
        const t = setTimeout(() => {
          this.retryTimers.delete(t);
          if (!this.isPaused && !this.isCancelled && !res.destroyed) {
            res.resume();
          }
        }, delayMs);
        this.retryTimers.add(t);
      }
    }
  }

  public async start(): Promise<void> {
    if (this.isPaused || this.isCancelled) return;
    this.isPaused = false;
    this.isCancelled = false;
    this.windowStartTime = Date.now();
    this.windowBytes = 0;
    this.task.status = 'downloading';
    this.emit('status-change', this.task);

    try {
      let targetUrl = this.task.finalUrl || this.task.url;
      const lowerTarget = targetUrl.toLowerCase();
      const lowerSource = (this.task.sourcePageUrl || this.task.referrer || '').toLowerCase();

      // 0. Automatically resolve or refresh YouTube / googlevideo.com streams via Innertube ANDROID/IOS
      const isYouTubeTask =
        lowerTarget.includes('youtube.com/watch') ||
        lowerTarget.includes('youtube.com/shorts/') ||
        lowerTarget.includes('youtu.be/') ||
        lowerTarget.includes('googlevideo.com/videoplayback') ||
        lowerSource.includes('youtube.com/watch') ||
        lowerSource.includes('youtube.com/shorts/');

      if (
        isYouTubeTask &&
        (!targetUrl.includes('googlevideo.com') ||
          targetUrl.includes('c=WEB') ||
          (!targetUrl.includes('c=VISIONOS') && !targetUrl.includes('gir=yes') && !targetUrl.includes('ratebypass=yes')) ||
          this.task.downloadedBytes === 0)
      ) {
        const ytSource =
          this.task.url && (this.task.url.includes('youtube.com') || this.task.url.includes('youtu.be'))
            ? this.task.url
            : this.task.sourcePageUrl && this.task.sourcePageUrl.includes('youtube.com')
            ? this.task.sourcePageUrl
            : this.task.referrer && this.task.referrer.includes('youtube.com')
            ? this.task.referrer
            : targetUrl;
        const ytFallback = this.task.sourcePageUrl || this.task.referrer || this.task.url || targetUrl;
        const ytResolved = await resolveYouTubeStream(
          ytSource,
          this.task.quality,
          this.task.mimeType,
          ytFallback
        );
        if (ytResolved && ytResolved.primaryUrl) {
          this.task.finalUrl = ytResolved.primaryUrl;
          targetUrl = ytResolved.primaryUrl;
          if (ytResolved.quality) {
            this.task.quality = ytResolved.quality;
          }
          if (ytResolved.secondaryAudioUrl) {
            (this.task as any).secondaryAudioUrl = ytResolved.secondaryAudioUrl;
          } else {
            delete (this.task as any).secondaryAudioUrl;
          }
          if (ytResolved.title && !isNumericOrHashOnly(ytResolved.title)) {
            const resolvedExt = ytResolved.mimeType?.startsWith('audio/') ? '.m4a' : '.mp4';
            this.attemptRename(sanitizeFileName(`${ytResolved.title}${resolvedExt}`), true);
          }
          const primaryBytes =
            ytResolved.fileSize > 0
              ? Math.max(0, ytResolved.fileSize - (ytResolved.audioFileSize || 0))
              : 0;
          if (primaryBytes > 0) {
            this.task.fileSize = primaryBytes;
          }
          const isRangeCapableYt = targetUrl.includes('c=VISIONOS') || targetUrl.includes('gir=yes');
          this.task.supportsRanges = isRangeCapableYt;
          this.task.threadCount = isRangeCapableYt && primaryBytes > 0 ? 8 : 1;
          this.task.downloadedBytes = 0;
          this.task.chunks = [];
        }
      }

      // If filename is still generic (e.g. videoplayback.mp4 or download_xxx) and we have sourcePageTitle, apply it
      if (isNumericOrHashOnly(this.task.fileName) && this.task.sourcePageTitle) {
        const cleanedPageTitle = cleanSourcePageTitle(this.task.sourcePageTitle);
        if (cleanedPageTitle && !isNumericOrHashOnly(cleanedPageTitle)) {
          const currentExt = path.extname(this.task.fileName);
          const withExt = currentExt
            ? `${cleanedPageTitle}${currentExt}`
            : ensureFileExtension(cleanedPageTitle, this.task.mimeType || 'video/mp4', targetUrl);
          this.attemptRename(withExt, true);
        }
      }

      if (
        targetUrl.includes('googlevideo.com') &&
        !targetUrl.includes('c=VISIONOS') &&
        !targetUrl.includes('gir=yes')
      ) {
        this.task.threadCount = 1;
      }

      const isHls = this.isHlsUrl(targetUrl) || Boolean((this.task as any).isHlsStream);

      // 1. Prepare target file on disk
      const fileExists = fs.existsSync(this.task.savePath);
      if (fileExists && this.task.downloadedBytes > 0) {
        this.fd = fs.openSync(this.task.savePath, 'r+');
      } else {
        this.fd = fs.openSync(this.task.savePath, 'w+');
        if (this.task.fileSize > 0 && !isHls) {
          try {
            fs.ftruncateSync(this.fd, this.task.fileSize);
          } catch {}
        }
      }

      // 2. Initialize chunks if not already created
      if (!this.task.chunks || this.task.chunks.length === 0) {
        this.initializeChunks();
      }

      // 3. Start speed tracking ticker
      this.startSpeedTicker();

      // 4. Route HLS streams, single streams, or multi-part Range downloads
      if (isHls) {
        await this.downloadHlsStream();
      } else if (
        (targetUrl.includes('googlevideo.com') &&
          !targetUrl.includes('c=VISIONOS') &&
          !targetUrl.includes('gir=yes')) ||
        isOneTimeOrSignedUrl(targetUrl) ||
        !this.task.supportsRanges ||
        this.task.chunks.length <= 1
      ) {
        this.downloadSingleStream();
      } else {
        // Multi-part Range download
        for (const chunk of this.task.chunks) {
          if (chunk.downloadedBytes < chunk.totalBytes) {
            this.downloadChunk(chunk);
          } else {
            chunk.status = 'completed';
          }
        }
      }
    } catch (err: any) {
      this.handleError(err);
    }
  }

  private initializeChunks(): void {
    const threadCount = this.task.threadCount || 4;
    const totalSize = this.task.fileSize;

    if (!this.task.supportsRanges || totalSize <= 256 * 1024 || threadCount <= 1) {
      this.task.chunks = [
        {
          id: 0,
          startByte: 0,
          endByte: totalSize > 0 ? totalSize - 1 : 0,
          downloadedBytes: 0,
          totalBytes: totalSize,
          status: 'pending',
          speed: 0,
        },
      ];
      return;
    }

    const chunkSize = Math.floor(totalSize / threadCount);
    const chunks: ChunkInfo[] = [];

    for (let i = 0; i < threadCount; i++) {
      const start = i * chunkSize;
      const end = i === threadCount - 1 ? totalSize - 1 : (i + 1) * chunkSize - 1;
      const partSize = end - start + 1;

      chunks.push({
        id: i,
        startByte: start,
        endByte: end,
        downloadedBytes: 0,
        totalBytes: partSize,
        status: 'pending',
        speed: 0,
      });
    }

    this.task.chunks = chunks;
  }

  private attemptRename(betterName: string, force: boolean = false): void {
    if (!betterName || betterName === this.task.fileName || this.isPaused || this.isCancelled) return;

    // Never overwrite a filename with a generic/numeric/hash fallback (e.g. download_1791141211662.mp4 or videoplayback.mp4)
    if (isNumericOrHashOnly(betterName)) {
      return;
    }

    // If the task already has a meaningful non-generic filename, preserve it!
    // Only append the extension if the existing filename had no extension.
    if (!force && !isNumericOrHashOnly(this.task.fileName)) {
      const currentExt = path.extname(this.task.fileName);
      const betterExt = path.extname(betterName);
      if (!currentExt && betterExt) {
        betterName = `${this.task.fileName}${betterExt}`;
      } else {
        return;
      }
    }

    const saveDir = path.dirname(this.task.savePath);
    let newPath = path.join(saveDir, betterName);

    let c = 1;
    const ext = path.extname(betterName);
    const base = path.basename(betterName, ext);
    while (fs.existsSync(newPath) && newPath !== this.task.savePath) {
      newPath = path.join(saveDir, `${base} (${c})${ext}`);
      c++;
    }

    try {
      if (this.fd !== null) {
        try {
          fs.fsyncSync(this.fd);
          fs.closeSync(this.fd);
        } catch {}
        this.fd = null;
      }

      if (fs.existsSync(this.task.savePath) && this.task.savePath !== newPath) {
        fs.renameSync(this.task.savePath, newPath);
      }

      this.task.savePath = newPath;
      this.task.fileName = path.basename(newPath);
      this.task.category = categorizeFileName(this.task.fileName, '', this.task.finalUrl || this.task.url);

      if (fs.existsSync(this.task.savePath)) {
        this.fd = fs.openSync(this.task.savePath, 'r+');
      }

      this.emit('progress', this.task);
    } catch (e) {
      console.warn('Could not rename download file:', e);
      if (this.fd === null && fs.existsSync(this.task.savePath)) {
        try {
          this.fd = fs.openSync(this.task.savePath, 'r+');
        } catch {}
      }
    }
  }

  private fallbackToSingleStream(): void {
    if (this.isPaused || this.isCancelled) return;
    for (const [, r] of this.activeResponses.entries()) {
      try {
        r.removeAllListeners();
        r.on('error', () => {});
        r.destroy();
      } catch {}
    }
    this.activeResponses.clear();
    for (const [, req] of this.activeRequests.entries()) {
      try {
        req.removeAllListeners();
        req.on('error', () => {});
        req.destroy();
      } catch {}
    }
    this.activeRequests.clear();

    this.task.supportsRanges = false;
    this.task.threadCount = 1;
    this.task.downloadedBytes = 0;
    this.initializeChunks();
    this.downloadSingleStream(0);
  }

  private downloadChunk(chunk: ChunkInfo, profile: number = 0): void {
    if (this.isPaused || this.isCancelled) return;

    chunk.status = 'downloading';
    const currentStart = chunk.startByte + chunk.downloadedBytes;
    const currentEnd = chunk.endByte;

    if (currentStart > currentEnd) {
      chunk.status = 'completed';
      this.checkCompletion();
      return;
    }

    const targetUrl = this.task.finalUrl || this.task.url;
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const agent = isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;

    const chunkHeaders: http.OutgoingHttpHeaders = {
      'Range': `bytes=${currentStart}-${currentEnd}`,
    };
    if (this.task.referrer) {
      chunkHeaders['Referer'] = this.task.referrer;
    }

    const reqOptions: http.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: getRequestHeaders(targetUrl, chunkHeaders, profile),
      agent,
    };

    const req = client.request(reqOptions, (res) => {
      res.on('error', (err) => {
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        if (this.isPaused || this.isCancelled) return;
        this.retryChunk(chunk, err);
      });

      if (this.isPaused || this.isCancelled) {
        res.destroy();
        return;
      }

      this.activeResponses.set(chunk.id, res);

      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        const nextUrl = new URL(res.headers.location, this.task.url).toString();
        this.task.finalUrl = nextUrl;
        return this.downloadChunk(chunk, profile);
      }

      if (res.statusCode === 200 && chunk.id > 0) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        this.task.supportsRanges = false;
        return;
      }

      if (res.statusCode === 403 && profile < 3) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        return this.downloadChunk(chunk, profile + 1);
      }

      if (res.statusCode && res.statusCode >= 400) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        // If multi-connection Range requests were rejected (e.g., 403 anti-leech), fall back to single stream
        if (this.task.chunks.length > 1) {
          this.fallbackToSingleStream();
          return;
        }
        this.handleError(
          new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage || (res.statusCode === 403 ? 'Access Denied / Protected link' : 'Error')}`)
        );
        return;
      }

      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        this.retryChunk(chunk, new Error(`Chunk ${chunk.id} received HTTP status ${res.statusCode}`));
        return;
      }

      // Check chunk 0 headers for filename & category
      if (chunk.id === 0 && res.headers) {
        const mimeType = (res.headers['content-type'] as string) || '';
        const betterName = extractFileNameFromUrl(this.task.finalUrl || this.task.url, res.headers);
        if (betterName && (betterName !== this.task.fileName || !path.extname(this.task.fileName))) {
          this.attemptRename(betterName);
        }
        this.task.category = categorizeFileName(this.task.fileName, mimeType, this.task.finalUrl || this.task.url);
      }

      res.on('data', (buffer: Buffer) => {
        if (this.isPaused || this.isCancelled || this.fd === null) {
          res.destroy();
          return;
        }

        try {
          const writeOffset = chunk.startByte + chunk.downloadedBytes;
          fs.writeSync(this.fd, buffer, 0, buffer.length, writeOffset);
          chunk.downloadedBytes += buffer.length;
          this.task.downloadedBytes += buffer.length;
          this.applyStreamThrottle(res, buffer.length);
        } catch (err: any) {
          res.destroy();
          this.handleError(err);
        }
      });

      res.on('end', () => {
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        if (this.isPaused || this.isCancelled) return;

        if (chunk.downloadedBytes >= chunk.totalBytes) {
          chunk.status = 'completed';
          this.emit('chunk-complete', chunk);
          this.checkCompletion();
        } else {
          this.retryChunk(chunk, new Error('Chunk connection closed prematurely'));
        }
      });
    });

    req.on('error', (err) => {
      this.activeRequests.delete(chunk.id);
      if (this.isPaused || this.isCancelled) return;
      this.retryChunk(chunk, err);
    });

    this.activeRequests.set(chunk.id, req);
    req.end();
  }

  private downloadSingleStream(profile: number = 0): void {
    if (this.isPaused || this.isCancelled) return;

    const targetUrl = this.task.finalUrl || this.task.url;
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const agent = isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;

    const customHeaders: http.OutgoingHttpHeaders = {};
    if (this.task.downloadedBytes > 0 && this.task.supportsRanges && profile === 0) {
      customHeaders['Range'] = `bytes=${this.task.downloadedBytes}-`;
    }
    const effectiveReferrer =
      profile === 2 && this.task.sourcePageUrl
        ? this.task.sourcePageUrl
        : this.task.referrer || this.task.sourcePageUrl;
    if (effectiveReferrer) {
      customHeaders['Referer'] = effectiveReferrer;
    }

    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: getRequestHeaders(targetUrl, customHeaders, profile > 3 ? 3 : profile),
        agent,
      },
      (res) => {
        res.on('error', (err) => {
          this.activeResponses.delete(0);
          this.activeRequests.delete(0);
          if (this.isPaused || this.isCancelled) return;
          this.handleError(err);
        });

        if (this.isPaused || this.isCancelled) {
          res.destroy();
          return;
        }

        this.activeResponses.set(0, res);

        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.destroy();
          this.activeResponses.delete(0);
          const nextUrl = new URL(res.headers.location, this.task.url).toString();
          this.task.finalUrl = nextUrl;
          return this.downloadSingleStream(profile);
        }

        if (res.statusCode === 403 && profile < 3) {
          res.destroy();
          this.activeResponses.delete(0);
          this.activeRequests.delete(0);
          return this.downloadSingleStream(profile + 1);
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.destroy();
          this.activeResponses.delete(0);
          this.handleError(
            new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage || (res.statusCode === 403 ? 'Access Denied / Protected link' : 'Error')}`)
          );
          return;
        }

        // If server returned 200 OK instead of 206 Partial Content on resume, reset offset
        if (res.statusCode === 200 && this.task.downloadedBytes > 0) {
          this.task.downloadedBytes = 0;
          this.lastBytesDownloaded = 0;
        }

        // Read Content-Length or Content-Range if missing
        const incomingLen = res.headers['content-length'];
        if (!this.task.fileSize && incomingLen) {
          const parsedLen = parseInt(incomingLen, 10);
          if (!isNaN(parsedLen) && parsedLen > 0) {
            this.task.fileSize = parsedLen;
            if (this.task.chunks[0]) {
              this.task.chunks[0].totalBytes = parsedLen;
              this.task.chunks[0].endByte = parsedLen - 1;
            }
          }
        }

        // Try extracting real filename from response headers
        const mimeType = (res.headers['content-type'] as string) || '';
        if (mimeType.toLowerCase().includes('mpegurl')) {
          res.destroy();
          this.activeResponses.delete(0);
          this.activeRequests.delete(0);
          (this.task as any).isHlsStream = true;
          this.downloadHlsStream().catch((err) => this.handleError(err));
          return;
        }

        const betterName = extractFileNameFromUrl(this.task.finalUrl || this.task.url, res.headers);
        if (betterName && (betterName !== this.task.fileName || !path.extname(this.task.fileName))) {
          this.attemptRename(betterName);
        }

        this.task.category = categorizeFileName(this.task.fileName, mimeType, this.task.finalUrl || this.task.url);
        this.emit('progress', this.task);

        if (this.task.chunks[0]) {
          this.task.chunks[0].status = 'downloading';
        }

        res.on('data', (buffer: Buffer) => {
          if (this.isPaused || this.isCancelled || this.fd === null) {
            res.destroy();
            return;
          }

          // Detect disguised HLS playlist (#EXTM3U served as text/plain, .txt, .php, etc.)
          if (
            this.task.downloadedBytes === 0 &&
            buffer.length >= 7 &&
            buffer.subarray(0, 7).toString('utf8') === '#EXTM3U'
          ) {
            res.destroy();
            this.activeResponses.delete(0);
            this.activeRequests.delete(0);
            (this.task as any).isHlsStream = true;
            this.downloadHlsStream().catch((err) => this.handleError(err));
            return;
          }

          try {
            fs.writeSync(this.fd, buffer, 0, buffer.length, this.task.downloadedBytes);
            this.task.downloadedBytes += buffer.length;
            if (this.task.chunks[0]) {
              this.task.chunks[0].downloadedBytes = this.task.downloadedBytes;
            }
            this.applyStreamThrottle(res, buffer.length);
          } catch (err: any) {
            res.destroy();
            this.handleError(err);
          }
        });

        res.on('end', () => {
          this.activeResponses.delete(0);
          this.activeRequests.delete(0);
          if (this.isPaused || this.isCancelled) return;
          if (this.task.chunks[0]) {
            this.task.chunks[0].status = 'completed';
          }
          this.completeDownload();
        });
      }
    );

    req.on('error', (err) => {
      this.activeRequests.delete(0);
      if (this.isPaused || this.isCancelled) return;
      this.handleError(err);
    });

    this.activeRequests.set(0, req);
    req.end();
  }

  private decryptHlsSegment(buf: Buffer, key: Buffer, ivHex?: string, seqIndex: number = 0): Buffer {
    try {
      let iv: Buffer;
      if (ivHex) {
        const cleanHex = ivHex.replace(/^0x/i, '').padStart(32, '0').slice(0, 32);
        iv = Buffer.from(cleanHex, 'hex');
      } else {
        iv = Buffer.alloc(16, 0);
        iv.writeUInt32BE(seqIndex >>> 0, 12);
      }
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      return Buffer.concat([decipher.update(buf), decipher.final()]);
    } catch {
      return buf;
    }
  }

  private async downloadHlsStream(): Promise<void> {
    if (this.isPaused || this.isCancelled) return;
    (this.task as any).isHlsStream = true;

    // Ensure target filename ends with .mp4 instead of .m3u8 or .php
    if (/\.(m3u8|php|txt|html?)$/i.test(this.task.fileName)) {
      const mp4Name = this.task.fileName.replace(/\.(m3u8|php|txt|html?)$/i, '.mp4');
      this.attemptRename(mp4Name);
    }

    const targetUrl = this.task.finalUrl || this.task.url;
    const isSequentialPattern = targetUrl.includes('__DLX_SEG_');
    let playlist = await resolveHlsMediaPlaylist(targetUrl, this.task.referrer || this.task.sourcePageUrl);
    if (!playlist && this.task.sourcePageUrl && this.task.sourcePageUrl !== this.task.referrer) {
      playlist = await resolveHlsMediaPlaylist(targetUrl, this.task.sourcePageUrl);
    }
    if (!playlist && (this.task as any).hlsResolvedPlaylist && Array.isArray((this.task as any).hlsResolvedPlaylist.segmentUrls)) {
      playlist = (this.task as any).hlsResolvedPlaylist;
    }
    if (!playlist || playlist.segmentUrls.length === 0) {
      throw new Error('Could not resolve video stream segments from playlist');
    }
    (this.task as any).hlsResolvedPlaylist = playlist;

    let encryptionKey: Buffer | null = null;
    if (playlist.encryptionKeyUrl) {
      try {
        const keyResp = await fetchBufferWithHeaders(playlist.encryptionKeyUrl, this.task.referrer || this.task.sourcePageUrl);
        if (keyResp.statusCode < 400 && keyResp.buffer.length === 16) {
          encryptionKey = keyResp.buffer;
        }
      } catch {}
    }

    let startSegIndex: number = Number((this.task as any).hlsNextSegment) || 0;
    let diskWriteOffset: number = Number((this.task as any).hlsDiskOffset) || this.task.downloadedBytes || 0;

    if (startSegIndex === 0 || diskWriteOffset === 0) {
      startSegIndex = 0;
      diskWriteOffset = 0;
      this.task.downloadedBytes = 0;
      if (playlist.initSegmentUrl) {
        const initResp = await fetchBufferWithHeaders(playlist.initSegmentUrl, this.task.referrer || this.task.sourcePageUrl);
        if (initResp.statusCode < 400 && initResp.buffer.length > 0 && this.fd !== null) {
          fs.writeSync(this.fd, initResp.buffer, 0, initResp.buffer.length, diskWriteOffset);
          diskWriteOffset += initResp.buffer.length;
          this.task.downloadedBytes = diskWriteOffset;
          (this.task as any).hlsDiskOffset = diskWriteOffset;
        }
      }
    } else {
      // Align live downloadedBytes with confirmed disk offset on resume
      this.task.downloadedBytes = diskWriteOffset;
    }

    if (this.task.chunks[0]) {
      this.task.chunks[0].status = 'downloading';
    }

    const totalSegments = playlist.segmentUrls.length;
    const workerCount = this.speedLimitBytesPerSec > 0 ? 1 : 4;

    let nextFetchIndex = startSegIndex;
    let nextWriteIndex = startSegIndex;
    let stopFetchingAt = totalSegments;
    let fatalError: Error | null = null;
    const completedBuffers = new Map<number, Buffer>();

    const flushReadySegments = () => {
      while (completedBuffers.has(nextWriteIndex)) {
        const buf = completedBuffers.get(nextWriteIndex)!;
        completedBuffers.delete(nextWriteIndex);
        if (buf.length > 0 && this.fd !== null && !this.isPaused && !this.isCancelled) {
          fs.writeSync(this.fd, buf, 0, buf.length, diskWriteOffset);
          diskWriteOffset += buf.length;
          (this.task as any).hlsDiskOffset = diskWriteOffset;
        }
        nextWriteIndex++;
        (this.task as any).hlsNextSegment = nextWriteIndex;

        if (nextWriteIndex > 0) {
          const avgSegBytes = diskWriteOffset / nextWriteIndex;
          const estimatedTotal = Math.round(avgSegBytes * stopFetchingAt);
          this.task.fileSize = Math.max(this.task.downloadedBytes + 1, estimatedTotal);
          if (this.task.chunks[0]) {
            this.task.chunks[0].totalBytes = this.task.fileSize;
            this.task.chunks[0].downloadedBytes = this.task.downloadedBytes;
          }
        }
      }
    };

    const runWorker = async () => {
      while (!this.isPaused && !this.isCancelled && !fatalError) {
        // Prevent memory buildup if one early segment is slow while later ones complete
        while (
          completedBuffers.size >= workerCount * 3 &&
          !this.isPaused &&
          !this.isCancelled &&
          !fatalError
        ) {
          await new Promise((r) => setTimeout(r, 50));
        }

        if (this.isPaused || this.isCancelled || fatalError) return;
        const segIdx = nextFetchIndex++;
        if (segIdx >= stopFetchingAt) return;

        const segUrl = playlist.segmentUrls[segIdx];
        let segBuf: Buffer | null = null;
        let lastErr: Error | null = null;

        for (let attempt = 0; attempt < 4; attempt++) {
          if (this.isPaused || this.isCancelled || fatalError || segIdx >= stopFetchingAt) return;
          let attemptBytes = 0;
          const segStartTime = Date.now();
          try {
            const resp = await fetchBufferWithHeaders(
              segUrl,
              this.task.referrer,
              6,
              20000,
              (chunkLen) => {
                if (this.isPaused || this.isCancelled) return;
                attemptBytes += chunkLen;
                this.task.downloadedBytes += chunkLen;
                if (this.task.chunks[0]) {
                  this.task.chunks[0].downloadedBytes = this.task.downloadedBytes;
                }
              }
            );

            if (resp.statusCode >= 400) {
              if (attemptBytes > 0) {
                this.task.downloadedBytes = Math.max(diskWriteOffset, this.task.downloadedBytes - attemptBytes);
              }
              if (isSequentialPattern && segIdx > 0 && (resp.statusCode === 404 || resp.statusCode === 403)) {
                stopFetchingAt = Math.min(stopFetchingAt, segIdx);
                return;
              }
              throw new Error(`Segment ${segIdx} returned HTTP ${resp.statusCode}`);
            }

            let buf = resp.buffer;
            if (encryptionKey && buf.length > 0) {
              const seqNum = (playlist.mediaSequenceStart || 0) + segIdx;
              buf = this.decryptHlsSegment(buf, encryptionKey, playlist.encryptionIvHex, seqNum);
            }
            segBuf = buf;

            if (this.speedLimitBytesPerSec > 0 && buf.length > 0) {
              const expectedMs = (buf.length / this.speedLimitBytesPerSec) * 1000;
              const elapsedMs = Date.now() - segStartTime;
              if (expectedMs > elapsedMs) {
                await new Promise((r) => setTimeout(r, Math.round(expectedMs - elapsedMs)));
              }
            }
            break;
          } catch (err: any) {
            if (attemptBytes > 0) {
              this.task.downloadedBytes = Math.max(diskWriteOffset, this.task.downloadedBytes - attemptBytes);
            }
            lastErr = err;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }

        if (!segBuf) {
          if (!this.isPaused && !this.isCancelled && segIdx < stopFetchingAt) {
            fatalError = lastErr || new Error(`Failed to download video segment ${segIdx}`);
          }
          return;
        }

        if (this.isPaused || this.isCancelled || this.fd === null) return;
        completedBuffers.set(segIdx, segBuf);
        flushReadySegments();
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < workerCount; w++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    if (this.isPaused || this.isCancelled) return;
    if (fatalError) {
      throw fatalError;
    }

    flushReadySegments();
    this.task.downloadedBytes = diskWriteOffset;
    this.task.fileSize = diskWriteOffset;
    if (this.task.chunks[0]) {
      this.task.chunks[0].downloadedBytes = diskWriteOffset;
      this.task.chunks[0].totalBytes = diskWriteOffset;
      this.task.chunks[0].status = 'completed';
    }
    await this.completeDownload();
  }

  private retryChunk(chunk: ChunkInfo, err: Error): void {
    if (this.isPaused || this.isCancelled) return;

    const currentRetries = this.chunkRetryCounts.get(chunk.id) || 0;
    if (currentRetries < this.maxRetriesPerChunk) {
      this.chunkRetryCounts.set(chunk.id, currentRetries + 1);
      chunk.status = 'downloading';
      const delay = Math.min(1000 * Math.pow(2, currentRetries), 10000);
      const timer = setTimeout(() => {
        this.retryTimers.delete(timer);
        if (!this.isPaused && !this.isCancelled) {
          this.downloadChunk(chunk);
        }
      }, delay);
      this.retryTimers.add(timer);
    } else {
      chunk.status = 'failed';
      this.handleError(new Error(`Chunk ${chunk.id} failed after ${this.maxRetriesPerChunk} retries: ${err.message}`));
    }
  }

  private checkCompletion(): void {
    if (this.isPaused || this.isCancelled) return;

    const allCompleted = this.task.chunks.every((c) => c.status === 'completed');
    if (allCompleted) {
      this.completeDownload();
    }
  }

  private isCompleting: boolean = false;

  private async downloadSecondaryAudioBuffer(audioUrl: string): Promise<Buffer> {
    let totalBytes = 0;
    try {
      const parsed = new URL(audioUrl);
      const clen = parseInt(parsed.searchParams.get('clen') || '0', 10);
      if (!isNaN(clen) && clen > 0) {
        totalBytes = clen;
      }
    } catch {}

    if (totalBytes > 256 * 1024) {
      // Download in parallel 1.5MB Range chunks to bypass YouTube single-stream speed throttling
      const chunkSize = 1536 * 1024;
      const numChunks = Math.ceil(totalBytes / chunkSize);
      const buffers: Buffer[] = new Array(numChunks);
      let nextIdx = 0;
      const concurrency = Math.min(4, numChunks);

      const fetchRangePart = (start: number, end: number): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const doReq = (urlStr: string, redirects = 0) => {
            if (this.isPaused || this.isCancelled) return reject(new Error('Cancelled'));
            try {
              const p = new URL(urlStr);
              const isHttps = p.protocol === 'https:';
              const client = isHttps ? https : http;
              const agent = isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;
              const headers = getRequestHeaders(urlStr, { Range: `bytes=${start}-${end}` });

              const req = client.request(
                {
                  protocol: p.protocol,
                  hostname: p.hostname,
                  port: p.port || (isHttps ? 443 : 80),
                  path: p.pathname + p.search,
                  method: 'GET',
                  headers,
                  agent,
                  timeout: 20000,
                },
                (res) => {
                  if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirects >= 5) return reject(new Error('Too many redirects'));
                    return doReq(new URL(res.headers.location, urlStr).toString(), redirects + 1);
                  }
                  if (!res.statusCode || res.statusCode >= 400) {
                    res.resume();
                    return reject(new Error(`Audio range HTTP ${res.statusCode}`));
                  }
                  const parts: Buffer[] = [];
                  res.on('data', (c: Buffer) => {
                    parts.push(c);
                    if (!this.isPaused && !this.isCancelled) {
                      this.task.downloadedBytes += c.length;
                      if (this.task.downloadedBytes > this.task.fileSize) {
                        this.task.fileSize = this.task.downloadedBytes;
                      }
                    }
                  });
                  res.on('end', () => resolve(Buffer.concat(parts)));
                  res.on('error', reject);
                }
              );
              req.on('timeout', () => req.destroy(new Error('Audio range timeout')));
              req.on('error', reject);
              req.end();
            } catch (err) {
              reject(err);
            }
          };
          doReq(audioUrl);
        });
      };

      try {
        const workers = Array.from({ length: concurrency }, async () => {
          while (nextIdx < numChunks && !this.isPaused && !this.isCancelled) {
            const idx = nextIdx++;
            const start = idx * chunkSize;
            const end = Math.min(totalBytes - 1, (idx + 1) * chunkSize - 1);
            buffers[idx] = await fetchRangePart(start, end);
          }
        });
        await Promise.all(workers);
        if (!this.isPaused && !this.isCancelled && buffers.every((b) => b && b.length > 0)) {
          return Buffer.concat(buffers);
        }
      } catch {}
    }

    const fallbackResp = await fetchBufferWithHeaders(
      audioUrl,
      this.task.referrer,
      6,
      60000,
      (chunkLen) => {
        if (this.isPaused || this.isCancelled) return;
        this.task.downloadedBytes += chunkLen;
        if (this.task.downloadedBytes > this.task.fileSize) {
          this.task.fileSize = this.task.downloadedBytes;
        }
      }
    );
    return fallbackResp.statusCode < 400 ? fallbackResp.buffer : Buffer.alloc(0);
  }

  private async completeDownload(): Promise<void> {
    if (this.isPaused || this.isCancelled || this.isCompleting) return;
    this.isCompleting = true;

    try {
      if (this.fd !== null && (this.task as any).isHlsStream && this.task.downloadedBytes > 0) {
        try {
          fs.ftruncateSync(this.fd, this.task.downloadedBytes);
        } catch {}
      }
      this.closeFileDescriptor();

      // If this video has a companion audio stream (e.g. YouTube 1080p/720p/480p adaptive fMP4), download & mux it
      let audioUrl = (this.task as any).secondaryAudioUrl;
      if (audioUrl && typeof audioUrl === 'string' && !this.isPaused && !this.isCancelled) {
        const audioTempPath = `${this.task.savePath}.audio.tmp`;
        try {
          if (audioUrl.includes('youtube.com/watch') || audioUrl.includes('youtu.be/')) {
            const resolvedAudio = await resolveYouTubeStream(audioUrl, 'audio', 'audio/mp4');
            if (resolvedAudio && resolvedAudio.primaryUrl) {
              audioUrl = resolvedAudio.primaryUrl;
            }
          }
          const baseBytes = this.task.downloadedBytes;
          const audioBuf = await this.downloadSecondaryAudioBuffer(audioUrl);
          if (this.isPaused || this.isCancelled) {
            this.isCompleting = false;
            return;
          }
          if (audioBuf && audioBuf.length > 0) {
            fs.writeFileSync(audioTempPath, audioBuf);
            muxFmp4VideoAndAudio(this.task.savePath, audioTempPath, this.task.savePath);
          } else {
            this.task.downloadedBytes = baseBytes;
          }
        } catch (e) {
          console.warn('Secondary audio download/mux warning:', e);
        } finally {
          try {
            if (fs.existsSync(audioTempPath)) fs.unlinkSync(audioTempPath);
          } catch {}
          delete (this.task as any).secondaryAudioUrl;
        }
      }

      this.stopSpeedTicker();

      try {
        if (fs.existsSync(this.task.savePath)) {
          const st = fs.statSync(this.task.savePath);
          if (st.size > 0) {
            this.task.fileSize = st.size;
            this.task.downloadedBytes = st.size;
          }
        }
      } catch {}

      this.task.status = 'completed';
      this.task.speed = 0;
      this.task.eta = 0;
      this.task.progress = 100;
      this.task.completedAt = Date.now();
      this.task.downloadedBytes = this.task.fileSize > 0 ? this.task.fileSize : this.task.downloadedBytes;
      this.task.category = categorizeFileName(this.task.fileName, '', this.task.finalUrl || this.task.url);

      this.emit('progress', this.task);
      this.emit('completed', this.task);
    } finally {
      this.isCompleting = false;
    }
  }

  private startSpeedTicker(): void {
    const startNow = Date.now();
    this.lastTickTime = startNow;
    this.lastBytesDownloaded = this.task.downloadedBytes;
    this.speedSamples = [{ time: startNow, bytes: this.task.downloadedBytes }];

    this.speedTimer = setInterval(() => {
      if (this.isPaused || this.isCancelled) return;
      const now = Date.now();
      const currentBytes = this.task.downloadedBytes;

      this.speedSamples.push({ time: now, bytes: currentBytes });
      // Keep a 3-second rolling window for smooth, accurate speed calculation
      while (this.speedSamples.length > 2 && now - this.speedSamples[0].time > 3000) {
        this.speedSamples.shift();
      }

      const oldest = this.speedSamples[0];
      const windowSec = (now - oldest.time) / 1000;
      const windowBytesDelta = Math.max(0, currentBytes - oldest.bytes);
      const rollingSpeed = windowSec > 0.05 ? Math.round(windowBytesDelta / windowSec) : 0;

      // Blend with previous speed for smooth UI transitions without sudden 0 B/s drops
      let smoothedSpeed = rollingSpeed;
      if (this.task.speed > 0 && rollingSpeed > 0) {
        smoothedSpeed = Math.round(this.task.speed * 0.3 + rollingSpeed * 0.7);
      }

      const currentSpeed = this.speedLimitBytesPerSec > 0
        ? Math.min(smoothedSpeed, this.speedLimitBytesPerSec)
        : smoothedSpeed;

      this.task.speed = currentSpeed;
      this.lastBytesDownloaded = currentBytes;
      this.lastTickTime = now;

      if (this.task.fileSize > 0) {
        this.task.progress = Math.min(99.9, (currentBytes / this.task.fileSize) * 100);
        const remainingBytes = Math.max(0, this.task.fileSize - currentBytes);
        this.task.eta = currentSpeed > 0 ? Math.ceil(remainingBytes / currentSpeed) : 0;
      } else {
        this.task.progress = 0;
        this.task.eta = 0;
      }

      this.emit('progress', this.task);
    }, 350);
  }

  private stopSpeedTicker(): void {
    if (this.speedTimer) {
      clearInterval(this.speedTimer);
      this.speedTimer = null;
    }
    for (const timer of this.retryTimers) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  public pause(): void {
    if (this.task.status === 'completed' || this.isPaused) return;

    this.isPaused = true;
    this.stopSpeedTicker();

    for (const [, res] of this.activeResponses.entries()) {
      try {
        res.removeAllListeners('data');
        res.removeAllListeners('end');
        res.removeAllListeners('error');
        res.on('error', () => {});
        res.destroy();
      } catch {}
    }
    this.activeResponses.clear();

    for (const [, req] of this.activeRequests.entries()) {
      try {
        req.removeAllListeners('error');
        req.on('error', () => {});
        req.destroy();
      } catch {}
    }
    this.activeRequests.clear();

    this.closeFileDescriptor();

    this.task.status = 'paused';
    this.task.speed = 0;
    this.task.eta = 0;
    for (const chunk of this.task.chunks) {
      if (chunk.status === 'downloading') {
        chunk.status = 'pending';
      }
    }

    this.emit('progress', this.task);
    this.emit('paused', this.task);
  }

  public cancel(deleteFile: boolean = false): void {
    this.isCancelled = true;
    this.stopSpeedTicker();

    for (const [, res] of this.activeResponses.entries()) {
      try {
        res.removeAllListeners();
        res.on('error', () => {});
        res.destroy();
      } catch {}
    }
    this.activeResponses.clear();

    for (const [, req] of this.activeRequests.entries()) {
      try {
        req.removeAllListeners();
        req.on('error', () => {});
        req.destroy();
      } catch {}
    }
    this.activeRequests.clear();

    this.closeFileDescriptor();

    this.task.status = 'cancelled';
    this.task.speed = 0;

    if (deleteFile && fs.existsSync(this.task.savePath)) {
      try {
        fs.unlinkSync(this.task.savePath);
      } catch {}
    }

    this.emit('cancelled', this.task);
  }

  private handleError(err: Error): void {
    if (this.isPaused || this.isCancelled) return;
    this.stopSpeedTicker();
    this.closeFileDescriptor();

    this.task.status = 'error';
    this.task.errorMessage = err.message || 'Unknown download error';
    this.task.speed = 0;

    this.emit('progress', this.task);
    this.emit('error', err, this.task);
  }

  private closeFileDescriptor(): void {
    if (this.fd !== null) {
      try {
        fs.fsyncSync(this.fd);
        fs.closeSync(this.fd);
      } catch {}
      this.fd = null;
    }
  }
}
