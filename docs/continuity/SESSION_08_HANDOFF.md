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


## 9. Hito parcial: preflight SQL de capacidades, no activado (24-10-2026)

- Se añade `apps/api/src/isolated-customer-sql-capabilities-preflight.mjs` con verificación opt-in y **solo lectura** de capacidades SQL para logins de catálogo y escritor separados.
- Comprueba identidad efectiva y de sesión, `LOGIN`, ausencia de `SUPERUSER` y `BYPASSRLS`, permiso de `SET ROLE sabora_catalog_reader` únicamente para el lector, y ejecución de `sabora.read_published_catalog()` solo bajo el rol lector. Rechaza la ejecución directa por el login de catálogo.
- El preflight falla cerrado y no devuelve errores internos SQL ni secretos. Las consultas no modifican datos ni permisos.
- Pruebas añadidas: `tests/isolated-customer-sql-capabilities-preflight.test.mjs` (identidades, privilegios indebidos, fallos SQL y no apertura del escritor cuando falla el lector).
- **Límite crítico:** este módulo NO está registrado en `server.mjs` ni en la composición verificada. NO certifica todavía todos los grants sobre tablas, políticas RLS efectivas, funciones del escritor ni PostgreSQL 17 real; requiere matriz SQL y pruebas en base desechable antes de conectarlo a producción.
- Los tests añadidos son dobles de conexión: no deben presentarse como integración PG17. Verificar el estado de GitHub Actions del último SHA antes de declarar verde.
- Sin cambios a gestión Codex, Supabase operativo, VPS, Fleetia, merge o despliegue.

## 10. Integración de puerta SQL con rutas opt-in (24-10-2026)

- `registerVerifiedIsolatedCustomerRoutes` exige ahora **ambas** comprobaciones antes de registrar las rutas: identidad SQL efectiva y capacidades SQL de los logins independientes. La validación se ejecuta antes de exponer `GET /api/v1/catalog` y `POST /api/v1/customer/orders/confirm`.
- Si falla una comprobación, la composición devuelve `invalid_verified_customer_composition` y ninguna ruta queda registrada. No se ha modificado `server.mjs` ni habilitado el tráfico operativo.
- Se amplían los dobles en `tests/verified-isolated-customer-composition-candidate.test.mjs` y se añade regresión que exige rechazo ante ejecución directa indebida del RPC por el login lector.
- **Pendiente antes de certificar el hito:** ejecutar `pnpm test`, `pnpm build`, PostgreSQL 17 desechable con roles/grants reales y revisar GitHub Actions del SHA final. Este bloque no acredita todavía RLS efectiva, funciones escritoras ni el circuito QR→cocina.

## 11. Bloque de cierre: frontera de activación SQL en PG17 desechable (24-10-2026)

- El preflight opt-in exige ahora `NOINHERIT`, ausencia de `CREATEDB`, `CREATEROLE` y `REPLICATION` para **ambos** logins; además, el login escritor no puede ejecutar directamente el RPC público de catálogo ni asumir su rol.
- Pruebas de regresión ampliadas en `tests/isolated-customer-sql-capabilities-preflight.test.mjs` y `tests/verified-isolated-customer-composition-candidate.test.mjs`.
- Nuevo `scripts/ci/customer-runtime-activation-gate.sql` integrado en `scripts/ci/postgres-migration-smoke.sh`: verifica en PostgreSQL 17 aislado que los logins `sabora_catalog_login` y `sabora_order_login` aún no estén provisionados; comprueba el rol `sabora_catalog_reader`, membresías peligrosas y ausencia de grants de escritura económica para clientes. La ejecución está incluida en el pipeline existente, no depende de Supabase ni del VPS.
- Este es un **gate negativo de seguridad**, no una autorización de provisionamiento. Si se aprueba una activación futura habrá que reemplazarlo por pruebas de acceso positivo/negativo con credenciales SQL reales y revisar contratos de RLS.
- Verificación local limitada: el contenedor de trabajo no tiene Docker, PostgreSQL ni acceso DNS a GitHub; **no se han ejecutado** `pnpm test`, `pnpm build` ni el smoke PG17 en esta sesión. Consultar los workflows del HEAD antes de declarar el hito validado. Si el gate detecta una incompatibilidad con migraciones existentes, corregir tras leer los logs, sin deshabilitarlo silenciosamente.
- El recorrido QR→visita→catálogo→pedido→cocina sigue sin acreditación E2E. No activar `server.mjs`, no desplegar ni modificar los recursos de Fleetia.

