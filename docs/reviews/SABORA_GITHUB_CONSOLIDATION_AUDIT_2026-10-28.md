# Auditoría de consolidación GitHub — Sabora (2026-10-28)

Documento de evidencia, no normativo. Fuente: metadatos de GitHub consultados en esta sesión. **Sin merge ni despliegue**.

## Inventario de PR Draft abiertos

| PR | Base | HEAD | CI en HEAD |
| --- | --- | --- | --- |
| #13 | integration/sabora-order-management-review | 5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b | Sabora CI y Bootstrap SUCCESS |
| #15 | audit/github-pr-global-consolidation-20261026 | 516909987e8b479ddaefb4991e44af0f71d25318 | Sabora CI, Bootstrap y client browser SUCCESS |
| #34 | integration/sabora-h6-full-20261027 | 64b4cf7a5c119ae0d14fa10a25a69c0f60d9a1a5 | Sabora CI, Bootstrap y management visual SUCCESS |
| #36 | feat/sabora-pickup-claim-cancel-20261027 | 1b8bb7e39e4a612f0cc4dffcff767378f11f42fc | Sabora CI, Bootstrap y management visual SUCCESS |
| #38 | feat/sabora-staff-display-id-20261027 | b7f5c3b50add327c318229db34eb497543f85b3c | Sabora CI, Bootstrap y management visual SUCCESS |
| #40 | feat/sabora-staff-directory-rls-20261028 | 01c8a9540be62993ad43fac71137ee2a50abd070 | Sabora CI 40696305409 y Bootstrap 40696305383 SUCCESS |

Los seis PR están abiertos, en Draft y GitHub informa `mergeable=true` para cada uno. Esto **no** implica autorización de merge ni ausencia de defectos.

## Ascendencia contrastada
GitHub compare de `main...integration/sabora-activation-readiness-20261028`: `ahead=2410`, `behind=0`. Compare de rama PR #13 al HEAD integrado: `ahead=114`, `behind=0`. Compare de rama PR #15 al HEAD integrado: `ahead=70`, `behind=0`. Por tanto ambos son ancestros de la rama actual. Los recuentos incluyen historia de commits, no son una estimación de funcionalidades.

## Riesgo de revisión abierto: PR #13
Ocho hilos de revisión siguen `is_resolved=false`: uno P1 y siete P2; cuatro `is_outdated=true`. No resolver automáticamente los hilos outdated ni asumir que la regresión verde demuestra su cierre.

Temas de los cuatro hilos vigentes: (1) expiración de capacidad después de `FOR UPDATE` en línea de pedido (P1); (2) idempotencia de invitación en coordinador (P2); (3) compatibilidad de preflight de operaciones con lector de membresía (P2); (4) expiración tras bloqueo de membresía en ciclo de personal (P2). Los cuatro outdated conciernen replay de enrollment, privilegios de escritura por columna, replay de outbox y codificación base64 de sobre de dispatch. La verificación debe hacerse contra el código **actual** y con reproducción/regresión focalizada; documentar evidencia antes de resolver cada hilo.

## Correos históricos
Decisión expresa del propietario: no existen empleados reales en Sabora. No implementar recuperación histórica. El flujo nuevo debe almacenar correo normalizado de invitación conforme al contrato y mantener identidad, revocación y auditoría. Posibles fixtures de personal solo se descartan tras inventario seguro de Sabora, sin acceso a Fleetia ni a recursos ajenos.

## Plan de cierre del hito
1. Reproducir o descartar con evidencia los ocho hallazgos sobre HEAD integrado; corregir defectos reales y reejecutar CI.
2. Verificar los flujos end-to-end y la conformidad visual aprobada; no confundir las pruebas aisladas de PR individuales con aceptación integrada.
3. Consolidar contratos, dependencias, migraciones y runbook de activación, con preflight fail-closed y verificación de aislamiento.
4. Presentar PR Draft consolidado y reporte de aceptación con SHA final. **Solicitar autorización separada** antes de cualquier merge, migración operativa o despliegue.

No se han ejecutado operaciones sobre Supabase operativo, VPS ni Fleetia.
