# Sabora S42 — revisión de calidad del control de cobertura funcional en el PR #69

**Revisión editorial del encargo:** 18-11-2026. **Objeto:** evaluación independiente de un cambio de código y su regresión de CI, en un repositorio propio y autorizado. **No requiere pruebas ofensivas, acceso a servicios externos ni interacción con infraestructura.**

**Repositorio exclusivo:** `jdlc86/CartaViva`. **PR existente:** [#69](https://github.com/jdlc86/CartaViva/pull/69), abierto/Draft. **Rama:** `prep/sabora-gateway-readiness-20261117`.

| Referencia | Estado comprobado al preparar el encargo |
|---|---|
| **SHA funcional exacto que debe examinarse** | [`56ab31c27acbc84d168a310c4266e93e48eb1e07`](https://github.com/jdlc86/CartaViva/commit/56ab31c27acbc84d168a310c4266e93e48eb1e07/checks) |
| Base de `main` | `67585f255815be3b1f944e49dc9a51c46a81014a` |
| Revisión técnica anterior | [Informe P2-R2](../reviews/SABORA_S42_CODEX_PR69_P2_R1_SECOND_CLOSURE_2026-11-17.md) |
| Identificador de seguimiento | `PR69-P2-01-R2` |
| CI del SHA funcional | 5/5 checks aplicables `SUCCESS`; 2 controles opt-in `SKIPPED` |
| Archivo de informe solicitado | `docs/reviews/SABORA_S42_CODEX_PR69_P2_R2_HISTORICAL_TREE_CLOSURE_2026-11-17.md` |

## 1. Propósito técnico

Revisar si el control de trazabilidad de interfaces `functional-ui-gate` compara correctamente la información de cobertura de dos revisiones Git del mismo proyecto. La versión anterior podía aceptar un inventario que citaba texto de un archivo que no estaba presente en esa revisión; el último cambio pretende resolver esta inconsistencia.

En el SHA funcional indicado, `loadGovernedBaseManifest()` comprueba versión, identidad del commit anterior y estructura del inventario. `readHistorical(path)` lee cada archivo desde ese **commit anterior** mediante `git show <baseSha>:<path>`, y `inspectFunctionalUi()` comprueba que los marcadores declarados aparezcan en ese contenido. El objetivo es confirmar que la implementación y los tests representan fielmente este requisito, sin atribuir a la revisión de código capacidades operativas no demostradas.

**Resultado esperado:** un inventario anterior consistente debe superar el control; un inventario que cite un marcador inexistente o un archivo ausente en esa revisión debe producir un resultado de validación negativo. El inventario de la revisión actual también debe cumplir el control habitual. Distinguir implementación, pruebas ejecutadas y aceptación real.

## 2. Documentación y archivos que deben leerse

La referencia normativa es el propio repositorio. Lee `AGENTS.md`, `docs/architecture/SABORA_GOVERNED_RELEASE_V1.md`, `docs/architecture/CARTAVIVA_PROJECT_BOUNDARY.md`, `docs/SABORA_AUTHORIZATION_GATE.md`, `docs/architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md`, `docs/design/FUNCTIONAL_UI_COVERAGE.json` y `docs/design/VISUAL_CONTROL_GATE.md`. La continuidad es contextual y no sustituye los requisitos normativos.

Revisa **solamente el cambio** entre `0e273d73f8448962f307b244d4aec2fa5845e9b5` y `56ab31c27acbc84d168a310c4266e93e48eb1e07`, usando estas rutas:

- `scripts/ci/functional-ui-coverage-gate.mjs`: `loadGovernedBaseManifest()`, `readHistorical()`, `validGovernedPriorManifest()` e `inspectFunctionalUi()`.
- `tests/functional-ui-coverage-gate.test.mjs`: prueba existente con repositorio Git temporal, verificaciones `missing-marker`, `missing-file`, caso nominal y casos de rechazo previos.
- `.github/workflows/sabora-main-release-evidence.yml`: únicamente para comprobar que el flujo gobernado `push main` usa `--require-base` y proporciona `FUNCTIONAL_UI_BASE_SHA` y `GITHUB_SHA` correctamente.

Comprobar el estado real del PR, su SHA y el diferencial posterior al SHA funcional. Los commits documentales posteriores no cambian la validez de la CI si se acredita que no alteraron código, configuración o tests.

## 3. Lista de comprobación de calidad

1. **Lectura de la revisión correcta:** `readHistorical()` debe leer archivos del commit `baseSha`, no del checkout actual, y reutilizar resultados por ruta para evitar trabajo innecesario.
2. **Datos consistentes:** para capacidades con estado candidato o validado, los marcadores declarados en `ui`, `api` y `evidence` deben estar presentes en el archivo correspondiente de la versión anterior. Un archivo ausente o contenido que no contenga el marcador no puede considerarse conforme.
3. **Pruebas existentes:** verificar que `missing-marker` y `missing-file` efectivamente ejecutan el CLI y comprueban un código de salida distinto de cero y el diagnóstico `governed_functional_ui_base_manifest_incomplete`.
4. **Caso positivo:** el historial Git de prueba con inventario y referencias correctos debe continuar dando `FUNCTIONAL_UI_GATE_PASS`. No sería válida una modificación que rechazara también las versiones legítimas.
5. **Compatibilidad:** preservar los controles ya comprobados de SHA/base, inventario parcial/duplicado, estados permitidos, no degradación y la distinción entre modo gobernado y uso histórico sin `--require-base`.
6. **Límites de la evidencia:** una CI verde en un PR no significa que el workflow nuevo haya corrido en `main`, que exista paquete inmutable, que la interfaz esté aprobada visualmente o que el despliegue sea seguro.

Si detectas una inconsistencia concreta de estos requisitos, describe el archivo, la línea, el resultado esperado frente al observado y una corrección mínima sugerida; **no implementes cambios**.

## 4. Pruebas y eficiencia

En [el SHA funcional](https://github.com/jdlc86/CartaViva/commit/56ab31c27acbc84d168a310c4266e93e48eb1e07/checks), GitHub registra `validate`, `generate-lockfile`, `web-publication`, `functional-ui-gate` y `windows-offline-signer` en **SUCCESS**. Los dos opt-in visual y CV-005 B2 permanecen **SKIPPED**, no aprobados.

El [job `functional-ui-gate`](https://github.com/jdlc86/CartaViva/actions/runs/44175938068/job/134367152498) ejecutó la suite existente con **5/5 tests PASS**; el caso Git temporal incluye ya los escenarios históricos mencionados.

**Trabajo solicitado:** lectura técnica y comprobación de esos resultados y de los tests incluidos. No repetir las suites largas PostgreSQL17, HTTP, Chromium, Docker, F21 ni los workflows. Únicamente si la revisión descubre una discrepancia concreta que las pruebas existentes no resuelven, se permite una prueba unitaria/local acotada en un directorio temporal sin acceso a redes ni a sistemas operativos reales. Indica con precisión qué ejecutaste y qué resultados solo has consultado.

## 5. Informe y permisos

Prepara un único informe de revisión en:

`docs/reviews/SABORA_S42_CODEX_PR69_P2_R2_HISTORICAL_TREE_CLOSURE_2026-11-17.md`

Incluye: SHA del código revisado; base y diff examinados; requisitos normativos aplicados; tabla de comprobaciones con evidencia; incidencias concretas si existen; resultado **`PR69-P2-01-R2: CERRADO / RESIDUAL / NO VERIFICADO`**; recomendación técnica sobre integración del PR (GO / GO CON CONDICIONES / NO-GO), sin emitir una aprobación de plataforma; y situación **operativa separada**, que sigue NO-GO hasta verificar en `main` los controles de release, el paquete inmutable, copias externas recuperables, Supabase/DBA, aislamiento del VPS, alertas y aceptación humana.

**Publicación autorizada:** un único commit **solo documental** en la **misma rama** del PR #69 y un único comentario resumido en el mismo PR con enlace al informe. No modificar informes históricos, código, pruebas, workflows o contratos. No crear PR, Issue ni rama adicional, no marcar Ready ni fusionar.

**Frontera de trabajo:** únicamente el repositorio autorizado, y pruebas locales aisladas cuando estén justificadas. No acceder ni actuar sobre servidores, Gateway, Supabase operativo, Stripe, Cloudflare, DNS, secretos, equipos del propietario, Fleetia ni otros proyectos. No desplegar, reiniciar ni modificar infraestructura compartida.

La publicación de este documento no inicia por sí misma una tarea en Codex. Si el entorno no permite alguna acción, señalarla sin afirmar que se ejecutó.
