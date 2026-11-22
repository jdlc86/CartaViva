# Propuesta S48-20 — excepción normativa S38/S46 para observación DBA en GitHub Actions (PENDIENTE DE APROBACIÓN)

**Estado formal:** PROPUESTA, **NO VIGENTE**, no modifica por sí sola [S38](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md) ni [S46](SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md). Preparación autorizada por el propietario al responder «Okk» a la pregunta concreta «¿Autorizas que prepare esa modificación normativa limitada, exclusivamente para el preflight de solo lectura S46 mediante GitHub Actions protegido?». **No hubo autorización para activar secretos, crear roles, emitir firmas, ejecutar migraciones, integrar el PR o desplegar.** La activación exige aprobación explícita de este texto, integración controlada y puertas separadas por operación.

## 1. Hechos comprobados y problema real

- Repositorio **único** `jdlc86/CartaViva`, visibilidad **pública** comprobada en GitHub API el 22-11-2026; no afecta a `jdlc86/GestionIntegral_Rutaa` ni al VPS compartido.
- S38 §0.5 prohíbe que secretos operativos pasen por GitHub Actions; S46 exige la lectura DBA con `TLS verify-full`, identidad de clúster y catálogo inicial firmado antes del SQL.
- Existe evidencia real de catálogo Sabora inicialmente vacío del 22-nov ([acta S48-18](../reviews/SABORA_S48_SUPABASE_S46_READONLY_PREFLIGHT_2026-11-22.md)), pero la conexión del conector únicamente demostró TLS 1.3, **no** `verify-full` y no produjo firma DBA.
- El PR #85 candidato prepara `plan` sin secretos y `observe` fuera de GitHub. **No hay actualmente una ejecución autorizada dentro de Actions.**
- La contraseña `postgres` tiene privilegios administrativos; un script SQL en modo `READ ONLY` **NO convierte esa credencial en lectura exclusiva**. Queda **terminantemente prohibido** colocar esa contraseña, `service_role`, `supabase_read_only_user` con `BYPASSRLS`, credenciales de Fleetia o claves HMAC/Stripe/backup en GitHub.
- GitHub confirma que en repositorios públicos los GitHub Environments pueden utilizar secretos y revisores obligatorios. **La existencia y configuración efectiva de ese Environment no están comprobadas todavía**. `Required reviewers` protege la activación del job, pero no es una firma DBA ni garantiza independencia. El riesgo de un flujo de trabajo malicioso tras comprometer `main` sigue existiendo.

## 2. Texto propuesto de excepción al veto S38 (único alcance)

**Solo después de aprobación expresa del propietario y publicación del contrato normativo aprobado en main**, para el **primer preflight S46 de Sabora con datos ficticios**, se permite que **una contraseña de una identidad PostgreSQL técnica dedicada y verificablemente sin privilegios de escritura, administración, bypass RLS ni lectura general de datos de aplicación** exista como secreto del **GitHub Environment `sabora-dba-readonly`**. La credencial no es el password administrador `postgres`, ni un runtime login, ni una clave de firma/restore, ni se escribe en Git, artifacts, logs o chat.

La excepción **no** admite secreto en variables de repositorio, secretos globales, Codespaces de desarrollo, workflows de PR/push, archivos TAR, PWA, VPS, runner autohospedado ni jobs compartidos con publicación/despliegue. El environment debe estar restringido a `main` protegido, a un job exclusivo `workflow_dispatch` manual del propietario con SHA exacto y a reglas de revisión humana compatibles con el plan GitHub real; registrar la configuración constatada (no asumirla). Si no se pueden activar esas reglas realmente, **STOP**. Controles de cambios sobre `main`, revisión del workflow y minimización de permisos `GITHUB_TOKEN` son obligatorios. La custodia debe rotar/revocar el secreto después del ensayo y ante cualquier anomalía; nunca almacenar una contraseña DBA de larga vida en Actions.

**Prohibición intacta** para todas las otras credenciales operativas (API, PWA, Stripe, servicios, root, release/backup, roles SQL de aplicación). No habilitar carga de SQL mutante, `apply_migration`, `supabase db push`, `docker`, SSH, backups, despliegue, instalación ni credenciales compartidas con Fleetia.

## 3. Identidad técnica y conflicto con «ámbito Sabora vacío»

