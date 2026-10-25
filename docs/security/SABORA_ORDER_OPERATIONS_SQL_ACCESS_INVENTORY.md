# Inventario de acceso SQL para cocina y sala — revisión sin GRANT

Estado: **candidato para revisión, NO autorizado para ejecución en Supabase ni despliegue**.
Fecha: 2026-10-24. Un solo restaurante Sabora.

Este inventario se deriva exclusivamente de las consultas de
`apps/api/src/order-operations-repository.mjs`, la función
`transition_order_line_idempotent_candidate` en
`supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql`
y la puerta `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`.
No crea roles, políticas ni permisos.

## Identidades y operaciones

- **Lector de personal**: autenticación/verificación de membresía. Identidad
  distinta de la identidad SQL operativa, con preflight `current_user` y
  `session_user`.
- **Operador cocina/sala**: consultas y transiciones en transacción con
  membresía activa revalidada. Su rol SQL no representa por sí solo el rol
  funcional cocina/camarero; ese dato proviene de identidad verificada y se
  comprueba nuevamente bajo bloqueo en la base de datos.
- **Cliente web, anon, authenticated, PUBLIC**: sin acceso directo a los
  recursos operativos privados ni a la función candidata.

## Recursos exactos observados

| Recurso | Uso en código | Riesgo/condición previa a cualquier GRANT |
| --- | --- | --- |
| `sabora.staff_members` | SELECT `user_id,role,state` con `FOR SHARE`; JOIN para rol del autor de eventos | El SELECT debe poder bloquear filas sin conceder modificación de membresía; revisar RLS y rol lector separado |
| `sabora.order_lines` | SELECT tablero e historial; función invoker: SELECT FOR UPDATE y UPDATE `status` | Aislar actualización de estado de otras columnas; política RLS y transición autorizada en misma transacción |
| `sabora.orders` | JOIN para id, mesa, etiqueta y fecha de confirmación | Proyección mínima; prohibir acceso a datos privados no usados |
| `sabora.dining_tables` | JOIN para número de mesa | No autorizar mutaciones de QR/mesas por este flujo |
| `sabora.pickup_notifications` | LEFT JOIN de aviso; función invoker INSERT al quedar listo y UPDATE de acuse al recoger | Vincular la mutación a transición y actor autorizados; sin escritura general |
| `sabora.order_line_events` | SELECT historial; función invoker INSERT append-only | Triggers existentes impiden UPDATE/DELETE/TRUNCATE; revisar RLS de lectura/escritura |
| `sabora.order_line_transition_requests` | Función invoker SELECT FOR UPDATE e INSERT de correlación durable | FORCE RLS, clave por actor; nunca conceder UPDATE/DELETE/TRUNCATE |
| `sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)` | EXECUTE invoker para transición | El EXECUTE por sí solo no sustituye los permisos sobre tablas ni la revalidación del actor |

## Puerta de aceptación pendiente

1. Diseñar las políticas RLS de cada tabla y permisos por columna, comprobando
   también secuencias, dependencias y funciones invocadas por triggers.
2. Ensayar en PostgreSQL 17 **desechable** las operaciones positivas de cocina
   y camarero con el LOGIN técnico no propietario, NOINHERIT, sin membresías,
   NOSUPERUSER y NOBYPASSRLS.
3. Ensayar negativos: rol revocado, transición no permitida, lectura de datos
   fuera del tablero, UPDATE de columnas ajenas, DELETE/TRUNCATE, EXECUTE por
   anon/authenticated/PUBLIC, replay con fingerprint distinto y revocación
   concurrente.
4. Comprobar con `current_user` y `session_user` la identidad real de cada
   conexión antes de activar el bootstrap HTTP. No confundir la prueba
   temporal de identidades sin GRANT con autorización de acceso.
5. Documentar aprobación explícita del contrato SQL y del montaje. Mantener
   `server.mjs` sin registrar operaciones hasta completar esa puerta.

Ninguna concesión se considera aprobada por este documento. No se modifica
Fleetia, el VPS ni la base de datos operativa.

## Prueba automatizada de matriz negativa

`order-operations-identity-postgres17.test.mjs` inspecciona mediante
`has_table_privilege` las siete operaciones `SELECT`, `INSERT`, `UPDATE`,
`DELETE`, `TRUNCATE`, `REFERENCES` y `TRIGGER` de **las siete tablas anteriores** para los dos logins técnicos
creados exclusivamente en el contenedor CI. También comprueba que ninguno
puede ejecutar la RPC invoker. Esto detecta concesiones accidentales mientras
no exista el diseño de acceso positivo; no demuestra todavía que el runtime
pueda operar con una identidad de mínimos privilegios.

