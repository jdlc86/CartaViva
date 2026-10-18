# CartaViva — Requisitos de diseño v1 (propuesta para aprobación)

Estado: propuesta, NO baseline visual aprobado. Complementa docs/DESIGN_SYSTEM_CONTRACT.md. No sustituye los requisitos funcionales.

## Principios
- Identidad original, gastronómica, premium, contemporánea, fotográfica y usable.
- Cliente mobile-first: descubrimiento visual de platos y selección sencilla.
- Gestión: alta densidad informativa controlada, rapidez y claridad de estados.
- Un único sistema de diseño con variaciones explícitas de densidad.
- La apariencia aprobada debe ser reproducible en código y protegida mediante pruebas.

## Requisitos verificables
| ID | Requisito | Evidencia de aceptación |
|---|---|---|
| DV-01 | Tokens semánticos únicos | Sin valores arbitrarios de color, espaciado, sombra o radio en componentes |
| DV-02 | Fotografía gastronómica coherente | Proporciones 5:4 tarjetas, 4:3 detalle; optimización y placeholder accesible |
| DV-03 | Jerarquía de acciones | CTA principal identificable y sin competencia visual |
| DV-04 | Responsive | Capturas y revisión 360, 390, 430, 768, 1024, 1440 px |
| DV-05 | Objetivos táctiles | Mínimo 44x44 px como norma de producto |
| DV-06 | Movimiento funcional | Transiciones cortas, no bloqueantes y con reduced-motion |
| DV-07 | Accesibilidad | WCAG AA, foco visible, teclado, semántica y estados accesibles |
| DV-08 | Estados completos | Carga, vacío, error, éxito, desconexión, deshabilitado |
| DV-09 | Cesta contextual | Resumen accesible cuando haya selección, sin ocultar contenido crítico |
| DV-10 | Búsqueda por lupa | Campo oculto hasta pulsar; foco al abrir, Escape para cerrar |
| DV-11 | QR automático | Prohibido exponer conmutadores demo sin/con QR en producción |
| DV-12 | PWA consistentes | Componentes y tokens compartidos; densidades cliente/gestión diferenciadas |
| DV-13 | Evidencia versionada | Código fuente, fixture, viewport, captura maestra y acta de aprobación |
| DV-14 | Gate de regresión | Comparación automatizada contra baselines aprobados; revisión de cambios |
| DV-15 | Veracidad operativa | Feedback de pedido/reserva solo tras respuesta backend |
| DV-16 | Imágenes seguras | Fotos autorizadas; IA opcional sin falsificar ingredientes ni raciones |

## Movimiento (candidato)
- Intensidad por defecto propuesta: equilibrada, pendiente de aprobación.
- Revelar búsqueda: 120–180 ms; tarjeta/ficha: 180–240 ms; cesta: 120–200 ms.
- Preferir transform/opacity; no animar grandes listas ni bloquear input.
- prefers-reduced-motion elimina movimiento no esencial.
- Evitar autoplay, parallax pesado y transiciones decorativas en cocina/sala.

## Requisitos de aprobación visual
- No confundir referencias conceptuales, demos y capturas maestras aprobadas.
- No hay aún fotografías finales aprobadas, ni paleta congelada, ni baselines de regresión ejecutados.
- Cada pantalla: propósito, viewport, estado, fixture, fotografía autorizada, especificación, fuente, captura, aprobación, pruebas.
- Cambios visuales posteriores: modificar contrato + fuente + baseline mediante revisión explícita.

## Separación de simulación
- Los laboratorios pueden ofrecer estados ficticios, controles sin QR/con QR y datos demo.
- Ninguno de esos controles puede aparecer en la PWA final; el QR y la mesa los valida el servidor.
