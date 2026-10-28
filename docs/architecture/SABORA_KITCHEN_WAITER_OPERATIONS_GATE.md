# Puerta de operaciones de cocina y camarero — Sabora

Fecha: 2026-10-24

Estado: **candidato integrado, sin activación operativa ni grants de runtime**

Este documento delimita el bloque implementado en la rama
`codex/sabora-kitchen-waiter-operational`. No amplía el contrato funcional
consolidado ni autoriza un despliegue.

## Alcance cerrado

El flujo persistente se ejecuta por línea de pedido y admite exclusivamente:

1. `confirmed -> preparing`, por cocina o ADMIN.
2. `preparing -> ready`, por cocina o ADMIN. La misma transacción crea el aviso
   durable de recogida.
3. `ready -> picked_up`, por camarero o ADMIN. La misma transacción confirma el
   aviso de recogida.

`picked_up` significa recogida por sala, no entrega al comensal. No existe una
transición agregada del pedido completo. Las vistas de cocina y sala se
reconstruyen desde PostgreSQL después de una recarga; no se conserva un estado
operativo en el navegador y no se ha incorporado sondeo automático.

## Límite de identidad y autorización

- Las rutas solo consumen `verifiedIdentity` y `verifiedStaff`, poblados por los
  hooks criptográficos y de membresía existentes. Actor y rol no forman parte
  del cuerpo HTTP.
- La membresía activa y el rol se vuelven a leer con `FOR SHARE` en la misma
  transacción que la lectura o mutación solicitada.
- La composición es opt-in y exige pools inyectados y declaradamente separados
  para lectura de personal y operaciones. No lee variables de entorno, no abre
  conexiones y no se importa desde `server.mjs`.
- La función SQL es `SECURITY INVOKER`. La tabla de reintentos tiene RLS
  habilitada y forzada. `PUBLIC`, `anon` y `authenticated` no reciben permisos
  de tabla ni ejecución de la función.
- No se ha creado un login operativo ni una política RLS permisiva. La ruta no
  puede activarse hasta aprobar y probar la identidad PostgreSQL de mínimos
  privilegios y su bootstrap.

## Atomicidad, concurrencia e idempotencia

La correlación pertenece al actor verificado. Una petición nueva:

1. valida identificadores y transición;
2. toma un advisory lock transaccional sobre actor y correlación;
3. estabiliza y revalida la membresía activa, también para un replay;
4. reproduce el resultado durable si existe el mismo fingerprint o rechaza la
   reutilización con parámetros diferentes;
5. bloquea la línea con `FOR UPDATE`;
6. cambia el estado, crea o confirma el aviso, escribe el evento y registra el
   resultado idempotente dentro de una sola transacción.

Las restricciones y locks impiden dos avances efectivos de la misma línea. Un
fallo intermedio revierte estado, aviso, evento y registro de correlación. Los
eventos y los resultados de correlación tienen triggers que rechazan
`UPDATE`, `DELETE` y `TRUNCATE`.

## Contrato HTTP candidato

