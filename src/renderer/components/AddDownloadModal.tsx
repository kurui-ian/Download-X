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
  Radio,
  FileCheck2,
  HardDriveDownload,
  Sparkles,
  Download
} from 'lucide-react';
import { DownloadTask, UrlInspectionResult, BrowserModalPayload } from '../types';
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
    mimeType?: string;
    fileSize?: number;
    referrer?: string;
    source?: string;
    sourcePageUrl?: string;
    sourcePageTitle?: string;
    quality?: string;
    mediaType?: 'video' | 'audio' | 'image' | 'file' | 'torrent';
    secondaryAudioUrl?: string;
  }) => void;
  defaultSaveDir: string;
  defaultConnections: number;
  initialUrl?: string;
  initialData?: BrowserModalPayload;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  defaultSaveDir,
  defaultConnections,
  initialUrl,
  initialData,
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
      setForceRedownload(Boolean(initialData?.forceRedownload));
      setInspection(null);
      setInspectError(null);

      const targetInitialUrl = (initialData?.url || initialUrl || '').trim();
      const prefilledName = (initialData?.fileName || '').trim();
      setFileName(prefilledName);

      if (targetInitialUrl) {
        setUrl(targetInitialUrl);
        triggerInspect(targetInitialUrl, prefilledName, initialData?.referrer);
      } else if (window.electronAPI?.readClipboard) {
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
  }, [isOpen, defaultSaveDir, defaultConnections, initialUrl, initialData]);

  const triggerInspect = async (targetUrl: string, existingName?: string, customReferrer?: string) => {
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

    const isYouTubeOrGoogleVideo =
      clean.includes('googlevideo.com') ||
      clean.includes('youtube.com/') ||
      clean.includes('youtu.be/');

    if (
      !isYouTubeOrGoogleVideo &&
      initialData?.source &&
      initialData.url &&
      initialData.url.trim() === clean &&
      initialData.fileSize &&
      initialData.fileSize > 0
    ) {
      setInspection({
        url: clean,
        finalUrl: clean,
        fileName: existingName || initialData.fileName || 'file',
        fileSize: initialData.fileSize,
        supportsRanges: true,
        mimeType: initialData.mimeType || 'application/octet-stream',
        category: (initialData?.mediaType === 'file' ? 'other' : initialData?.mediaType) || 'other',
        quality: initialData.quality,
        secondaryAudioUrl: initialData.secondaryAudioUrl,
      });
      if (existingName || initialData.fileName) {
        setFileName(existingName || initialData.fileName || '');
      }
      setIsInspecting(false);
      return;
    }

    try {
      const referrer = customReferrer || initialData?.referrer || initialData?.sourcePageUrl;
      const result = await window.electronAPI.inspectUrl(clean, referrer);
      setInspection(result);

      setFileName((current) => {
        if (existingName && existingName.trim()) {
          return existingName.trim();
        }

        const isGeneric = (name: string) => {
          const base = name
            .replace(/\.[a-z0-9]{2,5}$/i, '')
            .replace(/(\s*\([^)]*\))+$/g, '')
            .trim();
          return (
            !base ||
            /^\d+$/.test(base) ||
            /^[0-9a-f]{12,}$/i.test(base) ||
            /^(download|downloads|video|audio|media|stream|file|track|playback|videoplayback|master|playlist|manifest|output|index|chunk|segment)([_-][a-z0-9]+)?$/i.test(
              base
            )
          );
        };

        if (current && !isGeneric(current)) {
          const hasExt = /\.[a-z0-9]{2,5}$/i.test(current);
          const inspectedExtMatch = result.fileName ? result.fileName.match(/(\.[a-z0-9]{2,5})$/i) : null;
          if (!hasExt && inspectedExtMatch) {
            return `${current}${inspectedExtMatch[1]}`;
          }
          return current;
        }

        if (result.fileName && !isGeneric(result.fileName)) {
          return result.fileName;
        }

        if (initialData?.sourcePageTitle) {
          const cleanPageTitle = initialData.sourcePageTitle
            .replace(/^\(\d+\)\s*/, '')
            .replace(
              /\s*[-|–—•·]\s*(YouTube|YouTube Music|Vimeo|Dailymotion|Twitch|TikTok|Facebook|Instagram|X|Twitter|Reddit|Bilibili|SoundCloud)$/i,
              ''
            )
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .trim();
          if (cleanPageTitle) {
            const extMatch = (result.fileName || current).match(/(\.[a-z0-9]{2,5})$/i);
            const ext = extMatch ? extMatch[1] : '.mp4';
            return `${cleanPageTitle}${ext}`;
          }
        }

        return current || result.fileName || '';
      });
    } catch (err: any) {
      if (!initialData?.source) {
        setInspectError(err.message || 'Unable to inspect metadata');
      }
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
        setFileName('');
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
          setFileName('');
          triggerInspect(selected);
        }
      }
    } catch (err) {
      console.error(err);
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

  const effectiveFileSize =
    (inspection && inspection.fileSize > 0 ? inspection.fileSize : 0) ||
    (initialData && initialData.fileSize && initialData.fileSize > 0 ? initialData.fileSize : 0);

  const effectiveMimeType =
    (inspection && inspection.mimeType && inspection.mimeType !== 'application/octet-stream'
      ? inspection.mimeType
      : initialData?.mimeType) || inspection?.mimeType;

  const isTorrent =
    url.trim().toLowerCase().startsWith('magnet:?') ||
    url.trim().toLowerCase().endsWith('.torrent') ||
    Boolean(inspection?.isTorrent) ||
    initialData?.mediaType === 'torrent';

  const effectiveCategory = isTorrent
    ? 'torrent'
    : inspection?.category && inspection.category !== 'other'
    ? inspection.category
    : initialData?.mediaType || inspection?.category || 'file';

  const displayFileName =
    fileName.trim() ||
    inspection?.fileName ||
    initialData?.fileName ||
    (isTorrent ? 'BitTorrent Swarm' : 'Checking metadata...');

  const normalizedSaveDir = (saveDir || defaultSaveDir || '').replace(/[\\/]+$/, '');
  const separator = normalizedSaveDir.includes('/') ? '/' : '\\';
  const fullSavePath = normalizedSaveDir
    ? `${normalizedSaveDir}${separator}${displayFileName}`
    : displayFileName;

  const isFromBrowser = Boolean(initialData?.source);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    onAdd({
      url: cleanUrl,
      fileName: fileName.trim() || inspection?.fileName || initialData?.fileName || undefined,
      saveDir: saveDir || undefined,
      threadCount: Number(threadCount) || 8,
      autoStart,
      forceRedownload,
      mimeType: effectiveMimeType,
      fileSize: effectiveFileSize,
      referrer: initialData?.referrer,
      source: initialData?.source,
      sourcePageUrl: initialData?.sourcePageUrl,
      sourcePageTitle: initialData?.sourcePageTitle,
      quality: initialData?.quality || inspection?.quality,
      mediaType: effectiveCategory as any,
      secondaryAudioUrl: initialData?.secondaryAudioUrl || inspection?.secondaryAudioUrl,
    });

    onClose();
  };

  const setSampleUrl = (sampleUrl: string) => {
    setUrl(sampleUrl);
    setFileName('');
    triggerInspect(sampleUrl);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 dark:bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-modal-title"
    >
      <div 
        className="w-full max-w-lg bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-obsidian overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/80 dark:bg-obsidian-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 flex items-center justify-center shadow-sm">
              {isTorrent ? <Radio className="w-4 h-4" /> : isFromBrowser ? <HardDriveDownload className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="add-modal-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {isTorrent ? 'Confirm BitTorrent Transfer' : 'Confirm Download'}
                </h2>
                {isFromBrowser && (
                  <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-semibold">
                    Via {initialData?.source}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 truncate max-w-[340px]">
                {initialData?.sourcePageTitle
                  ? `Source: ${initialData.sourcePageTitle}`
                  : 'Configure acceleration threads, destination path, and file name'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-obsidian-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* 1. Primary Source URL / Magnet Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="downloadUrlInput" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Source URL / Magnet Link
              </label>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleBrowseTorrentFile}
                  className="flex items-center gap-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  <Radio className="w-3 h-3" />
                  <span>Choose .torrent</span>
                </button>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="flex items-center gap-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>
            </div>

            <div className="relative flex items-center">
              <input
                id="downloadUrlInput"
                type="text"
                required
                value={url}
                onChange={(e) => {
                  const val = e.target.value;
                  setUrl(val);
                  setInspection(null);
                  setDuplicateTask(null);
                  setForceRedownload(false);
                }}
                onBlur={() => {
                  if (url && !inspection && !isInspecting) {
                    triggerInspect(url);
                  }
                }}
                placeholder="https://... or magnet:?xt=urn:btih:..."
                className="w-full bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/10 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all font-mono"
              />
              {isInspecting && (
                <div className="absolute right-3 text-cyan-500 flex items-center gap-1.5 text-[11px] font-mono pointer-events-none">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Probing</span>
                </div>
              )}
            </div>

            {/* Quick Sample Test Triggers */}
            {!url && (
              <div className="flex items-center gap-2 mt-2 pt-1 text-[11px]">
                <span className="text-zinc-400 text-[10px] font-mono">Quick Samples:</span>
                <button
                  type="button"
                  onClick={() => setSampleUrl('https://speed.cloudflare.com/__down?bytes=10485760')}
                  className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-obsidian-850 hover:bg-zinc-200 dark:hover:bg-obsidian-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] transition-colors border border-zinc-200 dark:border-white/5"
                >
                  10MB (Cloudflare)
                </button>
                <button
                  type="button"
                  onClick={() => setSampleUrl('https://www.7-zip.org/a/7z2408-x64.exe')}
                  className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-obsidian-850 hover:bg-zinc-200 dark:hover:bg-obsidian-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] transition-colors border border-zinc-200 dark:border-white/5 flex items-center gap-1"
                >
                  <Sparkles className="w-2.5 h-2.5 text-cyan-500" />
                  <span>7-Zip App (.exe)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSampleUrl('magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny')}
                  className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-obsidian-850 hover:bg-zinc-200 dark:hover:bg-obsidian-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] transition-colors border border-zinc-200 dark:border-white/5 flex items-center gap-1"
                >
                  <Radio className="w-2.5 h-2.5 text-teal-500" />
                  <span>Torrent Magnet</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Live Inspection Summary Card */}
          {url.trim() && (
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-zinc-200/80 dark:bg-obsidian-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileCheck2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Target File
                    </div>
                    <div
                      className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate font-mono"
                      title={displayFileName}
                    >
                      {displayFileName}
                    </div>
                  </div>
                </div>

                {/* File Size Badge */}
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    File Size
                  </div>
                  <div className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {effectiveFileSize > 0 ? (
                      formatBytes(effectiveFileSize)
                    ) : isInspecting ? (
                      <span className="inline-flex items-center gap-1 text-cyan-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Scanning...
                      </span>
                    ) : isTorrent ? (
                      'Swarm Metadata'
                    ) : (
                      'Stream'
                    )}
                  </div>
                </div>
              </div>

              {/* Server Capability Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200/70 dark:border-white/5 text-[11px] font-mono">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-zinc-200/80 dark:bg-obsidian-800 text-zinc-800 dark:text-zinc-200 font-semibold uppercase text-[10px]">
                    {effectiveCategory}
                  </span>
                  {initialData?.quality && (
                    <span className="px-2 py-0.5 rounded bg-cyan-500 text-white font-semibold text-[10px]">
                      {initialData.quality}
                    </span>
                  )}
                  {inspection?.torrentFiles && inspection.torrentFiles.length > 0 && (
                    <span className="text-zinc-500 text-[10px]">
                      ({inspection.torrentFiles.length} files)
                    </span>
                  )}
                </div>

                <div>
                  {isTorrent ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      <Radio className="w-2.5 h-2.5" /> BitTorrent Swarm
                    </span>
                  ) : inspection?.supportsRanges ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Multi-Stream Accelerated
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-300 dark:border-white/10 bg-zinc-100 dark:bg-obsidian-800 text-zinc-600 dark:text-zinc-400">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Single Stream
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Download Alert */}
          {duplicateTask && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-zinc-900 dark:text-zinc-100">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-amber-600 dark:text-amber-400">Duplicate Task in Queue</div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                    This file exists as{' '}
                    <span className="font-semibold text-zinc-900 dark:text-white font-mono">{duplicateTask.fileName}</span>{' '}
                    ({duplicateTask.status}).
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (duplicateTask.status === 'completed') {
                          window.electronAPI?.openFolder(duplicateTask.id);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] bg-amber-500 text-black font-semibold rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Show Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForceRedownload(true);
                        setDuplicateTask(null);
                      }}
                      className="px-2.5 py-1 text-[11px] bg-zinc-200 dark:bg-obsidian-800 hover:bg-zinc-300 dark:hover:bg-obsidian-750 text-zinc-800 dark:text-zinc-200 rounded-lg transition-colors border border-zinc-300 dark:border-white/10"
                    >
                      Download Again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Confirm File Name Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="confirmFileName" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                File Name
              </label>
              {effectiveFileSize > 0 && (
                <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                  Size: <strong className="text-zinc-900 dark:text-zinc-100">{formatBytes(effectiveFileSize)}</strong>
                </span>
              )}
            </div>
            <input
              id="confirmFileName"
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Auto-detected from server response"
              className="w-full bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/10 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all font-mono"
            />
          </div>

          {/* 4. Save Destination & Browse */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Destination Folder
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={saveDir}
                aria-label="Destination Folder Path"
                className="flex-1 bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 outline-none truncate font-mono"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3.5 py-2 bg-zinc-200/80 dark:bg-obsidian-800 hover:bg-zinc-300 dark:hover:bg-obsidian-750 text-zinc-800 dark:text-zinc-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors border border-zinc-300/80 dark:border-white/10 shadow-sm"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>
            <div className="mt-1.5 px-3 py-1 rounded-lg bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200/60 dark:border-white/5 flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
              <span className="flex-shrink-0">Full Target Path:</span>
              <span className="text-zinc-700 dark:text-zinc-300 truncate font-semibold" title={fullSavePath}>
                {fullSavePath}
              </span>
            </div>
          </div>

          {inspectError && !effectiveFileSize && (
            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
              <span>{inspectError} (Download will still proceed)</span>
            </div>
          )}

          {/* 5. Parallel Stream Connections Stepper (1 to 16 threads) */}
          {!isTorrent && (
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Parallel Stream Acceleration</span>
                </span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">{threadCount} Streams</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                value={threadCount}
                onChange={(e) => setThreadCount(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
                aria-label="Parallel stream threads slider"
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                <span>1 (Standard)</span>
                <span>4</span>
                <span>8 (Default)</span>
                <span>16 (Maximum)</span>
              </div>
            </div>
          )}

          {/* 6. Auto Start Checkbox */}
          <div className="flex items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              id="autoStart"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
            />
            <label htmlFor="autoStart" className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
              Start downloading immediately after confirmation
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              autoFocus
              className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-medium text-xs rounded-xl shadow-glow-cyan transition-all transform active:scale-95 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{autoStart ? 'Confirm & Start Download' : 'Add to Queue'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
