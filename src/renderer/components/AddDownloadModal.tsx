import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  Folder, 
  Zap, 
  AlertCircle, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  ClipboardPaste,
  Radio
} from 'lucide-react';
import { DownloadTask, UrlInspectionResult } from '../types';
import { formatBytes } from '../utils/formatters';

interface AddDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (params: {
    url: string;
    fileName?: string;
    saveDir?: string;
    threadCount?: number;
    autoStart?: boolean;
    forceRedownload?: boolean;
  }) => void;
  defaultSaveDir: string;
  defaultConnections: number;
  initialUrl?: string;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  defaultSaveDir,
  defaultConnections,
  initialUrl,
}) => {
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [threadCount, setThreadCount] = useState(defaultConnections || 8);
  const [autoStart, setAutoStart] = useState(true);

  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<UrlInspectionResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [duplicateTask, setDuplicateTask] = useState<DownloadTask | null>(null);
  const [forceRedownload, setForceRedownload] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSaveDir(defaultSaveDir);
      setThreadCount(defaultConnections || 8);
      setDuplicateTask(null);
      setForceRedownload(false);

      if (initialUrl && initialUrl.trim()) {
        const clean = initialUrl.trim();
        setUrl(clean);
        triggerInspect(clean);
      } else if (window.electronAPI?.readClipboard) {
        // Automatically read native clipboard if no initialUrl
        window.electronAPI.readClipboard().then((clip) => {
          if (clip) {
            const clean = clip.trim();
            if (
              clean.startsWith('http://') || 
              clean.startsWith('https://') || 
              clean.startsWith('magnet:?') || 
              clean.toLowerCase().endsWith('.torrent')
            ) {
              setUrl(clean);
              triggerInspect(clean);
            }
          }
        }).catch(() => {});
      }
    } else {
      setUrl('');
      setFileName('');
      setInspection(null);
      setInspectError(null);
      setDuplicateTask(null);
      setForceRedownload(false);
    }
  }, [isOpen, defaultSaveDir, defaultConnections, initialUrl]);

  const triggerInspect = async (targetUrl: string) => {
    const clean = targetUrl.trim();
    if (
      !clean.startsWith('http://') && 
      !clean.startsWith('https://') && 
      !clean.startsWith('magnet:?') && 
      !clean.toLowerCase().endsWith('.torrent')
    ) {
      return;
    }

    setIsInspecting(true);
    setInspectError(null);

    // Check duplicate
    if (window.electronAPI?.checkDuplicate) {
      try {
        const dup = await window.electronAPI.checkDuplicate(clean);
        setDuplicateTask(dup);
      } catch {
        setDuplicateTask(null);
      }
    }

    try {
      const result = await window.electronAPI.inspectUrl(clean);
      setInspection(result);
      if (!fileName || fileName === '') {
        setFileName(result.fileName);
      }
    } catch (err: any) {
      setInspectError(err.message || 'Unable to inspect metadata');
      setInspection(null);
    } finally {
      setIsInspecting(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await window.electronAPI.readClipboard();
      if (clip) {
        const clean = clip.trim();
        setUrl(clean);
        triggerInspect(clean);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseTorrentFile = async () => {
    try {
      if (window.electronAPI?.selectTorrentFile) {
        const selected = await window.electronAPI.selectTorrentFile();
        if (selected) {
          setUrl(selected);
          triggerInspect(selected);
        }
      }
    } catch (err) {
      console.error('Error selecting torrent file:', err);
    }
  };

  const handleBrowseDir = async () => {
    try {
      const chosen = await window.electronAPI.selectDirectory();
      if (chosen) {
        setSaveDir(chosen);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const filePath = window.electronAPI?.getPathForFile ? window.electronAPI.getPathForFile(file) : ((file as any).path || '');
      if (filePath) {
        setUrl(filePath);
        triggerInspect(filePath);
        return;
      }
    }

    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
    if (text && text.trim()) {
      setUrl(text.trim());
      triggerInspect(text.trim());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    onAdd({
      url: cleanUrl,
      fileName: fileName.trim() || undefined,
      saveDir: saveDir || undefined,
      threadCount: Number(threadCount),
      autoStart,
      forceRedownload: forceRedownload || !duplicateTask,
    });

    onClose();
  };

  const setSampleUrl = (sampleUrl: string) => {
    setUrl(sampleUrl);
    triggerInspect(sampleUrl);
  };

  const isTorrent = url.trim().toLowerCase().startsWith('magnet:?') || 
                    url.trim().toLowerCase().endsWith('.torrent') || 
                    Boolean(inspection?.isTorrent);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleModalDrop}
    >
      <div 
        className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-sm">
              {isTorrent ? <Radio className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                {isTorrent ? 'BitTorrent Download' : 'New Download'}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {isTorrent 
                  ? 'P2P swarm acceleration with pause & resume' 
                  : 'Fast multi-threaded HTTP/HTTPS downloading'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* URL Input with Quick Actions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                URL, Magnet link, or .torrent file
              </label>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleBrowseTorrentFile}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:underline"
                >
                  <Radio className="w-3 h-3" />
                  <span>Choose .torrent</span>
                </button>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:underline"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                required
                autoFocus
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setInspection(null);
                  setDuplicateTask(null);
                  setForceRedownload(false);
                }}
                onBlur={() => {
                  if (url && !inspection && !isInspecting) {
                    triggerInspect(url);
                  }
                }}
                placeholder="https://... or magnet:?xt=urn:btih:... or drag & drop .torrent"
                className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-black dark:focus:border-white rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none pr-24 font-mono transition-all"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => triggerInspect(url)}
                  disabled={!url.trim() || isInspecting}
                  className="px-2.5 py-1 text-[11px] font-medium bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors flex items-center gap-1 border border-zinc-300 dark:border-zinc-700"
                >
                  {isInspecting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-zinc-900 dark:text-zinc-100" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <span>Inspect</span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Test Samples */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-zinc-400 font-mono">Samples:</span>
              <button
                type="button"
                onClick={() => setSampleUrl('https://proof.ovh.net/files/10Mb.dat')}
                className="text-[10px] font-mono px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-800 transition-colors"
              >
                10MB HTTP
              </button>
              <button
                type="button"
                onClick={() => setSampleUrl('magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny')}
                className="text-[10px] font-mono px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded border border-zinc-300 dark:border-zinc-700 transition-colors flex items-center gap-1"
              >
                <Radio className="w-2.5 h-2.5" />
                <span>Big Buck Bunny</span>
              </button>
              <button
                type="button"
                onClick={() => setSampleUrl('https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso.torrent')}
                className="text-[10px] font-mono px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-800 transition-colors"
              >
                Ubuntu ISO (.torrent)
              </button>
            </div>
          </div>

          {/* Duplicate Alert Card */}
          {duplicateTask && (
            <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-zinc-900 dark:text-zinc-100" />
                <div className="flex-1 text-xs">
                  <div className="font-semibold">Duplicate Download Detected</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    This file is already in your tasks as{' '}
                    <span className="font-semibold text-zinc-900 dark:text-white">{duplicateTask.fileName}</span>{' '}
                    ({duplicateTask.status}).
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (duplicateTask.status === 'completed') {
                          window.electronAPI.openFile(duplicateTask.id);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium transition-opacity hover:opacity-90"
                    >
                      {duplicateTask.status === 'completed' ? 'Open Existing File' : 'View Task'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForceRedownload(true);
                        setDuplicateTask(null);
                      }}
                      className="px-2.5 py-1 text-[11px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg transition-colors"
                    >
                      Download Again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inspection Metadata Card */}
          {inspection && (
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  Size: {inspection.fileSize > 0 ? formatBytes(inspection.fileSize) : 'Swarm metadata loading...'}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  Format:{' '}
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase">
                    {isTorrent ? 'BitTorrent' : inspection.category}
                  </span>
                  {inspection.torrentFiles && inspection.torrentFiles.length > 0 && (
                    <span className="text-zinc-400 ml-1.5 font-normal">
                      ({inspection.torrentFiles.length} files)
                    </span>
                  )}
                </div>
              </div>

              <div>
                {isTorrent ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                    <Radio className="w-3 h-3" /> P2P Swarm
                  </span>
                ) : inspection.supportsRanges ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                    <CheckCircle2 className="w-3 h-3" /> Multi-Thread Fast
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    <AlertCircle className="w-3 h-3" /> Single Stream
                  </span>
                )}
              </div>
            </div>
          )}

          {inspectError && (
            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{inspectError} (Download will still proceed)</span>
            </div>
          )}

          {/* Save Filename */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              File Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Auto-detected from file"
              className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-black dark:focus:border-white rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all font-mono"
            />
          </div>

          {/* Save Directory */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Save Location
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={saveDir}
                className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 outline-none truncate font-mono"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors border border-zinc-300 dark:border-zinc-700"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Parallel Connections Slider (HTTP only) */}
          {!isTorrent && (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Parallel Streams</span>
                </span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">{threadCount} streams</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                value={threadCount}
                onChange={(e) => setThreadCount(Number(e.target.value))}
                className="w-full accent-black dark:accent-white cursor-pointer"
              />
            </div>
          )}

          {/* Auto Start Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoStart"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="accent-black dark:accent-white rounded cursor-pointer w-4 h-4"
            />
            <label htmlFor="autoStart" className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
              Start downloading immediately
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-zinc-500 hover:text-black dark:hover:text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-medium text-xs rounded-xl shadow-sm transition-all transform active:scale-95"
            >
              {autoStart ? 'Download Now' : 'Add to Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
