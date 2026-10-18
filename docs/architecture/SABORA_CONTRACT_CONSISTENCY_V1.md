# Sabora — auditoría de coherencia y contrato de interpretación V1

Fecha: 18-10-2026. Estado: **auditoría parcial verificable**, sobre los archivos consultados de la rama por defecto; no equivale a inventario exhaustivo del repositorio.

## 1. Fuentes y jerarquía

- [Pantalla y reglas](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md): decisiones funcionales del cliente.
- [Identidad](../design/brand/SABORA_BRAND_V1.md): Sabora V3 es la opción visual vigente; SVG anteriores son históricos.
- [Prototipo HTML](../design/references/sabora-client-home-v1.html): demostración local con fixtures, no cliente conectado a producción.
- [Módulo de dominio](../../src/domain/catalog-order-domain.mjs): funciones puras de ejemplo, no persistencia ni transacciones.
- Ante contradicción: decisión expresa del usuario > regla derivada coherente > propuesta técnica > fixture visual. Una decisión posterior sustituye a la anterior solo cuando trata el mismo punto; conservar trazabilidad.

## 2. Decisiones cerradas — obligatorias

**Publicación y disponibilidad.** Solo categorías publicadas con al menos un plato publicado/no retirado aparecen en la carta; si todos sus platos están agotados, la categoría sigue visible. Plato publicado agotado: visible, distintivo «Agotado», no seleccionable. Plato retirado/no publicado: oculto. «Todos» es filtro virtual, no categoría persistente. Orden y nombres de categorías provienen de gestión/API, no de constantes del frontend. El estado de un ingrediente/opción se valida además del estado del plato.

**Integridad de la selección.** Ningún cambio de cocina elimina o sustituye silenciosamente una selección existente. La cesta inválida conserva lo elegido y requiere corrección explícita; la confirmación se bloquea y el servidor revalida incluso si la notificación no llega.

**Pedido confirmado todavía sin despachar.** Se conserva el original y se impide que la versión obsoleta salga a cocina. El cliente recupera los datos originales, ve incidencia y corrige. Botón «Reenviar pedido». La versión corregida se despacha inmediatamente, sin una nueva ventana de agrupación. No duplicar cobro ni despacho. Si ya se despachó, no se usa este flujo: requiere procedimiento separado con cocina.

**Notificaciones.** Push solo a clientes afectados con suscripción válida; incidencia visible en la app a TODOS los afectados, aunque no acepten push. No notificar a clientes no afectados. Sin permiso push no significa permitir confirmar selecciones inválidas.

**Prohibición de polling.** No usar peticiones periódicas para consultar estados ni escaneos cíclicos de DB en workers. Usar eventos tras commit y transporte SSE/WebSocket o equivalente; tareas diferidas para vencimiento de agrupación. Se permiten carga inicial, consultas causadas por acciones/eventos, reconciliación puntual al reconectar y temporizadores visuales sin red.

**Diseño.** Mantener composición aprobada de pantalla; anuncios con foto opcional y carrusel oculto cuando no existan anuncios vigentes. Identidad Sabora V3 de olla contorneada, no versiones antiguas.

## 3. Invariantes técnicos necesarios antes de producción

1. **Ámbito de disponibilidad:** restaurante/tenant, catálogo, plato y opción. El cambio debe tener identidad, versión monotónica, actor y marca temporal. Las opciones se validan contra el plato y sus grupos permitidos; no basta comprobar que la opción exista globalmente.
2. **Detección de afectados:** por referencias persistidas de cesta/pedido a plato y opciones, no por búsquedas aproximadas de texto. No enviar datos de pedidos ajenos ni difundir cambios globalmente como si fueran incidencias personales.
3. **Entrega fiable:** registrar cambio de disponibilidad y evento en la misma transacción mediante outbox duradero. El consumidor entrega al destinatario correcto, deduplica por eventId y permite reconciliación puntual al reconectar mediante versión/cursor. SSE/WebSocket y push son canales de entrega, NO la fuente de verdad.
4. **Cestas offline:** no se garantiza push ni conexión permanente; al reabrir/reconectar o confirmar, validar y recuperar incidencias sin polling. Las cestas exclusivamente locales no son detectables por el servidor hasta sincronizarse: aun así no se permite confirmar selección inválida.
5. **Carreras:** la actualización de disponibilidad, confirmación y vencimiento del agrupador deben arbitrar el mismo estado mediante transacción/compare-and-swap y bloqueo adecuado. Una única versión puede ganar el despacho. No basta validar antes y persistir después sin protección.
6. **Reenvío:** registrar identidad del pedido lógico, revisión anterior/nueva y comanda efectiva de despacho; guardar snapshot original inmutable, motivo, actor y correlación. Reenvío idempotente con clave estable y unicidad en DB. El despacho inmediato se agenda tras commit; un reintento no debe crear otra comanda.
7. **Precios:** si la corrección modifica precio, mostrar diferencia y requerir aceptación; mantener traza del importe anterior y nuevo. Cobros, devoluciones y conciliación son operaciones separadas de la simple edición de líneas.
8. **Control de acceso:** solo cocina/gestión autorizada cambia disponibilidad; solo propietario o actor habilitado modifica la cesta/pedido. El evento no debe revelar datos de otros clientes.

