# Encargo integral Codex Desktop — cierre funcional H4/H6 (Sabora)

**Fecha:** 2026-10-29  
**Repositorio exclusivo:** `jdlc86/CartaViva`  
**Rama de partida:** `integration/sabora-activation-readiness-20261028`  
**PR existente:** [#40](https://github.com/jdlc86/CartaViva/pull/40), Draft  
**Objetivo:** cerrar un **hito completo, funcional y probado**, no una sucesión de microcorrecciones.  
**Estado del encargo:** pendiente de ejecución por Codex Desktop; este documento no certifica el cierre.

## 0. Autoridad y límites innegociables

1. Leer **primero** la documentación normativa vigente del repositorio, sus índices y contratos aprobados; contrastar código y pruebas con ella. La documentación de continuidad y este encargo solo aportan contexto y tareas: **no sustituyen ni modifican la normativa**. Si hay conflicto, prevalece la normativa. No inventar requisitos, permisos, transiciones ni flujos.
2. Sabora/CartaViva es **un único restaurante**. Respetar los diseños visuales aprobados, la separación PWA cliente/gestión y los flujos funcionales aprobados.
3. Trabajar **exclusivamente** en `jdlc86/CartaViva`. Prohibido acceder, modificar, detener, reiniciar o depender de Fleetia u otros recursos del VPS compartido.
4. **No hacer merge, despliegues, reinicios, cambios en VPS, aplicación de migraciones a Supabase operativo, ni activación del bootstrap productivo.** Todo PostgreSQL de prueba debe ser 17, local/desechable y con guardas de destino. No usar el proyecto Supabase operativo como banco de pruebas.
5. Mantener el PR en Draft; se pueden crear commits, ramas y ejecutar CI del repositorio autorizado. No pedir confirmaciones para operaciones no destructivas ya autorizadas.
6. Trabajar autónomamente: si una prueba o workflow tarda, esperar mediante shell con polling y timeout acotado; si falla, leer logs, corregir, repetir. No solicitar al usuario que vigile Actions.

## 1. Inspección obligatoria antes de implementar

- Revisar documentación normativa y su jerarquía, especialmente los contratos de identidad, cocina/camarero, recogida, incidencias, eventos, PWA gestión, H6, seguridad SQL y criterios de activación.
- Revisar `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`, **como contexto técnico sujeto a normativa**, y cualquier documento de aceptación H4/H6.
- Revisar código: `apps/api/src/h4-h6-integrated-candidate.mjs`, `order-operations-composition.mjs`, `staff-protected-hooks-from-pool.mjs`, `h6-candidate-composition.mjs`, `h6-operations-http.mjs`, `h6-event-stream.mjs`, el gateway y las pantallas de gestión.
- Revisar harness: `scripts/ci/order-operations-read-postgres17.test.mjs`, `scripts/ci/h6-postgres17.test.mjs`, `scripts/ci/h4-h6-candidate.test.mjs`, los workflows y scripts PG17 existentes.
- Confirmar el HEAD y los resultados CI actuales. **No asumir verde** por resultados de un SHA anterior. En particular, los commits recientes que exigen `notifierPool` explícito requieren validación.

## 2. Hito único de entrega: cocina → lista → recogida → eventos en una integración real

Implementar y probar el recorrido extremo a extremo **sobre un único proceso Fastify candidato H4/H6**, PostgreSQL 17 desechable, identidades SQL de mínimo privilegio, JWT criptográficamente verificado y Chromium real. Reutilizar el código ya existente; **no duplicar** rutas H6, RPC SQL, coordinadores, outbox ni autenticación.

### Bloque A — composición positiva y seguridad real

- Construir un fixture de arranque positivo de `createH4H6IntegratedCandidate` con todas las dependencias reales que exige H6: pools separados (incluido notificador), `cookieAuth`, `customerFlow`, proveedor de pagos de prueba conforme a los contratos existentes, capacidades de personal y preflight SQL.
- Usar los roles SQL y migraciones vigentes, no roles superusuario para rutas. Confirmar `current_user`, `session_user`, RLS, grants mínimos y separación de identidades. Si un requisito normativo impide montar el candidato, documentar exactamente la puerta y cubrir la parte verificable sin simular que se ha cerrado.
- Demostrar arranque positivo, montaje único de rutas H4 y H6, cierre correcto de Fastify, `UNLISTEN` y liberación de conexiones; fallos de arranque sin rutas parcialmente operativas ni recursos colgados.
- Mantener el candidato opt-in, sin importarlo en `server.mjs` ni abrir listeners por defecto.

### Bloque B — flujo operativo completo y durabilidad

- Preparar en PG17 una visita/pedido/líneas válidas siguiendo el contrato normativo, sin inventar estados.
- Desde la **PWA de gestión real en Chromium**: cocina ve la comanda, pasa `confirmed → preparing → ready`; sala ve el aviso y ejecuta el flujo de recogida autorizado (`pickup-claim`, cancelación/reasignación o corrección de listo si el contrato lo requiere); comprobar el estado durable y el historial tras recarga.
- Respetar que `picked_up` es recogida por sala, **no entrega al comensal**. No introducir `delivered` ni transiciones de pedido agregado.
- Probar concurrencia de dos camareros, reintentos idempotentes, correlación incompatible, rechazo de transiciones fuera de orden, rollback ante fallos y ausencia de duplicados en aviso/outbox.
- No usar botones ocultos como prueba de autorización: comprobar respuestas HTTP/SQL.

### Bloque C — SSE auténtico, autorización y recuperación

- Abrir `GET /api/v1/operations/events` por HTTP real con JWT válido, sobre el mismo candidato y un listener loopback; recibir un evento persistido por outbox tras la operación real y comprobar que Chromium lo procesa mediante el gateway existente.
- Cubrir cursor `Last-Event-ID`, reconexión, deduplicación, evento fuera de ventana/resync y actualización de la vista sin polling si el contrato lo contempla.
- Verificar denegación de JWT ausente, inválido o caducado; roles incompatibles; personal suspendido/revocado **también con conexión SSE abierta**; prohibición de filtrar eventos de otras mesas o información no autorizada según normativa.
- No sustituir `forRoles` por un stub permisivo ni falsificar `verifiedIdentity` o `verifiedStaff` en el E2E. Separar explícitamente pruebas unitarias con dobles de las pruebas de aceptación con seguridad real.

### Bloque D — integración visual y accesibilidad

- Validar en Chromium las pantallas reales de cocina y camarero, escritorio y móvil, conforme al diseño aprobado: estados de carga, vacíos, errores, indisponibilidad SSE, reintentos, acciones habilitadas por rol, feedback de recogida y ausencia de estados internos en la PWA cliente.
- Comprobar teclado, foco, nombres accesibles, ausencia de errores de consola y de desbordamientos. No rediseñar la interfaz fuera de los estilos aprobados.
- Si falta una acción UI normativa, implementarla con su gateway, contrato, estado y prueba visual; no dejar una maqueta desconectada.

### Bloque E — CI, evidencia y documentación

- Añadir el nuevo E2E al flujo CI existente, reutilizando el harness PG17 desechable y Chromium sin interferir con otros proyectos. Las pruebas deben ser deterministas y disponer de timeout, limpieza y diagnóstico útil.
- Ejecutar pruebas focalizadas, suite completa, TypeScript/build, pruebas de seguridad, PG17 y Chromium. Corregir y repetir hasta verde, o identificar bloqueos objetivos con logs.
- Publicar evidencias: comandos exactos, número de pruebas, resultados, SHA, URLs de runs, escenarios positivos/negativos y limitaciones. **No declarar hito cerrado** por pruebas con stubs o por CI de un SHA distinto.
- Actualizar documentación técnica y, **cuando corresponda por un hito importante**, los documentos normativos del repositorio sin alterar unilateralmente requisitos aprobados. Entregar informe final de cierre con matriz requisito → implementación → prueba → evidencia.

## 3. Criterios de aceptación verificables

Se acepta el hito solo si:

1. El candidato H4/H6 arranca positivamente con PostgreSQL 17 aislado y principales SQL distintos, incluyendo notificador; cierra limpiamente.
2. Un JWT real y membresía SQL activa autorizan el flujo cocina/sala; suspensión/revocación y roles incorrectos lo bloquean.
3. La PWA de gestión en Chromium completa el recorrido cocina → listo → recogida, y PG17 acredita persistencia, atomicidad, historial y recuperación tras recarga.
4. SSE real entrega al navegador eventos durables de la operación, con reconexión/cursor y revocación verificadas.
5. Las pruebas cubren concurrencia, idempotencia, aislamiento, fallos, roles, seguridad, accesibilidad y regresión de H4/H6.
6. CI del **HEAD final** está verde, con pruebas PG17/Chromium efectivamente ejecutadas, y documentación/evidencia versionadas.
7. No hay merge, despliegue, cambios en Supabase operativo ni impacto sobre Fleetia.

Si un punto no puede cumplirse por un requisito normativo o infraestructura no disponible, marcarlo **ABIERTO** y explicar bloqueo, pruebas realizadas y siguiente acción. No inventar una aprobación ni convertir un E2E parcial en aceptación total.

## 4. Método de trabajo solicitado

1. Inspección normativa y matriz de brechas (breve, antes de codificar).
2. Implementación del bloque funcional completo, preferiblemente en commits cohesionados y verificables, evitando microcommits de una aserción.
3. Ejecución local con shell; espera activa acotada para PG17, Playwright y Actions; lectura de logs y corrección autónoma.
4. Repetición hasta alcanzar los criterios o documentar bloqueo real.
5. Informe de entrega en GitHub, actualización documental del hito y PR Draft actualizado, sin merge.

**Entregable final de Codex Desktop:** enlace PR Draft, SHA, matriz de aceptación, pruebas y runs, archivos modificados, capturas/evidencias visuales si procede, bloqueos abiertos y declaración expresa de no despliegue/no Fleetia.
