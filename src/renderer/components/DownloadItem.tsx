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
  RotateCcw,
  Check,
  Copy,
  Layers,
  Radio,
  FileCode,
  ShieldCheck
} from 'lucide-react';
import { DownloadTask } from '../types';
import { formatBytes, formatSpeed, formatEta, formatDate, formatPercent } from '../utils/formatters';
import { getCategoryBadge } from '../utils/fileIcons';
import { SegmentedBar } from './SegmentedBar';

interface DownloadItemProps {
  task: DownloadTask;
  isSelected?: boolean;
  onToggleSelect?: (id: string, shiftKey?: boolean) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
  onOpenFile: (id: string) => void;
  onOpenFolder: (id: string) => void;
}

export const DownloadItem: React.FC<DownloadItemProps> = ({
  task,
  isSelected = false,
  onToggleSelect,
  onPause,
  onResume,
  onDelete,
  onOpenFile,
  onOpenFolder,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const categoryInfo = getCategoryBadge(task.category);
  const CategoryIcon = categoryInfo.icon;

  const isConnecting = task.status === 'connecting';
  const isDownloading = task.status === 'downloading';
  const isCompleted = task.status === 'completed';
  const isPaused = task.status === 'paused';
  const isError = task.status === 'error';
  const isQueued = task.status === 'queued';
  const canPause = isDownloading || isConnecting || isQueued;

  // Extract file extension cleanly
  const fileExt = task.fileName.includes('.') 
    ? `.${task.fileName.split('.').pop()?.toUpperCase()}`
    : '';

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

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(task.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1500);
    }
  };

  return (
    <div
      className={`group relative border rounded-xl p-3.5 transition-all duration-200 ${
        isSelected
          ? 'bg-cyan-50/20 dark:bg-cyan-950/20 border-cyan-500/80 ring-1 ring-cyan-500/30'
          : 'bg-white dark:bg-obsidian-900 border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Multi-Select Checkbox */}
        {onToggleSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(task.id, e.shiftKey);
            }}
            className={`mt-2 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
              isSelected
                ? 'bg-cyan-500 border-cyan-500 text-white'
                : 'border-zinc-300 dark:border-white/20 bg-white dark:bg-obsidian-950 hover:border-cyan-400'
            }`}
            title={isSelected ? 'Deselect item' : 'Select item (Shift+click for range)'}
            aria-label={isSelected ? `Deselect ${task.fileName}` : `Select ${task.fileName}`}
          >
            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
          </button>
        )}

        {/* Thumbnail or Category Icon */}
        {thumbnailUrl ? (
          <div
            onClick={() => isCompleted && onOpenFile(task.id)}
            className="relative group/thumb flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-obsidian-950 cursor-pointer shadow-sm transition-transform duration-200 hover:scale-105"
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
            className={`flex-shrink-0 w-11 h-11 rounded-lg border ${categoryInfo.borderColor} ${categoryInfo.bgColor} flex items-center justify-center transition-colors shadow-sm`}
          >
            <CategoryIcon className={`w-5 h-5 ${categoryInfo.textColor}`} />
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          {/* Top Title & Status Header Row */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3
                className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                title={task.fileName}
                onClick={() => isCompleted && onOpenFile(task.id)}
              >
                {task.fileName}
              </h3>

              {fileExt && (
                <span className="flex-shrink-0 text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-obsidian-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/5">
                  {fileExt}
                </span>
              )}
            </div>

            {/* Dynamic Status Badge */}
            <div className="flex-shrink-0">
              {isCompleted ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                  <Check className="w-3 h-3 stroke-[2.5]" /> Completed
                </span>
              ) : isDownloading || isConnecting ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-medium">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                  </span>
                  {isConnecting ? 'Connecting' : 'Downloading'}
                </span>
              ) : isPaused ? (
                <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                  Paused
                </span>
              ) : isQueued ? (
                <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-obsidian-800 text-zinc-600 dark:text-zinc-400">
                  Queued
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3 h-3" /> Error
                </span>
              )}
            </div>
          </div>

          {/* Segmented Parallel Stream Progress Bar */}
          <div className="my-2">
            <SegmentedBar
              chunks={task.chunks}
              overallProgress={task.progress}
              status={task.status}
            />
          </div>

          {/* Metrics Telemetry Row */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 gap-y-1 font-mono tabular-nums">
            <div className="flex items-center gap-2">
              <span className="text-zinc-700 dark:text-zinc-300">
                {formatBytes(task.downloadedBytes)} / {task.fileSize > 0 ? formatBytes(task.fileSize) : 'Unknown size'}
              </span>

              <span className="text-zinc-300 dark:text-white/10">•</span>

              <span className="text-zinc-900 dark:text-zinc-100 font-semibold">
                {formatPercent(task.progress)}
              </span>

              {task.protocol === 'torrent' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[9px] bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 rounded font-medium">
                  <Radio className="w-2.5 h-2.5" />
                  <span>TORRENT</span>
                  {task.peers !== undefined && ` (${task.peers} peers)`}
                </span>
              ) : task.supportsRanges && task.chunks && task.chunks.length > 1 ? (
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 text-[9px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 rounded font-medium">
                  <Layers className="w-2.5 h-2.5" />
                  <span>{task.chunks.length}x Multi-Part</span>
                </span>
              ) : null}

              {task.quality && (
                <span className="inline-block px-1.5 py-0.2 text-[9px] bg-zinc-900 text-white dark:bg-white dark:text-black rounded font-medium">
                  {task.quality}
                </span>
              )}
            </div>

            {/* Speed & ETA Telemetry */}
            <div className="flex items-center gap-2.5">
              {(isDownloading || isConnecting) && (
                <>
                  <div className="flex items-center gap-1 font-semibold text-cyan-600 dark:text-cyan-400">
                    <span className="inline-block animate-download-bounce">↓</span>
                    <span>{formatSpeed(task.speed)}</span>
                  </div>

                  {task.uploadSpeed !== undefined && task.uploadSpeed > 0 && (
                    <span className="text-teal-600 dark:text-teal-400 text-[10px]">
                      ↑ {formatSpeed(task.uploadSpeed)}
                    </span>
                  )}

                  <span className="text-zinc-300 dark:text-white/10">•</span>
                  <span>ETA: {formatEta(task.eta)}</span>
                </>
              )}

              {isCompleted && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  Ready to open
                </span>
              )}

              {isPaused && <span className="text-amber-500">Paused</span>}
              {isQueued && <span>In Queue</span>}
              {isError && (
                <span className="text-rose-500 truncate max-w-[180px]" title={task.errorMessage}>
                  {task.errorMessage || 'Failed'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex items-center gap-0.5 flex-shrink-0" role="toolbar" aria-label={`Controls for ${task.fileName}`}>
          {isError ? (
            <button
              onClick={() => onResume(task.id)}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 hover:bg-zinc-100 dark:hover:bg-obsidian-800 rounded-lg transition-colors"
              title="Retry Download"
              aria-label="Retry download"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : canPause ? (
            <button
              onClick={() => onPause(task.id)}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-obsidian-800 rounded-lg transition-colors"
              title="Pause Download"
              aria-label="Pause download"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onResume(task.id)}
              disabled={isCompleted}
              className={`p-1.5 rounded-lg transition-colors ${
                isCompleted
                  ? 'text-zinc-300 dark:text-white/10 cursor-not-allowed'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 hover:bg-zinc-100 dark:hover:bg-obsidian-800'
              }`}
              title="Resume Download"
              aria-label="Resume download"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {isCompleted && (
            <button
              onClick={() => onOpenFile(task.id)}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-obsidian-800 rounded-lg transition-colors"
              title="Open File"
              aria-label="Open file"
            >
              <FileCheck className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => onOpenFolder(task.id)}
            className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-cyan-500 hover:bg-zinc-100 dark:hover:bg-obsidian-800 rounded-lg transition-colors"
            title="Show in Folder"
            aria-label="Show in folder"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-zinc-100 dark:hover:bg-obsidian-800 rounded-lg transition-colors"
            title="Delete Task"
            aria-label="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-obsidian-800 rounded-lg transition-colors"
            title={showDetails ? 'Hide Technical Details' : 'Show Technical Details'}
            aria-label="Toggle technical details"
          >
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Technical Details Drawer */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-white/10 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
          {/* Origin / Browser metadata */}
          {task.source && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 dark:text-zinc-500 font-mono">Origin:</span>
              <span className="truncate max-w-md font-mono text-zinc-800 dark:text-zinc-200">
                {task.source}
                {task.sourcePageTitle ? ` • ${task.sourcePageTitle}` : ''}
              </span>
            </div>
          )}

          {/* URL with Copy Button */}
          <div className="flex items-center justify-between text-[11px] gap-2">
            <span className="text-zinc-400 dark:text-zinc-500 font-mono">Source URL:</span>
            <div className="flex items-center gap-1.5 min-w-0 max-w-md">
              <span className="truncate font-mono text-[10px] text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-obsidian-950 px-2 py-0.5 rounded border border-zinc-200 dark:border-white/5 select-all" title={task.url}>
                {task.url}
              </span>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="p-1 text-zinc-400 hover:text-cyan-500 rounded transition-colors flex-shrink-0"
                title="Copy URL"
                aria-label="Copy URL"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Save Location */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-500 font-mono">Storage Path:</span>
            <span className="truncate max-w-md font-mono text-[10px] text-zinc-700 dark:text-zinc-300" title={task.savePath}>
              {task.savePath}
            </span>
          </div>

          {/* Date and Range Support */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-500 font-mono">Created:</span>
            <span className="font-mono text-[10px]">{formatDate(task.createdAt)}</span>
          </div>

          {/* Parallel Stream Inspection Grid */}
          {task.chunks && task.chunks.length > 1 && (
            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-300">
                  <Layers className="w-3 h-3 text-cyan-500" />
                  <span>Parallel Stream Telemetry ({task.chunks.length} Threads)</span>
                </span>
                <span>{task.chunks.filter((c) => c.status === 'completed').length} / {task.chunks.length} Complete</span>
              </div>

              <div className="max-h-28 overflow-y-auto space-y-1 bg-zinc-50 dark:bg-obsidian-950 p-2 rounded-lg border border-zinc-200 dark:border-white/5 font-mono text-[10px]">
                {task.chunks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-0.5 border-b border-zinc-200/50 dark:border-white/5 last:border-0">
                    <span className="text-zinc-600 dark:text-zinc-400">Stream #{c.id + 1}:</span>
                    <span className="text-zinc-500">{formatBytes(c.startByte)} – {formatBytes(c.endByte)}</span>
                    <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                      {formatBytes(c.downloadedBytes)} ({c.totalBytes > 0 ? ((c.downloadedBytes / c.totalBytes) * 100).toFixed(0) : 0}%)
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase ${
                      c.status === 'completed'
                        ? 'text-emerald-500 bg-emerald-500/10'
                        : c.status === 'downloading'
                        ? 'text-cyan-500 bg-cyan-500/10 animate-pulse'
                        : 'text-zinc-500 bg-zinc-200 dark:bg-obsidian-800'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Torrent File Details */}
          {task.torrentFiles && task.torrentFiles.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-white/5">
              <span className="text-zinc-700 dark:text-zinc-300 font-medium block mb-1 text-[11px] font-mono">
                Torrent Files ({task.torrentFiles.length}):
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 bg-zinc-50 dark:bg-obsidian-950 p-2 rounded-lg border border-zinc-200 dark:border-white/5 font-mono text-[10px]">
                {task.torrentFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between py-0.5">
                    <span className="truncate text-zinc-800 dark:text-zinc-200 max-w-[280px]" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-zinc-500">{formatBytes(file.length)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Popover Overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/95 dark:bg-obsidian-950/95 backdrop-blur-sm rounded-xl p-4 flex flex-col justify-center items-center z-10 border border-rose-500/20">
          <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-3 text-center">
            Remove <span className="font-semibold text-cyan-600 dark:text-cyan-400">"{task.fileName}"</span>?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(task.id, false);
              }}
              className="px-3 py-1.5 text-xs bg-zinc-100 dark:bg-obsidian-850 hover:bg-zinc-200 dark:hover:bg-obsidian-800 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors border border-zinc-200 dark:border-white/10"
            >
              Remove from List
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(task.id, true);
              }}
              className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg transition-colors shadow-sm"
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
