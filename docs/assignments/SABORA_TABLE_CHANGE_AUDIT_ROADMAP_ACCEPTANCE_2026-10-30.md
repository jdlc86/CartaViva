# Sabora — auditoría, hoja de ruta y aceptación del cambio de mesa

**Estado:** GUÍA DE IMPLEMENTACIÓN / NO-GO de activación. **Fecha:** 2026-10-30. **Alcance:** un único restaurante Sabora. **Rama:** `integration/sabora-h6-end-to-end-pilot-20261030`.

## 0. Jerarquía documental y criterio de interpretación

La **fuente normativa**, que prevalece íntegramente sobre este plan, es `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, sección «Cambio de mesa con consumición activa — decisión funcional 2026-10-30», junto con los demás requisitos normativos vigentes de GitHub y la identidad visual y flujos aprobados. Este documento es **guía ejecutiva, auditoría y matriz de aceptación**, no altera requisitos. Si existe discrepancia, **detener implementación y resolverla contra la normativa**, sin reinterpretarla. Los handoffs son solo contexto.

**Regla de ejecución:** refactorización de raíz, hitos completos, no parches de compensación. No merge, producción, VPS ni Supabase operativo sin autorización expresa; Fleetia y cualquier otro recurso compartido quedan totalmente fuera de alcance. PG17 aislado.

## 1. Auditoría del estado actual (evidencia de lectura, no ejecución)

| Área | Evidencia examinada | Hallazgo / riesgo | Estado |
| --- | --- | --- | --- |
| Contrato | `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` | Reglas funcionales detalladas y pruebas obligatorias ya fijadas | Documentado |
| Cuenta H6 | `supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql` | `customer_accounts` tiene `id` y unicidad por `(table_id,session_id,visit_key,customer_id)`; `order_rounds.account_id` y `payment_attempts.account_id` preservan identidad económica. Revisar todas las claves dependientes antes de cambiar la mesa | **Bloqueante** |
| Confirmación H6 | `apps/api/src/customer-production-flow.mjs` y función SQL `sabora.confirm_customer_round_h6_candidate` | La función llama primero a `persist_customer_order_candidate` y después busca/crea cuenta por mesa, sesión, visita y cliente. Transferir `table_id` después puede crear otra cuenta y separar pagos | **Bloqueante** |
| Privilegios | `apps/api/src/customer-production-composition.mjs`, `role-scoped-postgres.mjs`, `h6-sql-preflight.mjs` | La composición H6 solo admite tres SQL exactos y el preflight comprueba superficie exacta de funciones por rol. El adaptador de SQL directo no se puede enchufar sin violar controles | **Bloqueante** |
| Solicitud/decisión | `apps/api/src/table-change-policy.mjs`, `table-change-service.mjs`, `table-change-postgres-store.mjs` | Lógica candidata y consultas de solicitud/decisión; adaptador sin composición real, `applyTransfer` falla cerrado deliberadamente | Parcial, no integrado |
| Persistencia solicitud | `supabase/migrations/20261030124000_sabora_table_change_candidate.sql` | Tabla, plazo configurable, índices, RLS forzada y ausencia de grants directos; falta implementación autorizada por funciones restringidas | Candidato, no PG17 validado |
| Sala/cocina y destino | SQL y rutas H6, `apps/api/src/h6-operations-http.mjs` | Identificar **todos** los modelos y proyecciones de entrega pendiente y eventos; no asumir que cambiar mesa de cuenta redirige tareas | **Inventario obligatorio** |
| Cliente y UI | `apps/client/src/customer-flow-transport.ts`, `apps/api/src/customer-production-http.mjs` | Transporte/ruta opcionales no equivalen a flujo PWA aprobado integrado | Pendiente de E2E |
| Pruebas | Archivos `table-change-*.test.mjs` | Tests unitarios/mocks no prueban integridad SQL, roles, transacciones reales ni interfaz | **Sin certificación integral** |

**Conclusión de auditoría:** no hay evidencia suficiente para aceptar ni activar el cambio de mesa. No confundir commits o tests aislados con integración funcional. El mayor riesgo es la **fragmentación de la cuenta económica** al confirmar en otra mesa; el segundo es la **redirección incompleta de entregas**; el tercero, romper el **modelo de privilegios**. El traslado permanece inhabilitado.

## 2. Diseño de dominio que debe resultar del refactor

- **Cuenta estable:** identidad económica `account_id` inmutable durante toda la visita; cada comensal conserva cuenta, deuda, pagos parciales, Stripe y auditoría, incluso si comparte mesa con otros.
- **Origen histórico inmutable:** la mesa del pedido al confirmarse nunca se reescribe para simular que se originó en otra.
- **Vinculación operativa actual:** primera confirmación vincula mesa, también durante agrupación. QR y exploración no vinculan.
- **Destino operativo de entrega:** dato independiente de origen histórico y actualizable para **entregas pendientes** de esa cuenta; los pedidos recogidos/históricos no se modifican ni se vuelven a preparar o cobrar.
- **Permiso diferido:** solicitud sin destino, decisión de camarero, concesión única sin caducidad adicional; se consume **solo** al confirmar primer pedido en mesa diferente, con QR y estado revalidados dentro de la misma transacción.
- **Estado de autorización:** expiración de solicitudes pendientes a los 90 s configurables; rechazo no reinicia plazo; aprobado no transfiere ni caduca por el mero transcurso de esos 90 s; revocación/cierre invalidan autorización.
- **Seguridad:** identidad de cliente y personal verificada en servidor; operaciones SQL con roles mínimos, RLS y funciones restringidas; sin SQL arbitrario ni ampliación general de grants.

**Decisión técnica a verificar en PG17:** la nueva confirmación debe identificar y bloquear la cuenta original y la concesión antes de persistir/relacionar el pedido nuevo, con orden de bloqueos documentado y sin duplicar cuenta. El esquema y las FKs pueden requerir migración estructural; no elegir una técnica sin inspeccionar dependencias reales. Una única transacción debe incluir confirmación, consumo de concesión, vinculación y redirección pendiente; cualquier fallo revierte todo.

## 3. Hoja de ruta: bloques completos y puertas de salida

**Aplicación obligatoria de la regla de hitos integrales:** no se utilizará la sucesión de tests pequeños o SQL/HTTP/mocks por separado como metodología. Para el cambio de mesa, la siguiente unidad de ejecución es el recorrido completo solicitud cliente A → decisión por camarero → nueva confirmación en B → transferencia transaccional de la misma cuenta → pagos/entregas/eventos consistentes → cliente y sala en navegador real. Incluye permisos de PostgreSQL 17 desechable, carreras, idempotencia, rollback, revocación y evidencia F/R. Pruebas aisladas solo para fallos específicos o requisitos críticos, y nunca como sustituto de aceptación integral. La regla de método está fijada en `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`.

### B0 — Inventario y contrato ejecutable (obligatorio antes de SQL)
- Inventariar migraciones y dependencias de `customer_accounts`, visitas, pedidos, rondas, pagos, tareas de recogida/entrega, proyecciones, eventos y SSE. Dibujar invariantes y orden de bloqueos.
- Mapear rutas reales de composición cliente/sala/cocina, identidad, roles, QR, agrupación, pagos y UI aprobada.
- Añadir pruebas de contrato que reproduzcan el fallo de cuenta duplicada y redirección incorrecta en PG17 aislado.
- **Salida:** inventario con rutas/columnas/FKs verificadas, pruebas iniciales reproducibles y contrato consistente con normativa.

### B1 — Dominio y migración nativa PG17
- Separar de forma explícita origen histórico, cuenta vinculada y destino operativo de entrega, manteniendo datos y compatibilidad existentes mediante migraciones idempotentes cuando corresponda.
- Integrar tabla de solicitudes, índices de unicidad y auditoría; impedir duplicación de cuentas y consumo múltiple de concesiones.
- Definir funciones `SECURITY DEFINER` con propietarios y grants mínimos; no habilitar permisos genéricos. Revisar RLS, revocación, estados y cierres.
- **Salida:** PG17 limpio + migración repetida donde aplique + pruebas reales de integridad, roles y reversión.

### B2 — Confirmación H6 atómica y operaciones
- Refactorizar la confirmación **desde su punto de entrada**: QR vigente, mesa operativa, visita/identidad, bloqueo de cuenta/concesión, persistencia del nuevo pedido y su ronda **en la misma cuenta**, consumo único y cambio de destino de tareas pendientes.
- Mantener idempotencia, agrupación, políticas de pago, Stripe y pedidos en origen. Actualizar consultas de cocina/sala, pickup, estados y SSE; preservar aislamiento por cuenta.
- Componer SQL permitido en `role-scoped-postgres` y superficie exacta de `h6-sql-preflight`; no bypass.
- **Salida:** PG17 real con carreras simultáneas, rollback forzado, reintentos y pagos en curso, sin doble cuenta ni duplicados.

### B3 — API, PWA cliente y sala, y conformidad visual
- Conectar solicitud, estado/cuenta atrás, aprobación/rechazo y notificaciones durables, con texto exacto del contrato; no campo motivo ni destino en solicitud.
- Implementar aviso por QR ajeno, cancelar aviso sin efectos, escaneos múltiples, continuidad de pedidos/pagos en origen, concesión no consumida hasta confirmar en destino.
- Integrar sala autenticada y actualizaciones sin cruces de eventos; mantener diseño premium y flujos aprobados, responsive, accesibilidad y ES/EN donde sea normativo.
- **Salida:** E2E navegador real cliente + camarero + cocina y capturas/conformidad visual.

### B4 — Regresión global y candidatura de aceptación
- Repetir suites completas del repositorio, PG17 real y E2E; no solo pruebas nuevas. Inspeccionar GitHub Actions, logs y evidencias de ejecución.
- Corregir cualquier regresión y volver a ejecutar suites afectadas **y la regresión global** hasta verde.
- Actualizar documentación de arquitectura y cierre de hito con SHA, PR Draft, matriz de pruebas y resultados. **Sin merge ni despliegue**.
- **Salida:** evidencia verificable y dictamen GO/NO-GO por criterios de §4–§6.

## 4. Matriz final de aceptación funcional (obligatoria)

| ID | Escenario | Resultado exigido |
| --- | --- | --- |
| F01 | QR A/B/C antes de primer pedido | Escaneo ilimitado, sin cuenta vinculada ni deuda movida |
| F02 | Primera confirmación en A durante agrupación | Cuenta ligada a A desde confirmación, agrupación intacta |
| F03 | QR B con cuenta en A, cancelar aviso | Sin solicitud ni efecto operativo |
| F04 | Solicitud desde A | Sin destino, un registro auditable, aviso a sala |
| F05 | Doble toque/reintento/concurrencia de solicitud | Una sola solicitud; sin duplicados |
| F06 | Solicitud pendiente y pedido/pago en A | Operación normal de origen |
| F07 | Rechazo a los 20 s y nuevo intento a los 21 s | Bloqueado hasta fin de ventana; contador correcto, sin texto engañoso |
| F08 | Caducidad exacta en servidor y decisión tardía | No aprobar/rechazar al límite o después; sin cambio |
| F09 | Aprobación dentro de ventana | Mensaje normativo exacto, sin destino ni traslado |
| F10 | Rechazo dentro de ventana | Mensaje normativo exacto, sin motivo |
| F11 | Aprobado, múltiples QR y ningún pedido nuevo | Cuenta y entregas siguen en A, permiso disponible |
| F12 | Aprobado, pedido nuevo en B | Transferencia única y atómica al confirmar; cuenta original conservada |
| F13 | Segundo pedido en C sin nuevo permiso | Rechazado; sin transferencia |
| F14 | Aprobado pero pedido adicional en A | Operación en A, permiso no consumido |
| F15 | Permiso aprobado sin uso tras 90 s | Sigue válido, sin traslado automático |
| F16 | Cuenta cerrada / sesión revocada / permiso revocado | No puede consumirse; sin fuga de acceso |
| F17 | QR revocado, mesa bloqueada o no operativa en confirmación | Rechazo sin consumo ni efecto parcial |
| F18 | Dos comensales en A; uno va a B con otros comensales | Cuentas separadas, sin mezclar pedidos, saldos ni eventos |
| F19 | Entregas preparando/listas/recogidas | Pendientes apuntan a B; recogidas/histórico conservan origen y estado |
| F20 | Pagos parciales, Stripe pendiente, efectivo y reintentos | Sin doble cobro ni saldo alterado; misma cuenta |
| F21 | Ventana de agrupación activa | No reiniciar plazo ni reexpedir rondas históricas |
| F22 | Dos confirmaciones simultáneas B/C con una concesión | Solo un consumo y un destino; la otra no transfiere |
| F23 | Rollback forzado después de preparar traslado | Ni pedido, ni concesión, ni cuenta, ni destinos quedan parcialmente modificados |
| F24 | Idempotencia: replay del pedido que trasladó | Misma respuesta/cuenta/destino, sin segundo traslado |
| F25 | Eventos SSE cliente/sala/cocina y reconexión | Actualización correcta, sin eventos cruzados ni duplicados |
| F26 | Personal sin rol o sesión caducada | Decisión denegada y sin escritura |
| F27 | Trazabilidad | Actor, origen, decisión, marcas, destino y pedido consumidor; sin motivo |
| F28 | UI móvil/escritorio, accesibilidad, diseño aprobado | Flujos completos, sin desviación visual ni bloqueo de interacción |

## 5. Matriz técnica de regresión y evidencia requerida

| Grupo | Prueba | Evidencia exigida |
| --- | --- | --- |
| R01 | Migraciones desde esquema limpio PG17 y reejecución segura donde aplique | Log PG17, versión, SHA y aserciones SQL |
| R02 | Constraints, FK, unicidad, RLS, roles mínimos, `SECURITY DEFINER`, allowlist, preflight | SQL de pruebas negativas y positivas |
| R03 | Carreras: solicitud, decisión al vencimiento, doble confirmación, cierre/revocación y pagos | Ejecución concurrente real y ausencia de deadlocks/inconsistencias |
| R04 | Atomicidad: fallo inyectado en cada fase y rollback | Estado antes/después en tablas relacionadas |
| R05 | Contabilidad: saldo, Stripe, efectivo, refund, idempotencia | Comparación exacta de account_id e importes |
| R06 | Operativa: pedidos, cocina, sala, pickup, entrega, agrupación | Consultas de estados y destino antes/después |
| R07 | SSE, aislamiento multiusuario, replay y reconexión | Pruebas de eventos sin contaminación |
| R08 | API HTTP autenticada y permisos cliente/camarero/admin | Respuestas esperadas y no filtración de datos |
| R09 | Playwright E2E PWA cliente y operativa, responsive, axe y capturas | Reporte, trazas y conformidad con identidad visual |
| R10 | **Regresión global** Node/gestión/PG17/Playwright/CI del repositorio | Comandos exactos, número total, 0 fallos, URLs de Actions y SHA |

**No aceptar** mocks como sustituto de R01–R09; son complementarios. Los comandos se tomarán de los scripts y workflows reales del repositorio al ejecutar, sin inventar cifras. Pruebas fallidas, omitidas sin justificación o no ejecutadas implican NO-GO.

## 6. Dictamen final y registro de resultados

Completar **solo tras ejecutar**; no marcar casillas por tener código o tests escritos.

- [ ] B0 inventario y contratos verificados
- [ ] B1 PG17 nativo e integridad demostrada
- [ ] B2 confirmación H6, pagos y entregas atómicas
- [ ] B3 PWA cliente/sala/cocina y visual aprobado
- [ ] B4 regresión global y CI sin fallos
- [ ] F01–F28 con evidencia individual
- [ ] R01–R10 con evidencia verificable
- [ ] Auditoría de seguridad, concurrencia y ausencia de regresiones
- [ ] Documentación normativa/técnica actualizada sin contradicciones
- [ ] Revisión independiente y autorización de cualquier acción de producción

**Resultado actual: NO-GO.** Existe un recorrido integrado parcial verificado en PostgreSQL 17 y Chromium, pero no certificación integral de F01–F28/R01–R10 ni activación completa del cambio de mesa. No se ha autorizado despliegue.

### Plantilla de acta de cierre

```text
Fecha:
Rama / SHA / PR Draft:
Normativa verificada (rutas y revisiones):
Migraciones PG17 aplicadas (entorno aislado):
Pruebas F01–F28: [IDs + evidencias]
Pruebas R01–R10: [comando, total, aprobadas, fallidas, omitidas, duración]
CI: [enlaces a ejecuciones y conclusión]
Hallazgos y correcciones:
Revisión de seguridad:
Dictamen: GO / NO-GO
Alcance de GO: candidato de código, nunca autorización implícita de despliegue
```

## 7. Evidencia intermedia verificable: recorrido integrado A→B (2026-11-02)

**Esta sección es un registro de ejecución, no una modificación ni relajación de la matriz F01–F28/R01–R10.** En la rama del PR #43 Draft, SHA `4229ee7091e3a1d8495b43ae184f720e81919514`, los cuatro workflows terminaron SUCCESS: [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/41441324253), [bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41441324189), [Chromium gestión](https://github.com/jdlc86/CartaViva/actions/runs/41441324434) y [navegador cliente](https://github.com/jdlc86/CartaViva/actions/runs/41441324195).

La prueba **única e integrada** `PG17 B3 six isolated logins complete PWA customer A to waiter to economic B journey` terminó PASS: seis identidades SQL reales de privilegios mínimos en PostgreSQL 17 desechable; solicitud A, lectura de pendientes y decisión de camarero por la PWA React ejecutada en Chromium conectada al mismo Fastify real/PG17 (el adaptador de identidad HTTP del arnés es de prueba); confirmación de un pedido en B mediante transporte real de cliente y Fastify; `account_id` inmutable, saldo de 2400→3100 céntimos, origen histórico A intacto, redirección exclusiva de la entrega pendiente a B, concesión consumida una vez y replay sin ronda duplicada. También se ejecutaron las negativas de sala/cocina y privilegios SQL y el logout visual. El fallo de aislamiento por dos GET React StrictMode quedó corregido usando el pool físico de lector, sin ampliar privilegios.

**No acreditado todavía en este SHA histórico:** navegador real del cliente en el mismo SQL; verificador JWT real completo en vez del adaptador HTTP de CI; solicitud de cambio desde la UI cliente y sus mensajes normativos; pagos Stripe/efectivo, SSE durables, revocación/cierre, concurrencia económica exhaustiva y revisión visual final F28; cierre individual de F01–F28/R01–R10. El recorrido de navegador cliente queda abordado en la evidencia posterior. La bandeja y composición B3 siguen opt-in, sin activación operativa. **B3 NO-GO.**

La revisión siguiente incorpora **capturas Chromium de datos PG17 reales** en el artefacto H6 para pantallas móvil/escritorio; solo se marcarán como evidencias ejecutadas cuando su commit supere CI. No hay autorización de merge, despliegue, uso del VPS o Supabase operativo ni intervención en Fleetia.

## 8. Hito integral acreditado: las dos PWA, Fastify y PostgreSQL 17 en el mismo traslado (2026-11-02)

**SHA `884399bbf6863a88a8167315b48fabf15a706e9b` — cuatro workflows SUCCESS.** [CI](https://github.com/jdlc86/CartaViva/actions/runs/41443383622), [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41443383594), [navegador gestión](https://github.com/jdlc86/CartaViva/actions/runs/41443383890), [navegador cliente](https://github.com/jdlc86/CartaViva/actions/runs/41443383933).

Se amplió **el mismo recorrido integrado de seis logins físicos PostgreSQL 17**, sin introducir micropruebas como unidad de avance. Solicitud A y decisión por la PWA de gestión en Chromium; entrada al QR de B en la **PWA cliente React real** con eliminación del token de la URL, visita, revalidación/cotización y pedido `pay_at_end` desde Chromium contra Fastify y funciones SQL del mismo PG17 desechable; transferencia económica diferida a B, saldo 2400→3100 céntimos sobre la misma cuenta, histórico A inalterado, entrega pendiente a B sin modificar la recogida, autorización consumida y replay del mismo pedido sin ronda duplicada. Evidencias gráficas en el artefacto `sabora-h6-acceptance`: `b3-customer-pg17-qr-mobile.png`, `b3-customer-pg17-confirmed-mobile.png`, `b3-customer-pg17-confirmed-desktop.png`, más la bandeja PG17 de gestión.

**Límites explícitos de la prueba:** el endpoint de **presentación del catálogo** y el **adaptador de identidad HTTP/cookie** son fixtures del arnés; la revalidación de pedido/QR/visita, el traslado y la cuenta sí utilizan PostgreSQL 17 real. La solicitud inicial sigue inducida por HTTP y no por un flujo completo de solicitud/seguimiento en la PWA cliente. **No se ha certificado** verificación JWT productiva, notificaciones normativas, vencimiento 90 s completo en navegador, pagos Stripe/efectivo, SSE real, cuentas de varios comensales, concurrencia económica y rollback exhaustivos, conformidad visual final aprobada ni cada caso F01–F28/R01–R10 por separado. B3 sigue **NO-GO**; la composición continúa opt-in. Sin merge, despliegue ni acceso a VPS/Fleetia/Supabase operativo.

## 9. Hito integrado verificado: advertencia y solicitud desde cliente hasta pago diferido en B (2026-11-02)

**SHA `a9c6ecd6cb833ded918806d807d6d97341e2ee91` — cuatro workflows SUCCESS:** [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/41451222328), [bootstrap y PG17](https://github.com/jdlc86/CartaViva/actions/runs/41451222411), [navegador de cliente](https://github.com/jdlc86/CartaViva/actions/runs/41451222360) y [navegador de gestión](https://github.com/jdlc86/CartaViva/actions/runs/41451222490). La batería específica PG17 ejecutó **51/51** y la aceptación H6 terminó PASS en bloques 1, 2A y 2B.

**Recorrido ejecutado en una única prueba integradora real:** cuenta activa en A → cliente escanea QR B en la PWA React Chromium → consulta de estado mediante función SECURITY DEFINER con capacidad SQL restringida → aviso «Solicitar cambio de mesa / Cancelar» → cancelar sin crear solicitud ni alterar cuenta → segundo escaneo y solicitud desde la **interfaz cliente real** con payload `{}`, sin mesa destino → bandeja React de gestión lee datos de la misma base PG17 y el camarero aprueba → escaneo y autorización técnica en B sin traslado inmediato → el cliente confirma en B desde Chromium contra el mismo Fastify y PG17 desechable → misma cuenta y saldo 2400→3100 céntimos, pedido histórico permanece en A, entrega pendiente se redirige a B, estado `consumed` y replay idempotente. Capturas móvil/escritorio del diálogo/solicitud del cliente agregadas al artefacto H6. El nuevo GET de estado utiliza una función sellada con el conjunto exacto de dos RPC en el rol cliente: sin SELECT directo sobre relaciones.

**Límite de activación:** nuevo estado/advertencia de cliente `enableTableChangeFlow` exclusivamente opt-in en la composición de pruebas PG17; la PWA productiva H6 no requiere todavía este endpoint. La identidad HTTP/cookie y la presentación de catálogo conservan fixtures explícitos; las autorizaciones SQL y las mutaciones económicas se verifican con PostgreSQL 17 real.

**No es aceptación integral B3:** permanecen sin acreditar notificación automática durable al cliente en aprobación/rechazo, vencimiento exacto de 90 s y cooldown bajo reconexión, carreras de solicitud/decisión/cierre, multi-comensal, pagos parciales/Stripe/efectivo, SSE y cocina/sala con eventos, revocación, rollback/concurrencia económica exhaustiva, conformidad visual final aprobada y matriz completa F01–F28/R01–R10 por escenario. El test del cliente conectado no sustituye el proveedor real de identidad ni justifica activar la característica. **NO-GO, PR #43 Draft; sin merge, despliegue, VPS, Fleetia o Supabase operativo.**


## 10. Evidencia integrada de respuestas automáticas y ventana de solicitud (2026-11-02)

**Estado: evidencia intermedia real; no altera ni completa la aceptación F01–F28/R01–R10.** Commit de ejecución `5e72bdf8092156dd7e811b047858c2b61f0ca447` en el PR #43 Draft, cuatro workflows terminados `SUCCESS`: [H6 CI](https://github.com/jdlc86/CartaViva/actions/runs/41479983458), [bootstrap/PG17](https://github.com/jdlc86/CartaViva/actions/runs/41479983452), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41479983359) y [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41479983656).

**Implementado en composición opt-in (no en producción):** migración candidata `20261102170000_sabora_h6_table_change_committed_notification_candidate.sql` con señales `pg_notify` sin datos de cliente; lector autorizado `read_customer_table_change_h6_candidate` existente como fuente de verdad, escucha `LISTEN` bajo login SQL comprobado, SSE autenticado y receptor EventSource de la PWA cliente con nueva lectura de estado en apertura/reconexión. No se concedieron permisos de datos genéricos ni se aplicaron migraciones operativas. Cada evento lleva únicamente el estado proyectado tras validar la sesión del comensal; no se utiliza un `NOTIFY` como dato de negocio, ni polling periódico.

**Ejecución y observación:** la prueba integradora principal de PostgreSQL 17 desechable ejecuta el recorrido de PWA cliente y PWA gestión React reales en Chromium, el mismo Fastify y seis logins SQL físicos con capacidades segregadas. Comprueba aviso y cancelación de escaneo de B sin solicitud; petición sin destino desde cliente; aprobación desde la interfaz de camarero con respuesta automática SSE al cliente; recuperación del aviso aprobado al recargar; confirmación real de pedido en B, `account_id` constante, saldo 2400→3100 céntimos, origen A histórico inmutable, redirección de entrega pendiente y replay idempotente. Tras el traslado, el arnés adelanta **solo los timestamps de la petición ya consumida** en el PostgreSQL 17 desechable para permitir un nuevo intento de cambio: cliente solicita desde B, camarero **rechaza desde la PWA de gestión**, cliente recibe el texto normativo automáticamente por SSE (sin GET manual), la cuenta conserva 3100 céntimos y reintentar durante la ventana devuelve 409. El arnés simula luego vencimiento ajustando los timestamps de la petición rechazada: la proyección SQL y la PWA liberan de nuevo la solicitud, que sigue sin trasladar consumo. El arnés retira al estado expirado la última solicitud de prueba para no contaminar otras verificaciones del mismo PG17. Capturas en el artefacto `sabora-h6-acceptance`: `b3-customer-pg17-auto-approved-mobile.png`, `b3-customer-pg17-auto-approved-reconnected-mobile.png`, `b3-customer-pg17-auto-rejected-mobile.png` y las capturas anteriores del pedido/gestión.

**Interpretación estricta de matriz:** hay evidencia parcial favorable de F03–F05, F09–F12, F24 y del bloqueo/reapertura de F07/F08 (con reloj simulado) y transporte cliente de F25/R07–R09. **No se marca ningún F/R como aceptado en su totalidad** sin su propia evidencia de todas las variantes normativas; la prueba no reproduce literalmente los 20/21 segundos, la carrera de expiración exacta ni la entrega de un rechazo después de 90 s de desconexión real. La simulación temporal no sustituye a la prueba del vencimiento natural con concurrencia y revocación. El endpoint de catálogo y la identidad/cookie de HTTP siguen teniendo fixtures del arnés, no la composición productiva final. Permanecen pendientes pagos Stripe/efectivo y conciliación, varios comensales y cuentas, cierre/revocación/QR rotado, SSE de cocina/sala y aislamiento de eventos, rollback/concurrencia económica y conformidad visual de baselines aprobados. Se mantiene **B3/B4 NO-GO**, sin merge ni despliegue, sin afectar al VPS, Fleetia o Supabase operativo.


## 11. Evidencia integrada de recuperación durable tras desconexión (2026-11-02)

**SHA ejecutado `a1ce0c03c269bf6b650c6d0e04c351f80b74112f` — 4/4 workflows SUCCESS:** [H6 CI](https://github.com/jdlc86/CartaViva/actions/runs/41518098392), [bootstrap y migraciones PostgreSQL 17](https://github.com/jdlc86/CartaViva/actions/runs/41518098403), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41518098357) y [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41518098510). Los bloques H6 1 (contratos), 2A (migraciones/privilegios PG17 aislado) y 2B (identidades, HMAC, concurrencia, ambas PWA y Fastify) finalizaron PASS. **Estado B3/B4: NO-GO**; éxito de este recorrido no constituye aceptación funcional de la matriz completa.

**Implementación candidata, sin activación:** migración `20261102180000_sabora_h6_table_change_durable_outbox_candidate.sql`, que proyecta aprobaciones y rechazos al **outbox append-only H6 existente**, en la transacción de decisión SQL, con idempotencia por transición y notificación `NOTIFY` sin payload de negocio. El lector `read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)` verifica la sesión no revocada, resuelve la única cuenta abierta del cliente y proyecta solo eventos de esa cuenta con cursor/indicador de resincronización; no acepta ID de cuenta, cliente o mesa facilitado por navegador. Superficie F12 de cliente restringida a tres funciones SQL exactas, con login físico NOINHERIT y sin privilegios SELECT directos. La API emite snapshot autorizado y replay de decisiones por SSE con `id` y `Last-Event-ID`; la PWA conserva el cursor por identidad pública, deduplica eventos y no vuelve a anunciar una autorización ya consumida solo porque exista un evento antiguo. Corregidos validadores UUID de API y PWA para la forma canónica de cinco grupos, sin omitir las verificaciones de origen, tipo, versión o sesión.

**Prueba integral observada:** un único recorrido con seis logins SQL independientes, PostgreSQL 17 desechable, Fastify real y dos PWA React Chromium: cliente QR A→B, cancelar aviso, solicitar sin destino, aprobación por camarero, respuesta SSE automática, transferencia diferida a la confirmación del pedido en B con misma cuenta y saldo 2400→3100 céntimos, histórico A conservado, entrega pendiente redirigida y replay de pedido sin duplicar ronda. El navegador que **ya recibió** aprobación recarga, recupera estado `approved` por SSE con su cursor guardado **sin notificación duplicada**. En la siguiente solicitud, un segundo navegador de cliente abre su canal, conserva el cursor del evento anterior y se cierra **antes** del rechazo del camarero; tras un vencimiento simulado únicamente en timestamps de PG17, vuelve a abrirse y recibe el rechazo desde el outbox aunque la instantánea actual ya no muestre `rejected`. El mismo recorrido valida rechazo con texto normativo mientras conectado, bloqueo de nuevo intento durante la ventana, aprobación/rechazo tardío denegados, dos solicitudes concurrentes tras expiración con un único registro activo, revocación de sesión con canal abierto y rechazo de nuevas operaciones. El artefacto de aceptación incluye capturas del rechazo recuperado y del estado aprobado reconectado.

**Alcance y límites estrictos:** prueba de desconexión real del segundo navegador y recuperación por cursor, pero **el tiempo de vencimiento se simuló** cambiando únicamente fechas de la base efímera; no se ha medido el límite natural exacto 90 s ni los casos literales F07 (20/21 s) y F08 (carrera en instante de vencimiento). Tampoco se certifican todavía huecos/expiración de cursor, pérdida y reconexión de conexión al propio servidor/instancia, operación después de 7 días de retención, eventos multi-comensal entre cuentas, pagos Stripe/efectivo y refund parcial, QR rotado/mesa bloqueada, cierre de cuenta, roles y verificador JWT productivos, cocina/sala SSE integral, rollback económico forzado bajo todas las carreras, ni conformidad visual final contra todos los baselines. La identidad HTTP y presentación de catálogo siguen siendo fixtures de CI y la composición B3 permanece **opt-in aislada**. Esta evidencia mejora los casos relacionados con F07–F12/F16/F24/F25 y R07–R09, pero **no marca ninguna fila F/R como completamente aceptada por inferencia**. Sin merge, despliegue, migraciones operativas, VPS, Fleetia ni Supabase operativo.


## 12. Evidencia integrada F18: convivencia y pedidos de tres comensales en A/B (2026-11-02)

**Commit de ejecución `d8852114fd141301a7246780f91a5fe44dbaf9ca`: 4/4 workflows SUCCESS.** [H6 CI](https://github.com/jdlc86/CartaViva/actions/runs/41524366119) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41524366376) · [navegador cliente](https://github.com/jdlc86/CartaViva/actions/runs/41524366047) · [navegador gestión](https://github.com/jdlc86/CartaViva/actions/runs/41524366063). El log de H6 CI registra PASS de Block 1 (contratos), Block 2A (migraciones/privilegios PostgreSQL 17) y Block 2B (PG17 real, HMAC, concurrencia y E2E Chromium). **Mismo escenario integrador existente** `scripts/ci/table-change-root-postgres17.test.mjs`, ampliado de extremo a extremo en vez de crear pruebas pequeñas independientes.

**Recorrido y datos observados:** tres identidades independientes, cada una con sesión HttpOnly, visita autorizada, `customer_id`, `account_id`, pedido y ronda histórica y saldo inicial. Dos comensales en A; uno solicita cambio sin mesa de destino y recibe aprobación desde la PWA de gestión en Chromium; el otro permanece en A. B ya contiene un tercer comensal con su propia cuenta. El primer cliente confirma un pedido en B y consume una sola vez la autorización; los otros **dos clientes** abren sus PWA reales en Chromium, reescanean su propia mesa y confirman **sus propios pedidos** de 700 céntimos contra el mismo Fastify + PG17 con los roles de capacidades mínimas. Se verifican tres cuentas **sin duplicación**, `account_id` del trasladado estable, tres clientes propietarios diferentes, origen de los pedidos históricos y destino de las entregas de los comensales no trasladados intactos, saldos separados: **A→B: 2400→3100; segundo comensal en A: 1800→2500; tercero en B: 2500→3200 céntimos**. En el propio momento de decisión, ambos usuarios ajenos mantienen EventSource de la PWA, reciben su estado autorizado `bound` y **no reciben** evento de aprobación/rechazo de la otra cuenta; el lector sellado PostgreSQL para ambos devuelve historial de decisiones vacío. Las capturas se guardan en el artefacto H6 como `b3-f18-codiner-a-confirmed-mobile.png` y `b3-f18-codiner-b-confirmed-mobile.png`.

**Error de dominio detectado y corregido dentro del mismo hito:** la función `sabora.confirm_customer_round_h6_transfer_integration_candidate` rechazaba una confirmación legítima en **la misma mesa y sesión** después de una autorización QR renovada, comparando erróneamente `b.visit_key` histórica con `p_visit_key` actual; la PWA obtenía 409 `table_change_confirmation_conflict`. Se introdujo `supabase/migrations/20261102200000_sabora_h6_same_table_rescan_binding_candidate.sql` sin reescribir migraciones anteriores: guardia explícita de deriva para sustituir **solo** la comparación del visit_key histórico en el caso sin transferencia. Se sigue comprobando la sesión/mesa operativa vigente y la visita actual, se conserva la vinculación previa de la cuenta y la autorización aprobada no se consume al pedir en la misma mesa. Se revisó el registro de auditoría `scripts/ci/migration-audit.mjs`. No hay grant operativo nuevo ni cambio de la función productiva H6.

**Interpretación F/R y límites:** recorrido principal de **F18 acreditado en entorno de integración aislado**, con cobertura adicional de la continuidad de pedidos en origen (F06), de reescaneo en la propia mesa con permiso no consumido (F14 como mecanismo, pendiente variante con concesión todavía aprobada) y de aislamiento de decisiones SSE entre comensales (parte de F25/R07). **No extrapolar a aceptación integral** de F14, F18 con todas las variantes de pagos/entregas/estados, F25 ni R07: siguen pendientes Stripe y pagos parciales/efectivo, cocina/sala y recogidas, reconexión multiusuario y persistencia más allá de la retención, races de doble confirmación B/C, revocación/rotación QR y mesa bloqueada, identidad HTTP/catálogo productivos, reloj natural exacto 90 s y conformidad visual final con identidad aprobada. **B3/B4 NO-GO**; código y migración candidatos opt-in, sin merge ni despliegue ni interacción con Fleetia, VPS o Supabase operativo.


## 13. Evidencia integrada F17 parcial: destino cerrado, permiso conservado y continuidad de tres cuentas (2026-11-02)

**Commit validado `f4286a8c7e6468ab50448b575d5c6fd06ab37792`: cuatro workflows SUCCESS.** [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/41531115933) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41531115941) · [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41531116172) · [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41531116053). La aceptación H6 integrada, los permisos de PG17 y la regresión visual de ambas PWA terminaron PASS.

**Recorrido único y observable:** sobre la misma autorización A→B ya aprobada, tres cuentas independientes y los mismos Fastify/PG17/Chromium de F18, el cliente escanea un **tercer destino C cerrado** y pulsa «Continuar con la mesa escaneada». La petición HTTP auténtica `POST /api/v1/customer/visits` es denegada (HTTP 4xx); la cuenta sigue vinculada a A, la solicitud continúa `approved`, el saldo sigue en **2.400 céntimos** y no se crea ronda. La mesa C se restaura **solo en el PostgreSQL 17 desechable** y el cliente prosigue con su QR autorizado en B, confirmando el pedido y transfiriendo su cuenta una sola vez. Los dos comensales ajenos continúan en A y B, respectivamente, y confirman sus propios pedidos en sus cuentas, sin mezcla de saldo, historial o eventos. Se mantienen las comprobaciones integradas previas de rechazo, replay durable, revocación de sesión y carreras.

**Diagnóstico real del escenario:** la primera ejecución cerró y reabrió B, lo que regeneró su sesión operativa y, correctamente, invalidó el vínculo de un comensal que ya consumía allí. Se corrigió el **arnés integrado** para usar C, un destino independiente sin comensales, en vez de manipular la sesión de B y atribuir la regresión a la lógica de transferencia. No se relajaron validaciones de producto ni se cambiaron funciones SQL productivas.

**Criterio de aceptación:** evidencia positiva **parcial** de F17 para el bloqueo antes de la autorización de visita. **No se certifica todavía** F17 completo: falta comprobar la mesa bloqueada/QR revocado **después de obtener una visita válida y justo antes de confirmar**, con reversión de pedido, cuenta, permiso y destinos en la misma transacción; también falta carrera concurrente de revocación. El caso no sustituye las restantes variantes F/R, ni cierra B3/B4. Composición candidata opt-in, sin merge, despliegue, migración operativa, VPS, Fleetia ni Supabase operativo.
