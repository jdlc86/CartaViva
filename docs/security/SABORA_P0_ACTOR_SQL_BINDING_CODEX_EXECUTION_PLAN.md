# P0 BLOQUEANTE — identidad verificable del actor y permisos SQL mínimos para operaciones Sabora

**Fecha:** 2026-10-24  
**Estado:** encargo técnico exhaustivo para Codex; **no autoriza despliegue, GRANT operativo, merge ni activación**.  
**Repositorio exclusivo:** `jdlc86/CartaViva`. **Restaurante:** únicamente Sabora.  
**Rama de integración de referencia:** `integration/sabora-order-management-review`; **PR:** #7 (Draft).  
**Prioridad:** P0 de seguridad; cerrar un hito completo, no acumular parches cosméticos.

## 0. Instrucción fundamental a Codex

Leer íntegramente este documento y **volver a inspeccionar el HEAD real del repositorio y GitHub Actions** antes de editar. Este documento es un encargo y un mapa de investigación; la **fuente normativa de verdad son los contratos y código del propio repositorio**. Ante contradicción, no inventar ni reinterpretar decisiones: documentar la discrepancia y detener solo el cambio que la requiera. Trabajar autónomamente en un bloque cohesivo de diseño + implementación + pruebas + documentación. No dar por cerrado P0 por pasar tests de mocks.

**Límites absolutos:** solo cambiar `jdlc86/CartaViva`; jamás Fleetia, su base de datos, contenedores o recursos del VPS compartido. **No tocar el VPS, no desplegar, no reiniciar, no ejecutar migraciones ni GRANTs en Supabase operativo, no hacer merge ni activar rutas** sin autorización explícita posterior. PostgreSQL 17 **desechable, local/CI** sí está permitido, siempre con las protecciones de aislamiento del harness existente. Mantener el PR Draft. No cambiar el contrato de entrega, cancelación, cobros o comanda para sortear el bloqueo.

## 1. Lecturas obligatorias, en orden

1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: contrato funcional y semántica de cocina, sala, pedido, despacho y acuse.
2. `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`: operaciones candidatas y condiciones de activación.
3. `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`: frontera escritor transaccional → cocina.
4. `docs/security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md`: inventario de recursos, amenaza de actor falsificable, matriz negativa y preflight.
5. `docs/security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md`: separación entre identidad SQL y autoridad funcional.
6. `apps/api/src/order-operations-{coordinator,repository,http,composition,identity-preflight}.mjs`, `apps/api/src/postgres-transaction.mjs`, `apps/api/src/staff-protected-hooks-from-pool.mjs` y `apps/api/src/server.mjs`.
7. `supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql` y migraciones anteriores de `staff_members`, `orders`, `order_lines`, `pickup_notifications`, `order_line_events`, RLS, roles, ownership y grants.
8. `scripts/ci/order-operations-{postgres17-integration,identity-postgres17}.test.mjs`, `scripts/ci/catalog-postgres17-node-driver-smoke.sh`, `tests/order-operations*.test.mjs`, workflows CI y continuidad de sesión.
9. Comprobar HEAD/PR #7 y resultados actuales de **Sabora CI** y **Bootstrap Sabora lockfile**; corregir fallos de la rama antes de afirmar que el hito está validado.

## 2. Hallazgo P0 y modelo de amenaza

La RPC candidata `sabora.transition_order_line_idempotent_candidate(p_actor_user_id uuid, p_order_line_id uuid, p_next_status text, p_correlation_id text)` usa `SECURITY INVOKER`, pero **acepta un UUID de actor como parámetro SQL libre**. Revalida que dicho UUID corresponda a un miembro activo con rol permitido, pero **no prueba que el invocador SQL esté autorizado a actuar como esa persona**. La aplicación HTTP obtiene `verifiedIdentity.userId` de una sesión criptográficamente validada y revalida membresía; sin embargo, si el login técnico compartido recibe `EXECUTE` y permisos subyacentes, un cliente que posea sus credenciales puede ejecutar la RPC con el UUID de otro empleado activo (incluido ADMIN). Eso elude la autorización funcional de la capa HTTP y puede atribuir acciones y auditoría al actor suplantado.

