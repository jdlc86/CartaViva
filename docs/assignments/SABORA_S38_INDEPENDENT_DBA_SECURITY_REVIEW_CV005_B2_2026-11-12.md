# Sabora / CartaViva — encargo de revisión INDEPENDIENTE: CV-005 (#57) + Bloque 2 (#58)

**12-11-2026 · Estado: ENCARGO PENDIENTE; no es una revisión efectuada, aprobación ni GO.** Ámbito: **exclusivamente `jdlc86/CartaViva`**, restaurante único Sabora, cliente y gestión en PWA independientes. Fuentes normativas: contratos de `main` y decisión CV-005 candidata aprobada en diseño por el propietario; un handoff no crea reglas.

## 0. Identidad del revisor y preparación segura

Esta revisión debe realizarla **otro agente / revisor que no haya escrito los cambios evaluados**. Una nueva sesión del mismo autor sin independencia material no debe certificar su propio trabajo. Si no es posible acreditar independencia, emitir informe técnico **sin aprobación independiente**, indicando la limitación.

El checkout de Codex Desktop puede estar desactualizado. Antes de emitir hallazgos, `git remote -v`, `git status --short --branch`, `git fetch --prune origin`, comparar HEADs y preservar todo trabajo sin commit. **Prohibido** `reset --hard`, `git clean -fd`, `push --force`, corregir directamente ramas ajenas o mezclar los PR. Para inspección sin escribir, usar `git show`, `git diff` o worktrees independientes; no abrir nuevos PR.

