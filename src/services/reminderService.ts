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
 * Format: +[country code][number] (e.g., +12025551234)
 */
function validatePhoneE164(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Sends an SMS via the backend and marks the task as sent.
 * This calls a Supabase Edge Function that handles Twilio integration.
 */
export async function sendReminderSms(payload: SendSmsPayload): Promise<SendSmsResponse> {
  try {
    // Validate phone format
    if (!validatePhoneE164(payload.phone)) {
      throw new Error(`Invalid phone format: ${payload.phone}. Must be E.164 format (e.g., +12025551234)`);
    }

    // Call Supabase function
    const { data, error } = await supabase.functions.invoke('send-reminder-sms', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message || 'Failed to send SMS');
    }

    if (data?.ok) {
      // Update task status to 'sent' in the DB
      const { error: updateError } = await supabase
        .from('receipt_reminder_task')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', payload.taskId);

      if (updateError) {
        // SMS was sent but DB update failed - still considered success but log error
        console.error('SMS sent but DB update failed:', updateError);
      }

      return { ok: true, taskId: payload.taskId, messageSid: data.messageSid };
    } else {
      // Update task status to 'failed'
      const { error: updateError } = await supabase
        .from('receipt_reminder_task')
        .update({ status: 'failed', attempted_at: new Date().toISOString() })
        .eq('id', payload.taskId);

      if (updateError) {
        console.error('Failed to update task status:', updateError);
      }

      throw new Error(data?.error || 'Unknown error sending SMS');
    }
  } catch (err) {
    console.error('sendReminderSms error:', err);
    throw err;
  }
}

/**
 * Skip a reminder task (mark as 'skipped').
 */
export async function skipReminderTask(taskId: string): Promise<void> {
  const { error, count } = await supabase
    .from('receipt_reminder_task')
    .update({ status: 'skipped' })
    .eq('id', taskId);

  if (error) {
    throw new Error(error.message || 'Failed to skip task');
  }

  if (count === 0) {
    throw new Error(`Task ${taskId} not found or already updated`);
  }
}
