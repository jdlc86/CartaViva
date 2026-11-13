# CV-005 — Propuesta de decisión normativa: membresía administrativa de PostgreSQL 17 en Supabase

**Fecha:** 2026-11-12. **Estado:** OPCIÓN A SELECCIONADA POR EL PROPIETARIO; norma complementaria en [decisión CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md). **Revisión independiente, SQL e instalación pendientes.** **PR:** [#57](https://github.com/jdlc86/CartaViva/pull/57). **Proyecto:** Sabora, único restaurante, Supabase `byhvmumqivmunkmomhup`.

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

## S37-7 — Advertencia de seguridad demostrada en PG17 (12-11-2026)

El [ensayo integrado #43202505656](https://github.com/jdlc86/CartaViva/actions/runs/43202505656) prueba bajo PostgreSQL 17 real que el DBA no-superusuario, por mantener `ADMIN TRUE` sobre un owner recién creado, **puede concederse otra vez `SET TRUE` y asumir el rol**. Una identidad SQL runtime separada y `NOCREATEROLE` no puede hacerlo; ambas fronteras fueron ejercidas, no solo inspeccionadas. El valor `SET FALSE` en la membresía automática **no protege al owner frente a un DBA que conserva ADMIN**.

Por tanto, la opción A **no preserva literalmente la propiedad «sin membresías»** ni puede aprobarse como un simple retoque de SQL. Requiere una decisión explícita de aceptar el administrador de migraciones como autoridad de confianza y su custodia/auditoría, además de una revisión independiente de seguridad y de la instalación completa (99 SQL, RLS, HMAC, ACL, recuperación, logins operativos aislados). La opción B conserva la normativa, pero depende de una intervención privilegiada de Supabase que actualmente no está demostrada. El [preflight read-only](../../scripts/ci/sabora-pg17-owner-admission.sql) retorna NO-GO en el proyecto Supabase operativo, no instala nada ni autoriza un bypass.

**Estado:** estas opciones siguen pendientes; el ensayo de seguridad que certifica un NO-GO pasó, pero el despliegue sigue expresamente bloqueado.

## Selección expresa del propietario (S37, 2026-11-12)

El propietario ha respondido **«Opción A»** tras recibir explicación de la autoconcesión administrativa y alternativa de proveedor. Se registra aprobación de **arquitectura DBA de confianza** en el [contrato normativo CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md). La aprobación no constituye garantía de que las 99 migraciones sean compatibles, aceptación de un bypass de HMAC/privilegios de runtime, revisión independiente ni autorización de migración/merge/despliegue. El SQL del ensayo histórico se recupera solo para diagnóstico en PR Draft y debe superar las pruebas completas antes de considerarse candidato de instalación.
