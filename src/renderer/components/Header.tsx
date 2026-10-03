import React from 'react';
import { Plus, Play, Pause, Trash2, Search } from 'lucide-react';

interface HeaderProps {
  onOpenAddModal: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAddModal,
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <header className="h-16 px-6 bg-surface-900/90 border-b border-slate-800 flex items-center justify-between gap-4 select-none">
      {/* Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter downloads by file name or URL..."
          className="w-full bg-surface-950/80 border border-slate-800 focus:border-brand-500 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none transition-all"
        />
      </div>

      {/* Global Action Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={onResumeAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-emerald-400 bg-surface-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg transition-all"
          title="Resume all queued and paused downloads"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Resume All</span>
        </button>

        <button
          onClick={onPauseAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-amber-400 bg-surface-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg transition-all"
          title="Pause all active downloads"
        >
          <Pause className="w-3.5 h-3.5" />
          <span>Pause All</span>
        </button>

        <button
          onClick={onClearCompleted}
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
          title="Clear Completed & Cancelled tasks"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="h-5 w-[1px] bg-slate-800 mx-1" />

        {/* Primary CTA */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-brand-600/25 transition-all transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Download</span>
        </button>
      </div>
    </header>
  );
};
