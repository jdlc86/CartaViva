# Sabora / CartaViva — continuidad operativa para la sesión 20 (2026-11-02)

> **Seguimiento vivo obligatorio (05-11-2026):** [Tablero central de tareas de CartaViva/Sabora](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). Este traspaso conserva su contexto histórico; las ramas, SHAs y estados pueden haber cambiado. Consultar siempre HEAD/CI y los **requisitos normativos vigentes**: [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [requisitos](../REQUISITOS_FUNCIONALES.md), [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md) y demás contratos aplicables. **El tablero y este handoff no sustituyen la normativa.**

> **Documento de continuidad; NO es normativa ni autorización de despliegue.**
> Se actualizará en esta misma ruta al alcanzar **hitos importantes**, no tras cada cambio menor. Si hay contradicciones, manda la documentación normativa vigente del repositorio.

## 1. Cómo tomar el control sin perder el contexto

**Proyecto:** Sabora / CartaViva, **un único restaurante**; dos PWA (cliente y gestión), API Fastify y PostgreSQL 17 con roles segregados. No confundir este proyecto con Fleetia.

- **Repositorio autorizado:** `jdlc86/CartaViva`.
- **Rama de trabajo en la entrega:** `integration/sabora-h6-b2-delivery-board-contract-20261031`.
- **PR:** [#43 (Draft)](https://github.com/jdlc86/CartaViva/pull/43); **no fusionado**.
- **HEAD verificado antes de esta actualización documental:** `c4e096290c365545528d6de8b1dbbdbe4bb88cff` (matriz §18 ampliada), PR #43 **Draft**, sin merge. **Comprobar nuevamente HEAD, rama, PR y CI al retomar**; no tratar este SHA como estado congelado.
- **Último SHA funcional con evidencia integrada:** `52d5c62f58f25c6db7c0b557d2435f13bc177099` (**F20 económico y mensaje de Stripe pendiente preservado pese a incidencias de SSE**). **4/4 SUCCESS:** [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/41564589393) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41564589447) · [PWA cliente](https://github.com/jdlc86/CartaViva/actions/runs/41564589427) · [PWA gestión](https://github.com/jdlc86/CartaViva/actions/runs/41564589355). **Node 1.175/1.175, PG17 51/51 y bloques H6 1/2A/2B PASS.** El SHA económico anterior `f3ff9b86` también fue 4/4 verde; se detectó y corrigió un defecto posterior de UI que ocultaba el aviso de Stripe pendiente bajo incidencias SSE. Hitos anteriores: F16/F17 carrera SQL (§17), F22 (§15), F23 (§16). **NO equiparar pago histórico de fixture con flujo real de cobro.**
- **Estado global del cambio de mesa:** **B3 NO-GO / B4 NO-GO.** Hay recorridos integrados acreditados, pero faltan supuestos normativos completos, identidad/composición operativa y autorización formal. **Ningún CI verde concede GO ni permiso de producción.**

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

### Hito funcional posterior: aislamiento de tres cuentas en dos mesas (F14/F18 y R07 parcial)

**SHA `d8852114fd141301a7246780f91a5fe44dbaf9ca` — 4/4 workflows SUCCESS.** En el **mismo recorrido integral PG17 real desechable + seis logins SQL físicos + Fastify + PWA cliente/gestión Chromium**, un comensal con consumo en A obtiene permiso y confirma en B mientras **otro comensal permanece y pide en A** y **un tercero ya consume y vuelve a pedir en B**. Los tres tienen sesiones, cuentas, historial y pagos diferidos separados. Se comprueban 3 `account_id` preexistentes sin duplicados, saldo del trasladado **2400→3100 céntimos**, saldo comensal A **1800→2500** y comensal B **2500→3200**, historial y destinos de entrega pendientes de los que no se trasladan inalterados. Los dos comensales ajenos mantienen canales SSE reales y no reciben decisiones H6 de la otra cuenta; el lector sellado tampoco las devuelve. Capturas en `sabora-h6-acceptance/b3-f18-codiner-{a,b}-confirmed-mobile.png`. [CI](https://github.com/jdlc86/CartaViva/actions/runs/41524366119) · [bootstrap/PG17](https://github.com/jdlc86/CartaViva/actions/runs/41524366376) · [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41524366047) · [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41524366063).

**Defecto real corregido:** la confirmación candidata rechazaba pedir tras reescanear **la propia mesa** porque exigía coincidencia del `visit_key` histórico. La migración candidata nueva `20261102200000_sabora_h6_same_table_rescan_binding_candidate.sql` elimina **solo esa igualdad**, pero exige la mesa y sesión operativas iguales y la visita/QR actual autorizada; conserva intacta la vinculación original y el permiso de cambio de mesa sin usar. Con revisión en `scripts/ci/migration-audit.mjs`. No cambia la confirmación productiva, ni concede roles operativos, ni despliega.

**Límites:** F18 tiene **evidencia positiva del recorrido principal**, no de todas las variantes de pagos, recogidas, QR revocados y eventos cocina/sala; R07 tampoco está certificado de forma global. La autenticación HTTP y el catálogo siguen con fixtures de integración, la ventana de 90 s natural no se ha medido, B3/B4 siguen **NO-GO**.

### Hito integrado posterior: rechazo de destino cerrado sin afectar a otros comensales (F17 parcial)

**SHA `f4286a8c7e6468ab50448b575d5c6fd06ab37792` — cuatro workflows SUCCESS:** [CI](https://github.com/jdlc86/CartaViva/actions/runs/41531115933), [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41531115941), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41531116172), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41531116053). Se amplió el **mismo** recorrido E2E de tres comensales, API real, PostgreSQL 17 desechable y PWA Chromium: con autorización A→B aprobada, un tercer destino C cerrado deniega la autorización de visita desde la PWA sin consumir permiso, mover cuenta, modificar deuda ni crear ronda; al recuperar C en el fixture, el cliente continúa con su pedido auténtico en B y los otros dos comensales conservan sesiones, cuentas, pedidos y saldos independientes. La primera tentativa sobre B detectó correctamente que cerrar/reabrir una mesa crea **nueva sesión operativa**, por lo que el caso negativo se aisló en C sin alterar la sesión de un tercero en B. **Evidencia parcial de F17**, no su aceptación íntegra: queda pendiente la revocación/mesa bloqueada **entre autorización de visita y confirmación**, carrera de revocación y comprobación de rollback en la confirmación.

### Hito integral F17: QR revocado y mesa cerrada después de cotización (2026-11-02)

**SHA `af6f7f7fa091e12f34a683b41599033af15de73e`, 4/4 workflows SUCCESS.** [CI](https://github.com/jdlc86/CartaViva/actions/runs/41537185967) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41537186172) · [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41537185958) · [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41537186121). En el **mismo E2E** de Fastify, PG17 real, ambas PWA Chromium y tres cuentas: mesa C cerrada antes de visita; posteriormente visita/cotización válidas en C, **rotación del QR** antes de confirmar; luego nueva visita/cotización válidas, **cierre de mesa** antes de confirmar. Cada petición auténtica denegada conserva autorización `approved`, cuenta vinculada en A, **2.400 céntimos**, una ronda, cero pagos, ambas entregas en A y ningún pedido en C. El cliente continúa y confirma legítimamente en B, manteniendo aisladas las otras dos cuentas. Se corrigió un defecto real de la API que clasificaba ausencia de contexto autorizado como 503; ahora el flujo distingue ese caso como denegación 403 sin cambiar roles ni consultas SQL. Matriz oficial: apartado **14**. **F17 con evidencia amplia, aún pendiente carrera de revocación concurrente durante confirmación. B3/B4 NO-GO.**

### Hito integral de carrera F22: único traslado ganador B/C (2026-11-02)

**SHA `9d90ca48`, 4/4 SUCCESS.** Un cuarto comensal con cuenta, saldo y entrega histórica en A (1.600 céntimos) obtiene autorización; dos PWAs Chromium con cookie real preparan visitas y cotizaciones válidas para mesas B y C y confirman en paralelo sobre Fastify y **conexiones SQL físicas PostgreSQL independientes**. Solo **una respuesta 201 y una 409**: permiso consumido una vez, cuenta intacta, saldo **1.600→2.300**, exactamente una nueva ronda, ninguna en la mesa perdedora y entrega pendiente redirigida solo a la ganadora. Replay del cuerpo ganador **200 `replayed`** sin tercera ronda; los otros tres comensales mantienen sus comprobaciones previas. No se ha demostrado todavía una intercalación forzada dentro del commit ni fallo posterior al consumo: **F22 principal comprobado, F23/R04 y R03 global pendientes.** [Detalle en matriz §15](https://github.com/jdlc86/CartaViva/blob/integration/sabora-h6-b2-delivery-board-contract-20261031/docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).

### Hito integral F23/R04: rollback post-consumo y recuperación (2026-11-02)

**SHA `e4a38635`, cuatro workflows SUCCESS.** Quinta cuenta/visita real en A, permiso aprobado y pedido cotizado en C desde Chromium; un trigger **solo en PostgreSQL 17 efímero** provoca un fallo en la inserción de despacho **después del intento SQL de consumo**. Respuesta 503 genérica; rollback comprobado directamente: concesión `approved`, cuenta en A, saldo **900**, una ronda/pedido histórico, cero intentos de pago/despachos, entrega pendiente conservada. `orders/lookup` devuelve `not_found`; mismo cuerpo/clave de pedido: **201 confirmado**, cuenta idéntica, saldo **900→1.600**, un traslado y una nueva ronda; replay 200 sin duplicación. Trigger y función temporales retirados. **Solo se valida este punto de fallo**, no todos los interleavings de R04 ni conciliación integral. Ver **matriz §16**.

### Hito integral F16/F17/R03: revocación durante confirmación SQL y recuperación (2026-11-03)

**SHA `d1a88d8f`, 4/4 SUCCESS.** En el **mismo recorrido** PG17/roles físicos/Fastify/Chromium, dos cuentas nuevas en A obtienen permiso para salir sin destino y prueban pedidos en mesa adversarial D aislada. Con la visita y cotización válidas, el arnés mantiene el advisory lock **real** del cliente; `pg_stat_activity` y `pg_blocking_pids` demuestran que la confirmación H6 está esperando **dentro de PostgreSQL**. Se comete desde otra conexión (i) rotación del QR de D o (ii) revocación de la sesión del comensal, antes de desbloquear la confirmación. Ambos intentos devuelven **403**, sin rondas, pagos, órdenes ni traslados nuevos ni cambio de deuda/entrega. En el caso QR, nueva visita/cotización desde la PWA y pedido correcto **1.100→1.800 céntimos**, mismo permiso consumido una vez; con sesión revocada, acceso posterior denegado y cuenta permanece en A (**1.300 céntimos**). **Cobertura delimitada:** revocación durante la espera *previa* al consumo, no revocación inyectada dentro de la fase final post-consumo. Evidencia detallada en **matriz §17**.

### Hito integrado F20/R05: dos cuentas, Stripe pendiente y caja previa (2026-11-03)

**SHA `f3ff9b86`, 4/4 workflows SUCCESS, PG17 51/51.** En el E2E existente con seis identidades SQL, Fastify, PWA cliente y sala Chromium, dos comensales adicionales en A solicitan permiso, reciben aprobación y confirman en D con visita y cotización reales de **700 céntimos**. La cuenta `pay_now` conserva intacta la autorización Stripe previa `requires_action` (1.200 céntimos, claves e intent del proveedor); la ronda nueva genera una **segunda autorización solo solicitada**, de 700, con claves distintas y sin pretender captura o pago confirmado. La cuenta `pay_at_end` conserva un registro de efectivo previo de **300 céntimos** y deuda **900→1.600**; no crea un nuevo cobro ni modifica la fila histórica. Ambos mantienen origen histórico A, vinculación actual en D, entregas pendientes redirigidas y modalidad de pago; replay exacto `200 replayed` no duplica rondas/pagos. Evidencia en **matriz §18**.

**Corrección de conformidad visual en el mismo hito:** `52d5c62f`, CI 4/4 SUCCESS, prueba integral PG17 B3 n.º 49 PASS. La PWA presentaba la información de pago inmediato pendiente, pero su mensaje podía ser sustituido por una incidencia SSE. Ahora el aviso de conexión/eventos es un estado **separado** del aviso económico, y el estado del canal no se afirma conectado sin haber sido constatado. Chromium confirma los textos explícitos de **Stripe pendiente y sin cobro ni envío a cocina**. Matriz §18 actualizada.

**Delimitación crítica:** el registro previo de 300 céntimos y el intento Stripe anterior **se sembraron como fixtures de base de datos**. El escenario no demuestra una transacción real de cobro parcial autorizada, ni webhook, autorización/captura, conciliación o reembolso de Stripe. La función de caja actual exige liquidación total del saldo; no presumir soporte para parcial por el hecho de que el ledger admita el registro. **F20/R05 y B3/B4 siguen NO-GO**.

## 5. Qué falta de verdad: siguiente hito integral propuesto

**Objetivo:** cerrar B3 en **bloques funcionales íntegros**, nunca por micropruebas. **Próxima campaña implementable:** integrar las operaciones económicas autorizadas (cobro real de caja —con la política de parcialidad que marque el contrato—, Stripe pendiente/fallido, reconciliación, cancelación y refund) con la cuenta que cambia de mesa; recorrer cliente, camarero/caja, cocina/sala, Fastify, PostgreSQL 17 físico y ambas PWA, más aislamiento de SSE/pagos y restauración segura ante fallos. **No confundir el hito F20 §18 con ese flujo aún pendiente.** También siguen fuera de aceptación los interleavings posteriores al consumo y antes de commit, fallo inyectado en cada fase y ventana de 90 segundos naturales. Exigir evidencias F/R y regresión global antes de un GO.

En el mismo cierre B3 siguen siendo imprescindibles, sin fragmentarlos artificialmente en decenas de hitos independientes:

- Composición de **identidad y catálogo operativa autorizable**, evitando los adaptadores del arnés y manteniendo privilegios mínimos y fail-closed; distinguir preparación técnica de autorización para activarla.
- **Ya comprobado:** convivencia de 3 comensales/cuentas con pedidos reales en A/B y sin decisiones H6 cruzadas. **Falta:** SSE de cocina/sala y sus variantes, reconexión multiusuario, replays con cursores caducados/huecos, caída/reinicio de servidor, caducidad de retención y todos los límites de autorización.
- Ventana **natural exacta de 90 s** y condiciones de carrera en instantes límite, aprobación/decisión/confirmación concurrentes, cierre de cuenta, revocación de identidad/permiso, QR rotado o mesa bloqueada, autorización consumida o pendiente. **Lo ya ejecutado:** bloqueo/reapertura con timestamps simulados, rechazo tras cotizar y revocación durante espera PostgreSQL de confirmación (§17); **lo no ejecutado como aceptación integral:** vencimiento natural de 90 s ni revocación después del consumo SQL/pre-commit.
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

**Situación de traspaso verificada al 2026-11-03:** PR #43 **Draft**; F16/F17 carreras durante espera SQL, F18 convivencia, F22 doble destino, F23 rollback post-consumo y **F20 continuidad económica de Stripe pendiente/efectivo histórico más aviso visual de pago no confirmado** con pruebas integradas verdes (último SHA funcional `52d5c62f`). SSE durable acreditado con vencimientos simulados. **Pendientes:** cobro parcial real autorizado, conciliación Stripe/efectivo y reembolsos, revocación post-consumo/pre-commit, todos los puntos de fallo, identidad operativa real, plazo de 90 s natural, cocina/sala/SSE completo, diseño final y evidencia F01–F28/R01–R10. **B3/B4 NO-GO**. Sin merge/despliegue, ni intervención en Fleetia, VPS o Supabase operativo.
