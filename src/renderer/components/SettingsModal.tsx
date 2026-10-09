import React, { useState, useEffect } from 'react';
import { X, Settings, Folder, Save, Bell, Minimize2, Sun, Moon, Laptop, Gauge, Globe } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-colors">
      <div 
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-sm">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Appearance & Theme */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Appearance & Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onThemeChange('system')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  currentTheme === 'system'
                    ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
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
                    ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>

              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  currentTheme === 'dark'
                    ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* Download Speed Limit Section */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <Gauge className="w-3.5 h-3.5" />
                <span>Download Speed Limit</span>
              </label>
              <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white">
                {currentLimitMb > 0 ? `${currentLimitMb} MB/s` : 'Unlimited'}
              </span>
            </div>

            {/* Preset Speed Cap Buttons */}
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
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-mono font-medium border transition-all ${
                      isSelected
                        ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom MB/s Input */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                Custom Cap:
              </span>
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={customMbStr}
                  onChange={(e) => handleCustomMbChange(e.target.value)}
                  placeholder="Enter speed in MB/s (e.g. 1, 2.5, 15) — 0 for unlimited"
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-black dark:focus:border-white rounded-lg pl-3 pr-12 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-zinc-400 pointer-events-none">
                  MB/s
                </span>
              </div>
            </div>
          </div>

          {/* Default Download Directory */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Default Download Location
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={formData.downloadDir}
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

          {/* Max Concurrent Downloads */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              <span>Max Concurrent Downloads</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">{formData.maxConcurrentDownloads} tasks</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.maxConcurrentDownloads}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, maxConcurrentDownloads: Number(e.target.value) }))
              }
              className="w-full accent-black dark:accent-white cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono mt-0.5">
              <span>1</span>
              <span>3 (optimal)</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Default Threads per Task */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              <span>Default Connection Threads</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">{formData.defaultConnections} streams</span>
            </div>
            <input
              type="range"
              min="1"
              max="16"
              value={formData.defaultConnections}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, defaultConnections: Number(e.target.value) }))
              }
              className="w-full accent-black dark:accent-white cursor-pointer"
            />
          </div>

          {/* System Toggles */}
          <div className="pt-2 space-y-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-zinc-500" />
                <div>
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">System Notifications</div>
                  <div className="text-[11px] text-zinc-400">Notify when downloads finish</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.enableNotifications}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, enableNotifications: e.target.checked }))
                }
                className="accent-black dark:accent-white rounded cursor-pointer w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Minimize2 className="w-4 h-4 text-zinc-500" />
                <div>
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Minimize to Tray</div>
                  <div className="text-[11px] text-zinc-400">Keep downloading when closed</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.minimizeToTray}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, minimizeToTray: e.target.checked }))
                }
                className="accent-black dark:accent-white rounded cursor-pointer w-4 h-4"
              />
            </div>
          </div>

          {/* DLX Browser Integration Settings */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <Globe className="w-3.5 h-3.5" />
                <span>DLX Browser Integration</span>
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
              <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Auto-intercept downloads</span>
                <input
                  type="checkbox"
                  checked={formData.autoInterceptDownloads !== false}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, autoInterceptDownloads: e.target.checked }))
                  }
                  className="accent-black dark:accent-white rounded cursor-pointer w-3.5 h-3.5"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Show media button</span>
                <input
                  type="checkbox"
                  checked={formData.showMediaDownloadButton !== false}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, showMediaDownloadButton: e.target.checked }))
                  }
                  className="accent-black dark:accent-white rounded cursor-pointer w-3.5 h-3.5"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Detect videos</span>
                <input
                  type="checkbox"
                  checked={formData.detectVideos !== false}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, detectVideos: e.target.checked }))
                  }
                  className="accent-black dark:accent-white rounded cursor-pointer w-3.5 h-3.5"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Detect audio</span>
                <input
                  type="checkbox"
                  checked={formData.detectAudio !== false}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, detectAudio: e.target.checked }))
                  }
                  className="accent-black dark:accent-white rounded cursor-pointer w-3.5 h-3.5"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Detect images</span>
                <input
                  type="checkbox"
                  checked={formData.detectImages !== false}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, detectImages: e.target.checked }))
                  }
                  className="accent-black dark:accent-white rounded cursor-pointer w-3.5 h-3.5"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300">Confirm before downloading</span>
                <input
                  type="checkbox"
                  checked={formData.askBeforeIntercepting !== false}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, askBeforeIntercepting: e.target.checked }))
                  }
                  className="accent-black dark:accent-white rounded cursor-pointer w-3.5 h-3.5"
                />
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
              DLX v1.0.1 • Developed by{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Kurui Ian Kipkemboi
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-zinc-500 hover:text-black dark:hover:text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black font-medium text-xs rounded-xl shadow-sm hover:opacity-90 transition-all transform active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
