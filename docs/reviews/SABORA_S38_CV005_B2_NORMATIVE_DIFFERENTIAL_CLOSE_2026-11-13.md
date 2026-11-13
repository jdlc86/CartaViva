# Sabora S38 — conciliación P0/CV-005 y revisión diferencial del árbol integrado

**Fecha:** 2026-11-13 · **Naturaleza:** verificación técnica diferencial realizada por el agente que preparó la integración. **NO sustituye revisión de seguridad verdaderamente independiente, no es aprobación de merge, migración ni despliegue.** Ámbito: un único restaurante Sabora en `jdlc86/CartaViva`, sin tocar Fleetia.

## 1. Referencias y límite exacto

- PR [#57 CV-005](https://github.com/jdlc86/CartaViva/pull/57), SHA `a60548955d559da7ecc4b686f59c01974298dd46`: cadena de 99 migraciones, 61 modificadas respecto a `main`.
- PR [#58 B2](https://github.com/jdlc86/CartaViva/pull/58), código anterior `31e76b484ec0cc43cbfc929821afa1e9ffa7c100`.
- [Commit Git real de dos padres](https://github.com/jdlc86/CartaViva/commit/c3216fecf2133cd1852d3b6d21516308836e6a2d) `c3216fecf2133cd1852d3b6d21516308836e6a2d`; 99 blobs SQL con el mismo SHA de subárbol `d26f1d4fc22acb13b6bda4927c424a74f5164c4a` que CV-005. [Acta de laboratorio 5/5 de ese SHA](https://github.com/jdlc86/CartaViva/blob/main/docs/reviews/SABORA_S38_CV005_B2_REAL_GIT_INTEGRATION_CANDIDATE_2026-11-13.md).
- **Nuevo SHA de cambio normativo/test** `ee57c6074a8d06df6172da157d81f81f9a7ed2d6`: frente a `c3216fec`, exactamente **dos archivos cambiados**: `docs/SABORA_AUTHORIZATION_GATE.md` y `tests/cv005-normative-authority-boundary.test.mjs`. **No cambia migraciones, permisos efectivos, API, egress, secretos ni Compose**. **Regresión final verificada: 5/5 GitHub Actions completed/success en ese mismo SHA.** La aceptación visual humana permanece \`skipped\`.

## 2. Conflicto P0 histórico resuelto documentalmente, sin conceder privilegios

La [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md) decía en una etapa temprana «LOGIN sin membresías y cero grants» y «keyring vacío, sin EXECUTE runtime», pero **ella misma etiquetaba ese régimen como temporal**. La [decisión normativa CV-005, opción A](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md), aprobada por el propietario para el diseño y no para instalación, admite **exclusivamente** la membresía de administración automática que PostgreSQL 17 concede al DBA instalador `CREATEROLE/NOSUPERUSER` sobre roles `NOLOGIN`, con `ADMIN TRUE, SET FALSE, INHERIT FALSE`, y exige revocar cada grant temporal antes de `COMMIT`.

La nueva sección de conciliación y dos anotaciones de alcance histórico en `docs/SABORA_AUTHORIZATION_GATE.md` documentan: la excepción de **DBA, no de runtime**; ningún LOGIN API/cliente/gestión/cocina/sala/notifier miembro de un owner `SECURITY DEFINER`; denegaciones de DDL/propietario/keyring/lecturas generales y `PUBLIC/anon/authenticated`; privilegios positivos solo bajo su propio contrato aprobado, HMAC y preflight PG17; amenaza residual explícita de **autoconcesión de `SET TRUE` por el DBA**. Ni la excepción ni este documento conceden nuevos permisos o autorizan operaciones.

Se añadió prueba de deriva documental crítica `tests/cv005-normative-authority-boundary.test.mjs`, dentro del patrón existente `tests/*.test.mjs` de `pnpm test`: afirma semántica DBA exacta, límites de runtime, frontera HMAC y el carácter provisional del veto. Es **una prueba textual de preservación de norma**; la seguridad real depende de los tests de SQL/PG17 ya existentes.

## 3. Revisión diferencial técnica efectivamente realizada

| Límite | Fuente contrastada | Resultado del examen; limitación |
| --- | --- | --- |
| Membresías y owners | `scripts/ci/supabase-nonsuperuser-migration-smoke.sh` y `postgres-migration-harness-contract.test.mjs` | El harness comprueba `pg_auth_members` **tras cada una de las 99 versiones** y solo admite la membresía DBA bootstrap exacta, con `NOLOGIN` owners; un LOGIN separado `NOBYPASSRLS/NOCREATEROLE` debe fallar en `SET ROLE` al owner y en lectura directa. Sigue sin existir verificación de `supautils` gestionado ni custodia de DBA real. |
| Atomicidad de ledger | `scripts/ci/postgres-migration-chain-smoke.sh` | Versión única transaccional y checksum diferido; pruebas de interrupción antes de COMMIT, reanudación e idempotencia. No demuestra instalación operativa en Supabase. |
| Restauración de authority | `scripts/ci/postgres-recovery-smoke.sh` | Guarda y compara `grantor`, `admin_option`, `set_option`, `inherit_option` en restauración de laboratorio; tests de arista inesperada; no valida restauración real/PITR del proveedor. |
| Arranque HTTP | `apps/api/src/operational-server.mjs`, `operational-runtime.mjs`, `m2-restaurant-candidate.mjs` | Manifiesto/política y JWKS/SQL/notifiers antes de abrir listener, `/ready` se degrada ante pérdida de notifier. Comprobado en baterías del SHA `c3216fec`; no equivale a prueba en la infraestructura operativa. |
| Transporte y aislamiento | `apps/api/src/sabora-egress-gateway.mjs`, `deploy/compose.sabora-operational.yml` | TLS/SNI, restricciones de rangos especiales IPv4/IPv6 y red de egreso filtrada **externa y preprovisionada**; no se ha probado el firewall/VPS Sabora-only. |
| Identidad cliente/pagos/visual | Acta H6, pruebas PG17/HTTP/Chromium y job UI funcional | Laboratorio 5/5 en `c3216fec`, validación humana visual `skipped`; nada en este informe acredita un proveedor real, aceptación humana o función desplegada. |

**No se ha identificado un hallazgo P0–P3 NUEVO en los dos archivos del delta documental**, dado que no cambian autoridad efectiva. Esto **no es** un certificado «sin vulnerabilidades» del conjunto de 111 archivos revisados previamente, ni una revisión independiente. Los reviews GitHub #57/#58 son `COMMENTED` sobre SHAs anteriores y los comentarios de remediación no constituyen un `APPROVED` sobre el nuevo árbol.

## 4. Puerta pendiente: revisor distinto y resultado verificable

Un revisor **no autor** del merge ni de la conciliación debe emitir nuevo dictamen para el **SHA final**, verificando primero los SHAs y la revisión de las dos correcciones anteriores. Puede basarse en los informes previos para una revisión **diferencial focalizada**, pero debe inspeccionar las interacciones entre código y SQL reales, ACL/HMAC, fallos y contratos, y decidir expresamente `APPROVE`, `REQUEST_CHANGES` o `COMMENT`. Su revisión deberá señalar archivos/líneas y registrar la excepción DBA/amenaza de autoconcesión y las lagunas del proveedor. El autor del código **no se autoaprueba**.

**STOP hasta entonces:** PR #57 y #58 continúan Draft; sin integración en `main`, sin migraciones, roles o secretos en Supabase, sin despliegue/reinicio en VPS, sin cambios en Fleetia ni terceros. Falta preflight de compatibilidad real `PG17.11/supautils`, respaldo/restauración custodiados, CA/endpoint/pooler, firewall Sabora-only, alertas reales y aceptación de la interfaz aprobada.

## 5. Verificación final de SHA normativo + enlace al encargo independiente (2026-11-13)

Se consultaron nuevamente las cinco ejecuciones del **SHA de código/norma `ee57c6074a8d06df6172da157d81f81f9a7ed2d6`**: [PG17 99/99 #43424784850](https://github.com/jdlc86/CartaViva/actions/runs/43424784850), [árbol único SQL/API/Chromium #43424784656](https://github.com/jdlc86/CartaViva/actions/runs/43424784656), [CI/H6 #43424784968](https://github.com/jdlc86/CartaViva/actions/runs/43424784968), [Bootstrap #43424784844](https://github.com/jdlc86/CartaViva/actions/runs/43424784844) y [UI funcional #43424784893](https://github.com/jdlc86/CartaViva/actions/runs/43424784893) terminaron **`completed/success` (5/5)**, sin pasos fallidos. El job `visual-final-acceptance-gate` se omitió intencionadamente. La comparación entre `ee57c607` y `7a249909` acreditó **solo 3 archivos documentales**, ninguna SQL, API, PWA, test ni Compose posterior. La documentación nueva no revalida la infraestructura real.

**Siguiente puerta que no firma el autor:** [encargo independiente sobre el árbol Git definitivo](../assignments/SABORA_S38_FINAL_INDEPENDENT_REVIEW_INTEGRATED_SHA_2026-11-13.md). Se exige revisor materialmente distinto, veredictos explícitos para #57/#58, examinar la interacción y el delta normativo, registrar residual DBA y STOP operativos. No registrar `APPROVED` ficticio por disponer de 5/5 CI.

**Referencia histórica anterior (ya resuelta):** comprobar el [SHA de norma/test](https://github.com/jdlc86/CartaViva/commit/ee57c6074a8d06df6172da157d81f81f9a7ed2d6) en Actions del PR #58 para confirmar cinco `success`; las ejecuciones del SHA `c3216fec` fueron 5/5, pero no se deben atribuir automáticamente al SHA posterior.
