# SESSION 05 — Continuidad de CartaViva / Sabora

**Corte:** 22 de octubre de 2026.
**Repositorio único autorizado:** `jdlc86/CartaViva`.
**Rama:** `feat/sabora-pnpm-bootstrap`.
**PR:** [#2](https://github.com/jdlc86/CartaViva/pull/2), **Draft**, sin merge.
**HEAD comprobado antes de crear este documento:** `3834b46da4eeb3d7c2d20c3975fa0c183b85a862`.
**GitHub Actions en ese SHA:** Sabora CI `39759537282` **SUCCESS** y Bootstrap Sabora lockfile `39759537273` **SUCCESS**. La creación de este handoff producirá un SHA nuevo: verificar ambos workflows del nuevo HEAD; nunca heredar un verde anterior.

## 1. Mandato y límites no negociables

Continuar desarrollo **autónomo en bloques grandes**: inspección documental y código real, implementación, pruebas unitarias y PostgreSQL 17 aislado, commits, correcciones y seguimiento de Actions. Usar espera breve por shell si hace falta y continuar sin pedir autorización para cada commit. La **documentación vigente de GitHub es fuente de verdad**: no inventar ni reinterpretar requisitos. Actualizar documentación del repositorio al cerrar hitos.

Solo se permite crear ramas, modificar código, commitear, abrir PR y ejecutar Actions **en `jdlc86/CartaViva`**. **Prohibido merge y despliegue al VPS sin autorización expresa**. Prohibido modificar Supabase operativo sin autorización expresa. **No tocar Fleetia ni otros proyectos**: ni contenedores, redes, volúmenes, bases, puertos, despliegues o reinicios. Sabora debe poder desplegarse/reiniciarse/eliminarse sin afectar ni depender de Fleetia. Evitar Codex reviews por escasez de créditos, salvo petición posterior del usuario.

Proyecto Supabase de Sabora como referencia, **no como destino de pruebas**: `https://byhvmumqivmunkmomhup.supabase.co`. Tests SQL únicamente sobre contenedor PostgreSQL 17 desechable y aislado, siguiendo scripts CI existentes.

## 2. Lecturas obligatorias antes de programar

1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: contrato normativo funcional.
2. `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`: publicación, evidencia económica, consentimiento, idempotencia y bloqueos.
3. `docs/security/SESSION_04_WRITER_AUDIT_GATE.md`: registro detallado de avances, límites y puertas de activación durante sesión 4.
4. `docs/continuity/SESSION_04_HANDOFF.md` y `docs/continuity/SESSION_03_HANDOFF.md`: arquitectura, decisiones previas y continuidad histórica.
5. `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`, documentación de entornos, seguridad y CI.
6. Código y migraciones efectivos: `apps/api/src/`, `tests/`, `scripts/ci/`, `supabase/migrations/`; comprobar que cada módulo existe y que los contratos no se contradicen.

## 3. Arquitectura y negocio confirmado

- **Sabora es un único restaurante**. CartaViva actúa como directorio central; restaurantes futuros tendrán datos e infraestructura propios y aislados.
- **Dos PWA independientes** de Sabora: cliente y gestión; vistas operativas para camarero, cocina y administración.
- QR de mesa revocable/rotatorio. Identidad del cliente persistente con alias, identificador y empresa opcional. **QR no es autenticación personal**.
- Mesas abiertas/pausadas/cerradas; cierre rota sesión y revoca visitas de la ocupación anterior. Agrupación de comandas por ventana configurable (inicialmente cinco minutos).
- ROOT único, varios ADMIN y un único ADMIN titular de escritura según contrato. No asumir permisos sin comprobar modelo y pruebas.
- Catálogo publicado y versionado; extras y descuentos; evidencia económica inmutable y reaceptación expresa si cambia el importe/revisión. No permitir precios controlados por navegador.
- Caja, cocina, cobros, Stripe, propinas, push y dashboard sujetos a los casos de aceptación documentados. **Candidato no significa operativo**.

## 4. Hitos reales de la sesión 4

### Frontera de transacción y seguridad

- `apps/api/src/postgres-transaction.mjs`: control de vida de la consulta transaccional y rechazo de consultas tardías/no esperadas; tests correspondientes.
- Coordinador `catalog-confirmation-coordinator.mjs`: canonización de entradas, cotejo de contexto de visita/mesa/cesta/actor, límites de tamaño, comprobación de idempotencia y aceptación HMAC. No conecta aún escritor operativo.
- `catalog-confirmation-repository.mjs`: composición de lectura y `persist` **inyectado**, con validaciones previas. **No existe todavía escritor completo de pedido autenticado**.
- `catalog-confirmation-read-repository.mjs`: `pg_advisory_xact_lock(hashtextextended(scope,0))` antes de consultar replay, scope compuesto de mesa/sesión/visita/cesta/actor/requestKey. Se verificó el bloqueo entre sesiones PG17 aisladas.
- `catalog-visit-context-repository.mjs`: bloqueo de visita, mesa, QR y sesión de cliente; verificar contratos exactos en código.
- Staff: verificador bearer RS256 candidato, resolver membresía y coordinador de transiciones; algoritmo de firma real y rotación de Supabase Auth **sin acreditar en producción**. Auditoría SQL todavía no atribuye actor individual con garantía completa.

### SQL y concurrencia PostgreSQL 17

- Migraciones candidatas de ledgers `sabora.catalog_displayed_quotes` y `sabora.catalog_confirmation_attempts`: FORCE RLS, sin grants de runtime, restricciones de scope, unicidad, append-only.
- `scripts/ci/catalog-confirmation-activation-gate.sql`: verifica ausencia de grants de runtime, función legacy no ejecutable, restricciones, RLS, triggers y protecciones de inmutabilidad. Integrado en `postgres-migration-smoke.sh`.
- `scripts/ci/catalog-confirmation-idempotency-concurrency-smoke.sh`: dos conexiones con bloqueo advisory real.
- `scripts/ci/catalog-confirmation-atomicity-smoke.sql`: rollback conjunto de pedido y confirmación; fallo FK de cotización incompatible revierte pedido; aceptación económica con timestamp inconsistente es rechazada.
- `scripts/ci/catalog-quote-concurrency-smoke.sh`: carrera de idempotencia con commit del primer contendiente y carrera con **rollback** del primero, tras la cual el segundo confirma. Corrección de fixtures con order IDs independientes. Ambos escenarios acreditados por CI.
- Estas pruebas usan conexión de propietario en PostgreSQL desechable; **no acreditan todavía rol SQL operativo ni autenticación de cliente, consentimiento completo o cierre concurrente con escritor real**.

### Nuevo adaptador candidato de ledger

- `apps/api/src/catalog-confirmation-attempt-writer.mjs`: inserción SQL parametrizada en `catalog_confirmation_attempts`, exige contexto autorizado, UUIDs, huella, evidencia económica, aceptación verificada cuando procede y `orderId` generado de forma confiable en **la misma transacción**.
- Fecha de aceptación generada con `clock_timestamp()` por PostgreSQL, no por navegador.
- Validación de evidencia de `buildCatalogLineEvidence`: esquema v1, item/revisión, nombre/categoría, cantidad, extras, alérgenos, importes seguros. Comprobación exacta con `BigInt`: subtotales/descuentos/totales unitarios × cantidad. Tests `tests/catalog-confirmation-attempt-writer.test.mjs`, incluidos intentos manipulados.
- Commits recientes: `f9160ebb` (adaptador), `36070c2f` (tests), `da508b9e`/`3473a308` (estructura de evidencia), `ea4a6520`/`f43e04fd` (aritmética y regresiones), `3834b46d` (docs).
- **No hay HTTP operativo, grants, migraciones aplicadas a Supabase, ni escritura de pedidos completa.**

## 5. Bloqueo prioritario para sesión 5

El esquema legacy de `sabora.orders` y su función antigua `sabora.confirm_order` conservan campos `company`, `employee_number` e `items` JSON del flujo anterior. El nuevo contrato exige identidad de cliente con empresa opcional y evidencia económica derivada de catálogo publicado; **no inventar valores corporativos ni permitir que el navegador los falsifique**. Resolver primero compatibilidad del modelo mediante documentación y migración candidata segura; verificar dependencias existentes de cocina/caja/historial antes de cambiar columnas.

**Ruta recomendada:**
1. Verificar HEAD/CI y releer contrato de identidad, pedidos y migraciones legacy.
2. Diseñar e implementar el **escritor transaccional de pedido candidato** con creación de pedido y ledger económico en la misma transacción, sin activar HTTP ni permisos. Exigir contexto verificado, cotización ligada al mismo scope y evidencia del catálogo bloqueado; rechazar cambios de precio sin consentimiento verificable.
3. Ampliar tests de composición y PostgreSQL 17 para rollback, FK, idempotencia, concurrencia con cierre de mesa, visita revocada, QR rotado y fingerprint incompatible. Diferenciar mocks de evidencia PG real.
4. Diseñar y probar rol mínimo NOINHERIT/NOBYPASSRLS y actor de auditoría no falsificable **antes** de conceder grants. Resolver configuración real JWT/rotación Auth antes de integrar.
5. Mantener puertas negativas de activación, PR Draft y documentación al día. No simular cobros reales ni afirmar funcionalidades operativas.

## 6. Procedimiento operativo

- Consultar PR #2 y último SHA de `feat/sabora-pnpm-bootstrap`; verificar `Sabora CI` y `Bootstrap Sabora lockfile` sobre **ese SHA**, no sobre uno anterior.
- Trabajar en la misma rama y PR, con commits coherentes, pruebas y documentación. Corregir CI rojo hasta verde. Para esperas de CI usar shell o consultas repetidas sin pedir intervención.
- No cambiar producción ni desplegar. Toda prueba PostgreSQL en contenedor desechable y sin red, mediante `scripts/ci/postgres-migration-smoke.sh`.
- Documentar con precisión qué se probó, qué sigue siendo candidato y qué permanece bloqueado. No dar por completado el writer por existir solo el ledger insert adapter.
- Actualizar este handoff o crear el siguiente al cerrar la sesión; revisar GitHub como fuente de verdad si existe discrepancia.

## 7. Punto de entrega

Documento preparado sobre el estado **verificado** de `3834b46d` con ambos workflows SUCCESS. La creación de `SESSION_05_HANDOFF.md` genera un commit adicional; **la sesión 5 debe comprobar el nuevo HEAD y su CI** antes de continuar. El PR #2 permanece Draft y no se autoriza merge ni despliegue.
