# Sesión 4 — puerta de seguridad del escritor y auditoría (22-10-2026)

## Evidencia comprobada
- PR #2 continúa Draft; HEAD inicial b61ce21b278079565620c90b37617ae67ceb9ce7.
- Sabora CI 39700503112 y Bootstrap 39700503103: SUCCESS para b61ce21b.
- Contrato normativo: docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md; continuidad: docs/continuity/SESSION_04_HANDOFF.md.

## Bloqueo técnico confirmado por inspección
- La función sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz) recibe p_actor como argumento. El adaptador staff-table-transition-coordinator.mjs deriva ese argumento del verificador de sesión, pero no existe aún rol SQL operativo con frontera de identidad verificada en DB.
- El trigger capture_table_ordering_audit_candidate() registra actor_user_id NULL deliberadamente. No es lícito afirmar atribución personal completa.
- La función es SECURITY INVOKER y sus permisos EXECUTE están revocados a roles públicos y técnicos enumerados. Conceder EXECUTE directamente a un rol de navegador o un escritor general permitiría suplantar p_actor; no hacerlo.
- Las pruebas de carreras de bloqueo de mesa no prueban todavía confirmación económica completa.

## Requisitos de implementación para habilitar escritura
1. Un único límite backend autenticado valida JWT y membresía vigente; documentar algoritmo real de firma y rotación antes de conexión a Supabase Auth.
2. Rol login NOINHERIT/NOBYPASSRLS; permisos explícitos mínimos; ninguna capacidad SQL directa de suplantación de actor ni acceso a tablas ajenas. La validación debe ser vinculante dentro de la misma transacción y resistir revocaciones concurrentes.
3. El actor auditado debe derivarse de un contexto imposible de manipular desde el navegador; no confiar en p_actor ni en SET de variables SQL accesibles al cliente. Mantener auditoría append-only, FORCE RLS y pruebas de rechazo de UPDATE/DELETE/TRUNCATE.
4. Serializar mesa, visita, versión QR, publicación económica, idempotencia y escritura de pedido en una sola transacción; probar rollback y cierre concurrente con PostgreSQL 17 desechable.
5. Antes de activar rutas HTTP, acreditar pruebas negativas de grants, auditoría y concurrencia en CI para el SHA exacto.

## Estado
Este registro es un análisis de bloqueo, **no** una concesión de permisos, activación de rutas, implementación de escritor ni certificación de seguridad. No modifica Supabase operativo, VPS ni Fleetia. PR debe permanecer Draft; merge y despliegue prohibidos sin autorización expresa.

## Avance de frontera de entrada (22-10-2026)

Se endureció `apps/api/src/staff-table-transition-coordinator.mjs` para rechazar objetos con prototipos exóticos, campos símbolo, campos ocultos y getters/setters, antes de resolver la sesión o abrir una transacción. Se añadieron pruebas de entradas hostiles y una prueba positiva de actor obtenido de sesión verificada en `tests/staff-transition-input-boundary.test.mjs`.

Commits de implementación: `48a0709d73790481126b75994c50ae589cf683f0` y `3e7e862d056666d757a28de8a547b06453d50eaf`.

**Alcance limitado:** el cambio es protección del límite de entrada JavaScript; no demuestra protección frente a suplantación si se otorgaran permisos SQL directos. No se ha implementado aún el rol escritor operativo, la atribución SQL individual, ni el flujo transaccional completo de pedido. Comprobar CI del HEAD exacto antes de considerar validado el cambio.

## Gate automatizado de no activación (22-10-2026)

Nuevo `scripts/ci/staff-transition-activation-gate.sql` conectado a `scripts/ci/postgres-migration-smoke.sh`. Comprueba privilegios efectivos y ACL de PUBLIC para la función de transición y el ledger de auditoría; exige SECURITY INVOKER, RLS forzado y disparadores activos de captura, UPDATE/DELETE y TRUNCATE. Se ejecuta tras migraciones sobre PostgreSQL 17 aislado, sin tocar Supabase real.

Este gate **protege la situación actual cerrada**; no implementa el escritor operativo ni sustituye los futuros ensayos de identidad y concurrencia. Commits de desarrollo: `ae7e7b97`, `e9da5700`, `796cc7b7`, `400eab29`. Confirmar Sabora CI y Bootstrap del HEAD exacto antes de marcarlo como validado.

## Pruebas de transacción del personal (22-10-2026)

Se incorpora `tests/staff-transition-transaction-boundary.test.mjs` con un harness de transacción simulado que verifica: consulta de membresía activa bajo `FOR SHARE`, sujeto firmado utilizado en SQL parametrizado, rechazo de camarero suspendido y cocina, rechazo de registros de membresía contradictorios, no acceso a DB con bearer inválido, rollback ante error de escritura y rechazo de resultados SQL de cardinalidad incorrecta.

**Importante:** el harness verifica composición y orden lógico de las llamadas JavaScript, **no** reproduce bloqueos ni commit/rollback de PostgreSQL. Las pruebas de carreras reales existentes se mantienen separadas; siguen sin cubrir el pedido completo. No se han concedido permisos nuevos ni activado HTTP. Commit de pruebas: `9dd45c9ba92ec8c6458fdaba0c44546bdff09fcf`.

## Aislamiento de contexto de confirmación (22-10-2026)

El coordinador candidato `apps/api/src/catalog-confirmation-coordinator.mjs` comprueba ahora que el contexto autorizado bloqueado devuelto por el repositorio coincide exactamente con `tableId`, `visitId`, `actorId` y `basketId` de la solicitud, y exige un `sessionId` no vacío. El rechazo se produce **antes** de buscar replays idempotentes. Pruebas negativas en `tests/catalog-confirmation-coordinator.test.mjs`.

Commits: `91b927144c369b0fef3a920580051f40807fea0e` y `0e512fa69d8a9cad0c78b4950f2fc92899cbec44`. Es un endurecimiento del coordinador candidato: todavía falta conectar credenciales de cliente verificadas, escritor SQL mínimo, persistencia transaccional completa y auditoría atribuida. No autoriza activación de rutas.

## Canonización de entrada para confirmación candidata (22-10-2026)

El coordinador `catalog-confirmation-coordinator.mjs` ahora construye una copia de los datos no confiables antes de consultar repositorios o calcular huellas de idempotencia. La copia rechaza getters/setters, símbolos, propiedades no enumerables, prototipos exóticos, ciclos, arreglos dispersos, nombres peligrosos y profundidad excesiva. Pruebas negativas añadidas a `tests/catalog-confirmation-coordinator.test.mjs`.

Commits `d6edbb925890644768e43a2341f5f915ea73866f` y `1603d8c7cb366d45dc131c27c9b1e6e044c974c0`. Este control es solo defensa en profundidad del candidato y no demuestra por sí mismo una transacción SQL completa, ni autoriza rutas HTTP o permisos productivos.
