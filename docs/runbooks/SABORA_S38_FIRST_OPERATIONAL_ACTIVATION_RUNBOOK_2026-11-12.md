# Sabora — runbook candidato de primera activación operativa S38

> **NO EJECUTADO / NO AUTORIZA PRODUCCIÓN.** Aplica sólo a Sabora. No permite
> tocar Fleetia, otros proyectos, Supabase/VPS sin permiso, hacer merge ni
> inferir credenciales o endpoints. Cada STOP requiere evidencia material.

## Actualización S38-16 — recuperación Free confirmada, pendiente de ejecución (13-11-2026)

La consulta actual a la organización `lqdarfcfumupgxbwmaoa` confirmó `plan=free/tier=tier_free`. **No hay backups diarios automáticos ni PITR incluidos**: la estrategia de primera instalación es **captura lógica cifrada y restauración real aislada de Sabora**, sin contratar un plan nuevo por defecto. [Acta y matriz de custodia S38-16](../reviews/SABORA_S38_FREE_BACKUP_CUSTODY_RECOVERY_DECISION_2026-11-13.md).

**STOP explícito que no se salva con dump de esquema vacío:** antes de instalar, elegir destino/custodios y ensayar la recuperación de un estado parcial que incluya transacciones confirmadas/ledger/roles/ownership y no toque `auth`/`storage` gestionados. Los dumps de CLI separan roles, esquema y datos, filtran internals; **no garantizan reconstruir la membresía otorgada por `supabase_admin` ni las credenciales**. Prohibido restaurar roles globales, borrar ledger, `DROP SCHEMA CASCADE`, reset del proyecto o recrear objetos Supabase administrados sin intervención específica. Ejecutar la CLI con versión y flags comprobados por `--help`, SSL con CA/hostname verificados, fuera del VPS compartido y bajo autorización específica. Este añadido **no** significa que se haya tomado o restaurado un backup real.

## Actualización de decisión (13-11-2026): dos destinos, no dos respaldos independientes en VPS

