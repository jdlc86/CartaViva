# S48 / S46 — automatización del preflight DBA sin secretos en GitHub Actions

**Estado:** candidato técnico en PR #85; **no integrado ni operativo**. La fuente de verdad sigue siendo [S46](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), el [runbook S38](SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md), [CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md) y el [límite CartaViva](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md). **No desplegar, migrar ni operar Fleetia.**

## Decisión de seguridad que condiciona el diseño

S38 §0.5 prohíbe expresamente enviar secretos operativos por **GitHub Actions**. Por ello se rechazó el diseño inicial de un workflow que contuviera contraseña DBA/CA y realizara SELECT remoto. Los blobs de esa propuesta nunca se referenciaron desde una rama/commit; **no integrados**. La solución mantiene dos ejecutores separados:

1. **GitHub Actions sin secretos: plan automático** `.github/workflows/sabora-s46-dba-readonly.yml`, solo `workflow_dispatch` del propietario contra `main` exacto. Contrasta SHA de checkout/origin main, inventario de migraciones por archivo y **cinco checks exact-main SUCCESS**, sin acceso a base de datos, SSH, Docker, red VPS o Supabase. No tiene jobs con `environment`, no solicita secretos ni ejecuta SQL. El workflow queda disponible **solo después de integrar el PR bajo permiso distinto**.
2. **Operador DBA autorizado fuera de GitHub Actions y VPS:** `node scripts/ci/sabora-s46-dba-readonly.mjs observe` en Linux privado aislado previamente aprobado por el custodio. Ejecuta una **única transacción PostgreSQL 17 `REPEATABLE READ READ ONLY`**, forzando en libpq `PGSSLMODE=verify-full` con CA y hostname exacto del proyecto autorizado; `PGOPTIONS=default_transaction_read_only=on`; catálogo objetivo de solo lectura, SSL de sesión, pgcrypto y `pg_control_system` con pin SHA256 del `system_identifier`. Si algo no coincide, **STOP**. No se usan claves de Fleetia ni cuenta del VPS. No hay migrador, funciones de firma ni escritura SQL.

El operador no necesita un PC doméstico: debe ser un entorno Linux de confianza **fuera del VPS compartido y fuera de GitHub Actions**, con secreto/certificado procedentes de un custodio DBA aprobado. No damos por existente ese ejecutor; sin él la operación real `verify-full` sigue pendiente. Si el endpoint directo sólo es accesible vía IPv6 y el ejecutor no soporta IPv6, STOP (no inventar ni sustituir automáticamente por host de pooler).

## Entrada cerrada del comando del custodio

El operador verifica `main` exacto, hace checkout de ese SHA, ejecuta previamente el `plan` de Actions y almacena **fuera del checkout** estos elementos, con permisos de lectura exclusivos:

| Variable del proceso local, nunca GitHub Actions | Valor/obligación |
|---|---|
| `SABORA_S46_OPERATOR_APPROVAL` | `explicit-one-time-readonly`, solo tras autorización de la observación DBA |
| `SABORA_S46_RELEASE_SHA` | SHA completo exacto de `main` revisado y con CI completa |
| `SABORA_S46_DB_HOST` | `db.byhvmumqivmunkmomhup.supabase.co`, confirmado en Supabase RESTAURANTE |
| `SABORA_S46_DB_USER` / `SABORA_S46_DB_PORT` | `postgres` / `5432`; identidad DBA, nunca identidad de runtime |
| `SABORA_S46_EXPECTED_SYSTEM_ID_SHA256` | SHA256 de identidad de clúster observado/contrastado y aprobado **por el custodio**, distinto del SHA de código |
| `SABORA_S46_DB_PASSWORD_FILE` | ruta absoluta de fichero de contraseña del custodio: fichero regular, UID exacto, **0600**, jamás en argv/GitHub/chat |
| `SABORA_S46_DB_CA_FILE` | ruta absoluta de certificado CA aprobado del panel Database de Supabase, no tomado de `ssh-keyscan` o una conexión sin verificar |
| `SABORA_S46_OUTPUT_DIR` | directorio absoluto privado del operador, dueño exacto, **0700**, fuera del checkout y VPS |

`observe` rechaza expresamente `GITHUB_ACTIONS=true`. El comando crea un directorio temporal `0700` para la CA, ejecuta `psql -X -w -q -t -A -v ON_ERROR_STOP=1` con ambiente **mínimo** de variables libpq y contraseña solamente dentro del proceso local, sin imprimir stdout/stderr arbitrarios de la base, y purga ese directorio. Escribe una sola vez con `O_EXCL` un resumen `0600` en el directorio del custodio. Un segundo intento contra la misma salida falla, sin sobrescribir evidencia.

