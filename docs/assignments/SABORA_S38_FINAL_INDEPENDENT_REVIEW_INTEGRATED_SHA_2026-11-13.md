# Sabora / CartaViva — encargo final INDEPENDIENTE sobre árbol Git integrado #57 + #58

**13-11-2026 · ENCARGO PENDIENTE.** Este documento NO es dictamen de auditoría, aprobación, merge o autorización operativa. Repositorio único `jdlc86/CartaViva`. Un restaurante, Sabora. **Prohibido intervenir Fleetia, contenedores ajenos, Supabase operativo o el VPS.**

## 1. Identidad y procedencia del revisor

El revisor debe ser una persona o agente **materialmente distinta de quien implementó/corrigió el código y creó el merge o la conciliación normativa**. El hecho de que un comentario se publique con la misma cuenta `jdlc86` NO acredita esa independencia por sí solo. Registrar nombre o identidad operacional del revisor (sin datos secretos), entorno, fecha, alcance, ausencia de autoría del objeto y evidencia de la comparación efectuada. Si no puede acreditarse independencia: emitir **revisión técnica sin aprobación independiente**, jamás `APPROVED` ficticio.

Verificar antes `git status --short --branch`, `git fetch --prune origin` y HEAD remoto. Preservar cambios locales. No `reset --hard`, `git clean`, force-push, merge de ramas o nuevo PR. Para inspección aislada preferir `git show`, `git diff` y worktree de solo lectura.

## 2. Referencias inmutables y alcance exacto a revisar

