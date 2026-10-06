import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { DownloadTask, TorrentFileInfo, UrlInspectionResult } from './types';
import { categorizeFileName, sanitizeFileName } from './inspector';

export const DEFAULT_PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker-udp.gbitt.info:80/announce',
  'udp://opentracker.io:6969/announce',
  'udp://retracker01-msk-virt.corbina.net:80/announce',
  'udp://open.free-tracker.ga:6969/announce',
  'udp://ns-1.x-fins.com:6969/announce',
  'udp://isk.steal.cf:6969/announce',
  'udp://ipv4.tracker.harry.lu:80/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.openbittorrent.com:80/announce',
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.gbitt.info:443/announce',
  'https://tracker.loligirl.cn:443/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
];

export class TorrentEngine extends EventEmitter {
  private static instance: TorrentEngine | null = null;
  private client: any = null;
  private isInitializing: Promise<any> | null = null;
  private activeTorrents: Map<string, any> = new Map(); // taskId -> Torrent instance
  private pausedTasks: Set<string> = new Set(); // taskIds that are explicitly paused
  private speedLimitBytesPerSec: number = 0; // 0 = unlimited
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

  public setSpeedLimit(bytesPerSec: number): void {
    this.speedLimitBytesPerSec = Math.max(0, bytesPerSec || 0);
    if (this.client && typeof this.client.throttleDownload === 'function') {
      try {
        this.client.throttleDownload(this.speedLimitBytesPerSec > 0 ? this.speedLimitBytesPerSec : -1);
      } catch (err) {
        console.warn('Failed to set WebTorrent download speed limit:', err);
      }
    }
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
          maxConns: 200,
          dht: true,
          lsd: true,
          utPex: true,
          webSeeds: true,
          utp: false,
          secure: 0,
          tracker: {
            announce: DEFAULT_PUBLIC_TRACKERS,
          },
          downloadLimit: this.speedLimitBytesPerSec > 0 ? this.speedLimitBytesPerSec : -1,
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
      const infoHashMatch = source.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : '';
      const dnMatch = source.match(/dn=([^&]+)/i);
      const dn = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : '';
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

  private removeExistingClientTorrent(torrentSource: any, infoHash?: string): void {
    if (!this.client || !Array.isArray(this.client.torrents)) return;
    const targetHash = infoHash?.toLowerCase();
    const matchFromMagnet = typeof torrentSource === 'string'
      ? torrentSource.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)?.[1]?.toLowerCase()
      : undefined;
    const hashToFind = targetHash || matchFromMagnet;

    for (const t of [...this.client.torrents]) {
      if (hashToFind && t.infoHash && t.infoHash.toLowerCase() === hashToFind) {
        try {
          t.removeAllListeners();
          t.destroy({ destroyStore: false });
        } catch {}
      }
    }
  }

  private isStopped(task: DownloadTask): boolean {
    return this.pausedTasks.has(task.id) || (task.status as string) === 'paused' || (task.status as string) === 'cancelled';
  }

