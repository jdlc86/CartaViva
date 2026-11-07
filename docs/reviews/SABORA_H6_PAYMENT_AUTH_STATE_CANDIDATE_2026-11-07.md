# Sabora / H6 — consulta económica autenticada y recuperación segura SCA (07-11-2026)

> **CANDIDATO TÉCNICO AISLADO, sin pasarela Stripe real ni aprobación de operación.** Este informe es evidencia de implementación y seguimiento, no normativa. Regla primaria: [contrato funcional consolidado §§ Pagos, Stripe, Seguridad](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), sin reinterpretación.

## Hallazgo verificado antes del cambio

En el árbol anterior al SHA de trabajo, el callback inyectable `confirmStripePayment` en `apps/client/src/App.tsx` podía poner una compra en estado visual «confirmed» después de la resolución de una acción de autenticación en navegador, sin consultar una acreditación servidor/SQL del estado de autorización. El `main.tsx` ordinario **no** conecta Stripe Elements ni ese callback; la vulnerabilidad semántica correspondía al candidato con callback inyectado, no demuestra cobro duplicado en producción. El reintento del checkout, la recuperación de respuesta HTTP perdida y las notificaciones ajenas exigían reconciliación estricta por pedido y sesión.

## Implementación en PR #49 Draft

**SHA funcional candidato `79ef87bac0395dae9dda5ae017e32d0fc97cc281`.** Los commits de la serie incorporan:

1. `apps/api/src/h6-customer-payment-state.mjs`: lector limitado por cookie de cliente, mesa, visita y **orderId propio**, que reutiliza la función SQL existente `read_customer_round_h6_candidate`, con `SECURITY DEFINER` y concesión ya existente a rol H6. Respuesta reducida a `orderId`, `paymentMode`, `roundState`; sin claves, client secrets, IDs internos de tentativa ni lectura de otra cuenta.
2. `apps/api/src/h6-candidate-composition.mjs`, `h6-customer-payment-flow.mjs` y `customer-production-http.mjs`: allowlist exacta de una sentencia SQL adicional y GET `/api/v1/customer/orders/:orderId/payment-state?tableId=&visitId=`, protegido por la misma sesión, mismo origen, parámetros únicos autorizados y `Cache-Control: no-store`. Se permanece en composición **opt-in**, no en el servidor ordinario.
3. `apps/client/src/customer-flow-transport.ts` y `App.tsx`: lectura validada del estado SQL, identidad del pedido pendiente conservada en memoria y reutilización de la misma intención; callback SCA del navegador nunca acredita un cobro ni despacho; eventos SSE correlacionados por `orderId`; recuperación de respuesta HTTP incierta sin promocionar un pedido simplemente persistido a pago confirmado. Reintentar SCA exige antes verificar que esa operación **sigue pendiente**.
4. **Pruebas integradoras en lugar de micropruebas:** `scripts/ci/h6-postgres17.test.mjs` continúa el mismo pedido HTTP/Fastify real hasta el lector del rol restringido PostgreSQL17 y la transición firmada de proveedor; verifica bloqueo de sesión o visita ajena y de parámetros de consulta impropios. `apps/client/e2e/client-premium.spec.ts` ejercita con Chromium móvil y escritorio la autenticación sin éxito económico, reintentos sin nueva confirmación y progresión solo cuando la API informa estado de autorización.

**No se han añadido migraciones, roles, tablas o permisos directos**, ni se ha conectado el componente externo de Stripe, manipulado claves/credenciales ni ejecutado cobros de prueba remotos. La fuente de acreditación económica es el servidor con evidencia de proveedor, no una notificación del navegador. Distinguir autorización de cargo capturado y cocina.

## Estado de verificaciones en este corte — SHA `79ef87bac0395dae9dda5ae017e32d0fc97cc281`

- [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/42408539732) — **FAILURE**.
- [Bootstrap Sabora lockfile](https://github.com/jdlc86/CartaViva/actions/runs/42408539817) — **FAILURE**.
- [Sabora client browser conformance](https://github.com/jdlc86/CartaViva/actions/runs/42408539806) — **SUCCESS**.
- [Sabora management browser visual smoke](https://github.com/jdlc86/CartaViva/actions/runs/42408539740) — **SUCCESS**.
- [Sabora CV-012 independent PWA installability](https://github.com/jdlc86/CartaViva/actions/runs/42408539744) — **SUCCESS**.

**No cerrar técnicamente este hito hasta 5/5 SUCCESS del mismo SHA.** Las pruebas Chromium de pantalla utilizan fixtures; el recorrido PostgreSQL 17 real se ejecuta en H6 CI/Bootstrap. Aunque la suite quede verde no equivale a validación con proveedor auténtico.

## Puertas y límites

- B0/EC-08: **todavía pendiente** conexión autorizada del componente Stripe.js/Elements desde `apps/client/src/main.tsx`, SCA/3DS remota y validación bancaria auténtica.
- F20/R03–R05 y M4 global: PARCIAL/BLOQUEADO por autorización/captura/reembolso real en Stripe sandbox, pago digital de terceros, propinas digitales, reconciliación y aceptación externa.
- F28/R09: revisión humana de UX y estilo aprobados pendiente; M6 producción NO-GO, F12/R08 opt-in.
- PR #49 sigue Draft. Nada fusionado/desplegado; Fleetia, VPS y Supabase operativo intactos.

[SABORA_LIVE_PROJECT_TRACKER](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [continuidad sesión 28](../handoffs/SESSION_28_HANDOFF_2026-11-07.md).
