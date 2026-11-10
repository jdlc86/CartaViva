# Sabora / CartaViva — continuidad operativa de la sesión 35 (2026-11-10)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** Su propósito es preservar el contexto, los SHA y el siguiente bloque de ejecución. La fuente de verdad normativa son los contratos versionados en este repositorio. No supone aprobación de equivalencia funcional, revisión independiente, aceptación estética, autorización de merge, cierre de PR, migración ni despliegue. Los resultados de CI se atribuyen **solo a los SHA exactos ensayados**. **Este es el documento vivo de continuidad a partir de la sesión 35**: los nuevos hitos relevantes se añaden aquí, sin continuar ampliando la sesión 34.

## 1. Navegación y fuentes obligatorias

- **Continuidad inmediatamente anterior:** [sesión 34](SESSION_34_HANDOFF_2026-11-10.md), especialmente hitos S34-13, S34-14 y S34-15.
- **Contexto de estabilización:** [sesión 33](SESSION_33_HANDOFF_2026-11-10.md) y [sesión 32](SESSION_32_HANDOFF_2026-11-09.md).
- **Tablero vivo y estado de hitos:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §§84–86.
- **Plan de saneamiento:** [SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md).
- **Conciliación de nueve PR, actualizada después del merge:** [SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md](../reviews/SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md), especialmente §9.
- **Preflight y acta de integración/cierre:** [SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md), §§11–13.
- **Prueba M3→H3 previa:** [SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md](../reviews/SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md).
- **Matriz funcional/UI:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json).
- **PR integral actual:** [#55 Draft](https://github.com/jdlc86/CartaViva/pull/55), únicamente de pruebas.
- **CI de ese PR:** [Bootstrap PG17 #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103) · [Sabora CI #42900656064](https://github.com/jdlc86/CartaViva/actions/runs/42900656064) · [cobertura/UI #42900656026](https://github.com/jdlc86/CartaViva/actions/runs/42900656026).

### Precedencia normativa — no inventar ni reinterpretar

- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md) y [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md).
- [Contrato cocina/sala](../architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md) con las decisiones vigentes del contrato consolidado «Voy a recoger» / «Cancelo»; no reinstaurar mecánicamente la antigua transición `picked_up`.
- [ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [contrato operativo de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) y [ADMIN_WRITE_OWNERSHIP_V1](../security/ADMIN_WRITE_OWNERSHIP_V1.md). Las solicitudes de cesión se dirigen al titular **resuelto en servidor**, nunca a un destinatario seleccionado arbitrariamente por el cliente.
- [Dos PWA independientes CV-012](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md).
- [Contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md) y [auditoría del estilo visual aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md). La conformidad visual humana sigue separada del CI.

## 2. Fotografía comprobada al abrir la sesión 35 — 10-11-2026

**Repositorio exclusivo:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). Lectura directa de GitHub al abrir esta continuidad:

| Dimensión | Estado comprobado | Consecuencia |
| --- | --- | --- |
| `main` | `7891b3050181134a958b06de008e81e38f6a4788` | HEAD con documentación posterior al merge funcional; no confundir con el SHA probado |
| Merge integral de desarrollo | [PR #54 merged](https://github.com/jdlc86/CartaViva/pull/54), commit `a91867fbacb9319d16496b04a5fe237739c31837` | Código acumulado ya incorporado a `main` |
| 32 PR ancestrales | **32 cerrados sin merge individual**, previa comprobación de que sus HEAD son ancestros de `main` | S4 de la familia ancestral finalizado |
| PR históricos restantes | **Nueve Draft abiertos:** #4/#5/#8/#17/#18/#19/#20/#21/#22 | Divergencias no homologadas ni cerradas |
| PR nuevo de integración | [#55](https://github.com/jdlc86/CartaViva/pull/55), abierto/Draft, base `main`, HEAD `7b6cd8d5db390d36b9302181b64a7fc2a0ed87c4` | **Total de PR abiertos: 10**. GitHub API: `mergeable=true`, `mergeable_state=clean` al corte; no implica autorización de merge |
| Modificación #55 | Un único archivo: `scripts/ci/customer-production-postgres17.test.mjs` (**55 adiciones, 0 eliminaciones**) | Test integrador ampliado; **ningún cambio de runtime, SQL, UI ni contratos normativos** |
| CI #55 | **3/3 workflows disparados: completed/success** en el HEAD `7b6cd8d5...` | Éxito automático acotado a los workflows que efectivamente se dispararon |
| Aceptación visual final | `skipped` en el workflow de cobertura | **No** equivale a aceptación humana |
| Estado de explotación | Propietario declara sin usuarios ni producción activa | No supone que Supabase esté vacío ni autoriza acceso operativo |

**Evidencia especial de la nueva prueba conectada, verificada en el log del job Bootstrap `generate-lockfile`, ID `130125437191`:**

```text
# S34 M3 owner PWA -> restricted PG17 -> public HTTP publication PASS
# S34 published withdrawal -> H3 blocked -> ADMIN restore PASS
ok 1 - real PG17 and Chromium complete the restricted H3/H4 full-stack flow
# tests 1
# pass 1
# fail 0
```

El test corresponde al [run Bootstrap #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103) del commit **`7b6cd8d5`**. [Sabora CI #42900656064](https://github.com/jdlc86/CartaViva/actions/runs/42900656064) también `completed/success`; [cobertura funcional/UI #42900656026](https://github.com/jdlc86/CartaViva/actions/runs/42900656026) `completed/success`. Son **tres workflows de PR** activados por los filtros de rutas, **no** una nueva ejecución de los seis workflows históricos de `d49ee05b`.

## 3. Qué está implementado, qué está probado y qué NO está validado

### Implementado en `main` y probado previamente

- Identidad y límites de actor SQL/HMAC, permisos y roles, ADMIN titular escritor único, PWA cliente y gestión independientes, operaciones H3/H4, M3 dinámico, H6 y sus módulos integrados según las evidencias y limitaciones de [S34](SESSION_34_HANDOFF_2026-11-10.md) y [preflight](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md).
- E2E con categoría administrada desde PWA real, variantes Suave/Picante, precio publicado cambiado, consentimiento individual, cotización, confirmación, instantáneas SQL, idempotencia y líneas independientes en cocina; 6/6 workflows históricos sobre `d49ee05b` con base `main` y Sabora CI `success` post-merge sobre `a91867fb`.

### Implementado en PR #55 y comprobado en GitHub Actions (todavía no fusionado)

- ADMIN titular publica un plato con dos variantes en un PostgreSQL 17 desechable. Desde la PWA de gestión lo retira; el endpoint real de catálogo deja de servirlo.
- En la misma PWA cliente, ambas variantes sobreviven en la cesta, aparecen como retiradas y bloquean el checkout, sin emitir nueva cotización ni pedido.
- ADMIN republica el borrador; la PWA cliente conserva las dos variantes, y el circuito integral existente continúa con cambio de precio y consentimiento explícito hasta la confirmación y las instantáneas SQL.
- **Resultado:** log del escenario conectado **PASS 1/1** en Bootstrap, más tres workflows de PR `SUCCESS` en el mismo HEAD. **Esto prueba esa ruta**, no todos los supuestos de catálogo, pago y sala.

### No acreditado / puertas autónomas

- La composición integral final M3/H3–H6 con todos los opt-ins y el modelo H6 de `claimPickup`/ `cancelPickup`/ `correctReady` no queda homologada **por el solo** E2E de #55; revisar las suites H6 existentes antes de añadir otro escenario.
- La sincronización entre pestañas H3 ya tiene pruebas Chromium con mocks, pero no se ha convertido automáticamente en prueba SQL del mismo circuito de #55.
- Nueve PR históricos siguen **`diverged`** frente a `main`; en la auditoría S34-14 sus **88 menciones de archivos por PR** se distribuyen en **19 blobs idénticos, 69 evolucionados, ninguna ruta desaparecida**. Eso no demuestra paridad semántica ni que sus HEAD sean ancestros.
- Sin revisión independiente aprobatoria ni aceptación visual humana final F28/R09. Stripe remoto M4, CV-013, CV-014 pendiente normativo, recuperación M6/PITR y despliegue son puertas de activación posteriores, no pretexto para bloquear el desarrollo de código sin usuarios.

## 4. Bloque grande prioritario de sesión 35 — cerrar un hito funcional, no multiplicar correcciones

**B35-A: culminación del circuito integrado existente y resolución de disposición de los nueve PR.** Evitar abrir un PR por cada asunto. La secuencia lógica es:

1. **Tomar #55 como un solo cambio integrador ya probado.** Inspeccionar logs definitivos y contenido del diff, comparar HEAD y base actuales, confirmar invariantes de retirada/republicación y el estado Git real; revisar si alguna brecha contractual exige corrección. Evaluar su incorporación a `main` **solo tras autorización de merge**, no confundir Draft/CI verde con permiso.
2. **Resolver las divergencias como familias:**
   - **#18–#22 (H3):** integridad local, agotados/retirados, cambios de precio, consentimiento por variante y sincronización. La ruta SQL/HTTP/Chromium de #55 y suites existentes refuerzan la prueba, pero no prueban todos los casos de borde; decidir sustitución o brecha concreta por contrato.
   - **#5 (M3/mesas):** categorías/pedidos ya conectados; contrastar gestión/readiness/QR y roles con los contratos y pruebas existentes.
   - **#4 (sala/cocina):** el antiguo `ready → picked_up` no sustituye la asignación «Voy a recoger», renuncia «Cancelo» ni corrección de cocina del H6 vigente. Revisar exclusión, concurrencia y denegaciones del flujo moderno.
   - **#8 (SQL/actor):** proteger HMAC, revalidación tras locks, expiración, suplantación, revocación y permisos mínimos. Requiere dictamen especialmente estricto por ser frontera de seguridad.
   - **#17 (HTTP GET):** validar tipos escalares, cursores y errores denegados en la ruta efectiva. El control figura en `order-operations-http.mjs`.
3. **Emitir un único dictamen de disposición nominal, con contrato, delta exclusivo, ruta actual y prueba exacta.** Clasificar por PR: `equivalencia demostrada`, `sustituida conforme a norma`, `brecha concreta` o `no verificada`. Solo tras esa decisión y autorización específica proceder a cierres **sin merge** de ramas históricas que se resuelvan; no restaurar commits antiguos de manera automática.
4. **Cerrar el hito con las baterías integradoras existentes**, de PostgreSQL 17/HTTP/Chromium y seguridad pertinentes. Pruebas aisladas nuevas únicamente para diagnosticar un fallo o proteger un requisito crítico, nunca como sustituto de la integración. Registrar por separado: código implementado, tests realmente ejecutados, validación independiente, decisión de merge/cierre.

**Objetivo operativo:** cerrar S4 con menos PR redundantes y garantías verificadas, conservando el alcance un solo restaurante, sin mezclar saneamiento administrativo con activación productiva. La ausencia de usuarios reduce barreras productivas de datos, **no** las exigencias de seguridad funcional.

## 5. Límites, permisos y disciplina documental

- **Solo** se permite actuar en `jdlc86/CartaViva`. Fleetia es otro proyecto y comparte VPS: **prohibido tocar sus repositorios, contenedores, datos, recursos, volúmenes o redes**; desplegar, reiniciar o eliminar Sabora no debe detener, modificar ni depender de contenedores ajenos.
- No desplegar ni ejecutar migraciones/roles en Supabase operativo ni intervenir en el VPS por la existencia de CI. Toda actuación de despliegue requiere permiso **expreso** y aislamiento.
- Los merges de nuevos PR, cierres de las nueve divergencias, modificaciones de protección de `main` y despliegues son decisiones distintas. La autorización histórica para integrar #54 y cerrar 32 ancestrales **no** se amplía automáticamente.
- Fuente de verdad: **documentos normativos de GitHub**. La continuidad y el tablero sirven para contexto y evidencias con su fecha, no para crear reglas nuevas.
- **Desde este punto, el documento vivo de continuidad es esta sesión 35**. Añadir hitos significativos aquí con enlaces a commit/PR/workflows y resultado comprobado; actualizar el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) cuando se cierre un hito, sin reescribir ni engordar la continuidad 34. No lanzar suites redundantes para simples commits `[skip ci]`.

## 6. Registro vivo de sesión 35

### S35-0 — apertura y revalidación de la prueba integradora

**Realizado:** creación de esta continuidad en `main`, con enlaces a S34, contratos, tablero, matriz, conciliación de nueve divergentes, PR #55 y acciones concretas. Se reconsultaron **10 PR abiertos** (9 históricos + #55), `main@7891b305`, PR #55 `7b6cd8d5` Draft/base `main` con `mergeable_state=clean` y sus **tres workflows `completed/success`**. El log Bootstrap confirma explícitamente `S34 published withdrawal -> H3 blocked -> ADMIN restore PASS` y escenario PostgreSQL 17/Chromium **1/1 PASS**.

**No realizado por esta apertura:** modificación de código producto, ejecución manual nueva de pruebas, revisión independiente, merge de #55, cierre de los nueve PR, cambios de protección, despliegue, migración Supabase operativa ni acción sobre VPS/Fleetia.

**Siguiente hito:** revisión final del alcance del PR #55 ya probado, decidir integración de desarrollo de manera explícita y resolver la matriz semántica de nueve PR en bloques completos; **S4 sigue NO FINALIZADO**.

---

_Este documento es la continuidad activa desde la sesión 35. La [sesión 34](SESSION_34_HANDOFF_2026-11-10.md) queda como antecedente histórico y no debe recibir los nuevos hitos de trabajo._
