# CartaViva / Sabora — continuidad para sesión 14 (ChatGPT)

Fecha: 2026-10-30. Este documento es **contexto de continuidad, no normativa**. La fuente de verdad son los contratos y requisitos normativos vigentes del repositorio GitHub `jdlc86/CartaViva`. No inventar ni reinterpretar decisiones; leerlos antes de modificar código.

## 1. Instrucción para el siguiente ChatGPT

Continúa el desarrollo de Sabora de forma autónoma, priorizando **bloques funcionales completos** (código + tests + PostgreSQL 17 aislado + browser/axe cuando aplique + CI + documentación + comentario PR), en lugar de correcciones menores aisladas. Consulta primero el HEAD actual de la rama y el estado del PR; este handoff puede quedar desactualizado por trabajo concurrente. Si una prueba falla, diagnostica, corrige y repite; utiliza esperas shell o consultas de estado de GitHub Actions sin requerir aprobaciones del usuario para operaciones de desarrollo autorizadas. No afirmar cierre sin evidencias. **La siguiente sesión es ChatGPT, no Codex**: utilizar las herramientas GitHub disponibles directamente, no delegar por defecto a Codex.

## 2. Alcance y prohibiciones absolutas

- Repositorio autorizado **exclusivamente**: `jdlc86/CartaViva`. Se permite crear ramas, editar, commits, PR Draft y ejecutar Actions solo aquí.
- Sabora: **un único restaurante por instalación**, dos PWA independientes: cliente y gestión.
- No hacer merge, despliegue, activación productiva, migración ni intervención en Supabase operativo o VPS sin autorización expresa.
- VPS compartido con **Fleetia** y otros proyectos: no tocar ni depender de sus contenedores, redes, volúmenes, servicios, puertos o procesos. Desplegar/reiniciar/eliminar Sabora nunca puede afectar otros proyectos.
- Respetar diseño premium, identidad visual aprobada y flujos normativos; no cambiar la UX por inferencia.
- Documentos normativos tienen prioridad sobre handoffs, planes y comentarios de PR.

## 3. Puntos de acceso y estado observado

