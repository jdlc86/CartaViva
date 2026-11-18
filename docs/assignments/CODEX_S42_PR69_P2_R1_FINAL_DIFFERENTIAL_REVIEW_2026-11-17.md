# S42 — encargo final a Codex: segunda comprobación diferencial de PR69-P2-01-R1

**Fecha:** 17-11-2026. **Repositorio exclusivo:** `jdlc86/CartaViva`. **PR:** [#69](https://github.com/jdlc86/CartaViva/pull/69), Draft y sin fusionar. **Rama:** `prep/sabora-gateway-readiness-20261117`.

| Evidencia | Identificador |
|---|---|
| Base `main` al preparar este encargo | `67585f255815be3b1f944e49dc9a51c46a81014a` |
| **SHA FUNCIONAL exacto a revisar** | [`b339ed6e577d411b3e918dd640b7380f0af5efa9`](https://github.com/jdlc86/CartaViva/commit/b339ed6e577d411b3e918dd640b7380f0af5efa9/checks) |
| SHA funcional anterior y primer intento P2 | `4da7c4c111d35504807e6bd77ddca95caf6767c9` |
| Informe Codex que descubrió P2 residual | [`SABORA_S42_CODEX_PR69_P2_FOCUSED_CLOSURE_2026-11-17.md`](../reviews/SABORA_S42_CODEX_PR69_P2_FOCUSED_CLOSURE_2026-11-17.md) |
| Informe Codex inicial P2 SHA cero/inexistente | [`SABORA_S42_CODEX_INDEPENDENT_REVIEW_PR69_RELEASE_2026-11-17.md`](../reviews/SABORA_S42_CODEX_INDEPENDENT_REVIEW_PR69_RELEASE_2026-11-17.md) |
| Evidencia integrada CI de código nuevo | [checks del SHA exacto](https://github.com/jdlc86/CartaViva/commit/b339ed6e577d411b3e918dd640b7380f0af5efa9/checks) |

## Objetivo único y criterio de cierre

Decidir **independientemente y adversarialmente** si el último hallazgo `PR69-P2-01-R1` quedó cerrado: con la versión anterior, un **commit base existente y ancestro válido** con inventario `FUNCIONAL_UI_COVERAGE.json` semánticamente incompleto (por ejemplo, solo `CV-007-catalogo`) producía **exit 0** y `FUNCTIONAL_UI_GATE_PASS` en `--require-base`. Ese resultado fue reproducido por Codex y **no se debe declarar corregido simplemente porque la CI sea verde**.

El SHA `b339ed6e577d411b3e918dd640b7380f0af5efa9` incorpora `validGovernedPriorManifest()`, que pretende rechazar inventarios base parciales, IDs duplicados, estados incorrectos y otras inconsistencias. Tu labor es **intentar refutar** esa corrección, no confirmarla por defecto. Cierre = no reproducir el PoC anterior, refutar razonablemente bypasses de la misma frontera semántica y conservar el caso nominal; si persiste cualquier PASS indebido con una base ancestral inválida, dictaminar RESIDUAL/NO-GO y aportar prueba mínima y cambio preciso. No proponer refactorizaciones ajenas.

## Normativa y límites

Leer primero `AGENTS.md`, `docs/architecture/SABORA_GOVERNED_RELEASE_V1.md`, `docs/architecture/CARTAVIVA_PROJECT_BOUNDARY.md`, `docs/SABORA_AUTHORIZATION_GATE.md`, `docs/architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md`, `docs/design/FUNCTIONAL_UI_COVERAGE.json` y `docs/design/VISUAL_CONTROL_GATE.md`. La normativa prevalece sobre continuidad y comentarios. **No reinterpretar** el modelo de estado de UI ni tratar un PASS del gate como aceptación estética o E2E operativa.

Revisión restringida al diferencial **`de6d2321de55dc38aebc23b3de2e22cbeea469cc..b339ed6e577d411b3e918dd640b7380f0af5efa9`**, en especial:

- `scripts/ci/functional-ui-coverage-gate.mjs`: `validGovernedPriorManifest()`, uso real en `loadGovernedBaseManifest()`, `inspectFunctionalUi()` y modo `--require-base`.
- `tests/functional-ui-coverage-gate.test.mjs`: el mismo fixture Git temporal, su ejecución real del CLI y la cobertura de negativos añadidos.
- Como contexto mínimo, `.github/workflows/sabora-main-release-evidence.yml`, para confirmar que `push main` invoca `--require-base`; no volver a auditar CI global, Stripe, backups ni todo el release.

Antes de emitir conclusión, comprobar `origin`, `git merge-base`, HEAD PR #69, base `main`, árbol de trabajo y cambios posteriores al SHA funcional. Si HEAD se ha desplazado solo por el encargo/documentación, **reutilizar CI del SHA funcional** tras comprobar su diff. Si hay cambio funcional nuevo, detener el cierre para ese SHA no revisado.

## Hipótesis adversariales: comprobarlas con prioridad

1. **PoC original:** commit base ancestro y JSON válido pero `capabilities` contiene solo `CV-007-catalogo`; commit sucesor completo con referencias de código; el CLI con `--require-base` DEBE devolver exit **distinto de 0**, diagnóstico `governed_functional_ui_base_manifest_incomplete`, y nunca `FUNCTIONAL_UI_GATE_PASS`.
2. **No basta rellenar IDs:** comprobar ID duplicado, ID vacío/solo espacios, fila nula, estado no admitido, falta de alguna de las seis `REQUIRED_IDS`, pendientes sin motivo y candidatos sin evidencia o referencias semánticas. Analizar también si datos aparentemente íntegros pero incoherentes permiten un nuevo **PASS indebido** para este mismo contrato.
3. **Continuidad funcional legítima:** manifiesto base estructuralmente válido con todas las capacidades y sucesor sin degradaciones debe terminar PASS; una degradación de `CANDIDATO_TECNICO` a `PENDIENTE` (o eliminación de ID presente) debe terminar FAIL. Evitar un arreglo que bloquee todo `push main` sin necesidad.
4. **No regresión de controles anteriores:** SHA cero, base inexistente/divergente, HEAD incorrecto, ausencia/manifiesto JSON inválido y modo histórico sin flag. Comprobar que el rechazo semántico solo se aplica al modo gobernado, no se convierte en un bootstrap tácito.
5. **Límite de alcance:** `--require-base` en el workflow candidato no implica que este workflow se haya ejecutado realmente en `main`; un PASS de PR no acredita GATE-01 operativo.

No aceptar ni rechazar la solución por similitud textual con el informe anterior: obtener evidencia propia en el código del SHA auditado y, si hay una hipótesis plausible sin cobertura, usar una sola PoC desechable.

## Pruebas mínimas, económicas y evidencia ya acreditada

En el SHA funcional `b339ed6e577d411b3e918dd640b7380f0af5efa9` GitHub verificó exactamente **5/5 comprobaciones aplicables SUCCESS**: `validate`, `generate-lockfile`, `web-publication`, `functional-ui-gate` y `windows-offline-signer`. `visual-final-acceptance-gate` y `cv005-b2-disposable-integration` están **SKIPPED, no PASS**. El [job UI](https://github.com/jdlc86/CartaViva/actions/runs/44163869184/job/134324584677) ejecutó `node --test tests/functional-ui-coverage-gate.test.mjs` (**5/5 PASS**, con los siete negativos añadidos dentro del mismo caso de historia Git), y el control CLI de PR. Esto acredita **pruebas de la rama**, no independencia ni operación `push main`.

**Reutiliza esa CI**; está prohibido relanzar sin motivo las suites PostgreSQL17/HTTP/Chromium, F21, Docker, builds, `pnpm test` o nuevos workflow runs. Si hace falta, realiza **una ejecución focal** del test ya existente o **un PoC temporal aislado** de la hipótesis de bypass que descubras, con exit code, stdout/stderr y duración observados. No añadas suites al repositorio ni produzcas commits de prueba. Informa con honestidad si todo el juicio fue estático.

## Entregable único de cierre, sin ampliar el trabajo

Publica un **único informe independiente nuevo**, sin modificar los informes anteriores, en:

`docs/reviews/SABORA_S42_CODEX_PR69_P2_R1_SECOND_CLOSURE_2026-11-17.md`

**Rama:** `prep/sabora-gateway-readiness-20261117`, sin crear otra rama, Issue ni PR. **Una sola escritura permitida:** ese informe Markdown mediante un único commit **exclusivamente documental** y un único comentario resumido en [PR #69](https://github.com/jdlc86/CartaViva/pull/69), con URL absoluta, SHA funcional inspeccionado, nuevo HEAD documental y dictamen. Si el HEAD cambia durante la revisión, verifica que no se haya alterado el árbol funcional o deja explícitamente sin vigor el cierre.

Secciones obligatorias: SHA y diff revisados; normativa aplicable; matriz de condiciones adversariales con resultados y evidencia propia frente a CI reutilizada; defectos P0–P3 con ruta/línea y PoC; **`PR69-P2-01`: `CERRADO` / `RESIDUAL` / `NO VERIFICADO`**; dictamen técnico **GO / GO CON CONDICIONES / NO-GO PARA MERGE #69**, acotado al delta; dictamen separado **NO-GO OPERATIVO** por falta de checks de `main` y paquete gobernado real, backup/restore y aislamiento del VPS, autorizaciones y aceptación visual. Si no hay defecto, no repetir auditorías: recomendar la decisión de integración **solo al propietario**, que debe autorizarla expresamente. El informe no es `APPROVE` de otra identidad GitHub.

**Prohibido:** editar código/tests/workflows/contratos, corregir hallazgos, fusionar, marcar Ready, desplegar, ejecutar jobs de despliegue, operar Supabase real, VPS/Gateway, Stripe real, Cloudflare/DNS o usar secretos. **Fleetia y cualquier otro recurso del host compartido quedan completamente fuera de alcance.** Detenerse después de publicar informe y comentario. El encargo documental por sí solo **no significa que Codex esté ejecutándolo**.
