# Implementación del cambio de mesa — análisis de integración (2026-10-30)

> Documento de ejecución; **no sustituye** la normativa en `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`. Estado: pendiente de implementación y certificación.

## Evidencia del código actual

- `apps/client/src/App.tsx`: `acceptScannedQr` reemplaza `qrCredentialRef`, anula `tableVisit` y limpia `eventScope` y `customerEvents` en cada escaneo. Es incompatible con conservar la vinculación/consumición activa hasta confirmar un pedido en destino autorizado.
- `apps/client/src/App.tsx`: `authorizeTable` llama `customerTransport.authorizeVisit` al escanear. Distinguir permiso técnico QR provisional y vinculación efectiva creada por primer pedido confirmado.
- `apps/client/src/App.tsx`: `confirmCheckout` utiliza `tableVisit.tableId`, `visitId`, `basketId` y token QR; el traslado debe validarse en la misma transacción de confirmación, no en el escaneo ni en la aprobación.
- `apps/client/src/customer-flow-transport.ts`: no expone contrato de solicitud/estado/decisión de cambio de mesa.
- `apps/api/src/customer-production-http.mjs`: rutas H6 actuales no ofrecen ciclo de vida de traslado.

## Bloque indivisible de implementación

1. **Persistencia PostgreSQL 17:** migración aislada de solicitud (cliente/cuenta/mesa origen, created_at, expires_at, estado), decisión y autorización de un uso; unicidad e idempotencia, bloqueo de ventana de 90 s configurable; auditoría sin motivo. Políticas RLS y actor autenticado.
2. **Dominio transaccional:** solicitar, consultar, aprobar/rechazar, caducar y revocar; rechazo no habilita nueva solicitud antes de vencer ventana; impedir respuesta tardía. Aprobación no traslada. Confirmar primer pedido desde otra mesa consume permiso una sola vez y traslada cuenta/destino operativo de pendientes sin re-despachar ni alterar saldos.
3. **HTTP y contratos:** rutas autenticadas para cliente y sala, errores tipados, comprobación de rol, CSRF/origen, no confiar en reloj cliente ni en mesa origen enviada por el navegador.
4. **PWA cliente:** conservar visita y stream de origen al escanear otra mesa; QR candidato separado de vinculación; solicitar permiso sin destino; mensajes y cuenta atrás discretos; notificaciones automáticas; confirmar pedido en destino solo con permiso vigente; no cambiar la mesa al escanear.
5. **PWA sala/cocina:** bandeja pendiente, Aprobar/Rechazar sin motivos; expiración automática; destino de entrega actualizado para pedidos pendientes con origen histórico visible.
6. **Pruebas:** PG17 real (vencimiento exacto, carreras, unicidad, aislamiento), API, Playwright cliente/sala, pagos Stripe parciales/pendientes, agrupación, reintentos, eventos SSE, mesas bloqueadas, QR revocado y regresión H6. CI antes de Draft PR listo para revisión.

## Invariantes de seguridad

- Escaneo, solicitud, rechazo y expiración no alteran vínculo, deuda, pagos ni pedidos.
- Aprobación tampoco altera vínculo; el primer pedido confirmado desde otra mesa es el único disparador.
- Nunca mezclar cuentas de comensales, re-cobrar, duplicar comandas ni filtrar eventos de otra visita.
- No operar contra Supabase productivo ni VPS compartido; no tocar Fleetia; no hacer merge ni despliegue sin autorización.

## Criterio de cierre

No marcar el bloque como terminado hasta disponer de implementación completa, migración comprobada en PG17 aislado, pruebas E2E y CI verificadas. 
