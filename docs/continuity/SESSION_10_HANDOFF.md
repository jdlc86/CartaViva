# CartaViva / Sabora — Continuidad para la sesión 10

**Preparado:** 25 de octubre de 2026. **Naturaleza:** documento de continuidad y contexto; NO sustituye documentación normativa ni constituye autorización de activación o despliegue.

> **Atención:** ya existen `SESSION_10_HITO_1_IDENTITY_HANDOFF.md` y `SESSION_10_HITO_1_INTEGRATION.md` como registros históricos de un hito. Este archivo es el **handoff general para iniciar la conversación/sesión 10**, independiente de aquellos documentos.

## 1. Orden obligatorio al comenzar

1. Abrir **únicamente** `jdlc86/CartaViva` en GitHub. Verificar rama, HEAD, estado real del PR #11, base, conflictos, commits y workflows **sobre el SHA exacto**. No asumir que el SHA de este handoff sigue siendo HEAD.
2. Leer primero la documentación **normativa**, empezando por `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/REQUISITOS_FUNCIONALES.md`, `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`, `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`, `docs/architecture/SABORA_INTEGRATION_PR4_PR5_READINESS.md`, `docs/security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md` y los contratos de identidad, personal, permisos y custodia relevantes.
3. Después leer `docs/continuity/SESSION_09_HANDOFF.md` y los dos documentos históricos de hito 10 mencionados arriba, solo para contexto. Contrastar todo con el código y migraciones vigentes.
4. Trabajar en bloques **grandes, completos, probados y documentados**, evitando cadenas de pequeños parches sin cierre. Si CI falla, leer logs, corregir y relanzar. Esperar resultados mediante shell `sleep` y consultas a GitHub, sin pedir al usuario que vigile los jobs.

## 2. Repositorio, PR y estado observado

- Repositorio exclusivo: `jdlc86/CartaViva`.
- Rama de trabajo actual: `integration/sabora-hito1-identity-staff`.
- PR: **#11 Draft**, base `integration/sabora-order-management-review`. Al preparar este documento GitHub devuelve `mergeable=false`, `mergeable_state=dirty`: **conflicto de integración pendiente**. No confundir CI verde en la rama con posibilidad de merge.
- Último HEAD observado **antes de crear este handoff**: `93ac16e204d482fb8535db1ec3ec5c13b7eaf967`; workflow Sabora CI **#40232203938 SUCCESS**. El commit que crea este archivo será posterior y deberá verificarse por separado.
- Los workflows se habilitaron también por `push` a la rama de integración para no depender del merge ref conflictivo del PR. Verificar que **Sabora CI** y **Bootstrap Sabora lockfile** se ejecuten sobre commits que afecten a sus filtros; no inventar una ejecución si no existe.

## 3. Arquitectura y límites

- **Sabora es un solo restaurante**, con dos PWA independientes: `apps/client` y `apps/management`; CartaViva es un directorio central separado. No añadir multitenencia operativa.
- Node.js/Fastify, PostgreSQL 17, migraciones candidatas `supabase/migrations`, pruebas Node y PG17 **desechable** en GitHub Actions.
- Confirmación de pedidos: candidato de escritor transaccional, idempotencia y proyección `orders → order_lines`. No afirmar que la PWA cliente ya completa el recorrido QR → cocina.
- Operaciones: `confirmed → preparing → ready → picked_up`. `ready` crea notificación durable para sala; `picked_up` es recogida por camarero, **no entrega al cliente**. Los eventos y solicitudes de transición son durables e idempotentes.
- La autorización de transición usa capacidad firmada verificada por PostgreSQL, identidad de actor revalidada, RPC y rol SQL restringido. El lector de personal y el login de operaciones son independientes; sus preflights comprueban ausencia de privilegios indebidos.
- `apps/api/src/server.mjs` **no monta** las rutas candidatas de operaciones, personal ni confirmación de cliente. No habilitar endpoints sin completar las puertas normativas.

## 4. Bloques de la sesión 9 verificados

