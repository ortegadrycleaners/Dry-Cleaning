# Checklist de validacion URL Base62

1. Ejecutar `pnpm dev` en la raiz del proyecto.
2. Ir a `Nueva Orden` y crear una orden con:
   - `ID de Orden` numerico (ej. `1234`)
   - telefono y apellido validos
   - fecha estimada seleccionada
3. En el modal de confirmacion, verificar:
   - aparece `ID de seguimiento` alfanumerico (ej. `pDHZd`)
   - aparece el enlace `Abrir enlace de seguimiento`
4. Abrir el enlace del modal y confirmar que carga `/tracking/<id_opaco>`.
5. Ir al dashboard y copiar el enlace de tracking desde la orden creada.
6. Confirmar que en la pantalla de tracking se muestra la orden correcta.
7. Probar una URL invalida (ej. `/tracking/@@@`) y confirmar redireccion a `not-found`.
8. Confirmar que el backoffice sigue mostrando `orderNumber` legible como numero de ticket.
