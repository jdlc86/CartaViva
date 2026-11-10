# Contrato verificable: cesión de titularidad ADMIN

Estado: especificación de la implementación interna actual; **no es autorización para exponer HTTP ni conceder permisos SQL**.

Fuentes: `apps/api/src/ownership-workflow.mjs`, `apps/api/src/ownership-transition-policy.mjs`, migraciones `20261020210000`–`20261020240000`, `docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md`.

## Matriz de operaciones

| Acción interna | Actor válido | Destinatario | Resultado persistido |
| --- | --- | --- | --- |
| `request` | ADMIN activo sin titularidad | El propio solicitante; propietario actual como decisor | Propuesta `request` pendiente |
| `offer` | ADMIN activo titular | Otro ADMIN activo | Propuesta `offer` pendiente |
| `accept` de solicitud | ADMIN activo titular actual | ADMIN solicitante activo | Propuesta aceptada y titularidad transferida |
| `accept` de oferta | ADMIN activo destinatario | El mismo ADMIN destinatario activo | Propuesta aceptada y titularidad transferida |
| `reject` | Titular si solicitud; destinatario si oferta | Sin cambio de titular | Propuesta rechazada |
| `cancel` | Solicitante si solicitud; titular oferente si oferta | Sin cambio de titular | Propuesta cancelada |
| `force` | ROOT activo | ADMIN activo distinto del titular | Titularidad transferida, motivo obligatorio, auditoría `force_transfer` |

Ninguna acción permite a ROOT convertirse en titular. Un ADMIN no titular no puede ofrecer ni transferir forzosamente. Las propuestas solo se resuelven mientras estén pendientes y su propietario de origen coincida con el propietario vigente.

## Límite transaccional y acceso a datos

- Entrada interna: `actorUserId`, `action`, `correlationId` (UUID); `proposalId`, `targetUserId`, `reason` según forma exacta de cada acción. El backend futuro debe obtener `actorUserId` de identidad verificada, nunca del cuerpo HTTP.
- Orden de locks: fila singleton `sabora.admin_write_ownership FOR UPDATE`, miembros de `sabora.staff_members` ordenados por UUID `FOR UPDATE`, propuesta `sabora.admin_ownership_proposals FOR UPDATE`.
- Lectura: singleton (`owner_user_id`); staff (`user_id,role,state`); propuesta (`id,kind,status,from_owner_id,to_owner_id`); auditoría (`correlation_id,request_payload,result_payload`).
- Escritura: propuesta (`kind,from_owner_id,to_owner_id,created_by,correlation_id,status,resolved_at`), singleton (`owner_user_id,assigned_at`), auditoría solo INSERT (`correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,reason,request_payload,result,result_payload`).
- Replay: mismo `correlationId` y payload semánticamente igual devuelve resultado persistido con `replayed:true`; mismo ID con payload distinto devuelve `correlation_conflict`. Las respuestas de rechazo sin auditoría no se consideran replay persistido.
- La operación completa debe usar una sola conexión y transacción. Si falla cualquier escritura o auditoría, rollback completo. La función de auditoría es append-only.

## Puertas antes de ejecución operativa

1. Identidad SQL de mínimos privilegios capaz de bloquear/leer/escribir solo los recursos y columnas anteriores, con RLS y pruebas negativas de SQL directo. La identidad `sabora_admin_writer` actual no tiene permisos y no puede ejecutar este workflow.
2. Verificación del token y de sesión, protección frente a suplantación de actor, manejo de correlación y límites de petición.
3. Pruebas concurrentes de dos transferencias y de cambios de estado de ADMIN, además de idempotencia, rollback y denegaciones.
4. Recuperación y bootstrap de exactamente un ROOT activo sin utilizar un bypass administrativo.
5. Diseño y autorización independientes para rutas HTTP, secretos y despliegue.

No tocar Supabase operativo, VPS ni Fleetia con este contrato.

## Adenda de implementación candidata posterior — S34 (2026-11-10)

**Sin cambio de la matriz normativa de acciones y locks.** La frase histórica «la identidad `sabora_admin_writer` actual no tiene permisos y no puede ejecutar este workflow» continúa siendo correcta para ese **rol histórico específico**. La nueva implementación no lo promueve ni concede privilegios de tabla al navegador: utiliza un rol SQL **distinto** `sabora_ownership_runtime`, un login aislado en PG17 de prueba y una única RPC firmada `sabora.admin_ownership_action_candidate(jsonb,text,text)`.

El flujo opt-in actual pasa por `apps/api/src/ownership-governance-candidate.mjs` y `apps/api/src/m2-restaurant-candidate.mjs`; comprueba login SQL de mínimos privilegios, identidad administrativa autenticada y HMAC antes de la transición; los locks/revalidaciones y auditoría se ejecutan en PostgreSQL. `20261109010000_sabora_ownership_post_lock_expiry_candidate.sql` añade una segunda comprobación de caducidad de la capacidad tras esperas por locks. `scripts/ci/ownership-governance-postgres17.test.mjs` ejercita una transacción real de solicitud/cesión/ROOT y denegación de escritor obsoleto en PostgreSQL 17 desechable. La ronda [Bootstrap #42836528469](https://github.com/jdlc86/CartaViva/actions/runs/42836528469) y [CI H6 #42836528459](https://github.com/jdlc86/CartaViva/actions/runs/42836528459) finalizaron **SUCCESS** sobre el SHA `d49ee05b103620ce30cfc976fa62182cc9d954df` del PR #54 ya dirigido a `main`.

**Puertas sin saltar:** los logins SQL operativos, secretos, identidad y bootstrap ROOT del destino, autorización de migraciones, revisión independiente y cualquier despliegue siguen sometidos a sus contratos propios; no se ha dado permiso para activar producción ni para tocar Supabase/Fleetia/VPS. **Esta adenda documenta código y pruebas realmente existentes, sin otorgar autorización nueva.** [Preflight de integración S34](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md).

