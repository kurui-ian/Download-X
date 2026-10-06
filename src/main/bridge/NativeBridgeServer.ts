import http from 'http';
import path from 'path';
import { BrowserWindow } from 'electron';
import { DownloadManager } from '../manager/DownloadManager';
import { PersistenceStore } from '../manager/store';
import { validateBridgeMessage, MAX_MESSAGE_BYTES, ValidatedBridgeMessage } from './protocolValidation';
import {
  isNumericOrHashOnly,
  cleanSourcePageTitle,
  ensureFileExtension,
  sanitizeFileName,
} from '../engine/inspector';

export const BRIDGE_PORT = 45789;
export const BRIDGE_HOST = '127.0.0.1';

export class NativeBridgeServer {
  private server: http.Server | null = null;
  private downloadManager: DownloadManager;
  private store: PersistenceStore;
  private getMainWindow: () => BrowserWindow | null;

  constructor(
    downloadManager: DownloadManager,
    store: PersistenceStore,
    getMainWindow: () => BrowserWindow | null
  ) {
    this.downloadManager = downloadManager;
    this.store = store;
    this.getMainWindow = getMainWindow;
  }

  public start(): void {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // Allow requests from the local Native Messaging Host and Chromium extension origins
      const origin = req.headers.origin || '';
      if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DLX-Client');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Reject non-loopback sockets
      const remoteAddr = req.socket.remoteAddress || '';
      if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Forbidden: local loopback only.' }));
        return;
      }

