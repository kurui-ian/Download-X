import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, clipboard } from 'electron';
import path from 'path';
import { DownloadManager } from './manager/DownloadManager';
import { PersistenceStore } from './manager/store';
import { inspectUrl } from './engine/inspector';
import { AppSettings } from './engine/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const store = new PersistenceStore();
const downloadManager = new DownloadManager(store);

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

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 850,
    minHeight: 550,
    backgroundColor: '#020617',
    frame: true, // Native titlebar with dark controls
    title: 'DLX - Download Manager',
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
  // Simple transparent 16x16 tray icon representation or native icon
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAUg34//8/AxZ16OpBhkJ1kGwDG2bEph5ZPTYd+PQT7GY8NuF1IyH1hDCpGvAaAONyDAlKkhsJmY5sLsbGJsikwWBk2ICQerLciM+NsNzApx8Z4xMHAODjIhVz9/7yAAAAAElFTkSuQmCC',
      'base64'
    )
  );

  tray = new Tray(icon);
  tray.setToolTip('DLX - Download Xcelerator');

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

  ipcMain.handle('url:inspect', async (_e, url: string) => {
    return await inspectUrl(url);
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

  ipcMain.handle('settings:get', () => {
    return store.getSettings();
  });

  ipcMain.handle('settings:save', (_e, newSettings: AppSettings) => {
    store.saveSettings(newSettings);
    return true;
  });

  ipcMain.handle('clipboard:read', () => {
    return clipboard.readText();
  });
}

app.whenReady().then(() => {
  setupIpc();
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
  downloadManager.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
