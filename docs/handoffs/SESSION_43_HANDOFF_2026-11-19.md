# Sabora / CartaViva — continuidad operativa de la sesión 43 (2026-11-19)

> **CONTINUIDAD, NO NORMATIVA NI AUTORIZACIÓN.** Los requisitos, contratos de arquitectura/diseño, seguridad y puertas de autorización versionados en GitHub prevalecen. Leer el estado real antes de operar. Mantener este archivo durante S43 y actualizar el tablero vivo al completar hitos importantes; no reescribir informes independientes ni duplicar PR o baterías.

## 1. Fuentes y cadena de continuidad

- [Continuidad S42 completa, fijada al último SHA funcional](https://github.com/jdlc86/CartaViva/blob/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb/docs/handoffs/SESSION_42_HANDOFF_2026-11-17.md), en particular S42-17 a S42-30. [S42 en la rama](SESSION_42_HANDOFF_2026-11-17.md).
- [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §129 al abrir S43; seguimiento, no normativa.
- [AGENTS.md](../../AGENTS.md), [RF/NF](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [consistencia contractual](../architecture/SABORA_CONTRACT_CONSISTENCY_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [registro de aprobación](../design/APPROVAL_REGISTER.md), [puerta visual](../design/VISUAL_CONTROL_GATE.md), [inventario UI](../design/FUNCTIONAL_UI_COVERAGE.json), [autorización](../SABORA_AUTHORIZATION_GATE.md), [release gobernado](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [validación y observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md).
- [Acta preflight Gateway S42](../reviews/SABORA_S42_GATEWAY_READONLY_DEPLOY_PREFLIGHT_2026-11-17.md), [runbook dual backup/primer despliegue](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md).
- [Guía permanente Antigravity V1](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [contrato puente V2](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md): leer íntegramente antes de nuevos encargos. V1 solo lectura; V2 escritura acotada y nominalmente probada en [#66](https://github.com/jdlc86/CartaViva/issues/66), no prueba de seguridad del host ni permiso general. No emitir nuevas revisiones a Codex/Antigravity sin instrucción expresa. No duplicar Issues.

## 2. Hitos heredados de S42 (contexto histórico)

- En #59 se corrigieron los hallazgos Stripe P1-07/P2-08, consistencia backup P2-09, firmador Windows P2-10, los hallazgos Antigravity AUD-S42-001–004 y F01–F06 de #64, y P1-INT-01. [Informe final Codex #59](../reviews/SABORA_S42_CODEX_FINAL_INDEPENDENT_INTEGRATION_PR59_2026-11-17.md): GO CON CONDICIONES técnico, 0 P0–P3 detectados en el delta revisado, reutilización de 9/9 checks aplicables y 2 opt-in SKIPPED sobre e29f4feb0e55598a13999552b651979181c6bf79. #59 ya integrado en main; #60 era ancestro, no fusionar otra vez. Esto no acredita Stripe remoto, SQL operativo, copias físicas ni aceptación humana.
- S42-18: preflight Gateway de solo lectura, 8443 sin listener, TLS Sabora presente, usuario sabora-release y provisión host pendientes. Identificó ausencia de dos de los cuatro checks requeridos en main y ausencia del paquete inmutable. No reusar como observación actual del VPS.
- Se abrió [PR #69](https://github.com/jdlc86/CartaViva/pull/69) para reparar evidencias SHA exacto de release y mantener las baterías integradoras sin duplicarlas. Codex detectó el fallo P2 de base UI inexistente; los sucesivos ciclos corrigieron base inválida/no ancestral, manifiesto incompleto y ausencia de marcador/archivo en árbol histórico. PR69-P3-01 documental reconciliado: Codex comprobó SABORA_APPROVED_RESTAURANT_CODE=SABORA_00; no demuestra paquete generado.
- Última revisión independiente: [informe Codex inmutable del 18-11-2026](https://github.com/jdlc86/CartaViva/blob/4e5a1906ac89f5de61a2bee91b8d1f888fa430db/docs/reviews/SABORA_S42_CODEX_PR69_P2_R2_HISTORICAL_TREE_CLOSURE_2026-11-17.md), [comentario](https://github.com/jdlc86/CartaViva/pull/69#issuecomment-6989092594), SHA de código revisado 56ab31c27acbc84d168a310c4266e93e48eb1e07. P2 original corregido; residual exclusivamente por P3 PR69-R2-QA-01 (falso rechazo al perder LF significativo del blob). GO CON CONDICIONES técnico, NO-GO operativo, sin permiso de merge. Los cinco checks SUCCESS de ese SHA son históricos.

## 3. Corte de apertura S43 — 19-11-2026 (hora de Madrid)

| Objeto | Estado observado en GitHub |
| --- | --- |
| main | [67585f255815be3b1f944e49dc9a51c46a81014a](https://github.com/jdlc86/CartaViva/commit/67585f255815be3b1f944e49dc9a51c46a81014a) |
| PR abiertos | Solo [#69](https://github.com/jdlc86/CartaViva/pull/69), abierto/Draft/no fusionado |
| Rama activa | prep/sabora-gateway-readiness-20261117 |
| Último SHA funcional / HEAD antes de este documento | [cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb](https://github.com/jdlc86/CartaViva/commit/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb) |
| Dictamen independiente vigente | GO CON CONDICIONES sobre 56ab31c2, condición P3 implementada posteriormente; no es una nueva revisión del SHA corregido |
| Merge | Pendiente de CI íntegra, contraste de condición y autorización expresa |
| Operación M6 | NO-GO |

### PR69-R2-QA-01: reparación publicada en S42-30

El [commit correctivo](https://github.com/jdlc86/CartaViva/commit/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb) cambia exactamente cuatro ficheros: gate, test, continuidad S42 y tablero. En [scripts/ci/functional-ui-coverage-gate.mjs](https://github.com/jdlc86/CartaViva/blob/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb/scripts/ci/functional-ui-coverage-gate.mjs) conserva la salida del blob histórico sin trim y aplica trim solo a rev-parse HEAD (metadato). No se relaja la coincidencia exacta, la validación del SHA/ascendencia, el inventario, caché ni la negativa de fichero/marcador inexistente. [Test integrado](https://github.com/jdlc86/CartaViva/blob/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb/tests/functional-ui-coverage-gate.test.mjs) amplía la historia Git con positivo de LF significativo al final del marcador postgres17 de CV-007-catalogo; afirma que el blob bruto contiene el marcador y el recortado no. Conserva negativos de los tres ciclos P2. [Comentario de S42](https://github.com/jdlc86/CartaViva/pull/69#issuecomment-6994207263) informa 5/5 pruebas PASS y caso Git de 1138 ms; no equivale a ejecución real del nuevo workflow push main ni a funcionalidad PG17 de catálogo.

### Checks por SHA funcional (consulta de jobs en apertura)

| Job | Estado | Evidencia |
| --- | --- | --- |
| functional-ui-gate | SUCCESS | [135200600803](https://github.com/jdlc86/CartaViva/actions/runs/44417231394/job/135200600803) |
| web-publication | SUCCESS | [135200601725](https://github.com/jdlc86/CartaViva/actions/runs/44417231437/job/135200601725) |
| windows-offline-signer | SUCCESS | [135200601796](https://github.com/jdlc86/CartaViva/actions/runs/44417231437/job/135200601796) |
| validate | IN_PROGRESS | [135200601305](https://github.com/jdlc86/CartaViva/actions/runs/44417231437/job/135200601305) |
| generate-lockfile | IN_PROGRESS | [135200600763](https://github.com/jdlc86/CartaViva/actions/runs/44417231447/job/135200600763) |
| visual-final-acceptance-gate | SKIPPED | [135200603629](https://github.com/jdlc86/CartaViva/actions/runs/44417231394/job/135200603629) |
| cv005-b2-disposable-integration | SKIPPED | [135200602654](https://github.com/jdlc86/CartaViva/actions/runs/44417231434/job/135200602654) |

**3/5 aplicables SUCCESS, 2/5 en curso, 2 opt-in SKIPPED.** [Checks exactos](https://github.com/jdlc86/CartaViva/commit/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb/checks). No declarar 5/5 hasta nueva consulta. No atribuir la CI a un commit documental posterior; comparar el delta y registrar ambos SHA. Esta apertura solo documenta y consulta GitHub; no ejecuta pruebas nuevas. No inferir que web-publication SUCCESS acredita paquete producido, ni Windows CI acredita ACL doméstica real.

## 4. Próximo hito integral S43 — cerrar la candidatura de release gobernado

1. Consultar los dos jobs en marcha del SHA funcional, sin cancelarlos ni relanzar suites por inercia. Si hay FAIL, leer logs y corregir la causa en el mismo PR; preservar todas las pruebas y contratos. No repetir F21/PG17/Chromium por separado si la evidencia integradora exacta es suficiente.
2. Contrastar el delta P3 con la condición del último informe Codex: positivo LF y negativos previos, sin recorte de blob ni debilitamiento del gate. Con CI final completa, evaluar si la condición técnica está satisfecha; no presentar una evaluación propia como nuevo dictamen independiente. Nueva revisión focal solo si el propietario lo autoriza y resulta necesaria.
3. Solicitar decisión expresa de integración de #69 en main, verificando ancestría, diff, checks y reglas del repo vigentes; PR Draft hasta dicha decisión. No crear otro PR ni volver a integrar #59/#60.
4. Tras integración autorizada, verificar sobre el SHA real de main **GATE-01** (los cuatro checks exigidos por release governor: validate, generate-lockfile, web-publication, functional-ui-gate; cotejar contrato/código vigente y estado mismo SHA) y **GATE-02** (paquete gobernado inmutable con dos imágenes/digests y manifest, run origen exitoso exacto; inspeccionar artefacto real). No desplegar por el mero hecho de pasar CI.

## 5. Puertas operativas que siguen STOP

- Stripe remoto/sandbox, webhooks y conciliación según normativa; autorización de SQL/migraciones, DBA, ledger y procedencia verificable de Supabase real.
- Copia primaria cifrada externa en equipo doméstico, réplica de ese ciphertext Sabora-only en VPS y restauración real acreditada; custodia de claves/ACL real. No confundir ensayo CI con backup material.
- Preflight/provisioning de actuador sabora-release, identidad del host, rutas exclusivas, ingress/egress y firewall, TLS/8443, readiness, observabilidad/alertas y rollback, con permisos operativos específicos.
- Aceptación humana visual de ambas PWA y autorizaciones firmadas conforme a normativa. Las opt-in omitidas no son PASS. La ausencia de usuarios no elimina estas fronteras.

**Aislamiento absoluto:** exclusivamente jdlc86/CartaViva. No acceder, detener, modificar, reutilizar ni depender de Fleetia u otros proyectos del VPS. No ejecutar operaciones sobre VPS/Gateway, Supabase operativo, Stripe real, DNS, red, secretos, backup real, merge o despliegue sin autorización explícita correspondiente. Este documento no concede ninguna autorización.

## 6. Registro vivo S43

| Hito | Estado | Evidencia / siguiente paso |
| --- | --- | --- |
| S43-0 — apertura documental y transferencia S42-30 | COMPLETADO (documentación, no validación completa) | Corte de jobs por SHA y enlaces anteriores; mantener rama #69; este documento no modifica código, normativa o tracker (§129 sigue recogiendo el correctivo). |
| S43-1 — cerrar CI y condición P3 | COMPLETADO (CI + contraste propio) | 5/5 SUCCESS y 2 opt-in SKIPPED; condición concreta satisfecha; decisión de integración pendiente. Véase S43-1 abajo. |
| S43-2 — integración autorizada y GATE-01/GATE-02 | PENDIENTE | Requiere orden expresa, nuevo SHA main y artefacto verificable. |
| S43-3 — bloque de preparación material de operación | PENDIENTE / STOP | Evidencias físicas y autorizaciones separadas según §5. |

**Mantenimiento:** este archivo se publica en la rama existente de #69 con commit exclusivamente documental y marcador [skip ci] para evitar lanzar otra batería; se conserva cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb como SHA funcional en ejecución. Un HEAD documental no hereda automáticamente la CI ni sustituye los checks exigidos para integrar/producir release. Comprobar que las ejecuciones originales continúan y que no hay cambio funcional posterior. Actualizar este mismo documento y tablero al cerrar hitos con evidencia, no por microcorrecciones. No modificar retrospectivamente S42.

## S43-1 — batería final del P3 completada y condición técnica contrastada (19-11-2026)

En el mismo [PR #69](https://github.com/jdlc86/CartaViva/pull/69) se verificó el SHA funcional exacto [cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb](https://github.com/jdlc86/CartaViva/commit/cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb/checks): **5/5 checks aplicables SUCCESS, 0 fallos, 0 en curso, 2 opt-in SKIPPED**. [validate](https://github.com/jdlc86/CartaViva/actions/runs/44417231437/job/135200601305), [generate-lockfile](https://github.com/jdlc86/CartaViva/actions/runs/44417231447/job/135200600763), [web-publication](https://github.com/jdlc86/CartaViva/actions/runs/44417231437/job/135200601725), [windows-offline-signer](https://github.com/jdlc86/CartaViva/actions/runs/44417231437/job/135200601796), [functional-ui-gate](https://github.com/jdlc86/CartaViva/actions/runs/44417231394/job/135200600803). Visual final y CV005/B2 siguen SKIPPED, no PASS.

**Contraste técnico propio (no nueva auditoría independiente):** el [compare](https://github.com/jdlc86/CartaViva/compare/56ab31c27acbc84d168a310c4266e93e48eb1e07...cee80ca19d9c31c355a3fb1fd6d4c636d37cd5cb) demuestra que el delta funcional se limita al helper Git (sin trim del blob; trim solo de rev-parse HEAD) y el positivo LF en el test existente; demás archivos documentales. Las negativas previas no se eliminaron. Se consultó el log UI: checkout del SHA exacto, 5 tests, 5 pass, 0 fail, test Git 1138,418896 ms, suite 1211,301573 ms. La condición concreta PR69-R2-QA-01 del [informe Codex](../reviews/SABORA_S42_CODEX_PR69_P2_R2_HISTORICAL_TREE_CLOSURE_2026-11-17.md) resulta **satisfecha en código y pruebas CI**, por contraste propio. El informe histórico no se altera ni se atribuye a Codex una reevaluación del nuevo SHA. No se ejecutaron ni relanzaron pruebas, no se solicitaron nuevas auditorías.

**Estado:** candidatura técnicamente favorable para evaluar integración de #69, previa autorización expresa y comprobación de reglas/checks y árbol final. GitHub indica open/Draft, mergeable=true/clean; main sigue 67585f255815be3b1f944e49dc9a51c46a81014a. HEAD previo a esta actualización 6239cd4912035d0f106fa34942114a859ef8b864 añade solo continuidad S43; este nuevo commit también exclusivamente documental con [skip ci]. No equivale a checks del HEAD documental ni acredita que la configuración de protección admita merge. S43-1 cerrado en alcance CI y contraste de condición; S43-2 pendiente de autorización, GATE-01/GATE-02 sobre main real, y S43-3 permanece STOP/NO-GO operativo. Sin merge, sin despliegue, sin mutaciones Supabase/VPS/Gateway/Stripe/Fleetia.
