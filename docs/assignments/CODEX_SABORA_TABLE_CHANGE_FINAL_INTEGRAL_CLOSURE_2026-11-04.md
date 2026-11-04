# ENCARGO A CODEX — Cierre integral de todas las consecuencias del cambio de mesa Sabora

**Fecha:** 2026-11-04  
**Único repositorio autorizado:** `jdlc86/CartaViva`  
**PR de integración:** [#43](https://github.com/jdlc86/CartaViva/pull/43), **Draft, sin merge**  
**Rama de integración observada:** `integration/sabora-h6-b2-delivery-board-contract-20261031`  
**SHA observado al emitir este encargo:** `60da4afe91c4724f6984c0663c257b63e79c5397` (**referencia histórica, no SHA fijo para desarrollar**)  
**Naturaleza:** documento de encargo técnico, **no normativa**, **no aprobación de diseños nuevos**, **no autorización de despliegue**.  
**Unidad de avance:** hitos funcionales completos, con validación end-to-end, no micropruebas sucesivas.

## 0. Objetivo global, método y criterio de éxito

**CODEx, cierra integralmente todas las consecuencias del cambio de mesa con consumición activa en el candidato Sabora.** Debes implementar, integrar, comprobar y documentar el alcance funcional, económico, de despacho y cocina, interfaz cliente y gestión, notificaciones, seguridad y recuperación, conforme a los contratos y diseños APROBADOS.

No se trata de empezar de cero ni de entregar un análisis o un conjunto de pruebas pequeñas. Parte de lo ya validado; implementa lo que falta en **cuatro hitos grandes de extremo a extremo**. Cada hito termina solo cuando funciona el flujo real, pasan las pruebas integradoras, quedan los commits subidos y se documenta su evidencia. Diagnósticos focalizados y tests unitarios son admisibles solo si protegen un requisito crítico o explican un fallo concreto; nunca sustituyen la aceptación.

**Entrega final:** candidatura funcional completa y demostrable para **F01–F28 y R01–R10** de la matriz, con trazabilidad por cada ID, código, CI, Chromium, PostgreSQL 17 desechable, conformidad visual y un dictamen GO/NO-GO del **candidato**. GO técnico no autoriza fusión ni producción. Si una norma exige una decisión del propietario o Stripe sandbox no está disponible, completa el resto, documenta precisamente el bloqueo y no inventes una validación.

**Prohibido:** merge, despliegue, restart, eliminación, migraciones en Supabase operativo, intervención sobre VPS/Fleetia u otros proyectos, ampliar permisos para sortear tests, inventar reglas funcionales o visuales.

## 1. ARRANQUE: tu repositorio local puede estar desfasado

1. Inspecciona `git remote -v`, `git status --short`, `git branch -vv`, HEAD y cualquier cambio local. **Nunca uses `reset --hard`, `clean -fd`, force push ni un rebase destructivo**; conserva el trabajo no publicado.
2. `git fetch origin --prune`; verifica por GitHub **el HEAD ACTUAL** y estado del PR #43, su rama, commits y GitHub Actions. **No supongas que el SHA de este documento sigue vigente.** Compara el árbol local con el remoto y lee **la versión remota reciente** de cada contrato.
3. Si tu copia está atrasada, crea un `git worktree` o rama nueva basada en el HEAD remoto actual de la integración (por ejemplo `feat/sabora-table-change-final-closure-codex-20261104`); deja intactos los cambios locales previos. Trabaja exclusivamente en `jdlc86/CartaViva`.
4. Para evitar colisiones con sesiones concurrentes, publica **rama propia y PR Draft hacia la rama de integración del #43**, no directamente a `main`. Comprueba cambios remotos antes de cada push, integra sin pisar commits ajenos. **No hagas merge de PRs.**
5. Determina gestor de paquetes, scripts, reglas de migraciones y comandos de CI a partir de archivos versionados, no de instrucciones antiguas. Usa la infraestructura aislada de GitHub Actions / PG17 desechable. El remoto es la fuente de verdad del estado actual.

## 2. FUENTES DE VERDAD OBLIGATORIAS — LEER ANTES DE CODIFICAR

**Documentación normativa y decisiones aprobadas (prevalecen sobre este encargo y los handoffs):**
- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: «Cambio de mesa con consumición activa — decisión funcional 2026-10-30»; también «Mesa, QR, visita y cuentas», «Carta, cesta y comandas», «Coordinación de recogida en sala», «Cancelación y ajuste económico», «Pagos», «Stripe», «Política de pago de mesa», «Seguridad y conciliación», «Eventos y resiliencia».
- `docs/REQUISITOS_FUNCIONALES.md`: catálogo, stock, reservas, pedidos, cocina, sala, notificaciones y flujos aprobados.
- `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`, `docs/design/APPROVED_VISUAL_STYLE_AUDIT_V1.md`, `docs/design/NOTIFICATIONS_AND_MOTION_V1.md`, `docs/design/SABORA_VISUAL_REFERENCE_EVOLVING_2026-10-26.md`, `docs/design/screens/CLIENT_MENU_V1.md`, `docs/design/DESIGN_REQUIREMENTS_V1.md`: diseño. **Diferenciar APROBADO de PROPUESTO y PENDIENTE.** No convertir una referencia visual o demo en aprobación de una captura exacta.
- `docs/SABORA_AUTHORIZATION_GATE.md` y `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`: identidad, aislamiento, privilegios y **regla aprobada de hitos integrales**.

**Guía de ejecución, auditoría y evidencia (no reemplaza normativa):**
- `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`: hoja de ruta, **F01–F28, R01–R10 y §§7–33** más los apartados nuevos que se publiquen.
- `docs/assignments/SABORA_TABLE_CHANGE_B0_DEPENDENCY_INVENTORY_2026-10-30.md` y revisiones de arquitectura anteriores: inventario y contexto.
- `docs/handoffs/SESSION_22_HANDOFF_2026-11-04.md`: contexto reciente **no normativo**.

Ante contradicción: contrasta las decisiones específicas vigentes con rutas y líneas; no reinterpretes la normativa ni la modifiques para encajar una implementación. Si falta una decisión indispensable, delimita el bloqueo y sigue con el resto del alcance.

## 3. LO YA ACREDITADO: NO REHACER SIN NECESIDAD

Al crear el encargo, el HEAD `60da4afe91c4724f6984c0663c257b63e79c5397` del PR #43 mostraba **4/4 workflows SUCCESS**: [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/41758103486), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41758103482), [PWA cliente](https://github.com/jdlc86/CartaViva/actions/runs/41758103526), [PWA gestión](https://github.com/jdlc86/CartaViva/actions/runs/41758103528). Confirma el estado de los commits más recientes de nuevo al empezar.

La matriz contiene evidencia integrada de:
- QR escaneado libremente, primera vinculación al confirmar pedido, solicitud **sin destino** ni motivo, aprobación/rechazo por camarero con 90 s naturales y cooldown, respuesta tardía rechazada, mensajes y notificaciones; aprobación **no transfiere** nada.
- Concesión aprobada de **uso único y sin nueva caducidad**; solo nuevo pedido confirmado en mesa B con QR vigente transfiere **en una transacción** la misma cuenta y destinos operativos pendientes. No se reescriben pedidos históricos, se mezclan cuentas, se duplica deuda ni se reinicia agrupación.
- PG17 real desechable, autenticación y límites JWT/HMAC, dos PWAs Chromium, SSE durable/reconexión, revocaciones, concurrencia de decisiones y consumos, rollback e idempotencia.
- Agrupación de **300 s naturales** y dispatcher por deadline sin polling, reanudación tras pérdida real de conexión LISTEN y dos instancias en carrera. El componente servidor es candidato **opt-in, no activo en producción**.
- Cambio de mesa con pagos históricos y caja, cocina `confirmed→preparing→ready`, acuse firmado y tareas `ready/claimed`. **«Voy a recoger» NO significa «entregado».**
- **Matriz §33**: carrera **pedido-gana**, **efectivo-gana** y **cierre-gana** desde cuenta A→D; dos camareros con JWT distintos, cierre único con replay, caja y saldos inmutables, denegación de nuevo pedido tras cierre. SHA funcional `adf73fc6637c1838f1d66b64e03d6ff94b210e70`, [4/4](https://github.com/jdlc86/CartaViva/actions/runs/41756208953).

**Aún NO está completo**: F21/R06 (revisión correctiva por agotados/catálogo antes de despacho, corrección y carreras de deadline), Stripe sandbox real, experiencia de caja/cierre visualmente aceptada, coste cero y «partidas resueltas», resiliencia operativa de arranque/reinicio, auditoría final individual F01–F28/R01–R10, identidad y secretos de producción. **B3/B4 NO-GO.** Las pruebas con transporte Stripe simulado no equivalen a cargo sandbox.

## 4. CONTRATO FUNCIONAL QUE DEBE PRESERVARSE EN TODOS LOS HITOS

- El QR permite explorar mesas sin mover nada; primera confirmación vincula. Cliente con cuenta en A solicita **abandonar A**, sin declarar B como destino. El aviso del QR distinto ofrece **«Solicitar cambio de mesa» y «Cancelar»**; cancelar no cambia estado.
- Solicitud configurable de **90 s desde servidor**; rechazo no habilita reintento antes de vencer. Decisión tardía inválida. El cliente puede seguir pidiendo/pagando en A. El camarero aprueba/rechaza sin campo de motivo. Mensajes **literales** de aprobación y rechazo en el contrato normativo.
- Una aprobación no traslada, sigue válida tras 90 s sin uso, permite varios escaneos; únicamente primera confirmación real en B, bajo QR/visita/mesa/identidad vigentes, **consume una vez** y transfiere vinculación y entregas pendientes. Segunda transferencia requiere nueva aprobación.
- `customer_accounts.id`, saldo y pagos anteriores, rondas y snapshots de `orders.table_id` históricos, estado de cocina, plazo de agrupación, auditoría y datos de otros comensales se conservan. Solo destinos operativos **pendientes** pasan a B. Ni recobrar, ni redispatch de una ronda histórica, ni acceso cruzado a cuentas/SSE.
- En sala, **«Voy a recoger» solo asume una tarea**; no es entrega física, no existe segundo botón obligatorio «Recogido/Entregado» y no debe reactivarse el `picked_up` heredado para fingir confirmación física.
- No introducir polling de DB/API para catálogo, eventos, notificaciones ni deadlines. Outbox duradero, SSE/recuperación puntual y planificación diferida; sin workers descontrolados.

## 5. HITO INTEGRAL I — Revisiones por agotados/catálogo durante la agrupación (F21/R06)

**Recorrido funcional de salida, completo:** cliente confirma un pedido en A durante la ventana de 5 minutos → antes del despacho cocina agota un plato/ingrediente/opción o el restaurante publica un cambio relevante → exclusivamente la revisión afectada queda inválida y fuera del despacho, con snapshot original/histórico intacto; no se borran otras líneas → evento durable y advertencia en cliente, incluso al reconectar → cliente corrige explícitamente disponibilidad/opción, revisa **precio anterior, nuevo y diferencia**, consiente cuando lo exige el contrato → acción **«Reenviar pedido»** → **revisión numerada nueva e inmutable del MISMO pedido lógico**, sin segunda cuenta, segundo pedido cobrable, recaptura ni una nueva ventana de cinco minutos → **despacho inmediato y ACK verificable de cocina**, al destino operativo actual, incluso tras A→B autorizado.

**Obligatorio cubrir el borde operativo:** carrera real entre agotar/publicar y vencer el plazo, confirmación concurrente de última unidad, doble reenvío, cliente offline, QR/sesión revocados, dos clientes en la mesa, pedido ya confirmado a cocina (cliente no edita: incidencia por personal) y revisión económica en `pay_now` sin suponer capacidad de Stripe no verificada. Solo revisión vigente puede despacharse. Consentimiento explícito ante precio/descuento modificado aun si baja, según norma.

Implementar **en el mismo hito** migraciones candidatas PG17 forward-only si son necesarias, roles mínimos/RLS/funciones selladas, dominio, API autenticada, outbox/SSE, PWA cliente y cocina/sala. **E2E principal PG17 desechable + Fastify/JWT/HMAC + PWAs Chromium** con comprobación de identidad de pedido, revisiones, autorización/cobro, deadline, despacho, ACK, destinos y auditoría. Ningún fixture de reloj reducido puede sustituir la validación del borde natural cuando se declare acreditado.

## 6. HITO INTEGRAL II — Stripe, caja y cierre económicos completos (F20/R03/R05)

Preservar la evidencia §33 de pedido/caja/cierre y **no repetir artificialmente lo ya demostrado**, salvo como regresión. Completar los escenarios que faltan con cuentas individuales A→B, pagos históricos, distintos pagadores y estados de cocina:
- `pay_now` requiere autorización manual válida en Stripe y captura coordinada **antes del despacho**; no presentar autorización como cobro. Estado `capture_unknown` bloquea caja y segunda captura de esa misma deuda hasta reconciliación; webhook firmado y repetido/fuera de orden no duplica cargo, entrega ni reembolso. Manejo de expiración, fallo confirmado, entrega a cocina fallida después de captura y compensación/reembolso al **pagador original**.
- `pay_at_end` conserva deuda y recibos por cuenta. Caja requiere **registro de efectivo cobrado** con camarero autorizado, HMAC e idempotencia; «Pagar en caja» es intención, nunca liquidación. El cierre de cuenta es acción distinta del pago; nuevas compras después de liquidar pueden reabrir deuda **mientras la cuenta sigue abierta**, no después de cierre.
- Cuentas de importe cero: **no cerrar por deuda=0 aislada**; la norma exige que **todas sus partidas estén resueltas**. Investigar semántica aprobada y estados reales; **NO inventar cuándo equivale a resolución ni atribuir entrega física a «Voy a recoger»**. Si hay duda normativa no resoluble, documentar caso exacto y mantenerlo BLOCKED.
- Implementar la acción de caja/cierre desde **PWA de gestión** con roles y coherencia visual **solo conforme a flujo/diseño aprobado**. Si falta aprobación de una nueva pantalla, entregar prototipo/variantes y capturas claramente **pendientes de aprobación**, sin convertirlas en UI final por su cuenta.
- **Stripe sandbox real**, únicamente si existen credenciales **test** disponibles y entorno aislado y autorizado. No tomar secretos de Supabase operativo/VPS/Fleetia; no almacenar claves ni payloads sensibles en git, capturas o logs. Si no es posible conectar, terminar adapter, pruebas seguras y dejar `NOT_RUN/BLOCKED` para la certificación sandbox; **los mocks no certifican la operación real**.

**Salida:** E2E económico integrado A→B→Stripe/caja→cocina→cierre con distintos roles/cuentas, saldos y outbox exactos; evidencia de sandbox real solo cuando verdaderamente se haya ejecutado.

## 7. HITO INTEGRAL III — Operativa, seguridad y conformidad visual premium

**Recorrido integrado de usuario y personal**, no maquillaje de CSS: cliente/QR/aviso/solicitud/decisión/pedido/revisión/caja/cocina/sala; sesión activa, revocada, caducada y reconectada; cierre y lectura histórica; varias cuentas, varias mesas, dos dispositivos y cambios de destino. Comprobar SSE/outbox no duplicados ni cruzados, cursor/hueco, errores recuperables, notificaciones persistentes y cambios efectivos solo después de confirmar servidor. Mantener PWA cliente **separada** de `apps/management`; ninguna ruta/API de cocina accesible por cliente.

**Resiliencia real en entorno desechable:** rehidratar deadlines sin doble despacho después de caída; donde sea seguro probar reinicio de proceso Node y recuperación explícita; no tocar el VPS. Escalar alertas/fallos de LISTEN sin reconexiones infinitas, sondeos, duplicaciones de workers ni costes descontrolados. Revalidar SQL con PG17 limpio, roles NOINHERIT, RLS, SECURE DEFINER/search_path, allowlists, propiedad de cuenta y prohibiciones de acceso ajeno; no abrir grants para hacer pasar CI.

### CONTRATO VISUAL OBLIGATORIO

**Deben cumplirse exclusivamente las decisiones ya APROBADAS**, no basta decir «premium» o hacer capturas:
- **Sabora V3, identidad «Firma gastronómica»** y assets versionados; diseño **gastronómico de alta gama, cálido, luminoso, contemporáneo**. Paleta de referencia aprobada: marfil `#F8F7F4`, blanco `#FFFFFF`, tinta `#202622`, verde `#146B57`, acento `#D98B45` aplicados mediante **tokens existentes**, sin un sistema nuevo de estilos.
- **PWA cliente**: cabecera aprobada (marca, idioma, lupa que despliega buscador, cesta), carta visual fotográfica con fotografías legales/autorizadas, **categorías dinámicas desde gestión**, carrusel de anuncios **encima de «Nuestra carta»** (sin anuncios, ocultar sección), barra inferior **Información, Alérgenos, QR central, Favoritos, Ajustes**. Sin selector ficticio de cliente/cocina ni «sin QR / con QR» en producción. Conservar cesta/reservas entre sin QR y QR válido.
- **PWA cocina/sala/gestión**: misma identidad visual corporativa, pero mayor densidad operativa, lectura rápida, acciones visibles, mesa/comanda/destino y estados respaldados por servidor. NO copiar navegación cliente en gestión. **Tapiz decorativo de siluetas gastronómicas restringido a acceso Passkey de cocina**, nunca carta/caja/otras pantallas.
- Movimiento **EQUILIBRADO** aprobado, microinteracciones funcionales sin ornamentación excesiva, con `prefers-reduced-motion`. Sin parallax pesado, autoplay decorativo ni cambios de estado que afirmen éxito antes del backend.
- **Accesibilidad**: comprobar viewports cliente 360/390/430, operativa 768/1024/1280/1440, y ausencia de desbordamiento horizontal a 320 px; foco visible, teclado, contraste WCAG AA, controles táctiles ≥44 CSS px, mensajes anunciados, estados vacío/carga/error/offline y textos largos, Playwright + axe.
- **Capturas y conformidad**: capturas reales por viewport/estado y comparación con referencias GitHub. **Distinguir APROBADO / PROPUESTO / PENDIENTE**, especialmente fotografía, tipografía/capturas exactas y caja nueva. **No regenerar o dar por aprobados baselines sin aprobación explícita.** Si existe un diseño nuevo necesario pero no aprobado, documentar exactamente la decisión pendiente; respetar estructura ya aprobada mientras tanto.

**Salida:** E2E completo observable desde ambos navegadores, evidencia SQL/HTTP/SSE, capturas/axe y reporte de diferencias visuales; ningún criterio visual queda «PASS» por simple compilación.

## 8. HITO INTEGRAL IV — Puerta final F01–F28 / R01–R10 y regresión global

Releer las tablas completas de `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`, **los 28 escenarios F y 10 grupos R**. Construir un **acta verificable por cada ID** con: resultado PASS/FAIL/BLOCKED/NOT_RUN, archivo/función/escenario, SHA, workflow y job/artefacto, datos observables, riesgos y motivo de bloqueo. No marcar PASS por la existencia del código, mock, screenshot demo ni workflow de SHA distinto.

Ejecutar y verificar, **sobre el mismo SHA final**, los workflows reales:
- `.github/workflows/ci.yml` (incluida `scripts/ci/h6-acceptance-gate.sh` y todos los bloques integradores).
- `.github/workflows/bootstrap-lockfile.yml` (PostgreSQL 17 aislado y preflight).
- `.github/workflows/client-browser-conformance.yml`.
- `.github/workflows/management-browser-visual-smoke.yml`.

Leer logs, resultados y capturas; migraciones PG17 limpio/privilegios, regresión Node y PWA, concurrencia e idempotencia, 300 s naturales, eventos, Stripe/caja/cierre, roles y seguridad. **No confundir cuatro checks verdes con aceptación visual ni sandbox realmente ejecutado.** Corregir causas raíz y repetir regresión completa tras modificaciones finales.

**Documentación de hito:** actualizar matriz de aceptación y `docs/handoffs/SESSION_22_HANDOFF_2026-11-04.md` **solo al cerrar hitos relevantes**, adjuntando SHA/links exactos. Modificar normas únicamente cuando exista una nueva decisión explícitamente aprobada. Informe de cierre con repositorio/rama/PR Draft, implementado, pruebas ejecutadas, validación efectiva, F/R detallados, decisiones pendientes, defectos conocidos y **GO/NO-GO** del candidato. No proclamar cierre total si algo sigue BLOCKED/NOT_RUN.

## 9. REGLAS ABSOLUTAS DE SEGURIDAD Y AUTONOMÍA

1. **Fleetia y todos los demás proyectos quedan totalmente fuera de alcance.** No tocar sus repositorios, DB, secretos, contenedores, redes, volúmenes, puertos, proxy ni el VPS compartido. **Sabora no debe detener, alterar ni depender de Fleetia.** No ejecutar `docker compose down` global ni limpiezas compartidas.
2. **Sin despliegues, merges, migraciones operativas, reinicios ni cambios en Supabase productivo sin autorización expresa.** El proyecto operativo de Sabora figura como `byhvmumqivmunkmomhup`; no consultarlo ni mutarlo para esta tarea. El directorio central CartaViva es distinto y también queda fuera de operaciones.
3. **Solo GitHub `jdlc86/CartaViva`** para ramas, commits, PR Draft y Actions; PG17 efímero/destruible en runner aislado. HMAC/JWT/Stripe test; jamás elevar permisos, saltar RLS, exponer claves o fingir éxito.
4. **No pedir aprobaciones intermedias para ejecutar pruebas**: usa shell y GitHub Actions para esperar resultados, revisa fallos y repite la prueba integrada. Si surge una aprobación necesaria por nueva decisión normativa/diseño, **documenta el bloqueo** sin paralizar el resto.
5. **No avanzar por pequeños tests o microcommits como metodología.** Bloques funcionales completos, pruebas E2E. Tests aislados solo como diagnóstico o barrera crítica. No ocultar ni diferir defectos encontrados para conseguir 4 checks verdes.
6. **Concurrencia GitHub:** antes de cada push revisa si el HEAD remoto cambió; nunca sobreescribir commits ajenos. Trabaja en rama de Codex; no force push ni merge. Commits y push al finalizar cada hito importante.
7. **Distinción obligatoria:** código implementado ≠ pruebas ejecutadas ≠ funcionalidad realmente validada ≠ autorización operativa. Incluye siempre lo que sigue sin certificar.

## 10. Entregable que debes devolver

Deja un **PR Draft revisable con código integrado**, migraciones candidatas, todas las PWAs/rutas necesarias, E2E significativo, capturas y reportes, documentación/matriz al día; no un mero plan. Responde al propietario con un resumen **por hito integral** de SHA, enlaces a los cuatro workflows, resultados de F01–F28/R01–R10, capacidades listas, BLOCKED de causa concreta, conformidad visual y riesgos. **NO-GO honesto** si faltan decisiones de diseño, credenciales sandbox o evidencia de algún requisito. Ninguna acción de producción.

**La fuente de verdad es el contrato normativo de GitHub. Respetar diseño visual aprobado y flujos discutidos. Un restaurante Sabora. Cerrar hitos completos. No Fleetia. No merges ni despliegues.**
