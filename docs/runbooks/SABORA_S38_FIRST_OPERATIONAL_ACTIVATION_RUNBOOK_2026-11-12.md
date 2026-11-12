# Sabora — runbook candidato de primera activación operativa S38

> **NO EJECUTADO / NO AUTORIZA PRODUCCIÓN.** Aplica sólo a Sabora. No permite
> tocar Fleetia, otros proyectos, Supabase/VPS sin permiso, hacer merge ni
> inferir credenciales o endpoints. Cada STOP requiere evidencia material.

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
6. Custodia cifrada externa, retención y borrado aprobados; receptor de alertas
   operativo; ventana y responsables de reversión identificados.

Si una condición no se cumple, mantener `deploy/compose.sabora.yml` en
health-only y registrar el bloqueo. No editar banderas para eludirlo.

## 1. Preflight fuera de producción

1. Fijar los hashes de la cadena de migraciones, imagen y manifiesto. Comparar
   con el expediente aprobado; cualquier divergencia vuelve al STOP 0.
2. Ejecutar lockfile, gates, PG17, HTTP y dos PWA Chromium en fixture desechable.
   Exigir negativas de identidad duplicada/privilegiada, CA/SNI/destino, secreto
   placeholder, JWKS, readiness, notifier, sink, corrupción y cierre parcial.
3. Renderizar `compose.sabora-operational.yml` únicamente con rutas de ficheros
   temporales no sensibles. Confirmar: API sólo en red interna; gateway único en
   red de salida; ingress `127.0.0.1`; gateway sin puerto; usuario no-root,
   read-only, `cap_drop`, límites y logs acotados.
4. Ensayar parada y re-arranque del servicio Sabora nombrado. No usar `down`,
   prune, Docker socket, redes externas, nombres globales ni operaciones sobre
   contenedores ajenos.

## 2. Copia previa — STOP de autorización

El fixture CI no autoriza un backup real. Con permiso DBA y canal de custodia:

1. Inventariar esquema Sabora, ledger, roles/membresías, owners, ACL, RLS,
   extensiones y referencias Storage. Los bytes de Storage no están en pg_dump
   y requieren inventario/restauración separados si llegaran a usarse.
2. Crear dump lógico custom Sabora-only y exportar definiciones de roles sin
   contraseñas. Generar manifiesto de hashes y cadena de migraciones.
3. Cifrar autenticadamente antes de abandonar el host de captura. Transportar
   ciphertext y clave con custodios/canales separados; nunca Git/Actions/VPS
   compartido. Aplicar retención y destrucción aprobadas.
4. Restaurar en PG17 aislado, reinyectar secretos sólo por el canal separado y
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
   resolver a dirección pública; todo SNI distinto se rechaza antes de conectar.
5. Marcar las 16 evidencias de activación como `true` sólo cuando exista el
   documento/ejecución correspondiente. Son declaraciones auditables, no prueba
   autocertificada.

Un fallo de CA, hostname, endpoint, rol, ACL, JWKS, HMAC o notifier vuelve a
health-only; no se permite `sslmode=require` sin identidad ni TLS permisivo.

## 4. Bootstrap y smoke controlado

1. Arrancar únicamente el proyecto Compose `sabora-operational-candidate` y sus
   dos servicios, sin compartir red, volumen, socket o nombre con otro proyecto.
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
`sabora-operational-candidate`, respetando SIGTERM y el timeout acotado. No usar
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
