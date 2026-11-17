# S42 — revisión técnica propia de integración PR #59 (17-11-2026)

> **Revisor:** ChatGPT mediante lectura directa de GitHub y contrastes de código y logs. **NO es una revisión independiente Codex/Antigravity, ni un APPROVE de GitHub, ni autorización del propietario.** Referencia fija evaluada: `7a2850523a738786857aa55c53d4f93688f0028f`. Informe estático/diferencial; no ejecuta ensayos adicionales. Separar integración a `main` de despliegue operativo.

## 1. Dictamen

- **MERGE A `main`: REQUEST CHANGES / NO-GO EN ESTE CORTE.** PR sin conflictos y código de laboratorio con 9/9 checks aplicables PASS, pero existe un punto de integración Stripe insuficientemente conectado/verificado en la composición que realmente monta la API, y falta la revisión independiente del delta correctivo acordada. El PR sigue Draft; requerir aprobación expresa de merge. Esta revisión propia no suple la independiente.
- **DESPLIEGUE/ACTIVACIÓN: NO-GO.** El runtime operativo deshabilita Stripe, la autorización host sigue deliberadamente fail-closed, no hay backup real ni restauración off-site material, Stripe sandbox remoto, equipo custodio Windows validado, reglas/rutas aisladas materialmente en VPS ni aceptación visual/operativa. Ningún recurso Fleetia puede involucrarse.
- **PARA CONTINUAR:** corregir/verificar el cableado Stripe sin habilitar indiscriminadamente pagos reales; ensayar el recorrido completo M3→M2→webhook→adaptador→PG17 (Charge ID sin expandir y controles negativos), ejecutar CI final y pedir revisión independiente solo cuando el propietario lo ordene. Un único PR #59.

## 2. Identidad Git, historial y resultados verificables

