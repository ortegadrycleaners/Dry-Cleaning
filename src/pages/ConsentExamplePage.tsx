import { useState } from 'react';
import { useI18n } from '@/i18n';
import { CustomerModal } from '@/components/CustomerModal';

export function ConsentExamplePage() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-lg mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-3">Ejemplo público de consentimiento</h1>
        <p className="text-sm leading-6 text-slate-600">
          Esta página es una demo pública de la experiencia de consentimiento SMS. No se requiere iniciar sesión y no se guarda información real.
        </p>
        <p className="mt-4 text-xs text-slate-500">
          URL directa: <span className="font-medium text-slate-700">/consent-example</span>
        </p>
      </div>

      <CustomerModal
        isOpen={isOpen}
        initialData={{ name: '', phone: '', smsConsent: false }}
        onSubmit={async () => ({ success: true })}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
