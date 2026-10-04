/**
 * DLX Browser Extension — Popup Controller (Phase 5, 10, 11, 14)
 */

const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const openDlxBtn = document.getElementById('openDlxBtn');
const offlineBanner = document.getElementById('offlineBanner');
const launchDlxBannerBtn = document.getElementById('launchDlxBannerBtn');

const tabMediaBtn = document.getElementById('tabMediaBtn');
const tabSettingsBtn = document.getElementById('tabSettingsBtn');
const mediaCountBadge = document.getElementById('mediaCountBadge');

const viewMedia = document.getElementById('viewMedia');
const viewSettings = document.getElementById('viewSettings');

const mediaSummaryBar = document.getElementById('mediaSummaryBar');
const mediaSummaryText = document.getElementById('mediaSummaryText');
const rescanBtn = document.getElementById('rescanBtn');
const mediaListContainer = document.getElementById('mediaListContainer');

const quickUrlForm = document.getElementById('quickUrlForm');
const quickUrlInput = document.getElementById('quickUrlInput');

const settingsConnDot = document.getElementById('settingsConnDot');
const settingsConnText = document.getElementById('settingsConnText');

const toggleAutoIntercept = document.getElementById('toggleAutoIntercept');
const toggleShowButton = document.getElementById('toggleShowButton');
const toggleDetectVideos = document.getElementById('toggleDetectVideos');
const toggleDetectAudio = document.getElementById('toggleDetectAudio');
const toggleDetectImages = document.getElementById('toggleDetectImages');
const toggleAskBefore = document.getElementById('toggleAskBefore');

let currentTab = null;
let detectedItems = [];
let selectedOptionByItemId = new Map();
let duplicateByItemId = new Map();

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getKindIconAndLabel(mediaType) {
  switch (mediaType) {
    case 'video':
      return { icon: '🎬', label: 'Video' };
    case 'audio':
      return { icon: '🎵', label: 'Audio' };
    case 'image':
      return { icon: '🖼', label: 'Image' };
    case 'torrent':
      return { icon: '🧲', label: 'Torrent' };
    default:
      return { icon: '📦', label: 'File' };
  }
}

function getAllOptionsForItem(item) {
  return [
    ...(item.videoOptions || []),
    ...(item.audioOptions || []),
    ...(item.imageOptions || []),
    ...(item.thumbnailOptions || []),
  ];
}