**Adversarios a distinguir y probar:** (A) cliente HTTP que manipula cuerpo, URL, cabeceras, rol, UUID o correlación; (B) usuario SQL con credenciales del login técnico operativo, capaz de ejecutar SQL arbitrario permitido a ese rol; (C) usuario SQL `anon`/`authenticated`/`PUBLIC`; (D) login de lectura de personal; (E) miembro suspendido, rol cambiado o carrera de revocación; (F) errores de configuración/grants accidentales; (G) replay y colisión de correlación. Asumir que el adversario B puede ejecutar `SET`/`set_config`, invocar funciones accesibles y modificar parámetros. **Un GUC como `app.actor_id` o `request.jwt.claims` establecido por el mismo login no es una identidad confiable.** Tampoco lo son un UUID suministrado por el caller, una cabecera HTTP no verificada, `current_setting` mutable ni un JWT cuya firma se verifique únicamente en Node sin vincularlo al límite SQL. `SECURITY DEFINER` por sí solo no resuelve suplantación; puede ampliar el daño.

**Invariante P0:** ningún cliente SQL con la credencial técnica puede efectuar ni atribuir una transición en nombre de un actor distinto del autenticado y autorizado, incluso si conoce su UUID y correlaciones. El modelo debe explicar explícitamente cuál es el **ancla de confianza** que el mismo principal SQL no puede falsificar. Si la arquitectura existente no permite probarlo, mantener `EXECUTE` revocado y rutas sin montar; entregar diseño y PoC aislada con bloqueo abierto, no declarar victoria.

## 3. Resultado exigido: decisión arquitectónica defendible

Codex debe investigar y comparar alternativas reales, con amenazas, costes, garantías y límites:

- **Identidad de base de datos por actor**: roles/login por usuario, `current_user`/mapeo confiable, gestión de ciclo de vida, pooling, rotación y privilegios. Evaluar viabilidad real en arquitectura Sabora; no asumir que `SET ROLE` del login compartido es seguro.
- **Prueba criptográfica verificable dentro del límite SQL**: token firmado de identidad y audiencia/operación, firma verificable con material secreto inaccesible al login técnico, expiración, `jti`/replay, claves/rotación, confianza en issuer y claims, y resistencia a reutilización entre operaciones. Analizar explícitamente si el login SQL puede invocar una función que fabrique o valide arbitrariamente su propio contexto, o reutilizar tokens interceptados.
- **Encapsulación transaccional de privilegios**: interfaz SQL cerrada y permisos mínimos, RLS por identidad verificable, ownership/SECURITY DEFINER con `search_path` seguro y sin SQL dinámico, tablas y columnas inaccesibles directamente. Aclarar que encapsular mutaciones no vincula por sí mismo el actor.
- **Separación de credenciales/servicio de confianza** si fuese necesaria; demostrar qué principal puede hacer qué y por qué una filtración de credencial técnica no permite suplantar usuarios.

No seleccionar una alternativa por comodidad. Documentar la elección, alternativas descartadas y evidencia de que supera el adversario B. Si requiere aprobación de nueva infraestructura, secretos o arquitectura, presentar propuesta y dejar el gate cerrado. **No introducir secretos reales en repositorio, logs, pruebas o PR.**

## 4. Contrato de autorización y transacción

Conservar únicamente `confirmed → preparing` y `preparing → ready` por cocina/ADMIN, `ready → picked_up` por camarero/ADMIN. `picked_up` = recogido por sala, **no entregado al comensal**. La autoridad se revalida bajo bloqueo en la misma transacción; la suspensión/revocación debe ganar correctamente según el orden de locks. Un replay idempotente también revalida autoridad y no revela resultados históricos a actor revocado.

Preservar: una única mutación efectiva por transición; `ready` crea aviso durable; `picked_up` acusa el aviso; evento append-only; resultado de correlación durable por actor; replay idéntico sin duplicados; correlación reutilizada con fingerprint diferente rechazada; rollback integral ante error; bloqueo de concurrencia; ninguna actualización directa de campos ajenos al estado; nunca exponer `actor_user_id` privado en DTO.

