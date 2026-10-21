# CartaViva / Sabora — continuidad de sesión 01 → sesión 02

**Actualizado:** 2026-10-20. **Tipo:** guía operativa de traspaso, no sustituto de los contratos ni de la comprobación del estado vivo.

## Orden obligatorio de lectura para la próxima sesión
1. Comprobar repositorio **exclusivo** `jdlc86/CartaViva`, rama `feat/sabora-pnpm-bootstrap`, PR Draft [#2](https://github.com/jdlc86/CartaViva/pull/2), HEAD real, archivos cambiados, commits y GitHub Actions recientes. La rama/PR pueden evolucionar: verificar antes de actuar.
2. Leer `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` (requisitos funcionales).
3. Leer `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md` (arquitectura y puertas).
4. Leer `docs/architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md` (decisión de directorio y PWA).
5. Leer `docs/audits/SABORA_IMPLEMENTATION_CONTRACT_AUDIT_20261020.md` y `docs/audits/SABORA_REMEDIATION_20261020.md` (hallazgos y mitigaciones).
6. Revisar código real, migraciones, tests y workflows antes de afirmar que una función está terminada. Los documentos antiguos pueden contener hipótesis superadas; contrastar con decisiones aprobadas más recientes.

## Decisiones de arquitectura confirmadas
- **Un restaurante por instalación Sabora**, nunca una base compartida multitenant de restaurantes.
- Cada instalación tiene **dos PWA instalables distintas**: `apps/client` para comensales y `apps/management` para camareros, cocina y administración con permisos por rol. No hay PWA universal que alterne restaurantes.
- `apps/api`: Fastify/Node, autoridad del negocio. Monorepo Node >=22, pnpm 10.17.1, React/Vite/TypeScript para interfaces; paquetes compartidos.
- **CartaViva Directorio** es un servicio de identificación/encaminamiento separado, no una tercera PWA operativa. Registro central `restaurant_code` alfanumérico → `pwa_origin` HTTPS y estado. Los QR identifican restaurante y mesa, pero solo el backend de Sabora valida el token revocable y los permisos de visita.
- La identidad de restaurante pertenece al directorio y QR; dentro de la base operativa de una instalación no se necesita `restaurant_id` por fila.
- Cada restaurante futuro podrá tener proyecto Supabase, backend, contenedores y VPS propios. Aislamiento también entre las dos PWA de una instalación (scope, manifiesto, service worker y almacenamiento).
- La fuente de verdad de decisiones y contratos es **la documentación de GitHub**; nunca inventar contratos, estados de pruebas ni despliegues.

## Supabase: recursos reales y límites
- Conexión/organización autorizada: **RESTAURANTE**, organización `lqdarfcfumupgxbwmaoa`.
- Sabora operativo (existente): `byhvmumqivmunkmomhup` (proyecto `restaurante`). **No se han aplicado allí las migraciones SQL del prototipo de Sabora**.
- Directorio CartaViva (creado): `indoaqfmsfmueuqoilwv`, región `eu-central-1`. Coste comunicado para creación: 0 USD/mes, sin garantía de coste de consumos futuros.
- Migración aplicada en el proyecto de directorio: `directory_installations_private_initial`, equivalente a `supabase/directory/20261020_directory_installations.sql`. Tabla `cartaviva_directory.installations`: `id`, `restaurant_code` único, `display_name`, `pwa_origin`, `state`, fechas. Verificada con RLS activado y **cero filas** en la comprobación inicial.
- No hay resolvedor público ni alta administrativa todavía; tabla privada sin grants de cliente. No dar por terminada la validación de dominios, la protección antiabuso o la autorización administrativa.

## Seguridad y restricciones innegociables
- VPS compartido con **Fleetia**, proyecto completamente ajeno: no inspeccionar, modificar, reiniciar, detener, desplegar, eliminar ni depender de contenedores, redes, volúmenes, secretos o bases de Fleetia ni de otros proyectos.
- Solo se autoriza modificar código, ramas, commits, PR y GitHub Actions de **`jdlc86/CartaViva`**.
- **Ningún despliegue al VPS sin autorización expresa**, comprobación de aislamiento y plan de rollback que no afecte a otros proyectos. No hay autorización vigente.
- No merge automático ni pagos reales sin permiso. PR #2 permanece Draft hasta revisión.
- No conceder a `anon`/`authenticated` acceso a SQL interno por comodidad. Los RPC que reciben `p_actor_user_id` del llamador **no** son autenticación real; mantenerlos cerrados hasta disponer de identidad verificada del backend.

## Pruebas y CI existentes: comprobar resultados, no presumir éxito
- `package.json`: `pnpm test` ejecuta `node --test tests/*.test.mjs`; `pnpm build`; `pnpm check`.
- `.github/workflows/ci.yml`: instalación congelada, tests, build, validación de `deploy/compose.sabora.yml`, imagen Docker API, chequeo de usuario sin privilegios y salud en contenedor aislado.
- `.github/workflows/bootstrap-lockfile.yml`: workflow adicional con pruebas y smoke PostgreSQL; comprobar contenido y estado actuales.
- `scripts/ci/postgres-migration-smoke.sh`: PostgreSQL 17 desechable en Docker `--network none`, roles simulados, migraciones Sabora, RLS/privilegios, QR, idempotencia y líneas/pickup. No usa producción ni Supabase.
- `tests/order-lifecycle-sql.test.mjs`, `tests/order-lines-pickup-sql.test.mjs` y demás tests: **revisar compatibilidad** con migraciones de restaurante único.
- **Advertencia:** refactor SQL de multitenencia a instalación única estaba en curso; una ejecución CI intermedia falló y no se ha acreditado CI verde final para el refactor. Verificar runs y corregir tests/scripts antes de declarar cierre.

## Trabajo completado y pendientes verificables
- Contratos funcionales extensos, roadmap, auditoría y plan de remediación documentados.
- Bootstrap monorepo, API PoC, Docker Compose aislado y tests iniciales; **interfaces aún mayormente placeholder**.
- SQL de Sabora con operaciones de QR, agrupación, pedidos, líneas y recogida en revisión, **sin despliegue** a Supabase Sabora.
- Nuevo proyecto y tabla privada de CartaViva Directorio creados y verificados.
- Documentación actualizada para dejar explícitas **dos PWA independientes por restaurante** y separar CartaViva Directorio de Sabora.
- Pendientes prioritarios: cerrar refactor y pruebas SQL/CI; diseñar e implementar resolvedor seguro y alta administrativa; autenticación/roles reales; estados de pago/captura/despacho y garantías de idempotencia; interfaces completas; E2E, pruebas de concurrencia y seguridad.
- Hallazgos originales de auditoría: `docs/audits/SABORA_IMPLEMENTATION_CONTRACT_AUDIT_20261020.md`. No inferir que todos están resueltos por las mitigaciones parciales.

## Método de trabajo para sesión 02
1. Inventariar estado real GitHub/Supabase **sin cambios destructivos** y comunicar SHA/CI.
2. Contrastar la tarea pedida con contratos; distinguir decisión confirmada de propuesta pendiente.
3. Hacer cambios coherentes en rama permitida; migraciones versionadas; tests positivos, negativos, idempotencia, concurrencia, RLS y aislamiento.
4. Ejecutar/verificar GitHub Actions y registrar errores reales; no declarar éxito sin evidencia.
5. Actualizar contratos, auditorías y **este archivo de continuidad** en cada hito significativo: decisiones, archivos, commits/PR, runs, pruebas, riesgos, siguientes pasos.
6. No hacer merge ni despliegue sin autorización explícita.

## Mensaje corto para abrir sesión 02
«Continúa CartaViva/Sabora desde el repositorio `jdlc86/CartaViva`. Lee primero `docs/continuity/SESSION_02_HANDOFF.md` en la rama `feat/sabora-pnpm-bootstrap`, y todos los contratos que allí se indican. Verifica HEAD, PR #2, GitHub Actions, migraciones y pruebas antes de modificar nada. La documentación GitHub es la fuente de verdad. Respeta las dos PWA independientes por restaurante, el directorio CartaViva separado y el aislamiento absoluto de Fleetia. No despliegues ni hagas merge sin mi autorización. Continúa las tareas pendientes, valida y actualiza el documento de continuidad.»

## Sesión 02 — verificación y refuerzo CI (2026-10-20)
- HEAD verificado antes de este cambio: `9b0cf74c77f1f5191e2af034f605ca029177bac4`.
- GitHub Actions `Bootstrap Sabora lockfile` run `39465140625`, número 132: SUCCESS. Job `generate-lockfile`: paso PostgreSQL 17 desechable, tests, build, Compose e imagen API: SUCCESS. Esto acredita el smoke del prototipo, no conformidad funcional ni seguridad de producción.
- Se añade el smoke PostgreSQL 17 también a `.github/workflows/ci.yml` para que cambios en migraciones no dependan únicamente del workflow bootstrap condicionado por rutas.
- Validar el nuevo commit mediante GitHub Actions; no afirmar éxito hasta obtener conclusión. No se ejecutan migraciones sobre Supabase operativo, merge ni despliegue VPS.
- Prioridades siguientes: autenticación backend verificada y modelo transaccional de visita/cuenta/pedido/revisión/despacho; mantener RPC privadas.

## Sesión 02 — puerta de exposición de API
- Bootstrap CI run #133 (`39466502715`) SUCCESS sobre `700eca76d5d06270a05ea90bffb17973858865b1`; incluye smoke PostgreSQL 17 desechable.
- Se añade `tests/api-exposure-guard.test.mjs`: bloquea la aparición accidental de rutas operativas sin autenticación; por ahora únicamente `/health` y `/ready`. Es una protección estática transitoria, **no sustituye** autenticación real ni pruebas HTTP de autorización.
- La autoridad de identidad debe proceder de token Supabase Auth verificado criptográficamente y de membresía/estado vigentes consultados por el backend. No aceptar `actorUserId`, rol ni restaurante desde el cuerpo de la petición como fuente de autorización. Las mutaciones SQL seguirán privadas hasta implementar y probar el límite.
- Pendiente validar GitHub Actions del nuevo commit; sin merge, despliegue ni migraciones operativas.

## Sesión 02 — verificador criptográfico offline (trabajo en curso)
- `apps/api/src/auth.mjs`: primitiva aislada para verificar firma RS256 de JWT Supabase Auth con JWKS de confianza inyectado; comprueba `kid`, `alg`, `iss`, `aud`, `sub`, `role`, `iat`, `nbf`, `exp` y devuelve únicamente `userId` verificado. Rechaza algoritmos simétricos/`none` y claves no coincidentes.
- `tests/auth-verifier.test.mjs`: pruebas con RSA efímero para token válido, manipulación, firma/algoritmo, claims y configuración inválidos. `apps/api/package.json` incluye `node --check src/auth.mjs`.
- **No se ha conectado todavía a Fastify**: faltan obtención/rotación de JWKS del emisor de confianza, caché acotada, rechazo de sesión revocada según contrato, comprobación de estado/membresía vigentes en base de datos, tests HTTP y auditoría. No exponer endpoints de negocio hasta completar esos controles.
- Validar CI del HEAD actualizado. Ninguna migración a Supabase operativo ni despliegue VPS.

## Sesión 02 — JWKS de confianza (en rama, pendiente de gate final)
- CI #140 (`39471073517`) SUCCESS para `d9e43b639f484cca02fa8d874c129e87a8536086`.
- `apps/api/src/jwks.mjs` implementa proveedor JWKS RSA RS256 con endpoint fijo derivado del emisor configurado, sin redirects, timeout, límite de respuesta 64 KiB, máximo 20 claves, TTL acotado, coalescencia de peticiones y cierre ante fallo de actualización (sin servir claves caducadas de caché).
- `tests/jwks-provider.test.mjs` comprueba origen fijo, caché/expiración, concurrencia y fallos; compilación incluye comprobación sintáctica del módulo.
- Aún no existe integración de JWT/JWKS en Fastify, resolución de membresía activa ni protección transaccional. El código solo admite RS256; confirmar en Supabase Auth que las claves de firma de esta instalación utilizan ese algoritmo antes de integración. Si usa ES256, implementar y probar algoritmo explícitamente, nunca relajar la verificación.
- El nuevo commit requiere CI verde. Sin merge, migraciones a Supabase ni despliegue VPS.

## Sesión 02 — hook de autenticación para futuras rutas
- CI de JWKS #144 (`39471470440`) estaba en ejecución al comprobarlo; consultar conclusión antes de certificar.
- Añadido `apps/api/src/auth-hook.mjs`: hook Fastify de bearer token que obtiene JWKS del proveedor inyectado, verifica firma y claims y establece `request.verifiedIdentity` exclusivamente a partir del verificador. Respuesta uniforme 401 ante credenciales ausentes, incorrectas o proveedor no disponible. Sin dependencia de `actorUserId` del cliente.
- Añadido `tests/auth-hook.test.mjs` para cabeceras inválidas, suplantación, identidad verificada y fallos de claves/firma. Incluido chequeo sintáctico en build.
- **Aún no está registrado en `server.mjs` ni habilita rutas operativas.** Antes de conectarlo: definir estado y rol de empleados con base de datos durable, estrategia de sesión/revocación y pruebas HTTP Fastify. Mantener `/health` y `/ready` públicos; todo negocio cerrado.
- No hay despliegue ni modificación de recursos operativos. CI del nuevo HEAD pendiente.

## Sesión 02 — autorización de empleados por estado vigente
- Añadido `apps/api/src/staff-authorization.mjs` con autorización desacoplada: exige identidad previamente verificada, consulta `lookupStaff(userId)` en cada solicitud, exige `state='active'` y rol permitido, rechaza identidad ausente/roles ajenos con 403 y errores del almacén con 503 (sin abrir permisos).
- Añadido `tests/staff-authorization.test.mjs`: suplantación de actor/rol en body, revocación entre peticiones, ausencia de identidad, roles inválidos y caída del almacén. Build valida sintaxis.
- **Brecha explícita:** `sabora.staff_members` en la migración PoC actual solo contiene `user_id` y `role`, sin columna `state`. Este módulo NO está conectado al servidor ni a PostgreSQL. Antes de usarlo hay que aprobar e implementar migración versionada de estado de membresía, lookup durable con privilegios mínimos, revocación de sesiones y auditoría; no inferir `active` de una fila existente.
- Bootstrap CI #148 (`39471596977`) estaba en ejecución al verificar; consultar su conclusión y el nuevo HEAD. No merge, despliegue ni cambios a Supabase operativo.

## Sesión 02 — estado persistente de acceso (prototipo PostgreSQL)
- CI #152 (`39471749415`) SUCCESS sobre el hito anterior de autorización en memoria.
- Migración nueva `20261020190000_sabora_staff_access_state.sql`: `staff_members.state` no nulo con `invited` por defecto y estados `active`, `suspended`, `revoked`; **ninguna fila existente se activa automáticamente**. Añade guardia `require_active_staff_role` y triggers en eventos de estado de pedido y línea; si actor está inactivo se aborta toda la transacción, incluido cambio previo de estado. Mantiene RLS FORCE y RPC privadas.
- Smoke PostgreSQL 17 desechable incluye nueva migración, activación explícita de fixtures y regresiones de estado por defecto y actor revocado en transición válida. No es un flujo completo de activación/revocación administrativa, ni reemplaza autorización de identidad en API: las RPC todavía reciben `actor_user_id` suministrado por quien llama y siguen sin permisos de ejecución públicos.
- No se ha aplicado a Supabase operativo. Verificar CI del último commit antes de afirmar éxito.

## Sesión 02 — corrección de gate PostgreSQL
- Bootstrap CI #158 (`39472194984`) FAILURE, localizado en el paso de PostgreSQL 17 desechable. Tests Node y build pasaron; PostgreSQL informó `syntax error at or near "$"` en la segunda función de `20261020190000_sabora_staff_access_state.sql`.
- Corregido el delimitador del cuerpo PL/pgSQL de `enforce_active_transition_actor` a `$guard$` en ambos extremos. La migración original sigue siendo prototipo no aplicado a Supabase operativo.
- Verificar ejecución CI sobre el commit de corrección y revisar posibles fallos posteriores de los smoke tests; **no afirmar verde hasta resultado**.

## Sesión 02 — refuerzo de regresión de empleado invitado
- CI #161 (`39472525829`) superó el paso PostgreSQL 17 y Docker Compose aislado tras corregir la sintaxis de la migración. Consultar conclusión global antes de certificar el run.
- Se añade al smoke SQL un intento de transición válida por un empleado `invited`, que debe fallar con `42501` incluso cuando su rol nominal sea `kitchen`. Se mantiene el test de revocación y el de no activación por defecto.
- CI del commit de refuerzo pendiente. Sin endpoints operativos, merge, despliegue ni migración de Supabase.

## Sesión 02 — prueba HTTP aislada de composición de autorización
- CI #163 (`39472656059`) estaba en curso al comenzar el hito; consultar resultado definitivo.
- `apps/api/src/protected-route-hooks.mjs` compone autenticación Bearer/JWKS y consulta de membresía vigente en `preHandler` por ruta, exige lista de roles explícita y no registra rutas de negocio.
- `tests/protected-route-hooks.test.mjs` usa `Fastify.inject` sobre ruta **solo de prueba**, verifica 401 sin token o token inválido, 403 ante revocación o rol incorrecto, 503 ante fallo de almacén y éxito únicamente con identidad verificada y estado activo. Se resuelve Fastify desde dependencias del workspace API.
- **No integrado en `apps/api/src/server.mjs`**. `lookupStaff` todavía es un contrato inyectable, no una conexión PostgreSQL. Falta definir credenciales técnicas mínimas, resolver estado en DB y evitar actor arbitrario en RPC. CI del HEAD nuevo pendiente.

## Sesión 02 — adaptador de lectura PostgreSQL de empleados
- CI #167 (`39472814552`) SUCCESS sobre composición Fastify aislada.
- Añadido `apps/api/src/postgres-staff-lookup.mjs`: consulta SQL parametrizada de `role,state` por UUID verificado; rechaza resultados anómalos y propaga errores de DB para que la autorización responda 503. No usa datos de identidad del body.
- Añadido `tests/postgres-staff-lookup.test.mjs` y chequeo sintáctico de build.
- Migración prototipo `20261020200000_sabora_staff_reader.sql` crea rol técnico `NOLOGIN NOBYPASSRLS`, concede solo `USAGE` del esquema y SELECT limitado a columnas de membresía con política RLS explícita. Smoke PostgreSQL 17 prueba ausencia de escrituras. **Este rol aún no tiene credencial LOGIN ni conexión runtime; ninguna migración se ha aplicado a Supabase.** Revisar política y provisionamiento de rol con infraestructura antes de habilitar acceso real.
- CI del nuevo HEAD pendiente; `server.mjs` permanece solo health/ready.

## Sesión 02 — ejecución real de permisos del rol técnico
- En el run #169 (`39473284933`) pasaron los pasos PostgreSQL 17 y Compose; consultar conclusión completa.
- Ampliado `scripts/ci/postgres-migration-smoke.sh` con `SET ROLE sabora_staff_reader`: ejecuta SELECT real sobre membresía bajo RLS y comprueba que lectura de pedidos y UPDATE de empleados produzcan `insufficient_privilege`. `RESET ROLE` restaura la identidad del smoke.
- La política `USING (true)` se limita al rol técnico dedicado y al SELECT de tres columnas de `staff_members`; **no representa aislamiento por usuario**. Su uso operativo requerirá credenciales backend aisladas, no reutilizadas ni concedidas a roles de navegador, y consultas parametrizadas exclusivamente con identidad JWT verificada. Ninguna conexión runtime está configurada.
- CI del HEAD reforzado pendiente. Sin cambios de producción.

## Sesión 02 — composición PostgreSQL y autorización HTTP aislada
- CI #172 (`39473465747`) SUCCESS: smoke de `SET ROLE sabora_staff_reader` validado en PostgreSQL 17 desechable.
- Nuevo `apps/api/src/postgres-protected-route-hooks.mjs` une el adaptador de consulta SQL parametrizada con los hooks Fastify de JWT y rol vigente. El ejecutor SQL sigue inyectado; **no se crea pool, credenciales ni conexión operativa**.
- `tests/postgres-protected-route-hooks.test.mjs` registra una ruta solo en Fastify de pruebas; comprueba identidad verificada, parámetro SQL, revocación y suspensión entre peticiones, cambio de rol y 503 por fallo DB. Se añadió chequeo de sintaxis al build.
- Pendiente: CI del nuevo HEAD, diseño/provisión auditada de conexión técnica mínima, control de origen de identidad para RPC y cierre de sesiones. `server.mjs` sigue exponiendo solo health/ready. Sin merge/despliegue/Supabase operativo.

## Sesión 02 — límite de consulta técnica a PostgreSQL
- CI #176 (`39473811061`) SUCCESS para composición HTTP con adaptador PostgreSQL.
- Nuevo `apps/api/src/staff-reader-query.mjs`: exige un pool inyectado y limita las consultas a la sentencia parametrizada exacta de `role,state` por `user_id`. Rechaza SQL diferente o parámetros de longitud incorrecta antes de tocar el pool. Pruebas en `tests/staff-reader-query.test.mjs`; build incluye chequeo sintáctico.
- **No hay conexión real ni credenciales**, no se añade dependencia de driver ni se conecta al servidor HTTP. Falta provisionar de forma aislada el rol LOGIN de mínimos privilegios, TLS/verificación, secretos y cierre del pool, y validar la consulta real bajo RLS. El límite de consultas de JS complementa, no sustituye, los permisos de PostgreSQL.
- CI del HEAD nuevo pendiente. Sin merge, despliegue ni modificaciones en Supabase operativo/Fleetia.

## Sesión 02 — fábrica de autorización con pool inyectado
- Run #180 (`39474035030`) se encontraba en curso durante esta iteración; comprobar resultado antes de certificarlo.
- Añadida `apps/api/src/staff-protected-hooks-from-pool.mjs`: compone pool inyectado -> SQL de membresía estrictamente permitido -> lookup de estado actual -> JWT/roles de Fastify. **No crea ni abre conexiones, no maneja secretos y no registra rutas públicas.**
- `tests/staff-protected-hooks-from-pool.test.mjs` valida HTTP 200 activo, HTTP 403 tras revocación, consulta SQL parametrizada exacta y HTTP 503 ante indisponibilidad del pool. Build verifica sintaxis.
- Pendiente CI del HEAD; sigue pendiente driver/pool técnico real, SSL verificable, credenciales independientes y autorización transaccional de RPC. No aplicar a Supabase operativo ni desplegar sin permiso expreso.

## Sesión 02 — configuración TLS estricta del pool de lectura
- CI #184 (`39474165005`) SUCCESS sobre fábrica de autorización con pool inyectado.
- Añadido `apps/api/src/staff-pool-config.mjs`: valida host, puerto, nombre de DB, usuario técnico `sabora_staff_reader_login`, contraseña y CA PEM explícita; fuerza `ssl.rejectUnauthorized=true`, limita pool a 3 conexiones y timeouts. Tests negativos para CA ausente, puerto inválido, usuario privilegiado y host en formato URL.
- **Solo validación de configuración**: no se instala driver `pg`, no se abre conexión, no se crean roles LOGIN, no se accede a secretos operativos. El rol NOLOGIN de la migración no es aún una identidad conectable. El futuro login deberá provisionarse con permisos mínimos, sin BYPASSRLS, y heredar exclusivamente permisos del rol lector; verificar TLS/CA reales antes de habilitarlo.
- CI del nuevo HEAD pendiente. No hay merge, despliegue ni acceso a Supabase operativo.

## Sesión 02 — ciclo de vida del pool técnico
- CI #188 (`39475174235`) SUCCESS para validación TLS estricta.
- Añadido `apps/api/src/staff-pool-lifecycle.mjs`: recibe constructor `Pool` inyectado, valida configuración TLS antes de abrir, abre una sola vez y cierra de forma idempotente, con cierre concurrente compartido. Tras cerrar, el objeto no permite reabrir. Tests con driver simulado en `tests/staff-pool-lifecycle.test.mjs`; build valida sintaxis.
- **No se ha instalado ni conectado un driver real** y no se integra el pool en `server.mjs`. Falta revisar la interacción con errores de constructor/fin de conexión, verificar CA real, credenciales de LOGIN y controles de autorización transaccional. CI del HEAD pendiente.
- Sin merge, despliegue ni acceso a Supabase operativo/Fleetia.

## Sesión 02 — robustez de fallos del pool
- CI #192 (`39475689350`) SUCCESS para ciclo de vida inicial.
- `staff-pool-lifecycle.mjs` endurecido: constructor fallido deja ciclo terminal, instancia inválida intenta cierre asíncrono si es posible, error en `end()` no permite reapertura ni segundo cierre físico. Nuevas regresiones de estos tres casos.
- Pendiente CI del HEAD. No se abre conexión real, ni se usan secretos, ni se despliega. **Limitación pendiente:** la limpieza de una instancia inválida se realiza de mejor esfuerzo; el controlador definitivo debe cumplir el contrato del pool y registrarse observabilidad de errores de cierre antes de producción.

## Sesión 02 — observabilidad de pool sin secretos
- Run #195 (`39487875919`): job principal `generate-lockfile` SUCCESS, con migraciones PostgreSQL 17, Compose y smoke de imagen correctos; comprobar conclusión del run antes de afirmarla.
- `apps/api/src/staff-pool-observer.mjs`: solo emite `{component,event}` con eventos permitidos y cardinalidad acotada. `staff-pool-lifecycle.mjs` emite apertura, fallo de apertura, pool inválido, cierre y fallo de cierre; errores del observador nunca afectan la limpieza.
- Pruebas `tests/staff-pool-observer.test.mjs` verifican ausencia de secretos en los eventos y continuidad si el observador falla. Las excepciones originales del driver se propagan al llamador; **no deben volcarse directamente a logs públicos**. Pendiente revisar política de logs de la API y CI nuevo.
- No driver real, no conexiones a Supabase, no despliegue ni merge.

## Sesión 02 — sanitización de errores de consulta
- Run #200 (`39488090001`) estaba en curso al inicio, con PostgreSQL 17 y Compose correctos; comprobar conclusión final.
- Añadido `apps/api/src/safe-staff-reader-query.mjs` y conectado a `staff-protected-hooks-from-pool.mjs`: captura errores del driver sin propagar mensajes, `cause` ni cadenas de conexión al límite de autorización; devuelve código estable `staff_reader_unavailable`, que el guard HTTP transforma en 503.
- El observador permite evento acotado `staff_reader_query_failed`, sin texto de excepción. Nuevas pruebas `tests/safe-staff-reader-query.test.mjs` verifican ausencia de secretos y fallos no fatales del observador. CI del HEAD pendiente.
- No driver real ni conexión operativa, no merge ni despliegue.

## Sesión 02 — regresión HTTP extremo a extremo de errores secretos
- CI #206 (`39488277336`) estaba en curso al inicio; verificar conclusión final.
- Añadida regresión en `tests/staff-protected-hooks-from-pool.test.mjs`: un error simulado del driver que contiene una URL con contraseña debe traducirse en HTTP 503 `authorization_unavailable`, sin exponer el secreto ni en respuesta ni en el evento acotado del observador.
- No se añade driver real ni se abren rutas operativas. CI del nuevo HEAD pendiente. No hay merge, despliegue o cambios en Supabase/Fleetia.

## Sesión 02 — propuesta de provisión del LOGIN técnico (sin ejecución)
- CI #208 (`39488409123`) en curso al inicio; verificar conclusión final.
- Borrador de revisión **no ejecutable automáticamente** en `docs/security/STAFF_READER_LOGIN_PROVISIONING_DRAFT.sql`: rol LOGIN `sabora_staff_reader_login` con `NOBYPASSRLS` e `INHERIT`, miembro únicamente del rol NOLOGIN `sabora_staff_reader`. No contiene contraseñas ni se incluye en glob de migraciones.
- Antes de cualquier aplicación: revisión independiente de privilegios del proveedor, autenticación/TLS, memberships existentes, default privileges, grants efectivos, restricciones de red y permisos de crear roles. La propuesta NO constituye autorización para provisionar Supabase.
- Sin despliegue, merge ni cambios operativos.

## Sesión 02 — prueba real del LOGIN técnico en PostgreSQL 17 aislado
- CI #211 (`39488524799`) en ejecución al iniciar el cambio, con migraciones y Compose ya correctos. Comprobar conclusión final.
- `scripts/ci/postgres-migration-smoke.sh` crea **solo dentro del contenedor desechable sin red** el rol `sabora_staff_reader_login LOGIN INHERIT NOBYPASSRLS` y le concede únicamente `sabora_staff_reader`. Verifica ausencia de BYPASSRLS/membresías inesperadas, SELECT de membresía permitido y SELECT de pedidos/UPDATE de personal denegados bajo `SET ROLE sabora_staff_reader_login`.
- La propuesta SQL en `docs/security/STAFF_READER_LOGIN_PROVISIONING_DRAFT.sql` sigue siendo **borrador no incluido en migraciones**. El login del CI no tiene contraseña ni conexión externa. Pendiente resultado CI del nuevo HEAD y evaluación del modelo real de roles de Supabase.
- Sin merge, despliegue, creación de usuarios en Supabase ni intervención en VPS/Fleetia.

## Hito de bloque largo — composición offline del runtime de autorización
- CI #213 (`39488630655`) SUCCESS para prueba PostgreSQL 17 aislada del LOGIN heredado.
- Añadido `apps/api/src/staff-authorization-runtime.mjs`: compone lifecycle del pool, observador de eventos acotados y hooks Fastify JWT+RLS; no abre conexiones al importar ni registra rutas públicas. El caller inyecta driver, credenciales, verificador y JWKS. `open()` asíncrono reutiliza hooks solo mientras el pool sigue abierto; `close()` es terminal. Ante fallo de composición, espera el cierre del pool antes de propagar error.
- `tests/staff-authorization-runtime.test.mjs`: pruebas Fastify offline con pool simulado para autorización/revocación en peticiones sucesivas, consulta SQL fijada, TLS estricto, cierre único concurrente, error de configuración con limpieza y 503 sin secretos ante caída DB.
- `apps/api/package.json` incluye chequeo sintáctico del nuevo módulo. **CI de este HEAD pendiente**; no confundir pruebas publicadas con ejecución certificada.
- Queda pendiente: evaluar provisión de identidad en Supabase, driver real, políticas de log, carrera revocación/operación, rutas de negocio y aprobación de despliegue. No hay conexión operativa, merge, ni despliegue; Fleetia intocable.

## Hito — ROOT único y titularidad ADMIN de escritura (2026-10-20)
- Decisión de usuario: exactamente un ROOT por instalación; varios ADMIN, máximo uno con escritura administrativa.
- Contrato en `docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md`; se revisaron en solo lectura documentos y migración de Fleetia (commit 7c7f3b5). La trasposición no es literal: ROOT Sabora controla reasignación forzosa.
- Primer gate offline `apps/api/src/admin-write-gate.mjs` con tests `tests/admin-write-gate.test.mjs`; el gate no está conectado a rutas/DB y no sustituye autorización transaccional anti-TOCTOU.
- Próximo bloque: esquema y pruebas desechables de ROOT singleton, owner singleton, transferencias concurrentes, revocación, auditoría; integrar autorización ROOT en lector y hooks solo cuando el contrato de persistencia esté probado. Verificar CI del HEAD antes de continuar.

## Prototipo PostgreSQL ROOT / titularidad (2026-10-20)
- Nueva migración **no aplicada** `supabase/migrations/20261020210000_sabora_root_admin_owner.sql`: rol ROOT, índice único parcial ROOT, tabla singleton de titularidad ADMIN, triggers para impedir degradación/suspensión/baja de ROOT y titular sin transferencia, comprobación de titular ADMIN activo.
- Smoke PostgreSQL 17 desechable ampliado para probar segundo ROOT, revocación/borrado ROOT, suspensión de titular, titular ROOT prohibido y cambio entre ADMIN. **CI de este HEAD aún pendiente**.
- LIMITACIONES: aún falta mecanismo transaccional de solicitudes/ofertas/aceptaciones/auditoría; no hay ROOT inicial real ni API conectada. El índice garantiza **como máximo uno**, no existencia automática de ROOT. Falta prueba de carreras bajo conexiones simultáneas y endurecer operaciones directas contra el singleton antes de considerar producción. No se ejecutaron migraciones operativas ni se tocó Fleetia.

## Ensayo real de dos sesiones (2026-10-20)
- `scripts/ci/admin-ownership-concurrency-smoke.sh` ejecuta dos procesos `psql` contra el mismo PostgreSQL 17 desechable: transferencia de propietario con bloqueo retenido y suspensión posterior del antiguo titular. Se integra al final de `scripts/ci/postgres-migration-smoke.sh`.
- El ensayo verifica orden de bloqueos y resultado final, **no** cubre todavía transferencias concurrentes con solicitudes/aceptaciones (no implementadas), ni los aislamientos REPEATABLE READ.
- Estado: commit publicado, ejecución CI del nuevo HEAD pendiente. No usar esta prueba como certificación completa de concurrencia o como autorización de despliegue.

## ROOT en lectura de membresía (2026-10-20)
- `apps/api/src/staff-authorization.mjs` y `postgres-staff-lookup.mjs` ahora admiten rol `root` persistido; no se aceptan roles arbitrarios ni claims del cliente. Se agregaron regresiones para ROOT activo, revocado y separación respecto a ADMIN.
- El reconocimiento del rol no crea rutas ROOT ni concede titularidad automáticamente; la integración de mutaciones transaccionales sigue pendiente.
- CI #238 confirmó éxito del paso de migraciones PostgreSQL 17 y de Compose aislado; ejecución completa y HEAD posterior aún requieren comprobación.

## Dominio de cesiones de titularidad (2026-10-20)
- Añadido `apps/api/src/ownership-transition-policy.mjs`: función pura para solicitud, oferta, aceptación, rechazo, cancelación y reasignación forzosa exclusiva de ROOT; comprueba actor activo, propietario vigente, propuesta pendiente y destinatario ADMIN activo. Tests en `tests/ownership-transition-policy.test.mjs`.
- **NO es una operación segura de escritura por sí sola:** debe llamarse bajo una transacción PostgreSQL con bloqueo del singleton, lectura fresca de membresías y propuesta, auditoría append-only, idempotencia y ACL mínimos. No hay rutas HTTP ni persistencia de propuestas aún. CI pendiente.

## Persistencia inicial de cesiones (2026-10-20)
- Migración aislada `20261020220000_sabora_ownership_proposals_audit.sql`: tabla privada de propuestas request/offer con estado y correlation_id único, y auditoría de titularidad con append-only trigger, RLS FORCE y sin grants de navegador.
- Smoke PostgreSQL 17 incluye nueva migración, 12 tablas RLS, propuesta válida, rechazo de auto-transferencia y rechazo de UPDATE/DELETE de auditoría.
- Aún **NO** existen procedimientos SQL transaccionales de decisión, actor seguro, ni rutas HTTP; el esquema por sí solo no autoriza operaciones. CI de estos cambios pendiente; no aplicar a Supabase operativo.

## CI #252 — incidencia y corrección
- El smoke falló por insertar un segundo ROOT en la sección nueva de auditoría después de haber sembrado el ROOT singleton. La unicidad `sabora_one_root` actuó correctamente. Corregido el fixture para reutilizar el ROOT anterior, sin debilitar la restricción. La validación del commit correctivo está pendiente.

## Gate CI y adaptador de titularidad (2026-10-20)
- Workflow #254 (commit `7a60957c`) SUCCESS: migraciones, smoke PostgreSQL 17, Compose e imagen API validados en entorno aislado.
- Añadido `apps/api/src/postgres-owner-lookup.mjs` con lectura SQL fija del singleton, rechazo de ausencia/duplicidad/UUID inválido y retorno `null` solo para bootstrap sin titular; pruebas en `tests/postgres-owner-lookup.test.mjs`.
- **No conectar como autorización definitiva de escritura**: el gate de consulta sufre TOCTOU si la mutación no revalida actor y titular bajo el mismo bloqueo/transacción. Sin conexión de runtime ni grants operativos.

## CI #257/#258 — fallo de validación UUID
- Los tests del nuevo adaptador `postgres-owner-lookup.mjs` revelaron que su regex omitía un grupo de cuatro caracteres del UUID. Cambiar el fixture no resolvía el defecto; se corrigió la regex en commit `8d72ba5d`. No confundir el fallo del adaptador con un fallo de migración PostgreSQL: los pasos de base de datos fueron omitidos por el test unitario fallido. Nueva validación CI pendiente.

## Límite transaccional de escritura administrativa (2026-10-20)
- Workflow #260: pasos completos SUCCESS (Node tests, PostgreSQL 17 aislado, Docker Compose, build y smoke API).
- Nuevo `apps/api/src/transactional-admin-write.mjs`: callback `withTransaction` de conexión única, `SELECT ... FOR UPDATE` del singleton, relectura de rol/estado de miembro desde DB bajo bloqueo y ejecución de mutación dentro de la misma transacción. ROOT activo conserva autoridad separada; ADMIN no titular no escribe. Pruebas en `tests/transactional-admin-write.test.mjs`.
- **Integración pendiente:** proporcionar adaptador real que garantice BEGIN/COMMIT/ROLLBACK en la misma conexión, aislar privilegios SQL del runtime, y conectar rutas administrativas. El módulo no constituye por sí solo un procedimiento de transferencia ni elimina todas las carreras con operaciones no coordinadas. CI nuevo pendiente; sin despliegue.

## Adaptador PostgreSQL transaccional (2026-10-20)
- CI #263 falló en test unitario del gate transaccional por segunda regex UUID incompleta (mismo patrón de error que lector de titular); corregido en `a588432`.
- Añadido `apps/api/src/postgres-transaction.mjs` con `pool.connect()`, BEGIN/COMMIT/ROLLBACK en una sola conexión y release; pruebas en `tests/postgres-transaction.test.mjs` para éxito, fallo durante trabajo y fallo al iniciar.
- Integración de runtime, permisos de DB, transferencias auditadas, idempotencia y pruebas de concurrencia aún pendientes. No se ha ejecutado SQL operativo ni desplegado.

## Workflow de cesión transaccional (2026-10-20)
- CI #267: pasos de Node, PostgreSQL 17, Compose, build y smoke API SUCCESS.
- Nuevo `apps/api/src/ownership-workflow.mjs`: recibe identidad ya verificada, correlation UUID y operación; bajo `withTransaction` bloquea singleton, revalida membresías, consulta propuesta, ejecuta política de dominio, modifica titular/propuesta y añade auditoría. Reintento de correlación existente evita duplicar escrituras; test en `tests/ownership-workflow.test.mjs`.
- **Puertas pendientes antes de uso real:** pruebas PostgreSQL 17 de concurrencia de operaciones de cesión y idempotencia, comprobación de parámetros del replay (no solo actor/acción), privilegios mínimos del runtime y auditoría de transacciones que se revierten; rutas y notificaciones aún no integradas. No conectar a producción.

## Diagnóstico CI #272 y corrección de aceptación
- CI #272 FAILED: `accepted request updates owner, proposal and audit` recibió `{error:'invalid_transition'}`.
- Causa comprobada: `ownership-workflow.mjs` entregaba a `decideOwnershipTransition` la fila SQL del destinatario con `user_id` en lugar de `userId`. Adaptación explícita corregida en `58bc106`; prueba adicional de reasignación ROOT en `044127c`.
- Verificar nuevo CI antes de considerar superada esta puerta. Pendiente revisión de idempotencia estricta y pruebas PostgreSQL 17 reales para las cesiones.

## Hito: correlación estricta de titularidad (2026-10-20)
- Workflow #275 SUCCESS en commit `bf08148`.
- Detectada incompatibilidad SQL real: el workflow emitía `accepted_transfer` en auditoría pero la restricción SQL solo permite `accept`; corregido en `5480b0a`.
- Migración `20261020230000_sabora_ownership_idempotency.sql` añade `request_payload jsonb` a auditoría. El workflow guarda operación, actor, propuesta, destino y motivo normalizados, y solo admite replay cuando coincide el payload íntegro; las filas antiguas con payload NULL no son reproducibles. Añadida prueba de rechazo al cambiar el motivo y migración incluida en smoke PostgreSQL 17.
- **Pendiente:** CI de este bloque, test transaccional de concurrencia e integración de privilegios/rutas. No ejecutar en Supabase operativo sin autorización.


## Handoff a Codex Desktop — primera interacción y bloque autónomo (2026-10-20)

### Entrada obligatoria y límites
- Codex Desktop puede iniciar sin clon local ni contexto. Antes de editar, localizar o clonar **solo** `jdlc86/CartaViva`, comprobar `git remote -v`, `git status`, rama y HEAD; trabajar sobre `feat/sabora-pnpm-bootstrap` y PR #2 sin pisar cambios ajenos. Si no hay acceso al repositorio, detenerse y solicitar acceso, sin crear un repositorio alternativo.
- Leer **este documento completo**, `docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md`, `docs/architecture/SABORA_ROOT_OWNERSHIP_TRANSACTION_DESIGN.md`, contratos de seguridad, migraciones y scripts CI relevantes. La documentación GitHub prevalece sobre cualquier resumen o prompt; registrar contradicciones, no inventar contratos.
- Una instalación Sabora = un restaurante; PWA cliente y gestión independientes. Un ROOT protegido, múltiples ADMIN pero como máximo un titular de escritura. Autoridad desde identidad verificada y membresía durable; nunca del cliente.
- **Prohibido modificar Fleetia** (repositorio, contenedores, bases de datos, redes, volúmenes, puertos). VPS compartido: ningún despliegue, reinicio, parada, limpieza o intervención operativa sin autorización expresa y aislamiento completo. No aplicar migraciones al Supabase operativo. No merge ni revisión Codex externa de pago sin aprobación.

### Encargo sugerido: puerta transaccional de titularidad, pruebas y seguridad
1. Verificar HEAD y estado real de CI; último éxito conocido al redactar: workflow #281 en commit `9af02f6389ffc94c183ab988e2066efe330b075d`. Puede haber nuevos commits.
2. Auditar `apps/api/src/ownership-workflow.mjs`, `ownership-transition-policy.mjs`, `postgres-transaction.mjs`, `transactional-admin-write.mjs` y migraciones `20261020210000`–`20261020230000`. Corregir fallos de lógica y de esquema **con pruebas que reproduzcan cada fallo**.
3. Construir pruebas integradas en PostgreSQL 17 **desechable y aislado** para solicitudes, ofertas, aceptación, rechazo, cancelación, reasignación ROOT, auditoría append-only, idempotencia exacta, concurrencia (dos conexiones) y fallos con rollback. Reutilizar `scripts/ci/postgres-migration-smoke.sh` y mecanismos CI existentes; no tocar entornos operativos.
4. Verificar invariantes de bloqueo, estado activo, propietario único, ROOT único, carreras y lock ordering. No confiar solo en tests con consultas simuladas. Examinar particularmente el replay por correlationId, cambios concurrentes de propuesta, integridad de audit y permisos SQL mínimos.
5. Integrar un adaptador/runtime o rutas **solo si** el contrato de identidad verificada, permisos y despliegue ya documentado permite hacerlo de manera segura; de lo contrario dejar la integración pendiente y documentar la razón. No improvisar JWT, credenciales, privilegios ni nuevas reglas de negocio.
6. Ejecutar tests, lint/build y CI del repositorio; resolver fallos. Commits pequeños y coherentes sobre la rama autorizada; no fusionar PR #2. Actualizar documentación de arquitectura/seguridad al cambiar contratos.

### Entrega de vuelta a ChatGPT
- Añadir al final de **este mismo archivo** una sección titulada `## Retorno Codex Desktop — AAAA-MM-DD` con: rama y SHA final, commits, archivos modificados, decisiones técnicas y justificación, pruebas ejecutadas (comandos y resultados), enlaces/IDs de GitHub Actions, vulnerabilidades o bloqueos pendientes, operaciones explícitamente no realizadas y siguiente bloque recomendado.
- Dejar el árbol limpio o explicar exactamente los cambios sin commit. Entregar al usuario un resumen conciso con SHA y estado de CI. Nunca escribir «CI verde» sin haber consultado la ejecución real.

## Retorno Codex Desktop — 2026-10-20

### 1. Rama y SHA del bloque
- Rama autorizada: `feat/sabora-pnpm-bootstrap`, PR #2 abierto sin fusionar.
- SHA final de implementación validada: `5ca337362ee37094f85bdcaf2b6c076325496224`.
- Esta sección se publica en un commit documental posterior. El SHA final de la rama se informa en la respuesta de retorno porque un commit no puede contener su propio SHA sin cambiarlo.

### 2. Commits realizados
- `5ca3373 fix(sabora): harden ownership transactions`: autorización, workflow, migración, concurrencia, CI, pruebas y contratos.
- Commit documental de este retorno: SHA informado externamente tras publicarlo y validar su HEAD.

### 3. Archivos y funcionalidades
- `apps/api/src/ownership-workflow.mjs`: UUID canónicos, shape y límite de motivo, revalidación durable antes de replay, igualdad semántica JSONB en PostgreSQL, resultado persistido/reproducible, orden singleton → staff ordenado → propuesta, resultado/auditoría atómicos.
- `apps/api/src/transactional-admin-write.mjs`: únicamente el ADMIN activo que coincide con el titular bloqueado puede ejecutar la mutación; ROOT queda fuera del plano ordinario.
- Eliminados `apps/api/src/admin-write-gate.mjs` y su test: su autorización separada de la mutación permitía TOCTOU y no tenía consumidores reales.
- `supabase/migrations/20261020240000_sabora_ownership_hardening.sql`: `result`/`result_payload`, constraints JSONB/motivo, ROOT siempre activo, promoción ROOT ordinaria prohibida, trigger append-only para TRUNCATE y default EXECUTE revocado a PUBLIC. Migración versionada, no aplicada a Supabase operativo.
- `scripts/ci/admin-ownership-lifecycle-smoke.sh` y `postgres-migration-smoke.sh`: lifecycle request/offer/accept/reject/cancel/force, replay exacto/conflictivo, rollback intermedio, audit UPDATE/DELETE/TRUNCATE, ROOT y dos carreras de conexiones.
- `.github/workflows/ci.yml`: corregido scalar YAML inválido que hacía fallar el workflow sin jobs; checkout sin credenciales persistidas.
- `.github/workflows/bootstrap-lockfile.yml`: PR read-only, checkout sin credenciales y retirada de write-back con código no revisado.
- Tests de workflow, writer, bootstrap y deployment actualizados; el test de `.dockerignore` acepta CRLF de Windows.
- Contratos de arquitectura y seguridad actualizados para fijar ROOT como gobierno/recovery y no como escritor administrativo ordinario.

### 4. Problemas detectados y soluciones
- ROOT era un segundo escritor efectivo: eliminado el bypass y conservada solo la reasignación forzosa a ADMIN activo.
- Gate no transaccional susceptible a cambio de titular/revocación entre check y uso: módulo retirado; único límite permitido `transactional-admin-write`.
- Replay `jsonb` dependía del orden de claves, no devolvía el resultado exacto y omitía revalidar al actor: comparación `jsonb` en SQL, `result_payload` y revalidación bajo bloqueo.
- UUID en mayúsculas y nombres JS/SQL podían producir denegaciones incorrectas: normalización en todas las fronteras y adaptación explícita.
- Orden de locks de aceptación no coincidía con el contrato: descubrimiento no bloqueante de destinatario, staff ordenado y relectura de propuesta `FOR UPDATE` bajo singleton.
- Auditoría no impedía TRUNCATE y no almacenaba resultado: trigger de statement y columnas de resultado.
- La primera fila ROOT podía quedar `invited`: constraint validado y trigger para estado activo; la existencia exactamente-una sigue siendo responsabilidad del bootstrap/recovery pendiente.
- Workflow de bootstrap ejecutaba PR con `contents: write`; convertido a validación read-only.
- CI principal era YAML inválido por `ERROR:` en un scalar inline; convertido a bloque multilínea y confirmado por GitHub.

### 5. Decisiones técnicas
- Titular durable exclusivamente `admin` activo; ROOT solo controla el workflow de reasignación con motivo y auditoría. Resuelve la contradicción documental conforme al contrato más reciente, al esquema y a la instrucción de esta sesión.
- No se creó rol/login writer, función `SECURITY DEFINER`, política RLS de escritura ni ruta HTTP: falta un contrato operativo de identidad SQL, credenciales, recursos protegidos y actor verificado. Abrirlos ahora crearía un bypass, no una integración segura.
- Se mantiene una fila singleton como primer lock global; staff se bloquea por UUID y la propuesta después. Los cambios de staff adquieren previamente el mismo singleton mediante trigger statement-level.
- La limitación histórica de `reason` se añadió `NOT VALID` para no reescribir auditoría previa append-only; sí se valida inmediatamente el constraint ROOT activo porque una fila previa inválida debe bloquear el upgrade y exigir recuperación explícita.

### 6. Pruebas ejecutadas
- Baseline `pnpm test`: 105/106; único fallo reproducible por CRLF en el test `.dockerignore`, corregido.
- Final `pnpm test`: 104/104 PASS (se retiraron cinco tests del gate inseguro y se añadieron regresiones del workflow).
- `pnpm build`: PASS para API, PWA cliente y PWA gestión. En sandbox Windows falló inicialmente por acceso de `esbuild` a un ancestro; repetido fuera del sandbox autorizado, PASS.
- `C:\Program Files\Git\bin\bash.exe scripts/ci/postgres-migration-smoke.sh`: PASS sobre `postgres:17-alpine`, `--network none`, contenedor y volumen eliminados. Incluye todas las migraciones, lifecycle completo, rollback y dos carreras concurrentes.
- `docker compose -f deploy/compose.sabora.yml config --quiet`: PASS.
- Build/smoke local de `deploy/Dockerfile.api`, `node --check` y `/health` dentro de contenedor `--network none`: PASS; contenedor e imagen temporal eliminados.
- `git diff --check`: PASS; solo avisos informativos de conversión LF/CRLF de Git en Windows.
- Revisión independiente de bypass/regresión: ningún bypass o regresión concreta superviviente en el diff final.

### 7. GitHub Actions verificadas
- [Sabora CI — run 39500612967](https://github.com/jdlc86/CartaViva/actions/runs/39500612967), job `118896847542`: SUCCESS en 38 s para SHA `5ca337362ee37094f85bdcaf2b6c076325496224`.
- [Bootstrap Sabora lockfile — run 39500613084](https://github.com/jdlc86/CartaViva/actions/runs/39500613084), job `118896847836`: SUCCESS en 44 s para el mismo SHA.
- El fallo previo sin jobs [run 39495223250](https://github.com/jdlc86/CartaViva/actions/runs/39495223250) quedó explicado y corregido por el scalar YAML inválido.
- Avisos no bloqueantes de GitHub: Actions v4 ejecutadas forzosamente sobre Node 24 por deprecación de Node 20 y futura migración de `ubuntu-latest` a Ubuntu 26.

### 8. Riesgos y tareas pendientes
- Falta identidad SQL writer `NOLOGIN/NOBYPASSRLS`, políticas/grants exactos y provisioning de su LOGIN; no usar owner, superuser ni BYPASSRLS.
- Falta bootstrap/recovery auditado que garantice existencia de exactamente un ROOT activo. El esquema actual garantiza como máximo uno y que cualquier ROOT existente sea activo.
- Falta matriz exacta de recursos administrativos, notificaciones y composición HTTP con identidad verificada; las rutas permanecen cerradas.
- El lifecycle PostgreSQL prueba las transacciones/constraints con `psql` como owner del entorno desechable; no existe todavía driver/runtime JS-to-PostgreSQL del writer que pueda probarse end-to-end.
- Escaneo Codex Security `ac6dfe0f-b279-4e30-bad6-056f3f4c4f5d` sobre el SHA inicial: seis hallazgos (cinco medium, uno low) trazados y remediados por este bloque salvo los dos contratos pendientes anteriores. Cobertura focalizada/parcial del repositorio completo.

### 9. Operaciones no realizadas
- No se desplegó Sabora ni se accedió/modificó el VPS.
- No se aplicó ninguna migración a Supabase operativo ni se limpiaron datos.
- No se creó ROOT real, writer operativo, credencial, secreto o configuración de producción.
- No se inspeccionó ni modificó Fleetia, sus contenedores, redes, volúmenes, puertos, servicios o datos.
- No se modificaron otros repositorios, no se fusionó PR #2 y no se solicitó revisión externa de pago.

### 10. Siguiente bloque recomendado
Definir y revisar primero el contrato de runtime: rol grupal writer mínimo, LOGIN provisionado fuera de migraciones, RLS/grants exactos, binding de `request.verifiedIdentity.userId` y matriz de recursos administrativos. Después integrar una sola ruta de mutación de bajo riesgo mediante `createPostgresTransaction` + `createTransactionalAdminWrite`, y una ruta de gobierno mediante `createOwnershipWorkflow`; probar ambas end-to-end con driver real en PostgreSQL 17 desechable antes de ampliar superficie o desplegar.

## Continuación posterior a Codex — 2026-10-20
- Verificados los dos workflows SUCCESS del commit `5ca3373`: CI 39500612967 y bootstrap 39500613084. El informe de retorno de Codex ya está publicado en este documento.
- Endurecido `apps/api/src/postgres-transaction.mjs`: cuando falla BEGIN o ROLLBACK se descarta la conexión del pool, evitando reutilizar sesiones de estado incierto. Pruebas nuevas para BEGIN/COMMIT/ROLLBACK fallidos.
- Añadido `docs/security/SABORA_SQL_WRITER_BOUNDARY_DESIGN.md`: requisitos previos a rol writer, grants/RLS y rutas. **No se creó writer SQL ni se abrió acceso operativo**.
- Próxima puerta: validar CI del HEAD y diseñar/practicar roles técnicos de mínimos privilegios en PostgreSQL 17 desechable; después acordar matriz de recursos administrativos y bootstrap ROOT. Sin despliegue, sin Supabase operativo, sin Fleetia.

## Continuación: rol SQL writer dormido (2026-10-20)
- CI #304 y bootstrap #288 del commit `b01f410` confirmados SUCCESS.
- Migración `20261020250000_sabora_dormant_admin_writer.sql`: crea rol técnico NOLOGIN, NOINHERIT, NOBYPASSRLS y sin grants de datos. No habilita escrituras administrativas ni acceso a schema privado.
- Smoke PostgreSQL 17 extendido para comprobar atributos del rol y denegación efectiva bajo SET ROLE de lectura staff, mutación singleton e inserción auditoría. Documento de seguridad actualizado.
- Puerta pendiente: comprobar CI de este HEAD, revisar matriz de recursos y diseñar permisos por procedimiento sin bypass. No ejecutar SQL en Supabase operativo ni desplegar; Fleetia intacto.

## Continuación: ACL de objetos futuros (2026-10-20)
- CI #308 y bootstrap #292 del commit `6ac98df` SUCCESS.
- Migración `20261020260000_sabora_writer_future_acl.sql` y smoke negativo para objetos nuevos: rol writer dormido no debe obtener SELECT/INSERT en tabla nueva ni EXECUTE de función nueva; tampoco EXECUTE por PUBLIC.
- Las default privileges son específicas del rol creador; no impiden grants explícitos ni cubren otros owners. Documentado en `docs/security/SABORA_SQL_WRITER_BOUNDARY_DESIGN.md`.
- Validación del CI de este HEAD pendiente; sin despliegues ni recursos operativos afectados.

## Diagnóstico CI #312 / bootstrap #296 — permisos futuros de funciones
- Ambos workflows FAILED en el smoke PostgreSQL 17 al crear función de prueba: `future object ACL exposed to dormant writer or PUBLIC`.
- Causa: PostgreSQL concede EXECUTE a PUBLIC por defecto global; revocarlo solo IN SCHEMA no elimina ese default global.
- Migración correctiva `20261020270000_sabora_default_function_execute.sql` revoca EXECUTE global de funciones futuras para el rol creador de migraciones. La prueba negativa se conserva. Riesgo documentado: afecta a futuras funciones del mismo creador fuera de `sabora`; no aplicar operativamente sin revisión.
- CI de corrección pendiente. Sin Supabase operativo, VPS ni Fleetia.

## Continuación: auditoría integral de permisos EXECUTE (2026-10-20)
- CI #315 SUCCESS sobre corrección de permisos por defecto; bootstrap #299 estaba en progreso al consultar.
- Smoke PostgreSQL 17 ampliado: inspecciona todas las funciones de esquema `sabora` y rechaza permisos EXECUTE para PUBLIC, anon, authenticated y writer dormido. El control anterior solo comprobaba una lista de RPC conocidas y una función nueva de prueba.
- Si falla, identificar la función y corregir ACL explícita en migración posterior sin conceder bypass. Ninguna migración aplicada en Supabase operativo ni despliegue.

## Continuación: auditoría de permisos de relaciones y secuencias (2026-10-20)
- CI #317 y bootstrap #301 del commit `b2d67d2` SUCCESS.
- Smoke PostgreSQL 17 ampliado con enumeración de todas las tablas, vistas, vistas materializadas, tablas externas, tablas particionadas y secuencias del esquema privado `sabora`.
- Denegaciones de SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER y USAGE/SELECT/UPDATE de secuencias para PUBLIC, anon, authenticated y writer dormido. El reader técnico mantiene exclusivamente los permisos mínimos ya acreditados.
- CI del HEAD nuevo pendiente. Sin aplicar migraciones a Supabase operativo, sin despliegue ni intervención en Fleetia.

## Corrección del gate ACL de relaciones (2026-10-20)
- CI #319 y bootstrap #303 FAILED: el nuevo smoke pasaba el pseudo-rol `PUBLIC` a `has_table_privilege`/`has_sequence_privilege`, causando `role "PUBLIC" does not exist`.
- Corregido: comprobar privilegios efectivos de `anon`, `authenticated` y `sabora_admin_writer`; estos incluyen grants concedidos a PUBLIC. Se mantienen todas las categorías de privilegio y la enumeración completa de relaciones/secuencias.
- CI del commit correctivo pendiente. No se han modificado recursos operativos.

## Identidad SQL administrativa: contrato cerrado (2026-10-21)
- CI #321 y bootstrap #305 sobre `0232e43` SUCCESS.
- Añadido `docs/security/SABORA_SQL_ADMIN_IDENTITY_CONTRACT.md`: separación entre identidad autenticada del usuario, identidad técnica del backend y titularidad durable ADMIN; ROOT exclusivamente en gobierno.
- Orden transaccional y puertas de RLS, matriz de recursos, pruebas negativas, bootstrap ROOT, concurrencia y auditoría definidos como prerrequisitos. El writer permanece dormido sin LOGIN ni permisos. No se habilitaron rutas HTTP ni se aplicó SQL a Supabase operativo.

## Matriz de permisos administrativos (2026-10-21)
- CI #323 y bootstrap #307 sobre `328766a` SUCCESS.
- Añadido `docs/security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md` a partir del esquema y contratos existentes: personal, singleton de titularidad, propuestas, auditoría, ajustes, mesas, pedidos y cocina. Se separan explícitamente gobierno ROOT, administración ordinaria y flujos de camarero/cocina.
- Todos los grants administrativos permanecen bloqueados hasta ficha por operación con columnas, RLS, actor, auditoría y pruebas de identidad no privilegiada. Ningún LOGIN, ruta HTTP, migración operativa o despliegue habilitado.

## Contrato de operaciones de titularidad (2026-10-21)
- CI #325 y bootstrap #309 del HEAD previo SUCCESS.
- Nuevo `docs/security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md` basado en workflow y política existentes: actores por acción, destinatarios, escrituras y lecturas SQL, locks, replay de correlación, auditoría y prerrequisitos para identidad SQL mínima.
- Especificación documental, no implica grants, rutas HTTP ni aplicación de migraciones en Supabase operativo. Continúan pendientes los gates de concurrencia y RLS bajo identidad no propietaria.

## Matriz de denegaciones de titularidad (2026-10-21)
- Al consultar, CI #328 y bootstrap #311 de `2fec895` estaban en progreso (sin conclusión).
- Nuevo `tests/ownership-denial-matrix.test.mjs` cubre aceptación/rechazo por actor equivocado, miembros inactivos o con rol incorrecto, propuestas resueltas o con propietario obsoleto, y separación de ROOT frente a operaciones ordinarias.
- Son pruebas unitarias de política; la concurrencia real PostgreSQL 17 y RLS bajo identidad mínima siguen pendientes. No se ha modificado producción, VPS ni Fleetia.

## Carrera SQL de transferencias con propietario obsoleto (2026-10-21)
- CI #330 y bootstrap #313 del HEAD anterior SUCCESS.
- Ampliado `scripts/ci/admin-ownership-concurrency-smoke.sh` con dos sesiones PostgreSQL 17 sobre contenedor desechable: la primera transfiere bajo lock; la segunda espera y debe observar cero filas al intentar la transferencia condicional basada en propietario antiguo. Se verifica el propietario final.
- Este gate prueba la semántica SQL compare-and-swap y la serialización, **no** sustituye una prueba integrada del workflow JS con la identidad SQL mínima todavía inactiva. CI del nuevo HEAD pendiente. Sin despliegue ni cambios operativos.

## Corrección del gate de carrera SQL (2026-10-21)
- CI #332 y bootstrap #315 de `f2e1653` FAILED en la prueba nueva: `syntax error at or near "$"` debido a delimitadores PL/pgSQL `do $ ... end $` inválidos. Las pruebas anteriores pasaron.
- Commit `56adb13`: sustituidos por bloques `do $race$ ... end $race$` dentro de heredocs Bash con comillas simples. Se espera revalidación de PostgreSQL 17 en Actions; no declarar gate verde sin resultados terminales.
- Sin cambios en Supabase operativo, VPS ni Fleetia.

## Aislamiento de cliente PostgreSQL ante COMMIT incierto (2026-10-21)
- CI #334 y bootstrap #317 del HEAD `b46edcc` SUCCESS: gate de carrera SQL de dos sesiones confirmado en PostgreSQL 17 desechable.
- `apps/api/src/postgres-transaction.mjs`: si COMMIT falla, el cliente se descarta siempre del pool, incluso cuando ROLLBACK posterior responde sin error; la respuesta de COMMIT puede haber dejado resultado/estado incierto.
- `tests/postgres-transaction.test.mjs`: regresión que verifica liberación con error para descartar conexión ante fallo COMMIT. No cambia permisos, rutas HTTP ni conexión operativa. CI del HEAD nuevo pendiente.

## Regresión de errores dobles COMMIT/ROLLBACK (2026-10-21)
- Al comprobar `86c17fe`, bootstrap #320 seguía en progreso y CI #337 en cola; no se declaró verde.
- Commit `cbc9d50`: dos pruebas de `postgres-transaction`: (a) fallo de trabajo con rollback exitoso devuelve cliente limpio al pool; (b) COMMIT y ROLLBACK fallidos preservan error COMMIT y descartan cliente por error de rollback.
- Sin cambios operativos, sin credenciales SQL ni grants; CI del nuevo HEAD pendiente.

## Integración de adaptadores ADMIN/transacción (2026-10-21)
- CI #338 y bootstrap #321 del commit `cbc9d50` SUCCESS.
- Nuevo `tests/admin-write-transaction-integration.test.mjs` enlaza los adaptadores reales `createPostgresTransaction` y `createTransactionalAdminWrite` con cliente PostgreSQL simulado determinista: comprueba orden BEGIN/bloqueos/mutación/COMMIT, denegación sin mutación para ADMIN no titular, revocado y ROOT, y ROLLBACK ante fallo de mutación.
- Límite explícito: integración JS con cliente simulado, **no** validación de ACL/RLS bajo identidad SQL mínima real. No se han concedido grants ni creado LOGIN operativo. Próximo gate: pruebas SQL de mínimos privilegios en PostgreSQL 17 desechable y verificación CI del HEAD.

## Puerta SQL de membresía del writer dormido (2026-10-21)
- CI #341 y bootstrap #324 de `02673ec` SUCCESS.
- Commit `859a886`: el smoke PostgreSQL 17 desechable ahora inspecciona `pg_auth_members` y falla si `sabora_admin_writer` es miembro de cualquier otro rol o si algún rol es miembro del writer; evita puentes de privilegios antes de habilitar permisos operativos.
- Sigue sin existir un LOGIN operativo de escritura ni grants a `sabora_admin_writer`. Esta comprobación complementa ACL/RLS y no acredita aún una identidad SQL mínima habilitada. Sin Supabase/VPS/Fleetia.

## Prueba negativa de GRANT SQL (2026-10-21)
- CI #343 y bootstrap #326 de `f13c2a4` SUCCESS. CI #344 y bootstrap #327 de `19b40d8` aún en progreso al consultar.
- Commit `9f96146`: prueba SQL en PostgreSQL 17 desechable concede temporalmente USAGE del esquema y SELECT de staff_members a `sabora_admin_writer`, confirma que los chequeos de privilegios efectivos detectan el acceso inseguro y revierte ambos GRANT dentro de una transacción. Confirma ausencia de fuga tras ROLLBACK.
- La prueba no habilita permisos operativos; no es aún una prueba de identidad técnica SQL autorizada ni de RLS funcional de writer. No se toca Supabase operativo, VPS o Fleetia. CI del HEAD nuevo pendiente.

## Denegación efectiva tras rollback de GRANT (2026-10-21)
- Commit `9948a5e`: complementa la prueba negativa de GRANT con `SET ROLE sabora_admin_writer` después de ROLLBACK y una lectura real de `sabora.staff_members` que debe fallar por `insufficient_privilege`. El test comprueba tanto metadatos ACL como la denegación SQL efectiva.
- CI #346 y bootstrap #329 del HEAD documental anterior estaban en progreso al consultar. CI del nuevo HEAD sin resultado aún. Sin acceso operativo a Supabase ni VPS; sin cambios a Fleetia.

## Primera ficha de permisos mínimos ADMIN (2026-10-21)
- CI #346 y bootstrap #329 de `d93d864` SUCCESS. CI del commit `806d6c6` seguía en progreso al consultar.
- Commit `862725a`: añade a `docs/security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md` ficha **solo de diseño** para una futura edición de `restaurant_settings.name`: identidad verificada, orden de bloqueos, mínimo alcance SQL, auditoría, idempotencia, RLS y pruebas positivas/negativas. Se advierte que la estructura exacta del singleton requiere validación previa.
- No hay nuevos grants, LOGIN, rutas HTTP, despliegue ni aplicación operativa de migraciones. Próximo paso: cotejar la ficha con migraciones y validar el CI del HEAD.

## Cotejo real de `restaurant_settings` (2026-10-21)
- CI y bootstrap del commit `806d6c6` SUCCESS; CI y bootstrap de `f09367d` aún en progreso al consultar.
- Commit `629e94d`: matriz administrativa cotejada con `20261020140000_sabora_order_core.sql`. Se confirma singleton booleano PK con CHECK true, `name` NOT NULL y CHECK 1..160 caracteres tras btrim, `created_at`, RLS ENABLE+FORCE. El singleton puede no existir; no se presume política RLS permisiva ni auditoría lista.
- Sin grants, LOGIN, rutas, despliegue ni aplicación de migraciones en entornos operativos. Próxima fase: pruebas de invariantes de singleton y denegación por rol restringido en PostgreSQL 17 desechable.

## Identidad del cliente: decisión de producto (2026-10-21)
- Se actualiza `docs/REQUISITOS_FUNCIONALES.md`: campos visibles alias/nick, número ID y empresa opcional; no solicitar por defecto identificadores ni credenciales corporativas, DNI o correo empresarial. El número ID se plantea como identificador de Sabora, no número de empleado laboral. El perfil debe persistir entre visitas sin volver a introducir los datos.
- Pendiente definir unicidad, emisión/recuperación del ID, autenticación verificable y protección contra suplantación; la persistencia local no equivale a autenticación. El QR continúa identificando la mesa, no a la persona.
- La implementación SQL actual de `confirm_order` sigue exigiendo `company` y `employee_number`; existe una **brecha contractual** que deberá resolverse mediante migración/versionado y pruebas antes de habilitar pedidos. No se cambió SQL operativo ni se desplegó.

## Hito: contrato aprobado de identidad de cliente (2026-10-21)
- Aprobación expresa del usuario: alias/nick elegido, número ID visible generado por Sabora, UUID interno único, empresa opcional, sin solicitar datos corporativos. Perfil persistente entre visitas, PWA instalada o navegador, passkey opcional para proteger y recuperar perfil; la sincronización de passkeys no está garantizada.
- Fuente normativa nueva: `docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md` (commit `be4948e`). Requisitos enlazados en `docs/REQUISITOS_FUNCIONALES.md` (commit `548b1aa`).
- No hay implementación de autenticación de cliente todavía. Bloqueo existente: `sabora.confirm_order` y `sabora.orders` siguen exigiendo empresa y número de empleado. Resolver mediante migraciones, rutas, RLS y pruebas antes de habilitar cliente. No confundir QR con identidad, ni número ID con secreto de recuperación.
- Sin cambios operativos, despliegue, merge ni Fleetia.

## Inicio implementación perfil cliente (2026-10-21)
- `apps/api/src/customer-profile.mjs`: límite puro de normalización alias y empresa opcional; rechaza ID, rol, número de empleado o secretos suministrados en alta. No genera ni autentica identidades.
- `tests/customer-profile.test.mjs`: alta mínima, campos prohibidos, longitud, controles y Unicode. Build API incorpora comprobación sintáctica.
- Commits `41fe41b`, `7913bc0`, `7432fc7`. Verificar CI del HEAD. Sin rutas públicas, tablas, credenciales, grants, cambios operativos ni despliegues. Próxima fase: generación de IDs solo en servidor y persistencia segura con pruebas PostgreSQL 17 aisladas.

## Generación de identificadores de cliente (2026-10-21)
- `apps/api/src/customer-id.mjs`: generador de UUID interno y código público alfanumérico aleatorio de 12 caracteres con rechazo de bytes; alta normalizada sin IDs de entrada. `tests/customer-id.test.mjs` cubre formato, entradas indebidas y fuentes aleatorias defectuosas. Build verifica sintaxis.
- Commits `4ea507b`, `399f922`, `df910a0`, `d74cab7`. **Aún no se emiten IDs persistentes**: falta tabla con UNIQUE, reintentos por colisión, sesión y RLS; no hay rutas ni grants. Verificar CI del HEAD.
- Sin Supabase operativo, VPS, despliegue, merge ni Fleetia.

## Corrección CI generador cliente (2026-10-21)
- Bootstrap run 39527119830 FAILED: 123/125 tests OK, dos pruebas de rechazo aleatorio fallaron. Se constató que el alfabeto original tenía 32 símbolos, por lo que `LIMIT=256` y ningún byte se rechazaba; los tests suponían rechazo de 255. Corrección: alfabeto de 31 símbolos (excluye Z), límite 248, y pruebas alineadas con bytes 255 descartados. Commits `e6f1b5d`, `6238c76`; `1c4a35b` fue intento intermedio reemplazado. Verificar CI/Bootstrap del HEAD; no declarar verde anticipadamente.
- Sin aplicación de migraciones ni cambios en Fleetia o VPS.

## Persistencia inicial de perfil (2026-10-21)
- CI anterior de `3d8dd21` validado: Sabora CI 39527250859 SUCCESS; bootstrap 39527250768 SUCCESS.
- Migración privada `supabase/migrations/20261021010000_sabora_customer_profiles.sql` (commit `5fd3029`), smoke PostgreSQL 17 (commit `1ff5dbc`) y test de contrato SQL (commit `03985d5`). UUID PK, public_id UNIQUE, alias y empresa opcional, FORCE RLS y cero permisos de cliente. El smoke ahora espera 13 tablas privadas RLS.
- **No** hay rutas de alta, sesiones, grants, despliegue ni aplicación a Supabase operativo. Comprobar CI del HEAD antes de dar por validado este hito.

## Alta transaccional de cliente — adaptador interno (2026-10-21)
- CI de `0dde36f`: Sabora CI run 39527468264 SUCCESS, bootstrap run 39527468523 SUCCESS.
- `apps/api/src/customer-profile-writer.mjs`: adaptador interno que recibe transacción ya configurada, genera candidato de ID solo en servidor, inserta perfil mediante parámetros y maneja colisión `23505` exclusivamente de `customer_profiles_public_id_key` con SAVEPOINT/ROLLBACK TO/RELEASE; máximo 5 intentos por defecto, máximo configurable 20. No reintenta otros fallos SQL.
- `tests/customer-profile-writer.test.mjs`: pruebas de inserción, colisión recuperable, agotamiento, error de clave primaria y perfil inválido. Build comprueba sintaxis. Commits `356e2c1`, `ec88fb4`, `02f574f`.
- Falta prueba SQL real de dos sesiones concurrentes, sesiones autenticadas, HTTP y permisos SQL mínimos. **No conectar este adaptador a rutas públicas ni habilitar SQL grants hasta cerrar esas puertas**. Sin Supabase operativo, VPS ni Fleetia. Verificar CI del HEAD.

## Concurrencia real de IDs de cliente (2026-10-21)
- HEAD previo `dc7997d`: CI run 39565531126 SUCCESS y bootstrap 39565531132 SUCCESS.
- `scripts/ci/customer-id-concurrency-smoke.sh` ejecuta dos sesiones psql independientes en el contenedor PostgreSQL 17 desechable. La primera retiene el ID visible durante 2 s; la segunda intenta duplicarlo, debe recibir unique_violation, recuperarse y registrar otro ID. Verificación final: dos perfiles y un solo registro con el primer ID.
- El smoke se invoca desde `scripts/ci/postgres-migration-smoke.sh`. Commits `ab8cdc5`, `b8c1395`, `e681133`. Comprobar Actions del HEAD; no se ha ejecutado contra Supabase operativo.
- Aún no hay autenticación de clientes, sesiones, rutas públicas ni despliegues; Fleetia aislado.

## Fundamento de sesiones persistentes (2026-10-21)
- CI anterior de `9fb563c`: Sabora CI 39584644082 SUCCESS; bootstrap 39584644023 SUCCESS.
- Migración `20261021020000_sabora_customer_sessions.sql` (commit `4317605`): tabla privada de sesiones con hash UNIQUE, FK cliente, vencimiento/revocación, FORCE RLS, sin grants. `apps/api/src/customer-session.mjs` (commit `d6aed94`) emite secretos aleatorios y hashes SHA-256; tests `9bd256b`, smoke PostgreSQL `b898744`, build `2c4530f`.
- Aún faltan verificación/revocación en consultas SQL, alta perfil+sesión atómica, cookies seguras, passkey, API y autorización del historial. No se aplica a Supabase operativo ni VPS. Verificar CI del HEAD.

## Alta atómica perfil + sesión (2026-10-21)
- `apps/api/src/customer-registration.mjs`: adaptador interno de alta que inserta perfil y sesión con hash dentro de una sola transacción. Token opaco solo se retorna después de COMMIT; si falla inserción de sesión, la transacción revierte perfil. Colisiones `customer_profiles_public_id_key` se reintentan con SAVEPOINT acotado.
- `tests/customer-registration.test.mjs`: inserción doble antes de commit, rollback de sesión fallida, colisión recuperable y perfil inválido. Build incluye comprobación sintáctica. Commits `f08daca`, `a3c2fd3`, `d057e4d`.
- **No hay rutas públicas ni cookies aún**. Antes de activación: pruebas PostgreSQL reales del flujo atómico, validación de sesión vigente/revocada, políticas de cookies y CSRF, permisos de backend limitados. Verificar CI HEAD.

## Verificación privada de sesiones (2026-10-21)
- `df56885`: Sabora CI 39585719840 SUCCESS; bootstrap 39585719809 SUCCESS.
- `apps/api/src/customer-session-verifier.mjs`: consulta parametrizada por hash SHA-256 del token, filtra `revoked_at IS NULL` y `expires_at > now()`, devuelve identidad interna si válida y `null` si no existe. No consulta por alias/ID público ni expone endpoint.
- Tests `tests/customer-session-verifier.test.mjs` (hash, SQL, token inválido, error de DB y resultado corrupto); `scripts/ci/customer-session-verification.sql` ejecuta contra PostgreSQL 17 desechable los estados vigente/revocado/caducado/inexistente. Integrado en `postgres-migration-smoke.sh` y build. Commits `1cc03e1`, `5380772`, `8f0bbfb`, `0c43fb6`, `e554006`.
- Faltan permisos backend mínimos, integración HTTP, cookies HttpOnly, CSRF, rotación, revocación de sesión por cliente y pruebas E2E. No desplegar ni aplicar migraciones operativas. Verificar CI HEAD.

## Corrección smoke de caducidad (2026-10-21)
- CI del commit `149f084` FAILED: Sabora CI 39586864461 y bootstrap 39586864736. Causa localizada en `scripts/ci/customer-session-verification.sql`: la simulación de expiración asignaba `expires_at` anterior a `created_at`, violando correctamente `customer_session_expiry_check`.
- Commit `2a15b90`: prueba corregida desplazando también `created_at` al pasado; se preserva el CHECK de integridad, no se debilita la migración. Verificar CI del nuevo HEAD antes de declarar verde.

## Revocación de sesiones cliente (2026-10-21)
- Bootstrap de `9cf9ab2` SUCCESS run 39587114644; Sabora CI 39587114719 seguía IN_PROGRESS en la comprobación.
- `apps/api/src/customer-session-revoker.mjs` añade revocación interna idempotente por hash de token, solo si sesión vigente y no revocada; no permite revocación por alias/ID visible. Pruebas de revocación, repetición, token inválido y fallo DB en `tests/customer-session-revoker.test.mjs`; build syntax check. Commits `2046207`, `3b910c5`, `95e5be8`.
- Falta ruta de logout protegida, cookie HttpOnly, CSRF, auditoría y permisos SQL mínimos. No hay despliegue, migración operativa ni cambios Fleetia. Comprobar CI HEAD.

## Contrato de seguridad HTTP de clientes (2026-10-21)
- Commits previos `9cf9ab2` y `35b8101`: ambos workflows CI y bootstrap SUCCESS (runs 39587114719, 39587114644, 39587349609, 39587349625).
- `apps/api/src/customer-http-security.mjs` prepara cookie host-only `__Host-sabora_customer` con Path=/, Secure, HttpOnly, SameSite=Strict y caducidad limitada, lectura de cookie sin ambigüedad y eliminación. Política para métodos de mutación: `Origin` debe coincidir exactamente con el origen HTTPS configurado; sin comodines ni fallback Referer.
- `tests/customer-http-security.test.mjs` comprueba banderas, cookies duplicadas, origen ajeno y configuración insegura. Build syntax check. Commits `9649e2b`, `c60e8dd`, `22226b1`.
- Esta política es **un módulo aislado, todavía no registrado en Fastify**. Faltan cabeceras de defensa en profundidad, validación Fetch Metadata, integración de cookie/verificador/revocador, HTTPS de proxy de confianza, controles de rate limit y pruebas E2E. No habilitar registro ni rutas públicas hasta completar gate.

## Hooks HTTP privados de cliente (2026-10-21)
- `apps/api/src/customer-http-hooks.mjs`: fábrica de hooks Fastify-compatible, aislada del Bearer JWT del personal. `authenticate` verifica cookie mediante verificador inyectado, adjunta UUID validado y responde 401 o 503; `guardMutation` exige Origin exacto; `logout` exige POST y Origin correcto dentro del propio handler, revoca sesión y solo entonces borra cookie. No se registran rutas en `server.mjs`.
- `tests/customer-http-hooks.test.mjs`: autenticación, sesión ausente, DB caída, CSRF, logout correcto y rechazo de GET/cross-origin. Commits `f1cf246`, `b751fd4`, `f93b3da`, `97e6791`, `7120caf`.
- CI del commit anterior `11b5ce6` estaba IN_PROGRESS (runs 39587838840, 39587838879). Revisar estado real y CI HEAD. Puertas pendientes: pool SQL mínimo, configuración HTTPS/origin por entorno, cabeceras y Fetch Metadata, rate limiting, integración real y E2E. No se habilitan endpoints ni despliegues.

## Endurecimiento CSRF por Fetch Metadata (2026-10-21)
- Se amplió la política privada de mutaciones para denegar `Sec-Fetch-Site` diferente de `same-origin` cuando esté presente, incluso si el `Origin` coincide; `Origin` HTTPS exacto continúa obligatorio para mutaciones. Se evita que una petición cross-site falsificada pase por alto el filtro de origen. Se rechazan orígenes de configuración con ruta/query/fragmento.
- Integrado en `guardMutation` y `logout`; pruebas de `cross-site`, `same-site`, `none`, `same-origin` y logout sin revocación si origen de Fetch Metadata es ajeno. Commits `cb1612b`, `6656569`, `fc36f09`, `135ec68`.
- La identidad SQL backend de mínimo privilegio **sigue pendiente**; no crear roles con BYPASSRLS ni abrir tablas al navegador. No se registraron endpoints. CI del HEAD pendiente.
