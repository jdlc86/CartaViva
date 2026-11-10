# Sabora H6 — Bloque A: auditoría ejecutable y arquitectura de raíz

**Fecha:** 2026-10-30  
**Rama:** `integration/sabora-h6-end-to-end-pilot-20261030`  
**Estado:** PASS para la puerta A; el hito completo continúa NO-GO hasta B–E.  
**Autoridad:** `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`. Los documentos de asignación se usaron solo como hoja de trabajo.

## Causa raíz comprobada

La causa no es un único guard. En `20261027122858_sabora_h6_events_payments_operations_candidate.sql`, `confirm_customer_round_h6_candidate` persiste primero el pedido y después obtiene o crea `customer_accounts` con una identidad que mezcla mesa, sesión, visita y cliente. Esto permite dividir la identidad económica en dos cuentas. La protección posterior de `20261030143000_sabora_h6_cross_table_account_guard_candidate.sql` evita esa división, pero confunde una cuenta antigua abierta con continuidad vigente y bloquea una visita nueva legítima.

La alternativa de actualizar la ubicación de la cuenta tampoco es válida: `read_customer_round_h6_candidate` exige simultáneamente que pedido, cuenta, mesa, sesión y visita coincidan. Al mover esos campos, la ronda histórica deja de ser legible tanto desde su origen histórico como desde el nuevo destino. Las cuatro condiciones están reproducidas contra el catálogo real en `scripts/ci/table-change-root-postgres17.test.mjs`.

## Dependencias efectivas auditadas

| Raíz / consumidor | Relación efectiva | Decisión de refactor |
| --- | --- | --- |
| `customer_accounts` | Identidad económica, saldo, modo de pago y estado; ubicación embebida en `table_id/session_id/visit_key` | `id` seguirá estable. La ubicación original no se usará como destino operativo mutable. |
| `order_rounds` | FK a cuenta y pedido; conserva agrupación y estado | No cambiar cuenta, plazo ni estado durante el traslado. Añadir una proyección explícita de entrega, no alterar origen. |
| `payment_attempts`, `cash_settlements` | FK estable a cuenta/ronda | No mover ni recrear; Stripe, claves de idempotencia y resultados ambiguos permanecen intactos. |
| `orders`, `order_lines` | Mesa/sesión/visita históricas y estados `confirmed/preparing/ready/picked_up` | `orders.table_id` nunca se reescribe. Solo líneas no terminales necesitan nuevo destino operativo. |
| `kitchen_dispatches` | FK a ronda/pedido, sin destino de entrega | Mantener la expedición histórica; sala/cocina leerán la proyección de destino separada. |
| `pickup_tasks` | `ready/claimed/corrected`; `claimed` es asignación, no entrega física | `ready` y `claimed` siguen pendientes; `corrected` y líneas `picked_up` no se trasladan. No se reinicia claim ni versión. |
| `event_outbox` | Alcance mesa/sesión/visita/cliente/cuenta y audiencia | No reescribir eventos. Emitir eventos de traslado post-commit dentro de la misma transacción de negocio, con cursor nuevo y alcances origen/destino explícitos. |
| `customer_table_change_requests` | Cuenta y origen exactos; ventana, decisión y consumidor | La aprobación identifica la única cuenta elegible. El destino no se fija hasta la confirmación y el consumo es único. |
| Node/API | allowlists exactas, transacción H6 y `applyTransfer` deshabilitado | La confirmación raíz será la única frontera de escritura; no habrá actualización compensatoria desde Node ni SQL libre. |
| RLS/roles/preflight | funciones `SECURITY DEFINER`, roles H6 separados, sin DML directo | Mantener `FORCE RLS`, propietarios sin login, `search_path` fijo y grants exclusivamente `EXECUTE`. |

También se revisaron lectores de sala/cocina, pickup, backlog SSE, cobro y replay. Hoy derivan el destino de la mesa histórica o de la cuenta embebida; por ello B y C deberán migrarlos conjuntamente, no solo la ruta nueva.

## Modelo aprobado para implementar en B

