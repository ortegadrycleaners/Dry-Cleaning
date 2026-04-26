import { useParams } from 'react-router-dom';
import { mockOrders } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import ortegaLogo from '../assets/ortega_logo.png';


type TrackingVariant = 'proceso' | 'listo' | 'recordatorio';

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
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${status === 'completed'
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
          className={`text-xs mt-1 whitespace-nowrap ${status === 'pending' ? 'text-gray-400' : 'text-gray-700'
            }`}
        >
          {label}
        </span>
      </div>
      {!isLast && (
        <div
          className={`w-12 sm:w-16 h-0.5 mx-1 ${status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
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

  const getStatus = (stepKey: string) => {
    const stepIndex = steps.findIndex(s => s.key === stepKey);
    const currentIndex = steps.findIndex(s => s.key === currentStatus);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="flex justify-center py-6 overflow-x-auto">
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

function EnProcesoView({ order }: { order: typeof mockOrders[0] }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin-slow" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          Tu orden está en proceso
        </h2>
        <p className="text-gray-600">
          Orden #{order.id} | Cliente: {order.customerName}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Fecha estimada: {order.estimatedDate}
        </p>
      </div>
      <ProgressBar currentStatus="EN PROCESO" />
    </div>
  );
}

function ListoView({ order }: { order: typeof mockOrders[0] }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          ¡Tu orden está lista para retirar!
        </h2>
        <p className="text-gray-600">
          Orden #{order.id} | Rack #{order.rackNumber}
        </p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-green-800 font-medium">
          Puedes pasar a buscarlo cuando gustes
        </p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}

function RecordatorioView({ order }: { order: typeof mockOrders[0] }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#1B2A4A] mb-2">
          Tu orden lleva {order.daysReady} días lista esperándote
        </h2>
        <p className="text-gray-600">
          Orden #{order.id} | Rack #{order.rackNumber}
        </p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-amber-800">
          Recuerda que puedes pasar en nuestros horarios
        </p>
      </div>
      <ProgressBar currentStatus="LISTO" />
    </div>
  );
}


export function TrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();

  // Buscar la orden por el hash base62 (id público)
  const order = mockOrders.find(o => o.id === orderId) || mockOrders[0];

  // Determina el estado de la orden (esto es solo ejemplo, ajusta según tu lógica real)
  let variant: TrackingVariant = 'proceso';
  if (order.status === 'LISTO' && typeof order.daysReady === 'number' && order.daysReady > 2) {
    variant = 'recordatorio';
  } else if (order.status === 'LISTO') {
    variant = 'listo';
  } else {
    variant = 'proceso';
  }

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col overflow-x-hidden">
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 bg-white shadow-sm z-10 relative">
        <div className="flex items-center">
          <img src={ortegaLogo} alt="Ortega Cleaners" className="h-16 md:h-24 object-contain" />
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <a href="https://ortegadrycleaners.com" className="hover:text-gray-900 transition-colors">Home</a>
          <a href="https://ortegadrycleaners.com/services" className="hover:text-gray-900 transition-colors border-b-2 border-gray-600 pb-1">Services</a>
          <a href="https://ortegadrycleaners.com/prices" className="hover:text-gray-900 transition-colors">Prices</a>
          <a href="https://ortegadrycleaners.com/contact" className="hover:text-gray-900 transition-colors">Contact</a>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex flex-col flex-1 bg-[#0B1521] text-white px-6 py-12 md:py-20 items-center justify-center">
        {/* Tracking Status Card integrated into the UI */}
        <div className="w-full max-w-3xl mx-auto">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider text-center">Estado de tu orden</h3>
          <Card className="shadow-2xl border-0 overflow-hidden bg-white text-slate-900 rounded-3xl transform transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <CardContent className="p-8 md:p-12">
              {variant === 'proceso' && <EnProcesoView order={order} />}
              {variant === 'listo' && <ListoView order={order} />}
              {variant === 'recordatorio' && <RecordatorioView order={order} />}
            </CardContent>
          </Card>
        </div>

        {/* Header Text Moved Below */}
        <div className="text-center mt-16 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
            Much more than cleaning. We take care of what you value most.
          </h2>
          <p className="text-gray-300 text-lg md:text-xl">
            Discover all our services.
          </p>
        </div>

        {/* Demo Note */}
        <div className="w-full max-w-3xl mx-auto mt-12 p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
          <p className="text-sm text-gray-400 text-center mb-4">
            <strong>Demo:</strong> Cambia la URL para ver estados:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="#/seguimiento/proceso" className="text-sm px-5 py-2.5 rounded-full bg-[#1877F2]/20 text-blue-300 hover:bg-[#1877F2]/40 transition-colors">/proceso</a>
            <a href="#/seguimiento/listo" className="text-sm px-5 py-2.5 rounded-full bg-[#1877F2]/20 text-blue-300 hover:bg-[#1877F2]/40 transition-colors">/listo</a>
            <a href="#/seguimiento/recordatorio" className="text-sm px-5 py-2.5 rounded-full bg-[#1877F2]/20 text-blue-300 hover:bg-[#1877F2]/40 transition-colors">/recordatorio</a>
          </div>
        </div>
      </main>
    </div>
  );
}
