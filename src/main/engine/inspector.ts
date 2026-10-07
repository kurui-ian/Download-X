import http from 'http';
import https from 'https';
import { URL } from 'url';
import path from 'path';
import { TaskCategory, UrlInspectionResult } from './types';
import { TorrentEngine } from './TorrentEngine';

export const keepAliveHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 32,
  maxFreeSockets: 16,
});

export const keepAliveHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 32,
  maxFreeSockets: 16,
  rejectUnauthorized: false,
});

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
      if (parsed.searchParams.has('dlx_quality')) {
        norm += `&dlx_quality=${parsed.searchParams.get('dlx_quality')}`;
      }
    } else if (parsed.searchParams.has('vid')) {
      norm += `?vid=${parsed.searchParams.get('vid')}`;
      if (parsed.searchParams.has('dlx_quality')) {
        norm += `&dlx_quality=${parsed.searchParams.get('dlx_quality')}`;
      }
    } else if (parsed.search) {
      norm += parsed.search;
    }
    return norm;
  } catch {
    return trimmed.toLowerCase();
  }
}

export const YT_VISIONOS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
export const YT_ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip';
export const YT_IOS_UA = 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)';

export function getRequestHeaders(
  targetUrl: string,
  customHeaders?: http.OutgoingHttpHeaders,
  profile: number = 0
): http.OutgoingHttpHeaders {
  if (targetUrl.includes('googlevideo.com')) {
    const isVisionOs = targetUrl.includes('c=VISIONOS');
    const isIos = targetUrl.includes('c=IOS');
    const ua = isVisionOs ? YT_VISIONOS_UA : isIos ? YT_IOS_UA : YT_ANDROID_UA;
    const gvHeaders: http.OutgoingHttpHeaders = {
      'User-Agent': ua,
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      ...customHeaders,
    };
    delete gvHeaders['Referer'];
    delete gvHeaders['Origin'];
    return gvHeaders;
  }

  let origin = 'https://www.google.com';
  let referer = 'https://www.google.com/';

  try {
    const parsed = new URL(targetUrl);
    origin = `${parsed.protocol}//${parsed.host}`;
    const hostParts = parsed.hostname.split('.');
    const baseDomain = hostParts.length > 2 ? hostParts.slice(-2).join('.') : parsed.hostname;
    referer = `${parsed.protocol}//${baseDomain}/`;
  } catch {}

  const customRefStr = customHeaders && customHeaders['Referer'] ? String(customHeaders['Referer']) : '';
  if (customRefStr && profile !== 2 && profile !== 3) {
    try {
      const refUrl = new URL(customRefStr);
      origin = `${refUrl.protocol}//${refUrl.host}`;
      referer = customRefStr;
    } catch {}
  }

  const baseHeaders: http.OutgoingHttpHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Connection': 'keep-alive',
    ...customHeaders,
  };

  if (profile === 0) {
    baseHeaders['Referer'] = referer;
    baseHeaders['Origin'] = origin;
  } else if (profile === 1) {
    // Standard <video> / navigation request: Referer only, no Origin header
    baseHeaders['Referer'] = referer;
    delete baseHeaders['Origin'];
  } else if (profile === 2) {
    // Self-domain Referer & Origin
    baseHeaders['Referer'] = referer;
    baseHeaders['Origin'] = origin;
  } else {
    // Profile 3: No Referer / No Origin (for servers enforcing no-referrer)
    delete baseHeaders['Referer'];
    delete baseHeaders['Origin'];
  }

  return baseHeaders;
}

export function isOneTimeOrSignedUrl(urlStr: string): boolean {
  if (
    urlStr.includes('.m3u8') ||
    urlStr.includes('__DLX_SEG_') ||
    urlStr.includes('c=VISIONOS') ||
    (urlStr.includes('googlevideo.com') && urlStr.includes('gir=yes'))
  ) {
    return false;
  }
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

export function cleanSourcePageTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  let cleaned = rawTitle
    .replace(/^\(\d+\)\s*/, '') // Strip leading notification counts like "(348) "
    .replace(
      /\s*[-|–—•·]\s*(YouTube|YouTube Music|Vimeo|Dailymotion|Twitch|TikTok|Facebook|Instagram|X|Twitter|Reddit|Bilibili|SoundCloud)$/i,
      ''
    )
    .trim();
  if (!cleaned) {
    cleaned = rawTitle.replace(/^\(\d+\)\s*/, '').trim();
  }
  return cleanFileNameString(cleaned);
}

