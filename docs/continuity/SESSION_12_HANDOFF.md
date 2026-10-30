# CartaViva / Sabora — Continuidad para la sesión 12

**Preparado:** 28 de octubre de 2026. **Naturaleza:** contexto de continuidad, **NO normativa** y **NO autorización de merge, despliegue o activación**.

## 1. Inicio obligatorio

1. Abrir exclusivamente el repositorio GitHub `jdlc86/CartaViva`. Verificar el HEAD real, rama, base y estado del PR #40 Draft, conflictos, commits y GitHub Actions **del SHA exacto**. No asumir que los datos de este documento continúan vigentes.
2. Leer **primero** la documentación normativa: `docs/REQUISITOS_FUNCIONALES.md`, `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, los contratos de autenticación, personal, cocina, sala y permisos aplicables, además de los requisitos y flujos visuales aprobados. Leer después `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md` y `docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md` y, finalmente, este handoff para contexto.
3. Contrastar contratos, migraciones, código, pruebas y CI antes de implementar. **La documentación normativa de GitHub prevalece sobre este handoff**; no inventar funcionalidades, permisos, flujos, estados ni diseños.
4. Priorizar hitos verticales grandes y completos, con implementación, integración, regresión, documentación y CI verde. Ante fallos, consultar logs, corregir y repetir. Usar esperas de shell para CI sin solicitar al usuario vigilancia ni aprobaciones de rutina.

## 2. Repositorio y estado verificado al cierre de la sesión 11

- Repositorio exclusivo: `jdlc86/CartaViva`.
- Rama: `integration/sabora-activation-readiness-20261028`.
- PR **#40 Draft**: <https://github.com/jdlc86/CartaViva/pull/40>.
- Base histórica de PR #40: `feat/sabora-staff-directory-rls-20261028`; verificar de nuevo.
- HEAD observado: `406fae7c1667b0eb8ae8f01209b7a85bbb417d68`.
- GitHub Actions sobre ese HEAD: **Sabora CI SUCCESS**, **Bootstrap Sabora lockfile SUCCESS**, **Sabora management browser visual smoke SUCCESS**; resultados comprobados antes de crear este documento.
- **Importante:** el commit de creación de este handoff cambia el HEAD y requiere comprobar de nuevo los workflows. No atribuir automáticamente al nuevo HEAD los resultados anteriores.
- No se ha hecho merge, no se ha desplegado ni se han ejecutado migraciones sobre Supabase operativo.

## 3. Alcance implementado y validado en la integración candidata

- Flujo de línea de pedido en PostgreSQL 17 desechable: confirmado → preparando → listo → recogido, con notificación durable, historia, control de rol, idempotencia y prueba API Fastify. `picked_up` **no significa entregado**.
- `apps/api/src/order-operations-candidate-app.mjs`: factoría Fastify candidata sin listener; requiere pools SQL de privilegios mínimos, capacidades firmadas y autenticación inyectada. `apps/api/src/server.mjs` sigue sin importar ni activar esta ruta.
- `apps/management/src/order-operations-authenticated-gateway.js`: gateway HTTP con token nuevo por petición, sin cookies ni persistencia de credenciales, revocación y aborto de peticiones.
- Eventos SSE: suscripciones revocables, sin reconexión tras logout; cancelación explícita del lector del stream al cerrar sesión.
- `apps/management/src/management-session-fence.js`: revocación del canal de un empleado anterior al sustituirlo por otro, protección ante logout tardío e idempotencia.
- `apps/management/src/main.tsx`: `mountAuthenticatedManagementApp` opt-in, vista previa sin gateway y nuevo montaje React sincrónico mediante `flushSync` y clave nueva por cambio de identidad, para no conservar tablero, historial ni borradores de otro empleado.
- Pruebas en `apps/management/tests/`, `scripts/ci/order-operations-read-postgres17.test.mjs` y smoke visual; no extrapolar la validación a un despliegue ni a una sesión real de usuario.
- Informe y límites en `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`.

## 4. Objetivo prioritario de la sesión 12: cerrar un hito vertical real

**No seguir consumiendo la sesión en microcorrecciones de logout/SSE.** Elegir y ejecutar el mayor bloque de integración pendiente permitido por los contratos normativos:

1. Verificar los mecanismos de identidad real del personal existentes en el repositorio y sus puntos de entrada aprobados. Conectar el bootstrap autorizado de gestión con una sesión válida **sin credenciales embebidas, sin flags de bypass y sin activar rutas públicas**. Si faltan secretos o aprovisionamiento, construir y probar el candidato aislado y declarar el bloqueo, sin inventar un proveedor.
2. Integrar, en entorno PostgreSQL 17 efímero, cliente/gestión ↔ autenticación ↔ API candidata ↔ base de datos, para cocina y sala. Cubrir identidad de cocina y camarero, permisos denegados, preparación, listo, aviso durable, recogida, replay, revocación, cambio de empleado, reconexión y recarga.
3. Ejecutar **pruebas reales de navegador** del flujo autorizado, además de pruebas unitarias, contractuales, integración PG17 y build/TypeScript. No presentar tests de inspección de texto como equivalentes a E2E navegador.
4. Resolver fallos de extremo a extremo, actualizar la documentación pertinente, registrar evidencia y esperar CI verde sobre el HEAD final. Mantener el PR Draft y separar explícitamente **hito candidato validado** de **activación productiva**.

## 5. Reglas de seguridad e infraestructura innegociables

- **Sabora es un único restaurante** y dispone de PWA cliente y PWA gestión. Respetar la interfaz visual y flujos previamente aprobados.
- Solo se permite modificar código, ramas, commits, PR y Actions de **`jdlc86/CartaViva`**.
- VPS compartido con **Fleetia** y otros proyectos: no modificar, detener, reiniciar ni depender de sus contenedores, redes, volúmenes o recursos. **No ejecutar operaciones Docker globales**.
- **No desplegar Sabora en el VPS ni hacer merge sin autorización expresa.** Todo eventual despliegue requiere aislamiento completo demostrado.
- Supabase operativo `https://byhvmumqivmunkmomhup.supabase.co`: no modificar datos, credenciales, grants ni aplicar migraciones sin autorización. Usar PostgreSQL 17 desechable para pruebas.
- No ejecutar acciones destructivas en entornos operativos ni inventar aprobaciones.
- Actualizar documentación del repositorio al cerrar hitos importantes.

## 6. Instrucción operativa corta

Continuar autónomamente por bloques grandes, completos y verificables. Revisar GitHub y la normativa, integrar un recorrido funcional real de cocina y sala, corregir los fallos detectados, esperar CI con shell, documentar evidencias y mantener el PR #40 Draft. **Sin merges, despliegues, cambios en Fleetia ni Supabase operativo.**
