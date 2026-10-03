import http from 'http';
import https from 'https';
import { URL } from 'url';
import path from 'path';
import { TaskCategory, UrlInspectionResult } from './types';
import { TorrentEngine } from './TorrentEngine';

export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.toLowerCase().startsWith('magnet:?')) {
    const match = trimmed.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
    if (match) {
      return `magnet:?xt=urn:btih:${match[1].toLowerCase()}`;
    }
    return trimmed.toLowerCase();
  }

  try {
    const parsed = new URL(trimmed);
    // Strip tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'si', 'feature', 'fbclid', 'gclid'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }

    let norm = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
    if (parsed.searchParams.has('v')) {
      norm += `?v=${parsed.searchParams.get('v')}`;
    } else if (parsed.searchParams.has('vid')) {
      norm += `?vid=${parsed.searchParams.get('vid')}`;
    } else if (parsed.search) {
      norm += parsed.search;
    }
    return norm;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function getRequestHeaders(targetUrl: string, customHeaders?: http.OutgoingHttpHeaders): http.OutgoingHttpHeaders {
  let origin = 'https://www.google.com';
  let referer = 'https://www.google.com/';

  try {
    const parsed = new URL(targetUrl);
    origin = `${parsed.protocol}//${parsed.host}`;
    const hostParts = parsed.hostname.split('.');
    const baseDomain = hostParts.length > 2 ? hostParts.slice(-2).join('.') : parsed.hostname;
    referer = `${parsed.protocol}//${baseDomain}/`;
  } catch {}

  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,video/webm,video/mp4,audio/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer,
    'Origin': origin,
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Connection': 'keep-alive',
    ...customHeaders,
  };
}

export function isOneTimeOrSignedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const search = parsed.search.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.includes('/tunnel') || pathname.includes('/stream') || pathname.includes('/dl') || pathname.includes('/get')) {
      return true;
    }
    return ['sig=', 'signature=', 'exp=', 'expires=', 'token=', 'auth=', 'ticket=', 'key=', 'sec='].some((k) =>
      search.includes(k)
    );
  } catch {
    return false;
  }
}

export function cleanFileNameString(name: string): string {
  let clean = name.trim();
  try {
    if (clean.includes('%')) {
      clean = decodeURIComponent(clean);
    }
  } catch {}

  clean = clean.replace(/\+/g, ' ');
  // Decode common HTML entities
  clean = clean
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, "'")
    .replace(/&lt;/gi, '(')
    .replace(/&gt;/gi, ')')
    .replace(/&nbsp;/gi, ' ');

  // Replace invalid Windows filename characters
  clean = clean.replace(/"/g, "'");
  clean = clean.replace(/[/\\?%*:|<>]/g, '_');
  clean = clean.replace(/^\.+/, '');
  clean = clean.replace(/\s+/g, ' ').trim();

  if (!clean || clean === '.') {
    clean = `download_${Date.now()}`;
  }
  return clean;
}

export function sanitizeFileName(name: string): string {
  return cleanFileNameString(name);
}

export function isNumericOrHashOnly(name: string): boolean {
  const stem = path.basename(name, path.extname(name)).toLowerCase().trim();
  if (!stem) return true;
  // Purely digits like 17382910482
  if (/^\d+$/.test(stem)) return true;
  // Pure hex hash like a9b8c7d6e5f4a3b2 or md5/sha
  if (/^[0-9a-f]{16,}$/i.test(stem)) return true;
  // Generic download keywords
  const genericWords = [
    'tunnel', 'stream', 'download', 'downloads', 'file', 'get', 'videoplayback', 
    'playback', 'video', 'audio', 'media', 'play', 'output', 'index', 'track'
  ];
  if (genericWords.includes(stem)) return true;
  return false;
}

export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    for (const key of ['v', 'vid', 'video_id', 'id']) {
      const val = parsed.searchParams.get(key);
      if (val && /^[a-zA-Z0-9_-]{11}$/.test(val)) return val;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const part = parsed.pathname.slice(1).split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(part)) return part;
    }
    const match = parsed.pathname.match(/\/(?:embed|v|shorts)\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    for (const [, val] of parsed.searchParams.entries()) {
      if (val.includes('youtu')) {
        const nested = extractYouTubeVideoId(decodeURIComponent(val));
        if (nested) return nested;
      }
    }
  } catch {}
  return null;
}

