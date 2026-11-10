# Sabora — Encargo vigente para Codex Desktop: PWA administrativa completa

Estado: **encargo de trabajo paralelo autorizado, solo frontend, sin merge ni despliegue**. Fecha: 2026-10-23.

## Corrección de alcance

Este documento **sustituye expresamente** cualquier instrucción previa que limite el trabajo de Codex exclusivamente al Estudio de imágenes. Codex desarrollará **toda la interfaz de la PWA administrativa de Sabora** dentro de `apps/management/**`, con el diseño visual ya aprobado y sin conectar operaciones no respaldadas por contratos y endpoints existentes. El Estudio de imágenes es **un módulo dentro de Catálogo**, no el encargo completo.

## Fuente de verdad e inventario previo

Repositorio único: `jdlc86/CartaViva`. Rama base de desarrollo: `feat/sabora-pnpm-bootstrap`, PR principal #2. Antes de trabajar, obtener el HEAD actualizado, inspeccionar el árbol y leer `docs/continuity/SESSION_07_HANDOFF.md`, este encargo, `docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md`, `docs/architecture/SABORA_CATALOG_PUBLICATION_GATE.md`, la documentación de diseño aprobada, los contratos relevantes de mesas/QR, catálogo, comandas, personal y autorizaciones, y la PWA actual. Si una operación carece de contrato o API comprobable, no inventarla.

## Alcance frontend administrativo

Implementar de manera modular y coherente la navegación y los espacios de trabajo de las cinco áreas que ya figuran en `apps/management/src/main.tsx`:

1. **Resumen**: centro operativo, indicadores y estados de carga/vacío/error, sin cifras operativas ficticias.
2. **Carta / Catálogo**: exploración y gestión visual de platos, categorías, disponibilidad, precios y estados editoriales; los controles de publicación y escritura deben quedar deshabilitados hasta existir sesión y conexión autorizadas. Incorporar **Estudio de imágenes con IA** según el contrato Google: selección y vista previa local, formatos 5:4/4:3/1:1, comparación y revisión visual; sin llamadas a Gemini ni simulación de publicación.
3. **Mesas y QR**: workbench maestro-detalle, ficha de mesa, número/capacidad/descripción cuando estén documentados, estados de mesa y acciones visuales de emisión/rotación/revocación de QR. Sin generar tokens operativos, alterar estados ni inventar APIs. No mostrar un QR de prueba como acceso real.
4. **Comandas**: vista de seguimiento para cocina/sala, filtros, agrupaciones y estados únicamente según contratos documentados. No ejecutar transiciones ni notificaciones sin backend autorizado.
5. **Equipo y accesos**: interfaz de personal, roles, ROOT único y titularidad de escritura del ADMIN conforme a documentación; sin activar invitaciones, cambios de permisos ni acciones privilegiadas ficticias.

Priorizar **Mesas y QR, Catálogo y Estudio de imágenes**; completar las otras áreas como frontend no operativo coherente y comprobable. No representar funcionalidades no implementadas como disponibles. Para flujos no conectados, usar controles deshabilitados y mensajes explícitos. Los fixtures locales son solo para pruebas y deben estar claramente identificados y aislados de producción.

## Diseño visual obligatorio

**Existen estilos visuales aprobados**. Identificar primero su documentación y sus componentes/tokens reales. Reutilizar paleta, tipografías, espaciado, componentes, navegación, jerarquías, responsive y accesibilidad. No crear un design system nuevo, no rediseñar cabeceras o navegación global, no introducir una biblioteca UI ajena, no cambiar estilos globales sin justificación. La implementación debe extender los patrones aprobados. Si no se identifica un contrato visual inequívoco, documentar el bloqueo y no inventar otro diseño.

## Propiedad de archivos y separación con el asistente principal

Codex: **únicamente** `apps/management/**` y su propio informe `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md`. Puede modularizar `apps/management/src/main.tsx`, crear componentes/estilos acotados y tests dentro de la PWA. Mantener cambios de dependencias al mínimo; justificar antes de modificar `apps/management/package.json` o lockfiles compartidos (estos últimos fuera de alcance).

Asistente principal: `apps/api/**`, `apps/client/**`, `supabase/**`, `scripts/ci/**`, `.github/workflows/**`, contratos backend, seguridad, transacciones y PG17. Codex **no debe modificar** esas rutas ni `docs/continuity/SESSION_07_HANDOFF.md`, ni documentos de arquitectura compartidos. Si detecta una carencia de API, registrarla como dependencia para coordinación.

## Git y autonomía

Crear rama propia desde HEAD actualizado de `feat/sabora-pnpm-bootstrap`, por ejemplo `feat/sabora-management-ui`. Commits exclusivamente en esa rama. Abrir **PR Draft** con base `feat/sabora-pnpm-bootstrap`; sin merge, force-push destructivo ni despliegue. No rebasar cambios ajenos automáticamente. Trabajar en bloques grandes: inventario y diseño; estructura; mesas/QR; catálogo/estudio; comandas/equipo/resumen; pruebas y entrega.

## Validación y aceptación

Ejecutar build/TypeScript de `apps/management`, tests existentes y nuevos que puedan añadirse sin alterar CI, comprobaciones de estados, accesibilidad y responsive; inspección visual si hay navegador. Verificar ausencia de llamadas reales a Google, secretos, tokens QR operativos inventados, datos productivos ficticios y cambios fuera del ámbito. Documentar los comandos y resultados; si no se ejecutan, marcar pendiente. Consultar estado CI del SHA exacto del PR.

Entregar PR Draft, SHA base/final, lista de archivos, capturas cuando sean posibles, evidencia de conformidad visual, funcionalidades por área, limitaciones y dependencias de backend en `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md`.

## Prohibiciones operativas

Sin merge, despliegue VPS, reinicio de contenedores, migraciones en Supabase operativo, secretos ni activación de servicios Google de pago. **Fleetia y otros proyectos del VPS están completamente fuera de alcance**. No solicitar revisiones de Codex de pago sin permiso.

## Orden de precedencia

Este documento es el **encargo vigente de Codex**. `docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md` continúa siendo el contrato funcional y de seguridad del submódulo fotográfico, **no una restricción del alcance general de Codex**. Las decisiones arquitectónicas y visuales aprobadas en la documentación del repositorio prevalecen; ante contradicciones documentar y no inventar.
