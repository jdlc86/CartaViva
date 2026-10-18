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
