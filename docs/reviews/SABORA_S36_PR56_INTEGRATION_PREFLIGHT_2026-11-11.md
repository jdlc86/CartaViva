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

---

_Las adiciones y evidencias posteriores deben constar en [continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) con SHA de código y ejecuciones exactas._