Estos invariantes son requisitos de ingeniería derivados de las decisiones aprobadas; sus detalles de esquema y endpoints requieren diseño y pruebas, no se consideran ya implementados.

## 4. Ambigüedades detectadas que NO deben resolverse mediante suposiciones

| Tema | Riesgo | Tratamiento hasta definición |
| --- | --- | --- |
| Pedido lógico, revisión y comanda | Duplicación de identidad/cobro | Exigir modelo de identidades y estados antes de escribir persistencia |
| Momento exacto del fin de ventana de 5 minutos | Carrera con agotado | Definir punto de despacho irreversible y prueba de concurrencia |
| Ingrediente agotado compartido por varios platos | Notificación incompleta | Definir relaciones explícitas plato-opción/ingrediente y alcance por restaurante |
| Cesta solo local u offline | No se conocen todos los afectados | Validar al reconectar/confirmar, no prometer avisos push instantáneos |
| Variaciones de precio, pago ya autorizado | Doble cargo o modificación sin consentimiento | Bloquear reenvío hasta aceptar nuevo total; diseñar conciliación |
| Varios comensales editando un pedido de mesa | Sobrescritura | Versionado y autorización por propietario; definir permisos concretos |
| Producto vuelve a estar disponible antes de corrección | Estado ambiguo | Revalidar snapshot vigente; conservar historial de incidencia |
| Pedido ya enviado a cocina | Edición silenciosa | Flujo separado pendiente de contrato operativo |

## 5. Estado comprobado frente a afirmaciones históricas

- El HTML **sí** muestra estados simulados agotado/retirado y deriva categorías visibles desde fixtures; **no** consume categorías de API ni ofrece cesta/pedido reales.
- El módulo de dominio es **puro** y no realiza polling, pero no tiene repositorio transaccional, outbox, scheduler ni autorización. Sus seis pruebas están escritas; **no hay evidencia en esta auditoría de su ejecución en CI**.
- La guía de marca conserva exploraciones anteriores; la sección final establece V3 como elección vigente. No interpretar 'prototipo' del encabezado como revocación de esa elección.
- No se ha acreditado inventario completo de documentación, ni una API desplegada, ni una base de datos operativa para CartaViva. No inferirlo de los contratos.

## 6. Puertas de calidad

Antes de declarar implementado el flujo: pruebas de categoría vacía/todos agotados, retirada, ingrediente agotado, versiones caducadas, dos actualizaciones simultáneas, confirmación contra agotado, vencimiento simultáneo, reenvío repetido, clientes desconectados, destinatarios de eventos, idempotencia y cero polling de red/DB. Registrar ejecución y resultado; un test escrito no equivale a un test ejecutado.

## Aclaración explícita ratificada: categorías vacías (18-10-2026)

**Regla definitiva ratificada por el usuario:** crear una categoría en cocina sin crear platos NO la hace visible al cliente. Tampoco aparece si todos sus platos están sin publicar o retirados. En cambio, una categoría publicada con al menos un plato publicado aunque TODOS estén agotados SÍ aparece y muestra esos platos como «Agotado». Una categoría desactivada nunca aparece. Predicado: `category.published === true && exists(dish.categoryId === category.id && dish.published === true && dish.availability !== 'retired')`. No usar `availability === 'available'` para determinar la visibilidad de la categoría. «Todos» utiliza exactamente el mismo predicado. Este criterio prevalece ante cualquier redacción previa que confunda «disponible» con «publicado».

