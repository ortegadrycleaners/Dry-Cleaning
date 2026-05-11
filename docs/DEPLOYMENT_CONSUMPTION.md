# Análisis de Consumo de Despliegue

## 📊 Artefactos de Aplicación

| Componente | Tamaño | Gzip | Descripción |
|-----------|--------|------|-----------|
| **Bundle Total** | **528 KB** | **161 KB** | JavaScript + CSS minificados |
| Core App (index-BID6X_Js.js) | 195 KB | 61.93 KB | Lógica principal + contextos |
| UI Components | 103.95 KB | 31.88 KB | Radix UI + Sonner + componentes custom |
| Form Validation | 86.30 KB | 25.85 KB | React Hook Form + Zod |
| React Runtime | 48.47 KB | 17.14 KB | React + React Router DOM |
| CSS Global | 35.21 KB | 7.33 KB | Tailwind + PostCSS |
| Páginas (lazy) | 54 KB | ~17 KB | DashboardPage, TrackingPage, etc. (code-split) |

## 💾 Almacenamiento en Deploy

```
Código fuente (src/)          1.3 MB
Artefacto production (dist/)  556 KB
node_modules                  200 MB (NO se deploya)
────────────────────────────────────
Total a deployar              ~570 KB + static files
```

**Nota:** El bundle es muy eficiente ✅ — ideal para **CDN estático** (Vercel, Netlify, Surge) o **servidor ligero**.

---

## 🔌 Servicios Externos Requeridos

### 🟢 Supabase (Recomendado)
- **Tipo:** PostgreSQL serverless + auth
- **Costo aproximado:**
  - Plan Free: 500 MB storage, 2 GB/mes transferencia
  - Plan Pro: $25/mes + pago por uso
- **Conexiones activas:** Bajo (frontend = cliente auth + queries puntuales)
- **API REST:** Acceso directo desde frontend (con RLS)

### 🔵 Twilio (SMS)
- **Tipo:** SaaS con API REST
- **Costo aproximado:**
  - SMS: $0.0075 - $0.03 por mensaje (según destino, PR más caro por ruta)
  - Account keep-alive: Gratis
  - Número remitente: $1-2/mes
- **Límites configurables:** `VITE_SMS_DAILY_BUDGET` (por defecto 200 SMS/día)
- **Backend requerido:** Supabase Edge Function (gratis hasta cierta cuota)

### 🟡 Edge Function (Supabase/Vercel)
- **Costo:** Gratis hasta 500K invocaciones/mes
- **Uso estimado:** 1 invocación por SMS enviado
- **Almacenamiento:** Negligible (solo logs)

---

## 📈 Estimación de Recursos (MVP)

### Tráfico Mensual (Ejemplo: 300-500 órdenes/mes)

| Métrica | Baja | Media | Alta |
|---------|------|-------|------|
| Órdenes/mes | 100 | 500 | 2000 |
| SMS enviados | 50-100 | 200-400 | 800-1500 |
| Costo Twilio/mes | $1-3 | $5-15 | $20-50 |
| Requests API | 100-200 | 500-1000 | 2000-4000 |
| Edge Functions | ~50 | ~300 | ~1200 |
| Supabase Row reads | 100-500 | 500-2000 | 2000-8000 |

### Estimación de Costos Mensuales (Escenario Típico)
```
Supabase (tier Pro)          $25
Twilio (300 SMS @ $0.01)     $3-5  
Edge Functions               Free
Frontend hosting (Vercel)    Free-$10
────────────────────────────────────
Total aproximado/mes         $30-40
```

---

## 🏗️ Arquitectura de Despliegue Recomendada

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (React + Vite) — 556 KB gzip                   │
│ Hosting: Vercel / Netlify / Surge                       │
│ CDN: Global edge network                                │
│ Auto-deploy: Desde GitHub                               │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴──────────────┐
        │                           │
