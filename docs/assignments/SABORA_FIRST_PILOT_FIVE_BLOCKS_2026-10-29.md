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

## Readiness de factoría conjunta H3/H4: comprobación de deriva de privilegios (29-oct)

Commits `e42a0c6fb4147052a028616b42452e6330c0469c` y `444d404d66e4b86d81fd7f9bc0138f37b13e0f90`: se detectó que la ruta `/ready` de la factoría conjunta únicamente revalidaba las tres identidades H3 tras el arranque. Se incorporó un hook de readiness que revalida los principals SQL H4 (staff y operaciones) **en cada consulta GET /ready**; ante pérdida de privilegios o fallo de conexión responde 503 genérico sin filtrar detalles internos. La prueba cubre arranque sano, deriva de cada rol, respuesta cerrada y recuperación sin reinicio. No se modifica el servidor health-only ni se habilita producción.

**Estado de CI al documentar:** la primera ejecución del SHA `444d404d` tuvo fallos en CI/bootstrap por un error sintáctico de declaración duplicada `kitchenPwa` en `scripts/ci/customer-production-postgres17.test.mjs` (archivo modificado concurrentemente en la misma rama). La versión actual consultada del archivo contiene una única declaración; se requiere nueva ejecución completa de CI para confirmar el estado integrado. No declarar verde hasta verificarla.

### Verificación final de CI integrada — readiness H3/H4

SHA `75f0c4534ab8e22cfd951debeb75a51c7a1827c8`: **4/4 SUCCESS** tras esperas shell: Sabora CI `40914864245`, bootstrap `40914864109`, cliente `40914864096`, gestión `40914864569`. El error sintáctico concurrente citado en el apartado anterior ya no está presente en el árbol validado. Queda demostrada la regresión positiva/negativa del readiness conjunto, pero el Bloque 1 sigue abierto por la activación y aceptación browser real.

### Aceptación de confirmaciones simultáneas desde el transporte PWA cliente

En `538637a43b55a28664487111a9bd1746a420ed85` se añadieron tres confirmaciones concurrentes mediante `createCustomerFlowTransport().confirm()` contra Fastify y PG17 desechable, verificando un único pedido, un `confirmed`, dos `replayed`, una sola línea persistida y 409 ante reutilización incompatible de la clave sin mutación adicional. El árbol integrado corregido `75f0c453` superó **4/4 workflows** (IDs consignados arriba). Este hito valida concurrencia/idempotencia HTTP/PG17, no navegador real ni JWT staff conjunto. Bloque 1/5 abierto.

## H3/H4 PG17: aislamiento de credenciales entre PWA (29-oct, tarde)

La aceptación integrada `scripts/ci/customer-production-postgres17.test.mjs` ejecuta ambos transportes reales (cliente y gestión) contra Fastify y el mismo pedido PostgreSQL 17 desechable. Se amplió con pruebas negativas que exigen HTTP 403 al intentar modificar una línea confirmada con una cookie de cliente falsificada, un bearer de personal falsificado o un bearer de camarero acompañado de una cabecera que pretende suplantar a cocina. Verifica que la línea permanece en estado `confirmed`; añade una comprobación de reutilización incompatible de la correlación de recogida sin alterar `picked_up`.

La primera CI de `aa04eb56a3daa92f8dec05486917fd767df98088` detectó un error de ámbito de la variable de prueba `revokedCookie`. Se sustituyó por un valor de cookie adversarial autónomo y se relanzaron todas las comprobaciones. **SHA validado `d913f324beedf62df18d725fbf893f355e7c543a`: 4/4 SUCCESS** (CI `40916777198`, bootstrap `40916777254`, cliente `40916777291`, gestión `40916777229`).

La identidad del personal en este test HTTP es un **fixture aislado**, no verificación JWT real; esta última y los principals SQL restringidos tienen pruebas separadas. No declarar el piloto cerrado hasta probar la composición conjunta con autenticación criptográfica real, navegadores de ambas PWA y arranque operativo seguro. Sin despliegue, merge ni contacto con Fleetia, VPS o Supabase operativo.

## H4 HTTP y transporte de gestión sobre pedido H3 real (29-oct)

