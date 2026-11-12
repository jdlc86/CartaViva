# Sabora — S36 · preflight integral de integración del PR #56 (2026-11-11)

**Naturaleza:** informe de revisión técnica propia, **NO revisión independiente**, NO documento normativo y NO autorización de merge/despliegue. El estado de los trabajos se complementa con [continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) y [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). La fuente de verdad normativa son los contratos enlazados abajo.

## 1. Alcance, fuente y precedencia

- Repositorio único: [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva); [PR #56](https://github.com/jdlc86/CartaViva/pull/56), rama `feat/sabora-s35-effective-admin-write-permissions-20261110`, base `main`.
- Normas: [único ADMIN escritor](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [cesión/solicitud resuelta en servidor y rectificación ROOT](../security/ADMIN_WRITE_OWNERSHIP_V1.md), [contrato de operaciones/locks](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [hitos completos PG17/HTTP/Chromium](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [diseño aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [RF](../REQUISITOS_FUNCIONALES.md).
- Rectificación normativa relevante: el texto histórico que permitía ROOT autoasumir titularidad está expresamente superado; **ROOT es gobierno y solo puede reasignar a un ADMIN activo**, sin bypass de escritura ordinaria.
- La finalidad de H35-P1 es eliminar la brecha comprobada en [auditoría S35](SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md): permisos de las vistas no deducidos del mero rol ADMIN, sino de la titularidad SQL actual.

## 2. Comparación Git y revisión de los cambios

**Corte técnico antes del ajuste S36:** PR #56 Draft, `head=27dc70f086a1d51bc14c3f61708740cdef4b0006`, 11 commits/27 archivos. La comparación `branch...main` devolvió siete commits posteriores de `main`, y **solo estas rutas documentales** distintas: `docs/handoffs/SESSION_35_HANDOFF_2026-11-10.md`, `docs/handoffs/SESSION_36_HANDOFF_2026-11-11.md`, `docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md`. **No había un cambio funcional exclusivo de `main`** en este corte, aunque la rama está divergida formalmente y hay que verificar de nuevo antes de integrar. El estado `mergeable` de la API osciló temporalmente y volvió a `true` al reconsultar; no es garantía de aprobación ni estabilidad.

**Revisión de frontera SQL:** `20261110232000_sabora_m3_effective_management_permissions_candidate.sql` calcula permisos:
- **Mesas/QR:** solo ADMIN con `actorId` firmado igual al `owner_user_id` del singleton vigente recibe `configure/qr=true`. Camarero puede conservar `readiness/occupancy`; ROOT y ADMIN no titular sin permisos de escritura ordinaria.
- **Catálogo:** `read_admin_catalog_m3_candidate` usa su propia capacidad `catalog.read`/verificador HMAC, con `permissions.manage` derivado de titularidad; no se acopla a la lectura de Mesas.
- **Comunicaciones:** `read_admin_communications_m5` usa `comms.read`, con la misma regla de propiedad y lectura independiente.
- **Concurrencia/roles:** las funciones bloquean el singleton `FOR SHARE` antes de verificar keyring/personal para seguir el orden de locks de transferencia; RLS y grants se mantienen para roles SQL específicos. La escritura se sigue autorizando en las mutaciones SQL: una bandera UI no crea autoridad.

**Revisión API/PWA:** `m3-management-http.mjs` exige respuesta SQL exacta y booleanos consistentes y no sintetiza escritura por `role==='admin'`. Los modelos `tables-read-model.js` y `m3-catalog-management-model.js` son estrictos/fail-closed. Mesas, Catálogo y Configuración/Comunicaciones dependen de las lecturas individuales firmadas y actualizan por navegación/foco/eventos de titularidad, sin polling. La regla no habilita escritura ROOT.

## 3. Brecha S36 detectada y corregida dentro del mismo PR

**Hallazgo verificable por lectura de código (antes del arreglo):** `CommunicationsView.tsx` recibía el permiso M5 de lectura y conservaba su prop `canWriteAdmin=true` si un POST era rechazado con `403/m3_management_forbidden`. Mostraba mensaje de error, pero **no retiraba el editor en esa misma pestaña** hasta nueva navegación/foco, a diferencia de Catálogo y Mesas. PostgreSQL seguía negando la mutación: **brecha de revocación visual, no bypass demostrado de SQL**.

**Corrección:** [`f4e9d877`](https://github.com/jdlc86/CartaViva/commit/f4e9d8777e46e30642ab98890103fa7469907242) retira de inmediato edición mediante `writeDenied` cuando recibe rechazo de titularidad; también niega provisionalmente después de lectura que ya informa `permissions.manage=false` tras una acción. Solo una lectura posterior de titularidad válida por navegación/foco puede rehabilitar la UI. Sin concesiones por rol ni polling.

**Prueba integrada añadida al recorrido ya existente:** [`ba0530f4`](https://github.com/jdlc86/CartaViva/commit/ba0530f4531e30afa70322d4b967ee49037be2ba) amplía `scripts/ci/ownership-governance-postgres17.test.mjs`: conserva la pestaña del ADMIN viejo en el editor M5, prepara un borrador, ROOT reasigna a ADMIN A por la función real PostgreSQL 17, se intenta guardar en la misma pestaña sin navegar, y se exige que el backend lo rechace, que no se guarde fila en `comms_announcements_m5` y que el editor desaparezca en favor de consulta. En el mismo escenario se mantiene la comprobación A→B, Mesas, Catálogo, rol camarero y otra PWA. **No se creó un microtest separado ni un PR adicional.**

**Estado CI de `ba0530f4` al publicar por primera vez este informe:** el HEAD acababa de iniciar seis workflows; sus resultados finales deben ser observados y registrados en la continuidad 36. **No declararlos PASS por anticipado.**

## 4. Cobertura contrastada antes del nuevo commit y cuestión de outbox

En `27dc70f0`, seis workflows de PR fueron `completed/success`: [Bootstrap #43000775447](https://github.com/jdlc86/CartaViva/actions/runs/43000775447), [Sabora CI #43000775529](https://github.com/jdlc86/CartaViva/actions/runs/43000775529), [gestión #43000775551](https://github.com/jdlc86/CartaViva/actions/runs/43000775551), [cliente #43000775614](https://github.com/jdlc86/CartaViva/actions/runs/43000775614), [CV-012 #43000775460](https://github.com/jdlc86/CartaViva/actions/runs/43000775460) y [cobertura #43000775481](https://github.com/jdlc86/CartaViva/actions/runs/43000775481).

**Evidencia en el log de Bootstrap `130456052138`:** `CV-014: actual PostgreSQL17 → signed Fastify → two Chromium PWAs → published notices, scheduling, roles, events and audit` = `ok 1`; `PG17 single ADMIN writer: signed catalog/table/comms, root denied, transfer/replay fence, no side effects` = `ok 1`; `PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs, transfer, ROOT force and stale writer denial` = `ok 1`.

**Rectificación de una incertidumbre concreta:** se verificó el ejecutor `scripts/ci/catalog-postgres17-node-driver-smoke.sh`; **sí ejecuta `node --test scripts/ci/staff-invitation-outbox-postgres17.test.mjs`** en Bootstrap. El mismo log de `27dc70f0` registra `ok 22 - PG17 fenced dispatch emits canonical envelopes for boundary and long tokens`, exactamente el subtest que sufrió un `40P01` anterior, además de `ok 23`, `ok 24` y `ok 25`. La secuencia de prueba de invitaciones/outbox terminó sin error en ese SHA. **No se ha establecido la causa raíz del deadlock histórico** ni garantizado que no reaparezca; el resultado verde sí acredita que el test concreto se ejecutó y pasó en esa ronda.

## 5. Dictamen y condiciones para cerrar B36-A

**Preflight de contratos y límites:** sin desvío SQL/HTTP grave demostrado en las rutas inspeccionadas. Se detectó y corrigió una inconsistencia de revocación de controles M5 dentro del PR candidato. La revisión es **propia, no independiente**. El runtime ordinario sigue sin activación integral por defecto; el harness PG17 es opt-in y desechable.

**La decisión de integración se difiere hasta constatar las seis CI del nuevo SHA y reevaluar la base actual**. Solo después evaluar el merge con autorización específica, no mediante el éxito de un run antiguo. Si CI falla, diagnosticar y corregir dentro de #56, manteniendo una sola batería integradora como puerta, sin reducir aserciones.

**Puertas ajenas:** auditoría externa/independiente del HMAC/actor SQL actual, aprobación visual humana F28/R09, Stripe sandbox remoto, recuperación M6/PITR, reservas pendientes de contrato y despliegue autorizado con aislamiento completo de Fleetia. No llamar GO del producto a un merge de desarrollo.

**No realizado en este preflight:** merge, cambios normativos, operación sobre Supabase operativo, VPS/Fleetia, secretos, proveedores reales ni despliegue.


## 6. Cierre técnico S36-16 — revisión del HEAD definitivo y candidatura a integración (2026-11-12)

**SHA comprobado de #56:** [`98dfd0607513cc018101d843c97cb3f57baa1ca5`](https://github.com/jdlc86/CartaViva/commit/98dfd0607513cc018101d843c97cb3f57baa1ca5). GitHub devolvió PR `state=open`, `draft=true` en esta consulta, `merged=false` y `mergeable=true` (este último puede oscilar mientras GitHub recalcula). La rama sigue divergida de `main`; la comparación exacta `main...PR` devolvió **20 commits por delante y 51 por detrás**. La comparación inversa `PR...main` halló **9 rutas exclusivas de `main`, todas documentales**, entre ellas la normativa de observabilidad, continuidad 35/36 y tablero. **No se detectaron en ese delta cambios funcionales exclusivos de `main`**. No confundir diferencia documental con permiso de sobrescritura ni con un merge ya realizado.

**CI sobre el mismo SHA final — 6/6 SUCCESS sin ejecuciones pendientes o fallidas:**

| Área | Workflow verificado | Resultado |
| --- | --- | --- |
| H6 PG17/JWT/HMAC/Chromium | [Sabora CI #43130945675](https://github.com/jdlc86/CartaViva/actions/runs/43130945675) | `completed/success` |
| Cadena PG17, Node driver, contenedor aislado | [Bootstrap #43130945669](https://github.com/jdlc86/CartaViva/actions/runs/43130945669) | `completed/success` |
| Cliente Chromium | [Cliente #43130945712](https://github.com/jdlc86/CartaViva/actions/runs/43130945712) | `completed/success` |
| Gestión Chromium | [Gestión #43130945920](https://github.com/jdlc86/CartaViva/actions/runs/43130945920) | `completed/success` |
| Instalabilidad PWA independiente | [PWA #43130945679](https://github.com/jdlc86/CartaViva/actions/runs/43130945679) | `completed/success` |
| Cobertura funcional / contrato visual automatizado | [Cobertura #43130945863](https://github.com/jdlc86/CartaViva/actions/runs/43130945863) | `completed/success` |

**Verificación del contenido de logs:** el job `130894625362` del bootstrap registró `sabora_real_migration_chain_resume_ok:99:20261030200000`, aceptación del recorrido integrado `PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs, transfer, ROOT force and stale writer denial` (`ok 1`), y un test explícito `PG17 customer advisory fence lets a later positive order win without deadlock` (`ok 4`). El job `130894625727` acreditó las puertas de seguridad/configuración/aislamiento, compilación, contenedor aislado y HTTP health. El texto `deadlock` en el log forma parte del **nombre de un test PASS**, no de un error `40P01`. La observación no constituye diagnóstico causal del deadlock histórico de invitaciones/outbox ni su eliminación garantizada.

**Cambios consolidados en el PR desde S36:** además de titularidad efectiva M3/M5 y permisos ADMIN, incluye observabilidad segura y correlación HTTP, señales SQL/events, readiness `/ready=503` en `health-only`, puerta declarativa de 16 controles y un **inventario vinculante de 15/17/22 slots SQL más dos notificadores**, usado por composición y laboratorio; se preserva la condición de login de tipo string y el rechazo de duplicación. **Cada suite se ejecutó sobre el SHA que contiene el conjunto completo**, no se extrapolaron los anteriores.

**Revisión independiente:** la lectura actual de GitHub de `list_pull_request_reviews` devolvió **0 revisiones** y `list_pull_request_review_threads` **0 hilos**. Por tanto, el trabajo está probado en CI, pero **no revisado independientemente**. La revisión propia permite proponer el PR para revisión, no equivale a aprobación de seguridad ni estética humana.

**Dictamen de integración:** **APTO PARA PASAR DE DRAFT A REVISIÓN**, sin evidencias nuevas de conflicto funcional de `main`; **NO AUTORIZADO AUTOMÁTICAMENTE PARA MERGE** porque la normativa de ingeniería y el procedimiento vigente exigen decisión específica. Antes de cualquier merge: obtener aprobación explícita, conservar los 9 documentos de `main`, verificar que GitHub mantiene mergeabilidad al momento del acto, aplicar estrategia de merge que no invalide el SHA auditado, y comprobar CI de `main` tras integrar. Ninguna prueba verde autoriza por sí misma migración SQL, secretos ni VPS.

**Riesgos posteriores que no se resuelven por merge:** bootstrap productivo CV-005 aún ausente (`server.mjs` continúa `health-only`), SQL logins operativos 15/17/22 no provisionados, compatibilidad de 99 migraciones con rol Supabase PG17.11 no superusuario sin comprobar, salida TLS/egress Sabora-only, alertas externas entregadas, backup/restore y RTO/RPO, verificación de las dos PWA en dispositivos y F28/R09 con aprobación humana. Tres contraseñas guardadas por propietario **no deben copiarse ni compartirse**. Sin usuarios reales, puede ensayarse con datos ficticios tras autorización y preservando laboratorio PG17 para depuración.

**Operaciones efectuadas en este corte:** consulta GitHub de diffs, workflows/jobs/logs y revisiones; actualización documental. No hay SQL de escritura, cambios en Supabase, merge, despliegue ni acciones sobre VPS/Fleetia.

---

_Las adiciones y evidencias posteriores deben constar en [continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) con SHA de código y ejecuciones exactas._
