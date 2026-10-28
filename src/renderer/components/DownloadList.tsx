import React, { useState, useEffect, useMemo } from 'react';
import { 
  Download, 
  ArrowDownToLine, 
  Zap, 
  Trash2, 
  Check, 
  Minus, 
  X, 
  ArrowUpDown,
  Layers,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { DownloadTask } from '../types';
import { DownloadItem } from './DownloadItem';

type SortField = 'date' | 'name' | 'size' | 'speed' | 'progress';
type SortOrder = 'asc' | 'desc';

interface DownloadListProps {
  tasks: DownloadTask[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
  onDeleteMultiple?: (ids: string[], deleteFile: boolean) => void;
  onOpenFile: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onOpenAddModal: () => void;
  onQuickTestDownload?: (url: string) => void;
}

export const DownloadList: React.FC<DownloadListProps> = ({
  tasks,
  onPause,
  onResume,
  onDelete,
  onDeleteMultiple,
  onOpenFile,
  onOpenFolder,
  onOpenAddModal,
  onQuickTestDownload,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Prune any selected IDs that are no longer in the visible tasks list
  useEffect(() => {
    const visibleSet = new Set(tasks.map((t) => t.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleSet.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  useEffect(() => {
    if (selectedIds.size === 0) {
      setShowBulkDeleteConfirm(false);
    }
  }, [selectedIds.size]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let compare = 0;
      switch (sortField) {
        case 'date':
          compare = a.createdAt - b.createdAt;
          break;
        case 'name':
          compare = a.fileName.localeCompare(b.fileName);
          break;
        case 'size':
          compare = (a.fileSize || 0) - (b.fileSize || 0);
          break;
        case 'speed':
          compare = (a.speed || 0) - (b.speed || 0);
          break;
        case 'progress':
          compare = a.progress - b.progress;
          break;
      }
      return sortOrder === 'asc' ? compare : -compare;
    });
  }, [tasks, sortField, sortOrder]);

  const allSelected = useMemo(
    () => sortedTasks.length > 0 && selectedIds.size === sortedTasks.length,
    [sortedTasks.length, selectedIds.size]
  );

  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
    } else {
      setSelectedIds(new Set(sortedTasks.map((t) => t.id)));
    }
  };

  const handleToggleSelect = (id: string, shiftKey?: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(id);

      if (shiftKey && lastClickedId && lastClickedId !== id) {
        const startIdx = sortedTasks.findIndex((t) => t.id === lastClickedId);
        const endIdx = sortedTasks.findIndex((t) => t.id === id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const shouldSelect = !isCurrentlySelected;
          for (let i = from; i <= to; i++) {
            if (shouldSelect) {
              next.add(sortedTasks[i].id);
            } else {
              next.delete(sortedTasks[i].id);
            }
          }
          return next;
        }
      }

      if (isCurrentlySelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastClickedId(id);
  };

  const handleBulkDelete = (deleteFile: boolean) => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    setShowBulkDeleteConfirm(false);
    setSelectedIds(new Set());

    if (onDeleteMultiple) {
      onDeleteMultiple(idsToDelete, deleteFile);
    } else {
      for (const id of idsToDelete) {
        onDelete(id, deleteFile);
      }
    }
  };

  // Zero-State: High-Performance Technical Dashboard
  if (sortedTasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-white dark:bg-obsidian-950">
        <div className="relative mb-5">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-obsidian animate-drop-pulse">
            <ArrowDownToLine className="w-8 h-8" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
          </span>
        </div>

        <h3 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">
          Queue Ready for Transfers
        </h3>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-6 leading-relaxed font-sans">
          Paste a download URL, drag & drop a <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium">.torrent</span> file, or trigger a multi-part accelerated test below.
        </p>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-md">
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-medium text-xs rounded-xl shadow-sm shadow-cyan-900/30 transition-all transform active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Add Download (Ctrl+N)</span>
          </button>

          {onQuickTestDownload && (
            <>
              <button
                onClick={() => onQuickTestDownload('https://speed.cloudflare.com/__down?bytes=10485760')}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-obsidian-900 hover:bg-zinc-200 dark:hover:bg-obsidian-850 text-zinc-800 dark:text-zinc-200 font-mono text-xs rounded-xl border border-zinc-200 dark:border-white/10 transition-all shadow-sm"
                title="Test 10MB multi-threaded transfer"
              >
                <Zap className="w-3 h-3 text-cyan-500" />
                <span>Test 10MB</span>
              </button>

              <button
                onClick={() => onQuickTestDownload('https://speed.cloudflare.com/__down?bytes=104857600')}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-obsidian-900 hover:bg-zinc-200 dark:hover:bg-obsidian-850 text-zinc-800 dark:text-zinc-200 font-mono text-xs rounded-xl border border-zinc-200 dark:border-white/10 transition-all shadow-sm"
                title="Test 100MB multi-threaded 16-part acceleration"
              >
                <Layers className="w-3 h-3 text-emerald-500" />
                <span>Test 100MB</span>
              </button>

              <button
                onClick={() => onQuickTestDownload('https://www.7-zip.org/a/7z2408-x64.exe')}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-obsidian-900 hover:bg-zinc-200 dark:hover:bg-obsidian-850 text-zinc-800 dark:text-zinc-200 font-mono text-xs rounded-xl border border-zinc-200 dark:border-white/10 transition-all shadow-sm"
                title="Test downloading a real Windows application installer (.exe)"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>7-Zip App (.exe)</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-obsidian-950">
      {/* Sub-Header Toolbar: Selection & Sorting */}
      <div className="px-3.5 py-1.5 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/80 dark:bg-obsidian-900/70 backdrop-blur-sm flex items-center justify-between gap-3 select-none text-xs">
        {/* Left: Bulk Checkbox & Selection Telemetry */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleSelectAll}
            className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-cyan-500 transition-colors"
            title={allSelected ? 'Deselect all items' : 'Select all items'}
          >
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                allSelected || someSelected
                  ? 'bg-cyan-500 border-cyan-500 text-white'
                  : 'border-zinc-300 dark:border-white/20 bg-white dark:bg-obsidian-950'
              }`}
            >
              {allSelected ? (
                <Check className="w-3 h-3 stroke-[3]" />
              ) : someSelected ? (
                <Minus className="w-3 h-3 stroke-[3]" />
              ) : null}
            </span>
            <span className="font-mono text-[11px] font-medium">
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${sortedTasks.length} selected`
                : `Select All (${sortedTasks.length})`}
            </span>
          </button>

          {selectedIds.size > 0 && !showBulkDeleteConfirm && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[10px] font-mono text-zinc-500 hover:text-cyan-500 underline underline-offset-2 transition-colors ml-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Right: Sort controls or Bulk Delete Confirmation */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            showBulkDeleteConfirm ? (
              <div className="flex items-center gap-1.5 bg-white dark:bg-obsidian-850 px-2 py-0.5 rounded-lg border border-rose-500/30 shadow-sm">
                <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mr-1">
                  Remove {selectedIds.size} {selectedIds.size === 1 ? 'task' : 'tasks'}?
                </span>
                <button
                  type="button"
                  onClick={() => handleBulkDelete(false)}
                  className="px-2 py-0.5 text-[10px] font-medium bg-zinc-100 dark:bg-obsidian-800 hover:bg-zinc-200 dark:hover:bg-obsidian-750 text-zinc-900 dark:text-zinc-100 rounded transition-colors"
                >
                  List Only
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkDelete(true)}
                  className="px-2 py-0.5 text-[10px] font-medium bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors"
                >
                  Delete Files
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-md transition-all"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            )
          ) : (
            /* Sort Dropdown / Selector */
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              <ArrowUpDown className="w-3 h-3" />
              <span>Sort:</span>
              <select
                value={`${sortField}-${sortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split('-') as [SortField, SortOrder];
                  setSortField(f);
                  setSortOrder(o);
                }}
                className="bg-transparent text-zinc-800 dark:text-zinc-200 font-sans text-[11px] outline-none cursor-pointer hover:text-cyan-500"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name-asc">File Name (A-Z)</option>
                <option value="size-desc">Size (Largest)</option>
                <option value="speed-desc">Speed (Fastest)</option>
                <option value="progress-desc">Progress (%)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Tasks Virtualised/Scrollable Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {sortedTasks.map((task) => (
          <DownloadItem
            key={task.id}
            task={task}
            isSelected={selectedIds.has(task.id)}
            onToggleSelect={handleToggleSelect}
            onPause={onPause}
            onResume={onResume}
            onDelete={onDelete}
            onOpenFile={onOpenFile}
            onOpenFolder={onOpenFolder}
          />
        ))}
      </div>
    </div>
  );
};