export function isNumericOrHashOnly(name: string): boolean {
  const stem = path.basename(name, path.extname(name)).toLowerCase().trim();
  if (!stem) return true;
  // Strip any trailing quality tag like " (360p)" or " (1080p)" or " (1)" when checking if base stem is generic
  const baseStem = stem.replace(/(\s*\([^)]*\))+$/g, '').trim();
  if (!baseStem) return true;
  // Purely digits like 17382910482
  if (/^\d+$/.test(baseStem)) return true;
  // Pure hex hash like a9b8c7d6e5f4a3b2 or UUID
  if (/^[0-9a-f]{12,}$/i.test(baseStem)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(baseStem)) return true;
  // Auto-generated fallback names like download_1791141211662, video_12345, stream_123, etc.
  if (
    /^(download|downloads|video|audio|media|stream|file|track|playback|videoplayback|master|playlist|manifest|output|index|chunk|segment|clip|movie)([_-][a-z0-9]+)?$/i.test(
      baseStem
    )
  ) {
    return true;
  }
  // Generic download keywords
  const genericWords = [
    'tunnel', 'stream', 'download', 'downloads', 'file', 'get', 'videoplayback', 
    'playback', 'video', 'audio', 'media', 'play', 'output', 'index', 'track',
    'master', 'playlist', 'manifest', 'embed', 'player', 'watch', 'default',
    'youtube', 'vimeo', 'dailymotion', 'tiktok', 'instagram', 'facebook', 'twitter'
  ];
  if (genericWords.includes(baseStem)) return true;
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

export interface ResolvedYouTubeStream {
  videoId: string;
  title: string;
  primaryUrl: string;
  secondaryAudioUrl?: string;
  mimeType: string;
  fileSize: number;
  audioFileSize: number;
  quality: string;
  userAgent: string;
}

function postInnertubeJson(urlStr: string, bodyObj: any, extraHeaders: http.OutgoingHttpHeaders): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const data = JSON.stringify(bodyObj);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...extraHeaders,
          },
          timeout: 8000,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(e);
            }
          });
          res.on('error', reject);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('YouTube API request timed out'));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function probeYouTubeStreamSize(urlStr: string, ua: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: {
            'User-Agent': ua,
            'Accept': '*/*',
            'Range': 'bytes=0-0',
          },
          timeout: 5000,
        },
        (res) => {
          res.on('error', () => {});
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, urlStr).toString();
            probeYouTubeStreamSize(nextUrl, ua).then(resolve);
            return;
          }
          const cr = res.headers['content-range'];
          res.destroy();
          if (cr) {
            const m = cr.match(/\/(\d+)$/);
            if (m) {
              const total = parseInt(m[1], 10);
              if (!isNaN(total) && total > 0) {
                return resolve(total);
              }
            }
          }
          resolve(0);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(0);
      });
      req.on('error', () => resolve(0));
      req.end();
    } catch {
      resolve(0);
    }
  });
}

let cachedYtVisitorData = '';
let cachedYtVisitorDataTime = 0;

async function fetchYouTubeVisitorData(): Promise<string> {
  const now = Date.now();
  if (cachedYtVisitorData && now - cachedYtVisitorDataTime < 10 * 60 * 1000) {
    return cachedYtVisitorData;
  }
  const fromSw = await new Promise<string>((resolve) => {
    try {
      const req = https.get(
        'https://www.youtube.com/sw.js_data',
        {
          headers: {
            'User-Agent': YT_VISIONOS_UA,
            'Accept': '*/*',
          },
          timeout: 4500,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            const m = raw.match(/Cgt[a-zA-Z0-9_%-]{15,}/);
            if (m && m[0]) {
              cachedYtVisitorData = m[0];
              cachedYtVisitorDataTime = Date.now();
              resolve(m[0]);
            } else {
              resolve('');
            }
          });
          res.on('error', () => resolve(''));
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve('');
      });
      req.on('error', () => resolve(''));
    } catch {
      resolve('');
    }
  });
  if (fromSw) return fromSw;

  try {
    const visRes = await postInnertubeJson(
      'https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false',
      {
        context: {
          client: {
            clientName: 'VISIONOS',
            clientVersion: '0.1',
            userAgent: YT_VISIONOS_UA,
            osName: 'visionOS',
            osVersion: '1.3.21O771',
            deviceMake: 'Apple',
            deviceModel: 'RealityDevice14,1',
            hl: 'en',
            gl: 'US',
          },
        },
      },
      {
        'User-Agent': YT_VISIONOS_UA,
        'X-YouTube-Client-Name': '101',
        'X-YouTube-Client-Version': '0.1',
      }
    );
    const vd = visRes?.responseContext?.visitorData;
    if (vd && typeof vd === 'string') {
      cachedYtVisitorData = vd;
      cachedYtVisitorDataTime = Date.now();
      return vd;
    }
  } catch {}

  return cachedYtVisitorData || '';
}

