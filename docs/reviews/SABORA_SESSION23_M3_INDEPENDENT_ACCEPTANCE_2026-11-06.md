# Sabora — revisión independiente del candidato M3 (CV-006/CV-007)

**Fecha:** 06-11-2026. **Alcance:** inspección independiente de código, límites normativos, permisos, pruebas PG17/HTTP y capturas reales de ambas PWA. **Estado:** aceptación técnica candidata con defectos corregidos; **no** aceptación humana ni autorización operativa. Este informe **NO** es normativa ni reemplaza la [matriz H6 F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).

## 1. Fuentes y autoridad

- [Contrato funcional NF](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md) (mesa/QR, catálogo, historial, coste cero), [RF](../REQUISITOS_FUNCIONALES.md) §§ Mesas y QR, Carta y catálogo y [sistema visual aprobado](../DESIGN_SYSTEM_CONTRACT.md) §§5,9–12.
- [Auditoría de aprobación visual](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [requisitos de diseño](../design/DESIGN_REQUIREMENTS_V1.md) y [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md). Solo decisiones expresamente aprobadas son obligatorias; bocetos y capturas CI no equivalen a baselines aprobados.
- [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y [continuidad 23](../handoffs/SESSION_23_HANDOFF_2026-11-05.md) son contexto, no normativa.
- [Plan histórico M3](SABORA_SESSION23_M3_INTEGRATION_PLAN_2026-11-05.md): su frase «solo administración [...] cambiar preparación» contradice **RF líneas 15–21**, que autoriza el cambio desde gestión **sin privilegio administrativo especial**. El SQL `manage_table_m3_candidate`, la ruta HTTP y la prueba JWT de camarero siguen la **RF**, y se mantienen. No restringir por el plan inferior.

## 2. Hechos comprobados y frontera de evidencia

**PR #48 Draft** en `integration/sabora-session23-m3-acceptance-20261106`, sin merge. Base `feat/sabora-session23-m3-management-20261105`.

| Nivel | Evidencia | Dictamen y límite |
| --- | --- | --- |
| Línea de base aprobada por CI | SHA `21f9e8123e36d0dbcd2d75c152669b73f8f589f7`, [CI](https://github.com/jdlc86/CartaViva/actions/runs/42213850457), [PG17](https://github.com/jdlc86/CartaViva/actions/runs/42213850371), [visual](https://github.com/jdlc86/CartaViva/actions/runs/42213850340) | 3/3 SUCCESS, 51/51 PG17, cero omisiones. Solo candidato técnico. |
| Integración de cierre tras falla de lectura | Código `9ba958f8` y E2E `5ebdde5b`, [PG17](https://github.com/jdlc86/CartaViva/actions/runs/42218947943) | **51/51 PASS**: cierre real PG17 y autocierre gratuito; GET administrativo fault-injected devuelve 503; la PWA no inventa rollback, bloquea nuevas mutaciones y recupera lectura sin segundo cierre. |
| Corrección de ordenación visible | CSS `0c310a8e` y prueba E2E `ceb6312e8b6e95c96bc2b256c0c21f21e1a5dfe4`, [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/42219921523), [visual](https://github.com/jdlc86/CartaViva/actions/runs/42219921551), [CI general](https://github.com/jdlc86/CartaViva/actions/runs/42219921755) | Bootstrap **51/51 PASS**, visual **SUCCESS**; comprobar conclusión final de CI general antes de declarar 3/3 del mismo SHA. |
| Capturas verificadas | [Artefacto de Bootstrap M3 #13503911502](https://github.com/jdlc86/CartaViva/actions/runs/42219921523) | Archivos `management-published.png` (1440 px fullPage), `management-catalog-mobile.png` (390×844), `management-table-qr.png` y `customer-free-confirmed.png`. Inspección visual directa de los PNG; **no** aprobación del propietario. |

### CV-006 — mesas y QR

La PWA de gestión usa lectura paginada con `id` consistente, alta EN_PREPARACION + ocupación cerrada, edición por revisión, transición de preparación, apertura/pausa/cierre por capacidad de personal, QR emitido una vez, rotación/revocación y acción de impresión. HTTP valida autenticación; propietario SQL NOLOGIN con RLS, sin acceso directo desde el login runtime. En PG17 el cliente no entra en mesa no preparada y el cierre revoca visitas antiguas sin reescribir consumos. **El QR impreso físicamente no se ha ensayado**, ni se declara entrega o pago por cambiar la ocupación.

La prueba orgánica cierra una mesa tras confirmación gratuita, despacho H6, cocina ACK y líneas READY con `pickup_tasks`. La cuenta gratuita solo se liquida bajo condición operativa de resolución con `close_origin=system_zero_cost`; el recibo económico no representa entrega física.

### CV-007 — categorías y catálogo

Categorías persistentes y dinámicas en PG17; borrador independiente de publicación, declaración de alérgenos versionada con actor/fecha al verificar, precio cero, opciones/extras, descuentos, agotamiento y retirada. El E2E publica una categoría nueva y un plato de 0 €, lo muestra desde la PWA del cliente y confirma el pedido contra el backend real. SQL rechaza ocultar categorías obligatorias y las operaciones de administración con actor de camarero. No inferir de este escenario que cada combinación comercial haya recibido aprobación visual humana.

**Hallazgo visual corregido (CV-007/DV-03/DV-04):** el PNG de escritorio anterior mostraba el input de posición de categoría reducido a la columna de icono de 42 px. La CSS corregida asigna columnas explícitas al campo y al botón; el E2E comprueba anchura legible en **1440 y 390 px**. Los PNG del nuevo artefacto se inspeccionaron: números y posición legibles en ambas composiciones. No son capturas maestras aprobadas.

## 3. Defectos y puertas todavía abiertas

1. **RF visual/roles (pendiente de revisión integrada):** `TablesView.tsx` muestra acciones administrativas de edición y QR cuando existe `manageTable`, sin distinguir en la presentación el rol de personal; el SQL y Fastify **sí deniegan** operaciones no autorizadas (`403`), por lo que **no** se ha demostrado una escalada de seguridad. Antes de aceptar la UX por rol, proyectar capacidades verificadas por servidor —no confiar en rol autodeclarado en navegador— y ensayar vista de camarero, lectura y acciones legítimas/denegadas como flujo integral.
2. **DV visual no cerrada:** solo hay capturas técnicas; faltan baselines y fotografías con licencia aprobados, revisión humana de densidad/tipografía/paleta final y matriz por estados/viewports normados (360/390/430/768/1024/1440). La suite `management-browser-visual-smoke` verifica build y capturas de pantallas predefinidas; **no** acredita por sí sola axe/WCAG AA ni conformidad humana del editor M3. La captura fullPage puede colocar elementos fijos en coordenadas que no representan el viewport real; no concluir un defecto sin revisar vista efectiva.
3. **CV-001/CV-003/M1:** cierre de mesa orgánico añadido a E2E M3 y 0 SKIP en PG17, pero la matriz original de 28 F/10 R conserva criterios parciales/bloqueados (especialmente caja y Stripe) que no se cierran indirectamente.
4. **CV-008/CV-009/M4:** Stripe sandbox real requiere credenciales/permiso y caja tiene flujo visual por aprobar. Ningún mock ni un cierre de cuenta gratuita acredita cobro, captura, reembolso, efectivo o conciliación externa.
5. **Activación y entorno:** `apps/api/src/server.mjs` continúa `health-only`; composición operativa únicamente opt-in y PG17 desechable. Seguridad/recuperación/observabilidad y aislamiento de recursos (M6) pendientes. El acceso a Supabase operativo, VPS compartido/Fleetia, merge o despliegue siguen prohibidos sin autorización específica.

## 4. Dictamen y siguiente bloque de valor

**M3 permanece CANDIDATO TÉCNICO VALIDADO en el alcance probado; NO CERRADO como producto y NO-GO de producción.** La corrección de cierre con GET fallido y la corrección visual tienen pruebas integradoras específicas sobre el recorrido real; la aceptación global y la validación humana no se deducen de las suites. Se mantiene [PR #48 Draft](https://github.com/jdlc86/CartaViva/pull/48).

**Siguiente unidad completa:** revisión/ajuste de acciones por rol basadas en proyección autorizada desde servidor + aceptación visual por pantalla/viewport del flujo M3 completo + registro explícito de aprobación/bloqueo. No inventar baselines ni abrir la caja de M4 para completar M3; conservar la separación de implementación, prueba y aprobación humana. Sin merge, deploy, VPS, Fleetia ni Supabase operativo.