## Prueba adicional de FORCE RLS en PG17

El test de identidad crea temporalmente un permiso SELECT para el login de
operaciones **solo en el contenedor desechable**, verifica que la tabla de
reintentos mantiene `relrowsecurity` y `relforcerowsecurity` activos y que una
lectura bajo esa identidad no devuelve filas sin política permisiva. Revoca
el permiso en un bloque `finally` antes de destruir el entorno. Esta prueba
no constituye un GRANT operativo ni valida todavía el flujo positivo.

## Alcance negativo del GRANT temporal

La prueba de PostgreSQL 17 comprueba adicionalmente que el `GRANT SELECT`
temporal de la tabla de reintentos no amplía permisos de `INSERT`, `UPDATE`,
`DELETE`, `TRUNCATE` ni `EXECUTE` sobre la RPC de transición. La prueba
sigue siendo una verificación negativa de seguridad: **no constituye la
implementación de la política positiva para cocina/sala**.

## Ampliación de matriz negativa (7 × 7 × 2)

El harness desechable de PostgreSQL 17 comprueba siete tipos de privilegio
para cada una de las siete tablas operativas, bajo las dos identidades SQL
independientes: **98 comprobaciones de privilegio**, además de la comprobación
EXECUTE de la RPC para cada identidad. Los permisos de definición de claves
foráneas (`REFERENCES`) y triggers (`TRIGGER`) quedan explícitamente cubiertos;
ninguna de estas pruebas concede permisos operativos.

## Puerta de esquema y smoke SQL

La matriz de identidades comprueba también `USAGE` en el esquema `sabora`
y ausencia de `CREATE` para ambos logins técnicos. El smoke SQL del candidato
incluye `TRUNCATE`, `REFERENCES` y `TRIGGER` en la denegación a `PUBLIC`,
`anon` y `authenticated` sobre la tabla de correlaciones. Estas comprobaciones
se ejecutan únicamente en PostgreSQL 17 desechable de CI.

## Barrido de tablas fuera del inventario

Además de las 98 comprobaciones de los siete recursos conocidos, el harness
PostgreSQL 17 recorre `pg_class` y `pg_namespace` para detectar concesiones
accidentales a cualquiera de los dos logins técnicos sobre **cualquier tabla,
vista, vista materializada, tabla particionada o tabla externa** del esquema
`sabora`. Se comprueban los siete privilegios de tabla. El barrido se ejecuta
antes del GRANT temporal de prueba; cualquier resultado no vacío bloquea CI.
No es una concesión de acceso positivo.

## Barrido de secuencias privadas

El test de identidades también recorre las secuencias (`relkind = 'S'`) del
esquema `sabora` y falla si alguno de los dos logins dispone de `USAGE`,
`SELECT` o `UPDATE` sobre cualquiera de ellas. El inventario no presupone
que las tablas sean el único recurso SQL capaz de alterar datos o exponer
identificadores. No se conceden privilegios de secuencia en esta fase.

## Comprobación explícita de la función candidata

La prueba de PostgreSQL 17 vuelve a verificar, mediante la firma exacta
`regprocedure`, que ninguno de los dos logins técnicos puede ejecutar
`transition_order_line_idempotent_candidate(uuid,uuid,text,text)`.
La revisión de otras funciones heredadas del esquema queda separada: no se
asume que sus contratos o permisos puedan modificarse sin inventario previo.

## Inspección de rutinas con privilegios elevados

El harness consulta `pg_proc` y rechaza cualquier rutina `SECURITY DEFINER`
del esquema `sabora` que resulte ejecutable por los dos logins técnicos.
La inspección utiliza `has_function_privilege` y no presupone que revocar la
RPC candidata bloquee otras vías de ejecución. La definición de permisos
positivos sigue pendiente de aprobación y pruebas específicas.

## Denegaciones ejercidas con los logins reales

Además de consultar `has_schema_privilege` y `has_table_privilege`, el harness
PG17 intenta bajo **cada login técnico** ejecutar `CREATE TABLE` en `sabora`
y leer directamente `sabora.staff_members` antes de cualquier GRANT temporal.
Ambas operaciones deben fallar por permisos. Esto prueba la frontera negativa
a nivel de sesión SQL, pero no demuestra todavía la operación positiva de
cocina y sala, que permanece bloqueada hasta diseñar y validar RLS y grants.

