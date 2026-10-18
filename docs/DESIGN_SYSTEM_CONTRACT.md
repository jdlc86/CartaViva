# CartaViva — Contrato de diseño visual (propuesta v0.1)

> Estado: propuesta técnica inicial pendiente de aprobación visual. Los valores se consideran candidatos; una vez aprobados serán obligatorios y cualquier modificación requerirá revisión del contrato. No implica implementación de las PWA.

## 1. Objetivo y principios
- Identidad original, contemporánea, gastronómica y profesional; no copiar la marca, imágenes, disposición exacta ni colores de Porneat o Goiko.
- Cliente: mobile-first, experiencia de app nativa, fotografía gastronómica protagonista, cesta persistente, acciones inequívocas y mínimo esfuerzo.
- Gestión: desktop/tablet-first adaptable a móvil, lectura rápida y operación táctil; cocina y sala priorizan legibilidad, estados y velocidad frente a ornamentación.
- Un único sistema de tokens, componentes, accesibilidad y patrones de interacción para ambas PWA; variaciones de densidad controladas, no sistemas paralelos.
- No inventar un nuevo patrón visual en cada pantalla. Los componentes compartidos son obligatorios.

## 2. Tokens de color propuestos
| Token | Hex | Uso |
|---|---|---|
| canvas | #F8F7F4 | Fondo claro principal |
| surface | #FFFFFF | Tarjetas y superficies |
| surface-subtle | #F0EFEB | Contenedores secundarios |
| ink | #202622 | Texto principal |
| ink-muted | #606A63 | Texto secundario |
| brand | #146B57 | Acciones principales |
| brand-hover | #105442 | Hover de acción principal |
| brand-soft | #E4F2EC | Fondos de énfasis |
| accent | #D98B45 | Acentos gastronómicos puntuales |
| border | #DDE2DC | Divisores y bordes |
| success | #23754D | Confirmación y disponible |
| warning | #9B650E | Advertencias |
| danger | #B63B3B | Errores y acciones destructivas |
| focus | #155EEF | Foco de teclado visible |

- No utilizar colores hexadecimales arbitrarios dentro de componentes; consumir tokens semánticos.
- Estados no se comunicarán solo con color: icono, texto y estado accesible.
- Mantener contraste WCAG AA: texto normal >=4.5:1, texto grande >=3:1, componentes y foco >=3:1 donde corresponda.
- Modo oscuro: no improvisar inversión automática; definir tokens y validar capturas antes de habilitarlo.

## 3. Tipografía y ritmo
- Familia candidata: Inter (con fuentes del sistema como fallback); cargar legalmente y optimizar rendimiento.
- Escala de tamaño (px): 12, 14, 16, 18, 20, 24, 30, 36; cuerpo base 16 px.
- Pesos permitidos: 400, 500, 600, 700. Interlineado: 1.45–1.6 en cuerpo y 1.15–1.3 en títulos.
- Sistema de espaciado base 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. No introducir márgenes arbitrarios.
- Radios: 8 (control pequeño), 12 (input), 16 (tarjeta), 24 (panel destacado); píldoras 999.
- Sombras: solo tres niveles normalizados (sin sombra, elevación baja, modal); prohibidos efectos vistosos que reduzcan legibilidad.

## 4. Componentes obligatorios
- AppShell, TopBar, BottomNav (cliente), SideNav (gestión), PageHeader, ProductCard, CategoryTabs, CartSummary, OrderActionBar, StatusPill, EmptyState, ErrorState, LoadingSkeleton, Dialog, Toast, ScheduleEditor, AnnouncementPreview, KitchenOrderCard, WaiterAlertRow, TableStateControl.
- Unificar variantes: tamaño (sm/md/lg), densidad (comfortable/compact), intención (primary/secondary/danger), estado (idle/loading/disabled/error/success).
- Todas las acciones tienen estados de carga y bloqueo de doble envío; errores claros y recuperables.
- Las acciones destructivas se distinguen de las frecuentes; no introducir confirmaciones innecesarias en cambios de estado ordinarios.
- Iconografía coherente de una sola familia; emoji permitido como contenido del anuncio, no sustituto inconsistente de iconos de navegación.
- Imágenes de platos: proporción y recorte consistentes, placeholder elegante, texto alternativo y carga diferida.

