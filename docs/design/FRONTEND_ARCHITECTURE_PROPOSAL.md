# CartaViva — Arquitectura frontend y microinteracciones (propuesta 0.1)

Estado: propuesta, no implementación. Fecha: 18-10-2026.

## Evidencia del repositorio
Se consultaron rutas package.json, apps/web/package.json, README.md, pnpm-workspace.yaml y vite.config.ts en la rama por defecto: todas devolvieron 404. No se ha inventariado un árbol completo. **No afirmar que React, Tailwind, Motion o Radix estén instalados**.

## Arquitectura propuesta
- apps/client: PWA cliente React + TypeScript + Vite; mobile-first.
- apps/management: PWA gestión React + TypeScript + Vite; tablet/desktop-first y móvil accesible.
- packages/design-tokens: CSS variables semánticas, tipografía, escalas, radii, sombras, movimiento.
- packages/ui: componentes accesibles compartidos (Button, ProductCard, SearchReveal, QuantityControl, CartBar, AllergenDisclosure, Dialog, Toast, Status).
- packages/motion: transiciones discretas; wrappers respetuosos con prefers-reduced-motion, sin lógica de negocio.
- packages/contracts: tipos y validación de mensajes API, roles, pedidos, reservas, precios y alérgenos.
- apps/backend: implementación por definir, fuente de verdad de precios, QR, mesa, disponibilidad, autorizaciones y pedidos. No diseñar endpoints definitivos antes de revisar contratos funcionales.

## Decisiones de librerías por validar con prototipos
- React + TypeScript + Vite: base propuesta; evaluar compatibilidad y despliegue.
- CSS variables + CSS Modules como opción inicial de bajo acoplamiento. Tailwind CSS opcional solo si reduce complejidad y se integra con tokens; no imponer dos sistemas de estilo.
- Radix UI: primitivas accesibles; evaluar tamaño y adecuación.
- Motion for React: solo donde CSS transitions no alcance; carga diferida cuando sea posible.
- Embla Carousel: solo si el diseño final requiere carruseles táctiles.
- Lucide: familia única de iconos.
- Vitest + Testing Library + Playwright: pruebas unitarias, interacciones, E2E y regresión visual.
- Storybook u otra galería de componentes: referencia viva de estados, aislada de producción.

## Reglas estrictas de implementación
1. Nunca incluir controles de simulación «Sin QR/Con QR» en rutas reales. Los modos se derivan de contexto validado por servidor.
2. Nunca permitir que una animación cambie el estado real de pedido, reserva o comanda sin confirmación del backend.
3. Fuente única de tokens; evitar colores, radios, sombras y duraciones arbitrarios.
4. Imágenes de plato con proporción 5:4 en tarjetas; detalle 4:3; mantener versiones originales y optimizadas. Las fotografías maestras aún no están aprobadas.
5. Búsqueda: lupa compacta; al activar, campo visible y enfocado, al cerrar vuelve cabecera original; ESC para cerrar.
6. Cesta persistente, totales calculados con precisión monetaria en servidor, vista cliente reactiva.
7. Accesibilidad: contraste AA, teclado, foco, botones táctiles >=44px, reduced motion y estados de carga/error.
8. Las pantallas maestras deben contar con implementación ejecutable, captura aprobada, viewport, fixture de datos, criterios de aceptación y pruebas de comparación visual.

## Prototipos prioritarios
1. Carta cliente con categorías, búsqueda, tarjeta, alérgenos, cesta.
2. Ficha de plato y transición desde tarjeta.
3. Reserva anticipada y confirmación de pedido mediante QR real, sin simuladores en producto.
4. Cocina: comandas y reservas separadas, panel contextual.
5. Sala: alertas compartidas, historial y recuperación.
6. Administración: catálogo, alérgenos UE, precio cero y estudio de imagen IA.

## Puertas antes de iniciar implementación
- Confirmar estructura real del repositorio (inventario de árbol).
- Aprobar capturas maestras y paleta final.
- Seleccionar dependencias tras medir bundle, rendimiento y accesibilidad.
- Añadir pruebas CI que impidan desviaciones de diseño y filtración de controles demo.