## 12. Cierre verificable de barrera negativa y pruebas de mutación (24-10-2026)

- HEAD previo `1c1bcd2ab02ebb310c5b7b9c47f4978f835eb3b7`: **Sabora CI 40079954180 SUCCESS** y **Bootstrap Sabora lockfile 40079954025 SUCCESS**, verificados desde GitHub. Esto acredita el smoke PostgreSQL 17 aislado y los tests incluidos en ese SHA, no la activación operativa.
- Nuevo `scripts/ci/customer-runtime-activation-gate-mutations.sh` fuerza cambios peligrosos en una transacción desechable y exige que `customer-runtime-activation-gate.sql` rechace cada uno por la causa esperada: logins inesperados, atributos inseguros, membresía filtrada y grants económicos indebidos. Después reejecuta el gate sin mutaciones para detectar cualquier fuga.
- `scripts/ci/postgres-migration-smoke.sh` ejecuta la suite de mutaciones justo después del gate negativo, antes de las pruebas del escritor. Todas las operaciones se realizan dentro del contenedor PostgreSQL 17 con `--network none`; **no se tocan recursos externos**.
- Hito técnico alcanzado únicamente tras CI verde del nuevo SHA: barrera negativa de activación SQL probada también contra mutaciones. No es todavía un hito vertical QR→pedido→cocina: el escritor continúa sin roles/grants de ejecución aprobados y las rutas no se montan en `server.mjs`.
- No merge, no despliegue, no Supabase operativo, no Fleetia, sin cambios a UI Codex.

## 13. Bloque candidato: durabilidad de proyección de cocina en PG17 (24-10-2026)

- Nuevo `scripts/ci/catalog-confirmation-kitchen-durability-smoke.sql` integrado en `scripts/ci/postgres-migration-smoke.sh`. Sobre PostgreSQL 17 desechable verifica en una transacción que una confirmación persistida produce exactamente un pedido, una línea de cocina por plato y un intento económico vinculado; que la consulta de reintento por clave idempotente recupera el mismo pedido sin crear otro; y que una confirmación duplicada rechazada por restricción única revierte tanto el pedido tentativo como su proyección de cocina.
- Las pruebas usan los esquemas y triggers existentes, sin crear grants, rutas ni cuentas de producción. Todas las filas de prueba se revierten al terminar.
- **Límite:** prueba persistencia de proyección, no acuse verificable de recepción por cocina, despacho, stock ni flujo completo de PWA. La composición del escritor sigue inactiva en `server.mjs`.
- El bloque queda **pendiente de cierre** hasta que GitHub Actions confirme el nuevo smoke SQL y la suite completa sobre el SHA actual. No modificar Fleetia, VPS ni Supabase operativo.

## 14. Cierre CI de durabilidad y semántica de confirmación/recepción (24-10-2026)

- SHA `f320c15b8998f3c16f0f532250fbef916679f327`: `Sabora CI` **40080266759 SUCCESS** y `Bootstrap Sabora lockfile` **40080266758 SUCCESS**. Quedan validadas en el PG17 aislado la proyección de una línea de cocina, el replay idempotente y el rollback de una confirmación duplicada.
- Corrección del candidato HTTP: `catalog_order_context_changed` (cierre o cambio de estado de mesa entre autorización y escritura) devuelve **409 `order_confirmation_conflict`** y no 503. El cliente debe revalidar su estado; no reenviar automáticamente una petición de resultado incierto.
- Nueva regresión: el DTO público de confirmación no puede afirmar `kitchenReceived`, `dispatchId` ni `receiptAt` aunque un adaptador devuelva tales campos. Una confirmación persistida no acredita recepción por cocina.
- **Próximo contrato pendiente de implementar, no inferido:** identificador de comanda/despacho independiente, revisión vigente, exclusión transaccional del despacho, acuse de recepción verificable por cocina y autorización por rol. Consultar el trabajo concurrente de cocina/camarero antes de diseñar migraciones o rutas. No activar el candidato HTTP sin el contrato económico de repricing y grants aprobados.
- Nuevos cambios sujetos a CI del HEAD actual; no merge, no VPS, no Supabase operativo ni Fleetia.