## Hallazgo de diseño: identidad de actor en RPC invoker

La función candidata recibe `p_actor_user_id` como argumento y consulta
`staff_members` para comprobar rol y estado. Esta comprobación **no demuestra
por sí sola que el UUID corresponda al usuario autenticado de la petición**:
el login SQL operativo es una identidad técnica compartida. La ruta HTTP
debe obtener el actor exclusivamente del token verificado y nunca del cuerpo
del cliente; además, antes de conceder `EXECUTE`, se debe demostrar con
pruebas que el contexto de identidad no puede falsificarse por una conexión
SQL con el mismo login técnico.

La validación positiva debe distinguir al menos estas dos amenazas:
1. Un usuario HTTP no puede elegir el UUID de otro miembro activo.
2. Un cliente SQL con el login operativo no puede invocar directamente la
   función con un UUID de un actor más privilegiado para eludir la
   autorización de negocio.

Por tanto, **un GRANT EXECUTE a la función candidata sin vinculación
criptográfica o verificable del actor es insuficiente**. Mantener denegado
`EXECUTE` y no montar la ruta hasta resolver la vinculación del actor
en el contrato y en pruebas reales. No se introduce una solución ad hoc
basada únicamente en una variable de sesión controlable por el login.

## Defensa de transición previa al SQL

El repositorio de operaciones ahora rechaza de forma anticipada los pares
rol/destino incompatibles: cocina no puede solicitar `picked_up` y sala solo
puede solicitar `picked_up`; el rol administrativo conserva los tres destinos
candidatos. Una prueba comprueba que estos rechazos no ejecutan SQL. Esta
comprobación complementa, pero **no sustituye**, la revalidación transaccional
de membresía en PostgreSQL ni resuelve la suplantación directa del actor en la
RPC invoker. El acceso positivo permanece sin autorización.

## Puerta de arranque frente a concesión accidental de RPC

El preflight de ambas identidades SQL ahora comprueba en la propia sesión
`USAGE` sobre el esquema privado, ausencia de `CREATE` y ausencia de
`EXECUTE` sobre la firma exacta de la RPC candidata. Si alguien concede
acceso a la función cuyo parámetro `p_actor_user_id` todavía no está ligado
criptográficamente a la identidad HTTP, el arranque opt-in **se rechaza**
antes de registrar rutas. El harness PostgreSQL 17 concede únicamente
`USAGE` de esquema a los logins efímeros antes de comprobar el preflight;
no concede `EXECUTE` ni permisos de escritura. Se trata de una puerta
negativa deliberada, no de habilitación positiva del servicio.

## Preflight en tiempo de arranque: cero tablas privadas

El gate de identidades inspecciona ahora el catálogo completo de tablas,
vistas y tablas externas de `sabora`, para los siete privilegios de tabla.
Rechaza el arranque si cualquiera de los dos logins técnicos puede ejercer
alguno de ellos, incluso en una tabla no incluida en el inventario de siete
recursos. Esta política de **cero concesiones** es temporal y deliberada:
se mantendrá hasta contar con autorización verificable de actor, políticas
RLS positivas y contrato SQL revisado. El harness PostgreSQL 17 efímero
prueba que un `GRANT SELECT` accidental hace fallar el preflight y que
revocarlo restaura el resultado esperado. No se conceden permisos operativos
ni se modifica Supabase real.

## Pruebas de concesiones accidentales en PostgreSQL 17 efímero

El harness de identidades comprueba de forma independiente tres escaladas
transitorias del login operativo: `CREATE` sobre el esquema `sabora`,
`EXECUTE` sobre la función candidata de transición con actor parametrizado,
y `SELECT` sobre `staff_members`. Cada concesión debe impedir el preflight;
tras la revocación, el mismo par de identidades debe volver a superar la
comprobación. Los permisos se conceden y revocan exclusivamente dentro del
contenedor desechable de CI. Esta batería valida el rechazo de grants
peligrosos, **no** una política positiva de acceso de producción.

## Puerta ampliada a secuencias y rutinas privilegiadas

