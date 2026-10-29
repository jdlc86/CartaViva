# Sabora — encargo de cierre de primera versión piloto

Fecha: 2026-10-29
Estado: ENCARGO DE IMPLEMENTACIÓN PREVIA A DESPLIEGUE; no autoriza merge, despliegue, VPS ni Supabase operativo.
Repositorio exclusivo: jdlc86/CartaViva.
Punto de partida: PR #40 Draft, auditoría P3, inventario docs/reviews/SABORA_FIRST_PILOT_READINESS_INVENTORY_2026-10-29.md.

## Objetivo
Cerrar los puntos abiertos de código, integración y verificación necesarios para un piloto de Sabora en el futuro entorno de producción, usando datos ficticios y sin usuarios reales. No confundir un candidato técnico con una aplicación desplegada. Priorizar implementación de bloques completos, no correcciones aisladas.

## Fuente de verdad
Antes de implementar, leer documentos normativos vigentes, incluidos docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md, docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md, docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md, docs/architecture/SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.md, docs/DESIGN_SYSTEM_CONTRACT.md, docs/design/DESIGN_REQUIREMENTS_V1.md, y contratos específicos de identidad, cocina/sala, permisos y publicación. Contrastar versiones y conflictos, sin reinterpretar ni sustituir la normativa por handoffs o este encargo. Mantener diseño visual aprobado.

## Bloques autónomos y persistentes

### Bloque 1 de 5 — Integración funcional backend
Cerrar la API actualmente health-only mediante composiciones operativas autorizadas por normativa, rutas de cliente/gestión, transacciones, idempotencia, permisos mínimos, validación negativa y PostgreSQL 17 desechable. No habilitar rutas sin autenticación y gates. Entregar pruebas y contrato E2E.

### Bloque 2 de 5 — Recorrido real QR a cocina y sala
Conectar ambas PWA con API, persistir mesa/QR/visita/catálogo/pedido/agrupación/cocina/sala y notificaciones según flujos aprobados. Probar concurrencia, revocaciones, reintentos, fallos de red, offline, pedidos tardíos, notificaciones y estados. No afirmar éxito en respuestas ambiguas.

### Bloque 3 de 5 — Estudio de Imágenes Google Gemini
Implementar exclusivamente lo previsto en docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md: foto original obligatoria e inmutable; backend-only Google Gemini con edición/generación sobre imagen de referencia, versión/modelo seleccionados tras verificar soporte real; versiones derivadas privadas, metadatos, límites, cuotas y coste; revisión, descarte, aprobación y publicación explícita autorizada, reversible y auditable. No alterar ingredientes ni prometer fidelidad absoluta. Formatos 5:4, 4:3, 1:1 con tratamiento determinista si procede. Sin credenciales reales en GitHub/CI, sin consumo facturable no autorizado; usar proveedor simulado en CI y dejar pruebas reales como gate condicionado. No simular generación si falta clave.

### Bloque 4 de 5 — Operación y despliegue seguro Sabora-only
Completar manifiestos y preflight no destructivo, HTTPS/PWA, configuración de secretos/roles, logs/observabilidad, workers acotados, controles de coste, backups/restores y rollback Sabora-only. Pruebas aisladas y gates que fallen cerrado. No acceder a VPS ni modificar Supabase operativo; no tocar contenedores, redes, volúmenes, puertos o recursos de Fleetia ni de terceros. Prohibido Docker global, prune, reinicios de host o acciones sobre servicios ajenos.

### Bloque 5 de 5 — Certificación piloto y expediente de despliegue
Matriz norma→código→prueba→SHA, pruebas completas Node/PG17/Playwright, E2E desde QR hasta cocina/sala y pruebas adversas, informe de bloqueos, checklist de intervención y reversión. Marcar PASS solo lo demostrado; marcar BLOCKED lo que requiera credenciales, proveedor facturable, inspección VPS, Supabase operativo o autorización expresa. No certificar producción GO por pruebas simuladas.

## Persistencia y autonomía
Tras CADA bloque: implementar, corregir, repetir pruebas, commit, push, actualizar documentación/tracking y comentar en PR con «Bloque N de 5 implementado», SHA, CI y pendientes. No acumular bloques localmente; si se interrumpe Codex, el siguiente agente retoma el último bloque PASS. Esperar por shell los workflows cuando sea posible y reintentar errores sin intervención del usuario. Mantener PR Draft, sin merge.

