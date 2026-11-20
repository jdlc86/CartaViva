# S43 — controlador de release, diseño candidato implementado

**Propuesta, no normativa ni permiso de instalación. NO-GO operativo.** Alcance: encargo S43 fijado en `96160d5b87642dfc6725138ef6689f9674ad0d57`, sobre main `861a11e4eb6bd5ad46c22bce65ff74dc11c44027`. Un restaurante; ninguna modificación de producto, SQL, backup, cobertura UI o aprobación visual. La revisión independiente final requiere una orden posterior. Este texto describe implementación y límites; la evidencia de ejecución del SHA final se publica en el informe del único PR Draft.

## Ruta y autoridad

`sshd → shell dedicada en C → sudo con argv fijo → launcher C root → root-entry → router instalado → verificación de instalación → controlador → núcleo existente + driver real`.

La shell no interpreta cadenas: acepta únicamente `-c /etc/sabora/release/bin/ssh-entry`, copia `SSH_ORIGINAL_COMMAND` como una línea acotada y transmite stdin. No es setuid. La regla sudo permite solo `/etc/sabora/release/bin/root-entry ""`, sin argumentos y NOSETENV. El launcher root borra el entorno y ejecuta una copia concreta de Node y una entrada fija. No hay parámetro de producción para escoger módulos, ejecutables, rutas, keyring, entorno de laboratorio o driver. El proceso limita tamaño/tiempo, redirige errores a códigos saneados y nunca imprime env/Compose/secrets.

El router diagnóstico anterior y `authorizeHostOperation()` conservan su STOP. La nueva función `executeInstalledHostRequest()` solo entra con instalación verificada. Invocar funciones de biblioteca desde un proceso sin privilegios no eleva privilegios ni sustituye la autorización del transporte.

La instalación exige firma Ed25519 del propietario, SHA fuente, hash del manifiesto de artefacto, configuración, Node, launchers compilados y herramientas (incluido el plugin Compose copiado a una ruta exclusiva). El artefacto enumera exactamente los ficheros instalados; archivos extra, cambios, enlaces o padres escribibles provocan STOP. La confianza inicial es la clave pública/fingerprint instalada por el operador autorizado, no una clave recibida por SSH. Root y el daemon Docker pertenecen al TCB: un administrador root malicioso está fuera de lo que puede proteger este agente.

## Layout candidato

| Ruta | Custodia y finalidad |
| --- | --- |
| `/etc/sabora/release` y `bin` | root, 0755 para atravesar la shell; configuración y claves 0600; ningún grupo de app/SSH puede escribir |
| `code/` | root, árbol autenticado por `artifact.json`; solo módulos enumerados, sin dependencias descargadas en runtime |
| `bin/node`, `bin/ssh-entry`, `bin/root-entry` | binarios concretos, hash aprobado; no setuid, ningún argumento ejecutable del cliente |
| `docker-config/cli-plugins/docker-compose` | plugin root y privado, hash aprobado; no plugin/config del HOME heredado |
| `owner-public.pem`, `runtime.env`, `controller.json`, `installation.json`, `origin-ca.pem` | nombres fijos bajo `/etc/sabora/release`; no credencial DBA; solo material de confianza/control |
| `/var/lib/sabora-release/evidence/<sha256>.json` | seis expedientes originales de custodios, root 0600; el receptor no puede escribirlos |
| `/var/lib/sabora-release/authorizations` | directorio normativo; consumos exclusivos, journal, history, resultados; root 0700 |
| `/var/lib/sabora-release/controller` | lock global, reserva firmada y referencias a bundles retenidos; root 0700 |
| `/srv/sabora/release/staging/<authorizationId>` | transferencia verificada, aún no saludable; root 0700; nunca extrae TAR |
| `/srv/sabora/release/bundles/<authorizationId>` | retención durable posterior a postchecks; conserva versión saludable anterior |

Se revisan todos los padres, realpath, propietario, permisos, nlink, tipo y tamaño, con O_NOFOLLOW y comparación de inode. Los directorios de app/SSH no pueden sustituir archivos de control. La cuota se comparte entre staging y retención; no hay limpieza automática. El operador deberá reservar espacio suficiente y resolver cuarentenas antiguas con autorización independiente.

