# S48 — Primer preflight DBA **solo lectura** de Supabase Sabora (22-11-2026)

**Ámbito autorizado por propietario:** tras solicitar explícitamente verificar el origen inicial S46 mediante una operación DBA **solo lectura**, la respuesta fue «Okk adelante». Esto **no autoriza** SQL DDL/DML, creación/modificación de roles, migraciones, captura de backup, firma simulada o despliegue. No se operó el VPS ni el proyecto Fleetia.

## 1. Identidad y fuente de autoridad

- Repo y versión del paquete revisado: `jdlc86/CartaViva`, `main@a5f0d90179515c8a2e539c584705654231e0e357`; el catálogo de GitHub contiene **103 archivos** `supabase/migrations/*.sql`, todavía no aplicados en esta intervención.
- Proyecto Supabase **exacto**: `byhvmumqivmunkmomhup`, identificado por el proyecto vinculado **RESTAURANTE**; nombre administrativo `restaurante`, región `eu-central-1`, estado `ACTIVE_HEALTHY`. El endpoint de metadatos declara `db.byhvmumqivmunkmomhup.supabase.co`, PostgreSQL `17.11.0.003` / engine `17`.
- Base conectada `postgres`, sesión `current_user=postgres`, servidor `17.11`. La identidad SQL es privilegiada: se usó **exclusivamente para SELECT** de catálogos; no se considera credencial de runtime permitida. La herramienta MCP no demuestra el modo de verificación de CA/nombre del cliente.
- Normativa: [S46 primer test](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [runbook S43 adenda S46](../runbooks/SABORA_S43_RELEASE_CONTROLLER_PROVISIONING_CANDIDATE_2026-11-19.md), [CV-005 DBA](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md) y [frontera de proyectos](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md). Este informe de observación NO es el wrapper firmado `sabora-initial-empty-preflight/v1`.

## 2. Consultas realizadas y hechos observados

**Método:** dos sentencias `SELECT` sobre `pg_catalog`, con filtros a objetos cuyo nombre contiene `sabora` o `cartaviva`; `pg_stat_ssl` restringida a `pg_backend_pid()`; `pg_extension` filtrada por `pgcrypto`; `to_regclass` con nombres exactos. Se produjo **una primera tentativa de SELECT con error de columna** (`pg_extension.version` en vez de `extversion`), que fue rechazada por PostgreSQL, sin efecto material. Se corrigió el nombre y las dos consultas de lectura posteriores finalizaron correctamente. No hubo transacciones de modificación ni intentos de migración.

**Observación #1 — `2026-11-22 19:43:07.309818+00`:**

| Control de origen | Resultado real |
|---|---|
| Versión PostgreSQL | `17.11` (major `17`) |
| Sesión SQL con SSL | `true` |
| `pgcrypto` | `1.3` instalado en `extensions` |
| Esquemas `sabora` / `sabora_*` / `cartaviva*` | **0** |
| Roles nominados `sabora*` / `cartaviva*` | **0** |
| Membresías entrantes/salientes de esos roles | **0** |
| Relaciones/objetos `pg_class` en esos esquemas o con esos prefijos | **0** |
| Rutinas `pg_proc` en esos esquemas o con esos prefijos | **0** |
| `to_regclass('sabora_migration_meta.applied_migrations')` | `NULL`, ledger **ausente** |
| `to_regclass('sabora.restaurant_settings')` | `NULL`, core **ausente** |

**Observación #2 — `2026-11-22 19:44:11.152677+00`:** CTE con inventario de esquemas, roles, relaciones, rutinas y membresías cuyo nombre contenga `sabora|cartaviva`, sin limitarse al comienzo del identificador: **0 coincidencias**, `[]` como inventario. `pg_stat_ssl` de la sesión: `ssl=true`, protocolo `TLSv1.3`. Se confirmó una instancia de `pgcrypto` en `extensions`.

La observación es **compatible con un alcance Sabora inicialmente vacío** y no pretende que el clúster completo esté vacío (Supabase mantiene schemas/roles de plataforma). Se inspeccionaron únicamente metadatos relevantes; no se extrajeron datos de clientes, claves, JWT, dumps, roles ajenos, contenidos de tablas o logs.

## 3. Puertas S46: evidencia contra obligación real

| Puerta | Estado |
|---|---|
| Proyecto Supabase exacto | **Observado** por ID/host y vínculo RESTAURANTE |
| PostgreSQL major 17 | **Observado** en metadata y sesión SQL |
| Esquemas y objetos Sabora ausentes | **Observado**, dos consultas |
| Roles/membresías Sabora ausentes | **Observado**, dos consultas |
| Ledger Sabora ausente | **Observado** con `to_regclass` |
| `pgcrypto` en `extensions` | **Observado** |
| TLS cifrado | **Observado** `TLSv1.3` |
| TLS `verify-full` / identidad CA/hostname del cliente DBA | **NO ACREDITADO**: `pg_stat_ssl` prueba cifrado de sesión, no cómo el cliente autentica al servidor |
| System identifier/identidad de origen de catálogo custodiada | **NO ACREDITADO** en un acta privada firmada |
| Exclusión de DDL/roles concurrentes durante preflight y futura instalación | **NO ACREDITADA**: una lectura momentánea no es lock ni ventana controlada |
| Inventario original completo, hash canónico y custodia privada | **NO CERRADO**: conteos/inventario filtrados no sustituyen el catálogo original material y su `catalogSha256` |
| Firma de DBA `sabora-initial-empty-preflight/v1` | **NO EMITIDA**: no se tuvo ni se debe simular clave de autoridad DBA; `validUntil <=24h` requiere emisión real |
| Aprobación SQL para 103 migraciones exactas y acto firmado de aplazamiento de backup | **NO CONCEDIDAS / NO EJECUTADOS** |

**DICTAMEN:** **PRE-FLIGHT OBSERVACIONAL FAVORABLE** para las invariantes visibles; **NO-GO de migración e instalación/activación** mientras no se cierre la puerta TLS `verify-full`, la identidad de origen, la custodia/firmas reales, el control de concurrencia y la autorización SQL exacta. La excepción S46 de backup aplazado para el primer test **no permite** inventar una restauración ni saltarse DBA/CI/identidad.

## 4. Siguiente secuencia estricta

1. Un custodio DBA independiente de este informe debe obtener por conexión PostgreSQL 17 **`verify-full` efectiva** con CA/host aprobado, confirmar identidad de origen y tomar **catálogo completo del ámbito Sabora** en custodia privada; registrar su `catalogSha256`, SHA del árbol original de migraciones, instante y controles de DDL/roles concurrentes.
2. Revisar y firmar el wrapper canónico real `sabora-initial-empty-preflight/v1` (caducidad máxima de 24 h), guardando privados los originales y la clave, sin incluir el material en GitHub/chat; comprobar que proyecto/SHA release, fuente, TLS, inventario, decisión propietaria y controles coinciden.
3. Solo entonces solicitar y recibir **autorización distinta y exacta para ejecutar el árbol SQL append-only** de Sabora. Antes de cualquier instrucción mutante, repetir la ventana de preflight/locks y la condición inicial sin reset ni DROP. Fallo/parcial: STOP y decisión DBA, no repetir automáticamente.
4. Después de comprobación de roles/CV-005/HMAC/RLS/ledger y acto firmado de aplazamiento inicial, evaluar instalación S43 y primer deploy bajo nuevos permisos. Otros proyectos del VPS y Fleetia siguen excluidos.

**Trazabilidad:** conexión Supabase RESTAURANTE; dos `SELECT` de catálogos con los timestamps exactos anteriores. No se presenta esta acta pública como documento firmado ni como aprobación de una autoridad externa.
