# CartaViva / Sabora — Continuidad de sesión 8
Fecha: 24 de octubre de 2026
Estado: traspaso de desarrollo; NO es autorización de despliegue ni certificación de funcionalidad completa.

## 1. Instrucción de arranque obligatoria
1. Abrir el repositorio GitHub **jdlc86/CartaViva** y comprobar HEAD, rama, PR y workflows actuales antes de escribir código.
2. Leer **primero** `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, después `docs/continuity/SESSION_07_HANDOFF.md`, este documento y los contratos/ADRs vigentes que afecten al bloque elegido.
3. Contrastar las afirmaciones históricas de los handoffs con código, migraciones, tests y GitHub Actions. La documentación de GitHub es fuente de verdad; no inventar ni reinterpretar requisitos.
4. Revisar `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md` antes de tocar interfaces. No implementar módulos administrativos que colisionen con el trabajo de Codex.

## 2. Contexto y límites innegociables
- Proyecto CartaViva / Sabora: **un solo restaurante** Sabora, con PWA cliente y PWA administración independientes; CartaViva como directorio central. Otros restaurantes futuros tendrán recursos aislados.
- Repositorio autorizado exclusivamente: `jdlc86/CartaViva`. Rama de trabajo histórica `feat/sabora-pnpm-bootstrap`, PR **#2 Draft**. Confirmar estado actual en GitHub; no asumir que no ha cambiado.
- No modificar repositorios, contenedores, redes, volúmenes, secretos ni recursos de **Fleetia** o cualquier otro proyecto. El VPS es compartido. Desplegar, reiniciar o eliminar Sabora jamás puede detener, modificar o depender de Fleetia.
- **Sin merge, despliegue VPS, modificación de Supabase operativo ni acciones destructivas sin autorización expresa**. El proyecto Supabase conocido es `https://byhvmumqivmunkmomhup.supabase.co`; su mención NO autoriza operaciones.
- Se permiten commits, ramas, PR y GitHub Actions únicamente en `jdlc86/CartaViva`. No solicitar revisiones pagadas de Codex sin autorización.
- Implementar **bloques grandes, completos y coherentes**, con pruebas y documentación del hito. Evitar cambios triviales commit a commit. Trabajar autónomamente dentro de una sesión; usar espera de shell solo si es útil para pruebas, nunca afirmar trabajo en segundo plano sin automatización.

## 3. Estado verificado al cierre
- HEAD verificado antes de los commits documentales: `a79a3edf8fd603a8b3694e91fbc6ddac78d50d14`.
- `Sabora CI` run **40076744555: SUCCESS**.
- `Bootstrap Sabora lockfile` run **40076744557: SUCCESS**.
- Cierre documental sesión 7: commit `685711451d458a40009777949e3748ae2a0a1908`. El presente documento añade un commit posterior: **comprobar CI de HEAD nuevo**; no heredar el verde previo.
- Se corrigieron regresiones de mocks del cargador de catálogo y la resolución de Fastify con pnpm desde el workspace `apps/api`. Ante fallos, inspeccionar logs y corregir la causa, sin relajar controles.
- La estimación informal histórica ~45 % no es una métrica certificada. Informar avance por funcionalidades efectivamente integradas, no por cantidad de archivos.

## 4. Arquitectura y piezas ya presentes
- Monorepo pnpm; `apps/api` (Fastify/Node), `apps/client` (React/TypeScript/PWA), `apps/management` (interfaz administrativa de Codex), migraciones SQL bajo `supabase/migrations`, pruebas bajo `tests`.
- `apps/api/src/server.mjs` sigue siendo un servidor básico de health/ready y demostración de dominio; **verificarlo antes de afirmar que rutas de negocio están activadas**.
- Catálogo publicado: `apps/api/src/catalog-http-route.mjs`, `catalog-scoped-query.mjs`, `catalog-reader-query.mjs`, `apps/client/src/catalog.ts`, `catalog-loader.ts`, `main.tsx`. La PWA ofrece consulta, búsqueda y filtros; no implica autenticación.
- Confirmación de pedidos (candidatos no operativos): `customer-order-confirmation-http-candidate.mjs`, `customer-order-confirmation-pool-composition-candidate.mjs`, `catalog-order-confirmation-candidate.mjs`, `catalog-confirmation-coordinator.mjs`, `catalog-confirmation-repository.mjs`, `catalog-visit-context-repository.mjs`, `catalog-order-writer.mjs`, `postgres-transaction.mjs`, y `apps/client/src/order-confirmation-transport.ts`.
- Composición HTTP opt-in: `apps/api/src/isolated-customer-composition-candidate.mjs` (pools lector/escritor distintos); `isolated-pool-identity-preflight.mjs` y `verified-isolated-customer-composition-candidate.mjs` (preflight de identidades). **No prueban por sí solos grants/RLS ni PostgreSQL real**.
- Pruebas relevantes: `tests/isolated-customer-composition-candidate.test.mjs`, `tests/isolated-pool-identity-preflight.test.mjs`, `tests/verified-isolated-customer-composition-candidate.test.mjs`, `tests/customer-order-confirmation-transport.test.mjs`, `tests/client-catalog-loader.test.mjs` y las pruebas de composición/confirmación ya existentes.
- Administración Codex: interfaz visual entregada en PR #3 e integrada históricamente en #2. Evitar conflictos; conciliar solo cuando el usuario confirme el estado final del trabajo paralelo.

