/**
 * DLX Browser Extension — Manifest V3 Service Worker
 *
 * Responsibilities:
 * 1. Phase 1: Native Messaging & Local Bridge handshake ("Hello DLX")
 * 2. Phase 2: Automatic normal-download interception
 * 3. Phase 3: Right-click context menus ("Download with DLX", "Download Image with DLX", "Download Media with DLX")
 * 4. Phase 4: Passive response header inspection (MIME type & file size) for media resources
 * 5. Message routing between content scripts, popup, and DLX Desktop
 */

import {
  sendToDlx,
  sendHelloHandshake,
  getDlxStatus,
  getExtensionSettings,
  updateDlxSettings,
  checkDlxDuplicate,
  openDlxApplication,
  openExistingDlxTask,
  detectBrowserName,
} from './native-client.js';
import { setupDownloadInterceptor } from './download-interceptor.js';

// Helper: Show system notification + optional in-page toast
async function notifyUser(title, message, tabId, toastType = 'info', extraData = null) {
  if (typeof tabId === 'number' && tabId >= 0) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'dlx:show-toast',
        title,
        message,
        toastType,
        extraData,
      });
    } catch {}
  }

  try {
    const iconUrl = chrome.runtime.getURL('icons/icon-128.png');
    await chrome.notifications.create(`dlx-notif-${Date.now()}`, {
      type: 'basic',
      iconUrl,
      title,
      message,
    });
  } catch {}
}

// Create Context Menus (Phase 3)
async function registerContextMenus() {
  try {
    await chrome.contextMenus.removeAll();
  } catch {}

  chrome.contextMenus.create({
    id: 'dlx-download-link',
    title: 'Download with DLX',
    contexts: ['link'],
  });

  chrome.contextMenus.create({
    id: 'dlx-download-image',
    title: 'Download Image with DLX',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'dlx-download-media',
    title: 'Download Media with DLX',
    contexts: ['video', 'audio'],
  });
}

async function injectContentScriptsIntoOpenTabs() {
  if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') return;
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const t of tabs) {
      if (typeof t.id === 'number') {
        chrome.scripting
          .executeScript({
            target: { tabId: t.id, allFrames: true },
            files: ['content/page-hook.js'],
            world: 'MAIN',
          })
          .catch(() => {});
        chrome.scripting
          .executeScript({
            target: { tabId: t.id, allFrames: true },
            files: ['content/media-detector.js', 'content/media-overlay.js'],
          })
          .catch(() => {});
      }
    }
  } catch {}
}

// Initialize on install & startup
chrome.runtime.onInstalled.addListener(async () => {
  await registerContextMenus();
  await chrome.action.setBadgeBackgroundColor({ color: '#09090b' });
  await sendHelloHandshake();
  await injectContentScriptsIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await registerContextMenus();
  await chrome.action.setBadgeBackgroundColor({ color: '#09090b' });
  await sendHelloHandshake();
  await injectContentScriptsIntoOpenTabs();
});

// Phase 2: Setup automatic normal-download interception
setupDownloadInterceptor((title, message) => {
  notifyUser(title, message);
});