## 15. Integración entre ramas: frontera pedido→cocina contrastada con PR #4 (24-10-2026)

- Se leyó el contrato real `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md` y la migración candidata del PR #4 (`codex/sabora-kitchen-waiter-operational`). El PR ya implementa las transiciones `confirmed→preparing→ready→picked_up`, avisos y correlaciones; **no duplicar ese trabajo** en la rama del escritor.
- Nuevo documento `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md` registra responsabilidades, invariantes de handoff y criterios de aceptación antes de integrar ramas.
- Se refuerza el smoke PG17 de confirmación: la línea recién creada debe estar en `confirmed` y no deben existir avisos de recogida ni eventos de transición antes de una acción autorizada del personal.
- La recepción verificable de una comanda/despacho sigue siendo un hito separado del estado de línea `preparing`; no inventar un acuse ni marcar `picked_up` como entrega.
- El bloque queda pendiente del CI del nuevo SHA. Sin merge ni activación de PR #4, sin despliegues ni cambios de Fleetia/VPS/Supabase operativo.

## 16. Regresión de integración HTTP→confirmación→línea de cocina (24-10-2026)

- Nuevo `tests/customer-confirmation-kitchen-handoff.test.mjs` ejercita Fastify HTTP real y el coordinador transaccional de confirmación con repositorio en memoria que simula el trigger SQL, **no sustituye el smoke PostgreSQL 17**.
- Casos: primera confirmación devuelve 201 y proyecta una sola línea `confirmed` sin aviso ni evento; replay de misma clave devuelve 200 y el mismo pedido sin segunda línea; reutilización de clave con cantidad diferente devuelve 409 y no duplica cocina; fallo de ledger después de proyectar línea revierte pedido/línea; visita revocada devuelve 403 sin crear comanda.
- Complementa el smoke real `catalog-confirmation-kitchen-durability-smoke.sql` y el contrato `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`. **No simula ni afirma recepción por cocina, despacho ni autorización de personal del PR #4.**
- CI del SHA nuevo pendiente de confirmación. Sin merge ni activación, sin Fleetia/VPS/Supabase operativo.

## 17. Cierre del handoff HTTP y puerta de consentimiento de precios (24-10-2026)

- SHA `427c7c21ec9d989cc599f8ff44310850e157f558`: **Sabora CI 40080756766 SUCCESS** y **Bootstrap 40080756789 SUCCESS**. El bloque de regresión HTTP→coordinador→proyección de cocina queda cerrado en CI.
- Ampliación de `tests/customer-confirmation-kitchen-handoff.test.mjs`: si la publicación cambia de revisión, la ruta devuelve `409 acceptance_required` y **no** crea pedido/línea/ledger; el token firmado para la nueva revisión permite una única confirmación; un token falsificado no llega a cocina.
- Estas pruebas solo ejercitan el consentimiento en el candidato HTTP y un repositorio transaccional simulado; la consistencia real de SQL sigue cubierta por los smokes PostgreSQL 17. **La respuesta HTTP aún no ofrece un DTO público aprobado para presentar al comensal la comparación de precios ni entregar un token seguro**: no activar el flujo PWA como si estuviera completo.
- CI del nuevo HEAD pendiente. PR #2 Draft; no merge, despliegue ni recursos de Fleetia/VPS/Supabase operativo.

