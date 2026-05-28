# Ortega Dry Cleaners — Backoffice

App backoffice (React + TypeScript + Vite) para gestionar órdenes y enviar
SMS al cliente cuando una orden queda lista.

## Despliegue (orden obligatorio)

1. **Etapa 1 — Base sin Twilio:** Supabase + Hostinger con `VITE_TWILIO_MOCK=true`
   (login, órdenes, tracking). Guía: [`docs/DEPLOYMENT_PHASES.md`](docs/DEPLOYMENT_PHASES.md).
2. **Etapa 2 — Twilio:** Tras validar la Etapa 1, secretos Twilio + `VITE_TWILIO_MOCK=false`
   y redeploy del frontend.

Resumen operativo: [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md).

## Notificaciones SMS por Twilio (Etapa 2)

El envío real usa la Edge Function `send-reminder-sms` (Auth Token solo en servidor).

1. Completa primero la Etapa 1 en [`docs/DEPLOYMENT_PHASES.md`](docs/DEPLOYMENT_PHASES.md).
2. Luego [`docs/TWILIO_SETUP.md`](docs/TWILIO_SETUP.md) y `cp .env.example .env`.
3. Mientras `VITE_TWILIO_MOCK=true` la app **no envía nada** a Twilio (modo seguro en el primer despliegue).

En el dashboard, marca una orden como `LISTO` con su rack, y aparecerá el
único botón **“SMS cliente”** que dispara el SMS tras pasar **17
capas de protección** (idempotency key, dedup, rate-limit por orden, global
por minuto, presupuesto diario, kill switch, validación E.164, allowlist QA,
cooldown anti doble-click, etc.). Detalle completo en
[`docs/TWILIO_SETUP.md`](docs/TWILIO_SETUP.md).

---

## Plantilla original

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
