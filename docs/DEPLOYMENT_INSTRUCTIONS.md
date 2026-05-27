# Deployment Instructions - Reminder System

## Phase 1: Deploy Edge Function

### Step 1a: Authenticate with Supabase CLI
```bash
supabase login
```

### Step 1b: Deploy the Edge Function
```bash
cd /workspaces/Dry-Cleaning
supabase functions deploy send-reminder-sms --no-verify-jwt
```

**Expected Output:**
```
✓ Function deployed: send-reminder-sms
✓ URL: https://<project-id>.supabase.co/functions/v1/send-reminder-sms
```

---

## Phase 2: Configure Twilio Secrets in Supabase

### Step 2a: Set Secrets via CLI (RECOMMENDED - faster)
```bash
# Get these from your Twilio console:
# TWILIO_ACCOUNT_SID: Find in Account Info
# TWILIO_AUTH_TOKEN: Find in Account Info  
# TWILIO_FROM: Your Twilio phone number (e.g., +12025551234)

supabase secrets set TWILIO_ACCOUNT_SID="your-account-sid"
supabase secrets set TWILIO_AUTH_TOKEN="your-auth-token"
supabase secrets set TWILIO_FROM="+12025551234"

# Verify secrets were set
supabase secrets list
```

### Step 2b: OR Set Secrets via Dashboard (if CLI fails)
1. Go to Supabase Dashboard → Project → Settings → Edge Functions → Secrets
2. Click "New Secret" and add:
   - Key: `TWILIO_ACCOUNT_SID` | Value: `your-account-sid`
   - Key: `TWILIO_AUTH_TOKEN` | Value: `your-auth-token`
   - Key: `TWILIO_FROM` | Value: `+12025551234`

---

## Phase 3: Setup Daily Cron Job (in Supabase SQL Editor)

### Step 3a: Go to Supabase Dashboard
Dashboard → SQL Editor → New Query

### Step 3b: Run this SQL script
```sql
-- Enable pg_cron extension (required for scheduling)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create daily cron job at 6 AM UTC
-- Calls detect_reminders_and_create_tasks() which creates pending tasks
SELECT cron.schedule('detect-reminders-daily', '0 6 * * *', $$
  SELECT public.detect_reminders_and_create_tasks('America/Puerto_Rico');
$$);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'detect-reminders-daily';
```

**Expected Output:**
```
jobid | jobname                  | schedule   | command
------|--------------------------|------------|------------------
  ... | detect-reminders-daily   | 0 6 * * *  | SELECT public...
```

---

## Phase 4: Test the System (OPTIONAL but RECOMMENDED)

### Test 4a: Verify Edge Function
```bash
# Get your project URL from Supabase Dashboard
export PROJECT_URL="https://<project-id>.supabase.co"
export ANON_KEY="<your-anon-key>"

curl -X POST "$PROJECT_URL/functions/v1/send-reminder-sms" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-123",
    "phone": "+1234567890",
    "message": "Test SMS from Dry Cleaning"
  }'
```

### Test 4b: Manually trigger cron job
```sql
-- Run in Supabase SQL Editor to test detection
SELECT * FROM public.detect_reminders_and_create_tasks('America/Puerto_Rico');
```

### Test 4c: Check for pending tasks
```sql
SELECT * FROM receipt_reminder_task WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5;
```

---

## Phase 5: Verify in Frontend

1. Go to Dashboard in the app
2. ReminderTaskHandler component should be live (it loads on mount)
3. If there are pending tasks, a non-closeable modal will appear
4. Test buttons: "Enviar SMS" and "Omitir por ahora"

---

## Troubleshooting

### Edge Function fails to deploy
- Check: `supabase status`
- Check: Link to correct project with `supabase link`
- Check: Function syntax with `supabase functions validate send-reminder-sms`

### Secrets not being used
- Secrets take ~1 min to propagate after setting
- Redeploy function after setting secrets: `supabase functions deploy send-reminder-sms --no-verify-jwt`

### Cron job not running
- Check cron logs in SQL Editor:
```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

- Check if extension is enabled:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

### Modal not appearing
- Check if ReminderTaskHandler is mounted in DashboardPage ✓ (already done)
- Check browser console for errors
- Verify Supabase realtime is enabled in project settings

---

## Current Status

✅ SQL Migration - Complete
✅ RLS Policies - Complete  
✅ React Components - Complete (ReminderTaskHandler integrated)
✅ Edge Function Code - Ready (functions/send_reminder_sms/index.ts)
⏳ Edge Function Deployment - PENDING (run Phase 1)
⏳ Secrets Configuration - PENDING (run Phase 2)
⏳ Cron Job Setup - PENDING (run Phase 3)

Once all 3 phases are complete, the system is production-ready.
