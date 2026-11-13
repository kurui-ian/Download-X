/**
 * Utility functions for parsing, validating, and extracting metadata from download URLs.
 */

/**
 * Validates whether a raw string represents a supported download URL (HTTP, HTTPS, or BitTorrent Magnet).
 *
 * @param rawUrl - Input URL string to validate
 */
export function isValidDownloadUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  if (isMagnetUri(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates whether an input string is a valid BitTorrent magnet URI with an infohash.
 *
 * @param rawUrl - Input URL string
 */
export function isMagnetUri(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const lower = rawUrl.trim().toLowerCase();
  return lower.startsWith('magnet:?') && lower.includes('xt=urn:btih:');
}

/**
 * Extracts the hostname/domain from a URL, or a descriptive placeholder for Magnet URIs.
 *
 * @param rawUrl - Input URL string
 */
export function extractDomain(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();

  if (isMagnetUri(trimmed)) {
    return 'BitTorrent Swarm';
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Extracts a candidate file name from a URL's pathname, handling percent-encoding and trailing slashes.
 *
 * @param rawUrl - Input URL string
 */
export function extractFilenameFromUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();

  if (isMagnetUri(trimmed)) {
    try {
      const match = trimmed.match(/[?&]dn=([^&]+)/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1].replace(/\+/g, ' '));
      }
    } catch {
      // Fallback if decoding fails
    }
    return 'torrent-download';
  }

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '';

    const lastSegment = segments[segments.length - 1];
    return decodeURIComponent(lastSegment).trim();
  } catch {
    return '';
  }
}

/**
 * Strips whitespace, control characters, and leading/trailing quotes from user-pasted URLs.
 *
 * @param rawUrl - Input URL string
 */
export function cleanUrlInput(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return rawUrl.trim().replace(/^["']|["']$/g, '');
}
