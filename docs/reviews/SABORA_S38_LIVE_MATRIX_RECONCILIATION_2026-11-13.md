# Sabora S38-14 — reconciliación del tablero vivo

**13-11-2026. Expediente de seguimiento, no norma ni autorización operativa.** Matriz M1–M6 y CV-001–CV-019 actualizadas **en sus tablas originales**, sin borrar requisitos, prioridades ni evidencia histórica. Ver [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y [continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md).

## Evidencia y alcance

- `main@9f80e903b6e1ad9c305f830e4375405df100c84a` (antes de este commit documental), merge de código `5caad1f39a018e44cb831df62f889a05ce85368d`, **99 SQL** en subárbol `d26f1d4fc22acb13b6bda4927c424a74f5164c4a`; [acta Git de integración](SABORA_S38_CV005_B2_MAIN_INTEGRATION_2026-11-13.md).
- Consulta GitHub: **0 PR abiertos**; #56, #57 y #58 fusionados. [PG17](https://github.com/jdlc86/CartaViva/actions/runs/43433947114) y [CI/H6](https://github.com/jdlc86/CartaViva/actions/runs/43433947054) en el SHA de merge: **2/2 completed/success**. Candidato previo `ee57c607`: 5/5 CI. Revisión Codex diferencial `COMMENTED` con recomendación `APPROVE`, no aprobación formal de autor.
- [Preflight real Supabase](SABORA_S38_SUPABASE_PG17_11_READONLY_PREFLIGHT_2026-11-13.md): PG17.11.0.003/pgcrypto/HMAC verificados **solo lectura**; todavía sin esquema, roles ni ledger Sabora; no se ha instalado ninguna migración real ni verificado `supautils` en DDL.
- Normativa que prevalece sobre esta matriz: [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [titularidad ADMIN única](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [hoja de ruta por hitos integrales](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [validación/observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [diseño aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md). [Matriz H6 de 38 F/R](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) sigue con aceptación por escenario pendiente. Los 19 CV se conservaron; no se reinterpretaron decisiones pendientes.

## Resultado de conciliación

| Hito | Estado de código y pruebas | Lo que aún impide aceptar/operar |
| --- | --- | --- |
| M1 H6 | Candidato PG17/HTTP/Chromium en main; 38 F/R reconciliadas | F20/R03–R05 Stripe proveedor y F28/R09 visual; firma global |
| M2 integración/arranque | Integración de #56/#57/#58 cerrada, 0 PR abiertos, 2/2 post-merge PASS; B2 runtime opt-in candidato | SQL/roles/secretos reales, CV-005 en Supabase, arranque |
| M3 mesas/QR/catálogo | Candidatos M3 integrados, CI de PWA | Aceptación visual y H35-P1 permisos de titularidad por verificar |
| M4 Stripe/caja | SQL/adaptador/efectivo candidatos | Stripe test real, reconciliación, UI caja aprobada |
| M5 producto | PWA instalables, comunicaciones, dashboard, variantes candidatos | Reservas sin parámetros aprobados, Excel/empresa, Gemini, directorio |
| M6 piloto | Laboratorio integrado, preflight PG17.11 solo lectura | Recuperación, DBA/secretos, CA/pooler, firewall Sabora-only, alertas, dos PWA reales y aprobación humana |

**CV-004 queda cerrado únicamente como integración Git. CV-005 está implementado y probado en laboratorio, NO instalado.** CV-010/011 son candidatos de seguridad/recuperación, no garantías operativas. CV-002 es decisión normativa cerrada, no aceptación automática de M1. CV-001/CV-003 y M1 continúan sin firma integral.

**Observación a comprobar en el siguiente hito de gestión:** [H35-P1](SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md) identificó posible discrepancia entre permisos mostrados por HTTP/PWA y titularidad ADMIN actual verificada por SQL. No hay aquí prueba nueva que permita declararlo corregido o como bypass de SQL. Resolver como **un único bloque end-to-end**, solo si la comprobación actual confirma la brecha.

## Plan de ejecución sin duplicidades

1. **Primero:** preparar el **paquete único de instalación y recuperación** según [runbook S38](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md): SHA/99 SQL, DBA opción A, backups restaurables y PITR confirmado, ledger transaccional, 17 slots de identidades (22 si opt-in), custodia/rotación de secretos, CA/endpoint/pooler, condiciones STOP, responsabilidades y evidencia verificable. No crear otro proyecto ni repetir auditorías cerradas por inercia.
2. **Con autorización específica:** migraciones + roles/ledger y verificación real en el Supabase del restaurante, recuperación y STOP si `supautils`/ACL diferencian del laboratorio.
3. **Con autorización VPS separada e aislamiento material:** desplegar Sabora sin conexión/dependencia con Fleetia, probar ingress/egress/alertas y los flujos de ambas PWA y aceptación visual humana.
4. **Cerrar producto completo:** matriz H6, Stripe sandbox/caja, reservas/Excel tras decisiones normativas, Gemini con coste y directorio separado; no presentar piloto acotado como M6 final.

**Ejecutado aquí:** comparación GitHub, actualización documental de 6+19 filas, continuidad y acta; **ningún cambio SQL/runtime, migración, secretos, VPS, Supabase o Fleetia**.
