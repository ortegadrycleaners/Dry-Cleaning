import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/* eslint-disable react-refresh/only-export-components */
export type Locale = 'es' | 'en';
export const SUPPORTED_LOCALES: Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

export const translations: Record<Locale, Record<string, string>> = {
  es: {
    'app.loading': 'Cargando…',
    'common.email': 'Email',
    'common.password': 'Contraseña',
    'common.close': 'Cerrar',
    'common.back': 'Volver',
    'common.cancel': 'Cancelar',
    'common.confirm': 'Confirmar',
    'common.newCustomer': 'Nuevo cliente',
    'common.order': 'Orden',
    'common.phone': 'Teléfono',
    'common.client': 'Cliente',
    'common.estimatedDate': 'Fecha estimada',
    'common.orderId': 'ID de Orden',
    'common.created': 'Creada',
    'common.notifications': 'Notificaciones',
    'common.markAllAsRead': 'Leer todo',
    'common.orderNumber': 'Nº orden',
    'common.thankYou': '¡Gracias!',
    'login.title': 'Ortega Dry Cleaners',
    'login.subtitle': 'Sistema de Gestión de Órdenes',
    'login.emailPlaceholder': 'usuario@ejemplo.com',
    'login.passwordPlaceholder': 'Ingresa tu contraseña',
    'login.submit': 'Entrar',
    'login.missingCredentials': 'Por favor ingresa email y contraseña',
    'login.invalidCredentials': 'Email o contraseña incorrectos',
    'login.emailNotConfirmed': 'Debes confirmar tu email antes de ingresar',
    'login.tooManyRequests': 'Demasiados intentos. Espera unos minutos',
    'login.genericError': 'Ocurrió un error al iniciar sesión',
    'tracking.receivedTitle': 'Tu orden ha sido recibida',
    'tracking.receivedMessage': 'Estamos preparando tu orden. Te enviaremos un SMS cuando esté lista para recoger',
    'tracking.processingTitle': 'Tu orden está en proceso',
    'tracking.processingMessage': 'Fecha estimada: {estimatedDate}',
    'tracking.readyTitle': '¡Tu orden está lista para retirar!',
    'tracking.readyPickupMessage': 'Puedes pasar a recogerla cuando gustes',
    'tracking.readyReminder': '⭐️ Después de recogerla, te invitaremos a contarnos cómo lo hicimos.',
    'tracking.reminderTitle': 'Tu orden lleva {daysReady} días lista esperándote',
    'tracking.reminderNote': 'Recuerda que puedes pasar en nuestro horario de atención',
    'tracking.deliveredTitle': 'Orden entregada',
    'tracking.deliveredMessage': 'Esta orden ya fue recogida.',
    'tracking.deliveredThanks': '¡Gracias por tu preferencia!',
    'tracking.abandonedTitle': 'Orden marcada como abandonada',
    'tracking.abandonedMessage': 'Si ya recogiste tu orden, contáctanos para actualizar el estado.',
    'tracking.writeReview': 'Escribir review en Google',
    'tracking.orderNotFound': 'Orden no encontrada.',
    'tracking.loadingStatus': 'Cargando estado de la orden…',
    'tracking.statusSection': 'Estado de tu orden',
    'tracking.pageTitle': 'Seguimiento',
    'tracking.header.branch': 'Estás en {branchName}',
    'tracking.footer.hostedBy': 'Alojado por',
    'tracking.orderLabel': 'Orden #{orderNumber}',
    'tracking.orderWithClient': 'Orden #{orderNumber} | Cliente: {customerName}',
    'tracking.hero.title': 'Mucho más que limpieza. Cuidamos lo que más valoras.',
    'tracking.hero.subtitle': 'Descubre todos nuestros servicios.',
    'tracking.status.received': 'Recibido',
    'tracking.status.processing': 'En Proceso',
    'tracking.status.ready': 'Listo',
    'tracking.status.delivered': 'Entregado',
    'tracking.status.abandoned': 'Abandonado',
    'tracking.section.location': 'Ubicación en tienda',
    'tracking.section.locationValue': 'Rack #{rackNumber}',
    'brand.addressTitle': 'Dirección',
    'brand.hoursTitle': 'Horario de Atención',
    'brand.phoneTitle': 'Teléfono',
    'promotions.title': 'Promociones',
    'tracking.section.phone': 'Teléfono',
    'tracking.section.client': 'Cliente',
    'tracking.section.order': 'Orden',
    'tracking.noOrders': 'No encontramos la orden solicitada.',
    'newOrder.title': 'Nueva Orden',
    'newOrder.subtitle': 'Ingresa los datos del cliente y la orden',
    'newOrder.orderIdRequired': 'El ID de orden es requerido',
    'newOrder.orderNumberRequired': 'El número de orden es requerido.',
    'newOrder.orderNumberDigits': 'El número de orden debe contener solo dígitos.',
    'newOrder.orderAlreadyExists': 'El número de orden {orderNumber} ya existe.',
    'newOrder.phoneInvalid': 'El teléfono no es válido.',
    'newOrder.orderPhoneMismatch': 'No se pudo insertar la orden porque el número {phone} ya está registrado con {customerName}.',
    'newOrder.orderCreateError': 'No se pudo crear la orden.',
    'newOrder.orderAndDateRequired': 'El número de orden y la fecha estimada son requeridos.',
    'newOrder.lastName': 'Apellido',
    'newOrder.lastNamePlaceholder': 'Apellido del cliente',
    'newOrder.phonePlaceholder': '(787) 555-XXXX',
    'newOrder.addNewCustomer': 'Nuevo cliente',
    'newOrder.validPhoneHint': '✓ Teléfono válido',
    'newOrder.consentRequiredWarning': '⚠️ CONSENTIMIENTO REQUERIDO: Si el cliente es nuevo o cambias sus datos, deberá dar consentimiento explícito en el modal para registrar sus datos y recibir SMS. Si ya existe, se creará la orden sin pedir consentimiento nuevamente.',
    'newOrder.notesTitle': 'Notas del Pedido',
    'newOrder.notesPlaceholder': 'Descripción libre',
    'newOrder.notesOptional': 'Otra nota (opcional)',
    'newOrder.selectedDate': 'Fecha seleccionada: {selectedDate}',
    'newOrder.quickDate1': '+ 1 día',
    'newOrder.quickDate3': '+ 3 días',
    'newOrder.quickDate5': '+ 5 días',
    'newOrder.createOrder': 'Crear Orden',
    'newOrder.cancel': 'Cancelar',
    'newOrder.orderCreatedTitle': 'Orden creada',
    'newOrder.orderCreatedMessage': 'Orden #{orderNumber} para {customerName}.',
    'newOrder.orderCreatedTracking': 'Usa este enlace para seguimiento: {trackingUrl}',
    'newOrder.orderCreatedAutoClose': 'Este mensaje se cerrará en 3 segundos.',
    'newOrder.closeNow': 'Cerrar ahora',
    'newOrder.noCustomersFound': 'No se encontraron clientes con ese número.',
    'notFound.title': '404',
    'notFound.message': 'No encontramos la orden solicitada.',
    'notFound.returnHome': 'Volver al inicio',
    'notifications.noItems': 'No hay notificaciones aún',
    'notifications.noItemsSub': 'Las notificaciones aparecerán aquí al crear o actualizar órdenes',
    'notifications.markAsRead': 'Leer todo',
    'notifications.sent': 'Enviado',
    'notifications.failed': 'Fallido',
    'notifications.pending': 'Pendiente',
    'notifications.footer': '{count} notificación{plural} · Cada enlace incluye token de seguridad único',
    'notifications.order': 'Orden #{orderNumber} — {customerName}',
    'notifications.channelLabel': '{channel}',
    'notifications.status.sent': 'Enviado',
    'notifications.status.failed': 'Fallido',
    'notifications.status.pending': 'Pendiente',
    'notifications.type.confirmation': 'Confirmación',
    'notifications.type.received': 'Recibida',
    'notifications.type.delayed': 'Atrasada',
    'notifications.type.thankYou': 'Gracias',
    'notifications.type.ready': 'Lista',
    'notifications.type.reminder': 'Recordatorio',
    'notifications.type.urgent': 'Urgente',
    'brand.hoursValue': 'Lunes a Viernes 8am - 6pm | Sábados 10am - 5pm',
    'promotions.0.title': '20% en tu primera orden',
    'promotions.0.description': 'Trae este cupón y recibe un descuento especial en tu primer servicio.',
    'promotions.0.code': 'BIENVENIDO20',
    'promotions.1.title': 'Programa de Fidelidad',
    'promotions.1.description': 'Acumula 5 órdenes y la 6ta tiene un 15% de descuento automático.',
    'promotions.2.title': 'Servicio Express',
    'promotions.2.description': 'Entrega en 24 horas disponible por un cargo adicional. Consulta en mostrador.',
    'error.title': '⚠️ Error',
    'error.unexpected': 'Se produjo un error inesperado en la aplicación.',
    'error.console': 'Por favor, verifica la consola del navegador (F12) para más detalles.',
    'error.reload': 'Recargar Página',
    'requireAuth.loading': 'Cargando…',
    'customerModal.title': 'Customer Data Registration',
    'customerModal.description': 'Please provide your information. Explicit consent is required to proceed.',
    'customerModal.fullName': 'Full Name',
    'customerModal.fullNamePlaceholder': 'John Garcia',
    'customerModal.phoneNumber': 'Phone Number',
    'customerModal.phoneNumberPlaceholder': '(787) 555-1234',
    'customerModal.consentTitle': 'Explicit Consent (Required)',
    'customerModal.consentDescription': 'By checking this box, I confirm that I give explicit consent for my personal data to be registered and used exclusively to manage this order and send me SMS notifications about the status of my order.',
    'customerModal.consentCheckbox': 'I accept and authorize the registration of my data and SMS notifications',
    'customerModal.processing': 'Processing...',
    'customerModal.submit': 'Confirm and Register',
    'customerModal.successTitle': 'Data Registered!',
    'customerModal.successText': 'Thank you for your consent. Your data has been registered and you will receive SMS notifications about your order status.',
    'customerModal.close': 'Close',
  },
  en: {
    'app.loading': 'Loading…',
    'common.email': 'Email',
    'common.password': 'Password',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.newCustomer': 'New customer',
    'common.order': 'Order',
    'common.phone': 'Phone',
    'common.client': 'Customer',
    'common.estimatedDate': 'Estimated date',
    'common.orderId': 'Order ID',
    'common.created': 'Created',
    'common.notifications': 'Notifications',
    'common.markAllAsRead': 'Mark all read',
    'common.orderNumber': 'Order #',
    'common.thankYou': 'Thank you!',
    'login.title': 'Ortega Dry Cleaners',
    'login.subtitle': 'Order Management System',
    'login.emailPlaceholder': 'user@example.com',
    'login.passwordPlaceholder': 'Enter your password',
    'login.submit': 'Log in',
    'login.missingCredentials': 'Please enter email and password',
    'login.invalidCredentials': 'Email or password is incorrect',
    'login.emailNotConfirmed': 'You must confirm your email before signing in',
    'login.tooManyRequests': 'Too many attempts. Wait a few minutes',
    'login.genericError': 'Something went wrong while signing in',
    'tracking.receivedTitle': 'Your order has been received',
    'tracking.receivedMessage': 'We are preparing your order. We will send an SMS when it is ready for pickup',
    'tracking.processingTitle': 'Your order is in process',
    'tracking.processingMessage': 'Estimated date: {estimatedDate}',
    'tracking.readyTitle': 'Your order is ready for pickup!',
    'tracking.readyPickupMessage': 'You can pick it up at your convenience',
    'tracking.readyReminder': '⭐️ After pickup, we will invite you to tell us how we did.',
    'tracking.reminderTitle': 'Your order has been ready for {daysReady} days',
    'tracking.reminderNote': 'Remember you can come during our opening hours',
    'tracking.deliveredTitle': 'Order delivered',
    'tracking.deliveredMessage': 'This order has already been picked up.',
    'tracking.deliveredThanks': 'Thanks for choosing us!',
    'tracking.abandonedTitle': 'Order marked as abandoned',
    'tracking.abandonedMessage': 'If you already picked up your order, please contact us to update the status.',
    'tracking.writeReview': 'Write a Google review',
    'tracking.orderNotFound': 'Order not found.',
    'tracking.loadingStatus': 'Loading order status…',
    'tracking.statusSection': 'Order status',
    'tracking.pageTitle': 'Tracking',
    'tracking.header.branch': 'You are at {branchName}',
    'tracking.footer.hostedBy': 'Hosted by',
    'tracking.orderLabel': 'Order #{orderNumber}',
    'tracking.orderWithClient': 'Order #{orderNumber} | Customer: {customerName}',
    'tracking.hero.title': 'More than cleaning. We care for what matters most.',
    'tracking.hero.subtitle': 'Discover all our services.',
    'tracking.status.received': 'Received',
    'tracking.status.processing': 'In Process',
    'tracking.status.ready': 'Ready',
    'tracking.status.delivered': 'Delivered',
    'tracking.status.abandoned': 'Abandoned',
    'tracking.section.location': 'Store location',
    'tracking.section.locationValue': 'Rack #{rackNumber}',
    'brand.addressTitle': 'Address',
    'brand.hoursTitle': 'Opening hours',
    'brand.phoneTitle': 'Phone',
    'promotions.title': 'Promotions',
    'tracking.section.phone': 'Phone',
    'tracking.section.client': 'Customer',
    'tracking.section.order': 'Order',
    'tracking.noOrders': 'We could not find the requested order.',
    'newOrder.title': 'New Order',
    'newOrder.subtitle': 'Enter the customer and order details',
    'newOrder.orderIdRequired': 'Order ID is required',
    'newOrder.orderNumberRequired': 'Order number is required.',
    'newOrder.orderNumberDigits': 'Order number must contain only digits.',
    'newOrder.orderAlreadyExists': 'Order number {orderNumber} already exists.',
    'newOrder.phoneInvalid': 'The phone number is not valid.',
    'newOrder.orderPhoneMismatch': 'Could not insert order because number {phone} is already registered with {customerName}.',
    'newOrder.orderCreateError': 'Unable to create the order.',
    'newOrder.orderAndDateRequired': 'Order number and estimated date are required.',
    'newOrder.lastName': 'Last Name',
    'newOrder.lastNamePlaceholder': 'Customer last name',
    'newOrder.phonePlaceholder': '(787) 555-XXXX',
    'newOrder.addNewCustomer': 'New customer',
    'newOrder.validPhoneHint': '✓ Valid phone',
    'newOrder.consentRequiredWarning': '⚠️ CONSENT REQUIRED: If the customer is new or you change their details, explicit consent is required in the modal to register their data and receive SMS. If the customer already exists, the order is created without requiring consent again.',
    'newOrder.notesTitle': 'Order Notes',
    'newOrder.notesPlaceholder': 'Free-form description',
    'newOrder.notesOptional': 'Additional note (optional)',
    'newOrder.selectedDate': 'Selected date: {selectedDate}',
    'newOrder.quickDate1': '+ 1 day',
    'newOrder.quickDate3': '+ 3 days',
    'newOrder.quickDate5': '+ 5 days',
    'newOrder.createOrder': 'Create Order',
    'newOrder.cancel': 'Cancel',
    'newOrder.orderCreatedTitle': 'Order created',
    'newOrder.orderCreatedMessage': 'Order #{orderNumber} for {customerName}.',
    'newOrder.orderCreatedTracking': 'Use this link to track: {trackingUrl}',
    'newOrder.orderCreatedAutoClose': 'This message will close in 3 seconds.',
    'newOrder.closeNow': 'Close now',
    'newOrder.noCustomersFound': 'No customers were found with that number.',
    'notFound.title': '404',
    'notFound.message': 'We could not find the requested order.',
    'notFound.returnHome': 'Return to home',
    'notifications.noItems': 'No notifications yet',
    'notifications.noItemsSub': 'Notifications will appear here when orders are created or updated',
    'notifications.markAsRead': 'Mark all read',
    'notifications.sent': 'Sent',
    'notifications.failed': 'Failed',
    'notifications.pending': 'Pending',
    'notifications.footer': '{count} notification{plural} · Every link includes a unique security token',
    'notifications.order': 'Order #{orderNumber} — {customerName}',
    'notifications.channelLabel': '{channel}',
    'notifications.status.sent': 'Sent',
    'notifications.status.failed': 'Failed',
    'notifications.status.pending': 'Pending',
    'notifications.type.confirmation': 'Confirmation',
    'notifications.type.received': 'Received',
    'notifications.type.delayed': 'Delayed',
    'notifications.type.thankYou': 'Thank you',
    'notifications.type.ready': 'Ready',
    'notifications.type.reminder': 'Reminder',
    'notifications.type.urgent': 'Urgent',
    'brand.hoursValue': 'Mon - Fri 8am - 6pm | Sat 10am - 5pm',
    'promotions.0.title': '20% off your first order',
    'promotions.0.description': 'Bring this coupon and get a special discount on your first service.',
    'promotions.0.code': 'WELCOME20',
    'promotions.1.title': 'Loyalty Program',
    'promotions.1.description': 'Accumulate 5 orders and the 6th gets an automatic 15% discount.',
    'promotions.2.title': 'Express Service',
    'promotions.2.description': '24-hour delivery available for an additional fee. Ask at the counter.',
    'error.title': '⚠️ Error',
    'error.unexpected': 'An unexpected error occurred in the application.',
    'error.console': 'Please check the browser console (F12) for more details.',
    'error.reload': 'Reload Page',
    'requireAuth.loading': 'Loading…',
    'customerModal.title': 'Customer Data Registration',
    'customerModal.description': 'Please provide your information. Explicit consent is required to proceed.',
    'customerModal.fullName': 'Full Name',
    'customerModal.fullNamePlaceholder': 'John Garcia',
    'customerModal.phoneNumber': 'Phone Number',
    'customerModal.phoneNumberPlaceholder': '(787) 555-1234',
    'customerModal.consentTitle': 'Explicit Consent (Required)',
    'customerModal.consentDescription': 'By checking this box, I confirm that I give explicit consent for my personal data to be registered and used exclusively to manage this order and send me SMS notifications about the status of my order.',
    'customerModal.consentCheckbox': 'I accept and authorize the registration of my data and SMS notifications',
    'customerModal.processing': 'Processing...',
    'customerModal.submit': 'Confirm and Register',
    'customerModal.successTitle': 'Data Registered!',
    'customerModal.successText': 'Thank you for your consent. Your data has been registered and you will receive SMS notifications about your order status.',
    'customerModal.close': 'Close',
  },
};

