# CartaViva / Sabora — Continuidad para la sesión 3

Fecha: 2026-10-21. Documento de traspaso; **la documentación versionada del repositorio es la fuente de verdad**. Verificar rama, HEAD, PR y CI en GitHub antes de modificar código. No asumir que el último commit mencionado aquí sigue siendo HEAD.

## Alcance y reglas no negociables
- Repositorio autorizado exclusivamente: `jdlc86/CartaViva`. Rama de trabajo conocida: `feat/sabora-pnpm-bootstrap`; PR conocido: **#2 (Draft)**. No hacer merge ni desplegar sin autorización expresa.
- **Sabora es un único restaurante**, con PWA Cliente y PWA Gestión independientes; CartaViva es el directorio central de restaurantes, no una base de datos compartida de negocio.
- Supabase operativo Sabora: proyecto `byhvmumqivmunkmomhup`. No aplicar migraciones, cambiar roles, crear credenciales o modificar datos operativos sin autorización específica. No usar el proyecto para pruebas destructivas.
- VPS compartido con Fleetia y otros proyectos: **no tocar recursos de Fleetia ni de terceros**. Desplegar/reiniciar/eliminar Sabora nunca puede detener, alterar ni depender de sus contenedores. Despliegue al VPS exige autorización expresa y aislamiento completo.
- Solo un ROOT; varios ADMIN, con un único ADMIN titular de escritura. Identidad cliente basada en alias y empresa opcional; passkey recuperable y sesión segura aún no operativas. No confundir prototipos con funcionalidades desplegadas.
- Sin solicitar revisión Codex mientras no haya créditos. Mantener pruebas, commits, CI y documentación por hito.

