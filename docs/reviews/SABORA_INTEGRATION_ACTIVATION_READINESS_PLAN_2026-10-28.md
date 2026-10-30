# Preparación de integración y activación — Sabora (28-10-2026)

> Documento de ejecución y verificación; **no modifica ni sustituye requisitos normativos**. Antes de implementar cualquier operación contrastar con los documentos normativos vigentes de GitHub. No es autorización de despliegue.

## Estado comprobado
- PR #32: H6 eventos/pagos/operaciones; base `integration/sabora-production-readiness-rc1-20261026`; SHA `a08a7a262b329ed91fa23a9b616ef5856bfd98b7`.
- PR #34: recogida exclusiva; base PR #32; SHA `64b4cf7a5c119ae0d14fa10a25a69c0f60d9a1a5`.
- PR #36: identidad y códigos de personal; base PR #34; SHA `1b8bb7e39e4a612f0cc4dffcff767378f11f42fc`.
- PR #38: directorio seguro; base PR #36; SHA `b7f5c3b50add327c318229db34eb497543f85b3c`.
- PR #15: PWA cliente premium; base original `audit/github-pr-global-consolidation-20261026`, SHA `516909987e8b479ddaefb4991e44af0f71d25318`. **GitHub compare confirma que #15 es ancestro de #32 y de la rama de integración** (merge-base igual al SHA #15, 0 commits detrás). Sigue pendiente la validación funcional conjunta.
- Rama de preparación basada en #38: `integration/sabora-activation-readiness-20261028`. Sin merge ni despliegue.

## Puertas del hito (todas obligatorias)
1. **Inventario de dependencias**: historia común de #15 con H6–personal ya verificada; comprobar compatibilidad funcional; revisar otros PR Draft normativos/operativos que puedan ser prerrequisitos. No rebase/merge sin autorización.
2. **Contratos**: comprobar coherencia entre identidad, directorio, cocina/sala, H6, PWA cliente, RLS y eventos; registrar conflictos reales con referencia normativa y resolverlos en código candidato, sin reinterpretar requisitos.
3. **Correos históricos**: solo existen hashes en identidades anteriores al directorio; son irreversibles. Diseñar reconciliación mediante entrada autorizada y verificada de dirección actual, prueba de pertenencia, validación de unicidad, idempotencia, auditoría, consentimiento/aviso pertinente y no filtración. Ningún correo se reconstruye, inventa, infiere o rellena por defecto. Registrar casos sin contacto y plan de bloqueo/continuación según contrato normativo. No operar sobre datos reales en esta fase.
4. **Configuración y secretos**: inventariar principales SQL, permisos mínimos, claves HMAC por audiencia, rutas, workers y dependencias. Definir preflight fail-closed, rotación y reversión sin incorporar secretos al repositorio.
5. **Plan de activación**: orden de migraciones, compatibilidad hacia atrás, verificación de RLS, smoke y gates de autorización; rollback/forward-fix según seguridad de migraciones. **Ninguna ejecución sobre Supabase operativo ni VPS en este hito**.
6. **Aislamiento**: ninguna operación debe detener, modificar o depender de Fleetia ni de otros proyectos del VPS. Validar contenedores, redes, volúmenes, puertos, recursos y rutas como propiedad exclusiva de Sabora antes de cualquier propuesta futura de despliegue.
7. **Evidencias**: PostgreSQL 17 desechable, suite monorepo, pruebas de API y UI, Playwright responsive, CI y reporte final con SHA. No declarar una puerta superada sin evidencia.

## Criterio de cierre
Entregar código y documentación de integración candidata, inventario de dependencias, procedimiento de reconciliación probado en datos ficticios, runbook de activación/reversión y evidencias CI. PR Draft sin merge. Si alguna puerta requiere decisión normativa nueva, registrar bloqueo y pedir aprobación explícita antes de implementar esa decisión.

## Prohibiciones
No desplegar, reiniciar ni eliminar servicios; no aplicar migraciones o credenciales a Supabase operativo; no tocar Fleetia ni recursos compartidos; no hacer merge sin autorización.
