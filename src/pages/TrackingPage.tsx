import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Order } from '@/types';
import { useI18n } from '@/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { fetchOrderByPublicId } from '@/services/supabase/ordersService';
import { daysSince, formatElapsedTime, orderTicketLabel } from '@/lib/utils';
import { businessInfo } from '@/data/mockData';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Package,
  MapPin,
  Clock,
  Phone,
  Tag,
  RefreshCw,
} from 'lucide-react';
import LanguageToggle from '@/components/ui/LanguageToggle';

import './tracking.css';

type TrackingVariant = 'recibido' | 'proceso' | 'listo' | 'recordatorio' | 'entregado' | 'abandonado';

// 30s en lugar de 15s y con pausa cuando la pestaña no es visible: cuando esta
// página dispare lecturas a Supabase reduce a la mitad las requests por usuario
// y elimina por completo el consumo en pestañas en background.
const POLL_INTERVAL_MS = 30_000;

/* ---------- Progress Steps ---------- */

interface ProgressStepProps {
  label: string;
  status: 'completed' | 'current' | 'pending';
  isLast?: boolean;
}

function ProgressStep({ label, status, isLast }: ProgressStepProps) {
  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
            status === 'completed'
              ? 'bg-[#047857] text-white'
              : status === 'current'
                ? 'bg-[#3B4BFF] text-white'
                : 'bg-[#EEF2FF] text-[#9CA3AF]'
          }`}
        >
          {status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-current" />
          )}
        </div>
        <span
          className={`text-[10px] sm:text-xs mt-1 whitespace-nowrap ${
            status === 'pending' ? 'text-gray-400' : 'text-gray-700'
          }`}
        >
          {label}
        </span>
      </div>
      {!isLast && (
        <div
          className={`w-8 sm:w-16 h-0.5 mx-0.5 sm:mx-1 transition-colors ${
            status === 'completed' ? 'bg-[#047857]' : 'bg-[#E5E7EB]'
          }`}
        />
      )}
    </div>
  );
}

function ProgressBar({ currentStatus }: { currentStatus: string }) {
  const { t } = useI18n();
  const steps = [
    { label: t('tracking.status.received'), key: 'RECIBIDO' },
    { label: t('tracking.status.processing'), key: 'EN PROCESO' },
    { label: t('tracking.status.ready'), key: 'LISTO' },
    { label: t('tracking.status.delivered'), key: 'ENTREGADO' },
  ];

  const getStatus = (stepKey: string): 'completed' | 'current' | 'pending' => {
    const stepIndex = steps.findIndex(s => s.key === stepKey);
    const currentIndex = steps.findIndex(s => s.key === currentStatus);
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="flex justify-center py-4 sm:py-6 overflow-x-auto">
      <div className="flex items-start">
        {steps.map((step, index) => (
          <ProgressStep
            key={step.key}
            label={step.label}
            status={getStatus(step.key)}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Rack Location Visual ---------- */

function RackLocation({ rackNumber }: { rackNumber: string }) {
  const { t } = useI18n();

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[#3B4BFF] rounded-lg flex items-center justify-center flex-shrink-0">
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
            {t('tracking.section.location')}
          </p>
          <p className="text-lg font-bold text-[#1B2A4A]">
            {t('tracking.section.locationValue', { rackNumber })}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Status Views ---------- */

function RecibidoView({ order }: { order: Order }) {
  const { t, formatDate } = useI18n();

  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
        <Package className="w-10 h-10 text-gray-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          {t('tracking.receivedTitle')}
        </h2>
        <p className="text-gray-600">
          {t('tracking.orderLabel', { orderNumber: orderTicketLabel(order) })}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          {t('tracking.processingMessage', { estimatedDate: formatDate(order.estimatedDate) })}
        </p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800 text-sm">
          {t('tracking.receivedMessage')}
        </p>
      </div>
      <ProgressBar currentStatus="RECIBIDO" />
    </div>
  );
}

function EnProcesoView({ order }: { order: Order }) {
  const { t, formatDate } = useI18n();

  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin-slow" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          {t('tracking.processingTitle')}
        </h2>
        <p className="text-gray-600">
          {t('tracking.orderWithClient', {
            orderNumber: orderTicketLabel(order),
            customerName: order.customerName,
          })}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          {t('tracking.processingMessage', { estimatedDate: formatDate(order.estimatedDate) })}
        </p>
      </div>
      <ProgressBar currentStatus="EN PROCESO" />
    </div>
  );
}

function ListoView({ order }: { order: Order }) {
  const { t } = useI18n();

  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          {t('tracking.readyTitle')}
        </h2>
        <p className="text-gray-600">
          {t('tracking.orderLabel', { orderNumber: orderTicketLabel(order) })}
        </p>
      </div>
      {order.rackNumber && <RackLocation rackNumber={order.rackNumber} />}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
        <p className="text-green-800 font-medium">{t('tracking.readyPickupMessage')}</p>
        <p className="text-green-700 text-sm">{t('tracking.readyReminder')}</p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}

function RecordatorioView({ order }: { order: Order }) {
  const { t } = useI18n();

  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          {t('tracking.reminderTitle', { daysReady: order.daysReady ?? 0 })}
        </h2>
        <p className="text-gray-600">
          {t('tracking.orderLabel', { orderNumber: orderTicketLabel(order) })}
        </p>
      </div>
      {order.rackNumber && <RackLocation rackNumber={order.rackNumber} />}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-amber-800">{t('tracking.reminderNote')}</p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}

function EntregadoView({ order }: { order: Order }) {
  const { t } = useI18n();

  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-gray-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">{t('tracking.deliveredTitle')}</h2>
        <p className="text-gray-600">
          {t('tracking.orderLabel', { orderNumber: orderTicketLabel(order) })}
        </p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-md mx-auto space-y-3 text-center">
        <p className="text-gray-600 text-sm">{t('tracking.deliveredMessage')}</p>
        <p className="text-gray-600 text-sm font-medium">{t('tracking.deliveredThanks')}</p>
        <a
          href={businessInfo.googleReviewUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center justify-center rounded-full bg-[#1B2A4A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {t('tracking.writeReview')}
        </a>
      </div>
      <ProgressBar currentStatus="ENTREGADO" />
    </div>
  );
}

function AbandonadoView({ order }: { order: Order }) {
  const { t } = useI18n();

  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
        <AlertTriangle className="w-10 h-10 text-red-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          {t('tracking.abandonedTitle')}
        </h2>
        <p className="text-gray-600">
          {t('tracking.orderLabel', { orderNumber: orderTicketLabel(order) })}
        </p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md mx-auto">
        <p className="text-red-700 text-sm">{t('tracking.abandonedMessage')}</p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}

/* ---------- Brand Identity Section ---------- */

function BrandInfoSection() {
  const { t } = useI18n();
  return (
    <section className="w-full max-w-3xl mx-auto mt-10 sm:mt-16 space-y-6">
      {/* Información de Ortega Dry Cleaners en un solo contenedor */}
      <Card className="bg-white rounded-[28px] border border-[#F0E8D8] shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold tracking-[0.18em] text-[#1B2A4A] uppercase mb-4">
            Ortega Dry Cleaners
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-[#E8E8F0] bg-[#FAFAFC] p-3">
              <Phone className="w-[18px] h-[18px] text-[#3B4BFF]" />
              <div>
                <p className="text-sm text-[#1B2A4A] font-semibold">{businessInfo.phone}</p>
                <p className="text-[11px] text-gray-500">{t('brand.phoneTitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-[#E8E8F0] bg-[#FAFAFC] p-3">
              <Clock className="w-[18px] h-[18px] text-[#3B4BFF]" />
              <div>
                <p className="text-sm text-[#1B2A4A] font-semibold">{t('brand.hoursValue')}</p>
                <p className="text-[11px] text-gray-500">{t('brand.hoursTitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-[#E8E8F0] bg-[#FAFAFC] p-3">
              <MapPin className="w-[18px] h-[18px] text-[#3B4BFF]" />
              <div>
                <p className="text-sm text-[#1B2A4A] font-semibold">{businessInfo.address}</p>
                <p className="text-[11px] text-gray-500">{t('brand.addressTitle')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Promociones */}
      <div className="flex justify-center w-full">
        <div className="w-full max-w-3xl">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider text-center">
            {t('promotions.title')}
          </h3>
          <div className="flex justify-center">
            {businessInfo.promotions.map((_, i) => (
              <Card key={i} className="promo-card border-[#3B4BFF]/20 w-full max-w-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="w-4 h-4 text-[#3B4BFF]" />
                    <h4 className="text-sm font-semibold text-white">{t(`promotions.${i}.title`)}</h4>
                  </div>
                  <div className="text-gray-300 text-xs leading-relaxed">
                    {t(`promotions.${i}.description`)
                      .split('\n')
                      .map((line, idx) => (
                        <p key={idx} className="m-0">
                          {line}
                        </p>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Refresh Indicator ---------- */

function RefreshIndicator({ lastRefresh }: { lastRefresh: Date }) {
  const { t, locale } = useI18n();
  const elapsedText = formatElapsedTime(lastRefresh, locale);

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-gray-600 mt-4">
      <RefreshCw className="w-3 h-3" />
      <span>{t('tracking.updated', { elapsedText })}</span>
    </div>
  );
}

/* ---------- Main TrackingPage ---------- */

export function TrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t } = useI18n();
  const baseUrl = import.meta.env.BASE_URL;
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  // Carga inicial: fetch de la orden específica por public_id
  useEffect(() => {
    let cancelled = false;

    const loadOrder = async () => {
      if (!orderId) {
        setIsLoading(false);
        return;
      }

      const fetchedOrder = await fetchOrderByPublicId(orderId);
      if (!cancelled) {
        setOrder(fetchedOrder);
        setIsLoading(false);
      }
    };

    loadOrder();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Polling: actualiza la orden cada 30s (solo si visible)
  const refreshStatus = useCallback(() => {
    setLastRefresh(new Date());

    // Re-fetch de la orden específica
    if (orderId) {
      fetchOrderByPublicId(orderId).then((fetchedOrder) => {
        setOrder(fetchedOrder);
      });
    }
  }, [orderId]);

  useEffect(() => {
    let intervalId: number | null = null;

    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const start = () => {
      stop();
      intervalId = window.setInterval(refreshStatus, POLL_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [refreshStatus]);
  if (!order) {
    // Mientras carga, mostrar un spinner en lugar de redirigir inmediatamente
    if (isLoading) {
      return (
        <div className="min-h-screen bg-[#0B1521] flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300 text-sm">{t('tracking.loadingStatus')}</p>
          </div>
        </div>
      );
    }
    return <div className="min-h-screen bg-[#0B1521] flex items-center justify-center"><p className="text-gray-300">{t('tracking.orderNotFound')}</p></div>;
  }

  const derivedDaysReady =
    order.status === 'LISTO'
      ? daysSince(order.statusUpdatedAt) ?? order.daysReady ?? 0
      : order.daysReady ?? 0;
  const orderForView = { ...order, daysReady: derivedDaysReady };

  let variant: TrackingVariant;
  switch (order.status) {
    case 'RECIBIDO':
      variant = 'recibido';
      break;
    case 'EN PROCESO':
      variant = 'proceso';
      break;
    case 'LISTO':
      variant = typeof derivedDaysReady === 'number' && derivedDaysReady > 2
        ? 'recordatorio'
        : 'listo';
      break;
    case 'ENTREGADO':
      variant = 'entregado';
      break;
    case 'ABANDONADO':
      variant = 'abandonado';
      break;
    default:
      variant = 'proceso';
  }

return (
    <div className="min-h-screen bg-[#FFF4E6] font-sans flex flex-col overflow-x-hidden">
      <header className="bg-[#0E0E1A] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src={`${baseUrl}svg/zivo-wordmark-white.svg`}
                alt="zivo"
                className="h-6 sm:h-8 w-auto"
              />
              <div className="hidden sm:flex items-center ml-3 text-sm text-[#FAFAFC]/90">
                {t('tracking.header.branch', { branchName: 'Ortega Dry Cleaners' })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LanguageToggle inline />
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex flex-col flex-1 px-4 sm:px-6 py-8 sm:py-12 md:py-20 items-center text-[#1B2A4A]">
        {/* Tarjeta de estado de la orden */}
        <div className="w-full max-w-3xl mx-auto">
          <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider text-center">
            {t('tracking.statusSection')}
          </h3>
          <Card className="shadow-sm border-0 overflow-hidden bg-white text-slate-900 rounded-2xl sm:rounded-3xl transform transition-all">
            <CardContent className="p-5 sm:p-8 md:p-12">
              {variant === 'recibido' && <RecibidoView order={orderForView} />}
              {variant === 'proceso' && <EnProcesoView order={orderForView} />}
              {variant === 'listo' && <ListoView order={orderForView} />}
              {variant === 'recordatorio' && <RecordatorioView order={orderForView} />}
              {variant === 'entregado' && <EntregadoView order={orderForView} />}
              {variant === 'abandonado' && <AbandonadoView order={orderForView} />}
            </CardContent>
          </Card>

          <RefreshIndicator lastRefresh={
            order.statusUpdatedAt && !isNaN(new Date(order.statusUpdatedAt).getTime())
              ? new Date(order.statusUpdatedAt)
              : lastRefresh
          } />
        </div>

        {/* Mensaje de marca */}
        <div className="text-center mt-10 sm:mt-16 max-w-3xl mx-auto px-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 leading-tight">
              {t('tracking.hero.title')}
            </h2>
            <p className="text-gray-600 text-base sm:text-lg md:text-xl">
              {t('tracking.hero.subtitle')}
            </p>
        </div>

        {/* Sección de identidad de marca */}
        <BrandInfoSection />

        {/* Footer: Hosted by zivo */}
        <footer className="w-full mt-10">
          <div className="max-w-3xl mx-auto py-6 text-center text-sm text-gray-600 flex items-center justify-center gap-2">
            <span>{t('tracking.footer.hostedBy')}</span>
            <img src={`${baseUrl}svg/zivo-wordmark.svg`} alt="zivo" className="h-4 w-auto inline-block" />
          </div>
        </footer>

      </main>
    </div>
  );
}
