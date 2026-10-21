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