Las rutas se mantienen sin montar en el servidor general:

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/v1/operations/order-lines` | Proyección paginada y filtrada por el rol verificado |
| `POST /api/v1/operations/order-lines/:lineId/transitions` | Transición atómica; `201` nueva y `200` replay idéntico |
| `GET /api/v1/operations/orders/:orderId/history` | Historial append-only sin identificador privado del actor |

La respuesta usa códigos públicos acotados, `Cache-Control: no-store` y no
propaga mensajes SQL. La PWA consume estas rutas mediante un transporte
inyectado; el módulo no realiza autenticación ni `fetch` directo.

## Bloqueos contractuales deliberados

### Entrega al comensal

El esquema vigente termina en `picked_up` y la documentación declara que ese
estado no acredita entrega. Añadir `delivered` o inferir entrega por pedido
completo sería inventar semántica, destinatario y autorización. La acción queda
deshabilitada hasta que exista contrato y migración aprobados.

### Cancelación e incidencias

El contrato distingue origen cocina, solicitud de cliente y motivo del
restaurante, con arbitraje, ajuste de deuda o reembolso y notificaciones a
destinatarios concretos. Todavía faltan permisos detallados, límites
antifraude, expediente durable y coordinación económica. Por ello no se ha
añadido una transición de cancelación ni un campo de motivo aislado: hacerlo
podría cancelar preparación sin ejecutar el efecto económico obligatorio. La
PWA muestra la acción bloqueada.

## Puerta pendiente para activación

Antes de montar las rutas deben aprobarse y verificarse en PostgreSQL 17
desechable:

1. login técnico exclusivo sin propiedad, `BYPASSRLS` ni privilegios ajenos;
2. políticas RLS y grants mínimos para las consultas y la función exactas;
3. preflight de `current_user` y `session_user` para ambos pools;
4. bootstrap de autenticación que inyecte el transporte autorizado en la PWA;
5. contrato de entrega y modelo completo de incidencia/cancelación;
6. mecanismo de eventos si se aprueba actualización en tiempo real sin polling.

No se aplicó ninguna migración a Supabase operativo, no se desplegó y no se
modificó infraestructura compartida.

## Composición con verificación previa explícita

`registerVerifiedOrderOperationsFromPools(app, options)` ejecuta el preflight
asíncrono de las identidades SQL antes de delegar el registro de rutas. Una
identidad incorrecta o un fallo de inspección impiden montar las rutas; las
pruebas comprueban que el objeto HTTP no recibe registros en ese caso.
La función es **opt-in**, no está importada por `server.mjs`, y no abre ni
configura conexiones. El bootstrap operativo sigue bloqueado por los grants,
las políticas RLS y el contrato de autorización pendientes. La composición
histórica no debe utilizarse como bypass del nuevo gate de activación.

## Eliminación de bypass de composición

La función síncrona de registro `registerOrderOperationsFromPools` pasa a ser
**privada del módulo**. La única exportación que registra rutas desde pools es
`registerVerifiedOrderOperationsFromPools`, que requiere preflight de identidad
SQL previo. Las pruebas de composición usan la exportación verificada y
comprueban que la variante sin verificación no se exporta. El servidor
operativo continúa sin importar este módulo; no se habilita el flujo hasta
superar la puerta de permisos RLS y autenticación documentada.

## Corrección de regresión CI

Los workflows del commit `951d710` detectaron un fallo en el test de composición:
la prueba había migrado al gate verificado sin suministrar `staffRole` ni
`operationsRole`, por lo que rechazaba el contrato de identidad antes de
comprobar aislamiento. Se añadieron ambos roles al fixture y una comprobación
inmediata de aislamiento en el gate asíncrono antes de ejecutar SQL. El nuevo
HEAD requiere validación de ambos workflows; no se considera validado por el
simple cambio de fixture.

## Pruebas de ausencia de efectos secundarios

La suite de composición verifica explícitamente que un pool compartido o
dos roles declarados idénticos provocan rechazo **antes** de consultar SQL
y sin registrar rutas HTTP. Esta comprobación complementa el preflight
positivo de identidad, no sustituye la revisión de grants/RLS. El acceso
positivo y la activación continúan pendientes.

## Unificación del control de aislamiento

Las dos rutas internas de composición comparten ahora una única validación
privada `assertIsolatedPools`, que rechaza pools ausentes, compartidos,
sin interfaz requerida o con credenciales/URL indistinguibles. La entrada
pública sigue siendo únicamente la composición asíncrona verificada; no se
montan endpoints en `server.mjs`. La refactorización no concede permisos ni
modifica la semántica del contrato HTTP.

## Matriz de regresión del aislamiento

Las pruebas de composición cubren pools ausentes, métodos SQL ausentes,
identidad de usuario repetida y cadena de conexión repetida. Cada rechazo
comprueba ausencia de consultas SQL, conexiones y registro de rutas HTTP.
Estas pruebas no sustituyen el preflight de roles reales ni los ensayos de
permisos positivos en PostgreSQL 17.

## Metadatos del login técnico

El preflight verifica también que `rolconnlimit` tiene formato entero válido
y que `rolvaliduntil`, si existe, es una fecha válida. Esta comprobación
adicional es de integridad de los resultados SQL, no constituye una política
de caducidad o de límites de conexiones: esos valores siguen pendientes del
contrato de aprovisionamiento de identidades.

## Validación de la respuesta de transición

La capa de repositorio rechaza resultados SQL inconsistentes incluso si
la consulta devuelve una fila: solo se admiten transiciones adyacentes
`confirmed → preparing → ready → picked_up`; el estado `preparing` no
puede devolver un aviso de recogida, mientras que `ready` y `picked_up`
requieren un identificador válido de aviso. La prueba unitaria cubre
estados no adyacentes, avisos ausentes o sobrantes e identificadores de
línea inválidos. Estas garantías no autorizan por sí mismas la RPC ni
el montaje HTTP.

## Compatibilidad del harness PostgreSQL 17

Tras incorporar el rechazo anticipado por rol en el repositorio, las pruebas
reales de PG17 se actualizaron para suministrar el rol de cocina en la
invocación directa del repositorio y esperar el rechazo local de una
transición de sala incompatible. Esto preserva las comprobaciones de rollback,
concurrencia e idempotencia sin retirar la defensa previa al SQL. La corrección
responde a los fallos del workflow `40102104928` y `40102104861`.

## Corrección de regresión de CI (2026-10-24)

Tras introducir la denegación anticipada de transiciones incompatibles con
el rol, dos aserciones del harness PostgreSQL 17 quedaron desfasadas: la
transición de camarero a `ready` ahora se rechaza antes de llegar a la RPC,
y la prueba de rollback debía pasar explícitamente el rol `kitchen` al
repositorio. Ambas pruebas se han alineado con el contrato nuevo sin relajar
las comprobaciones de seguridad. La aceptación depende de la ejecución verde
de los dos workflows sobre el SHA actualizado.

## Comprobación estricta de contexto de actor

El coordinador rechaza antes de abrir una transacción las identidades
verificadas malformadas: identificadores de empleado no UUID, objetos de
identidad que sean arrays, roles fuera del conjunto de cocina, sala y
administración y desacuerdo entre el UUID autenticado y el del empleado.
Las pruebas exigen cero transacciones para estos casos. Esta defensa del
backend no vincula por sí sola la identidad al login SQL compartido: el
bloqueo de suplantación directa de la RPC sigue vigente.

## Restricciones de transición en la frontera HTTP

La ruta candidata de transición rechaza con `403 forbidden` los destinos
incompatibles con el rol de personal verificado: cocina no recoge y sala no
prepara ni marca listo. La prueba Fastify verifica que en estos casos no se
invoca siquiera al coordinador. El repositorio mantiene la misma denegación
antes de SQL y PostgreSQL vuelve a comprobar los permisos transaccionales.
Las rutas siguen sin montarse en el servidor de producción.

## Clasificación explícita de errores de transición

La capa de repositorio distingue entradas malformadas
(`invalid_order_line_transition`, respuesta HTTP 400) de destinos válidos
pero incompatibles con el rol (`order_operations_forbidden`, HTTP 403).
La comprobación se realiza antes de SQL. Las pruebas de repositorio y el
harness PG17 validan esa distinción; la denegación no se convierte en un
conflicto 409 ni en una indisponibilidad 503. No cambia la política de
permisos SQL ni autoriza el montaje operativo.

## Alcance de filtros del tablero en HTTP

La API candidata aplica ahora la misma frontera de rol que el repositorio
para los filtros de estado: cocina no puede solicitar `picked_up` y sala no
puede solicitar `confirmed` ni `preparing`. Las peticiones prohibidas
responden `403` antes de invocar al coordinador; los filtros permitidos
continúan hacia el coordinador, donde se revalida la membresía. Pruebas
Fastify verifican ambos recorridos. Las rutas permanecen sin montar.

## Integridad de proyecciones SQL por rol

El repositorio verifica ahora las filas del tablero **después** de la
consulta, antes de construir la respuesta pública. Si la consulta devuelve
una línea fuera de la visibilidad del rol autenticado (cocina: sin
`picked_up`; sala: sin `confirmed` ni `preparing`) o una línea que no
coincide con el filtro de estado solicitado, se rechaza el resultado
completo con `invalid_order_operations_sql_result`. La prueba unitaria
simula resultados SQL incompatibles para cocina, sala y administración.
Esta validación de salida no sustituye RLS ni habilita el acceso SQL positivo.

## Integridad del historial de transiciones

El repositorio verifica que cada evento devuelto por SQL represente
únicamente uno de los tres saltos consecutivos autorizados:
`confirmed → preparing`, `preparing → ready` o `ready → picked_up`.
Los saltos, retrocesos y repeticiones de estado se rechazan antes de
producir el DTO público; las pruebas cubren resultados SQL falsos. Este
control no acredita por sí solo el orden temporal completo de eventos ni
reemplaza el contrato transaccional y las políticas RLS pendientes.

## Continuidad por línea del historial

Además de validar cada transición individual, la proyección del historial
comprueba la continuidad de estados entre eventos consecutivos **de la
misma línea** y que sus marcas temporales no retrocedan. Se mantienen
cadenas independientes para cada línea del pedido. Las pruebas incluyen
saltos, repeticiones, retrocesos temporales y una cadena válida. La
consulta sigue limitada por `limit`: esta verificación cubre únicamente
los eventos devueltos, no garantiza que no existan eventos anteriores
omitidos por paginación ni reemplaza las restricciones transaccionales.

## Comportamiento de SET ROLE en PG17

El ensayo con `SET ROLE` sobre el login técnico puede fallar en el propio
motor PostgreSQL con `permission denied for schema sabora` al evaluar la
firma de la RPC del preflight, antes de producir el error interno de
identidad. El harness acepta ambas formas de denegación, sin admitir una
comprobación exitosa bajo el rol alternativo. La prueba continúa en la base
de datos efímera de GitHub Actions, no en Supabase operativo.

## Unicidad de identificadores del historial

La proyección rechaza identificadores de evento repetidos en la respuesta,
incluso si las filas afectadas pertenecen a líneas diferentes del mismo
pedido. La comprobación complementa la continuidad por línea y evita
presentar una historia duplicada como si fueran dos eventos durables.
La garantía primaria de unicidad continúa correspondiendo a PostgreSQL.

## Cierre de frontera de errores HTTP

La capa HTTP clasifica únicamente **códigos de error de dominio exactos**:
403 para `order_operations_forbidden`, `actor_not_authorized` y
`role_not_allowed_for_line_transition`; 404 para `line_not_found` y
`order_not_found`; 409 para `invalid_line_transition` y
`line_transition_idempotency_conflict`; 400 para los tres errores de
validación de petición previstos. Los errores de motor SQL, transporte y
mensajes con sufijos o prefijos inesperados se devuelven como 503 genérico,
sin detalles privados. Se elimina la clasificación por subcadenas, que
podía confundir mensajes arbitrarios del driver con errores autorizados.
La batería Fastify prueba códigos públicos y redacción de secretos.

## Integridad de la paginación del tablero

La lectura del tablero comprueba **todas** las filas devueltas por SQL,
incluida la fila adicional utilizada para calcular `nextCursor`: orden
estrictamente creciente por `(confirmed_at, order_id, line_number)`,
identificador de línea no repetido y posición estrictamente posterior al
cursor solicitado. Se rechazan páginas desordenadas, repetidas, con fechas
inválidas o que retrocedan sobre el cursor. Las pruebas cubren una página
válida con overflow y los rechazos anteriores. Es validación defensiva de
la proyección, no una concesión de permisos ni un mecanismo de despacho.

## Orden global del historial y límite del rol histórico

La proyección comprueba también el orden global ascendente de los eventos
por `(occurred_at, event_id)` según el `ORDER BY` de la consulta, además de
la continuidad de cada línea y la unicidad de eventos. La prueba cubre
inversiones temporales, desempate de identificadores y orden válido entre
líneas distintas. **No se infiere autorización histórica desde `actor_role`:**
la consulta une `order_line_events` con el rol **actual** de
`staff_members`, que puede haber cambiado desde que ocurrió el evento.
Para auditar el rol ejercido en el momento de la transición hace falta
un snapshot durable aprobado en el contrato, no una validación contra el
rol actual. No se ha cambiado el esquema ni habilitado rutas.

## Consistencia del rol histórico

La proyección de eventos verifica también la matriz de autorización del
actor histórico: `waiter` únicamente puede figurar en el paso
`ready → picked_up`; `kitchen` únicamente en `confirmed → preparing` o
`preparing → ready`; `admin` puede figurar en cualquiera de los tres pasos.
Se rechaza la respuesta completa si un evento contradice esa matriz. Las
pruebas incluyen casos válidos e inválidos por rol. La comprobación de salida
no sustituye la autorización transaccional de la escritura ni resuelve el
bloqueo de identidad SQL no falsificable.

## Vinculación positiva del actor (Hito 1, no activada)

`870230f` sustituye la futura vía de escritura por
`transition_order_line_authorized_candidate(...)`. Una capacidad HMAC efímera
liga el login real (`session_user`), actor verificado, línea, transición,
correlación y tiempos. PostgreSQL verifica la firma, bloquea clave y membresía,
revalida caducidad y ejecuta transición, evento, aviso e idempotencia en la
misma transacción. El harness PG17 demuestra que UUID, GUC, `SET ROLE`, firma
alterada, rol equivocado, expiración y revocación no elevan autoridad.

La RPC antigua sigue sin `EXECUTE`; el nuevo wrapper tampoco tiene grants ni
clave runtime. Las lecturas de tablero/historial y la provisión operativa siguen
pendientes, de modo que las rutas permanecen sin montar. El detalle está en
`docs/security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md`.

## Aceptación HTTP de mutación con login PostgreSQL restringido (25-10-2026)

La suite `scripts/ci/order-operations-identity-postgres17.test.mjs`
incorpora una prueba Fastify + coordinador + PostgreSQL 17
**desechable** que usa el login técnico de operaciones
`NOSUPERUSER NOBYPASSRLS NOINHERIT` y únicamente la RPC
de transición autorizada por firma. Recorre
`confirmed → preparing → ready → picked_up`, valida
notificación durable, reintentos sin duplicados, ausencia
de actor HTTP y transiciones incompatibles con el rol.
Comprueba persistencia de tres eventos, tres solicitudes
de transición y una notificación. Commit `99a8af5`:
Sabora CI y Bootstrap SUCCESS.

La misma prueba exige `503` con DTO público fijo para
tablero e historial, porque las capacidades SQL de lectura
siguen sin aprobarse; el login restringido tampoco puede
leer directamente `sabora.order_lines`. La identidad
HTTP se inyecta mediante un mecanismo **solo de test**,
no representa autenticación de producción.

**Conclusión del gate:** queda validada la mutación
firmada con login restringido, pero **no** la activación
integral de operaciones. No se deben conceder SELECT
generales para hacer pasar tablero/historial. Es necesario
diseñar y probar proyecciones SQL acotadas por actor y rol
con permisos mínimos, además de la autenticación real,
antes de habilitar las rutas. No hay despliegue,
migración operativa ni merge.

## Aceptación de concurrencia HTTP con identidad SQL restringida (25-10-2026)

La suite PG17 desechable
`scripts/ci/order-operations-identity-postgres17.test.mjs`
incorpora el test `Fastify + restricted PG17: parallel retries
and competing actors stay atomic`. Ejecuta solicitudes
Fastify simultáneas con el login técnico de operaciones
restringido y autorización de transición firmada.
Verifica que dos reintentos concurrentes del mismo actor
producen un solo evento persistido y respuestas 201/200
con el mismo `eventId`; dos actores distintos compitiendo
por el mismo cambio producen 201/409 y un solo evento;
y una correlación reutilizada con otro destino responde
409 sin efectos adicionales. Commit `77d7b4f`:
Sabora CI y Bootstrap SUCCESS.

Esta prueba **no** amplía permisos de lectura del
tablero/historial, no autentica personas en producción
(el actor HTTP sigue siendo un inyector de test) y no
habilita las rutas operativas. Permanece pendiente el
gate de proyecciones SQL de lectura acotadas por actor
y rol, la integración PWA y la aceptación del recorrido
completo desde confirmación del cliente.

## Composición opt-in de mutaciones sin lectura (25-10-2026)

El registro HTTP `registerOrderOperationsHttp` acepta
`transitionOnly: true`, que monta exclusivamente
`POST /api/v1/operations/order-lines/:lineId/transitions`;
no registra tablero ni historial, cuyos privilegios SQL
siguen expresamente sin aprobar. El comportamiento completo
anterior permanece como opción predeterminada para
harness y pruebas, **no** para activación operativa.

`registerVerifiedOrderTransitionsOnlyFromPools` es una
composición candidata separada. Antes de registrar la ruta
comprueba aislamiento de pools, diferencia de roles SQL,
login restringido de personal sin RPC de mutación y
login restringido de operaciones con la RPC firmada
autorizada. Inyecta hooks criptográficos de personal
existentes, transacción PostgreSQL y emisor de capacidad;
no importa `server.mjs`, no lee secretos de entorno,
no aprovisiona ni activa conexiones. La suite
`tests/order-operations-transition-only-http.test.mjs`
comprueba la ausencia física de las rutas GET, el POST,
compatibilidad con el registro completo y rechazo de
configuración ambigua.

**Puerta aún cerrada:** la composición candidata no
sustituye la verificación de permisos y bootstrap del
lector de personal en un despliegue real. No se habilitan
proyecciones SQL de lectura ni se declara producción
lista. Sigue prohibido abrir SELECT generales sobre
tablas privadas o montar esta ruta en el servidor
operativo sin completar los gates normativos.

## Bloqueo de verificación CI por conflicto del PR #11 (25-10-2026)

La composición candidata de mutaciones sin lectura tiene
pruebas negativas adicionales en
`tests/order-operations-composition.test.mjs`:
aislamiento de pools, roles SQL distintos, emisor de
capacidad presente y ausencia de ruta duplicada; los
rechazos anteriores al preflight no consultan SQL ni
registran rutas. Las pruebas de HTTP exclusivas permanecen
en `tests/order-operations-transition-only-http.test.mjs`.

**Estado de aceptación:** no validado por GitHub Actions.
Al consultar el PR #11, GitHub devuelve
`mergeable=false`, `mergeable_state=dirty`; el HEAD
de la rama no tiene workflows asociados. No se debe
heredar el verde de commits anteriores ni marcar
este bloque como cerrado. Resolver el conflicto con
la base exige reconciliar el código y la documentación
normativa, sin merge a producción, y volver a ejecutar
ambos workflows sobre el SHA resultante.

## Recuperación de CI y corrección del gate de mutación (25-10-2026)

Los workflows `Sabora CI` y `Bootstrap Sabora lockfile`
se ejecutan ahora también mediante `push` sobre la rama
`integration/sabora-hito1-identity-staff`. Esto permite
validar el HEAD sin depender de que GitHub genere el merge
ref del PR #11, que todavía indica `mergeable_state=dirty`.
El cambio no despliega, fusiona ni activa endpoints.

La primera ejecución real detectó una regresión en la
prueba de composición: se había dejado una comprobación
SQL de la mutación accidentalmente dentro de un comentario
de código. El commit `bbd491f` restaura la ejecución
obligatoria y secuencial de
`preflightOrderTransitionStaffIdentity` y
`preflightOrderTransitionIdentity` antes de crear hooks
o registrar la ruta. Los dos roles declarados deben ser
distintos. Ambos workflows sobre `bbd491f` terminaron
`SUCCESS` (runs `40231185079` y `40231185082`).

**Alcance aceptado:** composición candidata y pruebas
de mutación aislada; no se consideran autorizados
tablero/historial ni autenticación o activación operativa.
El conflicto del PR #11 sigue pendiente de reconciliación
con la rama base y no debe confundirse con el resultado
verde del código de la rama de integración.

## Aceptación positiva de la composición de transición aislada (25-10-2026)

La prueba `transition-only composition verifies two independent
SQL principals before mounting POST` en
`tests/order-operations-composition.test.mjs` valida
la secuencia positiva de los dos preflights SQL con
identidades distintas, liberación de las conexiones y
registro exclusivo de `POST /api/v1/operations/order-lines/:lineId/transitions`.
Comprueba ausencia física de las rutas GET de tablero e
historial y respuesta `401` a una solicitud sin token
válido. Es una aceptación con pools SQL simulados y
Fastify real; no sustituye los tests PostgreSQL 17
desechables del login restringido ni acredita el
bootstrap de producción.

Commit `b75a56d`: workflows `Sabora CI`
`40231650770` y `Bootstrap Sabora lockfile`
`40231650771` ambos `SUCCESS`, incluidas sus
pruebas PostgreSQL 17 desechables. El PR #11 sigue
en Draft y mantiene su conflicto de integración;
ninguna ruta fue montada en el servidor operativo.

## Gate atómico de configuración y dos identidades SQL (25-10-2026)

La composición candidata `registerVerifiedOrderTransitionsOnlyFromPools`
rechaza `issuer` ausente/vacío, `getTrustedKeys` no invocable
y hooks opcionales `verify`/`observe` no invocables
**antes** de abrir conexiones SQL. Después inspecciona
primero el login de personal y después el login técnico
de mutaciones; si falla cualquiera de las inspecciones,
descarta la conexión fallida y no registra ninguna ruta.
Los tests `transition-only rejects missing or malformed
authentication wiring without SQL or routes` y
`transition-only fails atomically on either SQL principal,
never mounting HTTP routes` ejercitan ambos caminos.
Commits `8800b1b`, `6f07cdc`, `76b865b`.

Aceptación CI del commit `76b865b`: `Sabora CI`
run `40232010918` y `Bootstrap Sabora lockfile`
run `40232010985`, ambos `SUCCESS`. Estas pruebas
validan configuración y fail-closed de la composición
con dobles SQL simulados; el workflow incluye sus
suites PG17 desechables independientes. No autorizan
lectura de tablero/historial, ni montan operaciones en
`server.mjs`, ni resuelven el conflicto del PR #11.


## Hito de reconciliación de ramas PR #11 / PR #13 (25-10-2026)

La rama candidata `integration/sabora-pr11-merge-reconciliation` conserva el árbol probado de `integration/sabora-pr11-reconciliation` y registra la ascendencia de `integration/sabora-order-management-review` mediante commits de integración. Las diferencias de contrato de actor/rol, snapshots de entrada y preflight SQL se reconciliaron previamente con pruebas de regresión, sin sustituir la autorización por capacidad SQL firmada ni habilitar rutas operativas.

La comparación GitHub de la rama candidata frente a la base confirma `status=ahead`, `behind_by=0`; el PR #13 está en Draft y `mergeable_state=clean`. Commit de integración `1f4e1536711dfdcdf70c3d187b59ba423c98103c`: Sabora CI run `40236383992` SUCCESS y Bootstrap Sabora lockfile run `40236384037` SUCCESS, con verificaciones PostgreSQL 17 desechables y construcción aislada. El PR #11 original sigue siendo un PR distinto y no se ha fusionado ni modificado su rama.

**Límite de aceptación:** este hito cierra la compatibilidad de historia Git y la regresión automatizada de la rama candidata, pero no autoriza el merge, el despliegue, la activación de GET tablero/historial, ni concede permisos SQL de producción. Mantener el aislamiento absoluto del VPS y de Fleetia.

## Aceptación PostgreSQL 17 del lector y POST aislado (26-10-2026)

El gate de transición aislada se ha ejercitado de extremo a extremo con dos
logins PostgreSQL 17 distintos y no privilegiados. `sabora_staff_reader` posee
solo `SELECT(user_id,role,state)` y su política RLS; el login mutador no posee
tablas ni columnas y solo ejecuta el wrapper HMAC autorizado. El preflight
rechaza grants por columna `UPDATE(state)`, `INSERT(role)` y
`REFERENCES(user_id)`, aislados y combinados, además de escritura a nivel tabla.

Tras ambos preflights, Fastify valida un JWT RS256, resuelve la membresía actual
con el lector y ejecuta una transición atribuida al mismo sujeto mediante el
pool mutador. Sin bearer o con firma alterada no llega a SQL de negocio. La
composición solo registra `POST /api/v1/operations/order-lines/:lineId/transitions`;
tablero e historial permanecen físicamente ausentes. También se prueba que una
capacidad que caduca esperando el lock de la línea no deja efectos.

Esta evidencia cierra la aceptación candidata solicitada para el PR #13, no la
activación operativa: `server.mjs` sigue sin importar esta composición; no se
han creado credenciales persistentes, aplicado migraciones remotas, desplegado
servicios ni tocado Fleetia o el VPS. La revisión independiente posterior al CI
final continúa siendo un gate humano separado.

## Aplicación candidata aislada (2026-10-28)

`apps/api/src/order-operations-candidate-app.mjs` incorpora una fábrica opt-in
`createVerifiedOrderOperationsCandidate(options)`. Construye una instancia Fastify
sin listener, exige el gate de los tres endpoints con identidades SQL separadas,
autenticación criptográfica inyectada y preflight de privilegios, y cierra la
instancia si falla el arranque. El servidor general no importa esta fábrica.
La fábrica no provisiona logins, no concede grants, no configura secretos ni
activa un servicio. Las pruebas de rechazo se encuentran en
`tests/order-operations-candidate-app.test.mjs`. La integración positiva con
PostgreSQL 17 desechable y credenciales de mínimos privilegios sigue siendo
condición pendiente para considerar operativo este candidato.

## Rechazo de principal operativo privilegiado

La prueba de arranque aislado también simula un login operativo con
`BYPASSRLS` habilitado después de superar el preflight del lector de
personal. La fábrica debe rechazar la identidad, descartar su conexión y no
devolver ninguna aplicación preparada. Este ensayo usa un resultado SQL
simulado y no demuestra el aprovisionamiento real de roles. La prueba positiva
de PostgreSQL 17 con los grants exactos sigue pendiente y es condición para
activar las rutas.

## Evidencia de login PostgreSQL real sin permisos (CI aislado)

El script `scripts/ci/order-operations-login-denial-smoke.sh`, ejecutado por
`postgres-migration-smoke.sh` tras aplicar todas las migraciones en PostgreSQL
17 desechable, autentica un login independiente por TCP local dentro del
contenedor. Comprueba cinco denegaciones efectivas mediante SQLSTATE
`insufficient_privilege`: SELECT sobre ambos registros y EXECUTE de los tres
wrappers autorizados. No acepta errores genéricos como evidencia de permisos
correctos. El login de prueba no se conserva ni se provisiona fuera del runner.

Esta prueba es **negativa**: no demuestra que los dos logins operativos con sus
grants exactos puedan arrancar la aplicación candidata y servir tablero,
transición e historial. Esa prueba positiva continúa bloqueando la activación.

## Integración positiva de la fábrica candidata en PostgreSQL 17

`scripts/ci/order-operations-read-postgres17.test.mjs` utiliza ahora
`createVerifiedOrderOperationsCandidate` (la fábrica candidata real) en
lugar de registrar manualmente sus rutas. Crea dos logins SQL distintos
de mínimos privilegios en PostgreSQL 17 desechable, configura grants
exactos, supera los preflights y exige que se registren las tres rutas.
Ejecuta con JWT firmado el flujo de cocina y sala, incluido tablero,
transiciones, reintentos, historial y persistencia. Las pruebas adicionales
del mismo archivo cubren permisos, capacidades firmadas, caducidad y
revocación. La CI es la evidencia de ejecución; hasta obtener resultados
SUCCESS del SHA correspondiente, este cambio permanece sin validar.

Esta fábrica no se importa desde `server.mjs`, no abre listener y no
habilita rutas en producción. La aprobación de activación operativa,
credenciales y despliegue siguen siendo hitos independientes.

## Transporte autenticado opt-in de la PWA de gestión

`apps/management/src/order-operations-authenticated-gateway.js` incorpora
un adaptador de transporte que exige un proveedor de token de acceso confiable,
obtiene una credencial nueva para cada petición, evita cookies, redirecciones
y caché, y rechaza la petición antes de hacer red cuando falta identidad.
La suite `apps/management/tests/order-operations-authenticated-gateway.test.mjs`
verifica el rechazo sin credenciales y el encabezado Bearer. El adaptador
no lee localStorage ni sessionStorage, no incluye credenciales en el bundle
y no se conecta automáticamente desde `main.tsx`.

**No se ha habilitado el canal operativo:** falta la integración de sesión
real de gestión con este proveedor, el bootstrap aislado del servidor y la
prueba E2E navegador→API→PG17. Esta entrega no certifica todavía el hito
funcional completo ni autoriza un despliegue.

## Ensayo vertical PWA de gestión → HTTP candidato → PostgreSQL 17

El harness `scripts/ci/order-operations-read-postgres17.test.mjs` incluye
un recorrido adicional por el adaptador autenticado de la PWA de gestión:
`listBoard` → `transitionLine(preparing)` → `transitionLine(ready)` →
`listHistory`. Las peticiones pasan por Fastify `inject` de la fábrica
candidata y por dos logins PostgreSQL restringidos. Se verifica el estado
persistido y la adquisición de un token nuevo en cada operación. No hay
servidor escuchando ni credenciales productivas. Este ensayo no sustituye
una prueba de navegador real ni conecta automáticamente `main.tsx`;
requiere CI verde del commit correspondiente.

## Punto de montaje explícito de gestión

`apps/management/src/main.tsx` expone
`mountAuthenticatedManagementApp({element,getAccessToken,fetchImpl})`
para un host que ya haya autenticado al empleado y suministre la función
de adquisición de token. El montaje reutiliza el root React existente
cuando coincide con el root de vista previa, evitando dos roots sobre el
mismo elemento. La vista previa predeterminada permanece sin gateway.
No se proporciona todavía ese host autenticado ni se importa la fábrica
SQL candidata desde el servidor general. Este punto de montaje es
infraestructura de integración, **no activación productiva**.

## Cobertura vertical de roles y recogida

El harness PG17 comprueba además dos gateways autenticados separados,
cocina y camarero, con JWT reales sobre el candidato Fastify. Verifica
denegación de preparar por camarero, preparación y aviso durable por cocina,
repetición idempotente sin doble efecto, lectura de listo por sala,
denegación de recogida por cocina, recogida por camarero, historial de tres
eventos y una sola notificación durable. Las credenciales y la base de datos
son exclusivamente efímeras de CI. La conformidad depende de CI verde;
la prueba de navegador con identidad real sigue siendo puerta pendiente.

## Ciclo de sesión y cierre seguro del canal de gestión

El montaje explícito conserva un único React root por elemento y protege
contra cierres tardíos de sesiones anteriores mediante una generación de
montaje. El desmontaje lógico vuelve a la vista previa sin gateway y
revoca el transporte de esa sesión. `revoke()` impide peticiones nuevas,
descarta credenciales recibidas tardíamente y aborta las peticiones HTTP
en curso; el gateway no guarda tokens en almacenamiento del navegador.
Las pruebas cubren ausencia de identidad, token fresco, revocación
antes de la petición, durante la adquisición de token y durante HTTP.
No se conecta automáticamente un proveedor de identidad ni se
habilitan las rutas en el servidor general. La revocación de UI no
sustituye la revocación durable de personal en PostgreSQL.

## Revocación del canal de eventos

El gateway autenticado registra las suscripciones SSE activas y
`revoke()` cierra cada una además de abortar HTTP. La suscripción
rechaza una nueva apertura después de revocación y el cierre idempotente
impide reconexiones de una sesión antigua. Hay regresión automatizada
para cierre SSE y rechazo de resuscripción. El canal no se activa en
la vista previa ni sustituye el control SQL de revocación del personal.

## Liberación del lector SSE

El cliente de eventos libera explícitamente el `ReadableStreamDefaultReader`
cuando se revoca la sesión o se cancela una suscripción, incluso cuando un
adaptador `fetch` no implementa la cancelación automática del cuerpo tras
`AbortSignal`. La regresión verifica que el cuerpo abierto recibe
`cancel()` una sola vez. Esto evita conservar un lector colgado tras
logout; no habilita nuevas capacidades ni cambia las transiciones SQL.

## Aislamiento de sesiones entre empleados

El montaje de gestión utiliza `management-session-fence.js` para asegurar
que solo un canal de operaciones conserva la titularidad activa. Cuando
un host autenticado cambia de empleado sin cerrar antes la sesión anterior,
la nueva sesión revoca el gateway anterior **antes de renderizar**.
Un callback de logout antiguo no puede desmontar ni revocar la sesión
posterior. La revocación se ejecuta como máximo una vez por sesión.
El control se prueba fuera de React con sucesión de identidades, cierres
fuera de orden, cierre global y entradas inválidas. No se infiere el rol
del cliente: la autorización sigue siendo responsabilidad del backend
y PostgreSQL.

## Aislamiento de estado visual por identidad

La revocación del transporte no basta para aislar el estado local React:
la vista de comandas mantiene tablero, historial, eventos, borradores
de incidencia y operaciones pendientes. Al cambiar la identidad del
empleado, `main.tsx` revoca el canal anterior, incrementa la clave de
montaje y reemplaza **sincrónicamente** el árbol de componentes mediante
`flushSync`. Esto evita que el estado de un empleado permanezca visible
durante la siguiente sesión o después del logout. Se añadió un test de
regresión del contrato de montaje y de la vista previa sin gateway.
Este control es una defensa de UI; la separación de datos efectiva
permanece en los hooks de autenticación y RLS PostgreSQL. El recorrido
de navegador con identidades reales sigue pendiente y no se declara
hito productivo cerrado.

## Evidencia adicional de navegador autenticado — 28-10-2026

El workflow `management-browser-visual-smoke.yml` incorpora `scripts/ci/management-authenticated-browser-smoke.mjs`. En Chromium real se monta la PWA con tokens efímeros inyectados y un transporte HTTP interceptado exclusivamente en el contexto del navegador. Se ejercitan preparación, paso a listo, sustitución por una sesión de camarero, ausencia de acciones de cocina para sala y cierre de sesión. El fixture no usa credenciales ni conexiones operativas.

**Alcance de la evidencia:** es una prueba real de interfaz y frontera de transporte con respuestas HTTP simuladas; **NO** certifica E2E navegador → API Fastify → PostgreSQL 17, identidad de personal aprovisionada ni activación. El harness PG17 existente permanece separado. La integración completa sigue pendiente y las rutas del servidor general siguen sin montarse.

## Candidato E2E vertical Chromium → Fastify → PostgreSQL 17 (28-10-2026)

El test `Chromium management PWA traverses signed Fastify candidate and disposable PG17 kitchen-to-waiter` en `scripts/ci/order-operations-read-postgres17.test.mjs` utiliza Chromium real, Vite local efímero, JWT RS256 de personal de prueba, la factoría Fastify candidata con pools SQL restringidos y PostgreSQL 17 desechable del runner. Las peticiones del navegador se puentean mediante Playwright `page.route` hacia `app.inject` para evitar exponer un listener de API o montar el candidato en `server.mjs`; la autorización y la escritura SQL las ejecuta el backend real, no un fixture. Comprueba preparar → listo, persistencia SQL, cambio de identidad cocina/camarero, ausencia de acciones de cocina para sala y cierre de sesión. La conexión SSE se simula como indisponible: esta prueba **no** acredita el transporte SSE de extremo a extremo, recogida en navegador, ni activación productiva. El flujo de recogida e idempotencia SQL ya tiene pruebas de integración separadas.

El harness instala Playwright/Chromium solo en GitHub Actions y usa exclusivamente el contenedor PostgreSQL 17 creado y eliminado por `catalog-postgres17-node-driver-smoke.sh`. **Evidencia CI pendiente de verificar tras los commits `e8cf02f` y `11823f7`; no declarar PASS antes de su conclusión.**

### Evidencia de cierre del E2E vertical (28-10-2026)

El commit `102509ff944204c2ad071f7712e407cee14a5e72` ha superado los tres workflows del PR Draft #40: `Sabora CI` (run 40763993839), `Bootstrap Sabora lockfile` (run 40763993675) y `Sabora management browser visual smoke` (run 40763993641). En el test de navegador se comprueba la transición de una línea identificada por mesa de prueba, la persistencia PostgreSQL 17, la sustitución de sesión de cocina por camarero, la denegación real HTTP 403 de una transición prohibida para camarero y la lectura del historial SQL en la PWA. El navegador usa un puente de transporte de Playwright hacia `app.inject` de Fastify, **no** una API desplegada ni una conexión HTTP remota de producción. El E2E no acredita SSE real, claim/cancel de recogida desde Chromium, ni despliegue; estas capacidades requieren validación específica antes de cualquier activación. PR permanece Draft, sin merge ni despliegue.

### Extensión de seguridad del E2E: revocación activa

El commit `651b322` incorpora una prueba de navegador que conserva un JWT RS256 vigente, suspende el registro de personal en PostgreSQL 17 y exige rechazo HTTP 403 del backend real. La prueba restaura el estado del actor en `finally` para aislar la regresión. **Validado** por los workflows del commit documental `b6ad0cc`: Sabora CI `40764758104`, Bootstrap `40764758071` y visual smoke `40764758043`, todos SUCCESS. Esta cobertura no equivale a implementar el transporte SSE ni las operaciones de recogida, que siguen siendo gates separados.

### Integración H4/H6: fuente de verdad técnica y gate pendiente

La inspección de código confirma que **los endpoints de recogida y SSE ya están implementados en el candidato H6**, no faltan del repositorio: `apps/api/src/h6-operations-http.mjs` registra `pickup-claim`, `pickup-claim/cancel` y `ready-correction`; `apps/api/src/h6-candidate-composition.mjs` registra `registerH6StaffEventStreamHttp` y el notificador de outbox. Lo que falta es **montar y verificar conjuntamente** los candidatos H4 y H6 en un único proceso Fastify aislado y ejercitar Chromium contra esas rutas con PostgreSQL 17 desechable. No duplicar rutas, coordinadores ni funciones SQL de H6 dentro de H4. La composición H6 requiere pools diferenciados y preflight de identidades, autenticación de cliente, flujo de pagos y proveedor; no sustituirlos por dobles en un supuesto E2E. La activación del bootstrap de producción permanece prohibida sin autorización expresa.

### Gate HTTP H6 de recogidas validado (28-10-2026)

Commit `b4ea03fd262f135534f09b4a7a549cdc8c03e75a`: prueba del router `registerH6OperationsHttp` con el coordinador H6 y principal PostgreSQL 17 restringido, dentro del harness desechable `scripts/ci/h6-postgres17.test.mjs`. Verifica payload inválido (400), claim, repetición idempotente, conflicto por versión (409), cancelación, versión durable y prohibición de corrección de cocina por actor de sala. El preHandler de este test inyecta una identidad fija **solo de prueba**; no certifica JWT, que se valida en el gate H4 independiente. Workflows SUCCESS: Sabora CI `40765709976`, Bootstrap `40765709591`, visual smoke `40765709871`. Pendiente: un único E2E Chromium con identidad real, H4+H6, recogida y SSE. No se activó el bootstrap productivo.

### Robustez HTTP y regresión de persistencia (28-10-2026)

Los endpoints H6 de recogida incluyen `Cache-Control: no-store` y `X-Content-Type-Options: nosniff` tanto en respuestas exitosas como en errores de validación. La prueba PostgreSQL 17 lo exige expresamente. En el E2E Chromium H4 se corrigió una condición de carrera de la propia prueba: tras la transición de cocina, la lectura SQL se realiza mediante espera acotada hasta confirmar el estado durable `ready`, sin aceptar únicamente la representación visual. Commit validado `35899113d587e58236db9d66898d5744cb61cb48`: Sabora CI `40767316203`, Bootstrap `40767316210`, visual smoke `40767316166`, los tres SUCCESS. El primer intento `66910c2` detectó el fallo transitorio y no se considera evidencia de cierre. Sigue pendiente la integración conjunta H4/H6 con SSE y recogida desde Chromium.

### Gate de transporte SSE real H6 (28-10-2026)

El test `scripts/ci/h6-postgres17.test.mjs` abre un listener Fastify efímero exclusivamente en `127.0.0.1` y consulta `/api/v1/operations/events` con `fetch` real. El stream usa el repositorio H6 con principal SQL restringido, capacidad de personal firmada y eventos durables de PostgreSQL 17; verifica respuesta HTTP 200, tipo `text/event-stream`, `Cache-Control: no-store, no-transform`, cursor `id:` y recepción de `sabora.pickup.claimed` y `sabora.pickup.ready_corrected`. El preHandler de identidad es un fixture local del test: **no** certifica JWT ni integración Chromium/H4. El primer intento falló por sintaxis de una expresión regular del test y se corrigió; el commit `120157a94f72a9d67fd298f072eb955912f2aef5` terminó con Sabora CI `40772851788`, Bootstrap `40772851626` y visual smoke `40772851601` todos SUCCESS. Sin listener productivo, merge ni despliegue. Pendiente el E2E único de Chromium con autenticación real H4/H6 y recogida por UI.

### Regresión de cursores SSE inválidos (29-10-2026)

El test de transporte SSE H6 sobre PostgreSQL 17 desechable verifica ahora, además de reanudación monotónica con `Last-Event-ID`, el cierre del stream con evento `stream-error` cuando el cursor es negativo, decimal, no numérico o excede el rango admitido. Se prueba por `fetch` HTTP contra Fastify efímero en loopback, sin identidad JWT real ni navegador integrado H4/H6. Commit `263ff05700b77093e619a81fe018a0c23b95f46c`: Sabora CI `40785033621`, Bootstrap `40785033864` y visual smoke `40785033821`, todos SUCCESS. La integración conjunta Chromium H4/H6 con recogida y SSE autenticados permanece abierta y no se declara completada.
