# S42 — revisión independiente final de integración del PR #59

**Fecha de cierre:** 17-11-2026

**Autoría:** Codex, revisión independiente de las autoevaluaciones y correcciones previas

**PR revisado:** [#59 — Gobernanza, doble copia y primera puesta en marcha](https://github.com/jdlc86/CartaViva/pull/59)

**Dictamen técnico de integración:** **GO CON CONDICIONES**

**Dictamen operativo:** **NO-GO** para despliegue, SQL/Supabase real, Stripe real, VPS, copia externa física o Fleetia

No queda un defecto P0–P3 demostrado en el delta funcional final. Las condiciones del GO no son correcciones encubiertas: son las puertas de gobernanza ya vigentes —autorización expresa del propietario, conservar el árbol funcional auditado y fusionar únicamente #59—. Este informe no autoriza el merge ni ninguna operación real.

## 1. Ficha verificable y alcance

| Dato | Resultado |
|---|---|
| Repositorio y remoto | Exclusivamente `jdlc86/CartaViva`; `origin=https://github.com/jdlc86/CartaViva.git` |
| Base observada | `main@59866219971a78237d14d7820d9b18a086ac2bfc` |
| HEAD inicial y final revisado, antes de este informe | `c0d37e4ec91f96f1d859ecfa34cf65c267c1a2b6`; la rama no se movió durante la auditoría |
| Último SHA funcional | [`e29f4feb0e55598a13999552b651979181c6bf79`](https://github.com/jdlc86/CartaViva/commit/e29f4feb0e55598a13999552b651979181c6bf79) |
| Relación SHA funcional → HEAD | `c8951d37`, `1f1059ed` y `c0d37e4e` cambian únicamente cuatro documentos; no hay código, SQL, tests ni workflows posteriores a `e29f4feb` |
| Estado GitHub al cerrar revisión | PR abierto, Draft, `MERGEABLE`, base y head anteriores |
| PR #60 | `4ba655459dfe22a5cfd0a50f842000567e7919fc` es ancestro de `e29f4feb`; **no debe fusionarse por separado** |
| Árbol y método | Árbol principal limpio; revisión del SHA funcional en worktree separado, detached, sin `reset --hard`, `git clean` ni descarte de trabajo |
| Mutaciones realizadas | Solo este informe documental. Sin código, SQL, tests, configuración, merge, despliegue ni infraestructura |

Se aplicaron `AGENTS.md`, requisitos funcionales, contrato funcional consolidado y de consistencia, límite de proyecto, puerta de autorización, método de validación/observabilidad, release gobernado, runbook S40, contratos visuales y matriz de cobertura funcional indicados por el encargo. Los handoffs, tablero y revisiones previas se usaron como antecedentes y evidencias, no como fuente normativa ni como conclusión heredada.

La revisión diferencial de seguridad cubrió el rango `f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0..e29f4feb0e55598a13999552b651979181c6bf79`: 12/12 ficheros fuente de riesgo revisados, sus tests y SQL de apoyo, sin candidato de vulnerabilidad superviviente. No existe `SECURITY.md` en el repositorio; se aplicaron `AGENTS.md` y los contratos citados.

## 2. Matriz de riesgos y cobertura optimizada

| Riesgo | Ruta completa comprobada | Evidencia reutilizada del mismo SHA | Laguna real | Clasificación / ejecución mínima |
|---|---|---|---|---|
| Webhook Stripe no expandido, identidad y dinero | M3 de laboratorio → M2 → Fastify/raw HMAC → consulta de evidencia Stripe → rol proveedor → función SQL sellada → ledger/estado | [`validate`](https://github.com/jdlc86/CartaViva/actions/runs/44071673020): bloques 1, 2A y 2B PASS; [`generate-lockfile`](https://github.com/jdlc86/CartaViva/actions/runs/44071672978): B3 51/51 PASS | Stripe remoto no autorizado | **VERIFICADA en laboratorio**; revisión estática de código. No repetir PG17/Chromium |
| `pay_now`, `pay_at_end`, Stripe frente a `external` | PWA/HTTP → identidad cliente/staff → cuenta/ronda/intento → proveedor/evento → outbox/lectura | B3 51/51, negativos HMAC/roles/concurrencia y ambas PWA en `validate` | Dinero real y sandbox remoto no ejecutados | **VERIFICADA en laboratorio**; **NO OPERATIVA** externamente |
| Migraciones 100–103 y privilegios | runner PG17 no-superusuario → migraciones → owners NOLOGIN/`SECURITY DEFINER` → grants exactos → tests de RLS/roles | [`pg17-nonsuperuser`](https://github.com/jdlc86/CartaViva/actions/runs/44071673050) SUCCESS y bloques 2A/2B | Supabase operativo/DBA real prohibidos | **VERIFICADA en PG17 desechable**; **NO OPERATIVA** en proveedor |
| Backup V2 coherente y restaurable | endpoint/CA/system-id/ledger → `pg_export_snapshot` → roles/esquema/datos/inventario → AES-GCM → réplica externa fixture → restore PG17 | `sabora_dual_backup_pg17_external_restore_ok`: 103 migraciones, `restoredFrom=external-store-fixture`, `vpsReplicaUsedForRestore=false`, `operationalReceipt=false` | No existen recibos de copia física doméstica/VPS ni restore real | **VERIFICADA en laboratorio**; **NO OPERATIVA** físicamente |
| Firma offline Windows | draft/clave fuera de checkout → DACL efectiva → Ed25519 → outputs `wx` → verificación exact-SHA | [`windows-offline-signer`](https://github.com/jdlc86/CartaViva/actions/runs/44071673020/job/133999176060) 5/5 PASS en Windows 2022 | Custodia/DACL del PC propietario no observadas | **VERIFICADA en runner**; **NO OPERATIVA** en equipo real |
| Aislamiento de release y red | autorización inerte → Docker/nftables en namespaces efímeros → negativos → rollback | [`web-publication`](https://github.com/jdlc86/CartaViva/actions/runs/44071673020/job/133999175766): `sabora_nft_enforcement_lab_ok` y driver Docker PASS | VPS/host/Fleetia fuera de alcance | **VERIFICADA en laboratorio**; **NO EJECUTADA** en host real |
| Dos PWA y CV-012 | builds separados → SW por scope → navegación real → controlador correcto → offline/cache negativa | [`two-pwa-installability`](https://github.com/jdlc86/CartaViva/actions/runs/44071673033) SUCCESS; [`client-browser`](https://github.com/jdlc86/CartaViva/actions/runs/44071673018) y [`management-browser-smoke`](https://github.com/jdlc86/CartaViva/actions/runs/44071673119) SUCCESS | Aceptación estética humana pendiente | **VERIFICADA funcionalmente**; visual final **SKIPPED** |
| Trazabilidad UI | inventario funcional → fuentes/controles/escenarios | [`functional-ui-gate`](https://github.com/jdlc86/CartaViva/actions/runs/44071672981/job/133999175866) 4/4 y `FUNCTIONAL_UI_GATE_PASS` | La puerta es textual; CV-014 reservas sigue pendiente | **VERIFICADA como trazabilidad**, no como aceptación runtime/humana |

### 2.1 Estado real de Actions

Sobre `e29f4feb` hay **9/9 checks aplicables SUCCESS**: `validate`, `generate-lockfile`, `pg17-nonsuperuser`, `client-browser`, `management-browser-smoke`, `two-pwa-installability`, `functional-ui-gate`, `web-publication` y `windows-offline-signer`. Se inspeccionaron estados, pasos y logs relevantes, no solo el color del check.

Duración observada aproximada por job: `validate` 15 min 40 s; `generate-lockfile` 11 min 31 s; `client-browser` 1 min 36 s; `management-browser-smoke` 50 s; `two-pwa-installability` 43 s; `web-publication` 48 s; `pg17-nonsuperuser` 30 s; `windows-offline-signer` 22 s; `functional-ui-gate` 16 s. Los jobs se ejecutaron en paralelo en Actions, por lo que no deben sumarse como tiempo de pared.

Dos puertas son **SKIPPED**, no PASS:

- [`cv005-b2-disposable-integration`](https://github.com/jdlc86/CartaViva/actions/runs/44071673133/job/133999179542): requiere opt-in y no demuestra instalación real.
- [`visual-final-acceptance-gate`](https://github.com/jdlc86/CartaViva/actions/runs/44071672981/job/133999177902): requiere baselines y aprobación humana; no bloquea la integración funcional conforme a la prioridad normativa actual, pero impide afirmar UI final aceptada.

### 2.2 Ejecuciones personales, coste y decisión de no repetir

| Lote personal | Resultado | Tiempo aproximado | Motivo |
|---|---|---:|---|
| Inventario Git, `merge-base`, ancestro #60 y compare `e29f4feb..HEAD` | PASS | < 15 s de comandos | Acreditar alcance y reutilización legítima del CI |
| Diff adversarial `f9f5adf6..e29f4feb`, 12/12 fuentes de riesgo y tests de apoyo | PASS, sin hallazgo reportable | ~20 min de inspección | Cerrar exactamente los riesgos S41/S42 sin auditar de nuevo áreas inmutadas |
| Consulta de checks y lectura dirigida de logs | PASS/SKIPPED según tabla | ~1 min de descarga; lectura posterior dirigida | Confirmar cobertura real, 103 migraciones, 51/51, Windows y límites de los recibos |
| Suite local/PG17/Chromium/restore adicional | **NO EJECUTADO** | 0 | No apareció una hipótesis nueva no cubierta; repetir 300 s F21, migraciones, navegador o restore del mismo SHA no aportaba información |

No se ejecutó `pnpm test`, build, migración completa, F21, Chromium ni restore local. Esta omisión es deliberada y conforme a la estrategia obligatoria: el código no cambió después del SHA probado y no se identificó un defecto plausible que justificase otra batería costosa.

## 3. Revisión adversarial del circuito integrado

### 3.1 Dinero, identidad, HTTP y composición P1-INT-01

La ruta corregida es efectiva: [`m2-restaurant-candidate.mjs`](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/apps/api/src/m2-restaurant-candidate.mjs#L145-L171) rechaza el opt-in de webhook sin `retrieveCapturableEvidence`, y [entrega el mismo adaptador al registro HTTP](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/apps/api/src/m2-restaurant-candidate.mjs#L285-L295). El webhook valida HMAC sobre los bytes originales antes de cualquier consulta, exige UUID/importe entero/EUR y, si `latest_charge` es una cadena, [recupera y compara PI, Charge, pedido, importe, moneda y `capture_before`](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/apps/api/src/h6-stripe-webhook.mjs#L104-L137). El adaptador hace GET con `expand[]=latest_charge` y devuelve solo evidencia cerrada y correlacionada ([líneas 52–66](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/apps/api/src/h6-stripe-adapter.mjs#L52-L66)).

Las migraciones 102/103 serializan ronda→intento o settlement económico, rechazan PI extranjera, falta de identidad y desajuste monetario antes del ledger; mantienen owner NOLOGIN, `SECURITY DEFINER`, `search_path` fijo y único grant de ejecución al runtime proveedor. Los rechazos se traducen en 400/409/503 según el contrato y no dejan recibo durable que enmascare un retry. El test de composición M2 usa HMAC real, Fastify, `latest_charge:"ch_..."`, adaptador inyectado y PG17 sellado; cubre caída de proveedor, cargo/importe incorrectos, aplicación, replay y ausencia de recibo en rechazo ([líneas 7581–7701](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/scripts/ci/table-change-root-postgres17.test.mjs#L7581-L7701)).

M3 operativo sigue con pagos/webhook inertes: la corrección habilita evidencia únicamente en la composición M2 opt-in de laboratorio; no abre pagos reales ni sustituye la autorización operativa.

### 3.2 Backup V2, restore y permisos

[`sabora-postgres-snapshot.mjs`](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/scripts/ops/sabora-postgres-snapshot.mjs#L35-L91) abre `REPEATABLE READ READ ONLY`, obtiene identificador de sistema/base/snapshot y verifica el digest del ledger vivo. El bundle reutiliza el snapshot exportado para roles, esquema, datos e inventario y compara inventarios globales/secuencias antes/después; esos objetos no MVCC se detectan y fallan en vez de fingir atomicidad. La CLI cierra endpoint directo, `verify-full`, CA por bytes SHA-256, system-id, variables `PG*` y argv exactos. El cifrado AES-GCM se produce durante streaming antes de persistir componentes.

Los ACL de columna están incluidos en el fingerprint ([inventario](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/scripts/ci/sabora-backup-inventory.sql#L62-L76)) y se reaplican tras la reconciliación de tabla ([roles](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/scripts/ci/sabora-backup-roles.sql#L131-L154)). El laboratorio crea un ACL real, restaura desde la réplica de clase externa y compara inventario/ledger/roles.

Esto cierra el defecto técnico, no crea las copias. `operationalReceipt=false`, la réplica externa es un fixture y la de clase VPS no se usa para restaurar. No se ha probado RPO/RTO ni el ordenador doméstico.

### 3.3 Firma, release, aislamiento y PWA

El firmante obtiene la raíz desde su módulo y no desde `cwd`, rechaza enlaces y hardlinks, confina los tres outputs reales, usa creación exclusiva y en Windows compara la DACL efectiva de la clave con el recibo aprobado, además de verificar directorio y draft ([firmante](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/scripts/ops/sabora-sign-release-approval.mjs#L35-L66), [verificador](https://github.com/jdlc86/CartaViva/blob/e29f4feb0e55598a13999552b651979181c6bf79/scripts/ops/sabora-ntfs-acl-verifier.mjs#L45-L64)). El job Windows ejecutó el CLI con clave efímera, negativo de recibo arbitrario y validación de artefactos: eso cierra la ruta técnica, no inspecciona la máquina del propietario.

El laboratorio nftables prueba primero que cada endpoint positivo y negativo existe, después aplica reglas dentro de namespaces desechables, no reintenta negativos y verifica rollback e inventario del host. No hay actuador productivo activado. La corrección CV-012 conserva la exigencia de controlador correcto y permite como máximo tres navegaciones reales; no transforma una mera registration en PASS.

## 4. Resolución de hallazgos anteriores y matriz P0–P3

| ID | Severidad previa | Estado final | Evidencia de cierre / residual explícito |
|---|---:|---|---|
| P1-07 | P1 | **CERRADO** | `latest_charge` cadena activa la consulta de evidencia y la correlación exacta; unidad, HTTP y composición M2+PG17 cubiertas. Stripe remoto sigue NO OPERATIVO |
| P2-08 | P2 | **CERRADO** | Fixture realista con Charge no expandido, metadata, importe/EUR y estados 400/503/200; no se usa un objeto imposible para justificar el flujo |
| P2-09 | P2 | **CERRADO** | Snapshot exportado común para cuatro componentes, system-id/ledger y probes no-MVCC. Copia física/restauración operativa sigue pendiente, sin reinterpretar el cierre técnico |
| P2-10 | P2 | **CERRADO** | Entrypoint CLI real, error no-cero, paths/outputs y job Windows 5/5. Custodia material en PC propietario: residual operativo |
| AUD-S42-001 | Media | **CERRADO** | Migraciones 102/103 eliminan el ACK/receipt temprano y atan PI/order/dinero bajo locks; negativos comprueban cero receipts |
| AUD-S42-002 | Media | **CERRADO** | Roles/memberships e inventario se leen dentro del snapshot; drift global/secuencias se comprueba antes/después y aborta |
| AUD-S42-003 | Baja | **CERRADO** | Variables PG case-insensitive cerradas, argv exacto, CA por contenido, host/system-id y ledger vivo fijados |
| AUD-S42-004 | Baja | **CERRADO en código/lab** | Rutas canónicas, links/hardlinks, output real y DACL efectiva verificada en Windows. La DACL del PC real es **RESIDUAL OPERATIVO**, no evidencia CI |
| #64 F01/F02 | P2 | **CERRADO** | Migración 103 serializa H6/Issue61 y rechaza intento inexistente, PI ajena, receipt obsoleto y dinero/moneda incorrectos |
| #64 F03 | P2 | **CERRADO** | Entorno/argv exactos y digest del ledger vivo dentro del snapshot |
| #64 F04 | P2 | **CERRADO** | Checkout derivado de módulo, colisiones de sufijo, enlaces y DACL/material de salida comprobados |
| #64 F05 | P3 | **CERRADO** | ACL `attacl` incorporado a fingerprint, restore y prueba con columna real |
| #64 F06 | P3 | **CERRADO** | Contrato Antigravity exige cobertura de todos los `target_paths`, respuestas a todas las preguntas y correlación SHA/tipo; sigue siendo consultivo, no una autoridad criptográfica |
| P1-INT-01 | P1 | **CERRADO en código/lab** | Cadena M3-lab→M2→HTTP/HMAC→evidencia→PG17 probada en SHA final. Stripe remoto y operación real permanecen **NO VERIFICADOS/STOP** |

Falsos positivos o interpretaciones descartadas:

- Los dos jobs `SKIPPED` no son fallos de la regresión aplicable, pero tampoco pueden contarse como PASS ni como aceptación.
- El HEAD documental sin CI propio no invalida los 9 checks del árbol funcional: el compare demuestra que el producto probado no cambió.
- `operationalReceipt=false` y la ausencia de copia física son una delimitación honesta del laboratorio, no un defecto oculto del restore fixture.
- La inercia de Stripe en M3 operativo es un control intencionado; no debe “corregirse” habilitando pagos sin autorización.
- El bridge Antigravity valida estructura/correlación, pero no convierte comentarios GitHub en identidad criptográfica del proceso local; el contrato lo documenta y no le concede esa autoridad.

### 4.1 Hallazgos actuales por severidad

| Severidad | Abiertos | Dictamen |
|---|---:|---|
| P0 | 0 | Sin bloqueo demostrado |
| P1 | 0 | P1-07 y P1-INT-01 cerrados en código/laboratorio |
| P2 | 0 | P2-08/09/10 y #64 F01–F04 cerrados |
| P3 | 0 | #64 F05/F06 cerrados; no se promueven límites operativos conocidos a defectos de código |

## 5. Dictámenes separados

### 5.1 Integración técnica en `main`: GO CON CONDICIONES

No hay `REQUEST CHANGES` técnico pendiente. Recomiendo integrar **únicamente PR #59** si se cumplen conjuntamente estas puertas:

1. El propietario da autorización expresa de merge; este documento y el comentario no son esa autorización ni un `APPROVE` independiente de GitHub.
2. Se conserva el árbol funcional de `e29f4feb`; si aparece código/SQL/test/workflow posterior, este dictamen deja de cubrirlo y exige revisión diferencial del nuevo cambio.
3. #60 no se fusiona de nuevo, porque ya es ancestro de #59.
4. El merge no se presenta como despliegue, aceptación visual, CV-005 operativo, restore real ni activación Stripe.

Estados separados al cierre:

| Estado | Resultado |
|---|---|
| Código implementado | Sí, en el SHA funcional citado |
| Pruebas ejecutadas | Sí, 9/9 aplicables en Actions; 2 opt-in SKIPPED |
| Candidato validado técnicamente | Sí, en laboratorio desechable y para el alcance revisado |
| Validación operativa | No |
| Aceptación humana/visual | No |
| Autorización de merge | No; decisión exclusiva posterior del propietario |

### 5.2 Despliegue, SQL/Supabase y Stripe real: NO-GO

Deben permanecer **STOP**: aplicar migraciones 100–103 en Supabase operativo; activar Stripe/webhook/credenciales o mover dinero; configurar CA/system-id/DBA reales; crear o restaurar copias en el ordenador doméstico/VPS; ejecutar el actuador de host, red o firewall; desplegar servicios; acceder a Fleetia; declarar aceptación visual.

Faltan evidencias operativas distintas del merge: autorización específica, preflight y custodia reales, copia externa y réplica VPS efectivamente creadas, restore físico validado, aislamiento material Sabora-only, alertas/recepción, Stripe remoto autorizado y aceptación humana cuando corresponda. Ninguna se infiere del CI.

## 6. Siguiente paso mínimo y límites

El siguiente paso mínimo es una decisión explícita del propietario sobre el merge único de #59, basada en este GO condicionado. Si autoriza, debe verificarse el SHA exacto inmediatamente antes de fusionar y conservar la separación entre integración de código y cualquier operación posterior.

No se propone otro PR, refactor, suite ni corrección. No se tocó Supabase operativo, VPS, Stripe, Cloudflare, el ordenador del propietario, Fleetia ni recursos ajenos; no hubo merge ni despliegue.