export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const req = https.get(oembedUrl, { timeout: 3500 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let raw = '';
        res.on('data', (c) => raw += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (data && data.title && typeof data.title === 'string') {
              return resolve(cleanFileNameString(data.title));
            }
          } catch {}
          resolve(null);
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

export function ensureFileExtension(fileName: string, mimeType = '', rawUrl = ''): string {
  if (path.extname(fileName)) return fileName;

  // Check query params in rawUrl if provided
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const extParam = parsed.searchParams.get('ext') || parsed.searchParams.get('format') || parsed.searchParams.get('type');
      if (extParam && /^[a-zA-Z0-9]{2,5}$/.test(extParam)) {
        return `${fileName}.${extParam.toLowerCase()}`;
      }
    } catch {}
  }

  const mime = mimeType.toLowerCase();
  if (mime.includes('video/mp4')) return `${fileName}.mp4`;
  if (mime.includes('video/webm')) return `${fileName}.webm`;
  if (mime.includes('video/x-matroska')) return `${fileName}.mkv`;
  if (mime.includes('video/quicktime')) return `${fileName}.mov`;
  if (mime.includes('video/x-msvideo')) return `${fileName}.avi`;

  if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) return `${fileName}.mp3`;
  if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) return `${fileName}.m4a`;
  if (mime.includes('audio/flac') || mime.includes('audio/x-flac')) return `${fileName}.flac`;
  if (mime.includes('audio/wav') || mime.includes('audio/x-wav')) return `${fileName}.wav`;
  if (mime.includes('audio/ogg') || mime.includes('audio/opus')) return `${fileName}.ogg`;

  if (mime.includes('application/pdf')) return `${fileName}.pdf`;
  if (mime.includes('application/zip') || mime.includes('x-zip')) return `${fileName}.zip`;
  if (mime.includes('application/x-tar')) return `${fileName}.tar`;
  if (mime.includes('application/gzip')) return `${fileName}.gz`;
  if (mime.includes('application/x-7z-compressed')) return `${fileName}.7z`;
  if (mime.includes('application/x-rar')) return `${fileName}.rar`;
  if (mime.includes('application/x-msdownload')) return `${fileName}.exe`;

  if (rawUrl) {
    const lowerUrl = rawUrl.toLowerCase();
    if (lowerUrl.includes('audio') || lowerUrl.includes('mp3') || lowerUrl.includes('song')) {
      return `${fileName}.mp3`;
    }
    if (
      lowerUrl.includes('video') || 
      lowerUrl.includes('vid=') || 
      lowerUrl.includes('youtube') || 
      lowerUrl.includes('youtu.be') || 
      lowerUrl.includes('yt-') || 
      lowerUrl.includes('mp4')
    ) {
      return `${fileName}.mp4`;
    }
  }

  return fileName;
}

export function categorizeFileName(fileName: string, mimeType = '', rawUrl = ''): TaskCategory {
  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  const mime = mimeType.toLowerCase();
  
  const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'mid', 'midi'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'epub', 'odt'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'xz', 'tgz'];
  const programExts = ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'apk', 'bat', 'cmd', 'ps1', 'sh'];

  if (videoExts.includes(ext) || mime.startsWith('video/') || mime.includes('video')) return 'video';
  if (audioExts.includes(ext) || mime.startsWith('audio/') || mime.includes('audio')) return 'audio';
  if (docExts.includes(ext) || mime.includes('pdf') || mime.includes('document')) return 'document';
  if (archiveExts.includes(ext) || mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || mime.includes('archive')) return 'archive';
  if (programExts.includes(ext) || mime.includes('executable') || mime.includes('x-msdownload')) return 'program';

  if (rawUrl) {
    const lowerUrl = rawUrl.toLowerCase();
    if (lowerUrl.includes('audio') || lowerUrl.includes('mp3') || lowerUrl.includes('sound') || lowerUrl.includes('song')) {
      return 'audio';
    }
    if (
      lowerUrl.includes('video') || 
      lowerUrl.includes('vid=') ||
      lowerUrl.includes('youtube') || 
      lowerUrl.includes('youtu.be') || 
      lowerUrl.includes('yt-') ||
      lowerUrl.includes('watch?v=') || 
      lowerUrl.includes('videoplayback')
    ) {
      return 'video';
    }
  }

  return 'other';
}

