# Sabora — pantalla principal implementada V1

Estado: **prototipo funcional de interfaz, sin backend**. No confundir con una pantalla de producción ni con la imagen conceptual.

## Fuente ejecutable

[HTML autónomo con CSS y JS](../references/sabora-client-home-v1.html). Usa el [SVG de identidad aprobado](../brand/sabora-logo-outline-v3.svg). Se puede abrir localmente con un servidor HTTP estático desde la raíz del repositorio; no requiere dependencias ni API.

## Funcionalidad demostrable

- Logotipo Sabora V3; selector de idioma ES/EN (etiquetas principales), lupa que despliega y cierra búsqueda.
- Filtros Todos/Entrantes/Primeros/Segundos/Postres/Bebidas; Todos representa **todas** las secciones no vacías, no una cuadrícula de categorías.
- Búsqueda en nombre y descripción con estado vacío; precios en EUR; tarjetas responsive; accesibilidad básica con etiquetas y foco.
- Navegación inferior con información, alérgenos, QR central, favoritos y ajustes.
- Botones sin contrato de backend muestran diálogo explicando que no ejecutan operaciones reales.

## Límites explícitos

- Los platos, ingredientes y precios son fixtures; las fotografías no están integradas y se usan emojis provisionales.
- No existe backend, reservas, pedidos, validación QR, autenticación, cesta persistente ni internacionalización completa.
- No se han ejecutado pruebas automatizadas ni pruebas en navegadores reales para esta versión.
- La imagen de inspiración no es evidencia de implementación; **este HTML sí es código inspeccionable**, aunque todavía no es el stack definitivo React/TypeScript.

## Próximo paso verificable

1. Migrar la pantalla a componentes React/TypeScript dentro de una estructura de PWA aprobada.
2. Sustituir emojis por fotografías con procedencia y licencia documentadas.
3. Añadir pruebas de navegación, búsqueda, accesibilidad, reducción de movimiento y estados vacíos.
4. Conectar a contratos reales del backend sin simular confirmaciones de pedidos ni validaciones QR.
5. Capturar screenshots reproducibles desde la aplicación ejecutada, asociados a commit y entorno de pruebas.

## Aprobación visual y contrato de anuncios (18-10-2026)

**Pantalla principal aprobada por el usuario** con logotipo Sabora V3, selector de idioma, búsqueda bajo demanda, cesta, campana de notificaciones, carrusel de anuncios sobre «Nuestra carta», categorías y barra inferior con QR central. Preservar la composición aprobada en futuras iteraciones: añadir funciones sin rediseñar la pantalla.

**Requisito obligatorio:** la fotografía de un anuncio es **opcional**. Modelo de presentación: `image: string | null` (o equivalente en contrato final). Con imagen válida: mostrarla junto al título y texto; sin imagen o con `null`: presentar una tarjeta tipográfica de calidad en paleta corporativa, sin hueco reservado, imagen ficticia ni recurso roto. Si no existen anuncios publicados y vigentes, ocultar por completo el carrusel y recuperar el espacio. El detalle debe funcionar en ambas variantes. Rotación automática cíclica, con controles manuales y pausa al abrir detalles; respetar preferencias de movimiento reducido.

**Alcance de aprobación:** diseño visual y comportamiento esperado, **no** certificación de despliegue, conexión con backend ni pruebas automatizadas. El HTML de referencia implementa anuncios de demostración sin imagen; queda pendiente cubrir mediante pruebas las variantes con imagen, sin imagen, sin anuncios y fallos de carga.

## Contrato obligatorio de categorías dinámicas (18-10-2026)

**Decisión aprobada por el usuario:** la pantalla cliente no puede mostrar una categoría que no haya sido creada en la aplicación de gestión/cocina. Las categorías no se definen como lista fija en el frontend; proceden del catálogo autorizado del restaurante a través de la API.

- Categoría inexistente: nunca se entrega ni se representa en cliente.
- Categoría existente pero oculta/desactivada: no se publica.
- Categoría publicada sin platos disponibles para cliente: no se representa como sección vacía.
- Orden de las categorías: el configurado en gestión, no un orden hardcoded en el cliente.
- «Todos» es un filtro virtual, no una categoría persistida; agrega los platos visibles agrupados por sus categorías visibles.
- Las condiciones de publicación y pertenencia de platos se verifican en servidor; el cliente solo consume la proyección autorizada.
- Al cambiar el catálogo, la vista se actualiza mediante el mecanismo de invalidación/refresco que establezca el contrato de aplicación, sin inventar categorías.