## 18. Consentimiento firmado: caducidad y aislamiento de actor/cesta (24-10-2026)

- Se amplía `tests/customer-confirmation-kitchen-handoff.test.mjs` con pruebas HTTP→coordinador de caducidad del token firmado y de su no transferibilidad entre actor/cesta, incluso cuando la visita alternativa está autorizada. Ambos casos devuelven `409 acceptance_required` y dejan pedidos, líneas de cocina y ledger vacíos.
- La prueba parametriza el reloj del coordinador y el contexto de visita, sin esperar tiempo real ni abrir conexiones externas. El token de aceptación sigue sin publicarse en el DTO HTTP, pendiente de contrato aprobado.
- No se activa ruta en `server.mjs`; PR #2 Draft; sin merge ni despliegue.

## 19. DTO público candidato de cambio de precio y consentimiento explícito (24-10-2026)

- El coordinador emite un token HMAC temporal, ligado a actor/cesta/plato/revisión/selección/cantidad/snapshot, **solo** tras autorizar la visita y bloquear catálogo y antes de escribir el pedido.
- La ruta HTTP candidata devuelve `409 acceptance_required` con comparación monetaria en céntimos, revisiones, token y expiración en una lista cerrada `repricing.schemaVersion=1`; nunca serializa evidencia ni snapshot privados.
- Nuevas pruebas Fastify verifican DTO, no filtración de datos internos y secuencia 409 → aceptación explícita con token → 201 y una sola línea de cocina. Se mantienen los casos de expiración, falsificación y no transferibilidad.
- Contrato detallado en `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`. La PWA todavía no tiene pantalla aprobada de consentimiento y la ruta sigue opt-in sin montar. **No activar en producción**.
- CI del SHA nuevo pendiente; PR #2 Draft, sin merge, VPS, Supabase operativo ni Fleetia.

## 20. CI rojo y corrección del patrón de token de consentimiento (24-10-2026)

- SHA `cd61da4dc57721d5c1d0c6ce59d812caaed6aed1`: **Sabora CI 40081194453 FAILURE** (615/620 tests), **Bootstrap 40081194423 FAILURE** en validación. Logs indican cinco respuestas `503` en lugar de `409` en pruebas de repricing.
- Causa identificada: el literal regex de la ruta HTTP buscaba barra invertida antes del separador `.` del token HMAC (`\\.`) en vez de punto literal (`\.`), rechazando todos los tokens válidos y convirtiendo el resultado en `503`.
- Corregido el regex en `apps/api/src/customer-order-confirmation-http-candidate.mjs`. No se relajan los controles del token, revisión, diferencia de precios o caducidad. Nuevo CI obligatorio antes de cerrar este hito.
- El flujo sigue sin montar en runtime; no merge, no VPS, no Fleetia, no Supabase operativo.

## 21. Cierre CI de repricing y controlador candidato PWA (24-10-2026)

- SHA `639b39196d612751d9a7cf7f32e5266b11a73bd1`: **Sabora CI 40081303875 SUCCESS** y **Bootstrap 40081303867 SUCCESS**. Queda cerrado el bug de expresión regular del token.
- Se añade `packages/customer-consent/src/repricing-consent.mjs`, controlador candidato sin red ni almacenamiento, para la futura PWA cliente. Expone exclusivamente importes/revisiones/caducidad, no el token al render; `present` no envía nada, `decline` descarta, `accept` solo envía desde una acción explícita, consume el token antes de iniciar red y rechaza dobles clics. Una nueva respuesta `409` exige otra aceptación explícita.
- `tests/customer-repricing-consent-controller.test.mjs` cubre reducción de precio, cancelación, caducidad, DTO malformado, token no filtrado, doble clic y segundo cambio de precio.
- **No se ha montado en ninguna PWA ni ruta runtime**; es una pieza integrable que no afirma UX final. La revisión visual/accesible de consentimiento sigue pendiente. CI del nuevo HEAD pendiente.
- PR #2 Draft. Sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 22. Panel accesible de consentimiento de precio, candidato PWA (24-10-2026)