## Hallazgo 3 — identidad de pedido y conciliación económica (18-10-2026)

**Decisión explícita aprobada:** un pedido mantiene el mismo identificador lógico al corregirse; se crea una revisión nueva e inmutable. La revisión anterior permanece en el historial y nunca debe despacharse si fue invalidada antes de cocina. El despacho inmediato se vincula únicamente a la revisión vigente, con idempotencia y arbitraje transaccional contra el vencimiento de agrupación.

**Necesidad expresada por el usuario:** cuando el restaurante configura pagos y la revisión afecta al precio de un pedido ya pagado, gestionar reembolso de la diferencia o cobro adicional, sin duplicar el cobro total. Se propone el siguiente contrato económico sujeto a validación de integración con proveedor de pagos:

- Comparar importes finales de revisión anterior y revisión propuesta en unidades monetarias menores (céntimos), con desglose de impuestos y suplementos; nunca usar coma flotante para dinero.
- Si el pago ya está capturado y la revisión cuesta más: obtener consentimiento y cobrar exclusivamente la diferencia. Si cuesta menos: crear reembolso parcial al medio original, sujeto a capacidades del proveedor. Si cuesta lo mismo: no crear operación económica.
- Si solo existe autorización sin captura: ajustar, cancelar y reautorizar o realizar autorización complementaria conforme a capacidades reales del proveedor; no denominar reembolso a la liberación de una autorización.
- Si el restaurante no habilitó pago digital, actualizar importe pendiente sin operaciones contra pasarela.
- Mantener un registro de operaciones de pago por pedido/revisión con idempotencia, estado (pendiente, autorizado, capturado, reembolso solicitado, reembolsado, fallido), identificadores del proveedor, correlación y auditoría. Los webhooks se autentican y procesan de manera idempotente, por eventos y SIN polling.
- La revisión no se despacha hasta tener una condición económica suficiente conforme al modo de pago (p. ej., cargo adicional autorizado/capturado según política). Un reembolso parcial ya solicitado no necesita esperar su liquidación bancaria para despachar, siempre que esté aceptado y registrado duraderamente.
- Si falla o se rechaza el cobro adicional, conservar revisión anterior bloqueada y nueva revisión pendiente de resolución; no enviar a cocina ninguna versión obsoleta ni cobrar dos veces.

**Pendiente de cerrar antes de integrar pagos:** proveedor/pasarela, modelo de captura (inmediata o diferida), política de envío ante reembolso solicitado pero fallido, tratamiento de propinas, cupones, impuestos, comisiones y múltiples pagadores. Estos detalles no se pueden inferir de una pantalla de ejemplo.

## Decisión aprobada — autorización previa y captura al despacho (18-10-2026)

**Decisión expresa del usuario:** en restaurantes con pago digital habilitado, al confirmar el pedido se AUTORIZA el importe, pero NO se captura. La captura se inicia al enviar la revisión vigente de la comanda a cocina. Durante la ventana de agrupación de mesa no hay cobro capturado.

**Revisión antes de despacho:** si cambia el importe, actualizar la autorización, o anular/liberar y obtener una nueva, según capacidades verificadas de la pasarela. Si el importe aumenta, solicitar consentimiento y autorización de la diferencia o del nuevo total según el proveedor. Si disminuye, reducir o sustituir la autorización; no llamarlo reembolso. Solo se requiere reembolso cuando ya hubo captura. La revisión corregida conserva el mismo ID lógico del pedido, nuevo número de revisión, y se despacha inmediatamente tras conseguir autorización suficiente, sin esperar una nueva ventana.

**Condición crítica de implementación:** captura y despacho a cocina cruzan sistemas diferentes; NO son una única transacción ACID. Diseñar máquina de estados durable y orquestación idempotente para evitar doble captura y doble comanda. No declarar el pedido enviado si falla el despacho; no reintentar cobros sin clave idempotente y reconciliación por webhook/evento. Ante captura exitosa y fallo de despacho, conservar incidencia operativa y reintentar entrega de forma segura, sin volver a capturar. Ante captura fallida, bloquear despacho y comunicarlo. Definir el instante operativo de 'enviado a cocina' y la política de reversión si el envío falla después de capturar antes de codificar el flujo.

