import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { DownloadTask, TorrentFileInfo, UrlInspectionResult } from './types';
import { categorizeFileName, sanitizeFileName } from './inspector';

export class TorrentEngine extends EventEmitter {
  private static instance: TorrentEngine | null = null;
  private client: any = null;
  private isInitializing: Promise<any> | null = null;
  private activeTorrents: Map<string, any> = new Map(); // taskId -> Torrent instance
  private parseTorrentFn: any = null;
  private WebTorrentClass: any = null;

  public static getInstance(): TorrentEngine {
    if (!TorrentEngine.instance) {
      TorrentEngine.instance = new TorrentEngine();
    }
    return TorrentEngine.instance;
  }

  private constructor() {
    super();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.client) return;
    if (this.isInitializing) return this.isInitializing;

    this.isInitializing = (async () => {
      try {
        // Use Function constructor so TypeScript does not rewrite import() to require() in CommonJS target
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const wtModule = await dynamicImport('webtorrent');
        this.WebTorrentClass = wtModule.default || wtModule;
        
        const ptModule = await dynamicImport('parse-torrent');
        this.parseTorrentFn = ptModule.default || ptModule;

        this.client = new this.WebTorrentClass({
          maxConns: 60,
          dht: true,
          webSeeds: true,
        });

        this.client.on('error', (err: any) => {
          console.warn('WebTorrent client warning:', err.message);
        });
      } catch (err) {
        console.error('Failed to initialize WebTorrent client:', err);
        throw err;
      }
    })();

