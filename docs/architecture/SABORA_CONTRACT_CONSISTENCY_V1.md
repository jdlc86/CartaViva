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