export async function resolveYouTubeStream(
  urlOrVideoId: string,
  preferredQuality?: string,
  preferredMime?: string,
  fallbackUrlForId?: string
): Promise<ResolvedYouTubeStream | null> {
  const videoId =
    (/^[a-zA-Z0-9_-]{11}$/.test(urlOrVideoId) ? urlOrVideoId : null) ||
    extractYouTubeVideoId(urlOrVideoId) ||
    (fallbackUrlForId ? extractYouTubeVideoId(fallbackUrlForId) : null);

  if (!videoId) return null;

  // Check if urlOrVideoId or fallbackUrlForId has dlx_quality param or itag param
  let effectiveQuality = (preferredQuality || '').trim();
  let effectiveMime = (preferredMime || '').trim().toLowerCase();
  for (const candidateUrl of [urlOrVideoId, fallbackUrlForId]) {
    if (!candidateUrl || !candidateUrl.startsWith('http')) continue;
    try {
      const u = new URL(candidateUrl);
      const dlxQ = u.searchParams.get('dlx_quality');
      if (dlxQ && !effectiveQuality) effectiveQuality = dlxQ;
      const itagParam = parseInt(u.searchParams.get('itag') || '0', 10);
      if ([139, 140, 249, 250, 251].includes(itagParam)) {
        effectiveMime = 'audio/mp4';
      } else if (!effectiveQuality) {
        if (itagParam === 137 || itagParam === 248 || itagParam === 299) effectiveQuality = '1080p';
        else if (itagParam === 136 || itagParam === 247 || itagParam === 298) effectiveQuality = '720p';
        else if (itagParam === 135 || itagParam === 244) effectiveQuality = '480p';
        else if (itagParam === 134 || itagParam === 18) effectiveQuality = '360p';
      }
    } catch {}
  }

  let visitorData = await fetchYouTubeVisitorData();

  const clients = [
    {
      name: 'VISIONOS',
      version: '0.1',
      ua: YT_VISIONOS_UA,
      id: '101',
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice14,1',
      osName: 'visionOS',
      osVersion: '1.3.21O771',
    },
    {
      name: 'IOS',
      version: '20.10.4',
      ua: YT_IOS_UA,
      id: '5',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
    },
    {
      name: 'ANDROID',
      version: '20.10.38',
      ua: YT_ANDROID_UA,
      id: '3',
      osName: 'Android',
      osVersion: '14',
      androidSdkVersion: 34,
    },
  ];

  let bestCandidate: { stream: ResolvedYouTubeStream; height: number } | null = null;

  for (const client of clients) {
    try {
      const clientContext: Record<string, any> = {
        clientName: client.name,
        clientVersion: client.version,
        userAgent: client.ua,
        osName: client.osName,
        osVersion: client.osVersion,
        androidSdkVersion: (client as any).androidSdkVersion,
        deviceMake: (client as any).deviceMake,
        deviceModel: (client as any).deviceModel,
        hl: 'en',
        gl: 'US',
      };
      if (visitorData) {
        clientContext.visitorData = visitorData;
      }

      const extraHeaders: http.OutgoingHttpHeaders = {
        'User-Agent': client.ua,
        'X-YouTube-Client-Name': client.id,
        'X-YouTube-Client-Version': client.version,
      };
      if (visitorData) {
        extraHeaders['X-Goog-Visitor-Id'] = visitorData;
      }

      const playerRes = await postInnertubeJson(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          context: {
            client: clientContext,
          },
        },
        extraHeaders
      );

      if (playerRes?.responseContext?.visitorData && !visitorData) {
        visitorData = playerRes.responseContext.visitorData;
        cachedYtVisitorData = visitorData;
        cachedYtVisitorDataTime = Date.now();
      }

      if (!playerRes || !playerRes.streamingData) continue;

      const rawTitle =
        playerRes.videoDetails?.title ||
        (await fetchYouTubeTitle(videoId)) ||
        `youtube_${videoId}`;
      const title = cleanFileNameString(rawTitle);

      const muxedFormats: any[] = Array.isArray(playerRes.streamingData.formats)
        ? playerRes.streamingData.formats.filter((f: any) => f && f.url)
        : [];
      const adaptiveFormats: any[] = Array.isArray(playerRes.streamingData.adaptiveFormats)
        ? playerRes.streamingData.adaptiveFormats.filter((f: any) => f && f.url)
        : [];

      if (muxedFormats.length === 0 && adaptiveFormats.length === 0) continue;

      const qLower = effectiveQuality.toLowerCase();
      const wantsAudioOnly =
        effectiveMime.startsWith('audio/') ||
        qLower === 'tiny' ||
        qLower.includes('audio') ||
        qLower.includes('m4a') ||
        qLower.includes('mp3');

      // Find best M4A audio track (itag 140 preferred for fMP4/MP4 compatibility)
      const m4aAudios = adaptiveFormats
        .filter((f) => String(f.mimeType || '').toLowerCase().startsWith('audio/mp4'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const anyAudios = adaptiveFormats
        .filter((f) => String(f.mimeType || '').toLowerCase().startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = m4aAudios.find((f) => f.itag === 140) || m4aAudios[0] || anyAudios[0];

      if (wantsAudioOnly && bestAudio) {
        const audioSize = parseInt(bestAudio.contentLength || '0', 10) || 0;
        return {
          videoId,
          title,
          primaryUrl: bestAudio.url,
          mimeType: 'audio/mp4',
          fileSize: audioSize,
          audioFileSize: 0,
          quality: 'Audio',
          userAgent: client.ua,
        };
      }

      // Determine target resolution height
      let targetHeight = 1080;
      if (qLower.includes('2160') || qLower.includes('4k')) targetHeight = 2160;
      else if (qLower.includes('1440')) targetHeight = 1440;
      else if (qLower.includes('1080')) targetHeight = 1080;
      else if (qLower.includes('720')) targetHeight = 720;
      else if (qLower.includes('480') || qLower === 'large') targetHeight = 480;
      else if (qLower.includes('360') || qLower === 'medium') targetHeight = 360;
      else if (qLower.includes('240') || qLower === 'small') targetHeight = 240;

      // Only use 360p muxed stream directly if user explicitly requested <= 360p
      const rateBypassMuxed = muxedFormats.find((f) => String(f.url).includes('ratebypass=yes')) || muxedFormats[0];
      if (targetHeight <= 360 && rateBypassMuxed && (rateBypassMuxed.height || 360) === targetHeight) {
        let fSize = parseInt(rateBypassMuxed.contentLength || '0', 10) || 0;
        if (!fSize) {
          fSize = await probeYouTubeStreamSize(rateBypassMuxed.url, client.ua);
        }
        return {
          videoId,
          title,
          primaryUrl: rateBypassMuxed.url,
          mimeType: 'video/mp4',
          fileSize: fSize,
          audioFileSize: 0,
          quality: rateBypassMuxed.qualityLabel || '360p',
          userAgent: client.ua,
        };
      }

      const mp4Videos = adaptiveFormats
        .filter((f) => {
          const m = String(f.mimeType || '').toLowerCase();
          return m.startsWith('video/mp4') && m.includes('avc1');
        })
        .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));

      const allMp4Videos =
        mp4Videos.length > 0
          ? mp4Videos
          : adaptiveFormats
              .filter((f) => String(f.mimeType || '').toLowerCase().startsWith('video/mp4'))
              .sort((a, b) => (b.height || 0) - (a.height || 0));

      const chosenVideo =
        allMp4Videos.find((f) => f.height === targetHeight) ||
        allMp4Videos.find((f) => (f.height || 0) <= targetHeight) ||
        allMp4Videos[0];

      if (chosenVideo) {
        const chosenHeight = chosenVideo.height || 0;
        const videoSize = parseInt(chosenVideo.contentLength || '0', 10) || 0;
        const audioSize = bestAudio ? parseInt(bestAudio.contentLength || '0', 10) || 0 : 0;
        const resolvedQuality =
          chosenVideo.qualityLabel ||
          (chosenHeight ? `${chosenHeight}p` : effectiveQuality || '1080p');

        const candidateStream: ResolvedYouTubeStream = {
          videoId,
          title,
          primaryUrl: chosenVideo.url,
          secondaryAudioUrl: bestAudio ? bestAudio.url : undefined,
          mimeType: 'video/mp4',
          fileSize: videoSize > 0 ? videoSize + audioSize : 0,
          audioFileSize: audioSize,
          quality: resolvedQuality,
          userAgent: client.ua,
        };

        if (chosenHeight >= targetHeight) {
          return candidateStream;
        }
        if (!bestCandidate || chosenHeight > bestCandidate.height) {
          bestCandidate = { stream: candidateStream, height: chosenHeight };
        }
        continue;
      }

      if (muxedFormats.length > 0 && !bestCandidate) {
        const muxed = muxedFormats[0];
        let fSize = parseInt(muxed.contentLength || '0', 10) || 0;
        if (!fSize) {
          fSize = await probeYouTubeStreamSize(muxed.url, client.ua);
        }
        bestCandidate = {
          height: muxed.height || 360,
          stream: {
            videoId,
            title,
            primaryUrl: muxed.url,
            mimeType: 'video/mp4',
            fileSize: fSize,
            audioFileSize: 0,
            quality: muxed.qualityLabel || '360p',
            userAgent: client.ua,
          },
        };
      }
    } catch {}
  }

  return bestCandidate ? bestCandidate.stream : null;
}

