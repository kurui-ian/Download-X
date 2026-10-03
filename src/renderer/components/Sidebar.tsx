import React from 'react';
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
  FileText,
  Archive,
  Terminal,
  Settings,
  Activity,
  Radio
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
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentStatus,
  currentCategory,
  onSelectStatus,
  onSelectCategory,
  tasks,
  speedStats,
  onOpenSettings,
}) => {
  const statusCounts = {
    all: tasks.length,
    downloading: tasks.filter((t) => t.status === 'downloading').length,
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
    { id: 'document', label: 'Documents', icon: FileText },
    { id: 'archive', label: 'Archives', icon: Archive },
    { id: 'program', label: 'Programs & .exe', icon: Terminal },
  ];

  return (
    <aside className="w-60 bg-zinc-50/80 dark:bg-black border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col justify-between h-full select-none transition-colors">
      <div className="flex flex-col flex-1 overflow-y-auto p-3.5 space-y-5">
        {/* Minimalist Monochrome Brand Header */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-8 h-8 rounded-lg bg-black dark:bg-white flex items-center justify-center text-white dark:text-black shadow-sm">
            <span className="font-mono font-black text-sm tracking-tighter">DX</span>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">DLX</h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">Download Manager</p>
          </div>
        </div>

        {/* Status Navigation */}
        <div>
          <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
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
          <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
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

      {/* Footer / Speed Meter & Settings */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-950 space-y-2">
        {/* Speed meter card */}
        <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-0.5">
            <span className="flex items-center gap-1 font-mono">
              <Activity className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
              <span>Speed</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {speedStats.activeCount} active
            </span>
          </div>
          <div className="font-mono text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
            {formatSpeed(speedStats.totalSpeed)}
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