Revisar además integridad de lectura: roles de cocina/sala, paginación y filtros; historial cronológico por línea; visibilidad mínima. No confundir revalidación de roles en Node con garantía contra SQL directo.

## 5. Permisos mínimos: inventario obligatorio

Derivar desde consultas SQL reales, migraciones y dependencias de triggers, no de una lista teórica. Recursos actuales:

| Recurso | Acceso requerido por diseño candidato | Riesgo |
| --- | --- | --- |
| `sabora.staff_members` | membresía activa y rol con lock | impersonación, fuga de datos y bloqueo |
| `sabora.order_lines` | proyección, lock, transición de estado | UPDATE arbitrario, saltos |
| `sabora.orders` | proyección limitada de pedido | datos privados |
| `sabora.dining_tables` | número de mesa | QR y gestión ajena |
| `sabora.pickup_notifications` | crear aviso y acusarlo | aviso falso o doble acuse |
| `sabora.order_line_events` | append-only, historial | auditoría falsa o destructiva |
| `sabora.order_line_transition_requests` | idempotencia por actor, append-only, FORCE RLS | replay y correlación |
| RPC candidata | transición atómica | actor falsificable |

Comprobar también **todas** las tablas/vistas del esquema, secuencias, funciones `SECURITY DEFINER`, `PUBLIC`, `anon`, `authenticated`, herencia, propietarios, `BYPASSRLS`, `CREATE` en esquema, `TRUNCATE`, `REFERENCES`, `TRIGGER`, privilegios de columna, permisos por defecto y vías indirectas. El login de lectura de personal y el de operaciones deben seguir separados, no propietarios, `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT`, sin membresías peligrosas.

**Importante:** el preflight actual aplica política de **cero permisos de tabla privada y cero EXECUTE de RPC** como puerta negativa. Un diseño positivo requerirá modificar explícitamente ese gate y sus pruebas **solo después** de resolver P0 y justificar los permisos concretos. No desactivar el preflight para pasar tests; sustituirlo por una matriz verificable aprobada y negar cualquier permiso inesperado.

## 6. Entregables de implementación

1. **Informe de arquitectura y amenaza** versionado en `docs/security/`: hallazgo reproducible, modelo de adversario, alternativas, decisión, invariantes, matriz de privilegios y riesgos residuales. Separar hechos verificados de propuestas.
2. **Implementación coherente** en migración candidata **nueva** o cambio revisable que no altere Supabase operativo, Node.js y composición. Si el diseño requiere secretos/infraestructura no autorizados, dejar implementación como candidato aislado, con rutas sin montar.
3. **Harness PG17 desechable** que reproduzca explícitamente el intento de suplantación con credencial técnica bajo el diseño inseguro en un entorno de prueba, y demuestre denegación bajo el diseño corregido; sin conectarse a Supabase/VPS. No dejar un GRANT inseguro persistente fuera del fixture.
4. **Pruebas positivas y negativas de extremo a extremo** bajo identidad SQL no privilegiada: cocina, camarero, ADMIN, suspendido, rol cambiado, SQL directo falsificado, HTTP falsificado, replay, concurrencia, rollback, FORCE RLS, privilegios por columna, secuencias, funciones y auditoría.
5. **Revisión de preflight/bootstrap**: comprobar `current_user` y `session_user` en conexiones reales, grants inesperados y fail-closed ante error; no montar rutas antes de aprobar el gate. Probar que el servidor normal no registra endpoints de operaciones.
6. **Documentación actualizada** en contratos/seguridad/continuidad con pruebas reproducibles, SHA exacto, workflows, límites y decisiones pendientes. PR Draft con resumen de amenazas, pruebas y bloqueo restante.

## 7. Matriz de aceptación mínima (no negociable)

