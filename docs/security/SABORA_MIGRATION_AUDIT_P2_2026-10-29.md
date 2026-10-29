# Sabora — auditoría individual de migraciones P2

**Fecha:** 2026-10-29

**Ámbito:** las 42 migraciones de `supabase/migrations` en PR Draft #40.

**Estado:** inventario técnico revisado; no autoriza aplicar migraciones en un entorno operativo.

La fuente ejecutable de esta auditoría es `scripts/ci/migration-audit.mjs`. El gate une cada ficha revisada al nombre, orden, tamaño y SHA-256 calculado desde el SQL. El manifiesto de esta revisión tiene SHA-256 `7ceffee4cecbb2d2559dd23c4fadfccff43febd142d407e54ca356867097405e`. `node scripts/ci/migration-audit.mjs` muestra los 42 checksums completos y falla si falta o sobra una ficha, si hay una versión duplicada o si queda un campo `unverified`.

Todas las migraciones se clasifican como `single_apply_checksum_guarded`: no se autoriza reejecutarlas para averiguar si son idempotentes. Ninguna tiene un *down* destructivo aprobado. Ante fallo confirmado se reanuda solo desde un historial con el mismo checksum; ante estado ambiguo se detiene la aplicación y se elige corrección hacia delante o restauración verificada.

| Versión | Dominio y dependencias | Objetos / permisos | Bloqueo y datos | PG17 / pgcrypto |
| --- | --- | --- | --- | --- |
| 20261020140000 | Pedidos; raíz | esquema y núcleo de pedidos; FORCE RLS y navegador revocado | DDL exclusivo; solo esquema | PG17; no |
| 20261020150000 | Pedidos; núcleo | `confirm_order`; EXECUTE público revocado | locks de agrupación; pedido/idempotencia | PG17; no |
| 20261020160000 | Mesas; `dining_tables` | rotación QR; EXECUTE revocado | lock de fila; versión/token QR | PG17; no |
| 20261020170000 | Pedidos; pedido/personal | historial y transición; FORCE RLS | DDL/índices y locks; eventos | PG17; no |
| 20261020180000 | Cocina/sala; pedidos/personal | líneas, avisos, eventos y triggers; FORCE RLS | DDL/índices y locks; líneas/eventos | PG17; no |
| 20261020190000 | Personal; líneas/transiciones | estado de acceso y actor activo; RLS retenido | posible reescritura/trigger; estado de personal | PG17; no |
| 20261020200000 | Personal; `staff_members` | rol lector y policy; NOLOGIN/NOBYPASSRLS | catálogo; sin datos | PG17; no |
| 20261020210000 | Gobierno; personal | ROOT único, owner y guardas; FORCE RLS | índice único/locks; titularidad | PG17; no |
| 20261020220000 | Gobierno; owner/personal | propuestas y auditoría inmutable; FORCE RLS | DDL/índice; auditoría append-only | PG17; no |
| 20261020230000 | Gobierno; auditoría | unicidad de idempotencia | validación única; correlaciones | PG17; no |
| 20261020240000 | Gobierno; auditoría/personal | hardening y guardas de ROOT/TRUNCATE | constraints/triggers; filas existentes | PG17; no |
| 20261020250000 | Gobierno; raíz | writer dormido sin grants | catálogo; sin datos | PG17; no |
| 20261020260000 | Gobierno; esquema Sabora | ACL por defecto de tablas/secuencias/funciones | catálogo; sin datos | PG17; no |
| 20261020270000 | Gobierno; rol migrador | revocación global de EXECUTE por defecto | catálogo; sin datos | PG17; no |
| 20261021010000 | Cliente; esquema | perfiles; FORCE RLS | DDL; perfiles | PG17; no |
| 20261021020000 | Cliente; perfiles | sesiones e índice; FORCE RLS | DDL/índice; hashes/estado | PG17; no |
| 20261021030000 | Cliente; perfiles/sesiones | owners/runtimes, policies y RPC; solo RPC | catálogo y locks; revocación | PG17; no |
| 20261021180000 | Catálogo; esquema | items publicados/borrador; FORCE RLS | DDL; snapshots | PG17; no |
| 20261021190000 | Catálogo; items | validación/publicación; EXECUTE revocado | lock de item; publicación | PG17; no |
| 20261021200000 | Catálogo; items | lector/owner y RPC; NOLOGIN/RPC-only | catálogo; sin datos | PG17; no |
| 20261021210000 | Economía; catálogo | validación monetaria/modificadores | constraints; snapshots económicos | PG17; no |
| 20261021220000 | Economía; catálogo/cliente | ledgers de quote/confirmación; FORCE RLS | DDL/índices; filas append-only | PG17; no |
| 20261021230000 | Economía; ledgers | guardas UPDATE/DELETE/TRUNCATE | triggers; inmoviliza históricos | PG17; no |
| 20261021240000 | Visitas; cliente/mesas | visitas e índices; FORCE RLS | DDL/índices; autorizaciones | PG17; no |
| 20261021250000 | Mesas; `dining_tables` | ciclo de vida y constraints | ALTER exclusivo; estado operativo | PG17; no |
| 20261021260000 | Mesas; ciclo de vida | frontera de ocupación y triggers | locks de fila; sesiones/visitas | PG17; no |
| 20261021270000 | Mesas; estado/personal | transición por personal; rol activo | lock de mesa; transiciones | PG17; no |
| 20261021280000 | Mesas; transiciones | auditoría y guardas; FORCE RLS | trigger/DDL; auditoría append-only | PG17; no |
| 20261021290000 | Mesas; auditoría | guarda TRUNCATE | trigger; sin datos | PG17; no |
| 20261022120000 | Pedidos; pedidos/líneas | compatibilidad de identidad | ALTER/índices/constraints; backfill | PG17; no |
| 20261022130000 | Pedidos; compatibilidad | alineación contractual de identidad | validación; pedidos existentes | PG17; no |
| 20261023010000 | Mesas; `dining_tables` | lector admin y policy; NOLOGIN | catálogo; sin datos | PG17; no |
| 20261023225024 | Cocina/sala; líneas/personal | ledger, guardas y RPC idempotente; FORCE RLS | índice/DDL/locks; requests/eventos | PG17; no |
| 20261024190000 | Operaciones; cocina/gobierno | keyring, owner sellado, policies y wrapper HMAC | extensión/DDL/locks; claves/operaciones | PG17; **pgcrypto requerido** |
| 20261025081318 | Personal; gobierno/HMAC | altas, requests, audit, keyring y wrapper; FORCE RLS/RPC | DDL grande/locks; ciclo y claves | PG17; pgcrypto heredado |
| 20261026120000 | Lectura sala/cocina; HMAC/pedidos | board/history capability; solo RPC | catálogo/lectura acotada; sin datos | PG17; pgcrypto heredado |
| 20261026222958 | Cliente E2E; identidad/catálogo/visitas/pedidos | roles, attempts y RPC; owners separados/FORCE RLS | DDL grande/locks; flujo cliente | PG17; no directo |
| 20261027072924 | QR; mesas | rotación V1 y constraints | lock de mesa; digest/versión | PG17; no |
| 20261027122858 | H6; HMAC/cliente/pedidos/operaciones | pagos, cocina, incidencias, caja, webhooks, outbox y RPC; 4 roles sellados/FORCE RLS | **muy alto**, DDL/índices/locks; históricos H6 | PG17; **pgcrypto requerido** |
| 20261027190334 | Recogida; H6/operaciones | tareas/eventos, unicidad y RPC; owners sellados/FORCE RLS | alto, backfill/índice/locks; recogida | PG17; pgcrypto heredado |
| 20261027225805 | Identidad de personal; lifecycle/pickup/HMAC | pool, mantenimiento, identidad y binding; owner sellado/FORCE RLS | **muy alto**, 46.655 códigos/backfill/locks | PG17; pgcrypto heredado |
| 20261028120000 | Directorio; identidad/pickup/HMAC | contactos y lecturas contextuales; scopes list/detail/self/FORCE RLS | alto, backfill/constraint/lecturas | PG17; pgcrypto heredado |

