# CartaViva / Sabora — Continuidad de sesión 9

Fecha: 25 de octubre de 2026. Estado: **handoff de desarrollo; no equivale a aceptación de producción ni autorización de despliegue**.

## 1. Inicio obligatorio y jerarquía documental

1. Abrir **exclusivamente** `jdlc86/CartaViva` en GitHub; verificar la rama, HEAD real, PR, commits y ambos workflows asociados al **SHA exacto**. No inferir el HEAD a partir de este handoff.
2. Leer primero la documentación **normativa**: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` y los contratos específicos vigentes del bloque elegido. Los documentos de continuidad son solo contexto, **no fuente normativa**.
3. Leer `docs/continuity/SESSION_08_HANDOFF.md`, `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`, `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`, `docs/architecture/SABORA_INTEGRATION_PR4_PR5_READINESS.md`, `docs/security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md` y `docs/security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md`.
4. Contrastar todo con código, migraciones y pruebas. Revisar `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md` antes de tocar la interfaz. No asumir que un documento histórico prevalece sobre la documentación normativa actual.

## 2. Repositorio, integración y prohibiciones

- Un restaurante por instalación: **Sabora**, con dos PWA independientes (`apps/client`, `apps/management`); CartaViva es directorio central independiente. No introducir multitenencia operativa en Sabora.
- Rama de integración utilizada en sesión 8: `integration/sabora-order-management-review`; PR **#7 Draft**, destino histórico `feat/sabora-pnpm-bootstrap`. **Reconfirmar** en GitHub al empezar.
- Trabajo permitido: código, pruebas, documentación, commits, ramas, PR y GitHub Actions **solo en `jdlc86/CartaViva`**.
- **Prohibido** tocar Fleetia, cualquier otro proyecto, contenedores, redes, volúmenes, secretos o servicios ajenos del VPS compartido. Desplegar, reiniciar o eliminar Sabora nunca puede interrumpir, modificar ni depender de Fleetia.
- **No hacer merge, desplegar, reiniciar, borrar ni modificar Supabase operativo sin autorización expresa** y aislamiento verificado. Proyecto Supabase de referencia: `https://byhvmumqivmunkmomhup.supabase.co`; no usarlo para ensayos. No encargar Codex ni revisiones de pago sin autorización.

## 3. Arquitectura implementada y límites operativos

- Monorepo pnpm, Fastify/Node.js en `apps/api`, React/PWA cliente y gestión, PostgreSQL 17, migraciones `supabase/migrations`, pruebas Node y PostgreSQL desechable en GitHub Actions.
- Confirmación de pedidos: escritor transaccional y componentes HTTP candidatos, pruebas de idempotencia, concurrencia y proyección `orders → order_lines`. Revisar las condiciones de QR/visita, precio y aceptación explícita; **no** afirmar que el recorrido completo QR→cocina está activo.
- Cocina/sala: `apps/api/src/order-operations-{repository,coordinator,http,composition,identity-preflight}.mjs`; función candidata `sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)`; migración `20261023225024_sabora_kitchen_waiter_operations_candidate.sql`. Transiciones por línea: `confirmed → preparing → ready → picked_up`; `picked_up` es recogida por sala, **no entrega al cliente**.
- El backend verifica rol y membresía activa dentro de la transacción, produce notificación durable al pasar a `ready`, acusa al pasar a `picked_up`, persiste eventos e idempotencia. Las proyecciones de tablero y de historial validan datos SQL, ámbito por rol, filtros, transiciones adyacentes, continuidad por línea, cronología e IDs de evento no repetidos.
- `registerVerifiedOrderOperationsFromPools` es composición **opt-in** con dos identidades SQL separadas y preflight. `apps/api/src/server.mjs` **no monta las rutas operativas**. Las interfaces no deben aparentar operaciones reales donde el backend no esté autorizado.

## 4. Bloqueo crítico: suplantación de actor SQL

La RPC candidata acepta `p_actor_user_id` como argumento y comprueba membresía, pero **el UUID pasado por una conexión SQL técnica compartida no demuestra por sí solo la identidad real del actor HTTP**. Conceder `EXECUTE` a ese login permitiría a un cliente SQL directo suplantar otro actor. **No resolver con `set_config`/GUC manipulable ni confiar en un UUID proporcionado por cliente.**

