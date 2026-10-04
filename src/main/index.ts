import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, clipboard, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { DownloadManager } from './manager/DownloadManager';
import { PersistenceStore } from './manager/store';
import { inspectUrl } from './engine/inspector';
import { AppSettings } from './engine/types';
import { NativeBridgeServer } from './bridge/NativeBridgeServer';
import { NativeHostRegistrar } from './bridge/NativeHostRegistrar';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const store = new PersistenceStore();
const downloadManager = new DownloadManager(store);
const bridgeServer = new NativeBridgeServer(downloadManager, store, () => mainWindow);

// Prevent transient TLS/socket resets from triggering Electron's fatal error dialog
process.on('uncaughtException', (err) => {
  console.warn('[DLX Main] Ignored uncaught exception:', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[DLX Main] Ignored unhandled rejection:', reason?.message || reason);
});

if (process.platform === 'win32') {
  app.setAppUserModelId('com.dlx.manager');
}

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../build/icon.ico'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../dist/icon.ico'),
    path.join(__dirname, '../../dist/icon.png'),
    path.join(app.getAppPath(), 'build/icon.ico'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.png'),
    path.join(app.getAppPath(), 'public/icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function createMainWindow() {
  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 850,
    minHeight: 550,
    backgroundColor: '#020617',
    frame: true, // Native titlebar with dark controls
    title: 'DLX - Download Manager',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  downloadManager.setMainWindow(mainWindow);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Production: load bundled index.html
    const indexPath = path.join(__dirname, '../../dist/index.html');
    mainWindow.loadFile(indexPath).catch(() => {
      // Fallback relative path depending on packaging directory structure
      mainWindow?.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
    });
  }

  mainWindow.on('close', (event) => {
    const settings = store.getSettings();
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    downloadManager.broadcastTasks();
  });

  // Enable native right-click context menu for inputs (Cut/Copy/Paste/Select All)
  mainWindow.webContents.on('context-menu', (_e, props) => {
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [];
    if (props.isEditable) {
      menuTemplate.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      );
    } else if (props.selectionText && props.selectionText.trim().length > 0) {
      menuTemplate.push({ role: 'copy' }, { role: 'selectAll' });
    }

    if (menuTemplate.length > 0) {
      Menu.buildFromTemplate(menuTemplate).popup();
    }
  });
}

function createTray() {
  const iconPath = getAppIconPath();
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  } else {
    icon = nativeImage.createFromBuffer(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAUg34//8/AxZ16OpBhkJ1kGwDG2bEph5ZPTYd+PQT7GY8NuF1IyH1hDCpGvAaAONyDAlKkhsJmY5sLsbGJsikwWBk2ICQerLciM+NsNzApx8Z4xMHAODjIhVz9/7yAAAAAElFTkSuQmCC',
        'base64'
      )
    );
  }

  tray = new Tray(icon);
  tray.setToolTip('DLX - Download Manager');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open DLX',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Resume All',
      click: () => downloadManager.resumeAll(),
    },
    {
      label: 'Pause All',
      click: () => downloadManager.pauseAll(),
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// IPC Handlers
function setupIpc() {
  ipcMain.handle('tasks:get', () => downloadManager.getTasks());

  ipcMain.handle('tasks:check-duplicate', (_e, url: string) => {
    return downloadManager.findDuplicate(url);
  });

  ipcMain.handle('tasks:add', async (_e, params) => {
    return await downloadManager.addDownload(params);
  });

  ipcMain.handle('tasks:pause', (_e, id: string) => {
    downloadManager.pauseDownload(id);
    return true;
  });

  ipcMain.handle('tasks:resume', (_e, id: string) => {
    downloadManager.resumeDownload(id);
    return true;
  });

  ipcMain.handle('tasks:cancel', (_e, id: string, deleteFile: boolean) => {
    downloadManager.cancelDownload(id, deleteFile);
    return true;
  });

  ipcMain.handle('tasks:delete', (_e, id: string, deleteFile: boolean) => {
    downloadManager.deleteTask(id, deleteFile);
    return true;
  });

  ipcMain.handle('tasks:pause-all', () => {
    downloadManager.pauseAll();
    return true;
  });

  ipcMain.handle('tasks:resume-all', () => {
    downloadManager.resumeAll();
    return true;
  });

  ipcMain.handle('tasks:clear-completed', () => {
    downloadManager.clearCompleted();
    return true;
  });

  ipcMain.handle('tasks:open-file', async (_e, id: string) => {
    return await downloadManager.openFile(id);
  });

  ipcMain.handle('tasks:open-folder', (_e, id: string) => {
    downloadManager.openFolder(id);
    return true;
  });

  ipcMain.handle('url:inspect', async (_e, url: string, referrer?: string) => {
    return await inspectUrl(url, 8, referrer);
  });

  ipcMain.handle('dialog:select-dir', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Destination Folder',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('dialog:select-torrent-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'BitTorrent Files (*.torrent)', extensions: ['torrent'] }],
      title: 'Select .torrent File',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('settings:get', () => {
    return store.getSettings();
  });

  ipcMain.handle('settings:save', (_e, newSettings: AppSettings) => {
    store.saveSettings(newSettings);
    downloadManager.applySpeedLimit(newSettings.speedLimitBytesPerSec || 0);
    return true;
  });

  ipcMain.handle('clipboard:read', () => {
    return clipboard.readText();
  });

  ipcMain.handle('app:get-file-thumbnail', async (_e, filePath: string) => {
    try {
      if (!filePath) return null;
      let targetFile = filePath;

      if (!fs.existsSync(targetFile)) return null;

      const stat = await fs.promises.stat(targetFile);
      if (stat.isDirectory()) {
        const entries = await fs.promises.readdir(targetFile);
        const mediaFile = entries.find((f) => {
          const ext = path.extname(f).toLowerCase();
          return ['.mp4', '.mkv', '.avi', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.mp3', '.gif'].includes(ext);
        });
        if (mediaFile) {
          targetFile = path.join(targetFile, mediaFile);
        } else {
          return null;
        }
      }

      // Try native Windows thumbnail extraction (video frame, cover art, image)
      try {
        if (typeof nativeImage.createThumbnailFromPath === 'function') {
          const thumb = await nativeImage.createThumbnailFromPath(targetFile, { width: 160, height: 160 });
          if (thumb && !thumb.isEmpty()) {
            return thumb.toDataURL();
          }
        }
      } catch {
        // Fallback to direct read
      }

      // Direct read for standard image formats
      const ext = path.extname(targetFile).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico'].includes(ext)) {
        const fileStat = await fs.promises.stat(targetFile);
        if (fileStat.size < 15 * 1024 * 1024) {
          const buf = await fs.promises.readFile(targetFile);
          const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }

      return null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('app:set-theme', (_e, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme;
    if (mainWindow) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff');
    }
    return true;
  });

  ipcMain.handle('bridge:status', () => {
    return NativeHostRegistrar.getStatus();
  });

  ipcMain.handle('bridge:register-host', async (_e, customExtId?: string) => {
    return await NativeHostRegistrar.ensureRegistered(customExtId ? [customExtId.trim()] : []);
  });
}

app.whenReady().then(() => {
  setupIpc();
  bridgeServer.start();
  NativeHostRegistrar.ensureRegistered().catch((err) => {
    console.warn('Native host registration warning:', err);
  });
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  bridgeServer.stop();
  downloadManager.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
