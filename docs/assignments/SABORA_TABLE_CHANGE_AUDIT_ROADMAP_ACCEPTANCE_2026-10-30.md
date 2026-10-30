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

**Resultado actual: NO-GO.** No hay certificación PG17/E2E ni integración completa del cambio de mesa. No se ha autorizado despliegue.

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
