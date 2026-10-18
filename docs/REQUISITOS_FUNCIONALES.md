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
- Cada producto tiene precio unitario configurable en EUR, incluido 0,00 €, desde la PWA de gestión/configuración. No asumir que todos los productos son gratuitos ni exigir importe mínimo positivo.
- La carta y la zona de selección muestran precios; la cesta calcula automáticamente subtotal por línea (precio unitario × cantidad) y total, tanto en modo reserva como en modo pedido presencial. Si todos los precios son cero, el total mostrado es 0,00 €.
- Los cálculos definitivos se realizan y validan en backend usando importes decimales exactos o unidades monetarias enteras (céntimos), nunca aritmética flotante como fuente de verdad. Definir y mostrar tratamiento fiscal conforme al régimen aplicable antes de producción.
- Al confirmar un pedido presencial, persistir precio unitario aplicado y total como instantánea inmutable de la transacción; modificaciones posteriores del catálogo no alteran pedidos históricos. Una reserva anticipada es una previsión, no una venta ni consumo: su importe mostrado es informativo y se recalcula con los precios vigentes al confirmar el pedido real, informando de cambios antes de aceptar.
- No inferir ni activar cobro electrónico por mostrar importes: la integración de pagos, si procede, requiere decisión funcional independiente.
- Categorías iniciales obligatorias del catálogo: ENTRANTE, PRIMERO, SEGUNDO, POSTRE y BEBIDA; categorías adicionales configurables sin perder compatibilidad con informes e históricos.
- Configuración → Catálogo → Crear/editar plato: nombre, descripción, fotografía opcional, categoría obligatoria, precio en EUR (admite 0,00 €), estado y declaración estructurada de alérgenos. La administración configura estos datos; cocina solo modifica disponibilidad y admisión de reserva según sus permisos.
- Administración → Catálogo → Estudio de imágenes con IA: desde el alta/edición del plato, permitir cargar o capturar una foto original y solicitar opcionalmente una mejora gastronómica de calidad profesional. Corregir iluminación, enfoque, encuadre y presentación, preservando fidelidad a ingredientes, raciones y aspecto real; prohibir que la IA invente alimentos, guarniciones o ingredientes no presentes. Mostrar claramente que es una imagen generada/editada con IA en el entorno de administración.
- Flujo: subir/capturar → procesar de forma asíncrona con estados y errores recuperables → comparar original/resultado → aceptar, regenerar o descartar → aplicar al producto. Nunca reemplazar automáticamente una imagen publicada sin confirmación del administrador. Conservar original y trazabilidad de versión, actor y fecha; permitir revertir.
- Exportación automática de variantes coherentes con el sistema visual: tarjeta 5:4 (objetivo 1000×800), detalle 4:3 (1200×900) y miniatura 1:1 (400×400); codificación eficiente WebP/AVIF con fallback cuando corresponda, recorte centrado en el plato, compresión controlada, metadatos saneados, dimensiones y peso máximo validados. Estos tamaños son objetivos de diseño revisables mediante contrato visual, no parámetros que deba introducir el usuario.
- Procesamiento seguro: validar tipo real y tamaño de archivo, permisos de acceso, cuota y costes por generación, tratamiento de datos por proveedor, retención/borrado, derechos de uso de imágenes, moderación y protección frente a archivos maliciosos. No bloquear el alta de un plato si la IA falla; permitir imagen original o placeholder.
- La imagen es ilustrativa y no sustituye la ficha verificable de ingredientes y alérgenos. No inferir alérgenos, ingredientes ni información nutricional a partir de la imagen. Seleccionar proveedor/modelo IA, presupuesto y condiciones de privacidad antes de implementar.
- Catálogo de alérgenos predefinido, normalizado y versionable conforme al anexo II del Reglamento (UE) n.º 1169/2011: (1) cereales que contengan gluten, (2) crustáceos, (3) huevos, (4) pescado, (5) cacahuetes, (6) soja, (7) leche —incluida lactosa—, (8) frutos de cáscara, (9) apio, (10) mostaza, (11) granos de sésamo, (12) dióxido de azufre y sulfitos por encima de los umbrales normativos, (13) altramuces y (14) moluscos. Conservar los nombres normativos, sus excepciones y el detalle de subtipos cuando aplique; no sustituirlos por iconos ambiguos.
- Un plato admite múltiples alérgenos seleccionados de la tabla normativa; no introducir nombres libres que dupliquen la taxonomía. Estados de declaración diferenciados: PENDIENTE_DE_VERIFICAR y VERIFICADA (con cero o más alérgenos declarados). Una selección vacía sin verificación nunca equivale a «sin alérgenos».
- La declaración debe revisarse al cambiar receta, ingredientes o proveedor; registrar quién y cuándo verificó y mantener trazabilidad de cambios. Los platos sin declaración verificada no se publicarán como si fueran seguros ni se etiquetarán «sin alérgenos».
- Mostrar alérgenos en la ficha de plato y antes de confirmar reserva/pedido, con texto legible y pictogramas de apoyo. No inferir que la ausencia de alérgenos declarados garantiza ausencia de trazas o contaminación cruzada; gestionar por separado advertencias de posibles trazas cuando estén justificadas.
- La información sobre alérgenos debe estar disponible al consumidor antes de la compra o consumo, con revisión jurídica y operativa de obligaciones españolas para restauración antes de producción. Las validaciones del servidor y el histórico de pedido deben preservar la versión de la información mostrada al confirmar.
- Programación semanal o por fechas y publicación diaria automática sin confirmación humana; administración puede corregir excepciones.
- Cocina no crea productos del catálogo. Puede marcar platos como agotados/disponibles y configurar en tiempo real, mediante un control independiente por plato, si ADMITEN_RESERVA anticipada; estos cambios no modifican el catálogo permanente.
- Agotar un producto impide nuevos pedidos, sin cancelar automáticamente los ya confirmados.

