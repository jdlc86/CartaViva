# Encargo Codex S42 — revisión independiente del delta correctivo del PR #59

**Fecha:** 2026-11-17  
**Repositorio único:** `jdlc86/CartaViva`  
**PR integrador:** [#59 (Draft)](https://github.com/jdlc86/CartaViva/pull/59), rama `docs/sabora-dual-backup-vps-offsite-20261113`.  
**Base de comparación:** [informe S41 independiente](../reviews/SABORA_S41_CODEX_INDEPENDENT_REVIEW_PR59_2026-11-16.md) y [commit inicial de publicación de su informe `d044981a`](https://github.com/jdlc86/CartaViva/commit/d044981a8d18bda823cb43320b73582d69efed52).  
**SHA provisional a verificar antes de empezar:** `e2b6faa8d37ea6217f32c2dd5cbe7cabbbfac893`. Si el HEAD cambió, usar el **HEAD real**, explicar su diferencia y obtener CI del SHA correcto. No heredar una batería verde de otro árbol.  
**Continuidad:** [S42](../handoffs/SESSION_42_HANDOFF_2026-11-17.md), [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).  
**Objetivo:** revisión **crítica y reproducible**, sin autovalidación, de las correcciones P1-07 / P2-08 / P2-09 / P2-10 y de las regresiones posibles en H6, backup, gobernanza y aislamiento; emitir dictamen GO/NO-GO de **merge técnico**, distinto de la autorización del propietario y del GO operativo.

## 0. Contratos y límites

Primero leer `AGENTS.md`, `docs/REQUISITOS_FUNCIONALES.md`,
`docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`,
`docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`,
`docs/DESIGN_SYSTEM_CONTRACT.md`,
`docs/design/APPROVAL_REGISTER.md`,
`docs/SABORA_AUTHORIZATION_GATE.md`,
`docs/architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md`,
`docs/architecture/SABORA_GOVERNED_RELEASE_V1.md`, el [informe S41](../reviews/SABORA_S41_CODEX_INDEPENDENT_REVIEW_PR59_2026-11-16.md) y el tablero vivo. **La normativa GitHub prevalece sobre los handoffs.** `#60` es ancestro de `#59`; **no duplicar merge**.

**No modificar código, no crear PR adicional, no fusionar `main`, no ejecutar despliegue, migración Supabase real, acceso VPS/Gateway ni acciones sobre Fleetia u otros servicios.** No usar claves Stripe reales, claves privadas, secretos, datos reales ni credenciales operativas. Se permite reproducir en laboratorio efímero propio, con identidad SQL/no-superusuario y mocks inyectados justificados. No afirmar evidencia real de hardware Windows doméstico, backup externo, Stripe remoto o aceptación visual por obtener CI verde.

## 1. Integridad del webhook Stripe — P1-07 y P2-08

Examinar `apps/api/src/h6-stripe-webhook.mjs`, `h6-stripe-webhook-http.mjs`, `h6-stripe-adapter.mjs`, `h6-provider-repository.mjs`, las funciones SQL de migraciones 100/101, tests HTTP y pruebas PG17. Confirmar realmente:

1. La firma **HMAC sobre bytes originales** se comprueba antes de consultar Stripe o escribir SQL. Rechazar `livemode`, versión, objeto, cuenta, fecha, firma y payload no admitidos; no variar artificialmente la semántica de respuesta HTTP.
2. `payment_intent.amount_capturable_updated` con `latest_charge:"ch_..."` válido no devuelve 400 de parser; se recupera Charge expandido mediante solicitud REST autenticada acotada y se valida PI, Charge, pedido, céntimos, EUR y `capture_before` sin inventar vigencia.
3. Payload expandido, payload no expandido, firma inválida, Charge ausente o distinto, moneda/importe incoherentes, error 4xx/5xx/transitorio de Stripe, PI ya no capturable, reintento y duplicado SQL. Comprobar SQL real del ledger con deduplicación por ID y hash, concurrencia y cambios de orden; un `200` HTTP no puede acreditar lo que no persiste el ledger.
4. No aceptar operaciones monetarias por una nueva vía con grants excesivos ni ignorar la distinción `pay_now`/`pay_at_end` o pagos externos operativos. Verificar que P1-01, P1-02, P1-04, P1-05, P2-03 y P2-06 continúan corregidos.

Distinguir pruebas focalizadas de regresión integradora HTTP/HMAC/PG17 en el SHA real. Registrar pasos, resultados y límites si alguna reproducción no es viable.

## 2. Copia consistente y procedencia verificable — P2-09

Inspeccionar `scripts/ops/sabora-postgres-snapshot.mjs`,
`sabora-encrypted-backup-bundle.mjs`,
`sabora-encrypted-backup-cli.mjs`,
`scripts/ci/sabora-dual-backup-postgres17.mjs`,
`sabora-backup-roles.sql`, `sabora-backup-inventory.sql`,
runbook de backup y pruebas.

1. Verificar que una transacción `REPEATABLE READ READ ONLY` exporta un snapshot y **sigue abierta** mientras ambos `pg_dump --snapshot` importan el mismo ID y el inventario usa `SET TRANSACTION SNAPSHOT`. Identificar carreras de cierre precoz, DDL conflictivo, escritura concurrente, cambios de secuencia/global roles, reintentos y capturas parciales.
2. Verificar la **fuente material**: host Supabase esperado y TLS `verify-full`, no solo un `sourceProjectRef` declarativo. Comprobar el pin del system identifier aprobado por canal independiente, parámetros de conexión/`PGOPTIONS`/usuario/puerto, argumentos e inyección, comparaciones antes y después, y límites reales del pooler. Si el identificador de sistema no demuestra por sí mismo proyecto Supabase, elevar la limitación, no dar aprobación ficticia.
3. Verificar que el esquema/manifiesto cifrado V2 vincula snapshot, sistema, base, tree SHA, hashes y AAD, rechazando sustituciones/tamper; que V1 no puede usarse para captura **operativa**; roles globales no pretenden consistencia MVCC ficticia.
4. Inspeccionar prueba de recuperación desde réplica externa en **PG17 desechable**, origen equivocado, escritor concurrente/DDL, daño, claves incorrectas, borrado seguro de staging y separación física real **no demostrada**. Confirmar frontera Sabora-only, sin cambios Docker/host/Fleetia.

Distinguir test de laboratorio vs backup realmente capturado desde Supabase, copia física externa, restauración operativa y RPO/RTO; no heredar estos últimos de CI.

## 3. Herramienta offline Windows — P2-10

Verificar `scripts/ops/sabora-sign-release-approval.mjs`, `tests/sabora-governed-deployment.test.mjs` y job `windows-offline-signer` en `.github/workflows/ci.yml`. Probar/inspeccionar:

- `node <ruta_cli>` sin argumentos -> **exit != 0** y error legible, nunca silencio exitoso en Windows.
- Con clave privada Ed25519 de prueba fuera del checkout -> `*.json`, `*.sig`, `*.pub.pem` y verificación cruzada por `verifyReleaseAuthorization`; sin sobrescritura, rutas duplicadas ni directorios de salida inseguros.
- No atribuir al comprobante de hash de ACL NTFS un control material de ACL si **solo se valida la forma**, ni suponer que el runner Windows replica custodias y permisos del portátil del propietario. Documentar esta limitación como hallazgo si es relevante.

## 4. Laboratorio, CI y red

- Comprobar la batería final y sus evidencias **por SHA**: `validate`, `generate-lockfile`, `web-publication`, `pg17-nonsuperuser`, Chromium de ambas PWA, instalación y gate UI. Identificar `SKIPPED` explícitos y no afirmar PASS mientras haya `IN_PROGRESS` o `FAIL`.
- Evaluar `scripts/ci/sabora-nftables-enforcement-lab.sh`: la modificación S42 espera a que los **servidores de fixture** estén listos antes de probar tráfico; confirmar que las negativas siguen estrictas, los namespaces son desechables, el host no cambia y el rollback borra reglas. El anterior SHA `150ec742` tuvo `web-publication` FAIL antes de aplicar nftables; el SHA `a424f2f1` obtuvo `web-publication` PASS y Windows 5/5 PASS, pero su CI `validate` y `generate-lockfile` FAIL por el orden de un test estático al anteponer el nuevo job Windows. La corrección `e2b6faa8` restaura ese orden sin cambiar el test. **Verificar CI propia de `e2b6faa8` o HEAD posterior antes de cualquier dictamen.**
- Si el cambio ha provocado otro fallo, reproducirlo sin omitir ni rebajar pruebas; hacer recomendaciones concretas por archivo/función y severidad.

## 5. Resultado único requerido

Crear un informe inmutable en
`docs/reviews/SABORA_S42_CODEX_INDEPENDENT_DELTA_PR59_2026-11-17.md`, en **la misma rama del PR #59**, mediante **commit exclusivamente documental** y publicar en [PR #59](https://github.com/jdlc86/CartaViva/pull/59) un comentario que incluya la URL absoluta del informe, SHA examinado, SHA documental y dictamen **GO/NO-GO/REQUEST CHANGES**. No inventar aprobación GitHub independiente si la identidad autora no puede usar `APPROVE`; el comentario y el informe son evidencia técnica.

El informe contendrá: genealogía exacta, ficheros inspeccionados y líneas, reproducción/observaciones, matriz P1-07/P2-08/P2-09/P2-10 (CERRADO/PENDIENTE/NUEVO), regressiones P0–P3, transacciones PG17 y HTTP ejecutadas, CI por job y SHA, controles `SKIPPED`, limitaciones, propuestas si hay defectos, y dictámenes **separados** para merge técnico y despliegue real. La autorización del propietario es siempre otra puerta.

**NO-GO por defecto** mientras haya fallos críticos o pruebas finales incompletas. No modificar el informe S41 original ni añadir código como parte de este encargo independiente.