Commit de prueba `74b1983058dd323d6d53f8e46e983ee511a5102d`, corregido `2a93244159395459e8a85602612e08259c868f47`: en `scripts/ci/customer-production-postgres17.test.mjs` se ejecuta el **gateway real** `apps/management/src/order-operations-gateway.js` sobre los endpoints reales `registerOrderOperationsHttp` y el coordinador H4 con PostgreSQL 17 desechable. El gateway de cocina lee la orden persistida por H3, ejecuta `preparing` y `ready`; el gateway de sala lee `ready`, marca `picked_up`, repite idempotentemente y consulta historial. El test utiliza inyección de identidades por cabecera **solo dentro del harness CI**, no pretende certificar la verificación JWT/JWKS de producción, que tiene sus pruebas independientes.

Primer CI falló por importaciones duplicadas en el test; corregidas sin modificar el runtime. **4/4 workflows SUCCESS** en `2a932441`: Sabora CI `40918427107`, bootstrap `40918426944`, cliente `40918426969`, gestión `40918426878`.

**Bloque 1/5 todavía abierto:** falta integración de las dos interfaces de navegador y composición conjunta con autenticación real H4 en el mismo servidor, además de activación operativa autorizada. No hay GO, merge ni despliegue.

## Regresión de revocación de sesión cliente y continuidad H3/H4 (29-oct)

Se amplió `scripts/ci/customer-production-postgres17.test.mjs` para comprobar que una cookie de cliente capturada **antes** de cerrar sesión no puede confirmar un pedido nuevo **después** de la revocación SQL, incluso si otro cliente se registra y obtiene una sesión válida. Se conserva el pedido histórico y no se duplica ninguna línea. El test existente ya incluía la confirmación concurrente con idempotencia, operaciones de cocina/sala con el gateway real de gestión y revocación posterior.

Un intento inicial de insertar la revocación antes de las pruebas concurrentes provocó fallo de CI por secuencia de prueba incorrecta. Se reordenó conservando la concurrencia y la revocación al final; el SHA final validado `f26f85140080305041436bf345c0e537a9c77e86` obtuvo **4/4 SUCCESS**: CI `40927146927`, bootstrap `40927146724`, cliente `40927147342`, gestión `40927147004`.

Esta evidencia valida revocación y resistencia a reuso de cookie en PG17 aislado; **no** constituye certificación de las dos interfaces en navegador contra una única instancia H3/H4 real ni GO de producción. El Bloque 1/5 continúa abierto.

## Bloque 1 de 5 — cierre full-stack validado (30-oct)

El expediente `docs/reviews/SABORA_BLOCK_01_FULL_STACK_CLOSURE_2026-10-30.md` sustituye el estado abierto de las notas incrementales anteriores. En el SHA funcional `e3d17db469cfcec76280be49268dd0c3d0f38bab`, una sola factoría opt-in ejecutó H3/H4 sobre PostgreSQL 17 real con seis LOGIN restringidos, cookie cliente, JWT/JWKS RS256 de personal, ambas PWA en Chromium y el mismo pedido persistido desde cliente hasta cocina y sala. Se verificaron atomicidad, rollback, replay, agrupación, expiración, concurrencia, revocación, RLS, privilegios mínimos, errores de red, Axe y ausencia de overflow/polling.

