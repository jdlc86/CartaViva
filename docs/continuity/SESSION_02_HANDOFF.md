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