El preflight en tiempo de arranque ahora exige cero permisos efectivos
`USAGE`, `SELECT` o `UPDATE` sobre cualquier secuencia del esquema `sabora`,
y cero permisos `EXECUTE` sobre funciones `SECURITY DEFINER` del mismo
esquema, para ambos logins técnicos. Esta inspección complementa la
prohibición de permisos sobre tablas y sobre la RPC candidata exacta.
Los tests unitarios simulan concesiones indebidas y PostgreSQL 17 desechable
prueba el rechazo tras conceder temporalmente `USAGE` sobre una secuencia
creada para CI, así como la recuperación después de revocarla. No se
habilitan grants positivos ni se activa el servicio. Este gate negativo
requiere rediseño explícito antes de habilitar cualquier capacidad SQL
legítima de lectura o escritura.

## Ensayo positivo de detección de SECURITY DEFINER indebido

El harness PostgreSQL 17 crea temporalmente una función inocua `SECURITY DEFINER`
en el esquema privado, revoca su permiso público por defecto y concede
`EXECUTE` únicamente al login operativo efímero. El preflight debe fallar;
tras revocar `EXECUTE` debe volver a aceptar ambos logins. La función se
elimina en `finally` dentro del contenedor desechable. Esta prueba cubre
la detección real de concesiones peligrosas a rutinas privilegiadas, sin
habilitar el acceso positivo ni ejecutar DDL en Supabase operativo.

## Ensayo de regresión: concesión directa de RPC

En PostgreSQL 17 desechable, la suite concede temporalmente `EXECUTE` a
la identidad de operaciones sobre la firma exacta de la función candidata,
comprueba que el preflight rechaza el arranque, revoca el permiso y verifica
que la comprobación vuelve a aceptar las identidades de cero concesiones.
Esto prueba el bloqueo frente a una configuración peligrosa, **no** prueba
una vinculación positiva del actor ni autoriza a ejecutar la RPC desde el
login compartido. El entorno operativo permanece sin grants.

## Hito de seguridad cerrado: aislamiento SQL negativo verificado

**Evidencia CI del commit `978ad603828d2277d1ccce14db86861b4c5138d2`**:
Sabora CI, ejecución `40103973848`, SUCCESS; Bootstrap Sabora
lockfile, ejecución `40103973858`, SUCCESS.

El alcance comprobado incluye inspección de identidades reales en PostgreSQL
17 efímero, cero privilegios sobre tablas, secuencias y rutinas privilegiadas
del esquema privado, denegación de ejecución de la RPC candidata y rechazo
del preflight ante concesiones accidentales. Los ensayos revocan sus grants
temporales dentro del contenedor desechable. Este hito cierra la **puerta
negativa de seguridad**, no la habilitación del flujo operativo.

**Criterio que sigue abierto:** ningún login técnico compartido puede recibir
permisos para mutar comandas hasta que el actor de cada solicitud quede
vinculado de forma verificable y no falsificable ante PostgreSQL, con
autorización transaccional, RLS y pruebas de suplantación directa por SQL.
Las rutas continúan sin montarse; tampoco se autoriza un despliegue ni
modificaciones de Supabase operativo.

## Verificación del contrato estructural en preflight

La puerta de arranque comprueba también que la RPC candidata conserve
`SECURITY INVOKER` y que la tabla de correlaciones
`order_line_transition_requests` mantenga `ENABLE ROW LEVEL SECURITY`
y `FORCE ROW LEVEL SECURITY`, tal como exige la migración existente.
Cualquier desviación rechaza el arranque; no se asume que
`order_line_events` tenga FORCE RLS porque su migración no lo declara.
Esta verificación es negativa y no autoriza GRANTs ni el montaje de rutas.

## Ensayo directo de concesión peligrosa de EXECUTE

El harness PostgreSQL 17 desechable concede temporalmente `EXECUTE` sobre
la firma exacta `transition_order_line_idempotent_candidate(uuid,uuid,text,text)`
al login operativo, comprueba que PostgreSQL reconoce el permiso y exige
que el preflight rechace el arranque. En `finally` revoca la concesión y
comprueba que el preflight vuelve a aceptar las identidades sin permisos.
La prueba no llama a la función para mutar datos y no se ejecuta sobre
Supabase operativo. **No resuelve** la suplantación potencial del parámetro
`p_actor_user_id`; conserva el bloqueo hasta disponer de vinculación de
actor no falsificable y un contrato de privilegios positivo aprobado.

## Ensayos de deriva de permisos en PostgreSQL 17

