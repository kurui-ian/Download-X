import React, { useState, useEffect, useMemo } from 'react';
import { 
  DownloadTask, 
  TaskStatus, 
  TaskCategory, 
  AppSettings, 
  GlobalSpeedStats 
} from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DownloadList } from './components/DownloadList';
import { AddDownloadModal } from './components/AddDownloadModal';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
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
  });

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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

      return () => {
        unbindTasks();
        unbindSpeed();
      };
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
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
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && task.category !== categoryFilter) {
        return false;
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

  // Actions
  const handlePause = async (id: string) => {
    await window.electronAPI.pauseDownload(id);
  };

  const handleResume = async (id: string) => {
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
  }) => {
    await window.electronAPI.addDownload(params);
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await window.electronAPI.saveSettings(newSettings);
    setSettings(newSettings);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-950 font-sans">
      {/* Left Sidebar */}
      <Sidebar
        currentStatus={statusFilter}
        currentCategory={categoryFilter}
        onSelectStatus={handleSelectStatus}
        onSelectCategory={handleSelectCategory}
        tasks={tasks}
        speedStats={speedStats}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-surface-950">
        <Header
          onOpenAddModal={() => setIsAddModalOpen(true)}
          onPauseAll={handlePauseAll}
          onResumeAll={handleResumeAll}
          onClearCompleted={handleClearCompleted}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <DownloadList
          tasks={filteredTasks}
          onPause={handlePause}
          onResume={handleResume}
          onDelete={handleDelete}
          onOpenFile={handleOpenFile}
          onOpenFolder={handleOpenFolder}
          onOpenAddModal={() => setIsAddModalOpen(true)}
          onQuickTestDownload={(testUrl) => handleAddDownload({ url: testUrl, autoStart: true })}
        />
      </main>

      {/* Add Download Modal */}
      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddDownload}
        defaultSaveDir={settings.downloadDir}
        defaultConnections={settings.defaultConnections}
      />

      {/* Preferences & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};
export default App;