**Limitación del prototipo HTML actual:** utiliza fixtures con categorías estáticas para ilustrar el diseño. **No cumple todavía este contrato de datos dinámicos**; la implementación React/API debe sustituir esas constantes por la respuesta real del servidor y probar categorías inexistentes, desactivadas, vacías y orden personalizado. No declarar ese requisito implementado hasta disponer de pruebas.

## Disponibilidad temporal de platos y publicación de categorías (18-10-2026)

**Criterio funcional recomendado, pendiente de ratificación final si se desea:** separar la publicación del plato de su disponibilidad temporal. Un plato publicado que se queda sin existencias durante el servicio permanece visible con distintivo «Agotado», fotografía/precio y botón de añadir deshabilitado; el servidor debe impedir su incorporación/confirmación en pedidos incluso con clientes desactualizados. Cuando cocina repone existencias, vuelve a disponible. Un plato retirado/despublicado deja de aparecer en el cliente.

**Regla confirmada por el usuario:** una categoría creada en gestión sin platos publicados no se publica en la carta del cliente. Una categoría con platos publicados, aunque todos estén temporalmente agotados, puede seguir visible durante el servicio. «Todos» respeta la misma visibilidad y muestra el estado agotado. La categoría no debe aparecer solo por existir en base de datos.

**Estados a modelar y probar:** plato publicado disponible, publicado agotado, retirado/no publicado; categoría sin platos publicados, con platos publicados disponibles, con todos los platos publicados agotados. Evitar deducir «retirado» de stock cero; son operaciones distintas. Los fixtures del HTML aún no implementan este contrato de estados.

## Contrato propuesto: incidencias de disponibilidad que afectan a selecciones y pedidos (18-10-2026)

**Regla:** cocina puede cambiar disponibilidad de platos, ingredientes y opciones, pero nunca se elimina o sustituye silenciosamente una selección de cliente. El backend identifica los afectados mediante referencias a productos/opciones, versiones y estados del pedido; notificaciones push solo si existe suscripción/consentimiento, pero advertencia in-app y bloqueo de confirmación son obligatorios para cualquier afectado.

### A. Selección todavía en cesta

Al agotarse una opción (p. ej. kétchup) la cesta conserva la selección original y se marca inválida con motivo concreto. Cliente debe retirar o sustituir explícitamente esa opción por una disponible. La API vuelve a validar todas las líneas y opciones de la cesta transaccionalmente en el momento de confirmar, incluso si no se recibió notificación. No se permite cursar un pedido con líneas inválidas.

### B. Pedido confirmado, todavía en ventana de agrupación de mesa

Cuando se agota un componente, se marca incidencia en el pedido afectado **antes de su envío a cocina**; se congela/retira el pedido original de la cola de agrupación, sin borrarlo ni alterar su snapshot. Cliente recupera la versión original de la base de datos, ve exactamente qué cambió, corrige y acepta posibles diferencias de precio. La acción visible es **«Reenviar pedido»**. El reenvío crea una nueva revisión/comanda operativa enlazada con la anterior, con despacho inmediato **sin otra espera de agrupación**. Evitar duplicidad de cobro, pedido y comanda mediante idempotencia, control de concurrencia y cancelación atómica de la versión pendiente. No dar por finalizado el pedido original sin registrar el resultado.

### C. Comanda ya enviada a cocina

No aplicar el flujo B a comandas ya despachadas: se requiere incidencia operativa y coordinación con cocina, con reglas de aceptación/reembolso si corresponde.

### Seguridad y pruebas pendientes

Diseñar estados y transiciones explícitos, auditoría append-only, versionado de catálogo/opciones y transacciones resistentes a carreras entre actualización de cocina, confirmación de cliente y worker de agrupación. Probar: notificaciones suscritas/no suscritas; cliente offline; opción agotada en cesta; pedido en ventana; despacho concurrente; reenvío duplicado; variación de precio; opciones sustitutas agotadas; múltiples clientes de mesa. **Este documento define comportamiento esperado; no implica que la API ni el worker estén implementados.**
