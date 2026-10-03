import React, { useState } from 'react';
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
  const categoryInfo = getCategoryBadge(task.category);
  const CategoryIcon = categoryInfo.icon;

  const isDownloading = task.status === 'downloading';
  const isCompleted = task.status === 'completed';
  const isPaused = task.status === 'paused';
  const isError = task.status === 'error';
  const isQueued = task.status === 'queued';

  return (
    <div className="group relative bg-surface-900/60 hover:bg-surface-900/90 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 transition-all duration-200 shadow-sm">
      <div className="flex items-start gap-4">
        {/* Category Icon */}
        <div
          className={`flex-shrink-0 w-11 h-11 rounded-lg border ${categoryInfo.borderColor} ${categoryInfo.bgColor} flex items-center justify-center`}
        >
          <CategoryIcon className={`w-5 h-5 ${categoryInfo.textColor}`} />
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3
              className="text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-brand-400"
              title={task.fileName}
              onClick={() => isCompleted && onOpenFile(task.id)}
            >
              {task.fileName}
            </h3>

            {/* Status Badge */}
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                isCompleted
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : isDownloading
                  ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20 animate-pulse'
                  : isPaused
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : isQueued
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {task.status}
            </span>
          </div>

          {/* Segmented Progress Bar */}
          <div className="my-2.5">
            <SegmentedBar
              chunks={task.chunks}
              overallProgress={task.progress}
              status={task.status}
            />
          </div>

          {/* Metrics & Info */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-y-1">
            <div className="flex items-center gap-3">
              <span>
                {formatBytes(task.downloadedBytes)} / {task.fileSize > 0 ? formatBytes(task.fileSize) : 'Unknown size'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-slate-300">
                {task.progress > 0 ? `${task.progress.toFixed(1)}%` : '0%'}
              </span>
              {task.protocol === 'torrent' ? (
                <span className="inline-block px-1.5 py-0.2 text-[10px] bg-cyan-950/80 text-cyan-400 border border-cyan-800/40 rounded font-medium">
                  BitTorrent
                </span>
              ) : task.supportsRanges ? (
                <span className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] bg-slate-800 text-slate-400 rounded">
                  Accelerated
                </span>
              ) : null}
              {task.protocol === 'torrent' && task.peers !== undefined && (
                <span className="text-[11px] text-cyan-300/80 font-mono">
                  {task.peers} peers
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 font-mono">
              {isDownloading && (
                <>
                  <span className="text-brand-400 font-semibold">{formatSpeed(task.speed)}</span>
                  {task.uploadSpeed !== undefined && task.uploadSpeed > 0 && (
                    <span className="text-emerald-400/90 text-[11px]">↑ {formatSpeed(task.uploadSpeed)}</span>
                  )}
                  <span className="text-slate-600">•</span>
                  <span>ETA: {formatEta(task.eta)}</span>
                </>
              )}
              {isCompleted && (
                <span className="text-emerald-400 flex items-center gap-1 font-sans">
                  <FileCheck className="w-3.5 h-3.5" /> Complete
                </span>
              )}
              {isPaused && <span className="text-amber-400 font-sans">Paused</span>}
              {isQueued && <span className="text-purple-400 font-sans">Queued</span>}
              {isError && (
                <span className="text-rose-400 flex items-center gap-1 font-sans" title={task.errorMessage}>
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[200px]">{task.errorMessage || 'Download error'}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isError ? (
            <button
              onClick={() => onResume(task.id)}
              className="p-2 text-rose-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1"
              title="Retry Download"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : isDownloading ? (
            <button
              onClick={() => onPause(task.id)}
              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 rounded-lg transition-colors"
              title="Pause Download"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onResume(task.id)}
              disabled={isCompleted}
              className={`p-2 rounded-lg transition-colors ${
                isCompleted
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80'
              }`}
              title="Resume Download"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {isCompleted && (
            <button
              onClick={() => onOpenFile(task.id)}
              className="p-2 text-slate-400 hover:text-brand-400 hover:bg-slate-800/80 rounded-lg transition-colors"
              title="Open File"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => onOpenFolder(task.id)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="Show in Folder"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
            title="Delete Task"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-2 text-slate-500 hover:text-slate-300 rounded-lg"
            title="Toggle Details"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Details Section */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-400 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Source URL:</span>
            <span className="truncate max-w-md font-mono text-[11px] text-slate-300" title={task.url}>
              {task.url}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Saved to:</span>
            <span className="truncate max-w-md font-mono text-[11px] text-slate-300" title={task.savePath}>
              {task.savePath}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Added on:</span>
            <span>{formatDate(task.createdAt)}</span>
          </div>

          {task.infoHash && (
            <div className="flex items-center justify-between font-mono text-[10px] pt-1">
              <span className="text-slate-500">InfoHash:</span>
              <span className="text-cyan-400 select-all">{task.infoHash}</span>
            </div>
          )}

          {task.torrentFiles && task.torrentFiles.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-850">
              <span className="text-slate-400 font-medium block mb-1.5 text-[11px]">
                Included Files ({task.torrentFiles.length}):
              </span>
              <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                {task.torrentFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="truncate text-slate-300 max-w-[280px]" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">
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
        <div className="absolute inset-0 bg-surface-950/95 backdrop-blur-sm rounded-xl p-4 flex flex-col justify-center items-center z-10 animate-fade-in">
          <p className="text-sm font-medium text-slate-200 mb-3 text-center">
            Remove <span className="font-semibold text-white">"{task.fileName}"</span>?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(task.id, false);
              }}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
            >
              Remove from List
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(task.id, true);
              }}
              className="px-3 py-1.5 text-xs bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg transition-colors"
            >
              Delete File & Task
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
