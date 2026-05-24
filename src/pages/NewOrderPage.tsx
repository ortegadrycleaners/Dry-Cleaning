import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { customerDraftSchema } from '@/lib/customerSchema';
import { generatePublicId } from '@/lib/utils';
import type { Order, Customer } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
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

type CustomerFormOutput = z.infer<typeof customerDraftSchema>;

export function NewOrderPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { orders, addOrder } = useOrders();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    resolver: zodResolver(customerDraftSchema),
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
    if (!trimmedOrderId) return t('newOrder.orderNumberRequired');
    if (!/^[0-9]+$/.test(trimmedOrderId)) {
      return t('newOrder.orderNumberDigits');
    }

    if (orders.some((order) => order.orderNumber.trim() === trimmedOrderId)) {
      return t('newOrder.orderAlreadyExists', { orderNumber: trimmedOrderId });
    }

    const phoneDigits = normalizePhoneDigits(data.phone);
    if (!phoneDigits) {
      return t('newOrder.phoneInvalid');
    }

    const existingCustomer = await findCustomerByPhone(phoneDigits);
    if (existingCustomer && normalizeName(existingCustomer.name) !== normalizeName(data.name)) {
      return t('newOrder.orderPhoneMismatch', {
        phone: existingCustomer.phone,
        customerName: existingCustomer.name,
      });
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
      const errorMessage = result.error ?? t('newOrder.orderCreateError');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhoneChange = (value: string) => {
    customerSearch.setPhone(value);
    setSubmitError(null);
    setValue('phone', value, { shouldValidate: true });
  };

  const handleCustomerSelect = (customer: Customer) => {
    customerSearch.selectCustomer(customer);
    setValue('phone', customer.phone);
    setValue('name', customer.lastName);
    setCustomerName(customer.lastName || '');
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
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (!orderForm.orderId.trim() || !orderForm.estimatedDate) {
        setSubmitError(t('newOrder.orderAndDateRequired'));
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalSubmit = async (modalData: CustomerFormOutput) => {
    const result = await createCustomer({ name: modalData.name, phone: modalData.phone });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    setCustomerName(modalData.name);
    customerSearch.selectCustomer({ phone: modalData.phone, lastName: modalData.name });
    setValue('name', modalData.name);
    setValue('phone', modalData.phone);
    wizard.closeModal();
    setSubmitError(null);

    return { success: true };
  };

  const handleModalClose = () => {
    wizard.closeModal();
  };

  const getDateValue = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return orderForm.formatDateInputValue(date);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header (Zivo dark) */}
      <header className="bg-[#0E0E1A] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/svg/zivo-wordmark-white.svg" alt="zivo" className="h-6 sm:h-8 w-auto" />
              <div className="hidden sm:flex items-center ml-3 text-sm text-[#FAFAFC]/90">
                Estás en <span className="ml-2 font-semibold text-white">Ortega Dry Cleaners</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-sm text-[#FAFAFC]/90 hover:text-white flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline"> Volver al dashboard</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-4">
            <h1 className="text-2xl font-bold text-[#1B2A4A]">{t('newOrder.title')}</h1>
            <p className="text-sm text-gray-500">
              {t('newOrder.subtitle')}
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
                  {t('common.orderId')}
                </Label>
                <Input
                  id="orderId"
                  type="text"
                  placeholder={t('common.orderId') + ' • ' + t('newOrder.orderNumberDigits')}
                  value={orderForm.orderId}
                  onChange={(e) => {
                    orderForm.setOrderId(e.target.value);
                    setSubmitError(null);
                  }}
                  className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
                />
                {/* Validación manual para orderId */}
                {!orderForm.orderId.trim() && (
                  <p className="text-sm text-red-600">{t('newOrder.orderIdRequired')}</p>
                )}
              </div>

              {/* Last Name */}
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                  {t('newOrder.lastName')}
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder={t('newOrder.lastNamePlaceholder')}
                  {...register('name')}
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setValue('name', e.target.value);
                    setSubmitError(null);
                  }}
                  className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name.message as string}</p>
                )}
              </div>

              {/* Phone with Autocomplete Search */}
              <div className="space-y-2 relative">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                  {t('common.phone')}<span className="text-red-500 ml-1">*</span>
                </Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      id="phone"
                      type="tel"
                      placeholder={t('newOrder.phonePlaceholder')}
                      {...register('phone')}
                      value={customerSearch.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onFocus={() => customerSearch.setPhone(customerSearch.phone)}
                      onBlur={() => setTimeout(() => {}, 200)}
                      className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
                    />
                  </div>
                  <div className="w-full sm:w-[30%]">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!customerSearch.phone.trim()}
                      onClick={openNewCustomerModal}
                      className="h-11 w-full border-gray-200 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]"
                    >
                      {t('newOrder.addNewCustomer')}
                    </Button>
                  </div>
                </div>
                {errors.phone && (
                  <p className="text-sm text-red-600">{errors.phone.message as string}</p>
                )}
                {!errors.phone && !customerSearch.showSuggestions && customerSearch.phone && (
                  <p className="text-xs text-gray-500">{t('newOrder.validPhoneHint')}</p>
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
                        {t('newOrder.consentRequiredWarning')}
                      </p>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-lg space-y-3">
                      <p className="text-sm text-gray-500">{t('newOrder.noCustomersFound')}</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openNewCustomerModal}
                          className="w-full px-3 py-2 text-sm font-medium text-[#3B4BFF] hover:text-[#2F3DE6] border border-[#3B4BFF] hover:bg-[#EEF2FF] hover:border-[#2F3DE6] rounded transition-colors"
                        >
                        {t('newOrder.addNewCustomer')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notas del pedido */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">
                  {t('newOrder.notesTitle')}
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
                    {t('newOrder.notesOptional')}
                  </Label>
                  <Input
                    id="notes"
                    type="text"
                    placeholder={t('newOrder.notesPlaceholder')}
                    {...register('notes')}
                    className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
                  />
                  {errors.notes && (
                    <p className="text-sm text-red-600">{errors.notes.message as string}</p>
                  )}
                </div>
              </div>

              {/* Estimated Delivery Date */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">
                  {t('common.estimatedDate')}
                </Label>

                {/* Quick Select Buttons */}
                <div className="flex gap-2">
                  {(() => {
                    const d1 = getDateValue(1);
                    const d3 = getDateValue(3);
                    const d5 = getDateValue(5);
                    const sel1 = orderForm.estimatedDate === d1;
                    const sel3 = orderForm.estimatedDate === d3;
                    const sel5 = orderForm.estimatedDate === d5;

                    return (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => orderForm.handleQuickDate(1)}
                          className={
                            sel1
                              ? 'flex-1 h-10 bg-[#3B4BFF] text-white'
                              : 'flex-1 h-10 border-gray-200 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]'
                          }
                        >
                          {t('newOrder.quickDate1')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => orderForm.handleQuickDate(3)}
                          className={
                            sel3
                              ? 'flex-1 h-10 bg-[#3B4BFF] text-white'
                              : 'flex-1 h-10 border-gray-200 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]'
                          }
                        >
                          {t('newOrder.quickDate3')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => orderForm.handleQuickDate(5)}
                          className={
                            sel5
                              ? 'flex-1 h-10 bg-[#3B4BFF] text-white'
                              : 'flex-1 h-10 border-gray-200 hover:bg-[#EEF2FF] hover:border-[#3B4BFF]'
                          }
                        >
                          {t('newOrder.quickDate5')}
                        </Button>
                      </>
                    );
                  })()}
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
                    className="pl-10 h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
                  />
                </div>
                {orderForm.estimatedDate && (
                  <p className="text-sm text-gray-500">
                    {t('newOrder.selectedDate', { selectedDate: orderForm.formatDateDisplay(orderForm.estimatedDate) })}
                  </p>
                )}
                {/* Validación manual para fecha estimada */}
                {!orderForm.estimatedDate && (
                  <p className="text-sm text-red-600">{t('newOrder.orderAndDateRequired')}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 space-y-3">
                <Button
                  type="submit"
                  disabled={isSubmitting || !orderForm.orderId.trim() || !orderForm.estimatedDate}
                  className="w-full h-12 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white font-medium disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSubmitting ? t('newOrder.creatingOrder') : t('newOrder.createOrder')}
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="w-full h-10 text-gray-500 hover:text-gray-700 text-sm"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      {createdOrderInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[#1B2A4A]">{t('newOrder.orderCreatedTitle')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('newOrder.orderCreatedMessage', {
                orderNumber: createdOrderInfo.orderNumber,
                customerName: createdOrderInfo.customerName,
              })}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t('newOrder.orderCreatedTracking', {
                trackingUrl: createdOrderInfo.trackingUrl,
              })}
            </p>
            <a
              href={createdOrderInfo.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              {t('tracking.writeReview')}
            </a>
            <p className="mt-3 text-xs text-gray-500">{t('newOrder.orderCreatedAutoClose')}</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={handleCreatedOrderModalClose}>
                {t('newOrder.closeNow')}
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