## Pedidos y comandas
- Combinaciones y cantidades libres por categoría; cada línea registra producto, categoría, cantidad, trabajador, empresa, mesa y estado.
- Ventana de agrupación por mesa de cinco minutos, configurable, iniciada por el primer pedido **confirmado**; consultar carta o escanear QR no la inicia.
- Pedidos posteriores forman comandas independientes de la misma mesa.
- El cliente modifica su cesta antes de confirmar; tras confirmar no edita directamente el pedido.
- Cada cliente ve sus líneas y progreso general de la agrupación, no el detalle de otros.
- Si cocina cancela una línea: avisar al trabajador afectado y a sala, conservar traza y excluir esa cantidad del consumo; el sustituto se confirma y envía inmediatamente como comanda nueva vinculada al motivo, sin esperar la ventana.
- Distinguir pedido, comanda agrupada y líneas; diseñar concurrencia, idempotencia y eventos de estado para evitar duplicados.

## Reserva anticipada de platos
- La PWA cliente detecta el modo sin mesa porque la sesión se ha abierto sin escanear un QR válido. En ese modo muestra la carta completa y la disponibilidad actualizada en tiempo real, pero solo permite añadir a la selección de reserva los platos disponibles y marcados ADMITEN_RESERVA por cocina. Los no reservables siguen visibles, con explicación clara y acción de añadir inhabilitada.
- Con QR de mesa válido en estado LISTA, el cliente puede añadir cualquier plato disponible para pedido presencial, aunque no admita reserva anticipada. La condición ADMITEN_RESERVA es independiente del estado agotado/disponible y se valida en servidor al confirmar una reserva.
- Al escanear el QR después de reservar, conservar íntegramente la selección previa y permitir añadir otros platos disponibles antes de pulsar PEDIR; no exigir volver a introducir los platos reservados.