// Phase 3: Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : undefined;
  const pageUrl = (tab && tab.url) || info.pageUrl || '';
  const pageTitle = (tab && tab.title) || '';
  const browserName = detectBrowserName();

  if (info.menuItemId === 'dlx-download-link') {
    const linkUrl = info.linkUrl || '';
    if (!linkUrl) return;

    const isTorrent =
      linkUrl.toLowerCase().startsWith('magnet:?') ||
      linkUrl.toLowerCase().endsWith('.torrent') ||
      linkUrl.toLowerCase().includes('.torrent?');

    if (
      !isTorrent &&
      !linkUrl.startsWith('http://') &&
      !linkUrl.startsWith('https://')
    ) {
      await notifyUser(
        'Cannot Download Link',
        'This link does not point to a downloadable HTTP or Torrent resource.',
        tabId,
        'error'
      );
      return;
    }

    const res = await sendToDlx({
      type: 'addDownload',
      url: linkUrl,
      referrer: pageUrl || undefined,
      source: browserName,
      sourcePageUrl: pageUrl || undefined,
      sourcePageTitle: pageTitle || undefined,
      mediaType: isTorrent ? 'torrent' : 'file',
    });

    await handleDlxActionResponse(res, linkUrl, tabId, isTorrent ? 'Torrent' : 'Link');
    return;
  }

  if (info.menuItemId === 'dlx-download-image') {
    const srcUrl = info.srcUrl || '';
    if (!srcUrl || srcUrl.startsWith('data:') || srcUrl.startsWith('blob:')) {
      await notifyUser(
        'Image Unavailable',
        'This media is protected or unavailable for download.',
        tabId,
        'error'
      );
      return;
    }

    // Query content script for any higher-res / metadata on this image
    let meta = null;
    if (tabId !== undefined) {
      try {
        meta = await chrome.tabs.sendMessage(tabId, {
          type: 'dlx:lookup-element-by-src',
          srcUrl,
        });
      } catch {}
    }

    const res = await sendToDlx({
      type: 'addMediaDownload',
      url: srcUrl,
      filename: (meta && meta.filename) || undefined,
      mimeType: (meta && meta.mimeType) || undefined,
      quality: (meta && meta.resolution) || undefined,
      fileSize: (meta && meta.fileSize) || undefined,
      referrer: pageUrl || undefined,
      source: browserName,
      sourcePageUrl: pageUrl || undefined,
      sourcePageTitle: pageTitle || undefined,
      mediaType: 'image',
    });

    await handleDlxActionResponse(res, srcUrl, tabId, 'Image');
    return;
  }

  if (info.menuItemId === 'dlx-download-media') {
    let srcUrl = info.srcUrl || '';
    let meta = null;

    if (tabId !== undefined) {
      try {
        meta = await chrome.tabs.sendMessage(tabId, {
          type: 'dlx:lookup-element-by-src',
          srcUrl,
        });
      } catch {}

      if (!meta || !meta.bestUrl || srcUrl.startsWith('blob:')) {
        try {
          const mergedItems = await ensureScriptsAndRescanTab(tabId);
          const candidate = mergedItems.find(
            (it) =>
              (it.mediaType === 'video' || it.mediaType === 'audio') &&
              !it.protected &&
              it.url &&
              !it.url.startsWith('blob:')
          );
          if (candidate) {
            meta = {
              filename: candidate.filename,
              mimeType: candidate.mimeType,
              quality: candidate.resolution,
              fileSize: candidate.fileSize,
              protected: false,
              bestUrl: candidate.url,
            };
          }
        } catch {}
      }
    }

    if (meta && meta.protected) {
      await notifyUser(
        'Protected Media',
        'This media is protected or unavailable for download.',
        tabId,
        'error'
      );
      return;
    }

    if ((!srcUrl || srcUrl.startsWith('blob:')) && meta && meta.bestUrl) {
      srcUrl = meta.bestUrl;
    }

    if (!srcUrl || srcUrl.startsWith('blob:') || srcUrl.startsWith('data:')) {
      await notifyUser(
        'Protected or Unavailable Media',
        'Start playing the video first so DLX can detect the stream.',
        tabId,
        'error'
      );
      return;
    }

    const mediaKind = info.mediaType === 'audio' ? 'audio' : 'video';
    const res = await sendToDlx({
      type: 'addMediaDownload',
      url: srcUrl,
      filename: (meta && meta.filename) || undefined,
      mimeType: (meta && meta.mimeType) || undefined,
      quality: (meta && meta.quality) || undefined,
      fileSize: (meta && meta.fileSize) || undefined,
      referrer: pageUrl || undefined,
      source: browserName,
      sourcePageUrl: pageUrl || undefined,
      sourcePageTitle: pageTitle || undefined,
      mediaType: mediaKind,
    });

    await handleDlxActionResponse(res, srcUrl, tabId, 'Media');
  }
});

async function handleDlxActionResponse(res, targetUrl, tabId, labelPrefix) {
  if (!res || !res.ok) {
    const errMsg =
      res && res.running === false
        ? 'DLX is not running. Please open the DLX desktop application.'
        : (res && res.error) || 'Could not communicate with DLX.';
    await notifyUser('DLX Offline', errMsg, tabId, 'error', { offline: true });
    return;
  }

  if (res.duplicate && res.task) {
    await notifyUser(
      'Download Already Exists',
      `"${res.task.fileName}" is already in DLX.`,
      tabId,
      'duplicate',
      {
        duplicate: true,
        task: res.task,
        url: targetUrl,
      }
    );
    return;
  }

  if (res.promptedInApp) {
    const fileName = (res.task && res.task.fileName) || labelPrefix;
    await notifyUser(
      'Confirm Download in DLX',
      `Review file name, size & save location for "${fileName}" in DLX.`,
      tabId,
      'info'
    );
    return;
  }

  const fileName = (res.task && res.task.fileName) || labelPrefix;
  await notifyUser('Sent to DLX', `Downloading "${fileName}" in DLX.`, tabId, 'success');
}

const GENERIC_TITLES_SW = new Set([
  'play', 'player', 'embed', 'watch', 'index', 'iframe', 'video', 'audio',
  'stream', 'playback', 'videoplayback', 'master', 'playlist', 'manifest',
  'source', 'api', 'media', 'default', 'blank', 'about:blank', 'media item',
]);

