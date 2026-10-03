import React from 'react';
import { 
  FileVideo, 
  FileAudio, 
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
