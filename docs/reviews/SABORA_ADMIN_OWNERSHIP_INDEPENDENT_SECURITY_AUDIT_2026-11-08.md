# Sabora — auditoría independiente de seguridad del gobierno ADMIN (08-11-2026)

> **Informe de hallazgos sobre código candidato, NO normativa, autorización de despliegue ni certificación de explotación.** Ámbito exclusivamente `jdlc86/CartaViva`, [PR #52 Draft](https://github.com/jdlc86/CartaViva/pull/52), construido sobre [PR #51 Draft](https://github.com/jdlc86/CartaViva/pull/51). Aislamiento permanente de Fleetia, VPS y Supabase operativo.

## 1. Contratos usados y cobertura de revisión

**Normativa prevalente:** [escritor único ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [titularidad y rectificación ROOT](../security/ADMIN_WRITE_OWNERSHIP_V1.md), [orden transaccional y replay](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [matriz de recursos](../security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md), [identidad SQL](../security/SABORA_SQL_ADMIN_IDENTITY_CONTRACT.md), [hoja de ruta y pruebas de integración](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md). El informe no redefine funciones, roles ni la política aprobada.

Revisados directamente: rutas y composición Fastify opt-in, verificador JWT/membresía actual, emisor HMAC y RPC de titularidad, guarda de escritor único M3/M5, contratos y SQL de invitación/identidad/directorio de personal, PWA Equipo/OwnershipPanel, RLS/ACL y procedimientos de auditoría/notificaciones, pruebas PostgreSQL 17 con identidades físicas mínimas y recorridos H6/Chromium de la misma rama. Esto **no demuestra** un pentest independiente, un inventario exhaustivo de todos los futuros módulos ni operación real de producción.

## 2. Hallazgos críticos demostrables por código y correcciones

| Hallazgo | Evidencia causal | Corrección candidata | Regresión añadida |
| --- | --- | --- | --- |
| **SEC-01 / Alta — HMAC/TTL SQL de cesión** | El RPC `admin_ownership_action_candidate` aceptaba claves JSON `null` que convierten `!~`, `<>` y `IF` a `NULL`; una firma ausente o tiempo nulo podía evitar `RAISE` bajo rol de ejecución SQL | [f819ef84](https://github.com/jdlc86/CartaViva/commit/f819ef847e2d4dfef81b9bc3cebe28b5c7f80c4d): tipos JSON exigidos, comparación `IS DISTINCT FROM`, HMAC no nulo | `ownership-governance-postgres17.test.mjs`, siete capacidades alteradas, comprueba rechazo 42501 y ausencia de propuesta/audit |
| **SEC-02 / Alta — verificador compartido M3/M5** | `verify_management_capability_m3` usado en mesas, QR, catálogo y anuncios repetía comparaciones nulo-indeterminadas; una identidad SQL autorizada para ejecutar su RPC no debía poder omitir el HMAC | [8a894f30](https://github.com/jdlc86/CartaViva/commit/8a894f301766320382fb6e557ef200e16621cb14): migración nueva `20261108160000` sin alterar la historia de PR #51, mismo owner/RLS/EXECUTE | `admin-single-writer-postgres17.test.mjs`: tres familias de escritura, seis alteraciones por familia y no persistencia |
| **SEC-03 / Alta — ciclo de personal/directorio** | `transition_staff_lifecycle_with_identity_candidate`, `...with_directory_candidate` y `read_staff_directory_authorized_candidate` no rechazaban de forma explícita la firma nula; los acumuladores byte a byte también podían quedar en `NULL` | [e49bef60](https://github.com/jdlc86/CartaViva/commit/e49bef60c5cd3f40f733226fa268f38b2bbc1628): nueva migración `20261108170000` reemplaza solo tres funciones conservando ACL, propietario NOLOGIN y forma funcional | `staff-directory-postgres17.test.mjs`: invitación sin firma no persiste, directorio sin firma no retorna datos |
| **SEC-04 / Contrato de concurrencia — orden de locks** | En la cesión se bloqueaba una propuesta antes de completar `staff_members FOR UPDATE` del destinatario, distinto de singleton → staff UUID ordenados → propuesta | [d7dfa983](https://github.com/jdlc86/CartaViva/commit/d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1): leer destinatario provisional sin lock, bloquear conjunto bounded de staff por UUID, revalidar rol y después bloquear/revalidar propuesta | Caso integrado PG17 existente de dos aceptaciones concurrentes; regresión H6 y gates SQL del mismo SHA |

**Condición para explotar:** no se ha observado un ataque a través del HTTP público, donde el backend genera las capacidades. El fallo comprobado está en la frontera **SQL SECURITY DEFINER**, que debe rechazar entradas manipuladas incluso si un login runtime o emisor intermedio se usa mal. No confundir esta vulnerabilidad de validación SQL con exposición pública confirmada.

**Sin alterar normativa:** ROOT sigue sin titularidad ni escritura administrativa ordinaria; las operaciones de cocina/sala mantienen controles propios; no hay nuevas credenciales operativas, grants a navegador, bypass RLS, cambios de asientos económicos ni conexión a sistemas externos.

## 3. Controles inspeccionados y límites

- **Identidad:** JWT validado por la API, consulta durable y actual de `staff_members` para las rutas de gestión; la función SQL comprueba firma, sesión física `session_user`, usuario, rol activo y el cuerpo asociado, sin confiar en un `actorId` del navegador.
- **Escritor único:** M3/M5 bloquean singleton compartido para escrituras, comparan ADMIN activo y titular. ROOT puede recuperar por el RPC de gobierno con motivo, pero no modificar ordinariamente la carta. La transferencia invalida autorizaciones de escritura anteriores aunque el JWT siga válido; el simple replay de una operación económica/administrativa no debe crear efectos nuevos.
- **Integridad:** gobierno y notificaciones se persisten en la misma transacción, con auditoría append-only y reintentos por correlación exacta; se usan RLS forzada, roles propietarios NOLOGIN, funciones con EXECUTE limitado. Las denegaciones no se presentan como asientos de éxito.
- **Comportamiento visual:** la PWA Equipo sólo ofrece decisiones según la proyección autorizada. Su estilo aún necesita conformidad con el diseño humano aprobado; capturas/axe/Playwright no la otorgan. Los avisos de titularidad actuales son durables con refresco, no push en tiempo real.
- **Limitaciones:** revisar independiente y explícitamente los permisos de nuevas operaciones futuras; los tests negativos añadidos se integran en el mismo PostgreSQL 17 y no sustituyen el recorrido global. No certificar Stripe sandbox, pruebas con personas, recuperación M6 ni auditoría externa por una cadena CI.

## 4. Estado de validación y puerta de cierre

**Base anterior:** `bea0851c190d993464918e664824fd6b5b7bbe39` pasó **6/6** GitHub Actions, pero precede estos hallazgos y **no prueba la corrección**. El último SHA funcional de reparación **a validar** es [`d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1`](https://github.com/jdlc86/CartaViva/commit/d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1). **CI iniciado; no atribuir éxito antes de consultar los resultados de todas las seis ejecuciones para ese SHA.** Requerir Bootstrap PG17 con los nuevos casos de firmas nulas, H6 integrado, dos PWA, gestión, cliente y gate funcional; corregir cualquier error causal y repetir la cadena completa.

**Decisión provisional: REVISIÓN DE SEGURIDAD CON REMEDIACIÓN EN CURSO / NO-GO.** Después del 6/6 final, el código podrá considerarse **técnicamente candidato** para revisión humana/independiente y decisión explícita de PR/merge; no es GO productivo. F28/R09 visual, CV-014 reservas/llamada camarero, M4 Stripe test y M6 operación continúan pendientes. Sin merge ni despliegue.

[Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [continuidad sesión 30](../handoffs/SESSION_30_HANDOFF_2026-11-08.md) · [informe funcional previo PR #52](SABORA_ADMIN_OWNERSHIP_GOVERNANCE_INTEGRAL_CANDIDATE_2026-11-08.md).

## 5. Cierre técnico de las remediaciones SEC-01 a SEC-04 — mismo SHA, seis pruebas verdes

**Actualización que sustituye la situación provisional de §4:** las seis ejecuciones de GitHub Actions del **SHA FUNCIONAL** [`d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1`](https://github.com/jdlc86/CartaViva/commit/d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1) han concluido `completed/success`. No extrapolar el CI a los commits documentales posteriores.

| Comprobación, mismo SHA funcional | Resultado y referencia |
| --- | --- |
| [Bootstrap PostgreSQL 17 y Node driver](https://github.com/jdlc86/CartaViva/actions/runs/42521463148) | **SUCCESS**; migraciones aplicadas, rechazo HMAC nulo de personal/directorio, M3/M5 escritor único y recorrido JWT/HMAC/Fastify/Chromium de cesión; subtests protegidos `ok` en los logs |
| [H6 consolidado](https://github.com/jdlc86/CartaViva/actions/runs/42521463167) | **SUCCESS**; Bloque 1 contratos, Bloque 2A PG17/RLS/privilegios y Bloque 2B PG17/HMAC/concurrencia/Chromium, todos `PASS` |
| [CV-012 dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42521463163) | **SUCCESS** |
| [Navegador gestión](https://github.com/jdlc86/CartaViva/actions/runs/42521463175) | **SUCCESS** |
| [Navegador cliente](https://github.com/jdlc86/CartaViva/actions/runs/42521463189) | **SUCCESS** |
| [Control funcional↔UI](https://github.com/jdlc86/CartaViva/actions/runs/42521463203) | **SUCCESS** |

**Comprobación específica de nuevos escenarios de seguridad en los registros del Bootstrap:** `PG17 staff identity and directory SQL reject NULL signed capabilities without writes or disclosures` → `ok 2`; `PG17 single ADMIN writer: signed catalog/table/comms, root denied, transfer/replay fence, no side effects` → `ok 1`; `PG17 JWT/HMAC Fastify and management Chromium: ownership requests, transfer, ROOT force and stale writer denial` → `ok 1`. Los resultados H6 confirman que el bloque 2B de regresión sigue pasando con el nuevo SQL.

**Decisión auditora limitada:** SEC-01 a SEC-04 corregidos en código y **técnicamente validados por el CI integrado aislado**; la auditoría crítica de código de este alcance ha concluido. **No se certifica pentest externo, auditoría independiente de terceros, aprobación visual humana F28/R09, funcionamiento de Stripe real, operación M6 ni GO productivo**. Mantener PR #52 **Draft**, sin merge, despliegue, migraciones Supabase operativas ni modificación de Fleetia/VPS. Pasar a revisión externa/humana y decisión expresa según la normativa.
