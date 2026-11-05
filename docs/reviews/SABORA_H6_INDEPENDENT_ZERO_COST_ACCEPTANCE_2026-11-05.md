# Sabora H6 — auditoría independiente y aceptación integrada multicomensal de coste cero

**Fecha:** 2026-11-05  
**Ámbito:** PR [#45 Draft](https://github.com/jdlc86/CartaViva/pull/45), rama `audit/sabora-h6-zero-cost-integrated-acceptance-20261105`, sobre [#44 Draft](https://github.com/jdlc86/CartaViva/pull/44).  
**SHA funcional final bajo revisión:** `0661e7b78ada8f4d94c43872ec64ade6d501a6ff`. El commit documental que publique este informe será posterior; **no atribuirle automáticamente las pruebas del SHA funcional**.  
**Tipo:** revisión externa de Codex y evidencia de candidato, **NO norma ni aprobación de despliegue**.  
**Seguimiento vivo:** [CV-001, CV-002, CV-003 y M1](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).  
**Normativa vigente:** [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), apartado «Pagos — Decisión aprobada — cierre de cuentas de coste cero (05-11-2026)»; [requisitos funcionales](../REQUISITOS_FUNCIONALES.md); [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md). Las decisiones de estos archivos prevalecen sobre los dos PR, esta auditoría y cualquier handoff.

## 1. Dictamen de lectura normativa: CV-002 RESUELTO, sin código nuevo

La decisión del 5 de noviembre es explícita: **«Solo al terminar la ocupación»** se puede autocerrar una cuenta que cumple las condiciones de gratuidad y resolución. El fin/caducidad de la autorización individual de una visita, la salida de la PWA o el logout **no** autorizan un autocierre de una cuenta de otra persona o antes de la frontera de ocupación. La implementación activa su trigger en `dining_tables.ordering_state: open/paused → closed`, donde se revocan las visitas de la ocupación anterior y se regenera su `session_id`. No hay ambigüedad normativa que exija ampliar la migración. Esta conclusión corrige la **hipótesis** de los handoffs anteriores, sin reescribir su contenido histórico.

Si la mesa se cierra con una comanda gratuita aún sin resolver, la cuenta **permanece abierta**; se necesita el flujo posterior de resolución/cierre autorizado. El autocierre no debe volver a dispararse por la mera expiración individual.

## 2. Código de Codex examinado: invariantes verificadas por inspección

Migración: `supabase/migrations/20261105070000_sabora_h6_zero_cost_account_auto_close_candidate.sql`.

- `try_auto_close_zero_cost_account_h6_candidate`: bloquea la cuenta y el vínculo operacional; exige cuenta `open`, saldo cero y `payment_mode IS NULL`; impide cierre con ocupación aún `open/paused`.
- Comprueba **al menos una ronda**, todas `amount_cents=0`, ausencia de `payment_attempts` y `cash_settlements`, y descarta despacho no confirmado, líneas sin `ready`/estado histórico `picked_up`, tarea de recogida durable ausente y cualquier incidencia/reembolso pendiente. Una ronda cancelada de forma durable puede estar resuelta sin fingir `ready`.
- Cierra con `close_origin='system_zero_cost'`, `closed_by=NULL`, correlación determinista; revoca permisos de cambio y emite **un** evento `sabora.account.closed` con `deliveryConfirmed:false`. No registra entrega física.
- Trigger de actualización de mesa y `transition_table_ordering_candidate`: **advisory locks por cliente antes del bloqueo de la mesa**, para preservar orden frente a confirmación concurrente. La función de autocierre sigue sin permiso `EXECUTE` de runtimes ni visitantes.
- **No se ha encontrado, en estas funciones y escenarios, evidencia de un defecto de dominio que requiera alterar producción.** No extrapolarlo al conjunto de módulos o a Stripe.

## 3. Prueba integrada añadida sin sustituir la regresión previa

**Archivo:** `scripts/ci/h6-postgres17.test.mjs`, ampliación del recorrido existente `H6 runs atomically under split least-privilege PG17 principals`. **No se creó otro conjunto artificial de micropruebas**. La secuencia integra:

1. Tres comensales registrados, identidad/token individuales, una mesa abierta y catálogo **publicado en PG17**. La PWA cliente **real en Chromium** consume el QR y cookie HttpOnly; Vite proxy → Fastify → `/api/v1/customer/session`, `/visits`, `/quotes`, `/orders/confirm` → PG17 con login restringido. No se intercepta la confirmación ni se inventa la respuesta. El endpoint público de catálogo de la prueba proyecta ítems realmente guardados en PG17; **no certifica el catálogo productivo**.
2. El cliente Chromium confirma un pedido **gratis**, sin opciones de pago. Un segundo comensal confirma otra ronda gratis pero **pendiente de cocina** desde el HTTP real.
3. Un tercer comensal confirma ronda gratuita y una posterior de 2.400 céntimos `pay_at_end`, conservando su **mismo `accountId`**. Los tres comensales tienen cuentas distintas.
4. Para la primera ronda gratuita, la capa de pago ejecuta acción **dispatch**, sin intento Stripe ni cobro; cocina confirma ACK mediante función H6 y la línea pasa a `ready` con tarea de recogida durable.
5. Un camarero que existe como `staff_members` activo provoca el fin de ocupación mediante la **RPC SQL autorizada de transición**. Se observan tres resultados distintos sobre PG17: **(a)** cuenta gratis resuelta `settled/system_zero_cost`; **(b)** gratis pendiente permanece `open`; **(c)** cuenta con consumo positivo/deuda permanece `open` y saldo de 2.400. Exactamente **un** evento `sabora.account.closed`; ninguna entrega física ficticia; visitas previas revocadas; replay sin segundo cierre.
6. La suite H6 incluye además reintentos, segregación RLS, rol mínimo y otros caminos; la integración larga H6 previa sigue midiendo **300 segundos naturales** y concurrencia real de mesa, cocina y cobro.

**Limitación importante:** la PWA real ensayada en **este subrecorrido de coste cero** es la del **cliente**. El cierre de mesa está ejecutado por la RPC desde una conexión SQL privilegiada del harness con el UUID de un camarero que la función verifica; **no** por una acción visual de la PWA de gestión ni desde su JWT HTTP. No debe describirse como «cierre en ambas PWAs» ni como certificación de la futura pantalla de caja. Los otros recorridos integrados de H6 sí incluyen navegador de gestión para solicitud, decisión y cocina, pero eso no sustituye la pieza ausente en esta transición.

## 4. Evidencia CI y fallos que se corrigieron, sin alterar producto

**SHA de prueba** `ff9f5479a3c12dd6944736d0772a14e9351fd349` falló en [CI](https://github.com/jdlc86/CartaViva/actions/runs/41996468389) y [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41996468436): la URL local de Chromium no coincidía con el `Origin` estricto que el propio arnés había configurado y se buscaba continuar un pedido sin cesta. El error fue **del montaje del test**, no una prueba de corrupción ni defecto demostrado de Codex.

**SHA corregido** `734f79554bafd7907a3b908070ec803e1bfe0ba5`: same-origin exacto del loopback real sin rebajar seguridad; seleccionar plato tras validar QR; [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41997240213) **SUCCESS** y [CI H6 completo](https://github.com/jdlc86/CartaViva/actions/runs/41997240145) **SUCCESS**.

**SHA funcional final** `0661e7b78ada8f4d94c43872ec64ade6d501a6ff`: añade únicamente navegación explícita de QR a inicio/carta; [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41997924755) **SUCCESS**. Logs del bootstrap observados: Node **1.175 PASS / 0 FAIL / 2 SKIP**, H6 **2/2 PASS**, aceptación PostgreSQL/Chromium **51/51 PASS**, suite nueva coste cero **4/4 PASS**. [CI principal de ese SHA](https://github.com/jdlc86/CartaViva/actions/runs/41997924753): **SUCCESS en el SHA funcional (GitHub Actions)**. No marcar 4/4 del PR #45: los workflows de cliente/gestión no fueron disparados por la ruta del cambio; su último 4/4 verificado corresponde a PR #44, **otro SHA**. Los resultados deben revisarse de nuevo antes de elevar el dictamen.

## 5. Cierre parcial M1 y límites

- **CV-001:** la ruta SQL/HTTP/PWA cliente y el caso real multicomensal están implementados y verificados por el Bootstrap CI actual; falta pantalla de cierre de mesa/caja en gestión y posterior aceptación visual/operativa. No marcar M1 CERRADO hasta reconciliar matriz global y revisar el CI del último SHA.
- **CV-002:** **CERRADO como aclaración de normativa**, sin programar un segundo trigger.
- **CV-003:** **PENDIENTE**: aceptación individual F01–F28/R01–R10 y las **dos pruebas Node SKIP antiguas**, correspondientes a controles de preparación H6 sustituidos en parte por recorridos nuevos; solo se documentan, no se borran ni presentan como PASS.
- Stripe sandbox real, gestión QR, caja, Passkeys productivos, fotografía/diseño, dominio/TLS, despliegue y recuperación **NO probados por este PR**.

**Dictamen:** **CANDIDATO VALIDADO parcialmente en entorno efímero; NO-GO producción / NO-GO cierre general H6** hasta terminar matrices, comprobaciones del SHA definitivo y pendientes documentados. No merge, despliegue ni cambios en Supabase operativo, VPS ni Fleetia.