**4/4 workflows SUCCESS:** [CI 41003487653](https://github.com/jdlc86/CartaViva/actions/runs/41003487653), [bootstrap PG17 41003487513](https://github.com/jdlc86/CartaViva/actions/runs/41003487513), [cliente 41003487585](https://github.com/jdlc86/CartaViva/actions/runs/41003487585) y [gestión 41003487619](https://github.com/jdlc86/CartaViva/actions/runs/41003487619). El Bloque 1 queda **PASS en su alcance técnico aislado**. `server.mjs` sigue `health-only`; activación, secretos reales, Supabase operativo, VPS, despliegue y merge continúan BLOCKED y no autorizados. Siguiente trabajo permitido por el plan: evaluar el Bloque 2 sin rehacer este cierre.

## H4 transporte PWA gestión → HTTP → PG17 aislado (30-oct)

Commit validado `e52ff5a339e094b9bd19673ac151880f68cccc31`. Se amplió la aceptación `scripts/ci/customer-production-postgres17.test.mjs` para ejecutar el **módulo real** `apps/management/src/order-operations-authenticated-gateway.js` contra las rutas H4 Fastify de `registerOrderOperationsHttp` y el coordinador PG17 real, leyendo una línea de pedido originada por H3. La identidad de personal se inyecta **exclusivamente en el preHandler de prueba**, mediante tokens CI; la verificación JWT de producción queda en suites específicas. Se comprueban lectura de cocina, denegación de listado `confirmed` a camarero, denegación de recogida por cocina y denegación sin autenticación. No se cambian las políticas operativas ni se activa producción.

Se detectaron y corrigieron dos errores del harness al integrar cambios concurrentes: import duplicado de gateway y referencia a variable fuera de alcance. También se corrigió la resolución del Fastify de gestión. **4/4 workflows SUCCESS** en SHA citado: Sabora CI `41006419381`, bootstrap `41006419329`, cliente `41006419461`, gestión `41006419340`.

**Límite:** esto valida el transporte real H4 y SQL real en test, pero no constituye aún certificación del recorrido de ambas interfaces en navegador con autenticación de personal JWT real. Bloque 1/5 permanece abierto hasta el cierre normativo y operativo.

## Bloque 2 — endurecimiento de notificaciones SSE (2026-10-30)

En la rama Draft PR #40, commits `3e36d2a` y `5653dfb`, se acotó a 65.536 caracteres el búfer de tramas SSE pendientes en la PWA de gestión, con tratamiento de desbordamiento como indisponibilidad de transporte y reconexión por el mecanismo existente. Se añadió prueba automatizada que inyecta una trama excesiva y comprueba que no se entregan eventos parciales y que se informa de indisponibilidad. **Evidencia CI de estos commits: pendiente de verificar.** Este avance no cierra el Bloque 2: siguen pendientes el recorrido funcional completo, adversarios de red/reintentos y la certificación PG17/navegador. No se ha activado servidor productivo, desplegado ni intervenido en recursos compartidos.

## Bloque 2 — correcciones de transporte y evidencia CI (30-oct, continuación)

Se ampliaron las defensas de la suscripción SSE de gestión para tramas completas excesivas, CRLF dividido entre lecturas y lotes de eventos válidos que superan conjuntamente 65.536 caracteres. Las pruebas añadidas ejercitan una trama completa excesiva, lectura byte a byte y 800 eventos válidos en una sola lectura. Los commits relevantes son `1d0c339`, `4c5b2da`, `2df071f`, `ec4dd34`, `af33797` y `6415862`.

La versión `ec4dd34ab3e8d45acf6663e6ca0e74aba05ed77f` superó **4/4 GitHub Actions** (Sabora CI, bootstrap, navegador cliente y navegador gestión). La validación del último cambio `64158626e6f7c5c49322de25797e5c4fc967903a` seguía en curso al consultar: los dos navegadores SUCCESS y CI/bootstrap pendientes. **No se declara cierre del Bloque 2** ni GO: faltan el expediente de aceptación integral y la evidencia completa del último SHA. Se mantiene el aislamiento de Fleetia, VPS y Supabase operativo.

## Validación consolidada de la base de transporte (30-oct)

El commit `2e6ae1c3c0d0c0a5edc345a3a06f55d0de82c1e0` obtuvo **4/4 GitHub Actions SUCCESS**: Sabora CI `41012772982`, Bootstrap `41012773033`, navegador cliente `41012772985`, navegador gestión `41012772991`. Esta evidencia valida las suites configuradas en CI para las correcciones SSE acumuladas hasta ese SHA; no certifica por sí sola los criterios funcionales de aceptación del Bloque 2 ni autoriza GO.

**Criterios pendientes del Bloque 2 según el encargo normativo:** recorrer ambas PWA contra la API y PostgreSQL 17 aislado con QR/visita/catálogo/pedido/agrupación/cocina/sala y notificaciones; acreditar concurrencia, revocación, reintentos, fallos de red, offline y pedidos tardíos; documentar las evidencias de cada criterio. Evitar declarar el bloque PASS por regresiones de transporte aisladas. No intervenir VPS, Supabase operativo ni Fleetia.

## Bloque 2 — aceptación adicional y brecha normativa identificada (30-oct)

Los commits `427f5fe`, `18df8fd` y `4fd6a6d` incorporan pruebas de reconexión SSE con cursor y deduplicación, revocación terminal de la suscripción, desconexión de navegador tras confirmación reconocida, y pérdida simulada de respuesta HTTP tras persistir una confirmación en PostgreSQL 17 aislado. El último SHA `4fd6a6da78b3ec45f31e9848ba26076bd1731d13` obtuvo **4/4 GitHub Actions SUCCESS**: CI 41014687170, bootstrap 41014686363, cliente 41014686406 y gestión 41014686368.

**Brecha normativa crítica — NO PASS del Bloque 2:** el escenario 29 de `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` exige **consultar el resultado por clave idempotente sin reenviar automáticamente ni volver a cobrar**. La prueba actual de respuesta perdida acredita solamente que el servidor tolera el reenvío manual de la misma solicitud sin duplicar pedidos; **no acredita la consulta de reconciliación requerida**, ni el flujo visual de resolución de incertidumbre. Se necesita una consulta autenticada y autorizada por clave idempotente, implementada de extremo a extremo, más una aceptación Chromium de estado incierto y resolución sin reenvío. No confundir idempotencia de escritura con cumplimiento del contrato de recuperación.

Permanecen por certificar íntegramente despacho automático y agrupación temporal, pedidos tardíos, notificaciones a cocina/sala, reclamación exclusiva de recogida y cancelación, offline con cesta no confirmada, revocación en caliente y concurrencia entre sesiones en el recorrido completo. Mantener PR Draft; sin merge, despliegue, VPS, Fleetia ni Supabase operativo.

## Bloque 2 — cierre de subhito de recuperación de confirmación (30-oct)

**PASS técnico de la recuperación por clave idempotente, no cierre del Bloque 2.** El backend ofrece `lookupConfirmation` como lectura autorizada y restringida; la ruta `POST /api/v1/customer/orders/lookup` utiliza la sesión HttpOnly y `Cache-Control: no-store`; el transporte de la PWA consulta el resultado sin reemitir la operación de escritura. Ante respuesta ambigua, la interfaz muestra estado de incertidumbre, conserva la cesta y exige una acción explícita de consulta. La aceptación de navegador contempla respuesta `not_found` y respuesta `confirmed` sin duplicar confirmaciones; la integración PostgreSQL 17 aislada comprueba la consulta tras perder la respuesta HTTP.

**Evidencia CI:** SHA `0f50b1a3aa8815b49ac888c18d35b0459695c4a1` con **4/4 workflows SUCCESS** (Sabora CI `41016922257`, Bootstrap `41016922488`, navegador cliente `41016922258`, navegador gestión `41016922256`). Esta evidencia precede a la presente actualización documental y no certifica el SHA de documentación.

**Pendientes del Bloque 2:** completar y acreditar la matriz normativa de extremo a extremo para agrupación y despachos automáticos, pedidos tardíos, notificaciones de cocina/sala con reconexión y cursor, concurrencia entre sesiones, revocación activa y revalidación de cesta offline; revisar la recuperación en modalidad de pago H6 antes de afirmar ausencia de doble cobro. Mantener PR #40 Draft y estado general NO-GO, sin merge, despliegue ni intervención de entornos operativos.


## Bloque 2 — cierre de batería adversa de recuperación autenticada (30-oct)

Se amplió la aceptación PostgreSQL 17 real de la consulta de confirmación con: aislamiento entre dos clientes autenticados; rechazo de petición anónima; rechazo de origen ajeno; rechazo de campos inesperados y de clave idempotente vacía; y conservación del número de líneas persistidas después de los rechazos. Estos casos complementan la recuperación de respuesta perdida, sin reenvío automático, y la aceptación Chromium de resultado confirmado o no encontrado.

**SHA verificado:** `39a8fb9eef3570cad397a257050c2241c9895f28`. **4/4 GitHub Actions SUCCESS**: Sabora CI `41021977568`, Bootstrap `41021977599`, navegador cliente `41021977593`, navegador gestión `41021977560`. Las pruebas corren en PostgreSQL 17 desechable y no implican intervención en producción.

**Alcance:** batería adversa de recuperación PASS; **Bloque 2 NO CERRADO**. Sigue faltando la aceptación integrada de ambos navegadores sobre el mismo recorrido QR→visita→catálogo→pedido→agrupación/despacho→cocina→sala→notificaciones, con pedidos tardíos, revocación, reconexión, offline y modalidad de pago H6. La matriz de evidencias por criterio debe distinguir lo probado en tests separados de un E2E completo. Sin merge, despliegue ni acceso a VPS, Fleetia o Supabase operativo.


## Auditoría de cierre integral del Bloque 2 (30-oct)

**Resultado: NO PASS del bloque completo.** Se contrastó el contrato normativo consolidado con los ejecutables `scripts/ci/customer-production-postgres17.test.mjs`, `scripts/ci/h6-postgres17.test.mjs`, `scripts/ci/management-authenticated-browser-smoke.mjs` y `apps/client/e2e/client-premium.spec.ts`. El commit de seguridad `39a8fb9` obtuvo **4/4 SUCCESS** en GitHub Actions (CI `41021977568`, bootstrap `41021977599`, cliente `41021977593`, gestión `41021977560`).

**Evidencia positiva delimitada:** `customer-production-postgres17.test.mjs` ejecuta HTTP H3 real, transporte cliente real y persistencia PG17; continúa con coordinador H4, roles, transiciones y consultas. `h6-postgres17.test.mjs` prueba por separado despachos, pagos, concurrencia, recogidas y eventos SSE en PG17. Las dos suites Chromium ejercitan cliente y gestión, pero el navegador de gestión usa una **fixture HTTP interceptada**, no la misma API/PG17 que la sesión cliente. La recuperación por clave idempotente tiene aceptación Chromium y PG17, también en pruebas separadas.

**Brecha de certificación:** no hay una ejecución única acreditada de **ambos navegadores reales** con las identidades autenticadas, el mismo pedido y el mismo PostgreSQL 17 atravesando QR, visita, catálogo, pedido, agrupación temporal, despacho automático, cocina, sala y notificación con reconexión. La presencia de marcadores en `functional-validation-contract.mjs` no demuestra esta continuidad: ese gate comprueba existencia de evidencias, no orquesta un E2E conjunto. Además deben verificarse en esa aceptación los pedidos tardíos, offline/revalidación, revocaciones en caliente, concurrencia y pago H6 sin doble cobro.

**Acción para cerrar:** construir harness aislado PG17+API operativa opt-in+ambas PWA Chromium, con identidad real de personal, sin mocks de rutas de negocio; instrumentar aserciones SQL y eventos durables del mismo pedido, cubrir fallos/reintentos y producir matriz requisito→prueba→resultado. Hasta entonces **Bloque 2 abierto y producción NO-GO**. No autoriza merges, despliegue ni uso de VPS/Fleetia/Supabase operativo.


## Bloque 2 — evidencia conjunta Chromium + API restringida + PostgreSQL 17 (30-oct)

**PASS del subrecorrido integrado H3/H4, NO PASS del Bloque 2 integral.** La prueba ejecutable `scripts/ci/customer-production-postgres17.test.mjs` ya inicia en la misma ejecución la API Fastify candidata, seis identidades SQL restringidas, PostgreSQL 17 desechable y dos PWA Vite reales en Chromium. La PWA cliente registra identidad, valida QR, cotiza y confirma el pedido; el navegador de cocina recibe ese pedido persistido, lo prepara y lo marca listo; el navegador de sala autentica su propio rol y verifica **la misma línea** en estado «Lista para recoger» antes de su recogida. La prueba comprueba el estado SQL, impide consultas anónimas del tablero y verifica que el camarero no ve controles exclusivos de cocina. Después comprueba recogida e historial, idempotencia y ausencia de duplicación, con captura de evidencias visuales y comprobaciones axe. Las operaciones de recogida se ejercitan mediante el gateway HTTP autenticado; la visualización previa y el historial se comprueban en Chromium.

**Evidencia validada:** commit `b6ba968755efe0b25c12dcdd107d66a10f3c4a75`; **4/4 workflows SUCCESS**: Sabora CI `41023344182`, Bootstrap `41023344135`, navegador cliente `41023344217`, navegador gestión `41023344136`. El fallo anterior de presupuesto SSE se corrigió para los tres montajes reales de sesión de personal, manteniendo el límite sin polling de negocio. La prueba conjunta se ejecuta en la etapa de PostgreSQL 17 desechable de CI; no utiliza recursos operativos.

**Límites del resultado:** esta evidencia sustituye la brecha anterior sobre la *ausencia total* de un recorrido conjunto de ambos navegadores y el mismo pedido; no demuestra todavía que el Bloque 2 esté completo. Faltan aceptación conjunta de agrupación y despacho temporal H6, pedido tardío, notificaciones durables con reconexión/cursor, recogida/cancelación H6, pago sin doble cargo, revalidación de cesta offline y revocaciones activas en ambos navegadores. No se autorizan merge ni despliegue; producción sigue NO-GO.
