# Despliegue estático en Hostinger (Front-only)

Resumen rápido
- El backend permanece en Supabase.
- Hostinger servirá la build estática generada por Vite (`dist/`).

Requisitos
- Tener las variables de entorno de Supabase: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (esta última es la anon/public key, adecuada para uso cliente si activas RLS y reglas adecuadas).
- Cuenta en Hostinger y acceso a File Manager o SFTP.

1) Incluir variables para build
- Localmente (o en CI), crea un archivo `.env.production` en la raíz del proyecto con estas claves (NO lo subas a git si contiene secretos):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

2) Ajustes útiles
- `vite.config.ts` ya tiene `base: './'`, lo que facilita desplegar en `public_html` sin rutas absolutas.
- Para SPA (rutas en cliente), incluye un `.htaccess` en la carpeta `dist/` si usas hosting Apache/compartido, ejemplo:

```.htaccess
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

3) Generar build de producción

```bash
pnpm build
# Resultado: carpeta dist/
```

4) Subir artefactos a Hostinger
- Opción A (File Manager): comprime `dist/` en `dist.zip`, súbelo desde Hostinger → File Manager → Extraer dentro de `public_html/`.
- Opción B (SFTP): conecta a Hostinger y sube el contenido de `dist/` a `public_html/`.

5) Configuración de dominio y SSL
- En Hostinger Admin, apunta tu dominio al sitio (o configura el dominio en la sección "Dominios").
- Activa SSL (Let’s Encrypt) desde la sección "SSL" o "HTTPS".

6) Notas de seguridad y buenas prácticas
- La `VITE_SUPABASE_ANON_KEY` es una clave pública: el control de acceso debe hacerse con RLS y políticas en Supabase.
- No pongas claves de servicio (service_role) en frontend.
- Si prefieres no compilar con la clave embebida, puedes usar un archivo `config.json` en `dist/` y editarlo directamente en Hostinger después del despliegue, pero la app debe cargarlo antes de inicializar el cliente Supabase.

7) Verificación post-despliegue
- Abrir el dominio y navegar: verificar que la app carga y puede autenticar/leer datos desde Supabase.
- Revisa la consola para errores CORS o claves mal configuradas.

Troubleshooting rápido
- Error sobre variables de entorno: asegúrate de construir con `.env.production` correcto.
- Rutas 404 en refresh de SPA: añadir `.htaccess` (o configuración equivalente en el hosting).

¿Quieres que genere el `.env.production.example` y el `.htaccess` dentro de `dist` (como plantilla) y que ejecute `pnpm build` aquí para generar `dist/` localmente? Si prefieres, puedo también preparar un pequeño script SFTP para subir `dist/` automáticamente si me proporcionas credenciales (no recomendado por seguridad en este chat).