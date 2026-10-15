/**
 * Formats a raw byte count into a human-readable string with units (B, KB, MB, GB, TB, PB).
 *
 * @param bytes - Size in bytes (positive or zero)
 * @param decimals - Number of decimal places to include (default: 1)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  if (!bytes || isNaN(bytes) || bytes < 0) return '--';

  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${Math.round(bytes)} B`;
  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Formats transfer rate in bytes per second into standard rate notation (e.g. 1.5 MB/s).
 */
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0 || !isFinite(bytesPerSec)) return '0 KB/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Formats remaining download time in seconds into human-readable hours, minutes, and seconds.
 */
export function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Formats a timestamp in milliseconds into a concise localized date-time string.
 */
export function formatDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp) || timestamp <= 0) return '--';
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a download progress percentage clamped between 0% and 100%.
 */
export function formatPercent(progress: number, decimals = 1): string {
  if (isNaN(progress) || progress <= 0) return '0%';
  if (progress >= 100) return '100%';
  return `${progress.toFixed(decimals)}%`;
}

