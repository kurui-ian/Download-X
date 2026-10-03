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
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-500/5">
          <ArrowDownToLine className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-100 mb-1">No Downloads Active</h3>
        <p className="text-xs text-slate-400 max-w-sm mb-6">
          Paste any download URL to start accelerated multi-part downloading with pause & resume.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/25 transition-all transform active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>+ Add Download</span>
          </button>

          {onQuickTestDownload && (
            <button
              onClick={() => onQuickTestDownload('https://proof.ovh.net/files/10Mb.dat')}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 transition-all transform active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Test 10MB Download</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