**Incompatibilidad pendiente de resolver antes de instalar:** los runbooks históricos reservan `/srv/sabora` y TLS al UID 10001. Un padre escribible por la app no permite proteger descendientes root. Este candidato exige `/srv/sabora` root y TLS root con lectura acotada al GID 10001 (directorio 0750, archivos 0640); no ejecuta ni autoriza esa conversión. Si no puede aprobarse una disposición compatible con normativa y custodia TLS, STOP. No mover rutas normativas ni cambiar ownership de un host como efecto de release.

## Secuencia antes y después de mutar

1. Verificar instalación y herramientas; adquirir lock exclusivo durable. Leer journal y rechazar estado desconocido, parcial o discordante.
2. Parsear comando exacto y sobre original; validar firma, SHA, operación, host, ID, manifiesto y ventana de una hora como máximo. Rechazar replay e investigar los seis expedientes antes de aceptar paquetes grandes.
3. Recibir cuatro frames acotados en staging privado. Revalidar los bytes originales de autorización con reloj actual después de ingestión y de cada preflight relevante.
4. Contrastar dossiers, reserva, redes/rutas/listener/nft vivos, ownership de nombres existentes, rutas/mounts/TLS, fuentes YAML aprobadas, TAR/config/layers y colisiones de tags. Renderizar con entorno propio y comparar todas las propiedades de Compose.
5. Escribir consumo O_EXCL + fsync archivo/directorio; actualizar journal durable. Revalidar autoridad y condiciones vivas después del consumo. Cualquier fallo conserva el ID consumido.
6. Cargar únicamente dos TAR inspeccionados, volver a contrastar IDs, ejecutar `up --detach --no-deps --no-build --pull never --wait --wait-timeout 100 sabora-egress api web`, siempre project sabora y overlay de IDs inmutables. No crear redes, cambiar firewall, build/pull, down/prune, orphans, SQL ni reinicios globales.
7. Comprobar `/ready`, identidad de imágenes/SHA/labels, ambas PWA por HTTPS, cadena/hostname/SAN/par cert-clave, camino público Cloudflare (peer dentro del CIDR aprobado y cf-ray), acuse firmado del receptor correlacionado con un evento nuevo enviado desde el gateway, y aislamiento con reloj actual.
8. fsync y retener bundle; resultado durable, historial atómico y journal healthy al final. Solo entonces cambia active. Los estados intermedios o fallos dejan `unknown` y requieren reconciliación; nunca rollback automático.

El núcleo conservaba el mismo timestamp para pre y postcheck; ahora obtiene un reloj nuevo en el postcheck. La prueba de laboratorio usa la misma implementación root/driver, sin `verify=true` de sustitución. El transporte sigue siendo v1: la línea adicional es un detalle local de la shell, invisible al workflow SSH existente.

## TAR, Compose e imágenes

El parser no extrae: inspecciona el TAR exterior con límites de tamaños/entradas, checksum, terminación, rutas, tipos regulares/directorios, duplicados, un manifiesto/una imagen/un tag exacto y ausencia de payload no referenciado. Contrasta digest de config con image ID y diff_ids con las capas sin comprimir. Soporta metadatos Docker legacy y un índice OCI de una imagen cuando son inequívocos. Formatos comprimidos/ambiguos no soportados: STOP, nunca entrega ciega a `docker load`. El contenido interno de las capas sigue perteneciendo al código de imagen firmado y al extractor del engine; no se afirma una auditoría del filesystem de la aplicación por este parser.

