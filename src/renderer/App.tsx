import React, { useState, useEffect, useMemo } from 'react';
import { 
  DownloadTask, 
  TaskStatus, 
  TaskCategory, 
  AppSettings, 
  GlobalSpeedStats,
  BrowserModalPayload
} from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DownloadList } from './components/DownloadList';
import { AddDownloadModal } from './components/AddDownloadModal';
import { SettingsModal } from './components/SettingsModal';
import { useTheme } from './utils/theme';
import { ArrowDownToLine } from 'lucide-react';

export const App: React.FC = () => {
  const { theme, setTheme, cycleTheme } = useTheme();

  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [speedStats, setSpeedStats] = useState<GlobalSpeedStats>({
    totalSpeed: 0,
    activeCount: 0,
    queuedCount: 0,
    completedCount: 0,
  });

  const [settings, setSettings] = useState<AppSettings>({
    downloadDir: '',
    maxConcurrentDownloads: 3,
    defaultConnections: 8,
    speedLimitBytesPerSec: 0,
    enableNotifications: true,
    monitorClipboard: false,
    minimizeToTray: true,
    askBeforeIntercepting: true,
  });

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialUrl, setAddModalInitialUrl] = useState<string | undefined>(undefined);
  const [addModalInitialData, setAddModalInitialData] = useState<BrowserModalPayload | undefined>(undefined);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Initial load
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getTasks().then(setTasks).catch(console.error);
      window.electronAPI.getSettings().then(setSettings).catch(console.error);

      const unbindTasks = window.electronAPI.onTasksUpdated((updatedTasks) => {
        setTasks(updatedTasks);
      });

      const unbindSpeed = window.electronAPI.onSpeedStats((stats) => {
        setSpeedStats(stats);
      });

      const unbindSettings = window.electronAPI.onSettingsUpdated
        ? window.electronAPI.onSettingsUpdated((updatedSettings) => {
            setSettings(updatedSettings);
          })
        : () => {};

      const unbindBrowserModal = window.electronAPI.onBrowserOpenAddModal
        ? window.electronAPI.onBrowserOpenAddModal((payload) => {
            if (payload && payload.url) {
              setAddModalInitialUrl(payload.url);
              setAddModalInitialData(payload);
              setIsAddModalOpen(true);
            }
          })
        : () => {};

      return () => {
        unbindTasks();
        unbindSpeed();
        unbindSettings();
        unbindBrowserModal();
      };
    }
  }, []);

  // Drag and Drop Handling (for .torrent files, links, magnets)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      setIsDraggingOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !e.relatedTarget || 
        e.clientY <= 0 || 
        e.clientX <= 0 || 
        e.clientX >= window.innerWidth || 
        e.clientY >= window.innerHeight
      ) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      // 1. Check if files were dropped (.torrent file)
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        let filePath = '';
        if (window.electronAPI?.getPathForFile) {
          filePath = window.electronAPI.getPathForFile(file);
        }
        if (!filePath && (file as any).path) {
          filePath = (file as any).path;
        }

        if (filePath) {
          setAddModalInitialUrl(filePath);
          setIsAddModalOpen(true);
          return;
        }
      }

      // 2. Check if URL, text, or Magnet link was dropped
      if (e.dataTransfer) {
        const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
        if (text && text.trim()) {
          setAddModalInitialUrl(text.trim());
          setIsAddModalOpen(true);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setAddModalInitialUrl(undefined);
        setIsAddModalOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsModalOpen(true);
      }
      if (e.key === 'Escape') {
        setIsAddModalOpen(false);
        setIsSettingsModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter tasks based on status, category, and search query
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'downloading') {
          if (task.status !== 'downloading' && task.status !== 'connecting') return false;
        } else if (task.status !== statusFilter) {
          return false;
        }
      }

      // Category filter
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'torrent') {
          if (task.category !== 'torrent' && task.protocol !== 'torrent') return false;
        } else if (task.category !== categoryFilter) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = task.fileName.toLowerCase().includes(q);
        const matchesUrl = task.url.toLowerCase().includes(q);
        if (!matchesName && !matchesUrl) return false;
      }

      return true;
    });
  }, [tasks, statusFilter, categoryFilter, searchQuery]);

  const handleSelectStatus = (status: TaskStatus | 'all') => {
    setStatusFilter(status);
    if (status !== 'all') {
      setCategoryFilter('all');
    }
  };

  const handleSelectCategory = (category: TaskCategory) => {
    setCategoryFilter(category);
    if (category !== 'all') {
      setStatusFilter('all');
    }
  };

  // Task Actions
  const handlePause = async (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'paused', speed: 0, uploadSpeed: 0, eta: 0 } : t
      )
    );
    await window.electronAPI.pauseDownload(id);
  };

  const handleResume = async (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'queued', errorMessage: undefined } : t
      )
    );
    await window.electronAPI.resumeDownload(id);
  };

  const handleDelete = async (id: string, deleteFile: boolean) => {
    await window.electronAPI.deleteTask(id, deleteFile);
  };

  const handleOpenFile = async (id: string) => {
    await window.electronAPI.openFile(id);
  };

  const handleOpenFolder = async (id: string) => {
    await window.electronAPI.openFolder(id);
  };

  const handlePauseAll = async () => {
    setTasks((prev) =>
      prev.map((t) =>
        t.status === 'downloading' || t.status === 'connecting' || t.status === 'queued'
          ? { ...t, status: 'paused', speed: 0, uploadSpeed: 0, eta: 0 }
          : t
      )
    );
    await window.electronAPI.pauseAll();
  };

  const handleResumeAll = async () => {
    await window.electronAPI.resumeAll();
  };

  const handleClearCompleted = async () => {
    await window.electronAPI.clearCompleted();
  };

  const handleAddDownload = async (params: {
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
  }) => {
    await window.electronAPI.addDownload(params);
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await window.electronAPI.saveSettings(newSettings);
  };

  const handleUpdateSpeedLimit = async (bytesPerSec: number) => {
    const updatedSettings: AppSettings = {
      ...settings,
      speedLimitBytesPerSec: bytesPerSec,
    };
    setSettings(updatedSettings);
    await window.electronAPI.saveSettings(updatedSettings);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans transition-colors relative">
      {/* Left Sidebar */}
      <Sidebar
        currentStatus={statusFilter}
        currentCategory={categoryFilter}
        onSelectStatus={handleSelectStatus}
        onSelectCategory={handleSelectCategory}
        tasks={tasks}
        speedStats={speedStats}
        speedLimitBytesPerSec={settings.speedLimitBytesPerSec}
        onUpdateSpeedLimit={handleUpdateSpeedLimit}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-black transition-colors">
        <Header
          onOpenAddModal={() => {
            setAddModalInitialUrl(undefined);
            setAddModalInitialData(undefined);
            setIsAddModalOpen(true);
          }}
          onPauseAll={handlePauseAll}
          onResumeAll={handleResumeAll}
          onClearCompleted={handleClearCompleted}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          theme={theme}
          onCycleTheme={cycleTheme}
        />

        <DownloadList
          tasks={filteredTasks}
          onPause={handlePause}
          onResume={handleResume}
          onDelete={handleDelete}
          onOpenFile={handleOpenFile}
          onOpenFolder={handleOpenFolder}
          onOpenAddModal={() => {
            setAddModalInitialUrl(undefined);
            setAddModalInitialData(undefined);
            setIsAddModalOpen(true);
          }}
          onQuickTestDownload={(testUrl) => handleAddDownload({ url: testUrl, autoStart: true })}
        />
      </main>

      {/* Add Download Modal */}
      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddModalInitialUrl(undefined);
          setAddModalInitialData(undefined);
        }}
        onAdd={handleAddDownload}
        defaultSaveDir={settings.downloadDir}
        defaultConnections={settings.defaultConnections}
        initialUrl={addModalInitialUrl}
        initialData={addModalInitialData}
      />

      {/* Preferences & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        currentTheme={theme}
        onThemeChange={setTheme}
      />

      {/* Fun Minimalist Drag and Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-[100] bg-white/85 dark:bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-8 pointer-events-none transition-all">
          <div className="border-2 border-dashed border-black dark:border-white rounded-3xl w-full max-w-md h-64 flex flex-col items-center justify-center gap-3.5 bg-zinc-50/70 dark:bg-zinc-950/70 shadow-2xl animate-drop-pulse">
            <div className="w-14 h-14 rounded-2xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg">
              <ArrowDownToLine className="w-7 h-7 animate-download-bounce" />
            </div>
            <div className="text-center">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-0.5">
                Drop to Download
              </h2>
              <p className="text-xs text-zinc-500 font-mono">
                Release .torrent file or download link here
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
