import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Trash2, 
  FolderOpen, 
  FileCheck, 
  AlertCircle, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RotateCcw
} from 'lucide-react';
import { DownloadTask } from '../types';
import { formatBytes, formatSpeed, formatEta, formatDate } from '../utils/formatters';
import { getCategoryBadge } from '../utils/fileIcons';
import { SegmentedBar } from './SegmentedBar';

interface DownloadItemProps {
  task: DownloadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
  onOpenFile: (id: string) => void;
  onOpenFolder: (id: string) => void;
}

export const DownloadItem: React.FC<DownloadItemProps> = ({
  task,
  onPause,
  onResume,
  onDelete,
  onOpenFile,
  onOpenFolder,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const categoryInfo = getCategoryBadge(task.category);
  const CategoryIcon = categoryInfo.icon;

  const isConnecting = task.status === 'connecting';
  const isDownloading = task.status === 'downloading';
  const isCompleted = task.status === 'completed';
  const isPaused = task.status === 'paused';
  const isError = task.status === 'error';
  const isQueued = task.status === 'queued';
  const canPause = isDownloading || isConnecting || isQueued;

  // Automatically fetch file thumbnail / cover photo once completed
  useEffect(() => {
    let isMounted = true;
    if (isCompleted && task.savePath && window.electronAPI?.getFileThumbnail) {
      window.electronAPI.getFileThumbnail(task.savePath).then((thumb) => {
        if (isMounted && thumb) {
          setThumbnailUrl(thumb);
        }
      }).catch(() => {});
    } else {
      setThumbnailUrl(null);
    }

    return () => {
      isMounted = false;
    };
  }, [isCompleted, task.savePath]);

  return (
    <div className="group relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700/80 rounded-xl p-4 transition-all duration-200 shadow-sm">
      <div className="flex items-start gap-3.5">
        {/* Cover Photo / File Thumbnail or Monochrome Category Icon */}
        {thumbnailUrl ? (
          <div
            onClick={() => isCompleted && onOpenFile(task.id)}
            className="relative group/thumb flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 cursor-pointer shadow-sm transition-transform duration-200 hover:scale-105 active:scale-95"
            title="Click to open file"
          >
            <img
              src={thumbnailUrl}
              alt={task.fileName}
              className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-110"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
              <ExternalLink className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-11 h-11 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center transition-colors"
          >
            <CategoryIcon className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3
              className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate cursor-pointer hover:underline"
              title={task.fileName}
              onClick={() => isCompleted && onOpenFile(task.id)}
            >
              {task.fileName}
            </h3>

            {/* Minimalist Status Badge */}
            <span className="flex-shrink-0">
              {isCompleted ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-medium">
                  <FileCheck className="w-3 h-3" /> Done
                </span>
              ) : isDownloading || isConnecting ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-900 dark:bg-zinc-100 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-zinc-900 dark:bg-zinc-100"></span>
                  </span>
                  {isConnecting ? 'Connecting' : 'Downloading'}
                </span>
              ) : isPaused ? (
                <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
                  Paused
                </span>
              ) : isQueued ? (
                <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                  Queued
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-400 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200">
                  <AlertCircle className="w-3 h-3" /> Error
                </span>
              )}
            </span>
          </div>

          {/* Segmented Progress Bar */}
          <div className="my-2">
            <SegmentedBar
              chunks={task.chunks}
              overallProgress={task.progress}
              status={task.status}
            />
          </div>

          {/* Metrics & Info */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 gap-y-1 font-mono">
            <div className="flex items-center gap-2">
              <span>
                {formatBytes(task.downloadedBytes)} / {task.fileSize > 0 ? formatBytes(task.fileSize) : 'Unknown size'}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                {task.progress > 0 ? `${task.progress.toFixed(1)}%` : '0%'}
              </span>
              {task.quality && (
                <span className="inline-block px-1.5 py-0.2 text-[9px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded font-medium">
                  {task.quality}
                </span>
              )}
              {task.protocol === 'torrent' ? (
                <span className="inline-block px-1.5 py-0.2 text-[9px] bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 rounded font-medium">
                  Torrent
                </span>
              ) : task.supportsRanges ? (
                <span className="hidden sm:inline-block px-1.5 py-0.2 text-[9px] bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded">
                  Multi-thread
                </span>
              ) : null}
              {task.source && (
                <span className="hidden md:inline-block px-1.5 py-0.2 text-[9px] bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded">
                  {task.source}
                </span>
              )}
              {task.protocol === 'torrent' && task.peers !== undefined && (
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
                  {task.peers} peers
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {(isDownloading || isConnecting) && (
                <>
                  <div className="flex items-center gap-1 font-semibold text-zinc-900 dark:text-zinc-100">
                    <span className="inline-block animate-download-bounce">↓</span>
                    <span>{formatSpeed(task.speed)}</span>
                  </div>
                  {task.uploadSpeed !== undefined && task.uploadSpeed > 0 && (
                    <span className="text-zinc-500 text-[10px]">↑ {formatSpeed(task.uploadSpeed)}</span>
                  )}
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <span>ETA: {formatEta(task.eta)}</span>
                </>
              )}
              {isCompleted && (
                <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-1 font-sans">
                  Ready to open
                </span>
              )}
              {isPaused && <span>Paused</span>}
              {isQueued && <span>In Queue</span>}
              {isError && (
                <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]" title={task.errorMessage}>
                  {task.errorMessage || 'Failed'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {isError ? (
            <button
              onClick={() => onResume(task.id)}
              className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
              title="Retry Download"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : canPause ? (
            <button
              onClick={() => onPause(task.id)}
              className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
              title="Pause Download"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onResume(task.id)}
              disabled={isCompleted}
              className={`p-1.5 rounded-lg transition-colors ${
                isCompleted
                  ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                  : 'text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
              title="Resume Download"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {isCompleted && (
            <button
              onClick={() => onOpenFile(task.id)}
              className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
              title="Open File"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => onOpenFolder(task.id)}
            className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
            title="Show in Folder"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
            title="Delete Task"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg"
            title="Toggle Details"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Details Section */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex flex-col gap-1.5">
          {task.source && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 dark:text-zinc-500">Origin:</span>
              <span className="truncate max-w-md font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                Source: {task.source}
                {task.sourcePageTitle ? ` • Page: ${task.sourcePageTitle}` : ''}
                {task.quality ? ` • Quality: ${task.quality}` : ''}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500">URL:</span>
            <span className="truncate max-w-md font-mono text-[11px] text-zinc-800 dark:text-zinc-200" title={task.url}>
              {task.url}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500">Location:</span>
            <span className="truncate max-w-md font-mono text-[11px] text-zinc-800 dark:text-zinc-200" title={task.savePath}>
              {task.savePath}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500">Added:</span>
            <span>{formatDate(task.createdAt)}</span>
          </div>

          {task.infoHash && (
            <div className="flex items-center justify-between font-mono text-[10px] pt-1">
              <span className="text-zinc-400 dark:text-zinc-500">InfoHash:</span>
              <span className="text-zinc-800 dark:text-zinc-200 select-all">{task.infoHash}</span>
            </div>
          )}

          {task.torrentFiles && task.torrentFiles.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-700 dark:text-zinc-300 font-medium block mb-1 text-[11px]">
                Included Files ({task.torrentFiles.length}):
              </span>
              <div className="max-h-32 overflow-y-auto space-y-1 bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {task.torrentFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="truncate text-zinc-800 dark:text-zinc-200 max-w-[280px]" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-zinc-500 font-mono text-[10px]">
                      {formatBytes(file.length)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm rounded-xl p-4 flex flex-col justify-center items-center z-10">
          <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-3 text-center">
            Remove <span className="font-semibold">"{task.fileName}"</span>?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(task.id, false);
              }}
              className="px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors"
            >
              Remove from List
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(task.id, true);
              }}
              className="px-3 py-1.5 text-xs bg-black dark:bg-white text-white dark:text-black font-medium rounded-lg transition-colors hover:opacity-90"
            >
              Delete File & Task
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
