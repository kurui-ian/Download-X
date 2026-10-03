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
  switch (category) {
    case 'video':
      return {
        icon: FileVideo,
        bgColor: 'bg-rose-500/10',
        textColor: 'text-rose-400',
        borderColor: 'border-rose-500/20',
      };
    case 'audio':
      return {
        icon: FileAudio,
        bgColor: 'bg-amber-500/10',
        textColor: 'text-amber-400',
        borderColor: 'border-amber-500/20',
      };
    case 'document':
      return {
        icon: FileText,
        bgColor: 'bg-emerald-500/10',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-500/20',
      };
    case 'archive':
      return {
        icon: FileArchive,
        bgColor: 'bg-purple-500/10',
        textColor: 'text-purple-400',
        borderColor: 'border-purple-500/20',
      };
    case 'program':
      return {
        icon: FileCode,
        bgColor: 'bg-blue-500/10',
        textColor: 'text-blue-400',
        borderColor: 'border-blue-500/20',
      };
    case 'torrent':
      return {
        icon: Radio,
        bgColor: 'bg-cyan-500/10',
        textColor: 'text-cyan-400',
        borderColor: 'border-cyan-500/20',
      };
    default:
      return {
        icon: FileQuestion,
        bgColor: 'bg-slate-500/10',
        textColor: 'text-slate-400',
        borderColor: 'border-slate-500/20',
      };
  }
}