## Autorizaciones reservadas
La indicación del propietario de usar producción como escenario de pruebas define la estrategia de entorno, pero NO autoriza desplegar ni intervenir VPS, Supabase operativo, contratar consumo Gemini o tocar Fleetia. Antes de ejecutar cualquiera de esas acciones, pedir autorización específica y verificar aislamiento material completo. El piloto usa exclusivamente datos ficticios.

## Avance persistido — control de activación seguro

Implementado `apps/api/src/pilot-activation-gate.mjs` y pruebas `apps/api/src/pilot-activation-gate.test.mjs`; la suite raíz incluye el test. Esta es una **subtarea transversal de seguridad**, NO el cierre del Bloque 1 de 5 ni prueba de despliegue. El gate no está conectado al arranque productivo; es una función de evaluación explícita que rechaza evidencias ausentes o distintas de `true`. Pendiente CI del SHA, integración de composiciones operativas, configuración de secretos y validación de aislamiento material. No se han tocado VPS, Supabase operativo ni Fleetia.

## Subhito cerrado en código — frontera de activación del piloto

`pilot-activation-gate.mjs` valida explícitamente las evidencias exigidas; las pruebas unitarias comprueban el rechazo fail-closed. `pilot-activation-runtime.test.mjs` prueba mediante Fastify real que incluso si todas las evidencias se marcan true, no aparecen rutas operativas implícitamente y `/ready` continúa `health-only`; también rechaza modos de producción no autorizados. Se incorpora a la regresión monorepo. **No se considera Bloque 1 de 5 cerrado**: falta la composición real autenticada con PostgreSQL y las rutas normativas. No usar esta evidencia como autorización para desplegar.

## Subhito implementado — política de seguridad del Estudio de Imágenes (Google)

Se añadió `apps/api/src/image-studio-policy.mjs` y seis pruebas en `apps/api/src/image-studio-policy.test.mjs`, incorporadas a la suite raíz. La política backend-only exige autorización, cuota disponible, proveedor disponible, original privado e inmutable, MIME/tamaño acotados, formatos y controles aprobados, y revisión/aprobación explícitas de derivados privados Google antes de ser candidatos a publicación. No conecta con Google, no elige modelo, no valida bytes reales ni sustituye validación de contenido, no persiste originales/versiones ni publica catálogo. Pruebas Node locales: 6/6 PASS. **Bloque 3 de 5 sigue abierto** hasta completar adaptador verificado, persistencia, autorización real, límites y pruebas de integración; no se debe presentar como integración Gemini operativa.

## Avance de implementación — H3 HTTP con preflight SQL y readiness real

SHA de código y pruebas: `f7fe7f835d3ff7b4c48183253f137f67b8c1b27f`. Se implementó `apps/api/src/customer-production-app.mjs` como ensamblador **opt-in** de los componentes H3 ya existentes: registro de cliente, sesión cookie, visitas QR, cotizaciones y confirmación de pedidos. Ejecuta comprobación de tres identidades SQL independientes y capacidades exactas **antes** de registrar rutas; readiness repite comprobación y falla con 503 sin revelar errores internos si la identidad cambia. No lee variables de entorno, no crea conexiones, no hace `listen()`, no registra rutas en `server.mjs`, no provisiona credenciales y no activa producción.

Pruebas `apps/api/src/customer-production-app.test.mjs` incluidas en la suite raíz: rutas registradas tras preflight, rechazo anónimo 401, origen cruzado 403, preflight fallido sin rutas 404, degradación de readiness a 503 y rechazo temprano de configuración insegura. CI del SHA: **4/4 SUCCESS** (Sabora CI `40893163826`, Bootstrap `40893163817`, PWA cliente `40893163976`, PWA gestión `40893163812`). Las pruebas utilizan dobles de PostgreSQL para el preflight, no acreditan un recorrido real QR→cocina.

**Bloque 1/5 aún abierto**: falta arranque operativo autorizado con roles/secretos reales, rutas y composiciones de personal, cocina y sala, pruebas E2E con PostgreSQL 17 aislado y conexión real de ambas PWA. No confundir el ensamblador opt-in con despliegue o GO.

## Subhito H3 + H4 — composición conjunta aislada (2026-10-29)

Implementado `apps/api/src/restaurant-flow-candidate-app.mjs`: factoría Fastify **opt-in**, sin listener ni lectura de entorno, que integra el ensamblador H3 (registro, sesión, QR/visita, cotización, confirmación) con el H4 existente (tablero de cocina/sala, transiciones e historial). Requiere cinco pools SQL distintos y cinco nombres de LOGIN distintos; ejecuta preflight de las cinco identidades **antes** de registrar rutas y cierra la aplicación si falla una etapa. Añadidas pruebas de aislamiento y fallos tempranos en `apps/api/src/restaurant-flow-candidate-app.test.mjs` a la suite raíz. SHA de código `9be31696c56a48b0f1c42a9a9ca5db88be3b5ab6`.