## 5. Contratos de pantalla
### PWA cliente
- Barra superior compacta con identidad/contexto; navegación inferior estable y accesible; cesta/resumen persistente al seleccionar platos.
- Búsqueda contextual desplegable: mostrar solo icono de lupa en la cabecera por defecto; al activarlo, revelar campo de búsqueda de platos con transición discreta, foco en el campo, botón claro para cerrar y retorno a cabecera compacta. Filtrar por nombre y, cuando existan datos, descripción/ingredientes; mostrar resultados y estado sin coincidencias sin alterar la cesta. No dejar un campo de búsqueda permanentemente visible ni abrir un modal invasivo para una búsqueda sencilla. Respetar accesibilidad, teclado y movimiento reducido.
- Carta: categorías claras, fichas de platos con foto, nombre, disponibilidad, cantidad y CTA; mostrar productos no reservables sin permitir añadirlos cuando no existe QR.
- Sin QR: reservar habilitado para platos reservables; pedir requiere QR y al tocarlo explica por qué. Con QR válido: pedir habilitado, reservar no disponible, conservar la selección.
- El paso reserva -> QR -> pedido no obliga a seleccionar otra vez. Verificación final de disponibilidad sin borrar el resto de la cesta.
- Comunicaciones: franja compacta no invasiva; anuncio ampliado con texto, emojis e imagen opcional. Nunca obstaculizar pedido.
- Área táctil de controles >=44x44 CSS px; acciones principales visibles sin búsquedas ni desplazamientos innecesarios.

### PWA gestión
- Navegación modular escalable con módulos de administración, cocina y sala; accesos por rol sin multiplicar aplicaciones.
- Cocina: cuadrícula de comandas por mesa y detalle contextual; solicitudes de reserva claramente separadas de comandas; acciones principales visibles.
- Sala: avisos persistentes y lista compartida; retirada y recuperación con feedback inmediato.
- Mesas: estados EN_PREPARACION/LISTA/BLOQUEADA cambiables en una acción desde gestión; nueva mesa inicia EN_PREPARACION.
- Comunicaciones: editor con emojis rápidos, imagen opcional, vista previa y calendario semanal L/M/X/J/V/S/D, fecha de inicio/fin y franja horaria; prioridad BAJA/ALTA y controles editar/activar/suspender.

## 6. Responsive y accesibilidad
- Puntos de control de diseño: 360, 390, 430, 768, 1024, 1280, 1440 px. No asumir un solo dispositivo.
- Sin desbordamiento horizontal accidental a 320 px; evitar interfaces densas comprimidas: transformar paneles en vistas o cajones.
- Respetar prefers-reduced-motion; animaciones funcionales 120–220 ms como referencia, nunca bloquear una operación.
- Foco visible, navegación teclado, etiquetas accesibles, errores anunciados, semántica correcta y zoom de texto.
- Evitar acciones solo mediante swipe; proporcionar alternativa accesible.

## 7. Antidegradación: puertas de calidad
- Ninguna PR de UI se acepta sin revisión de componentes/tokens y capturas de los puntos de control pertinentes.
- Storybook o galería equivalente de componentes y estados: normal, vacío, carga, error, deshabilitado, saturación de texto, datos largos.
- Pruebas visuales por comparación de capturas para pantallas representativas; actualizar baselines solo con justificación y aprobación explícita.
- Lint/CI: detectar colores literales, estilos inline arbitrarios y componentes duplicados cuando existan herramientas; no bloquear por falsos positivos sin revisión.
- Pruebas de accesibilidad automáticas y revisión manual de teclado, lector de pantalla y contraste.
- Las referencias de terceros inspiran criterios, nunca sustituyen diseños originales aprobados.
- Cambios de paleta, tipografía, navegación o componentes base requieren modificar este contrato, registrar motivo y actualizar referencias antes de desplegar.

