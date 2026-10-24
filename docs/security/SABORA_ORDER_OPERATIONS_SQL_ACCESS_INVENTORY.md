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
