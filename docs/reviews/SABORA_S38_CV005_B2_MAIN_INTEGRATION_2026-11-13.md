# Sabora S38 — integración única de CV-005 y B2 en main

**Fecha:** 2026-11-13. **Naturaleza:** acta de integración Git, **NO normativa** ni autorización de instalación. Ámbito exclusivo `jdlc86/CartaViva`; un restaurante Sabora, sin intervención en Fleetia ni ningún otro proyecto del VPS.

## Decisión y trazabilidad

El propietario autorizó expresamente la incorporación del [PR #58](https://github.com/jdlc86/CartaViva/pull/58) a `main` después de la revisión diferencial con recomendación técnica favorable. Se convirtió el PR de Draft a Ready y se ejecutó **una única fusión GitHub con `merge` (no squash/rebase)** usando `expected_head_sha` para rechazar cualquier avance concurrente.

- **Merge a main:** [`5caad1f39a018e44cb831df62f889a05ce85368d`](https://github.com/jdlc86/CartaViva/commit/5caad1f39a018e44cb831df62f889a05ce85368d). Padre anterior de main `98db015676d1c161228cd01248705f25bc8f2ee5`, segundo padre HEAD #58 `d02fde8d725816393cbf725979ae8a4deb1d80d3`.
- **Integración histórica CV-005 dentro de #58:** [`c3216fecf2133cd1852d3b6d21516308836e6a2d`](https://github.com/jdlc86/CartaViva/commit/c3216fecf2133cd1852d3b6d21516308836e6a2d), padres `31e76b484ec0cc43cbfc929821afa1e9ffa7c100` (B2) y `a60548955d559da7ecc4b686f59c01974298dd46` (CV-005).
- El [PR #57](https://github.com/jdlc86/CartaViva/pull/57) quedó `closed/merged` automáticamente por inclusión de su historial en la fusión de #58. **No se ejecutó una segunda operación de merge**, ni se duplicó la cadena.
- **Verificación de árbol Git en el commit de main:** `supabase/migrations` SHA `d26f1d4fc22acb13b6bda4927c424a74f5164c4a`, idéntico al árbol de las **99 migraciones de CV-005**, sin sustituciones ni overlay.
- **Último SHA con código/normas/pruebas en el candidato:** `ee57c6074a8d06df6172da157d81f81f9a7ed2d6`. Los archivos posteriores en HEAD #58 eran solo cuatro documentos; el quinto archivo diferente en la comparación final de main con `ee57c607` es el acta de integración previa ya alojada en main, también documental. Ni SQL ni ejecutables cambiaron entre el SHA probado y el merge.

## Pruebas y revisión: separar evidencia de aceptación

- **5/5 GitHub Actions PASS en `ee57c607`:** [PG17 no-superuser #43424784850](https://github.com/jdlc86/CartaViva/actions/runs/43424784850), [árbol integrado SQL/HTTP/HMAC/Chromium #43424784656](https://github.com/jdlc86/CartaViva/actions/runs/43424784656), [Sabora CI/H6 #43424784968](https://github.com/jdlc86/CartaViva/actions/runs/43424784968), [Bootstrap #43424784844](https://github.com/jdlc86/CartaViva/actions/runs/43424784844), [UI funcional #43424784893](https://github.com/jdlc86/CartaViva/actions/runs/43424784893). **Job de aceptación visual humana skipped**: no hay conformidad visual definitiva.
- **Codex, alcance diferencial:** [PR #57](https://github.com/jdlc86/CartaViva/pull/57) y [PR #58](https://github.com/jdlc86/CartaViva/pull/58) documentan cierre de seis hallazgos, 63/63 elementos examinados, cero P0–P3 residuales y recomendación técnica `APPROVE` sobre SHA `a6054895` y `ee57c607`. Ambas revisiones son formalmente `COMMENTED`, **NO GitHub `APPROVED`**, porque la identidad de la cuenta es autora. El propietario autorizó la fusión separadamente.
- **CI posterior en main (commit `5caad1f`):** [PG17 non-superuser #43433947114](https://github.com/jdlc86/CartaViva/actions/runs/43433947114) **completed/success**; [Sabora CI #43433947054](https://github.com/jdlc86/CartaViva/actions/runs/43433947054) **en ejecución al primer corte de este acta**; comprobar conclusión real para cerrar este checkpoint. Los workflows de push main se inspeccionaron antes del merge y no incluyen despliegue remoto.
- El entorno de pruebas fue GitHub Actions con PostgreSQL 17 desechable. **No confundir** prueba de código y flujo de integración con compatibilidad de Supabase administrado ni validación de runtime operativo real.

## Frontera de seguridad y próximos STOP

**Estado:** integración Git en `main` **COMPLETADA**; laboratorio de código probado **5/5**; instalación real **NO-GO**. Opción A CV-005 admite solo membresía administrativa de bootstrap DBA sobre owners `NOLOGIN`, con `ADMIN TRUE / SET FALSE / INHERIT FALSE`, grants de migración retirados antes COMMIT; ningún LOGIN runtime miembro de owners y amenaza residual de autoconcesión `SET TRUE` documentada.

**No se ha efectuado** ninguna DDL/migración a Supabase `byhvmumqivmunkmomhup`, alta/rotación de identidades o secretos operativos, despliegue ni reinicio de contenedores VPS, modificación de Fleetia u otros proyectos.

**Próxima fase (preparación y evidencia, no despliegue):** preflight de compatibilidad real con Supabase PostgreSQL **17.11** y `supautils`/cambios incompatibles; custodia y segregación DBA, instalación/ledger sin superusuario, backup cifrado, restauración y PITR, pooler/IPv6, TLS/CA, firewall de egreso **propio y aislado Sabora**, receptores de alertas, y aceptación visual humana de ambas PWA contra el diseño aprobado. No asumir que Docker PG17 reproduce hooks o restricciones administradas. Cualquier DDL o acción de VPS requiere aprobación específica y aislamiento completo; la fusión Git no es esa aprobación.

**Referencias:** [continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [norma de autorización](../SABORA_AUTHORIZATION_GATE.md) · [decisión DBA CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md).
