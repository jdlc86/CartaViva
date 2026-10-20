# Sabora: contrato pendiente del writer SQL

Estado: diseño, no aprovisionado. Fuente de verdad: docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md y docs/continuity/SESSION_02_HANDOFF.md.

El futuro rol técnico de escritura debe ser distinto de sabora_staff_reader y de los roles cliente. Debe ser NOLOGIN, NOBYPASSRLS y disponer exclusivamente de grants y políticas por recurso explícitamente autorizados. El LOGIN de aplicación y su gestión se definirán fuera de migraciones. No se utilizarán roles owner o superuser para ejecutar mutaciones administrativas.

La identidad del actor procede de la verificación de autenticación en el servidor y debe revalidarse con membresía durable. Solo ADMIN activo y titular puede ejecutar mutaciones administrativas ordinarias; ROOT dispone de gobierno excepcional de titularidad, no de bypass ordinario.

Antes de abrir rutas o permisos se requiere: matriz de recursos y acciones; diseño verificable de identidad técnica; política RLS y grants exactos; pruebas PostgreSQL 17 con rol real no privilegiado; bootstrap y recuperación auditados de ROOT; pruebas de concurrencia, rollback y denegaciones directas.

No se aplican cambios a entornos operativos ni se autorizan despliegues con este documento.

## Primer paso implementado: rol dormido

La migración `20261020250000_sabora_dormant_admin_writer.sql` crea `sabora_admin_writer` como NOLOGIN, NOINHERIT y NOBYPASSRLS, sin grants de datos ni USAGE del esquema. **No es todavía un rol operativo de escritura.** El smoke PostgreSQL 17 ejecuta denegaciones de lectura de personal, actualización de titularidad e inserción de auditoría bajo `SET ROLE sabora_admin_writer`. Solo una futura migración revisada y con contrato de recursos podrá habilitar privilegios mínimos. No se han provisionado LOGIN ni secretos.
