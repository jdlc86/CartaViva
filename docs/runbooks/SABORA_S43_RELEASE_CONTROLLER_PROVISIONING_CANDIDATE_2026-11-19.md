# S43 — provisioning/operación/recuperación candidata del controlador

**NO EJECUTADO. NO-GO operativo.** Este procedimiento requiere autorización posterior y revisión independiente del código final. No es un script de instalación automática. Mantiene íntegros el gate de autorización, release V1, CV005 DBA y runbook S40. [Diseño/amenazas/layout](../architecture/SABORA_S43_RELEASE_CONTROLLER_CANDIDATE_2026-11-19.md).

## Prerrequisitos y STOP

1. Fijar SHA fuente aprobado y firma de su artefacto/controlador; revisión independiente posterior, decisiones de hallazgos y compatibilidad de las rutas/custodia root frente al UID 10001 histórico. No cambiar `/srv/sabora` ni TLS antes de resolver esa decisión.
2. Captura real y dos custodias antes de SQL, según S40; después de instalación de datos, backup **V2 postinstalación**, dos réplicas/restauración externa y acta DBA CV005/ledger/TLS aplicables a activación. La copia inicial no satisface el expediente V2. No capturar/migrar desde este agente.
3. Reserva verificable de tres redes, bridges/CIDR sin colisión incluso inactiva, puerto y reglas exclusivas; políticas aprobadas con destinos/puertos concretos. No copiar direcciones/CA/keys del laboratorio.
4. TLS/SAN/cadena/par, receptor con ACK firmado aprobado, fingerprints de seis custodios, autoridad de reserva y receptor. Definir sujeto e identidades esperados, vigencia y procedencia documental. No usar hashes de placeholders.
5. Linux, Node 22 compatible, Docker/Compose compatible con `!override`, nft/ip/ss, sudo/OpenSSH y compilador de C para construcción reproducible. Fijar binarios/versiones/hashes; sin instalaciones/actualizaciones implícitas durante deploy.

## Construir y revisar el artefacto sin instalar

En un checkout del repositorio, con `SHA` completo revisado:

```text
node scripts/ci/sabora-release-controller-artifact.mjs <directorio-nuevo> <SHA>
```

El builder usa exclusivamente `git show SHA:path`; no empaqueta cambios de working tree, tests, fixture keys ni helpers de laboratorio. Produce `artifact.json` con el SHA y hashes de todos los archivos. Construir dos veces desde ese SHA debe dar los mismos bytes. Revisar el manifiesto y la clausura de imports. CI preserva el mismo artefacto fuente con el recibo del lab.

Compilar `deploy/sabora-release-shell.c` y `deploy/sabora-release-root.c` desde ese artefacto, con compilador aprobado, `-O2 -Wall -Wextra -Werror`. Reproducir en el mismo toolchain y registrar hashes de resultados. Son binarios normales, **sin setuid**. Registrar Node copiado, herramientas root y plugin Compose. La aprobación de instalación firma los hashes de binarios realmente construidos; el hash de una fuente C no demuestra por sí solo el binario instalado.

## Instalación futura por operador autorizado (manual, idempotente por comparación)