function renderMediaList() {
  mediaListContainer.innerHTML = '';
  mediaCountBadge.textContent = String(detectedItems.length);
  mediaSummaryBar.classList.remove('hidden');

  if (detectedItems.length === 0) {
    mediaSummaryText.textContent = '0 media items detected';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-icon">↓</div>
      <div class="empty-title">No media detected on this page</div>
      <div style="margin-bottom: 10px;">Play a video, view an image, or click Refresh to scan again.</div>
      <button id="emptyScanBtn" type="button" class="small-action-btn" style="margin: 0 auto;">↻ Scan Page Now</button>
    `;
    mediaListContainer.appendChild(empty);
    const emptyScanBtn = empty.querySelector('#emptyScanBtn');
    if (emptyScanBtn) {
      emptyScanBtn.addEventListener('click', () => triggerRescan());
    }
    return;
  }

  const videoCount = detectedItems.filter((i) => i.mediaType === 'video').length;
  const imageCount = detectedItems.filter((i) => i.mediaType === 'image').length;
  const summaryParts = [];
  if (videoCount > 0) summaryParts.push(`${videoCount} video${videoCount > 1 ? 's' : ''}`);
  if (imageCount > 0) summaryParts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);

  mediaSummaryText.textContent =
    summaryParts.length > 0
      ? `Detected: ${summaryParts.join(', ')}`
      : detectedItems.length === 1
      ? '1 media item detected'
      : `${detectedItems.length} media items detected`;

  for (const item of detectedItems) {
    const card = document.createElement('div');
    card.className = 'media-card';

    const { icon, label } = getKindIconAndLabel(item.mediaType);
    const options = getAllOptionsForItem(item);

    if (!selectedOptionByItemId.has(item.id) && options.length > 0) {
      selectedOptionByItemId.set(item.id, options[0]);
    }
    const currentOpt = selectedOptionByItemId.get(item.id) || null;

    // Top row: Kind badge + resolution/format summary
    const topRow = document.createElement('div');
    topRow.className = 'media-card-top';

    const badge = document.createElement('span');
    badge.className = 'media-kind-badge';
    badge.textContent = `${icon} ${label}`;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'media-meta-line';
    const metaTokens = [];
    if (item.duration) metaTokens.push(item.duration);
    if (item.resolution) metaTokens.push(item.resolution);
    if (item.format) metaTokens.push(item.format);
    const sizeToUse = (currentOpt && currentOpt.fileSize) || item.fileSize;
    if (sizeToUse > 0) metaTokens.push(formatBytes(sizeToUse));
    metaSpan.textContent = metaTokens.join(' • ');

    topRow.appendChild(badge);
    topRow.appendChild(metaSpan);
    card.appendChild(topRow);

    // Title
    const titleDiv = document.createElement('div');
    titleDiv.className = 'media-item-title';
    titleDiv.textContent = item.title || item.filename || 'Media Resource';
    card.appendChild(titleDiv);

    // Protected notice if DRM/protected
    if (item.protected) {
      const protDiv = document.createElement('div');
      protDiv.className = 'protected-note';
      protDiv.textContent =
        item.protectedMessage || 'This media is protected or unavailable for download.';
      card.appendChild(protDiv);
    }

    // Quality / Format pills if accessible options exist
    if (options.length > 0) {
      const pillsWrap = document.createElement('div');
      pillsWrap.className = 'quality-pills';

      for (const opt of options) {
        const pill = document.createElement('button');
        pill.type = 'button';
        const isSel = currentOpt && currentOpt.url === opt.url;
        pill.className = `quality-pill ${isSel ? 'selected' : ''}`;

        const qText = opt.label
          ? opt.quality && !opt.quality.includes(opt.label)
            ? `${opt.label} (${opt.quality})`
            : opt.quality || opt.label
          : opt.quality || 'Original';
        const fText = opt.format ? ` ${opt.format}` : '';
        pill.textContent = `${qText}${fText}`;

        pill.addEventListener('click', () => {
          selectedOptionByItemId.set(item.id, opt);
          duplicateByItemId.delete(item.id);
          renderMediaList();
        });

        pillsWrap.appendChild(pill);
      }

      card.appendChild(pillsWrap);
    }

    // Duplicate prompt if duplicate was detected for this item
    const dupInfo = duplicateByItemId.get(item.id);
    if (dupInfo && dupInfo.task) {
      const dupBox = document.createElement('div');
      dupBox.className = 'dup-box';
      dupBox.innerHTML = `
        <div><strong>Download already exists</strong></div>
        <div style="font-size:10px;opacity:0.8;">${dupInfo.task.fileName} (${dupInfo.task.status})</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'dup-actions';

      const openExistingBtn = document.createElement('button');
      openExistingBtn.type = 'button';
      openExistingBtn.className = 'dup-btn primary';
      openExistingBtn.textContent = 'Open Existing';
      openExistingBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({
          type: 'dlx:open-existing',
          taskId: dupInfo.task.id,
          openFile: dupInfo.task.status === 'completed',
        });
        window.close();
      });

      const downloadAnywayBtn = document.createElement('button');
      downloadAnywayBtn.type = 'button';
      downloadAnywayBtn.className = 'dup-btn';
      downloadAnywayBtn.textContent = 'Download Anyway';
      downloadAnywayBtn.addEventListener('click', async () => {
        duplicateByItemId.delete(item.id);
        await sendItemToDlx(item, currentOpt, true);
      });

      actions.appendChild(openExistingBtn);
      actions.appendChild(downloadAnywayBtn);
      dupBox.appendChild(actions);
      card.appendChild(dupBox);
    } else if (currentOpt || (!item.protected && item.url)) {
      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'download-btn';

      if (item.mediaType === 'torrent') {
        dlBtn.textContent = 'Open with DLX';
      } else if (options.length === 1 && currentOpt && currentOpt.quality && currentOpt.quality !== 'Original') {
        dlBtn.textContent = `Download ${currentOpt.quality}`;
      } else if (currentOpt && currentOpt.kind === 'image' && item.mediaType === 'video') {
        dlBtn.textContent = 'Download Image';
      } else {
        dlBtn.textContent = 'Download';
      }

      dlBtn.addEventListener('click', async () => {
        await sendItemToDlx(item, currentOpt, false, dlBtn);
      });

      card.appendChild(dlBtn);
    }

    mediaListContainer.appendChild(card);
  }
}

