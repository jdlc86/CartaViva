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