export function parseContentDisposition(contentDisp: string): string | null {
  if (!contentDisp) return null;

  // 1. RFC 5987 / RFC 6266 filename*=UTF-8''...
  const rfcMatch = contentDisp.match(/filename\*\s*=\s*['"]?(?:UTF-8|utf-8)?''([^;\r\n"']+)['"]?/i);
  if (rfcMatch && rfcMatch[1]) {
    try {
      return cleanFileNameString(decodeURIComponent(rfcMatch[1].trim()));
    } catch {
      return cleanFileNameString(rfcMatch[1].trim());
    }
  }

  // 2. Standard filename="..." or filename=...
  const stdMatch = contentDisp.match(/filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s\r\n]+))/i);
  if (stdMatch) {
    const raw = (stdMatch[1] || stdMatch[2] || stdMatch[3] || '').trim();
    if (raw) {
      try {
        return cleanFileNameString(raw.includes('%') ? decodeURIComponent(raw) : raw);
      } catch {
        return cleanFileNameString(raw);
      }
    }
  }

  return null;
}

export function extractFileNameFromUrl(rawUrl: string, headers?: http.IncomingHttpHeaders): string {
  const mimeType = headers ? (headers['content-type'] as string) || '' : '';

  // 1. Check Content-Disposition header first (authoritative server filename)
  if (headers && headers['content-disposition']) {
    const parsedName = parseContentDisposition(headers['content-disposition']);
    if (parsedName && !isNumericOrHashOnly(parsedName)) {
      return ensureFileExtension(parsedName, mimeType, rawUrl);
    }
  }

  // 2. Check x-suggested-filename header
  if (headers && headers['x-suggested-filename']) {
    try {
      const suggested = decodeURIComponent(String(headers['x-suggested-filename']).trim());
      if (suggested && !isNumericOrHashOnly(suggested)) {
        return ensureFileExtension(cleanFileNameString(suggested), mimeType, rawUrl);
      }
    } catch {}
  }

  // 3. Inspect URL query parameters for titles / names (e.g. ?title=Drake+-+God%27s+Plan)
  try {
    const parsed = new URL(rawUrl);
    const titleKeys = [
      'title', 'video_title', 'song_title', 'track_title', 'song', 'track', 
      'name', 'filename', 'file', 'download', 'fn', 'f', 'caption', 'label', 'vname', 'sub', 'q'
    ];
    for (const key of titleKeys) {
      const val = parsed.searchParams.get(key);
      if (val && val.trim().length > 0) {
        const decoded = cleanFileNameString(val);
        // Ignore raw hex hashes or pure numbers
        if (decoded.length > 1 && !isNumericOrHashOnly(decoded)) {
          return ensureFileExtension(decoded, mimeType, rawUrl);
        }
      }
    }

    // 4. URL pathname
    const pathname = parsed.pathname;
    const baseName = path.basename(pathname);
    if (baseName && baseName.length > 0 && baseName !== '/' && !isNumericOrHashOnly(baseName)) {
      const decoded = cleanFileNameString(baseName);
      return ensureFileExtension(decoded, mimeType, rawUrl);
    }
  } catch {}

  // 5. If Content-Disposition had a numeric name, use it with extension
  if (headers && headers['content-disposition']) {
    const parsedName = parseContentDisposition(headers['content-disposition']);
    if (parsedName) {
      return ensureFileExtension(parsedName, mimeType, rawUrl);
    }
  }

  // 6. Pathname basename fallback
  try {
    const parsed = new URL(rawUrl);
    const baseName = path.basename(parsed.pathname);
    if (baseName && baseName.length > 0 && baseName !== '/' && baseName.includes('.')) {
      return cleanFileNameString(baseName);
    }
  } catch {}

  const fallback = `download_${Date.now()}`;
  return ensureFileExtension(fallback, mimeType, rawUrl);
}

