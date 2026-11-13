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