async function sendItemToDlx(item, opt, forceRedownload = false, btnEl = null) {
  const targetUrl = (opt && opt.url) || item.url;
  if (!targetUrl) return;

  if (btnEl) {
    btnEl.textContent = 'Sending to DLX...';
    btnEl.disabled = true;
  }

  const format = ((opt && opt.format) || item.format || 'mp4').toLowerCase();
  const ext =
    format === 'jpeg'
      ? 'jpg'
      : ['m3u8', 'hls', 'php', 'html', 'ts'].includes(format)
      ? 'mp4'
      : format;
  const safeStem = (item.title || 'download')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const filename = item.mediaType === 'torrent' ? undefined : `${safeStem}.${ext}`;

  const res = await chrome.runtime.sendMessage({
    type: 'dlx:send-download',
    payload: {
      type: item.mediaType === 'torrent' ? 'addDownload' : 'addMediaDownload',
      url: targetUrl,
      filename,
      mimeType: (opt && opt.mimeType) || item.mimeType,
      quality: (opt && opt.quality) || item.resolution,
      fileSize: (opt && opt.fileSize) || item.fileSize,
      mediaType: (opt && opt.kind) || item.mediaType,
      referrer: item.sourcePageUrl || (currentTab ? currentTab.url : undefined),
      sourcePageUrl: currentTab ? currentTab.url : item.sourcePageUrl,
      sourcePageTitle: currentTab ? currentTab.title : item.sourcePageTitle,
      forceRedownload,
    },
  });

  if (!res || !res.ok) {
    updateConnectionUi(false);
    if (btnEl) {
      btnEl.textContent = 'DLX Offline';
      btnEl.disabled = false;
    }
    return;
  }

  if (res.duplicate && res.task && !forceRedownload) {
    duplicateByItemId.set(item.id, res);
    renderMediaList();
    return;
  }

  if (btnEl) {
    btnEl.textContent = res.promptedInApp ? '✓ Confirm in DLX' : '✓ Sent to DLX';
    setTimeout(() => {
      if (btnEl) {
        btnEl.textContent = 'Download';
        btnEl.disabled = false;
      }
    }, 1500);
  } else {
    renderMediaList();
  }
}

function updateConnectionUi(isRunning) {
  if (isRunning) {
    statusBadge.classList.remove('offline');
    statusBadge.classList.add('online');
    statusText.textContent = 'Connected';
    offlineBanner.classList.add('hidden');
    settingsConnDot.style.background = 'var(--text)';
    settingsConnText.textContent = 'DLX is running';
  } else {
    statusBadge.classList.remove('online');
    statusBadge.classList.add('offline');
    statusText.textContent = 'Offline';
    offlineBanner.classList.remove('hidden');
    settingsConnDot.style.background = 'var(--text-muted)';
    settingsConnText.textContent = 'DLX is not running';
  }
}

function applySettingsToToggles(s) {
  if (!s) return;
  toggleAutoIntercept.checked = s.autoInterceptDownloads !== false;
  toggleShowButton.checked = s.showMediaDownloadButton !== false;
  toggleDetectVideos.checked = s.detectVideos !== false;
  toggleDetectAudio.checked = s.detectAudio !== false;
  toggleDetectImages.checked = s.detectImages !== false;
  toggleAskBefore.checked = s.askBeforeIntercepting !== false;
}

async function saveToggleChanges() {
  const newSettings = {
    autoInterceptDownloads: toggleAutoIntercept.checked,
    showMediaDownloadButton: toggleShowButton.checked,
    detectVideos: toggleDetectVideos.checked,
    detectAudio: toggleDetectAudio.checked,
    detectImages: toggleDetectImages.checked,
    askBeforeIntercepting: toggleAskBefore.checked,
  };
  await chrome.runtime.sendMessage({
    type: 'dlx:update-settings',
    settings: newSettings,
  });
}