## Decisiones de revisión

- Las dos instalaciones de `pgcrypto` son `IF NOT EXISTS` bajo el esquema `extensions`; el resto de wrappers HMAC depende de esa ubicación. La recuperación selectiva debe crear el esquema y la extensión antes de restaurar `sabora`.
- No se utilizan `ltree`, `btree_gist`, índices `CONCURRENTLY`, `VACUUM`, `REINDEX`, `CREATE DATABASE` ni otras sentencias de migración fuera de transacción detectadas. Esto no convierte la cadena en reejecutable.
- Los riesgos dominantes son validaciones/índices sobre tablas existentes, los backfills de H6/recogida/directorio y la población de 46.655 códigos. Una ventana futura debe medirlos con una copia representativa; el fixture vacío no acredita duración productiva.
- El backup de esquema no incluye contraseñas de roles ni objetos de Storage. Los roles se reconstruyen sin contraseña y sus secretos se provisionan/rotan por un proceso separado; Storage y PITR son puertas distintas de activación.
- La recuperación no modifica migraciones históricas ni introduce `DROP` de rollback. Los SQL históricos con reemplazos/guardas destructivas forman parte de su aplicación única y quedan cubiertos por backup previo y corrección hacia delante.

## Evidencia automática asociada

- `migration-audit.test.mjs`: cobertura exacta de las 42 fichas.
- `migration-preflight.mjs`: SHA del checkout, orden y checksum antes de abrir el contenedor.
- `postgres-migration-chain-smoke.sh`: cadena real, ledger exacto, interrupción tras una migración confirmada, reanudación y rechazo de drift.
- `postgres-migration-failure-smoke.sh`: fallo dentro de transacción, ausencia de parcial y reintento.
- `postgres-recovery-smoke.sh`: dump selectivo, restauración en segundo clúster PG17 con roles reconstruidos, fingerprints y principal restringido real.
