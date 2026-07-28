# 🧪 Plan de Pruebas Manuales — Ortega Cleaners

> **Restricción importante**: Solo se dispone del número de Twilio (número de prueba) para recibir SMS reales. Toda prueba de SMS debe enviarse a ese número o verificarse en modo mock.

---

## ⚙️ Pre-requisitos antes de empezar

- [ ] App corriendo localmente (`pnpm run dev`)
- [ ] Sesión iniciada en el backoffice
- [ ] Tener a mano el número de Twilio para recibir SMS de prueba
- [ ] Confirmar modo activo (mock vs producción) revisando el panel SMS en cualquier modal de envío

---

## 🔐 1. Autenticación

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 1.1 | Ir a `/login` sin sesión | Muestra pantalla de login |
| 1.2 | Ingresar credenciales incorrectas | Error visible, no redirige |
| 1.3 | Ingresar credenciales correctas | Redirige al dashboard |
| 1.4 | Con sesión activa, navegar a `/login` | Redirige automáticamente al dashboard |
| 1.5 | Hacer click en **Logout** | Redirige a `/login`, sesión eliminada |
| 1.6 | Con sesión cerrada, intentar acceder a `/dashboard` | Redirige a `/login` |

---

## 📋 2. Dashboard — Vista y navegación

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 2.1 | Cargar el dashboard | Lista de órdenes visible, paginación correcta |
| 2.2 | Cambiar idioma (EN/ES) con el toggle | Toda la UI cambia de idioma en tiempo real |
| 2.3 | Buscar por nombre de cliente | Filtra la tabla en tiempo real |
| 2.4 | Buscar por número de orden | Encuentra la orden correcta |
| 2.5 | Buscar por teléfono | Filtra correctamente |
| 2.6 | Borrar la búsqueda | Muestra todas las órdenes nuevamente |
| 2.7 | Con lista vacía (sin resultados) | Muestra estado vacío con botón "Nueva Orden" |
| 2.8 | Click en paginación: Siguiente / Anterior | Navega entre páginas correctamente |

### 2a. Filtros de vista

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 2a.1 | Abrir filtro (ícono embudo) | Menú desplegable con 4 opciones |
| 2a.2 | Seleccionar **Activas** | Muestra RECIBIDO + EN PROCESO + LISTO |
| 2a.3 | Seleccionar **Pendientes** | Muestra solo RECIBIDO + EN PROCESO |
| 2a.4 | Seleccionar **Listas** | Muestra solo LISTO |
| 2a.5 | Seleccionar **Entregadas** | Muestra ENTREGADO + ABANDONADO |
| 2a.6 | Cerrar menú clickeando fuera | Menú se cierra |

---

## ➕ 3. Crear nueva orden

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 3.1 | Click en **Nueva Orden** | Navega a `/dashboard/nueva` |
| 3.2 | Enviar formulario vacío | Errores de validación en todos los campos requeridos |
| 3.3 | Ingresar número de orden que ya existe | Error "ya existe" sin crear |
| 3.4 | Ingresar número de orden con letras | Error: solo dígitos |
| 3.5 | Ingresar teléfono que ya existe con nombre diferente | Error de cliente existente con otro nombre |
| 3.6 | **Crear orden con cliente nuevo** (teléfono del número Twilio) | Orden creada, muestra confirmación con tracking URL |
| 3.7 | **Crear orden con cliente existente** (mismo teléfono, mismo nombre) | Orden creada reutilizando el cliente |
| 3.8 | Verificar que la nueva orden aparece en el dashboard | Orden visible en la lista |
| 3.9 | Click en "Volver" / flecha atrás | Regresa al dashboard sin crear |
| 3.10 | Crear orden con fecha estimada específica | La fecha aparece en la tabla |

---

## 🔄 4. Flujo de estados de una orden

> Usar una orden con el teléfono del número Twilio para verificar SMS reales.

### 4a. RECIBIDO → EN PROCESO (implicit, via "Notificar procesado")

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 4a.1 | Orden en RECIBIDO — ver botones disponibles | Botones: "Marcar Listo", "Notificar" (procesado), ícono de link |
| 4a.2 | Click en **Notificar** (orden RECIBIDO) | Abre modal ORDER_PROCESSED |