- PR: https://github.com/jdlc86/CartaViva/pull/40 — **Draft, abierto** al consultar el 2026-10-30.
- Rama: `integration/sabora-activation-readiness-20261028`.
- HEAD observado al preparar este handoff: `22cd2d5c3cd9cc27518041a63175d3ceaa5e1cf2`. **Reconsultar HEAD**, pues puede avanzar en paralelo.
- Plan: `docs/assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md`.
- Cierre técnico documentado: `docs/reviews/SABORA_BLOCK_01_FULL_STACK_CLOSURE_2026-10-30.md`.
- Inventario: `docs/reviews/SABORA_FIRST_PILOT_READINESS_INVENTORY_2026-10-29.md`.
- Runbook: `docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md`.
- Contrato funcional: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`; verificar también consistencia, QR V1, roles/autorización, diseño y arquitectura.

### Bloque 1: cierre técnico aislado acreditado

El documento `SABORA_BLOCK_01_FULL_STACK_CLOSURE_2026-10-30.md` declara **PASS técnico aislado** en SHA `e3d17db469cfcec76280be49268dd0c3d0f38bab`: una factoría opt-in H3/H4, seis principals PostgreSQL 17 restringidos, cookie HttpOnly de cliente, JWT/JWKS RS256 de personal, QR V1, visita, catálogo, cotización, confirmación, agrupación de 300 s, cocina `confirmed→preparing→ready`, sala `picked_up`, idempotencia, concurrencia, revocación, historial, RLS, rollback, dos PWA en Chromium, axe y responsive. Evidencias 4/4 Actions PASS: CI `41003487653`, bootstrap `41003487513`, cliente `41003487585`, gestión `41003487619`. Reporta 1.082/1.082 tests Node, gestión 55/55 y cliente Playwright 32/32. No confundir con activación operativa: `apps/api/src/server.mjs` continúa **health-only** y la factoría es opt-in.

### Trabajo posterior de H4

El plan de seguimiento registra además SHA `e52ff5a339e094b9bd19673ac151880f68cccc31`: transporte real `apps/management/src/order-operations-authenticated-gateway.js` contra rutas H4 Fastify y PG17 aislado; 4/4 CI PASS (`41006419381`, `41006419329`, `41006419461`, `41006419340`). La identidad del test específico se inyecta en preHandler de prueba; no sustituye las suites JWT reales del cierre. **Atención:** una nota posterior del plan dice que el Bloque 1 sigue abierto, mientras que el expediente de cierre documenta PASS aislado. Reconciliar cronología, SHA y alcance antes de cambiar estado. No degradar el cierre validado ni atribuir certificación productiva.

## 4. Siguiente prioridad

1. **Reconciliar estado actual**: leer normativa, HEAD, PR #40, últimas commits, CI y documentos de cierre; confirmar que el Bloque 1 permanece PASS técnico aislado y no hay regresiones ni trabajo concurrente pendiente.
2. **Avanzar Bloque 2 del plan vigente**, sin rehacer el Bloque 1: seleccionar un entregable funcional completo y verificable según los criterios normativos actuales. El plan de cinco bloques contempla recorrido QR/visita/catálogo/pedido/cocina/sala; contrastar qué partes quedaron cubiertas por Bloque 1 y concretar los faltantes de experiencia real y aceptación antes de implementar. Evitar duplicación de pruebas ya acreditadas.
3. Preparar el siguiente bloque sustancial de forma autónoma, con pruebas aisladas y CI; actualizar documentación de progreso, registrar SHAs/evidencias en PR #40 o abrir PR Draft autorizado si el alcance lo exige. No cambiar el servidor por defecto a modo operativo ni tocar infraestructura real.
4. Bloques posteriores: Estudio de Imágenes **Google Gemini** sujeto a `docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md` (original inmutable, derivadas privadas, aprobación/publicación humana explícita, cuotas y límites de coste), preparación de infraestructura Sabora aislada, certificación del piloto. No invocar servicios facturables ni aprovisionar claves sin autorización.

## 5. Método de trabajo recomendado para ChatGPT

- Descubrir herramientas `mcp__GitHub__*` mediante `functions.exec` y `ALL_TOOLS`; leer ficheros con `fetch_file`, escribir en la rama con `create_file`/`update_file`, verificar runs con `fetch_commit_workflow_runs` y logs de jobs si fallan. No trabajar sobre `main` por accidente.
- Revisar la fuente normativa, diseñar la matriz requisito→código→test, implementar un bloque completo, ejecutar CI y comprobar conclusiones **SUCCESS** antes de declarar cierre.
- Si se requiere PostgreSQL, usar solo PG17 desechable en CI/harness aislado; jamás la instancia Supabase operativa. Evitar credenciales reales en commits, logs o comentarios.
- Revisar PR/HEAD de nuevo antes de cada escritura para evitar sobrescribir cambios concurrentes.
- Para hitos, actualizar los documentos de implementación y evidencias; este handoff nunca reemplaza el contrato normativo.

## 6. Prompt corto de arranque

> Continúa CartaViva/Sabora desde `docs/handoffs/SESSION_14_HANDOFF_2026-10-30.md` en `jdlc86/CartaViva`, PR Draft #40. Eres una **nueva sesión de ChatGPT, no Codex**. Lee primero el HEAD, la normativa y el cierre del Bloque 1; reconcilia las notas de seguimiento. Prioriza el siguiente **bloque funcional completo**, implementa código y pruebas reales aisladas (PG17/browser cuando corresponda), corrige fallos y espera CI por shell sin pedirme intervención. Documenta y deja evidencias en GitHub. Sin merge ni despliegue; no tocar Supabase operativo, VPS ni Fleetia. Respeta estrictamente el diseño y flujos aprobados.