┌───────▼──────────┐        ┌──────▼──────────┐
│ Supabase:        │        │ Twilio:         │
│ - PostgreSQL     │        │ - SMS API       │
│ - Auth (JWT)     │        │ - Account SID   │
│ - RLS policies   │        │ - Number Pool   │
└────────┬─────────┘        └─────────────────┘
         │
┌────────▼───────────────────────────────────┐
│ Edge Function (Supabase/Vercel)            │
│ - Custodia Auth Token Twilio               │
│ - Valida idempotency + presupuesto         │
│ - Dispara POST a Twilio API                │
└────────────────────────────────────────────┘
```

---

## ✅ Checklist de Despliegue

- ✅ **Bundle optimizado:** Vite con code-splitting automático
- ✅ **Caching:** 17 capas de protección para SMS (sin costos ocultos)
- ✅ **Sin credenciales en frontend:** Auth Token se custodia en backend
- ✅ **Mock mode:** `VITE_TWILIO_MOCK=true` para desarrollo
- ✅ **Escalabilidad:** Serverless = pagar solo por consumo
- ✅ **Auto-deploy:** Integración con GitHub CI/CD

---

## 🎯 Recomendaciones Finales

| Aspecto | Recomendación |
|--------|------|
| **Hosting Frontend** | Vercel (mejor integración Vite + Edge) |
| **Backend SMS** | Supabase Edge Function |
| **BD Principal** | Supabase PostgreSQL |
| **SMS** | Twilio (con limites: 200 SMS/día inicio) |
| **Monitoreo** | Sentry free tier + Twilio usage alerts |
| **Budget Inicial** | $50-60/mes para MVP con 500+ órdenes |

---

## 📋 Detalles Técnicos Adicionales

### Build Configuration (Vite)
- **Target:** ES2020 (soporte a navegadores modernos 2020+)
- **Minificación:** esbuild (ultra-rápido)
- **Code Splitting:** Automático en chunks nombrados
  - `vendor-react`: React + React Router (~17 KB gzip)
  - `vendor-form`: Form validation (~25 KB gzip)
  - `vendor-ui`: Componentes UI (~31 KB gzip)
  - Páginas lazy-loaded bajo demanda

### Seguridad & Protecciones
1. **17 capas de defensa en SMS:**
   - Idempotency key (previene duplicados)
   - Rate limit por orden (24h mínimo entre SMS)
   - Rate limit global (30 SMS/minuto)
   - Presupuesto diario (200 SMS default)
   - Kill switch runtime
   - Validación E.164
   - Allowlist QA
   - Cooldown anti doble-click (5s)

2. **Backend como autoridad final:**
   - Todas las validaciones se replican en Edge Function
   - El frontend NO es fuente de verdad
   - Supabase RLS protege datos sensibles

### Optimizaciones Aplicadas
- **CSS Code Splitting:** Estilos por chunk (evita CSS innecesario)
- **Tree-shaking:** Elimina código no usado
- **Sourcemaps deshabilitados:** Reduce tamaño en producción
- **Component lazy loading:** Páginas se cargan bajo demanda

---

## 🚀 Pasos de Despliegue Iniciales

1. **Vercel:**
   ```bash
   npm i -g vercel
   vercel link
   vercel env pull
   vercel deploy --prod
   ```

2. **Supabase Edge Function:**
   ```bash
   supabase functions deploy notify-order-ready --no-verify
   ```

3. **Variables de Entorno:**
   - `VITE_NOTIFY_ENDPOINT_URL` = URL de la Edge Function
   - `VITE_TWILIO_MOCK` = false (para SMS reales)
   - `VITE_SMS_DAILY_BUDGET` = 200 (ajustar según volumen)

4. **Monitoreo:**
   - Twilio Console → Usage Triggers (alerta si costo > X USD/día)
   - Supabase Dashboard → Database usage
   - Vercel Analytics → Performance

---

Generated: May 11, 2026