function normalizeLocale(value: string | undefined): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('en')) return 'en';
  return undefined;
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
    (navigator.language || '').split('-')[0],
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }

  return DEFAULT_LOCALE;
}

export function formatDate(value: string | Date, locale: Locale = detectBrowserLocale(), options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const resolvedLocale = locale === 'es' ? 'es-ES' : 'en-US';
  return date.toLocaleDateString(resolvedLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function orderStatusLabel(status: string, locale: Locale = detectBrowserLocale()): string {
  const mapping: Record<string, Record<Locale, string>> = {
    RECIBIDO: { es: 'Recibido', en: 'Received' },
    'EN PROCESO': { es: 'En Proceso', en: 'In Process' },
    LISTO: { es: 'Listo', en: 'Ready' },
    ENTREGADO: { es: 'Entregado', en: 'Delivered' },
    ABANDONADO: { es: 'Abandonado', en: 'Abandoned' },
  };

  return mapping[status]?.[locale] ?? status;
}

export function timeAgo(value: string, locale: Locale = detectBrowserLocale()): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return locale === 'es' ? 'Ahora' : 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    text,
  );
}

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  translateOrderStatus: (status: string) => string;
  timeAgo: (value: string) => string;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('locale') ?? undefined : undefined;
      const normalized = normalizeLocale(stored as string | undefined);
      return normalized ?? detectBrowserLocale();
    } catch {
      return detectBrowserLocale();
    }
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('locale', locale);
    } catch {
      // Silently ignore localStorage errors (e.g., private mode, quota exceeded, etc.)
    }
  }, [locale]);

  const contextValue = useMemo<I18nContextType>(() => ({
    locale,
    setLocale,
    t: (key: string, vars?: Record<string, string | number>) => {
      const message = translations[locale][key] ?? translations[DEFAULT_LOCALE][key] ?? key;
      return interpolate(message, vars);
    },
    formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => formatDate(value, locale, options),
    translateOrderStatus: (status: string) => orderStatusLabel(status, locale),
    timeAgo: (value: string) => timeAgo(value, locale),
  }), [locale]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
