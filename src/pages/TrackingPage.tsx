import { useParams } from 'react-router-dom';
import { mockOrders, businessInfo } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, MapPin, Phone } from 'lucide-react';

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
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
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
          className={`text-xs mt-1 whitespace-nowrap ${
            status === 'pending' ? 'text-gray-400' : 'text-gray-700'
          }`}
        >
          {label}
        </span>
      </div>
      {!isLast && (
        <div
          className={`w-12 sm:w-16 h-0.5 mx-1 ${
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
  const { token } = useParams<{ token: string }>();
  
  // For demo purposes, we'll show different variants based on the token
  // In a real app, this would fetch the actual order
  const getVariant = (): TrackingVariant => {
    if (token === 'listo') return 'listo';
    if (token === 'recordatorio') return 'recordatorio';
    return 'proceso';
  };

  const variant = getVariant();

  // Get a mock order based on variant
  const getOrder = () => {
    switch (variant) {
      case 'listo':
        return mockOrders.find(o => o.id === '1039') || mockOrders[0];
      case 'recordatorio':
        return mockOrders.find(o => o.id === '1035') || mockOrders[0];
      default:
        return mockOrders.find(o => o.id === '1042') || mockOrders[0];
    }
  };

  const order = getOrder();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Business Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1B2A4A] rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-xl font-bold text-[#1B2A4A]">{businessInfo.name}</h1>
          <div className="flex items-center justify-center gap-1 text-sm text-gray-500 mt-1">
            <MapPin className="w-3 h-3" />
            <span>{businessInfo.address}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{businessInfo.hours}</p>
        </div>

        {/* Status Card */}
        <Card className="shadow-lg border-0 overflow-hidden">
          <CardContent className="p-6">
            {variant === 'proceso' && <EnProcesoView order={order} />}
            {variant === 'listo' && <ListoView order={order} />}
            {variant === 'recordatorio' && <RecordatorioView order={order} />}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center">
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4" />
              <span>¿Preguntas? Llámanos al {businessInfo.phone}</span>
            </div>
          </div>
        </div>

        {/* Demo Note */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-700 text-center">
            <strong>Demo:</strong> Cambia la URL para ver diferentes estados:
          </p>
          <div className="flex justify-center gap-2 mt-2">
            <a href="#/seguimiento/proceso" className="text-xs text-blue-600 hover:underline">
              /proceso
            </a>
            <a href="#/seguimiento/listo" className="text-xs text-blue-600 hover:underline">
              /listo
            </a>
            <a href="#/seguimiento/recordatorio" className="text-xs text-blue-600 hover:underline">
              /recordatorio
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
