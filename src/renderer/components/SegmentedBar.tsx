import React from 'react';
import { ChunkInfo } from '../types';
import { formatBytes } from '../utils/formatters';

interface SegmentedBarProps {
  chunks: ChunkInfo[];
  overallProgress: number;
  status: string;
}

export const SegmentedBar: React.FC<SegmentedBarProps> = ({ chunks, overallProgress, status }) => {
  const isDownloading = status === 'downloading';
  const isCompleted = status === 'completed';
  const isPaused = status === 'paused';
  const isError = status === 'error';

  // Bar fill color: high-contrast monochrome
  const getBarColor = () => {
    if (isCompleted) return 'bg-zinc-900 dark:bg-zinc-100';
    if (isPaused) return 'bg-zinc-400 dark:bg-zinc-600';
    if (isError) return 'bg-zinc-500 dark:bg-zinc-500';
    return 'bg-zinc-900 dark:bg-zinc-100';
  };

  // If no multi-part chunks exist or single-stream / torrents
  if (!chunks || chunks.length <= 1) {
    const clampedProgress = Math.min(100, Math.max(0, overallProgress));

    return (
      <div className="relative w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        {/* Main filled bar */}
        <div
          className={`h-full ${getBarColor()} transition-all duration-300 ease-out rounded-full relative overflow-hidden`}
          style={{ width: `${clampedProgress}%` }}
        >
          {/* Animated fun shimmer light wave traveling through downloading bar */}
          {isDownloading && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 dark:via-black/30 to-transparent animate-shimmer-flow" />
          )}
        </div>
      </div>
    );
  }

  // Multi-threaded segmented progress display
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-1 w-full h-2.5 bg-zinc-200 dark:bg-zinc-900 p-0.5 rounded-md border border-zinc-300 dark:border-zinc-800 overflow-hidden">
        {chunks.map((chunk) => {
          const chunkPercent = chunk.totalBytes > 0 
            ? Math.min(100, Math.max(0, (chunk.downloadedBytes / chunk.totalBytes) * 100))
            : 0;

          const isChunkActive = isDownloading && chunk.status === 'downloading';
          const isChunkDone = chunk.status === 'completed' || isCompleted;

          let chunkColor = 'bg-zinc-400 dark:bg-zinc-600';
          if (isChunkDone) {
            chunkColor = 'bg-zinc-900 dark:bg-zinc-100';
          } else if (isChunkActive) {
            chunkColor = 'bg-zinc-900 dark:bg-zinc-100 shadow-[0_0_6px_rgba(0,0,0,0.3)] dark:shadow-[0_0_6px_rgba(255,255,255,0.4)]';
          }

          return (
            <div
              key={chunk.id}
              className="relative flex-1 h-full bg-zinc-100 dark:bg-zinc-950 rounded-sm overflow-hidden group cursor-help transition-colors"
              title={`Thread #${chunk.id + 1}: ${formatBytes(chunk.downloadedBytes)} / ${formatBytes(chunk.totalBytes)} (${chunkPercent.toFixed(0)}%)`}
            >
              <div
                className={`h-full ${chunkColor} transition-all duration-200 rounded-sm relative overflow-hidden`}
                style={{ width: `${chunkPercent}%` }}
              >
                {isChunkActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-black/40 to-transparent animate-shimmer-flow" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 px-0.5 font-mono">
        <span>{chunks.length} Parallel Streams</span>
        <span>
          {chunks.filter((c) => c.status === 'completed').length} of {chunks.length} parts assembled
        </span>
      </div>
    </div>
  );
};
