# Sabora / CartaViva — CV-005: ensayo integral de migraciones con administrador sin superusuario (12-11-2026)

**Tipo:** informe técnico de un ensayo nuevo; no es normativa, aprobación de migración, ni validación del proveedor. Se conserva la [metodología permanente](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md): el laboratorio PostgreSQL 17/CI no desaparece tras desplegar, y el entorno real solo se toca con autorización específica. [Autorización](../SABORA_AUTHORIZATION_GATE.md), [aislamiento de proyectos](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [runbook P2](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md) y [continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) prevalecen cuando corresponda.

## Motivo y evidencia comprobada

El [PR #56](https://github.com/jdlc86/CartaViva/pull/56) se fusionó en `main` (SHA `7dcf90df`) y [CI post-merge #43177964808](https://github.com/jdlc86/CartaViva/actions/runs/43177964808) terminó `completed/success`. La cadena versionada `supabase/migrations` consta de **99 migraciones** auditadas, y el laboratorio existente prueba aplicación/reanudación y 69 tablas con FORCE RLS. **Limitación:** hasta ahora las aplica el usuario `postgres` **superusuario** de un contenedor PostgreSQL 17 estándar.

En el Supabase real **exclusivo de Sabora** `byhvmumqivmunkmomhup`, las consultas read-only anteriores observaron PostgreSQL **17.11** y `current_user=postgres` con `rolcreaterole=true`, `rolsuper=false`. El contraste no es cosmético: `CREATE ROLE`, `ALTER OWNER TO`, `SET ROLE`, ownership/CREATE del schema y funciones `SECURITY DEFINER` pueden comportarse de otro modo. [Roles superusuario en Supabase](https://supabase.com/docs/guides/database/postgres/roles-superuser) y [requisitos CREATE bajo SET ROLE](https://supabase.com/kb/troubleshooting/resolving-permission-denied-for-database-postgres-during-migrations-78f33a) describen diferencias reales. **No suponer que un PG17 con superusuario representa a Supabase PG17.11.**

## Implementación candidata sin tocar Supabase

Se añade en la rama de desarrollo CV-005:

- `scripts/ci/supabase-nonsuperuser-migration-smoke.sh`: crea **un contenedor Docker efímero `postgres:17-alpine` con `--network none`**, restringido por entorno de GitHub Actions. No abre puertos, no acepta DATABASE_URL, no accede a Supabase ni a VPS, y elimina exclusivamente su contenedor de nombre generado bajo su propio `trap`.
- El **fixture** crea por superusuario local únicamente `anon`, `authenticated` y un LOGIN desechable **CREATEROLE, INHERIT, NOSUPERUSER, NOBYPASSRLS, NOREPLICATION**. Su base aparte pertenece al operador de CI; `pgcrypto` 1.3 se instala en esquema `extensions` para simular la extensión previamente instalada en Supabase.
- **Las 99 migraciones, en orden del repositorio y sin omisiones manuales, se ejecutan como ese LOGIN no superusuario, nunca como el superusuario del contenedor.** Si hay un bloqueo, se informa del archivo exacto y del mensaje PostgreSQL; el job falla. Si pasa toda la cadena, se comprueban las **69 tablas FORCE RLS**, la ausencia de USAGE público de Sabora y la ausencia de elevación del operador.
- `.github/workflows/supabase-nonsuperuser-compatibility.yml`: nuevo **job específico complementario**; no vuelve a ejecutar H6, Chromium, dos PWA ni las largas baterías de negocio existentes. Se activa ante cambios SQL/contrato de ensayo y puede relanzarse manualmente.
- `scripts/ci/postgres-migration-harness-contract.test.mjs`: añade el control negativo de aislamiento del nuevo script/CI; no permite destinos externos, puertos publicados, secretos o podas globales.

## Qué acredita y qué no

| Resultado | Interpretación |
| --- | --- |
| **PASS del job nuevo** | La cadena de 99 archivos funciona **en un PostgreSQL 17 desechable** bajo una cuenta CREATEROLE que no es superusuario; guardas RLS básicas intactas |
| **FAIL** | Brecha real de portabilidad/permiso (o problema de fixture) que debe diagnosticarse en el mismo hito; **NO-GO** de migración hasta resolver |
| **PASS de todos los CI** | No sustituye la compatibilidad exacta del proveedor con `supautils`, pgcrypto/ownership específicos, conexiones TLS, roles preexistentes ni comprobación tras instalación |
| **Instalación operativa autorizada** | Exige backup lógico verificable + restauración, SHA/checksums y ledger completos, credenciales y secrets aprobados, permisos SQL exactos, impacto/aislamiento y autorización del propietario |

**Estado en el momento de crear este informe:** código del ensayo propuesto, aún **sin resultado verificado**. Actualizar el apartado de seguimiento únicamente con el estado real del SHA y workflow. Si falla, no darlo como éxito ni rebajar requisitos de seguridad para mantener una CI verde.

## Puertas de primera activación todavía abiertas

- En Supabase Free no se presuponen PITR ni backup automático. Necesita dump lógico Sabora-only cifrado **realmente restaurado y ensayado**, más recuperación de roles/secretos conforme a P2/P3, antes de tocar las 99 migraciones.
- 15/17/22 capacidades SQL + conexiones de notificación: no confundir slots lógicos con LOGIN instalados ni sustituirlos por la conexión `postgres`. Tres contraseñas del propietario siguen bajo su custodia.
- El proceso desplegable `server.mjs` sigue `health-only`, con `/ready=503`; falta la composición operativa CV-005 con autenticación, dependencias, redes TLS, eventos/observabilidad y alertas externas, sin introducir contratos de secretos no aprobados.
- Antes de operar el VPS compartido se exige autorización **independiente**, recursos exclusivos Sabora y ausencia de interferencias con Fleetia; no existe GO de despliegue por fusionar código.

**No realizado:** migración Supabase, DDL/roles/contraseñas reales, backup/restore operativo, merge de este nuevo trabajo, despliegue ni operación del VPS.

## Diagnóstico reproducido en CI (12-11-2026)

En [workflow #43184585309](https://github.com/jdlc86/CartaViva/actions/runs/43184585309), el LOGIN descartable superó el preflight con `NOSUPERUSER` y `NOBYPASSRLS`, pero la ejecución se detuvo en `20261021030000_sabora_customer_session_restricted_rpcs.sql`: `must be able to SET ROLE "sabora_customer_session_fn_owner"`. Es una incompatibilidad **concreta** entre la cadena sin opciones de sesión y la semántica PostgreSQL 17, no una falla de credenciales reales. La [documentación de PostgreSQL 17](https://www.postgresql.org/docs/17/role-attributes.html) establece que un CREATEROLE no superusuario obtiene automáticamente `ADMIN TRUE`, `SET FALSE` e `INHERIT FALSE` sobre los roles que crea.

**Corrección candidata en el mismo PR:** utilizar exclusivamente para cada **sesión de migración** `PGOPTIONS=-c createrole_self_grant=set`, verificando su disponibilidad antes de ejecutarla; este valor hace explícita la capacidad de cambio de propietario necesaria. **No se altera el SQL de las 99 migraciones históricas, no se concede SUPERUSER, no se modifica ningún rol operativo y no se activa ese ajuste en la API.** El ensayo sigue siendo un fixture PostgreSQL 17 desechable, no Supabase. Se añaden comprobaciones de que **todas** las tablas Sabora están en FORCE RLS y los roles de capacidad carecen de LOGIN/superpoderes. Las pruebas de la siguiente ejecución determinarán si quedan nuevos bloqueos; **no declarar PASS antes de observarla**.

**Puerta específica del proveedor aún abierta:** antes de migrar Supabase con `postgres` no superusuario, acreditar que `createrole_self_grant` está permitido y funciona con su configuración y roles existentes, con evidencia read-only y un plan de migración/rollback autorizado. No aplicar este modo a conexiones runtime ni interpretar un PASS en Docker como permiso de migración real.

## Corrección del segundo bloqueo: CREATE de esquema para destino OWNER (12-11-2026)

El [workflow PG17 #43185379839](https://github.com/jdlc86/CartaViva/actions/runs/43185379839) probó que el modo de sesión `createrole_self_grant=set` supera la restricción de `SET ROLE`, pero PostgreSQL rechazó `ALTER FUNCTION OWNER TO sabora_customer_session_fn_owner` con `permission denied for schema sabora`. El propietario futuro de una función debe disponer de `CREATE` sobre su esquema para el cambio de titularidad. **No se puede dar por compatible la cadena sin atender ambas comprobaciones.**

Se reparan **14 migraciones existentes** que efectúan `ALTER FUNCTION ... OWNER TO`, exclusivamente para la primera instalación todavía no aplicada: cada archivo posee `BEGIN/COMMIT`, habilita `CREATE` sobre `sabora` al/los rol(es) `fn_owner` implicados **solo durante la transacción**, y lo revoca antes del `COMMIT`. Ningún LOGIN, SUPERUSER, BYPASSRLS, concesión permanente de esquema, ruta API o secreto adicional. Este cambio **modifica los checksums de esos archivos**; no sería apropiado aplicarlo retroactivamente a instalaciones que ya los hubiesen registrado. En el Supabase Sabora observado no existe aún ledger/esquema; antes de una intervención real volver a contrastar ese dato, las 99 huellas del SHA aprobado y el plan de restauración.

Además del ensayo PG17 real desechable, una prueba contractual recorre los 14 archivos y exige coincidencia exacta de GRANT/REVOKE dentro del mismo BEGIN/COMMIT. Se debe comprobar la CI de un mismo HEAD después de este cambio, no los PASS históricos de otros SHA.

### Necesidad adicional de INHERIT para ACL de funciones

La [CI #43185863218](https://github.com/jdlc86/CartaViva/actions/runs/43185863218), después de las concesiones transitorias de `CREATE`, avanzó hasta `REVOKE ALL ON FUNCTION` y obtuvo `permission denied for function verify_customer_session_hash`. El administrador de migración ya había cedido la titularidad al rol limitado; PostgreSQL exige que pueda ejercer sus privilegios de propietario para cerrar la ACL. El ensayo ahora requiere explícitamente `createrole_self_grant=set,inherit` **solo en las sesiones de migración**. Este ajuste confiere al administrador temporal acceso heredado a los roles creados, de modo que **no es inocuo para un operador que se reutilice como runtime**: está prohibido utilizar el LOGIN de migración en la API y será necesario inventariar/revisar la pertenencia de roles tras la instalación del proveedor. Se conserva `NOSUPERUSER` y `NOBYPASSRLS`, y el ensayo final seguirá comprobando que los roles de aplicación no adquirieron privilegios elevados. La aceptación depende de nueva CI y del preflight específico de Supabase real, sin DDL operativo.
