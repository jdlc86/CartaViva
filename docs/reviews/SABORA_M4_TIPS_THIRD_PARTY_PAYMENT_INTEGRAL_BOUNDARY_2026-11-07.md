# Sabora M4 — frontera integral de propinas y pagos de terceros (revisión de ingeniería, 2026-11-07)

> **Estado: REVISIÓN/CONTRATO DE IMPLEMENTACIÓN, SIN CÓDIGO FUNCIONAL DE ESTE BLOQUE, SIN PRUEBAS NUEVAS NI ACEPTACIÓN.** No es una norma nueva, no habilita cobros y no autoriza Stripe real, Supabase operativo, VPS, despliegue ni costes. Se documenta la frontera correcta antes de implementar un flujo económico peligroso mediante cambios aislados.

## 1. Fuentes normativas inalteradas

- [Contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md): §§ «Pagos», «Cancelación y ajuste económico», «Stripe: autorización, captura, fallos y recuperación», «Seguridad», «Dashboard informativo del restaurante» y escenarios de aceptación 5, 11, 48–55.
- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [requisitos visuales](../design/DESIGN_REQUIREMENTS_V1.md).
- [Seguimiento vivo M1–M6 / CV-008, CV-009, CV-013, CV-017](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [matriz H6 F20/R03–R05 y F28/R09](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), [auditoría de brechas económicas](SABORA_F20_R03_R05_INTEGRAL_PAYMENTS_CASH_GAP_REVIEW_2026-11-07.md).
- [Continuidad de sesión 28](../handoffs/SESSION_28_HANDOFF_2026-11-07.md) y [PR #49 Draft](https://github.com/jdlc86/CartaViva/pull/49). Las normas prevalecen sobre cualquier decisión técnica propuesta aquí.

## 2. Inspección del candidato actual y hallazgos decisivos

| Frontera inspeccionada | Realidad de código | Brecha frente a la norma |
| --- | --- | --- |
| `sabora.customer_accounts` y `sabora.cash_settlements` de `20261027122858_sabora_h6_events_payments_operations_candidate.sql` | Cuenta individual y recibo de efectivo con `account_id`, `actor_user_id` de **personal** y `correlation_id`; pago/refund de cuenta. | **No existe identificación/autorización verificable del pagador externo**, ni asignación de un mismo pago a N cuentas, ni componente de propina separado. El empleado que registra cobro **no es** necesariamente el pagador. |
| `sabora.payment_attempts` y `refund_attempts` | Un intento Stripe por ronda/cuenta, compensación y devolución asociada al intento/incident. | No existe una asignación de deuda pagada por tercero a método/cargo original con reintegro al verdadero pagador. |
| `apps/api/src/h6-operations-http.mjs`, `h6-operations-coordinator.mjs`, `h6-operations-repository.mjs` | Operaciones de caja por una cuenta con capability de empleado HMAC y cierre separado. | Añadir `payerId` a `settleCash` **sin consentimiento y vinculación de sesión del pagador** permitiría atribución fraudulenta. La ruta actual no satisface la autorización de tercero. |
| `apps/management/src/views/CashView.tsx` | Registro de efectivo individual, reintento idempotente y bloqueo de deuda Stripe incierta. | No hay operación de pago multi-cuenta ni desglose de propina elegido por cliente y confirmado por servidor. |
| `apps/client/src/components/CheckoutPanel.tsx` y `apps/client/src/App.tsx` | Modalidad fija por cuenta y confirmación de pedido con cotización del consumo. | **No** hay selección de propina 5 %, 10 %, 1 €, 2 €, 5 € o sin propina; no hay flujo limitado de pago de deuda ajena. **Cotización de pedido** y **liquidación de cuenta** no son el mismo evento. |
| `20261107160000_sabora_m3_finance_dashboard_candidate.sql` | Dashboard informativo ADMIN y captura/devolución registrada cuando la evidencia lo permite. | No debe atribuirse recaudación de propinas inexistentes ni duplicar ventas con pagos por tercero; necesita origen persistido independiente antes de añadir métricas. |

**Consecuencia:** implementar únicamente un selector visual de propina o un campo `payerId` en caja **no cierra el requisito** y crearía riesgo de cobro indebido, falta de devolución al pagador original y desinformación financiera. La arquitectura económica debe evolucionar conjuntamente; la UI y la aceptación humana se verifican contra DV.

## 3. Recorrido completo exigido para considerar el bloque candidato

1. **Autorización pagador:** cliente autenticado por cookie/sesión vigente, consentimiento explícito a pagar una o más cuentas y control de mesa/visita/restaurante. Ni QR ni identificador público de beneficiario bastan para leer detalles financieros, reclamar titularidad de cuenta o cancelar pedidos ajenos.
2. **Selección acotada de deuda:** exponer al pagador solo la lectura mínima imprescindible para seleccionar deuda concreta; no historial, PII ni facultades de editar cuentas de beneficiarios. Registrar asignación individual positiva en céntimos para cada cuenta y la identidad verificable del pagador; evitar cualquier confianza en importe enviado por cliente.
3. **Propina voluntaria:** opciones **exclusivas** `none`, `percent_5`, `percent_10`, `fixed_100`, `fixed_200`, `fixed_500`; ninguna positiva preseleccionada. Calcular siempre en servidor sobre consumo neto tras descuentos, sin incluir propinas, y mostrar consumo/descuentos/propina/total antes de confirmar. Definir técnicamente la regla de redondeo a céntimos y probar bordes; si requiere aceptación externa, dejarla pendiente, no improvisar importes.
4. **Intento durable previo al cobro:** identidad y clave idempotente estables, pagador, cuenta(s) beneficiaria(s), asignaciones, modalidad/método, importe de consumo y propina diferenciados, estado de reserva/resultado incierto; protección transaccional frente a pagos simultáneos, reintentos, cambios de mesa y devoluciones. No cerrar cuentas ni emitir cobro confirmado por crear una intención.
5. **Liquidación verificable:** para efectivo, confirmación autorizada del personal **después** de recibirlo, sin permitir colar deuda con Stripe incierto; para pago digital, comprobar Stripe sandbox auténtico con sus eventos y captura/reembolso idempotente y nunca duplicar un cargo o despacho. El transporte simulado solo acredita el código local, no proveedor externo.
6. **Efectos por beneficiario:** descontar de cada **cuenta original** su importe asignado, sin transferir titularidad de consumo ni cerrar automáticamente salvo contrato de cierre; emitir outbox/SSE al beneficiario **tras confirmación** con alcance autorizado y replay deduplicado. No revelar detalles financieros de otras cuentas.
7. **Reintegro:** una cancelación afecta exactamente la asignación vinculada; devolver al **pagador y método originales**. La propina no se reduce automáticamente por devolución del consumo; devolución expresa de propina exige autorización, idempotencia, importe pendiente no superado y registro separado. Nunca gestionar distribución a trabajadores dentro de Sabora.
8. **Informes y auditoría:** ventas netas sin propinas; cobros confirmados y devoluciones en su periodo acreditado, tip y reintegros en libro separado, sin doble contabilización de tercero/beneficiario. Registrar actor, consentimiento, referencias, motivo y correlación sin exposición de PII. No inventar fechas de Stripe anteriores.

## 4. Prueba **integradora única** que debe proteger la puerta de salida

La puerta no es una colección de tests diminutos. Extender la aceptación PG17/HTTP/Chromium **I49** del mismo candidato con este escenario indivisible y roles mínimos:

- A, B y C comensales de una misma visita, con deudas positivas separadas; A selecciona explícitamente importes de B y C y una de las seis opciones de propina; el servidor calcula y persiste todo en céntimos.
- Verificar denegación por QR solo, sesión expirada, otro restaurante/mesa/visita, manipulación de asignaciones e intento de consultar historial ajeno; ningún rol cocina/camarero accede a datos de pago que no corresponden.
- Concurrencia entre dos dispositivos y petición repetida: mismo intento, una única aplicación y un único cobro; cualquier incertidumbre Stripe bloquea el cobro en caja de la deuda reservada. A→B de mesa aprobado no cambia pagador ni cuenta beneficiaria.
- En efectivo, registro firmado de recepción física, reducción exclusivamente de saldos B/C y aviso durable; posterior cancelación parcial de B reintegra a A sin alterar deuda ni historial de C.
- Devolución de consumo **no** altera propina; devolución expresa de propina utiliza operación separada y auditada al pagador original; probar replay, importe superior al disponible y fallos parciales.
- Dashboard ADMIN refleja cobro **una vez**, separa propinas de ventas y nunca presenta autorización desconocida como recaudación. Contratos visuales y accesibilidad en cliente/gestión, 390/1440 px, más aprobación humana externa a la CI.
- Fallos funcionales implican **NO-GO**; no desactivar guardas, rebajar policies ni eliminar aserciones. Registrar SHA, cinco workflows, logs PostgreSQL 17 y resultado del proveedor empleado.

Pruebas unitarias focalizadas solo para invariantes críticas de precisión monetaria, HMAC/identidad e idempotencia, como complemento de la aceptación completa.

## 5. Orden de implementación para evitar un circuito económico falso

1. Inventariar en el **mismo SHA** los contratos de sesión/visita, cuentas/transferencia, SQL login mínimo y funciones H6/propinas existentes. Preparar una **nueva migración** compatible con PG17 y la política de migraciones del repo, preservando inmutabilidad histórica, FORCE RLS, NOLOGIN y grants por función. No modificar migraciones anteriores.
2. Incorporar **intención explícita de tercero, libro de asignaciones por cuenta y libro separado de propinas**; proteger restricciones transaccionales, autorización, idempotencia y origen del reembolso antes de conectar UI.
3. Conectar rutas cliente, personal, repositorios, gateway, PWA cliente y Caja a un mismo estado económico verificado. Respetar diseño y flujos aprobados; requerir revisión humana donde falte aceptación visual.
4. Incorporar el recorrido I49 completo y regresión actual H6/PG17/2 PWA. No cerrar el subalcance si falla un flujo o una denegación.
5. Completar la prueba de Stripe **sandbox remoto autorizado** y fiscal/laboral de propinas; si no hay credenciales/aceptación, marcar **CANDIDATO LOCAL / F20 PARCIAL**, no `CERRADO`. Actualizar tablero, matriz y continuidad solo al alcanzar hitos verificables.

## 6. Decisión factual a la fecha de esta revisión

**No se ha introducido ningún cobro, campo de pagador, propina, migración o UI de este bloque. No se ha ejecutado una prueba nueva.** La revisión confirma que el flujo no puede implementarse de forma segura como simple ampliación de `settleCash`, `CheckoutPanel` o `CashView` de manera independiente. El próximo cambio funcional debe incluir **intención de pagador autenticado + asignaciones durables + origen de refund + propina separada + integración cliente/API/PG17/gestión**, con rechazo seguro de los demás estados.

**GO técnico solo para desarrollar en entorno de pruebas aislado; producción NO-GO.** Ningún acceso ni cambio a Fleetia, VPS, Supabase operativo o Stripe live.
