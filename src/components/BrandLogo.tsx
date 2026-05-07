import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Logo de marca "Tintorería Elegance" como componente SVG/icon inline. */
export function BrandLogo({ size = 'md', className }: BrandLogoProps) {
  const iconSizes = {
    sm: { container: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-sm' },
    md: { container: 'w-12 h-12', icon: 'w-6 h-6', text: 'text-lg' },
    lg: { container: 'w-16 h-16', icon: 'w-8 h-8', text: 'text-2xl' },
  };

  const s = iconSizes[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          s.container,
          'bg-[#1B2A4A] rounded-full flex items-center justify-center flex-shrink-0'
        )}
      >
        <Sparkles className={cn(s.icon, 'text-[#C9A84C]')} />
      </div>
      <span className={cn(s.text, 'font-bold text-[#1B2A4A]')}>
        Tintorería Elegance
      </span>
    </div>
  );
}