function isGenericSwTitle(str) {
  if (!str) return true;
  const clean = str.trim().toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, '');
  if (clean.length <= 2) return true;
  if (/^\d+$/.test(clean)) return true;
  return GENERIC_TITLES_SW.has(clean);
}

// Helper: Infer media type & format from URL and Content-Type
function classifyMediaNetworkResource(urlStr, contentType = '', requestType = '', contentRangeTotal = 0) {
  const lowerUrl = (urlStr || '').toLowerCase();
  const mime = (contentType || '').toLowerCase();

  // Skip DASH manifests and small segment chunks
  if (
    lowerUrl.includes('.mpd') ||
    lowerUrl.includes('.m4s') ||
    lowerUrl.includes('bytestart=') ||
    lowerUrl.includes('/frag(') ||
    lowerUrl.includes('segment-') ||
    lowerUrl.includes('chunk-') ||
    lowerUrl.includes('/seg-')
  ) {
    return null;
  }

  let pathname = '';
  try {
    pathname = new URL(urlStr).pathname.toLowerCase();
  } catch {
    pathname = lowerUrl.split('?')[0];
  }

  if (pathname.endsWith('.ts') || pathname.endsWith('.vtt') || pathname.endsWith('.srt') || pathname.endsWith('.js') || pathname.endsWith('.css')) {
    return null;
  }

  const isHls =
    pathname.endsWith('.m3u8') ||
    lowerUrl.includes('.m3u8?') ||
    mime.includes('mpegurl') ||
    mime.includes('m3u8') ||
    /\/hls\/.*(master|playlist|index|manifest)/i.test(lowerUrl);

  const videoExtMatch = pathname.match(/\.(mp4|webm|mkv|mov|m4v|avi|flv|ogv)$/i);
  const audioExtMatch = pathname.match(/\.(mp3|m4a|wav|ogg|opus|flac|aac)$/i);
  const torrentExtMatch = pathname.match(/\.torrent$/i);

  const isRangeVideoStream =
    contentRangeTotal > 500 * 1024 &&
    !mime.startsWith('audio/') &&
    !mime.startsWith('image/') &&
    !mime.includes('font') &&
    !audioExtMatch;

  const isTorrent = mime === 'application/x-bittorrent' || Boolean(torrentExtMatch);
  const isVideo =
    isHls ||
    mime.startsWith('video/') ||
    Boolean(videoExtMatch) ||
    isRangeVideoStream ||
    (requestType === 'media' && !mime.startsWith('audio/') && !audioExtMatch);
  const isAudio = !isHls && (mime.startsWith('audio/') || Boolean(audioExtMatch));
  const isImage = !isHls && !isRangeVideoStream && mime.startsWith('image/');

  if (!isTorrent && !isVideo && !isAudio && !isImage) {
    return null;
  }

  let format = '';
  if (isTorrent) format = 'TORRENT';
  else if (isHls) format = 'MP4';
  else if (videoExtMatch) format = videoExtMatch[1].toUpperCase();
  else if (audioExtMatch) format = audioExtMatch[1].toUpperCase();
  else if (mime.includes('mp4')) format = isAudio ? 'M4A' : 'MP4';
  else if (mime.includes('webm')) format = 'WebM';
  else if (mime.includes('matroska') || mime.includes('mkv')) format = 'MKV';
  else if (mime.includes('quicktime')) format = 'MOV';
  else if (mime.includes('mpeg') || mime.includes('mp3')) format = 'MP3';
  else if (mime.includes('wav')) format = 'WAV';
  else if (mime.includes('ogg') || mime.includes('opus')) format = 'OGG';
  else if (mime.includes('flac')) format = 'FLAC';
  else if (mime.includes('aac')) format = 'AAC';
  else if (mime.includes('jpeg') || mime.includes('jpg')) format = 'JPEG';
  else if (mime.includes('png')) format = 'PNG';
  else if (mime.includes('webp')) format = 'WEBP';
  else if (mime.includes('gif')) format = 'GIF';
  else format = isVideo ? 'MP4' : isAudio ? 'MP3' : 'JPEG';

  let quality = 'Original';
  const qMatch = urlStr.match(/(?:^|[^0-9])(2160p|1440p|1080p|720p|480p|360p|240p|4k|hd|sd)(?:[^a-z0-9]|$)/i);
  if (qMatch) {
    const token = qMatch[1].toLowerCase();
    quality = token === '4k' ? '2160p' : token === 'hd' ? '720p' : token === 'sd' ? '480p' : token;
  }

  return {
    mediaType: isTorrent ? 'torrent' : isVideo ? 'video' : isAudio ? 'audio' : 'image',
    format,
    quality,
    isHls,
    effectiveMime: isHls
      ? 'application/vnd.apple.mpegurl'
      : mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream' && !mime.startsWith('text/')
      ? mime
      : isVideo
      ? 'video/mp4'
      : isAudio
      ? 'audio/mpeg'
      : isImage
      ? 'image/jpeg'
      : 'application/octet-stream',
  };
}

