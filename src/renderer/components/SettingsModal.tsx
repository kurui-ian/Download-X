import React, { useState, useEffect } from 'react';
import { X, Settings, Folder, Save, Bell, Minimize2, Sun, Moon, Laptop, Gauge, Globe, Sliders, ShieldCheck } from 'lucide-react';
import { AppSettings } from '../types';
import { ThemeMode } from '../utils/theme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

const SPEED_CAP_PRESETS = [
  { label: 'Unlimited', mbps: 0 },
  { label: '0.5 MB/s', mbps: 0.5 },
  { label: '1 MB/s', mbps: 1 },
  { label: '2 MB/s', mbps: 2 },
  { label: '5 MB/s', mbps: 5 },
  { label: '10 MB/s', mbps: 10 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  currentTheme,
  onThemeChange,
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [customMbStr, setCustomMbStr] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'general' | 'throttle' | 'browser' | 'about'>('general');

  useEffect(() => {
    setFormData(settings);
    const mb = settings.speedLimitBytesPerSec > 0
      ? Number((settings.speedLimitBytesPerSec / (1024 * 1024)).toFixed(2))
      : 0;
    setCustomMbStr(mb > 0 ? String(mb) : '');
  }, [settings, isOpen]);

  const handleBrowseDir = async () => {
    try {
      const chosen = await window.electronAPI.selectDirectory();
      if (chosen) {
        setFormData((prev) => ({ ...prev, downloadDir: chosen }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCustomMbChange = (val: string) => {
    setCustomMbStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setFormData((prev) => ({
        ...prev,
        speedLimitBytesPerSec: Math.round(parsed * 1024 * 1024),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        speedLimitBytesPerSec: 0,
      }));
    }
  };

  const handleSelectPreset = (mbps: number) => {
    setCustomMbStr(mbps > 0 ? String(mbps) : '');
    setFormData((prev) => ({
      ...prev,
      speedLimitBytesPerSec: mbps > 0 ? Math.round(mbps * 1024 * 1024) : 0,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  const currentLimitMb = formData.speedLimitBytesPerSec > 0
    ? Number((formData.speedLimitBytesPerSec / (1024 * 1024)).toFixed(2))
    : 0;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 dark:bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 transition-colors"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div 
        className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-obsidian overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/80 dark:bg-obsidian-950 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 flex items-center justify-center shadow-sm">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Preferences & Engine Settings
              </h2>
              <p className="text-[11px] text-zinc-500">
                Configure concurrency, bandwidth limits, directory paths, and native integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-obsidian-800 transition-colors"
            aria-label="Close preferences dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-2 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/40 dark:bg-obsidian-950/50 flex-shrink-0 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-3 py-1.5 border-b-2 transition-all ${
              activeTab === 'general'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            General & Appearance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('throttle')}
            className={`px-3 py-1.5 border-b-2 transition-all ${
              activeTab === 'throttle'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Bandwidth & Speed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`px-3 py-1.5 border-b-2 transition-all ${
              activeTab === 'browser'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Browser Integration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('about')}
            className={`px-3 py-1.5 border-b-2 transition-all ${
              activeTab === 'about'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            About DLX
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Appearance & Theme Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Visual Theme
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onThemeChange('system')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      currentTheme === 'system'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-obsidian-950 border-transparent shadow-sm'
                        : 'bg-zinc-50 dark:bg-obsidian-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-zinc-400'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Auto System</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChange('light')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      currentTheme === 'light'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-obsidian-950 border-transparent shadow-sm'
                        : 'bg-zinc-50 dark:bg-obsidian-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-zinc-400'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Clean Light</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChange('dark')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      currentTheme === 'dark'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-obsidian-950 border-transparent shadow-sm'
                        : 'bg-zinc-50 dark:bg-obsidian-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-zinc-400'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Obsidian Dark</span>
                  </button>
                </div>
              </div>

              {/* Default Save Location */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Default Download Directory
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={formData.downloadDir}
                    aria-label="Default Download Directory"
                    className="flex-1 bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 outline-none truncate font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseDir}
                    className="px-3.5 py-2 bg-zinc-200/80 dark:bg-obsidian-800 hover:bg-zinc-300 dark:hover:bg-obsidian-750 text-zinc-800 dark:text-zinc-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors border border-zinc-300 dark:border-white/10 shadow-sm"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              {/* Max Concurrent Downloads */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  <span>Max Concurrent Active Downloads</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {formData.maxConcurrentDownloads} tasks
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.maxConcurrentDownloads}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, maxConcurrentDownloads: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                  aria-label="Max Concurrent Active Downloads slider"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                  <span>1</span>
                  <span>3 (Recommended)</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>

              {/* Default Threads per Task */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  <span>Default Connection Streams per Task</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {formData.defaultConnections} streams
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={formData.defaultConnections}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, defaultConnections: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                  aria-label="Default Connection Streams per Task slider"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                  <span>1 (Single)</span>
                  <span>8 (Balanced)</span>
                  <span>16 (Maximum Acceleration)</span>
                </div>
              </div>

              {/* System Toggles */}
              <div className="pt-2 space-y-3 border-t border-zinc-200 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-zinc-500" />
                    <div>
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Desktop Notifications</div>
                      <div className="text-[11px] text-zinc-400">Receive Windows system alerts on task completion</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableNotifications}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, enableNotifications: e.target.checked }))
                    }
                    className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Minimize2 className="w-4 h-4 text-zinc-500" />
                    <div>
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Minimize to System Tray</div>
                      <div className="text-[11px] text-zinc-400">Keep active downloads running in background when window is closed</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.minimizeToTray}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, minimizeToTray: e.target.checked }))
                    }
                    className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'throttle' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    <Gauge className="w-4 h-4 text-cyan-500" />
                    <span>Global Bandwidth Speed Cap</span>
                  </label>
                  <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {currentLimitMb > 0 ? `${currentLimitMb} MB/s` : 'Unlimited'}
                  </span>
                </div>

                {/* Preset Speed Cap Chips */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {SPEED_CAP_PRESETS.map((preset) => {
                    const isSelected = preset.mbps === 0
                      ? currentLimitMb === 0
                      : Math.abs(currentLimitMb - preset.mbps) < 0.01;

                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleSelectPreset(preset.mbps)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-mono tabular-nums font-medium border transition-all ${
                          isSelected
                            ? 'bg-cyan-500 text-white border-transparent shadow-sm'
                            : 'bg-white dark:bg-obsidian-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-zinc-400'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom MB/s Input */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 whitespace-nowrap font-mono">
                    Custom Limit:
                  </span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={customMbStr}
                      onChange={(e) => handleCustomMbChange(e.target.value)}
                      placeholder="e.g. 5, 12.5 (0 for unlimited)"
                      className="w-full bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 focus:border-cyan-500 rounded-lg pl-3 pr-12 py-1.5 text-xs font-mono tabular-nums text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-400 pointer-events-none">
                      MB/s
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'browser' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-500" />
                    <div>
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Native Messaging Host</div>
                      <div className="text-[11px] text-zinc-400">Direct IPC communication with Chrome & Edge extensions</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                    <ShieldCheck className="w-3 h-3" /> Ready
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 cursor-pointer">
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Auto-intercept browser downloads</span>
                    <input
                      type="checkbox"
                      checked={formData.autoInterceptDownloads !== false}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, autoInterceptDownloads: e.target.checked }))
                      }
                      className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 cursor-pointer">
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Show floating media download button</span>
                    <input
                      type="checkbox"
                      checked={formData.showMediaDownloadButton !== false}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, showMediaDownloadButton: e.target.checked }))
                      }
                      className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 cursor-pointer">
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Detect web videos</span>
                    <input
                      type="checkbox"
                      checked={formData.detectVideos !== false}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, detectVideos: e.target.checked }))
                      }
                      className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-zinc-200 dark:border-white/10 cursor-pointer">
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Confirm before starting download</span>
                    <input
                      type="checkbox"
                      checked={formData.askBeforeIntercepting !== false}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, askBeforeIntercepting: e.target.checked }))
                      }
                      className="accent-cyan-500 rounded cursor-pointer w-4 h-4"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-obsidian-950 border border-zinc-200 dark:border-white/5 space-y-3 text-center">
              <img
                src="./icon.png"
                alt="DLX Icon"
                className="w-12 h-12 mx-auto rounded-xl shadow-obsidian object-contain"
              />
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Download-X (DLX)</h3>
                <p className="text-[11px] text-cyan-500 font-mono">v1.0.2 • Accelerated Multi-Part Engine</p>
              </div>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                High-performance multi-threaded download manager for Windows. Engineered with chunk work-stealing, BitTorrent swarm support, and native browser integration.
              </p>
              <div className="pt-2 border-t border-zinc-200 dark:border-white/5 text-[11px] font-mono text-zinc-400">
                Created by <span className="text-zinc-700 dark:text-zinc-300 font-semibold">Kurui Ian Kipkemboi</span>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-200 dark:border-white/10">
            <div className="text-[10px] font-mono text-zinc-400">
              Settings persist to <span className="text-zinc-600 dark:text-zinc-300">dlx_settings.json</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-medium text-xs rounded-xl shadow-glow-cyan transition-all transform active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
