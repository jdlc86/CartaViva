# S42 — cierre independiente focalizado de PR69-P2-01

**Fecha:** 17-11-2026<br>
**PR:** [#69](https://github.com/jdlc86/CartaViva/pull/69), Draft abierto<br>
**Base `main`:** [`67585f255815be3b1f944e49dc9a51c46a81014a`](https://github.com/jdlc86/CartaViva/commit/67585f255815be3b1f944e49dc9a51c46a81014a)<br>
**SHA funcional revisado:** [`4da7c4c111d35504807e6bd77ddca95caf6767c9`](https://github.com/jdlc86/CartaViva/commit/4da7c4c111d35504807e6bd77ddca95caf6767c9)<br>
**HEAD documental inspeccionado antes del informe:** [`a76fa986d813554dccb97fa4c9dd8eb2cdc8106b`](https://github.com/jdlc86/CartaViva/commit/a76fa986d813554dccb97fa4c9dd8eb2cdc8106b)<br>
**Dictamen PR69-P2-01:** **RESIDUAL (P2)**<br>
**Recomendación técnica focal:** **NO-GO PARA MERGE #69**<br>
**Dictamen operativo separado:** **NO-GO OPERATIVO**

## 1. Alcance, Git y normas

Se ejecutó el [encargo focalizado](../assignments/CODEX_S42_PR69_P2_FOCUSED_INDEPENDENT_CLOSURE_2026-11-17.md) contra la rama existente `prep/sabora-gateway-readiness-20261117`. Se aplicaron `AGENTS.md`, la puerta de autorización, release gobernado, límite de proyecto, validación/observabilidad, inventario funcional UI y puerta visual. Esas normas no cambiaron desde la revisión Codex anterior; continuidad y tablero se trataron solo como contexto.

Comprobaciones propias:

- `origin/main`, base del PR y `git merge-base origin/main HEAD` coinciden en `67585f255815be3b1f944e49dc9a51c46a81014a`.
- El SHA funcional pedido `4da7c4c111d35504807e6bd77ddca95caf6767c9` es ancestro del HEAD documental `a76fa986d813554dccb97fa4c9dd8eb2cdc8106b`.
- `git diff 4da7c4c..a76fa986` contiene únicamente el encargo, continuidad y tablero. No existe cambio funcional posterior; la CI del SHA funcional es reutilizable.
- El diferencial focal frente al informe anterior modifica el workflow de evidencia, el CLI del gate y sus dos tests de contrato. No se repitió la auditoría general de release, base de datos, pagos o backups.
- El árbol de revisión permaneció limpio antes de crear este único informe.
- GitHub informa actualmente `main protected=false`; un estado previo anómalo no puede descartarse mediante branch protection o ruleset observado.

## 2. Evidencia CI reutilizada

GitHub devuelve para el SHA exacto `4da7c4c111d35504807e6bd77ddca95caf6767c9`, todos de `github-actions`:

| Check | Resultado real | Tiempo observable | Evidencia |
|---|---:|---:|---|
| `validate` | SUCCESS | 15 min 29 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321513/job/134272956515) |
| `generate-lockfile` | SUCCESS | 11 min 08 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321588/job/134272956391) |
| `web-publication` | SUCCESS | 1 min 03 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321513/job/134272956341) |
| `functional-ui-gate` | SUCCESS | 23 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321416/job/134272956107) |
| `windows-offline-signer` | SUCCESS | 24 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321513/job/134272955932) |
| `visual-final-acceptance-gate` | **SKIPPED** | no ejecutado | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321416/job/134272958485) |
| `cv005-b2-disposable-integration` | **SKIPPED** | no ejecutado | [job](https://github.com/jdlc86/CartaViva/actions/runs/44149321400/job/134272958273) |

El log del job UI acredita `node --test tests/functional-ui-coverage-gate.test.mjs`: **5 tests, 5 pass, 0 fail**, suite `379,059 ms`; el caso Git desechable consumió `232,864 ms`. Es una ejecución de `pull_request`, no del workflow candidato `push main`.

No se repitieron PG17, HTTP, Chromium, F21, Docker, migraciones, `pnpm test` ni builds.

## 3. Matriz adversarial focal

| Caso | Lectura o prueba | Exit/resultado | Tipo de evidencia | Conclusión y laguna |
|---|---|---:|---|---|
| `push main` obliga modo estricto | Workflow líneas 45–67 | `--require-base` presente | Estática propia | Cerrado en código candidato; aún no ejecutado en un push real de `main` |
| Checkout/SHA exactos | Workflow 51–58; CLI 107–114 | mismatch → FAIL | Estática + CI Git integrada | Rechaza HEAD vacío, malformado, cero, distinto y base igual a HEAD |
| Base cero | CLI 103–106; test 106–108 | no cero | CI reutilizada | Cerrado |
| Commit inexistente | CLI 115–116; test 109–111 | no cero | CI reutilizada | Cerrado |
| Base divergente/no ancestro | CLI 117–118; test 115–121 | no cero | CI reutilizada | Cerrado |
| Objeto que no es commit | `cat-file -e <sha>^{commit}` | no cero | Estática propia | Cerrado sin test redundante |
| Base sin fichero, JSON inválido, `schemaVersion`/`stage` erróneos o lista vacía | CLI 119–126 | no cero | Estática propia | Cerrado para esos casos exactos |
| Downgrade candidato → pendiente | Comparación 36–38; test 123–131 | no cero | CI reutilizada | Cerrado cuando el estado anterior está presente en la base |
| Capacidad registrada desaparece del estado actual | CLI 81–83 y test unitario existente | error | CI reutilizada | Cerrado cuando la capacidad está presente en la base |
| Sucesor normal con base completa | Test 100–105 | `0`, PASS | CI reutilizada | Comportamiento legítimo conservado |
| Modo histórico sin flag | CLI 130–143 | compatibilidad intencional | Estática propia | No habilita el workflow de `main`, que sí pasa el flag |
| **Base legible pero inventario parcial** | PoC Git desechable independiente | **`0`, PASS** | **Prueba propia** | **Residual confirmado: no se valida completitud de la base** |
| Workflow real integrado | No existe push autorizado del código candidato a `main` | no ejecutado | Laguna declarada | GATE-01 operativo continúa STOP |

## 4. Prueba adicional única ejecutada por Codex

Hipótesis concreta no cubierta por los 5 tests: `loadGovernedBaseManifest()` solo exige que `capabilities` sea un array no vacío. Se creó fuera del repositorio real una historia Git temporal:

1. commit base con `schemaVersion=1`, `stage=FUNCIONAL_PRIMERO` y solo `CV-007-catalogo`;
2. commit sucesor con el manifiesto actual completo y los marcadores de código generados igual que la fixture existente;
3. ejecución del CLI real con `--require-base`, `FUNCTIONAL_UI_BASE_SHA=<base>` y `GITHUB_SHA=<head>`.

Resultado observado:

```text
status=0
duration_ms=262
stderr=""
FUNCTIONAL_UI_GATE_PASS: candidate source/interaction evidence tracked; pending functions remain NO-GO; no aesthetic or provider acceptance implied
```

El directorio temporal se eliminó al finalizar; el árbol real no recibió escrituras. Tiempo total de comando observado: `3,9 s`. Coste monetario no expuesto, no inventado.

Reproducción mínima dentro de la fixture existente:

```js
const partial = {
  schemaVersion: 1,
  stage: 'FUNCIONAL_PRIMERO',
  capabilities: [{id: 'CV-007-catalogo', status: 'CANDIDATO_TECNICO'}]
};
// Commit partial as base, then commit the complete current manifest as head.
const result = run(base, head);
assert.notEqual(result.status, 0); // actualmente falla: result.status === 0
```

No se ejecutó una segunda prueba: el control de flujo y este único PoC bastan para demostrar el residual.

## 5. Hallazgo residual PR69-P2-01

### PR69-P2-01-R1 — una base semánticamente incompleta se acepta como prueba de no regresión

**Severidad:** P2, bloqueo de integración del gate gobernado.<br>
**Rutas:** [`scripts/ci/functional-ui-coverage-gate.mjs:103-127`](../../scripts/ci/functional-ui-coverage-gate.mjs#L103-L127), especialmente líneas 124–126; comparación en [`:36-38`](../../scripts/ci/functional-ui-coverage-gate.mjs#L36-L38) y [`:81-83`](../../scripts/ci/functional-ui-coverage-gate.mjs#L81-L83). La fixture actual está en [`tests/functional-ui-coverage-gate.test.mjs:66-135`](../../tests/functional-ui-coverage-gate.test.mjs#L66-L135).

**Causa.** La base se considera válida si tiene versión, etapa y al menos una capacidad. No se comprueba que sus IDs sean válidos y únicos, que sus estados pertenezcan al contrato ni que estén presentes los seis `REQUIRED_IDS`. La comparación solo puede detectar downgrades o eliminaciones de filas que la propia base parcial contiene.

**Impacto.** Una señal obligatoria de release puede devolver SUCCESS sin acreditar todo el estado anterior. Con `main` actualmente sin protección, no puede descartarse una secuencia en la que un commit previo incompleto/fallido quede como cabeza y el siguiente commit obtenga un PASS estricto al restaurar un inventario que la base ya no registraba. El `main` actual sí contiene los seis IDs, lo que reduce la inmediatez del caso, pero no hace fail-closed al control para toda historia admitida.

**Contrapesos.** El SHA cero, la base inexistente, la divergencia, el HEAD ajeno, el JSON inválido y el downgrade registrado sí están correctamente rechazados. Los otros tres checks, el paquete, la firma y el actuador siguen siendo puertas separadas. No eliminan esta prueba de no regresión incompleta.

**Reparación mínima propuesta, no implementada.** Validar la estructura semántica del manifiesto anterior antes de usarlo: filas objeto, `id` no vacío y único, `status` permitido y presencia de todos los `REQUIRED_IDS`; emitir un error específico como `governed_functional_ui_base_manifest_incomplete`. Mantener la validación de ancestro y el modo histórico separado.

**Regresión mínima.** Ampliar el único test Git existente con una base parcial que debe fallar, una base con ID duplicado/estado inválido que debe fallar y la base completa nominal que debe seguir pasando. No crear otra suite ni repetir PG17/Chromium/F21.

## 6. Dictámenes

### Verificación específica

**PR69-P2-01: RESIDUAL.** El exploit original de SHA cero/inexistente/no ancestro está cerrado, pero la frontera de seguridad todavía permite PASS con una base semánticamente incompleta. En el contrato de verificación de seguridad:

```json
{
  "results": [
    {
      "id": "PR69-P2-01",
      "status": "still_vulnerable",
      "evidence": "El modo --require-base rechaza SHA cero/inexistente/divergente, pero acepta una base ancestral con schemaVersion/stage válidos y solo una capacidad: PoC desechable exit 0 y FUNCTIONAL_UI_GATE_PASS."
    }
  ]
}
```

### Integración técnica de #69

**NO-GO PARA MERGE #69**, limitado a este P2. Corregir PR69-P2-01-R1 en el mismo PR, ejecutar el test focal ampliado y la CI proporcional sobre un nuevo SHA funcional, y realizar una comprobación diferencial de cierre. Los cinco SUCCESS actuales pertenecen a `4da7c4c`; no cubren la base parcial demostrada.

Este NO-GO no reabre auditorías generales ni invalida los PASS de PG17/HTTP/Chromium/F21 del árbol no afectado. Tampoco constituye una revisión independiente del resto del PR.

### Operación

**NO-GO OPERATIVO separado.** Incluso después de cerrar el residual seguirán pendientes: cuatro checks exactos sobre el SHA real de `main`; paquete inmutable único con `SABORA_APPROVED_RESTAURANT_CODE=SABORA_00`, dos imágenes, manifiesto y digests; backups cifrados externos restaurables; SQL/DBA real; aislamiento de VPS, agentes y alertas; autorización firmada consumible; rollback/observabilidad y aceptación humana. No se realizó ni autorizó ninguna de esas operaciones.

## 7. Siguiente acción mínima

Asignar en el mismo PR la validación semántica de la base y una única ampliación del test Git existente. No fusionar, desplegar ni generar evidencia operativa hasta un nuevo SHA y cierre focal independiente. Este informe es consultivo: no es `APPROVE`, no autoriza merge y no sustituye la ejecución postintegración en `main`.
