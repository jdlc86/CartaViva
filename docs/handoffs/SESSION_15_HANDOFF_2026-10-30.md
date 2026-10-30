# Sabora / CartaViva — Handoff exhaustivo para sesión 15 (2026-10-30)

> **Naturaleza:** documento de continuidad, NO normativa, NO autorización de despliegue. **Lectura obligatoria al iniciar**. Revalidar en GitHub todos los SHA, ramas, pruebas y estados porque puede haber trabajo concurrente y la consulta actual muestra una divergencia relevante.

## 0. Inicio rápido y alerta de consistencia Git
- Repositorio único autorizado: `jdlc86/CartaViva`.
- PR de integración: [#40 Draft](https://github.com/jdlc86/CartaViva/pull/40); rama `integration/sabora-activation-readiness-20261028`; base del PR `feat/sabora-staff-directory-rls-20261028`. No merge.
- **HEAD que devuelve la API GitHub al crear este handoff:** `07043088d49761eae4f32480ff3d0b1cbb0181f6` (commit «test(h6): verify round-id scope independently of order-id replay»). El PR #40 coincide con ese HEAD.
- **Discrepancia crítica:** el handoff de sesión 14 declara HEAD `22cd2d5c3cd9cc27518041a63175d3ceaa5e1cf2` y el plan de cinco bloques enumera commits aún posteriores, hasta `a4ae3bbc863da6ed2b69a6cba77efd4015ff65de`, que no coinciden con el HEAD devuelto. **No suponer que son ancestros ni que sus cambios están presentes.** Consultar refs, compare, commits y archivos de rama; si son commits de otro historial o el proveedor ofrece una instantánea desactualizada, resolver primero sin reset, force push ni sobrescritura.
- El contenido del plan y del cierre técnico se ha leído de esta misma referencia GitHub, pero la presencia de notas sobre commits no prueba su alcanzabilidad. Separar **afirmaciones documentales** de **evidencia reproducida en HEAD**.

## 1. Jerarquía de autoridad y documento maestro
**Fuente de verdad normativa:** [`docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md). Leerlo íntegramente antes de diseñar cambios. Complementos normativos:
- [`docs/REQUISITOS_FUNCIONALES.md`](../REQUISITOS_FUNCIONALES.md), especificación inicial; verificar precedencia y versiones.
- `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md` y contratos de identidad, QR, roles, eventos, pagos, PWA y autorizaciones de `docs/architecture/`.
- `docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md` para Estudio de Imágenes; `docs/DESIGN_SYSTEM_CONTRACT.md` y documentación visual aprobada.
**Plan maestro de ejecución del piloto (no sustituye normativa):** [`docs/assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md`](../assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md). Encargo específico Bloque 1: `docs/assignments/SABORA_CODEX_BLOCK_01_FULL_STACK_2026-10-29.md`.
Documentos de evidencia y contexto: [cierre Bloque 1](../reviews/SABORA_BLOCK_01_FULL_STACK_CLOSURE_2026-10-30.md), [inventario de piloto](../reviews/SABORA_FIRST_PILOT_READINESS_INVENTORY_2026-10-29.md), [handoff sesión 14](SESSION_14_HANDOFF_2026-10-30.md), [runbook de activación](../runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md), PR #40 y CI.
**Regla:** si hay contradicción entre notas y contratos, prevalece la normativa vigente. No inventar reglas ni convertir propuestas en aprobaciones.

## 2. Producto y restricciones funcionales
Sabora es una instalación para **un restaurante**, con dos PWA separadas: cliente y gestión (administración, sala y cocina con permisos efectivos). Identidad cliente: alias editable, ID visible único generado, UUID interno, empresa opcional; QR identifica mesa, no persona; sesión segura y revocable. QR V1 `/qr/v1/<restaurantCode>/<tableId>#<token>`, revocable/regenerable; mesas EN_PREPARACION, LISTA y BLOQUEADA, con comprobación backend al escanear y confirmar. Catálogo con categorías, precios EUR incluso 0,00 €, alérgenos estructurados/verificados, disponibilidad y carta. Cesta y cotización; confirmación durable e idempotente; snapshot de precios; agrupación temporal configurable (escenario probado 300 s), tardíos fuera de ventana; cocina `confirmed→preparing→ready`, sala `picked_up`; cancelación y reclamación exclusivas según contrato. Eventos SSE durables, cursor/replay/deduplicación/reconexión sin polling periódico de negocio. Separación de roles, RLS, auditoría y revocación. Pagos H6: Stripe «Pagar ahora» con autorización/captura y webhook según contrato, frente a «Pagar al terminar» presencial; no asumir pagos reales por tests con dobles.
UX premium, responsive, accesible, sin controles de gestión en cliente; no sustituir integración real por mocks presentados como producción.

## 3. Prohibiciones absolutas
- **No merge, no despliegue, no activación productiva, no migraciones en Supabase operativo, no acceso ni modificaciones al VPS, Fleetia ni otros servicios compartidos**, salvo autorización expresa posterior.
- No tocar contenedores, redes, volúmenes, puertos, procesos, bases ni secretos de otros proyectos. No `docker system prune`, `compose down` global, reinicios globales ni recursos facturables sin autorización.
- PG17 desechable y loopback para pruebas; secretos y JWT de prueba efímeros; no credenciales reales en commits/logs.
- API `apps/api/src/server.mjs` permanece **health-only** en el candidato descrito; las factorías funcionales son opt-in. No modificar este default para «hacer pasar» un piloto.
- No afirmar GO por CI verde, ni usar `Fastify.inject` o mocks de navegador como prueba de extremo a extremo real.
- PR Draft y trabajo en rama de desarrollo verificada. Reconsultar SHA antes de escribir.

## 4. Historia y estado técnico verificado documentalmente
PRs anteriores: #10 identidad y revocación; #11 PG17; #13 seguridad P2; #15 PWA premium H1-H3; #30 H3-H5; #32 H6; #34 semántica sala; #36 alta camarero; #38 directorio y RLS; #40 integración y preparación de activación. Comprobar ascendencia real, no dar por fusionados.
PR #40 declara ocho hilos abiertos en PR #13 (1 P1 y 7 P2, algunos outdated), aceptación funcional integrada y revisión independiente de seguridad pendientes. Confirmar estado actual antes de resolver.
El [expediente de cierre Bloque 1](../reviews/SABORA_BLOCK_01_FULL_STACK_CLOSURE_2026-10-30.md) acredita **PASS técnico aislado**, SHA `e3d17db469cfcec76280be49268dd0c3d0f38bab`: factoría Fastify H3/H4 opt-in, seis principals PG17 restringidos, cookie HttpOnly cliente, JWT/JWKS RS256 personal, QR/visita/catálogo/quote/pedido, idempotencia/concurrencia/rollback, agrupación, cocina/sala sobre mismo pedido, dos PWA Chromium, axe y responsive. CI: 41003487653, 41003487513, 41003487585, 41003487619, 4/4 SUCCESS; Node 1082/1082, gestión 55/55, cliente Chromium 32/32 según expediente. **Esto no es GO de producción**. Nota de plan posterior que decía «Bloque 1 abierto» se considera cronológicamente anterior o de alcance diferente; reconciliar con HEAD.
Avance posterior H4 documentado: SHA `e52ff5a339e094b9bd19673ac151880f68cccc31`, gateway autenticado de gestión sobre rutas HTTP reales y PG17; CI 41006419381/41006419329/41006419461/41006419340 SUCCESS. El preHandler del test usa identidad inyectada; no sustituye validación JWT real de otras suites.

## 5. Bloque 2 — progreso y brecha precisa
**NO DECLARAR BLOQUE 2 CERRADO.** El plan registra:
1. SSE gestión: límites de búfer/tramas 65.536 caracteres, CRLF fragmentado, lotes grandes, reconexión y deduplicación; base SHA `2e6ae1c3c0d0c0a5edc345a3a06f55d0de82c1e0`, CI 4/4.
2. Recuperación ante respuesta HTTP perdida: se detectó brecha del escenario 29 del contrato (consultar resultado por clave idempotente, **no reenviar automáticamente**). Se documenta implementación `lookupConfirmation`, ruta `POST /api/v1/customer/orders/lookup`, sesión HttpOnly, `Cache-Control: no-store`, estado incierto visible y consulta explícita; SHA `0f50b1a3aa8815b49ac888c18d35b0459695c4a1`, 4/4 CI. Batería adversa cliente ajeno, anónimo, origen, campos y clave inválidos: SHA `39a8fb9eef3570cad397a257050c2241c9895f28`, 4/4 CI.
3. Auditoría posterior detectó que pruebas H3/H4, H6 y navegadores eran **separadas**, sin misma API/PG17/identidad para ambos navegadores; no atribuir cumplimiento E2E a gates que solo comprueban existencia de marcadores.
4. Un subrecorrido integrado posterior está documentado en SHA `b6ba968755efe0b25c12dcdd107d66a10f3c4a75`: API opt-in, seis logins PG17, cliente y gestión Chromium, misma línea de pedido, cocina/sala, SQL y axe, 4/4 CI 41023344182/41023344135/41023344217/41023344136. **PASS subrecorrido H3/H4, NO PASS Bloque 2**.
5. SHA `a4ae3bbc863da6ed2b69a6cba77efd4015ff65de` añade aserción SQL `sabora.orders.grouping='grouped'` del mismo pedido de Chromium, 4/4 CI 41023903344/41023903455/41023903382/41023903359. **No demuestra vencimiento de ventana ni despacho automático H6**.
**IMPORTANTE:** estas referencias aparecen en el plan consultado, pero la rama HEAD informada es `07043088...`; verificar accesibilidad/ascendencia antes de usarlas como base efectiva.

### Pendientes de aceptación integral Bloque 2
- En **una sola ejecución** PG17 desechable + API operativa opt-in + PWA cliente y gestión reales en Chromium, con autenticación criptográfica de personal y misma mesa/visita/pedido: QR→catálogo→quote→confirmación→agrupación→vencimiento→despacho automático H6→cocina→sala→notificaciones.
- Segundo pedido dentro/fuera de ventana; tardío no se incorpora retroactivamente; timestamps controlados sin sleeps frágiles; verificar SQL, outbox y entregas.
- SSE durable y autorizado, cursor, replay, reconexión, deduplicación, revocación en caliente, fallo de red, sin polling de negocio.
- Recogida exclusiva, cancelación y estados autorizados; dos sesiones concurrentes, idempotencia y rechazo de suplantación.
- Offline y reconexión: cesta no confirmada, revalidación de precio, stock, QR, sesión, mesa y consentimiento; respuesta incierta resuelta por lookup sin reenvío automático.
- H6 pagos: recuperación de estado incierto sin segundo cargo, modalidades, ventana de agrupación y captura/despacho; usar fake/test seguro, sin Stripe real.
- Matriz trazable criterio normativo→archivo→test ejecutado→SHA→CI→resultado y capturas/axe de ambas PWA. No ocultar faltantes bajo PASS de tests separados.

## 6. Siguiente bloque recomendado y orden operativo
**Primero** resolver la divergencia Git/HEAD y reconstruir el inventario de código real de la rama: `git log --graph --all`, `git merge-base`, `git branch -a --contains <sha>`, `git show`, o herramientas GitHub equivalentes; inspeccionar PR #40, commits, workflows y último plan. Si los SHA citados no están en la rama, localizar su rama real y **no** hacer cherry-pick/merge a ciegas. Registrar explicación y elegir una base no destructiva.
**Segundo** leer íntegros contrato consolidado y plan de cinco bloques, construir matriz diferencial con tests y código realmente presentes. Priorizar completar **Bloque 2 como vertical integral** en lugar de microparches o repetir Bloque 1.
**Tercero** implementar harness de aceptación conjunta con temporización/dispatch H6, outbox SSE y casos adversos sobre misma orden. Mantener opt-in, PG17 desechable, JWT/JWKS reales y dos Chromium. Si una parte es demasiado amplia, cerrar subvertical completa con criterios explícitos sin declarar bloque general PASS.
**Cuarto** correr Node/gestión/cliente/PG17/builds/CI; corregir fallos y repetir. Esperar por shell o consultas de estado de Actions sin intervención del usuario para operaciones autorizadas; guardar runs y SHAs exactos.
**Quinto** actualizar plan, expediente de cierre específico Bloque 2 y PR Draft con matriz y NO-GO remanentes. No cambiar normativa salvo decisión aprobada.
**Después** abordar bloques 3-5 del plan: Estudio de Imágenes Google Gemini bajo contrato, aislamiento/seguridad/recuperación de infraestructura y preparación del piloto; sin proveedor facturable, despliegue ni secretos reales. No adelantar bloques por mera conveniencia.

## 7. Ficheros de código y pruebas a inspeccionar
- `apps/api/src/restaurant-flow-candidate-app.mjs`, `customer-production-app.mjs`, `customer-production-composition.mjs`, `server.mjs`, `api-runtime-config.mjs`, rutas de confirmación/lookup, `h6-*.mjs`.
- `apps/client/candidate.html`, `apps/client/src/candidate-main.tsx`, `apps/client/src/components/CheckoutPanel.tsx`, `apps/client/e2e/client-premium.spec.ts`.
- `apps/management/src/main.tsx`, `apps/management/src/order-operations-authenticated-gateway.js`, `apps/management/src/order-operations-gateway.js`, suscripción SSE y vistas cocina/sala.
- `scripts/ci/customer-production-postgres17.test.mjs`, `scripts/ci/h6-postgres17.test.mjs`, `scripts/ci/management-authenticated-browser-smoke.mjs`, `scripts/ci/functional-validation-contract.mjs`, migraciones PG17 y workflows `.github/workflows/`.
Estos son puntos de inspección, **no garantía de que estén todos presentes en el HEAD actual**.

## 8. Otros riesgos y puertas
- PR #13: ocho hilos abiertos descritos en PR #40; revisar resolución material, no cerrar solo por CI.
- API por defecto health-only; secretos, aislamiento VPS, Supabase, backup/restore, TLS/dominio, observabilidad, límites de coste y rollback son gates separados de producción.
- Según propietario no hay empleados reales; reconciliación histórica de correos descartada para piloto, pero inventariar cualquier dato ficticio antes de purga; ninguna purga autorizada.
- Gemini: contrato `SABORA_AI_IMAGE_STUDIO_GOOGLE.md` exige original inmutable, derivadas privadas, revisión/aprobación/publicación humana, cuotas y coste; vista existente no acredita backend conectado. No activar API facturable.
- Sin GO ni fecha de producción inferida. Aislamiento estricto de Fleetia y terceros.

## 9. Definición de terminado para la siguiente sesión
Entregar: SHA de partida y final con ascendencia confirmada; código del bloque completo; lista de archivos; pruebas exactas con resultados; 4 workflows y URLs verificadas del SHA final; evidencias PG17/Chromium/axe; matriz normativa; problemas corregidos; faltantes/no-go; documento de continuidad actualizado y comentario en PR #40. Si no se pudo verificar una evidencia, escribir **NO VERIFICADO**, no PASS.

## 10. Prompt corto sesión 15
> Continúa autónomamente Sabora/CartaViva desde `docs/handoffs/SESSION_15_HANDOFF_2026-10-30.md` en `jdlc86/CartaViva`, PR Draft #40. Lee primero el contrato maestro `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` y el plan `docs/assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md`. **Resuelve antes la divergencia entre HEAD GitHub 07043088 y los SHA posteriores documentados**; no pierdas trabajo concurrente. Prioriza cerrar el Bloque 2 mediante una vertical completa PG17 aislado + API opt-in + ambas PWA Chromium + H6 despacho/SSE y casos adversos. Implementa, prueba, corrige y espera CI por shell sin pedirme intervención; documenta SHA y evidencias en GitHub. Sin merge, despliegue, Supabase operativo, VPS ni Fleetia; normativa y diseño aprobados prevalecen.