// Helper: Parse HLS master playlist in Service Worker to extract quality variants
async function probeHlsVariantsInBackground(m3u8Url, tabId, parentReferrer = '') {
  try {
    const res = await fetch(m3u8Url, { credentials: 'include' });
    if (!res.ok) return;
    const text = (await res.text()).trim();
    if (!text.startsWith('#EXTM3U')) return;
    if (/METHOD=SAMPLE-AES/i.test(text) || /com\.widevine\.alpha/i.test(text)) return;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const key = `net_meta_${tabId}`;
    const stored = await chrome.storage.session.get(key);
    const mapObj = (stored && stored[key]) || {};
    let added = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
        let nextUri = '';
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].startsWith('#')) {
            nextUri = lines[j];
            i = j;
            break;
          }
        }
        if (!nextUri) continue;
        let variantUrl = '';
        try {
          variantUrl = new URL(nextUri, m3u8Url).toString();
        } catch {
          continue;
        }

        let width = 0;
        let height = 0;
        let bandwidth = 0;
        const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resMatch) {
          width = parseInt(resMatch[1], 10) || 0;
          height = parseInt(resMatch[2], 10) || 0;
        }
        const bwMatch = attrs.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
        if (bwMatch) {
          bandwidth = parseInt(bwMatch[1], 10) || 0;
        }
        const quality =
          height >= 2160
            ? '2160p'
            : height >= 1440
            ? '1440p'
            : height >= 1080
            ? '1080p'
            : height >= 720
            ? '720p'
            : height >= 480
            ? '480p'
            : height >= 360
            ? '360p'
            : height > 0
            ? `${height}p`
            : 'Original';

        mapObj[variantUrl] = {
          url: variantUrl,
          mimeType: 'application/vnd.apple.mpegurl',
          fileSize: 0,
          mediaType: 'video',
          format: 'MP4',
          quality,
          width: width || undefined,
          height: height || undefined,
          bandwidth: bandwidth || undefined,
          referrer: parentReferrer || undefined,
          isHls: true,
          updatedAt: Date.now(),
        };
        added = true;
      }
    }

    if (added) {
      await chrome.storage.session.set({ [key]: mapObj });
      await buildMergedTabMedia(tabId);
    }
  } catch {}
}

// Phase 4: Passive Network Header Inspection for Media Size, MIME Type & Video Streams
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || !details.responseHeaders) return;
    if (details.statusCode < 200 || details.statusCode >= 300) return;

    let contentType = '';
    let contentLength = 0;
    let contentRangeTotal = 0;

    for (const h of details.responseHeaders) {
      const name = (h.name || '').toLowerCase();
      if (name === 'content-type' && h.value) {
        contentType = h.value.split(';')[0].trim().toLowerCase();
      } else if (name === 'content-length' && h.value) {
        const parsed = parseInt(h.value, 10);
        if (!isNaN(parsed) && parsed > 0) contentLength = parsed;
      } else if (name === 'content-range' && h.value) {
        const m = h.value.match(/\/(\d+)$/);
        if (m) {
          const total = parseInt(m[1], 10);
          if (!isNaN(total) && total > 0) contentRangeTotal = total;
        }
      }
    }

    const classified = classifyMediaNetworkResource(
      details.url,
      contentType,
      details.type,
      contentRangeTotal
    );
    if (!classified) return;

    const totalSize = contentRangeTotal || contentLength;

    // Ignore tiny images (< 25KB) or tiny non-HLS audio/video sound-effect blips (< 35KB if full size is known)
    if (classified.mediaType === 'image' && totalSize > 0 && totalSize < 25 * 1024) {
      return;
    }
    if (
      !classified.isHls &&
      (classified.mediaType === 'video' || classified.mediaType === 'audio') &&
      totalSize > 0 &&
      totalSize < 35 * 1024
    ) {
      return;
    }

    const requestInitiator =
      details.documentUrl ||
      (details.initiator && details.initiator.startsWith('http') ? `${details.initiator}/` : '');

    (async () => {
      try {
        const key = `net_meta_${details.tabId}`;
        const stored = await chrome.storage.session.get(key);
        const mapObj = (stored && stored[key]) || {};
        const existingEntry = mapObj[details.url] || {};
        const effectiveRef = existingEntry.referrer || requestInitiator || undefined;

        mapObj[details.url] = {
          ...existingEntry,
          url: details.url,
          mimeType: classified.effectiveMime,
          fileSize: classified.isHls ? 0 : totalSize,
          mediaType: classified.mediaType,
          format: classified.format,
          quality: existingEntry.quality || classified.quality,
          referrer: effectiveRef,
          isHls: Boolean(classified.isHls),
          updatedAt: Date.now(),
        };

        // Keep cache bounded to 100 entries per tab
        const keys = Object.keys(mapObj);
        if (keys.length > 100) {
          delete mapObj[keys[0]];
        }

        await chrome.storage.session.set({ [key]: mapObj });

        // Notify content script of enriched network metadata
        chrome.tabs.sendMessage(details.tabId, {
          type: 'dlx:network-meta',
          meta: mapObj[details.url],
        }).catch(() => {});

        if (classified.isHls) {
          probeHlsVariantsInBackground(details.url, details.tabId, effectiveRef);
        }

        // If it's a video or audio stream, also refresh merged badge count
        if (classified.mediaType === 'video' || classified.mediaType === 'audio') {
          await buildMergedTabMedia(details.tabId);
        }
      } catch {}
    })();
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['responseHeaders']
);

