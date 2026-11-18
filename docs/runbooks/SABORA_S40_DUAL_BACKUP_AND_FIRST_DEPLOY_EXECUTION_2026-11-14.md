# Sabora S40 — ejecución gobernada de doble copia y primer despliegue

**Estado: procedimiento candidato; ninguna operación externa autorizada por este documento.** Ámbito único `jdlc86/CartaViva`, proyecto Supabase restaurante `byhvmumqivmunkmomhup` y proyecto Compose `sabora`. Quedan fuera Fleetia, otros proyectos, bases, redes, contenedores y servicios. Prevalecen [autorización](../SABORA_AUTHORIZATION_GATE.md), [frontera](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [release gobernada](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [método de recuperación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) y [primera activación](SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md).

## 1. Estados que no se pueden colapsar

| Estado | Evidencia admisible | Estado actual |
| --- | --- | --- |
| Implementado | código y contratos en PR #59 | candidato |
| Ensayado en laboratorio | PG17/Docker/nftables desechables del mismo SHA | **SÍ**, código `5afea7cc`; CI/Bootstrap/UI SUCCESS |
| Validado operativamente | copia externa real restaurada, SQL/host/red/alertas observados | **NO** |
| Aceptado | revisión independiente y aceptación humana de producto/visual | **NO** |

Una CI verde solo puede cerrar la segunda fila. No autoriza merge, captura, SQL, red, secretos, VPS ni despliegue.

## 2. Mecanismo de copia lógica, cifrado antes de persistir

La implementación operable está en `scripts/ops/sabora-encrypted-backup-bundle.mjs`, con interfaz estrecha `scripts/ops/sabora-encrypted-backup-cli.mjs`. Produce cuatro componentes autenticados de Sabora:

1. `roles-memberships.aesgcm`: roles propios, aristas `grantor/admin/set/inherit`, prerrequisitos de ACL de base y grants Sabora exactos sobre el esquema gestionado `extensions`, nunca passwords ni objetos gestionados;
2. `schema.aesgcm`: esquema de `sabora` y `sabora_migration_meta`;
3. `data.aesgcm`: datos y estado de secuencias de esos dos esquemas;
4. `inventory.aesgcm`: fingerprint de roles, membresías, owners, ACL, RLS, funciones, constraints, índices, triggers, ledger y datos.

Cada comando PostgreSQL entrega su `stdout` directamente al cifrador AES-256-GCM. El módulo no crea primero un dump en claro. **Actualización candidata S42, no validación operativa:** el formato histórico `sabora-logical-backup/v1` solo sirve para fixtures y artefactos anteriores; la CLI de captura operativa exige `sabora-logical-backup/v2`. Esta versión abre una transacción `REPEATABLE READ READ ONLY`, exporta un snapshot de PostgreSQL 17 y lo mantiene vivo mientras ambos `pg_dump --snapshot` e inventario transaccional lo importan. Inventario previo y posterior detecta variaciones de objetos y secuencias no MVCC; la salida de roles se comprueba dos veces, y cualquier incongruencia aborta y elimina el bundle. El manifiesto y AAD autentican `snapshotId`, `sourceDatabase` y `sourceSystemIdentifier`, además de proyecto, release SHA, versión PG17, SHA256 de migraciones y esquemas. El identificador de sistema se obtiene de `pg_control_system()` y se compara con un identificador **independientemente aprobado**; por sí solo, el campo `sourceProjectRef` no demuestra procedencia. Cada componente registra IV, tag, tamaño y hash de plaintext/ciphertext; la clave nunca entra en el bundle, manifiesto, argv o réplica.

**Endurecimiento S42 — AUD-S42-002 / 003 (solo candidato de código):** `roles-memberships` y su segunda captura de verificación también importan `SET TRANSACTION SNAPSHOT` para los catálogos de base `pg_namespace` y `pg_class`. Las vistas globales de roles/membresías y los valores no MVCC de secuencias no adquieren garantías mágicas de snapshot: se comparan antes/después y debe congelarse el DDL y los cambios de roles durante la captura operativa. El laboratorio PG17 comprueba explícitamente una tabla `sabora` creada por DDL concurrente que no es visible desde el snapshot exportado. Además de TLS `verify-full` y el identificador de clúster autorizado, la captura requiere `SABORA_BACKUP_APPROVED_CA_SHA256` (64 caracteres hex, huella **aprobada por fuente independiente** del contenido del fichero CA, nunca copiada sin verificar del fichero recibido); `PGSSLROOTCERT` debe ser un fichero regular no enlazado y sus bytes han de coincidir. Se rechaza cualquier variable `PG*` ajena a la lista explícitamente permitida (en particular `PGOPTIONS`, `PGPASSFILE` y certificados TLS de cliente no autorizados); mantener credenciales fuera de Git y argv. La CLI compara `metadata.migrationTreeSha256` con el árbol de todas las migraciones auditadas **localmente**; la coincidencia con el ledger efectivamente aplicado en Supabase sigue siendo un preflight DBA independiente, no inferible del metadato. Si una de estas pruebas no puede realizarse con los permisos aprobados: **STOP**, no deshabilitar el control ni usar otra identidad.

La CLI acepta solamente rutas absolutas, operaciones nominadas y la clave por `SABORA_BACKUP_KEY_FILE`. En S42, la captura **no opera** sin `PGHOST=db.byhvmumqivmunkmomhup.supabase.co`, `PGSSLMODE=verify-full`, CA externa por `PGSSLROOTCERT` y `SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER` previamente verificado por autorización independiente, que coincida con el clúster vivo. Se rechazan `PGHOSTADDR`, `PGSERVICE` y overrides host/puerto en argv; inicialmente se admite solo la ruta directa de Supabase, no un pooler cuyo anclaje requiera otro contrato técnico. Si el proveedor no permite consultar `pg_control_system()` con la identidad autorizada, la captura **STOP**: nunca elevar permisos ni improvisar bypass como solución. La validación real de esta ruta y de permisos/SSL todavía está pendiente. Los binarios aprobados se fijan fuera del plan mediante `SABORA_BACKUP_PSQL_BIN` y `SABORA_BACKUP_PG_DUMP_BIN`: deben ser rutas absolutas a ficheros regulares no enlazados ni modificables por grupo/otros, y cada componente queda unido al cliente que le corresponde. El plan JSON protegido contiene `metadata` y cuatro especificaciones directas `command/args`; no usa shell, exige propietario y modo `0600`, abre sin seguir enlaces y rechaza DSN/secretos, ficheros de salida/log, metaórdenes `psql`, esquemas adicionales y formatos `pg_dump` no cifrables por `stdout`. Las credenciales PostgreSQL deben entrar por un canal de entorno/archivo protegido del cliente aprobado, nunca por el JSON, argv, Git, Actions, chat o logs. En Linux/macOS la clave falla si tiene permisos de grupo/otros; en Windows la operación exige el hash del acta ACL NTFS independiente en `SABORA_BACKUP_NTFS_ACL_RECEIPT_SHA256`, además de conservar el acta en el expediente autorizado.

El AAD de cada componente autentica la totalidad de la identidad normativa del manifiesto —incluidos `postgresVersion`, `createdAt`, esquemas incluidos/excluidos y custodia—, además del nombre y tipo del componente. Alterar cualquiera de esos campos después de la captura hace fallar el descifrado y no deja un fichero parcial.

### Perfil preparado para el ordenador doméstico, todavía no operativo

La plantilla [`deploy/sabora-home-offsite-backup.profile.example.json`](../../deploy/sabora-home-offsite-backup.profile.example.json) registra la decisión del propietario sin inventar datos del equipo. Es un **perfil declarativo no ejecutable y sin secretos**; no sustituye el plan JSON protegido que consume la CLI. Mantiene `configurationComplete=false`, `copiesExist=false`, `restoreValidated=false`, `operationalAuthorizationGranted=false` y `schedulerEnabled=false`.

Cuando se configure físicamente el ordenador, un operador autorizado copiará el perfil a una ruta protegida **fuera del checkout** y completará únicamente con datos observados:

1. identificador no sensible, sistema operativo, cuenta local dedicada, cifrado de disco/actualizaciones, volumen, sistema de ficheros, espacio y ruta absoluta de ciphertext;
2. rutas absolutas de staging, plan, SQL de roles/inventario, `psql` y `pg_dump` PostgreSQL 17;
3. método de conexión autorizado, CA, hostname exacto y canal protegido de credenciales, sin DSN/password en argv, Git, Actions o chat;
4. custodio del equipo y custodio distinto de la clave, soporte separado para la clave y procedimiento de recuperación;
5. frecuencia, generaciones, purga, espacio mínimo y, después del ensayo real, RPO/RTO;
6. para la réplica VPS: autorización propia, ruta exclusiva Sabora, owner/grupo/modo, cuota, espacio y retención.

El modelo preferido es **saliente desde el ordenador doméstico**: el equipo inicia la captura autorizada y guarda el ciphertext localmente; no se abre un servicio entrante ni se permite al VPS escribir en él. El nombre/path real del equipo, claves y credenciales nunca se versionan. El fichero convencional `deploy/sabora-home-offsite-backup.profile.json` queda ignorado como defensa adicional, pero la ubicación operativa debe estar fuera del repositorio.

### Secuencia autorizada, no ejecutar sin las decisiones de §5

1. En equipo de captura designado y fuera del VPS, registrar versiones reales de CLI/`pg_dump`/`psql` y su `--help`; verificar CA y hostname.
2. Construir el plan protegido con comandos que capturen **solo** los dos esquemas y roles propios permitidos. Verificar el proyecto exacto antes de abrir el flujo.
3. Ejecutar `capture`; comprobar que el directorio contiene exclusivamente manifiesto y cuatro `.aesgcm`.
4. Ejecutar `replicate-offsite` hacia la ruta privada del ordenador doméstico independiente. Verificar recibo, lectura e identidad del ciphertext; hasta entonces no existe copia externa acreditada.
5. Con autorización VPS separada e aislamiento/cuota probados, ejecutar `replicate-vps-cache` hacia la ruta exclusiva Sabora. Esta segunda réplica está decidida, pero si no puede demostrarse independencia la operación y la activación permanecen STOP; no tocar Fleetia ni sustituirla por otra copia en el mismo equipo doméstico.
6. Eliminar staging conforme a la política aprobada. La clave permanece bajo custodio/canal diferente y nunca se replica con el bundle.
7. Desde la **copia externa**, descifrar cada componente únicamente dentro del entorno PG17 de restauración, aplicar roles revisados, esquema y datos en ese orden, comparar `inventory`, ledger de todas las migraciones auditadas del SHA (sin contador fijo), grants/RLS/negativas y destruir temporales claros al terminar.
8. Registrar tiempos y tamaños reales. Los tiempos CI no son RTO/RPO de producción.

El candidato S42 agrega una **migración 102**, `20261117010000_sabora_h6_webhook_order_identity_retry_candidate.sql`, en el PR #59 para rechazar una contradicción entre el pedido del evento Stripe y la ronda H6 persistida. Si un evento firmado coincide con un pedido H6 pendiente cuyo `provider_intent_id` aún no se ha guardado, el SQL **aborta antes de escribir el recibo** para que el endpoint devuelva HTTP 503 y Stripe lo pueda reintentar. El ledger no se reescribe y las funciones de proveedor no verificadas mantienen sus GRANT revocados. La migración es candidata, **no aplicada a Supabase** y requiere ensayos integradores y revisión independiente antes de integrarse.

La batería `scripts/ci/sabora-dual-backup-postgres17.mjs` ejecuta esa misma semántica sobre el PG17 plenamente migrado: crea ledger del inventario auditado (99 en la base histórica; la rama económica #60 incorpora la migración candidata 100), captura streaming, genera las dos réplicas, elimina staging, restaura solo desde la clase externa en un segundo contenedor `--network none`, espera el listener TCP del postmaster final —no el temporal del entrypoint—, carga datos con triggers deshabilitados solo durante el restore y después compara inventario, datos, secuencias, triggers/RLS, roles y ACL por grantor/opción exactos. También prueba LOGIN mínimo, corrupción y clave incorrecta. Los destinos del runner son **fixtures**, no custodias reales.

## 3. Gobernanza y agente de release

El workflow manual permanece `main`-only, exige Ed25519, seis evidencias SHA256 distintas, paquete inmutable y autorización de una sola operación. `authorizeHostOperation()` sigue en STOP: el repositorio no instala el agente ni concede Docker/SSH.

La CI añade dos ensayos que deben pasar en el SHA candidato:

- `sabora-nftables-enforcement-lab.sh`: crea namespaces y bridges efímeros, demuestra conectividad previa, aplica las dos tablas dentro del router aislado, verifica entrada exacta, bypass/puerto/salida/IPv6 denegados, retira solo tablas Sabora, recupera conectividad y compara inventario de tablas del host;
- `sabora-release-real-docker-lab.mjs`: bajo root de runner desechable, construye y guarda imágenes reales, las elimina y recarga por archivo, inspecciona tres redes, aplica tablas a bridges exclusivos, renderiza Compose firmado, arranca exactamente `sabora-egress`, `api`, `web` con `--no-deps --no-build --pull never`, prueba API, dos HTTPS, recepción de alerta y ledger con `fsync`, y limpia solo sus recursos nominados.

**Resultado observado:** código [`5afea7ccb6ccdb2077f084a6018b6ad7501fb792`](https://github.com/jdlc86/CartaViva/commit/5afea7ccb6ccdb2077f084a6018b6ad7501fb792); [CI #43619941591](https://github.com/jdlc86/CartaViva/actions/runs/43619941591) `validate` y `web-publication` SUCCESS; [Bootstrap PG17 #43619941584](https://github.com/jdlc86/CartaViva/actions/runs/43619941584) SUCCESS 51/51 con `sabora_dual_backup_pg17_external_restore_ok`; [UI #43619941608](https://github.com/jdlc86/CartaViva/actions/runs/43619941608) `functional-ui-gate` SUCCESS. La API no publica puerto de host: `web` la alcanza como `api:4100` por la red privada y el único listener de aplicación expuesto por el fixture es HTTPS/8443. [CV005+B2 #43619941612](https://github.com/jdlc86/CartaViva/actions/runs/43619941612) y aceptación visual final están SKIPPED, no PASS.

Esto cierra el hueco de laboratorio simulado, pero **no es el adaptador instalable del VPS**. Antes de provisionar el forced-command hace falta revisión independiente del código final, asignación de privilegios root-owned, destinos reales de egress y prueba en un entorno de host separado. La cuenta `sabora-release` no debe tener shell genérica ni pertenecer al grupo Docker.

## 4. Primera instalación y despliegue reales

Orden obligatorio, con autorización independiente por fila:

1. merge del PR revisado y CI del SHA final;
2. captura preinstalación y restore externo válido;
3. migraciones CV-005 según el inventario auditado y SHA aprobado, con comprobaciones exactas por versión y hash (99 históricas; 100 en el candidato económico #60);
4. captura postinstalación y segundo restore externo válido;
5. provisión de secretos/roles mínimos y receptor de alertas;
6. creación de redes y reglas Sabora-only, verificación de no interferencia;
7. instalación auditada del forced-command y clave pública;
8. autorización Ed25519 `deploy` para el SHA exacto;
9. deploy, `/ready`, ambos orígenes `:8443`, alertas, recorrido funcional con datos ficticios y negativas;
10. capturas Chromium del mismo SHA y aceptación humana separada;
11. ensayo de rollback de aplicación con autorización nueva, sin revertir SQL.

Un fallo detiene la secuencia. No se compensa una copia ausente con CI, ni SQL fallido con rollback de imagen, ni una captura visual con aceptación funcional.

## 5. Decisiones y autorizaciones aún necesarias

| Decisión | Debe fijar el propietario | Situación |
| --- | --- | --- |
| Almacén externo | ordenador doméstico independiente; SO, cuenta, volumen, rutas, espacio y acceso | **DESTINO DECIDIDO; PARÁMETROS PENDIENTES** |
| Custodia | custodio del ciphertext, custodio distinto de clave, sustitutos y recuperación | **SIN ASIGNAR** |
| Retención | frecuencia, generaciones, purga, legalidad y presupuesto | **SIN APROBAR** |
| RPO/RTO | objetivos y umbral de STOP basados en ensayo real | **NO VALIDADOS** |
| Réplica VPS | decisión afirmativa; cuota, ruta, ACL, espacio y responsable; nunca sustituye externa | **DECIDIDA, NO AUTORIZADA NI PROVISIONADA** |
| Captura/restore | equipo externo, DBA, ventana y proyecto exacto | **NO AUTORIZADOS** |
| Red/host | CIDR/puertos reales, Cloudflare, destinos egress, usuario forced-command | **NO AUTORIZADOS** |
| SQL/despliegue | autorización separada para la cadena de migraciones exacta del SHA integrado y otra para deploy | **NO AUTORIZADOS** |

Mientras cualquiera de las decisiones necesarias para su fase falte, el dictamen es **NO-GO operativo**. Este runbook no pide ni contiene secretos.


### Puerta correctiva S42-6 (17-11-2026): tras auditoría #64; NO autorización

Se ha añadido en PR #59 la migración **103** `20261117020000_sabora_h6_economic_provider_stripe_identity_serialized_candidate.sql`, con admisión serializada bajo locks de ronda/PaymentAttempt o del settlement económico, comparación monetaria/identidad de todos los eventos `payment_intent.*`, sin falsos ACK para pedidos sin tentativa Stripe ni para PID/metadata discordantes. En estado `authorization_unknown` de H6 solo se reconstituye autorización si la evidencia Stripe firmada está completa y mantiene una fecha capturable futura; no se certifica pago. El resto de resultados ambiguos requieren procedimiento de reconciliación de proveedor distinto, sin dar 200/recibo `ignored` que bloquee reintentos.

**Captura PG17 V2:** el exportador no solo recibe `migrationTreeSha256` de un plan: consulta las filas reales de `sabora_migration_meta.applied_migrations` dentro del snapshot MVCC exportado, calcula el digest con los mismos bytes NUL/LF que `migrationInventory()` y hace STOP por diferencia. Esto **no se ha probado con Supabase operativo** y no dispensa la comprobación DBA de identidad del proyecto y de privilegios. `psql` y `pg_dump` reciben únicamente argumentos de forma exacta (no banderas breves adheridas ni alias de conexión); `PG*` no permitidas, incluidas variantes mixtas de Windows, son rechazadas por la CLI y los procesos hijo. La huella de `PGSSLROOTCERT` y el system identifier conservan sus autorizaciones externas propias.

**Roles/ACL:** las concesiones de columna `pg_attribute.attacl` se vuelven a aplicar después de la reconciliación a nivel de tabla, y la huella de inventario usa nombres de grantor/grantee estables entre orígenes y restores, no OID.

**Firma offline Windows:** `scripts/ops/sabora-ntfs-acl-verifier.mjs` consulta propietario, SIDs y DACL protegida efectivos; exige que una huella aprobada corresponda a los bytes reales del descriptor de seguridad del fichero clave, y que borrador/directorio de salida tengan DACL restringida. Sin ACL real demostrada **STOP**, no se permite sustituir por un valor hexadecimal arbitrario ni por permisos POSIX nominales. Verificar explícitamente en el equipo del propietario antes del primer uso, sin copiar claves, datos privados ni DACL al repositorio.

**Aprobación:** CI de laboratorio y revisión externa posterior son puertas distintas. El usuario ha ordenado **NO ENVIAR nuevas revisiones** hasta que lo indique. Tampoco autoriza merge, migraciones en Supabase, VPS, Fleetia ni despliegue. [Continuidad S42-6](../handoffs/SESSION_42_HANDOFF_2026-11-17.md) y [tablero §117](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).

### S43 — modalidad inicial candidata, separada de V2 (19-11-2026)

Tras preflight real S43-3b (origen sin esquemas, roles ni ledger), el propietario autorizó desarrollar la recuperación inicial. El modo `capture-preinstall` recibe exclusivamente un plan JSON protegido con seis campos: schema=sabora-preinstall-backup/v1, backupId, repository=jdlc86/CartaViva, sourceProjectRef=byhvmumqivmunkmomhup, releaseSha (HEAD exacto y árbol tracked limpio), plannedMigrationTreeSha256 (digest completo del inventario auditado previsto, **no aplicado**). Comparte psql absoluto aprobado, TLS verify-full directo, huella CA/identidad clúster independientes, clave externa y custodia protegida de V2. No admite SQL/args del operador ni pg_dump de esquemas ausentes. Consulta catálogos con transacciones READ ONLY antes/dentro/después del snapshot; exigir exclusión operativa de DDL/roles durante captura, los tres cortes no sustituyen esa exclusión. Rechaza objetos/roles/membresías Sabora o prefijados, identidad discordante, PG distinto de 17 o pgcrypto ausente en extensions. No inspecciona datos gestionados ni acredita ausencia de todo objeto arbitrario fuera del ámbito/nombres de Sabora.

El directorio contiene exactamente `manifest.json` e `initial-state.aesgcm`; AES-GCM autentica metadatos y catálogo inicial. Replicación existente permite ambas clases; `verify-preinstall <directorio absoluto> <plan absoluto>` autentica en memoria, compara SHA y digest previstos y devuelve restoreValidated=false. No se produce dump falso ni ledger fabricado. El modo `capture` V2 sigue exigiendo 4 componentes y ledger real completo. `inspect` solo hashes, no prueba de clave. Ensayo CI añadido al laboratorio PG17 existente: copia de origen limpio, dos réplicas fixture, borrado de staging, autenticación externa, clave errónea, digest erróneo, corrupción, parcial commit con DDL/rol/datos/ledger y siguiente transacción fallida, rechazo y recuperación de objetos concretos exclusivamente del fixture, roles/objeto fuera de esquema, comparación de estado inicial. Se conserva restore completo V2. **No constituye restore real ni procedimiento de borrado en Supabase.** Antes de SQL: aprobación segregada de captura, equipo/ACL/custodia, exclusión DDL, dos copias íntegras, autenticación desde la externa y ensayo de recuperación parcial fuera del VPS, evidencia DBA aplicable. Si origen no inicial: STOP; no se permite recurrir al modo inicial. Ante instalación operativa parcial, no ejecutar DROP de fixture, reset ni revertir ledger; STOP y decisión DBA individual. No se cambia normativa ni se autoriza migración/host/deploy. Candidato pendiente CI.

**Preparación del plan (solo tras autorizar el equipo/captura):** checkout limpio del SHA aprobado; obtener su SHA mediante git rev-parse HEAD y el digest previsto con la función currentAuditedMigrationTreeSha256() exportada por scripts/ops/sabora-encrypted-backup-cli.mjs. Guardar JSON fuera de checkout con modo/ACL protegidos. ID de copia único, scope exacto y fecha/identidad observada se autentican. Invocación: node scripts/ops/sabora-encrypted-backup-cli.mjs capture-preinstall <plan absoluto> <staging absoluto nuevo>; replicate-offsite <staging> <destino nuevo>; verify-preinstall <externa> <plan> exige la misma huella independiente de clúster vía SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER, el ID de copia y SHA/digest exactos. La réplica VPS requiere permiso de infraestructura separado. No se registran claves ni valor de cluster en logs públicos; el expediente autenticado queda en custodia privada. Las respuestas iniciales de réplica/inspect identifican backupSchema y restoreValidated=false, nunca una copia operativa V2. No ejecutar contra el proveedor mientras los controles y la recuperación real no estén aprobados; la CI candidata no constituye aprobación.
