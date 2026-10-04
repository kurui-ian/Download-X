import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import EventEmitter from 'events';
import { ChunkInfo, DownloadTask } from './types';
import { getRequestHeaders, isOneTimeOrSignedUrl, extractFileNameFromUrl, categorizeFileName } from './inspector';

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
      // 1. Prepare target file on disk
      const fileExists = fs.existsSync(this.task.savePath);
      if (fileExists && this.task.downloadedBytes > 0) {
        this.fd = fs.openSync(this.task.savePath, 'r+');
      } else {
        this.fd = fs.openSync(this.task.savePath, 'w+');
        if (this.task.fileSize > 0) {
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

      // 4. If URL is signed/tunnel or doesn't support ranges, use direct single stream
      if (isOneTimeOrSignedUrl(this.task.url) || !this.task.supportsRanges || this.task.chunks.length <= 1) {
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

  private attemptRename(betterName: string): void {
    if (!betterName || betterName === this.task.fileName || this.isPaused || this.isCancelled) return;
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

  private downloadChunk(chunk: ChunkInfo): void {
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

    const reqOptions: http.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: getRequestHeaders(targetUrl, {
        'Range': `bytes=${currentStart}-${currentEnd}`,
      }),
    };

    const req = client.request(reqOptions, (res) => {
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
        return this.downloadChunk(chunk);
      }

      if (res.statusCode === 200 && chunk.id > 0) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        this.task.supportsRanges = false;
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        res.destroy();
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
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

      res.on('error', (err) => {
        this.activeResponses.delete(chunk.id);
        this.activeRequests.delete(chunk.id);
        if (this.isPaused || this.isCancelled) return;
        this.retryChunk(chunk, err);
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

  private downloadSingleStream(): void {
    if (this.isPaused || this.isCancelled) return;

    const targetUrl = this.task.finalUrl || this.task.url;
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const customHeaders: http.OutgoingHttpHeaders = {};
    if (this.task.downloadedBytes > 0 && this.task.supportsRanges) {
      customHeaders['Range'] = `bytes=${this.task.downloadedBytes}-`;
    }

    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: getRequestHeaders(targetUrl, customHeaders),
      },
      (res) => {
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
          return this.downloadSingleStream();
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

        // Read Content-Length if missing
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

        res.on('error', (err) => {
          this.activeResponses.delete(0);
          this.activeRequests.delete(0);
          if (this.isPaused || this.isCancelled) return;
          this.handleError(err);
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

  private completeDownload(): void {
    if (this.isPaused || this.isCancelled) return;
    this.stopSpeedTicker();
    this.closeFileDescriptor();

    this.task.status = 'completed';
    this.task.speed = 0;
    this.task.eta = 0;
    this.task.progress = 100;
    this.task.completedAt = Date.now();
    this.task.downloadedBytes = this.task.fileSize > 0 ? this.task.fileSize : this.task.downloadedBytes;
    this.task.category = categorizeFileName(this.task.fileName, '', this.task.finalUrl || this.task.url);

    this.emit('progress', this.task);
    this.emit('completed', this.task);
  }

  private startSpeedTicker(): void {
    this.lastTickTime = Date.now();
    this.lastBytesDownloaded = this.task.downloadedBytes;

    this.speedTimer = setInterval(() => {
      if (this.isPaused || this.isCancelled) return;
      const now = Date.now();
      const elapsedSec = (now - this.lastTickTime) / 1000;
      if (elapsedSec <= 0) return;

      const bytesDelta = this.task.downloadedBytes - this.lastBytesDownloaded;
      const rawSpeed = Math.max(0, Math.round(bytesDelta / elapsedSec));
      const currentSpeed = this.speedLimitBytesPerSec > 0
        ? Math.min(rawSpeed, this.speedLimitBytesPerSec)
        : rawSpeed;

      this.task.speed = currentSpeed;
      this.lastBytesDownloaded = this.task.downloadedBytes;
      this.lastTickTime = now;

      if (this.task.fileSize > 0) {
        this.task.progress = Math.min(100, (this.task.downloadedBytes / this.task.fileSize) * 100);
        const remainingBytes = Math.max(0, this.task.fileSize - this.task.downloadedBytes);
        this.task.eta = currentSpeed > 0 ? Math.ceil(remainingBytes / currentSpeed) : 0;
      } else {
        this.task.progress = 0;
        this.task.eta = 0;
      }

      this.emit('progress', this.task);
    }, 500);
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
        res.destroy();
      } catch {}
    }
    this.activeResponses.clear();

    for (const [, req] of this.activeRequests.entries()) {
      try {
        req.removeAllListeners('error');
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
        res.destroy();
      } catch {}
    }
    this.activeResponses.clear();

    for (const [, req] of this.activeRequests.entries()) {
      try {
        req.removeAllListeners();
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
