# Sabora / CartaViva — Encargo integral para Codex: Bloque 2, primera activación operativa segura (S38, 2026-11-12)

> **ENCARGO DE DESARROLLO, NO DOCUMENTO NORMATIVO NI AUTORIZACIÓN DE DESPLIEGUE.** La fuente de verdad son los contratos aprobados del repositorio `jdlc86/CartaViva`, no el presente encargo ni los handoffs. **Objetivo: entregar un hito integrado ejecutable y probado en laboratorio** que acerque el restaurante único Sabora a la primera activación, **sin tocar Supabase operativo, VPS, Fleetia ni otros proyectos**, y sin declarar «producción lista» prematuramente.

## 0. Instrucción inicial obligatoria: tu repositorio local está DESACTUALIZADO

**Antes de modificar nada**, no tomes el contenido de tu checkout local, tu memoria ni un SHA histórico como verdad. Conecta con GitHub y reconcilia:

1. Verifica que el repositorio remoto autorizado es **exclusivamente `jdlc86/CartaViva`**. Ejecuta e inspecciona `pwd`, `git remote -v`, `git status --short --branch`, `git branch -avv`, `git log -5 --oneline --decorate`. Inventaría cambios sin commit, ramas locales o worktrees con trabajo previo. **Nunca** ejecutes `git reset --hard`, `git clean -fd`, `push --force` ni descartes un cambio local para sincronizar.
2. Ejecuta `git fetch --prune origin`. Compara `origin/main` y `origin/feat/sabora-cv005-pg17-provider-compat-20261112` contra las ramas locales, y consulta el estado del [PR #57](https://github.com/jdlc86/CartaViva/pull/57) y los checks de su **HEAD real**. Si no hay cambios locales y `main` es fast-forward, puedes usar `git switch main` y `git pull --ff-only origin main`. Si está sucio o diverge, **preserva** el trabajo local y utiliza un **worktree nuevo** desde `origin/main` para este encargo, o reconcilia sin sobrescribir. Nada de merges implícitos del #57.
3. Crea una rama **única** de implementación basada en la base remota verificada, por ejemplo `feat/sabora-s38-operational-activation-20261112`, **solo si el nombre está libre**; si ya existe trabajo válido, reanúdalo tras auditarlo. No abras PR hasta tener una candidatura funcional integral; evita PR apilados o micro-PR.
4. **Lee antes de programar:** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md), [análisis de activación S38](../reviews/SABORA_S38_PARALLEL_ACTIVATION_READINESS_ANALYSIS_2026-11-12.md) y las normas del §1. Verifica la existencia de cada archivo/función/contrato en el HEAD remoto. No repitas trabajos ya hechos; documenta divergencias concretas.

**Fotografía de arranque, NO SHA fijo para usar en el futuro:** el 12-11-2026, `main` avanzó con documentación S38; PR #57 seguía **Draft, no fusionado**, HEAD `9c943e5b6ae2fa39e5abd18fc604688aa5689e5d`, 59 migraciones SQL modificadas de una cadena de 99. En ese mismo SHA: [compatibilidad PG17 #43217686791](https://github.com/jdlc86/CartaViva/actions/runs/43217686791) **99/99 + 12/12 PASS**, [Sabora CI #43217687786](https://github.com/jdlc86/CartaViva/actions/runs/43217687786) **SUCCESS**, [Bootstrap #43217687760](https://github.com/jdlc86/CartaViva/actions/runs/43217687760) **SUCCESS**, [cobertura UI #43217686802](https://github.com/jdlc86/CartaViva/actions/runs/43217686802) **SUCCESS**; aceptación visual humana **no** acreditada. Comprueba si hay SHA posteriores y registra sus checks; **no reutilices 4/4 de ese SHA para código nuevo**.

## 1. Jerarquía vinculante y límites

