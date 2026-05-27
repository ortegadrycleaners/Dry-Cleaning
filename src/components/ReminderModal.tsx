import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

interface ReminderTask {
  id: string;
  receipt_id: string;
  milestone: number;
  order_number: string;
  customer_name: string;
  phone: string;
  message: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
}

interface ReminderModalProps {
  task: ReminderTask | null;
  onSendSms: (taskId: string) => Promise<void>;
  onSkip?: (taskId: string) => void;
  isLoading?: boolean;
}

/**
 * ReminderModal - Shows pending reminder tasks as a priority modal.
 * Non-closeable (no X button) to ensure admin acknowledges the task.
 */
export const ReminderModal: React.FC<ReminderModalProps> = ({
  task,
  onSendSms,
  onSkip,
  isLoading = false,
}) => {
  const [isSending, setIsSending] = useState(false);

  if (!task) return null;

  const handleSendSms = async () => {
    setIsSending(true);
    try {
      await onSendSms(task.id);
      toast.success(`SMS enviado a ${task.customer_name}`);
    } catch (err) {
      toast.error('Error al enviar SMS');
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip(task.id);
      toast.info('Recordatorio omitido');
    }
  };

  // Determine milestone label
  const milestoneLabel = {
    3: '3 días en rack',
    5: '5 días en rack (URGENTE)',
    30: '30 días en rack (CRÍTICO)',
  }[task.milestone] || `${task.milestone} días`;

  return (
    <Dialog open={!!task} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        {/* No close button - priority modal */}
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <DialogTitle>Recordatorio de Orden Pendiente</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Priority indicator */}
          {task.milestone >= 5 && (
            <div className="rounded-lg bg-red-50 p-3 border border-red-200">
              <p className="text-sm font-semibold text-red-700">⚠️ ALTA PRIORIDAD</p>
              <p className="text-sm text-red-600 mt-1">Esta orden requiere atención inmediata</p>
            </div>
          )}

          {/* Order details */}
          <div className="space-y-2 rounded-lg bg-gray-50 p-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Orden</p>
              <p className="text-sm font-semibold text-gray-900">{task.order_number}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Cliente</p>
              <p className="text-sm text-gray-900">{task.customer_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Teléfono</p>
              <p className="text-sm text-gray-900">{task.phone}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Tiempo en rack</p>
              <p className="text-sm font-semibold text-amber-700">{milestoneLabel}</p>
            </div>
          </div>

          {/* Message preview */}
          <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
            <p className="text-xs font-medium text-blue-700 uppercase mb-1">Mensaje a enviar</p>
            <p className="text-sm text-blue-900 italic">"{task.message}"</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              disabled={isSending || isLoading || !onSkip}
              title={!onSkip ? 'Skip action not available' : ''}
              className="flex-1"
            >
              Omitir por ahora
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSendSms}
              disabled={isSending || isLoading}
              className="flex-1 gap-2"
            >
              <Send className="h-4 w-4" />
              {isSending ? 'Enviando...' : 'Enviar SMS'}
            </Button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-gray-500 text-center mt-2">
          Este modal no se puede cerrar. Debe enviar o omitir el recordatorio.
        </p>
      </DialogContent>
    </Dialog>
  );
};
