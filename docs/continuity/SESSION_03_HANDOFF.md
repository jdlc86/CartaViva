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
