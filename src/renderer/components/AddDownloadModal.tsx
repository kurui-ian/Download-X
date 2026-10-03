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
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  defaultSaveDir,
  defaultConnections,
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

      // Automatically read native clipboard
      if (window.electronAPI?.readClipboard) {
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
  }, [isOpen, defaultSaveDir, defaultConnections]);

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
      setInspectError(err.message || 'Server does not support metadata inspection');
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isTorrent ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400' : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
            }`}>
              {isTorrent ? <Radio className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {isTorrent ? 'Add BitTorrent / Magnet Download' : 'Add Download Task'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isTorrent 
                  ? 'High-speed peer-to-peer torrent transfer' 
                  : 'Enter URL or Magnet to start multi-part accelerated download'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* URL Input with Actions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-200">
                Download URL / Magnet / .torrent Path
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBrowseTorrentFile}
                  className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  <Radio className="w-3 h-3" />
                  <span>Open .torrent</span>
                </button>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline"
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
                placeholder="https://... or magnet:?xt=urn:btih:... or file.torrent"
                className="w-full bg-slate-950 border border-slate-750 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none pr-24 font-mono"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => triggerInspect(url)}
                  disabled={!url.trim() || isInspecting}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg transition-colors flex items-center gap-1 border border-slate-700"
                >
                  {isInspecting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <span>Check Info</span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Test Samples */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500">Quick tests:</span>
              <button
                type="button"
                onClick={() => setSampleUrl('https://proof.ovh.net/files/10Mb.dat')}
                className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
              >
                10 MB HTTP
              </button>
              <button
                type="button"
                onClick={() => setSampleUrl('https://proof.ovh.net/files/100Mb.dat')}
                className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
              >
                100 MB HTTP
              </button>
              <button
                type="button"
                onClick={() => setSampleUrl('magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny')}
                className="text-[10px] px-2 py-0.5 bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 hover:text-cyan-100 rounded border border-cyan-800/40 transition-colors flex items-center gap-1 font-medium"
              >
                <Radio className="w-2.5 h-2.5" />
                <span>Big Buck Bunny (Magnet)</span>
              </button>
              <button
                type="button"
                onClick={() => setSampleUrl('https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso.torrent')}
                className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
              >
                Ubuntu ISO (.torrent)
              </button>
            </div>
          </div>

          {/* Duplicate Alert Card */}
          {duplicateTask && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-amber-300">Duplicate Download Detected</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    This link is already in your downloads as{' '}
                    <span className="font-semibold text-white">{duplicateTask.fileName}</span>{' '}
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
                      className="px-2.5 py-1 text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg border border-amber-500/30 font-medium transition-colors"
                    >
                      {duplicateTask.status === 'completed' ? 'Open Existing File' : 'View in List'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForceRedownload(true);
                        setDuplicateTask(null);
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
                    >
                      Download Anyway
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inspection Metadata Card */}
          {inspection && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-slate-200">
                  Size: {inspection.fileSize > 0 ? formatBytes(inspection.fileSize) : 'Resolving swarm metadata...'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Type:{' '}
                  <span className={`capitalize font-semibold ${isTorrent ? 'text-cyan-400' : 'text-brand-400'}`}>
                    {isTorrent ? 'BitTorrent' : inspection.category}
                  </span>
                  {inspection.torrentFiles && inspection.torrentFiles.length > 0 && (
                    <span className="text-slate-500 ml-1.5 font-normal">
                      ({inspection.torrentFiles.length} files)
                    </span>
                  )}
                </div>
              </div>

              <div>
                {isTorrent ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">
                    <Radio className="w-3.5 h-3.5" /> P2P Swarm
                  </span>
                ) : inspection.supportsRanges ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Range Supported (Fast)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                    <AlertCircle className="w-3.5 h-3.5" /> Single Stream
                  </span>
                )}
              </div>
            </div>
          )}

          {inspectError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span>{inspectError} (Download will still attempt to connect)</span>
            </div>
          )}

          {/* Save Filename */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              File / Folder Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Auto-detected from metadata"
              className="w-full bg-slate-950 border border-slate-750 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none"
            />
          </div>

          {/* Save Directory */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Save To
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={saveDir}
                className="flex-1 bg-slate-950 border border-slate-750 rounded-xl px-3.5 py-2 text-xs text-slate-300 outline-none truncate"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Parallel Connections Slider (HTTP only) */}
          {!isTorrent && (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-blue-400" />
                  <span>Parallel Connections</span>
                </span>
                <span className="font-mono text-blue-400 font-bold">{threadCount} threads</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                value={threadCount}
                onChange={(e) => setThreadCount(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
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
              className="accent-blue-500 rounded cursor-pointer w-4 h-4"
            />
            <label htmlFor="autoStart" className="text-xs text-slate-300 cursor-pointer select-none">
              Start downloading immediately
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 font-semibold text-xs rounded-xl shadow-lg transition-all transform active:scale-95 text-white ${
                isTorrent
                  ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/30'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
              }`}
            >
              {autoStart ? 'Download Now' : 'Add to Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