### 4b. RECIBIDO / EN PROCESO → LISTO

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 4b.1 | Click en **Marcar Listo** | Abre modal con campo de Rack Number |
| 4b.2 | Intentar confirmar sin rack number | Error "rack number requerido" |
| 4b.3 | Ingresar rack number ocupado por otra orden | Error con nombre del cliente que lo ocupa |
| 4b.4 | Ingresar rack number válido + Enter | Acepta y continúa |
| 4b.5 | Confirmar con rack número válido | **Countdown de 3 segundos** comienza |
| 4b.6 | Durante countdown → click **Cancelar SMS** | SMS no se envía, modal se cierra, orden queda LISTO |
| 4b.7 | Durante countdown → dejar pasar los 3 seg | SMS `ORDER_READY` se envía automáticamente |
| 4b.8 | Verificar SMS en número Twilio | Texto correcto con nombre, número de orden, tracking URL |
| 4b.9 | Orden cambia a badge **LISTO** con rack number | Badge verde con "LISTO · RACK XX" |

### 4c. LISTO → ENTREGADO

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 4c.1 | Click en **Marcar Entregado** (orden LISTO) | Toast de confirmación con opción de revertir |
| 4c.2 | Click **Revertir** dentro de los 5 seg del toast | Orden vuelve a LISTO |
| 4c.3 | Marcar entregado y esperar | Badge cambia a gris "ENTREGADO" |
| 4c.4 | Orden entregada → botones disponibles | Solo ícono de revertir (↩) |
| 4c.5 | Click en **Revertir** en orden entregada | Orden vuelve a LISTO |

### 4d. LISTO → ABANDONADO

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 4d.1 | Orden ABANDONADO — ver badge | Badge rojo "ABANDONADO" |
| 4d.2 | Click en **Revertir** | Orden vuelve a LISTO |

---

## 📨 5. Mensajes SMS — Todos los tipos

> Para cada tipo, abrir el modal, revisar el **preview del mensaje** antes de enviar.
> Enviar solo los que vayan al número Twilio.

### 5.1 ORDER_CREATED *(orden confirmada)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.1.1 | Abrir modal de SMS (orden en cualquier estado) → seleccionar **Order Created** | Preview: "Hi [nombre], we got your order #[N]! Estimated ready: [fecha]..." |
| 5.1.2 | Enviar al número Twilio | SMS llega con el texto correcto |
| 5.1.3 | Verificar que el link de tracking es funcional en el SMS | Abre la página de tracking correctamente |

### 5.2 ORDER_RECEIVED_TRACKING *(recibida con link)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.2.1 | Seleccionar template **Order Received** | Preview: "Hi [nombre]! Your order is in, estimated ready by [fecha]..." |
| 5.2.2 | Verificar tracking URL incluida | URL presente y correcta |

### 5.3 ORDER_PROCESSED *(en proceso — modal especial)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.3.1 | Click en **Notificar** en orden RECIBIDO/EN PROCESO | Abre modal `OrderProcessedModal` |
| 5.3.2 | Sin habilitar nota → ver preview | "Your order is being processed, est. ready by [fecha]..." |
| 5.3.3 | Habilitar nota → escribir texto → ver preview | Mensaje incluye la nota personalizada |
| 5.3.4 | Habilitar nota + "Sin fecha estimada" → ver preview | Mensaje omite la fecha, menciona contactar |
| 5.3.5 | Nota con 100 caracteres (límite) | Contador muestra 100/100 en rojo |
| 5.3.6 | Enviar al número Twilio (sin nota) | SMS llega correcto |
| 5.3.7 | Enviar al número Twilio (con nota) | SMS incluye la nota |
| 5.3.8 | Enviar al número Twilio (con nota + sin fecha) | SMS omite fecha estimada |
| 5.3.9 | Después de enviar exitoso → botón desaparece | Ya no aparece "Notificar" para esa orden (historial local) |

### 5.4 ORDER_DELAYED *(orden retrasada)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.4.1 | Abrir modal SMS → seleccionar **Order Delayed** | Preview: "Hi, your order needs one more day. New ready date: [fecha]..." |
| 5.4.2 | Enviar al número Twilio | SMS llega con disculpas y nueva fecha |

### 5.5 ORDER_READY *(lista para recoger)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.5.1 | Orden en LISTO (< 3 días) → click **Notificar Cliente** | Abre modal con template ORDER_READY pre-seleccionado |
| 5.5.2 | Preview del mensaje | "Hi [nombre], your order is ready at Ortega Cleaners!..." |
| 5.5.3 | Enviar al número Twilio | SMS llega correcto |
| 5.5.4 | Después de enviar → botón desaparece | No vuelve a aparecer "Notificar Cliente" |