export function ensureFileExtension(fileName: string, mimeType = '', rawUrl = ''): string {
  const existingExt = path.extname(fileName).toLowerCase();
  const mime = mimeType.toLowerCase();
  const lowerUrl = (rawUrl || '').toLowerCase();
  const isVideoOrHls =
    mime.includes('mpegurl') ||
    mime.includes('m3u8') ||
    mime.startsWith('video/') ||
    lowerUrl.includes('.m3u8') ||
    lowerUrl.includes('__dlx_seg_');

  if (existingExt) {
    if (
      isVideoOrHls &&
      ['.m3u8', '.php', '.html', '.htm', '.asp', '.aspx', '.jsp', '.txt', '.ts'].includes(existingExt)
    ) {
      return `${fileName.slice(0, -existingExt.length)}.mp4`;
    }
    return fileName;
  }

  // Check query params in rawUrl if provided
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const extParam = parsed.searchParams.get('ext') || parsed.searchParams.get('format') || parsed.searchParams.get('type');
      if (extParam && /^[a-zA-Z0-9]{2,5}$/.test(extParam)) {
        const cleanExt = extParam.toLowerCase();
        if (!['m3u8', 'php', 'html', 'ts'].includes(cleanExt)) {
          return `${fileName}.${cleanExt}`;
        }
      }
    } catch {}
  }

  if (isVideoOrHls || mime.includes('video/mp4')) return `${fileName}.mp4`;
  if (mime.includes('video/webm')) return `${fileName}.webm`;
  if (mime.includes('video/x-matroska')) return `${fileName}.mkv`;
  if (mime.includes('video/quicktime')) return `${fileName}.mov`;
  if (mime.includes('video/x-msvideo')) return `${fileName}.avi`;

  if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) return `${fileName}.mp3`;
  if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) return `${fileName}.m4a`;
  if (mime.includes('audio/flac') || mime.includes('audio/x-flac')) return `${fileName}.flac`;
  if (mime.includes('audio/wav') || mime.includes('audio/x-wav')) return `${fileName}.wav`;
  if (mime.includes('audio/ogg') || mime.includes('audio/opus')) return `${fileName}.ogg`;

  if (mime.includes('image/jpeg') || mime.includes('image/jpg')) return `${fileName}.jpg`;
  if (mime.includes('image/png')) return `${fileName}.png`;
  if (mime.includes('image/webp')) return `${fileName}.webp`;
  if (mime.includes('image/gif')) return `${fileName}.gif`;
  if (mime.includes('image/svg')) return `${fileName}.svg`;
  if (mime.includes('image/avif')) return `${fileName}.avif`;
  if (mime.includes('image/bmp')) return `${fileName}.bmp`;

  if (mime.includes('application/pdf')) return `${fileName}.pdf`;
  if (mime.includes('application/zip') || mime.includes('x-zip')) return `${fileName}.zip`;
  if (mime.includes('application/x-tar')) return `${fileName}.tar`;
  if (mime.includes('application/gzip')) return `${fileName}.gz`;
  if (mime.includes('application/x-7z-compressed')) return `${fileName}.7z`;
  if (mime.includes('application/x-rar')) return `${fileName}.rar`;
  if (mime.includes('application/x-msdownload')) return `${fileName}.exe`;
  if (mime.includes('application/x-bittorrent')) return `${fileName}.torrent`;

  if (rawUrl) {
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
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'heic'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'epub', 'odt'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'xz', 'tgz'];
  const programExts = ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'apk', 'bat', 'cmd', 'ps1', 'sh'];

  if (ext === 'torrent' || mime.includes('bittorrent')) return 'torrent';
  if (videoExts.includes(ext) || mime.startsWith('video/') || mime.includes('video')) return 'video';
  if (audioExts.includes(ext) || mime.startsWith('audio/') || mime.includes('audio')) return 'audio';
  if (imageExts.includes(ext) || mime.startsWith('image/')) return 'image';
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