- [Contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [sistema de diseño](../DESIGN_SYSTEM_CONTRACT.md), [estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [pantalla de inicio cliente](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md) y contratos de flujos aprobados.
- [Metodología obligatoria de validación/observabilidad/recuperación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [hoja de ruta técnica](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [alcance de proyecto](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [autorizaciones](../SABORA_AUTHORIZATION_GATE.md), [titularidad administrativa](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [seguridad SQL/HMAC](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md), [inventario de accesos SQL](../security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md).
- [Contrato candidato de configuración y secretos](../security/SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md), [runbook P2](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md), [runbook P3](../runbooks/SABORA_P3_RECOVERY_CONTINUITY_RUNBOOK_2026-10-29.md), [runbook de observabilidad](../runbooks/SABORA_OBSERVABILITY_INCIDENT_RESPONSE_V1.md), [puerta de activación S36](../reviews/SABORA_S36_CV005_FIRST_ACTIVATION_READINESS_GATES_2026-11-12.md).
- Opción A de autoridad DBA: existe una [decisión de arquitectura candidata](https://github.com/jdlc86/CartaViva/blob/feat/sabora-cv005-pg17-provider-compat-20261112/docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md) en #57; **no** está integrada como norma de `main`, ni tiene revisión independiente. No modificar ni debilitar las 99 migraciones para el Bloque 2 ni presumir esa excepción ya operativa.

**Protección absoluta:** un restaurante Sabora, dos PWA independientes (cliente y gestión), sin multitenancy. No inspeccionar, modificar, detener, reiniciar ni depender de contenedores/redes/volúmenes/credenciales/servicios de Fleetia o terceros. Ningún comando global Docker (`prune`, `compose down` sin alcance, `docker restart` general), Docker socket, redes externas compartidas ni reinicio host. **No crear infraestructura real, gasto, secretos en GitHub/Supabase, SQL DDL/DML real, backup real, despliegue, merge a main o cambios del VPS sin autorización específica.** `No hay usuarios` no elimina estas puertas.

## 2. Hito que debes entregar: Bloque 2 de activación, integral y fail-closed

No hacer una colección de correcciones cosméticas: **entregar un candidato coherente de código + pruebas integradoras + runbooks de una primera activación Sabora-only**. Si un proveedor/decisión de seguridad impide el camino completo, cerrar todo el alcance que sí es demostrable y marcar con precisión el bloqueo; nunca simular aceptación externa.

### B2.1 — Mapa determinista de identidades SQL, configuración y secretos

**Reutilizar** `apps/api/src/m2-runtime-identity-inventory.mjs` y contratos de las composiciones actuales. Reconciliar desde código y migraciones cada `pool/expectedLogin`, roles NOLOGIN y `EXECUTE` exactos: **15 capacidades H3–H6, 17 con M3 mínimo, hasta 22 con gobierno/M5/llamar camarero, más 2 pools de notificaciones**; esto es inventario de slots, **no prueba** de que existan 17–22 LOGIN físicos ni permiso para inventarlos. Definir mapeo comprobable de capacidades, origen, dueño, uso, custodia, TLS, rotación y revocación. Seleccionar únicamente formas de configuración compatibles con normativa aprobada; si un nombre de secreto/rol o proveedor de vault aún no está decidido, documentar **decisión pendiente** en lugar de fabricar contrato.

Implementar validador/inyección operativa **sin valores sensibles en repositorio, PWA, bundles, imagen, logs ni Actions**: separar por proceso/rol, detectar duplicidad y privilegio excesivo, bloquear placeholders y `service_role`/`postgres` como runtime, emitir solo códigos de error cerrados, permitir rotación sin pasar credenciales al navegador. Las **tres contraseñas privadas del propietario** no están provisionadas y no bastan para afirmar operativa la composición completa.

### B2.2 — TLS, conectividad y red aislada de Sabora

Construir y probar un contrato de conexiones de cliente PG17 y proveedores exigidos por los flujos **que se activen**, con verificación de CA/cadena y hostname, TLS estricto sin `rejectUnauthorized:false`, rechazo de certificados erróneos, de origen no autorizado y de degradación silenciosa; configuración de `pool`/timeouts/limpieza acotados. No asumir `sslmode=require` como garantía de identidad del servidor; resolver directo IPv6 vs pooler sesión IPv4 **solo tras comprobar la opción real del proveedor**, sin inventar host o exponer secretos.

Preparar una composición/red de **egress Sabora-only** con DNS/TLS/proxy y destino justificado, conservando ingresos HTTP por loopback/proxy autorizado, procesos no-root, filesystem read-only, cap_drop, límites de CPU/RAM/PIDs/logs, sin host network, Docker socket, puertos públicos extras, redes externas ni otros proyectos. `deploy/compose.sabora.yml` hoy tiene `sabora_private: internal:true`, lo que no acredita salida a Supabase/JWKS/alertas. **No sustituir por bridge abierto sin restricciones**. Los gates existentes (`scripts/ci/deployment-isolation-contract.mjs` y `production-config-secrets-gate.mjs`) bloquean cambios de red y modos activos por diseño: extenderlos **con pruebas negativas equivalentes o superiores**, no deshabilitarlos para lograr verde. Los ensayos deben ser solamente en entorno descartable; nada del VPS.

### B2.3 — Bootstrap **operativo** de API con servicios realmente montados

**Problema principal:** `apps/api/src/server.mjs` monta hoy solo `/health` y `/ready`, y `apps/api/src/api-runtime-config.mjs` solo admite `SABORA_API_MODE=health-only`, rechazando secretos. Existe una composición **opt-in** H3–H6/M3 reutilizable en `m2-restaurant-candidate.mjs` y `m3-restaurant-candidate.mjs`; `scripts/ci/disposable-h6-runtime-bootstrap.mjs` ya la ejercita en PG17 descartable con 17 identidades. **No reescribir funcionalidad ya implementada ni cambiar un booleano para abrir rutas.**

Diseñar y entregar **un entrypoint operativo separado, explícito y cerrado por defecto**, manteniendo el proceso actual `health-only` como fallback seguro. El arranque activo debe: validar contrato de configuración y orígenes HTTPS; construir e inyectar solo conexiones y servicios autorizados; comprobar identities SQL/ACL/roles y el vínculo actor/JWT/HMAC/JWKS; garantizar que listeners H6/outbox/SSE y rutas operativas/catálogo/M3 se montan **solo tras preflight positivo**; manejar init parcial, SIGTERM, cierre ordenado de pools/listeners/eventos y rollback de inicialización. `/health` indica **vida** del proceso; `/ready` es 503 ante SQL, identidad, emisor, eventos o dependencia requerida no disponible y 200 solo si el restaurante activo está de verdad preparado. La observabilidad no debe emitir SQL ni secretos.

No activar Stripe real, pagos sandbox externos, webhook público, Gemini, reservas u otras variantes no certificadas automáticamente; el piloto de funciones ha de seguir los contratos aprobados y distinguir funciones opt-in no habilitadas. Las PWA nunca reciben privilegios SQL ni claves de servidor. Diseñar un endpoint/circuito de arranque verificable en CI, **no** desplegarlo.

### B2.4 — Copia cifrada, restauración y reversión Sabora-only

**No duplicar** `scripts/ci/postgres-recovery-smoke.sh` ni los runbooks P2/P3 sin necesidad. Partir de su cobertura actual: `pg_dump` custom, `pg_restore` en otro clúster descartable, archivo truncado rechazado, timeout de bloqueo, roles/ACL/RLS/owner/funciones y dataset verificable.

Implementar/ensayar **procedimiento integral** de copia lógica de Sabora para el plan Supabase Free (no presuponer backup diario ni PITR): inventario de esquema/roles/extensiones/ledger, manifest/checksum, cifrado y custodia fuera de Git/CI/VPS compartido, retención, restauración en destino PG17 aislado, reinyectar credenciales **por canal separado** y comprobar integridad de datos y privilegios sin divulgar materiales. Si no existe fuente de identidad/clave/canal aprobados, demostrar solo la parte fixture y marcar pendiente. Las referencias Storage deben verificarse contra uso real: un dump SQL no incluye bytes de objetos. **No ejecutar `pg_dump` contra Supabase operativo** hasta autorización DBA y canal cifrado expresos; ni anunciar RTO/RPO reales a partir de métricas CI.

### B2.5 — Observabilidad, alertas y flujos integrados

Reutilizar `apps/api/src/operational-observability.mjs` y el runbook existente. Extender de `health-only` a ruta realmente activa H3–H6/M3: correlación segura generada por servidor a través de API, actor validado, eventos, notificador, operaciones/caja y dos PWA. Lista cerrada de campos, sin IP, cabeceras, URL cruda, JWT, QR, cookies, datos personales/económicos sensibles, cuerpos, SQL/errores driver ni credenciales. Alertas basadas en eventos, sin polling prohibido; pruebas de disparo, no recepción externa supuesta, y fallos del sink que no alteren transacciones. Un test de salida de log no significa alerta externa operacional.

Probar flujo integral **sobre datos ficticios en PG17 desechable**: QR/identidad/carta publicada → visita/pedido → cocina/sala/avisos → cuenta y cambio de mesa según contratos aprobados; gestión M3, cambio de escritor ADMIN, denegaciones, expiraciones, concurrencia, reintento, SSE/outbox, SQL least privilege, readiness, caída y parada/arranque limpio, con **dos PWA separadas y Chromium/Playwright**. No modificar interfaz sin confrontar el diseño aprobado; adjuntar capturas reales de navegador solo para evidencia, pendientes de aceptación visual humana.

## 3. Coordinación con el PR #57 — dos carriles, cero duplicidad

**Carril A (CV-005):** [PR #57](https://github.com/jdlc86/CartaViva/pull/57) ya pasó la cadena de 99 migraciones en un fixture no-superusuario con 12/12 contratos, además de las suites generales de su SHA. **Permanecen pendientes** revisión independiente DBA/seguridad de las 59 SQL modificadas, compatibilidad específica con supautils/Supabase 17.11, autoridad DBA de opción A y aprobaciones diferenciadas. No volver a arreglar el error antiguo de ownership si el HEAD real ya lo ha resuelto. No modificar ni fusionar #57 sin encargo/permiso correspondiente; si otro agente está trabajando allí, no sobrescribirlo.

**Carril B (este encargo):** desarrollar bootstrap/red/secretos/backup/observabilidad desde `origin/main` actualizado, sin absorber anticipadamente los 59 SQL del #57. Para probar interacción con CV-005, usar **únicamente un fixture de CI descartable** a un SHA explícito y documentar exactamente cómo se obtuvo, sin tocar `main` ni la base real. Dependencias irresueltas al final se registran como **bloqueos**, no se saltan. Si tras inspección el código ya implementa alguna parte, demostrarlo con prueba integradora en lugar de duplicar módulos.

## 4. Batería de validación, criterios de aceptación y salida

**Implementación:** módulos exactos + rutas y roles admitidos + seguridad de configuración + fail-closed + Compose/red Sabora-only + runbooks de backup cifrado + plan de activación, sin secretos ni proveedores externos activos. Conservar políticas aprobadas, PWA independientes y código existente.

**Pruebas obligatorias del HEAD final:**
- Construir e instalar con lockfile exacto; ejecutar gates estáticos y funcionales existentes, PG17 real (99 migraciones de la fuente SHA de prueba **cuando corresponda**), ledger/checksums, actor JWT/HMAC, FORCE RLS, identities/ACL/SECURITY DEFINER y negativas de elevación.
- Recorrido E2E PostgreSQL17↔API autenticada↔cliente/gestión en Chromium; escenarios de éxito, negativa, caída y recuperación, idempotencia/concurrencia, eventos y estado consistente; no hacer de una batería de mocks la prueba principal.
- Bootstrap activo en laboratorio: sin secretos reales, rutas solo con preflight, `/ready` positivo/503 ante fallo y `/health` separado; negative tests de secretos indebidos, TLS no verificable, destino erróneo, privilegio de DBA en runtime, acceso de PWA a credencial y apertura de rutas sin dependencias.
- Aislamiento dinámico: red/egress propios de Sabora, ausencia de acceso cruzado, sin puertos externos, sin comandos que afecten otros proyectos. Recuperación: dump **de fixture** cifrado, checksum, restauración PG17 independiente, fallo corrupto/secretos y permisos. Verificar cierre de listeners/pools sin fuga al fallar.
- CI completa sobre **el SHA final del candidato**; reportar cada Action con URL y conclusión, no reciclar PASS de antecesores. Capturas y pruebas de UI no equivalen a aprobación estética humana.
- Exigir **revisión independiente** (DBA/seguridad) de ownership/SECRET/TLS/egress/bootstrap y preservar sus observaciones. Codex no puede auto-certificar la revisión independiente de sus propios cambios.

**Prohibido declarar GO** si: solo está en verde el SQL de #57, `/ready` operativo no representa dependencias reales, existen secretos/roles faltantes, SSL permisivo, egress sin aislamiento, backup sin restauración demostrada o no hay revisión independiente. **No** introducir recursos nuevos de pago ni gestionar secretos del usuario sin consentimiento y preflight.

## 5. Entrega exigida a Codex

1. **Un solo candidato de implementación** en rama revisable, con commits con alcance coherente y **preferentemente un único PR Draft** al culminar el hito; no abrir PR por componente. No hacer merge ni despliegue.
2. Informe de delta inicial: GitHub `origin/main`/PR57/árbol local divergente, material local preservado, partes existentes y piezas realmente implementadas.
3. Documento técnico del hito dentro del repo, enlazando normativa exacta (no inventada), matriz de componentes↔código↔prueba↔resultado, riesgos y límites; actualizar [continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md) y [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) **solo al cerrar hitos importantes**. No convertir continuidad en norma.
4. Evidencia CI del mismo SHA, checklist de cada negativa y del circuito E2E. Diferenciar **IMPLEMENTADO / PRUEBAS EJECUTADAS / VALIDADO EN PROVEEDOR / ACEPTACIÓN HUMANA**.
5. Runbook de activación **Sabora-only** con orden verificable de preflight → backup → secretos/roles → TLS/egress → bootstrap → smoke → rollback y puntos STOP; todas las etapas reales pendientes deben figurar sin ejecución ni aprobación presunta.
6. **Resumen final operativo:** qué rutas y capacidades quedarían montadas, qué falta para probar realmente en Supabase/VPS, bloqueos que necesitan decisión/credenciales/autorización, URL del PR Draft, enlaces de Actions y confirmación de **no haber tocado Fleetia ni otros recursos**.

## 6. Autonomía y regla de parada

Puedes crear la rama, programar, documentar, hacer commits y ejecutar pruebas/Actions **en `jdlc86/CartaViva` únicamente**; corregir fallos del mismo hito y relanzar la batería sin pedir confirmación por cada pequeña corrección. Pero **detente antes de** fusionar, migrar Supabase operativo, crear/alterar roles reales, obtener/instalar contraseñas, ejecutar backup de proveedor, desplegar en VPS o compartir servicios, porque esas operaciones requieren permiso propio y verificación material. Si aparece conflicto normativo, documenta y eleva la decisión: **no reescribir la norma para hacer pasar el código**.

**Resultado buscado:** un **Bloque 2 integrado y seguro, probado de extremo a extremo en laboratorio**, candidato a primera activación tras las autorizaciones y comprobaciones externas correspondientes; **no** una falsa activación de restaurante por poner `SABORA_API_MODE` distinto a `health-only`.

---

**Referencias rápidas:** [Continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md) · [Análisis técnico S38](../reviews/SABORA_S38_PARALLEL_ACTIVATION_READINESS_ANALYSIS_2026-11-12.md) · [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [PR #57](https://github.com/jdlc86/CartaViva/pull/57).
