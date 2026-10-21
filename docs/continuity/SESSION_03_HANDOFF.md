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