export async function inspectUrl(targetUrl: string, maxRedirects = 8): Promise<UrlInspectionResult> {
  let cleanUrl = targetUrl.trim();
  if (TorrentEngine.getInstance().isTorrentSource(cleanUrl)) {
    return await TorrentEngine.getInstance().inspectTorrent(cleanUrl);
  }

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  // For signed / tunnel links, resolve immediately to avoid burning the one-time token
  if (isOneTimeOrSignedUrl(cleanUrl)) {
    let fileName = extractFileNameFromUrl(cleanUrl);
    const ytId = extractYouTubeVideoId(cleanUrl);
    if (ytId && isNumericOrHashOnly(fileName)) {
      try {
        const ytTitle = await fetchYouTubeTitle(ytId);
        if (ytTitle) {
          fileName = ensureFileExtension(ytTitle, '', cleanUrl);
        }
      } catch {}
    }

    const category = categorizeFileName(fileName, '', cleanUrl);
    const isVideo = category === 'video';
    const isAudio = category === 'audio';

    return {
      url: cleanUrl,
      finalUrl: cleanUrl,
      fileName,
      fileSize: 0,
      supportsRanges: false,
      mimeType: isVideo ? 'video/mp4' : isAudio ? 'audio/mpeg' : 'application/octet-stream',
      category,
    };
  }

  return new Promise((resolve, reject) => {
    let currentUrl = cleanUrl;
    let redirectCount = 0;

    async function finishInspection(finalUrl: string, fileSize: number, supportsRanges: boolean, mimeType: string, headers?: http.IncomingHttpHeaders) {
      let fileName = extractFileNameFromUrl(finalUrl, headers);
      if (isNumericOrHashOnly(fileName)) {
        const ytId = extractYouTubeVideoId(finalUrl) || extractYouTubeVideoId(cleanUrl);
        if (ytId) {
          try {
            const ytTitle = await fetchYouTubeTitle(ytId);
            if (ytTitle) {
              fileName = ensureFileExtension(ytTitle, mimeType, finalUrl);
            }
          } catch {}
        }
      }

      const category = categorizeFileName(fileName, mimeType, finalUrl);
      resolve({
        url: cleanUrl,
        finalUrl,
        fileName,
        fileSize: isNaN(fileSize) ? 0 : fileSize,
        supportsRanges,
        mimeType,
        category,
      });
    }

    function probeHead(urlToTest: string) {
      try {
        const parsed = new URL(urlToTest);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'HEAD',
            headers: getRequestHeaders(urlToTest),
            timeout: 6000,
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              if (redirectCount >= maxRedirects) return reject(new Error('Too many redirects'));
              redirectCount++;
              currentUrl = new URL(res.headers.location, urlToTest).toString();
              return probeHead(currentUrl);
            }

            if (res.statusCode === 405 || res.statusCode === 403 || res.statusCode === 400) {
              return probeGetRange(urlToTest);
            }

            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage || 'Error'}`));
            }

            const contentLengthHeader = res.headers['content-length'];
            const fileSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
            const acceptRanges = res.headers['accept-ranges'];
            const supportsRanges = acceptRanges === 'bytes';
            const mimeType = res.headers['content-type'] || 'application/octet-stream';

            finishInspection(currentUrl, fileSize, supportsRanges, mimeType, res.headers);
          }
        );

        req.on('timeout', () => {
          req.destroy();
          probeGetRange(urlToTest);
        });

        req.on('error', () => {
          probeGetRange(urlToTest);
        });

        req.end();
      } catch (err: any) {
        reject(err);
      }
    }

    function probeGetRange(urlToTest: string) {
      try {
        const parsed = new URL(urlToTest);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: getRequestHeaders(urlToTest, { 'Range': 'bytes=0-1024' }),
            timeout: 8000,
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              if (redirectCount >= maxRedirects) return reject(new Error('Too many redirects'));
              redirectCount++;
              currentUrl = new URL(res.headers.location, urlToTest).toString();
              return probeGetRange(currentUrl);
            }

            if (res.statusCode && res.statusCode >= 400) {
              res.destroy();
              return reject(new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage || 'Error'}`));
            }

            let fileSize = 0;
            let supportsRanges = false;

            const contentRange = res.headers['content-range'];
            if (contentRange) {
              const match = contentRange.match(/\/(\d+|\*)$/);
              if (match && match[1] !== '*') {
                fileSize = parseInt(match[1], 10);
                supportsRanges = true;
              }
            }

            if (!fileSize && res.headers['content-length'] && res.statusCode === 200) {
              fileSize = parseInt(res.headers['content-length'], 10);
              supportsRanges = false;
            }

            const mimeType = res.headers['content-type'] || 'application/octet-stream';
            res.destroy();

            finishInspection(currentUrl, fileSize, supportsRanges, mimeType, res.headers);
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error('Connection timed out'));
        });

        req.on('error', (err) => reject(err));
        req.end();
      } catch (err: any) {
        reject(err);
      }
    }

    probeHead(cleanUrl);
  });
}