### 5.6 PICKUP_REMINDER *(recordatorio 3 días)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.6.1 | Orden en LISTO con ≥ 3 días → ver badge | Badge muestra "LISTO · X días" con ícono de alerta |
| 5.6.2 | Click en **Reminder** | Abre modal con template PICKUP_REMINDER |
| 5.6.3 | Preview del mensaje | "Hi [nombre], your order has been ready for 3 days. Stop by whenever you can!..." |
| 5.6.4 | Enviar al número Twilio | SMS llega correcto |

### 5.7 URGENT_REMINDER *(recordatorio urgente 5 días)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.7.1 | Orden LISTO con ≥ 5 días | Badge urgente |
| 5.7.2 | Abrir modal → seleccionar **Urgent Reminder** | Preview: "...been ready for 5 days...need help? Call us at [teléfono]..." |
| 5.7.3 | Verificar que el teléfono de la tienda es correcto | (904) 666-0809 |

### 5.8 DAY_30_REMINDER *(30 días sin recoger)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.8.1 | Seleccionar template **Day 30 Reminder** | Preview: "...been ready for 30 days...Please contact us to arrange pickup..." |

### 5.9 THANK_YOU_REVIEW *(gracias + review)*

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 5.9.1 | Seleccionar template **Thank You Review** | Preview: "Thanks for choosing Ortega Cleaners, [nombre]! We'd love your feedback: [URL]" |
| 5.9.2 | Verificar que la URL de review es la de Google | URL de Google Maps/Reviews de la tienda |

---

## 🔒 6. Protecciones y límites SMS (Guards)

| # | Escenario | Resultado esperado |
|---|-----------|-------------------|
| 6.1 | Intentar enviar 2 SMS del mismo tipo a la misma orden en el mismo día | Bloqueado por idempotency key, error visible en modal |
| 6.2 | Revisar contador **SMS últimos 60 seg** en el modal | Número aumenta tras cada envío |
| 6.3 | Revisar contador **SMS últimas 24h** | Número correcto del día |
| 6.4 | Revisar **presupuesto restante** | Decrementa tras cada envío |
| 6.5 | Con Kill Switch activo | Botón de envío deshabilitado, mensaje de error |
| 6.6 | SMS en modo **Production** visible | Etiqueta "Producción" en el modal |
| 6.7 | SMS en modo **Mock** visible | Etiqueta "Mock" en el modal, no envía SMS real |

---

## 🔔 7. Panel de Notificaciones (campana)

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 7.1 | Click en campana (sin notificaciones) | Panel vacío con mensaje "no hay notificaciones" |
| 7.2 | Enviar un SMS exitoso → abrir campana | Aparece nueva notificación no leída (badge rojo con número) |
| 7.3 | Cada tipo de SMS aparece con el ícono correcto | ORDER_READY=verde, PICKUP_REMINDER=ámbar, URGENT=rojo |
| 7.4 | Click en una notificación individual | Se marca como leída, badge azul desaparece |
| 7.5 | Click en **Marcar todas como leídas** | Todas pasan a leídas, badge de campana desaparece |
| 7.6 | Click fuera del panel | Panel se cierra |
| 7.7 | Notificación muestra tiempo relativo | "hace X minutos" |
| 7.8 | Notificación fallida aparece con badge rojo "failed" | Visible en el panel |

---

## 🔗 8. Tracking Link (página pública)

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 8.1 | Click en ícono de link (🔗) en la tabla | Toast "Link copiado" aparece |
| 8.2 | Pegar el link en otra pestaña | Abre `/tracking/[publicId]` |
| 8.3 | Tracking de orden en RECIBIDO | Barra de progreso en paso 1, info de la orden |
| 8.4 | Tracking de orden en EN PROCESO | Barra en paso 2 |
| 8.5 | Tracking de orden en LISTO | Barra en paso 3, rack number visible |
| 8.6 | Tracking de orden en ENTREGADO | Barra completada en paso 4 |
| 8.7 | Tracking con `publicId` inválido | Muestra error "orden no encontrada" |
| 8.8 | Toggle de idioma en tracking page | Cambia idioma de la página pública |
| 8.9 | Teléfono de la tienda visible y correcto | Link de llamada funcional |
| 8.10 | Página hace polling automático cada 30s | El estado se actualiza si cambia en el backend |
| 8.11 | Pestaña en segundo plano | Polling se pausa (no consume recursos) |

---

