# S42 — revisión independiente del PR #69: preparación de release Sabora

**Fecha:** 17-11-2026<br>
**PR:** [#69](https://github.com/jdlc86/CartaViva/pull/69), Draft abierto<br>
**Rama:** `prep/sabora-gateway-readiness-20261117`<br>
**Base `main`:** [`67585f255815be3b1f944e49dc9a51c46a81014a`](https://github.com/jdlc86/CartaViva/commit/67585f255815be3b1f944e49dc9a51c46a81014a)<br>
**HEAD completo auditado:** [`142182e3d93fda47b7ca1e1915a47192e31dbffd`](https://github.com/jdlc86/CartaViva/commit/142182e3d93fda47b7ca1e1915a47192e31dbffd)<br>
**Último SHA funcional y de pruebas:** [`60095e836abf57aad310ca8bf8c72fb0b452a087`](https://github.com/jdlc86/CartaViva/commit/60095e836abf57aad310ca8bf8c72fb0b452a087)<br>
**Dictamen de integración:** **NO-GO PARA MERGE #69**<br>
**Dictamen operativo:** **NO-GO OPERATIVO**

## 1. Alcance y realidad Git

Se leyó íntegramente el [encargo S42](../assignments/CODEX_S42_INDEPENDENT_REVIEW_PR69_RELEASE_READINESS_2026-11-17.md) y la normativa exigida: `AGENTS.md`, autorización, límite de proyecto, release gobernado, validación/observabilidad, runbooks S40/S38, RF, contrato funcional consolidado, inventario UI, sistema de diseño, registro de aprobaciones, tablero y continuidad S42. La revisión fue diferencial y se limitó a las rutas indicadas en el encargo y a sus controles de release directamente dependientes.

Comprobaciones independientes:

- `origin/main`, base del PR y `merge-base` coinciden en `67585f255815be3b1f944e49dc9a51c46a81014a`.
- El HEAD remoto y local auditado coinciden en `142182e3d93fda47b7ca1e1915a47192e31dbffd`; el PR permanecía Draft, abierto y `CLEAN` al cerrar la revisión.
- El árbol estaba limpio antes del informe.
- `git diff 60095e8..142182e3` contiene únicamente el encargo y la continuidad S42. No hay código, test, workflow, migración ni configuración posteriores al SHA funcional, por lo que la CI de `60095e8` es reutilizable para ese mismo árbol funcional.
- La corrección LF/CRLF está presente en `60095e8` y su `validate` final terminó SUCCESS; no se extrapola el fallo de un SHA anterior.
- `main` figura actualmente sin protección administrativa (`protected=false`). Un workflow no sustituye un ruleset y no puede descartarse por política un push no fast-forward o la recreación de la rama.

Este informe no autoriza merge, despliegue ni operaciones sobre Gateway, VPS, Supabase, Fleetia, Stripe, Cloudflare o DNS. No se accedió a ellos.

## 2. Matriz riesgo → evidencia → laguna → prueba mínima

| Riesgo | Ruta/control | Evidencia reutilizada | Laguna concreta | Acción de esta revisión | Resultado |
|---|---|---|---|---|---|
| Identidad exacta de release | `sabora-main-release-evidence.yml`, `sabora-release-governor.mjs` | Revisión estática y cinco checks SUCCESS de `60095e8` | El workflow nuevo aún no ha corrido tras un push autorizado a `main` | Sin repetir suites; contraste de nombres, evento, `if`, checkout y verificador | Los cuatro nombres requeridos están cableados, pero GATE-01 sigue sin evidencia real de `main` |
| No degradación UI | workflow líneas 62–67; `functional-ui-coverage-gate.mjs` líneas 36–38 y 97–107 | `functional-ui-gate` SUCCESS en el PR | Base cero, inexistente o no alcanzable | Una única prueba negativa focal | **Fallo confirmado:** base inexistente produce PASS |
| Lockfile reproducible | job `generate-lockfile`; `bootstrap-lockfile.yml` | `generate-lockfile` SUCCESS de `60095e8` y lectura del job nuevo | Ejecución real del job nuevo sobre `push main` | Sin duplicar Bootstrap | Fijación pnpm, diff de lockfile, frozen install y gate de configuración presentes |
| Coste de validación | nuevo workflow y `ci.yml:validate` | `validate` ya acredita la batería pesada del mismo árbol | Ninguna laguna que justificase repetir PG17/HTTP/Chromium/F21/builds | No reejecutados | Los jobs breves no invocan F21, PG17, Chromium ni Docker builds; `validate` conserva la integración |
| Paquete inmutable | `ci.yml`, `sabora-release-artifact.mjs`, `sabora-release-bundle.mjs` | Contratos estáticos de SHA, nombre, unicidad, expiración, manifiesto y dos imágenes | No existe ejecución postmerge ni paquete real de este candidato | Consulta de variable pública; ninguna generación | Variable confirmada, paquete **no generado/no validado** |
| Límite de despliegue | `sabora-governed-deploy.yml`, autorización y host governor | Revisión estática | Actuador/forced-command y evidencias físicas no validados | Ninguna operación de host | Un push o CHECK SUCCESS no despliega; `workflow_dispatch`, firma y host siguen separados |
| Veracidad documental | acta Gateway, handoff y tablero | Comparación con GitHub actual | Wording de variable obsoleto | Consulta de metadato público | P3 documental; no cambia el STOP de GATE-02 |

## 3. Evidencia CI reutilizada y coste observado

Para [`60095e8`](https://github.com/jdlc86/CartaViva/commit/60095e836abf57aad310ca8bf8c72fb0b452a087), GitHub devuelve siete check-runs, todos de `github-actions` y con `head_sha` exacto:

| Check | Conclusión real | Tiempo observable | Evidencia |
|---|---:|---:|---|
| `validate` | SUCCESS | 15 min 27 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737244/job/134113889184) |
| `web-publication` | SUCCESS | 59 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737244/job/134113889182) |
| `generate-lockfile` | SUCCESS | 11 min 05 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737233/job/134113888835) |
| `functional-ui-gate` | SUCCESS | 8 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737289/job/134113888324) |
| `windows-offline-signer` | SUCCESS | 26 s | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737244/job/134113888684) |
| `cv005-b2-disposable-integration` | **SKIPPED** | no ejecutado | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737674/job/134113971186) |
| `visual-final-acceptance-gate` | **SKIPPED** | no ejecutado | [job](https://github.com/jdlc86/CartaViva/actions/runs/44104737289/job/134113891831) |

Se reutiliza `validate` para PostgreSQL 17, HTTP/Chromium/F21 y Docker desechable del mismo árbol, conforme al encargo. No se volvieron a ejecutar `pnpm test`, builds, PG17, Chromium ni F21. No se inspeccionaron logs completos donde conclusión, identidad y control estático ya cerraban el riesgo. El tiempo de runner es observable; GitHub no expuso aquí coste monetario y no se inventa.

Prueba ejecutada realmente por Codex, única y justificada:

```text
FUNCTIONAL_UI_BASE_SHA=0000000000000000000000000000000000000000 node scripts/ci/functional-ui-coverage-gate.mjs
```

Resultado: exit code `0`, `FUNCTIONAL_UI_GATE_PASS`, tiempo local observado `0,43 s`. Coste monetario no observable.

## 4. Hallazgos P0–P3

### PR69-P2-01 — el gate UI falla abierto sin base legible

**Severidad:** P2, bloqueo real de integración.<br>
**Rutas:** [`.github/workflows/sabora-main-release-evidence.yml:62-67`](../../.github/workflows/sabora-main-release-evidence.yml#L62-L67), [`scripts/ci/functional-ui-coverage-gate.mjs:36-38`](../../scripts/ci/functional-ui-coverage-gate.mjs#L36-L38) y [`:97-107`](../../scripts/ci/functional-ui-coverage-gate.mjs#L97-L107).

**Causa.** El workflow entrega `github.event.before`. `baseManifest()` acepta un SHA hexadecimal de 40 caracteres, pero convierte cualquier fallo de `git show` o JSON en `null`. Con `prior=null`, el acceso opcional no obtiene `old` y la comparación de downgrade no se ejecuta. El caso se presenta como “initial rollout” sin distinguir una base ausente de una validación normal.

**Reproducción.** El comando focal anterior usa el SHA cero propio de eventos de creación/estado sin predecesor resoluble. El script devuelve PASS. Además, `main` no está protegida, por lo que recreación o reescritura no están excluidas por un control administrativo.

**Impacto.** `functional-ui-gate` es una de las cuatro señales exactas que consume el gobernador. Puede quedar SUCCESS sin verificar la no degradación contra el estado anterior. Los otros tres checks, el paquete, la firma y el actuador limitan el impacto, pero no restauran esta evidencia ausente.

**Cambio focalizado propuesto.** En modo gobernado de `push main`, rechazar SHA cero, base no resoluble y base que no sea el predecesor/ancestro esperado. Si hace falta un bootstrap inicial, convertirlo en modo explícito, excepcional y revisado, nunca en el mismo PASS de no regresión. No basta añadir otra aserción estática al test del YAML.

**Una regresión integradora para el SHA corregido.** Crear historia Git desechable con un manifiesto anterior en estado candidato y uno actual degradado a `PENDIENTE`; comprobar fallo. En el mismo test parametrizado, base cero/no existente/no alcanzable debe fallar y un predecesor válido sin downgrade debe pasar. Después ejecutar solo la CI proporcional al delta y mantener la batería integrada existente en `validate` una sola vez.

### PR69-P3-01 — documentación anacrónica sobre la variable pública

**Severidad:** P3 documental; no es por sí sola una autorización ni un defecto de secretos.<br>
**Rutas:** [`SABORA_S42_GATEWAY_READONLY_DEPLOY_PREFLIGHT_2026-11-17.md:67`](SABORA_S42_GATEWAY_READONLY_DEPLOY_PREFLIGHT_2026-11-17.md#L67), [`SESSION_42_HANDOFF_2026-11-17.md:317`](../handoffs/SESSION_42_HANDOFF_2026-11-17.md#L317) y [`SABORA_LIVE_PROJECT_TRACKER.md:1433`](../tracking/SABORA_LIVE_PROJECT_TRACKER.md#L1433).

GitHub confirma a fecha de revisión la variable de repositorio pública `SABORA_APPROVED_RESTAURANT_CODE=SABORA_00`, creada `2026-11-17T14:44:51Z` y actualizada `2026-11-17T14:46:10Z`. Las frases “no se ha rellenado”, “aún falta” y “sin confirmar” ya no describen el estado actual.

**Corrección propuesta:** registrar existencia, valor y alcance observados, sin afirmar aprobación operativa ni paquete generado. GATE-02 permanece STOP hasta que un `push main` autorizado produzca y se inspeccione materialmente el paquete exacto.

No se modifican esos documentos en esta revisión: el encargo solo permite este informe.

## 5. Hipótesis refutadas y falsos positivos diferenciados

- **“Cinco checks verdes prueban el workflow de main”: refutado.** Son evidencia del árbol funcional en PR, no una ejecución del nuevo trigger `push main` ni cierre de GATE-01.
- **“SKIPPED equivale a PASS”: refutado.** Los dos gates opt-in están consignados como SKIPPED y no acreditan CV-005 B2 ni aceptación visual.
- **“El nuevo workflow duplica las suites caras”: no confirmado.** Sus comandos no llaman F21, PG17, HTTP/Chromium ni Docker builds; `ci.yml:validate` continúa siendo la única batería pesada del SHA main.
- **“Nombres iguales permiten aceptar cualquier run”: no confirmado.** El gobernador comprueba nombre, SHA exacto, estado completado, conclusión SUCCESS y app GitHub Actions; candidatos duplicados no exitosos tampoco satisfacen su condición. La ejecución de main aún debe probarse.
- **“Un push main despliega”: refutado.** La entrega sigue separada en `workflow_dispatch`, autorización Ed25519 ligada a SHA/operación y actuador host. El nuevo workflow solo produce evidencias.
- **“La variable existente cierra GATE-02”: refutado.** Solo cierra la duda documental sobre la variable; no crea ni valida artefactos.

No se hallaron P0 ni P1 en el diferencial revisado.

## 6. Estado de puertas

### GATE-01 — cuatro checks exactos de `main`: STOP

La estructura candidata genera `validate`, `web-publication`, `generate-lockfile` y `functional-ui-gate` para el SHA de un push a `main`, y el gobernador exige que todos estén completed/SUCCESS y pertenezcan a GitHub Actions. Sin embargo:

1. no existe todavía una ejecución postmerge del workflow nuevo sobre el mismo SHA de `main`;
2. PR69-P2-01 permite que `functional-ui-gate` sea verde sin base comparada.

Por ello GATE-01 no puede cerrarse con los cinco SUCCESS del PR.

### GATE-02 — paquete inmutable: STOP

La variable pública requerida existe y vale `SABORA_00`, pero no hay paquete nuevo acreditado. Tras corregir y revisar P2, y solo después de una integración autorizada, la evidencia mínima debe demostrar en el mismo SHA de `main`:

- run de origen y SHA exacto;
- exactamente un artefacto no expirado `sabora-governed-release-package`;
- imagen API e imagen web, ambos Compose esperados, manifiesto y hashes;
- coherencia de SHA/digests, expiración y unicidad mediante el verificador existente.

No se debe construir a mano en VPS ni reutilizar una fixture como aprobación.

## 7. Dictámenes separados

### Integración técnica de #69: NO-GO PARA MERGE

El hallazgo P2 afecta directamente una de las cuatro señales obligatorias de release y tiene reproducción determinista. La CI verde actual no cubre el caso de base ausente y no lo compensa. El PR debe permanecer Draft hasta corregirlo y validar el negativo focal en un nuevo SHA; el P3 documental debería reconciliarse en el mismo hito sin declarar paquete ni deploy.

### Operación/despliegue: NO-GO OPERATIVO

Aunque el P2 se corrija, todavía faltarían como hitos separados: ejecución real de los cuatro checks en el mismo SHA integrado, paquete único inspeccionado, aprobación humana, autorización Ed25519 consumible, actuador/forced-command y preflight reales, seis evidencias físicas, aislamiento de red/egress, backups/restauración reales, SQL operativo autorizado y validado, observabilidad/rollback y aceptación visual humana. Nada de ello se probó o ejecutó aquí.

## 8. Decisión mínima siguiente

El propietario debe asignar una corrección focal dentro del mismo PR #69: hacer fail-closed la carga de base, añadir la única regresión Git integrada descrita y reconciliar las tres afirmaciones documentales sobre la variable. Después, reutilizar lo no afectado y ejecutar una sola CI proporcional del nuevo SHA; una revisión independiente diferencial decidirá si el bloqueo P2 quedó cerrado. Solo entonces correspondería decidir una autorización explícita de merge y, ya en `main`, observar GATE-01/GATE-02 sin desplegar.

**Este informe no constituye APPROVE, autorización de merge ni autorización operativa.**
