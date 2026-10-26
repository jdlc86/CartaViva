# Auditoría global de PR y plan de saneamiento — 2026-10-26

**Ámbito:** únicamente `jdlc86/CartaViva`. Auditoría de metadatos, topología Git, listados de archivos y ejecuciones GitHub Actions. **No** es equivalencia semántica ni revisión exhaustiva de código.

## Snapshot verificado

- Diez PR abiertas, todas Draft: #1, #2, #4, #5, #7, #8, #10, #11, #12 y #13.
- Doce ramas, incluida `main`; HEAD de `main`: `42b46358a7`.
- PR #13: HEAD `5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`, base `integration/sabora-order-management-review` (#7). Este HEAD incluye un commit documental posterior a la revisión independiente del snapshot de código `c1dceba1cb8f8975a3c13c6c56a263f8352d0c81`.
- Últimos workflows para HEAD #13: Sabora CI `40266420041` SUCCESS y Bootstrap lockfile `40266420109` SUCCESS.
- PR #2: 1789 commits y 367 archivos cambiados según metadatos GitHub. El listado de archivos consultado fue paginado y **no** acredita por sí solo el origen de todos los commits.
- Mergeability observada: #4, #8 y #11 `dirty`; #2, #7, #12 y #13 `clean`; #1, #5 y #10 `unknown`. Estos estados pueden cambiar.
- `main` figura `protected=false` en listado de ramas. La lectura del endpoint de protección devolvió HTTP 403 para la integración; el endpoint de rulesets visibles devolvió `[]`. No se ha alterado ninguna configuración.

## Grafo de bases de PR

- #1 -> `main`.
- #2 -> rama de #1.
- #4 y #5 -> rama de #2.
- #7 -> rama de #2.
- #8, #10, #11 y #13 -> rama de #7.
- #12 -> rama de #11.

**Advertencia:** `mergeable=true` solo se refiere a la base declarada, **no** acredita que la cadena completa se pueda integrar en `main` sin conflictos ni autoriza hacerlo.

## Matriz de inclusión por ancestros (comparaciones GitHub)

Comparación `PR origen...HEAD #13`:

| Origen | Estado Git | Ahead de #13 | Behind de #13 | Interpretación |
| --- | --- | ---: | ---: | --- |
| #4 | diverged | 688 | 4 | Los 4 commits de #4 no son ancestros de #13 |
| #5 | diverged | 485 | 11 | Los 11 commits de #5 no son ancestros de #13 |
| #8 | diverged | 278 | 2 | Los 2 commits de #8 no son ancestros de #13 |
| #10 | ahead | 260 | 0 | HEAD #10 es ancestro de #13 |
| #11 | ahead | 82 | 0 | HEAD #11 es ancestro de #13 |
| #12 | ahead | 62 | 0 | HEAD #12 es ancestro de #13 |

**Importante:** la ausencia de ancestralidad de #4, #5 y #8 **no prueba** que falte su funcionalidad. Puede haber cherry-picks, reimplementación o reconciliación. Tampoco la ancestralidad demuestra que no existan regresiones posteriores. No cerrar ni eliminar esas ramas sin una matriz de equivalencia por comportamiento y pruebas.

## Saneamiento por bloques completos

### Bloque A — equivalencia funcional verificable
1. Contrastar archivos y comportamiento de #4/#5 con #7/#13 (operaciones, tablero, historial, catálogo, mesas, permisos y pruebas). Registrar cada delta: preservado, reemplazado con evidencia, ausente o pendiente.
2. Contrastar #8 con #13 (capacidad HMAC, binding del actor, seguridad SQL, RLS y denegaciones), incluyendo diferencias de migraciones y pruebas reales PostgreSQL 17.
3. Confirmar que las aportaciones de #10/#11/#12, aunque ancestrales, siguen funcionando en #13, y revisar cobertura del trabajo de UI de #3 si ya fue cerrado.
4. Revisar el historial y tamaño de #2 contra su base, sin reescritura destructiva.

### Bloque B — consolidación Git
1. Mantener la cadena #1 -> #2 -> #7 -> #13 hasta aprobar un plan de incorporación a `main`; evitar cambiar bases sin validar la nueva comparación.
2. Proponer cierre **sin borrado** de PR redundantes solo cuando se demuestre equivalencia; conservar enlaces, SHA, trazabilidad y evidencia.
3. Si hay deltas faltantes, implementarlos en rama dedicada, con pruebas y revisión independiente, antes de cerrar su PR original.
4. No confundir la documentación normativa con documentos de continuidad; no inventar decisiones para desbloquear funcionalidades.

### Bloque C — gobierno y verificación
1. Proponer a la persona propietaria protección de `main` y checks requeridos; no aplicar cambios de configuración sin confirmar capacidades y autorización.
2. Ejecutar CI y PostgreSQL 17 desechable sobre cualquier commit de consolidación.
3. Actualizar este informe con matriz de equivalencia, resultados y decisiones de cierre; mantener Draft y gates operativos.

## Puertas no superadas

No hay autorización para merge, despliegue, activación de endpoints, grants positivos, claves de producción ni cambios en Supabase operativo. Prohibido modificar Fleetia, VPS y recursos de otros proyectos. La revisión Codex de #13 cubrió el SHA de código `c1dceba1cb`, no esta rama documental ni un futuro código reconciliado.

