import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { fetchTodayDailyReport, type DailyReportOrder } from '@/services/supabase/ordersService';

interface DailyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DailyReportModal({ isOpen, onClose }: DailyReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<DailyReportOrder[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchTodayDailyReport()
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error);
          setOrders([]);
        } else {
          setOrders(res.orders);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[DailyReportModal] Unexpected fetch error:', err);
        setError('Ocurrió un error inesperado al generar el reporte.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handlePrint = () => {
    window.print();
  };

  const todayFormatted = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      {/* Estilos CSS específicos para la impresión limpia */}
      <style>{`
        @media print {
          /* Ocultar toda la interfaz general del sitio */
          body * {
            visibility: hidden !important;
          }

          /* Hacer visible únicamente el área del reporte */
          #printable-daily-report,
          #printable-daily-report * {
            visibility: visible !important;
          }

          /* Ubicar la hoja de reporte en el origen absoluto sin márgenes UI */
          #printable-daily-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
          }

          /* Ocultar elementos marcados con .no-print durante la impresión */
          .no-print {
            display: none !important;
          }

          @page {
            size: auto;
            margin: 12mm;
          }

          tr {
            page-break-inside: avoid;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          th, td {
            border: 1px solid #000000 !important;
            padding: 8px 12px !important;
            color: #000000 !important;
          }
        }
      `}</style>

      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          {/* Cabecera del Dialog UI */}
          <DialogHeader className="p-6 pb-4 border-b border-gray-100 no-print">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-[#3B4BFF]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  Reporte Diario de Control Interno
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-0.5">
                  Vista previa del listado de órdenes registradas el día de hoy
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Cuerpo interactivo / Contenido del Reporte */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-3 no-print">
                <Loader2 className="w-8 h-8 animate-spin text-[#3B4BFF]" />
                <p className="text-sm font-medium">Obteniendo órdenes del día...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-3 no-print">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : (
              <div
                id="printable-daily-report"
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6"
              >
                {/* Encabezado del documento impreso / vista previa */}
                <div className="border-b border-gray-200 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                        Ortega Dry Cleaners
                      </h1>
                      <h2 className="text-base font-semibold text-slate-700 mt-0.5">
                        Control Diario de Órdenes
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase font-semibold text-slate-400">Fecha del Reporte</p>
                      <p className="text-sm font-bold text-slate-800 capitalize">{todayFormatted}</p>
                    </div>
                  </div>
                </div>

                {/* Tabla de Órdenes */}
                {orders.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 space-y-2">
                    <p className="font-semibold text-slate-700 text-base">No hay órdenes registradas hoy</p>
                    <p className="text-xs text-slate-400">
                      No se han creado nuevas órdenes en la fecha actual ({todayFormatted}).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-200 text-slate-700 font-semibold">
                          <th className="py-3 px-4 w-1/4">Hora</th>
                          <th className="py-3 px-4 w-1/3">Nro. Orden</th>
                          <th className="py-3 px-4 w-5/12">Teléfono del Cliente</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orders.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-4 font-mono text-slate-600">
                              {item.formattedTime || '—'}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              #{item.orderNumber}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-700">
                              {item.phone}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                          <td colSpan={2} className="py-3 px-4 text-right">
                            Total de Órdenes Registradas Hoy:
                          </td>
                          <td className="py-3 px-4 text-slate-900 text-base">
                            {orders.length}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Acciones del Dialog (Ocultas en la impresión real) */}
          <DialogFooter className="p-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between no-print gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cerrar
            </Button>
            <Button
              onClick={handlePrint}
              disabled={loading || !!error || orders.length === 0}
              className="bg-[#3B4BFF] hover:bg-blue-700 text-white gap-2 font-medium shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimir Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