Las fuentes YAML están aprobadas por hash de instalación **antes** de ejecutar Compose, evitando que include/env_file lean rutas de otro proyecto. El overlay elimina build, fija image IDs, labels y las tres redes preexistentes. Web añade tmpfs explícitos `/data` y `/config` para cubrir los VOLUME heredados de Caddy sin volúmenes anónimos. No cambia los dos Compose firmados. `!reset`/`!override` requieren Compose compatible (mínimo 2.24.4); se fija el binario exacto de la instalación. [Semántica oficial](https://docs.docker.com/reference/compose-file/merge/).

La comparación cerrada exige recursos, comandos, entrypoint por defecto aprobado de imagen, usuario, variables, mounts/targets/RO, tmpfs, cap_drop, security_opt, logging, healthchecks, redes y publicación IPv4/8443 exactos. Rechaza cap_add/devices/privileged/pid/ipc/network_mode/secret/puerto/red/servicio/env adicional. Solo normaliza representaciones inertes de Compose (null ausente, ipam vacío, mem_limit numérico/string, bind default), no propiedades desconocidas. Tags preexistentes conflictivos fallan; imágenes arrancan por ID. Un SHA ya retenido se selecciona por rollback, no se redespliega sobre el índice existente.

## Seis expedientes: qué se demuestra y quién lo afirma

`sabora-material-evidence/v2` es un **schema candidato**, no una firma o aceptación de responsables reales. Cada fichero contiene `{payload, signature}`, firmado Ed25519 sobre `stableStringify(payload)`. El payload exacto contiene schema, repository, project, gate, releaseSha, environment, subjectSha256, observedAt, validUntil y facts. Los seis hashes originales siguen siendo EVIDENCE_KEYS del contrato v1 de autorización. Se requieren seis claves distintas, distintas del propietario. Las vigencias las declara el custodio; el controlador no inventa una caducidad operativa universal.

| Gate | Coherencia mínima exigida |
| --- | --- |
| externalRestoreSha256 | backup V2 postinstalación, identidad de origen, árbol de migraciones, inventario restaurado idéntico, cuatro componentes, dos custodios, dos ubicaciones distintas con el mismo ciphertext, restauración externa |
| sqlProviderGateSha256 | PG17, identidad/árbol/ledger aplicado exactos, digest ACL, identidad TLS y checks CV005/runtime/RLS/HMAC/TLS/negativos; sin credencial DBA ni SQL del agente |
| ingressIsolationSha256 | política y reserva exactas, red nominada, positivas de fuente autorizada y negativas directa/puerto/IPv6/reversa |
| egressEnforcementSha256 | política y reserva exactas, allowlist y negativas destino/puerto/IPv6/reversa |
| alertDeliverySha256 | receptor aprobado, correlación y digest recibido igual al enviado; además ACK nuevo firmado en cada postcheck |
| independentReviewSha256 | SHA revisado, digest informe/revisor y hallazgos cerrados o decisiones explícitas con digest; no emisión de una nueva auditoría por el agente |

El agente verifica procedencia, integridad, ámbito, vigencia y coherencia de esas declaraciones; **no observa por sí mismo el backup remoto, SQL ni la independencia personal de quien posee una clave**. Su alta y los datos esperados requieren aprobación/custodia real separada. Las pruebas sintéticas están marcadas `disposable-lab`, se excluyen del artefacto y son rechazadas por la entrada de producción. Ningún resultado de CI es un expediente real.

## Aislamiento y reservas

El inspector solo consulta tres nombres de red, tablas nominadas y metadatos de los nombres de contenedor Sabora. Rechaza endpoints inesperados antes de inspeccionar el contenedor. Contrasta ID de redes con reserva firmada, bridge, IPAM, gateway, ipv6/internal/attachable, labels, membresías exactas, routes y listener; no enumera contenido ajeno. Un proyecto activo con red desconectada no es una primera instalación vacía.

La equivalencia nft se basa en JSON canónico íntegro (sin handles/contadores/metainfo), aprobado por hash y contrastado con expedientes de pruebas. Además exige hook forward/prioridad/policy, DROP y confinamiento de cada regla al bridge específico. Los CIDR/destinos/puertos y el JSON deben ser aprobados conjuntamente por el custodio de red contra los generadores existentes; el controlador no puede certificar retrospectivamente esas pruebas solo mirando las reglas. Los flags del witness son una proyección de comprobaciones actuales más declaraciones autenticadas; no son entrada del cliente SSH.

La ausencia de colisiones en allocations **inactivas** y la reserva del puerto requieren una declaración firmada de un provisionador con autoridad de inventario, vigente y ligada a IDs/política. El controlador no adquiere permiso de listar proyectos ajenos para obtenerla. Si no existe esa reserva, STOP. No se atribuye a una lectura local parcial una prueba global de ausencia de interferencia. El laboratorio mide continuidad/identidad de un sentinel propio antes/durante/después, además de reutilizar el ensayo conductual real nft del mismo job.

## Ledger y recuperación

Consumo y resultados son archivos inmutables por ID. Journal/history usan temp exclusivo, fsync, rename y fsync del directorio. Un temp residual, lock de proceso interrumpido, estado consumed/in-progress/unknown o divergencia de active bloquea toda operación siguiente. El consumo no se borra aunque el primer Docker aún no haya actuado. El journal healthy se escribe al final: fallo del último fsync no se presenta como éxito. No se retira una versión anterior healthy del esquema que usa `planSaboraRollback`.

Rollback exige nueva firma, versión anterior healthy, bundle retenido íntegro y runtime actual coincidente con history. Solo cambia aplicación y pasa las mismas puertas. Primera instalación sin anterior: STOP. Crash o readiness fallida después de cambiar contenedores: diagnóstico read-only y reparación/reconciliación explícitamente autorizada fuera del agente. No se ofrece un botón de «desbloquear», se prohíbe borrar locks o journals por inercia.

## Amenaza → control → prueba → límite

| Amenaza | Control y prueba reproducible | Límite |
| --- | --- | --- |
| Shell/argv/env del cliente | shell C, sudo literal, entorno vacío; sesión SSH y negativos reales en lab | no se ha instalado cuenta en host operativo |
| Receipt inventado/firma/TTL/replay | bytes originales verificados repetidamente, consumo durable, exclusión global; wire/root/TTL/concurrencia tests | root/daemon comprometidos fuera del modelo |
| Evidencia decorativa | seis firmas/semántica/vigencia/ámbito; falsificaciones, preinstall, ledger y receipt incorrectos rechazados | confianza externa requiere alta independiente, no autovalidación |
| TAR firmado con tag ajeno | parser anterior a load; TAR malicioso real por SSH y negativos de archivos | engine y código de capas forman parte de TCB; formato no soportado STOP |
| Compose con efecto fuera de scope | hash previo a parser + comparación cerrada; renderer real y mutaciones negativas | binario Compose aprobado debe revalidarse al actualizarlo |
| Recurso ajeno con nombre coincidente | reserva de IDs, labels y metadatos mínimos, no adopción | se necesita custodio de allocations; no inventar exclusividad |
| Firewall obsoleto/estado parcial | equivalencia nft vigente, membresías, rutas, reloj nuevo y sentinel real | pruebas externas siguen siendo attestaciones firmadas |
| Crash/fsync/rollback | consumo exclusivo, journal final, historial retenido; dos releases y rollback reales, estado unknown bloqueado | reconciliación material no automatizada |
| Falso readiness/2xx alerta | TLS real sin insecure, `/ready`, SHA/IDs y ACK firmado correlacionado | laboratorio usa CA/sink locales, API fixture; H6 prueba negocio por separado |

No se afirma aceptación humana ni conformidad visual, backup/SQL operativo, presencia de Cloudflare real, instalación SSH ni continuidad de Fleetia. Los resultados y carencias de ejecución se declaran en el informe del PR; SKIPPED no es PASS.

## S43 — candidato de custodia de mounts y separación de identidades

Propuesta técnica bajo los contratos vigentes, no permiso de aprovisionamiento. El laboratorio integral del HEAD 73485cea27ec26f3de2b539a8c92518b16556711 completó 35 marcadores, incluido A/B/rollback, y 5/5 controles aplicables; no acreditaba lectura de secretos de API, puesto que sus fixtures no leían mounts. Se fijan UID/GID API=10002:10002, egress=10003:10003, web=10001:10001 (preexistente). La imagen API conserva USER sabora y contiene ambos usuarios no-root; el Compose firmado selecciona explícitamente las identidades. Solo el código de aplicación en la imagen es legible por ambos. Sin grupos suplementarios, sin nuevos capabilities ni escritura en mounts.

| Ruta | Propietario y modo candidato | Acceso mediante bind RO |
|---|---|---|
| /etc/sabora/runtime | root:root 0700 | no se monta el padre |
| activation.json | root:10002 0640 | API |
| secrets/ | root:10002 0750 | API |
| secrets/<ref> | root:10002 0640 | API |
| egress-policy.json | root:root 0444 | API y egress, política no secreta, no acceso por ruta host a terceros |
| /srv/sabora | root:root 0700 | no se monta el padre |
| /srv/sabora/tls | root:10001 0750 | web |
| origin.crt y origin.key | root:10001 0640 | web |

El controlador autentica modos/UID/GID, padres root, hashes, tamaño, inventario exacto, enlaces y ACL POSIX exactas sin entradas nominativas/default, mediante getfacl fijado por el manifiesto de instalación. No realiza chmod/chown/setfacl. El padre privado evita exposición por colisiones de UID/GID del host; reservar igualmente las identidades, comprobar mapeo de namespace y que el motor no concede acceso ajeno. Root/daemon son TCB; no afirmar protección contra administradores de host. Los ficheros de control, ledger, staging, evidencias y la clave pública siguen con las reglas privadas anteriores, no se generaliza group-read a protected-store. Rechazar discrepancias antes del consumo y revalidar antes de mutar. El laboratorio usa exactamente estos mounts con un valor ficticio, prueba lectura por API, política por gateway, TLS por web, denegación de accesos cruzados, escritura y SSH, así como negativas de modo, GID y ACL con el mismo controlador. No se acreditan credenciales, SQL ni la aplicación completa con estos fixtures.

**STOP de instalación que subsiste:** el acta S39-17 dentro del runbook S38 documenta /srv/sabora y tls con UID/GID 10001 y modos 0700/0400. Cambiarlos al candidato root-owned es una operación de custodia real que requiere decisión/autorización expresa, preflight y comprobación de pareja TLS/ACL sin revelar material; no se modifica el acta ni se ejecuta ahora. La reserva de UID/GID, credenciales/destinos/expedientes reales, revisión independiente y autorización de provisioning permanecen pendientes.

## S43 — refuerzo de sujeto firmado, autoridades y prueba de publicación

Revisión interna del objeto ff8cff2120fe60d25f06b436fd9e8d0a6dc59bbe: [informe](../reviews/SABORA_S43_PR71_INTERNAL_RELEASE_REVIEW_2026-11-19.md). El candidato deriva subjectSha256 como SHA256 de stableStringify del objeto sabora-release-installation-subject/v1 (repository, project, configuration completa excepto el propio expected.subjectSha256); cambiar mounts, entorno, TLS, redes, claves o cualquier campo de configuración exige recalcularlo, reaprobar instalación y renovar expedientes aplicables. No es secreto publicable si incorpora hashes de valores sensibles: conservar material/expedientes en custodia privada, jamás en Git. Nueve fingerprints SPKI Ed25519 diferentes (owner, seis custodios, reserva, receptor); la identidad del revisor se vincula al fingerprint del custodio de revisión. Esto comprueba separación de claves, no independencia humana. La prueba HTTPS exige igualdad de bytes de index.html, manifest.webmanifest y sw.js de cada PWA con sus seis archivos fijos en web, tanto origen TLS como ruta pública, y distinción de identidades, sin ampliar alcance de Docker exec. Las transformaciones de contenido/compresión o cache divergente provocan STOP; verificar la política de Cloudflare propia sin modificarla automáticamente. TLS exige exactamente los dos DNS SAN aprobados y vigencia mayor de siete días, como el material-check existente. Fixture receptor con certificado/clave distintos. Ningún resultado de esta revisión interna constituye expediente externo ni aprobación. CI nueva pendiente.


### Adenda S45: modalidad temporal de primera activación

Véase decisión normativa [metodología V1](SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md). Sustituye exigencia de independencia exclusivamente para primera activación, previa aprobación expresa del informe exacto y firma propietaria. Campo `reviewEvidenceSha256`, modo firmado `internal-first-activation` y `ownerDecisionSha256`; independiente permanece modalidad ordinaria. No confundir con custodia separada, evidencia real ni autorización de infraestructura. Mantener resto de controles y orden §4–5.
