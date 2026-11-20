# Sabora / CartaViva — continuidad operativa S46 (20-11-2026)

> CONTINUIDAD, NO NORMATIVA NI AUTORIZACIÓN. Prevalecen los contratos normativos vigentes y las decisiones expresas del propietario. Prioridad: primer despliegue de prueba con datos ficticios, sin dependencia del PC doméstico. Un restaurante. No tocar Fleetia ni otros recursos del VPS.

## 1. Relevo y fuentes

- [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) ([candidato PR73](https://github.com/jdlc86/CartaViva/blob/140ee9870cdbe008f26e66c338e6651541cd1e58/docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md)).
- [S45 main](https://github.com/jdlc86/CartaViva/blob/7eb11cee0ceeeaf72e49c3b3ff1ee5530c7d2bb9/docs/handoffs/SESSION_45_HANDOFF_2026-11-20.md), [S45 material S45-10–13](https://github.com/jdlc86/CartaViva/blob/c6c0cf35e1d3098276871013d6c56d089f037c24/docs/handoffs/SESSION_45_HANDOFF_2026-11-20.md), [S45-14 en candidato](https://github.com/jdlc86/CartaViva/blob/140ee9870cdbe008f26e66c338e6651541cd1e58/docs/handoffs/SESSION_45_HANDOFF_2026-11-20.md).
- [AGENTS.md](../../AGENTS.md), [autorización](../SABORA_AUTHORIZATION_GATE.md), [metodología normativa](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [release gobernada](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [S40](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md). Leer normativa aplicable en el SHA que corresponda; no trasladar la excepción candidata a main antes del merge.
- [Guía Antigravity](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente V2](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md). No emitir nuevos encargos sin orden expresa.

## 2. Corte de apertura contrastado directamente en GitHub

- [PR72](https://github.com/jdlc86/CartaViva/pull/72) fusionado: main real [7eb11cee](https://github.com/jdlc86/CartaViva/commit/7eb11cee0ceeeaf72e49c3b3ff1ee5530c7d2bb9), 5/5 checks SUCCESS en ese objeto. Correcciones INT-S45-01/01-R1/02/03 previamente validadas en laboratorio; la cifra histórica 1486 PASS/1 SKIP no se extrapola a PR73.
- [PR73](https://github.com/jdlc86/CartaViva/pull/73) abierto Draft, mergeable, base main anterior, HEAD exacto 140ee9870cdbe008f26e66c338e6651541cd1e58; un commit, ocho archivos (dos de código/pruebas, seis Markdown), +98/-7. Merge de prueba c6ca1b016a3aa0dd1270170eeb31e77cec2301f8, padres base/HEAD; árbol 136269b31d2df6e4326c6867b8674893d03de631. No merge real.
- Evidencia exacta PR73 recuperada por check-runs: [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/44789377732/job/136472692154), [validate](https://github.com/jdlc86/CartaViva/actions/runs/44789377653/job/136472676585), [web](https://github.com/jdlc86/CartaViva/actions/runs/44789377653/job/136472676417), [firmador release](https://github.com/jdlc86/CartaViva/actions/runs/44789377653/job/136472676560), [UI funcional](https://github.com/jdlc86/CartaViva/actions/runs/44789377635/job/136472675381): 5/5 SUCCESS; [visual humana](https://github.com/jdlc86/CartaViva/actions/runs/44789377635/job/136472676661) y [CV005 B2 opt-in](https://github.com/jdlc86/CartaViva/actions/runs/44789377648/job/136472871063) SKIPPED. Se verificaron además los pasos de validate: H6 consolidado PG17/Chromium, builds, Compose, smoke y aislamiento exitosos. No se ejecutaron ni relanzaron CI; no se inspeccionó íntegramente cada log.

## 3. S46-1 — revisión diferencial interna PR73

Contraste del diff de ocho archivos, forma completa de verifyMaterialDossiers, entrada del controlador, driver y ledger en el HEAD exacto. El cambio conserva verificaciones de firma Ed25519, SHA, identidad, vigencia y seis expedientes. La variante explícita vps-only-first-activation exige deploy genesis (history.activeReleaseSha nulo y versions vacío, lector bajo lock del controlador), testDataOnly=true, decisión y evidencia preinstall no nulas/distintas, V2, inventario coincidente, cuatro componentes, dos custodios distintos, réplica VPS única, restore temporal PG17 fuera del VPS, identidad de almacenamiento distinta, mismo ciphertext y hash de prueba distinto, retirada afirmada. La forma dual conserva dos destinos y coincidencia de ciphertext. Las pruebas del diff cubren negativas sobre modo, genesis, rollback, datos, ámbito, identidades, hashes, retirada, custodios y digest firmado; validate verde. No se identificó un bloqueante en el alcance diferencial estático inspeccionado. Dictamen consultivo: candidato apto para considerar integración autorizada, no certificación exhaustiva, ni independencia ni aceptación material. Los hechos de restore, datos ficticios, retirada, custodia y preinstall siguen siendo afirmaciones firmadas que necesitan evidencia real; no crear hashes ficticios. No se firma ni aprueba en nombre del propietario.

## 4. Preparación material heredada y pendientes

Según S45-10/11: volumen dedicado 2 GiB creado, UUID verificado, montaje persistente configurado sin reinicio (arranque real no ensayado), cuenta sabora-backup bloqueada, directorios y guard preparados. No receptor habilitado, ni captura real. Estas son evidencias históricas de preparación, no nueva inspección del host. Receptor/rotación no cambian con PR73. PC doméstico y Tailscale aparcados; queda una única réplica permanente, riesgo de pérdida total del VPS. No es estrategia de recuperación ante desastre. Necesario entorno Linux temporal físicamente fuera del VPS, no GitHub Actions como custodia; claves separadas y autoridades verificadas. No atender clientes ni datos reales hasta restablecer modalidad ordinaria. No reiniciar host/SSH compartidos.

## 5. Plan integral y puertas

| Hito | Estado |
| --- | --- |
| S46-0 relevo y corte GitHub | COMPLETADO |
| S46-1 revisión diferencial PR73 y constatación CI | COMPLETADO en alcance indicado |
| S46-2 integración PR73 y evidencia exact-main | STOP hasta autorización expresa de merge; después CI real y artefactos exactos |
| S46-3 primera preparación material | STOP hasta entorno temporal/custodia, revalidación de recursos Sabora-only y autorizaciones específicas |
| S46-4 captura inicial y recuperación externa | PENDIENTE; plan/activación firmados, origen inicial real, réplica VPS verificada, retirada transitoria acreditada |
| S46-5 SQL y copia V2 | PENDIENTE; autorización SQL separada, 103 migraciones si árbol aprobado lo confirma, restauración PG17 externa, rotación verificada |
| S46-6 release gobernada y recorrido PWA | PENDIENTE; seis expedientes auténticos, secretos, aislamiento, alertas, firma y autorización; validación funcional y visual humana separadas |

No ampliar laboratorios por inercia; reutilizar evidencia solo para su SHA y alcance. No se modifica main ni rama de PR73 al abrir este documento. Se usa la rama auxiliar existente de preparación para preservar los checks del candidato, sin nuevo PR ni CI. No se ha operado sobre VPS, Supabase, Fleetia o secretos. Próxima decisión explícita: autorización de merge PR73 exacto; no equivale a autorización operativa.


## S46-2 — integración autorizada PR73 (20-11-2026)

El propietario respondió «Ok» a la pregunta explícita de autorización del merge del PR73. Se verificó nuevamente HEAD 140ee9870cdbe008f26e66c338e6651541cd1e58, base 7eb11cee0ceeeaf72e49c3b3ff1ee5530c7d2bb9, 5/5 SUCCESS y dos opt-in SKIPPED. Se retiró Draft y se fusionó mediante merge commit con expected_head_sha exacto. GitHub confirma [merge real](https://github.com/jdlc86/CartaViva/commit/3b5cb92c5adf7880ace213f84168dd5e95915793) y main en ese SHA, padres base y candidato; árbol 136269b31d2df6e4326c6867b8674893d03de631 idéntico al merge de prueba. Excepción de réplica única temporal ya integrada; no autorización operativa.

CI exact-main iniciada automáticamente: [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/44797920036), [evidencia release exact-main](https://github.com/jdlc86/CartaViva/actions/runs/44797920145). Cuatro checks en curso y validate en cola al primer corte. No PASS todavía, ni artefactos exact-main aprobados. No relanzar CI por inercia. S46-2 merge COMPLETADO; validación exact-main PENDIENTE. S46-3 sigue STOP para operaciones materiales hasta entorno temporal externo, custodia y autorización propia. No se accedió al VPS/Supabase/Fleetia ni se modificaron secretos. Continuidad en rama auxiliar para preservar el SHA de release.