1. **Identidad económica estable:** `customer_accounts.id` y todas sus FKs permanecen inmutables. La cuenta se crea una sola vez para la primera confirmación de una visita económica o se selecciona únicamente mediante coincidencia exacta de su vínculo operativo actual o una concesión aprobada que referencia esa cuenta. Nunca se elige “cualquier cuenta abierta” por `customer_id`.
2. **Origen histórico:** `orders.table_id/session_id/customer_visit_key`, rondas, pagos, expediciones y eventos ya emitidos son inmutables.
3. **Vínculo operativo actual:** una representación explícita y versionada une la cuenta a mesa, sesión y visita actuales. Es el ámbito autorizado para próximos pedidos y SSE del cliente.
4. **Destino de entrega:** una proyección por ronda/pedido conserva el destino vigente de trabajo. Solo se actualiza si hay líneas pendientes (`confirmed`, `preparing`, `ready`) o pickup `ready/claimed`; `picked_up` y `corrected` quedan históricos.
5. **Continuidad verificable:** un permiso aprobado referencia cuenta y sesión cliente solicitante exactas. Una visita posterior sin permiso puede crear su propia cuenta aunque exista una cuenta antigua abierta; no hereda deuda solo por compartir `customer_id`.
6. **Idempotencia:** un replay recupera primero `order_rounds.account_id`. Nunca recalcula cuenta a partir de la mesa actual, vuelve a consumir permiso, crea cobro, reexpide cocina o emite eventos duplicados.

La migración B deberá rellenar vínculo y destino desde las filas actuales, imponer FK/UNIQUE/CHECK, y abortar si encuentra ambigüedades; no corregirá datos silenciosamente.

## Frontera y orden global de bloqueos

Una única transacción SQL hará revalidación, selección/creación de cuenta, persistencia, consumo y proyección. Orden obligatorio:

1. sesión cliente y perfil;
2. advisory lock estable por cliente;
3. visita y mesa destino, incluida versión QR y estado operativo;
4. vínculo/cuenta económica candidata;
5. solicitud aprobada exacta, si el destino difiere;
6. intento idempotente y pedido/ronda existentes;
7. destinos pendientes ordenados por UUID;
8. pedido, ronda, pago/dispatch y nuevos eventos.

Tras cualquier espera se vuelven a comprobar reloj del servidor, revocación, cierre, QR, mesa, visita, cuenta y concesión. Una excepción revierte pedido, cuenta, consumo, destino y outbox. La misma jerarquía se aplicará a decisión/cierre/revocación para evitar inversión de locks.

## Evidencia PostgreSQL 17 aislada

Comando ejecutado desde el workspace, con contenedor, red, roles y módulo `pg` efímeros propios:

```powershell
$env:GITHUB_ACTIONS='true'
$env:GITHUB_RUN_ID='table-change-block-a-rerun'
$env:RUNNER_TEMP=(Resolve-Path '.tmp\table-change-block-a-rerun').Path
& 'C:\Program Files\Git\bin\bash.exe' scripts/ci/catalog-postgres17-node-driver-smoke.sh
```

Resultado final: exit code `0`. El bloque nuevo obtuvo **4 PASS / 0 FAIL**:

- grafo real FK/columnas/RLS y orden defectuoso de la función;
- dos cuentas abiertas del mismo cliente en mesas y sesiones distintas, saldo dividido `2400 + 1800`;
- ronda histórica ilegible tras la mutación ingenua de ubicación;
- visita nueva legítima bloqueada por el guard provisional, sin efectos parciales.

El mismo comando volvió a ejecutar las migraciones desde cero y todas las suites PG17 existentes, además del flujo Chromium/JWT H3/H4 y H6 restringido. Entre las puertas registradas: operaciones **8/8**, identidad firmada **18/18**, H4/H6 **8/8**, custodia/invitaciones **25/25**, Chromium H3/H4 **1/1** y transacción H6 dividida por principales mínimos **2/2**. No se usó Supabase operativo ni un principal administrador como sustituto de los roles de aceptación.

## Discrepancias y riesgos restantes

- El inventario B0 anterior indicaba pruebas no ejecutadas; esta revisión lo sustituye para la puerta A.
- El guard provisional sigue activo por seguridad hasta que B instale y pruebe la confirmación raíz. Retirarlo antes reabriría la división de cuentas.
- El esquema todavía no contiene vínculo operativo ni destino de entrega; A demuestra el defecto, no lo corrige.
- No se declara PASS de F01–F28/R01–R10: su cierre corresponde a B–E con pruebas funcionales y navegador real.
- PR permanece Draft; no existe autorización de merge, despliegue o migración operativa.

## Puerta A

**PASS.** Causa raíz reproducida, dependencias y estados terminales inventariados, cuenta elegible definida, transacción/locks definidos y regresión PG17 integrada al arnés. Siguiente paso: Bloque B, modelo SQL y confirmación atómica.
