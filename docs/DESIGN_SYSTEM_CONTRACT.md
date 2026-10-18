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
