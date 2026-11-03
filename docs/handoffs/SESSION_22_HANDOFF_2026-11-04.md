# Sabora / CartaViva — continuidad operativa para la sesión 22 (2026-11-04)

> **Documento de continuidad, NO normativo ni autorización de operación.** Este archivo proporciona contexto a la sesión 22; no crea ni modifica requisitos. **Prevalece siempre la documentación normativa de GitHub**, incluso sobre este texto y sobre las sesiones previas. Mantenerlo actualizado **solo al alcanzar hitos relevantes**, indicando implementación, pruebas realmente ejecutadas, funcionalidades validadas, SHA y límites. Nunca registrar un hito como superado por tener únicamente código escrito.

## 1. Estado verificado al crear el traspaso

- **Producto y alcance:** Sabora / CartaViva, **una sola instalación de restaurante**. PWA cliente, PWA gestión, API Fastify, PostgreSQL 17 y servicios candidatos H6. CartaViva como directorio central separado según contrato normativo; no se convierte Sabora en multitenant.
- **Único repositorio autorizado para escribir:** [`jdlc86/CartaViva`](https://github.com/jdlc86/CartaViva). No escribir en repositorios de Fleetia ni en sus sistemas.
- **Rama de trabajo existente:** `integration/sabora-h6-b2-delivery-board-contract-20261031`.
- **PR abierto y Draft:** [#43 — H6/B2: lector sellado de destinos y tareas de recogida](https://github.com/jdlc86/CartaViva/pull/43). No merge.
- **HEAD inspeccionado antes de este archivo:** `3a91190d4b66a3e989d5358b0966080fbeefbc72`. La creación del propio archivo producirá **otro SHA**. **Al retomar, consultar de nuevo el HEAD del PR y todos los workflows del commit vigente; no dar por buenos estados de un commit anterior.**
- **Estado de workflows del HEAD previo, fotografiado durante la creación:**
  - Bootstrap Sabora lockfile: in_progress — https://github.com/jdlc86/CartaViva/actions/runs/41736995717
  - Sabora CI: in_progress — https://github.com/jdlc86/CartaViva/actions/runs/41736995518
  - Sabora management browser visual smoke: success — https://github.com/jdlc86/CartaViva/actions/runs/41736995443
  - Sabora client browser conformance: success — https://github.com/jdlc86/CartaViva/actions/runs/41736995479
- **Decisión general:** **B3/B4 NO-GO**. Ninguna prueba aislada ni los 4/4 workflows sustituyen autorización, aceptación normativa completa, puesta en marcha o validación funcional en el restaurante.
- **Entorno de pruebas:** GitHub Actions en runner aislado con PostgreSQL 17 desechable, Chromium/PWA real, Fastify y credenciales y funciones SQL de mínimo privilegio. No equivale a operar sobre Supabase productivo ni VPS.

## 2. Jerarquía de fuentes; lectura obligatoria antes de continuar

1. **Fuente normativa funcional:** [`docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md). Revisar especialmente cambio de mesa, cuenta económica, agrupar durante cinco minutos, revisión correctiva, cocina/sala, Stripe y consentimiento de precio.
2. **Requisitos y diseño aprobados:** [`docs/REQUISITOS_FUNCIONALES.md`](../REQUISITOS_FUNCIONALES.md), [`docs/DESIGN_SYSTEM_CONTRACT.md`](../DESIGN_SYSTEM_CONTRACT.md), [`docs/design/APPROVED_VISUAL_STYLE_AUDIT_V1.md`](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [`docs/design/DESIGN_REQUIREMENTS_V1.md`](../design/DESIGN_REQUIREMENTS_V1.md). No improvisar pantallas ni flujos de caja fuera del visual aprobado.
3. **Seguridad y arquitectura:** [`docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md`](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md) y [`docs/SABORA_AUTHORIZATION_GATE.md`](../SABORA_AUTHORIZATION_GATE.md).
4. **Auditoría y criterios de aceptación por fila F01–F28/R01–R10:** [`docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), **§§28–32** especialmente. Esta matriz es guía de implementación/aceptación y **no desplaza** al contrato normativo.
5. **Continuidad anterior, solo contexto:** [`docs/handoffs/SESSION_21_HANDOFF_2026-11-03.md`](SESSION_21_HANDOFF_2026-11-03.md) y revisión [`docs/reviews/SABORA_H6_ACCOUNT_CLOSURE_FULL_STACK_IMPLEMENTATION_GATE_2026-11-03.md`](../reviews/SABORA_H6_ACCOUNT_CLOSURE_FULL_STACK_IMPLEMENTATION_GATE_2026-11-03.md). Nunca convertir un handoff o un fixture E2E en regla funcional.

Si una decisión no está normada, **no inventar ni reinterpretar**. Identificar el bloqueo y mantener NO-GO hasta resolverlo conforme a la fuente de verdad.

## 3. Hitos consolidados y verdaderamente comprobados

### F20/R03 — cuenta, caja, cocina/sala y carrera «gana el cierre» (§32)

- **SHA funcional validado:** `7295faf0b874c4e56793d89dd5eabb7c0f0cb59a`. **4/4 workflows SUCCESS**: [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/41722688561), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41722688553), [PWA cliente](https://github.com/jdlc86/CartaViva/actions/runs/41722689562), [PWA gestión](https://github.com/jdlc86/CartaViva/actions/runs/41722688653). Blocks 1/2A/2B PASS.
- El E2E integrado recorre mesa A→D, cuenta única, cobros firmados, pedido, cocina Chromium `confirmed→preparing→ready`, tareas de recogida y cierre económico explícito por camarero con JWT/HMAC.
- Con una **nueva cotización real ya obtenida** y una cuenta sin saldo pero con partidas listas, dos cierres firmados idénticos y una confirmación de pedido compiten con bloqueos PostgreSQL observados. **Gana el cierre**: 200/200 con una ejecución y un replay, el pedido nuevo recibe 403, sin deuda ni ronda añadida. El historial permanece; el cierre no equivale a entrega física.
- Documento normativo/aceptación: matriz **§32**. **No** dar por validada la intercalación inversa; es el objetivo actual.

### F21/R06 — ventana natural, concurrencia y recuperación de LISTEN (§§29–31)

- **Cinco minutos naturales validados:** `ffc1232a734a7aebb777e880f5ca2b5e1600a4af`, **4/4 SUCCESS** ([CI](https://github.com/jdlc86/CartaViva/actions/runs/41700104404)). Primera comanda, agrupada y tardía desde PWA cliente; `grouping_deadline=first_confirmed_at+300 s`, sin adelantar reloj. Dos planificadores compiten después del plazo; no duplican envíos. ACK autenticado de cocina, misma cuenta y saldo preservado. El CI integrado mantiene Stripe fuera de este caso.
- **Pérdida real del canal de PostgreSQL LISTEN recuperada en entorno de prueba:** `c48a0e6ebc3e6dfe844e75961e2bac45d27e65ab`, **4/4 SUCCESS** ([CI](https://github.com/jdlc86/CartaViva/actions/runs/41713523459), [PG17](https://github.com/jdlc86/CartaViva/actions/runs/41713523654), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/41713523422), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/41713523644)). Solo se termina la conexión LISTEN de PG17 desechable; notificación sanitizada y cierre seguro del planificador; nueva conexión/instancia recupera vencimientos desde PG sin repetirlos.
- **Archivos núcleo:** `apps/api/src/h6-deferred-dispatch-scheduler.mjs`, `apps/api/src/h6-event-stream.mjs`, `apps/api/src/h6-candidate-composition.mjs`, `apps/api/src/h6-provider-repository.mjs`, migración `supabase/migrations/20261103230000_sabora_h6_deferred_dispatch_schedule_candidate.sql`.
- **Límite:** el planificador sigue **desactivado por defecto** en el montaje candidato; no se ha certificado arranque operativo, fallo del proceso Node completo, supervisión o provisión de producción, revisión corregida con despacho inmediato ni Stripe sandbox. **F21/R06 parcial**.

## 4. TRABAJO EN CURSO AL TRASPASAR — NO DECLARAR VALIDADO

**Objetivo funcional completo:** cubrir **ambas intercalaciones** entre confirmación de un nuevo pedido y cierre de cuenta, y carrera con cobro en caja, **dentro del mismo E2E integrado**, hasta cocina `ready` y conciliación contable. No avanzar añadiendo pequeñas pruebas sin valor, ni declarar «hecho» mientras falla cualquier bloque.

- **`a25c96cf4cf8a04b67e8083b44cef28cc55b8cea`:** se amplió `scripts/ci/table-change-root-postgres17.test.mjs` con **«gana el pedido»** (cotización HTTP real antes de cierre, primera solicitud adquiere el advisory lock de cliente), cierre que debe fallar 409, cobro presencial de 700 céntimos sin doble registro, veto de cierre mientras la nueva ronda no esté resuelta, despacho/ACK y `preparing→ready` desde PWA cocina; después conserva el escenario previo «gana el cierre» y ajusta el saldo histórico. **Resultado observado del primer intento: CI y Bootstrap FAIL**, PWAs en verde. Bloqueo PG17 no detectado por el test debido al patrón usado en su observación de la función de caja; no equiparar fallo del test con defecto de negocio demostrado.
- **`663862003db48d1a2d5c167aa6e7df72b6731c73`:** se corrigió el patrón de identificación de la RPC de caja realmente sellada en `pg_stat_activity`. **CI y Bootstrap continuaron FAIL** por una segunda causa: la PWA cocina no encontraba la nueva línea al reconectar SSE/refrescar el tablero, pese a existir en SQL. Es necesario distinguir si es desfase de lectura/UX o defecto real de paginación antes de modificar producción.
- **`3a91190d4b66a3e989d5358b0966080fbeefbc72`:** se añadió recuperación mediante **refresco autorizado** de la PWA de cocina en el mismo E2E, sin inyección de estados. **Al elaborar este documento** PWAs cliente/gestión SUCCESS, Sabora CI y Bootstrap PG17 **EN EJECUCIÓN** (ver URLs §1). No afirmar 4/4 ni pasar a otra funcionalidad hasta verificar la conclusión.
- **Al comenzar sesión 22:** verificar si el HEAD ha cambiado después de este archivo. Si el CI del candidato es FAIL, leer el fallo concreto de **Block 2B** en logs `H6 consolidated acceptance` y los artefactos; resolver el defecto y **repetir el recorrido integral completo**, sin forzar pantallas, estados o SQL operativos para que el test parezca verde.
- **Si el recorrido inverso termina verde:** actualizar la **matriz normativa de aceptación (§33 o siguiente apartado disponible)** y este documento. Indicar SHA real, enlaces a 4 workflows, PG17, qué intercalación ganó, saldo de 700 céntimos, recibo de caja idempotente, ronda adicional, despacho/ACK, progreso cocina y límites. Solo entonces considerar este subconjunto de F20/R03 evidenciado, no toda la fila.

El repositorio puede tener trabajo concurrente. **Jamás forzar la rama ni sobrescribir cambios**: inspeccionar HEAD antes de cada árbol/commit y escribir con `expected_sha`; si cambia el HEAD, reexaminar el diff y conciliar.

## 5. Secuencia lógica después del hito económico pendiente

1. **Cerrar F20/R03 integralmente en el candidato** (pedido-gana, cierre-gana, caja/cierre concurrente, idempotencia y conservación de deuda/historial). Verificar alcance exacto con evidencia SQL y PWAs. No reabrir micropruebas inconexas.
2. **F21/R06: revisiones por catálogo/agotar tras confirmación**: invalidación solo de la revisión afectada, decisión explícita del cliente, consentimiento de precios cuando proceda, nueva revisión inmutable del mismo pedido y despacho inmediato de la revisión corregida, sin segunda ventana ni cobro/autorización duplicados. Completar carreras antes y al borde del vencimiento según contrato normativo; no inventar política.
3. **Cuenta y caja:** resolver normativamente la semántica de «partidas resueltas» y cuentas de importe cero y validar desde la **PWA de gestión con diseño aprobado**, no únicamente HTTP. Saldo cero no implica cierre; la recogida H6 no prueba entrega física.
4. **Stripe real en sandbox**, métodos compatibles con autorización/captura manual, reintentos, webhook, expiración de autorización, conciliación y devoluciones; **no confundir los stubs de Stripe y firmas ficticias con una transacción Stripe test real**.
5. **Preflight operativo/seguridad y aceptación total** F01–F28/R01–R10: identidad de personal operativa, SQL roles mínimos, HMAC/JWT, observabilidad, recuperación, despliegue reversible y aislamiento del VPS. Todo exige autorización explícita antes de tocar servicios o bases reales.

Reordenar si la normativa fija dependencias diferentes. Prioridad constante: **cerrar hitos funcionales completos** con pruebas integradoras valiosas, no sumar microcorrecciones por inercia.

## 6. Seguridad, recursos y criterios de trabajo obligatorios

- **Prohibido tocar Fleetia** y otros proyectos del VPS. Ningún contenedor de Sabora puede detener, reiniciar, reemplazar o depender de contenedores ajenos. No ejecutar `docker compose down` global, limpiezas de redes/volúmenes comunes ni cambios de proxy/host compartido. Sin autorización expresa de despliegue y prueba de aislamiento, **no operar en VPS**.
- **Sin merge, deploy, reinicio, migración real ni modificación de Supabase operativo** por continuidad. Supabase Sabora indicado en contrato técnico `byhvmumqivmunkmomhup`; usar PG17 **desechable/aislado** para CI y pruebas. No reutilizar la base de Fleetia.
- **Capacidades mínimas:** no ampliar EXECUTE, RLS ni secretos para evitar un fallo. Los JWT, secretos de firma, proveedores Stripe y credenciales del E2E son de prueba; hay que certificar los flujos reales por separado.
- **Pruebas:** integradoras por defecto; aisladas únicamente cuando protejan un requisito crítico o diagnostiquen fallo concreto. Analizar el escenario antes de probar, esperar resultados vía shell/consulta de Actions y corregir/rerun sin requerir interacción manual innecesaria. No sustituir validación por ejecución de comandos o compilación.
- **Desarrollo visual:** preservar el diseño premium aprobado y la experiencia cliente/cocina/sala. Modificar solo flujos normados; **no construir una caja visual nueva según criterios improvisados**.
- **Documentación:** actualizar documentos normativos/matriz cuando se complete un hito que corresponda, y este handoff solo con evidencia relevante. Diferenciar **implementado / CI ejecutado / realmente validado / aún NO-GO**. No modificar requisitos mediante este texto.

## 7. Registro de hitos de la sesión 22 (mantener durante la ejecución)

**Al crear este documento no se añade una aceptación nueva**: el estado más reciente de la carrera inversa está en §4. Incorporar aquí un registro breve **solo tras validaciones completas**, con SHA, enlaces, resultados, incidencias corregidas y riesgos restantes.

**Regla final:** CartaViva/Sabora sigue en **PR #43 Draft y B3/B4 NO-GO** hasta la aceptación y autorización correspondientes. Ninguna operación sobre Fleetia o recursos compartidos.
