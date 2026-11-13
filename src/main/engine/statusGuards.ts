import type { TaskStatus, TaskCategory, TaskProtocol, DownloadTask } from './types.ts';

/**
 * Checks whether a download task is currently in an active network transfer state.
 *
 * @param status - The current TaskStatus
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'connecting' || status === 'downloading';
}

/**
 * Checks whether a download task has concluded its execution cycle.
 *
 * @param status - The current TaskStatus
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled';
}

/**
 * Checks whether a task is temporarily halted by the user or queue manager.
 *
 * @param status - The current TaskStatus
 */
export function isPausedStatus(status: TaskStatus): boolean {
  return status === 'paused';
}

/**
 * Checks whether a task protocol is BitTorrent.
 *
 * @param protocol - The task protocol (http or torrent)
 */
export function isTorrentProtocol(protocol?: TaskProtocol): boolean {
  return protocol === 'torrent';
}

/**
 * Checks whether a category represents rich media content (video, audio, or image).
 *
 * @param category - The task category
 */
export function isMediaCategory(category: TaskCategory): boolean {
  return category === 'video' || category === 'audio' || category === 'image';
}

/**
 * Validates whether a download task can be safely resumed from its current state.
 *
 * @param task - Download task status and range support flags
 */
export function canResumeTask(task: Pick<DownloadTask, 'status' | 'supportsRanges'>): boolean {
  return (task.status === 'paused' || task.status === 'error') && task.supportsRanges;
}
