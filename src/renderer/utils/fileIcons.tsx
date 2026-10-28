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

export interface CategoryBadgeInfo {
  icon: LucideIcon;
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  glowColor: string;
}

export function getCategoryBadge(category: TaskCategory): CategoryBadgeInfo {
  switch (category) {
    case 'video':
      return {
        icon: FileVideo,
        label: 'Video',
        bgColor: 'bg-indigo-500/10 dark:bg-indigo-500/15',
        textColor: 'text-indigo-600 dark:text-indigo-400',
        borderColor: 'border-indigo-500/20 dark:border-indigo-500/30',
        glowColor: 'rgba(99, 102, 241, 0.25)',
      };
    case 'audio':
      return {
        icon: FileAudio,
        label: 'Audio',
        bgColor: 'bg-purple-500/10 dark:bg-purple-500/15',
        textColor: 'text-purple-600 dark:text-purple-400',
        borderColor: 'border-purple-500/20 dark:border-purple-500/30',
        glowColor: 'rgba(168, 85, 247, 0.25)',
      };
    case 'image':
      return {
        icon: FileImage,
        label: 'Image',
        bgColor: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        borderColor: 'border-emerald-500/20 dark:border-emerald-500/30',
        glowColor: 'rgba(16, 185, 129, 0.25)',
      };
    case 'document':
      return {
        icon: FileText,
        label: 'Document',
        bgColor: 'bg-amber-500/10 dark:bg-amber-500/15',
        textColor: 'text-amber-600 dark:text-amber-400',
        borderColor: 'border-amber-500/20 dark:border-amber-500/30',
        glowColor: 'rgba(245, 158, 11, 0.25)',
      };
    case 'archive':
      return {
        icon: FileArchive,
        label: 'Archive',
        bgColor: 'bg-orange-500/10 dark:bg-orange-500/15',
        textColor: 'text-orange-600 dark:text-orange-400',
        borderColor: 'border-orange-500/20 dark:border-orange-500/30',
        glowColor: 'rgba(249, 115, 22, 0.25)',
      };
    case 'program':
      return {
        icon: FileCode,
        label: 'Application',
        bgColor: 'bg-cyan-500/10 dark:bg-cyan-500/15',
        textColor: 'text-cyan-600 dark:text-cyan-400',
        borderColor: 'border-cyan-500/20 dark:border-cyan-500/30',
        glowColor: 'rgba(6, 182, 212, 0.25)',
      };
    case 'torrent':
      return {
        icon: Radio,
        label: 'Torrent',
        bgColor: 'bg-teal-500/10 dark:bg-teal-500/15',
        textColor: 'text-teal-600 dark:text-teal-400',
        borderColor: 'border-teal-500/20 dark:border-teal-500/30',
        glowColor: 'rgba(20, 184, 166, 0.25)',
      };
    default:
      return {
        icon: FileQuestion,
        label: 'File',
        bgColor: 'bg-zinc-500/10 dark:bg-zinc-500/15',
        textColor: 'text-zinc-600 dark:text-zinc-400',
        borderColor: 'border-zinc-500/20 dark:border-zinc-500/30',
        glowColor: 'rgba(113, 113, 122, 0.2)',
      };
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
