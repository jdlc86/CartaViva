# Sabora — S36 · Preflight de instalación PostgreSQL y preparación de credenciales (11-11-2026)

> **DICTAMEN: PREPARACIÓN DOCUMENTAL COMPLETADA, INSTALACIÓN OPERATIVA NO AUTORIZADA / NO EJECUTADA.** No es una nueva norma, ni aprobación de despliegue, ni prueba de compatibilidad real de migraciones en Supabase. La documentación **normativa** prevalece sobre este informe y sobre la continuidad.

## 1. Fuentes de verdad y límites

- [Contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [límites y aislamiento](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [contrato de escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [política de autorización y despliegue](../SABORA_AUTHORIZATION_GATE.md) y [roadmap de hitos integrales](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md): **normativos**.
- [Matriz candidata de configuración y secretos](../security/SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md), [runbook de activación](../runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md), [auditoría migraciones en código](../../scripts/ci/migration-audit.mjs), [manifest generador](../../scripts/ci/migration-manifest.mjs), [preflight CI](../../scripts/ci/migration-preflight.mjs), [continuidad S36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) y [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
- Único proyecto operativo de este expediente: Supabase `byhvmumqivmunkmomhup` (nombre `restaurante`). Nunca administrar, inspeccionar ni reutilizar recursos de Fleetia u otros proyectos del VPS.
- Este preflight **solo leyó** GitHub y metadatos/consultas `SELECT` de ese proyecto Supabase. No se generaron/recibieron/copiarion secretos, no hubo SQL de escritura ni GitHub Actions nuevas.

## 2. Resultado observado a fecha de corte

| Comprobación real | Evidencia / resultado |
| --- | --- |
| Supabase `restaurante` | Metadatos del proveedor: `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003`, `eu-central-1`. El estado `INACTIVE` histórico ya no es vigente. |
| Conexión SQL | `SELECT` ejecutado como `current_user=postgres` sobre base `postgres`; PostgreSQL `17.11`. **Conectividad confirmada**. |
| Privilegios del usuario de conexión | `rolcreaterole=true`, `rolsuper=false`. Esto **no confirma** que todas las operaciones DDL/propietarios de la cadena vayan a funcionar en Supabase. |
| `pgcrypto` | Extensión `1.3` disponible **e instalada**. Verificar el comportamiento real de funciones HMAC de Sabora antes de usar claves operativas. |
| Esquema operativo | `to_regnamespace('sabora')` = `false`. |
| Ledger SQL candidato | `to_regnamespace('sabora_migration_meta')` = `false`; `to_regclass('supabase_migrations.schema_migrations')` = `false`. No se ha acreditado historial de aplicación Sabora. |
| Tres logins esperados | `to_regrole('sabora_staff_reader_login')`, `to_regrole('sabora_catalog_login')`, `to_regrole('sabora_customer_session_login')` = `false`. |
| Secretos aportados | El propietario informa **tres contraseñas creadas y guardadas por él**; sus valores no se transmitieron a ChatGPT ni a GitHub. **Aún no están asociadas a roles SQL ni inyectadas**. |
| API operativa | `apps/api/src/server.mjs` solo publica `/health` y `/ready`; `api-runtime-config.mjs` admite solo `health-only` y rechaza secretos de producción. |

## 3. Comparación exacta de las cadenas de migración en GitHub

Se consultaron los directorios reales `supabase/migrations` en ambas refs **sin descargar o ejecutar SQL en Supabase**:

| Referencia | Migraciones | Registros de auditoría explícita | Diferencia |
| --- | ---: | ---: | --- |
| `main` | **98** | **98** | Última `20261109020000_sabora_waiter_calls_integral_candidate.sql`. |
| [PR #56 Draft](https://github.com/jdlc86/CartaViva/pull/56), HEAD funcional `ba0530f4531e30afa70322d4b967ee49037be2ba` | **99** | **99** | Añade `20261110232000_sabora_m3_effective_management_permissions_candidate.sql` (titularidad efectiva M3/M5). |

No se hallaron nombres de migraciones ausentes o extras en el registro `REVIEWED_MIGRATION_AUDIT` para ninguna de las dos referencias. **Es una conciliación de inventario**, no una auditoría manual propia de las 99 sentencias ni su ejecución en Supabase.

**Evidencia previa de CI en el mismo SHA #56:** [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/43067975140) y [Sabora CI/H6](https://github.com/jdlc86/CartaViva/actions/runs/43067974953) completaron `success`, al igual que los cuatro workflows cliente/gestión/PWA/cobertura indicados en S36. Los arneses `scripts/ci/postgres-migration-smoke.sh` y `postgres-migration-chain-smoke.sh` prueban cadena, interrupción, checksums y reanudación usando **PostgreSQL 17 desechable en contenedor con usuario `postgres` de laboratorio** y requieren GitHub Actions. **No se pueden copiar ni ejecutar sobre el VPS o Supabase operativo**; la cuenta real de Supabase no tiene superusuario.

### Primera dependencia que hay que cerrar

La cadena **debe fijarse después de resolver la integración de #56 y observar la CI del SHA que vaya a instalarse**. Instalar primero 98 y después añadir la número 99 sin preflight ni punto de restauración aumenta el número de intervenciones y no cierra el hito integral de activación. Ninguna migración ni rol se creó en esta sesión.

## 4. Relación correcta de las tres contraseñas y roles SQL

| Contraseña ya guardada | Login futuro | Rol de capacidad preexistente tras migraciones | Contrato visto |
| --- | --- | --- | --- |
| `SABORA_STAFF_DB_PASSWORD` | `sabora_staff_reader_login` | `sabora_staff_reader` | `20261020200000_sabora_staff_reader.sql`, `docs/security/STAFF_READER_LOGIN_PROVISIONING_DRAFT.sql`. **El archivo está rotulado para laboratorio y advierte NO aplicarlo a Supabase operativo.** |
| `SABORA_CATALOG_DB_PASSWORD` | `sabora_catalog_login` | `sabora_catalog_reader` | `20261021200000_sabora_catalog_reader.sql`, `scripts/ci/catalog-reader-login-smoke.sh`; login **NOINHERIT** y `SET ROLE` explícito en test. |
| `SABORA_CUSTOMER_SESSION_DB_PASSWORD` | `sabora_customer_session_login` | `sabora_customer_session_runtime` | `20261021030000_sabora_customer_session_restricted_rpcs.sql` y `scripts/ci/customer-session-login-fixture.sql`; fixture de laboratorio, **NO aplicar en Supabase**. |

Los tres logins físicos se aprovisionarán **separados** de los roles `NOLOGIN` definidos por SQL y con privilegios mínimos, TLS verificado, sin superusuario ni `BYPASSRLS`. La membresía, herencia y `SET ROLE` **no son intercambiables**: el lector de personal usa `INHERIT` según su borrador de aprovisionamiento, mientras catálogo/sesión prueban `NOINHERIT` con cambio explícito de rol. Antes de emitir SQL operativo se debe revisar el contrato vigente y cada `GRANT`, pertenencia, `PUBLIC` y política RLS frente al proveedor real. **No copiar contraseñas CI como `ci_disposable_only`.**

Estas tres identidades no bastan para H3–H6, pagos, gobierno ADMIN, SSE/outbox, invitaciones ni todas las funciones de dos PWA. La migración `20261105130000_sabora_m2_h3_h6_runtime_capabilities_candidate.sql` crea roles/capacidades **NOLOGIN**, sin credenciales de despliegue; falta inventario de los demás logins, claves HMAC/rotación y JWKS antes de abrir servicios. No usar la credencial `service_role` o conexión `postgres` como identidad normal de runtime.

## 5. Puerta previa a la primera instalación real (bloque completo, sin micro-despliegues)

1. **Integración de código:** autorización de merge de #56, revalidación de diferencias y CI del SHA final de `main`; fijar manifiesto exacto (nombre/versión/SHA256/orden), sin mezclar referencias.
2. **Compatibilidad Supabase:** ejecutar una evaluación autorizada del plan frente a PostgreSQL 17.11/pgcrypto 1.3 y al rol `postgres` **no superusuario** del proveedor; no suponer que el PASS en Docker con superusuario implica compatibilidad operativa. Confirmar posibilidad de crear roles, cambiar propietarios de funciones, utilizar extensiones y aplicar políticas/ACL sin bypass.
3. **Preflight de seguridad en PG17 desechable:** ejecutar cadena completa y regresión integrada M2/H3–H6 del SHA final, 6 workflows, pruebas positivas/negativas de RLS, `SECURITY DEFINER`, autenticación efectiva, revocación, concurrencia, SQL mínimo, dos PWA, HMAC y cierre de conexión; conservar logs y checksums. La CI del PR demuestra candidato, no este despliegue.
4. **Respaldo y reversión Sabora-only:** definir el procedimiento operativo de migración secuencial con ledger/checksum y recuperación/restauración comprobada, con datos ficticios, sin tocar otros proyectos. No inferir reversibilidad a partir de nombres de migración.
5. **Preparación de secretos:** escoger mecanismo de custodia/inyección separado de Git y Fleetia, matriz de responsables/caducidad, inventario completo de H3–H6; los tres valores guardados permanecen exclusivamente en poder del propietario hasta un canal seguro de aprovisionamiento. No insertarlos en SQL pegado aquí.
6. **Autorización y corte operativo:** solicitar autorización específica antes de modificar Supabase operativo; desplegar únicamente Sabora tras preflight de aislamiento del VPS, con backup/restore y endpoints HTTPS, y recorrer QR→cliente→pedido→cocina/sala desde dispositivos reales.

**Condiciones de parada:** diferencia de checksums/orden, error de permisos y ownership, SQL parcial, `PUBLIC`/roles excesivos, extensión incompatible, fuga de credenciales, recuperación no validada o cualquier dependencia/modificación de Fleetia. Cualquier fallo implica **NO-GO**, no improvisar privilegios más amplios ni desactivar RLS.

## 6. Distinción de evidencia y dictamen

- **Verificado ahora:** proyecto `ACTIVE_HEALTHY`; conexión SQL read-only y PG17/pgcrypto; esquema/roles ausentes; listas GitHub 98/99 y auditorías 98/99 sin omisiones de nombre; contratos de lector de personal/catálogo/sesiones y límites de arneses CI.
- **Validado previamente solo en CI:** cadenas PG17 desechables y pruebas integradas del SHA candidato #56 (`6/6`).
- **No ejecutado / no validado en Supabase operativo:** ninguna de las 99 migraciones, roles LOGIN, asignación de contraseñas, bootstrap H3–H6, pruebas reales con credenciales, backup/restore, credenciales HMAC, despliegue, aceptación visual humana o pago Stripe sandbox remoto.
- **Dictamen:** Supabase está listo **para preparar una instalación**, NO está listo para **poner el restaurante operativo**. Próximo trabajo de valor: reconciliar #56 y construir el cutover M2/CV-005 completo; después instalar tras autorización separada y sin tocar Fleetia.

_Corte exclusivamente documental y de consultas read-only. Ninguna clave real forma parte del repositorio ni de este informe._
