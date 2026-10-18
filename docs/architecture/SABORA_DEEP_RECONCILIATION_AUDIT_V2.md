# Sabora — auditoría profunda de conciliación V2

Fecha: 18-10-2026. Estado: **hallazgos verificados en los archivos consultados; sin certificación de repositorio completo ni de ejecución de tests**.

## Alcance y evidencias

Contrastados: `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`, `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`, `docs/design/brand/SABORA_BRAND_V1.md`, `src/domain/catalog-order-domain.mjs` y `src/domain/catalog-order-domain.test.mjs`. No se ha acreditado inventario completo, ejecución de pruebas, API, DB ni integración Stripe. Jerarquía: decisiones explícitas más recientes > contrato canónico > propuestas antiguas > fixture.

## Hallazgos priorizados

### P1-01 — Cancelación por cocina y cobro en caja no están conciliados
La regla «cocinero siempre arbitraje» convive con «incidencias de pagar al terminar se resuelven fuera de la app». Debe distinguirse arbitraje **operativo** de devolución **digital**: para caja, registrar incidencia y resolución del responsable en Sabora, pero liquidación económica presencial fuera de la app. No lanzar reembolso Stripe para cuenta de caja. Falta definir si «fuera de la app» incluye la aprobación o solo el ajuste/cobro presencial. **Decisión pendiente**, no inferir.

### P1-02 — Cambio de política de mesa durante sesión de caja
La mesa puede exigir pago por pedido y una sesión existente puede estar bloqueada en «pagar al terminar». El contrato prohíbe convertirla automáticamente, pero no define cómo continuar: congelar política de sesión, liquidar saldo antes de cambiar o impedir nuevas rondas. Sin regla, riesgo de pedidos sin cobrar. **Pendiente de decisión**.

### P1-03 — Captura Stripe y entrega a cocina: orden y recuperación
«Capturar al enviar» no es una transacción atómica con el sistema de cocina. Debe existir máquina de estados durable (autorizado, captura solicitada, capturado, despacho solicitado, confirmado en cocina, fallo/reconciliación), idempotencia por revisión y registro del acuse de cocina. Falla captura: no despachar. Captura confirmada y despacho fallido: no recapturar; reintentar entrega idempotente o gestionar reversión. La frase «llegó a cocina» exige un acuse verificable, no solo emisión del evento. **Diseño y pruebas pendientes**.

### P1-04 — Arbitraje de cocina versus reintegro obligatorio
El usuario estableció: camarero/restaurante sin arbitraje y reintegro; cocina siempre arbitraje. La revisión de cocina no debe permitir negar el importe de un servicio imposible/no prestado. Diferenciar verificación de hechos y cálculo del importe de una facultad discrecional de denegar devolución. El contrato lo explica en sección tardía, pero una sección previa aún sugiere devolución íntegra/parcial/ninguna sin delimitar causas. **Contradicción de lectura documental**.

### P1-05 — Validación de opciones del catálogo incompleta en el módulo de dominio
`detectIncidents` solo comprueba si un optionId existe, está publicado y disponible globalmente. No comprueba pertenencia de la opción al plato/grupo, límites de selección, ámbito del restaurante, ni precio final. Un cliente manipulado podría usar una opción disponible pero no permitida para su plato. **Fallo de contrato en código ilustrativo; no asumir protección de API**.

### P1-06 — Revisión implementada como «reemplaza pedido», no como revisión del mismo pedido
`prepareImmediateResubmission` devuelve `replacesOrderId`, sin `orderId` estable + `revisionNumber` + `revisionId` ni identidad de comanda. La función no materializa el modelo de revisión explícitamente aprobado. Además no integra la nueva autorización Stripe al cambio de importe. **Desalineación de código puro y contrato**.

### P1-07 — Seguridad y pertenencia de sesión/mesa/pagador sin definir
No existe en el código inspeccionado un contrato verificable de quién puede crear/corregir pedido, cambiar método de pago, cancelar o ver eventos de una mesa con varios comensales. Riesgos: divulgación de incidencias ajenas, dobles cobros y cambios de cuenta. **Diseño de identidad y autorización pendiente**.

### P2-08 — Precio cero versus importe final cero
El usuario dijo «si todos los platos valen cero», mientras la especificación derivó «importe final cero» incluso por descuentos. Pueden divergir: platos con precio positivo y cupón del 100 %, o extras positivos en plato gratuito. Se recomienda basar la operación financiera en **total final exigible = 0**, conservando explícitamente el caso de todos los platos gratuitos, pero requiere ratificación para cupones y extras. No cambiar regla sin aprobación.

### P2-09 — Primera selección de pago y siguientes rondas
«Pagar al terminar» fija modalidad de sesión. Para «Pagar ahora» el documento no aclara si se vuelve a ofrecer elección en cada ronda, ni cómo se impide que varios dispositivos creen modos contradictorios. **Pendiente de decisión**.