// Event Listeners
tabMediaBtn.addEventListener('click', () => {
  tabMediaBtn.classList.add('active');
  tabSettingsBtn.classList.remove('active');
  viewMedia.classList.remove('hidden');
  viewSettings.classList.add('hidden');
});

tabSettingsBtn.addEventListener('click', () => {
  tabSettingsBtn.classList.add('active');
  tabMediaBtn.classList.remove('active');
  viewSettings.classList.remove('hidden');
  viewMedia.classList.add('hidden');
});

openDlxBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'dlx:open-app' });
  if (res && res.ok) updateConnectionUi(true);
});

launchDlxBannerBtn.addEventListener('click', async () => {
  launchDlxBannerBtn.textContent = 'Starting...';
  const res = await chrome.runtime.sendMessage({ type: 'dlx:open-app' });
  if (res && res.ok) {
    updateConnectionUi(true);
  }
  launchDlxBannerBtn.textContent = 'Open DLX';
});

async function triggerRescan(silent = false) {
  if (!currentTab || typeof currentTab.id !== 'number') return;

  if (!silent) {
    rescanBtn.disabled = true;
    rescanBtn.textContent = 'Scanning...';
    const emptyScanBtn = document.getElementById('emptyScanBtn');
    if (emptyScanBtn) {
      emptyScanBtn.disabled = true;
      emptyScanBtn.textContent = 'Scanning page...';
    }
  }

  try {
    const mediaRes = await chrome.runtime.sendMessage({
      type: 'dlx:rescan-tab',
      tabId: currentTab.id,
    });
    if (mediaRes && Array.isArray(mediaRes.items)) {
      detectedItems = mediaRes.items;
      renderMediaList();
    }
  } catch {
    // Ignore tab errors on restricted chrome:// pages
  }

  if (!silent) {
    rescanBtn.textContent = '✓ Refreshed';
    setTimeout(() => {
      rescanBtn.textContent = '↻ Refresh';
      rescanBtn.disabled = false;
    }, 1000);
  }
}

rescanBtn.addEventListener('click', () => {
  triggerRescan(false);
});

quickUrlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rawUrl = quickUrlInput.value.trim();
  if (!rawUrl) return;

  const isTorrent =
    rawUrl.toLowerCase().startsWith('magnet:?') ||
    rawUrl.toLowerCase().endsWith('.torrent') ||
    rawUrl.toLowerCase().includes('.torrent?');

  const res = await chrome.runtime.sendMessage({
    type: 'dlx:send-download',
    payload: {
      type: 'addDownload',
      url: rawUrl,
      mediaType: isTorrent ? 'torrent' : 'file',
      sourcePageUrl: currentTab ? currentTab.url : undefined,
      sourcePageTitle: currentTab ? currentTab.title : undefined,
    },
  });

  if (res && res.ok) {
    quickUrlInput.value = '';
    quickUrlInput.placeholder = '✓ Sent to DLX!';
    setTimeout(() => {
      quickUrlInput.placeholder = 'Paste URL, .torrent, or magnet:? link...';
    }, 1800);
  } else {
    updateConnectionUi(false);
  }
});

for (const input of [
  toggleAutoIntercept,
  toggleShowButton,
  toggleDetectVideos,
  toggleDetectAudio,
  toggleDetectImages,
  toggleAskBefore,
]) {
  input.addEventListener('change', saveToggleChanges);
}

// Initialize Popup
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab || null;

    const statusRes = await chrome.runtime.sendMessage({ type: 'dlx:get-status' });
    updateConnectionUi(Boolean(statusRes && statusRes.running));
    if (statusRes && statusRes.settings) {
      applySettingsToToggles(statusRes.settings);
    }

    if (currentTab && typeof currentTab.id === 'number') {
      const mediaRes = await chrome.runtime.sendMessage({
        type: 'dlx:get-tab-media',
        tabId: currentTab.id,
      });
      if (mediaRes && Array.isArray(mediaRes.items)) {
        detectedItems = mediaRes.items;
      }
      renderMediaList();
      // Also run a fresh scan across all frames + network resources when popup opens
      await triggerRescan(true);
    } else {
      renderMediaList();
    }
  } catch {
    updateConnectionUi(false);
    renderMediaList();
  }
})();
