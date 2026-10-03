import React from 'react';
import { ChunkInfo } from '../types';
import { formatBytes } from '../utils/formatters';

interface SegmentedBarProps {
  chunks: ChunkInfo[];
  overallProgress: number;
  status: string;
}

export const SegmentedBar: React.FC<SegmentedBarProps> = ({ chunks, overallProgress, status }) => {
  // If no multi-part chunks exist or single-stream, render standard sleek progress bar
  if (!chunks || chunks.length <= 1) {
    let barColor = 'bg-brand-500';
    if (status === 'completed') barColor = 'bg-emerald-500';
    if (status === 'paused') barColor = 'bg-amber-500/80';
    if (status === 'error') barColor = 'bg-rose-500';

    return (
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
        <div
          className={`h-full ${barColor} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-1 w-full h-2.5 bg-slate-800/90 p-0.5 rounded-md border border-slate-700/50 overflow-hidden">
        {chunks.map((chunk) => {
          const chunkPercent = chunk.totalBytes > 0 
            ? Math.min(100, Math.max(0, (chunk.downloadedBytes / chunk.totalBytes) * 100))
            : 0;

          let chunkColor = 'bg-brand-500';
          if (status === 'completed' || chunk.status === 'completed') {
            chunkColor = 'bg-emerald-500';
          } else if (status === 'paused') {
            chunkColor = 'bg-amber-500/80';
          } else if (chunk.status === 'downloading') {
            chunkColor = 'bg-brand-400 shadow-[0_0_8px_rgba(43,151,254,0.5)]';
          }

          return (
            <div
              key={chunk.id}
              className="relative flex-1 h-full bg-slate-900/80 rounded-sm overflow-hidden group cursor-help"
              title={`Thread #${chunk.id + 1}: ${formatBytes(chunk.downloadedBytes)} / ${formatBytes(chunk.totalBytes)} (${chunkPercent.toFixed(0)}%)`}
            >
              <div
                className={`h-full ${chunkColor} transition-all duration-200 rounded-sm`}
                style={{ width: `${chunkPercent}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5">
        <span>{chunks.length} Parallel Connections</span>
        <span>
          {chunks.filter((c) => c.status === 'completed').length} of {chunks.length} parts merged
        </span>
      </div>
    </div>
  );
};
