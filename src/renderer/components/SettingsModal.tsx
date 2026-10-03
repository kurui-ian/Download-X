import React, { useState, useEffect } from 'react';
import { X, Settings, Folder, Save, Bell, Minimize2, Sun, Moon, Laptop } from 'lucide-react';
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  currentTheme,
  onThemeChange,
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);

  useEffect(() => {
    setFormData(settings);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-colors">
      <div 
        className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950">
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

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
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
        </form>
      </div>
    </div>
  );
};
