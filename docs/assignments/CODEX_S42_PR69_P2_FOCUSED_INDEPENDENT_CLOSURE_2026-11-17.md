# S42 — encargo focalizado a Codex: cierre independiente del P2 del PR #69

**Fecha:** 17-11-2026. **Modalidad:** revisión adversarial independiente, **solo lectura de código y pruebas locales acotadas**. No es un encargo de desarrollo ni autorización de merge o despliegue.

| Dato | Referencia inmutable |
|---|---|
| Repositorio único | `jdlc86/CartaViva` |
| PR existente | [#69 — Draft](https://github.com/jdlc86/CartaViva/pull/69) |
| Rama objeto | `prep/sabora-gateway-readiness-20261117` |
| `main`/base inicial comprobada | `67585f255815be3b1f944e49dc9a51c46a81014a` |
| **SHA funcional a revisar** | [`4da7c4c111d35504807e6bd77ddca95caf6767c9`](https://github.com/jdlc86/CartaViva/commit/4da7c4c111d35504807e6bd77ddca95caf6767c9/checks) |
| HEAD documental al preparar el encargo | `7260872684d9777690f993595e7238f2256e3dd2` |
| Dictamen anterior que se contrasta | [Codex S42 — PR69-P2-01 NO-GO](../reviews/SABORA_S42_CODEX_INDEPENDENT_REVIEW_PR69_RELEASE_2026-11-17.md) |
| Corrección publicada | [comentario técnico del mismo PR](https://github.com/jdlc86/CartaViva/pull/69#issuecomment-6957315853) |

**Objetivo único:** decidir con evidencia propia si **PR69-P2-01**, que permitía `FUNCTIONAL_UI_GATE_PASS` ante un `FUNCTIONAL_UI_BASE_SHA` cero, inexistente o no legible, **está realmente cerrado en el modo gobernado de `push main`**. No repetir la revisión general del release/Stripe/DBA/backups; el hallazgo P3 de la variable pública ya está conciliado documentalmente y no requiere nueva auditoría.

## 1. Alcance obligatorio y normas

Lee `AGENTS.md`, `docs/SABORA_AUTHORIZATION_GATE.md`, `docs/architecture/SABORA_GOVERNED_RELEASE_V1.md`, `docs/architecture/CARTAVIVA_PROJECT_BOUNDARY.md`, `docs/architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md` y, para el significado del estado funcional, `docs/design/FUNCTIONAL_UI_COVERAGE.json` y `docs/design/VISUAL_CONTROL_GATE.md`. Los documentos de continuidad son **contexto**, no sustituyen la normativa.

El diferencial mínimo y **único foco de código** respecto del informe Codex anterior es:

- `scripts/ci/functional-ui-coverage-gate.mjs`: `loadGovernedBaseManifest()`, `--require-base`, carga del manifiesto previo y denegación de estados degradados.
- `tests/functional-ui-coverage-gate.test.mjs`: regresión sobre repositorio Git desechable.
- `.github/workflows/sabora-main-release-evidence.yml`: invocación `--require-base`, `github.event.before`, `github.sha`, `fetch-depth: 0` y fallo cerrado.
- Solo si es indispensable para el cierre de este P2: `scripts/ci/sabora-release-governor.mjs` y `tests/sabora-governed-deployment.test.mjs` para comprobar que ninguna señal `SUCCESS` espuria habilita `check-ci`.

Verifica remoto, `git merge-base`, base, HEAD, árbol limpio y `git diff 4da7c4c111d35504807e6bd77ddca95caf6767c9..HEAD` **antes de reutilizar CI**. Si hubo cambios funcionales posteriores, delimítalos y **no extrapoles** los 5 checks. La rama debe permanecer en el mismo PR #69.

## 2. Preguntas adversariales que hay que resolver

1. **Modo gobernado:** ¿se pasa obligatoriamente `--require-base` para la prueba de release en `push main`, de manera que no pueda obtenerse PASS sin verificar realmente el estado anterior? ¿El modo sin flag se conserva solo para llamadas históricas/PR y no sirve como sustituto silencioso?
2. **SHA del commit:** ¿`GITHUB_SHA` coincide con `git rev-parse HEAD` y el ref de checkout? ¿El SHA cero, vacío, malformado o el HEAD ajeno provocan error no cero? ¿Las comprobaciones rechazan una base igual al HEAD?
3. **Existencia y ancestry:** ¿un commit inexistente, no alcanzable, una base de rama divergente o un objeto que no sea commit terminan en FAIL, no en `prior=null`? ¿`git merge-base --is-ancestor` y `github.event.before` prueban la relación que exige la norma? Examina con especial cuidado pushes múltiples, merge commits, recreación de `main`, `before=000...` y eventuales reescrituras; no des por hecho branch protection.
4. **Manifiesto anterior:** ¿no existir `docs/design/FUNCTIONAL_UI_COVERAGE.json` en la base, un JSON inválido o un esquema/etapa incorrectos obliga a FAIL? ¿La comparación detecta que un estado previamente `CANDIDATO_TECNICO` pasa a `PENDIENTE` o desaparece una capacidad? ¿El modo estricto acepta cambios normales que conservan la trazabilidad?
5. **Evidencia real:** ¿la prueba de historia Git integrada ejercita efectivamente el CLI y sus códigos de salida sin escribir ni contaminar el repositorio real? ¿Existen huecos importantes (por ejemplo: baseline vacío/incompleto, objeto Git no commit, ausencia del flag, o salto de historial) que permitan otro PASS espurio? No pidas pruebas nuevas sin una hipótesis concreta reproducible.

**Criterio estricto:** un test del YAML o un PASS de la CI de PR no prueba por sí solo el `push main`. El resultado del cierre debe limitarse a lo comprobado; la operación real del workflow `push main` continúa pendiente de integración autorizada.

## 3. Pruebas: cobertura máxima, coste mínimo

**Reutiliza primero los resultados GitHub del SHA funcional `4da7c4c111d35504807e6bd77ddca95caf6767c9`:** [checks](https://github.com/jdlc86/CartaViva/commit/4da7c4c111d35504807e6bd77ddca95caf6767c9/checks).

| Job del SHA funcional | Conclusión verificada |
|---|---|
| `validate` | **SUCCESS** (laboratorio integral) |
| `web-publication` | **SUCCESS** |
| `generate-lockfile` | **SUCCESS** |
| `functional-ui-gate` | **SUCCESS**, incluida la prueba Git integrada |
| `windows-offline-signer` | **SUCCESS** |
| `visual-final-acceptance-gate` y `cv005-b2-disposable-integration` | **SKIPPED** (no equivalen a aprobación) |

Prueba focal verificada: [job UI de Actions](https://github.com/jdlc86/CartaViva/actions/runs/44149321416/job/134272956107) ejecutó `node --test tests/functional-ui-coverage-gate.test.mjs`, **5/5 PASS**, y verificó el CLI de PR. **La invocación estricta solo figura en el workflow candidato para push main**, todavía no ejecutado en main.

**No repetir:** batería completa PG17, HTTP, Chromium, F21 de cinco minutos, Docker, migración, `pnpm test` o builds ya PASS del mismo SHA sin riesgo nuevo. Si hace falta un negativo para una hipótesis no cubierta, ejecuta **una única prueba focal reproduciendo el CLI en un repositorio temporal desechable** y mide tiempo/resultado. Evita commits de prueba y GitHub Actions adicionales. No cambies estado de checks, workflows ni código para conseguir PASS.

## 4. Única publicación autorizada y dictámenes

**Sin correcciones de código por Codex.** Publica **un único informe independiente de cierre** en:

`docs/reviews/SABORA_S42_CODEX_PR69_P2_FOCUSED_CLOSURE_2026-11-17.md`

en la **rama existente** `prep/sabora-gateway-readiness-20261117`, mediante **un único commit exclusivamente documental**, con mensaje que evite repetir CI sobre código intacto. Añade **un solo comentario** al [PR #69](https://github.com/jdlc86/CartaViva/pull/69) enlazando informe y SHA revisado. No crees PR, Issue, rama ni segundo reporte. Si la rama se ha movido, comprueba su relación con el SHA funcional antes de publicar. **No alteres ni sustituyas el informe Codex original**, que conserva su dictamen histórico.

Estructura del informe:

1. SHA funcional y HEAD documental inspeccionados, base main, diff realmente leído y normas aplicadas.
2. Matriz compacta: caso adversarial → prueba/lectura → exit code y resultado → evidencia independiente vs CI reutilizada → lagunas.
3. Dictamen específico **PR69-P2-01: CERRADO / RESIDUAL / NO VERIFICADO**, con archivo y línea, PoC reproducible si hay defecto, severidad P0–P3 y reparación mínima propuesta (sin implementarla).
4. Recomendación **GO / GO CON CONDICIONES / NO-GO técnico para el merge del PR #69**, **limitada al P2 y a las demás puertas de integración explícitas**. Un GO de P2 no equivale a aceptación independiente del resto de cambios ni autoriza el merge.
5. **NO-GO operativo separado** hasta verificar cuatro checks en el SHA real de main, paquete inmutable único con `SABORA_APPROVED_RESTAURANT_CODE=SABORA_00`, backups cifrados externos restaurables, SQL/DBA real, aislamiento de VPS, agentes y alertas, autorización firmada y aceptación humana. No confundir variable creada con paquete existente.

**Límites absolutos:** ninguna operación de VPS/Gateway, Supabase real, Stripe real, Cloudflare/DNS, secretos, máquinas del propietario, ni recursos de Fleetia u otros proyectos. No tocar `main`, no fusionar ni desplegar, no activar pagos o acciones de release. La identidad `jdlc86` autora del PR no puede acreditar un `APPROVE` independiente de plataforma; el dictamen se publica como comentario consultivo. Terminar tras el informe y el comentario.

**Estado inicial del encargo:** PREPARADO EN GITHUB. La publicación de este documento **no inicia a Codex automáticamente**; su ejecución se solicita aparte desde Codex.
