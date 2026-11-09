# Sabora / CartaViva — auditoría integral de la matriz viva y siguiente hito (09-11-2026)

> **INFORME DE CONTRASTE, NO NORMATIVA NI ACTA DE ACEPTACIÓN.** La fuente de requisitos es la documentación normativa versionada de GitHub. Este informe compara contratos, código, CI y estado de PR en un corte temporal, sin ejecutar tests adicionales ni modificar funcionalidad.
>
> **Tablero vivo:** [SABORA_LIVE_PROJECT_TRACKER](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §60. **Continuidad vigente:** [sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md). **Matriz funcional↔UI:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json).

## 1. Corte Git y método

Repositorio **único** `jdlc86/CartaViva`; rama revisada `feat/sabora-cv014-waiter-calls-integral-20261109`, [PR #53 Draft](https://github.com/jdlc86/CartaViva/pull/53), HEAD de partida **`43afb59bd4c51a395035df5e0066bb7183d03eb3`**, sin fusionar ni desplegar. El último SHA **funcional** ejecutado es [`92f8482afdcb034e853edb9f49351cc91882e843`](https://github.com/jdlc86/CartaViva/commit/92f8482afdcb034e853edb9f49351cc91882e843), con **6/6 GitHub Actions SUCCESS** ([Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42596201622), [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42596201815), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42596201538), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42596201526), [dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42596201429), [puerta UI funcional](https://github.com/jdlc86/CartaViva/actions/runs/42596201893)). Posteriormente los cambios comprobados hasta HEAD de partida eran **solo documentación**.

La consulta actual de `/pulls?state=open&per_page=100` devuelve **46 PR abiertos, todos Draft**. #50→#51 encadenados; #52 y #53 son ramas **hermanas** basadas en #51: **no** combinar sus pruebas o códigos como si el uno contuviera al otro. No hay dictamen independiente de Codex sobre #52 (créditos agotados). La rama `main` sigue separada del candidato y **no se ha revalidado funcionalmente** ni autorizado integración.

Método: lectura de RF, NF, identidad de cliente, diseño, roadmap, matriz viva y continuidad; cotejo de rutas API, SQL, vistas, integración PG17, artefactos/pruebas reportados y seis Actions del SHA vigente. **No** se ha corrido test nuevo en esta auditoría documental. Un test existente que pasa verifica su recorrido, **no** la aceptación completa del requisito ni la instalación operativa.

## 2. Matriz reconciliada: estado basado en evidencia, no en intención

| ID / hito | Evidencia actual contrastada | Dictamen y límite |
| --- | --- | --- |
| **CV-001 / M1** | Coste cero y cierre de cuenta en SQL/H6, PG17/E2E anteriores y matriz F/R | **CANDIDATO / CIERRE GLOBAL PENDIENTE**: aceptación integral económica/F28/R09 y revisión independiente no acreditadas. |
| **CV-002 / M1** | Rectificación normativa de 05-11 y recorrido H6 | **ACLARACIÓN NORMATIVA CERRADA**; no convierte M1 ni piloto en GO. |
| **CV-003 / M1** | Matriz F01–F28/R01–R10 reconciliada, pruebas PG17, informe histórico | **EN CURSO / ACEPTACIÓN GLOBAL PENDIENTE**: un registro 38/38 no equivale a aprobación independiente. |
| **CV-004 / M2** | 46 PR abiertos Draft consultados; #50/#51 encadenados, #52/#53 hermanos | **EN CONCILIACIÓN**: cifras y grafo de los informes antiguos son históricos; no hay merge autorizado. |
| **CV-005 / M2** | Composiciones opt-in M2/H3–H6 y `apps/api/src/server.mjs` + `api-runtime-config.mjs` | **CANDIDATO AISLADO**; el arranque API estándar todavía es `health-only`, no producción. |
| **CV-006 / M3** | Mesas/QR/ocupación, gestión y cliente PG17/Chromium | **CANDIDATO TÉCNICO**; aprobación visual humana y operación real pendientes. |
| **CV-007 / M3** | Catálogo dinámico, borrador/publicación, variantes, categorías, regresión B3 | **CANDIDATO TÉCNICO**; visual, permisos y aceptación de usuario no acreditados globalmente. |
| **CV-008 / M4** | Adaptador, webhook y pruebas simuladas H6 | **BLOQUEADO**: falta Stripe sandbox remoto autorizado con operaciones proveedor reales. |
| **CV-009 / M4** | PWA de caja y operaciones parciales; cash/tips y tercero pagador en candidatos SQL | **PARCIAL / BLOQUEADO**: diseño final aprobado y recorrido completo de caja/contabilidad. |
| **CV-010 / M6** | Runbooks, planes de secretos/preflight | **BLOQUEADO** por autorización de recursos operativos/seguridad y recuperación. |
| **CV-011 / M6** | Documentación de aislamiento y rollback | **BLOQUEADO**: no autorizado tocar VPS compartido, Supabase operativo ni Fleetia. |
| **CV-012 / M5** | [CI instalación dos PWA #42596201429](https://github.com/jdlc86/CartaViva/actions/runs/42596201429), 6/6 general | **CANDIDATO TÉCNICO VALIDADO** para SW/scope/caché/offline; sin instalación en dispositivos reales ni aprobación visual. |
| **CV-013 / M5** | Dashboard financiero SQL + JWT/HMAC + HTTP + PWA y E2E; ausencia localizada de ruta/generador Excel empresarial | **DASHBOARD CANDIDATO PROBADO; INFORMES/EXCEL PENDIENTES Y CON DEPENDENCIAS NORMATIVAS**. No es una vista sin origen como afirma la fila histórica. Detalle §3. |
| **CV-014 / M5** | Anuncios y llamadas PG17/Fastify/Chromium en [PR #53](https://github.com/jdlc86/CartaViva/pull/53), 6/6 | **ANUNCIOS Y LLAMADA CANDIDATOS TÉCNICOS VALIDADOS**; reservas anticipadas **NO IMPLEMENTADAS / BLOQUEADAS** por decisiones RF. |
| **CV-015 / M5** | Contrato IA, UI candidata y modelos de imagen | **BLOQUEADO** por integración real Gemini, cuotas/coste, derechos, permisos y aprobación. |
| **CV-016 / M5–M6** | Contrato de directorio independiente, sin integración operativa autorizada | **PENDIENTE**; no confundir directorio central con datos del restaurante ni con Supabase operativo. |
| **CV-017 / M6** | Reglas DV y pruebas UI funcional/axe/Chromium | **BLOQUEADO** por aceptación humana de diseño premium, pantallas y estados F28/R09. |
| **CV-018 / M6** | Plan integral de piloto, M1–M6 e informes | **PENDIENTE / NO-GO** por dependencias operativas, económicas y de aceptación. |
| **CV-019 / M3–M5** | Variantes y múltiples configuraciones, integración previa PG17/Chromium | **CANDIDATO TÉCNICO HISTÓRICO**; validar experiencia de producto y visual aprobada, no deducir de resultados de otra rama. |

**Regla transversal:** `CANDIDATO TÉCNICO VALIDADO` ≠ `CERRADO` ≠ `APROBADO` ≠ `DESPLEGADO`. No se ha ejecutado un test exhaustivo nuevo de CV-001–CV-019 en este informe, ni se atribuyen unos 6/6 de #53 a PR/ramas hermanas.

## 3. Hallazgo principal CV-013: dashboard real frente a Excel ausente

### 3.1 Requisitos normativos confirmados

- [RF §Consumo e informes](../REQUISITOS_FUNCIONALES.md): **Excel por empresa y período**, con trabajador, fecha, pedido, producto, categoría, cantidad, cancelaciones distinguibles; resumen por trabajador y cantidad por **categorías dinámicas**. No contar cancelados ni usar «listo/retirado» como sinónimo de consumo servido. El documento deja pendiente criterio contable de casos de cocina y **política de conservación/exportaciones**.
- [NF §Dashboard](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md): indicadores de ventas netas, cobros, saldos, propinas, pedidos, ticket medio por cuenta, tendencia, top-10, filtros de fecha/mes y cálculo servidor, con acceso protegido, sin simulación, ni polling; es **informativo, no fiscal**. Definiciones financieras deben respetar descuentos, cancelaciones, devoluciones y terceros.
- [Contrato de identidad del cliente](../architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md): **empresa opcional, editable, declarada y no verificada por defecto**; no confundir el `public_id` Sabora con un identificador corporativo ni derivar autorización empresarial del texto de empresa. Una eventual pertenencia corporativa verificada requiere proceso/entidad separada; cambio de empresa no modifica UUID ni titularidad del historial. Política de conservación/exportación pendiente antes de operar.

### 3.2 Qué está implementado y efectivamente probado

- `supabase/migrations/20261107160000_sabora_m3_finance_dashboard_candidate.sql` incorpora la función `sabora.read_admin_finance_dashboard_candidate`, resúmenes financieros sobre datos persistidos, RLS/privilegios, registro inmutable de capturas/devoluciones y lectura mediante capacidad firmada; cuando el histórico de pagos es incompleto, **no inventa importes**.
- `apps/api/src/m3-management-http.mjs`: `GET /api/v1/admin/finance/dashboard` con guard de personal administrador, período validado y `Cache-Control: no-store`. `m3-management-repository.mjs` emite `finance.read` firmado.
- `apps/management/src/views/FinanceDashboardView.tsx` + `finance-dashboard-model.ts` + `m3-authenticated-management-gateway.js`: filtros, gráficos, indicadores, mensajes de error/datos insuficientes; se presenta en **Configuración**, no en un resumen de cifras inventadas.
- **Evidencia:** [dashboard 5/5 en SHA `4c88b496`](https://github.com/jdlc86/CartaViva/actions/runs/42382160546) (§36 del tablero) y regresión posterior real en `scripts/ci/table-change-root-postgres17.test.mjs` (HTTP 401 anónimo, 403 cocina/camarero, admin leído; PWA gestión/Chromium con 390/1440 px, H6 con pedidos confirmados). La [ejecución PG17 integral posterior](https://github.com/jdlc86/CartaViva/actions/runs/42596201622) fue SUCCESS; no es aprobación fiscal ni test Stripe proveedor real.

### 3.3 Brechas verificadas / no inventar soluciones

1. **No se ha localizado circuito Excel corporativo** (endpoint autorizado, SQL de consulta exportadora, libro descargable y prueba empresarial) entre los módulos API/PWA/migraciones y scripts revisados. No basta serializar la vista de dashboard: el Excel requiere detalle por cliente/pedido/línea/categoría, cancelaciones y período, además de seguridad y privacidad. Confirmar nuevamente al iniciar el hito contra el HEAD que se vaya a desarrollar.
2. **Atribución histórica empresarial insuficiente:** el RPC de confirmación de pedido inspeccionado en `20261026222958_sabora_production_customer_flow_candidate.sql` (`persist_order`, INSERT `sabora.orders`) escribe explícitamente `company=NULL, employee_number=NULL`. En cambio, el perfil guarda una empresa **editable** y un ID público Sabora. Por tanto **no se acredita una empresa vinculada inmutable al pedido**. Agrupar pedidos antiguos usando la empresa *actual* crearía atribución retroactiva no normativa, e interpretar ID Sabora como empleado corporativo sería falso. La revisión histórica de contrato ya distinguía esta discrepancia.
3. **Decisión de producto/privacidad todavía requerida:** definir si «empresa» en Excel significa **declaración voluntaria congelada al confirmar** o **vinculación corporativa verificada**; tratamiento de empresa no indicada, cambios de empresa, pedidos anteriores sin valor, acceso/descarga/autorización (no otorgar a empresas por declarar su nombre), conservación, borrado y responsabilidad RGPD. Debe aprobarse o localizarse un contrato normativo que ya lo resuelva **antes** de atribuir historia, exponer PII o elaborar Excel. No convertir una decisión de ingeniería en nueva norma por el test.
4. **Reglas de línea y rectificación:** seleccionar evidencia económica de la revisión confirmada y ajustes inmutables; diferenciar cancelación total/parcial, ajustes tardíos, renglones de nuevas categorías y el caso «listo» sin entrega acreditada. Sin especificación aprobada, expresar estados o «no determinable»; nunca inferir consumo servido desde deslizar o cocinar.

## 4. Priorización y decisión de siguiente hito

**Candidato prioritario de desarrollo: CV-013 — informes empresariales y exportación Excel integral**, reutilizando el dashboard y la seguridad existente, **condicionado** a resolver la atribución de empresa y conservación/autorización. El bloque a implementar, cuando la norma lo habilite, debe ir de modelo económico inmutable → SQL/roles de solo lectura y filtro empresa-período → API autenticada → PWA gestión/descarga Excel → seguridad de archivo y fórmulas → PG17/Fastify/JWT/HMAC/Chromium y regresión H6/CV-014. No separar en micropruebas ni inventar un hito de «solo botón exportar».

**Por qué no otros hitos ahora:** CV-008 requiere Stripe sandbox auténtico autorizado; CV-009 aceptación de caja; CV-010/011/018 autorizaciones de entorno, rollback/operación; CV-014 reservas carece de decisiones RF; CV-015 requiere proveedor, coste y derechos; CV-017 aceptación humana; CV-016 directorio separado requiere contrato/operación específica. **CV-004/P0, 46 Draft y M1/CV-003 no desaparecen:** la consolidación y aprobación global siguen siendo puertas críticas independientes del siguiente bloque funcional. Cerrar un candidato de M5 no certifica M1/M2/producción.

**Decisión operativa resultante de esta auditoría (no normativa):** actualizar matriz CV-012/CV-013/CV-014 y sus límites; **no abrir PR de implementación CV-013 todavía** hasta contrastar/obtener la decisión de atribución y conservación y confirmar identidad/permiso del destinatario de un Excel. Una vez aclarado, ejecutar **un único hito completo** y presentar evidencia del mismo SHA. No modificar normas sin aprobación del propietario.

## 5. Seguridad, aislamiento y permanencia de bloqueos

Sin fusión de PR, despliegue, ejecución de migraciones operativas, gestión de secretos ni cambios en Supabase productivo. En el VPS compartido está **prohibido tocar, detener, reiniciar, depender de o modificar Fleetia u otro proyecto**; una instalación Sabora = un restaurante, dos PWA separadas y directorio independiente. Los tests PostgreSQL 17/Chromium ejecutados en Actions se consideran **aislados**. Las aprobaciones de Codex (cuando vuelva a tener créditos), visual humanas, Stripe sandbox y autorización explícita de producción no se deducen de este documento.