## 5. Objetivo prioritario de sesión 8: hito vertical real
Entregar el máximo bloque funcional coherente que permita validar, en entorno **aislado y desechable**, el recorrido:
**QR de mesa válido → autorización de visita/cliente → catálogo publicado → selección/cotización → confirmación idempotente y atómica → registro durable visible para cocina**.

Antes de implementar:
1. Auditar el contrato funcional vigente de QR, identidad, permisos de cuenta, ventana de agrupación de 5 minutos, consentimiento económico, cocina, cancelaciones, pagos y estados; no asumir que los módulos candidatos cubren el contrato completo.
2. Identificar qué migraciones, roles mínimos, grants y RLS ya existen y qué falta; no crear un atajo de autenticación ni usar service_role para el cliente.
3. Preparar composición real para pruebas con PostgreSQL 17 desechable y credenciales independientes; nunca usar Supabase operativo como banco de pruebas.
4. Probar autorización y revocación QR/visita, dos dispositivos, idempotencia con reintentos y fallo de red, carreras de última unidad, rollback de orden/ledger, publicación y agotados, y despacho durable a cocina según el contrato.
5. Solo conectar acciones reales a la PWA cuando existan rutas seguras y pruebas de integración. Si no, mantener explícito el estado no operativo; no presentar una demo simulada como producción.
6. Documentar diseño, comandos reproducibles, resultados y límites. Si el bloque exige tocar administración de Codex, aislar cambios o esperar conciliación autorizada.

## 6. Puertas de calidad y método
- Hacer primero un inventario corto de brechas contra contratos. Seleccionar un **hito completo** con diseño, implementación, migración si procede, tests unitarios/integración y documentación, preferentemente un único commit coherente o un número reducido de commits significativos.
- Ejecutar tests y builds del monorepo y gates de CI. Verificar el SHA exacto y los dos workflows tras el último commit. Si fallan, inspeccionar logs y corregir antes de declarar éxito.
- Las pruebas con mocks acreditan solo comportamiento de adaptadores. Exigir evidencia real de PostgreSQL 17, aislamiento de roles, concurrencia y RLS antes de afirmar que el escritor transaccional está validado.
- No hacer merge del PR #2 ni despliegue por iniciativa propia.
- Registrar en documentación los hitos importantes, riesgos y pendientes; preparar siguiente handoff si se agota la sesión.

## 7. Riesgos abiertos que NO deben ocultarse
- Falta verificar el flujo completo QR/visita/identidad hasta cocina; múltiples piezas siguen siendo candidatos no registrados en runtime.
- Preflight de identidad con dobles no certifica los roles efectivos/grants/RLS del servidor real.
- La confirmación HTTP actual devuelve `acceptance_required` sin DTO público versionado de recotización; no eludir consentimiento explícito.
- PWA cliente todavía no debe afirmar que se ha registrado/autenticado ni permitir pedidos reales sin visita válida.
- Pagos Stripe, caja, propinas, cancelaciones, notificaciones SSE/WebSocket, reconciliación y dashboard requieren sus propias puertas contractuales y pruebas; no dar por terminados.
- El CI del commit que introduce **este** handoff debe verificarse de nuevo.

## 8. Primera respuesta esperada de sesión 8
Informar el HEAD/PR/CI reales, resumir brechas relevantes del contrato, escoger un bloque vertical completo y comenzar su implementación con autonomía. Priorizar resultados probados frente a informes de progreso repetitivos. Al finalizar, indicar commits, tests, CI y qué NO está operativo.
