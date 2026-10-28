import React, { useState, useEffect } from 'react';
import { 
  Download, 
  PlayCircle, 
  Clock, 
  CheckCircle2, 
  PauseCircle, 
  AlertOctagon, 
  Layers, 
  Film, 
  Music, 
  Image, 
  FileText, 
  Archive, 
  Terminal, 
  Settings, 
  Activity, 
  Radio, 
  Gauge,
  SlidersHorizontal
} from 'lucide-react';
import { TaskCategory, TaskStatus, GlobalSpeedStats, DownloadTask } from '../types';
import { formatSpeed } from '../utils/formatters';

interface SidebarProps {
  currentStatus: TaskStatus | 'all';
  currentCategory: TaskCategory;
  onSelectStatus: (status: TaskStatus | 'all') => void;
  onSelectCategory: (category: TaskCategory) => void;
  tasks: DownloadTask[];
  speedStats: GlobalSpeedStats;
  speedLimitBytesPerSec: number;
  onUpdateSpeedLimit: (bytesPerSec: number) => void;
  onOpenSettings: () => void;
}

const SPEED_PRESETS = [
  { label: '∞', title: 'Unlimited', mbps: 0 },
  { label: '0.5M', title: '0.5 MB/s', mbps: 0.5 },
  { label: '1M', title: '1 MB/s', mbps: 1 },
  { label: '2M', title: '2 MB/s', mbps: 2 },
  { label: '5M', title: '5 MB/s', mbps: 5 },
  { label: '10M', title: '10 MB/s', mbps: 10 },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentStatus,
  currentCategory,
  onSelectStatus,
  onSelectCategory,
  tasks,
  speedStats,
  speedLimitBytesPerSec,
  onUpdateSpeedLimit,
  onOpenSettings,
}) => {
  const currentLimitMb = speedLimitBytesPerSec > 0
    ? Number((speedLimitBytesPerSec / (1024 * 1024)).toFixed(2))
    : 0;

  const [customMbInput, setCustomMbInput] = useState<string>(
    currentLimitMb > 0 ? String(currentLimitMb) : ''
  );

  useEffect(() => {
    const mb = speedLimitBytesPerSec > 0
      ? Number((speedLimitBytesPerSec / (1024 * 1024)).toFixed(2))
      : 0;
    setCustomMbInput(mb > 0 ? String(mb) : '');
  }, [speedLimitBytesPerSec]);

  const handleApplyCustomMb = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customMbInput);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdateSpeedLimit(Math.round(parsed * 1024 * 1024));
    } else {
      onUpdateSpeedLimit(0);
      setCustomMbInput('');
    }
  };

  const statusCounts = {
    all: tasks.length,
    downloading: tasks.filter((t) => t.status === 'downloading' || t.status === 'connecting').length,
    queued: tasks.filter((t) => t.status === 'queued').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    paused: tasks.filter((t) => t.status === 'paused').length,
    error: tasks.filter((t) => t.status === 'error').length,
  };

  const statusItems: { id: TaskStatus | 'all'; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'all', label: 'All Tasks', icon: Download, count: statusCounts.all },
    { id: 'downloading', label: 'Downloading', icon: PlayCircle, count: statusCounts.downloading },
    { id: 'queued', label: 'Queued', icon: Clock, count: statusCounts.queued },
    { id: 'completed', label: 'Completed', icon: CheckCircle2, count: statusCounts.completed },
    { id: 'paused', label: 'Paused', icon: PauseCircle, count: statusCounts.paused },
    { id: 'error', label: 'Failed', icon: AlertOctagon, count: statusCounts.error },
  ];

  const categoryCounts: Record<TaskCategory, number> = {
    all: tasks.length,
    torrent: tasks.filter((t) => t.category === 'torrent' || t.protocol === 'torrent').length,
    video: tasks.filter((t) => t.category === 'video').length,
    audio: tasks.filter((t) => t.category === 'audio').length,
    image: tasks.filter((t) => t.category === 'image').length,
    document: tasks.filter((t) => t.category === 'document').length,
    archive: tasks.filter((t) => t.category === 'archive').length,
    program: tasks.filter((t) => t.category === 'program').length,
    other: tasks.filter((t) => t.category === 'other').length,
  };

  const categoryItems: { id: TaskCategory; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'All Media', icon: Layers },
    { id: 'torrent', label: 'Torrents', icon: Radio },
    { id: 'video', label: 'Videos', icon: Film },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'image', label: 'Images', icon: Image },
    { id: 'document', label: 'Documents', icon: FileText },
    { id: 'archive', label: 'Archives', icon: Archive },
    { id: 'program', label: 'Applications', icon: Terminal },
  ];

  return (
    <aside className="w-56 bg-zinc-100/70 dark:bg-obsidian-900 border-r border-zinc-200 dark:border-white/5 flex flex-col justify-between h-full select-none transition-colors z-10 flex-shrink-0">
      <div className="flex flex-col flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {/* Status Navigation Group */}
        <div>
          <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1.5 flex items-center justify-between">
            <span>Status</span>
            <span className="text-[9px] text-zinc-400 dark:text-zinc-600">{tasks.length} Total</span>
          </div>

          <nav className="space-y-0.5" aria-label="Task Status Navigation">
            {statusItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentStatus === item.id && currentCategory === 'all';
              const isDownloadingActive = item.id === 'downloading' && item.count > 0;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectStatus(item.id)}
                  aria-label={`Filter by ${item.label} (${item.count} tasks)`}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-obsidian-950 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-obsidian-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${isDownloadingActive ? 'text-cyan-500 dark:text-cyan-400' : ''}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                        isActive
                          ? 'bg-white/20 dark:bg-black/20 text-current'
                          : isDownloadingActive
                          ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                          : 'bg-zinc-200 dark:bg-obsidian-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Categories Navigation Group */}
        <div>
          <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
            Categories
          </div>

          <nav className="space-y-0.5" aria-label="Task Category Navigation">
            {categoryItems.map((cat) => {
              const Icon = cat.icon;
              const isActive = currentCategory === cat.id && currentCategory !== 'all';
              const count = categoryCounts[cat.id];

              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  aria-label={`Filter by ${cat.label} (${count} tasks)`}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-obsidian-950 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-obsidian-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                  </div>

                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                        isActive
                          ? 'bg-white/20 dark:bg-black/20 text-current'
                          : 'bg-zinc-200 dark:bg-obsidian-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Technical Telemetry & Speed Station */}
      <div className="p-2.5 border-t border-zinc-200 dark:border-white/5 bg-zinc-200/40 dark:bg-obsidian-950/80 space-y-2">
        {/* Speedometer Telemetry Card */}
        <div className="p-2.5 bg-white dark:bg-obsidian-900 rounded-xl border border-zinc-200 dark:border-white/10 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                <Activity className={`w-3 h-3 ${speedStats.totalSpeed > 0 ? 'text-cyan-500 animate-pulse' : 'text-zinc-400'}`} />
                <span>SPEED ({speedStats.activeCount} ACTIVE)</span>
              </div>
              <div className="font-mono tabular-nums text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {formatSpeed(speedStats.totalSpeed)}
              </div>
            </div>

            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-obsidian-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-white/5">
              {currentLimitMb > 0 ? `Cap: ${currentLimitMb}M` : 'Unlimited'}
            </span>
          </div>

          {/* Speed Limiter Throttle */}
          <div className="pt-2 border-t border-zinc-100 dark:border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Gauge className="w-3 h-3" />
                <span>Bandwidth Throttle</span>
              </span>
              {currentLimitMb > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSpeedLimit(0);
                    setCustomMbInput('');
                  }}
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Clear Cap
                </button>
              )}
            </div>

            {/* Speed Preset Chips */}
            <div className="grid grid-cols-6 gap-1" role="group" aria-label="Speed limit presets">
              {SPEED_PRESETS.map((preset) => {
                const isSelected = preset.mbps === 0
                  ? currentLimitMb === 0
                  : Math.abs(currentLimitMb - preset.mbps) < 0.01;

                return (
                  <button
                    key={preset.label}
                    type="button"
                    title={preset.title}
                    onClick={() => {
                      onUpdateSpeedLimit(preset.mbps > 0 ? Math.round(preset.mbps * 1024 * 1024) : 0);
                      setCustomMbInput(preset.mbps > 0 ? String(preset.mbps) : '');
                    }}
                    className={`py-1 rounded text-[10px] font-mono tabular-nums font-medium transition-all ${
                      isSelected
                        ? 'bg-cyan-500 text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-obsidian-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Input */}
            <form onSubmit={handleApplyCustomMb} className="flex items-center gap-1">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={customMbInput}
                  onChange={(e) => setCustomMbInput(e.target.value)}
                  placeholder="Custom cap (MB/s)"
                  aria-label="Custom speed limit in megabytes per second"
                  className="w-full bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/10 focus:border-cyan-500 rounded-md pl-2 pr-8 py-0.5 text-[10px] font-mono tabular-nums text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-zinc-400 pointer-events-none">
                  MB/s
                </span>
              </div>
              <button
                type="submit"
                className="px-2 py-0.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-md text-[10px] font-mono font-medium hover:opacity-90 transition-opacity"
              >
                Set
              </button>
            </form>
          </div>
        </div>

        {/* Preferences Button */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-obsidian-800 transition-all border border-transparent hover:border-zinc-300 dark:hover:border-white/10"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Preferences & Settings (Ctrl+,)</span>
        </button>

        {/* Attribution Footnote */}
        <div className="pt-1 text-center">
          <p className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 tracking-tight">
            Engineered by <span className="text-zinc-700 dark:text-zinc-300 font-medium">Kurui Ian Kipkemboi</span>
          </p>
        </div>
      </div>
    </aside>
  );
};