El diseño requiere **una identidad nominada `sabora_s46_catalog_observer`**, de vida limitada y autenticación propia. Como la cadena S46 actual exige «cero roles Sabora», **no se puede crear esa cuenta y afirmar luego literalmente que el estado continúa vacío**. Para evitar falsificar el catálogo, esta propuesta exige una variante cerrada del contrato:

- `sabora-initial-empty-preflight/v1` conserva su significado original: **cero roles Sabora**, aplicable a la ruta DBA privada original.
- La futura variante `sabora-initial-empty-preflight/v2` (a especificar, implementar, probar y aprobar por separado **antes de uso**) admitiría **EXACTAMENTE** `sabora_s46_catalog_observer` como la única identidad técnica previa, contabilizada en el inventario real y en `catalogSha256`. Todos los esquemas, funciones, relaciones, ledger y roles de aplicación Sabora siguen ausentes. Su creación se registra como intervención previa propia, no como «cero cambios en Supabase».
- El observador deberá tener `LOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`, `NOBYPASSRLS`, `NOREPLICATION`, sin privilegios `CREATE` sobre esquemas/base, sin `SET ROLE`, sin `INSERT/UPDATE/DELETE/TRUNCATE` sobre objetos persistentes ni lectura de datos de aplicación; el privilegio `TEMP` **debe observarse por separado** porque PostgreSQL puede concederlo a `PUBLIC` y no cabe simular que un `REVOKE` solo al observador neutraliza la concesión común y sin memberships salvo, si PostgreSQL 17/Supabase la impusiera, la concesión administrativa automática exacta documentada por CV-005 (y sin `SET`/`INHERIT`). Cualquier desviación = STOP.
- **Trampa real de privilegios compartidos:** PostgreSQL 17 concede normalmente `CONNECT` y `TEMPORARY` a `PUBLIC` en bases nuevas. Si el observador hereda `TEMP` desde `PUBLIC`, una revocación dirigida únicamente a su rol **no es una barrera efectiva**; revocar `TEMP` a `PUBLIC` afectaría el proyecto administrado y queda **prohibido sin nuevo análisis/aprobación por impacto ajeno**. La excepción propuesta deberá medir este privilegio y documentar si cabe limitarlo sin tocar grants compartidos; si no, **STOP** o decisión de riesgo expresa y diferenciada antes de activar credenciales en Actions. La transacción `READ ONLY` del script no sustituye una restricción de privilegios de la cuenta. [PostgreSQL 17: default PUBLIC privileges](https://www.postgresql.org/docs/17/ddl-priv.html).
- Si `pg_catalog.pg_control_system()` requiere `EXECUTE` adicional, un DBA verificará la posibilidad de conceder **solo esa función** al observador en el proveedor sin conceder `pg_monitor`, `pg_read_all_data` ni capacidades de fichero. Si Supabase deniega la concesión, **STOP**; no elevar a admin ni cambiar el código para fingir identidad. Toda concesión y creación de rol es **DDL operativo sujeto a autorización SQL separada, específica y auditada**.
- La concesión automática de membresía al instalador por PG17 debe documentarse exactamente, no ignorarse al excluir el observador del conteo. La firma v2 tendrá una comprobación diferenciada de identidad/ACL/membresías de esta cuenta. Nunca sustituir firmas auténticas por un flag del workflow.

**Por qué no se puede activar inmediatamente:** el parser normativo existente de `sabora-initial-empty-preflight/v1` y su validador de expedientes de release **no aceptan** esta excepción, y hoy no existe el observador. Aceptar el secreto administrativo `postgres` como atajo sería una regresión grave de seguridad. Esta propuesta NO es aprobación implícita de una nueva versión de payload ni permiso para crear el rol.

## 4. Flujo automatizable propuesto, con autorización explícita por operación

1. **Merge autorizado del PR de código/norma aprobada, CI robusta 5/5 exact-main.** Verificar host proyecto `byhvmumqivmunkmomhup` y alcance exclusividad Sabora. El job `plan` no tiene secretos y comprueba SHA/manifest.
2. **Permiso propio para DDL de provisionamiento del observador**, fuera de GitHub Actions, con inventario anterior y posterior, role flags/ACL, cuenta de corta vigencia y contraseña temporal custodiada; no se crearán roles desde la automatización. Revisar compatibilidad del proveedor y matriz de permisos, sin `DROP` o reset de otros objetos.
3. **Environment protegido real**, público y restringido a `main`; registrar revisores, revisión de cambios, mecanismo de aprobación y política de expiración de la credencial. Instalar exclusivamente contraseña de observador, CA verificada y pin SHA256 del `system_identifier`; fuentes de verdad de estos valores en custodia separada de GitHub. Prohibido inventarlos.
4. Con **autorización propia para lectura S46**, job `observe` manual y exact-SHA: TLS `verify-full`, CA/hostname, inventario en snapshot `REPEATABLE READ READ ONLY`, validación de único observador y roles de aplicación ausentes, pid/SSL, digest de catálogo, `pgcrypto`, ledger ausente. Un error/host ajeno/CA inválida/privilegio excesivo produce FAIL.
5. **Resultado unsigned** acotado, sin secret/role password/SQL bruto en artifacts y retención máxima de 1 día. La firma real del DBA, custodia privada del catálogo original, control DDL concurrente y vínculo del snapshot no pueden ser sustituidos por el resultado verde de Actions. `dbaSigned=false`, `migrationExecutionAuthorized=false`, `operationalGo=false` hasta completar la puerta independiente.
6. **Otra autorización SQL exacta** para cadena de migraciones (103 archivos en `main@a5f0...` a fecha de propuesta), ejecutada fuera de este workflow, con ledger y política append-only S46/CV-005; nunca encadenar automáticamente `observe` a migración. Controlador/VPS/despliegue requieren autorizaciones y aislamiento independientes.

## 5. Riesgos que requieren aceptar o rechazar expresamente

| Riesgo | Contención propuesta | Residual |
|---|---|---|
| Compromiso de workflow o `main` | Rama protegida, revisión humana, job exact-SHA, environment y actor owner, tokens solo lectura | Podría exfiltrar la contraseña técnica mientras está vigente; **no es cero riesgo** |
| Credencial con capacidades de mutación | **No usar postgres**; rol propio auditado y sin CREATE/WRITE/TEMP/BYPASS/SET ROLE | Privilegios de `PUBLIC`/hooks Supabase deben comprobarse realmente; flags de rol no bastan |
| Role creado rompe estado inicial «vacío» | Variante normativa v2 explícita, inventario exacto y evidencia del rol | Requiere modificar el verificador de firmas y revisar el impacto en la secuencia genesis |
| TLS por pooler o IPv6 no funcional | Host directo aprobado + CA + `verify-full`; no fallback automático | GitHub-hosted runner puede no alcanzar IPv6 directa; si falla, **STOP** |
| Falsa independencia del workflow | Firma DBA separada y custodia del original, revisión técnica del SHA | Environment reviewers no son por sí mismos un DBA ni prueban catalog completo |
| Caducidad / cambios concurrentes | Snapshot de solo lectura, TTL firmado <=24h, control de DDL coordinado externamente | MVCC **no impide** DDL concurrente de otra sesión |
| Afectación Fleetia/VPS | GitHub no tiene SSH, Docker, VPS ni credenciales Fleetia en este workflow | Debe demostrarse aislamiento al instalar; no lo prueba este preflight |

## 6. Puertas de aceptación de esta propuesta

**No incluir credenciales ni habilitar `observe` en Actions hasta que se cumplan todas:**

- [ ] Aprobación explícita del propietario de la **excepción normativa concreta** y del contrato de observador/v2, separada del permiso de prepararla.
- [ ] Revisión técnica de seguridad/DBA sobre ausencia de bypass, `pg_control_system`, privilegios efectivos y compatibilidad real Supabase; si se aplica excepción de revisión interna S40, informe y aprobación del propietario por SHA.
- [ ] CI robusta y comprobación exact-main del candidato, negativa con passwords admin y destinos/pooler ajenos.
- [ ] Autorización **distinta** para crear/provisionar el observador en el proyecto Sabora, con permisos auditables.
- [ ] Verificación REAL de rama protegida, environment y revisores; contraseña del observador temporal en único Environment, CA y pin de identidad bajo custodia; nunca contraseña `postgres`.
- [ ] Firma DBA auténtica para `sabora-initial-empty-preflight/v2` y validador de release actualizado con regresión integral antes de ninguna migración.
- [ ] Autorización SQL de aplicación de migraciones **posterior y distinta**, y resto de puertas S46/S43 para deploy.

**Conclusión:** propuesta técnicamente plausible pero **NO-GO operativo** hasta resolver identidad/contrato v2 y controles reales. La excepción S38 no se da por vigente por estar en un PR o porque el usuario autorizó redactarla.
