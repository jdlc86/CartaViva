# Sabora — candidato integral del Bloque 2 de activación operativa (S38)

> **INFORME TÉCNICO, NO NORMA NI AUTORIZACIÓN.** Este hito prepara un
> candidato ejecutable en laboratorio. No acredita instalación en Supabase,
> despliegue en VPS, revisión independiente, aceptación visual ni un GO.

## 1. Delta de partida verificado

El trabajo partió de `origin/main` actualizado, sin absorber el diff SQL del
[PR #57](https://github.com/jdlc86/CartaViva/pull/57). El checkout anterior
estaba limpio en otra rama y se preservó; no se usaron `reset --hard`, `clean`,
force-push ni descartes. Al corte inicial, #57 seguía Draft en
`9c943e5b6ae2fa39e5abd18fc604688aa5689e5d`, con sus cuatro workflows verdes,
pero sin revisión independiente ni validación Supabase 17.11.

Se reutilizan la composición
`m2-restaurant-candidate.mjs`/`m3-restaurant-candidate.mjs`, el inventario
`m2-runtime-identity-inventory.mjs`, el bootstrap PG17/HTTP/Chromium existente,
la observabilidad y el recovery smoke. `server.mjs`,
`api-runtime-config.mjs` y `deploy/compose.sabora.yml` permanecen como fallback
`health-only`; no se abre la aplicación cambiando un booleano.

## 2. Resultado implementado

### 2.1 Identidades, secretos y arranque

`operational-activation-manifest.mjs` valida un manifiesto exacto y construye
las conexiones sólo desde referencias a secretos montados. No genera LOGIN,
no modifica roles y no prueba que éstos existan: el DBA autorizado debe mapear
cada slot a una identidad física ya creada y revisada. Se rechazan duplicados,
`postgres`, `service_role`, placeholders, endpoints ambiguos, CA inválida,
orígenes no HTTPS y configuración incompleta. Las respuestas de error no
incluyen valores, DSN ni detalles del driver.

| Pool lógico | Rol de capacidad esperado | Uso |
|---|---|---|
| `customer.catalogReaderPool` | `sabora_catalog_reader` | carta publicada |
| `customer.registrationPool` | `sabora_customer_registration_runtime` | registro de sesión |
| `customer.sessionPool` | `sabora_customer_session_runtime` | sesión de cliente |
| `customer.flowPool` | `sabora_customer_flow_runtime` | visita/pedido |
| `tableChange.customerPool` | `sabora_f12_customer_runtime` | cambio de mesa cliente |
| `tableChange.operationsPool` | `sabora_f12_operations_runtime` | cambio de mesa staff |
| `tableChange.confirmationPool` | `sabora_b3_confirmation_runtime` | confirmación |
| `tableChange.h6ReadPool` | `sabora_b3_h6_reader_runtime` | lectura económica cliente |
| `tableChange.pendingPool` | `sabora_f12_pending_reader_runtime` | cambio pendiente |
| `staff.pool` | `sabora_staff_reader` | pertenencia staff |
| `h4.operationsPool` | `sabora_b3_h4_transition_runtime` | cocina/sala |
| `h6.providerPool` | `sabora_h6_provider_runtime` | ledger proveedor |
| `h6.operationsPool` | `sabora_h6_operations_runtime` | operación H6 |
| `h6.closePool` | `sabora_h6_account_close_runtime` | cierre de cuenta |
| `h6.eventPool` | `sabora_m2_customer_event_runtime` | eventos cliente |
| `management.tablesPool` | `sabora_m3_tables_runtime` | mesas M3 |
| `management.catalogPool` | `sabora_m3_catalog_runtime` | catálogo/finanzas M3 |
| `management.ownership.pool` | `sabora_ownership_runtime` | gobierno ADMIN opt-in |
| `management.communications.adminPool` | `sabora_m5_comms_admin_runtime` | comunicación interna |
| `management.communications.publicPool` | `sabora_m5_comms_public_runtime` | comunicación publicada |
| `waiterCalls.customerPool` | `sabora_waiter_call_customer_runtime` | llamada cliente |
| `waiterCalls.staffPool` | `sabora_waiter_call_staff_runtime` | atención por sala |

El mínimo H3–H6 es 15 slots, M3 mínimo suma 17 y los tres módulos opt-in llegan
a 22. `tableChange.notificationPool` y `h6.notifierPool` son dos instancias
separadas de conexión, pero reutilizan las credenciales de su capacidad exacta:
no inventan dos privilegios SQL adicionales. Cada entrada documenta dueño
`dba_sabora`, custodia conjunta seguridad/DBA, TLS, rotación por credencial
nueva + drenaje acotado y revocación posterior al cutover verificado.

`operational-server.mjs` es el único entrypoint activo. Exige entorno de
producción, manifiesto `stage=production`, referencias absolutas, ficheros
regulares sin symlink y las 16 evidencias explícitas de
`pilot-activation-gate.mjs`. Esas banderas son una puerta declarativa, no
sustituyen sus evidencias ni la autorización independiente.

Antes de escuchar, el runtime obtiene JWKS, crea el candidato M3, ejecuta sus
preflights SQL/ACL/roles/eventos y exige `/ready=200`. Un fallo cierra candidato,
notificadores y pools. SIGINT/SIGTERM drenan una sola vez. `/health` sigue siendo
liveness; `/ready` del candidato reevalúa dependencias. Stripe y cualquier
proveedor de pago quedan fail-closed y el dispatch diferido externo permanece
deshabilitado.

### 2.2 TLS y egress Sabora-only

`compose.sabora-operational.yml` es independiente del compose health-only. La
API sólo se conecta a `sabora_runtime_internal` (`internal:true`); no tiene la
red de salida. `sabora-egress` es el único proceso con ambas redes, sin puerto
host. Ambos son no-root, read-only, sin capabilities, sin privilegios nuevos y
con límites de CPU, memoria, PIDs y logs.

El gateway admite sólo destinos DNS exactos declarados. Resuelve una vez,
rechaza direcciones privadas/reservadas y conecta por IP para evitar rebinding.
Antes de abrir salida inspecciona que el ClientHello use el SNI exacto. Para
PostgreSQL conserva el `SSLRequest`, exige la respuesta TLS del servidor y
tuneliza sin terminar TLS: `pg` valida la CA y el hostname original con
`rejectUnauthorized:true`. Auth/JWKS usa un agente HTTPS fijado al gateway,
pero conserva Host/SNI del emisor y verificación TLS del sistema. No hay
`rejectUnauthorized:false` en código operativo.

La elección `direct` frente a `session_pooler` es explícita. El validador no
fabrica hosts: exige el host real obtenido del panel del proveedor; un pooler
de sesión debe terminar en `.pooler.supabase.com`, mientras un directo no
puede hacerlo. La conectividad IPv6/IPv4 real sigue siendo una comprobación
externa previa al despliegue.

### 2.3 Backup, restore y observabilidad

El recovery smoke existente ahora empaqueta el dump custom Sabora-only y los
roles sin contraseña, calcula el inventario/checksum de migraciones, cifra el
bundle con AES-256-GCM y separa clave y artefacto en ficheros distintos.
El manifiesto obliga a custodios/canales
separados, pero no simula que el mismo runner sea custodia externa. El ensayo
elimina los plaintext, descifra para restaurar en otro PG17 aislado
y exige que un ciphertext alterado falle sin dejar salida. Sigue comprobando
roles, owner, ACL, FORCE RLS, funciones y dataset. Es sólo fixture CI: no se
leyó Supabase real, no se creó una copia real y no se afirma RTO/RPO.

La observabilidad activa conserva campos allowlist y correlación generada por
servidor. El burst HTTP 5xx produce un evento y puede entregarse a un sink
inyectado; un fallo del receptor se desacopla de la transacción. El log
estructurado no acredita recepción externa 24/7. SQL, URL cruda, headers, IP,
JWT, cookies, QR, cuerpo, PII y secretos no se publican.

## 3. Matriz de componente, código y prueba

| Componente | Implementación | Evidencia automatizada | Resultado local |
|---|---|---|---|
| 17/22 slots + 2 notifier | `operational-activation-manifest.mjs` | `operational-activation-manifest.test.mjs` | PASS |
| JWKS vía egress TLS | `gateway-jwks-fetch.mjs` | `gateway-jwks-fetch.test.mjs` | PASS |
| Proxy TLS/PG allowlist | `sabora-egress-gateway.mjs` | `sabora-egress-gateway.test.mjs` | PASS, TLS y PG dinámicos |
| Bootstrap/cierre activo | `operational-runtime.mjs`, `operational-server.mjs` | tests homónimos + bootstrap integral | PASS unitario; integral se registra en CI final |
| Aislamiento compose | `compose.sabora-operational.yml` + gate | `operational-deployment-isolation-contract.test.mjs` | PASS |
| Backup cifrado | `encrypted-backup-artifact.mjs` + recovery smoke | test unitario + PG17 recovery | PASS unitario; PG17 se registra en CI final |
| Alertas no bloqueantes | `operational-observability.mjs` | `operational-observability.test.mjs` | PASS |
| PG17↔API↔dos PWA | bootstrap existente reutilizado por `operational-runtime.mjs` | `h6-acceptance-gate.sh` / Chromium | se registra contra el SHA final |

## 4. Estados y límites

- **IMPLEMENTADO:** entrypoint, manifiesto/secret resolver, pools estrictos,
  egress, lifecycle, backup fixture cifrado, observabilidad y gates.
- **PRUEBAS EJECUTADAS:** las pruebas unitarias nuevas y la regresión Node se
  documentan en el PR; PG17/HTTP/Chromium y Actions sólo se declaran con sus
  ejecuciones y SHA exactos.
- **VALIDADO EN PROVEEDOR:** **NO**. No se conectó ni escribió en Supabase,
  no se consultó VPS y no se obtuvieron hosts, certificados o secretos reales.
- **ACEPTACIÓN HUMANA/INDEPENDIENTE:** **NO**. DBA/seguridad debe revisar
  ownership, roles, secretos, TLS, egress y bootstrap; la UI conserva su puerta
  visual humana.

Bloqueos reales para primera activación: integración/autorización de CV-005 y
su revisión del PR #57; confirmar endpoint directo/pooler y conectividad VPS;
crear por DBA las identidades físicas aprobadas y provisionar sus secretos por
canal decidido; custodia/retención y restauración real autorizadas; receptor de
alertas operacional; comprobación dinámica del aislamiento VPS; autorizaciones
de backup, migración, despliegue y rollback. La ausencia de usuarios no elimina
ninguna puerta.

## 5. Normativa aplicada

Este candidato se subordinó al
[método de validación/observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md),
[roadmap técnico](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md),
[límite de proyecto](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md),
[puerta de autorización](../SABORA_AUTHORIZATION_GATE.md),
[contrato ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md),
[actor SQL/HMAC](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md),
[inventario SQL](../security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md),
[secretos candidato](../security/SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md),
[runbooks P2/P3](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md)
y [puerta S36](SABORA_S36_CV005_FIRST_ACTIVATION_READINESS_GATES_2026-11-12.md).

## 6. S38 — saneamiento tras revisión cruzada con CV-005

El cierre inicial descrito arriba correspondía al SHA `b825b78e`. La
[revisión técnica cruzada de #57/#58](SABORA_S38_CV005_BLOCK2_CROSS_PR_TECHNICAL_REVIEW_2026-11-12.md)
identificó y corrigió **dentro de este mismo PR** cuatro problemas de
integración del candidato, sin tocar el SQL de #57:

1. **No publicar HTTP antes de un readiness positivo:** `operational-runtime.mjs`
   comprueba JWKS, preflight de la fábrica y `app.inject('/ready')=200`
   **antes** de `listen`. Prueba de operación pendiente, negativa y positiva,
   con cierre de recursos y socket todavía cerrado.
2. **Paridad exacta de red:** la API lee el MISMO fichero de política de egress
   (montaje read-only de ambos servicios) y compara cada puerto, host y
   protocolo SQL/JWKS con su manifiesto **antes de resolver secretos**. El
   contrato admite que 17/22 pools SQL distintos compartan un puerto de
   túnel si apuntan al mismo destino, pero rechaza destinos extra o drift.
   Pruebas de contrato y ensamblaje desde archivos con 17 pools simulados;
   **no son una prueba TLS real contra Supabase**.
3. **Alcance Docker normativo:** ambos Compose son modos alternativos de
   proyecto `sabora`, **nunca dos stacks simultáneos**. Actualizados
   Compose, el gate de aislamiento, CI y runbook. Ningún acceso al VPS.
4. **JWKS en readiness activo:** el modo operativo requiere nueva verificación
   de claves confiables (con la caché del contrato vigente), y clasifica
   indisponibilidad como dependencia `staff` saneada; `/ready` 503 y
   `/health` 200. El harness PG17 real incorpora prueba de caída temporal
   de JWKS y recuperación.

**Estado probatorio de esta sección:** cambios de código y pruebas
**implementados**; solo serán **pruebas ejecutadas del hito revisado**
cuando las Actions del nuevo HEAD terminen. Los resultados verdes de
`b825b78e` siguen siendo válidos únicamente para ese SHA. No hay
validación de proveedor, revisión DBA externa, aceptación visual ni GO.