## Bloque A — inventario de blobs verificado (2026-10-26)

Se consultaron los árboles Git completos (`git/trees?recursive=1`) de HEAD #4, #5, #8 y del snapshot de integración #13 `5a24a1136f`, junto con los archivos cambiados por cada PR respecto a su base. **No** se comparó solo el diff de #13: ese diff excluye archivos heredados de su base y produciría falsos «ausentes».

| PR origen | Archivos cambiados en PR | Mismo blob SHA en #13 | Presentes pero modificados en #13 | Ausentes de árbol #13 |
| --- | ---: | ---: | ---: | ---: |
| #4 | 23 | 6 | 17 | **0** |
| #5 | 20 | 17 | 3 | **0** |
| #8 | 21 | 4 | 17 | **0** |

**Resultado:** los 64 archivos afectados por esas tres PR existen en el árbol de #13. No se ha demostrado equivalencia de comportamiento de los archivos modificados; tampoco se ha identificado pérdida de archivos.

### Evidencia de igualdad exacta

- #4: `order-operations-gateway.{js,d.ts}`, `order-operations-model.{js,d.ts}`, migración `20261023225024_sabora_kitchen_waiter_operations_candidate.sql` y `tests/order-operations-sql.test.mjs` tienen el mismo blob.
- #5: 17/20 blobs iguales, incluidos modelos de lectura de mesas/catálogo, vistas `CatalogView.tsx` y `TablesView.tsx`, componentes `Icon`/`Primitives` y sus tests. Difieren `main.tsx`, `style.css` y `SABORA_ADMIN_UI_CODEX_HANDOFF.md`.
- #8: 4/21 blobs iguales, entre ellos `order-operation-capability.mjs` y `tests/order-operation-capability.test.mjs`; 17 archivos de frontera SQL/operaciones cambiaron posteriormente.

### Pendientes que impiden cerrar PR

1. #4: comprobar comportamiento actual de `OrdersView.tsx`, transiciones, permisos y contratos de SQL, y que los cambios respecto al origen son endurecimientos compatibles.
2. #5: comprobar integración de navegación/estilos en `main.tsx` y `style.css`, incluida experiencia responsive y guardias de lectura.
3. #8: demostrar que el actor SQL y las capacidades HMAC conservan el contrato, con pruebas de suplantación, caducidad y revocación en PostgreSQL 17.
4. #10/#11/#12: la ancestralidad ya está verificada; validar regresiones sobre HEAD final antes de cualquier cierre.
5. #2: auditar la razón de los 1789 commits y la integración a `main` sin reescribir historia ni fusionar.

**CI de la rama documental del PR #14:** Sabora CI run `40267068061` terminó SUCCESS. Esta prueba no sustituye el análisis semántico pendiente.

**Decisión:** conservar todas las PR existentes en Draft. Ninguna se cierra o fusiona basándose exclusivamente en esta matriz.

## Bloque B — verificación dirigida de integración de interfaz y controles (2026-10-26)

Se inspeccionó el contenido real de `apps/management/src/main.tsx` en #5 y #13:

- La estructura de navegación, `parseManagementArea`, `toManagementHash`, `tablesGateway`, `catalogGateway`, `CatalogView` y `TablesView` se conservan en #13.
- #13 incorpora adicionalmente el tipo `OrderOperationsGateway`, la propiedad opcional `operationsGateway` y el paso de esa propiedad a `OrdersView`. El montaje por defecto sigue llamando a `<ManagementApp/>` sin inyectar ningún gateway; por tanto **no acredita activación operativa**.
- Las vistas `CatalogView.tsx` y `TablesView.tsx` y sus pruebas de modelos de lectura tienen blob idéntico al #5. La hoja `style.css` es distinta, y la regresión visual responsive no queda certificada por una comparación de SHA.
- En #4 frente a #13, los módulos de transporte y modelo de operaciones son idénticos, mientras que `OrdersView.tsx` y las capas HTTP/SQL se modificaron. El cambio exige prueba de comportamiento, no copia directa del código antiguo.
- En #8 frente a #13, la implementación de `order-operation-capability.mjs` y su test de capacidad conservan SHA idéntico. El preflight SQL y las composiciones posteriores difieren; el gate normativo de activación sigue cerrado.

### Estado de la evidencia automatizada

- El HEAD documental #14 `33611ec1c6fe447d132153c135fdc66d0901fef3` pasó Sabora CI run `40267579456`.
- La suite completa PostgreSQL 17 (87/87) y el check raíz (895/895) corresponden al snapshot de código #13 `c1dceba1cb`, según el informe de cierre; no se han vuelto a ejecutar localmente en esta auditoría.
- **No** se declara equivalencia funcional completa, ni se cierran PR #4, #5 o #8 por estas pruebas documentales.

### Conclusión operativa

La integración de navegación y lectura de #5 está preservada a nivel de código inspeccionado; las interfaces de operaciones de #4 están presentes, pero su comportamiento modificado requiere pruebas. El contrato de capacidad de #8 conserva su módulo base exacto, pero el preflight SQL debe mantenerse sujeto a revisión y pruebas de seguridad. Antes de archivar PR se requiere la matriz final de casos de aceptación y una revisión de diferencias semánticas de los archivos no idénticos.
