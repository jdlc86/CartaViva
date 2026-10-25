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
