# Ideas candidatas — fuera del alcance activo

Este directorio conserva propuestas para evaluación futura. **No son requisitos normativos ni autorizan implementación, activación, gasto o despliegue.** La fuente de verdad funcional sigue siendo la documentación normativa de CartaViva.

## Candidata: agente autónomo de reparación de pruebas

**Estado: APARCADA por decisión de producto (31-10-2026).**

Motivo: la prioridad es cerrar el desarrollo de Sabora sin añadir arquitectura, dependencias, infraestructura ni costes de operación. No avanzar en esta idea salvo nueva instrucción expresa.

### Concepto conservado
- Unificar la ejecución de pruebas de todo el proyecto en GitHub Actions con PostgreSQL 17 desechable y navegador.
- Diagnósticos legibles por personas y máquinas, adjuntos a cada ejecución.
- Agente de desarrollo externo, autenticado con GitHub App de instalación limitada a `jdlc86/CartaViva`, que lee fallos, propone cambios en una rama y repite CI con presupuesto y número de intentos limitados.
- Separación estricta: CI de solo lectura; el agente corrector tendría identidad, permisos y entorno propios.
- Protección efectiva de ramas, PR Draft y revisión; sin merges, despliegues, acceso a Supabase operativo ni contacto con el VPS compartido/Fleetia.
- Cortafuegos de coste, tiempo y concurrencia; limpieza del worker efímero.

### Decisión operativa actual
Continuar con **desarrollo tradicional asistido**, correcciones puntuales por sesión, pruebas CI existentes y revisión de resultados. El gate de aceptación H6 ya integrado puede permanecer como herramienta de CI, pero **no se amplía ni se construye un agente corrector**. Los informes JSON existentes no disparan correcciones automáticas.

### Condiciones para reabrir
Solo por decisión explícita, tras priorizar los hitos funcionales pendientes y evaluar coste, seguridad, mantenimiento y beneficios frente al mecanismo tradicional.
