# Sabora — puerta de implementación del catálogo publicado

Estado: **esquema de catálogo y función privada de publicación versionados, aún sin conexión operativa**. Este documento no declara que exista un catálogo operativo.

## Contrato funcional vigente
Fuente de verdad: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`.
- Guardar y publicar son operaciones distintas. Un borrador de plato nuevo no es visible al cliente; una edición de un plato publicado tampoco sustituye su versión pública hasta republicación.
- La categoría publicada aparece si tiene al menos un plato publicado no retirado, incluso si todos están agotados. «Todos» es un filtro virtual.
- Agotado permanece visible pero no seleccionable; retirado no aparece.
- La publicación debe validar precios, opciones, extras, alérgenos y visibilidad. Descuentos de plato se aplican sobre plato más extras; no confiar en cálculos del navegador.
- El servidor es autoridad para precio y disponibilidad; cambios entre cesta y confirmación requieren nueva aceptación.

## Puertas obligatorias antes de habilitar HTTP
1. Identificar en las migraciones reales las tablas de borradores, versiones publicadas, retiradas, agotados, categorías, alérgenos, extras y descuentos; si no existen, diseñar y migrar antes de escribir SQL de lectura.
2. Definir explícitamente cómo se selecciona **solo** la última versión pública de cada plato y cómo se excluyen borradores/retirados sin depender de filtros del cliente.
3. Acreditar RLS/FORCE RLS y un rol de lectura mínimo, sin acceso a borradores, edición, administración ni datos personales.
4. Establecer contrato JSON versionado y límites de resultados; verificar importes enteros en céntimos, disponibilidad y alérgenos con pruebas de fallo cerrado.
5. Probar en PostgreSQL desechable publicación, edición sin republicación, retirada, agotado, permisos y concurrencia. No usar Supabase operativo para estas pruebas.
6. Solo después montar endpoint de lectura y conectar `apps/client/src/catalog.ts`; no habilitar cesta/pedidos hasta validar autorizaciones de mesa, precios e idempotencia.

## Estado actual
Las migraciones candidatas `20261021180000_sabora_catalog_publication_foundation.sql` y `20261021190000_sabora_catalog_publication_guard.sql` incluyen borradores, snapshots y publicación privada con validación provisional; no se han aplicado al Supabase operativo. `apps/api/src/catalog-publication.mjs` implementa una proyección pura desde filas de publicación hacia el contrato público, sin consultar la base de datos ni publicar HTTP. Las pruebas de proyección comprueban exclusión de borradores/retirados y agotados visibles. Sigue pendiente el rol mínimo de lectura, validación económica completa, la consulta SQL y la integración. La PWA Cliente incluye únicamente modelo de presentación, filtrado y estados vacíos; no consulta HTTP. `tests/client-catalog.test.mjs` contiene pruebas del contrato de presentación. La API Fastify no publica rutas de catálogo.

## Lector SQL restringido (candidato, 2026-10-21)
- Migración `20261021200000_sabora_catalog_reader.sql`: rol técnico NOLOGIN `sabora_catalog_reader`, propietario mínimo `sabora_catalog_fn_owner`, política RLS de filas publicadas no retiradas y RPC `read_published_catalog()` con límite 500. El lector no recibe SELECT directo sobre borradores.
- La función solo devuelve `id`, `published_snapshot` y `sold_out`; no expone `draft`, datos personales ni columnas administrativas. `anon`, `authenticated` y `sabora_admin_writer` carecen de EXECUTE.
- Smoke PostgreSQL desechable amplía comprobaciones de permisos, agotados visibles y retirados invisibles. **CI pendiente**, sin conexión API ni credenciales de ejecución ni aplicación a Supabase operativo.

## Ruta HTTP opt-in, sin montaje operativo
- `apps/api/src/catalog-http-route.mjs` registra `GET /api/v1/catalog` **solo cuando se invoca explícitamente** `registerCatalogHttpRoute(app,{query})`; `server.mjs` no la importa ni registra. Requiere consulta inyectada desde el pool mínimo.
- Respuesta: array de elementos públicos; cabeceras `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; fallos de DB devuelven `503 catalog_unavailable` sin detalles internos. Pruebas aisladas en `tests/catalog-http-route.test.mjs`.
- Pendiente: aprovisionar login y membresía NOINHERIT auditados, probar permisos efectivos del login, instalar dependencia DB según arquitectura aprobada, integrar el servidor y PWA Cliente, confirmar CI y seguridad antes de cualquier despliegue.

## PWA Cliente: consumidor preparado
- `apps/client/src/catalog-loader.ts` solicita únicamente `GET /api/v1/catalog` en mismo origen, sin credenciales, sin caché y sin seguir redirecciones; valida estrictamente el JSON con `parsePublishedCatalog`. Errores HTTP, red o contrato pasan a estado de error sin revelar detalles.
- `apps/client/src/main.tsx` carga al entrar en la carta, cancela solicitudes al salir y ofrece reintento. Los pedidos siguen desactivados.
- **No es funcional en producción**: la ruta todavía no se registra en `server.mjs` y no hay login ni pool operativo. CI del nuevo commit pendiente.

## Actualización de evidencias — 2026-10-21
La sección «Estado actual» anterior refleja un punto histórico y **no debe interpretarse como estado vigente**. Se han versionado también `20261021200000_sabora_catalog_reader.sql`, `catalog-reader-query.mjs`, `catalog-scoped-query.mjs`, `catalog-pool-config.mjs`, `catalog-http-route.mjs` y el consumidor `catalog-loader.ts`. La ruta sigue **sin registrarse en `server.mjs`** y el pool/login de producción no está aprovisionado. No hay conexión operativa.

- Pruebas de login PostgreSQL 17 desechable: NOINHERIT/NOBYPASSRLS, SQL real de denegación de tablas, activación transaccional del rol lector y revocación efectiva al COMMIT. CI SUCCESS en `ff3d292` y `157c183`.
- Proyección y HTTP: validaciones de filas, duplicados y fallos cerrados. CI SUCCESS en `8283222` y `e5251e1`.
- `readPublishedCatalog` rechaza ahora filas primitivas, nulas y snapshots ausentes devueltos por la RPC. Corrección `7034dc4` y documentación `95c8ad5`: Sabora CI y Bootstrap SUCCESS.
- La PWA Gestión dispone de una maqueta de navegación para Resumen, Carta, Mesas/QR, Comandas y Equipo; **no ofrece login, publicación ni escrituras**. Las pruebas de guardia de esa maqueta están pendientes de confirmación CI.

**Puertas aún abiertas:** completar semántica económica de opciones, extras y descuentos; autorización administrativa efectiva; integración de pool dedicado; pruebas de integración real con PostgreSQL y endpoint; aplicación de migraciones solo con autorización expresa. No activar pedidos ni publicación.
