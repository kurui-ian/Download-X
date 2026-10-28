import React from 'react';
import { Plus, Play, Pause, Trash2, Search, Sun, Moon, Laptop, Zap, X } from 'lucide-react';
import { ThemeMode } from '../utils/theme';

interface HeaderProps {
  onOpenAddModal: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  theme: ThemeMode;
  onCycleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAddModal,
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  searchQuery,
  onSearchChange,
  theme,
  onCycleTheme,
}) => {
  return (
    <header className="drag-region h-11 px-3.5 bg-zinc-100/90 dark:bg-obsidian-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 flex items-center justify-between gap-3 select-none transition-colors pr-36 z-20">
      {/* Left: Brand Identity & Engine Status */}
      <div className="flex items-center gap-2.5 no-drag flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <img
              src="./icon.png"
              alt="DLX Logo"
              className="w-5 h-5 rounded-md shadow-sm object-contain"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full ring-2 ring-zinc-100 dark:ring-obsidian-950" />
          </div>
          <span className="font-bold text-xs tracking-tight text-zinc-900 dark:text-zinc-100">
            DLX
          </span>
        </div>

        <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
          <Zap className="w-2.5 h-2.5" />
          <span>ACCELERATED 16x</span>
        </span>
      </div>

      {/* Center: Quick Search Input */}
      <div className="relative flex-1 max-w-xs no-drag">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter downloads... (Ctrl+F)"
          aria-label="Filter downloads by file name or URL"
          className="w-full bg-white dark:bg-obsidian-900 border border-zinc-300/80 dark:border-white/10 focus:border-cyan-500 dark:focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/30 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all font-sans"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Clear search filter"
            aria-label="Clear search filter"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Right: Global Actions Toolbar */}
      <div className="flex items-center gap-1.5 no-drag flex-shrink-0" role="toolbar" aria-label="Global download controls">
        {/* Quick Theme Switcher */}
        <button
          onClick={onCycleTheme}
          className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-obsidian-850 rounded-lg transition-colors"
          title={`Theme: ${theme.toUpperCase()} (Click to toggle)`}
          aria-label={`Toggle theme mode, current is ${theme}`}
        >
          {theme === 'light' ? (
            <Sun className="w-3.5 h-3.5 text-amber-500" />
          ) : theme === 'dark' ? (
            <Moon className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <Laptop className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
          )}
        </button>

        <div className="h-3.5 w-[1px] bg-zinc-300 dark:bg-white/10 mx-0.5" aria-hidden="true" />

        {/* Global Batch Controls */}
        <button
          onClick={onResumeAll}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 rounded-lg transition-all shadow-sm"
          title="Resume all downloads"
          aria-label="Resume all downloads"
        >
          <Play className="w-3 h-3 text-emerald-500 fill-emerald-500" />
          <span className="hidden md:inline">Resume</span>
        </button>

        <button
          onClick={onPauseAll}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 rounded-lg transition-all shadow-sm"
          title="Pause all downloads"
          aria-label="Pause all downloads"
        >
          <Pause className="w-3 h-3 text-amber-500 fill-amber-500" />
          <span className="hidden md:inline">Pause</span>
        </button>

        <button
          onClick={onClearCompleted}
          className="p-1.5 text-zinc-400 hover:text-rose-500 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-zinc-200/70 dark:hover:bg-obsidian-850 rounded-lg transition-colors"
          title="Clear completed tasks from list"
          aria-label="Clear completed tasks"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Primary CTA: Add Download */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-medium text-xs rounded-lg shadow-sm shadow-cyan-900/30 hover:shadow-cyan-500/20 transition-all transform active:scale-95"
          title="Add Download (Ctrl+N)"
          aria-label="Add new download task"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Add Download</span>
        </button>
      </div>
    </header>
  );
};
