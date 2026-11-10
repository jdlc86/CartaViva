# Sabora — cierre del Bloque 1 full-stack H3/H4

Fecha de cierre técnico: 2026-10-30  
PR: [#40 Draft](https://github.com/jdlc86/CartaViva/pull/40)  
Rama: `integration/sabora-activation-readiness-20261028`  
SHA funcional validado: `e3d17db469cfcec76280be49268dd0c3d0f38bab`  
Estado: **PASS en el alcance aislado del Bloque 1; activación y producción continúan BLOCKED**.

## Decisión

El Bloque 1 descrito en `docs/assignments/SABORA_CODEX_BLOCK_01_FULL_STACK_2026-10-29.md` queda cerrado como candidato técnico aislado. Una única factoría Fastify opt-in integra H3 y H4 sobre PostgreSQL 17 real y seis LOGIN de privilegios mínimos. El pedido creado desde la PWA cliente llega al tablero de cocina y sala de la misma instancia HTTP, atraviesa `confirmed → preparing → ready → picked_up`, conserva replay e historial y se verifica con JWT RS256/JWKS reales.

Las dos PWA se ejecutan en Chromium contra adaptadores reales. La evidencia no usa `Fastify.inject` como sustituto de la validación visual: el navegador accede a servidores Vite aislados y estos encaminan al listener Fastify del candidato. `Fastify.inject` permanece únicamente en pruebas de API y transporte que no se presentan como navegador.

No se activó `server.mjs`, que continúa `health-only`. No hubo merge, despliegue, acceso a Supabase operativo, VPS, Fleetia, workers, correo ni proveedor facturable.

## Matriz de aceptación

| Criterio del encargo | Estado | Implementación | Evidencia |
| --- | --- | --- | --- |
| Factoría H3/H4 única, positiva y negativa | PASS | `restaurant-flow-candidate-app.mjs` monta catálogo, registro, sesión, visita, cotización, pedido y operaciones solo después de todos los preflights | PG17 completo, tests de factoría y readiness 200/503 |
| Cinco principals mínimos sin administrador | PASS | Seis pools y seis LOGIN distintos: catálogo, registro, sesión, flujo cliente, lectura de personal y operaciones; `NOINHERIT`, `NOBYPASSRLS`, sin superusuario | Inspección `pg_roles`, denegación de tablas, `SET ROLE`, DDL y ejecución fuera de wrappers |
| Autenticación real de personal | PASS | Bearer JWT RS256, `kid`, issuer, audience, JWKS y pertenencia activa consultada con principal separado | Cocina/camarero válidos; token inválido, rol falsificado y personal suspendido rechazados |
| Registro y sesión cliente | PASS | Cookie privada `__Secure-sabora_customer`, HttpOnly/Secure/SameSite y origen exacto; excepción HTTP limitada a loopback de pruebas | Registro, recuperación, logout, cookie revocada y origen cruzado |
| QR V1, visita, catálogo, quote y confirmación | PASS | Candidato explícito H3, catálogo público por principal propio y QR canónico revocable | QR de 32 bytes, visita, selección, quote, confirmación, replay, expiración y denegaciones |
| Atomicidad, rollback e idempotencia | PASS | Transacciones PostgreSQL y claves durables existentes, sin éxito inferido | Confirmaciones concurrentes, una orden/una línea, replay, conflicto, rollback de quote y de operaciones |
| Agrupación normativa | PASS | Ventana persistida de 300 segundos | Segundo pedido de mesa queda `grouped`; no se fabrica una orden H4 |
| Cocina y sala sobre el mismo pedido H3 | PASS | Gateway autenticado real contra la misma factoría | `confirmed → preparing → ready → picked_up`, notificación, historial y replay con el mismo `orderId` |
| Límites de rol y separación cliente/gestión | PASS | Cookie cliente y bearer personal usan fronteras distintas | Cliente recibe 401 en operaciones; camarero no prepara; cocina no recoge; cabecera de rol no suplanta JWT |
| Concurrencia y revocación | PASS | Capabilities HMAC y wrappers SQL ya normativos se ejercitan con locks reales | Reintentos paralelos, correlaciones competidoras, suspensión inmediata y ausencia de mutación parcial |
| Errores ambiguos y de red | PASS | El cliente conserva la clave de idempotencia; gestión normaliza red a `network_error` sin filtrar host/driver | Unit tests, Playwright cliente y aceptación integrada |
| PWA cliente real | PASS | `candidate.html` y `candidate-main.tsx` activan solo el flujo H3 aprobado; no exponen cocina, gestión ni pago H6 | Chromium 390×844, Axe, confirmación real y captura visual |
| PWA gestión real | PASS | Montaje autenticado por identidad, gateway bearer efímero y fencing de sesión | Chromium cocina, sala e historial; Axe; 390×844 y 1440×1000 sin overflow |
| Sin polling periódico | PASS | El candidato intenta como máximo una conexión SSE por identidad montada; no sondea estado de negocio | Registro de requests del navegador y aserción acotada en PG17/Chromium |
| Readiness fail-closed | PASS | Revalida las seis identidades/capacidades y responde 503 genérico ante deriva | Tests positivos, negativos y PG17 real |
| Evidencia y CI | PASS | Artefacto de screenshots se publica aun si falla el test para facilitar diagnóstico | Cuatro workflows SUCCESS del SHA funcional |

## Cambios principales

- Se separó el lector de catálogo de los tres principals H3 existentes y de los dos H4. La factoría exige seis pools y seis nombres de rol únicos.
- El preflight de catálogo comprueba el privilegio de función por OID, sin requerir `USAGE` adicional sobre el esquema al writer ni ampliar autoridad.
- Se centralizó la validación de origen cliente: HTTPS obligatorio y HTTP permitido únicamente para `localhost`, `127.0.0.1` o `[::1]` cuando el harness lo solicita explícitamente.
- Se añadió un bootstrap PWA cliente candidato H3 que no modifica el flujo H6 existente ni expone cocina/gestión.
- El montaje de gestión admite un intervalo de reconexión acotado e inyectado; el test usa el máximo contractual, sin polling.
- Los fallos de transporte de gestión se normalizan a `OrderOperationsGatewayError('network_error')`; logout y cancelación conservan su semántica de abort.
- Se corrigieron contraste WCAG de insignias compactas y cabecera operativa, y el historial/las tarjetas operativas colapsan a una columna en móvil.
- La aceptación PG17 abre listeners efímeros loopback, conduce ambas PWA con Chromium, ejecuta Axe y conserva screenshots como artefacto.

Archivos modificados respecto del punto de partida del encargo:

```text
.github/workflows/ci.yml
apps/api/src/customer-cookie-session-candidate.mjs
apps/api/src/customer-origin.mjs
apps/api/src/customer-production-app.mjs
apps/api/src/customer-production-app.test.mjs
apps/api/src/customer-production-composition.mjs
apps/api/src/customer-registration-http-candidate.mjs
apps/api/src/isolated-customer-sql-capabilities-preflight.mjs
apps/api/src/restaurant-flow-candidate-app.mjs
apps/api/src/restaurant-flow-candidate-app.success.test.mjs
apps/api/src/restaurant-flow-candidate-app.test.mjs
apps/api/src/table-qr-credential.mjs
apps/client/candidate.html
apps/client/src/App.tsx
apps/client/src/candidate-main.tsx
apps/client/src/components/CheckoutPanel.tsx
apps/management/src/main.tsx
apps/management/src/order-operations-authenticated-gateway.js
apps/management/src/style.css
apps/management/tests/order-operations-authenticated-gateway.test.mjs
apps/management/tests/ui-contract.test.mjs
scripts/ci/customer-production-postgres17.test.mjs
tests/isolated-customer-sql-capabilities-preflight.test.mjs
tests/table-qr-contract.test.mjs
tests/verified-customer-api-candidate.test.mjs
tests/verified-isolated-customer-composition-candidate.test.mjs
```

## Defectos encontrados y corregidos durante la aceptación

1. El QR canónico rechazaba correctamente HTTP, pero el navegador desechable necesitaba una excepción explícita y limitada a loopback. Se añadió sin relajar producción.
2. El preflight resolvía la firma textual de una función y exigía indirectamente visibilidad de esquema. Se cambió a OID para conservar privilegio mínimo.
3. Una aserción de catálogo asumía una base vacía aunque el harness aplica todas las migraciones/fixtures. Ahora acredita los IDs del escenario sin ocultar filas válidas preexistentes.
4. El transporte browser usaba un origen HTTPS distinto del listener loopback. Se alineó con el origen exacto autorizado.
5. El intervalo SSE de la prueba excedía el máximo contractual. Se corrigió a 30 segundos, sin sondeo periódico.
6. La UI H4 se comprobaba mediante una etiqueta de asignación H6. Ahora acredita el estado contractual `Lista para recoger` y mantiene la comprobación SQL y el ciclo de recogida posterior.
7. Axe descubrió contraste insuficiente en las superficies warning compactas. Se ajustó solo el tinte de fondo, conservando el token de color aprobado.
8. Chromium descubrió overflow del historial operativo en 390 px. Las columnas fijas de escritorio ahora colapsan de forma explícita.
9. El gateway de gestión propagaba el texto privado del error de red. Ahora devuelve un código controlado y probado.

## Pruebas y resultados

Validación local final:

- `npm run check`: **PASS**, 1.082/1.082 tests Node, typecheck/build de API, cliente y gestión, y `production_config_gate_ok`.
- `pnpm --filter @sabora/management test`: **PASS**, 55/55.
- `pnpm --filter @sabora/client test:e2e`: **PASS**, 32/32 en Chromium móvil y escritorio.
- Aceptación focalizada `customer-production-postgres17.test.mjs`: **PASS**, PostgreSQL 17 + Chromium real, 1/1.
- `node --check`, `bash -n` y `git diff --check`: **PASS**.

GitHub Actions del SHA funcional `e3d17db469cfcec76280be49268dd0c3d0f38bab`:

- [Sabora CI 41003487653](https://github.com/jdlc86/CartaViva/actions/runs/41003487653): **SUCCESS**.
- [Bootstrap Sabora lockfile 41003487513](https://github.com/jdlc86/CartaViva/actions/runs/41003487513): **SUCCESS**.
- [Sabora client browser conformance 41003487585](https://github.com/jdlc86/CartaViva/actions/runs/41003487585): **SUCCESS**.
- [Sabora management browser visual smoke 41003487619](https://github.com/jdlc86/CartaViva/actions/runs/41003487619): **SUCCESS**.

El artifact `sabora-block-01-full-stack-browser` del CI principal contiene la confirmación cliente a 390 px y el historial de gestión a 390 y 1440 px. Su retención de CI es de siete días; la prueba que lo produce queda versionada.

## Commits del bloque

- `16631ed52c15bbc228af78f7a96114ba6630c942` — composición y aceptación full-stack candidata.
- `1c18028fe65744e0694e6d5f1a460ff881bb254a` — QR loopback explícito para tests.
- `6b71c6b091ce56f020b8f1cfb5fda7ac45558d47` — preflight de catálogo por OID.
- `a039777e5858a244b9b0820661a903f07d68e340` — aislamiento de aserciones de catálogo.
- `a91d83bee5a50fddf3a5526568422ccc47ac484d` — origen browser loopback.
- `e3c31b2bbf0a28e7f7051711afa25647b56dd43c` — límite contractual de reconexión.
- `9bf0dba594840913113df5abf6d53eddac3ef9de` — estado H4 listo correcto.
- `f42edbc233cd42fe5882fb08b62f635d0343b92b` — contraste de insignia warning.
- `e3d17db469cfcec76280be49268dd0c3d0f38bab` — cierre de accesibilidad, responsive y red.

## Límites y gates bloqueados

| Gate posterior | Estado | Motivo |
| --- | --- | --- |
| Activar la composición en `server.mjs` | BLOCKED | El encargo exige mantenerla opt-in y no autoriza activación operacional |
| Provisión de roles, secretos, dominio y TLS reales | BLOCKED | Requiere entorno/secret manager autorizado; CI usa material efímero ficticio |
| Migraciones o pruebas sobre Supabase operativo | BLOCKED | Prohibido expresamente |
| Despliegue, VPS o validación material de infraestructura | BLOCKED | Requiere autorización separada; no se ha intervenido |
| Merge del PR | BLOCKED | PR #40 permanece Draft y no existe autorización de merge |

Estos bloqueos no son faltantes del Bloque 1 aislado: son puertas de activación/producción expresamente fuera de alcance. El siguiente bloque no debe interpretar este PASS como `GO` de producción.
