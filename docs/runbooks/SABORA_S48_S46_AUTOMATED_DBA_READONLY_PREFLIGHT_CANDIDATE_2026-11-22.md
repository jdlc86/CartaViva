# S48 / S46 — automatización del preflight DBA sin secretos en GitHub Actions

> **S51 (24-11-2026, decisión de diseño aprobada; pendiente de integración del PR #87):** [V2 §8](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md) sustituye la condición de ejecutor externo por un proceso temporal Linux de Sabora dentro del VPS existente, sin root, Docker ni recursos ajenos. Para genesis se admite excepcionalmente la credencial DBA RESTAURANTE en transacción READ ONLY, con custodia efímera, nunca Actions ni runtime. Se conserva verify-full y SHA exacto; no autoriza instalación ni SQL. El candidato `observe` exige ámbito Sabora, `/srv/sabora/` y directorio privado bajo `/var/lib/sabora-release/`, guarda original y resumen 0600. Las secciones off-host y firma de abajo son históricas una vez integrada la decisión. La custodia, exclusión DDL y autorización de migración siguen pendientes.

**Estado:** candidato técnico en PR #85; **no integrado ni operativo**. **Decisión posterior S50:** [metodología V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md) retira la firma externa del acta DBA y los expedientes firmados del despliegue; la lectura real PostgreSQL 17 con TLS `verify-full`, identidad, catálogo Sabora vacío, evidencia técnica y **autorización separada de migración** siguen obligatorias. Las menciones históricas de firma S46-v1 no son nueva tarea del propietario. No pasar credenciales administrativas a Actions por suprimir la firma. La fuente de verdad sigue siendo [S46](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), el [runbook S38](SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md), [CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md) y el [límite CartaViva](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md). **No desplegar, migrar ni operar Fleetia.**

## Decisión de seguridad que condiciona el diseño

S38 §0.5 prohíbe expresamente enviar secretos operativos por **GitHub Actions**. Por ello se rechazó el diseño inicial de un workflow que contuviera contraseña DBA/CA y realizara SELECT remoto. Los blobs de esa propuesta nunca se referenciaron desde una rama/commit; **no integrados**. La solución mantiene dos ejecutores separados:

1. **GitHub Actions sin secretos: plan automático** `.github/workflows/sabora-s46-dba-readonly.yml`, solo `workflow_dispatch` del propietario contra `main` exacto. Contrasta el SHA de checkout y origin main, el inventario de migraciones por archivo y los cuatro checks V2 SUCCESS mediante el mismo verificador del release. El workflow queda disponible después de integrar el PR bajo permiso distinto. El job comprueba el repositorio y GitHub Actions mediante un token de lectura.
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

El resultado `sabora-s46-readonly-observation/v1` registra `dbaSigned=false`, `originalCatalogCustodied=false`, `ddlConcurrencyExcluded=false`, `migrationExecutionAuthorized=false` y `operationalGo=false`. El catálogo completo y el identificador bruto se mantienen fuera de Git. V2 retira la firma externa del wrapper histórico. Aún hay que conservar la evidencia material con custodia privada, acreditar identidad y TLS de extremo a extremo y excluir DDL concurrente antes de solicitar autorización SQL.

**Pruebas:** `node --test tests/sabora-s46-dba-readonly.test.mjs` en local Node22: **6/6 PASS** para ausencia, identidades incorrectas, roles previos, ledger, TLS, aislamiento y rechazo explícito de ejecución DBA en Actions. CI completa del commit aún pendiente. No hay ejecución real del nuevo CLI `verify-full`; las consultas de Supabase MCP del 22-nov solo demostraron TLS 1.3, no validación de CA/hostname.

## Integración y operación segura

Tras una fusión autorizada, el plan automático puede verificar el SHA exacto. La observación requiere un ejecutor aprobado que reciba el certificado y la credencial directamente del DBA. Acreditada la observación material, se requiere autorización SQL separada para aplicar el árbol exacto de **103 migraciones** conforme a S46/CV-005 con ledger append-only y parada segura.

Este candidato evita incrementar el número de PR y conserva el historial S48-14..18 en la misma rama documental. No cambia normativa ni recursos de infraestructura.

## S48-20 — alternativa propuesta (no activa): Environment GitHub protegido

El propietario permitió redactar una **propuesta de excepción**, NO autorizarla: [texto completo S48-20](../architecture/SABORA_S46_GITHUB_ACTIONS_READONLY_EXCEPTION_PROPOSAL_V1.md). El flujo actual (**`plan` sin secretos en Actions y `observe` off-host**) sigue siendo el único candidato compatible con S38/S46. La alternativa futura propone una identidad de catálogo verdaderamente sin derechos de mutación, jamás `postgres`, con password temporal exclusivamente en GitHub Environment protegido para un job manual owner+main exacto. Requiere antes autorización DDL separada de creación del rol, inspección de privilegios efectivos/roles y de los revisores del Environment, y nueva variante normativa firmada para registrar expresamente la cuenta técnica porque `v1` exige cero roles Sabora. **Ninguna implementación, contraseña, rama main, Supabase, VPS o recurso Fleetia se ha alterado con este permiso de preparación.** No convertir esta propuesta en GO por estar documentada en el PR #85.

## S48-21 — ratificación del diseño condicionado, sin activar credenciales

El propietario **aprobó el diseño S48-20 con las condiciones documentadas**, en fecha 22-11-2026. Ver [propuesta ratificada](../architecture/SABORA_S46_GITHUB_ACTIONS_READONLY_EXCEPTION_PROPOSAL_V1.md), todavía no integrada en `main`. **La implementación actual de este runbook no cambia:** `plan` en Actions sin secretos; `observe` únicamente en custodia DBA privada. El diseño alternativo requiere v2 firmada con inventario explícito del observador, código verificador de producción, CI exact-main, autorización distinta para crear rol y configurar Environment, auditoría de privilegios efectivos, CA y TLS `verify-full`. Confirmación material reciente: `PUBLIC` posee `TEMPORARY` y `CONNECT` en la base Supabase RESTAURANTE; no afirmar que el observador sería estrictamente read-only ni cambiar permisos globales. **NO-GO de activación de secrets y SQL** hasta decisión expresa sobre ese riesgo. El permiso de diseño no alcanza a instalación ni despliegue.

## S49 — corrección del procedimiento: el PC del propietario no es ejecutor obligatorio

La [decisión normativa S49](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) **elimina** cualquier solicitud de ordenador del propietario para una ejecución ocasional del preflight; nuestra recomendación conversacional de preparar Docker o una VM en su domicilio **queda retirada**. El cliente `observe` fuera de GitHub sigue siendo **un candidato opcional de custodia DBA**, no un mandato de utilizar un ordenador personal. La vía S46-v1 material continúa requiriendo TLS `verify-full`, firma DBA legítima y catálogo original bajo custodia, que deben obtenerse mediante un operador y canales técnicos aprobados, sin fingir que las consultas MCP anteriores prueban `verify-full`. No introducir como alternativa obligatoria ni otro VPS ni un nuevo host personal. El workflow `plan` existente no ejecuta SQL. S48-20 con rol observador tampoco está operativo ni habilitado por esta decisión. Falta resolver materialmente el canal de verificación/firma para obtener GO; **el requisito técnico permanece, desaparece la carga sobre el dispositivo del propietario**.
