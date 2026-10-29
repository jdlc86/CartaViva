# Encargo Codex — BLOQUE 1: cierre completo de integración Sabora (2026-10-29)

**Repositorio exclusivo:** `jdlc86/CartaViva`. **Rama de trabajo:** partir de `integration/sabora-activation-readiness-20261028` (PR #40 Draft). **Estado:** encargo de implementación y validación aislada; **NO autoriza merge, despliegue, intervención en VPS ni Supabase operativo**.

## Objetivo único y criterio de terminado
Entregar un **bloque funcional completo y probado** de integración cliente → API H3/H4 → cocina/sala, sin dispersarse en correcciones menores. Un pedido originado desde el transporte real de cliente, persistido en PostgreSQL 17 aislado, debe ser consultable y operable mediante el **transporte autenticado real de la PWA de gestión** y la **misma instancia HTTP**. Completar pruebas de navegador de ambas PWA cuando el harness lo permita. No declarar cerrado el bloque si falta alguna parte crítica; etiquetar claramente `BLOCKED` los gates que exijan autorización.

## Fuente de verdad obligatoria
Leer primero los documentos **normativos** vigentes del repositorio: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`, `docs/architecture/SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.md`, `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/design/DESIGN_REQUIREMENTS_V1.md` y contratos normativos de identidad, roles, cocina/sala y seguridad. Los handoffs y `docs/assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md` son contexto/plan, **no sustituyen ni reinterpretan la normativa**. Respetar diseño premium y flujos aprobados.

## Base implementada (verificar, no asumir)
- PR #40 Draft; último SHA documentado `8c175a2ed674df70ac81801c6f4d2d8bdf5cf7a8`.
- `apps/api/src/customer-production-app.mjs`: ensamblaje H3 opt-in, preflight de tres identidades SQL, cookies, QR, cotización, pedido, readiness.
- `apps/api/src/restaurant-flow-candidate-app.mjs`: ensamblaje opt-in H3+H4, cinco roles SQL separados, fail-closed.
- `apps/api/src/order-operations-composition.mjs`: HTTP H4 con JWT/JWKS, autorización y principals de cocina/sala.
- `apps/client/src/customer-flow-transport.ts`: transporte real cliente con cookie same-origin.
- `apps/management/src/order-operations-authenticated-gateway.js`: gateway real de gestión con bearer efímero.
- `scripts/ci/customer-production-postgres17.test.mjs`: PG17 aislado con H3 HTTP, transporte PWA cliente, cookie, QR, cotización, pedido, agrupación de cinco minutos, y continuidad de dominio H4; CI 4/4 PASS en SHA `35b89c44a25989e12bf490f462f5011c53f3bede`.
- `apps/api/src/server.mjs` permanece **health-only por diseño de seguridad**. No abrir rutas en el servidor por defecto sin los gates normativos y sin autorización de activación.

## Trabajo que debes implementar como un bloque indivisible
1. **Preflight y contrato HTTP compartido:** comprobar la factoría H3+H4 en camino positivo y negativo contra PG17 real y cinco principals mínimos, sin mocks de autorización. Resolver errores de ensamblaje, duplicidad de rutas, aislamiento de pools, cookies, issuer/JWKS y readiness fail-closed. Mantener arranque opt-in, sin listener operativo ni cambios de despliegue.
2. **Cliente y pedido real:** usar el transporte cliente y la API HTTP reales: registro/sesión, mesa QR revocable, visita, catálogo/selección, cotización, confirmación, replay, agrupación, expiración y errores. No fabricar pedidos H4; usar el mismo `orderId` persistido por H3.
3. **Gestión real:** ejecutar el gateway autenticado de gestión contra las rutas HTTP H4 de **esa misma instancia**; verificar cocina `confirmed→preparing→ready`, aviso a sala, recogida `picked_up`, historial, idempotencia, límites de rol, revocación, token inválido, errores de red y concurrencia. Mantener prohibido que cliente acceda a rutas de gestión. No exponer estados internos de cocina al cliente.
4. **PWA y navegador:** conectar las vistas cliente y gestión a adaptadores reales en modo candidato explícito, sin degradar diseño aprobado, offline ni flujos. Crear/actualizar Playwright de las dos PWA, evidencias visuales y accesibilidad. Si una prueba completa de navegador no es viable por falta de entorno, explicar exactamente el bloqueo, sin presentar `Fastify.inject` como E2E visual.
5. **Pruebas y seguridad:** PG17 desechable (no operativo), suites Node, TypeScript, builds, Playwright/axe, negativas SQL/RLS y permisos, repetición, concurrencia, QR revocado, rollback y fail-closed. No usar secretos reales ni servicios facturables. Cualquier fallo: diagnosticar, corregir, repetir hasta PASS o bloqueo externo demostrado.
6. **Persistencia del hito:** commits incrementales de implementación, test y documentación; actualizar `docs/assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md` y expediente normativo solo si se modifica un contrato con autorización; dejar SHA, matriz norma→código→prueba, evidencias, límites y próximos gates. Mantener PR #40 **Draft**, comentar resultados. No abrir otro PR duplicado salvo necesidad técnica justificada.

## Autonomía y espera
Trabajar sin pedir confirmaciones para editar código, crear commits, ejecutar pruebas y GitHub Actions **dentro de este repositorio**. Hacer esperas por shell (`sleep`, `gh run watch`, polling acotado), no solicitar intervención humana para observar CI. Resolver fallos y relanzar. Priorizar un hito completo, no microcorrecciones inconexas.

## Límites absolutos
**No merge. No deploy. No cambios en Supabase operativo. No acceso/intervención en VPS sin autorización expresa. No tocar Fleetia ni sus contenedores, redes, volúmenes, puertos, bases de datos o procesos.** El despliegue/reinicio/borrado de Sabora debe ser autónomo y aislado de todo proyecto ajeno. No utilizar Docker global, prune ni reinicios del host. Ninguna prueba debe generar costes de Gemini/Stripe o infraestructura sin autorización.

## Entrega final obligatoria
Informar **PASS/BLOCKED** por criterio, lista de archivos, commits, SHA final, enlace PR, CI (ID y resultado), pruebas PG17/Playwright, riesgos, documentación actualizada y pendientes concretos. **No afirmar Bloque 1 cerrado** hasta cumplir criterios completos. Solo después pasar al Bloque 2 de 5.