## 📱 9. Responsividad (mobile)

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 9.1 | Abrir dashboard en móvil (< 768px) | Vista de tarjetas en lugar de tabla |
| 9.2 | Cada tarjeta mobile muestra datos correctos | Nombre, teléfono, estado, fecha |
| 9.3 | Botones de acción en tarjeta mobile | Todos funcionales (Marcar Listo, Notificar, Entregar) |
| 9.4 | Tracking page en móvil | Barra de progreso responsive, legible |
| 9.5 | Modal de SMS en móvil | Aparece correctamente sin overflow |
| 9.6 | Header en móvil | Logo visible, campana y logout accesibles |

---

## ⚙️ 10. Configuración (Settings)

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 10.1 | Click en ícono de settings (⚙️) | Abre modal de configuración |
| 10.2 | Habilitar **Auto-refresh** | Checkbox activado |
| 10.3 | Guardar | Modal se cierra, configuración persiste |
| 10.4 | Cancelar cambio | Modal se cierra sin guardar |
| 10.5 | Recargar la página | Configuración de auto-refresh persiste |

---

## 🔁 11. Recordatorios automáticos (ReminderTaskHandler)

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 11.1 | Simular orden con 3 días LISTO | Aparece modal de recordatorio (no se puede cerrar con X) |
| 11.2 | Click **Enviar SMS** en modal de recordatorio | SMS PICKUP_REMINDER se envía |
| 11.3 | Click **Omitir por ahora** | Modal se cierra, recordatorio marcado como skipped |
| 11.4 | Simular orden con 5 días LISTO | Modal muestra banner rojo "ALTA PRIORIDAD" |
| 11.5 | Simular orden con 30 días LISTO | Modal muestra "30 días en rack (CRÍTICO)" |

---

## 📊 12. Deduplicación e Historial SMS

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 12.1 | Enviar ORDER_READY a una orden | Botón "Notificar Cliente" desaparece de esa orden |
| 12.2 | Recargar la página | El botón sigue desaparecido (historial en localStorage) |
| 12.3 | Enviar PICKUP_REMINDER | Botón "Reminder" desaparece |
| 12.4 | Enviar ORDER_PROCESSED | Botón "Notificar" desaparece de esa orden |
| 12.5 | Segunda apertura del modal de SMS mismo día | Muestra idempotency bloqueado si se intenta el mismo tipo |

---

## 🌐 13. Páginas informativas públicas

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 13.1 | Navegar a `/privacy` | Página de Privacy Policy carga |
| 13.2 | Navegar a `/terms` | Página de Terms carga |
| 13.3 | Navegar a una ruta inexistente `/xyz` | Página 404 visible |

---

## 📋 14. Resumen rápido de tipos de mensaje a verificar en número Twilio

Usar este resumen para el día de prueba con el número real:

| Template | Texto clave esperado |
|----------|---------------------|
| ORDER_CREATED | "we got your order #... Estimated ready:... Track it here:" |
| ORDER_RECEIVED_TRACKING | "Your order is in, estimated ready by...Track your order:" |
| ORDER_PROCESSED (base) | "being processed, est. ready by..." |
| ORDER_PROCESSED (con nota) | "being processed! Note: [tu nota]. Est. ready:" |
| ORDER_PROCESSED (sin fecha) | "update on your order: [nota]. Please contact us" |
| ORDER_DELAYED | "needs one more day. New ready date:" |
| ORDER_READY | "your order is ready at Ortega Cleaners! Stop by" |
| PICKUP_REMINDER | "been ready for 3 days. Stop by whenever you can!" |
| URGENT_REMINDER | "been ready for 5 days...need help? Call us at (904) 666-0809" |
| DAY_30_REMINDER | "been ready for 30 days...Please contact us to arrange pickup" |
| THANK_YOU_REVIEW | "Thanks for choosing Ortega Cleaners...We'd love your feedback:" |

---

## ✅ Criterios de aceptación global

- [ ] Todos los tipos de SMS generan el texto correcto en el preview
- [ ] Al menos 3 tipos enviados realmente llegan al número Twilio sin errores
- [ ] El tracking link del SMS abre la página correcta con el estado de la orden
- [ ] No se pueden enviar duplicados del mismo tipo el mismo día
- [ ] Los contadores de uso (minuto/día) se actualizan correctamente
- [ ] El panel de notificaciones registra todos los SMS enviados
- [ ] Los estados de orden transicionan correctamente y los botones cambian según estado
- [ ] La app es funcional en móvil (responsive)