// Merge DOM-detected items from all frames with Network-detected video/audio streams
async function buildMergedTabMedia(tabId) {
  const settings = await getExtensionSettings();
  const stored = await chrome.storage.session.get([
    `tab_media_frames_${tabId}`,
    `tab_media_${tabId}`,
    `net_meta_${tabId}`,
  ]);

  const framesMap = (stored && stored[`tab_media_frames_${tabId}`]) || {};
  const legacyItems = (stored && stored[`tab_media_${tabId}`]) || [];
  const netMeta = (stored && stored[`net_meta_${tabId}`]) || {};

  let tabInfo = null;
  try {
    tabInfo = await chrome.tabs.get(tabId);
  } catch {}
  const fallbackPageTitle =
    (tabInfo && tabInfo.title ? tabInfo.title.replace(/\s*[-|•]\s*(YouTube|Vimeo|Dailymotion|Twitch)$/i, '').trim() : '') ||
    'Video';
  const fallbackPageUrl = (tabInfo && tabInfo.url) || '';

  // 1. Gather all items from frames
  const combined = [];
  const frameKeys = Object.keys(framesMap);
  if (frameKeys.length > 0) {
    for (const fk of frameKeys) {
      const arr = framesMap[fk];
      if (Array.isArray(arr)) {
        combined.push(...arr);
      }
    }
  } else if (Array.isArray(legacyItems)) {
    combined.push(...legacyItems);
  }

  // Deduplicate DOM items by primary URL or ID
  const dedupedItems = [];
  const seenUrls = new Set();
  const seenIds = new Set();

  for (const item of combined) {
    if (!item) continue;
    const keyUrl = item.url || '';
    if (keyUrl && seenUrls.has(keyUrl)) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    if (keyUrl) seenUrls.add(keyUrl);
    dedupedItems.push(item);
  }

  // 2. Collect all available video & audio streams from netMeta AND across all frames' options
  const allNetVideoMap = new Map();
  const allNetAudioMap = new Map();

  for (const item of dedupedItems) {
    if (Array.isArray(item.videoOptions)) {
      for (const vo of item.videoOptions) {
        if (vo && vo.url && !vo.url.startsWith('blob:')) {
          allNetVideoMap.set(vo.url, {
            ...vo,
            referrer: vo.referrer || item.sourcePageUrl || undefined,
          });
        }
      }
    }
    if (Array.isArray(item.audioOptions)) {
      for (const ao of item.audioOptions) {
        if (ao && ao.url && !ao.url.startsWith('blob:')) {
          allNetAudioMap.set(ao.url, {
            ...ao,
            referrer: ao.referrer || item.sourcePageUrl || undefined,
          });
        }
      }
    }
  }

  for (const meta of Object.values(netMeta)) {
    if (!meta || !meta.url || meta.url.startsWith('blob:')) continue;
    if (meta.mediaType === 'video' && settings.detectVideos !== false) {
      const existingVo = allNetVideoMap.get(meta.url);
      if (!existingVo) {
        allNetVideoMap.set(meta.url, {
          url: meta.url,
          quality: meta.quality || 'Original',
          format: meta.format && meta.format !== 'PHP' ? meta.format : 'MP4',
          mimeType: meta.mimeType || 'video/mp4',
          fileSize: meta.fileSize || 0,
          width: meta.width || undefined,
          height: meta.height || undefined,
          bandwidth: meta.bandwidth || undefined,
          referrer: meta.referrer || undefined,
          isHls: Boolean(meta.isHls),
          kind: 'video',
        });
      } else if (!existingVo.referrer && meta.referrer) {
        existingVo.referrer = meta.referrer;
      }
    } else if (meta.mediaType === 'audio' && settings.detectAudio !== false) {
      if (!allNetAudioMap.has(meta.url)) {
        allNetAudioMap.set(meta.url, {
          url: meta.url,
          quality: meta.quality || 'Audio',
          format: meta.format || 'MP3',
          mimeType: meta.mimeType || 'audio/mpeg',
          fileSize: meta.fileSize || 0,
          referrer: meta.referrer || undefined,
          kind: 'audio',
        });
      }
    }
  }

  // Filter out segment-pattern fallback if primary streams exist
  let sharedVideoOpts = Array.from(allNetVideoMap.values());
  const nonPatternShared = sharedVideoOpts.filter((o) => !o.url.includes('__DLX_SEG_'));
  if (nonPatternShared.length > 0) {
    sharedVideoOpts = nonPatternShared;
  }
  sharedVideoOpts.sort((a, b) => {
    const numA = parseInt(a.quality, 10) || a.height || 0;
    const numB = parseInt(b.quality, 10) || b.height || 0;
    return numB - numA;
  });

  const sharedAudioOpts = Array.from(allNetAudioMap.values());

  // 3. Attach discovered video/audio streams to ALL <video> items on the tab and fix generic titles/formats
  const videoItems = dedupedItems.filter((it) => it.mediaType === 'video');
  if (videoItems.length > 0) {
    for (const vidItem of videoItems) {
      if (isGenericSwTitle(vidItem.title) && !isGenericSwTitle(fallbackPageTitle)) {
        vidItem.title = fallbackPageTitle;
      }
      if (!vidItem.format || vidItem.format === 'PHP' || vidItem.format === 'HTML' || vidItem.format === 'M3U8') {
        vidItem.format = 'MP4';
      }

      if (sharedVideoOpts.length > 0) {
        const mergedVidOpts = [];
        const seenOptUrls = new Set();
        for (const opt of [...(vidItem.videoOptions || []), ...sharedVideoOpts]) {
          if (!opt || !opt.url || seenOptUrls.has(opt.url)) continue;
          seenOptUrls.add(opt.url);
          const clonedOpt = { ...opt };
          if (
            (!clonedOpt.fileSize || clonedOpt.fileSize <= 0) &&
            clonedOpt.bandwidth > 0 &&
            vidItem.durationSeconds > 0
          ) {
            clonedOpt.fileSize = Math.round((clonedOpt.bandwidth / 8) * vidItem.durationSeconds);
          }
          if (!clonedOpt.format || clonedOpt.format === 'PHP' || clonedOpt.format === 'M3U8') {
            clonedOpt.format = 'MP4';
          }
          mergedVidOpts.push(clonedOpt);
        }

        // Prefer non-pattern options if present
        const nonPat = mergedVidOpts.filter((o) => !o.url.includes('__DLX_SEG_'));
        vidItem.videoOptions = nonPat.length > 0 ? nonPat : mergedVidOpts;
      }

      if (sharedAudioOpts.length > 0 && (!vidItem.audioOptions || vidItem.audioOptions.length === 0)) {
        vidItem.audioOptions = [...sharedAudioOpts];
      }

      if (vidItem.videoOptions && vidItem.videoOptions.length > 0) {
        const bestOpt = vidItem.videoOptions[0];
        vidItem.url = bestOpt.url;
        vidItem.format = bestOpt.format || 'MP4';
        vidItem.mimeType = bestOpt.mimeType || 'video/mp4';
        vidItem.fileSize = bestOpt.fileSize || vidItem.fileSize || 0;
        if (bestOpt.referrer) {
          vidItem.referrer = bestOpt.referrer;
        }
        vidItem.protected = false;
        vidItem.protectedMessage = '';
      }

      const cleanStem = (vidItem.title || fallbackPageTitle || 'Video')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .trim()
        .slice(0, 120);
      const ext = (vidItem.format || 'MP4').toLowerCase() === 'webm' ? 'webm' : 'mp4';
      vidItem.filename = `${cleanStem}.${ext}`;
    }
  } else if (sharedVideoOpts.length > 0) {
    // 4. No <video> DOM element reported yet, create a Video item from captured network streams
    const bestOpt = sharedVideoOpts[0];
    const cleanStem = (fallbackPageTitle || 'Video').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120);
    dedupedItems.push({
      id: `dlx_net_vid_primary`,
      mediaType: 'video',
      title: fallbackPageTitle || 'Video',
      duration: '',
      resolution: bestOpt.quality || 'Original',
      format: bestOpt.format || 'MP4',
      mimeType: bestOpt.mimeType || 'video/mp4',
      fileSize: bestOpt.fileSize || 0,
      hasVideo: true,
      hasAudio: true,
      protected: false,
      protectedMessage: '',
      url: bestOpt.url,
      filename: `${cleanStem}.mp4`,
      videoOptions: sharedVideoOpts,
      audioOptions: sharedAudioOpts,
      imageOptions: [],
      thumbnailOptions: [],
      referrer: bestOpt.referrer || fallbackPageUrl,
      sourcePageUrl: bestOpt.referrer || fallbackPageUrl,
      sourcePageTitle: fallbackPageTitle,
    });
  }

  // 5. Deduplicate multiple <video> items on the same tab if they share the same stream URL or if one is an empty placeholder
  const finalItems = [];
  const finalVideoItems = dedupedItems.filter((it) => it.mediaType === 'video');
  const downloadableVideos = finalVideoItems.filter((it) => !it.protected && it.videoOptions && it.videoOptions.length > 0);

  const seenVideoPrimaryUrls = new Set();
  for (const it of dedupedItems) {
    if (it.mediaType === 'video') {
      // If we have at least one downloadable video on the tab, hide empty/uninitialized placeholder video elements
      if (downloadableVideos.length > 0 && (it.protected || !it.url)) {
        continue;
      }
      if (it.url) {
        if (seenVideoPrimaryUrls.has(it.url)) {
          continue;
        }
        seenVideoPrimaryUrls.add(it.url);
      }
    }
    finalItems.push(it);
  }

  // 6. Sort so Videos always appear FIRST, then Audio, then Torrents, then Images
  const priorityOrder = { video: 0, audio: 1, torrent: 2, image: 3 };
  finalItems.sort((a, b) => {
    const pa = priorityOrder[a.mediaType] ?? 4;
    const pb = priorityOrder[b.mediaType] ?? 4;
    return pa - pb;
  });

  await chrome.storage.session.set({ [`tab_media_${tabId}`]: finalItems });
  const countText = finalItems.length > 0 ? String(finalItems.length) : '';
  try {
    await chrome.action.setBadgeText({ tabId, text: countText });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#09090b' });
  } catch {}

  return finalItems;
}

