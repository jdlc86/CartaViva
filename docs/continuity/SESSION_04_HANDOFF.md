# SESSION 04 — Continuidad de CartaViva / Sabora

**Fecha de corte:** 22 de octubre de 2026.
**Repositorio único autorizado:** `jdlc86/CartaViva`.
**Rama de desarrollo:** `feat/sabora-pnpm-bootstrap`.
**PR:** [#2](https://github.com/jdlc86/CartaViva/pull/2), abierto y en Draft; base observada `docs/sabora-functional-consolidation`.
**Último HEAD verificado al preparar este documento:** `d6e8a325f4d14fa2db206a1179cd7a6932435ebc`.
**GitHub Actions:** `Sabora CI` y `Bootstrap Sabora lockfile` en **SUCCESS** para ese SHA. Volver a verificar el HEAD y ambos workflows antes de continuar: este dato es una fotografía, no una garantía futura.

## 1. Mandato para la sesión 4

Continuar la implementación en **bloques grandes y autónomos**, con código, tests, documentación, commits y seguimiento de CI. Corregir errores y revalidar sin requerir intervención del usuario para cada paso. **La fuente de verdad es la documentación vigente en GitHub**; leerla antes de diseñar o modificar contratos. No inventar funcionalidades ni interpretar silenciosamente requisitos ambiguos. Actualizar documentación en cada hito significativo.

**Límites absolutos:** trabajar exclusivamente en `jdlc86/CartaViva`; no tocar Fleetia, sus contenedores, redes, volúmenes, datos, despliegues ni recursos de otros proyectos. **No hacer merge ni despliegue al VPS sin autorización expresa.** No aplicar migraciones ni cambios a Supabase operativo sin autorización expresa. Las pruebas de PostgreSQL deben ser desechables y aisladas, conforme al CI del repositorio. No solicitar revisiones de Codex por defecto; el usuario indicó que los créditos son limitados.

## 2. Documentos que deben leerse primero

1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: contrato funcional principal; contiene los casos de aceptación, seguridad, cobros, estados de mesa, promociones, propinas y dashboard.
2. `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`: plan y estado **candidato** de catálogo, cotizaciones, autorización, visitas, JWT y auditoría. Leer también las notas de bloqueo y limitaciones al final.
3. `docs/continuity/SESSION_03_HANDOFF.md`: historia extensa de implementaciones y pruebas de la sesión 3; no asumir que cada candidato está activado.
4. `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md` y los documentos vigentes de seguridad, CI, entornos y despliegue presentes en el repositorio.
5. Migraciones `supabase/migrations/`, pruebas `tests/`, scripts `scripts/ci/` y código real `apps/api/src/`. La implementación efectiva puede ser más limitada que el contrato documental.

## 3. Arquitectura y reglas de negocio

- **Sabora es un único restaurante**, no un sistema multirrestaurante dentro de la misma base. CartaViva es el directorio central; cada restaurante futuro tendrá infraestructura y datos aislados.
- Dos PWA independientes para Sabora: cliente y gestión. Vistas/funciones de camarero, cocina y administración conforme al contrato.
- QR por mesa revocable; identidad de cliente persistente con alias, identificador y empresa opcional. El QR **no** autentica por sí solo a un cliente ni autoriza acceso a cuentas ajenas.
- Mesas abiertas, pausadas y cerradas; cierre separa ocupaciones, rota `session_id` y revoca visitas antiguas. La agrupación de pedidos tiene ventana configurable, inicialmente cinco minutos desde la primera confirmación.
- Un ROOT; varios ADMIN, con **un solo ADMIN titular de escritura** según contrato. Roles y transiciones sujetos a autorización.
- Catálogo con publicaciones versionadas, opciones/extras y descuentos sobre plato y extras; evidencia económica inmutable, reaceptación expresa si cambian precios, descuentos o revisión.
- Pedidos, cocina, caja, Stripe, propinas, notificaciones sin polling y dashboard deben seguir exactamente los contratos y casos de aceptación documentados. No dar por funcional una capacidad solo por tener un módulo candidato.

## 4. Implementación comprobada al cierre de la sesión 3

**Catálogo y cotizaciones candidatos:** validadores de precios y selección; evidencia de línea; puerta de reaceptación HMAC; coordinador de confirmación; adaptadores de lectura y escritura de cotizaciones; ledgers append-only e idempotencia. Se mantienen dependencias de autorización, persistencia de pedido y consentimiento transaccional que impiden activación.

**Mesa, visita y QR candidatos:** `catalog-table-qr-verifier.mjs`, `catalog-visit-context-repository.mjs`, `catalog-quote-issuer.mjs`; migraciones de visitas durables y estados de mesa. El contexto comprueba QR, sesión de cliente, visita, versión QR, caducidad, revocación y estado abierto o pausa vencida. Cerrar una mesa rota la sesión, reinicia agrupación y revoca permisos de la ocupación anterior mediante disparadores SQL.

**Personal y transiciones candidatos:** función SQL privada `transition_table_ordering_candidate`; `staff-table-transition-coordinator.mjs`; `verified-staff-session-resolver.mjs`; `pinned-rs256-staff-bearer-verifier.mjs`; `authenticated-staff-table-transitions.mjs`. El actor se deriva del sujeto JWT firmado y se contrasta con membresía activa. Se rechaza cocina, credenciales inválidas y suplantación de actor en la petición. El verificador RS256 usa clave pública fijada, issuer/audiencia/expiración y base64url canónico. **Confirmar antes el algoritmo de firma real de Supabase Auth y su política de rotación**; no asumir RS256 en producción.

**Auditoría candidata:** `table_ordering_audit_candidate` registra estados, pausas, tiempo y sesiones anterior/nueva; RLS/FORCE RLS y disparadores contra UPDATE/DELETE/TRUNCATE. **El actor_user_id aún no está acreditado en esa auditoría**: no afirmar trazabilidad individual completa.

**Pruebas:** unitarias de los módulos anteriores, smoke SQL sobre PostgreSQL 17 aislado, tests de RLS/ACL, auditoría y carrera de bloqueos cierre vs autorización de pedido. Esta carrera demuestra serialización de bloqueos, **no** confirmación completa de comanda con cobro y consentimiento.

**No activado:** rutas HTTP operativas de transiciones/pedidos, conexión productiva con Auth, escritor SQL de mínimos privilegios, auditoría atribuida de forma fiable, flujo completo de pedido y pagos. No se ha autorizado despliegue.

## 5. Prioridades propuestas para la sesión 4

1. **Verificar HEAD, PR, CI y documentación real.** Identificar el último commit y leer migraciones/roles existentes; evitar duplicar código y resolver divergencias entre candidatos.
2. **Cerrar el modelo de autorización SQL de mínimo privilegio**, compatible con RLS/FORCE RLS y sesión staff verificada, sin `BYPASSRLS` ni permisos públicos. Probar concesiones negativas y separación de lector/escritor en PostgreSQL 17 desechable. No conceder acceso a un rol operativo sin revisión.
3. **Atribución fiable de actor en auditoría**: diseñar un mecanismo en el que el usuario de navegador no pueda falsificar el actor; la transacción autorizada debe registrar el sujeto verificado sin depender de una variable SQL controlable por el cliente. Probar append-only y fallos de autorización.
4. **Concurrencia real de cierre/confirmación**: conectar `lockContext`, evidencia económica, idempotencia y persistencia de pedido en una sola transacción; demostrar rollback, cierre simultáneo y rechazo de permisos caducados. No simular pagos como si fueran reales.
5. Preparar integración Auth/HTTP **solo después** de cumplir las puertas de seguridad. Revisar compatibilidad con configuración de firma y rotación de claves sin modificar Supabase operativo.
6. Actualizar pruebas, arquitectura y este handoff al completar cada hito. Mantener PR Draft hasta que exista evidencia suficiente.

## 6. Método de trabajo y validación

- Trabajar en la rama existente y PR #2; no hacer merge. Usar commits pequeños y coherentes dentro de **bloques de implementación grandes**.
- Para cada bloque: leer contrato y código, implementar, añadir pruebas unitarias y smoke negativos, ejecutar/verificar `Sabora CI` y `Bootstrap Sabora lockfile` sobre **el SHA exacto**, analizar logs de fallos, corregir y repetir.
- Las migraciones SQL se aplican únicamente en contenedor PostgreSQL 17 desechable y aislado por el script `scripts/ci/postgres-migration-smoke.sh`. Verificar la invocación actual antes de modificarla. Nunca utilizar la instancia operativa como banco de pruebas.
- No declarar `SUCCESS` si la ejecución está `queued` o `in_progress`; no confundir CI verde de un SHA anterior con el HEAD.
- Mantener registro explícito de lo implementado, lo simulado/candidato y lo pendiente. Las operaciones de GitHub y Actions están autorizadas **solo en este repositorio**.
- Si es necesario esperar, usar espera corta por shell y continuar comprobando CI; no solicitar intervención humana salvo decisiones de negocio o autorizaciones realmente necesarias.

## 7. Restricciones de infraestructura

- Proyecto Supabase asociado a Sabora: `https://byhvmumqivmunkmomhup.supabase.co`. **Solo referencia de contexto; no modificar el proyecto operativo sin permiso.**
- El VPS comparte infraestructura con Fleetia y posiblemente otros proyectos. El despliegue, reinicio o eliminación de Sabora **no debe detener, modificar ni depender de contenedores ajenos**. Ninguna operación de VPS está autorizada en este handoff.
- Prohibido utilizar datos reales de clientes o credenciales operativas en tests; utilizar fixtures y claves criptográficas efímeras.

## 8. Estado de entrega de este documento

Este archivo es el **punto de partida de la sesión 4**. Su creación genera un commit posterior al SHA de corte `d6e8a325`. La nueva sesión debe comprobar ese commit, su CI y cualquier cambio adicional antes de continuar. El estado del PR sigue siendo Draft salvo verificación posterior.
