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
  id: string;
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
  togglePresetNote: (id: string) => void;
  selectedNotesText: string[];
  presetNotes: PresetNote[];
  clearForm: () => void;
  handleQuickDate: (days: number) => void;
  formatDateInputValue: (date: Date) => string;
  formatDateDisplay: (dateStr: string) => string;
}

const PRESET_NOTE_DEFS: { id: string; icon: LucideIcon }[] = [
  { id: 'stain', icon: Droplet },
  { id: 'tear', icon: Scissors },
  { id: 'missingButton', icon: AlertCircle },
  { id: 'brokenZipper', icon: ZapOff },
  { id: 'express24h', icon: Clock },
  { id: 'noStarch', icon: Leaf },
  { id: 'starch', icon: Package },
  { id: 'ironOnly', icon: Sparkles },
  { id: 'dryClean', icon: Cloud },
  { id: 'fragile', icon: Shield },
  { id: 'alteration', icon: Edit3 },
];

export function useOrderForm(): UseOrderFormReturn {
  const { locale, t } = useI18n();
  const [orderId, setOrderId] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);

  const presetNotes: PresetNote[] = PRESET_NOTE_DEFS.map(({ id, icon }) => ({
    id,
    label: t(`newOrder.presetNotes.${id}`),
    icon,
    selectedClasses: 'border-[#3B4BFF] bg-[#3B4BFF] text-white',
    unselectedClasses: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]',
  }));

  const selectedNotesText = selectedNotes.map((id) => t(`newOrder.presetNotes.${id}`));

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

  const togglePresetNote = useCallback((id: string) => {
    setSelectedNotes((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
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
    selectedNotesText,
    presetNotes,
    clearForm,
    handleQuickDate,
    formatDateInputValue,
    formatDateDisplay,
  };
}