- PR [#59](https://github.com/jdlc86/CartaViva/pull/59) Draft, head auditado `7a2850523a738786857aa55c53d4f93688f0028f`, base `main` [`59866219971a78237d14d7820d9b18a086ac2bfc`](https://github.com/jdlc86/CartaViva/commit/59866219971a78237d14d7820d9b18a086ac2bfc), `mergeable=true`, estado `clean`, **160 ficheros cambiados, 182 commits**.
- PR [#60](https://github.com/jdlc86/CartaViva/pull/60) SHA `4ba655459dfe22a5cfd0a50f842000567e7919fc` **es ancestro exacto** de #59, acreditado por `compare`: status `ahead`, `behind=0`, merge-base igual a ese SHA. **No fusionar #60 por segunda vez.**
- Último SHA **funcional**: [`a728576fece07836f0497fce368f49659a7c2be6`](https://github.com/jdlc86/CartaViva/commit/a728576fece07836f0497fce368f49659a7c2be6). [Checks](https://github.com/jdlc86/CartaViva/commit/a728576fece07836f0497fce368f49659a7c2be6/checks): **9/9 SUCCESS aplicables** (`validate`, `generate-lockfile`, `pg17-nonsuperuser`, `client-browser`, `management-browser-smoke`, `two-pwa-installability`, `functional-ui-gate`, `web-publication`, `windows-offline-signer`), **2 opt-in SKIPPED** (`cv005-b2-disposable-integration`, `visual-final-acceptance-gate`).
- [`validate`, run 44054490725](https://github.com/jdlc86/CartaViva/actions/runs/44054490725) y [`generate-lockfile`, run 44054490379](https://github.com/jdlc86/CartaViva/actions/runs/44054490379) cerraron con SUCCESS. Log bootstrap: **1479/1479 tests** (bloque), **51/51** B3, `sabora_dual_backup_pg17_external_restore_ok`, **103 migraciones**, `restoredFrom=external-store-fixture`, `operationalReceipt=false`. La restauración es PG17/CI efímero, **no** restauración desde copia física real.
- El commit [`7a2850523a738786857aa55c53d4f93688f0028f`](https://github.com/jdlc86/CartaViva/commit/7a2850523a738786857aa55c53d4f93688f0028f) posterior a la batería cambia únicamente **dos archivos documentales**, continuidad S42 y tablero; texto `[skip ci]`, cero check-runs propios. Esto **no modifica código** y se acredita por compare, pero **no** debe presentarse como pruebas del SHA documental final.
- `main` a este corte **no está protegido** (`branches/main.protected=false`); los workflows no equivalen a ruleset GitHub. Configurar protección es decisión administrativa aparte, no declarar su existencia.

## 3. Hallazgo técnico integrado P1-INT-01 (bloqueo funcional condicionado a activar Stripe)

**Síntoma reproducible por lectura del flujo:** la reparación de P1-07 admite un Stripe `payment_intent.amount_capturable_updated` firmado con `latest_charge: "ch_..."`, pero **la composición M2, utilizada por M3, registra el webhook SIN inyectar adaptador Stripe**:

1. [`apps/api/src/m3-restaurant-candidate.mjs:1-10`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/apps/api/src/m3-restaurant-candidate.mjs#L1-L10) llama a `createM2RestaurantCandidate(options)`. [`apps/api/src/operational-runtime.mjs:1-25`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/apps/api/src/operational-runtime.mjs#L1-L25) utiliza el candidato M3.
2. [`apps/api/src/m2-restaurant-candidate.mjs:280-285`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/apps/api/src/m2-restaurant-candidate.mjs#L280-L285) llama a `registerH6StripeWebhookHttp(app,{secret:h6.webhook.secret,providerRepository:provider})` **sin `stripe:h6.stripe`**, aunque inmediatamente crea `payments` con `h6.stripe`.
3. [`apps/api/src/h6-stripe-webhook.mjs:72-83,113-129`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/apps/api/src/h6-stripe-webhook.mjs#L72-L129): si `latest_charge` es una cadena, `captureBefore=null`; el handler necesita `stripe.retrieveCapturableEvidence`, y sin `stripe` lanza `stripe_webhook_provider_unavailable`. [`apps/api/src/h6-stripe-webhook-http.mjs:27-35`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/apps/api/src/h6-stripe-webhook-http.mjs#L27-L35) lo traduce a **HTTP 503**, sin ACK ni mutación del ledger. Es fallo seguro (**fail-closed**) pero deja autorización pendiente.
4. Las pruebas que demuestran el caso feliz [`scripts/ci/h6-postgres17.test.mjs:1900-1932`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/scripts/ci/h6-postgres17.test.mjs#L1900-L1932) registran **directamente** el webhook con `stripe:stripeWebhook`, saltando el cableado M2; no acreditan su composición integral.
5. [`apps/api/src/operational-activation-manifest.mjs`](https://github.com/jdlc86/CartaViva/blob/7a2850523a738786857aa55c53d4f93688f0028f/apps/api/src/operational-activation-manifest.mjs) configura explícitamente `options.h6.stripe=disabledPayments()`, con proveedor que lanza `operational_payment_provider_not_enabled`; **no hay hoy pagos operativos habilitados**. No afirmar pérdidas reales. Simplemente pasar ese objeto como adaptador **no es suficiente**, pues no implementa `retrieveCapturableEvidence`.

**Severidad:** P1 para habilitación funcional del pago Stripe/primer despliegue íntegro; P2 de deuda de integración si se decide fusionar exclusivamente infraestructura/candidatura dormante con bloqueo explícito de pagos. Esta evaluación recomienda **REQUEST CHANGES antes de dar por cerrado el hito económico**.

**Reparación exigible:** crear una capacidad explícita y aislada de proveedor de evidencia Stripe de sandbox, e inyectarla en la composición M2 solo bajo contrato y seguridad; comprobar por test integrador sobre **M3/M2 reales**, Fastify, HMAC crudo, adaptador con Charge no expandido, GET de evidencia validada, PG17 sellado, ledger idempotente, permisos, contrapruebas de firma inválida, PI/Charge/importe/moneda/identidad incompatibles, proveedor inaccesible (503 sin recibo) y captura sin doble despacho. Mantener `disabledPayments()` en despliegue operativo hasta autorización Stripe, egress y credenciales. **No relajar los filtros fail-closed ni devolver 200 a evidencia insuficiente.**

## 4. Matriz de cierre y puertas no cubiertas

| Área | Resultado de esta revisión | Residual / puerta |
| --- | --- | --- |
| Historia Git y PR #60 | Ancestro confirmado, candidato sin conflictos | Fusionar solo #59 con autorización; #60 no por duplicado |
| Migraciones 100–103 / PG17 y roles | 103 aplicadas y evaluadas en CI efímero; 9/9 tests aplicables PASS en SHA funcional | Supabase real, identidad, ledger, DBA y permisos de ejecución NO evaluados |
| Stripe H6 y económico | Código JS y SQL 103 de checks de identidad/importe/EUR; negativo firmado y B3 51/51 PASS | **P1-INT-01:** composición real no inyecta consulta de Charge; Stripe remoto sin verificar y runtime operativo deshabilitado |
| Captura cifrada y restauración | `sabora_dual_backup_pg17_external_restore_ok` con replica CI simulada, ACL por columna, 103 migraciones | Copia real de Supabase, equipo externo independiente, réplica VPS y RPO/RTO sin evidencia; no equivalencia con CI |
| Windows Ed25519 | `windows-offline-signer` PASS con clave efímera CI | DACL y custodio reales sin aceptación material |
| Aislamiento, dos PWA, red | web-publication y laboratorios con nftables/Docker SUCCESS | Puerta real de host/root-owned/forced-command/enforcement, recepción de alertas, TLS/DNS y Fleetia intacta sin validación real |
| Conductor host | `authorizeHostOperation()` falla intencionalmente con `actuator_not_provisioned_or_validated` | No existe mecanismo de despliegue real habilitado; no conectar runners al VPS |
| UI | Cobertura funcional, PWA y Chromium PASS | Visual humano `SKIPPED`, baseline exacto y subalcances pendientes; no confundir con fallo de CI funcional |
| Revisión y gobierno | Revisión propia presente; #64 independiente evaluó SHA anterior | Revisión independiente del delta final pendiente, PR Draft y `main` sin protección verificada; autorización expresa de merge separada |

**Pruebas de esta revisión:** lecturas GitHub de PR, compare, código y logs, **sin ejecutar nuevos tests ni alterar código**. CI citada la ejecutó Actions. La documentación de este informe es parte del PR, no una aprobación independiente ni un dictamen de aceptación operacional.

## 5. Decisión propuesta

1. Resolver **P1-INT-01 en el mismo #59** y ejecutar un test **integrador de composición M3/M2** que reproduzca el `latest_charge` no expandido, no solo un test directo del parser.
2. Ejecutar 9/9 checks aplicables del SHA funcional correctivo, conservando negativas monetarias, restores y ventana real; distinguir los dos opt-in.
3. Solicitar revisión **independiente** del delta correctivo únicamente con orden expresa del propietario. No usar esta revisión propia como sustituto.
4. Obtener aprobación expresa de **merge** (no implica autorización de migración, backup, VPS o deploy). Antes de activar: cerrar todas las puertas materiales operativas, visuales y de aislamiento independientes. Mantener `main` y Fleetia intactos hasta entonces.

**Resultado: REQUEST CHANGES para integración económica completa; NO-GO operativo.**
