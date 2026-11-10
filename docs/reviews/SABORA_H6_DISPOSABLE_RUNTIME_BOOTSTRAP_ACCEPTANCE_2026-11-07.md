# Sabora — Hito de arranque integral de ensayo H3–H6/M3 sobre PG17 desechable (07-11-2026)

**Dictamen acotado:** **CANDIDATO TÉCNICO VALIDADO EN ENTORNO DE PRUEBA**, **NO-GO operativo, funcional global H6 y producción**. Esta revisión se hace en el único restaurante Sabora, [PR #49 Draft](https://github.com/jdlc86/CartaViva/pull/49), rama `feat/sabora-cv012-independent-pwas-20261106`, sin merge, sin despliegue, sin alterar Fleetia/VPS/Supabase operativo. No constituye aprobación humana ni autorización de operación.

## 1. Jerarquía normativa y alcance permitido

Fuente de verdad inalterada: [contrato consolidado NF](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [RF](../REQUISITOS_FUNCIONALES.md), [DV](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [matriz F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). Los [dictámenes anteriores](SABORA_H6_FUNCTIONAL_ACCEPTANCE_ACT_2026-11-07.md) conservan límites de Stripe/caja, diseño, credenciales, validación de operaciones y producción. No modificar reglas para hacer pasar CI.

**SHA funcional ejecutado realmente:** `16fe8c06e75c311a7b1f902103c05d8b1941cb0d` (después de `ded045e7`), antes de este informe documental. Los workflows de un commit posterior de documentación tienen su propia conclusión y **no heredan** las cinco aprobaciones del SHA funcional.

## 2. Implementado — límite de arranque y recorrido de extremo a extremo

- **Nuevo `scripts/ci/disposable-h6-runtime-bootstrap.mjs`**, integrado en el **escenario PG17 #49 existente** de `scripts/ci/table-change-root-postgres17.test.mjs`; no se crean micropruebas desconectadas. No modifica `apps/api/src/server.mjs`, migraciones, red de VPS ni roles operativos.
- Exige `GITHUB_ACTIONS=true`, `RUNNER_TEMP`, paquete `pg` instalado en directorio temporal y URL exacta `postgresql://postgres:…@127.0.0.1:<puerto>/postgres`, con contraseña **centinela efímera**. Rechaza entornos no CI, `NODE_ENV=production`, hosts externos, otros usuarios/bases y opciones de URI, **antes de consultar pools**.
- Exige origen de cliente HTTPS de fixture `https://sabora.example`, QR de restaurante `SABORA_CI` y adaptador de ensayo explícitamente marcado. **No se confía en esa etiqueta:** lo sustituye por cinco operaciones Stripe inertes que lanzan error (`authorize/capture/release/refund/retrieve`) y fuerza `enableDeferredDispatch=false`. No hay posibilidad de autorizar/capturar/reembolsar mediante ese adaptador. Este ensayo no cubre Stripe sandbox.
- Reutiliza `createM3RestaurantCandidate` y su composición M2/H3–H6: **17 pools de capacidades de aplicación con identidades SQL diferenciadas y preflight de funciones/permisos exactos**, más conexiones de notificación supervisadas. Son **15 capacidades base M2 + 2 de gestión M3**, no «18 roles validados» por el constructor. El harness general puede crear otros logins que no pertenecen a esta composición. No hay superusuario disponible como pool HTTP ni fallback para suplantar roles.
- Monta **Fastify real** exclusivamente en **`127.0.0.1:0`** tras superar los preflights, comprueba mediante **peticiones HTTP** `/health`, `/ready`, `/api/v1/catalog` (lectura PG17) y rechazo **401/403** de `/api/v1/operations/table-change/pending` sin JWT. Ante error de preflight/listener/respuesta cierra el candidato y falla, con mensajes saneados.
- El E2E PostgreSQL 17 #49 ya recorría **PWA gestión y PWA cliente reales en Chromium**, con las Vite de prueba redirigiendo su tráfico HTTPS a los listeners loopback de Fastify y las dos interfaces. Ahora se utiliza el **servidor ya arrancado por el bootstrap verificado**, sin una segunda escucha directa que pudiera saltarse la puerta. Cubre gestión de categorías y mesas/QR, cliente, pedido, H6 económico, roles y cocina; pruebas de SSE H6 reales se ejecutan en escenarios **separados del mismo gate**.
- Rechazos antes de tocar SQL comprobados dentro del mismo caso: sin marcador GitHub Actions y URL que apunta a host externo. No se leen secretos operativos ni se crea un SQL LOGIN por esta función.

**Límite de alcance NO disimulable:** este es un **listener Fastify opt-in en el mismo proceso del harness de pruebas**, **no** un nuevo proceso autónomo apto para despliegue. La PWA M3 se sirve con Vite de prueba; CV-012 comprueba aparte las compilaciones/instalaciones PWA. En el test M3 Chromium, la conexión SSE streaming se aborta explícitamente por limitación del proxy Playwright; la cobertura SSE/cursores/reconexión procede del resto de las pruebas integradas H6 y **no** de ese recorrido M3 concreto. El proveedor de pagos está anulado y el planificador diferido desactivado en esta ruta; F21 se verifica en otro escenario PG17 con plazo natural. No extrapolar validación de una capa a otra.

## 3. Pruebas ejecutadas del mismo SHA — resultados reales

| Puerta | Evidencia de GitHub Actions | Resultado |
| --- | --- | --- |
| [Sabora CI H6 #42353495526](https://github.com/jdlc86/CartaViva/actions/runs/42353495526) | **Bloque 1 contratos/Node, bloque 2A migraciones/privilegios PostgreSQL 17, bloque 2B PG17/Fastify/HMAC/Chromium E2E** | **SUCCESS / PASS 3 bloques** |
| [Bootstrap PG17 #42353495560](https://github.com/jdlc86/CartaViva/actions/runs/42353495560) | **1.350/1.350 Node**, **51/51 PG17** (subtest #49 **PASS** con el nuevo arranque), **4/4** de coste cero, sin fallos reportados en esas suites | **SUCCESS** |
| [Chromium cliente #42353495561](https://github.com/jdlc86/CartaViva/actions/runs/42353495561) | Conformidad navegador (fixture HTTP donde se declara; no sustituye #49 PG17) | **SUCCESS** |
| [Chromium gestión #42353495530](https://github.com/jdlc86/CartaViva/actions/runs/42353495530) | Smoke de gestión independiente | **SUCCESS** |
| [CV-012 dos PWA #42353495514](https://github.com/jdlc86/CartaViva/actions/runs/42353495514) | Instalación de ambos scopes, offline/online y control de caché | **SUCCESS** |

**Artefactos conservados temporalmente:** de [H6 #42353495526](https://github.com/jdlc86/CartaViva/actions/runs/42353495526), `sabora-h6-acceptance-logs` (ID **13567311130**), `sabora-block-01-full-stack-browser` (ID **13567271391**) y `sabora-m3-pg17-two-pwa-browser` (ID **13567077773**), vencen alrededor del **14-11-2026**; del [Bootstrap #42353495560](https://github.com/jdlc86/CartaViva/actions/runs/42353495560), `sabora-m3-pg17-two-pwa-browser` (ID **13566802959**). Capturas generadas automáticamente **no** son baselines humanos aprobados.

El commit anterior `ded045e7` también pasó sus cinco workflows, incluido el nuevo arranque; el endurecimiento de proveedor y scheduler se verificó en `16fe8c06e75c311a7b1f902103c05d8b1941cb0d`. Hubo un fallo de service worker **intermitente** en el commit documental previo `c95aa3ec`, cuyo rerun pasó: el SHA actual CV-012 también es SUCCESS. Conservar el antecedente, no afirmar causa definitiva.

## 4. Dictamen por requisitos, bloqueos y continuidad

| Criterio/hito | Estado tras esta ejecución | Restricción de cierre |
| --- | --- | --- |
| **CV-005 / M2** | **CANDIDATO TÉCNICO AMPLIADO Y VALIDADO EN CI** | Arranque en proceso de ensayo, PG17 efímero, listener loopback, 17 capacidades, ambas PWA; **sin** cutover del `server.mjs` ordinario |
| **F12/R08** | **CANDIDATO opt-in, NO OPERATIVO** | Un servidor productivo real no se ha autorizado: `server.mjs` continúa `health-only`, preflight de secretos/roles/entorno real no acreditado |
| **F20/R03–R05** | **PARCIAL/BLOQUEADO** | Stripe sandbox auténtico + caja aprobada siguen sin ejecutarse; proveedor en este ensayo **deshabilitado deliberadamente** |
| **F28/R09** | **BLOQUEADO por aprobación visual humana** | No hay firma de pantallas/caja ni activos definitivos con licencia |
| **R10** | **CANDIDATO TÉCNICO de este SHA** | 5/5 en el SHA funcional; no implica GO de producto ni del posterior commit documental |
| **M6 / producción** | **NO-GO** | Autorización expresa, aislamiento Fleetia/VPS, secretos/TLS, recuperación, observabilidad y decisiones pendientes |

**Decisión:** se considera técnicamente validada **esta** forma de arranque autónomo de ensayo, no el proceso operativo, y se mantiene H6/global y producción en **NO-GO**. Siguiente bloque de valor sujeto a aprobación de UX/caja y credenciales **Stripe sandbox**: completar F20/R03–R05 y F28/R09; el cutover operacional F12/R08 requiere otra puerta de seguridad/arranque autorizada y no se habilita en este commit. Prohibido fusionar/cerrar PR, desplegar, reiniciar o modificar Fleetia/VPS/Supabase operativo, usar Stripe real o cambiar `main`.