El preflight actual es deliberadamente **negativo**: rechaza identidades privilegiadas, pools compartidos, permisos peligrosos sobre esquema/base, RPC, tablas privadas, secuencias y rutinas según el inventario vigente. La suite PostgreSQL 17 crea logins efímeros y prueba concesiones indebidas, FORCE RLS, identidad y deriva de esquema. **No conceder permisos positivos ni activar rutas** hasta diseñar, revisar y probar vinculación no falsificable del actor y una matriz SQL/RLS de mínimo privilegio con pruebas positivas y negativas.

## 5. Estado CI comprobado y precaución sobre HEAD

- El commit `978ad603828d2277d1ccce14db86861b4c5138d2` tenía **Sabora CI #40103973848 SUCCESS** y **Bootstrap Sabora lockfile #40103973858 SUCCESS**, comprobados en GitHub durante la preparación de este handoff.
- **Eso no certifica commits posteriores ni el HEAD que introduzca este documento.** Hay documentación y código en la rama de integración posteriores al SHA anterior; consultar el SHA actual y ambos workflows de ese SHA. Si alguno falla, abrir jobs/logs y corregir la causa antes de cerrar el hito.
- Se corrigió un fallo anterior de test PG17 `SET ROLE`: PostgreSQL puede rechazar directamente con `permission denied for schema sabora` antes de que el preflight emita `order_operations_sql_identity_rejected`. La prueba exige denegación efectiva en ambos casos.
- La última ampliación inspeccionada incluye preflight de **cero grants privados** y ensayos de GRANT temporal/revocación en PostgreSQL 17 desechable. Consultar código y logs actuales, pues el inventario de seguridad del repositorio contiene ampliaciones adicionales no resumidas aquí.

## 6. Objetivo de sesión 9: cerrar un hito sustancial

**Prioridad 1:** verificar HEAD, ambos workflows y resolver cualquier fallo existente. No continuar añadiendo guardias mínimas si CI está rojo.

**Prioridad 2:** cerrar un bloque de arquitectura y pruebas de la **vinculación segura actor HTTP ↔ autorización PostgreSQL**, respetando el contrato normativo y el límite de un restaurante. Diseñar primero el modelo de amenaza (SQL directo, rol técnico compartido, GUC falsificable, credenciales comprometidas, cambio de rol/suspensión concurrente); definir una alternativa verificable, auditable y de privilegio mínimo. Probarla en PostgreSQL 17 **desechable** con identidades reales, replays, revocaciones, carreras y suplantación. No activar un diseño incompleto ni inventar aprobaciones normativas.

**Prioridad 3:** si la vinculación requiere una decisión contractual no resuelta, documentar claramente el bloqueo y completar otro hito vertical autorizado de pedido→cocina o PWA con pruebas y documentación, sin colisionar con entregas Codex. No convertir una sucesión de pequeños tests en cierre de un módulo.

**Criterio de cierre de bloque:** implementación coherente + pruebas unitarias e integración PG17 cuando aplique + ambos workflows verdes para el SHA final + actualización documental del hito + declaración explícita de qué sigue sin operar. Mantener PR Draft y sin merge/despliegue.

## 7. Metodología autónoma

- Trabajar en bloques grandes y verificables; investigar contratos y código antes de modificar. Evitar pedir aprobación para cambios permitidos y no solicitar al usuario que supervise CI.
- Se puede esperar con shell o volver a consultar GitHub Actions **durante la sesión**; no afirmar trabajo autónomo futuro o en segundo plano sin una automatización real.
- Priorizar corregir causas raíz y cerrar funcionalidades frente a commits de una sola comprobación. No inventar métricas de porcentaje, estados de CI ni resultados de pruebas.
- En cada hito importante, actualizar la documentación **del repositorio**. Este handoff es contextual; nunca modifica la jerarquía normativa.

## 8. Primera instrucción concreta de sesión 9

«Comprueba en GitHub el HEAD actual de `integration/sabora-order-management-review`, el PR #7 y los workflows Sabora CI y Bootstrap Sabora lockfile. Lee primero el contrato funcional normativo y los documentos de seguridad y operaciones citados. Resuelve CI si procede, elige un hito grande y complétalo con código, pruebas PG17 desechable y documentación. Mantén rutas desactivadas hasta acreditar actor SQL no falsificable y permisos mínimos. No toques Fleetia, VPS ni Supabase operativo, y no hagas merge ni despliegue.»