Referencias oficiales: [PostgreSQL 17: SSL libpq](https://www.postgresql.org/docs/17/libpq-ssl.html), [Supabase: psql y certificado CA](https://supabase.com/docs/guides/database/psql), [Supabase: conexiones](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Inventario automático, exactitud y límites

`scripts/ci/sabora-s46-dba-readonly.sql` observa esquemas, roles, membresías, relaciones, funciones, tipos, triggers, políticas, event triggers y default ACL con nombres que contienen `sabora` o `cartaviva`; verifica ausencia de `sabora_migration_meta.applied_migrations` y `sabora.restaurant_settings`, versión mayor 17, `pgcrypto` en `extensions`, TLS activo y versión, identidad del sistema del clúster. Incluye solo `BEGIN ... READ ONLY`, `SELECT`, `ROLLBACK`; no `CREATE`, `GRANT`, `UPDATE`, `INSERT`, `DROP` ni `pg_dump`. Comparar varias categorías en **la misma instantánea MVCC** evita una lectura inconsistente de catálogos en esa sesión; **no impide DDL concurrente en otras sesiones**.

El resultado `sabora-s46-readonly-observation/v1` está expresamente marcado: `dbaSigned=false`, `originalCatalogCustodied=false`, `ddlConcurrencyExcluded=false`, `migrationExecutionAuthorized=false`, `operationalGo=false`. No publica el catálogo completo ni el identificador bruto del sistema en Git. El resumen no es el wrapper normativo firmado `sabora-initial-empty-preflight/v1`; falta custodia del original, decisión propietaria, firma Ed25519 genuina del DBA, TTL ≤24 h y control de concurrencia/identidad TLS de extremo a extremo. El inicio limpio es una observación temporal, no bloqueo del proveedor.

**Pruebas:** `node --test tests/sabora-s46-dba-readonly.test.mjs` en local Node22: **6/6 PASS** para ausencia, identidades incorrectas, roles previos, ledger, TLS, aislamiento y rechazo explícito de ejecución DBA en Actions. CI completa del commit aún pendiente. No hay ejecución real del nuevo CLI `verify-full`; las consultas de Supabase MCP del 22-nov solo demostraron TLS 1.3, no validación de CA/hostname.

## Integración y operación segura

El primer commit/PR no habilita migraciones. Tras CI verde y revisión técnica, solicitar al propietario por separado autorización para **fusionar PR #85**. Tras merge, ejecutar plan automático con SHA exacto y verificar resultado. Para una observación remota real: custodio DBA entrega su certificado y credencial directamente **al ejecutor privado aprobado**, no a ChatGPT ni GitHub. Acreditada la observación, se firma el wrapper real mediante custodio; solo entonces puede plantearse autorización SQL separada para el árbol exacto y aplicar las **103 migraciones** conforme S46/CV-005 con ledger append-only y parada segura. Ningún permiso se hereda de esta preparación.

Este candidato evita incrementar el número de PR y conserva el historial S48-14..18 en la misma rama documental. No cambia normativa ni recursos de infraestructura.

## S48-20 — alternativa propuesta (no activa): Environment GitHub protegido

El propietario permitió redactar una **propuesta de excepción**, NO autorizarla: [texto completo S48-20](../architecture/SABORA_S46_GITHUB_ACTIONS_READONLY_EXCEPTION_PROPOSAL_V1.md). El flujo actual (**`plan` sin secretos en Actions y `observe` off-host**) sigue siendo el único candidato compatible con S38/S46. La alternativa futura propone una identidad de catálogo verdaderamente sin derechos de mutación, jamás `postgres`, con password temporal exclusivamente en GitHub Environment protegido para un job manual owner+main exacto. Requiere antes autorización DDL separada de creación del rol, inspección de privilegios efectivos/roles y de los revisores del Environment, y nueva variante normativa firmada para registrar expresamente la cuenta técnica porque `v1` exige cero roles Sabora. **Ninguna implementación, contraseña, rama main, Supabase, VPS o recurso Fleetia se ha alterado con este permiso de preparación.** No convertir esta propuesta en GO por estar documentada en el PR #85.

## S48-21 — ratificación del diseño condicionado, sin activar credenciales

El propietario **aprobó el diseño S48-20 con las condiciones documentadas**, en fecha 22-11-2026. Ver [propuesta ratificada](../architecture/SABORA_S46_GITHUB_ACTIONS_READONLY_EXCEPTION_PROPOSAL_V1.md), todavía no integrada en `main`. **La implementación actual de este runbook no cambia:** `plan` en Actions sin secretos; `observe` únicamente en custodia DBA privada. El diseño alternativo requiere v2 firmada con inventario explícito del observador, código verificador de producción, CI exact-main, autorización distinta para crear rol y configurar Environment, auditoría de privilegios efectivos, CA y TLS `verify-full`. Confirmación material reciente: `PUBLIC` posee `TEMPORARY` y `CONNECT` en la base Supabase RESTAURANTE; no afirmar que el observador sería estrictamente read-only ni cambiar permisos globales. **NO-GO de activación de secrets y SQL** hasta decisión expresa sobre ese riesgo. El permiso de diseño no alcanza a instalación ni despliegue.
