# Sabora / CartaViva — continuidad operativa para la sesión 20 (2026-11-02)

> **Documento de continuidad; NO es normativa ni autorización de despliegue.**
> Se actualizará en esta misma ruta al alcanzar **hitos importantes**, no tras cada cambio menor. Si hay contradicciones, manda la documentación normativa vigente del repositorio.

## 1. Cómo tomar el control sin perder el contexto

**Proyecto:** Sabora / CartaViva, **un único restaurante**; dos PWA (cliente y gestión), API Fastify y PostgreSQL 17 con roles segregados. No confundir este proyecto con Fleetia.

- **Repositorio autorizado:** `jdlc86/CartaViva`.
- **Rama de trabajo en la entrega:** `integration/sabora-h6-b2-delivery-board-contract-20261031`.
- **PR:** [#43 (Draft)](https://github.com/jdlc86/CartaViva/pull/43); **no fusionado**.
- **HEAD comprobado:** `de1bcc48ed2defd7c450fde6e6d2eabf4ebe98de`.
- **Estado global del cambio de mesa:** **B3 NO-GO / B4 NO-GO**, aunque existen recorridos integrados verdes.
- **Última comprobación del HEAD:** [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/41518927497), [bootstrap / PG17](https://github.com/jdlc86/CartaViva/actions/runs/41518927476), [navegador cliente](https://github.com/jdlc86/CartaViva/actions/runs/41518927334) y [navegador gestión](https://github.com/jdlc86/CartaViva/actions/runs/41518927270): **4/4 SUCCESS** el 2026-11-02. **Verificar nuevamente HEAD y workflows al comenzar la sesión 20**, pues pueden cambiar.

**Orden obligatorio de lectura antes de actuar:**
1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: contrato funcional normativo y decisión aprobada de cambio de mesa (2026-10-30).
2. `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`: arquitectura, aislamiento y metodología normativa de **hitos funcionales integrales** (2026-11-02).
3. `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`: hoja de ruta de auditoría y **matriz F01–F28 / R01–R10**; se documentan allí las evidencias y límites de aceptación.
4. `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/REQUISITOS_FUNCIONALES.md` y `docs/SABORA_AUTHORIZATION_GATE.md`: identidad visual, requisitos generales y puertas de autorización.
5. `docs/handoffs/SESSION_19_HANDOFF_2026-11-02.md` y este documento: **solo contexto de continuidad**. Recuperar detalles de commits/CI y código; no inferir normativa a partir de resúmenes.

## 2. Directrices innegociables

1. **GitHub es la fuente de verdad**. No inventar, ampliar ni reinterpretar documentación normativa. Los handoffs no la sustituyen. Desarrollar visualmente según identidad aprobada y flujos discutidos/aprobados; verificar conformidad en ambas PWA y tamaños móvil/escritorio.
2. **Prohibido avanzar por una sucesión de micropruebas o microhitos**. Definir y cerrar **un recorrido funcional completo** por bloque: cliente/gestión, HTTP/autenticación, SQL PG17 y privilegios mínimos/RLS, cuenta/pedidos/pagos/entregas/eventos donde procedan. Su comprobación principal debe ser E2E con **PostgreSQL 17 desechable, Fastify y Chromium reales**. Usar pruebas aisladas solo para fallos concretos o protección de un requisito crítico; no confundirlas con avance del proyecto.
3. **Separar tres afirmaciones:** (a) código implementado, (b) pruebas ejecutadas y su resultado, (c) funcionalidad validada contra todos los casos normativos aplicables. **CI verde no significa GO** ni da permiso de producción.
4. **Aislamiento absoluto:** no modificar ni interrumpir Fleetia, sus contenedores, redes, datos o recursos. Sabora comparte VPS con Fleetia; nunca tocar ese VPS ni desplegar/reiniciar/eliminar servicios sin **autorización expresa**, aislamiento completo y garantía de que Fleetia y otros proyectos no se ven afectados. No tocar Supabase operativo ni migraciones productivas sin autorización expresa. No mezclar secretos, roles, entornos ni contenedores. Mantener PR Draft; **sin merge** sin autorización.
5. Diagnosticar fallos, corregir y repetir el recorrido E2E/regresión afectada **dentro del mismo hito**. Gestionar esperas de CI/shell con herramientas, evitando pedir al usuario aprobación para pasos ordinarios no operativos. No utilizar aprobaciones implícitas para cambios de infraestructura.
6. Tras **cada hito importante**, actualizar la evidencia en la **matriz normativa** (sin cambiar requisitos por conveniencia) y resumir los hechos nuevos en **este documento**. Mantenerlo breve, operativo y vigente; registrar SHA, enlaces de ejecución, resultado, cobertura real y NO-GO/GO justificado.

## 3. Contrato aprobado de cambio de mesa: invariantes esenciales

- Escanear un QR no vincula, desvincula ni traslada; vincula la **primera confirmación de pedido**, incluso durante agrupación.
- Con cuenta activa en A, escanear B permite **«Solicitar cambio de mesa» / «Cancelar»**. La petición expresa abandonar A **sin destino**, ni motivo. Cancelar aviso no muta.
- Solicitud con **90 s desde hora del servidor**, configurable; aunque el camarero rechace, el cliente no puede solicitar otra antes del vencimiento. Decisiones tardías inválidas. Notificaciones automáticas normativas de aprobado/rechazado, sin motivo.
- Aprobación: autorización de **un solo uso**, sin destino y sin vencimiento temporal adicional; **no traslada en la aprobación ni al escanear**. Solo al confirmar el **primer pedido en otra mesa operativa válida** se transfiere de modo atómico la cuenta y el destino de entregas pendientes; se conserva historial económico y origen de pedidos, pagos, deuda y otras cuentas.
- Revalidar QR, mesa, sesión, cuenta, permisos, pagos y concurrencia en confirmación; auditar acciones; no duplicar órdenes, cobros, avisos ni entregas.

No reemplazar este resumen por el texto literal normativo.

## 4. Hitos cerrados que sí cuentan con evidencia

**Recorrido económico y de PWA, anterior:** `a9c6ecd6`, 4 workflows SUCCESS. Cliente Chromium escanea B desde cuenta A, cancela sin efectos, solicita sin destino; camarero gestiona en PWA; primer pedido B consuma traslado manteniendo misma cuenta y saldo **2.400→3.100 céntimos**, histórico A intacto y entrega pendiente a B. Reintento de pedido idempotente. Evidencia en matriz.

**Respuestas automáticas:** `5e72bdf8`, 4 workflows SUCCESS. SSE autenticado `LISTEN/NOTIFY` con mensaje sin datos de negocio; aprobación y rechazo automáticos por ambas PWA; bloqueo de solicitud durante la ventana y reapertura tras vencimiento **simulado**; pruebas integradas PG17. Evidencia en matriz.

**Último hito funcional integral validado:** `a1ce0c03c269bf6b650c6d0e04c351f80b74112f`, 4/4 SUCCESS:
- Aprobación/rechazo se proyectan **en la transacción de decisión** al **outbox H6 append-only** existente; lector SQL por sesión autenticada y cuenta única, cursor y replay SSE, identidad SQL `NOINHERIT`, sin SELECT directo.
- En el mismo recorrido **PG17 aislado + Fastify + PWA cliente y gestión Chromium**: aviso/cancelación/solicitud/aprobación/confirmación B; economía e historial conservados; rechazo automático; bloqueo de reintento, decisión tardía denegada y carrera de dos solicitudes; sesión revocada con SSE abierto y nuevas operaciones denegadas.
- **Segundo cliente realmente desconectado** antes de rechazo: recibe al reconectar el evento perdido desde el cursor **después de vencimiento simulado**. El cliente que ya recibió aprobación reconecta y restaura el estado sin duplicar el aviso. Se corrigió el validador UUID canónico de cinco grupos en servidor y navegador.
- Evidencia: [CI](https://github.com/jdlc86/CartaViva/actions/runs/41518098392) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41518098403) · [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41518098357) · [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41518098510). La documentación del resultado está en el apartado 11 de la matriz F/R.

**Importante:** B3 sigue exclusivamente como **composición candidata opt-in del entorno aislado**. El arnés usa todavía adaptadores de identidad HTTP/cookie y catálogo de prueba; no equivale a montaje productivo autorizado.

## 5. Qué falta de verdad: siguiente hito integral propuesto

**Objetivo:** continuar el cierre funcional **B3 completo**, no abrir una serie de pruebas parciales. Antes de modificar código, definir una única campaña/recorrido E2E que abarque todas las capas afectadas, con IDs F/R, estados de cuenta y eventos esperados. Priorizar, como conjunto integrado y no como microhitos:

- Composición de **identidad y catálogo operativa autorizable**, evitando los adaptadores del arnés y manteniendo privilegios mínimos y fail-closed; distinguir preparación técnica de autorización para activarla.
- Clientes múltiples con **cuentas independientes** en mesas A y B; SSE cliente/camarero/cocina, reconexión, aislamiento entre comensales, replays y cursores caducados/huecos, caída/reinicio y alcance de retención del outbox.
- Ventana **natural exacta de 90 s** y condiciones de carrera en instantes límite, aprobación/decisión/confirmación concurrentes, cierre de cuenta, revocación de identidad/permiso, QR rotado o mesa bloqueada, autorización consumida o pendiente.
- Conciliación real del mismo historial económico en **pagos parciales, efectivo, Stripe pendiente/reintentos**, reversiones y fallos inyectados con rollback atómico; destinos cocina/sala, estados de recogida, agrupación e idempotencia.
- Conformidad de **ambas PWA con diseño aprobado**, accesibilidad y capturas móvil/escritorio. Evidencia **por cada F01–F28 / R01–R10** antes de emitir GO.

**No asumir** que la evidencia parcial de `a1ce0c03` cubre toda F25/R07–R09, ni que un vencimiento simulado equivale a comprobar 90 segundos naturales. No dar B3 por cerrado hasta satisfacer las variantes exigidas en la matriz, con regresión completa.

## 6. Archivos y piezas relevantes para continuar

- `scripts/ci/table-change-root-postgres17.test.mjs`: recorrido integrador PG17 + API + ambas PWA; extenderlo como **un único escenario significativo** en vez de multiplicar suites aisladas.
- `apps/api/src/table-change-b3-http-composition-candidate.mjs`, `apps/api/src/table-change-isolated-sql-composition-candidate.mjs`, `apps/api/src/table-change-sealed-rpc-candidate.mjs`: montaje opt-in, superficies SQL permitidas y estado/outbox.
- `apps/api/src/table-change-state-stream-candidate.mjs`: SSE, cursor, validación y listener `NOTIFY`.
- `apps/client/src/App.tsx` y `apps/client/src/customer-table-change-events.ts`: flujo QR, mensajes y recepción/deduplicación/reconexión.
- `supabase/migrations/20261102170000_sabora_h6_table_change_committed_notification_candidate.sql` y `20261102180000_sabora_h6_table_change_durable_outbox_candidate.sql`: señales post-commit y eventos durables candidatos.
- `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`: **evidencia oficial de aceptación**. Revisar los SHA actuales antes de inferir aplicabilidad.

## 7. Primeras acciones de la sesión 20

1. Leer documentos normativos anteriores y este contexto; verificar **rama/HEAD/PR Draft/CI más recientes** en GitHub y cualquier cambio posterior.
2. Comparar **implementación**, **evidencia realmente ejecutada** y **requisitos faltantes** de la matriz. Detectar incompatibilidades entre identidad productiva, sesiones y el SSE de eventos antes de implementar.
3. Delimitar el **próximo recorrido integral** con invariantes, usuarios, roles, PG17/RLS, API, PWA, pagos/cocina/sala y aceptación visual que correspondan; trabajar sobre el PR/branch autorizado sin activar producción.
4. Implementar, ejecutar y corregir hasta que pase la aceptación integrada y regresión; documentar únicamente hitos mayores aquí y en la matriz. No pedir al usuario que intervenga para esperas de CI ni partir el trabajo en micropruebas.

**Situación de traspaso:** la sesión 20 puede continuar el desarrollo del **B3 todavía NO-GO**, no desplegarlo ni declararlo finalizado. Los límites de aislamiento y aprobación siguen vigentes.
