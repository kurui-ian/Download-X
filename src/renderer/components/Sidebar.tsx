import React, { useState, useEffect } from 'react';
import { 
  Download, 
  PlayCircle, 
  Clock, 
  CheckCircle2, 
  PauseCircle, 
  AlertOctagon, 
  Zap,
  Film,
  Music,
  Image,
  FileText,
  Archive,
  Terminal,
  Settings,
  Activity,
  Radio,
  Gauge
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
    { id: 'all', label: 'All Files', icon: Zap },
    { id: 'torrent', label: 'Torrents', icon: Radio },
    { id: 'video', label: 'Videos', icon: Film },
    { id: 'audio', label: 'Music & Audio', icon: Music },
    { id: 'image', label: 'Images', icon: Image },
    { id: 'document', label: 'Documents', icon: FileText },
    { id: 'archive', label: 'Archives', icon: Archive },
    { id: 'program', label: 'Programs & .exe', icon: Terminal },
  ];

  return (
    <aside className="w-60 bg-zinc-50/80 dark:bg-black border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col justify-between h-full select-none transition-colors">
      <div className="flex flex-col flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Minimalist Monochrome Brand Header */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <img
            src="./icon.png"
            alt="DLX"
            className="w-8 h-8 rounded-lg shadow-sm object-contain flex-shrink-0"
          />
          <div>
            <h1 className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">DLX</h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">Download Manager</p>
          </div>
        </div>

        {/* Status Navigation */}
        <div>
          <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1">
            Status
          </div>
          <nav className="space-y-0.5">
            {statusItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentStatus === item.id && currentCategory === 'all';
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectStatus(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive 
                          ? 'bg-white/20 dark:bg-black/20 text-current' 
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
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

        {/* Categories Navigation */}
        <div>
          <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1">
            Categories
          </div>
          <nav className="space-y-0.5">
            {categoryItems.map((cat) => {
              const Icon = cat.icon;
              const isActive = currentCategory === cat.id && currentCategory !== 'all';
              const count = categoryCounts[cat.id];
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                  </div>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive 
                          ? 'bg-white/20 dark:bg-black/20 text-current' 
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
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

      {/* Footer / Speed Meter, Speed Limiter & Settings */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-950 space-y-2">
        {/* Speed Meter & Speed Limiter Card */}
        <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                <Activity className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                <span>Speed ({speedStats.activeCount} active)</span>
              </div>
              <div className="font-mono text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                {formatSpeed(speedStats.totalSpeed)}
              </div>
            </div>

            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              {currentLimitMb > 0 ? `Cap: ${currentLimitMb} MB/s` : 'Unlimited'}
            </span>
          </div>

          {/* Speed Limiter Section */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="flex items-center gap-1">
                <Gauge className="w-3 h-3" />
                <span>Speed Limit</span>
              </span>
              {currentLimitMb > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSpeedLimit(0);
                    setCustomMbInput('');
                  }}
                  className="text-[10px] text-zinc-500 hover:text-black dark:hover:text-white underline"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Preset Speed Cap Buttons */}
            <div className="grid grid-cols-6 gap-1">
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
                    className={`py-1 rounded text-[10px] font-mono font-medium transition-all ${
                      isSelected
                        ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom MB/s Input */}
            <form onSubmit={handleApplyCustomMb} className="flex items-center gap-1">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={customMbInput}
                  onChange={(e) => setCustomMbInput(e.target.value)}
                  placeholder="Custom (e.g. 1)"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-black dark:focus:border-white rounded-md pl-2 pr-8 py-1 text-[11px] font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-zinc-400 pointer-events-none">
                  MB/s
                </span>
              </div>
              <button
                type="submit"
                className="px-2 py-1 bg-black dark:bg-white text-white dark:text-black rounded-md text-[10px] font-mono font-medium hover:opacity-90 transition-opacity"
              >
                Set
              </button>
            </form>
          </div>
        </div>

        {/* Preferences button */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-all"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Preferences</span>
        </button>
      </div>
    </aside>
  );
};
