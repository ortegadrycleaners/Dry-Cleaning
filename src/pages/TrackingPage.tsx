import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams, Link } from 'react-router-dom';
import type { Order } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { useOrders } from '@/context/OrdersContext';
import { orderTicketLabel } from '@/lib/utils';
import { businessInfo, mockOrders } from '@/data/mockData';
import { BrandLogo } from '@/components/BrandLogo';
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

type TrackingVariant = 'recibido' | 'proceso' | 'listo' | 'recordatorio' | 'entregado';

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
              ? 'bg-green-500 text-white'
              : status === 'current'
                ? 'bg-[#1B2A4A] text-white'
                : 'bg-gray-200 text-gray-400'
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
            status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
          }`}
        />
      )}
    </div>
  );
}

function ProgressBar({ currentStatus }: { currentStatus: string }) {
  const steps = [
    { label: 'Recibido', key: 'RECIBIDO' },
    { label: 'En Proceso', key: 'EN PROCESO' },
    { label: 'Listo', key: 'LISTO' },
    { label: 'Entregado', key: 'ENTREGADO' },
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
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[#1B2A4A] rounded-lg flex items-center justify-center flex-shrink-0">
          <MapPin className="w-6 h-6 text-[#C9A84C]" />
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
            Ubicación en tienda
          </p>
          <p className="text-lg font-bold text-[#1B2A4A]">
            Rack #{rackNumber}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Status Views ---------- */

function RecibidoView({ order }: { order: Order }) {
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
        <Package className="w-10 h-10 text-gray-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          Tu orden ha sido recibida
        </h2>
        <p className="text-gray-600">
          Orden #{orderTicketLabel(order)} | Cliente: {order.customerName}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Fecha estimada: {order.estimatedDate}
        </p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800 text-sm">
          Estamos preparando tu orden. Te notificaremos cuando esté lista.
        </p>
      </div>
      <ProgressBar currentStatus="RECIBIDO" />
    </div>
  );
}

function EnProcesoView({ order }: { order: Order }) {
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin-slow" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          Tu orden está en proceso
        </h2>
        <p className="text-gray-600">
          Orden #{orderTicketLabel(order)} | Cliente: {order.customerName}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Fecha estimada: {order.estimatedDate}
        </p>
      </div>
      <ProgressBar currentStatus="EN PROCESO" />
    </div>
  );
}

function ListoView({ order }: { order: Order }) {
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          ¡Tu orden está lista para retirar!
        </h2>
        <p className="text-gray-600">
          Orden #{orderTicketLabel(order)}
        </p>
      </div>
      {order.rackNumber && <RackLocation rackNumber={order.rackNumber} />}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-green-800 font-medium">
          Puedes pasar a recogerla cuando gustes
        </p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}

function RecordatorioView({ order }: { order: Order }) {
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          Tu orden lleva {order.daysReady} días lista esperándote
        </h2>
        <p className="text-gray-600">
          Orden #{orderTicketLabel(order)}
        </p>
      </div>
      {order.rackNumber && <RackLocation rackNumber={order.rackNumber} />}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-amber-800">
          Recuerda que puedes pasar en nuestro horario de atención
        </p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}

function EntregadoView({ order }: { order: Order }) {
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-gray-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          Orden entregada
        </h2>
        <p className="text-gray-600">
          Orden #{orderTicketLabel(order)} | {order.customerName}
        </p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600 text-sm">
          Esta orden ya fue recogida. ¡Gracias por tu preferencia!
        </p>
      </div>
      <ProgressBar currentStatus="ENTREGADO" />
    </div>
  );
}

/* ---------- Brand Identity Section ---------- */

function BrandInfoSection() {
  return (
    <section className="w-full max-w-3xl mx-auto mt-10 sm:mt-16 space-y-6">
      {/* Dirección y horarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-[#C9A84C]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Dirección</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                {businessInfo.address}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-[#C9A84C]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Horario de Atención</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                {businessInfo.hours}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur-sm sm:col-span-2">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-[#C9A84C]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Phone className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Teléfono</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                {businessInfo.phone}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Promociones */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider text-center">
          Promociones
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {businessInfo.promotions.map((promo, i) => (
            <Card key={i} className="border-[#C9A84C]/20 bg-gradient-to-br from-[#C9A84C]/10 to-transparent backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-[#C9A84C]" />
                  <h4 className="text-sm font-semibold text-white">{promo.title}</h4>
                </div>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {promo.description}
                </p>
                {'code' in promo && promo.code && (
                  <div className="mt-3 inline-block px-3 py-1 bg-[#C9A84C]/20 rounded-full">
                    <span className="text-xs font-mono font-bold text-[#C9A84C]">
                      {promo.code}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Refresh Indicator ---------- */

function RefreshIndicator({ lastRefresh }: { lastRefresh: Date }) {
  const timeStr = lastRefresh.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-4">
      <RefreshCw className="w-3 h-3" />
      <span>Última actualización: {timeStr}</span>
    </div>
  );
}

/* ---------- Main TrackingPage ---------- */

export function TrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { orders } = useOrders();
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const refreshStatus = useCallback(() => {
    setLastRefresh(new Date());
  }, []);

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

  const order = orders.find(o => o.id === orderId);
  if (!order) {
    return <Navigate to="/not-found" replace />;
  }

  let variant: TrackingVariant;
  switch (order.status) {
    case 'RECIBIDO':
      variant = 'recibido';
      break;
    case 'EN PROCESO':
      variant = 'proceso';
      break;
    case 'LISTO':
      variant = typeof order.daysReady === 'number' && order.daysReady > 2
        ? 'recordatorio'
        : 'listo';
      break;
    case 'ENTREGADO':
      variant = 'entregado';
      break;
    default:
      variant = 'proceso';
  }

  const demoLinks = mockOrders
    .filter(o => o.id !== orderId)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col overflow-x-hidden">
      {/* Navegación superior - marca unificada */}
      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-3 sm:py-4 bg-white shadow-sm z-10 relative">
        <BrandLogo size="sm" />
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <span className="text-[#1B2A4A] border-b-2 border-[#C9A84C] pb-1">
            Seguimiento
          </span>
        </div>
      </nav>

      {/* Contenido principal */}
      <main className="flex flex-col flex-1 bg-[#0B1521] text-white px-4 sm:px-6 py-8 sm:py-12 md:py-20 items-center">
        {/* Tarjeta de estado de la orden */}
        <div className="w-full max-w-3xl mx-auto">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider text-center">
            Estado de tu orden
          </h3>
          <Card className="shadow-2xl border-0 overflow-hidden bg-white text-slate-900 rounded-2xl sm:rounded-3xl transform transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <CardContent className="p-5 sm:p-8 md:p-12">
              {variant === 'recibido' && <RecibidoView order={order} />}
              {variant === 'proceso' && <EnProcesoView order={order} />}
              {variant === 'listo' && <ListoView order={order} />}
              {variant === 'recordatorio' && <RecordatorioView order={order} />}
              {variant === 'entregado' && <EntregadoView order={order} />}
            </CardContent>
          </Card>

          <RefreshIndicator lastRefresh={lastRefresh} />
        </div>

        {/* Mensaje de marca */}
        <div className="text-center mt-10 sm:mt-16 max-w-3xl mx-auto px-2">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 leading-tight">
            Mucho más que limpieza. Cuidamos lo que más valoras.
          </h2>
          <p className="text-gray-300 text-base sm:text-lg md:text-xl">
            Descubre todos nuestros servicios.
          </p>
        </div>

        {/* Sección de identidad de marca */}
        <BrandInfoSection />

        {/* Demo: enlaces de ejemplo */}
        <div className="w-full max-w-3xl mx-auto mt-10 sm:mt-12 p-4 sm:p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
          <p className="text-sm text-gray-400 text-center mb-4">
            <strong>Demo:</strong> Prueba con otras órdenes:
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {demoLinks.map(demo => (
              <Link
                key={demo.id}
                to={`/tracking/${demo.id}`}
                className="text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[#1877F2]/20 text-blue-300 hover:bg-[#1877F2]/40 transition-colors"
              >
                #{orderTicketLabel(demo)} — {demo.status}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
