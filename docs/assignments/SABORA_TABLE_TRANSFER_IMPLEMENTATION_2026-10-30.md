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

## Seguimiento

- Reglas puras de solicitud, plazo y consumo único añadidas a `apps/api/src/table-change-policy.mjs`.
- Pruebas unitarias añadidas y registradas en el comando `test`.
- Migración candidata `20261030124000_sabora_table_change_candidate.sql` incorporada: tabla de solicitudes, configuración de ventana, índices, aprobación única y RLS sin grants de ejecución. **No aplicada ni verificada en PostgreSQL 17**; no representa cierre de persistencia.\n- Pendiente: funciones SQL autenticadas y permisos mínimos, bloqueo y auditoría transaccionales, conexión efectiva de rutas HTTP, integración atómica H6, pruebas PG17 y navegador.


## Auditoría de integración H6 — 30 de octubre

La función existente `sabora.confirm_customer_round_h6_candidate` llama a
`sabora.persist_customer_order_candidate` **antes** de localizar la cuenta H6.
A continuación inserta `customer_accounts(table_id,session_id,visit_key,customer_id)`
con `ON CONFLICT DO NOTHING` y busca esa misma combinación con `FOR UPDATE`.
Por tanto, añadir `applyTransfer` después de esta función **no es seguro**:
el pedido de destino podría quedar asociado a otra cuenta, y cambiar únicamente
`customer_accounts.table_id` no repara los vínculos ni los destinos de entrega.

La migración candidata de cambio de mesa crea `consumed_order_id` y un índice
de aprobación única, pero **no** redefine el procedimiento H6 de confirmación
ni establece el recorrido seguro para transferir una cuenta con consumición.

### Requisitos de la siguiente implementación indivisible

1. Reestructurar la confirmación SQL de forma que la cuenta de origen y la
   autorización aprobada se bloqueen antes de persistir el primer pedido de
   destino; validar QR, sesión, visita y mesa de destino en la misma transacción.
2. Garantizar que `order_rounds.account_id` se vincule a la cuenta original,
   sin crear una cuenta económica nueva en destino; conservar deuda, intentos de
   pago y claves de idempotencia.
3. Consumir el permiso y actualizar los destinos operativos pendientes sin
   modificar `orders.table_id` históricos ni relanzar comandas.
4. Resolver las dependencias de unicidad de `customer_accounts` y de
   `customer_table_visits` antes de introducir un `UPDATE table_id`.
5. Verificar las rutas de lectura, SSE, autorizaciones y políticas RLS en ambos
   lados del traslado. Exigir PG17 real y E2E antes de declarar cierre.

**Estado:** el adaptador JS es un candidato parcial, no está integrado en el
procedimiento SQL H6 y no debe habilitarse como traslado operativo.


## Auditoría de la composición H6 y privilegios — 2026-10-30

`apps/api/src/customer-production-composition.mjs` monta el flujo H6 mediante `createRoleScopedPostgresTransaction`, con el rol `sabora_h6_customer_runtime` y una allowlist exacta de tres sentencias SQL (`READ_H6_PAYMENT_POLICY_SQL`, `READ_H6_ROUND_SQL`, `PERSIST_H6_ORDER_SQL`). `apps/api/src/role-scoped-postgres.mjs` rechaza cualquier SQL distinto con `role_scoped_sql_not_allowed`. Por tanto, el adaptador de cambio de mesa, que actualmente emite consultas SQL directas, no puede conectarse sin cambios a esa composición. `apps/api/src/h6-sql-preflight.mjs` también exige una superficie exacta de funciones ejecutables por rol. No se deben eludir estas barreras ni conceder acceso directo a las tablas. El bloque integral debe introducir funciones SQL restringidas, sus autorizaciones mínimas, la composición allowlisted, preflight actualizado, transacción de confirmación con cuenta original y redirección de entregas; después PG17 real y E2E. El traslado continúa deshabilitado.


## Decisión arquitectónica del propietario — integración desde la raíz

El cambio de mesa se implementará como capacidad **nativa** del dominio de cuentas, mesas y pedidos; no como parche posterior a la confirmación H6. Se autoriza refactorizar los contratos, esquema, funciones SQL, composición de roles, API y PWA, así como repetir las pruebas completas. Los documentos normativos existentes siguen siendo la fuente de verdad; este documento solo registra el plan de ejecución y no modifica requisitos.

**Bloque integral obligatorio:** (1) separar mesa de origen histórica, mesa vinculada a cuenta y destino de entrega pendiente; (2) integrar autorización y consumo del permiso dentro de la confirmación atómica del primer pedido en destino, preservando `account_id`, deuda, pagos, idempotencia y agrupación; (3) resolver claves y dependencias del esquema sin duplicar cuentas; (4) actualizar consultas de sala/cocina, eventos y aislamiento SSE; (5) integrar las PWA aprobadas y la seguridad por roles mediante funciones SQL de mínimo privilegio, allowlists y preflight; (6) repetir migraciones en PG17 aislado, concurrencia, regresión completa y E2E navegador. No se considera cerrado por aprobar una solicitud o cambiar un `table_id` aislado.

**Criterio de activación:** no habilitar traslado operativo hasta obtener evidencias verificables de todos los pasos. No hacer merge ni despliegue, ni tocar recursos de Fleetia o producción sin autorización expresa.
