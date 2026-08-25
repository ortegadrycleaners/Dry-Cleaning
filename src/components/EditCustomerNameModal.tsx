import { useEffect, useState } from 'react';
import type { Order } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil } from 'lucide-react';
import { useI18n } from '@/i18n';
import { escapeHTML } from '@/lib/customerSchema';
import { updateCustomerName } from '@/services/supabase/customersService';

interface EditCustomerNameModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚáéíóúÑñüÜ\s'-]+$/;

export function EditCustomerNameModal({ order, isOpen, onClose, onSaved }: EditCustomerNameModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(order?.customerName ?? '');
      setError('');
      setIsSaving(false);
    }
  }, [isOpen, order]);

  if (!order) return null;

  const handleSave = async () => {
    if (isSaving) return;
    const normalized = name.trim().replace(/\s+/g, ' ');

    if (normalized.length < 2) {
      setError(t('dashboard.editCustomer.nameRequired'));
      return;
    }
    if (!NAME_PATTERN.test(normalized)) {
      setError(t('dashboard.editCustomer.nameInvalidChars'));
      return;
    }

    setIsSaving(true);
    const result = await updateCustomerName(order.phone, escapeHTML(normalized));
    setIsSaving(false);

    if (!result.success) {
      setError(t(`dashboard.editCustomer.${result.errorCode ?? 'updateFailed'}`));
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1B2A4A] font-semibold text-lg">
            <Pencil className="w-4 h-4" />
            {t('dashboard.editCustomer.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 p-3 rounded-lg text-sm text-gray-600">
            {t('common.phone')}: <span className="font-medium text-[#1B2A4A]">{order.phone}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-customer-name" className="text-sm font-medium text-gray-700">
              {t('dashboard.editCustomer.nameLabel')}
            </Label>
            <Input
              id="edit-customer-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              disabled={isSaving}
              autoFocus
              className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('dashboard.editCustomer.saving')}
              </>
            ) : (
              t('dashboard.editCustomer.save')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