Conforme a la [norma de doble copia](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md#4-backup-recuperación-y-parada-segura), se admite **opcionalmente** una copia **ya cifrada** en el VPS exclusivo de Sabora para recuperación rápida. La copia **externa y restaurable** sigue siendo obligatoria, fuera de Supabase/VPS/GitHub. La extracción autorizada se hace desde equipo de captura externo; un mismo artefacto cifrado con hash puede distribuirse a ambos destinos. La copia local no habilita SQL ni despliegue, no justifica acceder a Fleetia y requiere permiso VPS independiente, aislamiento y cuota verificados. Este procedimiento está **propuesto, NO ejecutado** y no cancela el aplazamiento registrado en S38-17.

## 0. Condiciones de entrada — STOP

No continuar si falta cualquiera de estas condiciones:

1. SHA candidato final y SHA CV-005 explícitos; CI completa de ambos y revisión
   independiente DBA/seguridad resuelta. El 99/99 histórico de #57 no se hereda.
2. Autorizaciones separadas para merge, backup real, migración/roles, secretos,
   red VPS, despliegue y rollback. Ninguna se deduce de otra.
3. Endpoint PostgreSQL copiado del panel del proyecto Sabora por persona
   autorizada. Selección documentada entre directo IPv6 y pooler de sesión IPv4;
   nunca inferir host, región ni contraseña.
4. Inventario de 17 slots M3 mínimos o 22 si los opt-in se activan, con LOGIN
   físico existente, rol NOLOGIN exacto, owner, custodio, expiry, rotación y
   revocación. Los slots no autorizan crear LOGIN automáticamente.
5. Canal de secretos y custodios aprobados. Las tres contraseñas existentes no
   cubren por sí solas la composición. Ningún secreto puede pasar por Git,
   Actions, PWA, imagen, logs, argumento de proceso o este runbook.
6. Custodia cifrada **externa obligatoria** (copia VPS adicional opcional y nunca sustitutiva), retención y borrado aprobados; receptor de alertas
   operativo; ventana y responsables de reversión identificados.

Si una condición no se cumple, mantener `deploy/compose.sabora.yml` en
health-only y registrar el bloqueo. No editar banderas para eludirlo.

## 1. Preflight fuera de producción

1. Fijar los hashes de la cadena de migraciones, imagen y manifiesto. Comparar
   con el expediente aprobado; cualquier divergencia vuelve al STOP 0.
2. Ejecutar lockfile, gates, PG17, HTTP y dos PWA Chromium en fixture desechable.
   Exigir negativas de identidad duplicada/privilegiada, CA/SNI/destino, secreto
   placeholder, JWKS, readiness, notifier, sink, corrupción y cierre parcial.
3. Renderizar `compose.sabora-operational.yml` con `--project-name sabora` y
   rutas de ficheros temporales no sensibles. Confirmar: API sólo en red
   interna, gateway único en la red externa preaprovisionada y filtrada
   `SABORA_EGRESS_ALLOWLIST_NETWORK`, ingress `127.0.0.1`, sin puerto
   público del gateway, usuario no-root, read-only, `cap_drop`, límites y logs
   acotados. **Ambos servicios deben montar EL MISMO fichero de política de
   egress Sabora en solo lectura.** El preflight compara exactamente destinos,
   puertos y protocolos de SQL/JWKS entre manifiesto y gateway; cualquier
   diferencia es STOP antes de leer secretos. El Compose no crea un bridge de
   salida general ni admite fallback: si esa red no existe, el render/arranque
   debe fallar.
4. Ensayar parada y re-arranque del servicio Sabora nombrado. No usar `down`,
   prune, Docker socket, redes externas compartidas/no verificadas, nombres
   globales ni operaciones sobre contenedores ajenos.

## 2. Copia previa — STOP de autorización

El fixture CI no autoriza un backup real. Con permiso DBA y canal de custodia:

1. Inventariar esquema Sabora, ledger, roles/membresías, owners, ACL, RLS,
   extensiones y referencias Storage. Los bytes de Storage no están en pg_dump
   y requieren inventario/restauración separados si llegaran a usarse.
2. Crear dump lógico custom Sabora-only y exportar definiciones de roles sin
   contraseñas. Generar manifiesto de hashes y cadena de migraciones.
3. Cifrar autenticadamente **antes de persistir el backup** y generar hash verificable. Transportar ciphertext y clave por custodios/canales distintos; nunca Git/Actions ni claves en VPS. Depositar la copia **externa obligatoria** fuera del VPS/Supabase. **Solo con permiso VPS y aislamiento acreditado**, replicar opcionalmente el mismo ciphertext en ruta exclusiva Sabora, con cuota, ACL, espacio libre y retención controlada, sin dump en claro ni uso de recursos Fleetia. Aplicar retención y destrucción aprobadas.
4. Restaurar **desde la copia externa** en PG17 aislado **fuera del VPS compartido**, reinyectar secretos sólo por el canal separado y
   comparar datos, roles, owners, ACL, FORCE RLS, funciones y negativas. Probar
   corrupción. No declarar RTO/RPO a partir del tiempo CI.

Si no puede verificarse la restauración, no migrar ni arrancar el candidato.

## 3. Secretos, roles y TLS — STOP de mínimo privilegio

1. El DBA crea o confirma únicamente las identidades autorizadas y sus
   membresías exactas. Probar que son NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
   NOREPLICATION, NOBYPASSRLS, NOINHERIT y sin acceso directo no previsto.
2. Provisionar un fichero regular por referencia, sin symlink, bajo el montaje
   secreto de la API. CA y credenciales no se copian a la imagen o PWA.
3. Construir el manifiesto `stage=production`: dos orígenes HTTPS distintos,
   issuer exacto `/auth/v1`, host directo/pooler confirmado, SNI original,
   `sabora-egress` como único connect host y puertos de gateway no estándar.
4. Construir la política egress con sólo destinos/puertos verificados. DNS debe
   resolver a dirección pública; IPv4/IPv6 privada, reservada o de propósito
   especial y todo SNI distinto se rechazan antes de conectar.
5. Antes de renderizar Compose, el responsable de red debe crear una red
   exclusiva Sabora y aplicar fuera del proceso `sabora-egress` un firewall o
   proxy de salida que permita solamente esos destinos/puertos. Registrar
   reglas, responsable, hora, resolución DNS y pruebas desde el namespace del
   contenedor: destino autorizado funciona y un destino público ajeno falla.
   El nombre de red por sí solo, la allowlist Node o CI no son evidencia de
   enforcement independiente. Inyectar su nombre por
   `SABORA_EGRESS_ALLOWLIST_NETWORK`; sin evidencia y autorización, STOP.
6. Marcar las 16 evidencias de activación como `true` sólo cuando exista el
   documento/ejecución correspondiente. Son declaraciones auditables, no prueba
   autocertificada.

Un fallo de CA, hostname, endpoint, rol, ACL, JWKS, HMAC o notifier vuelve a
health-only; no se permite `sslmode=require` sin identidad ni TLS permisivo.

## 3A. Publicación HTTPS de las dos PWA — candidato S39 (TCP 8443), sin ejecutar en VPS

**No basta el Compose operativo API+egress:** la publicación candidata de las PWA reside en [`deploy/compose.sabora-web.yml`](../../deploy/compose.sabora-web.yml), [`deploy/Dockerfile.web`](../../deploy/Dockerfile.web) y [`deploy/Caddyfile.sabora`](../../deploy/Caddyfile.sabora). Usar siempre un **único proyecto Compose `sabora`** con los archivos operativo+web explícitos, nunca un `up` sin ámbito ni despliegue compartido. No arrancar el contenedor web contra el `health-only`; no confundir una PWA estática visible con backend `/ready=200`.

La imagen de publicación compila **dos bundles independientes** desde SHA fijo, cliente y gestión, con **código público de restaurante aprobado** `SABORA_RESTAURANT_CODE`; este valor no es secreto. Dos nombres DNS **distintos y aprobados** (`SABORA_CLIENT_HOST`, `SABORA_MANAGEMENT_HOST`) son vhosts TLS separados, cada uno con su manifest/service worker y cookies de su propio origen; ambos redirigen únicamente sus rutas `/api/*` al servicio `api:4100` de la **red interna propia Sabora**. No exponer el API ni la puerta de salida a puertos públicos. No inventar orígenes ni usar un proxy, dominio, certificado o sesión de Fleetia.

**Puertas adicionales antes de desplegar `web`:**

1. Orígenes aprobados por el propietario: **cliente `https://sabora.allaiso.com:8443`** y **gestión `https://gestion-sabora.allaiso.com:8443`**. Exigir exactamente `SABORA_CLIENT_HOST=sabora.allaiso.com` y `SABORA_MANAGEMENT_HOST=gestion-sabora.allaiso.com` (sin esquema ni puerto en estas dos variables de Caddy), y **puerto 8443** en el manifiesto/API, QR, callback, CORS/allowlist, enlaces y pruebas del navegador. Cada PWA debe conservar origen, manifest y almacenamiento independientes. Comprobar DNS/Cloudflare en la zona real; no inferir destino por la mera resolución de IPs Cloudflare.
2. Acreditar que la **IPv4 concreta autorizada** permite usar el **puerto TCP 8443 exclusivo de Sabora**, sin modificar ni depender de la escucha existente del puerto 443. Se admite compartir **la IP** con otros proyectos, pero **nunca el puerto TCP 8443, contenedores, redes, reglas de firewall o TLS**. El overlay exige `SABORA_INGRESS_BIND_IP` explícito; su arranque rechaza direcciones wildcard como `0.0.0.0`. Verificar de nuevo la ausencia de listener 8443 y de conflictos inmediatamente antes del despliegue. Si 8443 no está libre o no es accesible desde fuera con firewall propio y DNS autorizado, **STOP**: no reconfigurar el proxy 443 de Fleetia.
3. Provisionar **fuera de Git, CI e imágenes** `SABORA_WEB_TLS_DIRECTORY` con una única pareja **`origin.crt` y `origin.key`**, exclusiva de Sabora. El certificado de origen debe incluir los SAN DNS `sabora.allaiso.com` y `gestion-sabora.allaiso.com`, sin comodines globales. Comprobar ambos nombres, emisor, fechas, cadena y correspondencia de la pareja mediante herramienta local segura **antes de instalarla**; nunca copiar claves a GitHub, CI, logs o chat. El volumen TLS es read-only para el contenedor; los archivos deben ser legibles por UID/GID `10001` pero no por otros proyectos. Reutilizar el mismo par de archivos en ambos vhosts Caddy no comparte sesión ni origen entre cliente y gestión; **no duplicar el secreto** en cuatro archivos. El web sirve TLS dentro del contenedor por `8443` no privilegiado y publica **solo TCP/8443 del host en la IPv4 aprobada**. Los orígenes son `https://<dominio-cliente>:8443` y `https://<dominio-gestion>:8443` (marcadores, **no dominios inventados**); incluir **el puerto en ambos orígenes aprobados**, QR, callbacks y cualquier allowlist de autenticación/CORS. Las rutas API son relativas al mismo origen.
4. Confirmar firewall/ingress Sabora-only, política egress externa del gateway, límites de CPU/RAM/PID/almacenamiento y ausencia de recursos ajenos. El contenedor web está en **dos redes exclusivas Sabora**: `sabora_runtime_internal` para la API y `sabora_ingress_filtered` externa al Compose, **preaprovisionada y con firewall independiente que permite entrada HTTPS exclusivamente Sabora y bloquea salida no autorizada**. Las redes Docker `internal:true` no publican de forma utilizable los puertos del host; no abrir por ello un bridge sin filtrado. El operador debe verificar ausencia de conexiones o dependencia Fleetia, IP/puerto **TCP 8443** disponible, política de firewall Sabora-only, acceso externo real y ausencia de dependencia sobre Fleetia antes de permitir `SABORA_INGRESS_FILTERED_NETWORK`. La inspección de sockets del 13-11-2026 no halló listener en 8443 pero **no** acredita apertura de firewall, DNS, cert real ni disponibilidad futura. Contenedor read-only, non-root, sin volúmenes de datos ni redes compartidas; las dos PWA no tienen claves SQL, JWT ni HMAC en sus assets. Comprobar que `/api/*` no recibe HTML SPA, que navegación profunda, manifest, service workers, cookies y certificados son correctos en navegador real.
5. Solo después de SQL y secretos aprobados, probar `/ready=200`, QR, identidad y todo el circuito real desde ambos orígenes. Registrar SHA, capturas auténticas, denegaciones, alertas y parada **solo de servicios Sabora explícitos**. No usar `down`, `prune` ni reinicios globales; nunca reiniciar el daemon/host. No inferir GO de los tests de CI.

La CI debe validar el render conjunto con **marcadores inocuos**, construir la imagen estática y usar certificados autogenerados **solo en runner descartable** para comprobar identidades TLS y ruteo hacia API simulada. Esto no acredita dominio/CA real, puerto/IP disponible del VPS ni despliegue. Mantener STOP cuando falten.

## 3B. Verificación de borde Cloudflare y certificado de origen — S39-13 (solo diagnóstico)

**Lectura real 13-11-2026, sin cambios Cloudflare/VPS:** las dos URL aprobadas resuelven a direcciones de **Cloudflare**, no acreditan cuál es la IP de origen configurada ni si existen registros específicos frente a un wildcard. En ambas, la negociación TLS pública **por 8443 es válida** (TLS 1.3, certificado `*.allaiso.com`, Let's Encrypt, válido hasta 21-01-2027), pero `HEAD https://<host>:8443/` acabó en **timeout**. En ambas por **443**, Cloudflare devolvió **HTTP 526**: error de verificación de certificado *en el origen al que Cloudflare está intentando llegar*. **No demostrar ni presuponer que sea el origen de Sabora:** en el VPS aún no hay servicio Sabora escuchando en 8443. No modificar ni reiniciar un origen ajeno para investigar.

**Plan de resolución aislado (pendiente de permisos y evidencias):**

1. Revisar únicamente en la zona Cloudflare `allaiso.com` los **dos registros DNS exactos** (`sabora` y `gestion-sabora`) y sus destinos de origen/proxy. Una resolución a IPs Cloudflare no prueba que apunten al VPS correcto; registrar valor DNS y origen real de ambos sin editar el wildcard ni registros de otros subdominios. El VPS registrado como destino candidato dispone de la IP pública **146.59.145.64**, pero **no asumir que ya exista A/CNAME correcto**, ni modificar registros sin autorización expresa.
2. Mantener la protección **proxied (nube naranja)** solo para los registros expresamente aprobados si se utiliza **Cloudflare Origin CA**; la documentación de Cloudflare admite HTTPS **8443**. No aplicar a nivel de zona cambios de `SSL/TLS`, proxy, WAF, reglas de puerto, `Always Use HTTPS`, `Origin Rules` o certificados compartidos que puedan afectar otros proyectos. **No degradar Full (strict) a Full/Flexible** para ocultar el 526. Si existe una política Cloudflare Access en estos hosts, comprobar su compatibilidad (Access no admite puertos explícitos en URL) antes de elegirla.
3. Para la conexión Cloudflare → Caddy Sabora, provisionar **certificados de origen restringidos a los dos nombres exactos** (una SAN restringida o dos certificados) y claves privadas bajo custodia exclusiva Sabora: Cloudflare Origin CA con modo Full (strict), o certificado público válido obtenido por canal autorizado. No se necesitan certificados públicos nuevos **en el borde**, pues se comprobaron válidos; lo pendiente es el certificado **que presentará el nuevo servicio Sabora al proxy**. Usar únicamente `origin.crt` y `origin.key` fuera del repositorio/CI, legibles por UID `10001`, sin acceso de otros proyectos, y exigir que los SAN incluyan ambos dominios aprobados. Registrar renovación/vencimiento; Origin CA no envía avisos automáticos de expiración.
4. Solo **después** de autorizar el ingress Sabora-only, verificar IP y libre TCP/8443 en el host, preaprovisionar red filtrada exclusiva y reglas cuyo alcance no afecte el tráfico existente, y arrancar los servicios Sabora autorizados. Desde fuera, verificar resolución, identidad TLS, `GET /`, manifest/SW, `/api` sin fallback SPA, negativas y `/ready=200` en el backend; comparar logs solo de Sabora y confirmar que los demás proyectos no se modificaron ni interrumpieron.
5. Si Cloudflare sigue devolviendo **526**, verificar el hostname SAN, trust chain y certificado presentado por **ese vhost de Sabora**; si persiste timeout por `:8443`, comprobar ruta exacta del DNS, reglas del proveedor y host, y recepción del flujo en la red filtrada **solo de Sabora**. Nunca desactivar SSL estricto ni manipular el proxy/443 común como solución rápida. Mientras tanto, **NO-GO** de publicación operativa.

**Verificación local sin transferir secretos (S39-16):** el repositorio incluye [`scripts/ops/sabora-origin-material-check.mjs`](../../scripts/ops/sabora-origin-material-check.mjs). Un operador autorizado con Node.js 22 y los archivos **guardados localmente** puede ejecutarlo en su propio equipo, **fuera del VPS y GitHub**:

```sh
node scripts/ops/sabora-origin-material-check.mjs \
  /ruta/privada/sabora/origin.crt /ruta/privada/sabora/origin.key \
  sabora.allaiso.com gestion-sabora.allaiso.com
```

Debe devolver `PASS` sin mostrar ningún secreto; verifica que ambos archivos son regulares (sin symlink final), que el certificado contiene **exactamente dos nombres SAN DNS**, que está actualmente vigente y no vence en los próximos 7 días, y que la clave privada corresponde a la pública del certificado. El script **no envía datos a la red** y no revela las claves. **STOP si el resultado es distinto de PASS;** no subir el certificado ni la clave al repositorio, CI o chat. Revisar por separado las ACL de los directorios padre, emisor/cadena de confianza Cloudflare Origin CA, caducidad/rotación, permisos UID 10001 y canal seguro de traslado autorizado: este chequeo **no valida esos controles ni acredita HTTPS real**. La CI ejercita el verificador con un certificado SAN desechable y negativa de clave distinta o SAN incorrectos, nunca con el certificado del propietario.

**Hito S39-15 (declarado por el propietario):** el propietario indica que ha creado el certificado Cloudflare Origin CA para Sabora y completado el guardado. **No se han leído ni validado** certificado, SAN, fechas, clave privada ni correspondencia criptográfica; no inferir que esté instalado ni que su custodia sea suficiente. El código de publicación se adapta a **un solo certificado SAN y una sola clave**, sin copiar secreto alguno al repositorio. El siguiente paso de infraestructura exige validar localmente la pareja y transferirla mediante canal de custodia autorizado **solo después** de aprobar la instalación aislada. No pedir secretos por chat.

**Referencias externas:** [Cloudflare: puertos compatibles](https://developers.cloudflare.com/fundamentals/reference/network-ports/), [error 526](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/), [certificados Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/) y [DNS](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/). Evidencia [continuidad S39](../handoffs/SESSION_39_HANDOFF_2026-11-13.md).

### Estado S39-19 — certificado de origen instalado en VPS Sabora (14-11-2026)

**Alcance de la autorización del propietario:** instalación **únicamente del material TLS de Sabora** y preparación de su directorio aislado; no se autorizó desplegar PWA/API, integrar este PR, abrir ingress/8443, manipular firewall general, reiniciar host/servicios, ejecutar migraciones ni alterar Fleetia.

**Ejecución Gateway, host** `146.59.145.64` (registro accesible `srv_01M7CEC20000XZSVEGP0EB76DY`):
- Preflight: `/srv` ya existía como directorio root, `/srv/sabora`, `/srv/sabora/tls` y la identidad `sabora` no existían; el UID/GID `10001` no estaban asignados según comprobación y operaciones dry-run. Se creó **únicamente** grupo `sabora` GID `10001`, usuario `sabora` UID `10001` con contraseña bloqueada, `/usr/sbin/nologin`, sin crear home y con grupo principal exclusivo.
- Se crearon `/srv/sabora` y `/srv/sabora/tls`, **0700**, usuario y grupo `sabora:sabora`; directorios preexistentes ajenos no se reescribieron. La ruta aprobada para `SABORA_WEB_TLS_DIRECTORY` es **`/srv/sabora/tls`**, pero no se aplicó todavía en ningún contenedor/Compose real.
- Desde **dos valores Gateway de uso único** y sin mostrar su contenido se escribieron `/srv/sabora/tls/origin.crt` y `/srv/sabora/tls/origin.key` mediante `write_secret_file`, **0400**, propietario `sabora:sabora`, UID/GID `10001`; `stat_file` confirmó archivos regulares y esas propiedades. Los valores de uso único **fueron consumidos**; no pedir que se reenvíen al chat.
- `certificate.inspect_file` identificó emisor **Cloudflare Origin SSL Certificate Authority**, RSA 2048, **dos DNS SAN exactos** `sabora.allaiso.com` y `gestion-sabora.allaiso.com`, `notBefore=2026-11-13 21:37 UTC`, `notAfter=2041-11-09 21:37 UTC`. Huella SHA256 pública: `E9:AF:77:16:4E:4B:72:BF:1E:2F:2B:19:3B:84:96:96:27:C0:FD:BF:BE:80:9E:0E:57:61:50:20:40:16:C3:71`.
- La prueba **local sobre el VPS**, usando Python stdlib y OpenSSL bajo privilegio autorizado, comparó SPKI del certificado con la derivada de la clave privada y devolvió **PASS**; exigió SAN exactos y vigencia superior a siete días. No reveló la clave ni efectuó solicitudes externas. **No prueba todavía trust Cloudflare, visibilidad de archivos dentro de contenedor, HTTPS externo, ACL extendidas ni modo Full (strict).**
- `get_file_acl` intentó cuatro comprobaciones **sin modificar ficheros**, pero el servidor carece de la utilidad requerida (`CAPABILITY_UNAVAILABLE`): ACL extendidas no inspeccionadas. Las modalidades Unix `0700/0400` y propietarios sí se verificaron; no instalar paquetes globales ni tocar recursos ajenos para suplir esta limitación. `network.inspect` posterior confirma **80/443 ocupados** y **8443 libre**; no se publicaron listeners.

**Siguiente puerta STOP:** confirmar compatibilidad del UID mapeado por un **contenedor Sabora aislado** cuando se autorice el despliegue; resolver/justificar verificación ACL por mecanismo no disruptivo si se exige, validar enforcement independiente de red/ingress TCP 8443 y firewall proveedor, respaldos SQL restaurados fuera VPS, roles/secretos y aprobación de PR. Este hito **no** implica que Sabora esté funcionando en Internet ni revoca la prohibición de intervenir en Fleetia.

### Estado S39-20 — paquete ACL instalado y directorios Sabora auditados (14-11-2026)

**Nueva autorización expresa del propietario:** «Instala ACL». Esta autorización **solo** cubrió la instalación de la utilidad para inspeccionar permisos, sin habilitar despliegue, cambio de red, reinicios ni operaciones sobre proyectos ajenos.

- Estado inicial: `acl` no estaba instalado, candidato Ubuntu `2.3.2-2`; `package_health` detectó apt y reboot pendiente previo. La operación `package.install` se validó con `dry_run`.
- Se instaló mediante Gateway `package.install` **únicamente el paquete `acl=2.3.2-2`**, sin actualizar metadatos ni ejecutar upgrade/autoremove. `apt` declaró **0 paquetes actualizados, 1 nuevo, 0 eliminados**; el paquete activó la actualización normal del índice `man-db`. `needrestart` informó de **reinicios de servicios diferidos** (incluido Docker), no ejecutados; no arrancar ningún servicio para satisfacer ese aviso. La verificación posterior confirmó paquete `ii 2.3.2-2`.
- `file.acl.get` funcionó posteriormente **sin alterar archivos** en las cuatro rutas. En `/srv/sabora` y `/srv/sabora/tls` mostró **exactamente tres entradas ACL de acceso**: `user::rwx`, `group::---`, `other::---` (0700). Para `/srv/sabora/tls/origin.crt` y `origin.key`, exactamente `user::r--`, `group::---`, `other::---` (0400). **No hay ACL nominativas ni de grupo extra**; los permisos de superusuario root son inherentes al sistema y no constituyen un principal aislado.
- Tras la instalación `network.inspect` confirmó que **80/443** seguían en escucha y **TCP/8443 sin listener**. `system.health` registró `failedUnits=0` y **boot ID idéntico al de antes**. Se evitó consultar, detener o reiniciar servicios o contenedores de otros proyectos. El paquete `acl` es del sistema compartido, no un recurso privado del contenedor Sabora; no declarar aislamiento total de la infraestructura por su mera instalación.

**Puertas que continúan:** red de ingress filtrada y firewall independiente, aceptación/despliegue del PR, copia externa restaurada, Supabase SQL/migraciones y verificación funcional HTTPS real. La prueba ACL acredita únicamente control de acceso en el host para estas cuatro rutas, no los permisos dentro de contenedores ni la seguridad de otros proyectos.

## 3C. Despliegue gobernado y automatizable — S39-21, NO activado

El propietario exige el **mecanismo gobernado** (14-11-2026); véase la [propuesta normativa de despliegue y red V1](../architecture/SABORA_GOVERNED_RELEASE_V1.md) en el **mismo PR #59**. El artefacto [`sabora-governed-deploy.yml`](../../.github/workflows/sabora-governed-deploy.yml) utiliza `workflow_dispatch` exclusivamente en `main` y distingue `plan`, `deploy`, `rollback` (solo aplicación), con concurrency única. `plan` es inspección de SHA y CI, **sin operación VPS**. El flujo `execute` permanece **NO OPERATIVO** por ausencia de agente root-owned Sabora `forced-command`, cuenta SSH específica, clave de firma/consentimiento, entrega de imágenes por digest y evidencias externas.

**Puertas obligatorias antes de configurar el workflow para actuar:** integración de PR con autorización separada, revisión independiente de código, plan de recuperación real, evidencia DBA/SQL/99 migraciones, interfaz y dos PWA, firewall ingress/egress realmente validado, alertas receptor y observabilidad. La autorización para cada despliegue no puede deducirse de la CI ni del permiso para crear una red o instalar ACL. El operador debe proveer una autorización Ed25519 firmada, ligada a SHA, host `146.59.145.64`, 3 servicios, 2 orígenes, operación y ventana de una hora, sin la clave privada de firma en GitHub, CI, VPS ni ChatGPT. El agente futuro revalidará las evidencias y consumirá el ID de autorización **una sola vez**. No se puede confiar en reviewers de environment sin comprobar soporte y configuración para el repositorio privado concreto.

**Red comprobada 14-11-2026:** Gateway confirmó rutas IPv4 `172.17.0.0/16` y `172.18.0.0/16`, 8443 libre, nftables. El intento `docker.create_network dry_run` para `sabora_ingress_filtered` `172.28.240.0/24` devolvió `wouldChange=true, changed=false`: **no existe una red nueva ni un firewall Sabora aplicado**. La planificación de nftables en el PR es exclusivamente un candidato de tabla `inet sabora_ingress_guard` con rangos Cloudflare explícitos y bloqueo de conexiones nuevas ajenas, que requiere evaluación de conectividad/nft en laboratorio y verificación del modo de firewall del proveedor antes de actuar; no cambiar cadenas Docker, reglas generales o redes de terceros. Mantener STOP de red.

**Control visual:** ningún SHA/governance workflow permite sustituir el diseño aprobado ni declarar aceptación de las dos PWA sin prueba real. No iniciar servicios mientras el backend operativo no tenga `/ready=200`, backup externo restaurado y permisos SQL verificados.

## 4. Bootstrap y smoke controlado

1. Tras autorización específica y comprobar que no hay otro arranque Sabora
   simultáneo, conmutar **solo el servicio `api` del proyecto `sabora`** desde
   el Compose health-only al Compose operativo, incorporando únicamente el
   servicio `sabora-egress`. Utilizar siempre `--project-name sabora`,
   `--file deploy/compose.sabora-operational.yml` y nombres explícitos de
   servicio, sin operaciones globales ni comandos sin ámbito. Ambos Compose
   representan **modos alternativos del mismo proyecto**, no instalaciones
   concurrentes; comprobar que no se intenta ocupar el puerto 4100 dos veces.
2. Verificar que no existe listener útil hasta completar JWKS y todos los
   preflights SQL/ACL/roles/eventos. `/health` sólo acredita proceso vivo.
3. Exigir `/ready=200` y después recorrer con datos ficticios: QR/carta/visita,
   pedido, cocina/sala, avisos, cuenta/cambio de mesa y M3 desde las dos PWA.
   Validar JWT/HMAC, ADMIN writer, denegaciones, expiración, concurrencia,
   idempotencia, SSE/outbox y consistencia PG17.
4. Cortar una dependencia Sabora del fixture: `/ready` debe ser 503, las rutas
   no deben fabricar éxito y la recuperación limpia debe devolver 200.
5. Confirmar eventos saneados y entrega al receptor. Un log local no equivale a
   alerta externa. Un fallo del receptor no puede cambiar una transacción.

Stripe real, Gemini, reservas, webhooks públicos y cualquier función no
certificada permanecen deshabilitados.

## 5. Reversión

Ante cualquier fallo, detener sólo los servicios nombrados del proyecto
`sabora` y servicios nombrados del archivo Compose operativo, respetando SIGTERM y el timeout acotado. No usar
comandos globales. Confirmar cierre de listener/notifiers/pools y volver al
compose health-only, que no comparte la red de salida.

Después: revocar la credencial nueva o restaurar la anterior según el plan DBA,
preservar evidencia saneada, comparar ledger/checksums y decidir restauración
desde el artefacto cifrado únicamente bajo la autorización correspondiente.
Nunca hacer rollback borrando ledger o reescribiendo historia. Si la causa es
SQL/ownership, detener la activación y volver a revisión de CV-005; no corregir
directamente el proveedor.

## 6. Cierre y acta

Registrar SHA/imagen, responsables, autorizaciones, endpoint seleccionado sin
secreto, slots activados, hashes de backup/restore, smoke, alertas, timestamps y
resultado de rollback. Separar siempre:

- implementado en código;
- ejecutado en laboratorio;
- validado en Supabase/VPS;
- aceptado por revisión independiente/humana.

Sin las cuatro capas no declarar GO. Actualizar continuidad y tablero sólo como
hito integral, manteniéndolos como seguimiento no normativo.

## S40-1 — paquete de release y verificador del lado del host (14-11-2026, solo candidato GitHub)

Tras S39-21, el [PR #59 Draft](https://github.com/jdlc86/CartaViva/pull/59) contiene verificador de autorización Ed25519 independiente del runner, comprobación de seis expedientes por hash y ámbito, compromiso firmado `bundleManifestSha256` del paquete API+dos PWA por imágenes `api.tar`/`web.tar` con manifiesto y hashes Compose, y control de reutilización de autorización. El workflow limita el SHA de autorización al HEAD exacto de `main`; el paquete solo se generaría en el job `web-publication` tras un push a `main`, sin conexión al VPS y con retención temporal de 7 días. Ver norma propuesta [`SABORA_GOVERNED_RELEASE_V1.md`](../architecture/SABORA_GOVERNED_RELEASE_V1.md#5-avance-de-implementación-del-verificador-de-host-y-paquete-inmutable-14-11-2026).

**STOP deliberado:** código de verificación en repo no implica instalación. La función actuadora sigue devolviendo STOP; no existen aún entrega gobernada de los tar al host, carga e inspección de IDs Docker, agente SSH root-owned instalado, examen material de redes egress/ingress y firewall ni rollback con ledger de versión operativa. No cambiar `SABORA_RELEASE_AGENT_READY` ni exponer usuario SSH, no crear contenedores ni tocar otro proyecto. Solo tras autorización separada y pruebas de denegación reales del aislamiento se instalaría el agente, nunca por estar verde la CI de la rama. No confundir `api.tar`/`web.tar` con backups ni publicar secretos en bundles.

## S40-2 — transporte binario controlado y guardia de rollback (14-11-2026)

El nuevo proceso de GitHub obtiene exclusivamente el paquete de CI push a main, SHA exacto, resultado success y fuente no ambigua. La imagen de producción de la PWA se recompila con código público de restaurante expresamente configurado mediante SABORA_APPROVED_RESTAURANT_CODE; el valor de laboratorio no se reutiliza automáticamente. El flujo envía por SSH cifrado autorización, manifiesto firmado y cuatro archivos de nombres invariables, con lectura y verificación SHA256 streaming. El receptor candidato **solo prepara archivos privados de Sabora**, jamás llama Docker.

Para rollback: versión anterior saludable probada por ledger confiable, observación del estado real, autorización nueva Ed25519, sin SQL ni otros proyectos. La función actora sigue STOP. No habilitar agente/credenciales o crear redes/puertos para probar este código; hace falta permiso operativo específico y evidencia de aislamiento real. No hay validación de restauración externa ni instalación SQL.

**S40-2, aclaración del rollback:** la solicitud de revertir es un mensaje firmado independiente, sin descargar nuevamente un artefacto GitHub que puede haber caducado. El controlador del host, aún no provisionado, tendría que acreditar mediante ledger/observación exclusiva Sabora la versión antigua saludable, verificar su manifiesto y autorización y solo entonces considerar un cambio de aplicación. En el candidato actual, este recorrido rechaza siempre la ejecución real. Los cuatro checks CI deben pertenecer a GitHub Actions, no a aplicaciones externas.

## S40-3 — prueba y bloqueo del núcleo de ejecución acotado (14-11-2026)

El PR #59 suma un ejecutor de laboratorio con cuatro verificaciones independientes antes del primer comando mutador: firma/manifiesto + seis evidencias, aislamiento entrante/saliente y puertos comprobados por testigo local, tres servicios y Compose resuelto con imágenes SHA, y registro de consentimiento consumido antes de operar. Después exige readiness API, HTTPS de las dos PWA, alerta realmente recibida, aislamiento posterior y ledger duradero. Las órdenes previstas se limitan a `docker image inspect/load` y `docker compose --project-name sabora ... up --no-deps --no-build --pull never` sobre tres servicios y dos archivos de Compose firmados más overlay de SHA. No ejecuta órdenes globales, no borra recursos, no revierte SQL. En caso de fallo no ejecuta rollback sin consentimiento nuevo.

**No usar este runbook como permiso VPS.** El testigo de redes/host es simulado en CI y un `true` dentro de un fixture no demuestra nftables real. Los nombres `sabora_ingress_filtered` y `sabora_egress_filtered` **no existen en el VPS según consultas exactas de solo lectura de 14-11-2026**. Faltan adaptador de Docker real auditado, inspector nftables/egress, usuario forzado, red y filtros exclusivos, comprobación directa de Cloudflare y denegaciones, entrega y recuperación reales. Al instalar deberá revalidarse estado de host y URLs; no provocar cambios en Fleetia ni otras aplicaciones.

**S40-3 — salida exclusiva (propuesta no aplicada):** se añadió el generador de prueba `sabora-egress-network-policy.mjs` para un bridge Sabora exclusivo, allowlist de CIDR/puertos aprobados, denegación por defecto de nuevas salidas y bloqueo de entradas nuevas, sin flush ni cambios de cadenas de otros proyectos. Los ejemplos RFC 5737 de los tests son ficticios. Antes de crear/redirigir cualquier bridge, verificar rutas y redes Docker inactivas, destinos y DNS reales según el contrato existente, `nft --check` sobre política concreta, pruebas de entrada/salida y coexistencia, revertibilidad de solo la tabla Sabora, permiso de red y backup externo. El fichero es generador de texto, no un instalador.

**Evidencia S40-3 de laboratorio (SHA fbb8e357):** `nft --check` para los generadores ingress y egress pasó en GitHub Actions [web-publication](https://github.com/jdlc86/CartaViva/actions/runs/43587897164). Fue comprobación sintáctica sin aplicar reglas, con direcciones de documentación. NO demuestra firewall operativo ni justifica el cambio de tablas en el VPS. Antes de habilitar un agente falta test de denegación/permiso real con destino y puertos aprobados, aislamiento comprobado y autorización propia.
