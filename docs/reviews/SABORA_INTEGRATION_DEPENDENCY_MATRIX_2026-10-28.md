# Matriz de integración verificada — 28-10-2026

Documento de ejecución, subordinado a los contratos normativos.

## Evidencia de archivos de PR
| PR | Base / ámbito | Archivos y riesgo |
|---|---|---|
| #15 | `audit/github-pr-global-consolidation-20261026`; PWA cliente premium | 25 archivos; `apps/client/src/App.tsx`, `style.css`, catálogo, estado, SW, E2E y lockfile. |
| #32 | `integration/sabora-production-readiness-rc1-20261026`; H6 | 34 archivos; también modifica `apps/client/src/App.tsx`, `style.css` y E2E, por tanto existe **solapamiento de archivos** con #15. No se ha demostrado conflicto de contenido ni compatibilidad. |
| #34 | sobre #32; recogida exclusiva | 22 archivos; API de capacidad de personal y migración de recogida. |
| #36 | sobre #34; códigos operativos | 41 archivos; API, PWA gestión y migración de identidad. |
| #38 | sobre #36; directorio | 41 archivos; API, PWA gestión y migración de directorio. |

## Orden candidato de migraciones (sin ejecución productiva)
1. `20261027122858_sabora_h6_events_payments_operations_candidate.sql`
2. `20261027190334_sabora_pickup_claim_cancel_candidate.sql`
3. `20261027225805_sabora_staff_display_id_candidate.sql`
4. `20261028120000_sabora_staff_directory_read_candidate.sql`

Este orden es cronológico y de dependencia **candidata**, no una aprobación para ejecutar migraciones. Comprobar requisitos previos, permisos, dependencias y reversión antes de cualquier aplicación.

## Riesgos abiertos y comprobaciones obligatorias
- **Integración PWA #15/#32:** base común confirmada: SHA `516909987e8b479ddaefb4991e44af0f71d25318` del PR #15 es ancestro de H6 y de la rama actual; esta última está 54 commits por delante y 0 detrás. Ejecutar pruebas combinadas del flujo premium/H6, sin asumir compatibilidad funcional solo por ascendencia.
- **Ramas encadenadas:** #34→#36→#38 parten de la cadena H6; no asumir que el PR #15 está incluido.
- **Correo histórico:** hashes irreversibles; reconciliación con aportación y verificación autorizada, sin inferir ni recuperar desde hash.
- **Rutas candidatas:** endpoints de directorio no montados; preparar gates de activación y verificación, no activarlos.
- **Seguridad:** comprobar RLS/roles SQL, HMAC, expiración y revocación tras integración.
- **Aislamiento:** no tocar Fleetia, VPS ni Supabase operativo.
- **Evidencia pendiente:** pruebas combinadas en PG17, monorepo y Playwright sobre una rama con código cliente reconciliado; actualmente no ejecutadas para esta integración.

## Criterio de avance
No declarar integración completa hasta superar pruebas combinadas de cliente premium/H6 y documentar preflight y runbook de reversión. No merge ni despliegue sin autorización.

## Verificación adicional de ascendencia
GitHub compare `feat/sabora-client-premium-pwa-hitos-1-3...integration/sabora-h6-full-20261027`: `ahead=39`, `behind=0`, merge-base `516909987e8b479ddaefb4991e44af0f71d25318`. Compare frente a `integration/sabora-activation-readiness-20261028`: `ahead=54`, `behind=0`, mismo merge-base. La suposición inicial de ramas divergentes queda descartada; las pruebas integradas siguen pendientes.
