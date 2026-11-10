# Sabora — acta de cierre integral candidato del cambio de mesa

**Fecha:** 2026-11-04  
**Repositorio:** `jdlc86/CartaViva`  
**Rama:** `feat/sabora-table-change-final-closure-20261104`  
**PR:** [#44 Draft](https://github.com/jdlc86/CartaViva/pull/44)  
**Base:** `integration/sabora-h6-b2-delivery-board-contract-20261031` (`79092962c0bf8d4e43979a7db0808f6102a268a0`)  
**Commit funcional:** `f951f7a9`  
**Commit de validación CI:** `3fe626ce436050672b56b6b316d917f25572b39c`

**Naturaleza:** evidencia de implementación y validación; no es normativa ni autorización de merge, despliegue o producción.

## 1. Dictamen

El candidato cierra el recorrido F21/R06 de revisión correctiva antes del despacho: invalidación durable por catálogo, corrección económica consentida, nueva revisión inmutable del mismo pedido, replay idempotente, despacho inmediato de la única revisión vigente, ACK de cocina y actualización SSE de cliente y personal. La aceptación se ejecutó sobre PostgreSQL 17 limpio, principales físicos restringidos, Fastify, JWT/HMAC y Chromium, incluida la ventana natural de 300 segundos.

El resultado global permanece **NO-GO para producción**. Los bloqueos no resueltos son:

1. Stripe sandbox real: no se ejecutaron autorización/captura/reembolso de red ni conciliación con credenciales test autorizadas.
2. Semántica normativa de cuenta de coste cero y «todas las partidas resueltas»: no se inventa equivalencia con `ready`, `claimed` o entrega física.
3. Caja/cierre visual definitivo: no existe aprobación para una pantalla nueva que permita declararla final.
4. Aceptación visual humana final de F28/R09 y configuración/identidad/secretos operativos.

## 2. Implementación candidata

### 2.1 PostgreSQL 17, historial e invariantes

La migración `20261104094055_sabora_h6_order_revision_correction_candidate.sql` incorpora:

- revisiones numeradas e inmutables por pedido/ronda y un único estado vigente;
- solicitudes idempotentes de corrección, con huella del contenido y replay durable;
- backfill compatible para historia anterior al contrato de revisiones;
- invalidación transaccional por retirada, agotado o publicación relevante de catálogo;
- fencing de despacho: una revisión invalidada o sustituida no llega a cocina;
- reenvío correctivo en la misma cuenta, pedido y ronda lógica, sin segunda ventana ni segundo pedido cobrable;
- recálculo de importe y delta de cuenta, preservando los snapshots anteriores;
- proyección de destino operativo tras A→B, sin reescribir `orders.table_id` histórico;
- outbox durable para invalidación, envío y despacho;
- RLS forzada, propietarios `NOLOGIN`, funciones `SECURITY DEFINER` con `search_path` fijado y grants exactos.

Durante la regresión se corrigieron dos incompatibilidades reales:

- el fence de preparación se limita a snapshots H6 `schemaVersion=1`; los pedidos H4 históricos sin ledger H6 conservan su ciclo válido;
- la proyección de estado de revisión se ejecuta en `INSERT OR UPDATE` de `kitchen_dispatches`, por lo que un despacho nacido ya `requested` o `acknowledged` no queda falsamente en `current`.

### 2.2 API, capacidades y seguridad

- lectura autenticada de revisión por identidad de cliente y pertenencia de pedido;
- endpoint de reenvío correctivo con aceptación HMAC del contexto económico;
- replay exacto recuperado desde el ledger SQL, sin depender de material regenerado;
- autorización nueva solo si la revisión sigue vigente; una repetición idéntica recupera el resultado y una repetición contradictoria falla;
- operación firmada de disponibilidad para personal autorizado;
- separación de login de lectura H6, escritor de confirmación/revisión, eventos de cliente, operaciones y personal;
- allowlists y preflights actualizados sin conceder DML directo a los runtimes;
- errores internos no se exponen en HTTP.

### 2.3 PWA cliente y gestión

- diálogo persistente de corrección tras evento SSE o reconexión;
- selección únicamente entre alternativas publicadas disponibles;
- presentación de precio anterior, precio nuevo y diferencia;
- consentimiento explícito antes de `Reenviar pedido`;
- conservación de la misma cotización, aceptación y selección durante un reintento de red, evitando generar un `quoteId` distinto entre los dos pasos de consentimiento;
- catálogo de gestión con acción agotado/restaurar y estado operativo;
- cocina/sala distinguen revisión vigente, invalidada e histórica, sin presentar `Voy a recoger` como entrega física.

## 3. Defectos detectados y corregidos durante la aceptación

| Defecto reproducido | Causa | Corrección | Evidencia |
|---|---|---|---|
| preparación H4 rechazada | fence H6 aplicado a pedidos sin snapshot económico H6 | scope por `schemaVersion=1` | `order-operations-postgres17-integration`: 8/8 PASS |
| filas H6/B2 ocultas | revisión no proyectada cuando el despacho nacía por `INSERT` | trigger `AFTER INSERT OR UPDATE` | `order-operations-read-postgres17`: 13/13 PASS |
| replay de revisión 503/409 | llamada asíncrona tratada como fila y prelectura impedía alcanzar el ledger | `await` correcto y arbitraje durable en SQL | E2E B3 n.º 49 PASS |
| segundo consentimiento cambiaba la huella | la PWA volvía a cotizar y generaba otro `quoteId` | cache efímera de selección/cotización/aceptación hasta éxito o cambio del usuario | Chromium F21 PASS |
| SSE tras cambio de mesa no recuperaba eventos | lector anclado a mesa histórica | autorización por binding operativo vigente, conservando cliente/visita/QR | reconexión y aislamiento E2E PASS |
| rotación QR aparentaba no bloquear al escritor | SSE introducía un bloqueador intermedio en el grafo de espera | aserción del grafo transitivo de `pg_blocking_pids`, sin ampliar `lock_timeout` | carrera F16/F17 PASS |
| efectivo aparentaba no entrar en la cola económica en CI | otro backend podía quedar entre el poseedor del lock de cuenta y la liquidación; la aserción solo aceptaba bloqueo directo | observación recursiva y acotada del grafo real de `pg_blocking_pids`, conservando la espera original de 6 s | CI y Bootstrap PG17 del SHA `eda167bb`: PASS |
| el segundo clic de revisión agotaba el waiter Playwright de forma intermitente | el replay inyectado podía adelantarse antes de que Chromium emitiera su POST y el waiter quedaba temporalmente sin manejador durante el clic | el replay arranca al observar el POST aceptado de la PWA; ambos waiters quedan enlazados desde el inicio y se siguen exigiendo respuestas 200/201, una sola revisión y dos peticiones reales | gate local 51/51 y 4/4 Actions de `3fe626ce`: PASS |

## 4. Pruebas realmente ejecutadas

### 4.1 Gate PostgreSQL 17/Node/Chromium

Comando local equivalente al job CI, con `GITHUB_ACTIONS=true`, `SABORA_CI_F21_FULL_WINDOW=true` y `RUNNER_TEMP` desechable:

```text
scripts/ci/catalog-postgres17-node-driver-smoke.sh
```

Resultado final:

- cadena completa de migraciones aplicada desde esquema vacío a PostgreSQL 17 Alpine;
- suites previas de catálogo, operaciones, identidad, directorio, ciclo de personal, invitaciones, H3/H4 y H6: PASS;
- `table-change-root-postgres17.test.mjs`: **51/51 PASS**, 0 fallos, 0 omitidas;
- escenario integrado n.º 49: **PASS en 710352 ms**;
- seis logins PostgreSQL físicos `NOINHERIT`, JWT RS256, HMAC, Fastify y dos PWAs Chromium;
- ventana real de cinco minutos, recuperación tras pérdida de LISTEN, dos planificadores concurrentes, revisión correctiva, SSE, revocación, replay, caja/cierre previos y ACK de cocina;
- contenedor y dependencias temporales del gate destruidos por su `trap`; no se usó Supabase operativo.

### 4.2 Regresión y builds

| Comando | Resultado |
|---|---|
| `npm test` | 1177 tests: **1175 PASS**, 0 FAIL, 2 SKIP normativos preexistentes |
| `npm run check` | PASS: misma regresión, build API, typecheck/build cliente, typecheck/build gestión y `production_config_gate_ok` |
| `git diff --check` | PASS; solo avisos de normalización CRLF del entorno Windows |

No se ejecutó Stripe sandbox ni se consultó ningún secreto operativo. No se activaron worker, correo, endpoints productivos o migraciones externas.

### 4.3 GitHub Actions y diagnóstico del gate remoto

El SHA de código validado `3fe626ce436050672b56b6b316d917f25572b39c` terminó con **4/4 workflows SUCCESS**:

- [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/41924645402): 15 min 17 s; aceptación H6 consolidada, publicación de evidencias, build, gate de configuración, Docker Compose, imagen API aislada y healthcheck PASS.
- [Bootstrap PostgreSQL 17](https://github.com/jdlc86/CartaViva/actions/runs/41924645392): 10 min 16 s; migraciones y regresión PG17 PASS.
- [PWA cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41924645443): 1 min 25 s, PASS.
- [PWA gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41924645365): 52 s, PASS.

La primera ejecución funcional (`f951f7a9`) y las dos ejecuciones siguientes (`426d52ce`, `0e06df98`) permitieron reproducir en runner la aserción incorrecta «cash settlement must enter PG17 account-row queue before close». Aumentar temporalmente la observación de 6 a 12 segundos en `0e06df98` reprodujo el mismo fallo y descartó lentitud del runner. El diagnóstico del grafo de espera mostró el bloqueador intermedio; `eda167bb` corrigió solo la observación transitiva, restauró los 6 segundos originales y repitió los cuatro workflows hasta verde. No se relajaron timeouts SQL, permisos, fencing ni resultado económico.

La repetición del commit documental `d7a21708` volvió a pasar Bootstrap PG17 y ambos navegadores, pero el CI consolidado reprodujo un timeout Playwright al esperar la respuesta del segundo clic de consentimiento. La captura mostraba el diálogo y el botón habilitado; el defecto estaba en el orden del arnés, no en la RPC. `3fe626ce` espera primero la emisión del POST aceptado de Chromium y en ese instante inicia el replay HTTP concurrente, manteniendo la carrera SQL y los resultados obligatorios 200/201. Antes del push se repitió desde cero el gate PostgreSQL 17/Chromium: **51/51 PASS**, escenario n.º 49 en **710093 ms**. Después se repitieron los cuatro workflows indicados arriba hasta verde.

## 5. Matriz F01–F28

La evidencia principal es el test integrado `PG17 B3 six isolated logins complete PWA customer A to waiter to economic B journey` de `scripts/ci/table-change-root-postgres17.test.mjs`, complementado por los tests PG17 de operaciones/lectura y por las secciones históricas 12–33 de la matriz de aceptación. `PASS` significa ejecutado en el candidato aislado; no significa autorizado en producción.

| ID | Estado | Evidencia y observación |
|---|---|---|
| F01 | PASS | navegación QR previa sin transferencia ni cuenta movida |
| F02 | PASS | primera confirmación crea cuenta/ronda y fija el plazo natural |
| F03 | PASS | cancelar el aviso no crea solicitud ni mutación |
| F04 | PASS | solicitud sin destino durable y visible a sala |
| F05 | PASS | reintento/concurrencia deduplicados por SQL |
| F06 | PASS | pedido y pago de origen siguen permitidos mientras está pendiente |
| F07 | PASS | rechazo y cooldown medidos con ventana natural de 90 s |
| F08 | PASS | carrera contra vencimiento usa reloj PostgreSQL y decisión tardía falla |
| F09 | PASS | aprobación única, mensaje y ausencia de traslado |
| F10 | PASS | rechazo sin motivo, mensaje durable y sin traslado |
| F11 | PASS | escaneos posteriores no consumen permiso ni mueven cuenta |
| F12 | PASS | confirmación en B consume una vez y conserva la cuenta original |
| F13 | PASS | C sin permiso nuevo se rechaza |
| F14 | PASS | pedido adicional en A no consume el permiso aprobado |
| F15 | PASS | permiso aprobado sigue utilizable tras la ventana de respuesta |
| F16 | PASS | cierre, sesión y revocación serializados contra el consumo |
| F17 | PASS | QR rotado/mesa no operativa fallan sin efectos parciales |
| F18 | PASS | cuentas y eventos de varios comensales permanecen aislados |
| F19 | PASS | destinos pendientes se actualizan; historia/recogidas no se reescriben |
| F20 | BLOCKED | caja y proveedor simulado pasan; faltan Stripe sandbox real y semántica de coste cero |
| F21 | PASS | plazo no se reinicia; revisión correctiva conserva pedido/ronda, despacha una vez y recibe ACK |
| F22 | PASS | B/C concurrentes consumen una sola concesión |
| F23 | PASS | fallo post-consumo revierte pedido, ronda, permiso, cuenta, destino y despacho |
| F24 | PASS | replay devuelve cuenta/pedido/destino originales sin duplicados |
| F25 | PASS | outbox/SSE por cursor, reconexión y aislamiento cliente/personal |
| F26 | PASS | rol incorrecto, JWT expirado o personal revocado no escriben |
| F27 | PASS | ledger conserva actor, origen, decisión, tiempos, destino, pedido y revisiones |
| F28 | BLOCKED | Playwright/axe/responsive automatizados pasan, pero falta aceptación visual humana final y caja aprobada |

## 6. Matriz R01–R10

| ID | Estado | Evidencia y límite |
|---|---|---|
| R01 | PASS | migraciones forward-only desde PG17 limpio en el gate oficial |
| R02 | PASS | constraints, FK, FORCE RLS, roles mínimos, funciones selladas, allowlists y preflight positivos/negativos |
| R03 | BLOCKED | carreras de mesa/cierre/caja/revocación pasan; falta proveedor Stripe sandbox real |
| R04 | BLOCKED | rollback post-consumo y varios fallos internos pasan; no se certificó fallo externo real de Stripe en cada fase |
| R05 | BLOCKED | importes, efectivo, replay y proveedor simulado pasan; faltan conciliación/captura/refund sandbox y coste cero normado |
| R06 | PASS | agrupación, invalidación, revisión, cocina, sala, pickup y destino A→B observados en PG17/Chromium |
| R07 | PASS | outbox, SSE, cursor, resincronización, pérdida LISTEN, replay y aislamiento multiusuario |
| R08 | PASS | HTTP autenticado con cookies/JWT/HMAC y negativas de pertenencia/rol |
| R09 | BLOCKED | E2E Chromium, axe, responsive y capturas pasan localmente y en Actions; falta aceptación visual humana final |
| R10 | PASS | cuatro workflows del commit de código validado `3fe626ce` terminan SUCCESS; enlaces y pasos en §4.3 |

## 7. Riesgos residuales y operación

- El candidato continúa opt-in y no debe montarse por variables no revisadas.
- La migración es candidata y solo se ha aplicado a PG17 efímero; no existe autorización para Supabase operativo.
- La recuperación de LISTEN está validada, pero el contrato de supervisión y alertas de proceso para producción sigue pendiente.
- JWT/JWKS/HMAC del E2E son criptográficamente reales pero generados para el arnés, no credenciales productivas.
- Ninguna prueba interpreta `claimed` como entrega física ni cierra automáticamente una cuenta de importe cero.
- Un GO técnico futuro exige resolver los bloqueos, repetir el mismo SHA y obtener autorización expresa separada para despliegue.

## 8. Estado de cierre

- **Hito I — revisiones correctivas F21/R06:** implementado y validado localmente y en GitHub Actions.
- **Hito II — Stripe/caja/cierre:** parcialmente implementado; BLOCKED por proveedor real, coste cero y UI aprobada.
- **Hito III — operativa/seguridad/visual:** operativa y seguridad automatizadas PASS; visual final BLOCKED.
- **Hito IV — puerta F/R:** acta emitida y R10 PASS; existen filas BLOCKED, por tanto no puede declararse cierre productivo.

**Dictamen:** PR revisable y candidato técnico F21/R06 listo para revisión independiente; **NO-GO de producción**, PR permanece Draft, sin merge ni despliegue.