// Helper: Ensure content scripts are injected in the tab (even if tab was opened before extension loaded) and trigger scan
async function ensureScriptsAndRescanTab(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) return [];

  if (chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/page-hook.js'],
        world: 'MAIN',
      });
    } catch {}
  }

  let storedNet = await chrome.storage.session.get(`net_meta_${tabId}`);
  let netMeta = (storedNet && storedNet[`net_meta_${tabId}`]) || {};

  let responded = false;
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: 'dlx:request-media-scan',
      netMeta,
    });
    if (res && res.ok) {
      responded = true;
    }
  } catch {}

  if (!responded && chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/media-detector.js', 'content/media-overlay.js'],
      });
      await new Promise((r) => setTimeout(r, 150));
      storedNet = await chrome.storage.session.get(`net_meta_${tabId}`);
      netMeta = (storedNet && storedNet[`net_meta_${tabId}`]) || {};
      await chrome.tabs.sendMessage(tabId, {
        type: 'dlx:request-media-scan',
        netMeta,
      });
    } catch {}
  }

  // Give MAIN-world page-hook.js a brief moment to complete any retroactive manifest probes
  await new Promise((r) => setTimeout(r, 280));
  return await buildMergedTabMedia(tabId);
}

// Clear stale tab media when top-level navigation occurs
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    try {
      await chrome.storage.session.remove([
        `tab_media_${tabId}`,
        `tab_media_frames_${tabId}`,
        `net_meta_${tabId}`,
      ]);
      await chrome.action.setBadgeText({ tabId, text: '' });
    } catch {}
  }
});

