# S42 — segunda comprobación independiente de PR69-P2-01-R1

**Fecha:** 17-11-2026<br>
**PR:** [#69](https://github.com/jdlc86/CartaViva/pull/69), Draft abierto<br>
**Base `main`:** [`67585f255815be3b1f944e49dc9a51c46a81014a`](https://github.com/jdlc86/CartaViva/commit/67585f255815be3b1f944e49dc9a51c46a81014a)<br>
**SHA funcional revisado:** [`b339ed6e577d411b3e918dd640b7380f0af5efa9`](https://github.com/jdlc86/CartaViva/commit/b339ed6e577d411b3e918dd640b7380f0af5efa9)<br>
**HEAD documental inspeccionado antes del informe:** [`2ca6055eed5f26365dd406755b816ab0fa00d201`](https://github.com/jdlc86/CartaViva/commit/2ca6055eed5f26365dd406755b816ab0fa00d201)<br>
**Dictamen PR69-P2-01:** **RESIDUAL (P2)**<br>
**Recomendación técnica focal:** **NO-GO PARA MERGE #69**<br>
**Dictamen operativo separado:** **NO-GO OPERATIVO**

## 1. SHA, diferencial y normativa

Se ejecutó íntegramente el [encargo diferencial P2-R1](../assignments/CODEX_S42_PR69_P2_R1_FINAL_DIFFERENTIAL_REVIEW_2026-11-17.md) en la rama existente `prep/sabora-gateway-readiness-20261117`.

Comprobaciones propias:

- `origin/main`, base del PR y `git merge-base origin/main HEAD` coinciden en `67585f255815be3b1f944e49dc9a51c46a81014a`.
- El SHA funcional `b339ed6e577d411b3e918dd640b7380f0af5efa9` es ancestro del HEAD documental `2ca6055eed5f26365dd406755b816ab0fa00d201`.
- `git diff b339ed6e..2ca6055e` contiene únicamente encargo, continuidad y tablero. La CI del SHA funcional es reutilizable.
- El diferencial restringido `de6d2321..b339ed6e` modifica el validador del manifiesto base, su único test Git integrado y documentación contextual. El workflow ya conservaba `--require-base` y no cambió.
- `AGENTS.md`, release gobernado, límite del proyecto, autorización, validación/observabilidad, inventario UI y puerta visual no cambiaron desde la revisión focal anterior. Se aplicaron como autoridad; continuidad y comentarios solo aportaron contexto.
- El árbol permaneció limpio antes de crear este único informe.

No se auditó de nuevo CI global, Stripe, base de datos, backups ni despliegue.

## 2. CI reutilizada

GitHub acredita para el SHA exacto `b339ed6e577d411b3e918dd640b7380f0af5efa9`, todos de `github-actions`:

| Check | Conclusión | Tiempo observable | Evidencia |
|---|---:|---:|---|
| `validate` | SUCCESS | 15 min 35 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869274/job/134324585559) |
| `generate-lockfile` | SUCCESS | 11 min 12 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869361/job/134324585285) |
| `web-publication` | SUCCESS | 53 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869274/job/134324585004) |
| `functional-ui-gate` | SUCCESS | 20 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869184/job/134324584677) |
| `windows-offline-signer` | SUCCESS | 27 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869274/job/134324585618) |
| `visual-final-acceptance-gate` | **SKIPPED** | no ejecutado | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869184/job/134324587830) |
| `cv005-b2-disposable-integration` | **SKIPPED** | no ejecutado | [job](https://github.com/jdlc86/CartaViva/actions/runs/44163869209/job/134324586857) |

El log del job UI confirma **5 tests, 5 pass, 0 fail**, suite `732,887 ms`; el caso Git integrado, que agrupa los siete nuevos negativos, consumió `596,005 ms`. Sigue siendo una ejecución de `pull_request`, no del workflow candidato en `push main`.

No se relanzaron PG17, HTTP, Chromium, F21, Docker, migraciones, builds, `pnpm test` ni workflows.

## 3. Matriz adversarial

| Condición | Control/test revisado | Resultado | Evidencia | Conclusión |
|---|---|---:|---|---|
| Base parcial con solo `CV-007-catalogo` | `REQUIRED_IDS.every()` y negativo `partial` | FAIL | Estática + CI reutilizada | Cerrado |
| ID duplicado | `Set` y negativo `duplicate` | FAIL | Estática + CI reutilizada | Cerrado |
| ID vacío/espacios | `row.id`, `trim()` y negativo `blank-id` | FAIL | Estática + CI reutilizada | Cerrado |
| Fila nula/array | control de objeto y negativo `null-row` | FAIL | Estática + CI reutilizada | Cerrado |
| Estado no admitido | `STATUSES` y negativo `bad-status` | FAIL | Estática + CI reutilizada | Cerrado |
| Pendiente sin motivo | validación de `blockers` y negativo `missing-reason` | FAIL | Estática + CI reutilizada | Cerrado |
| Candidato sin arrays/evidencia | arrays no vacíos y negativo `missing-evidence` | FAIL | Estática + CI reutilizada | Cerrado |
| Paths fuera de raíces, superficies incoherentes o capas requeridas ausentes | líneas 112–140 | FAIL por lectura directa | Estática propia | Cerrado estructuralmente |
| Base nominal completa y sucesor sin degradación | fixture `valid` | PASS | CI reutilizada | Comportamiento legítimo conservado |
| Candidato → pendiente o ID presente eliminado | comparación existente | FAIL | CI reutilizada | Cerrado cuando el estado está registrado |
| SHA cero, inexistente, divergente o HEAD ajeno | controles previos sin cambios | FAIL | CI reutilizada | Sin regresión |
| Modo histórico sin `--require-base` | bifurcación CLI sin cambios | Compatibilidad | Estática propia | No sustituye el workflow gobernado |
| **Inventario completo con marcador histórico inexistente en el árbol base** | PoC independiente | **exit 0, PASS** | **Prueba propia** | **Residual confirmado** |
| Workflow real integrado en `main` | No existe push autorizado | No ejecutado | Laguna declarada | GATE-01 operativo continúa STOP |

## 4. Única prueba focal ejecutada por Codex

Hipótesis no cubierta por los siete negativos: `validGovernedPriorManifest()` comprueba forma y prefijos de `path/marker`, pero no lee el árbol del commit base para acreditar que cada marcador exista realmente.

Se creó un repositorio Git temporal fuera del checkout:

1. se escribieron los seis IDs y los ficheros/markers reales de la fixture;
2. en el commit base se sustituyó el primer marcador de evidencia de `CV-007-catalogo` por `__marker_absent_from_base_commit__`, manteniendo path, clase de evidencia y estructura válidos;
3. el sucesor restauró el manifiesto real completo;
4. se ejecutó el CLI productivo con `--require-base` y los SHA exactos.

Resultado observado:

```text
status=0
duration_ms=249
mutated_id=CV-007-catalogo
mutated_path=apps/client/e2e/client-premium.spec.ts
stderr=""
FUNCTIONAL_UI_GATE_PASS: candidate source/interaction evidence tracked; pending functions remain NO-GO; no aesthetic or provider acceptance implied
```

El temporal se eliminó al terminar. Tiempo total del comando: `4,0 s`; coste monetario no expuesto. No se ejecutó otra prueba.

Como contrapeso, el `main` actual tiene los seis IDs y se comprobaron por lectura Git sus 27 referencias: ninguna falta. Esto reduce el riesgo inmediato del primer push candidato, pero no cierra el comportamiento fail-open para cualquier base ancestral admitida, especialmente mientras GitHub informa `main protected=false`.

## 5. Hallazgo P2 residual

### PR69-P2-01-R2 — el manifiesto base no se contrasta con su propio árbol Git

**Severidad:** P2, bloqueo focal de integración.<br>
**Rutas:** [`scripts/ci/functional-ui-coverage-gate.mjs:108-142`](../../scripts/ci/functional-ui-coverage-gate.mjs#L108-L142), carga en [`:145-169`](../../scripts/ci/functional-ui-coverage-gate.mjs#L145-L169) y control completo del manifiesto actual en [`:26-84`](../../scripts/ci/functional-ui-coverage-gate.mjs#L26-L84). La fixture está en [`tests/functional-ui-coverage-gate.test.mjs:66-170`](../../tests/functional-ui-coverage-gate.test.mjs#L66-L170).

**Causa.** `validEntry()` solo valida que path sea seguro y marker tenga longitud mínima. La validación previa sí dispone de `baseSha`, pero no ejecuta el equivalente de las líneas 71–73 contra `<baseSha>:<path>`. Por eso un candidato histórico con referencias ficticias se considera inventario semánticamente completo.

**Impacto.** La señal obligatoria puede declarar no regresión usando una base que nunca acreditó la trazabilidad que su propio estado afirma. Los checks restantes, paquete, firma y actuador limitan despliegue, pero no convierten esta evidencia histórica incompleta en fail-closed.

**Reparación mínima propuesta, no implementada.** Hacer que la validación gobernada lea cada referencia desde el commit base (`git show <baseSha>:<path>`) y exija el marker; puede reutilizar `inspectFunctionalUi()` con un `read` acotado al árbol base o pasar un callback equivalente a `validGovernedPriorManifest()`. Toda ausencia debe producir `governed_functional_ui_base_manifest_incomplete`.

**Regresión mínima.** Añadir al mismo `rejectPrior()` un caso `missing-marker`: cambiar el marker solo en el JSON del commit base, conservar el fichero sin ese texto, restaurar el manifiesto en el sucesor y exigir exit distinto de cero. No crear otra suite.

No se detectaron otros P0–P3 en el delta focal. La observación no afirma que el `main` actual esté corrupto: se verificó lo contrario.

## 6. Dictámenes

### PR69-P2-01

**RESIDUAL.** P2-R1 corrige inventario parcial, duplicado y los negativos estructurales añadidos, pero una referencia semántica inexistente en el árbol base aún obtiene PASS.

```json
{
  "results": [
    {
      "id": "PR69-P2-01",
      "status": "still_vulnerable",
      "evidence": "El SHA b339ed6e rechaza bases parciales/duplicadas/inválidas estructuralmente, pero una base ancestral completa cuyo marker de evidencia no existe en su propio árbol devolvió exit 0 y FUNCTIONAL_UI_GATE_PASS en una PoC Git temporal."
    }
  ]
}
```

### Integración técnica

**NO-GO PARA MERGE #69**, limitado a PR69-P2-01-R2. Corregir la lectura de referencias en el árbol base, ampliar el único test Git y ejecutar la CI proporcional en un nuevo SHA funcional. Los cinco SUCCESS de `b339ed6e` no cubren esta PoC.

Este dictamen no reabre el resto del release ni invalida pruebas integradas no afectadas. Tampoco constituye `APPROVE` de plataforma ni autorización de merge.

### Operación

**NO-GO OPERATIVO separado.** Siguen faltando cuatro checks sobre el SHA real de `main`, paquete gobernado único generado con `SABORA_APPROVED_RESTAURANT_CODE=SABORA_00`, backup/restore cifrado externo, SQL/DBA real, aislamiento VPS/agentes/alertas, autorización firmada consumible, rollback/observabilidad y aceptación humana. Nada de ello se ejecutó aquí.

## 7. Siguiente acción mínima

Corregir únicamente PR69-P2-01-R2 en el mismo PR y añadir el negativo `missing-marker` a la fixture existente. Después, un cierre diferencial sobre el nuevo SHA; no fusionar ni desplegar antes. Este informe es consultivo y no modifica código, tests, workflows, contratos ni infraestructura.
