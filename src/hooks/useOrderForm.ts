import { useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Clock,
  Droplet,
  Scissors,
  AlertCircle,
  ZapOff,
  Leaf,
  Package,
  Sparkles,
  Cloud,
  Shield,
  Edit3,
} from 'lucide-react';

interface PresetNote {
  label: string;
  icon: LucideIcon;
  selectedClasses: string;
  unselectedClasses: string;
}

interface UseOrderFormReturn {
  orderId: string;
  setOrderId: (value: string) => void;
  estimatedDate: string;
  setEstimatedDate: (value: string) => void;
  selectedNotes: string[];
  togglePresetNote: (label: string) => void;
  presetNotes: PresetNote[];
  clearForm: () => void;
  handleQuickDate: (days: number) => void;
  formatDateDisplay: (dateStr: string) => string;
}

export function useOrderForm(): UseOrderFormReturn {
  const [orderId, setOrderId] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);

  const presetNotes: PresetNote[] = [
    {
      label: 'Mancha',
      icon: Droplet,
      selectedClasses: 'border-red-500 bg-red-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Rotura/Rasgadura',
      icon: Scissors,
      selectedClasses: 'border-orange-500 bg-orange-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Botón faltante',
      icon: AlertCircle,
      selectedClasses: 'border-yellow-500 bg-yellow-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Cremallera dañada',
      icon: ZapOff,
      selectedClasses: 'border-fuchsia-500 bg-fuchsia-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Express (24h)',
      icon: Clock,
      selectedClasses: 'border-sky-500 bg-sky-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Sin almidón',
      icon: Leaf,
      selectedClasses: 'border-emerald-500 bg-emerald-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Con almidón',
      icon: Package,
      selectedClasses: 'border-violet-500 bg-violet-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Solo planchar',
      icon: Sparkles,
      selectedClasses: 'border-emerald-500 bg-emerald-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Limpieza en seco',
      icon: Cloud,
      selectedClasses: 'border-slate-500 bg-slate-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Frágil/Cuidado especial',
      icon: Shield,
      selectedClasses: 'border-pink-500 bg-pink-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
    {
      label: 'Alteración',
      icon: Edit3,
      selectedClasses: 'border-amber-500 bg-amber-500 text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:border-slate-400',
    },
  ];

  const formatDateInputValue = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleQuickDate = useCallback((days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setEstimatedDate(formatDateInputValue(date));
  }, []);

  const formatDateDisplay = useCallback((dateStr: string): string => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };
    return date.toLocaleDateString('es-ES', options);
  }, []);

  const togglePresetNote = useCallback((label: string) => {
    setSelectedNotes((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  }, []);

  const clearForm = useCallback(() => {
    setOrderId('');
    setEstimatedDate('');
    setSelectedNotes([]);
  }, []);

  return {
    orderId,
    setOrderId,
    estimatedDate,
    setEstimatedDate,
    selectedNotes,
    togglePresetNote,
    presetNotes,
    clearForm,
    handleQuickDate,
    formatDateDisplay,
  };
}
