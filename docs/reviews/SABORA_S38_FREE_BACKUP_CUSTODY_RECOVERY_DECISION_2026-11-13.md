# Sabora S38-16 — ruta de recuperación verificable para Supabase Free

**13-11-2026. Decisión de preparación y plan de ensayo, NO respaldo real ni certificación de restauración.** Solo proyecto restaurante **`byhvmumqivmunkmomhup`** y repositorio **`jdlc86/CartaViva`**. Prohibido emplear o modificar Fleetia, directorio externo, contenedores ajenos o infraestructura compartida. Las [normas CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md), [autorización](../SABORA_AUTHORIZATION_GATE.md) y [runbook S38](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md) prevalecen; este documento no cambia sus contratos.

## Adenda de decisión de arquitectura, 13-11-2026 (pendiente de integración normativa)

El propietario propone **dos destinos complementarios**: una copia operativa opcional **cifrada** en almacenamiento exclusivo Sabora del VPS (con aislamiento y cuota), y una copia **externa obligatoria**, cifrada y restaurable, fuera de Supabase/VPS/GitHub. La exportación debe hacerse desde equipo independiente y puede producir **un único artefacto cifrado autenticado** replicado a ambos destinos, sin generar dos exportaciones. El texto histórico S38-16 que exige captura/custodia fuera del VPS sigue aplicando a la **fuente de captura y a la copia externa**; no prohíbe una réplica local cifrada posterior si se integra esta adenda normativa. Véase el contrato de [metodología y recuperación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md#4-backup-recuperación-y-parada-segura). No hay copia/ensayo ejecutado, ni autorización SQL/VPS. La decisión de aplazamiento S38-17 solo se levanta expresamente.

## 1. Lo comprobado ahora: plan y cobertura real

**Consulta directa del conector RESTAURANTE a la organización `lqdarfcfumupgxbwmaoa`: `plan=free`, `tier=tier_free` (13-11-2026).** El proyecto asociado `byhvmumqivmunkmomhup` está `ACTIVE_HEALTHY` en `eu-central-1`, PostgreSQL administrado `17.11.0.003`. Esto **actualiza** la cautela histórica de S38-15: el plan Free **SÍ está confirmado actualmente**, no es mera suposición. El conector disponible **NO** expone un endpoint para exportar el backup ni para consultar/copiar su inventario de objetos físicos; no se ha descargado ningún dump, certificado ni credencial.

[Documentación oficial de backups](https://supabase.com/docs/guides/platform/backups) y [FAQ Free](https://supabase.com/kb/faqs/platform/free-plan-backups): en **Free no hay backups automáticos diarios ni PITR**. Supabase recomienda **exportaciones lógicas por CLI con custodia externa**; no se requiere contratar plan superior para preparar el piloto, pero hay que aceptar que un dump manual **no** proporciona recuperación continua ni un RPO de segundos.

[La CLI oficial](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) distingue **roles, esquema y datos** como exportaciones separadas; el dump normal **excluye `auth`, `storage` y otros esquemas gestionados**. No es una imagen completa reversible del servicio Auth, Storage, claves del proveedor o un backup físico. La [referencia CLI](https://supabase.com/docs/reference/cli/introduction) evoluciona: versiones actuales pueden preferir `--remote` frente al anterior `--db-url`. **No fijar flags desde memoria:** antes de ejecutar, registrar `supabase --version`, `supabase db dump --help` y `pg_dump --version`, y seguir el manual de **esa versión instalada**. No introducir DSN, password o token en la línea de comandos, en Git, acciones, logs, chat o archivos compartidos.

## 2. Modelo de recuperación por estados, no un «rollback genérico»

| Estado encontrado | Decisión segura según CV-005/P2 |
| --- | --- |
| **Antes de DDL:** esquema, roles y ledger Sabora todavía ausentes | Conservar inventario de preestado y respaldo lógico consentido del ámbito aplicable, con hash y cifrado; **no** llamar «snapshot reversible» a un dump vacío de Sabora |
| **Versión pendiente sin COMMIT:** operación interrumpida durante su transacción | Verificar rollback real y ausencia de registro durable; si es inequívoco, corregir causa y reevaluar. No asumir que toda DDL externa revertirá del mismo modo |
| **Versión confirmada en ledger con SHA256 idéntico:** instalación parcial y reanudable | Validar todos los efectos y permisos de esa versión; solo reanudar versiones pendientes mediante **ejecutor aprobado** y comprobación por COMMIT, sin reejecutar las confirmadas |
| **Estado ambiguo o checksum/roles/ACL/RLS alterados:** divergencia respecto a ledger | **STOP**: no `DROP SCHEMA`, `DROP ROLE`, `db reset`, borrado de ledger, `CASCADE` ni replay automático. Diagnóstico DBA, corrección hacia delante aprobada o restauración realmente ensayada del ámbito Sabora |
| **Instalación 99/99 completa sin usuarios:** primer estado operativo Sabora | Crear y custodiar **backup cifrado POST-instalación** y ensayar restauración en PG17 aislado antes de activar datos reales o PWA; registrar roles/owner/grantor/ADMIN/SET/INHERIT, ledger, RLS, RPC, Storage si aplica |
| **Datos reales posteriores:** pérdida/corrupción | Free permite recuperar **solo hasta la última copia manual íntegra** disponible; medir RPO/RTO reales y definir frecuencia/retención o decidir expresamente un plan gestionado |

**Invariante esencial:** el `supabase/migrations` Git tree de 99 SQL es `d26f1d4fc22acb13b6bda4927c424a74f5164c4a` y se aplica con ledger atómico por versión. No usar los arneses `scripts/ci/*migration*smoke*` contra la DB operativa: están protegidos para Docker efímero. Ni un `pg_dump` ni `supabase db dump` garantizan por sí solos restaurar **el grantor del proveedor `supabase_admin`** o reponer passwords físicos. Los roles propios de plataforma **no** deben recrearse/revocar sus grants sin permiso del proveedor.

## 3. Procedimiento exacto de custodia antes de solicitar la instalación

**El entorno de captura será un equipo aislado del VPS compartido, con cliente Supabase CLI compatible con la versión PostgreSQL; nunca la VPS de Fleetia.** El responsable del proyecto copia el endpoint y la CA desde el panel `restaurante` (sin exponer passwords). La conexión debe acreditar `sslmode=verify-full` o verificación equivalente de CA y nombre. [Conexión TLS documentada](https://supabase.com/docs/guides/database/psql); las conexiones directas y pooler de sesión se seleccionan según IPv6 y configuración real, **no** inventar la región de un pooler ni usar transaction pooling con estado de sesión. No cambiar SSL enforcement; según [guía SSL](https://supabase.com/docs/guides/platform/ssl-enforcement) cambiarlo reinicia PostgreSQL y exige autorización separada.

**Bloque de preparación (sin consulta remota adicional hasta permiso):**
1. **Custodios distintos**: asignar autoridad release, DBA/migración, seguridad/secreto, custodia backup externo y responsable de restore; registrar aprobación de alcance, fecha, expiración y contacto. *Actualmente SIN ASIGNAR/NO ACREDITADO* en este expediente.
2. **Destino independiente y canal**: seleccionar un almacén cifrado fuera del proveedor y fuera del VPS compartido, ACL privadas, retención acordada, clave AES-256-GCM separada del ciphertext, mecanismo de recuperación de la clave bajo un segundo custodio; registrar ubicación por identificador no sensible, sin datos secretos. *NO ELEGIDO*.
3. **Preflight de captura**: fijar commit, 99 versiones y hashes SHA256 por archivo; `SELECT` de objetos, roles y `pg_auth_members` relevantes, owner, ACL, FORCE RLS y extensión. Comprobar que el proyecto es **exactamente** `byhvmumqivmunkmomhup`, que `sabora` aún no existe y que nunca se toca `auth/storage` del proveedor.
4. **Captura lógica autorizada**: generar con la **CLI real instalada** exports separados de roles, esquema y datos conforme a `--help` y documentación; estudiar cada archivo **sin restaurar ciegamente roles globales**. El ámbito lógico de Sabora y meta-ledger debe distinguirse de los objetos administrados por Supabase. Mantener temporales solo en almacenamiento local protegido, cifrarlos autenticadamente antes de su traslado y eliminar temporales conforme al medio/retención. `scripts/ci/encrypted-backup-artifact.mjs` es herramienta de fixture con guardia `RUNNER_TEMP` y **no** se ha elevado a gestor de backups productivo.
5. **Ensayo de restauración aislado**: usar **un PostgreSQL 17 dedicado a Sabora, no contenedor Fleetia ni clúster ajeno**; restaurar solo objetos seleccionados, roles propios mediante mapa aprobado y secretos nuevos; comparar hashes, ledger, grants, `grantor/admin/set/inherit`, propietarios NOLOGIN, funciones `SECURITY DEFINER`, políticas FORCE RLS y negativas con usuario mínimo. La membresía automática originada por `supabase_admin` no se recrea por una simple copia a Docker: verificarla **por separado** al activar el proveedor.
6. **Acta cronometrada**: medir comienzo/fin de captura, tiempo de cifrado/transferencia, restauración, integridad, prueba corrupta, tamaño real, frecuencia, retención, RPO y RTO observados. Establecer umbrales aprobados para una instalación sin usuarios, sin fingir tiempos de CI ni declarar que ya se restauró.

**Sin permisos para extracción y sin el canal externo elegido:** las acciones 3–6 anteriores permanecen **PENDIENTES**. En concreto **no se ha usado** `pg_dump`, `supabase db dump`, `psql` externo ni ningún fichero con credenciales real.

## Aplazamiento por prioridad decidido el 13-11-2026

A petición expresa del propietario, **no se realizará ahora** la extracción de un backup real, su custodia externa ni el ensayo de restauración. Se retoma solo tras nueva instrucción y los permisos concretos. Se conservan todos los controles anteriores como **pendientes**, sin rebajar las condiciones STOP: el piloto que implique SQL operativo no puede comenzar sobre Supabase sin recuperación adecuada. Mientras tanto, el trabajo se dirige a validar el flujo y la experiencia visual M3 (incluida la corrección H35-P1 ya presente en código) y a completar requisitos que puedan avanzar sobre PG17 efímero. [Continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).

## 4. Matriz de custodia y GO/STOP para la primera instalación

| Pieza | Custodio autorizado | Situación | Evidencia mínima exigida |
| --- | --- | --- | --- |
| Selección y SHA de release | Propietario release | **SHA de código conocido; autorización de instalación pendiente** | commit/árbol 99, manifesto SHA256 exacto, aprobación de ventana |
| Cuenta DBA/migración | DBA Sabora | **Identidad SQL de preflight observada, custodia no acreditada** | permiso acotado, rotación/expiración, sin acceso desde runtime |
| 17 logins SQL mínimos y 2 notifiers | DBA + Seguridad | **NO CREADOS / NO VALIDADOS** | roles exactos, un secreto por slot, membresías y negativas efectivas; 5 slots opt-in deshabilitados por defecto |
| Firma HMAC/JWKS/QR | Seguridad Sabora | **NO ACREDITADO OPERATIVAMENTE** | referencias secretas segregadas, issuer real, rotación, CA, manifest firmado o auditado |
| Destino backup + clave | Custodio de backup + Seguridad | **NO ASIGNADOS / NO MATERIALIZADOS** | almacenamiento cifrado fuera de Supabase/VPS compartido, hashes, clave fuera del ciphertext, retención |
| Restore del ámbito Sabora | DBA + testigo | **NO ENSAYADO CON EL PROVEEDOR** | logs saneados y checklist de grants/ledger/99 SQL, tiempo y negativa de corrupción |
| Supabase Free | Cuenta RESTAURANTE | **CONFIRMADO ACTUAL** | `plan=free`, `tier=tier_free` por `get_organization` 13-11 |
| Infraestructura y alerta | Administrador exclusivo Sabora | **VPS NO VALIDADO** | firewall externo Sabora-only, DNS/CA, notificación realmente recibida, Fleetia intacta |
| Aceptación cliente/gestión | Propietario producto | **PENDIENTE** | prueba real y visual aprobada, según [matriz](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) |

**Decisión operacional a solicitar al propietario, sin ejecutarla por un «adelante» genérico:** autorizar explícitamente **una captura/exportación lógica de solo lectura** de la base restaurante desde dispositivo externo designado, bajo DBA y cifrado/custodia definidos, y **un ensayo de restauración fuera del proveedor**. No equivale a permiso de crear roles, migrar 99 SQL, reiniciar bases, desplegar VPS ni modificar Fleetia. Si el ensayo no puede materializarse, la primera instalación sigue **STOP** por recuperación.

**Conclusión S38-16:** **ruta Free confirmada y plan de recuperación manual definido**; **backup real, restore y custodias NO VALIDADOS**. No se invirtieron costes ni se creó plan nuevo, roles, backups ni secretos.
