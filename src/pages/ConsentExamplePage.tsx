import { useState } from 'react';
import { CustomerModal } from '@/components/CustomerModal';

export function ConsentExamplePage() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-lg mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-3">Public Consent Example</h1>
        <p className="text-sm leading-6 text-slate-600">
          This is a public demo of the SMS consent experience. No login required and no real data is saved.
        </p>
        <p className="mt-4 text-xs text-slate-500">
          Direct URL: <span className="font-medium text-slate-700">/consent-example</span>
        </p>
      </div>

      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mb-8 rounded-lg bg-[#3B4BFF] px-4 py-2 text-sm font-medium text-white hover:bg-[#2F3DE6]"
        >
          Open consent demo
        </button>
      )}

      <CustomerModal
        isOpen={isOpen}
        initialData={{ name: '', phone: '', smsConsent: false }}
        onSubmit={async () => ({ success: true })}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