// Clean up tab storage when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await chrome.storage.session.remove([
      `tab_media_${tabId}`,
      `tab_media_frames_${tabId}`,
      `net_meta_${tabId}`,
    ]);
  } catch {}
});

// Message Router for Content Scripts & Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const tabId =
        message.tabId !== undefined
          ? message.tabId
          : sender && sender.tab && typeof sender.tab.id === 'number'
          ? sender.tab.id
          : undefined;
      const frameId = sender && typeof sender.frameId === 'number' ? sender.frameId : 0;

      switch (message.type) {
        case 'dlx:hello': {
          const res = await sendHelloHandshake();
          sendResponse(res);
          return;
        }

        case 'dlx:get-status': {
          const status = await getDlxStatus();
          const settings = await getExtensionSettings();
          sendResponse({
            ...status,
            settings,
          });
          return;
        }

        case 'dlx:get-settings': {
          const settings = await getExtensionSettings();
          sendResponse({ ok: true, settings });
          return;
        }

        case 'dlx:update-settings': {
          const updated = await updateDlxSettings(message.settings || {});
          try {
            const tabs = await chrome.tabs.query({});
            for (const t of tabs) {
              if (typeof t.id === 'number') {
                chrome.tabs.sendMessage(t.id, {
                  type: 'dlx:settings-changed',
                  settings: updated,
                }).catch(() => {});
              }
            }
          } catch {}
          sendResponse({ ok: true, settings: updated });
          return;
        }

        case 'dlx:report-stream': {
          if (typeof tabId === 'number' && message.stream && message.stream.url) {
            const key = `net_meta_${tabId}`;
            const stored = await chrome.storage.session.get(key);
            const mapObj = (stored && stored[key]) || {};
            mapObj[message.stream.url] = {
              ...(mapObj[message.stream.url] || {}),
              ...message.stream,
              referrer: (sender && sender.url) || message.stream.referrer || (mapObj[message.stream.url] && mapObj[message.stream.url].referrer),
              updatedAt: Date.now(),
            };
            await chrome.storage.session.set({ [key]: mapObj });
            chrome.tabs.sendMessage(tabId, {
              type: 'dlx:network-meta',
              meta: mapObj[message.stream.url],
            }).catch(() => {});
            await buildMergedTabMedia(tabId);
          }
          sendResponse({ ok: true });
          return;
        }

        case 'dlx:report-media': {
          if (typeof tabId === 'number') {
            const items = Array.isArray(message.items) ? message.items : [];
            const key = `tab_media_frames_${tabId}`;
            const stored = await chrome.storage.session.get(key);
            const framesMap = (stored && stored[key]) || {};
            framesMap[String(frameId)] = items;
            await chrome.storage.session.set({ [key]: framesMap });
            const merged = await buildMergedTabMedia(tabId);
            sendResponse({ ok: true, count: merged.length });
            return;
          }
          sendResponse({ ok: true });
          return;
        }

        case 'dlx:get-tab-media':
        case 'dlx:rescan-tab': {
          if (typeof tabId !== 'number') {
            sendResponse({ ok: true, items: [], netMeta: {} });
            return;
          }
          const mergedItems = await ensureScriptsAndRescanTab(tabId);
          sendResponse({ ok: true, items: mergedItems });
          return;
        }

        case 'dlx:get-net-meta': {
          if (typeof tabId !== 'number') {
            sendResponse({ ok: true, netMeta: {} });
            return;
          }
          const stored = await chrome.storage.session.get(`net_meta_${tabId}`);
          sendResponse({
            ok: true,
            netMeta: (stored && stored[`net_meta_${tabId}`]) || {},
          });
          return;
        }

        case 'dlx:send-download': {
          const payload = message.payload || {};
          const browserName = detectBrowserName();
          const pageUrl = payload.sourcePageUrl || (sender && sender.tab && sender.tab.url) || '';
          const pageTitle = payload.sourcePageTitle || (sender && sender.tab && sender.tab.title) || '';

          const res = await sendToDlx({
            type: payload.type || 'addMediaDownload',
            url: payload.url,
            filename: payload.filename,
            mimeType: payload.mimeType,
            quality: payload.quality,
            fileSize: payload.fileSize,
            referrer: payload.referrer || pageUrl || undefined,
            source: browserName,
            sourcePageUrl: pageUrl || undefined,
            sourcePageTitle: pageTitle || undefined,
            mediaType: payload.mediaType || 'video',
            secondaryAudioUrl: payload.secondaryAudioUrl || undefined,
            forceRedownload: Boolean(payload.forceRedownload),
            openModal: payload.openModal !== undefined ? Boolean(payload.openModal) : true,
          });

          sendResponse(res);
          return;
        }

        case 'dlx:check-duplicate': {
          const res = await checkDlxDuplicate(message.url);
          sendResponse(res);
          return;
        }

        case 'dlx:open-existing': {
          const res = await openExistingDlxTask(message.taskId, message.openFile !== false);
          sendResponse(res);
          return;
        }

        case 'dlx:open-app': {
          const res = await openDlxApplication();
          sendResponse(res);
          return;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown internal message type.' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : 'Service worker error' });
    }
  })();

  return true; // Keep message channel open for async response
});

