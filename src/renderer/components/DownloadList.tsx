import React from 'react';
import { Download, ArrowDownToLine, Zap } from 'lucide-react';
import { DownloadTask } from '../types';
import { DownloadItem } from './DownloadItem';

interface DownloadListProps {
  tasks: DownloadTask[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
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
  onOpenFile,
  onOpenFolder,
  onOpenAddModal,
  onQuickTestDownload,
}) => {
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
    <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
      {tasks.map((task) => (
        <DownloadItem
          key={task.id}
          task={task}
          onPause={onPause}
          onResume={onResume}
          onDelete={onDelete}
          onOpenFile={onOpenFile}
          onOpenFolder={onOpenFolder}
        />
      ))}
    </div>
  );
};