**Alcance exacto:** se han integrado composiciones existentes, no se ha probado todavía el recorrido de negocio real con PG17 ni se ha conectado `server.mjs` o ambas PWA. El H4 mantiene sus propias comprobaciones de autenticación. La factoría no autoriza el despliegue ni demuestra disponibilidad real de credenciales/roles. **Bloque 1/5 permanece abierto** hasta pruebas E2E reales, wiring operativo autorizado y cumplimiento normativo completo.

## Evidencia PG17 real — H3 → H4 sobre el mismo pedido

Commit `c79c6e8fdf2407669042fdf140f0cce7a188b064`: ampliado `scripts/ci/customer-production-postgres17.test.mjs` para continuar el pedido H3 confirmado y persistido sobre PostgreSQL 17 desechable con el coordinador H4 real. Verifica que cocina lee la línea confirmada, pasa por `preparing` y `ready` con notificación; sala lee esa misma línea, marca `picked_up`, repite la operación de manera idempotente y consulta el historial. Se usa el mismo `orderId`, sin recrear una orden artificial para H4. La prueba preserva el harness CI restringido a `127.0.0.1`, PostgreSQL desechable y `GITHUB_ACTIONS=true`.

**CI del SHA: 4/4 SUCCESS**: Sabora CI `40895963420`, bootstrap `40895963299`, PWA cliente `40895963390`, gestión `40895963302`. Esto acredita la continuidad de dominio H3→H4 con PG17 real, **no** una sesión de navegador cliente y personal atravesando la factoría HTTP opt-in, ni un despliegue. Bloque 1/5 continúa abierto hasta cableado real, flujos de PWA y demás criterios normativos.

## PG17 H3→H4: pruebas de permisos cruzados y replay (2026-10-29)

SHA `897e8fe11de3fe9c17fe99bb8d998bd958ac47c9`: se refuerza la prueba de integración PostgreSQL 17 desechable `scripts/ci/customer-production-postgres17.test.mjs` con rechazo de transición `preparing` por camarero, rechazo de `picked_up` por cocina, conservación del estado persistido después de ambos rechazos, replay idempotente de recogida que conserva `eventId`, y verificación de eventos duraderos de línea. **4/4 GitHub Actions SUCCESS**: CI `40897206548`, bootstrap `40897206803`, cliente `40897206513`, gestión `40897207038`. La composición H3/H4 continúa opt-in, el servidor estándar health-only y el flujo browser/API de ambas PWA sin demostrar. No se considera cerrado el Bloque 1/5 ni autorizado el despliegue.

## H3 HTTP real → PostgreSQL 17 + continuidad H4 (29-oct)

En `scripts/ci/customer-production-postgres17.test.mjs` se amplió la aceptación real con Fastify y los tres principals SQL restringidos: registro HTTP que devuelve cookie HttpOnly sin token en JSON, sesión, visita QR, cotización, confirmación de pedido, replay idempotente 200 y rechazo 403 de origen cruzado. Se comprueba que el pedido HTTP genera exactamente una línea persistida. La prueba continúa con un segundo comensal y la misma mesa, y verifica `grouped` en la ventana normativa de 300 segundos; posteriormente H4 procesa el pedido confirmado en cocina y sala con control de roles, notificación, recogida e idempotencia.

Primer CI detectó expectativa obsoleta `first` tras haber añadido la orden HTTP previa; se corrigió para exigir `grouped` (comportamiento de negocio correcto), sin alterar lógica de producción. SHA validado `ed24c6457d0f4bbfc81b15d96fc68c1a1dffe2cd`. **4/4 workflows SUCCESS:** CI `40902171746`, bootstrap `40902171775`, cliente `40902171762`, gestión `40902171759`.

**No confundir** con navegador PWA cliente real → H4 HTTP autenticado → PWA gestión en una misma sesión. La factoría conjunta permanece opt-in y el servidor por defecto health-only. **Bloque 1/5 aún abierto**, sin GO ni despliegue.

## Integración PWA cliente real (transporte) → H3 HTTP → PG17 (29-oct)

