import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Componente visual de la marca — símbolo (cuadrado redondeado + Z) y wordmark.
 *  SOLO cambia la apariencia, no la lógica. */
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
          'flex items-center justify-center flex-shrink-0 rounded-md',
        )}
        aria-hidden
        style={{ backgroundColor: '#3B4BFF' }}
      >
        <span className={cn('font-extrabold tracking-tight', s.text)} style={{ color: '#fff' }}>
          zivo
        </span>
      </div>

      {size !== 'sm' && (
        <span className={cn(s.text, 'font-extrabold text-[#0E0E1A] tracking-tight')}>zivo</span>
      )}
    </div>
  );
}