| Caso | Resultado obligatorio |
| --- | --- |
| Cocina activa verificada → `preparing` / `ready` | permitido solo en secuencia |
| Camarero activo verificado → `picked_up` | permitido solo tras `ready` |
| ADMIN activo verificado | transiciones autorizadas y auditadas |
| Cocina → `picked_up`; camarero → `preparing` | denegado |
| Usuario HTTP intenta enviar UUID/rol ajeno | denegado; actor solo de identidad verificada |
| Login técnico ejecuta SQL directo con UUID de otro actor activo | **denegado; prueba P0 imprescindible** |
| Login técnico falsifica `SET ROLE` o GUC | denegado; no crea autoridad |
| `anon`/`authenticated`/`PUBLIC` ejecutan RPC o leen tablas privadas | denegado |
| Personal suspendido/revocado o carrera de suspensión | denegado, incluido replay |
| Reintento mismo actor/correlación/fingerprint | resultado original, sin efectos dobles |
| Reutilización de correlación con payload diferente | conflicto, sin mutación |
| Dos transiciones concurrentes incompatibles | a lo sumo una mutación efectiva |
| Error tras estado/aviso/evento antes de commit | rollback completo |
| UPDATE de columna no autorizada, DELETE, TRUNCATE, CREATE, secuencia | denegado |
| RLS/roles/grants alterados accidentalmente | preflight/CI bloquean |
| Servidor normal sin activación | rutas ausentes |
| CI de commit final | **Sabora CI y Bootstrap Sabora lockfile exitosos** |

Añadir pruebas de regresión para cada incidente observado, no solo snapshots de texto. Evitar tests que pasan por mock de superusuario pero fallan con LOGIN técnico real.

## 8. Método de ejecución autónomo por hitos

**Hito A — inspección y reproducción:** leer fuentes, HEAD, workflows; ejecutar tests existentes; registrar P0 con evidencia en PG17 efímero; identificar permisos y llamadas reales.

**Hito B — diseño verificable:** comparar alternativas, definir ancla de confianza, diseñar principal y claims, política RLS y matriz SQL; revisión de abuso por cliente SQL arbitrario. Si no existe solución segura dentro de restricciones, entregar un bloqueo explícito con propuesta de aprobación, no un falso cierre.

**Hito C — implementación integrada:** desarrollar migración candidata, adaptadores Node y pruebas de seguridad con límites de confianza explícitos; conservar API y contratos salvo cambios justificados. Commits lógicos en rama exclusiva del repositorio; no pisar trabajo concurrente.

**Hito D — validación completa:** tests unitarios, integración Fastify, PG17 con LOGIN no propietario, concurrencia/atomicidad/idempotencia, build/typecheck, ambos workflows del **SHA final**. Investigar logs y corregir hasta verde cuando sea posible.

**Hito E — cierre documental:** actualizar arquitectura, seguridad y handoff, anotar SHA/PR, resultados, matriz de aceptación y cualquier requisito de aprobación. No cerrar P0 si falla el caso de SQL directo suplantando otro actor.

## 9. Criterio exacto de cierre

Marcar **P0 RESUELTO TÉCNICAMENTE (NO DESPLEGADO)** solo cuando exista una implementación completa en la rama, prueba adversarial de SQL directo que rechace la suplantación, pruebas positivas de operación real con permisos mínimos, CI verde en el SHA final y documentación alineada. **No equivale a autorización de despliegue**. Si falta una condición, estado **P0 ABIERTO** con evidencia concreta y siguiente decisión solicitada; no reportar porcentajes ficticios.

## 10. Formato del informe final de Codex

Informar: SHA inicial/final, rama y PR, resumen de arquitectura elegida, cómo se vincula criptográfica o estructuralmente el actor, qué impide falsificación por el mismo login SQL, tabla de pruebas con resultados, enlaces a ambos workflows del SHA final, cambios de esquema propuestos, riesgos residuales, autorizaciones pendientes y confirmación explícita de **cero cambios en Fleetia, VPS y Supabase operativo**. Si el resultado es diseño/PoC, identificarlo claramente y no afirmar que el P0 está cerrado.

**Recordatorio:** un resultado que solo agrega comprobaciones de salida, más mocks o una GUC mutable **no resuelve este P0**. El éxito consiste en cerrar la frontera de confianza SQL con evidencia real, no en multiplicar pequeñas correcciones.
