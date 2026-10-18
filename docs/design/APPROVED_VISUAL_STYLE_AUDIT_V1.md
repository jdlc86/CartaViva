# CartaViva — Auditoría de estilos aprobados y guía de implementación V1

Fecha: 2026-10-18. Estado: auditoría documental y ejemplos de referencia, **no implementación productiva ni baseline fotográfico aprobado**.

## Fuentes revisadas
- [Contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md), apartados 9–14.
- [Carta cliente](screens/CLIENT_MENU_V1.md).
- [Requisitos de diseño](DESIGN_REQUIREMENTS_V1.md).
- [Avisos y movimiento](NOTIFICATIONS_AND_MOTION_V1.md).
- [Laboratorio HTML](references/client-menu-reference.html).

## Matriz de aprobación
| Elemento | Estado | Evidencia/limitación |
|---|---|---|
| Dirección gastronómica premium, cálida y limpia | APROBADO | Contrato de diseño §12 |
| Canvas #F8F7F4, superficie #FFFFFF, tinta #202622, marca #146B57, acento #D98B45 | APROBADO como paleta de referencia | Tokens secundarios y contraste aún deben verificarse |
| Fotografía gastronómica protagonista | APROBADO como criterio | **Ninguna fotografía concreta aprobada ni licenciada** |
| Carta con categorías, lupa desplegable, carrito accesible | APROBADO como composición | Capturas maestras pendientes |
| Personalización del plato compartida entre carta y carrito | REQUISITO FUNCIONAL DEFINIDO | Componente React y diseño exacto pendientes |
| Intensidad de movimiento EQUILIBRADA | APROBADO | Curvas y tiempos exactos pendientes de pruebas |
| Toast, bandeja persistente, diálogo accesible | APROBADO como patrón | Eventos reales y backend pendientes |
| Tapiz de trazos gastronómicos en acceso Passkey cocina | APROBADO como ámbito restringido | Densidad/composición pendiente; **no usar fotografías ni extenderlo** |
| Fuente Inter | CANDIDATA | No congelada |
| Fotografía exacta, recorte final, assets de platos | PENDIENTE | Derechos, fidelidad, aprobación por imagen |
| Estados «Preparando/Entregado» del plato | NO APROBADOS | No representar trazabilidad no sustentada |

## Guía fotográfica — fotografías de ejemplo, no activos autorizados
**Este documento no incluye fotografías descargadas**: aún no existe selección autorizada por el usuario. Las siguientes fichas describen las tomas necesarias y sus contenedores para la futura galería de aprobación.

| ID | Toma fotográfica solicitada | Ubicación | Proporción candidata |
|---|---|---|---|
| FOTO-01 | Plato principal real sobre vajilla neutra; luz natural lateral; comida reconocible | Tarjeta de producto | 5:4 |
| FOTO-02 | El mismo plato y presentación, encuadre más abierto y fiel a ingredientes reales | Ficha de detalle y edición en carrito | 4:3 |
| FOTO-03 | Entrante real, fondo cálido sobrio, sin atrezzo engañoso | Tarjeta | 5:4 |
| FOTO-04 | Postre real, textura nítida, sin elementos no servidos | Tarjeta | 5:4 |

**Reglas:** solo fotografías propias o con licencia válida; consentimiento cuando proceda; registrar procedencia, licencia y aprobación. No inventar ingredientes, guarniciones, porciones ni disponibilidad. Una mejora de imagen con IA requiere conservar original, fidelidad y auditoría. Usar srcset/size, WebP/AVIF cuando sea apropiado, lazy loading fuera del primer viewport y texto alternativo descriptivo. No incorporar fotos remotas de ejemplo a producción sin licencia.

### Plantilla de ficha de aprobación fotográfica
```yaml
id: FOTO-01
plato_id: PENDIENTE
archivo_original: PENDIENTE
archivo_optimizado: PENDIENTE
autor_y_licencia: PENDIENTE
verificacion_fidelidad: PENDIENTE
aprobado_por: PENDIENTE
fecha_aprobacion: PENDIENTE
ratio_tarjeta: "5:4"
ratio_detalle: "4:3"
```