  public async startTorrent(
    task: DownloadTask,
    onProgress: (task: DownloadTask) => void,
    onCompleted: (task: DownloadTask) => void,
    onError: (err: Error, task: DownloadTask) => void
  ): Promise<void> {
    this.pausedTasks.delete(task.id);
    await this.ensureInitialized();

    // Check if task was paused or cancelled while waiting for initialization
    if (this.isStopped(task)) {
      return;
    }

    // If an active torrent instance already exists for this taskId, clean it up first
    if (this.activeTorrents.has(task.id)) {
      const prev = this.activeTorrents.get(task.id);
      try {
        prev.removeAllListeners();
        prev.destroy({ destroyStore: false });
      } catch {}
      this.activeTorrents.delete(task.id);
    }

    // Save directory: if task.savePath is a file/folder path inside downloads dir, use its parent directory
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

    // Ensure no duplicate torrent in WebTorrent client before adding
    this.removeExistingClientTorrent(torrentSource, task.infoHash);

    try {
      task.status = 'connecting';
      task.protocol = 'torrent';
      onProgress(task);

      // Apply current speed limit to client
      if (typeof this.client.throttleDownload === 'function') {
        try {
          this.client.throttleDownload(this.speedLimitBytesPerSec > 0 ? this.speedLimitBytesPerSec : -1);
        } catch {}
      }

      const torrentOpts = {
        path: saveDir,
        announce: DEFAULT_PUBLIC_TRACKERS,
        strategy: 'rarest',
        maxWebConns: 16,
        storeCacheSlots: 128,
        uploads: 20,
      };

      const torrent = this.client.add(torrentSource, torrentOpts, (t: any) => {
        if (this.isStopped(task)) {
          try {
            t.removeAllListeners();
            t.destroy({ destroyStore: false });
          } catch {}
          this.activeTorrents.delete(task.id);
          return;
        }

        // Metadata resolved!
        task.status = 'downloading';
        task.fileName = t.name ? sanitizeFileName(t.name) : task.fileName;
        task.infoHash = t.infoHash;
        task.fileSize = t.length || task.fileSize;
        task.savePath = path.join(saveDir, task.fileName);
        task.peers = t.numPeers || 0;
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
        if (this.isStopped(task)) {
          return;
        }
        const now = Date.now();
        if (now - lastProgressBroadcast > 350) {
          lastProgressBroadcast = now;
          onProgress(task);
        }
      };

      torrent.on('wire', (wire: any) => {
        if (this.isStopped(task)) return;
        try {
          if (typeof wire.setTimeout === 'function') {
            wire.setTimeout(20000);
          }
        } catch {}
        task.peers = torrent.numPeers;
        throttleProgress();
      });

      torrent.on('download', () => {
        if (this.isStopped(task)) {
          return;
        }
        task.status = 'downloading';
        task.downloadedBytes = torrent.downloaded;
        const rawSpeed = torrent.downloadSpeed || 0;
        task.speed = this.speedLimitBytesPerSec > 0 ? Math.min(rawSpeed, this.speedLimitBytesPerSec) : rawSpeed;
        task.uploadSpeed = torrent.uploadSpeed || 0;
        task.peers = torrent.numPeers;
        task.progress = Math.min(100, Math.round((torrent.progress || 0) * 1000) / 10);
        const remainingBytes = Math.max(0, (torrent.length || task.fileSize || 0) - torrent.downloaded);
        task.eta = task.speed > 0 ? Math.round(remainingBytes / task.speed) : 0;
        throttleProgress();
      });

      torrent.on('upload', () => {
        if (this.isStopped(task)) {
          return;
        }
        task.uploadSpeed = torrent.uploadSpeed;
        task.uploadedBytes = torrent.uploaded;
        throttleProgress();
      });

      torrent.on('done', () => {
        if (this.isStopped(task)) {
          return;
        }
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
        if (this.isStopped(task)) {
          return;
        }
        task.status = 'error';
        task.errorMessage = err.message || 'Torrent download error';
        task.speed = 0;
        this.activeTorrents.delete(task.id);
        onError(err, task);
      });
    } catch (err: any) {
      if (this.isStopped(task)) {
        return;
      }
      task.status = 'error';
      task.errorMessage = err.message || 'Failed to add torrent';
      this.activeTorrents.delete(task.id);
      onError(err, task);
    }
  }

  public pauseTorrent(taskId: string, infoHash?: string): void {
    this.pausedTasks.add(taskId);
    const torrent = this.activeTorrents.get(taskId);
    if (torrent) {
      try {
        torrent.removeAllListeners('download');
        torrent.removeAllListeners('upload');
        torrent.removeAllListeners('done');
        torrent.removeAllListeners('error');
        if (Array.isArray(torrent.files)) {
          torrent.files.forEach((f: any) => {
            try { f.deselect(); } catch {}
          });
        }
        torrent.pause();
        // Destroy peer connections and remove from client while preserving downloaded files on disk
        torrent.destroy({ destroyStore: false });
      } catch {}
      this.activeTorrents.delete(taskId);
    }

    if (infoHash) {
      this.removeExistingClientTorrent(null, infoHash);
    }
  }

  public cancelTorrent(taskId: string, deleteFiles: boolean = false, infoHash?: string): void {
    this.pausedTasks.add(taskId);
    const torrent = this.activeTorrents.get(taskId);
    if (torrent) {
      try {
        torrent.removeAllListeners('download');
        torrent.removeAllListeners('upload');
        torrent.removeAllListeners('done');
        torrent.removeAllListeners('error');
        torrent.destroy({ destroyStore: deleteFiles });
      } catch {}
      this.activeTorrents.delete(taskId);
    } else if (infoHash && this.client && Array.isArray(this.client.torrents)) {
      for (const t of [...this.client.torrents]) {
        if (t.infoHash && t.infoHash.toLowerCase() === infoHash.toLowerCase()) {
          try {
            t.removeAllListeners();
            t.destroy({ destroyStore: deleteFiles });
          } catch {}
        }
      }
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
