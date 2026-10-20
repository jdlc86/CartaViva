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