## 8. Evidencias y aprobación
- Crear diseños propios de referencia para: carta sin QR, carta con QR, cesta, reserva, cocina, sala, gestión de mesas y editor de comunicaciones.
- Para cada pantalla registrar: versión, tamaño de viewport, estado de datos, criterios de aceptación y captura aprobada.
- Pendiente: aprobación de paleta, tipografía y diseños de referencia. No tratar los valores candidatos como decisión definitiva hasta dicha aprobación.

## 9. Registro de aprobaciones y referencias visuales (obligatorio)
- Estado a 18-10-2026: el usuario ha aprobado la **dirección compositiva de la carta** (fotografía protagonista, tarjetas, categorías, lupa desplegable, precios, alérgenos, cesta accesible). La ficha detallada de plato se ha mostrado como propuesta y requiere aprobación explícita de sus detalles. **No existen aún capturas maestras versionadas en este repositorio** y no se debe afirmar que ya están archivadas.
- Los ejemplos interactivos mostrados en conversación no equivalen a archivos fuente, capturas persistidas ni pruebas visuales en CI. Las fotografías de demostración tampoco son activos de producto aprobados ni pueden reutilizarse sin verificar derechos de uso.
- Antes de implementar pantallas definitivas: producir artefactos originales reproducibles (capturas PNG/WebP, diseño fuente editable o implementación de referencia), registrarlos en `docs/design/references/` y asociarlos a fichas `docs/design/screens/`.
- Cada ficha de pantalla incluirá: identificador y versión; responsable y fecha de aprobación; captura para móvil 390 px y escritorio/tableta cuando aplique; dimensiones, jerarquía y disposición; tokens exactos; tipografía; imágenes y proporciones; estados (normal, vacío, carga, error, sin QR, con QR, agotado, reserva); interacciones; accesibilidad; criterios verificables de aceptación.
- Separar **aprobado**, **propuesto** y **pendiente** en un índice `docs/design/APPROVAL_REGISTER.md`. Una aprobación conversacional de la composición no se interpretará como aprobación de colores, fotografías específicas o píxeles exactos.
- Revisión de PR visual: adjuntar capturas de implementación a los mismos viewports y estados que las referencias, informe de diferencias y justificación de cambios; rechazar alteraciones de estructura, densidad, tipografía, espaciado o estilo fotográfico no aprobadas. Los baselines de regresión visual solo se actualizan mediante aprobación explícita.
- Mantener coherencia entre contrato de diseño, referencias y código: un cambio visual intencional exige actualizar los tres, no solo modificar CSS.

## 10. Separación estricta entre simulación y producto
- Las previsualizaciones de ChatGPT y las referencias ejecutables pueden contener controles de demostración, datos ficticios, precios ilustrativos, placeholders, alertas de prototipo y selectores de estado. **No son requisitos de interfaz de producción**.
- PROHIBIDO trasladar a la PWA final selectores manuales «Sin QR / Con QR», «Modo demo», simuladores de mesa, botones de forzar estados o mensajes de prototipo. El cliente no selecciona su contexto operativo.
- El modo sin mesa se deriva de la ausencia de un contexto de mesa validado por el backend. El modo de pedido presencial solo se activa tras resolver un QR auténtico, vigente y de una mesa en estado LISTA; el servidor revalida al confirmar.
- La transición de reserva a pedido conserva la selección; nunca depende de un interruptor de simulación. Los estados de mesa EN_PREPARACION/BLOQUEADA impiden nuevos pedidos y muestran el mensaje apropiado.
- Las simulaciones se confinan a fixtures, Storybook, pruebas y referencias explícitamente etiquetadas como DEMO; no se incluyen en rutas ni bundles de producción. Ningún control de prueba podrá cambiar el contexto de seguridad real.
- Toda ficha de pantalla debe separar: (a) interfaz visible en producción, (b) mecanismos internos de prueba, (c) contenido ficticio; en la revisión de PR se comprobará la ausencia de los elementos (b) y (c) en el producto final.
