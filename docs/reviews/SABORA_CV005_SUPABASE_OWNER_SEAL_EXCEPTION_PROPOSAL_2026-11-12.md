# CV-005 — Propuesta de decisión normativa: membresía administrativa de PostgreSQL 17 en Supabase

**Fecha:** 2026-11-12. **Estado:** PROPUESTA TÉCNICA PENDIENTE DE APROBACIÓN Y REVISIÓN INDEPENDIENTE, NO NORMATIVA EN VIGOR. **PR:** [#57](https://github.com/jdlc86/CartaViva/pull/57). **Proyecto:** Sabora, único restaurante, Supabase `byhvmumqivmunkmomhup`.

## Contrato existente y contradicción objetiva

El contrato de [actor SQL P0](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md) exige al propietario `sabora_order_operations_fn_owner` ser `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`, sin membresías. La migración `20261024190000` y otras cuatro guardas SQL hacen cumplir cero membresías. Este contrato **no está derogado ni reinterpretado** por el presente documento.

En PostgreSQL 17, un `CREATEROLE` no superusuario recibe inevitablemente del bootstrap superuser una membresía `ADMIN TRUE`, `SET FALSE`, `INHERIT FALSE` en cada rol que crea. El operador real `postgres` de Supabase Sabora es `CREATEROLE` pero `NOSUPERUSER` (y `BYPASSRLS`), y no puede eliminar ese grant. [Manual oficial PostgreSQL 17](https://www.postgresql.org/docs/17/role-attributes.html). [Solución oficial Supabase sobre transferencia de propiedad y revocación de grants propios](https://supabase.com/kb/troubleshooting/cant-revoke-a-role-membership-granted-by-supabase_admin-d08922). La aprobación existente de **cero membresías** no puede cumplirse por este procedimiento administrado sin un superusuario proveedor, que no está disponible para este `postgres`.

## Excepción propuesta exclusivamente para DBA y migración

Permitir que las guardas de los propietarios `NOLOGIN` y roles de capacidad `NOLOGIN` reconozcan **únicamente** la membresía administrativa automática, cuando TODAS estas condiciones se cumplan: el rol concedido sea un rol Sabora previsto; el miembro sea el `current_user` de la migración, un DBA `CREATEROLE` y `NOSUPERUSER`; el grantor sea un superusuario del servidor; `ADMIN TRUE`, `SET FALSE`, `INHERIT FALSE`; ninguna otra membresía entrante ni saliente. Todos los LOGIN runtime, `anon`, `authenticated`, servicio API o personal mantienen **cero** membresías del propietario. Si cualquiera de estas condiciones falla, el SQL aborta. No se concede `BYPASSRLS`, acceso a claves HMAC ni privilegios administrativos a logins de aplicación.

Para transferir ownership, dentro de la misma transacción de cada versión de migración, permitir exclusivamente `GRANT CREATE ON SCHEMA sabora` al owner previsto y `GRANT owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE`. Efectuar el `ALTER FUNCTION ... OWNER TO ...` original, mantener los mismos `REVOKE`/ACL/funciones y retirar **ambas** concesiones temporales antes del `COMMIT`. Los `REVOKE ALL ON ALL` existentes requieren temporalmente herencia de otros owners, también retirada en la transacción. Validar tras cada versión `pg_auth_members`, todas las funciones, owners, ACL, FORCE RLS, roles y ejecución negativa del runtime.

**Amenaza residual de la excepción:** la identidad DBA con `ADMIN TRUE` podría posteriormente concederse `SET TRUE` y asumir el owner. En Supabase `postgres` es ya una identidad muy privilegiada con `BYPASSRLS`; se considera explícitamente **raíz administrativa de confianza**, nunca conexión API, pool H3–H6, notifier o servicio PWA. Esta excepción reduce el bloqueo administrativo, pero no da al DBA aislamiento criptográfico frente a un compromiso de sus credenciales: exigir custodia de credenciales y auditoría de cambios de roles. Una sesión SQL expuesta por la API como `postgres` sería P0.

## Condiciones para votar la decisión

La propuesta no se considera aprobada por CI verde ni por el mensaje genérico «corrige». Requiere decisión expresa del propietario, revisión independiente de seguridad/DBA y documentación normativa nueva o cambio explícito en la norma vigente. Debe mantener la garantía de identidad HMAC, no aceptar `SET ROLE`/claims/GUC como identidad de usuario y no alterar rutas/secretos en producción. El PR es **Draft y NO-GO para fusión** hasta entonces.

Además: probar íntegramente las 99 versiones en PG17 sin superusuario (no solo snippets), checksum/ledger, nulidad de grants temporales tras `COMMIT`, regresión H6 real con login restringido, restauración cifrada ensayada y validador del proyecto Supabase 17.11 mediante consultas read-only; backups Free no dan PITR. Autorizar por separado DDL Supabase y despliegue Sabora con aislamiento de Fleetia. Las migraciones todavía **no se han aplicado en Supabase operativo**, por lo que cualquier cambio de checksum candidato exige aprobación de versión completa e inventario reconciliado, no reescritura de un ledger ya registrado.

## Decisión pendiente

**Opción A:** aprobar explícitamente la excepción administrativa anterior, limitada a migraciones y al DBA, tras revisar su riesgo. **Opción B:** rechazarla y exigir a Supabase un mecanismo privilegiado capaz de crear roles sin membresía automática, con evidencia y aprobación. No confundir un laboratorio PG17 superusuario con la instalación Supabase real. Hasta la decisión, `CV-005` sigue NO-GO.