export interface HlsResolvedPlaylist {
  playlistUrl: string;
  initSegmentUrl?: string;
  encryptionKeyUrl?: string;
  encryptionIvHex?: string;
  mediaSequenceStart: number;
  segmentUrls: string[];
  totalDurationSeconds: number;
  bandwidth: number;
}

export function fetchBufferWithHeaders(
  targetUrl: string,
  referrer?: string,
  maxRedirects = 6,
  timeoutMs = 10000,
  onChunk?: (byteLength: number) => void
): Promise<{ buffer: Buffer; finalUrl: string; statusCode: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    let redirects = 0;

    function doGet(currentUrl: string, profile = 0) {
      try {
        const parsed = new URL(currentUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;
        const agent = isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;
        const customRef = referrer ? { Referer: referrer } : undefined;

        const req = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: getRequestHeaders(currentUrl, customRef, profile),
            agent,
            timeout: timeoutMs,
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              if (redirects >= maxRedirects) return reject(new Error('Too many redirects'));
              redirects++;
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              return doGet(nextUrl, profile);
            }

            if (res.statusCode && res.statusCode >= 400 && profile < 3) {
              res.resume();
              return doGet(currentUrl, profile + 1);
            }

            if (res.statusCode && res.statusCode >= 400 && profile >= 3) {
              res.resume();
              try {
                // Fallback to Chromium's native network stack (electron.net.fetch) for Cloudflare/TLS checks
                const electronMod = require('electron');
                if (electronMod && electronMod.net && typeof electronMod.net.fetch === 'function') {
                  const netHeaders: Record<string, string> = {};
                  const h0 = getRequestHeaders(currentUrl, customRef, 0);
                  for (const [k, v] of Object.entries(h0)) {
                    if (v !== undefined) netHeaders[k] = String(v);
                  }
                  electronMod.net
                    .fetch(currentUrl, { headers: netHeaders, redirect: 'follow' })
                    .then(async (netRes: any) => {
                      const arrBuf = await netRes.arrayBuffer();
                      const buf = Buffer.from(arrBuf);
                      if (onChunk && buf.length > 0) {
                        try {
                          onChunk(buf.length);
                        } catch {}
                      }
                      const outHeaders: http.IncomingHttpHeaders = {};
                      if (netRes.headers && typeof netRes.headers.forEach === 'function') {
                        netRes.headers.forEach((val: string, key: string) => {
                          outHeaders[key.toLowerCase()] = val;
                        });
                      }
                      resolve({
                        buffer: buf,
                        finalUrl: netRes.url || currentUrl,
                        statusCode: netRes.status || res.statusCode || 403,
                        headers: outHeaders,
                      });
                    })
                    .catch(() => {
                      resolve({
                        buffer: Buffer.alloc(0),
                        finalUrl: currentUrl,
                        statusCode: res.statusCode || 403,
                        headers: res.headers,
                      });
                    });
                  return;
                }
              } catch {}
            }

            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => {
              chunks.push(c);
              if (onChunk && c.length > 0) {
                try {
                  onChunk(c.length);
                } catch {}
              }
            });
            res.on('end', () => {
              resolve({
                buffer: Buffer.concat(chunks),
                finalUrl: currentUrl,
                statusCode: res.statusCode || 0,
                headers: res.headers,
              });
            });
            res.on('error', reject);
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error('Request timed out'));
        });
        req.on('error', reject);
        req.end();
      } catch (err) {
        reject(err);
      }
    }

    doGet(targetUrl);
  });
}

