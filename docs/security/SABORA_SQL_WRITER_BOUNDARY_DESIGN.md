# Sabora: contrato pendiente del writer SQL

Estado: diseño, no aprovisionado. Fuente de verdad: docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md y docs/continuity/SESSION_02_HANDOFF.md.

El futuro rol técnico de escritura debe ser distinto de sabora_staff_reader y de los roles cliente. Debe ser NOLOGIN, NOBYPASSRLS y disponer exclusivamente de grants y políticas por recurso explícitamente autorizados. El LOGIN de aplicación y su gestión se definirán fuera de migraciones. No se utilizarán roles owner o superuser para ejecutar mutaciones administrativas.

La identidad del actor procede de la verificación de autenticación en el servidor y debe revalidarse con membresía durable. Solo ADMIN activo y titular puede ejecutar mutaciones administrativas ordinarias; ROOT dispone de gobierno excepcional de titularidad, no de bypass ordinario.

Antes de abrir rutas o permisos se requiere: matriz de recursos y acciones; diseño verificable de identidad técnica; política RLS y grants exactos; pruebas PostgreSQL 17 con rol real no privilegiado; bootstrap y recuperación auditados de ROOT; pruebas de concurrencia, rollback y denegaciones directas.

No se aplican cambios a entornos operativos ni se autorizan despliegues con este documento.

## Primer paso implementado: rol dormido

La migración `20261020250000_sabora_dormant_admin_writer.sql` crea `sabora_admin_writer` como NOLOGIN, NOINHERIT y NOBYPASSRLS, sin grants de datos ni USAGE del esquema. **No es todavía un rol operativo de escritura.** El smoke PostgreSQL 17 ejecuta denegaciones de lectura de personal, actualización de titularidad e inserción de auditoría bajo `SET ROLE sabora_admin_writer`. Solo una futura migración revisada y con contrato de recursos podrá habilitar privilegios mínimos. No se han provisionado LOGIN ni secretos.

## Objetos futuros y ACL por defecto

La migración `20261020260000_sabora_writer_future_acl.sql` establece revocaciones de privilegios por defecto para objetos futuros creados por **el rol que ejecuta la migración**, y refuerza la revocación de EXECUTE público sobre nuevas funciones del esquema. El smoke crea una tabla y una función temporales de prueba para verificar denegaciones y las elimina. Limitación explícita: las ACL por defecto son por rol creador y no bloquean grants explícitos posteriores ni objetos creados por otros owners; deberán auditarse en cualquier integración de nuevos roles.

## Corrección de default EXECUTE de PostgreSQL

CI #312 y bootstrap #296 detectaron que `ALTER DEFAULT PRIVILEGES IN SCHEMA ... REVOKE EXECUTE ... FROM PUBLIC` **no revoca el permiso EXECUTE global predeterminado** de PostgreSQL. Se añadió la migración `20261020270000_sabora_default_function_execute.sql` con revocación global para futuras funciones creadas por el rol ejecutor. Esto también afecta a futuras funciones que ese rol cree en otros esquemas: requiere revisar ownership/rol migrador antes de aplicar a un entorno operativo. La prueba que creó una función nueva se mantiene para evitar regresiones.
