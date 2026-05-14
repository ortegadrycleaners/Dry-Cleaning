import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { customerSchema } from '@/lib/customerSchema';
import { generatePublicId } from '@/lib/utils';
import type { Order } from '@/types';
import type { Customer } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '@/context/OrdersContext';
import { searchCustomersByPhone, findCustomerByPhone } from '@/services/supabase/customersService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, Calendar } from 'lucide-react';
import { CustomerModal } from '@/components/CustomerModal';

type CustomerFormOutput = z.infer<typeof customerSchema>;
type CreatedOrderInfo = {
  publicId: string;
  orderNumber: string;
  customerName: string;
  trackingUrl: string;
};

export function NewOrderPage() {
  const navigate = useNavigate();
  const { orders, addOrder } = useOrders();
  const [orderId, setOrderId] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [createdOrderInfo, setCreatedOrderInfo] = useState<CreatedOrderInfo | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState<Customer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingOrderData, setPendingOrderData] = useState<CustomerFormOutput | null>(null);
  const [phone, setPhone] = useState('');
  const [lastName, setLastName] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // React Hook Form para datos de cliente
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(customerSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      phone: '',
      notes: '',
    },
  });

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    setSubmitError(null);
    setValue('phone', value, { shouldValidate: true });
    setShowSuggestions(true);
    setSelectedExistingCustomer(null);
    if (!value) {
      setValue('name', '');
      setLastName('');
      setCustomerSuggestions([]);
      return;
    }
    // Debounce la búsqueda 300ms para no saturar Supabase
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchCustomersByPhone(value).then(setCustomerSuggestions);
    }, 300);
  };

  const openNewCustomerModal = () => {
    setShowSuggestions(false);
    setSelectedExistingCustomer(null);
    setPendingOrderData({
      name: lastName,
      phone,
      notes: '',
      smsConsent: false,
    });
    setIsModalOpen(true);
  };

  const handleCustomerSelect = (customer: Customer) => {
    setPhone(customer.phone);
    setLastName(customer.lastName);
    setValue('phone', customer.phone);
    setValue('name', customer.lastName);
    setSelectedExistingCustomer(customer);
    setShowSuggestions(false);
  };

  const handleQuickDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setEstimatedDate(date.toISOString().split('T')[0]);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const normalizePhoneDigits = (value: string) => value.replace(/\D/g, '');
  const normalizeName = (value: string) => value.trim().toLowerCase();

  const validateOrderInputs = async (data: CustomerFormOutput): Promise<string | null> => {
    const trimmedOrderId = orderId.trim();
    if (!trimmedOrderId) return 'El número de orden es requerido.';
    if (!/^[0-9]+$/.test(trimmedOrderId)) {
      return 'El número de orden debe contener solo dígitos.';
    }

    if (orders.some((order) => order.orderNumber.trim() === trimmedOrderId)) {
      return `El número de orden ${trimmedOrderId} ya existe.`;
    }

    const phoneDigits = normalizePhoneDigits(data.phone);
    if (!phoneDigits) {
      return 'El teléfono no es válido.';
    }

    const existingCustomer = await findCustomerByPhone(phoneDigits);
    if (existingCustomer && normalizeName(existingCustomer.name) !== normalizeName(data.name)) {
      return `No se pudo insertar la orden porque el número ${existingCustomer.phone} ya está registrado en Customer Data Registration con ${existingCustomer.name}.`;
    }

    return null;
  };

  const createOrder = async (data: CustomerFormOutput): Promise<{ success: boolean; error?: string }> => {
    const validationError = await validateOrderInputs(data);
    if (validationError) {
      setSubmitError(validationError);
      return { success: false, error: validationError };
    }

    const createdAt = new Date().toISOString().split('T')[0];
    const localPublicId = generatePublicId(12);
    const newOrder: Order = {
      id: localPublicId,
      orderNumber: orderId.trim(),
      customerName: data.name,
      phone: data.phone,
      ...(data.notes ? { notes: data.notes } : {}),
      estimatedDate: formatDateDisplay(estimatedDate),
      status: 'RECIBIDO',
      createdAt,
    };

    const result = await addOrder(newOrder);
    if (!result.orderId) {
      const errorMessage = result.error ?? 'No se pudo crear la orden.';
      setSubmitError(errorMessage);
      return { success: false, error: errorMessage };
    }

    const actualPublicId = result.orderId;
    setCreatedOrderInfo({
      publicId: actualPublicId,
      orderNumber: orderId.trim(),
      customerName: data.name,
      trackingUrl: `/tracking/${actualPublicId}`,
    });
    return { success: true };
  };


  useEffect(() => {
    if (!createdOrderInfo) return;
    const timeoutId = window.setTimeout(() => {
      setCreatedOrderInfo(null);
      navigate('/dashboard');
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [createdOrderInfo, navigate]);

  // Detectar hash #consent para abrir el modal directamente
  useEffect(() => {
    if (window.location.hash === '#consent') {
      setIsModalOpen(true);
      setPendingOrderData({
        name: '',
        phone: '',
        notes: '',
        smsConsent: false,
      });
    }
  }, []);

  const handleCreatedOrderModalClose = () => {
    setCreatedOrderInfo(null);
    navigate('/dashboard');
  };

  const onSubmit = async (data: CustomerFormOutput) => {
    setSubmitError(null);
    if (!orderId.trim() || !estimatedDate) {
      setSubmitError('El número de orden y la fecha estimada son requeridos.');
      return;
    }

    if (selectedExistingCustomer) {
      const result = await createOrder(data);
      if (result.success) {
        setSelectedExistingCustomer(null);
      }
      return;
    }

    const validationError = await validateOrderInputs(data);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setPendingOrderData(data);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (modalData: CustomerFormOutput) => {
    const result = await createOrder(modalData);
    if (result.success) {
      setIsModalOpen(false);
      setPendingOrderData(null);
    }
    return result;
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Volver</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-4">
            <h1 className="text-2xl font-bold text-[#1B2A4A]">Nueva Orden</h1>
            <p className="text-sm text-gray-500">
              Ingresa los datos del cliente y la orden
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-6 p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-xs text-amber-800 font-medium">
                ⚠️ CONSENTIMIENTO REQUERIDO: Si el cliente es nuevo o cambias sus datos, deberá dar consentimiento explícito en el modal para registrar sus datos y recibir SMS. Si ya existe, se creará la orden sin pedir consentimiento nuevamente.
              </p>
            </div>
            {submitError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Order ID */}
              <div className="space-y-2">
                <Label htmlFor="orderId" className="text-sm font-medium text-gray-700">
                  ID de Orden
                </Label>
                <Input
                  id="orderId"
                  type="text"
                  placeholder="Ej. 1043"
                  value={orderId}
                  onChange={(e) => {
                    setOrderId(e.target.value);
                    setSubmitError(null);
                  }}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {/* Validación manual para orderId */}
                {!orderId.trim() && (
                  <p className="text-sm text-red-600">El ID de orden es requerido</p>
                )}
              </div>

              {/* Phone with Autocomplete Search */}
              <div className="space-y-2 relative">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                  Teléfono
                </Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(787) 555-XXXX"
                      {...register('phone')}
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                    />
                  </div>
                  <div className="w-full sm:w-[30%]">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!phone.trim()}
                      onClick={openNewCustomerModal}
                      className="h-11 w-full border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                    >
                      Nuevo cliente
                    </Button>
                  </div>
                </div>
                {errors.phone && (
                  <p className="text-sm text-red-600">{errors.phone.message as string}</p>
                )}
                {!errors.phone && !showSuggestions && phone && (
                  <p className="text-xs text-gray-500">✓ Teléfono válido</p>
                )}

                {/* Autocomplete Suggestions desde Supabase */}
                {showSuggestions && customerSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleCustomerSelect(customer)}
                        className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-sm font-medium text-[#1B2A4A]">
                          {customer.phone}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          — {customer.lastName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {showSuggestions && phone.length > 3 && customerSuggestions.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-3 space-y-3">
                    <p className="text-sm text-gray-500">No se encontraron clientes con ese número.</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openNewCustomerModal}
                      className="w-full px-3 py-2 text-sm font-medium text-[#C9A84C] hover:text-[#b89943] border border-[#C9A84C] hover:border-[#b89943] rounded transition-colors"
                    >
                      ✓ Registrar como nuevo cliente
                    </Button>
                  </div>
                )}
              </div>

              {/* Last Name */}
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                  Apellido
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Apellido del cliente"
                  {...register('name')}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    setValue('name', e.target.value);
                    setSubmitError(null);
                  }}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name.message as string}</p>
                )}
              </div>

              {/* Notas del pedido */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
                  Notas del Pedido
                </Label>
                <Input
                  id="notes"
                  type="text"
                  placeholder="Notas adicionales (opcional)"
                  {...register('notes')}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {errors.notes && (
                  <p className="text-sm text-red-600">{errors.notes.message as string}</p>
                )}
              </div>

              {/* Estimated Delivery Date */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">
                  Fecha Estimada de Entrega
                </Label>

                {/* Quick Select Buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickDate(1)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 1 día
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickDate(3)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 3 días
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickDate(5)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 5 días
                  </Button>
                </div>

                {/* Date Picker */}
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="date"
                    value={estimatedDate}
                    onChange={(e) => {
                      setEstimatedDate(e.target.value);
                      setSubmitError(null);
                    }}
                    className="pl-10 h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                  />
                </div>
                {estimatedDate && (
                  <p className="text-sm text-gray-500">
                    Fecha seleccionada: {formatDateDisplay(estimatedDate)}
                  </p>
                )}
                {/* Validación manual para fecha estimada */}
                {!estimatedDate && (
                  <p className="text-sm text-red-600">La fecha estimada es requerida</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 space-y-3">
                <Button
                  type="submit"
                  disabled={!orderId.trim() || !estimatedDate}
                  className="w-full h-12 bg-[#1B2A4A] hover:bg-[#2a3d66] text-white font-medium disabled:opacity-50 disabled:pointer-events-none"
                >
                  Crear Orden
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="w-full h-10 text-gray-500 hover:text-gray-700 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      {createdOrderInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[#1B2A4A]">Orden creada</h2>
            <p className="mt-2 text-sm text-gray-600">
              Orden #{createdOrderInfo.orderNumber} para {createdOrderInfo.customerName}.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              ID de seguimiento: <span className="font-medium text-gray-700">{createdOrderInfo.publicId}</span>
            </p>
            <a
              href={createdOrderInfo.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Abrir enlace de seguimiento
            </a>
            <p className="mt-3 text-xs text-gray-500">Este mensaje se cerrará en 3 segundos.</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={handleCreatedOrderModalClose}>
                Cerrar ahora
              </Button>
            </div>
          </div>
        </div>
      )}

      <CustomerModal
        isOpen={isModalOpen}
        initialData={pendingOrderData || undefined}
        onSubmit={handleModalSubmit}
        onClose={handleModalClose}
      />
    </div>
  );
}