El harness desechable concede y revoca temporalmente tres privilegios de riesgo para demostrar el comportamiento **fail-closed** del preflight real: `SELECT` sobre `sabora.staff_members`, `EXECUTE` sobre la RPC candidata de transición y `CREATE` sobre el esquema `sabora`. Cada concesión debe provocar el rechazo de las identidades técnicas; tras la revocación se exige de nuevo el resultado válido. Son pruebas exclusivas de GitHub Actions contra PostgreSQL 17 efímero. No son instrucciones de aprovisionamiento ni autorización para conceder permisos en Supabase operativo. La ausencia de permisos sigue siendo la condición deliberada de este gate; la vinculación no falsificable del actor continúa siendo un bloqueo de activación.

## Cierre del bypass por permisos de columna

El inventario de permisos de tabla no basta para acreditar denegación total:
PostgreSQL permite `GRANT SELECT (columna)` sin conceder `SELECT` a toda la
tabla. El preflight de arranque incorpora `has_any_column_privilege` para
`SELECT`, `INSERT`, `UPDATE` y `REFERENCES` en todas las relaciones privadas,
además de los siete privilegios de tabla existentes. La prueba PostgreSQL 17
concede temporalmente `SELECT (user_id)` sobre `sabora.staff_members`, verifica
que el privilegio global de tabla sigue siendo falso y exige que el preflight
rechace la identidad; finalmente revoca la concesión y comprueba recuperación.
Esta prueba se ejecuta exclusivamente sobre PostgreSQL desechable de CI.
No constituye autorización para grants positivos ni para montar rutas.

## Inventario positivo candidato del wrapper firmado

La decisión del Hito 1 añade
`transition_order_line_authorized_candidate(...)` y deja la RPC invoker con
actor libre revocada. El principal runtime futuro solo necesitaría `USAGE` del
esquema y `EXECUTE` de ese wrapper; no obtiene tablas, columnas, secuencias,
keyring, DDL, membresías ni otras funciones. Un owner `NOLOGIN` sellado recibe
las columnas exactas y queda sometido a RLS forzada.

`preflightOrderTransitionIdentity` modela esa superficie positiva y rechaza
cualquier permiso extra. El harness PG17 la prueba con login restringido y
ataques de actor, GUC, `SET ROLE`, firma, replay, revocación y concurrencia. La
migración no provisiona login, clave o grant runtime: el inventario sirve para
revisión, no para despliegue. Véase
`SABORA_P0_ACTOR_SQL_BINDING_DECISION.md`.

## Gate de regresión de activación (hito CI)

`tests/order-operations-activation-gate.test.mjs` añade cuatro verificaciones
al `pnpm test` general: el servidor de producción no importa ni registra las
rutas candidatas; la migración conserva la RPC con parámetro de actor y sus
revocaciones, `SECURITY INVOKER` y FORCE RLS; la composición pública ejecuta
el preflight antes de registrar rutas; y el preflight sigue rechazando permisos
sobre RPC, tablas, secuencias y funciones privilegiadas. Son **guardias de
regresión estática**, complementarias a los ensayos reales de PostgreSQL 17,
no pruebas de vinculación criptográfica del actor. Una futura activación
exigirá rediseñar deliberadamente estos controles junto con el contrato SQL,
las pruebas de suplantación y la autorización expresa correspondiente.

## Prueba de deriva de esquema en PostgreSQL 17 (24-10-2026)

El harness de integración, ejecutado **solo en PostgreSQL 17 desechable**, altera temporalmente tres invariantes de la frontera de operaciones: elimina `FORCE ROW LEVEL SECURITY` de `order_line_transition_requests`, deshabilita RLS de esa tabla y cambia la RPC candidata a `SECURITY DEFINER`. Cada alteración debe provocar rechazo del preflight para ambos logins técnicos. Un bloque `finally` restaura el DDL y se exige un nuevo preflight positivo después de cada restauración. Estas pruebas detectan deriva del esquema antes de registrar rutas, pero **no autorizan grants positivos**, ni resuelven la vinculación verificable del actor SQL. No hay cambios en Supabase operativo ni despliegue.

## Denegación de CREATE a nivel de base de datos

El preflight comprueba también `has_database_privilege(current_user,
current_database(), 'CREATE') = false`. Este privilegio es independiente de
`CREATE` sobre el esquema `sabora` y permitiría a un login técnico crear
otros esquemas dentro de la base. El harness PostgreSQL 17 efímero concede
`CREATE` temporalmente al login de operaciones, exige rechazo del preflight,
revoca el permiso y exige recuperación. No modifica ninguna base operativa.


