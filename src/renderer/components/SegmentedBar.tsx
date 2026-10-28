import React, { useState } from 'react';
import { ChunkInfo } from '../types';
import { formatBytes, formatSpeed } from '../utils/formatters';

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

  const [hoveredChunk, setHoveredChunk] = useState<ChunkInfo | null>(null);

  // If single stream / torrent or chunks unpopulated yet
  if (!chunks || chunks.length <= 1) {
    const clampedProgress = Math.min(100, Math.max(0, overallProgress));

    let barColor = 'bg-cyan-500 shadow-glow-cyan';
    if (isCompleted) barColor = 'bg-emerald-500 shadow-glow-emerald';
    else if (isPaused) barColor = 'bg-amber-500/80';
    else if (isError) barColor = 'bg-rose-500/80';

    return (
      <div className="w-full space-y-1">
        <div className="relative w-full h-2 bg-zinc-200 dark:bg-obsidian-800 rounded-full overflow-hidden border border-zinc-300/60 dark:border-white/5">
          <div
            className={`h-full ${barColor} transition-all duration-300 ease-out rounded-full relative overflow-hidden`}
            style={{ width: `${clampedProgress}%` }}
          >
            {isDownloading && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 dark:via-white/40 to-transparent animate-shimmer-flow" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Multi-stream segmented acceleration visualizer
  const activeChunksCount = chunks.filter((c) => c.status === 'downloading').length;
  const completedChunksCount = chunks.filter((c) => c.status === 'completed').length;

  return (
    <div className="w-full space-y-1.5" role="progressbar" aria-valuenow={Math.round(overallProgress)} aria-valuemin={0} aria-valuemax={100} aria-label="Parallel stream download segments">
      {/* Segmented stream blocks */}
      <div className="relative flex items-center gap-1 w-full h-3 bg-zinc-200/80 dark:bg-obsidian-950 p-0.5 rounded-md border border-zinc-300 dark:border-white/10 overflow-hidden shadow-inner">
        {chunks.map((chunk) => {
          const chunkPercent = chunk.totalBytes > 0
            ? Math.min(100, Math.max(0, (chunk.downloadedBytes / chunk.totalBytes) * 100))
            : 0;

          const isChunkActive = isDownloading && chunk.status === 'downloading';
          const isChunkDone = chunk.status === 'completed' || isCompleted;
          const isChunkFailed = chunk.status === 'failed';

          let chunkBg = 'bg-zinc-300/80 dark:bg-obsidian-800';
          let fillClass = 'bg-cyan-500';

          if (isChunkDone) {
            fillClass = 'bg-emerald-500 dark:bg-emerald-400';
          } else if (isChunkFailed) {
            fillClass = 'bg-rose-500';
          } else if (isChunkActive) {
            fillClass = 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]';
          }

          return (
            <div
              key={chunk.id}
              className={`relative h-full ${chunkBg} rounded-sm overflow-hidden transition-all duration-200 cursor-crosshair hover:ring-1 hover:ring-cyan-400`}
              style={{ flex: `${Math.max(1, chunk.totalBytes)} 1 0%` }}
              onMouseEnter={() => setHoveredChunk(chunk)}
              onMouseLeave={() => setHoveredChunk(null)}
              title={`Stream #${chunk.id + 1}: ${formatBytes(chunk.downloadedBytes)} / ${formatBytes(chunk.totalBytes)} (${chunkPercent.toFixed(0)}%)${chunk.speed > 0 ? ` • ${formatSpeed(chunk.speed)}` : ''}`}
            >
              {/* Fill bar within segment */}
              <div
                className={`h-full ${fillClass} transition-all duration-200 rounded-sm relative overflow-hidden`}
                style={{ width: `${chunkPercent}%` }}
              >
                {isChunkActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/60 to-transparent animate-shimmer-flow" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Real-time segment telemetry or hover detail */}
      <div className="flex items-center justify-between text-[10px] font-mono tracking-tight text-zinc-500 dark:text-zinc-400 px-0.5 select-none">
        {hoveredChunk ? (
          <span className="text-cyan-600 dark:text-cyan-300 font-medium">
            Stream #{hoveredChunk.id + 1}: {formatBytes(hoveredChunk.downloadedBytes)} / {formatBytes(hoveredChunk.totalBytes)} ({((hoveredChunk.downloadedBytes / Math.max(1, hoveredChunk.totalBytes)) * 100).toFixed(0)}%)
            {hoveredChunk.speed > 0 ? ` • ${formatSpeed(hoveredChunk.speed)}` : ''}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isDownloading ? 'bg-cyan-400 animate-ping' : isCompleted ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
            <span>
              {isDownloading
                ? `${activeChunksCount} of ${chunks.length} Parallel Streams Active`
                : `${chunks.length} Multi-Part Parallel Streams`}
            </span>
          </span>
        )}

        <span>
          {completedChunksCount} of {chunks.length} Segments Assembled
        </span>
      </div>
    </div>
  );
};
