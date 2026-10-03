import React from 'react';
import { Plus, Play, Pause, Trash2, Search, Sun, Moon, Laptop } from 'lucide-react';
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
    <header className="h-14 px-5 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-4 select-none transition-colors">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by file name or URL..."
          className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-black dark:focus:border-white rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all font-sans"
        />
      </div>

      {/* Global Actions Toolbar */}
      <div className="flex items-center gap-1.5">
        {/* Quick Theme Switcher */}
        <button
          onClick={onCycleTheme}
          className="p-1.5 text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
          title={`Theme: ${theme.toUpperCase()} (Click to toggle)`}
        >
          {theme === 'light' ? (
            <Sun className="w-4 h-4 text-zinc-800" />
          ) : theme === 'dark' ? (
            <Moon className="w-4 h-4 text-zinc-200" />
          ) : (
            <Laptop className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          )}
        </button>

        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

        <button
          onClick={onResumeAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-lg transition-all"
          title="Resume all downloads"
        >
          <Play className="w-3 h-3" />
          <span>Resume</span>
        </button>

        <button
          onClick={onPauseAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-lg transition-all"
          title="Pause all downloads"
        >
          <Pause className="w-3 h-3" />
          <span>Pause</span>
        </button>

        <button
          onClick={onClearCompleted}
          className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
          title="Clear Completed tasks"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* High-Contrast Minimalist Primary CTA */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-medium text-xs rounded-lg shadow-sm transition-all transform active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Download</span>
        </button>
      </div>
    </header>
  );
};