SHA `35b89c44a25989e12bf490f462f5011c53f3bede`: el test PostgreSQL 17 desechable ahora transpila e importa **el módulo real** `apps/client/src/customer-flow-transport.ts` y lo ejecuta contra la instancia Fastify H3 con una emulación de cookie jar del navegador. Valida que el cliente utilice `credentials:'same-origin'`, y ejecuta registro, sesión, autorización QR, cotización, confirmación y replay sobre SQL real. La persistencia de una sola línea se comprueba en PostgreSQL. No hay servidor externo ni credenciales de producción.

**4/4 workflows SUCCESS**: CI `40903767420`, bootstrap `40903767511`, cliente `40903767524`, gestión `40903767427`.

**Alcance exacto:** transporte de PWA real bajo Fastify.inject, **no** prueba de interfaz Playwright con navegador real ni integración del transporte autenticado H4 de gestión en la misma instancia. Tampoco hay servidor activado ni despliegue. Bloque 1/5 continúa abierto.

## PWA gestión (gateway autenticado real) → H4 HTTP (29-oct)

Commits `5bdef7f263dda5145edd98d0d8a7e70491e70f07` y `d54cecd61c1f3cb26d2cca28de5f311e869d6db4`: la prueba `tests/order-operations-http-lifecycle-acceptance.test.mjs` usa el gateway **real** `apps/management/src/order-operations-authenticated-gateway.js` con fetch dirigido a Fastify.inject. Verifica tablero cocina, transición `confirmed → preparing → ready`, notificación, tablero sala, `picked_up`, replay idempotente, historial y revocación de ambos gateways. Comprueba Bearer por solicitud y `credentials:'omit'`. El harness de este test usa repositorio **en memoria** e identidad de personal simulada; el aislamiento SQL y PG17 se prueban en suites separadas.

Primer CI falló porque el fixture HTTP histórico omitía campos normativos exigidos por el normalizador de la PWA (`tableNumber`, `customerLabel`, fecha, categoría, notificación e historial). Se completó el fixture, **sin debilitar el normalizador ni la producción**, y se repitió CI. **4/4 SUCCESS:** CI `40905242720`, bootstrap `40905242771`, cliente `40905242899`, gestión `40905242820`.

**Falta para cerrar Bloque 1:** demostrar ambos transportes juntos sobre la factoría HTTP H3+H4 y PostgreSQL 17 con autenticación JWT/SQL real; integración de interfaces de navegador y bootstrap autorizado. No afirmar E2E completo ni GO.

## Factoría conjunta H3/H4 — caso positivo verificado (29-oct)

Prueba nueva `apps/api/src/restaurant-flow-candidate-app.success.test.mjs` incorporada a la suite raíz en SHA `289d432f6c5afc37bf2ed7f2b4badc8ded604dd5`. Cinco identidades SQL simuladas con respuestas de preflight exactas (tres customer y dos operations) validan el montaje opt-in de la factoría conjunta. Se comprueba que Fastify registra los cinco endpoints principales de cliente y los tres endpoints H4, que readiness responde 200 y que cliente y personal sin sesión son rechazados. Complementa los tests negativos preexistentes y los tests PG17 reales, pero **el preflight de esta prueba es simulado** y no certifica la factoría conjunta contra PG17 real.

**4/4 workflows SUCCESS:** CI `40906854892`, bootstrap `40906854222`, cliente `40906854342`, gestión `40906854970`.

**Siguiente cierre obligatorio:** usar la factoría conjunta en una aceptación PG17 aislada con autenticación real de personal y transporte PWA gestión; conectar ambas interfaces y certificar flujo browser completo. Sin activación automática, merge ni despliegue. Bloque 1/5 abierto.

## Integración H4: transporte real de PWA gestión → HTTP → PostgreSQL 17 (29-oct)

SHA `a7040d4a2368bf9ab41e3d8bc601e291838c4e6d`: se amplió `scripts/ci/customer-production-postgres17.test.mjs` para registrar rutas H4 Fastify y ejecutar el módulo real `apps/management/src/order-operations-authenticated-gateway.js` contra la misma base PG17 desechable y el mismo pedido H3 confirmado. Cocina lista línea confirmada y la transiciona a `preparing` y `ready`; sala lee `ready`, ejecuta `picked_up`, verifica notificación, replay idempotente e historial. Se comprueba que el camarero no puede preparar la línea y que la denegación no altera la base. Los gateways se revocan al finalizar.

**Límite explícito de evidencia:** la autenticación de los endpoints H4 se inyecta mediante un fixture de roles y bearer de prueba; **no** acredita verificación JWT real, identidad SQL H4 restringida en esta ruta de aceptación, ni navegación UI real. Las pruebas independientes de seguridad/SQL siguen siendo necesarias. Tampoco activa el servidor health-only ni despliega.