1. Preflight read-only de los nombres/rutas Sabora. Verificar resolución, ownership/ACL, ausencia de links/hardlinks, filesystem/espacio, root/TLS compatibles y cuenta exclusiva. Ante contenido existente distinto, STOP; no sobrescribir ni «reparar permisos» de recursos desconocidos.
2. Aprovisionar raíces y subdirectorios según tabla del diseño. Copiar a un directorio candidato nuevo, comprobar cada hash; publicar el árbol final solo con el release bloqueado y sin proceso activo. Si la instalación idéntica ya existe, comprobar y no reescribir. Estados parciales deben quedar sin autorización firmada hasta reconciliación.
3. Preparar Node y launchers en `bin`; Compose exclusivamente en `docker-config/cli-plugins/docker-compose`, directorios privados. Ningún usuario de app/SSH debe poder escribir. No usar symlink a runtime gestionado por un usuario.
4. Preparar usuario `sabora-release`, sin grupos suplementarios ni docker/sudo general, password no utilizable, home root-owned y shell compilada `bin/ssh-entry`. No usar nologin: impediría el forced-command legítimo. La shell nunca permite un login interactivo.
5. Instalar clave pública SSH exclusiva bajo home/root protegido, con una única línea `restrict,command="/etc/sabora/release/bin/ssh-entry" ssh-ed25519 ...`. Verificar que no haya otras keys, AuthorizedKeysCommand/certificados/RC/subsistemas/entorno que abran rutas alternativas. Validar sudoers con `visudo -cf`; regla exacta de la plantilla, NOSETENV, sin argv, sin wildcard. No conceder Docker directo.
6. **No editar/reiniciar sshd compartido.** El workflow vigente fija SSH/22. Solo puede usarse ese listener si su configuración efectiva existente y el account/key satisfacen los controles sin cambios globales. Si no, STOP y presentar al propietario una solución separada de listener/puerto/ACL/workflow. `sabora-release-sshd.conf` es plantilla para instancia dedicada previamente autorizada, no drop-in del daemon compartido. Lab usa localhost/22229; eso demuestra el mecanismo, no que puerto 22 operativo esté listo.
7. Redes preexistentes: `sabora_sabora_runtime_internal` (internal), `sabora_ingress_filtered`, `sabora_egress_filtered`, bridge exclusivo, attachable/ipv6 falsos, labels project sabora y `io.sabora.managed-by=release-provisioner-v1`. Identificadores reales entran en la reserva firmada. Nunca aprovisionar redes dentro de deploy.
8. Preparar tablas nominadas mediante generadores existentes y política aprobada; `nft --check` previo, snapshot únicamente de esas tablas, pruebas aisladas positivas/negativas/IPv6/reversa y rollback de provisioning ensayado. No flush, reglas globales, daemon ni reboot. Publicar el JSON semántico canónico y los expedientes independientes ligados a política/reserva. El scope de reglas debe quedar solo en los bridges propios.
9. Preparar mounts fijos, runtime.env sin rutas alternativas, TLS root con lectura acotada al UID/GID de web y claves CA aprobadas. `controller.json` se completa a partir de la plantilla **inválida por defecto**. Sus hashes vinculan el runtime/env/secrets/mounts a los sujetos de las attestaciones. No escribir identidades de clúster/secretos en Git.
10. Colocar los seis expedientes originales `<digest>.json`, reserva `controller/allocation.json`, claves de confianza y configuración. El propietario firma el payload canónico `sabora-controller-installation/v1`: repository, sourceSha, environment=`production`, artifactSha256, configurationSha256, nodeSha256, launcherHashes, toolHashes, approvedAt. Guardar wrapper `{payload, signature}` en `installation.json`, al final, tras verificar fingerprint del propietario por canal independiente. No generar esa firma en nombre del propietario.
11. Ejecutar únicamente preflight/ensayo autorizado con prueba negativa de instalación parcial, shell/forwarding y permisos. Conservar `SABORA_RELEASE_AGENT_READY` sin activar en este encargo. Una variable del workflow no sustituye instalación firmada ni permisos de operación.

## Operación posteriormente autorizada

Revalidar main, checks exactos y paquete de ese SHA. Firma de cada deploy/rollback nueva, con seis hashes y TTL <=1h; known_hosts fijo, usuario exclusivo, protocolo existente. Nunca reutilizar un ID, incluso si falló. Confirmar receipt final `healthy` y journal/history durable coincidentes; comprobar aceptación operativa por separado. No volver a enviar una operación si el SSH se cortó: primero consultar los registros autorizados y runtime, porque podría haberse consumido.

El rollback solo selecciona versión anterior healthy con bundle local retenido íntegro. No depende de la retención GitHub de siete días. No limpia imágenes ni toca SQL. Cuota alcanzada o falta de target: STOP y mantenimiento separado.

## Crash y reversión de provisioning

Un lock residual nunca caduca automáticamente. Antes de cualquier recuperación: comprobar que no hay proceso/controlador/Docker todavía actuando; leer consumo, journal, history, resultado, manifests y runtime nominados. `consumed/in-progress/unknown`, temporales o divergencia significan operación no determinada, aunque algunos contenedores respondan. Registrar diagnóstico, decisión del propietario y acciones exactas autorizadas. Conservar siempre los consumos y evidencia; no borrar archivos para permitir replay. El candidato no automatiza la reconciliación de un estado parcial porque faltaría una decisión normativa.

Reversión de una instalación candidata **aún no usada**: retirar solo su regla sudo y clave exclusiva tras aprobación; detener únicamente la instancia dedicada creada, si existe; restaurar tablas nominadas desde snapshot y retirar solo redes vacías cuya reserva/ID demuestre que creó el provisioning. Nunca `down`, prune, flush ni detener servicios ajenos. Si ya hubo release, conservar todo ledger/bundle y solicitar plan específico; desinstalar no revierte aplicación ni datos. No tocar daemon compartido ni recursos operativos desde este PR.

## Evidencia de pruebas y límites

`node --test tests/sabora-release-controller-policy.test.mjs` protege firmas/semántica y rechazo de fixtures en producción. `sabora-release-root-storage.test.mjs` exige Linux root desechable; fuera de ese entorno es SKIPPED explícito y se ejecuta de verdad dentro del job del controlador. El laboratorio único amplía el antiguo real-docker-lab: Compose firmado real, PWA real construida por web-publication, API/gateway fixtures, CA/sink/autoridades locales, SSH real, dos versiones, ledger y rollback. H6/PG17/HTTP/Chromium del mismo SHA siguen verificando producto; no se duplican ni se sustituyen con la API fixture.

