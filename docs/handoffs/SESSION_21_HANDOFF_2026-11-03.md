# Sabora / CartaViva — continuidad operativa para la sesión 21 (2026-11-03)

> **Documento de continuidad, no normativa ni permiso de despliegue.** La fuente de verdad son los contratos y matrices normativas versionados en GitHub. Si hay divergencias, prevalecen esos documentos. Actualizar este archivo **solo después de hitos funcionales relevantes**, manteniendo un registro breve de SHA, CI, cobertura real y pendientes; nunca sustituir con él la matriz de aceptación.

## 1. Estado exacto de traspaso

- **Proyecto:** Sabora / CartaViva, **un solo restaurante**. PWA cliente, PWA gestión, API Fastify, PostgreSQL 17 y servicios candidatos H6.
- **Repositorio único autorizado:** `jdlc86/CartaViva`.
- **Rama activa:** `integration/sabora-h6-b2-delivery-board-contract-20261031`.
- **PR:** [#43](https://github.com/jdlc86/CartaViva/pull/43), **abierto, Draft y no fusionado**.
- **HEAD observado antes de crear este documento:** `6c0bed966fe3461c73e61d630d2d728c8fe4fffa` (commit documental de continuidad 20). Sus cuatro workflows asociados figuraban como `success`. **Al retomar, comprobar nuevamente el HEAD y el CI**: crear/actualizar este archivo mueve el HEAD y las evidencias no se heredan automáticamente.
- **Último hito funcional verificado en el traspaso:** `52d5c62f58f25c6db7c0b557d2435f13bc177099`, que culmina el recorrido económico F20 con la corrección visual de estado Stripe/SSE. Cuatro workflows SUCCESS: [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/41564589393) · [Bootstrap/PG17](https://github.com/jdlc86/CartaViva/actions/runs/41564589447) · [PWA cliente](https://github.com/jdlc86/CartaViva/actions/runs/41564589427) · [PWA gestión](https://github.com/jdlc86/CartaViva/actions/runs/41564589355). Evidencia recogida: Node **1.175/1.175**, PG17 integrado **51/51**, bloques H6 1/2A/2B PASS.
- **Último hito funcional validado después de crear este handoff:** `eb85b08ff5fee903be5a658bd5deac273b8f4694` (**F20 caja parcial antes/después de traslado A→D**). **4/4 workflows SUCCESS:** [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/41610335625) · [Bootstrap/PG17](https://github.com/jdlc86/CartaViva/actions/runs/41610335642) · [PWA cliente](https://github.com/jdlc86/CartaViva/actions/runs/41610335742) · [PWA gestión](https://github.com/jdlc86/CartaViva/actions/runs/41610335682). CI registra H6 Block 1/2A/2B PASS, PG17 desechable, roles segregados, HMAC, concurrencia y Chromium. El guard HTTP de personal es de prueba; Stripe anterior sigue como fixture. Evidencia [matriz §19](https://github.com/jdlc86/CartaViva/blob/integration/sabora-h6-b2-delivery-board-contract-20261031/docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). Los siguientes commits documentales deberán comprobarse por separado.
- **Dictamen:** **B3 NO-GO / B4 NO-GO**. Existen recorridos sólidos de candidato opt-in en entorno desechable, pero falta aceptación normativa completa F01–F28/R01–R10, integración operativa autorizable y autorización expresa para cualquier actuación productiva. **CI verde no significa GO**.

## 2. Lectura obligatoria y jerarquía

**Normativa de requisitos y aceptación (prioridad absoluta):**

1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: contratos de cuentas, pedidos, pago, cocina/sala, SSE y decisión normativa de cambio de mesa del 30-10-2026.
2. `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`: arquitectura/aislamiento y regla obligatoria de desarrollo por **hitos funcionales completos** del 02-11-2026.
3. `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`: bloques B0–B4, matriz **F01–F28/R01–R10**, evidencias verificadas y dictamen de aceptación. Leer en particular §15–§18 y la matriz completa §4–§6.
4. `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/REQUISITOS_FUNCIONALES.md` y `docs/SABORA_AUTHORIZATION_GATE.md`: identidad visual aprobada, funcionalidad general y fronteras de autorización.
5. Contratos técnicos específicos referenciados por los documentos anteriores, cuando el recorrido los toque (QR, Stripe, roles, personal, auditoría, recogida).

**Documentación contextual, subordinada:** `docs/handoffs/SESSION_20_HANDOFF_2026-11-02.md`, `SESSION_19_HANDOFF_2026-11-02.md` y este archivo. Los handoffs no autorizan nuevas semánticas ni corrigen por sí solos contratos normativos. Verificar código, CI y base real de la rama antes de atribuir cobertura.

## 3. Directrices de ejecución obligatorias

1. **No microhitos como método de trabajo.** Planificar y cerrar un recorrido completo por entrega: actores y UI cliente/sala/cocina según aplique → HTTP/autenticación → lógica de dominio → **PostgreSQL 17 real desechable**, funciones selladas, RLS y roles mínimos → pagos/cuenta/pedidos/entregas/eventos → navegador real Chromium → regresión y evidencias F/R. Pruebas aisladas solamente para localizar un defecto concreto o blindar una regla crítica, jamás como sustituto de aceptación E2E.
2. **Distinguir siempre:** (a) código implementado, (b) pruebas realmente ejecutadas y resultados, (c) funcionalidad validada según todos los casos normativos aplicables. No convertir fixtures, tests mock o CI verde en afirmaciones sobre Stripe real ni estado de producción.
3. **Seguridad de infraestructura:** no tocar Fleetia ni recursos de ningún otro proyecto. El VPS es compartido: **prohibido** desplegar, reiniciar, detener, eliminar o modificar contenedores, redes, proxy, secretos o infraestructura sin autorización **expresa** y aislamiento completo demostrado. No intervenir en Supabase operativo; las migraciones candidatas se prueban en PG17 desechable. No fusionar PR, activar rutas/servicios, hacer migraciones productivas ni usar Stripe productivo sin autorización.
4. Respetar **flujos e identidad visual aprobados**, incluidos móvil/escritorio, accesibilidad y contraste; no introducir controles de demostración en producto. Donde el contrato visual aún exige aprobación de referencias finales, no afirmar conformidad definitiva.
5. Diagnosticar, corregir y **repetir el recorrido completo afectado y la regresión** dentro del mismo hito. Automatizar esperas de shell/CI sin pedir interacción para tareas de pruebas ordinarias; una espera no autoriza operaciones restringidas.
6. Tras cada **hito relevante**, actualizar en la **matriz oficial** resultados/limitaciones verificables y añadir aquí solo el resumen que permita continuidad. No cambiar requisitos normativos para acomodar una implementación.

## 4. Invariantes aprobados del cambio de mesa

- QR libre no traslada ni vincula; la **primera confirmación de pedido**, incluso en agrupación, vincula a la mesa.
- Con consumo en A, QR de B presenta **«Solicitar cambio de mesa» / «Cancelar»**. La solicitud se refiere a abandonar A **sin mesa de destino ni motivo**. Cancelar el aviso no muta.
- Solicitud vigente durante **90 s desde reloj del servidor**, configurable; rechazo no habilita reintento antes de vencer. Decisiones tardías no son válidas. Mensajes automáticos normativos de aprobación y rechazo; no exponer motivo.
- La aprobación concede un **permiso de un uso**, sin destino ni caducidad temporal adicional. **Ni aprobar ni escanear traslada**; el permiso solo se consume al **confirmar un primer pedido en otra mesa operativa válida**. Pedidos en A mientras tanto preservan el permiso.
- Confirmación atómica: misma `account_id`, historial económico y origen de pedidos inmutables, destino operativo de entregas pendientes actualizado; otras cuentas en A/B intactas. Revalidar QR, sesión, permiso, estado, cotización, política de pago, idempotencia y concurrencia; no duplicar pago, ronda, autorización Stripe, evento ni tarea de recogida.
- Toda afirmación exacta debe contrastarse con § «Cambio de mesa con consumición activa» del contrato funcional; este resumen no lo reemplaza.

## 5. Hitos previos con evidencias (resumen útil)

- **`a9c6ecd6`:** E2E cliente y sala Chromium + Fastify + PG17: QR B con cuenta en A, cancelar aviso, solicitar sin destino, aprobar, confirmar en B; misma cuenta, saldo **2.400→3.100 céntimos**, histórico preservado y replay sin duplicados. Cuatro workflows SUCCESS.
- **`a1ce0c03`:** aprobación/rechazo con outbox H6 transaccional y SSE durable autenticado, cursor/replay, reconexión de cliente desconectado y separación de eventos; ventana 90 s probada **mediante tiempos simulados**, no naturales. Cuatro workflows SUCCESS.
- **`d8852114` (F18 parcial):** tres comensales en A/B, traslado de uno sin alterar cuentas, saldos, pedidos ni SSE de los otros; seis logins SQL físicos, ambas PWA, PG17 real y cuatro workflows SUCCESS.
- **`af6f7f7f` (F17):** QR rotado o mesa cerrada **después de cotización** deniega confirmación sin consumo parcial; pedido válido posterior conserva cuenta y entrega. Cuatro workflows SUCCESS.
- **`9d90ca48` (F22):** dos confirmaciones concurrentes B/C; **una gana y la otra 409**, un solo traslado, replay 200, sin duplicar ronda ni deuda. Cuatro workflows SUCCESS. No demuestra todos los entrelazados internos.
- **`e4a38635` (F23/R04 parcial):** fallo inyectado después de intentar consumir la concesión; rollback de cuenta, orden, pago, entrega y permiso; recuperación legítima e idempotencia. Cuatro workflows SUCCESS; falta abarcar todos los puntos de fallo.
- **`d1a88d8f` (F16/F17/R03 parcial):** revocación de QR o sesión mientras confirmación espera un bloqueo **real dentro de PostgreSQL**; rechazo 403 sin traslado/cargo; recuperación segura donde procede. Cuatro workflows SUCCESS; no acredita revocación dentro de la fase final después del consumo pre-commit.
- **`f3ff9b86` + `52d5c62f` (F20/R05 parcial, hito anterior):** dos comensales con histórico económico distinto se trasladan A→D, cada uno conserva `account_id`, modalidad, pagos previos, origen y entregas pendientes; replay no duplica operaciones. Cuenta `pay_now`: intento Stripe histórico de **1.200 céntimos** en `requires_action` conservado; el nuevo pedido de 700 crea **autorización solicitada**, no cobro ni despacho confirmado. Cuenta `pay_at_end`: histórico de 300 céntimos en efectivo y deuda **900→1.600** tras pedido de 700, sin un segundo cobro. Se corrigió PWA para que incidencias del canal SSE **no oculten el aviso de pago Stripe pendiente** ni den por conectada una sesión SSE sin constancia. **4/4 workflows SUCCESS**, Node 1.175/1.175 y PG17 51/51. Evidencia exacta: [matriz §18](https://github.com/jdlc86/CartaViva/blob/integration/sabora-h6-b2-delivery-board-contract-20261031/docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).
- **Advertencia F20 decisiva:** el intento Stripe anterior y el cobro de 300 céntimos **son fixtures sembrados en BD**. NO se ha validado cobro parcial real de caja, webhook de Stripe, autorización/captura auténtica, conciliación real ni reembolso. La función vigente en aquel SHA exigía liquidar el saldo **completo**; la migración candidata posterior documentada en §19 de la matriz permite parciales sin cerrar la cuenta. Por ello **F20/R05 siguen NO-GO** pese al éxito de la preservación del historial.

## 6. Pendientes materiales para un cierre B3/B4

**Prioridad funcional recomendada tras `eb85b08f`:** continuar la **campaña integral de economía autorizada con cambio de mesa** sin repetir el tramo ya acreditado de cobro parcial firmado en PG17. Falta identidad personal operativa y PWA de caja, y especialmente Stripe en sandbox con webhooks, captura/conciliación, reembolsos y su integración completa con cocina/sala. No simular que un historial Stripe de fixtures equivale a operaciones reales. Revisar primero el contrato de pagos, el código de liquidación y las capacidades efectivamente disponibles de Stripe en entorno de prueba. Integrar las operaciones permitidas de caja (incluida la política de parcialidad si está definida y soportada), autorización/captura, incertidumbre y conciliación del proveedor, cancelaciones/compensaciones/devoluciones al pagador original, reintentos e idempotencia con la **misma cuenta antes y después de trasladar**. Proteger saldo, bloqueos por resultado incierto, órdenes, ventana de agrupación, despacho y entregas mediante transacciones/operaciones durables y roles mínimos. El flujo E2E debe recorrer cliente, gestión/caja, cocina/sala donde proceda, HTTP autenticada, PG17 aislado y ambas PWA; comprobar errores, recuperación y regresión. No habilitar operaciones reales ni inventar compatibilidad de Stripe manual capture; contrastar documentación/proveedor antes de implementar.

**Otros requisitos aún abiertos, sin inflar su cobertura:**

- Composición de identidad y catálogo **operativa y autorizable** que sustituya fixtures del arnés sin dar permisos generales; B3 sigue opt-in, no montado como producto.
- **F19/F21/F25 y R06–R09 completos:** estados de cocina, sala y «Voy a recoger/Cancelo»; destinos pendientes frente a recogidos; agrupación de 5 min; SSE multiusuario cocina/sala/cliente, replay, huecos/cursores caducados, reinicio de servicio y revocaciones; ausencia de datos cruzados.
- **F07/F08/F15 y R03:** vencimiento **natural** 90 s y carreras en límites exactos; el vencimiento simulado anterior no basta. Concesión aprobada no caduca por el plazo de solicitud.
- **F16/F17/F22/F23/R04:** revocación después del consumo SQL antes de commit, carreras entre decisiones/confirmaciones/cierre y fallos inyectados en todas las fases, no solo en los puntos ya cubiertos.
- **F20/R05:** **ya existe cobro parcial y completo autenticado por capacidad HMAC y SQL real en el arnés** antes/después del traslado, sin cierre automático de cuenta. **Falta** autenticación productiva del personal y PWA de caja, conciliación/captura/refund Stripe en sandbox y efectivo devuelto, bloqueo íntegro de deuda desconocida, cierre explícito de cuenta y políticas cambiantes de mesa con auditoría completa.
- **F01–F28/R01–R10:** completar evidencia verificable **caso por caso**, revisión de seguridad y privilegios; aceptación visual aprobada en tamaños móvil/escritorio, accesibilidad, builds, integración completa y CI del SHA final. **B4 NO-GO hasta cobertura global**.

No considerar como cerrados F/R completos por tener un caso positivo: la matriz normativa, no este resumen, determina cada salida.

## 7. Archivos clave y primer procedimiento para la sesión 21

**Entradas de trabajo principales:**
- `scripts/ci/table-change-root-postgres17.test.mjs`: recorrido de integración principal PG17, Fastify, Chromium y varias cuentas; ampliar **como escenario integral coherente**, no mediante decenas de pruebas inconexas.
- `apps/api/src/table-change-b3-http-composition-candidate.mjs`, `table-change-isolated-sql-composition-candidate.mjs`, `table-change-sealed-rpc-candidate.mjs`: composición candidata de HTTP/SQL y roles.
- `apps/api/src/customer-production-flow.mjs`, `customer-production-http.mjs`, `order-operations-composition.mjs`: entradas a cruzar con pagos y operaciones autorizadas; **verificar comportamiento actual en el código**.
- `apps/api/src/table-change-state-stream-candidate.mjs`, `apps/client/src/customer-table-change-events.ts`, `apps/client/src/App.tsx`: SSE, QR y separación de mensajes económicos y avisos de conexión.
- `apps/management/src/views/TableChangeRequestsPanel.tsx`, `apps/management/src/views/TablesView.tsx`: superficie de gestión.
- `supabase/migrations/` y `scripts/ci/migration-audit.mjs`: contratos SQL y auditoría; aplicar únicamente a PG17 desechable.
- `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`: registro normativo de requisitos/resultados; no modificar sus exigencias para adaptar código.

**Secuencia de arranque:**
1. Confirmar HEAD, rama, PR #43 Draft, commits posteriores y resultado de workflows; **no suponer que `6c0bed96` sigue siendo HEAD**.
2. Leer contratos normativos y matriz F/R completos; identificar con precisión qué está implementado, qué se ejecutó, y qué falta demostrar, especialmente el flujo económico end-to-end real.
3. Definir un **hito integral completo** con actores, operaciones soportadas, estado inicial/final, seguridad, casos F/R, flujos de error y salida observable de ambas PWA. No improvisar alcance a partir de fixtures.
4. Implementar y validar contra PG17/HTTP/Chromium reales, concurrencia e idempotencia; corregir y relanzar las pruebas y regresión completa. Mantener todo en el PR Draft, sin merge ni despliegue.
5. Registrar solo un hito **realmente cerrado** con SHA, URL de CI, cifras verificadas, casos positivos y pendientes en matriz y en el **presente handoff**. Si falla una prueba, documentar estado NO-GO sin presentarlo como avance completado.

## 8. Registro de hitos de la sesión 20 / preparación 21

- **2026-11-03 — Se crea este handoff:** se conserva como último hito funcional `52d5c62f` (F20 económico/UX SSE, 4/4 SUCCESS). No se implementa funcionalidad ni se ejecutan nuevas pruebas con la creación documental. PR #43 Draft, B3/B4 NO-GO. El nuevo commit documental que crea este archivo debe comprobarse por separado.
- **2026-11-03 — Cobro parcial firmado F20/R05 con cuenta estable:** código `eb85b08ff5fee903be5a658bd5deac273b8f4694`, cuatro workflows SUCCESS enlazados en §1, H6 Blocks 1/2A/2B PASS. Migración candidata `20261103010000_sabora_h6_partial_cash_account_continuity_candidate.sql` con función HMAC sellada, sin nuevas rutas activadas en producción. **Se elimina el fixture directo de efectivo** del E2E y se registra realmente por HTTP de personal en el arnés con **séptimo login PostgreSQL de único RPC**: cobro 300 en A, saldo **1.200→900**, concurrencia y replay sin duplicación, sobrepago 409, cliente sin credencial 403. Tras autorización del camarero y confirmación de nuevo pedido 700 en D, la cuenta original pasa **900→1.600**. Se cobra 400 (resta 1.200), después 1.200 (resta 0), con **tres asientos inmutables total 1.900** y cuenta `open`. Los eventos económicos apuntan a **A,D,D**. Se preservan histórico A, nuevo destino D y la segunda cuenta Stripe pendiente. Guard de identidad HTTP es test-only; no demuestra PWA de caja ni dinero físico, Stripe real ni refund. **F20/R05 global y B3/B4 NO-GO.** [Matriz con trazabilidad §19](https://github.com/jdlc86/CartaViva/blob/integration/sabora-h6-b2-delivery-board-contract-20261031/docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).
- **Siguientes hitos:** añadir aquí solo cuando exista resultado ejecutado y verificado; incluir SHA, enlaces CI, alcance exacto, incidencias y pendientes NO-GO. No actualizar el registro con meros planes o microcorrecciones.

**Regla final:** el cambio de mesa no está autorizado para producción. Sabora **no debe detener, alterar ni depender operativamente de Fleetia** ni de otros proyectos del VPS. Sin autorización explícita no hay merge, despliegue, reinicio, modificación de infraestructura ni operación sobre Supabase productivo.