- SHA `1adcfd449255ef7fc6f7023bee1761e7c9741a79`: Sabora CI `40081485930` SUCCESS; Bootstrap `40081485927` aún pendiente en el momento de la consulta.
- Nuevo `packages/customer-consent/src/repricing-consent-panel.mjs`: panel DOM en español con importes anterior/actual/diferencia, revisiones, diálogo ARIA, foco inicial y botones separados «Acepto el nuevo importe y confirmo el pedido» / «No aceptar». El token firmado permanece encapsulado en el controlador, nunca se incorpora al DOM. Botones bloqueados durante el envío, sin confirmación automática ni almacenamiento.
- Nuevas pruebas `tests/customer-repricing-consent-panel.test.mjs`: render accesible, ausencia del token en DOM, rechazo sin escrituras, aceptación única, guardia durante petición pendiente.
- Es un componente integrable **no montado todavía en la PWA real**. La UX visual final y la integración con transporte de API/sesión deben validarse antes de activación. CI del nuevo HEAD pendiente.
- PR #2 Draft, sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 23. Adaptador HTTP aislado para la confirmación desde PWA (24-10-2026)

- Nuevo `packages/customer-consent/src/customer-confirmation-transport.mjs`: `fetch` inyectado, ruta relativa fija `/api/v1/customer/orders/confirm`, `credentials: same-origin`, `cache: no-store`, `redirect: error`, JSON y límite de 64 KiB. No almacena credenciales ni cambia `requestKey`.
- Ante fallo de red devuelve error de estado desconocido, **nunca confirma éxito ni fabrica un identificador**. Rechaza respuestas exitosas sin UUID y filtra errores privados del servidor. El `409 acceptance_required` se pasa al controlador que valida el DTO y exige pulsación explícita.
- Nuevas pruebas `tests/customer-confirmation-transport.test.mjs` cubren opciones HTTP, conservación de clave idempotente, challenge, red ambigua, respuesta malformada y filtrado de errores.
- Este adaptador **no equivale a una integración completa de PWA**: falta cablear sesión real, UI y transporte en la app cliente, y activar la ruta solo tras preflight de permisos SQL y revisión de seguridad. CI pendiente del nuevo SHA.
- PR #2 Draft; sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 24. Composición completa candidata del flujo de confirmación cliente (24-10-2026)

- SHA `9f05e372f6d141406727078994e7665720492c64`: Sabora CI `40081773119` SUCCESS y Bootstrap `40081773118` SUCCESS. Panel y transporte quedan validados por ambos workflows.
- Nuevo `packages/customer-consent/src/customer-confirmation-flow.mjs`: orquesta `transport → controller → panel`, recibe el contexto de sesión y petición del llamador, y emite eventos explícitos a la PWA. En `409` muestra la comparación sin reintentar; el usuario acepta o rechaza. Un segundo `409` exige nueva aceptación. No almacena tokens ni rota `requestKey` ante red ambigua.
- `tests/customer-confirmation-flow.test.mjs` verifica flujo integrado, rechazo, fallo de red y segundo cambio de revisión, sin llamadas externas. **CI del nuevo SHA pendiente**.
- La integración es **candidata aislada**, no una pantalla montada en el runtime de la PWA ni una autorización de despliegue. Quedan por conectar los componentes con sesión real y revisar accesibilidad visual/teclado y roles/SQL.
- PR #2 Draft. Sin merge, VPS, Fleetia ni Supabase operativo.

## 25. Protección del flujo cliente ante navegación y resultados HTTP tardíos (24-10-2026)

- Se añade control de generación al orquestador `packages/customer-consent/src/customer-confirmation-flow.mjs`: si la PWA desmonta la vista mientras espera red, un `409` tardío no puede volver a abrir el diálogo ni emitir eventos. `decline()` se bloquea durante la primera confirmación en vuelo.
- `tests/customer-confirmation-flow.test.mjs` añade dos pruebas de carreras: destrucción durante `fetch` pendiente y rechazo durante envío pendiente. Se preservan las pruebas de aceptación explícita, reaceptación y no duplicación.
- CI del SHA anterior `ac827037` seguía `in_progress` en la última consulta; el SHA nuevo requiere sus propios resultados. No considerar cerrado hasta ambos workflows verdes.
- PR #2 Draft; sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 26. Punto de montaje candidato PWA y contrato HTTP estricto (24-10-2026)

