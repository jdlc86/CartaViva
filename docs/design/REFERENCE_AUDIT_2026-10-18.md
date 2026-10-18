# CartaViva — Auditoría de referencias (18-10-2026)

## Alcance y limitaciones
Referencias solicitadas: https://carta.porneat.es/ y https://www.goiko.com/.
- La URL exacta carta.porneat.es no ha sido accesible al auditor (DisabledError). **No se certifican sus detalles visuales, DOM, interacciones o responsive**.
- Se consultó como fuente relacionada y alternativa https://tienda.porneat.es/ (tienda pública operativa de Porneat), que **no es necesariamente la misma interfaz**.
- Se inspeccionaron páginas públicas de Goiko (home, entrantes y selector de alérgenos) a través de contenido web; no se realizaron pruebas instrumentadas en navegadores con tamaños de viewport ni capturas comparables. No afirmar que se ha medido tipografía, color o píxeles reales.
- La auditoría distingue observación verificable de recomendación original.

## Fuentes
- Goiko home: https://www.goiko.com/es/
- Goiko entrantes: https://www.goiko.com/es/carta/entrantes/
- Goiko alérgenos: https://www.goiko.com/es/selectoralergenos/
- Porneat tienda: https://tienda.porneat.es/
- Porneat web corporativa: https://porneat.es/pedir/

## Observaciones verificadas
### Goiko
1. Navegación pública distingue Carta, Reservar y Hacer pedido.
2. Home destaca platos y promociones con bloques de contenido y llamadas a la acción.
3. Carta ofrece categorías (entrantes, burgers, chicken, ensaladas, bebidas, postres, etc.).
4. Página de entrantes enumera productos con imágenes y acceso a categorías.
5. Existe página específica de selección/consulta de alérgenos.
6. No se ha verificado desde este acceso el comportamiento exacto de carrito, búsqueda, animaciones, tipografías ni diseño a 390 px.

### Porneat
1. La tienda digital pública dispone de categorías, productos, descripción y precios.
2. La versión inglesa indexada expone campo «Search products»; no se ha probado interacción real de búsqueda.
3. Existen opciones de combos y productos agrupados por categorías.
4. La web corporativa diferencia recogida propia de reparto externo.
5. No se ha podido verificar la interfaz de carta.porneat.es solicitada ni sus propiedades visuales.

## Decisiones propuestas para CartaViva
| Dimensión | Evidencia / inspiración | Adaptación original |
|---|---|---|
| Jerarquía de contenido | Goiko: productos y promociones destacados | Hero compacto + título de carta + categorías + productos; los anuncios internos no desplazan las acciones |
| Navegación | Goiko: categorías de carta | Categorías propias Entrante/Primero/Segundo/Postre/Bebida; extensibles |
| Selección | Porneat: carta transaccional con precios | Tarjetas fotográficas, cantidades, cesta persistente, subtotal y total |
| Búsqueda | Porneat: búsqueda de productos | Icono de lupa con campo desplegable solo al activarlo |
| Seguridad alimentaria | Goiko: selector de alérgenos | Catálogo normativo UE por plato, visible y verificable antes de confirmar |
| Fotografía | Presentación gastronómica | Estudio IA opcional con dirección fotográfica propia, fidelidad al plato real y variantes de imagen |
| Flujo | Goiko: pedir/reservar como acciones distintas | Sin QR: reservar; QR validado: pedir. **No exponer selector manual de modo** |
| Administración | No auditada en las referencias | Sistema propio de catálogo, precios cero, alérgenos, cocina, sala, mesas y comunicaciones |

## Reglas de no copia
- No replicar marcas, logotipos, nombres comerciales, fotografías protegidas, textos promocionales, paletas exactas, composición distintiva ni código de terceros.
- Las referencias sirven para descubrir patrones de interacción, no como especificaciones técnicas de frameworks o arquitectura de backend.
- La PWA de cliente y la PWA de gestión deben seguir el contrato de diseño propio.

## Pendientes para una auditoría visual completa
1. Acceder a carta.porneat.es en un navegador real o disponer de capturas autorizadas de móvil/escritorio.
2. Capturar Goiko y Porneat a 390, 768 y 1440 px y documentar estructura, densidad, CTA, scroll, fichas, menús, overlays, búsqueda y feedback.
3. Registrar contraste, áreas táctiles, navegación por teclado, rendimiento y movimiento reducido mediante pruebas.
4. Generar referencias originales CartaViva y aprobarlas visualmente; archivar capturas y baselines en repositorio.
5. Solo tras aprobación, congelar valores definitivos de tokens y abrir puertas de regresión visual CI.

## Estado
Auditoría **documental/funcional parcial realizada**. Auditoría visual instrumental **pendiente**. No se deben presentar fotografías de búsquedas web como capturas verificadas de las interfaces.