export async function resolveHlsMediaPlaylist(
  urlStr: string,
  referrer?: string
): Promise<HlsResolvedPlaylist | null> {
  // 1. Check if it is a sequential segment template (__DLX_SEG_<pad>_<total>__)
  const segPatternMatch = urlStr.match(/__DLX_SEG_(\d+)_(\d+)__/);
  if (segPatternMatch) {
    const padLen = parseInt(segPatternMatch[1], 10) || 0;
    const estTotal = Math.min(4000, Math.max(1, parseInt(segPatternMatch[2], 10) || 300));
    const segmentUrls: string[] = [];
    for (let i = 1; i <= estTotal; i++) {
      const token = padLen > 0 ? String(i).padStart(padLen, '0') : String(i);
      segmentUrls.push(urlStr.replace(/__DLX_SEG_\d+_\d+__/, token));
    }
    return {
      playlistUrl: urlStr,
      mediaSequenceStart: 1,
      segmentUrls,
      totalDurationSeconds: estTotal * 4,
      bandwidth: 0,
    };
  }

  // 2. Fetch the #EXTM3U manifest
  const initial = await fetchBufferWithHeaders(urlStr, referrer, 6, 8000);
  if (initial.statusCode >= 400) return null;
  let text = initial.buffer.toString('utf-8').trim();
  let currentPlaylistUrl = initial.finalUrl;

  if (!text.startsWith('#EXTM3U')) {
    return null;
  }

  let bestBandwidth = 0;

  // 3. If Master Playlist (#EXT-X-STREAM-INF), select the highest resolution/bandwidth variant
  if (text.includes('#EXT-X-STREAM-INF:')) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let bestVariantUrl = '';
    let bestScore = -1;

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

        let height = 0;
        let bw = 0;
        const resMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resMatch) height = parseInt(resMatch[2], 10) || 0;
        const bwMatch = attrs.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
        if (bwMatch) bw = parseInt(bwMatch[1], 10) || 0;

        const score = height * 10_000_000 + bw;
        if (score > bestScore) {
          bestScore = score;
          bestBandwidth = bw;
          try {
            bestVariantUrl = new URL(nextUri, currentPlaylistUrl).toString();
          } catch {}
        }
      }
    }

    if (bestVariantUrl) {
      const sub = await fetchBufferWithHeaders(bestVariantUrl, referrer, 6, 8000);
      if (sub.statusCode >= 200 && sub.statusCode < 300) {
        const subText = sub.buffer.toString('utf-8').trim();
        if (subText.startsWith('#EXTM3U')) {
          text = subText;
          currentPlaylistUrl = sub.finalUrl;
        }
      }
    }
  }

  // 4. Parse Media Playlist (#EXTINF, #EXT-X-MAP, #EXT-X-KEY)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const segmentUrls: string[] = [];
  let initSegmentUrl: string | undefined;
  let encryptionKeyUrl: string | undefined;
  let encryptionIvHex: string | undefined;
  let mediaSequenceStart = 0;
  let totalDurationSeconds = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequenceStart = parseInt(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length), 10) || 0;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI="([^"]+)"/i);
      if (uriMatch && uriMatch[1]) {
        try {
          initSegmentUrl = new URL(uriMatch[1], currentPlaylistUrl).toString();
        } catch {}
      }
    } else if (line.startsWith('#EXT-X-KEY:')) {
      if (/METHOD=AES-128/i.test(line)) {
        const uriMatch = line.match(/URI="([^"]+)"/i);
        if (uriMatch && uriMatch[1]) {
          try {
            encryptionKeyUrl = new URL(uriMatch[1], currentPlaylistUrl).toString();
          } catch {}
        }
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/i);
        if (ivMatch && ivMatch[1]) {
          encryptionIvHex = ivMatch[1];
        }
      }
    } else if (line.startsWith('#EXTINF:')) {
      const dur = parseFloat(line.slice('#EXTINF:'.length).split(',')[0]);
      if (Number.isFinite(dur) && dur > 0) {
        totalDurationSeconds += dur;
      }
    } else if (!line.startsWith('#')) {
      try {
        const segUrl = new URL(line, currentPlaylistUrl).toString();
        segmentUrls.push(segUrl);
      } catch {}
    }
  }

  if (segmentUrls.length === 0) return null;

  return {
    playlistUrl: currentPlaylistUrl,
    initSegmentUrl,
    encryptionKeyUrl,
    encryptionIvHex,
    mediaSequenceStart,
    segmentUrls,
    totalDurationSeconds: Math.round(totalDurationSeconds),
    bandwidth: bestBandwidth,
  };
}