- SHA `ac8270372b8ccb1fcd79733d6e362fdaf10d32a0`: **Sabora CI 40088406863 SUCCESS** y **Bootstrap 40088406822 SUCCESS**. Composición cliente validada.
- `packages/customer-consent/src/customer-confirmation-transport.mjs` exige correspondencia exacta entre `201 confirmed` y `200 replayed` conforme a la ruta HTTP candidata; evita tratar combinaciones anómalas como éxito. Tests ampliados.
- `packages/customer-consent/src/customer-confirmation-mount.mjs`: punto de montaje opt-in con botón «Confirmar pedido», estado accesible `aria-live`, contenedor del diálogo de consentimiento, `readRequest()` inyectado y `destroy()` que desmonta la vista. El montaje no crea sesión, no inventa credenciales, no se conecta al servidor real y no registra la ruta.
- `tests/customer-confirmation-mount.test.mjs`: éxito, rechazo de repricing sin segunda llamada y destrucción con respuesta tardía. CI del nuevo HEAD pendiente.
- Pendiente enlazar este montaje con el shell de la PWA real, según la rama correspondiente y su contrato normativo, y realizar revisión visual/teclado antes de activar.
- PR #2 Draft; sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 27. Cierre de pedido y rearme explícito de la PWA candidata (24-10-2026)

- El punto de montaje `customer-confirmation-mount.mjs` ahora bloquea el botón tras `confirmed` o `replayed` para evitar que una nueva pulsación confirme otra vez el mismo pedido. Solo `resetForNewOrder()`, invocado por el host cuando realmente cambia a una nueva cesta, rearma el botón.
- `resetForNewOrder()` rechaza ejecución durante solicitud en vuelo o mientras espera consentimiento; también rechaza uso después de `destroy()`.
- Dos nuevas pruebas en `customer-confirmation-mount.test.mjs` cubren no repetición y bloqueo de reset durante la operación.
- CI anterior `0c3b008` estaba en curso en la última consulta. Nuevo SHA pendiente de CI. Sigue sin estar montado en la PWA real ni activada la ruta HTTP.
- PR #2 Draft, sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 28. Inspección real de la PWA cliente y límite de activación (24-10-2026)

- Inspeccionado `apps/client/src/main.tsx`: el cliente es todavía un prototipo de consulta de carta; guarda solo alias/empresa como preferencias de presentación en localStorage y **no posee autenticación, cookie de sesión, visita de mesa ni cesta confirmable**. No es seguro montar el adaptador de confirmación como si esas garantías existieran.
- Actualizada la pantalla real del menú con aviso visible y accesible de que pedidos y confirmación están deshabilitados hasta que el backend valide mesa, visita e identidad. No hay botones engañosos de confirmar pedidos.
- La composición `packages/customer-consent/src/customer-confirmation-*.mjs` queda lista como candidato aislado, sin activar ni registrar la ruta del backend.
- Próximo bloque real: implementar contratos de sesión autorizada/cesta y conectar a ellos el montaje; no fabricar una identidad desde el alias ni usar datos de demostración como reales.
- CI del SHA `049d254` seguía en curso al inicio de este bloque; CI del nuevo HEAD pendiente. PR #2 Draft; sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 29. Contrato candidato de petición desde sesión y cesta autorizadas (24-10-2026)

