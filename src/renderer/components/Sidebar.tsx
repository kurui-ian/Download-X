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
    <aside className="w-64 bg-surface-900 border-r border-slate-800 flex flex-col justify-between h-full select-none">
      <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wide text-white">DLX</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Download Manager</p>
          </div>
        </div>

        {/* Status Navigation */}
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">
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
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
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
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">
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
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{cat.label}</span>
                  </div>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
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

      {/* Footer / Speed Gauge & Settings */}
      <div className="p-4 border-t border-slate-800 bg-surface-950/40 space-y-3">
        {/* Real-time speed gauge */}
        <div className="p-3 bg-surface-900/90 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-brand-400" />
              <span>Speed</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {speedStats.activeCount} active
            </span>
          </div>
          <div className="font-mono text-base font-bold text-slate-100 tracking-tight">
            {formatSpeed(speedStats.totalSpeed)}
          </div>
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 border border-transparent hover:border-slate-700 transition-all"
        >
          <Settings className="w-4 h-4" />
          <span>Preferences & Settings</span>
        </button>
      </div>
    </aside>
  );
};