## Reconciliación candidata PR #11: entradas y capacidades (25-10-2026)

En la rama independiente `integration/sabora-pr11-reconciliation` se han integrado las defensas de entrada de la rama base sobre el coordinador que utiliza capacidades de transición firmadas. El contexto `verifiedIdentity`/`verifiedStaff` se lee exclusivamente mediante propiedades propias de datos; se rechazan getters y propiedades heredadas. Los parámetros de tablero, transición e historial se copian antes de la espera asíncrona a un objeto de prototipo nulo, con rechazo de claves `__proto__`, símbolos, accesores y objetos no planos. El actor y rol enviados al repositorio continúan siendo los de la identidad verificada, no los del llamante. La capacidad se emite desde la copia validada.

**Diferencia normativa que NO debe borrarse durante el merge:** la rama base verificaba `verifyMembership` para cada transición, mientras que el candidato actual delega la revocación y membresía de las mutaciones al wrapper SQL que verifica la capacidad firmada y revalida al actor bajo bloqueo. No se ha reintroducido una consulta directa a `staff_members` con el login restringido, porque abriría permisos incompatibles con el preflight. Las lecturas de tablero e historial siguen siendo candidatas sin concesión positiva SQL y no deben activarse.

La incorporación de pruebas de entrada Node no equivale a un merge completo de las ramas, ni acredita autorización SQL de lectura, PG17 conjunto o despliegue. Requiere CI de la rama de reconciliación y revisión posterior de los cambios pendientes de preflight y de los tests de la rama base.


## Reconciliación del preflight de credenciales y cierre de conexiones (25-10-2026)

El gate candidato rechaza `rolconnlimit = 0` y credenciales `rolvaliduntil` caducadas, además de límites negativos inválidos y fechas no válidas. Los errores de inspección SQL tienen precedencia sobre errores secundarios de liberación de conexión; si la inspección fue correcta y falla `release`, el preflight también falla cerrado. Los clientes SQL malformados no ocultan su error original por una excepción de liberación. Se incorporan pruebas Node de estos casos al branch de reconciliación, sin alterar la verificación de firma SQL ni autorizar rutas de lectura.

Esta aceptación depende de los workflows del SHA de reconciliación; no supone habilitar logins, grants, SQL operativo, merge o despliegue.


## Reconciliación de membresía de roles SQL (25-10-2026)

Se añade al preflight de ambos logins técnicos el rechazo de membresías de rol **en las dos direcciones**: cuando el login es miembro de otro rol (`membership.member`) y cuando terceros son miembros del rol de login (`membership.roleid`). Esto evita aceptar un login aparentemente aislado que delega sus privilegios a otro principal. Se mantiene la comprobación separada del propietario sellado de la función autorizada, los grants cero sobre tablas privadas y la única RPC firmada candidata. Pruebas Node comprueban ambos sentidos y ambos logins. No se ha creado ni alterado ningún rol real.


## Reconciliación de comprobación de membresía en lecturas (25-10-2026)

Las rutas candidatas de tablero e historial, todavía **no montadas**, solo continúan si `verifyMembership` devuelve un registro explícito con `actorId` UUID coincidente con la identidad autenticada y `role` coincidente con el rol del personal verificado. Se rechazan respuestas ausentes, contradictorias o malformadas antes de ejecutar la lectura operativa. Se conserva la captura previa e inmutable de parámetros. Esta validación Node no concede privilegios de lectura SQL ni satisface por sí sola el gate de lecturas actor-bound pendiente.

Las transiciones no hacen una segunda lectura directa de membresía desde el login restringido; la función SQL de capacidad autorizada realiza la verificación de firma y revalidación bajo bloqueo. Pruebas específicas distinguen ambas rutas para evitar que la reconciliación reintroduzca permisos de tabla sobre el principal de operaciones.


## Verificación de cierre de conexiones en preflight (25-10-2026)

El gate de identidad SQL cuenta ahora con pruebas de regresión que cubren tres salidas anómalas: fallo de liberación tras inspección exitosa (no se autoriza el inicio), fallo de liberación mientras se propaga un error de inspección (se preserva el error primario) y cliente SQL malformado cuyo método `release` falla (se conserva el rechazo por cliente inválido). Estas pruebas no alteran credenciales ni recursos SQL reales. La validación completa de CI debe consultarse sobre el commit final de la rama, no inferirse de una ejecución anterior.
