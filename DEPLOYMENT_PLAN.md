# Plan de despliegue — Dry-Cleaning (Ortega / Zivo)

Hostinger (frontend estático) + Supabase (backend).

> **Orden obligatorio:** primero [Etapa 1 — despliegue base sin Twilio](docs/DEPLOYMENT_PHASES.md#etapa-1--despliegue-base-sin-twilio), después [Etapa 2 — Twilio](docs/DEPLOYMENT_PHASES.md#etapa-2--activación-twilio-después-del-despliegue-base).  
> Guía detallada: [`docs/DEPLOYMENT_PHASES.md`](docs/DEPLOYMENT_PHASES.md)

---

## Requisitos previos

| Etapa 1 (base) | Etapa 2 (SMS) |
|----------------|---------------|
| Supabase | + Cuenta Twilio |
| Hostinger (o hosting estático) | + Secretos Twilio en Supabase |
| Supabase CLI (recomendado) | + `VITE_TWILIO_MOCK=false` y redeploy frontend |

---

# Etapa 1 — Despliegue base (sin Twilio)

## 1. Supabase — proyecto

- Crear proyecto y anotar URL + `anon key`.
- **Auth:** añadir dominio de producción en Site URL y Redirect URLs.

## 2. Migraciones SQL

En SQL Editor, en orden:

1. `docs/supabase_migration.sql`
2. `docs/TRACKING_SUPABASE_README.md` (columna `public_id`)
3. `docs/security/rls-public-access.md`
4. `docs/sms_sends_migration.sql`
5. `docs/reminder_status_updated_at_migration.sql` (si la BD ya existía con lógica antigua)

Las tablas `receipt` y `client` deben existir antes del paso 1.

## 3. Edge Functions (opcional en Etapa 1)

Sin secretos Twilio la app sigue en mock; las funciones solo fallan si se fuerza SMS real.

```bash
supabase login
supabase link
supabase functions deploy send-reminder-sms
```

**No desplegar ni invocar `send-reminders` hasta Etapa 2.**

## 4. Frontend — build

`.env.production`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_TWILIO_MOCK=true
```

```bash
pnpm install
pnpm build
```

## 5. Hostinger

1. Subir contenido de `dist/` a `public_html`.
2. `.htaccess` para SPA (ver sección al final).
3. Activar SSL/HTTPS.

## 6. Verificación Etapa 1

- Login y dashboard con datos reales
- Nueva orden y tracking público
- SMS en modo MOCK (sin Twilio)

---

# Etapa 2 — Twilio (después de validar Etapa 1)

## 1. Secretos Supabase

```bash
supabase secrets set TWILIO_ACCOUNT_SID="tu_sid"
supabase secrets set TWILIO_AUTH_TOKEN="tu_token"
supabase secrets set TWILIO_FROM="+1234567890"
supabase secrets set PUBLIC_APP_URL="https://tu-dominio.com"
supabase functions deploy send-reminder-sms
```

## 2. Batch y cron (opcional)

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

Cron diario (SQL Editor):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('detect-reminders-daily', '0 6 * * *', $$
  SELECT public.detect_reminders_and_create_tasks('America/Puerto_Rico');
$$);
```

## 3. Frontend — activar SMS real

Cambiar en el host y **volver a build + subir `dist/`**:

```env
VITE_TWILIO_MOCK=false
```

## 4. Verificación Etapa 2

- SMS “orden lista” en Twilio
- Reintento → `DUPLICATE`
- Recordatorio modal (si aplica)

Ver [`docs/TWILIO_SETUP.md`](docs/TWILIO_SETUP.md).

---

## `.htaccess` (SPA en Hostinger)

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-l
  RewriteRule . /index.html [L]
</IfModule>
```

HTTPS (opcional):

```apache
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

---

## GitHub Actions (opcional)

Mismo workflow que antes; en Etapa 1 usar `VITE_TWILIO_MOCK=true` en secrets del workflow hasta activar Twilio.

---

## Mantenimiento local

`DATABASE_URL` → connection string de Supabase (Settings → Database) para scripts como `scripts/run_reminders.js`.
