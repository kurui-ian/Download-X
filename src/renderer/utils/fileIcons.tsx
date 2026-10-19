import React from 'react';
import { 
  FileVideo, 
  FileAudio, 
  FileImage,
  FileText, 
  FileArchive, 
  FileCode, 
  FileQuestion,
  Radio,
  LucideIcon 
} from 'lucide-react';
import { TaskCategory } from '../types';

export function getCategoryBadge(category: TaskCategory): {
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  borderColor: string;
} {
  const common = {
    bgColor: 'bg-zinc-100 dark:bg-zinc-900',
    textColor: 'text-zinc-900 dark:text-zinc-100',
    borderColor: 'border-zinc-200 dark:border-zinc-800',
  };

  switch (category) {
    case 'video':
      return { ...common, icon: FileVideo };
    case 'audio':
      return { ...common, icon: FileAudio };
    case 'image':
      return { ...common, icon: FileImage };
    case 'document':
      return { ...common, icon: FileText };
    case 'archive':
      return { ...common, icon: FileArchive };
    case 'program':
      return { ...common, icon: FileCode };
    case 'torrent':
      return { ...common, icon: Radio };
    default:
      return { ...common, icon: FileQuestion };
  }
}

/**
 * Resolves the primary category for a given file name or extension.
 */
export function getCategoryFromExtension(filenameOrExt: string): TaskCategory {
  if (!filenameOrExt) return 'other';
  const clean = filenameOrExt.toLowerCase().trim();
  const ext = clean.includes('.') ? clean.split('.').pop() || '' : clean;

  const videoExts = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'wmv'];
  const audioExts = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aac', 'alac'];
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif', 'ico'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'epub', 'md'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'zst'];
  const programExts = ['exe', 'msi', 'pkg', 'deb', 'rpm', 'appimage', 'apk', 'bin', 'sh', 'bat'];

  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'document';
  if (archiveExts.includes(ext)) return 'archive';
  if (programExts.includes(ext)) return 'program';
  if (ext === 'torrent') return 'torrent';

  return 'other';
}

