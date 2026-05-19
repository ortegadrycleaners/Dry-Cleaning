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
import { useI18n } from '@/i18n';

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
  const { locale } = useI18n();
  const [orderId, setOrderId] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);

  const presetNotes: PresetNote[] = [
    {
      label: 'Mancha',
      icon: Droplet,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Rotura/Rasgadura',
      icon: Scissors,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Botón faltante',
      icon: AlertCircle,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Cremallera dañada',
      icon: ZapOff,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Express (24h)',
      icon: Clock,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Sin almidón',
      icon: Leaf,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]  ',
    },
    {
      label: 'Con almidón',
      icon: Package,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]  ',
    },
    {
      label: 'Solo planchar',
      icon: Sparkles,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]    ',
    },
    {
      label: 'Limpieza en seco',
      icon: Cloud,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Frágil/Cuidado especial',
      icon: Shield,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
    },
    {
      label: 'Alteración',
      icon: Edit3,
      selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
      unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
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
    const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };
    return date.toLocaleDateString(dateLocale, options);
  }, [locale]);

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
