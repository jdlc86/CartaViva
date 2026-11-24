# Sabora · cierre técnico del primer despliegue ficticio S51

**Dictamen operativo: NO-GO para emitir la orden de primer deploy.** El hito prepara una única ruta V2. El candidato requiere integración expresa, los checks y el paquete del nuevo push a `main`, y la finalización material de los pasos de operador recogidos aquí. El propietario realizará la aceptación funcional y visual. [Encargo](https://github.com/jdlc86/CartaViva/blob/31f643fab19e0ac8aa941aa468fa5b6633b96448/docs/assignments/CODEX_S51_PRIMER_DESPLIEGUE_CIERRE_OPERATIVO_2026-11-24.md) · [Contrato V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md) · [Continuidad S51](../handoffs/SESSION_51_HANDOFF_2026-11-24.md).

## Evidencia reutilizada y punto de partida

| Evidencia | Resultado comprobado |
| --- | --- |
| `main` protegido | `da02d5d97c3eb26d4c1530e0b0c4c4f7a14012d7`. PR #90 y #91 integrados. Ruleset activa sin bypass, PR obligatorio, controles de borrado y force-push. [Regla](https://github.com/jdlc86/CartaViva/rules/27933106) |
| Laboratorio en el SHA base | `validate` y `web-publication` SUCCESS. PostgreSQL 17, Docker/SSH, TLS y Chromium en los circuitos existentes. [CI](https://github.com/jdlc86/CartaViva/actions/runs/45479878642) |
| Checks exactos de main | `generate-lockfile` y `functional-ui-gate` SUCCESS. Los opt-in CV005+B2 y aceptación visual final carecen de PASS operativo. [Evidencia](https://github.com/jdlc86/CartaViva/actions/runs/45479878590) |
| Paquete API/web **base** | Artefacto `14962245054`, 88.025.914 bytes, sha256 `fa39d95dea482b2846dbec53cb7281e7b9a11279f646c5a21a4ba7650f80d257`, generado por push. Código público `SABORA_00`. [Artefacto](https://github.com/jdlc86/CartaViva/actions/runs/45479878642/artifacts/14962245054) |
| Controlador **base** | Artefacto `14960724478` descargado. Los 32 hashes del inventario coinciden. SHA256 del manifiesto `492b2f3da8fbadfa0daa41d600ce8c7701aaf0859a931b6127312169213ab3e2`. El nuevo candidato empaqueta los dos ELF de producción en el mismo circuito de CI, compilados desde las fuentes del artefacto y con digests independientes de los ELF de fixture. [Artefacto base](https://github.com/jdlc86/CartaViva/actions/runs/45479878642/artifacts/14960724478) |
| Plan V2 **base** | Despacho manual de `plan` por `jdlc86` sobre el SHA exacto. `verify=SUCCESS`, `execute=SKIPPED`. El SHA posterior a la integración precisa su propio plan. [Plan](https://github.com/jdlc86/CartaViva/actions/runs/45502216753) |
| Genesis SQL | El árbol de las 103 migraciones coincide en el SHA base y `fa1759a001d76c0cdf8af26a71c5e301d2230653` (`634d7e863554ba4d5704275164abbd30213d16b7`). El recibo protegido sigue en su ruta original y su SHA256 real es `846cd09d8c2acf069d90113e83344d391b892249f3ab35cdb8c0e41085eff075`. La evidencia previa registra el ledger exacto, TLS verify-full, los 23 LOGIN y los 2 LISTEN. [Continuidad S51](https://github.com/jdlc86/CartaViva/blob/706ca2027f71c8faa463263141338788d3b7b12a/docs/handoffs/SESSION_51_HANDOFF_2026-11-24.md) |

## A–D · comprobaciones y pendientes

| Etapa | Hecho o verificado | Puerta restante |
| --- | --- | --- |
| A. Runtime y red | Inventario de 27 ficheros root:10002/0640, padre privado y directorio 0750. Tres redes exclusivas sin endpoints y tabla ingress existente. TLS de origen pareado, SAN de los dos hosts, ACL nominativas base y vigencia hasta 2041. 8443 libre. Resolución pública IPv4 y traza Cloudflare de ambos hosts desde el VPS. | Cerrar la lista de destinos con el receptor definitivo, aplicar y probar la tabla egress Sabora con autorización específica. Cotejar ledger vivo y construir los ficheros definitivos desde la evidencia previa. |
| B. Receptor y acceso | Implementación de un Worker exclusivo con Durable Object SQLite. Prueba local de integridad del ACK, persistencia previa al ACK, replay, rechazo de origen, tamaño, caducidad, retención, límites y fallo de escritura. El VPS sale como `146.59.145.64` en ambos dominios. | Publicar el Worker autorizado y probar HTTPS real. Instalar la regla WAF de 8443 con las IP del propietario/operador y probar acceso positivo y negación. Chrome está deshabilitado en Work y no hay conector Cloudflare en esta sesión. |
| C. Controlador y GitHub | `installation.json`, config, CA de origen, activación, política egress, runtime.env, cuenta release, sudoers y binarios ausentes. Almacenamiento de autorización, estado, staging y bundles privado y vacío. Ausentes los tres contenedores Sabora nominados y el marcador genesis. `sabora-live` ausente en la consulta a GitHub. | Instalar desde los artefactos del SHA integrado y mediante el canal aprobado por el operador. Configurar y verificar el Environment exclusivo, con rama `main` y credenciales SSH de Sabora. |
| D. Admisión y operación | El cambio aprobado exige `twoPwasValidated=false` y `operationalBootstrapVerified=false` en genesis, junto a los dos valores de recuperación. Las doce evidencias materiales previas se siguen exigiendo. La CI reutiliza PG17/TLS y Docker/SSH. | Revisar e integrar el candidato. Correr un solo plan V2 en el SHA de main definitivo. Obtener la autorización de deploy del propietario. Arranque real, postchecks, salud registrada por el controlador y aceptación del propietario pendientes. |

Inspecciones VPS de solo lectura, Gateway `job_01M87TBX2000053M8YGBSEJ2EE`, `job_01M87TKMSN00CVHFMCNQN9M4KN` y `job_01M87TZ5SH00FDJ4TA1AQ9BK7A`. Se consultaron solo nombres, rutas, reglas y redes Sabora y los destinos exactos del contrato. No hubo acciones sobre Fleetia ni se repitieron migraciones, se rotaron secretos o se iniciaron servicios.

Verificación dirigida local del candidato: 14/14 pruebas de admisión, configuración, política del controlador y receptor. El generador validó 23 slots, 2 notifiers y 2 destinos internos de pasarela. El receptor se ensayó con SQLite local y un adaptador de almacenamiento de laboratorio. La comprobación Cloudflare/TLS del Worker requiere su publicación autorizada.

**Frontera funcional del bundle.** `apps/management/src/main.tsx` monta el modo de diseño por defecto. La exportación `mountAuthenticatedManagementApp` conecta las operaciones ya implementadas, y los ensayos Chromium la montan con una identidad aislada. El entrypoint estático publicado carece de adquisición de sesión de personal. `apps/client/src/main.tsx` habilita la llamada únicamente bajo `MODE=test`. Un postcheck de archivos y TLS puede verificar ambas superficies con esa limitación. La opción sometida al propietario para este ensayo conecta el montaje existente a una sesión real del Supabase RESTAURANTE en memoria, con clave pública y verificación de roles en la API, y habilita la llamada bajo el perfil ficticio. Hasta aplicar y probar esa decisión, el recorrido completo de gestión y la llamada del cliente quedan pendientes.

## Secuencia del operador autorizado

### 1. Fijar SHA, paquete y SQL existente

Desde un checkout de operador con credenciales GitHub ya custodiadas, tras la integración autorizada del candidato.

```bash
set -euo pipefail
repo=jdlc86/CartaViva
git fetch origin main
sha=$(git rev-parse origin/main)
test "$sha" = "$(git rev-parse HEAD)"
test "$sha" = "$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha)"
test "$(gh api "repos/$repo/branches/main" --jq .protected)" = true
genesis=fa1759a001d76c0cdf8af26a71c5e301d2230653
test "$(git rev-parse "$sha:supabase/migrations")" = "$(git rev-parse "$genesis:supabase/migrations")"
test "$(git ls-tree -r --name-only "$sha" supabase/migrations | wc -l)" = 103
gh api "repos/$repo/commits/$sha/check-runs" \
  --jq '.check_runs[] | select(.app.slug=="github-actions") | [.name,.status,.conclusion,.details_url] | @tsv'
gh run list --repo "$repo" --commit "$sha" --branch main --event push --workflow ci.yml \
  --json databaseId,headSha,event,status,conclusion,url
```

Seleccionar el run de ese push concluido SUCCESS. Enumerar metadatos con `gh api "repos/$repo/actions/runs/$run/artifacts" --jq '.artifacts[] | [.id,.name,.size_in_bytes,.digest,.expired]'`. Descargar los dos artefactos por nombre en directorios nuevos. Registrar el digest del ZIP devuelto por GitHub, cotejar sus bytes mediante el canal aprobado y verificar hashes internos antes de extraer/usar. El paquete de release se transporta una sola vez por V2. El instalador usa el artefacto de fuentes y ELF exactos, sin reenviar el bootstrap de cuarentena. `node scripts/ci/sabora-release-controller-artifact.mjs "$reference" "$sha"` reconstruye la referencia desde blobs y `diff -rq -- "$stage/controller-artifact" "$reference"` verifica todo el inventario. `(cd "$stage/controller-launchers" && sha256sum -c SHA256SUMS)` verifica los ELF y su lista exacta. El run vigente del nuevo SHA sustituye los dos artefactos base de la tabla.

Por el canal DBA ya autorizado de solo lectura, comprobar que el ledger vivo conserva 103 filas, versiones, nombres, digests exactos y `application_count=1`. Cotejar el digest canónico `af02a33a5595a7f95c809631e793450be67cd743a573d9c3271f0b20d13a35e5` y el manifiesto `341d7b12a15bcf369f9f36353f11b27d64a58d4cfce2ccf5204969c84f6d3528`; el helper `manifestReceipt` de `scripts/ci/sabora-s46-dba-readonly.mjs` calcula el segundo desde el checkout exacto. El recibo original permanece en `/var/lib/sabora-release/evidence/sql-genesis-fa1759a001d76c0cdf8af26a71c5e301d2230653.json`. Su valor de `runtimeHmacValidated=false` describe el momento original. Conservarlo. El binding V2 usa los cuatro digests cotejados y el nuevo SHA.

### 2. Receptor y acceso antes de publicar la aplicación

En la cuenta Cloudflare autorizada, constatar que el nombre `sabora-alert-receiver` está libre o pertenece exclusivamente a esta instalación. Usar un Wrangler autenticado y autorizado, desde el checkout exacto, con el hostname `workers.dev` de esa cuenta. El receptor solo recibe SHA, correlación, fecha y esquema. Las credenciales de la aplicación quedan en su custodia habitual.

```bash
# CF_WORKERS_HOST se obtiene de la cuenta autorizada, con el dominio completo del Worker.
test -n "$CF_WORKERS_HOST"
wrangler deploy --config deploy/sabora-alert-receiver/wrangler.toml \
  --var "RECEIVER_HOST:$CF_WORKERS_HOST" --var "SABORA_SOURCE_IPV4:146.59.145.64"
alert="https://$CF_WORKERS_HOST/release-postcheck"
```

El Durable Object registra únicamente correlación, SHA, hash de bytes y recepción. Devuelve `200` tras confirmación de escritura, un replay conserva un solo registro y recibe `409`, y el fallo de persistencia devuelve `503`. Retención de siete días con limpieza por alarma, 256 recepciones conservadas, 12/minuto, máximo 1.024 bytes. Para el primer ACK real, ejecutar una solicitud desde la red egress de Sabora con un evento fresco construido mediante `stableStringify` del gobernador y verificar con `verifyAlertReceptionV2` del controlador. Reenviar esos mismos bytes enseguida y exigir `409`; desde una IP ajena exigir `403`. Confirmar TLS con raíces públicas, un evento caducado `400` y acceso HTTPS sin usar `-k`. Usar una correlación nueva en cada sonda legítima. Registrar solo hora, correlación, SHA y hash de ACK. [Storage SQLite y confirmación de escrituras](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

Crear una sola regla WAF **Block** para las IP aprobadas. Sustituir `IP_PROPIETARIO` e `IP_OPERADOR` por sus IP públicas exactas, incluir `146.59.145.64` para la sonda del VPS y preservar las reglas ajenas. La expresión se aplica a todas las rutas, incluidas las de API.

```text
(http.host in {"sabora.allaiso.com" "gestion-sabora.allaiso.com"} and cf.edge.server_port eq 8443 and not ip.src in {146.59.145.64 IP_PROPIETARIO IP_OPERADOR})
```

Verificar DNS de los dos nombres, puerto de borde, configuración TLS Full (strict) aplicable a los dos nombres y sin cambios de zona global. Desde una IP externa distinta, exigir denegación tanto de `/` como de `/api/v1/catalog` en ambos hosts. Tras arrancar, desde las IP permitidas exigir `200` para cada PWA y su manifest/SW. Verificar denegación desde fuera apuntando al origen mediante `curl --resolve "sabora.allaiso.com:8443:146.59.145.64" --cacert "$origin_ca"`. La sonda directa de origen del controlador corre desde el VPS por su propio socket; la sonda pública usa TLS normal, IP permitida y evidencia Cloudflare. Revisar que el WAF no se salte por reglas precedentes. [Puerto 8443 y limitación de Access](https://developers.cloudflare.com/fundamentals/reference/network-ports/) · [Condiciones WAF por puerto](https://developers.cloudflare.com/waf/custom-rules/use-cases/require-specific-http-ports/).

### 3. Egress, reserva y runtime

| Recurso exacto | Bridge | Red y puerta |
| --- | --- | --- |
| `sabora_sabora_runtime_internal` | `br-fd16e15a2445` | `172.28.238.0/24`, `.238.1`, interna |
| `sabora_egress_filtered` | `br-36905d725019` | `172.28.239.0/24`, `.239.1`, externa |
| `sabora_ingress_filtered` | `br-137dc2612783` | `172.28.240.0/24`, `.240.1`, externa |

Antes de cambiar nada, cotejar el ID, subred, bridge, etiquetas, opciones y endpoints con `docker network inspect` de esos tres nombres y disponibilidad TCP8443 con `ss -H -lnt 'sport = :8443'`. La reserva independiente requiere inventario de asignaciones activas e inactivas y rutas. Usar el registro de asignaciones autorizado y cotejar colisiones sin enumerar recursos de proyectos ajenos. Conservar las tres redes. El override de release declara externa la red interna de Compose, por lo que se reutiliza su ID.

Resolver con `getent ahostsv4` desde el VPS los destinos exactos. En la inspección, SQL dio `18.196.8.182`, `3.65.151.229`, `3.71.225.44` (solo TCP5432) y el hostname del JWKS `byhvmumqivmunkmomhup.supabase.co` dio `104.18.38.10`, `172.64.149.246` (solo TCP443). Añadir únicamente IPv4 actuales del Worker (TCP443) cuando exista. El DNS sigue el resolvedor dedicado Docker del namespace y la política de red no abre puertos de salida genéricos. Si cambia una resolución, la política anterior deniega la nueva IP. Actualizar lista y digests bajo permiso del operador, volver a comprobar TLS y en ningún caso abrir CIDR generales.

```bash
# allowlisted.json contiene solo {protocol:"tcp",cidr:"<IPv4>/32",port:5432 o 443}, sin duplicados.
node --input-type=module - "$allowlisted" <<'JS' > "$private_stage/egress.nft"
import {readFileSync} from 'node:fs';
import {renderSaboraEgressGuard} from './scripts/ci/sabora-egress-network-policy.mjs';
const allowlisted = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!allowlisted.every(e => e.cidr.endsWith('/32') && [443,5432].includes(e.port))) process.exit(1);
process.stdout.write(renderSaboraEgressGuard({bridge:'br-36905d725019', allowlisted}));
JS
nft --check --file "$private_stage/egress.nft"
# Operador, solo bajo autorización expresa para esta tabla y si sigue ausente:
nft --file "$private_stage/egress.nft"
nft -j list table inet sabora_ingress_guard > "$private_stage/ingress-live.json"
nft -j list table inet sabora_egress_guard > "$private_stage/egress-live.json"
```

Desde una sonda temporal aprobada exclusiva de Sabora conectada solo al bridge egress, verificar que TLS con nombre y CA correctos alcanza el pooler (PG TLS verify-full), que JWKS responde y que el Worker confirma persistencia. Verificar rechazo de un destino no permitido que sí responda desde el host y de conexión entrante al namespace. Comparar reglas/counters de la tabla de Sabora y detener si la sonda adjunta un recurso inesperado. Asegurar salida del fixture y cero endpoints en los tres bridges antes de instalar. La combinación `canonicalNft` y `sha256(stableStringify(...))` obtiene el digest semántico para cada tabla. `networkPolicy` lleva `networks` con `runtime/ingress/egress` y `{bridge,cidr,gateway}`, los CIDR Cloudflare cotejados, `allowlisted` y ambos digests `nftSha256`. La reserva root-owned lleva `schema=sabora-allocation-reservation/v1`, `project=sabora`, `host=146.59.145.64`, `port=8443`, `scope=all-active-and-inactive-allocations-and-routes`, `observedAt`, `exclusiveUntil`, `networkNames`, `networkIds` y `networkPolicySha256`. La autorización de red y las pruebas materiales preceden a su generación.

Usar el inventario privado de referencias `/var/lib/sabora-release/dba-s51/runtime-provision-inventory.json` y los 27 archivos ya provisionados. La evidencia previa para `jwtHmacIdentityVerified` combina JWKS RS256 y keyring en vigor, identidades y permisos observados, más las pruebas de ejecución exacta. La prueba HMAC/API de arranque queda en postcheck. Para los doce campos de admisión, registrar CI revisada (conformidad, cliente y operaciones de personal), integridad de migraciones, mínimo privilegio SQL, secretos provisionados, JWT/HMAC, TLS/egress, aislamiento, observabilidad, sonda efectiva de alerta y autorización expresa exacta del propietario. Para cada valor conservar su evidencia. Una vez materializados esos requisitos, generar el candidato con este comando sin argumentos secretos.

```bash
node scripts/ops/sabora-s51-first-test-runtime.mjs \
  /var/lib/sabora-release/dba-s51/runtime-provision-inventory.json SABORA_00 \
  "$private_stage/admission-evidence.json" "$private_stage/runtime"
```

El generador verifica los 23 slots, 2 notifiers, hosts, puertos de pasarela, referencias, credencial HMAC vigente y los doce valores previos. Escribe `activation.json`, `egress-policy.json` y `runtime.env`, sin leer secretos. El proveedor de pagos permanece deshabilitado por el runtime.

### 4. Instalación V2 y Environment

El operador ya autorizado compara el artefacto exacto y su inventario antes de publicarlo. El host es Linux x86-64 glibc 2.43, con Compose 5.5.1 y sin compilador C. Usar Node 22 autónomo Linux x64 del proveedor, verificado con publicación oficial y hash, y el plugin Compose aprobado, copiado a la ruta privada. Aceptar los dos ELF del circuito GitHub acordado solo si el canal de instalación admite ese artefacto exacto. Ante un rechazo de transferencia, detener esa acción. Instalar solamente en los padres verificados y sin otros procesos activos de Sabora, con rutas destino ausentes o vacías y modos/ACL cotejados.

| Ruta final | Propiedad/modo y fuente |
| --- | --- |
| `/etc/sabora/release/code` | root:root, directorios 0755, archivos 0644, árbol exacto `controller-artifact`, publicación mediante renombre desde staging del mismo FS |
| `/etc/sabora/release/bin/{node,root-entry,ssh-entry}` | root:root 0755, Node y los dos ELF de producción verificados, sin setuid |
| `/etc/sabora/release/docker-config/cli-plugins/docker-compose` | root:root 0700 bajo padres privados |
| `/etc/sabora/release/origin-ca.pem` | root:root 0600, CA oficial que valida el certificado de origen ya instalado en ambos nombres |
| `/etc/sabora/runtime/activation.json` | root:10002 0640, fichero candidato de activación del paso 3 |
| `/etc/sabora/runtime/egress-policy.json` | root:root 0444, fichero candidato del paso 3 |
| `/etc/sabora/release/runtime.env` | root:root 0600, fichero candidato del paso 3 |
| `/var/lib/sabora-release/controller/allocation.json` | root:root 0600, reserva contrastada del paso 3 |
| `/etc/sabora/release/controller.json` y `installation.json` | root:root 0600, publicar al final desde ficheros derivados y verificados |

Para `controller.json`, usar `schema=sabora-controller-config/v2`, `environment=production`, SHA256 de los dos Compose del paquete (`compose.operational/web`), política y reserva del paso 3, `runtimeEnvSha256`, `mountHashes={manifest,egress,secrets}` con mapa completo de los 27 digests calculados localmente, `tls={certificateSha256,keySha256,originCaSha256,publicCaSha256:null}`, `alert={url:alert}`, `quotaBytes` reservado en disco y `sqlGenesisSha256` del recibo exacto. En `expected`, asignar los valores validados del recibo `sourceSystemIdSha256`, `databaseTlsIdentitySha256`, `migration.manifestSha256`, `appliedLedgerSha256` y `catalogSha256` a `databaseIdentitySha256`, `databaseTlsIdentitySha256`, `migrationTreeSha256`, `appliedLedgerSha256` y `initialCatalogSha256`, respectivamente, más `networkPolicySha256` y `allocationReservationSha256`. `sqlGenesisBinding` debe llevar `schema=sabora-genesis-release-binding/v1`, `sourceSha=genesis`, `releaseSha=sha`, `migrationManifestSha256`, `appliedLedgerSha256` y `sqlResultSha256`. Mantener confidenciales los mapas privados de hashes de secretos.

Derivar el manifiesto desde los archivos instalados. Ejecutar la verificación en un proceso independiente antes de habilitar credenciales. Los módulos operativos solo leen y verifican durante estas comprobaciones.

```bash
/etc/sabora/release/bin/node --input-type=module - <<'JS' > "$private_stage/installation.json"
import {deriveControllerInstallationManifestV2 as derive}
  from '/etc/sabora/release/code/scripts/ops/sabora-release-installation-v2.mjs';
process.stdout.write(JSON.stringify(derive()) + '\n');
JS
install -o root -g root -m 0600 "$private_stage/installation.json" /etc/sabora/release/installation.json
/etc/sabora/release/bin/node --input-type=module - <<'JS'
import {verifyControllerInstallationV2 as verify}
  from '/etc/sabora/release/code/scripts/ops/sabora-release-installation-v2.mjs';
import {verifyRuntimeMounts} from '/etc/sabora/release/code/scripts/ops/sabora-release-runtime-permissions.mjs';
import {verifyTlsMaterial} from '/etc/sabora/release/code/scripts/ops/sabora-release-readiness.mjs';
import {inspectLocalIsolation} from '/etc/sabora/release/code/scripts/ops/sabora-release-local-inspector.mjs';
import {releaseProcess} from '/etc/sabora/release/code/scripts/ops/sabora-release-process.mjs';
const {config,reservation,sourceSha} = verify();
verifyRuntimeMounts(config,releaseProcess,{requireGenesis:true});
verifyTlsMaterial(config.tls);
inspectLocalIsolation({run:releaseProcess,policy:config.networkPolicy,reservation});
process.stdout.write(JSON.stringify({sourceSha,installationVerified:true}) + '\n');
JS
```

Aprovisionar solo `sabora-release`, con home root-owned bajo `/etc/sabora/release`, shell compilada `/etc/sabora/release/bin/ssh-entry`, contraseña bloqueada y solo su grupo primario. Instalar una única clave pública nueva propia, con `restrict,command="/etc/sabora/release/bin/ssh-entry"` bajo el `AuthorizedKeysFile` efectivo. Comprobar antes con `sshd -T -C user=sabora-release,host=146.59.145.64,addr=146.59.145.64` la compatibilidad del listener existente con esta cuenta y la ausencia de métodos alternativos para ella. Si no es compatible, STOP. Mantener el listener compartido sin cambios. Validar el archivo `deploy/sabora-release-sudoers.conf` con `visudo -cf` antes de instalarlo en `/etc/sudoers.d/sabora-release` (0440). Revisar `id sabora-release` y `sudo -l -U sabora-release`. Probar por el canal autorizado que un comando ajeno como `id` falla, sin invocar Docker. Comparar la pública del host con una huella de fuente independiente y llevar la privada exclusiva de conexión a los secretos del Environment mediante custodia autorizada.

Crear `sabora-live` mediante el propietario GitHub, con política de ramas seleccionadas cuyo único patrón sea `main`. Verificar el Environment y su lista de deployment branch policies con `gh api "repos/$repo/environments/sabora-live"` y `gh api "repos/$repo/environments/sabora-live/deployment-branch-policies"`. Instalar como secretos del Environment `SABORA_SSH_KEY_B64` y `SABORA_SSH_KNOWN_HOSTS_B64`. Verificar nombres con `gh secret list --repo "$repo" --env sabora-live`. Solo con todas las pruebas completadas, fijar `SABORA_RELEASE_AGENT_READY=explicitly-provisioned-v2` en ese Environment.

### 5. Plan, autorización y primera prueba

El propietario puede ejecutar el plan de solo lectura por Issue con título `[sabora] release plan <SHA40>` y cuerpo vacío, usando el SHA exacto del paso 1. En el run gobernado, verificar `verify=SUCCESS` y `execute=SKIPPED`. El plan no abre sesión SSH. Tras cerrar los bloqueantes y obtener el consentimiento específico, generar el título definitivo para el propietario con `printf '[sabora] release deploy %s\n' "$sha"`. Crear exactamente un Issue con ese título y cuerpo vacío. El cierre del Issue acredita despacho, y el registro durable del controlador acredita el resultado.

Tras el deploy, comprobar los tres servicios Sabora por nombre en `docker container inspect`, el estado Docker healthy para API y web, y la sonda real de egress. Correlacionar el recibo del controlador con ese run, SHA, 103 migraciones originales, `/ready` real, TLS directo y público, manifiestos/SW de ambas PWA y ACK real. Ante fallo o resultado desconocido, conservar lock, ledger, reservas y recibos y reconciliar antes de actuar. La excepción S46 se consume una vez, mantiene `backupPerformed=false`, `restorePerformed=false`, `realUsersAllowed=false` y no permite segundo release ni rollback.

- **Cliente** · [PWA Sabora](https://sabora.allaiso.com:8443). Probar acceso desde IP permitida, perfil de prueba, QR de mesa, carta, pedido, cuenta y llamada al camarero.
- **Gestión** · [PWA Gestión Sabora](https://gestion-sabora.allaiso.com:8443). Probar acceso autorizado de personal ficticio, cocina y sala, transiciones, catálogo y circuito económico permitido. El propietario recibe las credenciales ficticias por el canal de custodia autorizado. La aceptación del propietario se registra aparte de la salud del controlador.

## Dictamen y bloqueantes accionables

**Técnico:** integrar solo tras revisión y CI verde del candidato. **Operativo: NO-GO.** Antes de emitir el Issue de deploy se debe completar una única secuencia con los responsables autorizados.

1. Integrar el candidato y fijar SHA/checks/paquetes del push exacto.
2. Publicar receptor y regla de acceso aprobados y acreditar sus resultados. Entregar la prueba de personal ficticio autorizada y los datos de prueba mínimos.
3. Cerrar egress y reserva, cotejar el SQL existente, instalar y verificar runtime/controlador y habilitar `sabora-live` con credenciales propias.
4. Verificar plan exacto y obtener la autorización de deploy del propietario. Registrar postchecks reales y entregar las dos PWA para aceptación.
