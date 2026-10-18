# CartaViva — Investigación funcional y arquitectura de movimiento

Estado: propuestas para evaluación; no se declaran como funcionalidades ya aprobadas ni librerías instaladas.

## Procedencia y evidencia
- Goiko: carta por categorías, acceso a reservar/pedir, productos destacados, información de alérgenos. https://www.goiko.com/
- Porneat: tienda digital con productos, categorías, búsqueda y precios. https://tienda.porneat.es/
- No se ha podido auditar instrumentalmente https://carta.porneat.es/ ni inspeccionar los bundles JavaScript de ambas webs. No atribuirles librerías concretas, animaciones o funciones sin verificarlas.
- Propuestas adicionales propias: favoritos, repetir pedido, menús combinados, personalización de platos, productos relacionados, filtros de alérgenos. Requieren decisiones de producto y reglas de cocina antes de incorporarlas al contrato funcional.

## Matriz de oportunidades
| Capacidad | Estado CartaViva | Evaluación |
|---|---|---|
| Búsqueda con lupa | Aprobada | Desplegar campo al pulsar |
| Categorías y productos | Aprobada | Entrante, primero, segundo, postre, bebida |
| Precio, cesta y cantidades | Aprobada | Precio cero permitido |
| Alérgenos normativos | Aprobada | Datos verificados; no asumir seguridad por ausencia de declaración |
| Favoritos | Propuesta | Acceso rápido, sincronización por usuario |
| Repetir pedido | Propuesta | Volver a validar precio, disponibilidad, QR y reservabilidad |
| Combos | Propuesta | Definir composición, sustituciones, precios y alérgenos agregados |
| Personalización | Propuesta | Extras, exclusiones, impactos en precio y alérgenos; confirmar capacidad operativa de cocina |
| Sugerencias relacionadas | Propuesta | No interrumpir selección ni usar técnicas invasivas |
| Filtro por alérgenos | Propuesta con precaución | No etiquetar automáticamente como seguro; considerar trazas y declaraciones incompletas |
| Seguimiento visual | Propuesta | Solo estados backend reales, no prometer entrega |

## Candidatos técnicos (no instalados ni verificados en terceros)
- React + TypeScript para UI.
- CSS variables/tokens como fuente de verdad; evaluar Tailwind CSS según arquitectura real, sin introducirlo por inercia.
- Motion for React para microinteracciones cuando CSS no baste.
- Radix UI para primitivas accesibles sin estética impuesta.
- Embla Carousel para carruseles táctiles opcionales.
- Lucide para iconografía.
- API de cámara + decodificador QR compatible, con permisos y fallback.
- Revisar dependencias, tamaño del bundle, licencias, compatibilidad PWA y mantenimiento antes de adoptar.

## Contrato preliminar de movimiento
| Elemento | Interacción | Duración objetivo |
|---|---|---|
| Lupa/buscador | Revelar campo, enfocar y cerrar sin salto de layout | 120–180 ms |
| Tarjeta -> ficha | Transición suave sin bloquear navegación | 180–240 ms |
| Añadir producto | Feedback de botón, cantidad y total, sin efectos exagerados | 120–200 ms |
| Categorías | Cambio inmediato, desplazamiento estable | 120–180 ms |
| Cesta | Actualización sin saltos de layout; confirmación perceptible | 120–200 ms |
| Notificaciones | Entrada discreta; no interrumpir cocina ni sala | 150–220 ms |

- Animar preferentemente transform y opacity; evitar animar dimensiones en listas largas o provocar reflow masivo.
- Respetar prefers-reduced-motion: desactivar movimiento no esencial sin perder feedback.
- Evitar carruseles automáticos de productos y efectos parallax pesados en pantallas operativas.
- Presupuesto de rendimiento y accesibilidad: verificar FPS, Core Web Vitals, carga de imágenes, interacción táctil >=44 px, contraste y navegación teclado.
- Nunca usar animaciones para representar aceptación de reserva o pedido antes de confirmación del servidor.

## Próximos pasos
1. Inspeccionar dependencias y estructura reales del repositorio antes de elegir librerías.
2. Aprobar o descartar funcionalidades propuestas, sin contaminar el MVP.
3. Implementar laboratorio aislado de componentes y microinteracciones, separado de producción.
4. Generar capturas/baselines de estados y viewports aprobados.
