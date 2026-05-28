import { supabase } from '@/lib/supabase';

export interface SendSmsPayload {
  taskId: string;
  phone: string;
  message: string;
}

export interface SendSmsResponse {
  ok: boolean;
  taskId: string;
  messageSid?: string;
  error?: string;
}

/**
 * Validates phone number in E.164 format (required by Twilio).
 */
function validatePhoneE164(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Sends reminder SMS via unified Edge Function (flow=reminder).
 * Task status is updated server-side on success/failure.
 */
export async function sendReminderSms(payload: SendSmsPayload): Promise<SendSmsResponse> {
  if (!validatePhoneE164(payload.phone)) {
    throw new Error(
      `Invalid phone format: ${payload.phone}. Must be E.164 format (e.g., +12025551234)`,
    );
  }

  const { data, error } = await supabase.functions.invoke('send-reminder-sms', {
    body: {
      flow: 'reminder',
      taskId: payload.taskId,
      phone: payload.phone,
      message: payload.message,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to send SMS');
  }

  const result = data as { ok?: boolean; taskId?: string; messageSid?: string; error?: string };

  if (result?.ok) {
    return {
      ok: true,
      taskId: payload.taskId,
      messageSid: result.messageSid,
    };
  }

  throw new Error(result?.error || 'Unknown error sending SMS');
}

/**
 * Skip a reminder task (mark as 'skipped').
 */
export async function skipReminderTask(taskId: string): Promise<void> {
  const { error, count } = await supabase
    .from('receipt_reminder_task')
    .update({ status: 'skipped' }, { count: 'exact' })
    .eq('id', taskId);

  if (error) {
    throw new Error(error.message || 'Failed to skip task');
  }

  if (count === 0) {
    throw new Error(`Task ${taskId} not found or already updated`);
  }
}