La evidencia final son los jobs/logs/recibo del SHA exacto en el PR. Una ejecución fallida no es validación y una omisión no es PASS. No existe evidencia de instalación del VPS, DBA/backup reales, confianza de custodios, Cloudflare operativo o aceptación humana por haber pasado este laboratorio.

### S43 — preflight de identidades y permisos de lectura (candidato, no ejecutado)

Leer el apartado de custodia de [arquitectura candidata](../architecture/SABORA_S43_RELEASE_CONTROLLER_CANDIDATE_2026-11-19.md). Fijar UID/GID API 10002, egress 10003 y web 10001 en las imágenes/Compose aprobados; comprobar asignaciones/mapeo efectivo del motor sin operar recursos ajenos, reservar identidades o STOP. Instalar únicamente tras autorización separada. Incluye getfacl (/usr/bin/getfacl) en los hashes firmados de herramientas. No se requiere instalar software global durante release. Verificar el modo exacto y ACL de cada padre privado/mount, lectura exclusiva e inventario firmado, no almacenar valores/hashes de secret material en Git o CI. El controlador no cambia permisos. El padre /etc/sabora/runtime root:root 0700 protege los paths del host, API lee su manifest y secretos root:10002 0640, directorio 0750; gateway y API leen la misma política no secreta 0444 por bind individual RO. Web solo TLS root:10001 0640. /srv/sabora root:root 0700 es condición del candidato; exige resolver antes el estado histórico UID 10001 y autorización explícita del operador para convertirlo. No aplicar recursivamente cambios de ownership ni ACL. Tras provisioning verificar solo desde identidades/contenedores Sabora y sin mostrar contenido. Si la asignación, lectura, ACL, custodia o la normativa histórica no se pueden conciliar, STOP y resolver con el propietario. Refrendar configuración y release exactos; la CI de fixtures no sustituye la prueba de secrets reales.

### S43 — sujeto de expedientes y comprobación de publicación

Después de completar la configuración candidata fuera de Git, derivar expected.subjectSha256 con deriveInstallationSubject(config) del módulo autenticado sabora-release-installation.mjs; se excluye solo el propio campo subjectSha256. Los seis custodios deben validar los sujetos/materiales reales antes de firmar esa referencia y el SHA exacto de release. Todas las nueve claves SPKI distintas; reviewerIdentitySha256 es el fingerprint de clave del custodio de revisión, sin sustituir comprobar independencia real. No construir firmas/actas ficticias ni exponer configuración o sus hashes sensibles. El controlador verifica SAN exacto, par y >7 días de vigencia, además de digests de las seis rutas estáticas de ambas PWA en origen y publicación. Si la ruta pública transforma/reescribe/cachea bytes, STOP y diagnóstico de la configuración Sabora-only; no modificar Cloudflare compartido. Ver informe de revisión interna, no prueba de custodia real ni autorización.


### Adenda S45: modalidad temporal de primera activación

Véase decisión normativa [metodología V1](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md). Sustituye exigencia de independencia exclusivamente para primera activación, previa aprobación expresa del informe exacto y firma propietaria. Campo `reviewEvidenceSha256`, modo firmado `internal-first-activation` y `ownerDecisionSha256`; independiente permanece modalidad ordinaria. No confundir con custodia separada, evidencia real ni autorización de infraestructura. Mantener resto de controles y orden §4–5.


### Adenda S46 — secuencia prioritaria sin nuevo VPS ni PC

Por [decisión normativa S46](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), para la primera activación de prueba se aplazan captura/restore pre-SQL y V2/restore post-SQL; no se instalan receptor ni claves de backup ahora. No hay copia acreditada ni recuperación operativa. 1) integrar candidato y CI exact-main; 2) autorización y preflight DBA real inicial de solo lectura, catálogo original y wrapper firmado sabora-initial-empty-preflight/v1 antes de cualquier SQL, alcance vacío Sabora, identidad/TLS/PG17, exclusión DDL/roles concurrentes; 3) autorización SQL específica del árbol exacto e instalación append-only con STOP ante parcialidad, acta final con comprobaciones de privilegios/ledger/HMAC/TLS, tiempos e inclusión del wrapper original; 4) acto de aplazamiento firmado con digest canónico de preflight y decisión propietaria, sin copia/restauración ficticia, en externalRestoreSha256 con modo deferred-first-test-activation; 5) preflight/instalación del controlador y redes, TLS, secretos, alertas y custodia según contratos existentes, cada fase autorizada; 6) autorización firmada exacta, despliegue y recorrido de las dos PWA con acceso controlado y datos ficticios. Conservar resto de gates. No rollback posible sin versión previa healthy. No reset, DROP o reescritura de ledger tras fallo. Siguiente release y usuarios reales STOP hasta restaurar política ordinaria. No operar Fleetia ni recursos ajenos.
