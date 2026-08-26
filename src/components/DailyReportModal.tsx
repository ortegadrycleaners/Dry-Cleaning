import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, AlertTriangle, FileText, Calendar } from 'lucide-react';
import { fetchTodayDailyReport, type DailyReportOrder } from '@/services/supabase/ordersService';
import { useI18n } from '@/i18n';

interface DailyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DailyReportModal({ isOpen, onClose }: DailyReportModalProps) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<DailyReportOrder[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (justOpened) {
      const todayStr = getTodayString();
      if (selectedDate !== todayStr) {
        // Reset to today on (re)open; the effect re-runs once selectedDate
        // updates, so we skip fetching for the stale date here.
        setSelectedDate(todayStr);
        return;
      }
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchTodayDailyReport(selectedDate)
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
        setError(t('dashboard.dailyReport.error'));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedDate, t]);

  const handlePrint = () => {
    window.print();
  };

  const formattedDisplayDate = useMemo(() => {
    if (!selectedDate) return '';
    const parts = selectedDate.split('-');
    if (parts.length !== 3) return selectedDate;
    const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return dateObj.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [selectedDate, locale]);

  return (
    <>
      {/* Estilos CSS específicos para la impresión limpia a prueba de navegadores y modales Radix */}
      <style>{`
        @media print {
          /* Ocultar elementos de Radix / Dialog overlay y botones de cierre */
          [data-slot="dialog-overlay"],
          [data-slot="dialog-close"],
          .no-print {
            display: none !important;
          }

          /* Desarmar la caja flotante del diálogo para no recortar la hoja de impresión */
          [data-slot="dialog-content"] {
            position: static !important;
            transform: none !important;
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }

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
            height: 34px !important;
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
                  {t('dashboard.dailyReport.title')}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-0.5">
                  {t('dashboard.dailyReport.description')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Barra interactiva de Selección de Fecha */}
          <div className="flex items-center justify-between gap-3 bg-slate-50 border-b border-gray-100 px-6 py-2.5 no-print">
            <div className="flex items-center gap-2">
              <label htmlFor="daily-report-date-picker" className="text-xs font-semibold text-slate-600">
                {t('dashboard.dailyReport.selectDate')}
              </label>
              <input
                id="daily-report-date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B4BFF]/20 focus:border-[#3B4BFF] cursor-pointer"
              />
            </div>
            {selectedDate !== getTodayString() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(getTodayString())}
                className="text-xs h-7 px-2.5 text-slate-700 hover:text-slate-900 border-gray-300 gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                {t('dashboard.dailyReport.todayButton')}
              </Button>
            )}
          </div>

          {/* Cuerpo interactivo / Contenido del Reporte */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-3 no-print">
                <Loader2 className="w-8 h-8 animate-spin text-[#3B4BFF]" />
                <p className="text-sm font-medium">{t('dashboard.dailyReport.loading')}</p>
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
                        {t('dashboard.dailyReport.businessName')}
                      </h1>
                      <h2 className="text-base font-semibold text-slate-700 mt-0.5">
                        {t('dashboard.dailyReport.docTitle')}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase font-semibold text-slate-400">
                        {t('dashboard.dailyReport.reportDate')}
                      </p>
                      <p className="text-sm font-bold text-slate-800 capitalize">{formattedDisplayDate}</p>
                    </div>
                  </div>
                </div>

                {/* Tabla de Órdenes */}
                {orders.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 space-y-2">
                    <p className="font-semibold text-slate-700 text-base">
                      {t('dashboard.dailyReport.emptyTitle')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {t('dashboard.dailyReport.emptySubtitle', { date: formattedDisplayDate })}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-200 text-slate-700 font-semibold">
                          <th className="py-3 px-4 w-[22%]">{t('dashboard.dailyReport.colOrder')}</th>
                          <th className="py-3 px-4 w-[38%]">{t('dashboard.dailyReport.colPhone')}</th>
                          <th className="py-3 px-4 w-[20%] text-center">{t('dashboard.dailyReport.colRack')}</th>
                          <th className="py-3 px-4 w-[20%] text-center">{t('dashboard.dailyReport.colPieces')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orders.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              #{item.orderNumber}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-700">
                              {item.phone}
                            </td>
                            <td className="py-2.5 px-4 text-center font-mono text-slate-800 min-w-[70px]">
                              {item.rackNumber || ''}
                            </td>
                            <td className="py-2.5 px-4 text-center font-mono text-slate-800 min-w-[70px]">
                              {item.pieces !== undefined && item.pieces !== null ? item.pieces : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                          <td colSpan={3} className="py-3 px-4 text-right">
                            {t('dashboard.dailyReport.totalLabel')}
                          </td>
                          <td className="py-3 px-4 text-slate-900 text-base text-center">
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
              {t('common.close')}
            </Button>
            <Button
              onClick={handlePrint}
              disabled={loading || !!error || orders.length === 0}
              className="bg-[#3B4BFF] hover:bg-blue-700 text-white gap-2 font-medium shadow-sm"
            >
              <Printer className="w-4 h-4" />
              {t('dashboard.dailyReport.printButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

