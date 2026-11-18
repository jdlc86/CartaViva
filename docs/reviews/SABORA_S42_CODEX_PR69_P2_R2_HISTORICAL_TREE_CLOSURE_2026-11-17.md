# S42 — revisión independiente de calidad de functional-ui-gate, PR #69

Fecha de revisión: **18-11-2026**. Se conserva el nombre de archivo solicitado en el encargo del 17-11-2026.

**Resultado del encargo: PR69-P2-01-R2: RESIDUAL**, exclusivamente por una regresión de compatibilidad **P3** descrita abajo. La aceptación incorrecta original de marcadores o archivos históricos inexistentes está **corregida**; no se ha reproducido otra aceptación incorrecta.

**Recomendación técnica: GO CON CONDICIONES**, limitada al delta revisado: conservar íntegro el contenido histórico y cubrir el falso rechazo antes de integrar. No constituye aprobación de plataforma ni permiso de merge.

**Situación operativa separada: NO-GO.**

## 1. Objeto, referencias y normativa

Se sigue el [encargo de revisión de calidad](../assignments/CODEX_S42_PR69_P2_R2_HISTORICAL_GIT_TREE_FINAL_REVIEW_2026-11-17.md), en su revisión editorial del 18-11-2026.

| Referencia | Valor comprobado |
| --- | --- |
| Repositorio / PR | Exclusivamente `jdlc86/CartaViva`, [#69](https://github.com/jdlc86/CartaViva/pull/69), abierto, Draft, sin fusionar |
| Rama de publicación autorizada | `prep/sabora-gateway-readiness-20261117` |
| Código examinado | [`56ab31c27acbc84d168a310c4266e93e48eb1e07`](https://github.com/jdlc86/CartaViva/commit/56ab31c27acbc84d168a310c4266e93e48eb1e07) |
| Base del diferencial focal | `0e273d73f8448962f307b244d4aec2fa5845e9b5` |
| Base main del PR | `67585f255815be3b1f944e49dc9a51c46a81014a` |
| HEAD documental antes del informe | `43c743a7032d3a28ce5cff4815aa8e47dca2e575` |

El [delta focal](https://github.com/jdlc86/CartaViva/compare/0e273d73f8448962f307b244d4aec2fa5845e9b5...56ab31c27acbc84d168a310c4266e93e48eb1e07) añade 16 líneas al gate y 19 al test, más apuntes de continuidad/tablero. El workflow de main no cambia en ese delta. El [compare posterior](https://github.com/jdlc86/CartaViva/compare/56ab31c27acbc84d168a310c4266e93e48eb1e07...43c743a7032d3a28ce5cff4815aa8e47dca2e575) acredita dos commits, ascendencia del SHA funcional y cambios únicamente en el encargo y la continuidad. No cambia código, configuración ni tests. La evidencia CI se atribuye al SHA funcional; no se inventa una ejecución del HEAD documental.

Se aplicaron [AGENTS.md](../../AGENTS.md), [release gobernado](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [límite del proyecto](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [autorización](../SABORA_AUTHORIZATION_GATE.md), [validación y observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [inventario funcional](../design/FUNCTIONAL_UI_COVERAGE.json) y [puerta visual](../design/VISUAL_CONTROL_GATE.md), junto con RF/NF y los documentos de diseño exigidos por AGENTS.md. Reglas relevantes: referencias comprobadas en su revisión correspondiente, ausencia de degradación, trazabilidad distinta de ejecución funcional y de aceptación humana, evidencia por SHA y aislamiento del trabajo.

El [informe anterior](SABORA_S42_CODEX_PR69_P2_R1_SECOND_CLOSURE_2026-11-17.md), el tablero y la continuidad S42 se usaron como contexto, sin modificar sus conclusiones históricas.

## 2. CI existente consultada, no repetida

Se consultaron los runs asociados al SHA funcional, los estados y pasos de sus jobs, y el log de `functional-ui-gate`.

| Check | Resultado consultado | Evidencia |
| --- | --- | --- |
| validate | SUCCESS | [job 134367153930](https://github.com/jdlc86/CartaViva/actions/runs/44175938114/job/134367153930) |
| generate-lockfile | SUCCESS | [job 134367152598](https://github.com/jdlc86/CartaViva/actions/runs/44175938101/job/134367152598) |
| web-publication | SUCCESS | [job 134367153246](https://github.com/jdlc86/CartaViva/actions/runs/44175938114/job/134367153246) |
| functional-ui-gate | SUCCESS | [job 134367152498](https://github.com/jdlc86/CartaViva/actions/runs/44175938068/job/134367152498) |
| windows-offline-signer | SUCCESS | [job 134367154565](https://github.com/jdlc86/CartaViva/actions/runs/44175938114/job/134367154565) |
| visual-final-acceptance-gate | **SKIPPED** | [job 134367155197](https://github.com/jdlc86/CartaViva/actions/runs/44175938068/job/134367155197) |
| cv005-b2-disposable-integration | **SKIPPED** | [job 134367155740](https://github.com/jdlc86/CartaViva/actions/runs/44175938159/job/134367155740) |

El log UI muestra checkout explícito de `56ab31c27acbc84d168a310c4266e93e48eb1e07`, ejecución de `node --test tests/functional-ui-coverage-gate.test.mjs` y **5 tests, 5 pass, 0 fail**. Duración de suite: **995,436983 ms**; quinto test Git: **918,533623 ms**. Los escenarios internos no aparecen como tests TAP separados: su cobertura se acredita leyendo las aserciones dentro del quinto test, que concluye correctamente.

La etapa posterior del mismo job emite `FUNCTIONAL_UI_GATE_PASS` y mantiene `CV-014-reservas-anticipadas` como pendiente. Esa etapa es la comprobación ordinaria de PR; la ejecución estricta se produce dentro de la fixture Git. No acredita ejecución del nuevo workflow en push main.

## 3. Matriz de comprobación

Referencias de código fijadas al SHA examinado: [gate](https://github.com/jdlc86/CartaViva/blob/56ab31c27acbc84d168a310c4266e93e48eb1e07/scripts/ci/functional-ui-coverage-gate.mjs), [tests](https://github.com/jdlc86/CartaViva/blob/56ab31c27acbc84d168a310c4266e93e48eb1e07/tests/functional-ui-coverage-gate.test.mjs) y [workflow main](https://github.com/jdlc86/CartaViva/blob/56ab31c27acbc84d168a310c4266e93e48eb1e07/.github/workflows/sabora-main-release-evidence.yml).

| Comprobación | Evidencia y resultado | Tipo |
| --- | --- | --- |
| Lectura del commit base | Gate 173–177 usa `git show baseSha:path`, sin fallback al checkout. La identidad y ascendencia se validan antes. | Lectura propia |
| Caché por ruta | `Map.has()`/set/get, 172–181; también conserva null para archivos ausentes. Cada ruta se lee como máximo una vez por carga. | Lectura propia |
| UI, API y evidencia histórica | `inspectFunctionalUi({manifest:prior,read:readHistorical})`, 183; bucle común 63–73 exige el marcador en las tres clases. | Lectura propia; negativos CI ejercitan evidencia |
| missing-marker | Tests 161–164 llaman a `rejectPrior()`: JSON ancestral con marcador inexistente, sucesor con JSON reparado; 126–135 ejecuta CLI real, exige status distinto de cero y `governed_functional_ui_base_manifest_incomplete`. | Lectura + CI reutilizada: rechazo correcto |
| missing-file | Tests 167–176 hacen git rm en la base y restauran el archivo en el sucesor; CLI real con ambos SHA, status no cero y mismo diagnóstico. Impide que el archivo del HEAD sanee artificialmente la base. | Lectura + CI reutilizada: rechazo correcto |
| Historia nominal válida | Tests 100–105 exigen exit 0 y `FUNCTIONAL_UI_GATE_PASS`. | CI reutilizada; control local adicional PASS |
| SHA cero/inexistente, HEAD ajeno y base divergente | Tests 106–121 conservan rechazo y diagnósticos específicos. | CI reutilizada |
| Base igual a HEAD, formato SHA y esquema | Gate 147–168 conserva comprobaciones previas; no atribuir casos no ejecutados a la fixture. | Lectura propia |
| Inventario parcial/duplicado, estado/ID inválido, evidencia/motivo ausentes y fila nula | Tests 138–158 conservados; `validGovernedPriorManifest()` no cambia. | CI reutilizada |
| Estado degradado y capacidad eliminada | Tests 43–53 y 178–186 siguen rechazándolos. | CI reutilizada |
| Inventario actual y modo release | Tests 15–24 y 56–63; la base histórica usa la misma inspección, sin convertir pendientes en aceptación. | CI reutilizada |
| Modo sin --require-base | Bifurcación CLI conservada; el experimento local también ejecuta ese CLI y obtiene PASS. | Lectura + prueba local |
| Cableado push main | Workflow 3–4 y 47 limita evento/rama; 54–58 fija checkout a github.sha con historia completa y contrasta HEAD con GITHUB_SHA; 64 usa github.event.before; 67 exige --require-base. | Lectura propia; ejecución real en main no acreditada |
| Contenido histórico íntegro | El helper de 151–152 aplica trim al blob leído en 177. Una referencia válida que termina en LF puede rechazarse. | **Prueba local: incidencia P3 confirmada** |

## 4. Incidencia P3: falso rechazo al recortar el contenido del archivo histórico

**ID local de este informe: PR69-R2-QA-01.** Localización: [gate línea 177](https://github.com/jdlc86/CartaViva/blob/56ab31c27acbc84d168a310c4266e93e48eb1e07/scripts/ci/functional-ui-coverage-gate.mjs#L177), al reutilizar el helper que termina en [trim, línea 152](https://github.com/jdlc86/CartaViva/blob/56ab31c27acbc84d168a310c4266e93e48eb1e07/scripts/ci/functional-ui-coverage-gate.mjs#L152).

**Condición concreta:** un marcador admitido por el esquema incluye el salto de línea final de su archivo. El blob de Git y el checkout contienen exactamente ese marcador. La lectura actual conserva el texto, pero la histórica elimina el LF mediante `.trim()`. Por ello una historia coherente falla solo en modo gobernado.

Se comprobó con el marcador de evidencia postgres17 de CV-007-catalogo, añadiendo un LF al marcador y manteniendo ese mismo LF en el archivo de la fixture:

```json
{
  "path": "scripts/ci/catalog-postgres17-driver-integration.test.mjs",
  "marker": "PG17 catalog writer transaction persists first/grouped/late kitchen projections\n"
}
```

La fixture contiene únicamente referencias textuales, como la prueba existente: **no se ejecuta código PostgreSQL ni se afirma que represente funcionalidad de la aplicación**.

**Esperado:** exit 0 y PASS, porque las referencias son coherentes en ambas revisiones y no hay degradación.

**Observado:**

```text
rawHistoricalContainsMarker=true
currentAuditErrors=[]
previousStrict.status=0
reviewedLegacy.status=0
reviewedStrict.status=1
reviewedStrict.stderr=FUNCTIONAL_UI_GATE_FAIL: governed_functional_ui_base_manifest_incomplete
nominal.status=0
duration_ms=5341
temporary_fixture_removed=true
```

**Impacto y gravedad:** P3, falso rechazo limitado a marcadores que dependen de whitespace en los extremos del archivo. No es aceptación de referencias inexistentes ni se ha observado fallo del inventario actual del PR. Sí contradice la equivalencia de lectura y la conservación de historias válidas exigidas por el encargo. El caso nominal existente no incluye ese borde.

**Corrección mínima sugerida, no implementada:** leer los blobs históricos sin trim; limitar el recorte a salidas de metadatos como `rev-parse HEAD`. Conservar caché y rechazo de archivos ausentes. No recortar el marcador ni relajar `includes()` para ocultar la diferencia. Añadir a la misma fixture Git un positivo con LF significativo al final y mantener los negativos originales.

No se identificaron otros defectos concretos en el delta focal.

## 5. Trabajo ejecutado y coste

Se ejecutaron lecturas Git del SHA exacto, inspección del diferencial y `git diff --check` sobre las tres rutas del encargo (**PASS**). El checkout local inicial era otra rama y se mantuvo limpio y sin cambiar de rama; el código se leyó por objeto Git, no se confundió con ese checkout.

La única prueba adicional fue un script por stdin mediante `node --input-type=module`, Node **v22.23.1**, justificado por la diferencia trim/lectura íntegra no cubierta por CI. Creó un único repositorio temporal, copió sin alterar los gates de `0e273d73…` y `56ab31c2…`, construyó los seis IDs y archivos de marcadores, y ejecutó:

1. CLI revisado estricto sobre base/sucesor nominal: PASS.
2. Inspección actual y lectura Git sin recortar sobre la variante con LF: ambas coherentes.
3. CLI anterior estricto, CLI revisado estricto y CLI revisado sin modo estricto sobre la misma historia válida: PASS / FAIL / PASS.

Las invocaciones estrictas fueron equivalentes a `FUNCTIONAL_UI_BASE_SHA=<base> GITHUB_SHA=<head> node <gate-del-SHA>.mjs --require-base`, con cwd en el temporal. Tiempo interno total: **5.341 ms**; duración del comando: **5,777 s**. El script de diagnóstico terminó exit 0 porque sus aserciones confirmaron el falso rechazo descrito; el CLI revisado bajo prueba terminó exit 1. El temporal se retiró en finally. No se usó red en la prueba y no se modificó código ni tests del repositorio.

No se repitieron suites PG17, HTTP, Chromium, Docker, F21, builds ni workflows; no se pidieron reruns. Coste monetario no expuesto. La publicación es un único informe documental en la rama autorizada y un comentario; se conservan sin editar tablero, continuidad, contratos e informes anteriores según el alcance específico del encargo.

## 6. Dictámenes y condición de integración

**PR69-P2-01-R2: RESIDUAL en el cierre completo solicitado.** Los casos originales missing-marker y missing-file están corregidos y cubiertos por CI. El residual es la compatibilidad P3 recién comprobada; no se mantiene el defecto P2 anterior de aceptar referencias inexistentes. No sería preciso afirmar que todas las historias legítimas siguen pasando.

**GO CON CONDICIONES técnico:** eliminar la transformación del blob histórico y acreditar el positivo de LF junto con los negativos existentes sobre el SHA corregido antes de integrar. Esta es una recomendación focal de calidad, sin aprobación GitHub, autorización de merge ni reevaluación de toda la arquitectura. Reutilizar el CI disponible y ejecutar únicamente la regresión proporcional al nuevo cambio.

**NO-GO operativo independiente:** aún deben verificarse los cuatro checks requeridos sobre el SHA efectivo de main, el paquete gobernado inmutable con sus dos imágenes y digests, las copias externas recuperables, Supabase/DBA, aislamiento y agente del VPS, alertas, autorización firmada y aceptación humana. Los pasos de empaquetado del job web-publication de este PR están SKIPPED; su SUCCESS general no prueba que exista paquete. No se han consultado variables operativas ni se deduce un paquete de la configuración declarada en documentos.

No se modificó código, no se fusionó, no se marcó Ready y no se accedió a servidores, Gateway, servicios operativos, secretos, Fleetia ni otros proyectos.
