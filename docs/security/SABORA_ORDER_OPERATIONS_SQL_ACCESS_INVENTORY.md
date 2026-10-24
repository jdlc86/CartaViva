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
