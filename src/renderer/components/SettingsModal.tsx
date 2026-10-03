import React, { useState, useEffect } from 'react';
import { X, Settings, Folder, Save, Bell, Minimize2 } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="w-full max-w-lg bg-surface-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Preferences & Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Default Download Directory */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Default Download Location
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={formData.downloadDir}
                className="flex-1 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 outline-none truncate"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Max Concurrent Downloads */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
              <span>Max Concurrent Downloads</span>
              <span className="font-mono text-brand-400">{formData.maxConcurrentDownloads} tasks</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.maxConcurrentDownloads}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, maxConcurrentDownloads: Number(e.target.value) }))
              }
              className="w-full accent-brand-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>1</span>
              <span>3 (recommended)</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Default Threads per Task */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
              <span>Default Connection Threads</span>
              <span className="font-mono text-brand-400">{formData.defaultConnections} streams</span>
            </div>
            <input
              type="range"
              min="1"
              max="16"
              value={formData.defaultConnections}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, defaultConnections: Number(e.target.value) }))
              }
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          {/* System Toggles */}
          <div className="pt-2 space-y-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs font-medium text-slate-200">Desktop Notifications</div>
                  <div className="text-[11px] text-slate-400">Show Windows notification when a task finishes</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.enableNotifications}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, enableNotifications: e.target.checked }))
                }
                className="accent-brand-500 rounded cursor-pointer w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Minimize2 className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs font-medium text-slate-200">Minimize to System Tray</div>
                  <div className="text-[11px] text-slate-400">Keep downloading in background when window is closed</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.minimizeToTray}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, minimizeToTray: e.target.checked }))
                }
                className="accent-brand-500 rounded cursor-pointer w-4 h-4"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-brand-600/30 transition-all transform active:scale-95"
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
