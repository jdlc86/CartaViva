# CartaViva — Especificación funcional inicial
Versión: 0.2 · 18-10-2026 · Estado: borrador para revisión, no implementación aprobada.

## Propósito
Comedor de trabajadores de distintas empresas. Dos PWA sobre un backend compartido: cliente y gestión. La PWA de gestión ofrece administración, sala y cocina con permisos separados. Los datos de consumo sirven para exportación empresarial; CartaViva no calcula nóminas.

## Identidad y acceso
- Empleado identificado por empresa y número de empleado, asociado a identidad persistente en dispositivo; diseño de autenticación y prevención de suplantación **pendiente**.
- Administración: empresas, empleados, invitaciones, roles y passkeys. Definir quién puede invitar, activar, revocar y recuperar acceso.
- Un cliente solo consulta sus propios pedidos. Sala consulta pedidos por mesa y por trabajador. Cocina ve lo necesario para preparar; administración gestiona configuración e informes.
- Aplicar autorización en servidor; nunca confiar en el rol o identidad suministrados por la interfaz.

## Mesas y QR
- Alta y edición de mesas: número único por restaurante, capacidad, descripción breve de ubicación y estado operativo configurable desde su ficha: EN_PREPARACION, LISTA o BLOQUEADA.
- Toda mesa nueva se crea obligatoriamente en estado EN_PREPARACION, sin opción de iniciar directamente como LISTA o BLOQUEADA durante el alta. El estado se cambia después desde la PWA de gestión (no desde la PWA del cliente), sin requerir privilegios administrativos especiales; basta el acceso ordinario a la gestión de mesas. No utilizar un booleano activo/inactivo paralelo como sustituto de estos estados.
- EN_PREPARACION: mesa todavía no habilitada para pedir; al escanear el QR mostrar «Estamos preparando esta mesa para atenderte. Por favor, espera unos momentos».
- LISTA: permite abrir la carta y realizar nuevos pedidos.
- BLOQUEADA: no admite nuevos pedidos; al escanear mostrar «Esta mesa no está disponible en este momento. Por favor, consulta con nuestro personal».
- Validar el estado de la mesa en backend tanto al resolver el QR como al confirmar cualquier pedido; no confiar en el estado cacheado por la PWA. Una transición fuera de LISTA debe impedir nuevos pedidos incluso si el cliente ya tenía abierta la carta.
- Los cambios de estado se realizan desde la PWA de gestión sin permiso administrativo especial, y quedan auditados; no eliminan ni cancelan comandas previamente aceptadas. La reactivación no regenera ni revoca el QR por sí sola.
- QR como propiedad de mesa: generar, consultar, imprimir, revocar y regenerar. No caduca automáticamente; token aleatorio no predecible, sin información personal, validado en servidor.
- QR revocado deja de admitir nuevas acciones; no elimina pedidos históricos. El QR identifica mesa, **no prueba presencia física**; controles antiabuso pendientes.

## Carta y catálogo
- Catálogo permanente de productos reutilizables.
- Categorías iniciales: bebida, primero, segundo, postre; categorías adicionales configurables.
- Programación semanal o por fechas y publicación diaria automática sin confirmación humana; administración puede corregir excepciones.
- Cocina solo puede marcar agotado y cancelar líneas de pedido; no crea productos.
- Agotar un producto impide nuevos pedidos, sin cancelar automáticamente los ya confirmados.

## Pedidos y comandas
- Combinaciones y cantidades libres por categoría; cada línea registra producto, categoría, cantidad, trabajador, empresa, mesa y estado.
- Ventana de agrupación por mesa de cinco minutos, configurable, iniciada por el primer pedido **confirmado**; consultar carta o escanear QR no la inicia.
- Pedidos posteriores forman comandas independientes de la misma mesa.
- El cliente modifica su cesta antes de confirmar; tras confirmar no edita directamente el pedido.
- Cada cliente ve sus líneas y progreso general de la agrupación, no el detalle de otros.
- Si cocina cancela una línea: avisar al trabajador afectado y a sala, conservar traza y excluir esa cantidad del consumo; el sustituto se confirma y envía inmediatamente como comanda nueva vinculada al motivo, sin esperar la ventana.
- Distinguir pedido, comanda agrupada y líneas; diseñar concurrencia, idempotencia y eventos de estado para evitar duplicados.

## Cocina
- Cuadrícula de tarjetas por mesa; número, comandas pendientes, cantidad y antigüedad. Varias comandas pueden pertenecer a la misma mesa.
- En escritorio, detalle en panel lateral; en móvil, vista completa.
- Acciones: agotado, cancelación de línea con motivo, comanda lista.
- Nuevas comandas llegan en tiempo real sin cerrar el detalle abierto; estados e historial conservados.

