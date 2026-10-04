import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { AppSettings, DownloadTask } from '../engine/types';

export class PersistenceStore {
  private baseDir: string;
  private tasksFile: string;
  private settingsFile: string;

  constructor() {
    try {
      this.baseDir = app ? app.getPath('userData') : path.join(os.homedir(), '.dlx');
    } catch {
      this.baseDir = path.join(os.homedir(), '.dlx');
    }

    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch {}
    }

    this.tasksFile = path.join(this.baseDir, 'dlx_tasks.json');
    this.settingsFile = path.join(this.baseDir, 'dlx_settings.json');
  }

  public getSettings(): AppSettings {
    const defaultDownloads = path.join(os.homedir(), 'Downloads', 'DLX');
    const defaultSettings: AppSettings = {
      downloadDir: defaultDownloads,
      maxConcurrentDownloads: 3,
      defaultConnections: 8,
      speedLimitBytesPerSec: 0,
      enableNotifications: true,
      monitorClipboard: false,
      minimizeToTray: true,
      browserIntegrationEnabled: true,
      autoInterceptDownloads: true,
      showMediaDownloadButton: true,
      detectVideos: true,
      detectAudio: true,
      detectImages: true,
      askBeforeIntercepting: true,
    };

    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed._confirmPromptMigrated) {
          parsed.askBeforeIntercepting = true;
          parsed._confirmPromptMigrated = true;
          const merged = { ...defaultSettings, ...parsed };
          this.saveSettings(merged);
          return merged;
        }
        return { ...defaultSettings, ...parsed };
      }
    } catch {}

    const initial = { ...defaultSettings, _confirmPromptMigrated: true } as AppSettings;
    this.saveSettings(initial);
    return initial;
  }

  public saveSettings(settings: AppSettings): void {
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  public getTasks(): DownloadTask[] {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const raw = fs.readFileSync(this.tasksFile, 'utf-8');
        const tasks: DownloadTask[] = JSON.parse(raw);
        // Any task that was downloading when app closed becomes paused
        return tasks.map((t) => {
          if (t.status === 'downloading' || t.status === 'connecting') {
            return { ...t, status: 'paused', speed: 0, eta: 0 };
          }
          return t;
        });
      }
    } catch {}
    return [];
  }

  public saveTasks(tasks: DownloadTask[]): void {
    try {
      fs.writeFileSync(this.tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save tasks:', err);
    }
  }
}
