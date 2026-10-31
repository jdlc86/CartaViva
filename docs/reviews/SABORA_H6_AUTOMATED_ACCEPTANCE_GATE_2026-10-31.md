# H6 — aceptación automatizada de dos bloques (31-10-2026)

## Objetivo
Reducir la intervención humana a la revisión del PR Draft y de los resultados. El workflow `Sabora CI` se activa en los eventos PR y en las ramas de push autorizadas por la normativa del repositorio; ejecuta `scripts/ci/h6-acceptance-gate.sh` como entrada única.

## Bloques
1. **Contratos y servicios**: `pnpm test` (incluye normas, contratos de API, política, regresiones y esquema).
2. **Integración real**: migraciones, roles, FORCE RLS y permisos en PostgreSQL 17 descartable; después Node/pg, HMAC auténtico, pruebas de concurrencia y navegador Chromium con PostgreSQL 17.

La ejecución se detiene al fallar un bloque, emite un resumen en GitHub Actions y adjunta los logs de cada etapa como artifact con retención de siete días. Cada etapa genera además un JSON de diagnóstico con los fallos TAP, localizaciones y errores relevantes. Los fallos no reconocidos quedan marcados explícitamente para revisión, sin reintentos silenciosos. El resto del pipeline sigue comprobando build, aislamiento Docker y configuración.

## Ciclo autónomo y límite
El ciclo automático es **push → CI → diagnóstico → nueva corrección → CI**. GitHub Actions ejecuta y diagnostica sin pedir aprobaciones. Las correcciones de código requieren un agente con permisos limitados o una intervención de desarrollo posterior: **el workflow no modifica archivos, no genera commits y no puede reparar por sí solo un fallo determinista**. El paquete JSON declara una política de un máximo de tres intentos de corrección para un agente futuro, siempre sobre la rama del PR y sin permisos operativos. **Esta cifra es un límite documental: el workflow actual no invoca ni instala ningún agente reparador**. No se hacen reintentos ciegos que oculten defectos.

No se permite acceso a Supabase operativo, VPS, Fleetia ni despliegue. No se concede EXECUTE a la nueva función candidata. Las aprobaciones de activación, merge y despliegue permanecen fuera de este mecanismo.

## Criterio de cierre
El PASS del workflow es necesario, pero no suficiente: siguen pendientes la integración opt-in de la API, el preflight estricto de la nueva función y el E2E completo con tareas de recogida A→B y concurrencia. **NO-GO** hasta evidencias y revisión.
