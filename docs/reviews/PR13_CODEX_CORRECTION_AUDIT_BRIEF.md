# Encargo Codex — auditoría y corrección integral PR #13

**Repositorio único:** `jdlc86/CartaViva`  
**Rama de trabajo:** `integration/sabora-pr11-merge-reconciliation`  
**PR:** https://github.com/jdlc86/CartaViva/pull/13 (mantener **Draft**)  
**Punto de partida verificado:** commit `26950c690ead200f3eac8b11d208facb04a2556c`; Sabora CI #40238329926 y Bootstrap #40238329915 SUCCESS.  
**Objetivo:** corregir los dos hallazgos P2 de la segunda auditoría, probar las rutas reales de ejecución y realizar una auditoría independiente del conjunto, no solo cambios superficiales.

## Fuente de verdad y límites

Lee **primero** la documentación normativa vigente del repositorio (especialmente `docs/security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md`, `docs/security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md` y los contratos de identidad, capacidades firmadas y operaciones). La documentación de continuidad es contexto, **no** fuente normativa. No inventes requisitos ni cambies contratos por conveniencia: ante ambigüedades, informa con evidencia.

Trabaja **exclusivamente** en `jdlc86/CartaViva`. Prohibido modificar, detener, reiniciar, consultar o depender de recursos de **Fleetia** o de otros proyectos del VPS. **No desplegar**, no ejecutar migraciones sobre Supabase productivo, no hacer merge, no marcar el PR como Ready. No usar infraestructura compartida; PostgreSQL 17 únicamente desechable/aislado para pruebas. Mantén el PR en Draft. Puedes implementar correcciones, tests, commits y CI en la rama indicada.

## Hallazgo A — P2: replay HTTP de invite rechaza el enrollment original

Referencia: https://github.com/jdlc86/CartaViva/pull/13#discussion_r4372663834

En `apps/api/src/staff-lifecycle-repository.mjs`, el SQL ya permite reintentos `invite` con la misma correlación e intención, aunque el coordinador genere un UUID/token nuevos; devuelve `repeated=true` y el `enrollment_id` **original**. El validador Node sigue exigiendo igualdad con el UUID recién generado, rechaza el resultado y provoca `invalid_staff_lifecycle_sql_result`/503.

**Corregir:** aceptar un UUID de inscripción original distinto **solo** en el replay validado de `invite`; mantener igualdad estricta para una invitación nueva y para las demás acciones. Verificar todos los demás campos de respuesta, pertenencia de actor/correlación, estados, autenticación, HMAC completo, revocación, expiración e idempotencia. No introducir una aceptación genérica de UUID arbitrarios ni permitir duplicados, reenvíos de secretos o degradaciones de seguridad. Revisar el contrato real de respuesta HTTP al replay (no volver a revelar el token si no es recuperable). Probar la **ruta real coordinador → repositorio → PostgreSQL 17**, incluyendo primera invitación, reintento con nueva generación de UUID/token, cambio de intención, concurrencia y revocación.

## Hallazgo B — P2: preflight de lector SQL acepta escrituras por columna

Referencia: https://github.com/jdlc86/CartaViva/pull/13#discussion_r4372663837

En `apps/api/src/order-operations-identity-preflight.mjs`, el modo lector permite SELECT exclusivamente de `sabora.staff_members(user_id,role,state)`, pero no rechaza completamente privilegios por columna `UPDATE(state)`, `INSERT(role)` o `REFERENCES(user_id)`.

**Corregir:** verificar que el login lector tenga **solo SELECT** sobre las tres columnas necesarias y **ningún INSERT, UPDATE ni REFERENCES** en ninguna columna, ni escrituras a nivel tabla, ni accesos a otros objetos privados. Mantener el principal mutador con **cero** privilegios directos de tablas/columnas; no conceder permisos amplios ni modificar producción. Añadir pruebas negativas reales con PostgreSQL 17 y roles desechables para cada permiso indebido y combinaciones de privilegios, más caso positivo de lectura estricta. Probar la composición real con una transición autenticada usando los pools/roles correspondientes.

## Auditoría integral posterior

Revisar además los hallazgos de la **primera auditoría** y su cierre efectivo:
- P1 expiración de capacidad y clave tras esperar el lock `order_lines FOR UPDATE`: https://github.com/jdlc86/CartaViva/pull/13#discussion_r4372589443
- P2 intención durable de `invite`/`resend`: https://github.com/jdlc86/CartaViva/pull/13#discussion_r4372589449
- P2 compatibilidad preflight y lector real: https://github.com/jdlc86/CartaViva/pull/13#discussion_r4372589454

Auditar seguridad y permisos mínimos, firmas, replay, atomicidad, concurrencia, ventanas de caducidad, errores HTTP, pruebas de regresión y alineación normativa. Corregir problemas encontrados dentro del alcance y documentar claramente los riesgos residuales, sin esconder fallos. No dar por resuelto un hallazgo únicamente por CI verde.

## Criterios de entrega

1. Implementación completa de ambos P2 y pruebas **de integración reales** que antes fallaban y ahora pasan; conservar los casos negativos.
2. Ejecutar pruebas relevantes, PostgreSQL 17 desechable, suite monorepo y GitHub Actions; si hay fallos, corregir y repetir hasta disponer de evidencia o explicar el bloqueo concreto.
3. Actualizar documentación **normativa** afectada cuando corresponda y registrar evidencia del hito. No sustituir normas por documentos de continuidad.
4. Commits trazables en la rama del PR #13; **sin merge ni despliegue**.
5. Informe final en el PR: SHA, archivos modificados, tests y runs con resultados verificables, hallazgos resueltos, nuevos hallazgos con severidad y riesgos pendientes. Distinguir claramente implementación de **auditoría independiente**: no declararse revisor independiente de los propios cambios; si procede, solicitar revisión separada después de cerrar CI.

**Prioridad:** cerrar este hito completo de forma autónoma, no encadenar microcorrecciones sin verificación.