async function estimateHlsFileSize(resolved: HlsResolvedPlaylist, referrer?: string): Promise<number> {
  if (resolved.bandwidth > 0 && resolved.totalDurationSeconds > 0) {
    return Math.round((resolved.bandwidth / 8) * resolved.totalDurationSeconds);
  }
  if (resolved.segmentUrls.length === 0) return 0;

  // Probe the first segment (or second segment if > 1) to get its byte size and multiply by total segments
  const sampleUrl = resolved.segmentUrls[Math.min(1, resolved.segmentUrls.length - 1)];
  return new Promise((resolve) => {
    try {
      const parsed = new URL(sampleUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;
      const customRef = referrer ? { Referer: referrer } : undefined;

      const req = client.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'HEAD',
          headers: getRequestHeaders(sampleUrl, customRef),
          agent: isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent,
          timeout: 3000,
        },
        (res) => {
          res.resume();
          const cl = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : 0;
          if (cl > 1000) {
            resolve(cl * resolved.segmentUrls.length);
          } else {
            resolve(0);
          }
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(0);
      });
      req.on('error', () => resolve(0));
      req.end();
    } catch {
      resolve(0);
    }
  });
}

export async function inspectUrl(targetUrl: string, maxRedirects = 8, referrer?: string): Promise<UrlInspectionResult> {
  let cleanUrl = targetUrl.trim();
  if (TorrentEngine.getInstance().isTorrentSource(cleanUrl)) {
    return await TorrentEngine.getInstance().inspectTorrent(cleanUrl);
  }

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  const customRefHeaders = referrer ? { Referer: referrer } : undefined;

  // 0. Check if URL is a YouTube watch/shorts URL or googlevideo.com stream
  const lowerClean = cleanUrl.toLowerCase();
  if (
    lowerClean.includes('youtube.com/watch') ||
    lowerClean.includes('youtube.com/shorts/') ||
    lowerClean.includes('youtu.be/') ||
    lowerClean.includes('googlevideo.com/videoplayback')
  ) {
    try {
      const ytResolved = await resolveYouTubeStream(cleanUrl, undefined, undefined, referrer);
      if (ytResolved) {
        const isAudio = ytResolved.mimeType.startsWith('audio/');
        const ext = isAudio ? 'm4a' : 'mp4';
        const fileName = sanitizeFileName(`${ytResolved.title}.${ext}`);
        return {
          url: cleanUrl,
          finalUrl: ytResolved.primaryUrl,
          fileName,
          fileSize: ytResolved.fileSize,
          supportsRanges: true,
          mimeType: ytResolved.mimeType,
          category: isAudio ? 'audio' : 'video',
          secondaryAudioUrl: ytResolved.secondaryAudioUrl,
          quality: ytResolved.quality,
        };
      }
    } catch {}
  }

  // 1. Check if URL is an HLS (.m3u8) playlist or sequential segment template (__DLX_SEG_)
  if (cleanUrl.toLowerCase().includes('.m3u8') || cleanUrl.includes('__DLX_SEG_')) {
    try {
      const hls = await resolveHlsMediaPlaylist(cleanUrl, referrer);
      if (hls && hls.segmentUrls.length > 0) {
        const estSize = await estimateHlsFileSize(hls, referrer);
        const fileName = ensureFileExtension(extractFileNameFromUrl(cleanUrl), 'video/mp4', cleanUrl);
        return {
          url: cleanUrl,
          finalUrl: hls.playlistUrl,
          fileName,
          fileSize: estSize,
          supportsRanges: false,
          mimeType: 'application/vnd.apple.mpegurl',
          category: 'video',
        };
      }
    } catch {}
  }

  // 2. For signed / tunnel links, try a fast non-consuming HEAD probe first to get fileSize & filename,
  // and fall back gracefully without burning single-use GET tokens if HEAD is rejected.
  if (isOneTimeOrSignedUrl(cleanUrl)) {
    const buildSignedFallback = async (): Promise<UrlInspectionResult> => {
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
    };

    return new Promise((resolve) => {
      try {
        const parsed = new URL(cleanUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;
        const req = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'HEAD',
            headers: getRequestHeaders(cleanUrl, customRefHeaders),
            agent: isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent,
            timeout: 3000,
          },
          async (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const contentLengthHeader = res.headers['content-length'];
              const fileSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
              const supportsRanges = res.headers['accept-ranges'] === 'bytes';
              const mimeType = (res.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
              let fileName = extractFileNameFromUrl(cleanUrl, res.headers);
              const category = categorizeFileName(fileName, mimeType, cleanUrl);
              return resolve({
                url: cleanUrl,
                finalUrl: cleanUrl,
                fileName,
                fileSize: isNaN(fileSize) ? 0 : fileSize,
                supportsRanges,
                mimeType,
                category,
              });
            }
            resolve(await buildSignedFallback());
          }
        );
        req.on('timeout', async () => {
          req.destroy();
          resolve(await buildSignedFallback());
        });
        req.on('error', async () => {
          resolve(await buildSignedFallback());
        });
        req.end();
      } catch {
        buildSignedFallback().then(resolve);
      }
    });
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
            headers: getRequestHeaders(urlToTest, customRefHeaders),
            agent: isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent,
            timeout: 6000,
          },
          async (res) => {
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

            const mimeType = (res.headers['content-type'] || 'application/octet-stream').toLowerCase();
            if (mimeType.includes('mpegurl') || mimeType.includes('m3u8')) {
              try {
                const hls = await resolveHlsMediaPlaylist(currentUrl, referrer);
                if (hls && hls.segmentUrls.length > 0) {
                  const estSize = await estimateHlsFileSize(hls, referrer);
                  return finishInspection(hls.playlistUrl, estSize, false, 'application/vnd.apple.mpegurl', res.headers);
                }
              } catch {}
            }

            const contentLengthHeader = res.headers['content-length'];
            const fileSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
            const acceptRanges = res.headers['accept-ranges'];
            const supportsRanges = acceptRanges === 'bytes';

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
            headers: getRequestHeaders(urlToTest, { ...(customRefHeaders || {}), 'Range': 'bytes=0-1024' }),
            agent: isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent,
            timeout: 8000,
          },
          (res) => {
            res.on('error', () => {});
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
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

            const mimeType = (res.headers['content-type'] || 'application/octet-stream').toLowerCase();
            const firstChunks: Buffer[] = [];
            let finished = false;

            const completeProbe = async (firstBuf?: Buffer) => {
              if (finished) return;
              finished = true;
              res.destroy();

              const headText = firstBuf ? firstBuf.toString('utf-8', 0, Math.min(32, firstBuf.length)).trim() : '';
              if (mimeType.includes('mpegurl') || mimeType.includes('m3u8') || headText.startsWith('#EXTM3U')) {
                try {
                  const hls = await resolveHlsMediaPlaylist(currentUrl, referrer);
                  if (hls && hls.segmentUrls.length > 0) {
                    const estSize = await estimateHlsFileSize(hls, referrer);
                    return finishInspection(hls.playlistUrl, estSize, false, 'application/vnd.apple.mpegurl', res.headers);
                  }
                } catch {}
              }

              finishInspection(currentUrl, fileSize, supportsRanges, mimeType, res.headers);
            };

            res.on('data', (chunk: Buffer) => {
              firstChunks.push(chunk);
              completeProbe(Buffer.concat(firstChunks));
            });

            res.on('end', () => {
              completeProbe(firstChunks.length > 0 ? Buffer.concat(firstChunks) : undefined);
            });
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
