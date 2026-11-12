# CV-005 · Dictamen de compatibilidad PG17 CREATEROLE sin superusuario (12-11-2026)

> **ACTUALIZACIÓN CANDIDATA:** el PR #57 ahora contiene una propuesta de migración PG17 con transferencias de ownership y control de grants temporales; las afirmaciones históricas «migraciones intactas» se refieren a SHA anteriores. El SQL propuesto **no está aprobado**; el contrato normativo de cero membresías sigue vigente. Ver [decisión pendiente](SABORA_CV005_SUPABASE_OWNER_SEAL_EXCEPTION_PROPOSAL_2026-11-12.md).

**Naturaleza:** diagnóstico técnico de bloqueo crítico de primera migración, no modificación de normativa ni autorización operativa. [Contrato normativo de validación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [seguridad del actor SQL](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md), [informe de continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md).

## Objetivo y evidencias trazables

La base **Sabora solamente** observada en la sesión 36 tiene PostgreSQL 17.11 y cuenta `postgres` con `CREATEROLE`, pero **NO SUPERUSER**. Las **99 migraciones** de `main` habían pasado en el laboratorio con superusuario: eso **no** acredita compatibilidad con el proveedor. El [PR #57](https://github.com/jdlc86/CartaViva/pull/57) inició un segundo laboratorio `postgres:17-alpine` aislado `--network none`, sin secretos, para ejecutar la cadena como un LOGIN desechable `NOSUPERUSER/NOBYPASSRLS/CREATEROLE`.

Se reprodujeron sucesivamente:
1. [Run #43184585309](https://github.com/jdlc86/CartaViva/actions/runs/43184585309): `SET ROLE sabora_customer_session_fn_owner` no permitido en migración `20261021030000` al cambiar dueño de función.
2. [Run #43185379839](https://github.com/jdlc86/CartaViva/actions/runs/43185379839): con `createrole_self_grant=set`, `permission denied for schema sabora` al transferir propiedad; el nuevo owner necesitaría `CREATE` durante esa operación.
3. [Run #43185863218](https://github.com/jdlc86/CartaViva/actions/runs/43185863218): conceder `CREATE` temporal en la migración permite llegar a la ACL, que falla `permission denied for function verify_customer_session_hash` por falta de herencia del owner.
4. [Run #43186040203](https://github.com/jdlc86/CartaViva/actions/runs/43186040203): habilitar `createrole_self_grant=set,inherit` supera esas barreras, pero la migración `20261024190000_sabora_order_operation_actor_capability_candidate.sql` rechaza la **membresía automática** en `sabora_order_operations_fn_owner` con `unsafe_sabora_order_operations_fn_owner_membership`. Esa guarda exige que el propietario sellado no tenga membresías entrantes ni salientes; **no puede rebajarse incidentalmente**.

La [documentación oficial PostgreSQL 17](https://www.postgresql.org/docs/17/role-attributes.html) explica que un usuario no superusuario con `CREATEROLE` recibe automáticamente `ADMIN TRUE / SET FALSE / INHERIT FALSE` sobre el rol recién creado, en un grant del bootstrap superuser que ese usuario no puede revocar o alterar. Por tanto, **no existe base para afirmar que las 99 migraciones pueden instalarse tal cual con ese operador y sin revisión de la guarda de propiedad sellada**.

## Decisión técnica: NO-GO sin relajar seguridad

El intento exploratorio de añadir `CREATE` a 14 migraciones históricas y activar `set,inherit` en la sesión migratoria **se descarta**: no resuelve el contrato de NO MEMBRESÍA y alteraría 14 checksums de una cadena versionada. **Los 14 archivos quedan restaurados byte a byte desde `main` en el candidato**, y el laboratorio conserva como puerta negativa la comprobación real de membresía automática. El gate debe **fallar explícitamente** con `sabora_nonsuperuser_provider_no_go`, no marcar la cadena como aprobada.

### Condiciones de desbloqueo sin interpretación de normas

El propietario y revisión de seguridad/DBA deben definir y aprobar una de estas vías **antes de DDL real**:
- Provisionamiento de propietarios `NOLOGIN` sellados mediante un mecanismo privilegiado del proveedor capaz de respetar la guarda de ausencia de membresías y permitir asignaciones de ownership, con pruebas de roles y SQL equivalentes al contrato vigente.
- Una **decisión normativa explícita**, revisada independientemente, que resuelva la incompatibilidad de pertenencia del administrador de migraciones sin permitir membresía runtime ni ampliar las capacidades del actor. No modificar la guarda por conveniencia de CI.

Ambas requieren preflight específico Supabase PG17.11, roles preexistentes, 99 huellas de migración del SHA, copia lógica cifrada/restauración ensayada en plan Free, y autorización separada para Supabase. No hay camino acreditado hacia despliegue VPS hasta cerrar CV-005, CV-010 y CV-011.

## Evidencia y límites

El laboratorio **no tocó Supabase operativo, secretos, datos reales, VPS ni Fleetia**. Un resultado negativo de este gate no contradice las suites integradoras H6/Chromium aprobadas con el superusuario de Docker; revela una diferencia real de privilegios. Mantener el PR #57 Draft/NO-GO, sin integración mientras el contrato no tenga solución probada. No se ha realizado migración, backup real, bootstrap operativo ni aceptación visual.

**Estado del último SHA:** la puerta negativa está implementada; verificar el run nuevo de GitHub antes de declarar también confirmada su señal específica.
## Verificación adicional de revocación de membresía automática (12-11-2026)

Para evitar asumir que PostgreSQL 17 impide siempre a un `CREATEROLE` revocar su **propia** membresía otorgada automáticamente, la CI ahora incluye un intento efectivo `REVOKE sabora_ci_membership_probe FROM sabora_ci_migration_operator` sobre un rol completamente descartable. Consulta `pg_auth_members` después de la operación; emite únicamente `sabora_nonsuperuser_self_revocation_observed` o `sabora_nonsuperuser_self_revocation_unavailable`. No interviene en roles reales, no imprime el SQL de proveedor ni elimina la guarda de la migración. La conclusión **NO-GO para la cadena actual** sigue vigente: las migraciones no insertan ningún paso de revocación/acreditación de membresía antes de la verificación sellada. Es necesario confirmar los resultados de la nueva CI y definir cualquier protocolo nuevo con revisión normativa y de seguridad antes de tocar el proveedor.

## Comparación real del mismo guard SQL con dos procedencias del propietario

El ensayo ampliado extrae exclusivamente el `DO $role$ ... $role$;` original de `20261024190000_sabora_order_operation_actor_capability_candidate.sql` y lo ejecuta contra dos estados en PostgreSQL 17 aislado: (1) propietario creado por LOGIN `CREATEROLE` sin superusuario, donde debe bloquear cualquier membresía automática; (2) propietario creado por superusuario **únicamente del fixture desechable**, sin membresías, donde debe aceptar las mismas comprobaciones. Se verifican ambos caminos y se mantiene el NO-GO explícito para la instalación real, ya que Supabase `postgres` es `NOSUPERUSER` y la cadena de 99 migraciones sigue necesitando una solución al `SET ROLE`, `CREATE` y ACL. **Que el guard positivo pase no significa que la cadena funcione ni que Supabase permita ese aprovisionamiento.** La ejecución del nuevo SHA debe confirmar ambas ramas antes de actualizar el resultado.

## Resultado observado y criterio de cierre del ensayo (12-11-2026)

El [run GitHub Actions #43189804961](https://github.com/jdlc86/CartaViva/actions/runs/43189804961) sobre el SHA de código **`e89bc88cb02db9a6dfd76eb32a06b89fae4a8e74`** terminó `completed/failure` **por el NO-GO contractual esperado**, después de comprobar en PostgreSQL 17 real desechable, sin redes ni credenciales operativas, las siguientes señales:

- `sabora_nonsuperuser_role_preflight_ok`: LOGIN administrativo no-superusuario, `NOBYPASSRLS`, `CREATEROLE` acreditado.
- `sabora_nonsuperuser_self_revocation_unavailable`: imposible retirar con ese principal su membresía automática del rol desechable creado.
- `sabora_nonsuperuser_sealed_owner_provenance_verified`: **la misma guarda SQL original** rechazó el rol propietario creado por el LOGIN no-superusuario y aceptó uno creado **solo por el superusuario del fixture** sin membresías. El ensayo usa el código SQL exacto del archivo versionado, no una reconstrucción simplificada.
- `sabora_nonsuperuser_provider_no_go:automatic_createrole_membership_conflicts_with_sealed_owner`: la ruta ordinaria de migración no cumple las invariantes y permanece cerrada.

La prueba de aislamiento/contrato terminó PASS. El workflow de cobertura UI [#43189804933](https://github.com/jdlc86/CartaViva/actions/runs/43189804933) terminó SUCCESS. Los dos integradores H6 y Bootstrap del mismo SHA estaban todavía en ejecución en el último corte y **no constituyen evidencia de PASS hasta que terminen**; su eventual éxito no resolvería la incompatibilidad. **No hay 99 migraciones ensayadas con éxito en Supabase ni bajo ese principal.**

**Resultado del bloque:** diagnóstico contractual completo y reproducible, **NO-GO para instalación**. No se autoriza ni presume una cuenta elevada para el proveedor. Todo diseño de despliegue que requiera rol superusuario debe documentar expresamente que el `postgres` de Supabase Sabora `17.11` es `NOSUPERUSER` (aunque el preflight read-only mostró `BYPASSRLS`, que nunca debe emplearse en runtime). Solo el DBA/seguridad y una decisión/procedimiento normativo revisado podrán desbloquear el modelo de creación/propiedad de funciones. No se tocaron migraciones históricas, esquema Sabora operativo, roles/contraseñas reales, VPS ni Fleetia.

## Restricción comprobada en el proveedor gestionado (S37-5, solo lectura)

Se ejecutó un SELECT adicional exclusivamente en el proyecto de restaurante Supabase `byhvmumqivmunkmomhup` y cuenta conectada RESTAURANTE. `current_user=postgres`; el rol interno `supabase_admin` **existe**, pero `pg_has_role(current_user,'supabase_admin','SET')=false` y `pg_has_role(current_user,'supabase_admin','MEMBER')=false`. Se observaron 9 membresías directas con `SET OPTION` y 8 con `ADMIN OPTION` para `postgres`; sus identidades no se usaron para asumir roles ni extraer permisos. Esto **no demuestra que no exista ninguna herramienta administrativa del proveedor**, pero sí descarta presumir que este login pueda convertirse directamente en `supabase_admin` para reproducir el control positivo del laboratorio.

**Decisión técnica acotada:** no se puede ejecutar la cadena actual de 99 migraciones usando como justificación un supuesto acceso a superusuario: el `postgres` del proyecto real es `NOSUPERUSER`, sin membresía del rol interno `supabase_admin`; su `BYPASSRLS` administrativo no es un permiso de superusuario ni es aceptable como identidad de ejecución de la aplicación. Sin aprobación formal de DBA/seguridad, procedimiento oficial verificable del proveedor o nueva decisión normativa, permanece `NO-GO` para CV-005. No se creó ni modificó ningún rol real, función, tabla, credencial, red o recurso del VPS.

## Nueva candidatura de instalación sin SUPERUSER (pendiente de resultados y aprobación)

El candidato del PR #57 modifica versiones **aún no aplicadas** de la cadena para emplear transferencias de ownership con `CREATE` y membresías de rol **limitadas a la transacción**, y para que las guardas aborten toda membresía salvo el grant administrativo automático `ADMIN TRUE/SET FALSE/INHERIT FALSE` del DBA instalador. Se normalizan las transferencias de funciones multilineales y las revocaciones masivas de ACL de owners. Estos cambios afectan checksums y **no están autorizados para instalación ni fusión**. Se comprobará la ejecución de las 99 migraciones reales y la ausencia de grants temporales, así como la batería H6 anterior en el mismo SHA. Cualquier fracaso es un NO-GO, no una excepción para desactivar los controles. La posible aprobación normativa y la aprobación del DBA son puertas diferentes de la CI.