**Sin polling:** las transiciones se disparan por acciones, vencimientos programados y eventos/webhooks del proveedor; se prohíbe consultar periódicamente el estado del pago o de la comanda. La conciliación puntual ante reconexión/fallo es admisible. El modo de restaurante sin pago digital conserva su flujo de despacho sin autorización/captura.

**Pendiente de selección técnica:** pasarela que soporte autorización/captura separadas, vigencia y límites de autorización, modificaciones de importe, webhook y reversión; el proveedor no está decidido y no debe asumirse compatibilidad.

## Cancelación después de envío a cocina — decisión funcional (18-10-2026)

**Aprobado por el usuario:** cuando una comanda ya llegó a cocina, el cliente NO puede cancelar unilateralmente desde la PWA; debe llamar/notificar al camarero, que gestiona la solicitud. La interfaz cliente puede ofrecer una acción de solicitar asistencia, nunca cancelación directa.

**Flujo de diseño:** el camarero, con autorización adecuada, consulta estado de cocina y decide si procede cancelar; usa una acción explícita «Cancelar pedido» con confirmación y motivo. La cancelación y su impacto económico deben registrarse y auditarse. Se propone que, si el camarero aprueba cancelación con devolución íntegra o parcial, el sistema tramite automáticamente el reembolso correspondiente mediante la pasarela (sin operación manual en portal de pagos). Si solo hay autorización, liberar/anular en lugar de reembolsar. Nunca asumir reembolso instantáneo ni doble devolución.

**Límite por precisar antes de implementar:** política del restaurante para cancelaciones cuando cocina ya inició o terminó preparación; facultades del camarero para autorizar devolución total/parcial/ninguna y posible aprobación de supervisor. No interpretar el botón de cancelar como derecho automático a reembolso completo. Estados de cancelación, reembolso pendiente/completado/fallido y eventos de cocina/pasarela separados, con idempotencia y sin polling.

## Cancelaciones por camarero o cocina y aprobación configurable (18-10-2026)

**Decisión funcional del usuario:** cada restaurante puede configurar «Las devoluciones requieren aprobación». Si está activa, el camarero registra la solicitud de cancelación del cliente y los administradores reciben una solicitud en un centro/pantalla específica de gestión de cancelaciones, donde resuelven el caso y determinan importe íntegro, parcial u otra resolución justificada. Cocina también puede iniciar la cancelación de un plato/pedido por imposibilidad de preparación, por ejemplo, falta de comida; esta incidencia genera solicitud de ajuste/reembolso si el importe ya fue capturado.

**Separación obligatoria:** incidencia operativa/cancelación, decisión económica y ejecución de pago son estados distintos. La cancelación iniciada por cocina debe identificar exactamente platos/unidades afectados, bloquear su preparación y avisar al cliente; el resto del pedido no se cancela sin motivo. Si el pago solo está autorizado, ajustar o liberar la autorización; si fue capturado, solicitar reembolso parcial o íntegro conforme a la resolución. No crear devolución bancaria si no hubo captura.

**Aprobación habilitada:** el empleado autorizado presenta solicitud y motivo, el administrador recibe evento/alerta y decide con trazabilidad de actor, motivo, importe y moneda. Sin aprobación: solo ejecutar automáticamente o por empleados autorizados dentro de límites expresamente configurados; la desactivación de aprobación no debe implicar permiso ilimitado de reembolsos. No confundir falta de existencias imputable al restaurante con cancelación voluntaria del cliente; aplicar las obligaciones de devolución correspondientes.

**Salvaguardas técnicas:** roles y permisos de cocina/camarero/admin; confirmación de decisiones; cálculos monetarios en céntimos y tope igual al saldo efectivamente capturado y no reembolsado; idempotencia de solicitudes y reembolsos; webhooks verificados; auditoría inmutable; eventos tras commit, notificaciones en app y push opcional; sin polling. Evitar carreras entre envío, preparación, cancelación y captura.

**Pendiente de concretar:** matriz exacta de permisos y límites de devoluciones cuando la aprobación está desactivada; posibilidad de rechazo de cancelación voluntaria una vez iniciada preparación; tratamiento de devoluciones parciales por plato, impuestos, descuentos y propinas; política de escalado y resolución de errores de pasarela. La pantalla descrita es contrato funcional, no implementación existente.