### P2-10 — Cancelación parcial y cuenta de caja
El contrato dice que incidencias de caja se resuelven fuera de la app y a la vez exige saldo correcto en Sabora. Hace falta definir si el empleado registra el ajuste económico en la app (sin procesar pago) y qué evidencia recibe caja; en ningún caso mantener línea cancelada como cobrable. **Precisar interfaz y auditoría**.

### P2-11 — Estado de publicación no equivale a disponibilidad
La lógica de categorías distingue correctamente categorías vacías, todos agotados y retirados; pero no está definida la edición de borradores frente a publicación automática. No asumir que guardar un plato implica publicarlo. La cuestión se planteó pero no quedó ratificada en la conversación. **Decisión abierta**.

### P2-12 — Vigencia de autorización y temporizador de agrupación
La ventana de cinco minutos y reenvíos inmediatos requieren controlar caducidad de autorizaciones, vencimientos programados y carreras con cambios de disponibilidad. El esquema no existe; el kernel solo devuelve un plan puro. **Pruebas de concurrencia pendientes**.

### P2-13 — Webhooks, eventos, push y reconexión
El contrato final prohíbe polling incluso desconectado, permite reintentos de canal SSE/WebSocket con backoff y recuperación puntual por cursor. Falta política de retención del cursor, deduplicación de webhooks Stripe y eventos, pérdida de cursor, expiración de sesión, revocación de permisos y fallback de resync único. **Diseño pendiente**.

### P2-14 — Documentación acumulativa con normas superadas
El documento V1 añade decisiones cronológicamente y mantiene frases anteriores incompatibles o ambiguas («proveedor no decidido» tras nombrar Stripe, aprobación configurable genérica frente a cocina siempre arbitraje, «reembolso» genérico frente a pago en caja). Debe crearse contrato normativo único y marcar antecedentes como históricos, no borrar trazabilidad. **Corrección documental recomendada**.

### P2-15 — Marca: encabezado V1 «no logotipo final» versus V3 aprobada
La guía de marca empieza con «prototipo... no logotipo final» y termina aprobando V3 como referencia oficial; puede inducir selección de assets obsoletos. Separar estado de composición aprobada de producción de assets (favicon/maskable/licencia) todavía pendiente. **Corrección documental recomendada**.

### P2-16 — Pruebas insuficientes para los flujos nuevos
Las seis pruebas del kernel cubren solo visibilidad, opción agotada, versión de catálogo, reenvío puro y push. No cubren Stripe, caja, cero euros, política por mesa, arbitraje, cancelación parcial, concurrencia, idempotencia de pagos, webhooks ni reconexión. No consta ejecución de CI. **No declarar integración implementada**.

## Matriz reconciliada de decisiones firmes

| Condición | Pago | Cancelación/incidencia |
| --- | --- | --- |
| Pedido gratuito, importe exigible 0 | Sin Stripe ni selección de método | Registrar incidencia si procede; no reembolsar importe no cobrado |
| Mesa normal, primer pedido con precio | Stripe «Pagar ahora» o «Pagar al terminar» | Según origen, motivo y modalidad |
| Stripe «Pagar ahora» | Autorizar al confirmar; capturar al despacho | Reembolso de lo capturado o liberación de autorización |
| «Pagar al terminar» | Acumular cuenta y liquidar en caja; sin Stripe | Resolución económica presencial; ajustar saldo y auditar |
| Mesa «Exigir pago conforme se pide» | No ofrecer «Pagar al terminar» para nuevos pedidos positivos | Respetar reglas de origen y reintegro |
| Camarero — solicitud cliente | Según configuración de aprobación | Devolución decidida conforme a política aplicable |
| Camarero — motivo restaurante | Sin arbitraje | Reintegrar importe afectado; medio depende de si hubo captura |
| Cocina — incidencia | Siempre arbitraje | Revisión obligatoria; reintegro debido por servicio no prestado |
| Pedido en agrupación invalidado | Revisión nueva mismo pedido; ajustar autorización si Stripe | Reenvío inmediato tras validación, sin segunda ventana |
| Comanda recibida en cocina | No cancelación directa desde PWA | Cliente avisa a camarero; flujo operativo distinto |

## Puertas antes de implementar pagos reales

1. Resolver P1-01 y P1-02 con el usuario; formalizar «fuera de la app» y cambio de política de mesa.
2. Elegir estados, IDs y transiciones para pedido/revisión/comanda/cuenta/autorización/captura/reembolso; versionar por mesa y sesión.
3. Validar capacidades concretas de Stripe: PaymentIntent manual capture, importe capturable, cancelación, expiración, webhooks, reembolsos y claves idempotentes; no prometer cambios de autorización no admitidos.
4. Definir límites y permisos de camarero/cocina/admin, especialmente reintegro sin arbitraje y solicitud cocina siempre revisada.
5. Construir pruebas de matriz, concurrencia, carreras de captura-despacho, reintentos, desconexión y cero polling.
6. Unificar contrato normativo y mantener histórico separado. Sin implementación, despliegue ni CI acreditados en esta auditoría.