## Sala
- Cuando cocina marca lista: aviso destacado común, push y solicitud de vibración si el dispositivo lo permite.
- La fila permite abrir el detalle. Deslizarla la retira **para todos** y la archiva en historial común, registrando actor y fecha. No hay botón de entrega.
- El historial muestra mesa, trabajadores, platos, cantidades, horas de lista y retirada y actor; un camarero autorizado puede recuperar la fila.
- Recuperar reactiva el aviso para todos y reenvía push/vibración; no altera cocina ni duplica consumo. Diferenciar visualmente «recuperada».
- Vista de mesa: todos los pedidos y estados agrupados por trabajador, incluidos históricos.
- Llamada al camarero sin motivo: una pendiente por mesa, visible a todos, recordatorios hasta que uno marque atendida; evitar duplicados.

## Consumo e informes
- Exportación Excel filtrada por empresa y período, con detalle por trabajador, fecha, pedido, producto, categoría, cantidad y cancelaciones identificadas.
- Resumen por trabajador y cantidades por categoría, incluidas categorías futuras.
- No contar cancelados. **Pendiente definir** si «lista» equivale a consumo facturable, y cómo rectificar una comanda lista pero no servida. No afirmar que deslizar equivale a entrega.

## Comunicaciones del restaurante
- Canal exclusivamente interno: solo anuncios creados por el restaurante. No integrar noticias externas, RSS, RTVE ni redacción automática mediante IA.
- En la PWA de gestión, Configuración → Comunicaciones: editor visual sencillo, atractivo y rápido, con título, texto enriquecido básico, accesos rápidos a emojis, imagen opcional y vista previa del resultado en móvil. Evitar herramientas de maquetación complejas.
- Cada anuncio puede guardarse como borrador, publicarse, pausarse, editarse o retirarse. Registrar cambios relevantes y autor.
- Programación individual: un anuncio puede crearse hoy y quedar PROGRAMADO para publicarse automáticamente en una fecha y hora futuras, sin intervención manual. Permitir fecha y hora de inicio, fecha y hora de fin opcional, zona horaria del restaurante y periodicidad configurable (por ejemplo, una vez, diaria o determinados días de la semana). Antes del inicio, el anuncio no es visible en la PWA del cliente; al llegar el momento pasa a publicado si sigue habilitado y dentro de su vigencia, y al vencer se retira automáticamente de la rotación. Permitir modificar o cancelar la programación desde la PWA de gestión.
- Prioridad seleccionable por anuncio: BAJA o ALTA. Los anuncios de prioridad ALTA tienen mayor presencia en la rotación, pero no deben impedir que se muestren los de prioridad BAJA que estén vigentes. Definir pesos concretos en el diseño técnico.
- Si hay varios anuncios vigentes, se reproducen de forma cíclica y continua; al terminar la secuencia vuelven a aparecer. Evitar repeticiones consecutivas innecesarias y actualizar la selección al publicar, pausar o vencer anuncios.
- En la PWA del cliente: banda de anuncios compacta, legible y no intrusiva, con emoji y texto breve; pulsar abre el detalle visual del anuncio, incluida la imagen cuando exista. La imagen no ocupa la banda estrecha. Respetar accesibilidad y preferencias de movimiento reducido.
- El servicio de comunicaciones no debe bloquear la consulta de la carta ni la confirmación de pedidos; ante fallo, ocultar temporalmente la banda sin afectar la operativa.

## Requisitos transversales
- Backend autoritativo, permisos mínimos, registro de auditoría, eventos idempotentes, protección frente a reintentos y carreras.
- Actualización en tiempo real con reconexión y recuperación de estado. Push/vibración son best-effort y no sustituyen la bandeja persistente.
- Seguridad y privacidad: minimizar datos personales, separación entre empresas, retención definida, RGPD y control de acceso a informes.
- Pruebas de flujos críticos: ventana de cinco minutos, simultaneidad, cancelación y sustitución inmediata, QR revocado, retirada global y recuperación, notificaciones duplicadas, exportación, caída del módulo de comunicaciones.
- No se fija todavía stack, base de datos, hosting, proveedor de comunicaciones ni costes: decisión técnica posterior.

## Decisiones pendientes antes de construir
1. Autenticación del trabajador, passkeys y matriz completa de permisos.
2. Criterio contable de consumo y correcciones posteriores.
3. Protección frente a QR compartidos o escaneados fuera del local.
4. Duración de estados/historial, horarios y zona horaria del restaurante.
5. Definir los pesos de rotación de prioridades ALTA/BAJA y los límites de periodicidad y vigencia de anuncios.
6. Política de datos personales, conservación y exportaciones.
7. Criterios de aceptación detallados, modelo de dominio y arquitectura técnica.

## Próxima fase
Descomponer en historias de usuario verificables, definir contratos y modelo de datos, resolver decisiones abiertas, crear pruebas de aceptación y plan incremental de desarrollo. Este documento registra acuerdos de producto, no sustituye validación técnica ni legal.