## Tokens de referencia en CSS
```css
:root {
  --cv-canvas: #F8F7F4;
  --cv-surface: #FFFFFF;
  --cv-ink: #202622;
  --cv-brand: #146B57;
  --cv-accent: #D98B45;
  --cv-radius-card: 16px; /* candidato del contrato */
  --cv-space-2: 8px;
  --cv-space-3: 12px;
  --cv-space-4: 16px;
}
.cv-page { background: var(--cv-canvas); color: var(--cv-ink); }
.cv-product-card { background: var(--cv-surface); border-radius: var(--cv-radius-card); overflow: hidden; }
.cv-product-card__photo { width: 100%; aspect-ratio: 5 / 4; object-fit: cover; display: block; }
.cv-button--primary { background: var(--cv-brand); color: white; }
.cv-button--primary:focus-visible { outline: 3px solid #155EEF; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .cv-motion { animation: none !important; transition: none !important; }
}
```
Los tokens no incluidos en la paleta aprobada son **candidatos**, y deben pasar comprobación de contraste.

## Ejemplo de tarjeta fotográfica (React/TSX)
```tsx
type ProductCardProps = {
  name: string;
  photoUrl: string; // URL de imagen autorizada, resuelta desde catálogo
  alt: string;
  priceLabel: string; // precio calculado/formateado desde datos fiables
  available: boolean;
  onOpen: () => void;
};
export function ProductCard(props: ProductCardProps) {
  return (
    <article className="cv-product-card">
      <img
        className="cv-product-card__photo"
        src={props.photoUrl}
        alt={props.alt}
        loading="lazy"
      />
      <div className="cv-product-card__body">
        <h3>{props.name}</h3>
        <p>{props.priceLabel}</p>
        <button type="button" onClick={props.onOpen} disabled={!props.available}>
          Ver detalles
        </button>
      </div>
    </article>
  );
}
```
La imagen es un campo administrado y validado; el ejemplo no incluye fallbacks, formatos responsivos ni el flujo completo de catálogo.

## Ejemplo de configuración compartida entre carta y carrito
```ts
type OptionChoice = { id: string; label: string; supplementCents: number; available: boolean };
type OptionGroup = {
  id: string;
  title: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  choices: OptionChoice[];
};
type DishDefinition = {
  id: string;
  revision: string;
  name: string;
  basePriceCents: number;
  photoUrls: string[];
  optionGroups: OptionGroup[];
};
type CartLine = {
  lineId: string;
  dishId: string;
  dishRevision: string;
  quantity: number;
  selectedChoiceIds: string[];
};
// La misma definición alimenta <DishCustomizer /> en la carta y al editar una línea.
// El servidor revalida opciones, precio, disponibilidad y revisión al confirmar.
```
El componente compartido se especifica funcionalmente; su implementación exacta queda pendiente.

## Ejemplo de notificación y movimiento
Ver [NOTIFICATIONS_AND_MOTION_V1.md](NOTIFICATIONS_AND_MOTION_V1.md) para TSX de toast con Motion, guardado validado por servidor y diálogo Radix. No representar estados de preparación/entrega sin contrato de dominio y eventos verificables.

## Hallazgos de coherencia documental
1. El encabezado del contrato principal dice «propuesta v0.1» y §8 conserva pendientes históricos; **las aprobaciones posteriores de §§11,12 y14 prevalecen**. No tratar todo el contrato como no aprobado.
2. DESIGN_REQUIREMENTS_V1 aún llama «candidato» al movimiento equilibrado: está desactualizado frente a la aprobación explícita de §11. Corregir la referencia en una revisión de consistencia.
3. §13 sugiere tapices en múltiples vistas; §14 lo restringe exclusivamente al acceso Passkey de cocina. §14 prevalece.
4. Las referencias HTML usan emojis y gradientes; **no son fotografías maestras ni activos de producción**.
5. Las demostraciones de avisos pueden contener estados ficticios: no trasladarlos a la aplicación sin eventos y permisos formalizados.

## Próxima puerta de calidad
1. Seleccionar fotografías reales con licencia y registrar aprobación individual.
2. Crear prototipos fuente reproducibles con dichas imágenes, sin controles demo en producción.
3. Capturar 360, 390, 430, 768, 1024 y 1440 px; validar accesibilidad y contraste.
4. Aprobar explícitamente baselines antes de congelarlos y usarlos en regresión visual.
