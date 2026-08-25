import { useState, useEffect } from 'react';
import type { Order } from '@/types';
import { orderTicketLabel } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';

interface DeleteOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (orderId: string) => Promise<boolean>;
}

export function DeleteOrderModal({
  order,
  isOpen,
  onClose,
  onConfirmDelete,
}: DeleteOrderModalProps) {
  const { t } = useI18n();
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const ticketLabel = order ? orderTicketLabel(order) : '';
  const expectedPhrase = `DELETE #${ticketLabel}`;

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!isOpen) {
      setConfirmationInput('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!order) return null;

  // Permite coincidencia exacta o ignorando mayúsculas/minúsculas y espacios
  const normalizedInput = confirmationInput.trim().toUpperCase();
  const isValid =
    normalizedInput === expectedPhrase.toUpperCase() ||
    normalizedInput === `DELETE ${ticketLabel}`.toUpperCase();

  const handleDelete = async () => {
    if (!isValid || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete(order.id);
    } finally {
      setIsDeleting(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isDeleting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive font-bold text-lg">
            <Trash2 className="w-5 h-5" />
            {t('dashboard.deleteModal.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Alerta Destructiva */}
          <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                {t('dashboard.deleteModal.warningTitle')}
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t('dashboard.deleteModal.warningDescription', {
                  ticketLabel,
                  customerName: order.customerName,
                })}
              </p>
            </div>
          </div>

          {/* Instrucciones de Confirmación */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t('dashboard.deleteModal.inputLabel')}
            </Label>
            <div className="p-2 rounded bg-muted/60 text-center font-mono text-sm font-semibold select-all border text-destructive">
              {expectedPhrase}
            </div>
            <Input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={expectedPhrase}
              disabled={isDeleting}
              className="font-mono text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!isValid || isDeleting}
            className="gap-2 font-medium"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('dashboard.deleteModal.deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('dashboard.deleteModal.confirmBtn')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

  );
}
