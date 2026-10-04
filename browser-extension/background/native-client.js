/**
 * DLX Browser Extension — Native Messaging & Local Bridge Client
 *
 * Architecture:
 *   Chrome / Edge Extension
 *          ↓
 *   Native Messaging Host (com.dlx.downloadmanager)
 *          ↓
 *   Electron Main Process (127.0.0.1:45789)
 *          ↓
 *   DLX DownloadManager & Existing Download Engine
 */

export const NATIVE_HOST_NAME = 'com.dlx.downloadmanager';
export const LOCAL_BRIDGE_URL = 'http://127.0.0.1:45789/api/bridge';

export const DEFAULT_EXTENSION_SETTINGS = {
  autoInterceptDownloads: true,
  showMediaDownloadButton: true,
  detectVideos: true,
  detectAudio: true,
  detectImages: true,
  askBeforeIntercepting: true,
};

export function detectBrowserName() {
  const ua = navigator.userAgent || '';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Brave')) return 'Brave';
  if (ua.includes('Vivaldi')) return 'Vivaldi';
  if (ua.includes('Chrome/')) return 'Chrome';
  return 'Browser';
}

/**
 * Send a message to DLX via Chrome Native Messaging (`chrome.runtime.sendNativeMessage`),
 * with automatic fallback to the local loopback bridge (`127.0.0.1:45789`) if the browser
 * profile hasn't reloaded the Windows Registry key yet.
 */
export async function sendToDlx(payload) {
  // 1. Primary: Chrome / Edge Native Messaging Host
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendNativeMessage === 'function') {
    try {
      const nativeResponse = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, payload);
      if (nativeResponse && typeof nativeResponse === 'object') {
        return nativeResponse;
      }
    } catch {
      // Fall through to local loopback bridge if Native Host isn't registered for this browser profile yet
    }
  }

  // 2. Fallback: Local loopback bridge (127.0.0.1:45789)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(LOCAL_BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DLX-Client': 'browser-extension',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    return data;
  } catch {
    return {
      ok: false,
      running: false,
      status: 'offline',
      error: 'DLX desktop application is not running.',
    };
  }
}

export async function sendHelloHandshake() {
  return await sendToDlx({
    type: 'hello',
    source: detectBrowserName(),
  });
}

export async function getDlxStatus() {
  const res = await sendToDlx({ type: 'getStatus' });
  if (res && res.ok && res.running) {
    if (res.settings) {
      await saveExtensionSettingsLocal(res.settings);
    }
    return res;
  }
  return {
    ok: false,
    running: false,
    status: 'offline',
  };
}

export async function getExtensionSettings() {
  const stored = await chrome.storage.local.get('dlxSettings');
  const localSettings = {
    ...DEFAULT_EXTENSION_SETTINGS,
    ...(stored.dlxSettings || {}),
  };
  return localSettings;
}

export async function saveExtensionSettingsLocal(settings) {
  const current = await getExtensionSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ dlxSettings: merged });
  return merged;
}

export async function updateDlxSettings(partialSettings) {
  const merged = await saveExtensionSettingsLocal(partialSettings);
  await sendToDlx({
    type: 'updateSettings',
    settings: merged,
  });
  return merged;
}

export async function checkDlxDuplicate(url) {
  return await sendToDlx({
    type: 'checkDuplicate',
    url,
  });
}

export async function openDlxApplication() {
  return await sendToDlx({
    type: 'openApplication',
  });
}

export async function openExistingDlxTask(taskId, openFile = true) {
  return await sendToDlx({
    type: 'openExistingTask',
    taskId,
    openFile,
  });
}
