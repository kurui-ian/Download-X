import React, { useState, useEffect, useMemo } from 'react';
import { Download, ArrowDownToLine, Zap, Trash2, Check, Minus, X } from 'lucide-react';
import { DownloadTask } from '../types';
import { DownloadItem } from './DownloadItem';

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

  const allSelected = useMemo(
    () => tasks.length > 0 && selectedIds.size === tasks.length,
    [tasks.length, selectedIds.size]
  );

  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const handleToggleSelect = (id: string, shiftKey?: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(id);

      if (shiftKey && lastClickedId && lastClickedId !== id) {
        const startIdx = tasks.findIndex((t) => t.id === lastClickedId);
        const endIdx = tasks.findIndex((t) => t.id === id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const shouldSelect = !isCurrentlySelected;
          for (let i = from; i <= to; i++) {
            if (shouldSelect) {
              next.add(tasks[i].id);
            } else {
              next.delete(tasks[i].id);
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

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100 mb-4 shadow-sm animate-drop-pulse">
          <ArrowDownToLine className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          No Downloads Yet
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mb-5 leading-relaxed">
          Drag & drop any <span className="font-mono text-zinc-800 dark:text-zinc-200">.torrent</span> file or paste a download link to get started.
        </p>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-medium text-xs rounded-lg shadow-sm hover:opacity-90 transition-all transform active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>+ Add Download</span>
          </button>

          {onQuickTestDownload && (
            <button
              onClick={() => onQuickTestDownload('https://proof.ovh.net/files/10Mb.dat')}
              className="flex items-center gap-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 transition-all"
            >
              <Zap className="w-3 h-3 text-zinc-900 dark:text-zinc-100" />
              <span>Test 10MB</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Multi-Select & Bulk Action Bar */}
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-950/70 flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleSelectAll}
            className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
            title={allSelected ? 'Deselect all items' : 'Select all items'}
          >
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                allSelected || someSelected
                  ? 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black'
                  : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              {allSelected ? (
                <Check className="w-3 h-3 stroke-[3]" />
              ) : someSelected ? (
                <Minus className="w-3 h-3 stroke-[3]" />
              ) : null}
            </span>
            <span className="font-medium">
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${tasks.length} selected`
                : `Select All (${tasks.length})`}
            </span>
          </button>

          {selectedIds.size > 0 && !showBulkDeleteConfirm && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Bulk Delete Controls */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            {showBulkDeleteConfirm ? (
              <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 shadow-sm">
                <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mr-1">
                  Remove {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'}?
                </span>
                <button
                  type="button"
                  onClick={() => handleBulkDelete(false)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-md transition-colors"
                >
                  Remove from List
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkDelete(true)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-90 rounded-md transition-colors"
                >
                  Delete Files & Tasks
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded transition-colors"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-black dark:bg-white text-white dark:text-black rounded-lg shadow-sm hover:opacity-90 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tasks Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {tasks.map((task) => (
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

