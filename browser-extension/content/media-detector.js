/**
 * DLX Browser Extension — Lightweight Event-Driven Media & Torrent Detector (Phase 4, 6, 7)
 *
 * Detects accessible Video, Audio, Images (with UI/icon filtering), and Torrents on the page.
 * Exposes detected items to both `media-overlay.js` (in-page button) and `popup.js` (extension popup).
 */

(() => {
  if (window.__dlxMediaDetectorInitialized) return;
  window.__dlxMediaDetectorInitialized = true;

  const detectedItemsMap = new Map(); // id -> MediaItem
  const elementToItemId = new WeakMap(); // HTMLElement -> id
  const networkMetaMap = new Map(); // url -> { mimeType, fileSize, mediaType }

  let settings = {
    autoInterceptDownloads: true,
    showMediaDownloadButton: true,
    detectVideos: true,
    detectAudio: true,
    detectImages: true,
    askBeforeIntercepting: false,
  };

  let scanScheduled = false;
  let scanTimer = null;
  let lastKnownLocationHref = window.location.href;

  // --- Utility Helpers ---

  function normalizeAbsoluteUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
    if (trimmed.toLowerCase().startsWith('magnet:?')) return trimmed;
    try {
      return new URL(trimmed, window.location.href).toString();
    } catch {
      return '';
    }
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  const ALLOWED_MEDIA_EXTS = new Set([
    'MP4', 'WEBM', 'MKV', 'MOV', 'M4V', 'AVI', 'FLV', 'OGV', 'M3U8',
    'MP3', 'M4A', 'WAV', 'OGG', 'OPUS', 'FLAC', 'AAC',
    'JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'AVIF', 'TORRENT',
  ]);

  const GENERIC_TITLES = new Set([
    'play', 'player', 'embed', 'watch', 'index', 'iframe', 'video', 'audio',
    'stream', 'playback', 'videoplayback', 'master', 'playlist', 'manifest',
    'source', 'api', 'media', 'default', 'blank', 'about:blank',
  ]);

  function isGenericTitle(str) {
    if (!str) return true;
    const clean = str.trim().toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, '');
    if (clean.length <= 2) return true;
    if (/^\d+$/.test(clean)) return true;
    return GENERIC_TITLES.has(clean);
  }

  function parseDurationStringToSeconds(durStr) {
    if (!durStr || typeof durStr !== 'string') return 0;
    const parts = durStr.split(':').map((p) => parseInt(p, 10));
    if (parts.some((n) => isNaN(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  function inferFormatLabel(urlStr, mimeType = '') {
    const mime = (mimeType || '').toLowerCase();
    if (mime.includes('mpegurl') || mime.includes('m3u8')) return 'MP4';
    if (mime.includes('mp4')) return 'MP4';
    if (mime.includes('webm')) return 'WebM';
    if (mime.includes('matroska') || mime.includes('mkv')) return 'MKV';
    if (mime.includes('quicktime')) return 'MOV';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'MP3';
    if (mime.includes('wav')) return 'WAV';
    if (mime.includes('ogg') || mime.includes('opus')) return 'OGG';
    if (mime.includes('flac')) return 'FLAC';
    if (mime.includes('aac') || mime.includes('m4a')) return 'M4A';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPEG';
    if (mime.includes('png')) return 'PNG';
    if (mime.includes('webp')) return 'WEBP';
    if (mime.includes('gif')) return 'GIF';
    if (mime.includes('avif')) return 'AVIF';
    if (mime.includes('bittorrent')) return 'TORRENT';

    try {
      const u = new URL(urlStr, window.location.href);
      const extMatch = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (extMatch) {
        const ext = extMatch[1].toUpperCase();
        if (!ALLOWED_MEDIA_EXTS.has(ext)) return '';
        if (ext === 'JPG') return 'JPEG';
        if (ext === 'M3U8') return 'MP4';
        return ext;
      }
    } catch {}
    return '';
  }

  function inferMimeFromFormat(format, kind) {
    const f = (format || '').toUpperCase();
    if (f === 'MP4') return 'video/mp4';
    if (f === 'WEBM') return kind === 'audio' ? 'audio/webm' : 'video/webm';
    if (f === 'MKV') return 'video/x-matroska';
    if (f === 'MOV') return 'video/quicktime';
    if (f === 'MP3') return 'audio/mpeg';
    if (f === 'WAV') return 'audio/wav';
    if (f === 'M4A') return 'audio/mp4';
    if (f === 'OGG') return 'audio/ogg';
    if (f === 'FLAC') return 'audio/flac';
    if (f === 'JPEG' || f === 'JPG') return 'image/jpeg';
    if (f === 'PNG') return 'image/png';
    if (f === 'WEBP') return 'image/webp';
    if (f === 'GIF') return 'image/gif';
    if (f === 'AVIF') return 'image/avif';
    return '';
  }

  function heightToQualityLabel(height) {
    if (!height || height <= 0) return '';
    if (height >= 2160) return '2160p';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return `${height}p`;
  }

  function extractQualityFromTextOrUrl(str) {
    if (!str) return '';
    const m = str.match(/(?:^|[^0-9])(2160p|1440p|1080p|720p|480p|360p|240p|4k|hd|sd)(?:[^a-z0-9]|$)/i);
    if (m) {
      const token = m[1].toLowerCase();
      if (token === '4k') return '2160p';
      if (token === 'hd') return '720p';
      if (token === 'sd') return '480p';
      return token;
    }
    const audioMatch = str.match(/(\d{2,3})\s*kbps/i);
    if (audioMatch) {
      return `${audioMatch[1]} kbps`;
    }
    return '';
  }

  function cleanTitle(rawTitle, fallbackUrl = '') {
    let t = (rawTitle || '').replace(/\s+/g, ' ').trim();
    if (t) {
      t = t.replace(/\s*[-|•]\s*(YouTube|Vimeo|Dailymotion|Twitch)$/i, '').trim();
    }
    if (isGenericTitle(t)) {
      t = '';
    }
    if (!t && fallbackUrl && !fallbackUrl.startsWith('blob:')) {
      try {
        const u = new URL(fallbackUrl, window.location.href);
        const base = decodeURIComponent(u.pathname.split('/').pop() || '');
        const stem = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim();
        if (stem && !isGenericTitle(stem)) {
          t = stem;
        }
      } catch {}
    }
    if (!t && !isGenericTitle(document.title)) {
      t = document.title.replace(/\s+/g, ' ').trim();
    }
    return t || 'Video';
  }

  function findElementTitle(el, fallbackUrl) {
    const attrTitle =
      el.getAttribute('data-title') ||
      el.getAttribute('title') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('alt') ||
      '';
    if (attrTitle && !isGenericTitle(attrTitle)) {
      return cleanTitle(attrTitle, fallbackUrl);
    }

    // Check common video player UI title elements
    const playerTitleEl = document.querySelector(
      '.jw-title-primary, .vjs-title-bar-title, .plyr__title, .fp-title, .video-title, h1'
    );
    if (playerTitleEl && playerTitleEl.textContent && !isGenericTitle(playerTitleEl.textContent)) {
      return cleanTitle(playerTitleEl.textContent, fallbackUrl);
    }

    const figure = el.closest('figure, article, [data-media-title], .video-container, .player-container');
    if (figure) {
      const dataMediaTitle = figure.getAttribute('data-media-title');
      if (dataMediaTitle && !isGenericTitle(dataMediaTitle)) return cleanTitle(dataMediaTitle, fallbackUrl);
      const caption = figure.querySelector('figcaption, h1, h2, h3, .title, .video-title');
      if (caption && caption.textContent && !isGenericTitle(caption.textContent)) {
        return cleanTitle(caption.textContent, fallbackUrl);
      }
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.getAttribute('content') && !isGenericTitle(ogTitle.getAttribute('content'))) {
      return cleanTitle(ogTitle.getAttribute('content'), fallbackUrl);
    }

    return cleanTitle(document.title, fallbackUrl);
  }

  function buildSafeFilename(title, format, quality, fallbackUrl) {
    const safeStem = (title || 'Video')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    let ext = (format || '').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'm3u8' || ext === 'hls' || !ALLOWED_MEDIA_EXTS.has(ext.toUpperCase())) {
      ext = 'mp4';
    }
    return `${safeStem}.${ext}`;
  }

  // --- Image UI/Icon Filtering (Requirement #2 & #8) ---

  function isLikelyUiAssetOrTinyImage(imgEl, urlStr) {
    if (!urlStr || urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return true;
    const lowerUrl = urlStr.toLowerCase();

    // Skip SVGs, favicons, tracking pixels, sprites
    if (
      lowerUrl.endsWith('.svg') ||
      lowerUrl.endsWith('.ico') ||
      lowerUrl.includes('favicon') ||
      lowerUrl.includes('sprite') ||
      lowerUrl.includes('tracking') ||
      lowerUrl.includes('pixel') ||
      lowerUrl.includes('1x1') ||
      lowerUrl.includes('/avatars/') ||
      lowerUrl.includes('/icons/') ||
      lowerUrl.includes('/logos/') ||
      lowerUrl.includes('/emoji/')
    ) {
      return true;
    }

    const classAndId = `${imgEl.className || ''} ${imgEl.id || ''} ${imgEl.getAttribute('role') || ''} ${imgEl.getAttribute('alt') || ''}`.toLowerCase();
    if (
      /\b(logo|icon|avatar|badge|emoji|spinner|loader|pixel|tracker|button|nav-img|thumb-xs)\b/.test(
        classAndId
      )
    ) {
      return true;
    }

    // Standalone image viewer tab (e.g. user opened https://example.com/photo.jpg directly)
    const isStandaloneImageDoc =
      document.contentType && document.contentType.toLowerCase().startsWith('image/');
    if (isStandaloneImageDoc) {
      return false;
    }

    const natW = imgEl.naturalWidth || 0;
    const natH = imgEl.naturalHeight || 0;
    const rect = imgEl.getBoundingClientRect();
    const dispW = rect.width || imgEl.width || 0;
    const dispH = rect.height || imgEl.height || 0;

    const w = Math.max(natW, dispW);
    const h = Math.max(natH, dispH);

    // Filter out small thumbnails, icons, and UI elements (< 280x200)
    if (w < 280 || h < 200) {
      return true;
    }

    return false;
  }

  // --- Deep DOM & Shadow DOM Query Helper ---
  function queryAllDeep(selector, root = document) {
    const results = [];
    if (!root || !root.querySelectorAll) return results;
    try {
      results.push(...Array.from(root.querySelectorAll(selector)));
      const allEls = root.querySelectorAll('*');
      for (let i = 0; i < allEls.length; i++) {
        const el = allEls[i];
        if (el.shadowRoot && el.id !== 'dlx-extension-shadow-host') {
          results.push(...queryAllDeep(selector, el.shadowRoot));
        }
      }
    } catch {}
    return results;
  }

  // Listen for streams discovered by MAIN-world page-hook.js
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__dlxPageHook || !e.data.stream) return;
    const st = e.data.stream;
    if (!st.url || st.url.startsWith('blob:')) return;

    const existing = networkMetaMap.get(st.url) || {};
    const merged = {
      url: st.url,
      mimeType: st.mimeType || existing.mimeType || 'video/mp4',
      fileSize: st.fileSize || existing.fileSize || 0,
      mediaType: st.mediaType || existing.mediaType || 'video',
      format: st.format || existing.format || 'MP4',
      quality: st.quality || existing.quality || extractQualityFromTextOrUrl(st.url) || 'Original',
      width: st.width || existing.width || undefined,
      height: st.height || existing.height || undefined,
      bandwidth: st.bandwidth || existing.bandwidth || undefined,
      isHls: Boolean(st.isHls || existing.isHls),
    };
    networkMetaMap.set(st.url, merged);

    // Report to service worker so all frames & popup know about this stream
    try {
      chrome.runtime.sendMessage({
        type: 'dlx:report-stream',
        stream: merged,
      }).catch(() => {});
    } catch {}

    scheduleMediaScan(80);
  });

  // --- Harvest Network Resources from Performance API, Page Meta, JSON-LD & Inline Player Scripts ---
  function harvestPerformanceAndMetaMedia() {
    const pageMetaVideos = [];

    // Ask page-hook.js in MAIN world to probe any global player instances (jwplayer, plyr, videojs)
    try {
      window.postMessage({ __dlxProbePlayers: true }, '*');
    } catch {}

    // 1. Inspect performance.getEntriesByType('resource') for video/audio & HLS (.m3u8) resources
    try {
      if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
        const entries = performance.getEntriesByType('resource');
        for (const entry of entries) {
          const urlStr = entry.name || '';
          if (!urlStr || urlStr.startsWith('blob:') || urlStr.startsWith('data:')) continue;
          const lower = urlStr.toLowerCase();

          // Skip small segment chunks (.m4s, .ts segments, byte-range sub-segments)
          if (
            lower.includes('.mpd') ||
            lower.includes('.m4s') ||
            lower.includes('bytestart=') ||
            lower.includes('segment-') ||
            lower.includes('chunk-') ||
            lower.includes('/seg-') ||
            lower.includes('/frag-')
          ) {
            continue;
          }

          let pathname = '';
          try {
            pathname = new URL(urlStr).pathname.toLowerCase();
          } catch {
            pathname = lower.split('?')[0];
          }
          if (pathname.endsWith('.ts') || pathname.endsWith('.vtt') || pathname.endsWith('.srt') || pathname.endsWith('.js') || pathname.endsWith('.css')) {
            continue;
          }

          const isHlsManifest =
            pathname.endsWith('.m3u8') ||
            lower.includes('.m3u8?') ||
            /\/hls\/.*(master|playlist|index|manifest)/i.test(lower);
          const isVideoExt = /\.(mp4|webm|mkv|mov|m4v|avi|flv|ogv)$/i.test(pathname);
          const isAudioExt = /\.(mp3|m4a|wav|ogg|opus|flac|aac)$/i.test(pathname);
          const isVideoInit = entry.initiatorType === 'video' && !isAudioExt;
          const isAudioInit = entry.initiatorType === 'audio';

          if (isHlsManifest || isVideoExt || isAudioExt || isVideoInit || isAudioInit) {
            const existing = networkMetaMap.get(urlStr);
            const size = entry.decodedBodySize || entry.encodedBodySize || entry.transferSize || 0;
            // Skip tiny non-HLS blips (< 35KB) if size is known
            if (!isHlsManifest && size > 0 && size < 35 * 1024 && !existing) continue;

            const mediaType = isAudioExt || isAudioInit ? 'audio' : 'video';
            const format = inferFormatLabel(urlStr) || (mediaType === 'audio' ? 'MP3' : 'MP4');
            const mimeType = isHlsManifest
              ? 'application/vnd.apple.mpegurl'
              : inferMimeFromFormat(format, mediaType) || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4');
            if (!existing) {
              networkMetaMap.set(urlStr, {
                url: urlStr,
                mimeType,
                fileSize: !isHlsManifest && size > 0 ? size : 0,
                mediaType,
                format,
                quality: extractQualityFromTextOrUrl(urlStr) || 'Original',
                isHls: isHlsManifest,
              });
            } else if (!isHlsManifest && !existing.fileSize && size > 0) {
              existing.fileSize = size;
            }
          }
        }
      }
    } catch {}

    // 2. Inspect <meta property="og:video*"> and <meta name="twitter:player:stream">
    try {
      const metaSelectors = [
        'meta[property="og:video"]',
        'meta[property="og:video:url"]',
        'meta[property="og:video:secure_url"]',
        'meta[name="twitter:player:stream"]',
        'link[rel="video_src"]',
      ];
      for (const sel of metaSelectors) {
        const els = document.querySelectorAll(sel);
        for (const m of els) {
          const raw = m.getAttribute('content') || m.getAttribute('href') || '';
          const abs = normalizeAbsoluteUrl(raw);
          if (abs && /\.(mp4|webm|mkv|mov|m4v|m3u8)(\?|$)/i.test(abs)) {
            pageMetaVideos.push(abs);
          }
        }
      }

      // 3. Inspect JSON-LD <script type="application/ld+json"> for VideoObject contentUrl
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const sc of ldScripts) {
        const text = sc.textContent || '';
        if (!text.includes('VideoObject') && !text.includes('contentUrl')) continue;
        try {
          const parsed = JSON.parse(text);
          const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
          while (stack.length > 0) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            if (typeof node.contentUrl === 'string') {
              const abs = normalizeAbsoluteUrl(node.contentUrl);
              if (abs && !abs.includes('.mpd')) {
                pageMetaVideos.push(abs);
              }
            }
            for (const val of Object.values(node)) {
              if (val && typeof val === 'object') stack.push(val);
            }
          }
        } catch {}
      }

      // 4. Scan inline <script> tags for embedded .m3u8 / .mp4 stream URLs configured before content script load
      const inlineScripts = document.querySelectorAll('script:not([src])');
      const mediaUrlRegex = /https?:\\?\/\\?\/[^"'\s<>\\]+\.(?:m3u8|mp4|webm|mkv)(?:\?[^"'\s<>\\]*)?/gi;
      for (const sc of inlineScripts) {
        const text = sc.textContent || '';
        if (!text || text.length > 300000) continue;
        if (!text.includes('.m3u8') && !text.includes('.mp4') && !text.includes('.webm')) continue;
        const matches = text.match(mediaUrlRegex);
        if (matches) {
          for (const rawMatch of matches) {
            const unescaped = rawMatch.replace(/\\\//g, '/');
            const abs = normalizeAbsoluteUrl(unescaped);
            if (abs && !abs.includes('.mpd')) {
              pageMetaVideos.push(abs);
            }
          }
        }
      }
    } catch {}

    return pageMetaVideos;
  }

  // --- Quality / Option Extraction for Video, Audio, and Images ---

  function extractVideoOptions(videoEl, pageMetaVideos = []) {
    const options = [];
    const audioOptions = [];
    const seenUrls = new Set();
    const durationSec = videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;

    const addOption = (rawUrl, labelHint, typeHint, heightHint, isAudioTrack = false, extraMeta = null) => {
      const absUrl = normalizeAbsoluteUrl(rawUrl);
      if (!absUrl || absUrl.startsWith('blob:')) return;
      const lower = absUrl.toLowerCase();
      if (lower.includes('.mpd') || lower.includes('.m4s')) return;
      if (seenUrls.has(absUrl)) return;
      seenUrls.add(absUrl);

      const netMeta = extraMeta || networkMetaMap.get(absUrl);
      const isHls =
        Boolean(netMeta && netMeta.isHls) ||
        lower.includes('.m3u8') ||
        (typeHint && typeHint.toLowerCase().includes('mpegurl'));

      const mimeType =
        (netMeta && netMeta.mimeType) ||
        (isHls ? 'application/vnd.apple.mpegurl' : '') ||
        (typeHint ? typeHint.split(';')[0].trim() : '') ||
        inferMimeFromFormat(inferFormatLabel(absUrl), isAudioTrack ? 'audio' : 'video');
      const format = inferFormatLabel(absUrl, mimeType) || (isAudioTrack ? 'MP3' : 'MP4');

      let fileSize = (netMeta && netMeta.fileSize) || 0;
      if (!fileSize && netMeta && netMeta.bandwidth && durationSec > 0) {
        fileSize = Math.round((netMeta.bandwidth / 8) * durationSec);
      }

      if (isAudioTrack || (mimeType.startsWith('audio/') && !isHls)) {
        const qLabel =
          labelHint ||
          extractQualityFromTextOrUrl(absUrl) ||
          (audioOptions.length === 0 ? 'Original' : `Audio ${audioOptions.length + 1}`);
        audioOptions.push({
          url: absUrl,
          quality: qLabel,
          format,
          mimeType: mimeType || 'audio/mpeg',
          fileSize,
          kind: 'audio',
        });
      } else {
        const effHeight = heightHint || (netMeta && netMeta.height) || 0;
        const qLabel =
          labelHint ||
          (effHeight ? heightToQualityLabel(effHeight) : '') ||
          (netMeta && netMeta.quality && netMeta.quality !== 'Original' ? netMeta.quality : '') ||
          extractQualityFromTextOrUrl(absUrl) ||
          (videoEl && videoEl.videoHeight ? heightToQualityLabel(videoEl.videoHeight) : '') ||
          'Original';
        options.push({
          url: absUrl,
          quality: qLabel,
          format,
          mimeType: mimeType || 'video/mp4',
          fileSize,
          width: (netMeta && netMeta.width) || (videoEl && videoEl.videoWidth) || undefined,
          height: effHeight || (videoEl && videoEl.videoHeight) || undefined,
          bandwidth: (netMeta && netMeta.bandwidth) || undefined,
          isHls,
          kind: 'video',
        });
      }
    };

    if (videoEl) {
      // 1. Inspect <source> children inside <video>
      const sourceEls = Array.from(videoEl.querySelectorAll('source'));
      for (const srcEl of sourceEls) {
        const src = srcEl.getAttribute('src') || srcEl.getAttribute('data-src') || srcEl.src;
        const type = srcEl.getAttribute('type') || '';
        const sizeAttr = parseInt(srcEl.getAttribute('size') || srcEl.getAttribute('data-res') || '', 10);
        const labelAttr =
          srcEl.getAttribute('label') ||
          srcEl.getAttribute('data-quality') ||
          srcEl.getAttribute('title') ||
          (sizeAttr > 0 ? `${sizeAttr}p` : '');
        addOption(src, labelAttr, type, sizeAttr > 0 ? sizeAttr : 0, type.startsWith('audio/'));
      }

      // 2. Inspect video.currentSrc, video.src, and custom data-* attributes
      if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) {
        const h = videoEl.videoHeight || 0;
        const qAttr = videoEl.getAttribute('data-quality') || videoEl.getAttribute('data-resolution') || '';
        addOption(videoEl.currentSrc, qAttr, '', h, false);
      }
      const rawSrcAttr = videoEl.getAttribute('src');
      if (rawSrcAttr && !rawSrcAttr.startsWith('blob:')) {
        addOption(rawSrcAttr, videoEl.getAttribute('data-quality') || '', '', videoEl.videoHeight || 0, false);
      }

      const dataUrlAttrs = [
        ['data-hd-src', '1080p'],
        ['data-sd-src', '480p'],
        ['data-src', ''],
        ['data-video-src', ''],
        ['data-video-url', ''],
        ['data-mp4', ''],
        ['data-webm', ''],
        ['data-hls', ''],
        ['data-m3u8', ''],
        ['data-url', ''],
        ['data-file', ''],
        ['data-stream', ''],
      ];
      for (const [attrName, qHint] of dataUrlAttrs) {
        const val = videoEl.getAttribute(attrName);
        if (val && !val.startsWith('{') && !val.startsWith('[')) {
          addOption(val, qHint, '', 0, false);
        }
      }

      // 3. Check if parent container exposes companion quality links, data-* attributes, or separate <audio>
      const container =
        videoEl.closest('[data-media-container], figure, .video-player, .media-player, .player, article') ||
        videoEl.parentElement;
      if (container) {
        for (const [attrName, qHint] of dataUrlAttrs) {
          const val = container.getAttribute && container.getAttribute(attrName);
          if (val && !val.startsWith('{') && !val.startsWith('[')) {
            addOption(val, qHint, '', 0, false);
          }
        }

        const companionAudios = Array.from(container.querySelectorAll('audio, source[type^="audio/"]'));
        for (const aud of companionAudios) {
          const aSrc = aud.getAttribute('src') || aud.currentSrc || aud.src;
          const aLabel = aud.getAttribute('label') || aud.getAttribute('data-quality') || aud.getAttribute('data-bitrate') || '';
          const aType = aud.getAttribute('type') || 'audio/mpeg';
          if (aSrc) {
            addOption(aSrc, aLabel, aType, 0, true);
          }
        }

        const qualityLinks = Array.from(
          container.querySelectorAll(
            'a[href*=".mp4"], a[href*=".webm"], a[href*=".mkv"], a[href*=".mov"], a[href*=".m3u8"], a[href*=".mp3"], a[href*=".m4a"], [data-quality][data-src]'
          )
        );
        for (const link of qualityLinks) {
          const href = link.getAttribute('data-src') || link.getAttribute('href');
          const qText =
            link.getAttribute('data-quality') ||
            extractQualityFromTextOrUrl(link.textContent || '') ||
            extractQualityFromTextOrUrl(href || '');
          const isAud = /\.(mp3|m4a|wav|ogg|flac)(\?|$)/i.test(href || '');
          if (href) {
            addOption(href, qText, '', 0, isAud);
          }
        }
      }
    }

    // 4. Always merge harvested network/page-hook video/audio streams & OpenGraph/JSON-LD/script URLs
    for (const metaUrl of pageMetaVideos) {
      addOption(metaUrl, '', '', 0, false);
    }
    for (const [netUrl, meta] of networkMetaMap.entries()) {
      if (!meta) continue;
      if (meta.mediaType === 'video') {
        addOption(netUrl, meta.quality || '', meta.mimeType || 'video/mp4', meta.height || 0, false, meta);
      } else if (meta.mediaType === 'audio') {
        addOption(netUrl, meta.quality || 'Audio', meta.mimeType || 'audio/mpeg', 0, true, meta);
      }
    }

    // Sort video options from highest resolution to lowest
    options.sort((a, b) => {
      const numA = parseInt(a.quality, 10) || a.height || 0;
      const numB = parseInt(b.quality, 10) || b.height || 0;
      return numB - numA;
    });

    return { videoOptions: options, audioOptions };
  }

  function extractImageOptions(imgEl) {
    const versions = [];
    const seenUrls = new Set();

    const addVersion = (rawUrl, widthHint, heightHint, roleLabel) => {
      const absUrl = normalizeAbsoluteUrl(rawUrl);
      if (!absUrl || absUrl.startsWith('data:') || absUrl.startsWith('blob:')) return;
      if (seenUrls.has(absUrl)) return;
      seenUrls.add(absUrl);

      const netMeta = networkMetaMap.get(absUrl);
      const mimeType =
        (netMeta && netMeta.mimeType) ||
        inferMimeFromFormat(inferFormatLabel(absUrl), 'image') ||
        'image/jpeg';
      const format = inferFormatLabel(absUrl, mimeType) || 'JPEG';
      const fileSize = (netMeta && netMeta.fileSize) || 0;

      versions.push({
        url: absUrl,
        width: widthHint || 0,
        height: heightHint || 0,
        label: roleLabel || '',
        quality:
          widthHint && heightHint
            ? `${widthHint} × ${heightHint}`
            : widthHint
            ? `${widthHint}w`
            : roleLabel || 'Original',
        format,
        mimeType,
        fileSize,
        kind: 'image',
      });
    };

    // 1. Check if wrapped in <a href="...full-res-image.jpg">
    const parentLink = imgEl.closest('a[href]');
    if (parentLink) {
      const href = parentLink.getAttribute('href') || '';
      if (/\.(jpe?g|png|webp|gif|avif)(\?[^#]*)?$/i.test(href)) {
        addVersion(href, 0, 0, 'Original');
      }
    }

    // 2. Check <picture> <source srcset="..."> and img.srcset
    const picture = imgEl.closest('picture');
    const srcsetStrings = [];
    if (picture) {
      for (const s of Array.from(picture.querySelectorAll('source[srcset]'))) {
        srcsetStrings.push(s.getAttribute('srcset') || '');
      }
    }
    if (imgEl.getAttribute('srcset')) {
      srcsetStrings.push(imgEl.getAttribute('srcset') || '');
    }

    for (const srcset of srcsetStrings) {
      const candidates = srcset
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      for (const cand of candidates) {
        const parts = cand.split(/\s+/);
        const urlPart = parts[0];
        const desc = parts[1] || '';
        let w = 0;
        let h = 0;
        if (desc.endsWith('w')) {
          w = parseInt(desc, 10) || 0;
          if (w > 0 && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
            h = Math.round((w * imgEl.naturalHeight) / imgEl.naturalWidth);
          }
        }
        addVersion(urlPart, w, h, '');
      }
    }

    // 3. Current img src
    const currentUrl = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src') || '';
    if (currentUrl) {
      addVersion(
        currentUrl,
        imgEl.naturalWidth || imgEl.width || 0,
        imgEl.naturalHeight || imgEl.height || 0,
        ''
      );
    }

    // Sort by width descending
    versions.sort((a, b) => (b.width || 0) - (a.width || 0));

    // Assign clean labels ("Original", "Large", "Thumbnail") when multiple versions exist (Requirement #8)
    if (versions.length === 1) {
      versions[0].label = 'Original';
      if (versions[0].width && versions[0].height) {
        versions[0].quality = `${versions[0].width} × ${versions[0].height}`;
      }
    } else if (versions.length > 1) {
      versions.forEach((v, idx) => {
        const role =
          idx === 0
            ? 'Original'
            : idx === versions.length - 1
            ? 'Thumbnail'
            : idx === 1
            ? 'Large'
            : `Medium`;
        v.label = role;
        v.quality =
          v.width && v.height
            ? `${role} (${v.width} × ${v.height})`
            : v.width
            ? `${role} (${v.width}w)`
            : role;
      });
    }

    return versions;
  }

  // --- YouTube / Video Website Inspection (Requirement #6 & #17) ---

  function extractYouTubePageInfo() {
    const host = window.location.hostname.toLowerCase();
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) return null;

    let videoId = '';
    const u = new URL(window.location.href);
    videoId = u.searchParams.get('v') || '';
    if (!videoId) {
      const m = u.pathname.match(/\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) videoId = m[1];
    }
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('h1.title') ||
      document.querySelector('meta[name="title"]');
    const rawTitle = titleEl
      ? titleEl.textContent || titleEl.getAttribute('content') || document.title
      : document.title;
    const title = cleanTitle(rawTitle);

    const videoOptions = [
      {
        url: `https://www.youtube.com/watch?v=${videoId}&dlx_quality=1080p`,
        quality: '1080p Full HD',
        format: 'MP4',
        mimeType: 'video/mp4',
        fileSize: 0,
        height: 1080,
        width: 1920,
        kind: 'video',
      },
      {
        url: `https://www.youtube.com/watch?v=${videoId}&dlx_quality=720p`,
        quality: '720p HD',
        format: 'MP4',
        mimeType: 'video/mp4',
        fileSize: 0,
        height: 720,
        width: 1280,
        kind: 'video',
      },
      {
        url: `https://www.youtube.com/watch?v=${videoId}&dlx_quality=480p`,
        quality: '480p SD',
        format: 'MP4',
        mimeType: 'video/mp4',
        fileSize: 0,
        height: 480,
        width: 854,
        kind: 'video',
      },
      {
        url: `https://www.youtube.com/watch?v=${videoId}&dlx_quality=360p`,
        quality: '360p',
        format: 'MP4',
        mimeType: 'video/mp4',
        fileSize: 0,
        height: 360,
        width: 640,
        kind: 'video',
      },
    ];

    const audioOptions = [
      {
        url: `https://www.youtube.com/watch?v=${videoId}&dlx_quality=audio`,
        quality: 'Original Audio (M4A)',
        format: 'M4A',
        mimeType: 'audio/mp4',
        fileSize: 0,
        kind: 'audio',
      },
    ];

    const thumbnailOptions = [
      {
        url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        label: 'Max Resolution Thumbnail',
        quality: '1280 × 720',
        format: 'JPEG',
        mimeType: 'image/jpeg',
        kind: 'image',
      },
      {
        url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        label: 'Standard Thumbnail',
        quality: '480 × 360',
        format: 'JPEG',
        mimeType: 'image/jpeg',
        kind: 'image',
      },
    ];

    return {
      videoId,
      title,
      videoOptions,
      audioOptions,
      thumbnailOptions,
    };
  }

  // --- Main Scan Routine ---

  function performMediaScan() {
    scanScheduled = false;
    if (window.location.href !== lastKnownLocationHref) {
      lastKnownLocationHref = window.location.href;
      networkMetaMap.clear();
      detectedItemsMap.clear();
    }
    const activeIds = new Set();
    const pageMetaVideos = harvestPerformanceAndMetaMedia();

    // 1. Scan <video> elements (including inside open Shadow DOMs)
    if (settings.detectVideos !== false) {
      const videos = queryAllDeep('video');
      const ytInfo = extractYouTubePageInfo();

      for (const videoEl of videos) {
        let id = elementToItemId.get(videoEl);
        if (!id) {
          id = `dlx_video_${Math.random().toString(36).slice(2, 9)}`;
          elementToItemId.set(videoEl, id);
        }

        const { videoOptions: rawVideoOptions, audioOptions: rawAudioOptions } = extractVideoOptions(videoEl, pageMetaVideos);
        const nonPatternOptions = rawVideoOptions.filter(
          (o) => !o.url.includes('__DLX_SEG_') && !o.url.includes('googlevideo.com/videoplayback')
        );
        const videoOptions = ytInfo
          ? [...ytInfo.videoOptions]
          : nonPatternOptions.length > 0
          ? nonPatternOptions
          : rawVideoOptions;
        const audioOptions = ytInfo
          ? [...ytInfo.audioOptions]
          : rawAudioOptions.filter((o) => !o.url.includes('googlevideo.com/videoplayback'));

        const currentSrc = videoEl.currentSrc || videoEl.src || videoEl.getAttribute('src') || '';
        const posterAttr = videoEl.getAttribute('poster') || '';
        const rect = videoEl.getBoundingClientRect ? videoEl.getBoundingClientRect() : { width: 0, height: 0 };
        const isVisibleVideo = (rect.width >= 100 && rect.height >= 60) || videoEl.videoWidth > 0;

        // Skip hidden/empty uninitialized video placeholders only if they aren't visible and have no src/options
        if (!currentSrc && videoOptions.length === 0 && !ytInfo && !posterAttr && !isVisibleVideo) {
          continue;
        }

        const isEmeProtected = Boolean(videoEl.mediaKeys) && !ytInfo;
        const isBlobOnly = videoOptions.length === 0 && (currentSrc.startsWith('blob:') || !currentSrc);
        const isProtected = isEmeProtected || isBlobOnly;

        const primaryUrl = (videoOptions[0] && videoOptions[0].url) || (!currentSrc.startsWith('blob:') ? currentSrc : '') || '';
        const title = ytInfo ? ytInfo.title : findElementTitle(videoEl, primaryUrl);
        const duration = formatDuration(videoEl.duration);
        const durationSeconds =
          Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? Math.round(videoEl.duration) : 0;
        const resHeight = (ytInfo ? 1080 : 0) || videoEl.videoHeight || (videoOptions[0] && videoOptions[0].height) || 0;
        const resolution = ytInfo
          ? '1080p Full HD'
          : videoEl.videoWidth && videoEl.videoHeight
          ? `${videoEl.videoWidth} × ${videoEl.videoHeight}`
          : heightToQualityLabel(resHeight) || (videoOptions[0] && videoOptions[0].quality) || 'Video';

        const primaryOpt = videoOptions[0] || null;
        const format = (primaryOpt && primaryOpt.format) || inferFormatLabel(primaryUrl) || 'MP4';
        const mimeType = (primaryOpt && primaryOpt.mimeType) || 'video/mp4';
        const fileSize = (primaryOpt && primaryOpt.fileSize) || 0;

        // Build thumbnail options (e.g. YouTube thumbnail or video poster attribute)
        const thumbnailOptions = ytInfo ? [...ytInfo.thumbnailOptions] : [];
        if (posterAttr && !ytInfo) {
          const posterUrl = normalizeAbsoluteUrl(posterAttr);
          if (posterUrl) {
            thumbnailOptions.push({
              url: posterUrl,
              label: 'Video Poster Image',
              quality: 'Thumbnail',
              format: inferFormatLabel(posterUrl) || 'JPEG',
              mimeType: 'image/jpeg',
              kind: 'image',
            });
          }
        }

        const item = {
          id,
          mediaType: 'video',
          title,
          duration,
          durationSeconds,
          resolution,
          format,
          mimeType,
          fileSize,
          hasVideo: true,
          hasAudio: videoEl.mozHasAudio !== false,
          protected: isProtected,
          protectedMessage: isEmeProtected
            ? 'This media is DRM-protected and unavailable for download.'
            : isProtected
            ? 'Start playing the video or click Refresh to detect the video stream.'
            : '',
          url: primaryOpt ? primaryOpt.url : '',
          filename: buildSafeFilename(title, format, primaryOpt ? primaryOpt.quality : '', primaryUrl),
          videoOptions,
          audioOptions,
          thumbnailOptions,
          sourcePageUrl: window.location.href,
          sourcePageTitle: document.title,
        };

        detectedItemsMap.set(id, item);
        activeIds.add(id);
      }

      // If no <video> DOM element was found in this frame, but ytInfo or OpenGraph/JSON-LD or networkMetaMap has video URLs:
      if (videos.length === 0 && ytInfo) {
        const id = `dlx_yt_${ytInfo.videoId}`;
        const primaryOpt = ytInfo.videoOptions[0];
        const item = {
          id,
          mediaType: 'video',
          title: ytInfo.title,
          duration: '',
          resolution: primaryOpt.quality || '1080p Full HD',
          format: 'MP4',
          mimeType: 'video/mp4',
          fileSize: 0,
          hasVideo: true,
          hasAudio: true,
          protected: false,
          protectedMessage: '',
          url: primaryOpt.url,
          filename: buildSafeFilename(ytInfo.title, 'MP4', primaryOpt.quality, primaryOpt.url),
          videoOptions: [...ytInfo.videoOptions],
          audioOptions: [...ytInfo.audioOptions],
          thumbnailOptions: [...ytInfo.thumbnailOptions],
          sourcePageUrl: window.location.href,
          sourcePageTitle: document.title,
        };
        detectedItemsMap.set(id, item);
        activeIds.add(id);
      } else if (videos.length === 0 && (pageMetaVideos.length > 0 || networkMetaMap.size > 0)) {
        const { videoOptions, audioOptions } = extractVideoOptions(null, pageMetaVideos);
        if (videoOptions.length > 0) {
          const id = 'dlx_page_meta_video';
          const primaryOpt = videoOptions[0];
          const title = cleanTitle(document.title, primaryOpt.url);
          const item = {
            id,
            mediaType: 'video',
            title,
            duration: '',
            resolution: primaryOpt.quality || 'Original',
            format: primaryOpt.format || 'MP4',
            mimeType: primaryOpt.mimeType || 'video/mp4',
            fileSize: primaryOpt.fileSize || 0,
            hasVideo: true,
            hasAudio: true,
            protected: false,
            protectedMessage: '',
            url: primaryOpt.url,
            filename: buildSafeFilename(title, primaryOpt.format || 'mp4', primaryOpt.quality || '', primaryOpt.url),
            videoOptions,
            audioOptions,
            thumbnailOptions: [],
            sourcePageUrl: window.location.href,
            sourcePageTitle: document.title,
          };
          detectedItemsMap.set(id, item);
          activeIds.add(id);
        }
      }
    }

    // 2. Scan standalone <audio> elements (not already paired inside a video container)
    if (settings.detectAudio !== false) {
      const audios = queryAllDeep('audio');
      for (const audioEl of audios) {
        const pairedVideo = audioEl.closest('[data-media-container], figure, .video-player')?.querySelector('video');
        if (pairedVideo) continue;

        let id = elementToItemId.get(audioEl);
        if (!id) {
          id = `dlx_audio_${Math.random().toString(36).slice(2, 9)}`;
          elementToItemId.set(audioEl, id);
        }

        const audioOptions = [];
        const seen = new Set();
        const addAudioSrc = (rawUrl, labelHint, typeHint) => {
          const absUrl = normalizeAbsoluteUrl(rawUrl);
          if (!absUrl || absUrl.startsWith('blob:') || seen.has(absUrl)) return;
          seen.add(absUrl);
          const netMeta = networkMetaMap.get(absUrl);
          const mimeType =
            (netMeta && netMeta.mimeType) ||
            (typeHint ? typeHint.split(';')[0].trim() : '') ||
            inferMimeFromFormat(inferFormatLabel(absUrl), 'audio') ||
            'audio/mpeg';
          const format = inferFormatLabel(absUrl, mimeType) || 'MP3';
          const fileSize = (netMeta && netMeta.fileSize) || 0;
          const quality =
            labelHint ||
            extractQualityFromTextOrUrl(absUrl) ||
            (audioOptions.length === 0 ? 'Original' : `Standard`);
          audioOptions.push({
            url: absUrl,
            quality,
            format,
            mimeType,
            fileSize,
            kind: 'audio',
          });
        };

        for (const s of Array.from(audioEl.querySelectorAll('source'))) {
          addAudioSrc(
            s.getAttribute('src') || s.src,
            s.getAttribute('label') || s.getAttribute('data-quality') || '',
            s.getAttribute('type') || ''
          );
        }
        if (audioEl.currentSrc) addAudioSrc(audioEl.currentSrc, '', '');
        if (audioEl.getAttribute('src')) addAudioSrc(audioEl.getAttribute('src'), '', '');

        const currentSrc = audioEl.currentSrc || audioEl.getAttribute('src') || '';
        const isProtected = Boolean(audioEl.mediaKeys) || (currentSrc.startsWith('blob:') && audioOptions.length === 0);

        if (!currentSrc && audioOptions.length === 0) continue;

        const primaryOpt = audioOptions[0] || null;
        const primaryUrl = (primaryOpt && primaryOpt.url) || currentSrc;
        const title = findElementTitle(audioEl, primaryUrl);
        const format = (primaryOpt && primaryOpt.format) || inferFormatLabel(primaryUrl) || 'MP3';
        const mimeType = (primaryOpt && primaryOpt.mimeType) || 'audio/mpeg';
        const fileSize = (primaryOpt && primaryOpt.fileSize) || 0;

        const item = {
          id,
          mediaType: 'audio',
          title,
          duration: formatDuration(audioEl.duration),
          resolution: (primaryOpt && primaryOpt.quality) || 'Original',
          format,
          mimeType,
          fileSize,
          hasVideo: false,
          hasAudio: true,
          protected: isProtected,
          protectedMessage: isProtected
            ? 'This media is protected or unavailable for download.'
            : '',
          url: primaryOpt ? primaryOpt.url : '',
          filename: buildSafeFilename(title, format, '', primaryUrl),
          videoOptions: [],
          audioOptions,
          thumbnailOptions: [],
          sourcePageUrl: window.location.href,
          sourcePageTitle: document.title,
        };

        detectedItemsMap.set(id, item);
        activeIds.add(id);
      }
    }

    // 3. Scan qualifying <img> elements (Requirement #2 & #8)
    if (settings.detectImages !== false) {
      const images = queryAllDeep('img');
      for (const imgEl of images) {
        const currentUrl = normalizeAbsoluteUrl(
          imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src') || ''
        );
        if (isLikelyUiAssetOrTinyImage(imgEl, currentUrl)) {
          continue;
        }

        let id = elementToItemId.get(imgEl);
        if (!id) {
          id = `dlx_img_${Math.random().toString(36).slice(2, 9)}`;
          elementToItemId.set(imgEl, id);
        }

        const imageOptions = extractImageOptions(imgEl);
        if (imageOptions.length === 0) continue;

        const primaryOpt = imageOptions[0];
        const title = findElementTitle(imgEl, primaryOpt.url);
        const w = primaryOpt.width || imgEl.naturalWidth || imgEl.width || 0;
        const h = primaryOpt.height || imgEl.naturalHeight || imgEl.height || 0;
        const resolution = w && h ? `${w} × ${h}` : primaryOpt.quality;

        const item = {
          id,
          mediaType: 'image',
          title,
          duration: '',
          resolution,
          format: primaryOpt.format || 'JPEG',
          mimeType: primaryOpt.mimeType || 'image/jpeg',
          fileSize: primaryOpt.fileSize || 0,
          hasVideo: false,
          hasAudio: false,
          protected: false,
          protectedMessage: '',
          url: primaryOpt.url,
          filename: buildSafeFilename(title, primaryOpt.format || 'jpg', '', primaryOpt.url),
          videoOptions: [],
          audioOptions: [],
          imageOptions,
          thumbnailOptions: [],
          sourcePageUrl: window.location.href,
          sourcePageTitle: document.title,
        };

        detectedItemsMap.set(id, item);
        activeIds.add(id);
      }
    }

    // 4. Scan direct media & torrent links (<a href="...mp4|.mp3|.torrent|magnet:?">)
    const links = queryAllDeep('a[href]');
    for (const aEl of links) {
      const rawHref = aEl.getAttribute('href') || '';
      const absUrl = normalizeAbsoluteUrl(rawHref);
      if (!absUrl) continue;

      const lower = absUrl.toLowerCase();
      const isMagnet = lower.startsWith('magnet:?');
      const isTorrentFile = lower.endsWith('.torrent') || lower.includes('.torrent?');
      const isDirectVideo =
        settings.detectVideos !== false && /\.(mp4|webm|mkv|mov)(\?[^#]*)?$/i.test(lower);
      const isDirectAudio =
        settings.detectAudio !== false && /\.(mp3|wav|m4a|ogg|flac)(\?[^#]*)?$/i.test(lower);

      if (!isMagnet && !isTorrentFile && !isDirectVideo && !isDirectAudio) {
        continue;
      }

      // Skip if this URL is already part of an existing <video> or <audio> item
      let alreadyIncluded = false;
      for (const existingItem of detectedItemsMap.values()) {
        if (existingItem.url === absUrl) {
          alreadyIncluded = true;
          break;
        }
        if (
          existingItem.videoOptions &&
          existingItem.videoOptions.some((o) => o.url === absUrl)
        ) {
          alreadyIncluded = true;
          break;
        }
        if (
          existingItem.audioOptions &&
          existingItem.audioOptions.some((o) => o.url === absUrl)
        ) {
          alreadyIncluded = true;
          break;
        }
      }
      if (alreadyIncluded) continue;

      let id = elementToItemId.get(aEl);
      if (!id) {
        id = `dlx_link_${Math.random().toString(36).slice(2, 9)}`;
        elementToItemId.set(aEl, id);
      }

      const mediaType = isMagnet || isTorrentFile ? 'torrent' : isDirectVideo ? 'video' : 'audio';
      const format = isMagnet ? 'MAGNET' : isTorrentFile ? 'TORRENT' : inferFormatLabel(absUrl);
      const mimeType =
        isMagnet || isTorrentFile
          ? 'application/x-bittorrent'
          : inferMimeFromFormat(format, mediaType);
      const netMeta = networkMetaMap.get(absUrl);
      const fileSize = (netMeta && netMeta.fileSize) || 0;
      const linkText = (aEl.textContent || '').replace(/\s+/g, ' ').trim();
      const title =
        linkText && linkText.length > 2 && !/^(download|link|click here|magnet|torrent)$/i.test(linkText)
          ? linkText
          : cleanTitle('', absUrl);
      const quality = extractQualityFromTextOrUrl(linkText) || extractQualityFromTextOrUrl(absUrl) || 'Original';

      const item = {
        id,
        mediaType,
        title,
        duration: '',
        resolution: isMagnet || isTorrentFile ? 'BitTorrent P2P' : quality,
        format,
        mimeType,
        fileSize,
        hasVideo: mediaType === 'video',
        hasAudio: mediaType === 'video' || mediaType === 'audio',
        protected: false,
        protectedMessage: '',
        url: absUrl,
        filename:
          isMagnet || isTorrentFile
            ? undefined
            : buildSafeFilename(title, format, quality, absUrl),
        videoOptions:
          mediaType === 'video'
            ? [{ url: absUrl, quality, format, mimeType, fileSize, kind: 'video' }]
            : [],
        audioOptions:
          mediaType === 'audio'
            ? [{ url: absUrl, quality, format, mimeType, fileSize, kind: 'audio' }]
            : [],
        imageOptions: [],
        thumbnailOptions: [],
        sourcePageUrl: window.location.href,
        sourcePageTitle: document.title,
      };

      detectedItemsMap.set(id, item);
      activeIds.add(id);
    }

    // Remove stale items no longer in DOM
    for (const key of Array.from(detectedItemsMap.keys())) {
      if (!activeIds.has(key)) {
        detectedItemsMap.delete(key);
      }
    }

    // Sort so Videos always appear FIRST, then Audio, then Torrents, then Images
    const priorityOrder = { video: 0, audio: 1, torrent: 2, image: 3 };
    const itemsArray = Array.from(detectedItemsMap.values()).sort((a, b) => {
      const pa = priorityOrder[a.mediaType] ?? 4;
      const pb = priorityOrder[b.mediaType] ?? 4;
      return pa - pb;
    });

    // Expose to media-overlay.js
    window.__dlxDetectedMedia = itemsArray;
    window.__dlxElementToItemId = elementToItemId;
    window.__dlxDetectedMediaMap = detectedItemsMap;
    window.dispatchEvent(new CustomEvent('dlx:media-updated', { detail: { items: itemsArray, settings } }));

    // Report to service worker for badge & popup
    try {
      chrome.runtime.sendMessage({
        type: 'dlx:report-media',
        items: itemsArray,
      }).catch(() => {});
    } catch {}
  }

  function scheduleMediaScan(delayMs = 300) {
    if (scanScheduled) return;
    scanScheduled = true;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      requestAnimationFrame(performMediaScan);
    }, delayMs);
  }

  // --- Phase 7: Optional Magnet & .torrent Click Interception ---
  document.addEventListener(
    'click',
    (e) => {
      if (!settings.autoInterceptDownloads) return;
      const target = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!target) return;
      const rawHref = target.getAttribute('href') || '';
      if (!rawHref.toLowerCase().startsWith('magnet:?')) return;

      e.preventDefault();
      e.stopPropagation();

      chrome.runtime
        .sendMessage({
          type: 'dlx:send-download',
          payload: {
            type: 'addDownload',
            url: rawHref,
            mediaType: 'torrent',
            sourcePageUrl: window.location.href,
            sourcePageTitle: document.title,
          },
        })
        .then((res) => {
          window.dispatchEvent(
            new CustomEvent('dlx:toast-event', {
              detail:
                res && res.ok
                  ? {
                      title: 'Magnet Sent to DLX',
                      message: 'Confirm BitTorrent download in DLX.',
                      toastType: 'success',
                    }
                  : {
                      title: 'DLX Offline',
                      message: 'Please launch the DLX desktop app first.',
                      toastType: 'error',
                    },
            })
          );
        })
        .catch(() => {});
    },
    true
  );

  // --- Event Listeners for Dynamic Media ---

  document.addEventListener(
    'loadedmetadata',
    () => {
      scheduleMediaScan(120);
    },
    true
  );

  document.addEventListener(
    'canplay',
    () => {
      scheduleMediaScan(120);
    },
    true
  );

  document.addEventListener(
    'play',
    () => {
      scheduleMediaScan(120);
    },
    true
  );

  window.addEventListener('yt-navigate-finish', () => {
    networkMetaMap.clear();
    detectedItemsMap.clear();
    scheduleMediaScan(250);
  });

  window.addEventListener('popstate', () => {
    scheduleMediaScan(250);
  });

  document.addEventListener(
    'load',
    (e) => {
      if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
        scheduleMediaScan(350);
      }
    },
    true
  );

  // Lightweight debounced MutationObserver for SPA / dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    let relevant = false;
    for (const m of mutations) {
      if (m.type === 'attributes') {
        relevant = true;
        break;
      }
      if (m.addedNodes && m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (
              tag === 'VIDEO' ||
              tag === 'AUDIO' ||
              tag === 'IMG' ||
              tag === 'SOURCE' ||
              tag === 'PICTURE' ||
              tag === 'IFRAME' ||
              (node.querySelector && node.querySelector('video, audio, img, a[href^="magnet:"]'))
            ) {
              relevant = true;
              break;
            }
          }
        }
      }
      if (relevant) break;
    }
    if (relevant) {
      scheduleMediaScan(400);
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'poster', 'data-src', 'data-video-src'],
    });
  }

  // Listen to Service Worker messages
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === 'dlx:request-media-scan') {
      if (message.netMeta && typeof message.netMeta === 'object') {
        for (const [u, meta] of Object.entries(message.netMeta)) {
          networkMetaMap.set(u, meta);
        }
      }
      performMediaScan();
      sendResponse({ ok: true, items: Array.from(detectedItemsMap.values()) });
      return false;
    }

    if (message.type === 'dlx:network-meta' && message.meta && message.meta.url) {
      networkMetaMap.set(message.meta.url, message.meta);
      scheduleMediaScan(200);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'dlx:settings-changed' && message.settings) {
      settings = { ...settings, ...message.settings };
      performMediaScan();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'dlx:lookup-element-by-src' && message.srcUrl) {
      const targetUrl = normalizeAbsoluteUrl(message.srcUrl);
      for (const item of detectedItemsMap.values()) {
        if (
          item.url === targetUrl ||
          (item.videoOptions && item.videoOptions.some((o) => o.url === targetUrl)) ||
          (item.imageOptions && item.imageOptions.some((o) => o.url === targetUrl))
        ) {
          sendResponse({
            filename: item.filename,
            mimeType: item.mimeType,
            quality: item.resolution,
            resolution: item.resolution,
            fileSize: item.fileSize,
            protected: item.protected,
            bestUrl: item.url,
          });
          return false;
        }
      }
      sendResponse(null);
      return false;
    }

    if (message.type === 'dlx:show-toast') {
      window.dispatchEvent(
        new CustomEvent('dlx:toast-event', {
          detail: {
            title: message.title,
            message: message.message,
            toastType: message.toastType,
            extraData: message.extraData,
          },
        })
      );
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  // Initial load: fetch settings and network metadata, then run initial scan
  (async () => {
    try {
      const sRes = await chrome.runtime.sendMessage({ type: 'dlx:get-settings' });
      if (sRes && sRes.settings) {
        settings = { ...settings, ...sRes.settings };
      }
      const nRes = await chrome.runtime.sendMessage({ type: 'dlx:get-net-meta' });
      if (nRes && nRes.netMeta) {
        for (const [u, meta] of Object.entries(nRes.netMeta)) {
          networkMetaMap.set(u, meta);
        }
      }
    } catch {}
    performMediaScan();
  })();
})();