- [PR #57](https://github.com/jdlc86/CartaViva/pull/57), CV-005 corregido: **`a60548955d559da7ecc4b686f59c01974298dd46`**; 99 migraciones de cadena, **61 SQL modificados frente a main**, 70 archivos del PR. [Dictamen anterior](https://github.com/jdlc86/CartaViva/pull/57#pullrequestreview-5884681593) y [remediación](https://github.com/jdlc86/CartaViva/pull/57#issuecomment-6847059139).
- [PR #58](https://github.com/jdlc86/CartaViva/pull/58), B2 corregido **`31e76b484ec0cc43cbfc929821afa1e9ffa7c100`**. [Dictamen anterior](https://github.com/jdlc86/CartaViva/pull/58#pullrequestreview-5884690400) y [remediación](https://github.com/jdlc86/CartaViva/pull/58#issuecomment-6851770477).
- **Commit integrado real de dos padres** [`c3216fecf2133cd1852d3b6d21516308836e6a2d`](https://github.com/jdlc86/CartaViva/commit/c3216fecf2133cd1852d3b6d21516308836e6a2d), árbol `bf2d2f064ad8734b975c8bbfbdbc7ba938e6edca`. La totalidad de las **99 migraciones** tiene exactamente el mismo subárbol `d26f1d4fc22acb13b6bda4927c424a74f5164c4a` de CV-005; no hay overlay SQL temporal.
- **Último SHA de contenido normativo y pruebas:** [`ee57c6074a8d06df6172da157d81f81f9a7ed2d6`](https://github.com/jdlc86/CartaViva/commit/ee57c6074a8d06df6172da157d81f81f9a7ed2d6). Respecto a `c3216fec`, **solo `docs/SABORA_AUTHORIZATION_GATE.md` y `tests/cv005-normative-authority-boundary.test.mjs`**. Los commits posteriores al SHA de código y norma son documentales: inspeccionar HEAD del PR #58 antes del dictamen y anclarlo expresamente; no dar por hecho que sigue igual.
- [Expediente de integración y CI](https://github.com/jdlc86/CartaViva/blob/main/docs/reviews/SABORA_S38_CV005_B2_REAL_GIT_INTEGRATION_CANDIDATE_2026-11-13.md) y [examen diferencial hecho por el autor](../reviews/SABORA_S38_CV005_B2_NORMATIVE_DIFFERENTIAL_CLOSE_2026-11-13.md). **No confundir estos expedientes con revisión independiente**.

## 3. Pruebas efectivamente ejecutadas, del SHA `ee57c607`

Comprobar en GitHub, **todas completed/success**:
1. [PG17 CV005 no-superuser, 99/99 SQL, #43424784850](https://github.com/jdlc86/CartaViva/actions/runs/43424784850).
2. [PG17 + HTTP + HMAC + Chromium + dos PWA sobre árbol Git real #43424784656](https://github.com/jdlc86/CartaViva/actions/runs/43424784656).
3. [Sabora CI/H6 #43424784968](https://github.com/jdlc86/CartaViva/actions/runs/43424784968).
4. [Bootstrap, TLS/JWKS y recuperación PG17 #43424784844](https://github.com/jdlc86/CartaViva/actions/runs/43424784844).
5. [UI funcional #43424784893](https://github.com/jdlc86/CartaViva/actions/runs/43424784893), **job de aceptación visual humana `skipped`**.

**Cinco workflows verdes prueban SOLO laboratorio.** No acreditan Supabase 17.11/`supautils`, autoridad real DBA, secretos ni firewall real, recovery/PITR de proveedor, Stripe real, aprobación de seguridad o diseño visual. El resultado de código no cambia con los posteriores commits solo documentales; aun así, registrar la comparación de blobs antes de usar esa inferencia.

## 4. Alcance diferencial obligatorio para la firma final

**Normas:** `docs/SABORA_AUTHORIZATION_GATE.md`; `docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md`; `docs/security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md`; `docs/architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md`; diseño visual aprobado y flujos normativos. Los handoffs NO crean reglas.

**CV-005 DBA/SQL:** revisar reparación de P1 previos: admisión fail-closed del perfil observado `CREATEROLE/NOSUPERUSER/BYPASSRLS`; `sabora_migration_meta.applied_migrations`, 99 transacciones únicas con ledger SHA256 atómico e interrupción **antes de COMMIT**; scopes y revocaciones de `SET/INHERIT/CREATE` antes de cada COMMIT; auditoría tras **cada versión** de todo `pg_auth_members`, owners `NOLOGIN`, RLS forzada, `SECURITY DEFINER`/`search_path`/RPC/ACL. Demostrar negativas con LOGIN realmente restringido y que los 61 SQL cambiados no alteraron derechos previstos. CV-005 opción A permite **solamente** el grant DBA bootstrap `ADMIN TRUE/SET FALSE/INHERIT FALSE`, **no** runtime→owner; un DBA puede autoconcederse `SET TRUE` y comprometer owner. No minimizar esa amenaza.

**B2 recuperación/red/runtime:** comprobar que backup/restore preserva `grantor/admin/set/inherit`, incluidos miembros fuera del prefijo Sabora y DBA; que ambos notifiers hacen que `/ready` baje irreversiblemente tras pérdida y que el startup no revierta esa pérdida; TLS PG SSLRequest/SNI/CA/hostname y JWKS, IPv6 CIDR/rangos especiales/DNS mixto; igualdad de destinos/puertos/manifiesto/política de egress; Compose fail-closed con red externa Sabora-only **que por sí misma NO es firewall**; secretos, RLS, 17 capacidades + 2 LISTEN y cierres parciales. Contrastar con pruebas integradoras PG17/HTTP/Chromium y los dos PWA. Prohibido tocar recursos de Fleetia para comprobarlo.

**NUEVA norma/test desde `c3216fec`:** revisar palabra por palabra la conciliación de cero grants P0 **provisional** con autoridad CV-005 **solo para el instalador DBA**. Comprobar que `tests/cv005-normative-authority-boundary.test.mjs` realmente corre en `pnpm test` y no sustituye al laboratorio de privilegios. No reinterpretar los contratos para adaptarlos al código: reportar incoherencias reales con archivo/línea/decisión previa.

**Integración Git real:** confirmar padres `31e76b` y `a605489`, subárbol de 99 SQL igual al de CV-005, que el workflow integrado no copie/reescriba SQL y que no haya colisiones de normas de `main`. Los informes y el texto de PR se encuentran en parte en SHAs anteriores; prevalece contenido de código y norma del SHA inmutable.

## 5. Salida exigible para cerrar la puerta

- Tabla hallazgo | severidad P0/P1/P2/P3 | norma literal | archivo y línea | evidencia reproducible | efecto | corrección o riesgo residual. **No** declarar genéricamente «sin hallazgos» sin describir el alcance y los riesgos aceptados.
- Dictamen de código y seguridad separado para **PR #57** y **PR #58**, especificando SHA(s) auditados, procedencia del revisor y `APPROVE` / `REQUEST_CHANGES` / `COMMENT` según el sistema. Si el revisor usa el mismo usuario GitHub autor, explicar cómo se acreditó independencia operacional: un comentario con la misma identidad no prueba aprobación de tercero.
- Diferenciar: (a) **GO de laboratorio** con 5/5 del SHA `ee57c607` y solo documentación posterior; (b) **integración `main`**, sujeta a aprobación posterior del propietario; (c) **instalación real**, bloqueada hasta examen de `supautils`, backups+restore/PITR, DBA/ledger, red TLS/CA, egress firewall Sabora-only, alertas y aceptación visual.
- Publicar expediente y enlaces en **los PR existentes**, sin nuevos PR ni cambios de contenido en el objeto auditado durante la revisión; si surge defecto, registrarlo primero y corregir en #58 (o #57 si es exclusivamente origen CV-005) con encargo claro; **nueva regresión en SHA corregido**.
- **No efectuar merge, migración/DDL, secretos, despliegue ni reinicios**. No modificar Fleetia ni recursos de ningún otro proyecto.

**Resultado esperado:** dictamen independiente y verificable sobre el **árbol final**, o informe crítico con bloqueos concretos. No autoaprobar.