**Referencias inmutables para la revisión:**
- [PR #57, CV-005](https://github.com/jdlc86/CartaViva/pull/57), SQL/head **`9c943e5b6ae2fa39e5abd18fc604688aa5689e5d`**, 99 migraciones de la cadena, **59 SQL modificadas**, 67 archivos del PR. Opción A aprobada solo para la arquitectura DBA, no para instalación o integración.
- [PR #58, B2](https://github.com/jdlc86/CartaViva/pull/58), **SHA de código comprobado `b0d6412191dca6961175e9ba2fba37f81ba7749c`**. Los commits siguientes hasta el corte del encargo solo documentan el resultado; **comprobar SHA de código actual antes de revisar**.
- [Informe cruzado y acta 4/4](https://github.com/jdlc86/CartaViva/blob/feat/sabora-s38-operational-activation-20261112/docs/reviews/SABORA_S38_CV005_BLOCK2_CROSS_PR_TECHNICAL_REVIEW_2026-11-12.md); [continuidad S38](https://github.com/jdlc86/CartaViva/blob/feat/sabora-s38-operational-activation-20261112/docs/handoffs/SESSION_38_HANDOFF_2026-11-12.md); [tracker](https://github.com/jdlc86/CartaViva/blob/feat/sabora-s38-operational-activation-20261112/docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md).

## 1. Evidencia ya ejecutada (NO revalidarla por simple confianza)

**Código `b0d64121` + SQL `9c943e5b`** pasaron:
- [CV005 + B2, Actions #43274919031](https://github.com/jdlc86/CartaViva/actions/runs/43274919031): 99/99 migraciones reales como PG17 `CREATEROLE/NOSUPERUSER`, 12/12 controles, H6 bloques 1/2A/2B, PostgreSQL/HMAC/HTTP/Chromium y dos PWA.
- [Sabora CI/H6 #43274918997](https://github.com/jdlc86/CartaViva/actions/runs/43274918997): seguridad, composición, H6 y Docker candidato.
- [Bootstrap PG17 #43274918986](https://github.com/jdlc86/CartaViva/actions/runs/43274918986): 51/51 PG17; prueba TLS real en runner vía gateway con CA/SNI/hostname y JWKS HTTPS local, arranque desde ficheros con 17 LOGIN físicos de laboratorio.
- [Functional UI #43274918989](https://github.com/jdlc86/CartaViva/actions/runs/43274918989): gate funcional verde, aprobación visual humana **`skipped`**.

**Límite:** #58 usa temporalmente los 99 archivos SQL del SHA de #57 **dentro del runner**, **no existe SHA de árbol Git fusionado**. La base gestionada de Supabase no participó, ni el VPS ni el firewall real; los sockets a upstream del fixture se redirigen a loopback. La prueba de las dos PWA y la del entrypoint operacional son integradas de laboratorio, **no navegación real de PWA contra un Compose operacional desplegado**. No equiparar 4/4 verde con revisión independiente.

## 2. Auditoría DBA/P0 de PR #57 — obligatoria, no superficial

Leer y citar versiones concretas del contrato [vinculación actor HMAC](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md), [autorizaciones](../SABORA_AUTHORIZATION_GATE.md), [método validación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) y la [decisión DBA candidata de #57](https://github.com/jdlc86/CartaViva/blob/feat/sabora-cv005-pg17-provider-compat-20261112/docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md).

Auditar las **59 versiones SQL cambiadas** y las **99 versiones de la cadena** como conjunto. En especial:

- Diferencia entre el contrato P0 de `main` («owner sin membresías») y la opción A aprobada en diseño: **única** membresía automática al DBA `CREATEROLE, NOSUPERUSER`, con `ADMIN TRUE / SET FALSE / INHERIT FALSE`. Evaluar la **amenaza residual real**: un DBA puede auto-concederse `SET TRUE` y asumir el owner. No presentarlo como imposibilidad criptográfica, ni autorizar el uso del DBA por runtime.
- Ownership y privilegios efectivos del operador, propietarios `NOLOGIN`, capacidades `NOLOGIN` y cada LOGIN mínimo. `SECURITY DEFINER`, `search_path`, `EXECUTE` solo a roles exactos, no grants `PUBLIC`, `anon` o `authenticated`. `FORCE RLS` y no lectura directa de keyrings o tablas privadas.
- `GRANT/REVOKE` temporales encerrados en una transacción por versión, limpieza **antes de COMMIT**, estado `pg_auth_members` tras cada versión; grants automáticos del proveedor vs fugas adicionales. Checksums/ledger real: no reescribir SQL sobre una instalación previa ni declarar que un hash histórico ya fue aplicado.
- Las capacidades HMAC deben verificar identidad HTTP→SQL sin actor arbitrario, `session_user`, audiencia, expiración, replay, concurrencia, revocación, keyring y denegación de rol. Probar que el login runtime **no** puede `SET ROLE` al owner, ni administrar roles, ni usar `BYPASSRLS`.
- Compatibility gap **Supabase gestionado PG17.11/`supautils`** y hooks del proveedor: PostgreSQL Docker no replica todas las restricciones; especificar preflight/test adicional para cerrar ese riesgo sin escribir SQL en el proveedor.

**No modificar las SQL de #57 como atajo para pasar los gates.** La decisión de diseño opción A sigue sin ser autorización para DDL operativo.

## 3. Auditoría B2 de PR #58 — obligatoria

- **Entry-point y rutas:** `apps/api/src/operational-server.mjs`, `operational-runtime.mjs` y factory H3–H6/M3. Demostrar que **sin** JWKS+SQL/ACL+notifier positivos no se abre listener HTTP; `/ready=503` ante pérdida de dependencia y `/health` separado. Comprender los límites de caché JWKS y de los pools, no confundir prueba simulado con real.
- **Configuración/secretos:** fichero de manifiesto, política egress compartida y `createFileSecretResolver`: rechazo de rutas/symlinks/traversal, credenciales `postgres`/`service_role` en runtime, placeholders, logs/stack sensibles y fuga a ambas PWA. Auditoría de creación/cierre de **17 capacidades + 2 notifiers**, pool por LOGIN, límites, cierre parcial, SIGTERM, reinicio y rotación.
- **TLS egress:** exactitud de destinos SQL/JWKS y protocolos; TLS de `pg` verifica CA y nombre de host, no solo `sslmode=require`. Gateway SNI y SSLRequest PG, destinos DNS públicos, defensa contra SSRF, carreras de cierre/`EPIPE`, bypass por puerto no listado, posible fuga hacia redes privadas, y separación egress de ingress.
- **Compose:** nombre de proyecto `sabora` según normativa, health-only y operativo **mutuamente excluyentes**, red Sabora-only, sin redes externas ni docker socket, sin puertos públicos extra, sin volúmenes/capacidades ajenos, montajes read-only, user no-root, firewall externo **pendiente de inspección**. No ejecutar el Compose en el VPS.
- **Datos/recuperación/observabilidad:** backup cifrado autenticado con checksum, restauración desde fixture y negativa de corrupción, cierre limpio; logs y métricas de lista cerrada sin JWT/QR/HMAC/IP/SQL/headers, recepción de alertas externas **no validada**. E2E PG17/HTTP/HMAC/dos PWA, y límites del ensayo de TLS local.

## 4. Preflight READ-ONLY del proveedor ya realizado (fuente: consulta del proyecto exacto)

Proyecto restaurante `byhvmumqivmunkmomhup`, **ACTIVE_HEALTHY**, PostgreSQL **17.11**, administrador de sesión `postgres` con **`CREATEROLE=true`, `NOSUPERUSER`, `BYPASSRLS=true`**; extensión `pgcrypto` presente; esquema `sabora` **ausente**, **0 roles Sabora**, migraciones registradas **0**. `ssl=on` del servidor no prueba **SSL enforcement** para clientes. La conexión directa normalmente utiliza IPv6 y el pooler de sesión proporciona compatibilidad IPv4, pero **el host/CA/credenciales reales deben comprobarse**; no inventar endpoints de pooler ni habilitar cambios remotos.

Fuentes actuales Supabase: [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) (su activación reinicia la base) y [IPv4/conexiones directas/pooler](https://supabase.com/docs/guides/platform/ipv4-address). La consulta anterior **no autoriza** a ejecutar un test de migración real ni rotar roles, ni certifica estado de firewall/pooler/backup.

## 5. Resultado que el revisor DEBE entregar

1. **Dos dictámenes separados en GitHub, uno por PR**, con identidad y condiciones de independencia del revisor, archivos y líneas examinados, alcance real de diff/SQL, amenazas, acciones reproducibles, clasificación P0/P1/P2, y decisión **`APPROVE` / `REQUEST_CHANGES` / `COMMENT`** según evidencia. Un `COMMENT` no es aprobación. **No auto-aprobar código propio**, incluso si Actions pasa.
2. Matriz **hallazgo → norma literal → código/ruta/versión SQL → prueba que sí lo cubre → prueba que falta → severidad**. En particular evaluar cambios históricos de 59 SQL y el riesgo de autoconcesión DBA.
3. Determinar **si hay un blocker técnico real** para crear el candidato de árbol único, no solo «falta producción». Si lo hay, corregirlo en el PR existente **solo con encargo explícito de implementación**; el revisor no cambia el objeto auditado durante el mismo dictamen sin declararlo.
4. Checklist de STOP para proveedor: custodia/backups/restore, variantes conexión IPv6/pooler, TLS/hostname/enforcement, identidad SQL restringida, alertas, aislamiento VPS Sabora-only y aprobación visual humana. Diferenciar requisitos normativos de decisiones pendientes.
5. **No merge, no DDL, no creaciones de roles/secretos, no instalación ni reinicio de VPS**, ni cambios de recursos de Fleetia o de cualquier otra app. Pruebas dinámicas únicamente en GitHub Actions descartable de CartaViva, sin datos reales ni gastos nuevos.

**Cierre solicitado:** dictamen independiente verificable enlazado desde #57 y #58 y, solo si es favorable, propuesta de una **integración única** con nuevo SHA y baterías completas. **Hasta ese dictamen: NO-GO de merge/operación**.
