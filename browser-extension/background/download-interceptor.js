/**
 * DLX Browser Extension — Automatic Normal-Download Interceptor (Phase 2 & Phase 7)
 *
 * Intercepts normal browser downloads (ZIP, EXE, PDF, ISO, .torrent, etc.)
 * and forwards them to the existing DLX Desktop Download Manager.
 */

import {
  sendToDlx,
  getExtensionSettings,
  detectBrowserName,
} from './native-client.js';

function extractBasename(rawPathOrUrl) {
  if (!rawPathOrUrl || typeof rawPathOrUrl !== 'string') return '';
  const normalized = rawPathOrUrl.replace(/\\/g, '/');
  const lastSegment = normalized.split('/').pop() || '';
  return lastSegment.split('?')[0].split('#')[0].trim();
}

function isInterceptableUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.trim().toLowerCase();
  if (
    lower.startsWith('blob:') ||
    lower.startsWith('data:') ||
    lower.startsWith('filesystem:') ||
    lower.startsWith('chrome:') ||
    lower.startsWith('chrome-extension:') ||
    lower.startsWith('edge:') ||
    lower.startsWith('about:')
  ) {
    return false;
  }
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('magnet:?');
}

export function setupDownloadInterceptor(notifyUserFn) {
  chrome.downloads.onCreated.addListener(async (downloadItem) => {
    try {
      // Only intercept newly starting in-progress downloads
      if (downloadItem.state && downloadItem.state !== 'in_progress') {
        return;
      }

      const targetUrl = downloadItem.finalUrl || downloadItem.url;
      if (!isInterceptableUrl(targetUrl)) {
        return;
      }

      // Check session cache so we never process the same downloadId twice
      const sessionKey = `intercepted_${downloadItem.id}`;
      const existing = await chrome.storage.session.get(sessionKey);
      if (existing && existing[sessionKey]) {
        return;
      }

      const settings = await getExtensionSettings();
      if (!settings.autoInterceptDownloads) {
        return;
      }

      await chrome.storage.session.set({ [sessionKey]: true });

      // Gather optional active tab info for source page context
      let sourcePageUrl = downloadItem.referrer || '';
      let sourcePageTitle = '';
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab) {
          if (!sourcePageUrl && activeTab.url && activeTab.url.startsWith('http')) {
            sourcePageUrl = activeTab.url;
          }
          if (activeTab.title) {
            sourcePageTitle = activeTab.title;
          }
        }
      } catch {}

      const detectedFilename =
        extractBasename(downloadItem.filename) || extractBasename(targetUrl) || undefined;
      const mimeType = downloadItem.mime || undefined;
      const fileSize =
        typeof downloadItem.totalBytes === 'number' && downloadItem.totalBytes > 0
          ? downloadItem.totalBytes
          : undefined;
      const isTorrent =
        targetUrl.toLowerCase().endsWith('.torrent') ||
        targetUrl.toLowerCase().includes('.torrent?') ||
        (mimeType && mimeType.toLowerCase().includes('bittorrent'));

      // Pause Chrome download briefly while checking DLX so we don't double-request bytes
      try {
        await chrome.downloads.pause(downloadItem.id);
      } catch {}

      const response = await sendToDlx({
        type: 'addDownload',
        url: targetUrl,
        filename: detectedFilename,
        mimeType,
        fileSize,
        referrer: downloadItem.referrer || sourcePageUrl || undefined,
        source: detectBrowserName(),
        sourcePageUrl: sourcePageUrl || undefined,
        sourcePageTitle: sourcePageTitle || undefined,
        mediaType: isTorrent ? 'torrent' : 'file',
        openModal: settings.askBeforeIntercepting !== false,
      });

      if (response && response.ok) {
        // DLX accepted the download (or opened duplicate/confirmation modal) -> cancel & erase browser download
        try {
          await chrome.downloads.cancel(downloadItem.id);
          await chrome.downloads.erase({ id: downloadItem.id });
        } catch {}

        if (response.promptedInApp) {
          const label = (response.task && response.task.fileName) || detectedFilename || 'Download';
          notifyUserFn(
            'Confirm Download in DLX',
            `Confirm file name, size, and save location for "${label}" in DLX.`
          );
        } else if (response.duplicate && response.task) {
          await sendToDlx({
            type: 'addDownload',
            url: targetUrl,
            filename: detectedFilename,
            openModal: true,
          });
          notifyUserFn(
            'Duplicate Download in DLX',
            `"${response.task.fileName}" already exists in DLX.`
          );
        } else {
          const label = (response.task && response.task.fileName) || detectedFilename || 'Download';
          notifyUserFn(
            isTorrent ? 'Torrent Sent to DLX' : 'Intercepted by DLX',
            `${label} added to DLX download queue.`
          );
        }
      } else {
        // DLX is closed or unreachable -> resume normal browser download so user's download isn't lost
        try {
          await chrome.downloads.resume(downloadItem.id);
        } catch {}
      }
    } catch (err) {
      try {
        await chrome.downloads.resume(downloadItem.id);
      } catch {}
    }
  });
}
