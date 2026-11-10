# Sabora — frontera de titular único para escrituras administrativas M3/M5 (08-11-2026)

**Estado del informe:** corrección candidata en PR [#51 Draft](https://github.com/jdlc86/CartaViva/pull/51), **validación final en GitHub Actions pendiente al redactar**. No es documento normativo ni autorización de merge, operación, alta de credenciales o despliegue.

## 1. Normativa prevalente y amenaza

- [Hoja de ruta técnica, fase 1](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md): roles ROOT/ADMIN/operativos y **titularidad única de escritura**.
- [Matriz de permisos administrativos](../security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md): solo **ADMIN activo, titular durable** puede modificar configuración; **ROOT excluido de esa escritura ordinaria**. Separar derechos de operaciones legítimas de sala/cocina y gobierno/recovery de ROOT.
- [Migración original de gobernanza](../../supabase/migrations/20261020210000_sabora_root_admin_owner.sql): un solo ROOT, tabla `sabora.admin_write_ownership` con fila singleton y `owner_user_id`. La existencia de esta tabla y de un ADMIN activo no bastan para probar que todo RPC administrativo revisa el titular.

**Brecha previa comprobada:** `sabora.manage_catalog_m3_candidate`, `manage_table_m3_candidate`, `transition_table_occupancy_m3_candidate` y `manage_communications_m5` autorizaban con `role='admin' OR role='root'` (con operación limitada para `waiter`) y HMAC, pero sin cotejar el `actorId` firmado con `admin_write_ownership.owner_user_id`. Un segundo ADMIN activo con token/capacidad legítima del emisor podía superar la verificación de rol. La matriz exige que la propiedad de escritura se revalide en SQL, no solo en el backend.

## 2. Corrección propuesta, sin ampliar autoridad

**Migración nueva (no reescribe las antiguas):** [`20261108121000_sabora_m3_m5_admin_single_writer_candidate.sql`](../../supabase/migrations/20261108121000_sabora_m3_m5_admin_single_writer_candidate.sql).

La función **ya sellada y firmada** `verify_management_capability_m3` (invocada por M3 y M5) distingue:
- **Escritura ordinaria reservada al ADMIN titular:** crear/editar mesas, QR, categorías y platos; guardar, publicar, pausar, reanudar y retirar comunicaciones. También acciones de preparación/ocupación realizadas por ADMIN.
- **Sin autorización de escritura ordinaria para ROOT:** no se le atribuyen derechos administrativos por ser superusuario funcional; conserva lectura administrativa y procedimientos específicos de gobierno ajenos a esta frontera.
- **Sala/operación separada:** camarero con rol válido conserva `table.readiness` y `table.occupancy`, que no requieren convertirse en titular administrativo. Cocina mantiene sus procedimientos de disponibilidad/operación, fuera del RPC administrativo genérico.
- **Lecturas no convertidas en mutaciones:** `tables.read`, `catalog.read`, `comms.read`, `finance.read` siguen regidas por sus autorizaciones respectivas.

La transacción fija un **bloqueo `FOR SHARE` de la fila singleton antes de bloquear keyring/personal**, en el mismo orden que la cesión administrativa, evitando que cambie de titular entre la comprobación y el acto. **Solo después de validar la firma HMAC, la identidad SQL de login, el actor y la membresía activa** se compara la titularidad, y la ausencia de owner deniega de forma cerrada. Se devuelven errores 42501 sin declarar éxito ni emitir recibo de idempotencia/auditoría. El emisor no acepta identidad del cuerpo de la petición.

Por restricciones PostgreSQL 17 para `SELECT ... FOR SHARE`, el propietario **NOLOGIN/NOINHERIT/NOBYPASSRLS** de la función recibe únicamente `SELECT(singleton,owner_user_id)` y `UPDATE(singleton)` con dos políticas RLS explícitas. El campo `singleton` está protegido por `CHECK(singleton)`, por lo que **no se concede `UPDATE(owner_user_id)`** al propietario de las funciones; la autoridad de transferencia sigue aislada. Los logins físicos ni el navegador reciben grants adicionales. Las funciones existentes conservan sus grants de ejecución exactos.

**HTTP y PWA:** se devuelve 403 a ROOT para operaciones de configuración; al ADMIN no titular lo deniega SQL aun cuando su rol y firma sean válidos. La UI distingue 403 de un fallo de red o de un commit incierto en Catálogo, Mesas y Comunicaciones; no destruye el borrador ni fuerza reconciliación innecesaria en caso de denegación. Los permisos por rol de tablas no anuncian que ROOT pueda configurar.

## 3. Matriz de pruebas integrada (mismo PG17 efímero y regresión H6)

| Camino | Aserción exigida | Fuente |
| --- | --- | --- |
| ADMIN titular activo → M3 mesas/QR | Permite la escritura y recibo correcto | `scripts/ci/m3-management-postgres17.test.mjs` y B3 |
| Segundo ADMIN activo, no titular → M3 mesas y catálogo | 403/42501, ningún cambio ni recibo/auditoría | PG17 M3, B3 JWT real, `admin-single-writer-postgres17.test.mjs` |
| Segundo ADMIN activo, no titular → M5 Comunicaciones | 403 incluso con JWT/rol y HMAC legítimos | `cv014-communications-postgres17.test.mjs` |
| ROOT verdadero → mutaciones M3/M5 | Rechazo 42501/403, pero lectura administrativa sigue permitida | `admin-single-writer-postgres17.test.mjs` y HTTP CV-014 |
| Traspaso titular → autoridad antigua y replay | Denegar inmediatamente la escritura anterior; nuevo titular permitido | PG17 M3 y matriz de escritor único |
| Titular ausente → escrituras | Denegación cerrada, ninguna alteración | Matriz PG17 |
| Camarero y cocina → sus flujos propios | Mantener preparación, ocupación, estados de cocina y B3 completos | `table-change-root-postgres17.test.mjs` + H6 |
| Privilegios del login SQL | No leer/actualizar titular ni invocar verificador libremente | Matriz PG17 de escritor único |
| Cliente y gestión Chromium, SSE, CV-014 | No regresión funcional/visual de anuncio, gestión, catálogo y mesa | Cadena Bootstrap + H6 + navegador |

Se ejecuta el **recorrido real completo** PostgreSQL 17 → JWT/HMAC/Fastify → PWA gestión y cliente Chromium → B3 económico/mesa y regresión H6. La prueba de matriz negativa de ROOT es adicional para proteger el requisito de seguridad crítico, no un sustituto del recorrido integrado. En todos los casos, aislar credenciales y no usar Supabase operativo.

## 4. Puertas todavía abiertas

- **GitHub Actions de la revisión de este hito:** consultar los seis workflows **del mismo SHA funcional**, no atribuir 6/6 de B3 histórico a esta corrección.
- **Alcance de la titularidad:** este guard cubre los RPC administrativos M3/M5 que comparten `verify_management_capability_m3`. El ciclo del personal dispone de su propio control de owner según [identidad del personal](../security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md). **No equiparar** actuaciones operativas de sala/cocina, cancelaciones y procedimientos económicos H6/M4 con el writer de configuración sin revisar su normativa específica. La política exacta de un traspaso concurrente por el workflow de gobierno es distinta de permitir dos escritores.
- Aún pendientes aceptación humana del diseño, escenarios de reservas anticipadas/llamada camarero CV-014, M4 Stripe real de pruebas, M6 y despliegue. Una prueba verde no equivale a autorización productiva.

**Aislamiento invariable:** únicamente repositorio `jdlc86/CartaViva`, PR Draft, sin fusiones ni cambios en Supabase operativo, VPS compartido, Fleetia o proyectos ajenos.
