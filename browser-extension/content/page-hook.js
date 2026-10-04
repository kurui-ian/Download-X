/**
 * DLX Browser Extension — Page-Context (MAIN World) Media Stream Hook
 *
 * Passively observes fetch, XMLHttpRequest, URL.createObjectURL(Blob), performance entries,
 * and player instances (HLS.js, JWPlayer, Plyr, Video.js, Artplayer, DPlayer) in the page's
 * MAIN JavaScript context to detect:
 * - HLS (.m3u8) master & variant playlists (even when served from .php, .txt, or blob: URLs)
 * - Direct MP4/WebM/MKV video URLs returned in JSON player configs or HTTP range streams
 * - Sequential HLS (.ts) segment streams on already-open tabs where the initial manifest aged out
 *
 * Does NOT circumvent DRM (Widevine, PlayReady, FairPlay, SAMPLE-AES).
 */

(() => {
  if (window.__dlxPageHookInitialized) return;
  window.__dlxPageHookInitialized = true;

  const reportedKeys = new Set();
  const probedPerfUrls = new Set();
  let foundAnyPrimaryStream = false;

  function postStreamToContentScript(payload) {
    if (!payload || !payload.url) return;
    if (payload.url.startsWith('blob:') || payload.url.startsWith('javascript:')) return;
    if (!payload.isSegmentPattern) {
      foundAnyPrimaryStream = true;
    }
    const key = `${payload.url}|${payload.quality || ''}`;
    if (reportedKeys.has(key)) return;
    reportedKeys.add(key);

    try {
      window.postMessage(
        {
          __dlxPageHook: true,
          stream: payload,
        },
        '*'
      );
    } catch {}
  }

  function resolveUrl(rawUrl, baseUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return '';
    try {
      return new URL(trimmed, baseUrl || window.location.href).toString();
    } catch {
      return '';
    }
  }

  function heightToLabel(h) {
    if (!h || h <= 0) return '';
    if (h >= 2160) return '2160p';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    if (h >= 360) return '360p';
    if (h >= 240) return '240p';
    return `${h}p`;
  }

  function parseAndReportM3u8(m3u8Text, sourceUrl) {
    if (!m3u8Text || typeof m3u8Text !== 'string') return;
    const text = m3u8Text.trim();
    if (!text.startsWith('#EXTM3U')) return;

    // Respect DRM: skip SAMPLE-AES / Widevine / FairPlay / PlayReady encrypted manifests
    if (
      /METHOD=SAMPLE-AES/i.test(text) ||
      /com\.apple\.streamingkeydelivery/i.test(text) ||
      /urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed/i.test(text) ||
      /com\.widevine\.alpha/i.test(text)
    ) {
      return;
    }

    const baseUrl =
      sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))
        ? sourceUrl
        : window.location.href;

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let foundVariants = 0;

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

        const variantUrl = resolveUrl(nextUri, baseUrl);
        if (!variantUrl || variantUrl.startsWith('blob:')) continue;

        let width = 0;
        let height = 0;
        let bandwidth = 0;
        let nameLabel = '';

        const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resMatch) {
          width = parseInt(resMatch[1], 10) || 0;
          height = parseInt(resMatch[2], 10) || 0;
        }
        const bwMatch = attrs.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
        if (bwMatch) {
          bandwidth = parseInt(bwMatch[1], 10) || 0;
        }
        const nameMatch = attrs.match(/NAME="([^"]+)"/i);
        if (nameMatch) {
          nameLabel = nameMatch[1].trim();
        }

        const quality =
          heightToLabel(height) ||
          (/^\d{3,4}p$/i.test(nameLabel) ? nameLabel.toLowerCase() : '') ||
          nameLabel ||
          'Original';

        foundVariants++;
        postStreamToContentScript({
          url: variantUrl,
          mediaType: 'video',
          format: 'MP4',
          mimeType: 'application/vnd.apple.mpegurl',
          quality,
          width: width || undefined,
          height: height || undefined,
          bandwidth: bandwidth || undefined,
          isHls: true,
        });
      }
    }

    // If it is a media playlist (contains #EXTINF segments) or master playlist with HTTP URL
    if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
      if (foundVariants === 0) {
        let totalDuration = 0;
        for (const l of lines) {
          if (l.startsWith('#EXTINF:')) {
            const dur = parseFloat(l.slice('#EXTINF:'.length).split(',')[0]);
            if (Number.isFinite(dur) && dur > 0) totalDuration += dur;
          }
        }
        postStreamToContentScript({
          url: sourceUrl,
          mediaType: 'video',
          format: 'MP4',
          mimeType: 'application/vnd.apple.mpegurl',
          quality: '',
          durationSeconds: totalDuration > 0 ? Math.round(totalDuration) : undefined,
          isHls: true,
        });
      }
    }
  }

  function inspectJsonForStreams(obj, baseUrl, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        inspectJsonForStreams(item, baseUrl, depth + 1);
      }
      return;
    }

    // Check HLS.js level object shape: { url: [...], height: 1080, width: 1920, bitrate: 2500000 }
    if (obj.height && obj.bitrate && (obj.url || obj.uri)) {
      const rawLevelUrl = Array.isArray(obj.url) ? obj.url[0] : obj.url || obj.uri;
      if (typeof rawLevelUrl === 'string' && rawLevelUrl.startsWith('http')) {
        postStreamToContentScript({
          url: rawLevelUrl,
          mediaType: 'video',
          format: 'MP4',
          mimeType: 'application/vnd.apple.mpegurl',
          quality: heightToLabel(obj.height) || 'Original',
          width: obj.width || undefined,
          height: obj.height || undefined,
          bandwidth: obj.bitrate || undefined,
          isHls: true,
        });
      }
    }

    // Check common player source object shape: { file/src/url: "...", label/quality/res: "...", type: "..." }
    const rawCandidate = obj.file || obj.src || obj.url || obj.stream || obj.hls || obj.mp4 || obj.videoUrl;
    if (typeof rawCandidate === 'string' && rawCandidate.length > 4) {
      const abs = resolveUrl(rawCandidate, baseUrl);
      if (abs && (abs.startsWith('http://') || abs.startsWith('https://'))) {
        const lower = abs.toLowerCase();
        // Skip YouTube c=WEB googlevideo.com URLs (handled cleanly via YouTube Innertube resolver)
        if (lower.includes('googlevideo.com')) return;

        const typeStr = String(obj.type || obj.mime || '').toLowerCase();
        const isHls =
          lower.includes('.m3u8') ||
          typeStr.includes('mpegurl') ||
          typeStr === 'hls' ||
          lower.includes('/hls/') ||
          lower.includes('master.txt') ||
          lower.includes('playlist');
        const isDirectVideo =
          /\.(mp4|webm|mkv|mov|m4v)(\?|$)/i.test(lower) ||
          typeStr.startsWith('video/') ||
          typeStr === 'mp4' ||
          lower.includes('mime=video');

        if (isHls || isDirectVideo) {
          const rawLabel = String(obj.label || obj.quality || obj.res || obj.resolution || obj.size || '').trim();
          const numRes = parseInt(rawLabel, 10);
          const quality =
            numRes >= 144 && numRes <= 4320
              ? heightToLabel(numRes)
              : rawLabel || '';
          postStreamToContentScript({
            url: abs,
            mediaType: 'video',
            format: lower.includes('.webm') ? 'WebM' : lower.includes('.mkv') ? 'MKV' : 'MP4',
            mimeType: isHls ? 'application/vnd.apple.mpegurl' : 'video/mp4',
            quality,
            isHls,
          });
        }
      }
    }

    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        inspectJsonForStreams(val, baseUrl, depth + 1);
      }
    }
  }

  function inspectPotentialTextPayload(text, sourceUrl) {
    if (!text || typeof text !== 'string' || text.length < 7) return;
    const trimmed = text.trim();
    if (trimmed.startsWith('#EXTM3U')) {
      parseAndReportM3u8(trimmed, sourceUrl);
      return true;
    }
    if (
      (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
      trimmed.length < 500000 &&
      (trimmed.includes('.m3u8') ||
        trimmed.includes('.mp4') ||
        trimmed.includes('videoplayback') ||
        trimmed.includes('"sources"') ||
        trimmed.includes('"file"') ||
        trimmed.includes('"hls"'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        inspectJsonForStreams(parsed, sourceUrl);
        return true;
      } catch {}
    }
    return false;
  }

  const origFetch = window.fetch;

  // 1. Hook window.fetch
  try {
    if (typeof origFetch === 'function') {
      window.fetch = async function (...args) {
        let reqUrl = '';
        try {
          const input = args[0];
          reqUrl = typeof input === 'string' ? input : input && input.url ? input.url : '';
          reqUrl = resolveUrl(reqUrl, window.location.href);
        } catch {}

        const response = await origFetch.apply(this, args);

        try {
          const finalUrl = response.url || reqUrl;
          const ct = (response.headers && response.headers.get('content-type')) || '';
          const lowerCt = ct.toLowerCase();
          const lowerUrl = (finalUrl || '').toLowerCase();

          if (
            lowerUrl.includes('.m3u8') ||
            lowerCt.includes('mpegurl') ||
            lowerCt.includes('json') ||
            lowerCt.includes('text/') ||
            lowerCt.includes('octet-stream') ||
            /\/(play|stream|source|manifest|master|playlist|hls|embed|video|ajax|api)/i.test(lowerUrl)
          ) {
            const cl = parseInt((response.headers && response.headers.get('content-length')) || '0', 10);
            if (!cl || cl < 1.5 * 1024 * 1024) {
              response
                .clone()
                .text()
                .then((text) => inspectPotentialTextPayload(text, finalUrl))
                .catch(() => {});
            }
          }
        } catch {}

        return response;
      };
    }
  } catch {}

  // 2. Hook XMLHttpRequest
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        this.__dlxReqUrl = resolveUrl(String(url || ''), window.location.href);
      } catch {}
      return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      try {
        this.addEventListener('load', function () {
          try {
            const finalUrl = this.responseURL || this.__dlxReqUrl || window.location.href;
            const ct = (this.getResponseHeader('content-type') || '').toLowerCase();
            if (!this.responseType || this.responseType === 'text') {
              const text = this.responseText;
              if (text && text.length < 2 * 1024 * 1024) {
                inspectPotentialTextPayload(text, finalUrl);
              }
            } else if (this.responseType === 'json' && this.response) {
              inspectJsonForStreams(this.response, finalUrl);
            } else if (
              this.responseType === 'arraybuffer' &&
              this.response instanceof ArrayBuffer &&
              this.response.byteLength > 7 &&
              this.response.byteLength < 512 * 1024
            ) {
              const firstBytes = new Uint8Array(this.response, 0, Math.min(16, this.response.byteLength));
              const headerStr = String.fromCharCode(...firstBytes);
              if (headerStr.includes('#EXTM3U')) {
                const fullText = new TextDecoder('utf-8').decode(this.response);
                parseAndReportM3u8(fullText, finalUrl);
              }
            } else if (ct.includes('mpegurl') && finalUrl.startsWith('http')) {
              postStreamToContentScript({
                url: finalUrl,
                mediaType: 'video',
                format: 'MP4',
                mimeType: 'application/vnd.apple.mpegurl',
                quality: '',
                isHls: true,
              });
            }
          } catch {}
        });
      } catch {}
      return origSend.apply(this, args);
    };
  } catch {}

  // 3. Hook URL.createObjectURL for in-memory #EXTM3U Blob playlists
  try {
    const origCreateObjectURL = URL.createObjectURL;
    if (typeof origCreateObjectURL === 'function') {
      URL.createObjectURL = function (obj) {
        const blobUrl = origCreateObjectURL.apply(this, arguments);
        try {
          if (obj instanceof Blob && obj.size > 7 && obj.size < 2 * 1024 * 1024) {
            obj
              .text()
              .then((text) => {
                if (text && text.trim().startsWith('#EXTM3U')) {
                  parseAndReportM3u8(text, window.location.href);
                }
              })
              .catch(() => {});
          }
        } catch {}
        return blobUrl;
      };
    }
  } catch {}

  // Helper: Derive sequential segment template or parent .m3u8 from .ts segment entries
  function deriveFromSegmentEntries(tsEntries, videos) {
    if (!tsEntries || tsEntries.length === 0 || foundAnyPrimaryStream) return;

    const latestTs = tsEntries[tsEntries.length - 1].name;
    let parsedTs;
    try {
      parsedTs = new URL(latestTs);
    } catch {
      return;
    }

    const dirPath = parsedTs.pathname.slice(0, parsedTs.pathname.lastIndexOf('/') + 1);
    const fileName = parsedTs.pathname.slice(parsedTs.pathname.lastIndexOf('/') + 1);
    const search = parsedTs.search || '';
    const originDir = `${parsedTs.origin}${dirPath}`;

    const candidateM3u8s = [];
    // E.g. seg-14-v1-a1.ts -> index-v1-a1.m3u8, master.m3u8, index.m3u8
    const segSuffixMatch = fileName.match(/^seg-\d+(-[a-z0-9_-]+)\.ts$/i);
    if (segSuffixMatch) {
      candidateM3u8s.push(`${originDir}index${segSuffixMatch[1]}.m3u8${search}`);
    }
    candidateM3u8s.push(
      `${originDir}master.m3u8${search}`,
      `${originDir}index.m3u8${search}`,
      `${originDir}playlist.m3u8${search}`
    );

    if (typeof origFetch === 'function') {
      for (const cand of candidateM3u8s) {
        if (probedPerfUrls.has(cand)) continue;
        probedPerfUrls.add(cand);
        origFetch(cand, { credentials: 'include' })
          .then((r) => (r.ok ? r.text() : ''))
          .then((text) => {
            if (text && text.trim().startsWith('#EXTM3U')) {
              parseAndReportM3u8(text, cand);
            }
          })
          .catch(() => {});
      }
    }

    // Also build a sequential segment pattern fallback if at least 2 numbered segments exist
    // e.g. seg-12-v1-a1.ts -> seg-$DLX_SEG$-v1-a1.ts
    const numMatch = fileName.match(/^(.*?(?:seg|segment|part|chunk|frag)[-_]?)(\d+)(.*\.ts)$/i);
    if (numMatch) {
      const prefix = numMatch[1];
      const numStr = numMatch[2];
      const suffix = numMatch[3];
      const padLen = numStr.startsWith('0') && numStr.length > 1 ? numStr.length : 0;

      // Estimate total segments from video duration (~4s per segment default, or measured from entry timings)
      let durationSec = 0;
      let videoWidth = 0;
      let videoHeight = 0;
      if (videos && videos[0]) {
        if (Number.isFinite(videos[0].duration) && videos[0].duration > 0) {
          durationSec = Math.round(videos[0].duration);
        }
        videoWidth = videos[0].videoWidth || 0;
        videoHeight = videos[0].videoHeight || 0;
      }

      let avgSegBytes = 0;
      let sizeSamples = 0;
      for (const e of tsEntries) {
        const sz = e.decodedBodySize || e.encodedBodySize || e.transferSize || 0;
        if (sz > 10000) {
          avgSegBytes += sz;
          sizeSamples++;
        }
      }
      if (sizeSamples > 0) avgSegBytes = Math.round(avgSegBytes / sizeSamples);

      const estTotalSegments = durationSec > 0 ? Math.max(10, Math.ceil(durationSec / 4)) : 400;
      const estFileSize = avgSegBytes > 0 && durationSec > 0 ? avgSegBytes * estTotalSegments : 0;
      const patternUrl = `${originDir}${prefix}__DLX_SEG_${padLen}_${estTotalSegments}__${suffix}${search}`;

      postStreamToContentScript({
        url: patternUrl,
        mediaType: 'video',
        format: 'MP4',
        mimeType: 'video/mp2t',
        quality: heightToLabel(videoHeight) || 'Original',
        width: videoWidth || undefined,
        height: videoHeight || undefined,
        fileSize: estFileSize || undefined,
        isHls: true,
        isSegmentPattern: true,
      });
    }
  }

  // 4. Probe Global Player Instances & Already-Loaded Performance Resource Entries
  function probeGlobalPlayersAndPerformance() {
    // 4a. Check JWPlayer
    try {
      if (typeof window.jwplayer === 'function') {
        const jw = window.jwplayer();
        if (jw && typeof jw.getPlaylist === 'function') {
          const pl = jw.getPlaylist();
          if (pl) inspectJsonForStreams(pl, window.location.href);
        }
        if (jw && typeof jw.getPlaylistItem === 'function') {
          const item = jw.getPlaylistItem();
          if (item) inspectJsonForStreams(item, window.location.href);
        }
      }
    } catch {}

    // 4b. Check global Hls / player / art / dp objects
    try {
      for (const prop of ['hls', 'player', 'art', 'dp', 'ap', 'plyr']) {
        const inst = window[prop];
        if (!inst || typeof inst !== 'object') continue;
        if (typeof inst.url === 'string' && inst.url.startsWith('http')) {
          postStreamToContentScript({
            url: inst.url,
            mediaType: 'video',
            format: 'MP4',
            mimeType: inst.url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4',
            quality: '',
            isHls: inst.url.includes('.m3u8') || Boolean(inst.levels),
          });
        }
        if (Array.isArray(inst.levels)) {
          inspectJsonForStreams(inst.levels, inst.url || window.location.href);
        }
        if (inst.source) {
          inspectJsonForStreams(inst.source, window.location.href);
        }
        if (inst.options && inst.options.url) {
          inspectJsonForStreams({ file: inst.options.url }, window.location.href);
        }
      }
    } catch {}

    // 4c. Check DOM <video> elements for attached player instances (e.g. videoEl.hls, videoEl.plyr, videoEl.player)
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      try {
        for (const key of Object.keys(v)) {
          const val = v[key];
          if (!val || typeof val !== 'object') continue;
          if (typeof val.url === 'string' && val.url.startsWith('http')) {
            postStreamToContentScript({
              url: val.url,
              mediaType: 'video',
              format: 'MP4',
              mimeType: val.url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4',
              quality: '',
              isHls: true,
            });
          }
          if (Array.isArray(val.levels)) {
            inspectJsonForStreams(val.levels, val.url || window.location.href);
          }
        }
      } catch {}
    }

    // 4d. Retroactively inspect performance.getEntriesByType('resource') for tabs that were ALREADY open!
    try {
      if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function' && typeof origFetch === 'function') {
        const entries = performance.getEntriesByType('resource');
        const candidateManifestUrls = [];
        const tsSegmentEntries = [];

        for (const entry of entries) {
          const u = entry.name || '';
          if (!u || !u.startsWith('http')) continue;
          const lower = u.toLowerCase();

          if (/\.ts(\?|$)/i.test(lower) || lower.includes('seg-') || lower.includes('segment')) {
            if (/\.ts(\?|$)/i.test(lower)) {
              tsSegmentEntries.push(entry);
            }
            continue;
          }

          if (probedPerfUrls.has(u)) continue;

          // Skip static assets and individual video segments
          if (
            /\.(m4s|js|css|woff2?|ttf|png|jpe?g|gif|webp|svg|ico|vtt|srt)(\?|$)/i.test(lower) ||
            lower.includes('google-analytics') ||
            lower.includes('doubleclick') ||
            lower.includes('facebook.com') ||
            lower.includes('bytestart=')
          ) {
            continue;
          }

          if (lower.includes('.m3u8')) {
            probedPerfUrls.add(u);
            postStreamToContentScript({
              url: u,
              mediaType: 'video',
              format: 'MP4',
              mimeType: 'application/vnd.apple.mpegurl',
              quality: '',
              isHls: true,
            });
            candidateManifestUrls.push(u);
          } else if (
            videos.length > 0 &&
            (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch')
          ) {
            probedPerfUrls.add(u);
            candidateManifestUrls.push(u);
          }
        }

        // Probe up to 10 candidate XHR/fetch URLs to find #EXTM3U or JSON sources
        for (const candUrl of candidateManifestUrls.slice(-10)) {
          origFetch(candUrl, { credentials: 'include' })
            .then((r) => {
              const cl = parseInt((r.headers && r.headers.get('content-length')) || '0', 10);
              if (cl > 1.5 * 1024 * 1024) return '';
              return r.text();
            })
            .then((text) => {
              if (text) inspectPotentialTextPayload(text, candUrl);
            })
            .catch(() => {});
        }

        // If .ts segments are already playing in performance buffer, derive parent .m3u8 or segment template
        if (tsSegmentEntries.length > 0 && !foundAnyPrimaryStream) {
          setTimeout(() => {
            deriveFromSegmentEntries(tsSegmentEntries, videos);
          }, 250);
        }
      }
    } catch {}
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.__dlxProbePlayers) {
      probeGlobalPlayersAndPerformance();
    }
  });

  document.addEventListener('play', () => probeGlobalPlayersAndPerformance(), true);
  document.addEventListener('loadedmetadata', () => probeGlobalPlayersAndPerformance(), true);
  setTimeout(probeGlobalPlayersAndPerformance, 500);
})();
