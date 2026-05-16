import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { customerSchema } from '@/lib/customerSchema';
import { generatePublicId } from '@/lib/utils';
import type { Order } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '@/context/OrdersContext';
import { findCustomerByPhone, createCustomer } from '@/services/supabase/customersService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, Calendar } from 'lucide-react';
import { CustomerModal } from '@/components/CustomerModal';
import { useCustomerSearch } from '@/hooks/useCustomerSearch';
import { useOrderForm } from '@/hooks/useOrderForm';
import { useCustomerWizard } from '@/hooks/useCustomerWizard';

type CustomerFormOutput = z.infer<typeof customerSchema>;

export function NewOrderPage() {
  const navigate = useNavigate();
  const { orders, addOrder } = useOrders();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderInfo, setCreatedOrderInfo] = useState<{ publicId: string; orderNumber: string; customerName: string; trackingUrl: string } | null>(null);

  // Custom hooks for separated concerns
  const customerSearch = useCustomerSearch();
  const orderForm = useOrderForm();
  const wizard = useCustomerWizard();
  const [customerName, setCustomerName] = useState('');

  // React Hook Form para validación de cliente
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

  const normalizePhoneDigits = (value: string) => value.replace(/\D/g, '');
  const normalizeName = (value: string) => value.trim().toLowerCase();

  const validateOrderInputs = async (data: CustomerFormOutput): Promise<string | null> => {
    const trimmedOrderId = orderForm.orderId.trim();
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
    const selectedNotesString = orderForm.selectedNotes.join(', ');
    const combinedNotes = [selectedNotesString, data.notes?.trim()]
      .filter(Boolean)
      .join(selectedNotesString && data.notes ? ', ' : '');

    const newOrder: Order = {
      id: crypto.randomUUID(),
      publicId: localPublicId,
      orderNumber: orderForm.orderId.trim(),
      customerName: data.name,
      phone: data.phone,
      ...(combinedNotes ? { notes: combinedNotes } : {}),
      estimatedDate: orderForm.formatDateDisplay(orderForm.estimatedDate),
      status: 'RECIBIDO',
      createdAt,
    };

    const result = await addOrder(newOrder);
    if (!result.orderId) {
      const errorMessage = result.error ?? 'No se pudo crear la orden.';
      setSubmitError(errorMessage);
      return { success: false, error: errorMessage };
    }

    const actualPublicId = result.publicId ?? localPublicId;
    setCreatedOrderInfo({
      publicId: actualPublicId,
      orderNumber: orderForm.orderId.trim(),
      customerName: data.name,
      trackingUrl: `/tracking/${actualPublicId}`,
    });
    orderForm.clearForm();
    return { success: true };
  };


  // Success screen timeout
  useEffect(() => {
    if (!createdOrderInfo) return;
    const timeoutId = window.setTimeout(() => {
      setCreatedOrderInfo(null);
      navigate('/dashboard');
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [createdOrderInfo, navigate]);

  // Detect hash #consent to open modal directly
  useEffect(() => {
    if (window.location.hash === '#consent') {
      wizard.openModal({ name: '', phone: '', notes: '', smsConsent: false });
    }
  }, []);

  const handlePhoneChange = (value: string) => {
    customerSearch.setPhone(value);
    setSubmitError(null);
    setValue('phone', value, { shouldValidate: true });
  };

  const handleCustomerSelect = (customer: any) => {
    customerSearch.selectCustomer(customer);
    setValue('phone', customer.phone);
    setValue('name', customer.lastName);
  };

  const openNewCustomerModal = () => {
    wizard.openModal({
      name: customerName,
      phone: customerSearch.phone,
      notes: '',
      smsConsent: false,
    });
  };

  const handleCreatedOrderModalClose = () => {
    setCreatedOrderInfo(null);
    navigate('/dashboard');
  };

  const onSubmit = async (data: CustomerFormOutput) => {
    setSubmitError(null);
    if (!orderForm.orderId.trim() || !orderForm.estimatedDate) {
      setSubmitError('El número de orden y la fecha estimada son requeridos.');
      return;
    }

    if (customerSearch.selectedCustomer) {
      const result = await createOrder(data);
      if (result.success) {
        customerSearch.clearSearch();
      }
      return;
    }

    const validationError = await validateOrderInputs(data);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    wizard.openModal(data);
  };

  const handleModalSubmit = async (modalData: CustomerFormOutput) => {
    const result = await createCustomer({ name: modalData.name, phone: modalData.phone });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    setCustomerName(modalData.name);
    customerSearch.selectCustomer({ phone: modalData.phone, lastName: modalData.name, name: modalData.name });
    setValue('name', modalData.name);
    setValue('phone', modalData.phone);
    wizard.closeModal();
    setSubmitError(null);

    return { success: true };
  };

  const handleModalClose = () => {
    wizard.closeModal();
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
                  value={orderForm.orderId}
                  onChange={(e) => {
                    orderForm.setOrderId(e.target.value);
                    setSubmitError(null);
                  }}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {/* Validación manual para orderId */}
                {!orderForm.orderId.trim() && (
                  <p className="text-sm text-red-600">El ID de orden es requerido</p>
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
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setValue('name', e.target.value);
                    setSubmitError(null);
                  }}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name.message as string}</p>
                )}
              </div>

              {/* Phone with Autocomplete Search */}
              <div className="space-y-2 relative">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                  Teléfono<span className="text-red-500 ml-1">*</span>
                </Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(787) 555-XXXX"
                      {...register('phone')}
                      value={customerSearch.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onFocus={() => customerSearch.setPhone(customerSearch.phone)}
                      onBlur={() => setTimeout(() => {}, 200)}
                      className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                    />
                  </div>
                  <div className="w-full sm:w-[30%]">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!customerSearch.phone.trim()}
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
                {!errors.phone && !customerSearch.showSuggestions && customerSearch.phone && (
                  <p className="text-xs text-gray-500">✓ Teléfono válido</p>
                )}

                {/* Autocomplete Suggestions desde Supabase */}
                {customerSearch.showSuggestions && customerSearch.suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {customerSearch.suggestions.map((customer, index) => (
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
                {customerSearch.showSuggestions && customerSearch.phone.length > 3 && customerSearch.suggestions.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 space-y-3">
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-800">
                        ⚠️ CONSENTIMIENTO REQUERIDO: Si el cliente es nuevo o cambias sus datos, deberá dar consentimiento explícito en el modal para registrar sus datos y recibir SMS. Si ya existe, se creará la orden sin pedir consentimiento nuevamente.
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-lg space-y-3">
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
                  </div>
                )}
              </div>

              {/* Notas del pedido */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">
                  Notas del Pedido
                </Label>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                  {orderForm.presetNotes.map((note) => {
                    const Icon = note.icon;
                    const selected = orderForm.selectedNotes.includes(note.label);
                    return (
                      <button
                        key={note.label}
                        type="button"
                        onClick={() => orderForm.togglePresetNote(note.label)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all ${
                          selected ? note.selectedClasses : note.unselectedClasses
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {note.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
                    Otra nota (opcional)
                  </Label>
                  <Input
                    id="notes"
                    type="text"
                    placeholder="Descripción libre"
                    {...register('notes')}
                    className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                  />
                  {errors.notes && (
                    <p className="text-sm text-red-600">{errors.notes.message as string}</p>
                  )}
                </div>
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
                    onClick={() => orderForm.handleQuickDate(1)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 1 día
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => orderForm.handleQuickDate(3)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 3 días
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => orderForm.handleQuickDate(5)}
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
                    value={orderForm.estimatedDate}
                    onChange={(e) => {
                      orderForm.setEstimatedDate(e.target.value);
                      setSubmitError(null);
                    }}
                    className="pl-10 h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                  />
                </div>
                {orderForm.estimatedDate && (
                  <p className="text-sm text-gray-500">
                    Fecha seleccionada: {orderForm.formatDateDisplay(orderForm.estimatedDate)}
                  </p>
                )}
                {/* Validación manual para fecha estimada */}
                {!orderForm.estimatedDate && (
                  <p className="text-sm text-red-600">La fecha estimada es requerida</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 space-y-3">
                <Button
                  type="submit"
                  disabled={!orderForm.orderId.trim() || !orderForm.estimatedDate}
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
        isOpen={wizard.isModalOpen}
        initialData={wizard.pendingCustomerData || undefined}
        onSubmit={handleModalSubmit}
        onClose={handleModalClose}
      />
    </div>
  );
}