- La PWA cliente instalada permite abrir la carta y seleccionar platos y cantidades antes de llegar al restaurante, sin escanear un QR. La cesta y experiencia de selección son las mismas que para un pedido presencial.
- Sin QR de mesa válido en la sesión: acción RESERVAR habilitada y acción PEDIR no disponible para confirmación. Al tocar PEDIR, mostrar el mensaje «Escanea el QR de tu mesa para realizar el pedido» y ofrecer el acceso al escáner; evitar un control totalmente inerte que impida explicar el motivo.
- Tras escanear un QR válido de una mesa en estado LISTA, conservar la selección actual, habilitar PEDIR y deshabilitar RESERVAR para esa sesión contextualizada en mesa. Aplicar la validación de QR y estado de mesa en servidor al confirmar, no solo en interfaz.
- Confirmar una reserva genera una solicitud de reserva separada de los pedidos y comandas presenciales. Cocina recibe las solicitudes de reserva claramente diferenciadas y puede ACEPTAR o RECHAZAR; el rechazo exige un motivo obligatorio, comunicado al trabajador. La aceptación también se comunica al trabajador.
- La reserva, incluso aceptada por cocina, es exclusivamente una previsión de demanda para organizar el trabajo. No es un pedido, no genera comanda, no inicia la ventana de agrupación de cinco minutos, no acredita entrega y no contabiliza consumo empresarial.
- Para realizar el pedido real, el trabajador debe llegar al restaurante, escanear el QR válido de su mesa en estado LISTA y pulsar PEDIR. Solo esa confirmación entra en el flujo ordinario de pedidos y agrupación por mesa. Nunca convertir ni enviar automáticamente una reserva a cocina como comanda.
- La selección de platos y cantidades se conserva obligatoriamente en la zona de pedidos del cliente entre la reserva anticipada y la llegada al restaurante. Tras escanear el QR, el cliente encuentra exactamente su selección previa y solo tiene que pulsar PEDIR, sin volver a introducir ni seleccionar platos. El pedido exige confirmación explícita y nueva validación de disponibilidad; si un plato ya no está disponible, señalar únicamente esa línea y permitir retirarla o sustituirla conservando las demás. Evitar duplicar reservas, pedidos y consumos.
- Quedan por concretar: fecha/hora prevista de la reserva, antelación máxima, vencimiento, límites de cantidades, y tratamiento de reservas aceptadas que no llegan a convertirse en pedidos.

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
- Programación individual versátil: un anuncio puede crearse hoy y quedar PROGRAMADO para publicarse automáticamente en el futuro. Modos: una fecha concreta, todos los días o selección libre de días de la semana (p. ej. lunes, martes y sábado), con selección múltiple de L/M/X/J/V/S/D. Configurar fecha de inicio, fecha de fin opcional (incluido sin fecha de finalización), franja horaria diaria de visualización y zona horaria del restaurante. El anuncio solo es visible cuando coinciden vigencia, día seleccionado y franja horaria; fuera de ella queda oculto y reaparece en el siguiente intervalo, sin intervención humana. Permitir modificar, suspender, reactivar o cancelar la programación desde la PWA de gestión, con resumen legible de la regla antes de guardarla. Validar rangos, días seleccionados y casos límite de cambio horario.
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

## Clasificación alimentaria y filtros (aprobado 18-10-2026)
- Incorporar dos filtros alimentarios independientes de la categoría gastronómica: **Vegetariano** y **Vegano**. Se aplican sobre Entrante, Primero, Segundo, Postre y Bebida, sin duplicar fichas.
- La clasificación de cada producto será declarada y verificada desde gestión, con estado explícito **PENDIENTE_VERIFICACION**, **VERIFICADO** o **NO_APLICA** por atributo. Un producto sin verificación no se mostrará como vegetariano ni vegano.
- Un producto verificado como vegano también satisface el filtro vegetariano; la relación inversa no se cumple. Se mantendrá consistencia en edición, importación y API.
- El cliente dispondrá de controles de filtro comprensibles, compatibles con búsqueda y categoría. No se presentarán afirmaciones dietéticas basadas en fotografías, nombre del plato o ausencia de alérgenos.
- Las etiquetas vegetarianas y veganas son independientes de la declaración de los 14 alérgenos; el etiquetado dietético **no equivale a ausencia de alérgenos ni garantiza ausencia de contaminación cruzada**.
- Los cambios de ingredientes o receta invalidarán la verificación dietética hasta nueva revisión; registrar actor, fecha y auditoría.