**4/4 workflows SUCCESS**: CI `40908095935`, bootstrap `40908095830`, PWA cliente `40908095409`, gestión `40908096154`. Bloque 1/5 sigue abierto hasta integración HTTP conjunta con autenticación real, navegación PWA y certificación del piloto.

## Aceptación cruzada de ambas PWA sobre el mismo pedido PG17 (29-oct, 17:18 CET)

SHA `53e2ec3d08fa4d54d384b9e443a06e14a228d265`: se corrigió la brecha de la prueba de integración. Antes, la PWA cliente confirmaba un pedido y el transporte de gestión H4 procesaba una línea de otro pedido confirmado por el harness. Ahora `scripts/ci/customer-production-postgres17.test.mjs` captura el `orderId` emitido por el **transporte real** `apps/client/src/customer-flow-transport.ts` y el **transporte real** `apps/management/src/order-operations-authenticated-gateway.js` usa la línea SQL de ese mismo `orderId` para cocina (preparing, ready) y sala (picked_up, replay, historial). Se valida el recorrido con Fastify.inject, PostgreSQL 17 desechable y notificación H4. El token de personal del HTTP H4 es fixture de pruebas; la validación criptográfica real de staff JWT se cubre en suites independientes, por lo que **no** se certifica una sesión navegador real de las dos PWA ni un bootstrap operativo.

**4/4 SUCCESS**: Sabora CI `40910631899`, bootstrap `40910631980`, cliente `40910631911`, gestión `40910631920`. Bloque 1/5 permanece abierto por activación segura y certificación completa de la interfaz; Bloque 2/5 tiene demostrada la continuidad del pedido en ambos transportes y PG17, no la totalidad de sus flujos.

## Cierre de sesión y revocación sobre el recorrido PWA cliente → H3 → PG17 (29-oct, 17:26 CET)

Commit `ed7f9fbdd7edca16d23fce8a5fb370bd4c4137ef`: ampliada la aceptación sobre PostgreSQL 17 desechable y Fastify real. El transporte PWA confirma y reenvía una orden; luego cierra sesión y comprueba que la cookie revocada no permite recuperar sesión, autorizar visita ni reenviar confirmación, sin borrar ni duplicar la línea persistida. Una nueva alta de comensal obtiene identidad distinta y no rehabilita la cookie antigua. No se modificó el contrato de producción.

**4/4 workflows SUCCESS:** Sabora CI `40911835833`, bootstrap `40911835919`, cliente `40911835938`, gestión `40911835836`.

El transporte H4 autenticado contra el mismo pedido ya está validado con fixture de personal en la evidencia previa; **falta la verificación conjunta del JWT real con principals SQL H4 restringidos y navegación Playwright de ambas PWA**. No hay GO operativo ni despliegue; Bloque 1/5 permanece abierto.

## Factoría H3+H4 conjunta: prueba de arranque positivo (29-oct)

Commits `8612fd38f6c92d228664a817e5b85901b91d815e` y corrección de aserción `af8d9ff2baaca605df466515602b1565e9351e40`: ampliado `apps/api/src/restaurant-flow-candidate-app.test.mjs` para **ejercitar el camino exitoso** de `createVerifiedRestaurantFlowCandidate`, no solamente fallos de preflight. Se simulan respuestas de inspección SQL de los cinco principals diferenciados y se comprueba el montaje conjunto de 10 rutas (health, ready, cinco endpoints cliente y tres de operaciones), readiness 200, protección de operaciones anónimas, rechazo de confirmación sin cookie y abortar ante error de identidad H4 después de inspeccionar H3. No se alteró la factoría de producción.

El primer CI falló por comparar número de consultas SQL con número de releases de conexión: el preflight cliente ejecuta varias consultas por conexión. Corregida la aserción para verificar que las conexiones se liberan sin exigir igualdad con el número de consultas. **4/4 SUCCESS en SHA `af8d9ff2`**: CI `40913164566`, bootstrap `40913164582`, cliente `40913164554`, gestión `40913164615`.

**Límite:** esta prueba positiva utiliza resultados de inspección SQL simulados; los tests PostgreSQL 17 desechables de H3/H4 se ejecutan por separado. Falta un arranque de factoría conjunta con cinco principals PG17 reales y la certificación browser de ambas PWA. Bloque 1/5 abierto; no GO/despliegue.
