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
