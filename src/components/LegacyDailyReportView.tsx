import { type DailyReportOrder } from '@/services/supabase/ordersService';
import { useI18n } from '@/i18n';

interface LegacyDailyReportViewProps {
  orders: DailyReportOrder[];
}

/**
 * Componente de respaldo del Reporte Diario Original (con columna de Hora).
 * Conservado según requerimiento del usuario para posterior reutilización o consulta.
 */
export function LegacyDailyReportView({ orders }: LegacyDailyReportViewProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-gray-200 text-slate-700 font-semibold">
            <th className="py-3 px-4 w-1/4">{t('dashboard.dailyReport.colTime')}</th>
            <th className="py-3 px-4 w-1/3">{t('dashboard.dailyReport.colOrder')}</th>
            <th className="py-3 px-4 w-5/12">{t('dashboard.dailyReport.colPhone')}</th>
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
              {t('dashboard.dailyReport.totalLabel')}
            </td>
            <td className="py-3 px-4 text-slate-900 text-base">
              {orders.length}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
