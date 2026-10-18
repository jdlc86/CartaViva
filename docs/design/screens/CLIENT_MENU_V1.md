# CartaViva · Pantalla CLIENT_MENU_V1

Estado: composición y dirección visual aprobadas; implementación HTML de laboratorio actualizada, **captura maestra aún pendiente de aprobación**.

## Fuente ejecutable
- docs/design/references/client-menu-reference.html
- Referencia sin backend; fixture ficticio, ilustraciones emoji y hero CSS temporales. No distribuir como app final.
- La apariencia aprobada incluye canvas #F8F7F4, tarjetas #FFFFFF, marca #146B57, texto #202622, acento #D98B45 e intensidad visual equilibrada.
- El aspecto de fotografías definitivas no está aprobado ni se han generado baselines de imagen.

## Componentes y comportamiento
- Cabecera CartaViva, subtítulo, búsqueda oculta tras lupa, acceso a cesta.
- Hero editorial, título de sección, pestañas desplazables de categorías: Todos, Entrantes, Primeros, Segundos, Postres, Bebidas.
- Filtro dietético Todos/Vegetariano/Vegano, combinado con categoría y búsqueda.
- Vegano satisface filtro Vegetariano, no viceversa. Solo se muestran etiquetas verificadas en producto real.
- Tarjetas de dos columnas, ilustración temporal 5:4, nombre, clasificación, alérgenos, precio, añadir y detalle.
- Detalle modal accesible, información del plato y acción de selección.
- Cesta con cantidades y total; demo sin acciones de compra/reserva/pedido.
- Sin conmutadores de simulación de QR.

## Criterios de aceptación antes de pasar a producto
1. Sustituir emojis/hero gradiente por fotografías propias o licenciadas aprobadas, sin inferir alérgenos o dietas de la imagen.
2. Revisar visualmente a 360, 390, 430, 768 y 1440 px, capturar y aprobar masters.
3. Implementar en React/TypeScript con componentes reutilizables, no trasladar HTML de demo como arquitectura productiva.
4. Añadir test de filtros cruzados, búsqueda, cesta y teclado; controles de 44x44 px.
5. Reducir movimiento con prefers-reduced-motion.
6. Revalidar precios, permisos, disponibilidad y contexto QR en backend antes de realizar operaciones reales.
7. No declarar este diseño como baseline visual exacto hasta aprobación de capturas.
