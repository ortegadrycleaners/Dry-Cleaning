# 🚀 Plan de Despliegue: Dry-Cleaning App

Este plan detalla los pasos para desplegar la aplicación utilizando **Hostinger** para el frontend y **Supabase** como backend (BaaS).

---

## 📋 Requisitos Previos
1. Cuenta en [Supabase](https://supabase.com/).
2. Cuenta en [Hostinger](https://www.hostinger.com/) (Hospedaje compartido o similar con soporte para sitios estáticos).
3. [Supabase CLI](https://supabase.com/docs/guides/cli) instalado localmente.
4. Credenciales de **Twilio** (Account SID, Auth Token, From Number) para los recordatorios de SMS.

---

## 🏗️ Fase 1: Configuración de Supabase (Backend)

### 1. Crear el Proyecto
- Crea un nuevo proyecto en el Dashboard de Supabase.
- Anota la `URL` del proyecto y la `anon key` (están en Project Settings > API).
- **Configurar Auth**: En Settings > Auth, añade tu dominio de Hostinger (ej. `https://tudominio.com`) en "Site URL" y "Redirect URLs".

### 2. Ejecutar Migraciones SQL
Copia y pega el contenido de los siguientes archivos en el **SQL Editor** de Supabase:
1. `docs/supabase_migration.sql`: Crea las tablas y funciones de recordatorios.
2. `docs/TRACKING_SUPABASE_README.md` (Sección 1): Agrega la columna `public_id` a la tabla `receipt`.
3. `docs/security/rls-public-access.md`: Asegura que el acceso público al tracking sea seguro.

**Nota importante:** Asegúrate de que las tablas base `receipt` y `client` ya existan en tu base de datos, ya que las tablas de recordatorios dependen de ellas.

### 3. Configurar Secretos (Twilio)
Usa la CLI de Supabase para configurar las credenciales de Twilio que usarán las Edge Functions:
```bash
supabase login
supabase secrets set TWILIO_ACCOUNT_SID="tu_sid"
supabase secrets set TWILIO_AUTH_TOKEN="tu_token"
supabase secrets set TWILIO_FROM="+1234567890"
```

### 4. Desplegar Edge Functions
Desde la raíz del proyecto, despliega las funciones:
```bash
supabase functions deploy send_reminder_sms --no-verify-jwt
supabase functions deploy send_reminders --no-verify-jwt
```

### 5. Configurar el Cron Job
En el Dashboard de Supabase > SQL Editor, ejecuta:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Programa la detección de recordatorios cada mañana (6 AM UTC)
SELECT cron.schedule('detect-reminders-daily', '0 6 * * *', $$
  SELECT public.detect_reminders_and_create_tasks('America/Puerto_Rico');
$$);
```

---

## 🌐 Fase 2: Preparar el Frontend (Vite)

### 1. Variables de Entorno de Producción
Crea un archivo llamado `.env.production` en la raíz del proyecto:
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-de-produccion
```

### 2. Construir el Proyecto
Ejecuta el comando de build para generar los archivos de producción:
```bash
pnpm install
pnpm build
```
Esto generará una carpeta `dist/` con todo el contenido listo para subir.

---

## 🚀 Fase 3: Despliegue en Hostinger

### 1. Subir Archivos
1. Accede al **hPanel** de Hostinger > Administrador de Archivos.
2. Ve a la carpeta `public_html`.
3. Sube **todo el contenido** de la carpeta local `dist/` (no la carpeta en sí, sino lo que hay dentro).

### 2. Configurar el Enrutamiento (SPA)
Como la app usa `react-router-dom`, necesitas un archivo `.htaccess` en `public_html` para que todas las rutas carguen el `index.html`. Esto evita errores 404 al recargar páginas como `/tracking/XYZ`.

Crea el archivo `.htaccess` con este contenido:
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

### 3. Forzar HTTPS y Seguridad (Opcional pero Recomendado)
Añade esto a tu `.htaccess` para forzar HTTPS:
```apache
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

### 4. Activar SSL (HTTPS)
Asegúrate de que el certificado SSL esté activo en Hostinger para que la conexión con Supabase sea segura. Sin SSL, las peticiones a Supabase fallarán por políticas de seguridad del navegador.

---

## 🛠️ Fase 4: Automatización (GitHub Actions - Opcional)
Para evitar subir archivos manualmente cada vez, puedes crear un secreto en GitHub con tus datos FTP y usar este workflow:

1. Crea `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Hostinger
on:
  push:
    branches: [ main ]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install & Build
        run: |
          pnpm install
          pnpm build
      - name: FTP Deploy
        uses: SamKirkland/FTP-Deploy-Action@v4.3.4
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          local-dir: ./dist/
          server-dir: ./public_html/
```

---

## ✅ Fase 5: Verificación Final

1. **Acceso**: Entra a tu dominio y verifica que la página de Login carga correctamente.
2. **Autenticación**: Intenta loguearte. Si falla, revisa el "Site URL" en Supabase.
3. **Base de Datos**: Crea un pedido de prueba y verifica que aparece en el Dashboard de Supabase.
4. **Tracking**: Abre un enlace de seguimiento ([tu-dominio.com/tracking/XYZ](http://tu-dominio.com/tracking/XYZ)) y confirma que los datos del pedido se muestran.
5. **Recordatorios**: Monitorea la tabla `receipt_reminder_task` en Supabase para ver si el Cron Job crea las tareas correctamente.

---

**Nota:** Si necesitas ejecutar scripts locales de mantenimiento que conecten a la DB, asegúrate de configurar la variable `DATABASE_URL` en tu entorno local apuntando a la cadena de conexión de Supabase (Settings > Database > Connection String).
