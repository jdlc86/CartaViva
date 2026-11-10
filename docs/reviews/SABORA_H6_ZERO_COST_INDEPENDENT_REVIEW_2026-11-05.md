# Sabora H6 — revisión independiente del autocierre de coste cero (CV-001 / CV-002)

**Fecha:** 2026-11-05. **Objeto:** revisión de código, contrato y evidencia remota; **no** prueba nueva ni aceptación global. **Rama/PR examinados:** `feat/sabora-table-change-final-closure-20261104`, [#44 Draft](https://github.com/jdlc86/CartaViva/pull/44). **HEAD de implementación base:** `2d22e917b888e24e6fdef31a1414d371f6cfe1d3`; **HEAD documental y CI verificado:** `ec111577d41b025cb708185c2fff6a2fd67aaeac`. Este documento no autoriza merge ni operación.

## Fuentes de autoridad y límites

1. [Contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), §Pagos, decisión aprobada de 2026-11-05. [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md) y [matriz F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). **La normativa prevalece** sobre esta auditoría y el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
2. SQL: `supabase/migrations/20261105070000_sabora_h6_zero_cost_account_auto_close_candidate.sql`. Suite PG17: `scripts/ci/zero-cost-account-postgres17.test.mjs`. Recorrido general: `scripts/ci/table-change-root-postgres17.test.mjs`. Informe del autor: [coste cero 2026-11-05](SABORA_H6_ZERO_COST_ACCOUNT_LIFECYCLE_2026-11-05.md).
3. Evidencia de CI del SHA documental `ec111577d41b025cb708185c2fff6a2fd67aaeac`: [CI](https://github.com/jdlc86/CartaViva/actions/runs/41993131391), [bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41993131465), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41993131381), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41993131475): **4/4 SUCCESS**. El gate de continuidad se ejecutó y registró `continuity_tracker_links_ok documents=25`. No equivale a certificación de todas las funcionalidades.

## CV-002 — decisión normativa cerrada

El texto aprobado es inequívoco: **«Solo al terminar la ocupación puede cerrarse automáticamente»** una cuenta que cumpla todas las condiciones. La caducidad de autorización/visita individual no es un segundo disparador. La migración instala `sabora_h6_zero_cost_account_auto_close` **AFTER UPDATE OF ordering_state**, exclusivamente para `OLD.ordering_state<>'closed' AND NEW.ordering_state='closed'`. No procede inventar una transición de fin individual ni solicitar una nueva decisión. **CV-002: CERRADO como cuestión de interpretación normativa.** No se confunde con validación E2E.

## CV-001 — revisión estática de implementación y pruebas

| Invariante | Evidencia directa del código | Dictamen de lectura |
| --- | --- | --- |
| Reutilizar cuenta gratuita durante ocupación activa | `try_auto_close_zero_cost_account_h6_candidate` retorna `false` para mesa/sesión `open` o `paused`; la prueba lo invoca antes del cierre. | Implementado; SQL test específico. |
| No crear deuda/pago para importe cero y permitir pedido positivo posterior | Reglas H6 existentes y suite H6 2/2; la suite cliente comprueba presentación de modalidad, pero intercepta HTTP. | Implementado candidato; falta recorrido orgánico conjunto. |
| Solo historial intrínsecamente gratuito | Verifica al menos una ronda, todas `amount_cents=0`, sin intentos Stripe ni liquidaciones de efectivo; `outstanding_cents=0` y `payment_mode IS NULL`. | Predicado explícito; revisar con varias cuentas y estados simultáneos. |
| Resolución cocina/recogida sin afirmar entrega | Estados de ronda `kitchen_acknowledged`/`cancelled`, despacho y líneas `ready` con tarea `ready/claimed` o histórico `picked_up`; evento `deliveryConfirmed:false`. | Implementado; falta observación end-to-end en interfaces reales. |
| Incidencias y reembolsos | Impide incidencia no terminal y reembolso no `succeeded`. Los intentos Stripe existentes excluyen la ruta de cero. | Predicado presente; comprobar exhaustividad del modelo de ajustes conforme a normativa. |
| Autorización y origen del cierre | Función interna `SECURITY DEFINER` con `search_path` fijado, propietario dedicado y `REVOKE`; columna generada `close_origin=system_zero_cost`, correlación determinista, outbox. | SQL candidato; test de privilegios y replay. |
| Carrera con pedido positivo | Cierre de mesa adquiere advisory fences de clientes antes de bloquear mesa; la prueba SQL reproduce «pedido positivo gana» con `INSERT` directo. | Carrera real PG17 pero **no** confirmación HTTP/PWA. |
| Cuentas pendientes al cerrar mesa | El helper devuelve `false`, no fuerza `settled`; la cuenta permanece abierta y requiere operación autorizada posterior. | Conforme al informe; falta verificar flujo de resolución posterior a cierre de ocupación. |

**No se ha identificado en esta lectura una contradicción demostrada que justifique cambiar el SQL.** Tampoco se afirma ausencia de defectos: faltan aceptación funcional transversal y comprobación de límites del modelo.

## Diferencia entre pruebas ejecutadas y funcionalidad realmente validada

- **Ejecución documentada por Codex:** PG17 coste cero 4/4, H6 2/2, regresión integral 51/51, Node 1175 PASS/2 SKIP, Chromium cliente 36/36; la nueva corrida de cuatro workflows del SHA documental terminó SUCCESS.
- **Cobertura específica de cero:** el test SQL crea cuentas, rondas, despachos y tareas mediante SQL administrativo; la carrera añade el pedido positivo con SQL directo. Los dos escenarios nuevos de PWA cliente usan interceptación HTTP. Ninguno de estos hechos por separado certifica un recorrido único con cliente, cocina, sala, Fastify y PostgreSQL real que ejecute el autocierre.
- **No ejecutado por esta revisión:** nueva prueba integral, aceptación visual humana, Stripe sandbox real, operación de Supabase, VPS o contenedores. No heredar resultados de SHA anterior como si se hubieran repetido aquí.
- **Estado:** CV-001 **EN CURSO**; cierre formal H6 **NO-GO** hasta evidencia suficiente y matriz actualizada. CV-002 **CERRADO normativamente**.

## Siguiente hito integral exigido (no dividir en micropruebas)

En un único escenario PG17 desechable + Fastify firmado + Chromium cliente/gestión/cocina, con dos comensales independientes y datos verificables:

1. Comensal A confirma pedido de coste cero desde QR/PWA; cuenta queda `open`, sin Stripe/caja, cocina recibe y reconoce; línea `ready` y tarea de recogida durable. Comensal B tiene otra cuenta, con pedido positivo o pendiente de resolución.
2. A confirma otro pedido positivo **antes del cierre** en una variante y conserva `account_id` y modalidad válida; la cuenta A no puede autocerrarse. En variante gratuita pura, permanece abierta hasta cierre.
3. Camarero autorizado cierra mesa desde gestión por HTTP firmado. Verificar **en una misma transacción observable** que solo la cuenta totalmente gratuita y resuelta se liquida, la pendiente no, ninguna se atribuye a camarero ni se marca entregada; se revocan concesiones, la visita antigua no permite nuevos pedidos, outbox emite un solo evento con procedencia correcta.
4. Cubrir replay y carrera real «pedido HTTP gana / cierre firmado gana» con barreras PG17, sin SQL de inserción del pedido como sustituto del HTTP; verificar ausencia de doble cuenta, deadlocks y cobros indebidos. Probar resolución económica posterior de la cuenta que quedó abierta.
5. Ejecutar regresión PG17 + Node + PWA cliente/gestión y conformidad visual contra los contratos aprobados; actualizar matriz F/R con SHA, jobs, límites y dictamen independiente. No certificar como producción por CI verde.

**Seguridad operacional:** usar solo `jdlc86/CartaViva`, PG17 desechable, rama/PR Draft. Sin merge, despliegue, modificación de Supabase operativo, VPS ni Fleetia.
