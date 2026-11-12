# Sabora CV-005 — decisión normativa de autoridad DBA PostgreSQL 17 (opción A)

**Fecha:** 2026-11-12. **Ámbito:** único restaurante Sabora. **Aprobación del propietario:** selección explícita de «Opción A» en la sesión 37 después de exponer el riesgo de membresía administrativa automática y autoconcesión. **Estado:** decisión de arquitectura aprobada por el propietario; implementación SQL candidata y puesta en servicio **PENDIENTES de revisión independiente de seguridad/DBA y de ensayo integral**. No es autorización de migración de Supabase, merge, creación de secretos ni despliegue.

## Cláusula que se modifica y regla sustituta

Se sustituye **solo** la exigencia absoluta «sin membresías» de propietarios SQL Sabora `NOLOGIN` donde la creación del rol por el instalador `CREATEROLE` no superusuario de PostgreSQL 17 provoca la membresía administrativa automática. El resto de la decisión [P0 de identidad HMAC](SABORA_P0_ACTOR_SQL_BINDING_DECISION.md) y los contratos de rol, RLS forzado, funciones cerradas, claves y actor no falsificable se mantienen obligatorios.

La **única** membresía permanente admisible en el rol propietario es una concesión de la identidad privilegiada de arranque de PostgreSQL, con **`ADMIN TRUE, SET FALSE, INHERIT FALSE`**, hacia el **administrador instalador Sabora identificado y controlado**, con `CREATEROLE`, `NOSUPERUSER`, nunca una identidad runtime. Para toda otra membresía entrante o saliente al owner, incluso de `anon`, `authenticated`, API, PWA, cocina, sala, notificador u otro rol técnico, la migración debe fallar. Roles propietarios permanecen `NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB, NOREPLICATION`. No se autoriza usar `postgres` ni `service_role` como conexión de ejecución de la API o de firma HMAC.

## Confianza administrativa explícita y amenaza residual

PostgreSQL 17 concede `ADMIN TRUE / SET FALSE / INHERIT FALSE` al `CREATEROLE` que crea otro rol. La identidad administradora **puede volver a concederse `SET TRUE`**, hacerse miembro operativo temporal y asumir al propietario. Por tanto, **no hay aislamiento de la clave frente a un DBA comprometido**. No calificar `SET FALSE` de barrera criptográfica. El propietario acepta **esta frontera de confianza DBA**, no la exposición de las credenciales de administrador a código, servicios o flujos operativos.

La custodia de la credencial de migración, su separación del pool SQL de servicios, la auditoría efectiva del catálogo de roles/ACL y un procedimiento de rotación/incident response son requisitos operativos verificables pendientes. Nada en esta decisión relaja la verificación HMAC firmada del actor HTTP↔SQL ni admite GUC, actor UUID, JWT de usuario editable o `SET ROLE` como identidad del actor.

## Disciplina de concesiones temporales

Cada migración de la cadena original es una transacción versionada e íntegra. Cuando sea necesario transferir ownership o ejecutar un REVOKE histórico entre funciones de diferentes owners, puede concederse al instalador solo dentro de esa transacción el `SET/INHERIT` mínimo y al owner `CREATE ON SCHEMA sabora`, retirándolo **antes del COMMIT**. El grant administrativo automático del bootstrap puede persistir con las características exactas aprobadas. Toda membresía extraordinaria, grant `CREATE` o privilegio efectivo para runtime no aprobado debe abortar la versión y producir NO-GO.

No es aceptable sustituir estas garantías con un script que obvie, salte o reescriba silenciosamente archivos SQL. El manifiesto y el ledger deben reflejar SHA256 de **cada migración SQL realmente aplicada**, una sola vez; no hay 99 versiones válidas si falta alguna. Las modificaciones de las 52 migraciones experimentales recuperadas en el PR #57 se tratan como **candidatas sin validación**, no como instalación aprobada.

## Puertas de aceptación y separación de autorizaciones

1. Revisión independiente de seguridad y DBA sobre el diff íntegro de migraciones, escalada DBA, privilegios efectivos, owners, HMAC y `SECURITY DEFINER`. El autor del cambio no valida su propia seguridad.
2. Prueba en laboratorio PostgreSQL 17 **NOSUPERUSER/CREATEROLE** de las **99 migraciones reales** con verificaciones tras COMMIT de membresías, ACL, FORCE RLS, ausencia de privilegio `CREATE` residual y negative/positive runtime. Compatibilidad de Supabase administrado no se presume a partir de Docker sin sus extensiones/hooks.
3. Regresión integradora existente de H3–H6, M3–M5, HTTP/identidad HMAC/JWT, idempotencia/pagos, recuperación/rollback; las pruebas superusuario antiguas no bastan.
4. Preflight solo lectura contra el proyecto exacto Supabase `byhvmumqivmunkmomhup`, procedimiento de backup cifrado y restauración ensayada, custodia de secretos y aprobación separada de migración operativa.
5. Para VPS, aprobación expresa e aislamiento total del proyecto Fleetia y terceros; no se autoriza ejecutar ni reiniciar contenedores ajenos.

**Decisión de producto aprobada:** opción A para el **diseño**. **NO-GO actual:** pruebas completas de instalación, seguridad independiente, SQL operativo, merge y despliegue. Los resultados CI verdes acreditarán únicamente la etapa de laboratorio realmente ejecutada.

## Alcance de la misma membresía automática en roles de capacidad runtime NOLOGIN

El mismo mecanismo de PostgreSQL 17 se aplica a **todo rol Sabora creado por el instalador `CREATEROLE`**, incluso los roles de capacidad `NOLOGIN` cuya única finalidad es obtener `EXECUTE` sobre RPC. La opción A autoriza **exclusivamente** el grant automático de bootstrap al DBA, con `ADMIN TRUE / SET FALSE / INHERIT FALSE`, también sobre esas capacidades. No autoriza membresía de un rol runtime dentro de un propietario SQL, ningún `LOGIN` runtime miembro de un owner, ni `SET/INHERIT` de ningún rol de aplicación hacia otro. Las guardas deben comprobar **ambos extremos** del grafo de membresías y rechazar toda concesión adicional. Los owner siguen con los atributos sellados indicados arriba.

Las concesiones extraordinarias del instalador se limitan a cada migración y se revocan antes del `COMMIT`; el ensayo exige consultar `pg_auth_members` después de **cada versión**, además de la auditoría final de 99. La revisión independiente debe tratar la posibilidad de autoconcesión del DBA como amenaza residual aceptada explícitamente, no como garantía criptográfica nueva.

## Realismo del laboratorio: DBA gestionado BYPASSRLS, runtime sin privilegios

El preflight de solo lectura del proveedor documentó que `postgres` de Supabase Sabora es `CREATEROLE/NOSUPERUSER/BYPASSRLS`. Por tanto, la prueba de instalación debe replicar **exactamente esta distinción administrativa** y no exigir al instalador permisos de aplicación RLS que el proveedor no necesita. El fixture Docker solo permite `BYPASSRLS` al operador DBA descartable creado por el superusuario del contenedor. Una segunda identidad **LOGIN separada, `NOCREATEROLE/NOBYPASSRLS`**, debe demostrar denegación real de `SET ROLE` y consulta directa de tablas. Nada aquí autoriza usar el DBA en API, PWA o procesos H3–H6, ni traslada `BYPASSRLS` a propietarios `SECURITY DEFINER`.