1. Test Fastify + PG17 desechable del ciclo `confirmed → preparing → ready → picked_up`, aviso, historial, replay y permisos, incluido login técnico restringido.
2. Pruebas de concurrencia HTTP + PG17 restringido: reintentos simultáneos del mismo actor dan un solo evento; actores distintos compitiendo obtienen un único ganador; reutilizar correlación con otro destino responde 409 sin mutación.
3. Registro HTTP `transitionOnly: true` y `registerVerifiedOrderTransitionsOnlyFromPools`: solo POST de transición; **sin rutas GET de tablero o historial**. Dos preflights SQL independientes y autenticación inyectada; no hay montaje en producción.
4. Recuperación de CI por `push` de rama; corrección de regresión que había dejado una comprobación SQL dentro de un comentario. Pruebas negativas y positivas de aislamiento, roles, falta de auth, falta de emisor, preflight fallido y ausencia de efectos laterales.
5. Últimos commits relevantes: `bbd491f` (doble preflight, CI y Bootstrap SUCCESS), `b75a56d` (aceptación positiva de composición, CI #40231650770 y Bootstrap #40231650771 SUCCESS), `8800b1b` (validación temprana de auth), `6f07cdc` (tests de auth), `76b865b` (atomicidad frente a fallos de preflight). Revisar los commits posteriores hasta el HEAD real.
6. La documentación normativa se actualizó en `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md` para registrar alcance, pruebas y bloqueos. El verde de un SHA anterior **no certifica** los posteriores.

## 5. Prioridades de la sesión 10

**Prioridad A — cerrar el conflicto del PR #11 sin merge no autorizado.** Comparar base y rama, identificar archivos realmente conflictivos, reconciliar normativas y código preservando ambos trabajos. Puede crearse rama de integración/reconciliación y PR Draft dentro del repositorio si es necesario. No modificar otras ramas protegidas ni fusionar el PR sin autorización. Comprobar que la reconciliación conserva los contratos y suites.

**Prioridad B — cerrar un hito funcional completo de operaciones con permisos mínimos.** Diseñar según documentos normativos una frontera de lectura de tablero/historial ligada al actor y rol verificados, sin SELECT generales sobre tablas privadas, sin confiar en UUID aportado por cliente o GUC manipulable. Validar matriz de permisos, RLS, suplantación SQL directa, revocación y concurrencia en PostgreSQL 17 desechable antes de proponer activación. No inventar aprobación de grants ni modificar Supabase operativo.

**Prioridad C — integración cliente → cocina → sala.** Solo tras cerrar gates de autenticación, QR/visita, precio/consentimiento, confirmación, recepción, notificaciones y permisos. Distinguir expresamente pruebas de harness de experiencia PWA completa.

**Cierre de cada hito:** código + tests + pruebas PG17 efímeras + workflows sobre el SHA final + actualización de documentos **normativos** pertinentes + informe claro de lo que permanece bloqueado. Si se actualiza después solo este handoff, verificar CI del nuevo SHA sin atribuirle resultados antiguos.

## 6. Restricciones inviolables

- **Nunca tocar Fleetia** ni contenedores, redes, volúmenes, secretos, procesos o servicios de cualquier otro proyecto del VPS compartido. Sabora debe poder desplegarse/reiniciarse/eliminarse de manera totalmente aislada.
- **No desplegar, fusionar, reiniciar, borrar ni modificar Supabase operativo** (`https://byhvmumqivmunkmomhup.supabase.co`) ni el VPS sin autorización expresa y aislamiento demostrado. Las pruebas SQL solo en PG17 desechable de CI.
- No usar Codex ni generar encargos de pago sin autorización.
- Los documentos de continuidad son solo memoria contextual. **La fuente de verdad es la documentación normativa del repositorio GitHub**, no una reinterpretación de este texto.
- Mantener el PR en Draft hasta aprobación. Nunca presentar un candidato o CI verde como sistema desplegado o disponible para usuarios.

## 7. Prompt corto de arranque

> Continúa CartaViva/Sabora desde `docs/continuity/SESSION_10_HANDOFF.md` en `jdlc86/CartaViva`. Lee primero los documentos normativos de GitHub y verifica HEAD, PR #11 y CI reales. Trabaja autónomamente en bloques grandes y completos, priorizando resolver el conflicto del PR y cerrar los gates de operaciones con PG17 desechable; corrige y relanza pruebas, esperando por shell sin pedirme intervención. Actualiza la documentación normativa en cada hito. No uses Codex, no hagas merge ni despliegues, y no toques Fleetia, Supabase operativo ni el VPS compartido.