    await this.isInitializing;
  }

  public isTorrentSource(source: string): boolean {
    if (!source) return false;
    const clean = source.trim().toLowerCase();
    if (clean.startsWith('magnet:?')) return true;
    if (clean.endsWith('.torrent') || clean.includes('.torrent?')) return true;
    if (fs.existsSync(source) && source.toLowerCase().endsWith('.torrent')) return true;
    return false;
  }

  public async inspectTorrent(source: string): Promise<UrlInspectionResult> {
    await this.ensureInitialized();

    let torrentData: any = source.trim();
    if (fs.existsSync(source) && source.toLowerCase().endsWith('.torrent')) {
      torrentData = fs.readFileSync(source);
    }

    try {
      const parsed = await this.parseTorrentFn(torrentData);
      const name = parsed.name ? sanitizeFileName(parsed.name) : `Torrent_${(parsed.infoHash || '').substring(0, 8)}`;
      const files: TorrentFileInfo[] = (parsed.files || []).map((f: any) => ({
        name: f.name || path.basename(f.path || ''),
        path: f.path || f.name,
        length: f.length || 0,
      }));

      const totalSize = parsed.length || files.reduce((acc, f) => acc + f.length, 0);
      let category = categorizeFileName(name);
      if (category === 'other') {
        category = 'torrent';
      }

      return {
        url: typeof source === 'string' ? source : name,
        finalUrl: typeof source === 'string' ? source : name,
        fileName: name,
        fileSize: totalSize,
        supportsRanges: true,
        mimeType: 'application/x-bittorrent',
        category,
        isTorrent: true,
        infoHash: parsed.infoHash,
        torrentFiles: files,
      };
    } catch (err: any) {
      // If parsing failed (e.g. minimal magnet link with DHT only)
      let infoHashMatch = source.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : '';
      let dnMatch = source.match(/dn=([^&]+)/i);
      let dn = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : '';
      const fallbackName = dn ? sanitizeFileName(dn) : (infoHash ? `Torrent_${infoHash.substring(0, 8)}` : 'Torrent Download');

      return {
        url: source,
        finalUrl: source,
        fileName: fallbackName,
        fileSize: 0,
        supportsRanges: true,
        mimeType: 'application/x-bittorrent',
        category: 'torrent',
        isTorrent: true,
        infoHash,
        torrentFiles: [],
      };
    }
  }

  public async startTorrent(
    task: DownloadTask,
    onProgress: (task: DownloadTask) => void,
    onCompleted: (task: DownloadTask) => void,
    onError: (err: Error, task: DownloadTask) => void
  ): Promise<void> {
    await this.ensureInitialized();

    if (this.activeTorrents.has(task.id)) {
      return;
    }

    const saveDir = path.dirname(task.savePath);
    if (!fs.existsSync(saveDir)) {
      try {
        fs.mkdirSync(saveDir, { recursive: true });
      } catch {}
    }

    let torrentSource: any = task.url;
    if (fs.existsSync(task.url) && task.url.toLowerCase().endsWith('.torrent')) {
      torrentSource = fs.readFileSync(task.url);
    }

    try {
      task.status = 'connecting';
      task.protocol = 'torrent';
      onProgress(task);

      const torrent = this.client.add(torrentSource, { path: saveDir }, (t: any) => {
        // Metadata resolved!
        task.status = 'downloading';
        task.fileName = t.name ? sanitizeFileName(t.name) : task.fileName;
        task.infoHash = t.infoHash;
        task.fileSize = t.length || task.fileSize;
        task.savePath = path.join(saveDir, task.fileName);
        task.torrentFiles = (t.files || []).map((f: any) => ({
          name: f.name,
          path: f.path,
          length: f.length,
        }));
        if (task.category === 'other' || task.category === 'torrent') {
          const autoCat = categorizeFileName(task.fileName);
          task.category = autoCat !== 'other' ? autoCat : 'torrent';
        }
        onProgress(task);
      });

      this.activeTorrents.set(task.id, torrent);

      let lastProgressBroadcast = 0;
      const throttleProgress = () => {
        const now = Date.now();
        if (now - lastProgressBroadcast > 350) {
          lastProgressBroadcast = now;
          onProgress(task);
        }
      };

      torrent.on('download', () => {
        task.status = 'downloading';
        task.downloadedBytes = torrent.downloaded;
        task.speed = torrent.downloadSpeed;
        task.uploadSpeed = torrent.uploadSpeed;
        task.peers = torrent.numPeers;
        task.progress = Math.min(100, Math.round(torrent.progress * 1000) / 10);
        task.eta = torrent.timeRemaining ? Math.round(torrent.timeRemaining / 1000) : 0;
        throttleProgress();
      });

      torrent.on('upload', () => {
        task.uploadSpeed = torrent.uploadSpeed;
        task.uploadedBytes = torrent.uploaded;
        throttleProgress();
      });

      torrent.on('done', () => {
        task.status = 'completed';
        task.downloadedBytes = torrent.length || task.downloadedBytes;
        task.speed = 0;
        task.uploadSpeed = 0;
        task.eta = 0;
        task.progress = 100;
        task.completedAt = Date.now();
        this.activeTorrents.delete(task.id);
        onProgress(task);
        onCompleted(task);
      });

      torrent.on('error', (err: any) => {
        task.status = 'error';
        task.errorMessage = err.message || 'Torrent download error';
        task.speed = 0;
        this.activeTorrents.delete(task.id);
        onError(err, task);
      });
    } catch (err: any) {
      task.status = 'error';
      task.errorMessage = err.message || 'Failed to add torrent';
      this.activeTorrents.delete(task.id);
      onError(err, task);
    }
  }

  public pauseTorrent(taskId: string): void {
    const torrent = this.activeTorrents.get(taskId);
    if (torrent) {
      try {
        torrent.pause();
      } catch {}
      this.activeTorrents.delete(taskId);
    }
  }

  public cancelTorrent(taskId: string, deleteFiles: boolean = false): void {
    const torrent = this.activeTorrents.get(taskId);
    if (torrent) {
      try {
        torrent.destroy({ destroyStore: deleteFiles });
      } catch {}
      this.activeTorrents.delete(taskId);
    }
  }

  public shutdown(): void {
    if (this.client) {
      try {
        this.client.destroy();
      } catch {}
      this.client = null;
    }
  }
}
