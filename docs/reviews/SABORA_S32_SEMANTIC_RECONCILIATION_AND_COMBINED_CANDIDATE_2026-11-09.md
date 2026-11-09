# Sabora / CartaViva — conciliación semántica histórica y candidatura combinada de sesión 32 (2026-11-09)

> **INFORME DE IMPLEMENTACIÓN Y EVIDENCIA, NO DOCUMENTO NORMATIVO, ACEPTACIÓN INDEPENDIENTE, FUSIÓN AUTORIZADA NI GO OPERATIVO.** La normativa funcional/seguridad/visual del repositorio prevalece. Ninguna aprobación o estado de una prueba puede atribuirse a un SHA distinto del realmente ejecutado.
>
> **Única continuidad enlazada a este documento:** [sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md). **Plan de saneamiento:** [documento S1–S4](SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md). **PR aislado nuevo:** [#54 Draft](https://github.com/jdlc86/CartaViva/pull/54), base #53 y jamás `main`.

## 1. Antecedentes obligatorios y alcance real

Antes de trabajar se releyeron continuidades 20–23, 25, 27–32; informes [grafo 42 PR](SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md), [conciliación histórica 13 divergencias](SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md), [cierre delimitado 06-11](SABORA_REPOSITORY_STABILIZATION_CLOSURE_2026-11-06.md), contratos [funcionales](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [RF](../REQUISITOS_FUNCIONALES.md), [gobierno único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [operaciones de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) y [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md).

La estabilización de **PR #49** del 06-11 con **5/5 workflows** y la conciliación estática de los **42 PR** existentes son trabajo YA REALIZADO y no se han repetido. GitHub contra HEAD #53 documentó **31 PR ancestros, 14 divergentes y uno de referencia**. Este expediente se centra en **las cinco familias funcionales antiguas** y la combinación de los hermanos #52/#53.

## 2. Conciliación focalizada de las cinco familias históricas

Se compararon nuevamente `merge-base` y archivos de cada HEAD legado frente al **commit conjunto inicial** `f95a49a26bf86a95eef0c5fa35dc17bce7c0c965`. Los recuentos son entradas por PR, no archivos únicos entre PR. No se sustituyó código actual por versiones históricas ni se eliminó test alguno.

| PR histórico | Rutas en su delta | Blob idéntico actual | Evolucionadas | Ausentes | Evidencia semántica y dictamen acotado |
| --- | ---: | ---: | ---: | ---: | --- |
| [#4 cocina/sala](https://github.com/jdlc86/CartaViva/pull/4) | 23 | 2 | 21 | **0** | La migración y tests de operaciones permanecen; el coordinador actual exige capacidad firmada y revalida pertenencia en SQL; operación y `pickup-claim` tienen semántica posterior, no entrega física. **Evolución compatible documentada**, no equivalencia visual/histórica íntegra |
| [#5 gestión](https://github.com/jdlc86/CartaViva/pull/5) | 20 | 8 | 12 | **0** | Modelos de navegación/lectura y componentes originales conservados; acciones M3 opt-in y permisos por servidor se añaden. Tests de contrato y Chromium gestión existentes. **Preservación estructural y técnica**, aceptación humana de diseño pendiente |
| [#8 actor SQL](https://github.com/jdlc86/CartaViva/pull/8) | 21 | 3 | 18 | **0** | Capacidad HMAC y pruebas anteriores conservadas; migración actual recuenta `clock_timestamp()` tras locks y deniega token/clave caducados; no reintroducir roles o concesiones antiguas. **Endurecimiento de seguridad verificado en código**, explotación productiva no certificada |
| [#17 GET HTTP](https://github.com/jdlc86/CartaViva/pull/17) | 3 | 1 | 2 | **0** | Lecturas siguen validando `limit`, `status`, cursor, filtrado por rol y cuerpo escalar; modo `legacyPickupDisabled` rechaza recogida heredada con 409. **Conservación contractual focal**, no equivalencia de cada respuesta histórica |
| [#22 cesta H3](https://github.com/jdlc86/CartaViva/pull/22) | 9 | 5 | 4 | **0** | Cinco informes H3 idénticos por blob; actual `client-state.ts` usa `basketLineKey(itemId, opciones, extras)`, distintas variantes coexisten y las iguales se agregan. Test Node «one dish retains independent configured variants…» cubre persistencia, edición, precio y totales. CV-019 subsanó la brecha RF detectada el 06-11. **La brecha de variante ya no puede seguir tratándose como ausente**, aunque aceptación visual y equivalencia histórica global siguen pendientes |

**Total actual de esas cinco ramas:** 76 entradas, **19 blobs iguales, 57 evolucionados, cero rutas faltantes**. Es distinta de la fotografía de #49 (22/54/0) porque continuó el desarrollo. Las diferencias por SHA **no** demuestran pérdida funcional. Los originales #18–#21 son una sola cadena H3 que desemboca en #22; #14/#31/#40/#44 son divergencias documentales cuya conservación ya se documentó el 06-11. No ejecutar cherry-picks ciegos ni aprobar cierres por ausencia de rutas faltantes.

**Estado real S1:** **genealogía 46/46 y decisiones de tratamiento por familia registradas**; la equivalencia semántica absoluta de todos los cambios históricos no se ha certificado. Se recomienda mantener en Draft las cinco familias bajo revisión hasta aceptar sus deltas significativos conforme al contrato vigente y experiencia humana, sin duplicar la implementación ya cubierta.

## 3. Implementación conjunta comprobable de los hermanos #52 + #53

Se creó [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54), rama `integration/sabora-s32-admin-waiter-sanitization-20261109`, sobre #53. **Commit real de dos padres:** `f95a49a26bf86a95eef0c5fa35dc17bce7c0c965`; progenitores HEAD #53 `3c82ade9` y HEAD #52 `c602c923`. Git compara ambos como **ancestros** del resultado. Se conservaron los **24 blobs exclusivamente cambiados por #52** y se conciliaron manualmente **9 archivos que ambas ramas modificaron**, sin resolver por estrategia arbitraria `ours`/`theirs`.

| Archivo compartido | Resolución aplicada en candidatura |
| --- | --- |
| `apps/api/src/m2-restaurant-candidate.mjs` | Se mantienen los opt-in `management.ownership` y `waiterCalls`, los dos preflights de LOGIN/capacidad, pools aislados, TX/RPC explícitos y registro HTTP de ambos. |
| `apps/management/src/main.tsx` | Integración en Equipo de `ownershipGateway` junto al circuito de llamadas; reemplazo de identidad invalida **todos** los gateways en el mismo `managementSessionFence`; ambos switches opt-in. |
| `scripts/ci/catalog-postgres17-node-driver-smoke.sh` | Ejecuta ambos E2E reales `ownership-governance-postgres17.test.mjs` y `waiter-calls-postgres17.test.mjs`, además de conservar el circuito CV-014 de anuncios. |
| `scripts/ci/cv012-two-pwa-installation.mjs` | Exige activación completa del script/SW del ámbito correcto y mantiene prueba del controlador; agrega diagnóstico seguro de fallo de activación, sin fallback a PASS. |
| `scripts/ci/cv014-communications-postgres17.test.mjs` | Conserva la inserción explícita de negrita y controles editor→borrador→proyección→DOM; refuerza coincidencia exacta del cuerpo completo antes de la limpieza del formulario. |
| `scripts/ci/migration-audit.mjs` | Incluye **las cinco migraciones ADMIN** y la migración de llamada, además de toda la auditoría previa. |
| `scripts/ci/postgres-migration-smoke.sh` | Verifica **69 tablas FORCE RLS**, incluidas las nuevas `admin_ownership_notifications`, `waiter_calls`, `waiter_call_events`, con controles de concesión negativa. |
| `scripts/ci/table-change-root-postgres17.test.mjs` | Conserva el caso más fuerte de #53: deniega suspender al ADMIN propietario y comprueba revocación de un ADMIN no titular sin dejar estado sin dueño. |
| `docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md` | Preserva las secciones de ambos historiales: CV-014 55–60 más el expediente de titularidad ADMIN 55–70 como anexo identificable `ADMIN-55…70`, sin sustituir los contratos normativos. |

**Revisión de árbol:** contiene las migraciones candidatas ADMIN 20261108150000, 160000, 170000, 180000, 20261109010000 y la llamada 20261109020000; los dos módulos de API y ambos E2E. El arranque `server.mjs` permanece health-only; el montaje conjunto sigue explícitamente opt-in, nunca productivo.

## 4. Pruebas de integración y incidencias

**Primera candidatura funcional:** `f95a49a2`. Se iniciaron los **6 workflows** automáticos de [PR #54](https://github.com/jdlc86/CartaViva/pull/54). El Bootstrap PG17 [run 42703957182](https://github.com/jdlc86/CartaViva/actions/runs/42703957182) y el H6 [run 42703956805](https://github.com/jdlc86/CartaViva/actions/runs/42703956805) dieron **FAILURE**, tras pasar las puertas iniciales: la causa demostrada en log fue una aserción añadida por esta conciliación que leía el editor **después de Guardar borrador**, cuando la PWA lo había limpiado. El borrador real sí conservaba `**negrita**`. No es una pérdida de datos acreditada.

**Corrección causal:** commit `03d1e61faa8857396ed051c91e5c36c314a2b2f9` registra `formattedBody` **antes** de guardar y conserva las verificaciones de coincidencia exacta en borrador y proyección publicada; no se han retirado comprobaciones ni cambiado normativa. La nueva cadena de seis workflows es independiente y deberá comprobarse en este SHA. **No declarar 6/6 mientras haya ejecuciones pendientes**, ni atribuir a `03d1e61f` los cuatro checks correctos de `f95a49a2` sin un nuevo run.

**S3 pendiente de conclusión:** confirmar PG17 real, H6 consolidado, CV-012, PWA gestión/cliente y puerta funcional/UI en un mismo SHA; si falla un requisito, diagnosticar causa y repetir batería, no añadir micropruebas que oculten el fallo. El resultado documentado de #52 y #53 individualmente sigue válido para sus SHAs propios, no para el conjunto.

## 5. Decisiones y límites que no cambian

- **No se ha autorizado fusionar PR #54, #52, #53 ni históricos a `main`**; no eliminar ramas o cerrar PR. Quedan pendientes decisiones trazables por PR, revisión independiente del gobierno de titularidad y aceptación humana F28/R09.
- Este expediente acredita código fusionado **en rama candidata aislada**, no una operación en el servidor; no se ha desplegado Sabora ni aplicado SQL al Supabase operativo. No tocar Fleetia, contenedores, red o servicios del VPS compartido, ni cualquier recurso de otro proyecto.
- CV-013 Excel continúa bloqueado por origen histórico de empresa y RGPD; Stripe test real M4, M6, reservas CV-014 y otros puntos de matriz continúan sujetos a sus puertas normativas. No reabrir la fase completa de estabilización ni fingir que las 46 PR son independientes.
- Después de verificar el CI del candidato, el siguiente paso será preparar el **expediente de decisiones de PR (S4)** y solicitar autorización antes de cierres/fusiones. Cualquier revisión del mismo autor es comentario, nunca aprobación independiente.
