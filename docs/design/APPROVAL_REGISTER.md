# Registro de aprobaciones visuales — Sabora

> **Índice de seguimiento, NO nueva normativa.** Prevalecen las decisiones aprobadas de [DESIGN_SYSTEM_CONTRACT](../DESIGN_SYSTEM_CONTRACT.md) §§9–14, [SABORA_HOME_IMPLEMENTATION_V1](screens/SABORA_HOME_IMPLEMENTATION_V1.md) y [REQUISITOS_FUNCIONALES](../REQUISITOS_FUNCIONALES.md). La lectura automática usa [APPROVAL_REGISTER.json](APPROVAL_REGISTER.json).

| Superficie | Decisión histórica comprobada | Captura exacta autorizada | Estado |
| --- | --- | --- | --- |
| PWA cliente — inicio | Dirección visual gastronómica premium y composición aprobadas el 18-10-2026: marca, idioma, búsqueda, cesta, campana, anuncios sobre «Nuestra carta», categorías y QR central. | **No localizada ni aprobada como baseline de píxeles.** El HTML del 18-10 es laboratorio con iconos/emoji provisionales, **no prueba de aceptación de esos iconos**. | PENDING_EXACT_BASELINE |
| Anuncios cliente | Rotación cíclica, detalle y ocultación sin vigentes definidos por RF; RF también identifica la apariencia/ubicación específica del banner propuesto como pendiente. No mezclar decisiones de fechas o alcances diferentes. | No disponible. | PENDIENTE |
| PWA gestión | Contratos de estructura, comportamiento, iconografía y accesibilidad; aceptación visual humana por pantallas pendiente. | No verificada. | PENDING_EXACT_BASELINE |
| Fotografías, fuentes exactas | Algunas decisiones de estilo y paleta aprobadas; activos concretos y pixel-perfect pendientes. | No aprobados individualmente. | PENDIENTE |

**Regla de honestidad:** una dirección de estilo aprobada no constituye captura maestra exacta; tampoco un resultado Playwright, un HTML de ejemplo ni una imagen reconstruida. Ningún campo APPROVED_EXACT_BASELINE se rellena por deducción del agente.

Para desbloquear una pantalla, obtener una imagen concreta **aprobada explícitamente por el propietario**. Versionar PNG, estado, viewport, fuente y SHA256; registrar URL de evidencia de aprobación, autor y fecha. El registro de baseline debe estar ya incorporado a la **rama base** antes de presentar una PR que cambie esa pantalla. Requisitos de revisión: [VISUAL_CONTROL_GATE](VISUAL_CONTROL_GATE.md).
