# Sabora S42 — encargo Codex de cierre independiente del P2-R2: integridad del árbol histórico

**Fecha:** 17-11-2026. **Tipo:** revisión independiente, adversarial, focal y no correctiva. **Repositorio:** `jdlc86/CartaViva`. **PR:** [#69](https://github.com/jdlc86/CartaViva/pull/69), abierto/Draft. **Rama:** `prep/sabora-gateway-readiness-20261117`.

| Objeto | SHA/evidencia exactos |
|---|---|
| **Único SHA funcional a revisar** | [`56ab31c27acbc84d168a310c4266e93e48eb1e07`](https://github.com/jdlc86/CartaViva/commit/56ab31c27acbc84d168a310c4266e93e48eb1e07/checks) |
| `main`/base al emitir encargo | `67585f255815be3b1f944e49dc9a51c46a81014a` |
| Último informe Codex con PoC residual | [`SABORA_S42_CODEX_PR69_P2_R1_SECOND_CLOSURE_2026-11-17.md`](../reviews/SABORA_S42_CODEX_PR69_P2_R1_SECOND_CLOSURE_2026-11-17.md) |
| Hallazgo a reevaluar | `PR69-P2-01-R2` — base ancestral completa pero marcadores sin respaldo en su propio árbol |
| Comprobación puntual ya ejecutada | [`functional-ui-gate`](https://github.com/jdlc86/CartaViva/actions/runs/44175938068/job/134367152498), **SUCCESS**, 5/5 pruebas, incluido test Git histórico ampliado |
| CI completa ya ejecutada | `validate`, `generate-lockfile`, `web-publication`, `functional-ui-gate`, `windows-offline-signer`: **5/5 SUCCESS** en el SHA indicado |
| Controles opt-in | `visual-final-acceptance-gate` y `cv005-b2-disposable-integration`: **SKIPPED**, no aceptación |

## 1. Resultado que debe demostrar o refutar Codex

El informe anterior reprodujo una vulnerabilidad del gate de no regresión funcional: existía un `docs/design/FUNCTIONAL_UI_COVERAGE.json` anterior bien formado y con todas las capacidades obligatorias, pero un `marker` de `CV-007-catalogo` solo figuraba en ese JSON, **no en el contenido del archivo referenciado del commit base**. El CLI gobernado terminó con `exit 0` y `FUNCTIONAL_UI_GATE_PASS`; el dictamen fue **P2 RESIDUAL / NO-GO para merge**.

La nueva corrección en `56ab31c27acbc84d168a310c4266e93e48eb1e07` llama `inspectFunctionalUi({manifest:prior,read:readHistorical})`, donde `readHistorical(path)` ejecuta `git show <baseSha>:<path>` y almacena por ruta lo obtenido, devolviendo `null` cuando no existe. Se añadió al mismo test Git el negativo `missing-marker` (marcador falso en JSON ancestral) y `missing-file` (archivo histórico ausente). **El objetivo es buscar una refutación, no certificar por semejanza textual**. Determinar expresamente si la verificación obliga a existir las referencias `ui`, `api` y `evidence` en la **versión histórica correspondiente**, con `baseSha` correcto, error no cero en caso adversarial y PASS para sucesor legítimo.

## 2. Lectura obligatoria y alcance estricto

Antes de evaluar, leer `AGENTS.md`, `docs/architecture/SABORA_GOVERNED_RELEASE_V1.md`, `docs/architecture/CARTAVIVA_PROJECT_BOUNDARY.md`, `docs/SABORA_AUTHORIZATION_GATE.md`, `docs/architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md`, `docs/design/FUNCTIONAL_UI_COVERAGE.json` y `docs/design/VISUAL_CONTROL_GATE.md`. Los documentos de continuidad solo son contexto; **la normativa tiene prioridad**.

Auditar exclusivamente el delta de [`0e273d73f8448962f307b244d4aec2fa5845e9b5..56ab31c27acbc84d168a310c4266e93e48eb1e07`](https://github.com/jdlc86/CartaViva/compare/0e273d73f8448962f307b244d4aec2fa5845e9b5...56ab31c27acbc84d168a310c4266e93e48eb1e07), centrado en:

- `scripts/ci/functional-ui-coverage-gate.mjs`: `readHistorical`, `loadGovernedBaseManifest()`, `validGovernedPriorManifest()` y `inspectFunctionalUi()`.
- `tests/functional-ui-coverage-gate.test.mjs`: fixture Git real desechable, negativos `missing-marker` y `missing-file`, caso válido, degradación y los rechazos anteriores.
- `.github/workflows/sabora-main-release-evidence.yml` **solo** para asegurar que `push main` ejecutaría `--require-base` con `github.event.before`, `GITHUB_SHA` y checkout de historia completa.
- No reabrir Stripe, backup, CI económica, pagos, PWA estética, SQL o toda la arquitectura salvo dependencia estrictamente necesaria para este P2.

Antes de usar resultados previos, constatar repo remoto, `git merge-base`, SHA funcional, HEAD del PR, base `main`, estado del checkout y diff de los commits posteriores. Los commits de encargo y de informe pueden ser solo documentales; **probarlo con diff**, no presumirlo. Si aparece otro cambio funcional, limitar/revisar evidencia y declarar el cierre del SHA anterior no extrapolable.

## 3. Matriz adversarial con coste controlado

Verificar explícitamente, clasificando evidencia como lectura de código, CI reutilizada o PoC ejecutada:

1. **PoC original:** base ancestral con 6 IDs, metadata coherente y `evidence.marker` falsificado solo en JSON para `apps/client/e2e/client-premium.spec.ts`; archivo base sin el marcador. Sucesor restaura el manifiesto. El CLI gobernado DEBE devolver **exit distinto de 0**, `governed_functional_ui_base_manifest_incomplete`, **sin PASS**.
2. **Archivo histórico eliminado:** referencia correcta en el manifiesto anterior, archivo de evidencia ausente del commit base; sucesor lo restaura. El resultado debe ser FAIL. Verificar también que los recorridos de `ui` y `api` reciben la misma comprobación, no solo `evidence`.
3. **Positivos:** inventario ancestral íntegro con todos los marcadores históricos existentes y sucesor sin regresión => PASS. No aceptar arreglos que den siempre FAIL o que consulten por error únicamente el HEAD actual.
4. **Adversariales previos:** SHA cero/inexistente/divergente, base igual al HEAD, inventario parcial/duplicado, fila/estado inválido, downgrade, marcador nuevo ausente y ausencia de fichero. Reutilizar la CI ya ejecutada para los casos cubiertos; no repetir esas pruebas sin hipótesis nueva.
5. **Fronteras y falsos positivos:** examinar rutas con ausencia, error de lectura, contenido binario o esquemas impropios, manifestaciones `PENDIENTE`, ambigüedad de rutas, symlinks u otras particularidades Git **solo si representan un bypass concreto y plausible del contrato**. Si se identifica, aportar un único PoC desechable, SHA y resultado exactos, no una lista especulativa de riesgos.
6. **Separar código de evidencia real:** el workflow de `push main` todavía no ha corrido en `main` con este SHA. El gate confirma presencia de marcadores y trazabilidad, no aceptación visual, funcionalidad material ni autorización operativa.

**Eficiencia:** reutilizar los cinco SUCCESS del SHA; evitar ejecutar `validate`, PG17, HTTP, Chromium, F21, Docker, `pnpm test`, builds o Actions adicionales. Solo si el análisis encuentra un caso adversarial no cubierto, ejecutar **una PoC focal en repositorio temporal externo**; registrar milisegundos, comando, stdout/stderr y exit code. No producir cambios en código para ensayar ni nuevos test files del repositorio.

## 4. Entregable único y decisiones separadas

Publicar **un único informe nuevo**, sin reescribir revisiones históricas, en:

`docs/reviews/SABORA_S42_CODEX_PR69_P2_R2_HISTORICAL_TREE_CLOSURE_2026-11-17.md`

**Única escritura autorizada:** un commit **exclusivamente documental** con ese informe en la misma rama del PR #69 y **un comentario** resumen en el propio PR enlazando el informe, el SHA funcional y el dictamen. No crear ramas, PR, Issue ni múltiples informes; tampoco cambiar estado Draft, emitir `APPROVE` a nombre ajeno ni fusionar. Si la rama cambia durante el análisis, inspeccionar nuevo diff antes de publicar.

El informe debe contener: (i) SHAs, normas y diff realmente inspeccionado; (ii) tabla concisa de hipótesis/evidencias/resultados con separación propia versus CI reutilizada; (iii) dictamen **`PR69-P2-01-R2`: CERRADO / RESIDUAL / NO VERIFICADO**, citando archivo/líneas; (iv) PoC mínima para todo fallo real con gravedad P0–P3 y corrección mínima sugerida, **sin implementarla**; (v) recomendación **GO / GO CON CONDICIONES / NO-GO técnico** para el merge **limitada al P2**; (vi) **NO-GO operativo separado** hasta 4 checks en SHA exacto de `main`, paquete gobernado con dos imágenes y digests, backup cifrado externo recuperable, DBA/SQL real, aislamiento VPS Sabora-only, alertas, firma y aprobación humana. No declarar que `SABORA_APPROVED_RESTAURANT_CODE=SABORA_00` implica que el paquete fue construido.

**Prohibiciones:** no modificar código, tests, workflows, normas, secretos, variables GitHub, `main` ni estado de PR; no hacer merge/rebase/despliegue; no operar Gateway/VPS, Supabase real, Cloudflare, Stripe real, equipo doméstico ni recursos **Fleetia**. No tocar, reiniciar ni depender de contenedores ajenos. Detenerse tras informe y comentario. **El informe consultivo no constituye `APPROVE` independiente de GitHub ni autorización de integración.**

**Estado de este documento:** PREPARADO EN GITHUB; no acredita que Codex lo haya recibido ni que la revisión haya comenzado.
