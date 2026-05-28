/**
 * Punto de entrada del subsistema Twilio (frontend).
 *
 * Importa SIEMPRE desde aquí (no desde archivos internos) para mantener una
 * superficie pública estable y poder reorganizar el módulo internamente
 * sin romper consumidores.
 */

export { notifyOrderReady, notifyPickupReminder, notifySmsTemplate, previewMessage } from './TwilioService';
export {
  getTwilioConfig,
  isTwilioReady,
  setKillSwitchOverride,
  resetTwilioConfigCache,
} from './config';
export {
  getUsageStats,
  getSmsHistory,
  clearSmsHistory,
  runAllGuards,
} from './protections';
export { renderTemplate, estimateSmsSegments } from './messageTemplates';
export { normalizeToE164, isValidE164 } from './phoneValidation';
export type {
  NotifySmsRequest,
  NotifySmsResponse,
  SendSmsResult,
  SmsSendRecord,
  TwilioErrorCode,
} from './types';
export type { TemplateContext } from './messageTemplates';
export type { TwilioRuntimeConfig } from './config';
export type { SmsUsageStats, GuardResult } from './protections';