      if (req.method === 'GET' && (req.url === '/status' || req.url === '/api/bridge')) {
        const statusPayload = this.buildStatusResponse();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(statusPayload));
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }));
        return;
      }

      let bodyBytes = 0;
      const chunks: Buffer[] = [];
      let aborted = false;

      req.on('data', (chunk: Buffer) => {
        bodyBytes += chunk.length;
        if (bodyBytes > MAX_MESSAGE_BYTES) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Payload too large.' }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', async () => {
        if (aborted) return;
        try {
          const rawStr = Buffer.concat(chunks).toString('utf-8');
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawStr);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload.' }));
            return;
          }

          const validation = validateBridgeMessage(parsed, bodyBytes);
          if (!validation.valid || !validation.data) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: validation.error || 'Invalid message.' }));
            return;
          }

          const response = await this.handleMessage(validation.data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Internal bridge error.' }));
        }
      });
    });

    this.server.on('error', (err: any) => {
      console.warn('[DLX Bridge] Server warning:', err.message);
    });

    this.server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
      console.log(`[DLX Bridge] Listening for Native Messaging Host on ${BRIDGE_HOST}:${BRIDGE_PORT}`);
    });
  }

  public stop(): void {
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
  }

  private buildBrowserSettings() {
    const s = this.store.getSettings();
    return {
      browserIntegrationEnabled: s.browserIntegrationEnabled !== false,
      autoInterceptDownloads: s.autoInterceptDownloads !== false,
      showMediaDownloadButton: s.showMediaDownloadButton !== false,
      detectVideos: s.detectVideos !== false,
      detectAudio: s.detectAudio !== false,
      detectImages: s.detectImages !== false,
      askBeforeIntercepting: s.askBeforeIntercepting !== false,
      downloadDir: s.downloadDir,
    };
  }

  private buildStatusResponse() {
    const tasks = this.downloadManager.getTasks();
    return {
      ok: true,
      running: true,
      version: '1.0.0',
      activeCount: tasks.filter((t) => t.status === 'downloading' || t.status === 'connecting').length,
      queuedCount: tasks.filter((t) => t.status === 'queued').length,
      completedCount: tasks.filter((t) => t.status === 'completed').length,
      settings: this.buildBrowserSettings(),
    };
  }

  private focusMainWindow(): BrowserWindow | null {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      try {
        win.setAlwaysOnTop(true);
        win.focus();
        win.moveTop();
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.setAlwaysOnTop(false);
          }
        }, 180);
      } catch {
        win.focus();
      }
      return win;
    }
    return null;
  }

  public async handleMessage(msg: ValidatedBridgeMessage): Promise<Record<string, unknown>> {
    switch (msg.type) {
      case 'hello':
      case 'ping': {
        console.log('[DLX Bridge] Handshake received from Browser Extension ("Hello DLX")');
        return {
          ok: true,
          type: 'hello',
          message: 'Hello from DLX Desktop',
          running: true,
          version: '1.0.0',
          settings: this.buildBrowserSettings(),
        };
      }

      case 'getStatus': {
        return this.buildStatusResponse();
      }

      case 'getSettings': {
        return {
          ok: true,
          running: true,
          settings: this.buildBrowserSettings(),
        };
      }

      case 'updateSettings': {
        const current = this.store.getSettings();
        const updated = {
          ...current,
          ...(msg.settings || {}),
        };
        this.store.saveSettings(updated);
        const win = this.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('settings-updated', updated);
        }
        return {
          ok: true,
          settings: this.buildBrowserSettings(),
        };
      }

      case 'openApplication': {
        this.focusMainWindow();
        return { ok: true, running: true };
      }

      case 'checkDuplicate': {
        const existing = msg.url ? this.downloadManager.findDuplicate(msg.url) : null;
        return {
          ok: true,
          duplicate: Boolean(existing),
          task: existing
            ? {
                id: existing.id,
                fileName: existing.fileName,
                status: existing.status,
                fileSize: existing.fileSize,
                progress: existing.progress,
                savePath: existing.savePath,
              }
            : null,
        };
      }

      case 'openExistingTask': {
        const win = this.focusMainWindow();
        if (msg.taskId) {
          const task = this.downloadManager.getTaskById(msg.taskId);
          if (task) {
            if (msg.openFile && task.status === 'completed') {
              await this.downloadManager.openFile(task.id);
            } else {
              this.downloadManager.openFolder(task.id);
            }
            if (win && !win.isDestroyed()) {
              win.webContents.send('browser:highlight-task', task.id);
            }
            return { ok: true, opened: true };
          }
        }
        return { ok: false, error: 'Task not found.' };
      }

      case 'addDownload':
      case 'addMediaDownload': {
        if (!msg.url) {
          return { ok: false, error: 'Missing URL.' };
        }

        const settings = this.store.getSettings();

        // 1. Resolve clean default filename for video/media downloads
        let effectiveFilename = msg.filename ? sanitizeFileName(msg.filename) : undefined;
        if (effectiveFilename) {
          const ext = path.extname(effectiveFilename);
          const stem = path.basename(effectiveFilename, ext);
          const cleanedStem = cleanSourcePageTitle(stem);
          if (cleanedStem && !isNumericOrHashOnly(cleanedStem)) {
            effectiveFilename = `${cleanedStem}${ext}`;
          }
        }

        if ((!effectiveFilename || isNumericOrHashOnly(effectiveFilename)) && msg.sourcePageTitle) {
          const cleanedTitle = cleanSourcePageTitle(msg.sourcePageTitle);
          if (cleanedTitle && !isNumericOrHashOnly(cleanedTitle)) {
            const existingExt = effectiveFilename ? path.extname(effectiveFilename) : '';
            effectiveFilename = existingExt
              ? `${cleanedTitle}${existingExt}`
              : ensureFileExtension(
                  cleanedTitle,
                  msg.mimeType || (msg.mediaType === 'video' ? 'video/mp4' : ''),
                  msg.url
                );
          }
        }

        // 2. Prompt user in DLX Confirmation Dialog (shows file name, file size, and save location)
        if (msg.openModal || settings.askBeforeIntercepting !== false) {
          const win = this.focusMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('browser:open-add-modal', {
              url: msg.url,
              fileName: effectiveFilename,
              fileSize: msg.fileSize,
              mimeType: msg.mimeType,
              quality: msg.quality,
              referrer: msg.referrer,
              source: msg.source || 'Browser',
              sourcePageUrl: msg.sourcePageUrl,
              sourcePageTitle: msg.sourcePageTitle,
              mediaType: msg.mediaType,
              secondaryAudioUrl: msg.secondaryAudioUrl,
              forceRedownload: Boolean(msg.forceRedownload),
            });
            return {
              ok: true,
              promptedInApp: true,
              duplicate: false,
              message: 'Opened in DLX confirmation dialog',
              task: {
                id: 'pending-confirmation',
                fileName: effectiveFilename || 'Download',
                status: 'confirming',
              },
            };
          }
        }

        // 3. Check duplicate using existing DLX duplicate detection system when silent mode is used
        if (!msg.forceRedownload) {
          const existing = this.downloadManager.findDuplicate(msg.url);
          if (existing) {
            return {
              ok: true,
              duplicate: true,
              message: 'Download already exists in DLX',
              task: {
                id: existing.id,
                fileName: existing.fileName,
                status: existing.status,
                fileSize: existing.fileSize,
                progress: existing.progress,
                savePath: existing.savePath,
              },
            };
          }
        }

        // 4. Add directly to existing DLX DownloadManager queue
        const task = await this.downloadManager.addDownload({
          url: msg.url,
          fileName: effectiveFilename,
          mimeType: msg.mimeType,
          fileSize: msg.fileSize,
          referrer: msg.referrer,
          source: msg.source || 'Browser',
          sourcePageUrl: msg.sourcePageUrl,
          sourcePageTitle: msg.sourcePageTitle,
          quality: msg.quality,
          mediaType: msg.mediaType,
          secondaryAudioUrl: msg.secondaryAudioUrl,
          forceRedownload: Boolean(msg.forceRedownload),
          autoStart: true,
        });

        return {
          ok: true,
          duplicate: false,
          added: true,
          task: {
            id: task.id,
            fileName: task.fileName,
            status: task.status,
            category: task.category,
            protocol: task.protocol,
          },
        };
      }
    }
  }
}