## Lecturas obligatorias al iniciar
1. `docs/continuity/SESSION_02_HANDOFF.md` (histórico extenso y decisiones).
2. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` (contrato funcional).
3. `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`.
4. `docs/architecture/SABORA_CATALOG_PUBLICATION_GATE.md` (puertas del catálogo; parte del apartado «Estado actual» puede haber quedado obsoleta: contrastar siempre con código y migraciones).
5. `apps/api/src/server.mjs`, `apps/client/src/main.tsx`, migraciones y scripts CI antes de cambiar rutas o privilegios.

## Estado de implementación verificado por archivos
- Migraciones candidatas de catálogo: `20261021180000_sabora_catalog_publication_foundation.sql`, `20261021190000_sabora_catalog_publication_guard.sql`, `20261021200000_sabora_catalog_reader.sql`. Separan borrador y snapshot publicado; validación provisional; rol de lectura NOLOGIN y RPC restringida. **No aplicadas al Supabase operativo**.
- El publicador rechaza actualmente opciones, extras y descuentos no vacíos: pendiente su validación económica completa. `apps/api/src/catalog-pricing.mjs` es cálculo puro no integrado con pedidos.
- Backend: `catalog-publication.mjs`, `catalog-reader-query.mjs`, `catalog-scoped-query.mjs`, `catalog-pool-config.mjs`, `catalog-http-route.mjs`. Ruta opt-in `GET /api/v1/catalog` **no registrada en `server.mjs`**; no hay pool operativo ni login provisionado.
- Cliente: `apps/client/src/catalog.ts`, `catalog-loader.ts`, `main.tsx` solicitan la ruta en mismo origen, muestran carga/error/reintento, filtran categorías y muestran agotados. Sin endpoint activo, la carta real no se puede cargar. No hay pedidos operativos.
- Pruebas: `tests/catalog-*.test.mjs`, `tests/client-catalog*.test.mjs`, `scripts/ci/postgres-migration-smoke.sh`, `scripts/ci/catalog-reader-login-smoke.sh`. El login NOINHERIT de prueba solo se crea en PostgreSQL desechable.

## Incidencia CI más reciente conocida y prioridad inmediata
- Commit `5a786f7`: Sabora CI run **39644807586** FAILED y Bootstrap run **39644807603** FAILED.
- Causa terminal comprobada en logs: `permission denied for schema sabora` en la prueba de login `catalog-reader-login-smoke.sh` al evaluar permisos. Otros errores `admin_ownership_audit_action_check` y `stale_owner` proceden de pruebas negativas intencionadas; no confundirlos con la causa final.
- `SESSION_02_HANDOFF.md` registra un commit posterior **`7dd8c0f`** que concede USAGE sobre el esquema **solo al login del contenedor de prueba**, sin SELECT ni EXECUTE heredado. **Comprobar si está en HEAD y si el CI posterior pasó**; no darlo por verde sin consultar runs y logs.
- La prueba debe acreditar: login NOINHERIT sin SELECT directo ni EXECUTE heredado, RPC disponible solo tras `SET LOCAL ROLE sabora_catalog_reader` en transacción, y reversión al COMMIT. Revisar cuidadosamente si el permiso USAGE de esquema es compatible con el modelo de aislamiento y no se extiende a producción.

## Siguientes pasos sugeridos
1. Consultar HEAD de la rama y los dos workflows del último commit. Reparar cualquier CI rojo; repetir en PostgreSQL 17 desechable y documentar evidencias.
2. Revisar RLS/FORCE RLS, propietario SECURITY DEFINER, GRANT/REVOKE y privilegios efectivos del lector. Añadir regresiones negativas si faltan.
3. Validar extremo a extremo contrato SQL → adaptador API → respuesta HTTP → parser Cliente en pruebas aisladas, sin habilitar servidor ni desplegar.
4. Diseñar aprovisionamiento de login dedicado y montaje opt-in seguro; **pedir autorización antes de cambios operativos**.
5. Completar validación económica del catálogo y titularidad del ADMIN escritor antes de habilitar publicación desde Gestión. No habilitar pedidos hasta autorización por mesa, precios e idempotencia.
6. Mantener este archivo o crear el siguiente handoff cuando haya un hito importante.

## Metodología y límites de entrega
- Trabajar solo en `jdlc86/CartaViva`, con commits pequeños pero coherentes, tests relevantes y documentación actualizada. No afirmar que algo está funcionando en producción cuando solo es código candidato.
- Verificar GitHub Actions mediante runs y logs, no inferir éxito de un commit. No solicitar Codex por falta de créditos.
- Ningún merge, despliegue, reinicio de contenedores, operación sobre Fleetia, cambio operativo de Supabase o intervención en el VPS sin autorización expresa.

## Sesión 3 — primer hito de continuidad (2026-10-21)
- HEAD inicial verificado: `dc6bc3fe4f4e6d0454cd3cf6860401f6d9ec3e26`; PR #2 sigue Draft.
- GitHub Actions del HEAD inicial: Sabora CI `39645612485` SUCCESS y Bootstrap `39645612528` SUCCESS. La incidencia de permisos del lector en CI de sesión 2 quedó corregida en la rama. No confundir este éxito con preparación para producción.
- Revisados `catalog-http-route.mjs`, `catalog-reader-query.mjs`, `catalog-scoped-query.mjs` y `server.mjs`: endpoint público aún opt-in, sin registro operativo ni pool.
- Commit `c5aba8d1896051c02967db4cc065fc314e256676`: añade regresiones negativas al test HTTP del catálogo para configuración ausente, filas SQL inválidas y snapshot con precio negativo. **Validación CI del commit pendiente**; si falla, investigar logs y corregir antes de avanzar.
- Sin cambios en Supabase, VPS, Fleetia, despliegues o merge; sin revisión Codex.
- Próxima prioridad: verificar CI del nuevo HEAD, confirmar que el snapshot inválido efectivamente produce 503 y, si no, endurecer la proyección y su prueba. Luego comprobar privilegios del lector y composición SQL → HTTP → cliente en entorno aislado.

## Sesión 3 — regresiones de transacción del lector (2026-10-21)
- Confirmados SUCCESS ambos workflows sobre `c5aba8d` (Sabora CI `39645806343`, Bootstrap `39645806387`) y sobre `69ba120f` (Sabora CI `39645855080`, Bootstrap `39645855055`).
- Commit `e95092523564c5faefea6d01642975cc3bac1362`: nuevas pruebas de rechazo de parámetros arbitrarios antes de checkout, fallo al activar rol, fallo de COMMIT y error de conexión al pool. El código de ejecución permanece sin modificación; todas son pruebas de regresión de cierre seguro.
- Pendiente verificar conclusión de CI sobre el commit nuevo y el de esta documentación. No se habilita ruta, credenciales ni producción.

## Sesión 3 — frontera del adaptador SQL del catálogo
- Commit `6a0baadb9c84a915f3f38b991173e32fa2868d02`: regresiones para IDs duplicados, más de 500 filas, disponibilidad mal tipada y no exposición de campos draft desde el adaptador SQL. No hay cambios en contratos ni rutas operativas.
- Al inicio de este bloque los workflows `e950925` y `8262a05` seguían en ejecución; comprobar su conclusión y la del nuevo HEAD antes de afirmar éxito.
- El endpoint sigue sin montarse en `server.mjs`. No se han utilizado recursos operativos.

## Sesión 3 — integración HTTP y lector transaccional
- Commit `cf8f94d4eae50d784cf642eb67e67984cedda6bf`: pruebas de integración en memoria entre `registerCatalogHttpRoute` y `createCatalogScopedQuery`, verificando BEGIN, SET LOCAL ROLE, RPC permitida, COMMIT, liberación limpia, ausencia de campos draft y, ante fallo, 503 genérico, ROLLBACK y descarte de conexión.
- No es una prueba PostgreSQL real ni un despliegue; el endpoint sigue sin registrarse en el servidor operativo.
- Verificar CI del último HEAD antes de declarar el hito validado.

## Sesión 3 — pruebas de consumidor PWA (2026-10-21)
- Verificado SUCCESS en Sabora CI y Bootstrap para `6a0baad`, `cbe6df0` y `cf8f94d`. En ese momento el commit documental `dd41bc7` seguía ejecutándose.
- Commit `bbd06482e48e4fc4b59e6a579c9a26e8cab0f65d`: pruebas de señal AbortController, JSON malformado, límite de 500 elementos y catálogo vacío en el loader de la PWA Cliente. No se alteran las llamadas operativas ni se monta el endpoint.
- Pendiente verificar workflows sobre último HEAD. Las pruebas usan fetch simulado, no PostgreSQL real.

## Sesión 3 — endurecimiento del smoke de login PostgreSQL
- Commit `d7f4950045554e6b0df1dc72713cd3e299ac2209`: `scripts/ci/catalog-reader-login-smoke.sh` comprueba que el login técnico es NOINHERIT y NOBYPASSRLS y que ni el login ni el rol activado pueden leer o modificar directamente `sabora.catalog_items` (SELECT/INSERT/UPDATE/DELETE). Conserva comprobación de RPC restringida y restauración de rol al terminar la transacción.
- El script está limitado al contenedor PostgreSQL 17 desechable utilizado por CI; no aprovisiona credenciales en Supabase operativo.
- CI sobre este commit y el último HEAD pendiente de comprobación.

## Sesión 3 — comprobación efectiva de denegación RPC
- Commit `99b9db99c5ddb263f430835675871f42e9fa41ac`: smoke SQL del login lector intenta ejecutar directamente `sabora.read_published_catalog()` antes de SET LOCAL ROLE y después de COMMIT; ambos intentos deben fallar con `insufficient_privilege`. Complementa los metadatos ACL con ejecución negativa real.
- Antes de este commit, CI y Bootstrap SUCCESS para `bbd0648` y `67b9cd4`; los runs de `d7f4950` y `09d59f0` aún estaban en curso al consultar.
- Solo contenedor PostgreSQL desechable en GitHub Actions; no se han tocado Supabase operativo, VPS ni Fleetia. Verificar CI del último HEAD.

## Sesión 3 — aislamiento del lector frente a identidad y personal
- Commit `c438483a31a37dfec542f92b1b1ba9ca03bb816f`: smoke SQL bajo SET LOCAL ROLE `sabora_catalog_reader` intenta SELECT real de `sabora.customer_profiles`, `sabora.customer_sessions` y `sabora.staff_members`. Deben fallar por privilegios insuficientes. No se modifica SQL de producción ni se conceden privilegios.
- CI y Bootstrap SUCCESS sobre `d7f4950` y `09d59f0`; los runs de `99b9db9` y `48429e7` todavía estaban ejecutándose al iniciar este hito.
- Validar último HEAD mediante Actions; prohibido utilizar Supabase operativo y VPS compartido para estas pruebas.

## Sesión 3 — robustez transaccional del lector
- Al inicio de este bloque, los dos workflows de GitHub Actions estaban SUCCESS para `99b9db9`, `48429e7`, `c438483` y `eb55ef2`.
- Commit `38a55737ad30f76b5c33dac673030039b376d644`: pruebas del adaptador SQL para fallo de BEGIN sin ROLLBACK improcedente, fallo de ROLLBACK sin ocultar error original, y descarte de cliente incompleto del pool. No cambia el contrato operativo ni activa ruta HTTP.
- Verificar CI del nuevo commit y último HEAD; PostgreSQL operativo y VPS siguen fuera del alcance.

## Sesión 3 — integración SQL → HTTP → PWA Cliente
- Commit `db7c717ade139d154f8506e7314c1e72f80052a0`: tests in-memory que conectan el pool simulado con SET LOCAL ROLE, el handler HTTP y el loader TypeScript de la PWA. Comprueban agotado visible/no disponible, ausencia de datos de borrador, liberación limpia tras COMMIT y fallo cerrado de la PWA ante error interno de API.
- No hay conexión a PostgreSQL real en este test de integración, ni montaje de ruta en `server.mjs`. Las pruebas PostgreSQL 17 desechable siguen separadas en CI.
- El commit `eb55ef2` ya tenía ambos workflows SUCCESS. Verificar CI del nuevo HEAD antes de declarar validado este hito.

## Sesión 3 — configuración del pool lector
- Commit `dcffc1d09aecd396d248afdff4c822954e4e19de`: amplía tests de `catalog-pool-config.mjs` para asegurar objeto y SSL inmutables, timeouts y límite de pool esperados, rechazo de puertos no válidos y mensajes de error que no exponen la contraseña.
- No se crean conexiones ni credenciales; `server.mjs` sigue sin montar el endpoint. No hay despliegue.
- Los workflows del hito SQL–HTTP–PWA (`db7c717`, `a4234f2`) estaban en ejecución al comenzar. Verificar CI del último HEAD.

## Sesión 3 — denegaciones SQL reales sobre tabla de catálogo
- Commit `ff3d2929dfd94e183ac7d0bb67c38f0f51829353`: el login técnico autenticado por TCP activa `SET LOCAL ROLE sabora_catalog_reader` y ejecuta SELECT y UPDATE reales contra `sabora.catalog_items`. Ambos deben recibir `insufficient_privilege`; complementa la verificación ACL y las denegaciones de datos personales.
- Previamente ambos workflows SUCCESS para `dcffc1d`; Bootstrap SUCCESS para `f8ce465`, Sabora CI todavía en curso.
- No se han aplicado migraciones ni abierto conexiones a Supabase operativo; CI usa PostgreSQL 17 desechable. Verificar nuevos runs.

## Sesión 3 — rechazo de catálogo HTTP incoherente
- Commit `82832222a9615508ae96b36dcafc39ae93639217`: pruebas de la ruta HTTP ante IDs duplicados de publicación y `sold_out` no booleano; debe fallar cerrado con 503, sin devolver catálogo parcial. No se cambia código de producción ni se habilita el endpoint.
- Los workflows para `ff3d292` y `157c183` estaban todavía ejecutándose al iniciar este bloque. Comprobar CI de este hito.

## Sesión 3 — filas anómalas de RPC del catálogo
- Commit `6fe384a76d22c52efc81cc4e8f42ec6486ba22c9`: tests de `readPublishedCatalog` para menú publicado vacío y filas no válidas (null, número, snapshot ausente y disponibilidad no booleana). No se activa endpoint ni se modifica producción.
- Al iniciar, `ff3d292` tenía Sabora CI y Bootstrap SUCCESS; `157c183` tenía Sabora CI SUCCESS. Verificar los workflows del nuevo HEAD.

## Sesión 3 — corrección de CI del contrato RPC
- `6fe384a` y `dceb5fb`: Sabora CI y Bootstrap FAILED; job de Test mostró 228/229 tests PASS, falló `SQL adapter rejects non-row primitives and invalid published snapshots` con `Missing expected rejection`. No era fallo de PostgreSQL.
- Commit `7034dc472c98fe21567e1a4a34db3da923207077`: el adaptador `readPublishedCatalog` rechaza filas RPC primitivas, null o sin `published_snapshot` antes de proyectarlas. A diferencia del proyector genérico que puede omitir borradores, la RPC restringida promete únicamente filas publicadas y debe fallar cerrado.
- `8283222` y `e5251e1` tenían ambos workflows SUCCESS. Verificar CI del nuevo commit correctivo antes de considerarlo resuelto.

## Sesión 3 — PWA Gestión: estructura de navegación no operativa
- `7034dc4`: Sabora CI y Bootstrap SUCCESS, validando corrección del adaptador RPC; `95c8ad5`: Bootstrap SUCCESS y Sabora CI pendiente al comenzar.
- Commits `10ba9106bad1cb52317062e60e95cf6932892741` y `c2b2b5ceba9346c47b243c3166be6d7d02de780c`: PWA Gestión con navegación accesible y responsive entre Resumen, Carta, Mesas/QR, Comandas y Equipo. Muestra requisitos de activación por área, no datos ficticios ni acciones de escritura.
- **No es un panel administrativo funcional**: no existe login ni llamadas a API en esta interfaz; acceso y operaciones permanecen expresamente inhabilitados. Revisar CI/build de Gestión tras el cambio.

## Sesión 3 — gate de interfaz Gestión no operativa
- Commit `23578d8ed808169ee3a3011550fa5ff34d371aae`: `tests/management-scaffold.test.mjs` valida cinco áreas, aviso explícito de no operatividad, accesibilidad de navegación y ausencia de llamadas HTTP, WebSocket, almacenamiento de sesión y formularios de escritura en la maqueta.
- Sabora CI SUCCESS en `10ba910` y `c2b2b5c`; Bootstrap SUCCESS en `10ba910`. Bootstrap de `c2b2b5c` seguía en curso al iniciar.
- Esta regresión es una barrera estática de alcance limitado, no reemplaza pruebas de autorización del backend. Comprobar CI de HEAD antes de avanzar.

## Sesión 3 — reconciliación documental de la puerta de catálogo
- Commit `e8e9ee3c22901fd5fff200052a09baf136a0c638`: actualización aditiva de `docs/architecture/SABORA_CATALOG_PUBLICATION_GATE.md` para distinguir el «Estado actual» histórico de los componentes y pruebas realmente versionados. Mantiene explícitos los bloqueos de despliegue, conexión y publicación.
- No se modificó el runtime ni Supabase. Verificar los runs CI de la rama.

## Sesión 3 — pruebas adicionales de precios
- Commit `8eb0b563005b96f15ed3edd31b4da8b8d049af86`: casos de gratuidad, descuento porcentual completo, redondeo por unidad antes de multiplicar, overflow de importes y entradas inválidas en `tests/catalog-pricing.test.mjs`. `priceCatalogLine` continúa siendo cálculo puro sin endpoint de pedido.
- `23578d8` y `a07e392`: Sabora CI y Bootstrap SUCCESS. Verificar los nuevos workflows de pruebas económicas.

## Sesión 3 — endurecimiento del acumulador de extras
- `8eb0b56`: Sabora CI y Bootstrap SUCCESS, incluyendo pruebas de descuento completo, redondeo y overflow.
- Commits `2c1091a40a981215d39587081d588dc10308807f` y `944939c663dcccbd773eab08906252d1d65344aa`: el cálculo puro de precios comprueba overflow en cada acumulación de extras y al sumar el precio base, antes de cualquier descuento. Regresiones para el límite `Number.MAX_SAFE_INTEGER`.
- Sin activación de API, publicación administrativa, pedidos, migraciones operativas ni despliegue. Comprobar CI de este cambio.

## Sesión 3 — límites de multiplicación por cantidad
- `2c1091a` y `944939c`: Sabora CI y Bootstrap SUCCESS; `b6039ae`: Sabora CI SUCCESS.
- Commits `3d48da6bb969d2ebfb369cd51417867c44b8f740` y `95f88875d25a152d35b825ca430452afb0d0ce8f`: el cálculo puro valida que subtotal bruto y descuento unitario multiplicados por cantidad permanezcan en el rango seguro, incluso con descuento del 100 %. Pruebas del límite exacto y del primer céntimo fuera del rango.
- Verificar CI; no se habilitaron pedidos, pagos, administración ni migraciones operativas.

## Sesión 3 — entrada de cálculo de precios
- Commits `f7a1b97260e671ef54911c599cd88b029d224dc3` y `4171968c6a2fd721fca0058e20d71d6757873fcb`: `priceCatalogLine` rechaza de manera uniforme entradas null, undefined, primitivas y arrays con `invalid_catalog_price`, en vez de dejar escapar errores de destructuración. Test de regresión.
- El validador SQL de publicación `20261021190000_sabora_catalog_publication_guard.sql` **todavía rechaza options/extras no vacíos y descuentos distintos de null**. No afirmar que la validación económica de publicación esté terminada; debe diseñarse y probarse transaccionalmente antes de habilitar Gestión.
- Sin cambios operativos; verificar los dos workflows del último HEAD.

## Sesión 3 — casos negativos de publicación económica PostgreSQL
- Commit `e278c1cb923f43b16a2bd0625040df5a5b3b79fc`: smoke de PostgreSQL 17 desechable amplía pruebas negativas de `validate_catalog_snapshot`: céntimos fraccionarios, negativos, importes fuera de límite, extras no validados, descuento fijo no validado y alérgeno nulo. Mantiene la prohibición de publicar reglas económicas aún no implementadas.
- No altera migraciones ni producción. Verificar CI; el soporte positivo de extras/opciones/descuentos sigue pendiente de diseño, validación y pruebas transaccionales.

## Sesión 3 — proyección pública sin pérdida silenciosa de reglas económicas
- Commits `c047821bebbe51e63263fb0d1649b9e62b925911` y `0860df271b9e47a6822b9fe87d619dc7f1cb6b23`: `projectPublishedCatalog` rechaza snapshots publicados con `options`/`extras` no vacíos o `discount` no nulo porque el DTO público actual no puede representarlos. Las variantes vacías/neutras siguen permitidas. Pruebas de regresión.
- Esto **no implementa** extras/opciones/descuentos; impide presentar un precio incompleto si llegaran a publicarse por una vía futura. La publicación SQL sigue bloqueando reglas no implementadas. Verificar CI.

## Sesión 3 — contrato de implementación económica
- Commit `4ef5371cddbfe6016787786eeb03c4a5b647570d`: nuevo `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`. Define puertas de implementación para DTO versionado, validación de extras/opciones/descuentos, publicación con revisión esperada, selección cotizada en servidor, recálculo y aceptación explícita, snapshots inmutables y pruebas aisladas. Es diseño no operativo derivado del contrato funcional, no funcionalidad implementada.
- No relajar la validación SQL ni la proyección pública hasta que se implemente y pruebe el contrato completo.

## Sesión 3 — validador candidato de modificadores económicos
- Commits `747d6839d08ad8158d6c442a0edb743607f211fa` y `93bb7373f62ffee00bb71f817e2f0bab57626799`: `apps/api/src/catalog-economic-modifiers.mjs` y pruebas puras. Contrato **candidato** explícito para opciones con valores, extras, disponibilidad, alérgenos y descuentos fijos/porcentuales. Rechaza duplicados, importes inválidos, límites excesivos y claves inesperadas.
- **No conectado** a `publish_catalog_item`, proyección pública, endpoints ni pedidos. El SQL vigente continúa rechazando extras/opciones no vacíos y descuentos no nulos. Antes de integrar, revisar compatibilidad del contrato candidato con el funcional, establecer IDs persistentes, versión JSON y validación PostgreSQL equivalente.
- Codex se reserva para auditoría posterior. Verificar CI de HEAD.

## Sesión 3 — bloque amplio: cotización segura y recálculo candidato
- Commits `dbcbb938`, `85d5afab`: nueva `quoteCatalogSelection` y pruebas. Cotización pura desde snapshot confiable, comprobando pertenencia, IDs, disponibilidad, selección obligatoria, máximos, duplicados, desglose de extras/opciones y alérgenos.
- Commits `e3dc365f`, `16f46d0b`: `compareCatalogQuote` y pruebas. Recalcula y exige aceptación explícita si cambia la revisión publicada, subtotal, descuento o total, **incluidas las bajadas de precio**. No confirma pedidos.
- Commits `a523be1e`, `15278726`: refuerzo de acceso a grupos con `Object.hasOwn` y límite agregado de 50 modificadores, con regresiones.
- `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md` actualizado en `b22aa436`.
- Todas las funciones siguen **aisladas**: sin API, sin DB operativa, sin publicación ni pedidos habilitados. Verificar Sabora CI/Bootstrap para cada HEAD. Siguiente puerta: definir versión de JSON y migración PostgreSQL equivalente con pruebas en DB desechable antes de integración.

## Sesión 3 — candidato PostgreSQL de modificadores económicos
- Commits `506622dcc3fe4570575cfecb0bb68e66bf6bb86e` y `79c9360d1bc447c50f41f68f1e18dd83e7dec675`: migración aditiva `20261021210000_sabora_catalog_economic_candidate_validation.sql` con funciones aisladas para validar opciones, valores, extras, disponibilidad, alérgenos y descuentos, más smoke PostgreSQL 17 desechable.
- Los roles de aplicación no reciben EXECUTE; `publish_catalog_item` y `validate_catalog_snapshot` permanecen intactos y siguen bloqueando extras/opciones/descuentos no neutros. El smoke comprueba expresamente que el candidato **no** desbloquea la publicación.
- Pendiente comprobar CI y comparar semántica del validador SQL con JavaScript; sin despliegue ni migración operativa.

## Corrección de concurrencia de cambios en la rama
- Al implementar el candidato SQL se detectó una migración canónica ya incorporada en otro commit de la misma rama: `supabase/migrations/20261021210000_sabora_catalog_economic_candidate.sql` (CI y Bootstrap del commit `2fc8051d`: SUCCESS).
- La migración adicional `20261021210000_sabora_catalog_economic_candidate_validation.sql` duplicaba la firma `sabora.validate_catalog_economic_modifiers(jsonb)`, causando fallos de migración CI. Se **eliminó** la migración duplicada en `30ff5e0fc09ca9895362d01d07f0c67dff1c49ae`. Conservar exclusivamente la canónica; no reintroducir duplicados.
- El smoke de casos positivos/negativos y comprobación de permisos añadido en `79c9360d` permanece en `scripts/ci/postgres-migration-smoke.sh`. Volver a verificar CI de HEAD tras la eliminación.
- Los fallos de CI anteriores a esta corrección son reales y no deben declararse verdes retrospectivamente.

## Sesión 3 — endurecimiento SQL y pruebas diferenciales económicas
- Commits `e08c9133`, `cfaf23c6`: se restauró la migración canónica desde un commit conocido para eliminar una corrupción accidental de edición; se añadió comprobación explícita de tipos `id`/`name` y se cambió el consumo de la función SQL auxiliar a `IS DISTINCT FROM TRUE`, de forma que `NULL` nunca valide modificadores. `cfaf23c6`: Sabora CI y Bootstrap SUCCESS.
- Commits `2b6e15c6` y `dc9d3a72`: casos negativos equivalentes en PostgreSQL y JS para campos ausentes/nulos, IDs incorrectos y valores duplicados.
- Commits `42183805` y `9608bcdd`: `scripts/ci/catalog-economic-parity.mjs` genera expectativas desde `validateEconomicModifiers` para 29 casos y las ejecuta contra la función candidata SQL en PostgreSQL 17 desechable desde el smoke. Es una puerta de **equivalencia diferencial**, no activación de publicación.
- Verificar CI del HEAD tras incorporar la prueba diferencial. La función de publicación operativa sigue sin aceptar opciones/extras/descuentos y sin grants de escritura.

## Sesión 3 — extensión determinista de la puerta diferencial
- `06b23aae`: `scripts/ci/catalog-economic-parity.mjs` añade 300 mutaciones deterministas (semilla fija) a los 29 casos explícitos; compara automáticamente 329 entradas entre `validateEconomicModifiers` JS y la función candidata SQL en PostgreSQL 17 desechable. Mutaciones de estructuras, nombres, IDs, tipos, importes, disponibilidad, límites y descuentos.
- La generación usa PRNG local determinista, sin red ni datos operativos. Esta cobertura no demuestra equivalencia formal; **no** modifica la publicación, DTO público, pedidos, roles ni despliegue.
- Revisar GitHub Actions del commit final antes de declarar verde; ante divergencia, corregir la semántica y conservar el caso como regresión.

## Sesión 3 — incidencia descubierta por fuzz determinista
- La puerta de 329 casos encontró un fallo en `uniqueIds` de `apps/api/src/catalog-economic-modifiers.mjs`: acceso a `.id` sobre `null` en colecciones antes del rechazo. Se corrigió en `9cc705a8`, con CI y Bootstrap SUCCESS.
- `fb3e7efa`: pruebas unitarias explícitas de entradas `null` en extras y valores de opción.
- `3edc1337`: documentación de la cobertura y alcance. Comprobar ambos workflows del último HEAD antes de cerrar el bloque.
- Sin merge, sin activación de pedidos, sin cambios en Supabase operativo ni VPS.

## Sesión 3 — evidencia económica v1 y cálculo porcentual exacto
- `13bf7fad`, `02d0f53f`: `apps/api/src/catalog-line-evidence.mjs`, constructor puro `buildCatalogLineEvidence` que fija `schemaVersion:1`, ID de artículo, revisión publicada, selección, importes, alérgenos y descuento en un objeto profundamente congelado. Se eliminó deliberadamente un validador de evidencia independiente que no podía demostrar procedencia de DB.
- `2cb36795`: pruebas de evidencia congelada, independencia ante mutaciones posteriores, revisión/identificadores y entradas malformadas.
- `7c8cae23`, `10322d77`: cálculo porcentual exacto con `BigInt` para evitar desbordamiento de producto intermedio; pruebas de límites de enteros seguros. La primera ejecución CI de `7c8cae23` falló por una aserción previa que esperaba rechazo de un caso ahora válido; se actualizó en `10322d77`. Verificar CI final.
- `455557ff`: contrato de arquitectura actualizado. Nada conectado a confirmación de pedidos, DB operativa, publicación SQL, HTTP ni PWA. Próxima puerta: transacción real que bloquee revisión, resuelva pertenencia y persista evidencia atómica con idempotencia y aceptación explícita.

## Sesión 3 — candidato de aceptación firmada de recotización
- `821a0b61`: módulo puro `apps/api/src/catalog-reprice-acceptance.mjs` con token HMAC-SHA256 firmado por servidor, ligado a cesta, identidad, revisión publicada, selección, cantidad, evidencia económica y caducidad máxima de diez minutos.
- `2ad2d1a3`, `d28a65b8`: pruebas de firma, manipulación, caducidad, subida/bajada de precio, cambio de descuento, disponibilidad, identidad y revisión; caso de manipulación hecho determinista.
- `3e513aff`: arquitectura aclara que **token firmado no equivale a consentimiento humano ni a idempotencia**. Falta registro transaccional de aceptación y validación de permisos/visita/mesa en DB. No montar rutas ni usar en producción.
- Revisar CI del HEAD tras documentación. Sin merge, sin despliegue, sin escritura en Supabase operativo ni recursos del VPS.

## Sesión 3: puerta de confirmación económica aislada
- fe4c6a5d: decisión previa a confirmar según revisión, precio y aceptación firmada.
- bfbb0027: pruebas de subida, bajada, revisión, descuento, identidad, caducidad y datos alterados.
- 75d9d27a: documentación de arquitectura. Pendiente: autorización de visita, bloqueo transaccional, idempotencia, consentimiento duradero y persistencia atómica.
- Sin conexión HTTP ni operaciones en entornos productivos.

## Sesión 3 — coordinador transaccional candidato
- 94c40bd7: coordinador aislado con transacción, bloqueo de contexto, replay idempotente, bloqueo de catálogo, decisión de aceptación y persistencia delegada.
- c9b8862d: pruebas con adaptador simulado de secuencia, rollback, replay, cambios de revisión, consentimiento y entradas prohibidas.
- 072b2d84: documentación de los límites. No hay adaptador PostgreSQL real, consumo durable de aceptación ni ruta HTTP. No activar pedidos.
- Pendiente: SQL de idempotencia, bloqueo real, autorización QR/visita y pruebas concurrentes en PostgreSQL 17 aislado.

## Sesión 3 — cierre de falsificación de cotización previa
- `83f63a3d`: eliminado `previous` del payload cliente de `catalog-confirmation-coordinator`. El nuevo método obligatorio `loadPreviousQuote` debe leer cotización anterior confiable dentro de la transacción. Sin registro previo, fallo cerrado.
- `9414db30`: tests de `previous` falsificado, registro anterior inexistente y cambio de revisión almacenada. El CI intermedio de `83f63a3d` falló porque los tests antiguos aún esperaban el contrato anterior; verificar CI del HEAD actualizado.
- `0492272a`: documentación de arquitectura y advertencia explícita: sin repositorio PostgreSQL real que guarde y bloquee cotizaciones mostradas no se puede activar pedidos.
- Prohibido desplegar, mezclar o tocar Supabase/Fleetia/VPS sin autorización.

## Sesión 3 — almacenamiento económico candidato en PostgreSQL
- `0848651e`, `f5c161c6`: migración privada `20261021220000_sabora_catalog_quote_ledger_candidate.sql`, con cotizaciones mostradas y confirmaciones idempotentes, FK compuesta por visita/cesta/actor, checks económicos y RLS forzado.
- `8bc47f4a`: CI PostgreSQL 17 desechable valida 17 tablas RLS, unicidad, FK y ausencia de grants en roles de runtime. Verificar resultado final.
- `fc9f34de`: contrato de arquitectura. No hay escritor, rutas, permisos ni integración con el coordinador. Sin despliegue ni cambios a Supabase operativo o VPS.