- CI del SHA `049d254`: Sabora CI `40088705350` SUCCESS y Bootstrap `40088705355` SUCCESS. CI del SHA `23492aa`: Sabora CI `40088773296` SUCCESS y Bootstrap `40088773257` SUCCESS.
- Nuevo `packages/customer-consent/src/customer-authorized-request.mjs`: lector inyectado `readContext/readBasket/createRequestKey` que solo produce una petición cuando el contexto declara `authorized=true`, `canOrder=true` y la cesta `confirmable=true`; requiere identificadores de mesa/visita/actor/cesta/plato, tokens QR y sesión, selección, cantidad y clave de idempotencia. No deriva autorización del alias ni de preferencias de localStorage.
- Validación de campos permitidos, tamaño, IDs y tokens; rechaza selecciones cíclicas o con getters antes de serializar. Tests `tests/customer-authorized-request.test.mjs` para contexto/cesta, rechazo, entradas malformadas y objetos adversarios.
- **Límite de seguridad:** `authorized` y `confirmable` en el navegador son solo señales de preparación de UI; no prueban permisos. La única autoridad es la transacción PostgreSQL del servidor y su comprobación de QR, visita, sesión y mesa. No conectar a PWA real hasta tener lectores alimentados por endpoints autorizados.
- CI del nuevo SHA pendiente. PR #2 Draft, sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 30. Clave idempotente estable por revisión de cesta (24-10-2026)

- Nuevo `packages/customer-consent/src/customer-request-key-registry.mjs`: registro en memoria de la clave idempotente asociada a `basketId + revision`. Mantiene la misma clave tras errores de red ambiguos; solo genera otra cuando cambia la cesta/revisión o se reinicia explícitamente fuera de una operación pendiente.
- `begin/end` impiden cambiar de revisión o reiniciar la identidad mientras exista confirmación en vuelo. No almacena secretos ni persiste en localStorage.
- `tests/customer-request-key-registry.test.mjs`: reintentos ambiguos, bloqueo durante envío, cambio de revisión, nueva cesta y entradas inválidas.
- Integración prevista: pasar `registry.forBasket` como `createRequestKey` al lector autorizado, y envolver la confirmación con `begin/end`. La clave es defensa de duplicación del cliente; la garantía durable depende de la transacción y la tabla de idempotencia del servidor.
- CI del SHA anterior `e7b1c22` seguía `in_progress` al iniciar; CI del nuevo HEAD pendiente. PR #2 Draft, sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 31. Composición candidata autorizada con idempotencia y consentimiento (24-10-2026)

- `packages/customer-consent/src/customer-authorized-confirmation.mjs` compone lector autorizado, registro de clave idempotente por revisión de cesta y flujo de confirmación/consentimiento. Rechaza envíos sin contexto/cesta listos, bloquea concurrencia y prohíbe segunda confirmación tras `confirmed/replayed` hasta `resetForNewBasket()`.
- En fallo de red ambiguo conserva la clave para permitir consulta/reintento con el mismo identificador, sin asumir éxito; un cambio de precio sigue exigiendo aceptación humana desde el panel.
- `tests/customer-authorized-confirmation.test.mjs`: envío autorizado, no duplicación, rearme explícito, repetición con la misma clave y bloqueo por sesión no autorizada.
- **No integrado en `apps/client`**: aún no existen lectores de sesión y cesta autorizados. La transacción de servidor sigue siendo la autoridad; no montar con mocks en producción.
- CI del nuevo SHA pendiente. PR #2 Draft; sin merge, despliegue, Fleetia, VPS ni Supabase operativo.

## 32. Clasificación segura de resultados HTTP en el flujo cliente (24-10-2026)

- Corregido `customer-confirmation-flow.mjs`: respuestas de error del servidor (`403`, `503`, conflictos, etc.) se notifican como `failed`, **nunca** como `submitted`. Solo `confirmed/replayed` constituyen resultado confirmado.
- También se aplica tras la aceptación explícita de un cambio de precio; no se muestra éxito si la confirmación posterior falla.
- `tests/customer-confirmation-flow.test.mjs` añade regresiones para denegación de autorización y error tras consentimiento. No modifica el contrato HTTP ni habilita el endpoint.
- CI del nuevo SHA pendiente; PR #2 Draft, sin merge, despliegue, Fleetia, VPS ni Supabase operativo.
