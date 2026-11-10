# Encargo a Codex — CartaViva/Sabora: hitos integrales M2 y M3 (sesión 23)

**Fecha:** 2026-11-05. **Naturaleza:** instrucción de ejecución de ingeniería, **NO normativa funcional**, no autorización de despliegue, merge, gasto, modificación de Supabase operativo ni uso del VPS. **Repositorio único:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). **Producto:** Sabora, un restaurante por instalación; CartaViva, directorio separado.

> **Objetivo del encargo:** dejar de añadir pruebas o pequeñas correcciones sin cerrar funcionalidad; completar primero un **M2 candidato integral de arranque, seguridad y conexión real** (CV-004/CV-005), y después un **M3 integral de gestión de mesas/QR y catálogo dinámico** (CV-006/CV-007) si se cumplen sus dependencias y las decisiones visuales existentes. **No rehacer la matriz F/R.** Consultarla como fuente única de criterios y actualizar su evidencia si corresponde. Los bloqueos reales se preservan; no declarar GO por CI verde.

## 0. Fuentes de verdad: leer **antes** de escribir código

### Normativa, por este orden de prioridad

- [Contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), en especial restaurante único, cambio de mesa, agrupación, cocina/sala, pagos y **decisión aprobada de coste cero 05-11-2026**.
- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md), distinguiendo aprobaciones expresas y decisiones pendientes.
- [Contrato del sistema visual](../DESIGN_SYSTEM_CONTRACT.md), [estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [requisitos visuales](../design/DESIGN_REQUIREMENTS_V1.md) y demás pantallas/flujos aprobados. La pantalla de caja/cierre NO se declara aprobada por existir una maqueta o un test.
- [Hoja de ruta técnica y método obligatorio de hitos integrales](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [límite de dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md) y [aislamiento de Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).

### Gestión y aceptación; **no** modificar requisitos por estos archivos

- [Tablero vivo M1–M6 / CV-001–CV-018](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), referencia central de prioridades, estados y puertas.
- [Matriz original de cambio de mesa F01–F28 / R01–R10](SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), **en especial §37**, que concilia pruebas, dos SKIP, SHA y bloqueos. **Esta matriz es la única matriz F/R: no copiarla, reordenarla ni inventar otra.**
- [Informe candidato de Codex](../reviews/SABORA_TABLE_CHANGE_FINAL_INTEGRAL_CLOSURE_REPORT_2026-11-04.md), [coste cero](../reviews/SABORA_H6_ZERO_COST_ACCOUNT_LIFECYCLE_2026-11-05.md), [auditoría independiente](../reviews/SABORA_H6_INDEPENDENT_ZERO_COST_ACCEPTANCE_2026-11-05.md).
- [Continuidad activa de sesión 23](../handoffs/SESSION_23_HANDOFF_2026-11-05.md) y [sesión 22, histórica](../handoffs/SESSION_22_HANDOFF_2026-11-04.md).

**Si la norma no contempla una operación/estado/diseño, no lo inventes ni reinterpretes.** Registra el punto `BLOQUEADO` y trabaja sobre el resto del hito que tenga contrato suficiente. Los archivos de continuidad, reports y código preexistente no autorizan reglas nuevas.

## 1. Punto de partida y perímetro estricto

**Fotografía inicial, caduca cuando avance GitHub:**
- PR [#43 Draft](https://github.com/jdlc86/CartaViva/pull/43), base histórica de integración H6.
- PR [#44 Draft](https://github.com/jdlc86/CartaViva/pull/44), corrección F21/R06 y coste cero.
- PR [#45 Draft](https://github.com/jdlc86/CartaViva/pull/45), revisión independiente, base de trabajo **sugerida**, rama `audit/sabora-h6-zero-cost-integrated-acceptance-20261105`, **HEAD observado** `67fe6f171582fa7e3c38c6880e49bd94bbdc56d4`.
- CV-002 cerrado normativamente; CV-001 y CV-003 cuentan con evidencia y reconciliación, pero **M1 NO CERRADO**. No usar este encargo para marcar M1 cerrado ni repetir las suites ya validadas como si fuesen un hito nuevo.
- Se ha observado que `apps/api/src/server.mjs` solo expone `/health` y `/ready`; `api-runtime-config.mjs` solo admite `health-only`. `PERSIST_H6_ORDER_SQL` apunta a confirmación H6 original; la transferencia validada vive en una composición SQL separada sin corte de runtime. Dos `test.skip` de `table-change-h6-contract.test.mjs` examinan la función original (ver matriz §37.3).

**Reglas no negociables:**
1. **Solo modificar `jdlc86/CartaViva`**. Prohibido tocar Fleetia, contenedores, volúmenes, redes, proxies, secretos, Supabase o recursos de otros proyectos. **Sin desplegar, reiniciar, borrar, migrar Supabase operativo ni operar sobre VPS**, aunque sea una prueba. Ningún `docker compose down` compartido.
2. El trabajo autorizado aquí se limita a **código, ramas, commits, PR Draft, CI y PostgreSQL 17 local/runner desechable**, dentro de herramientas ya disponibles. No gastar dinero, contratar servicios, activar Stripe real/test ni Gemini sin autorización y medios habilitados.
3. No fusionar PR; no hacer `push --force`; antes de cada escritura revisar rama, base y HEAD remoto. No sobreescribir trabajo concurrente. Si cambia HEAD, comparar y reconciliar.
4. **La puerta de autorización es vinculante.** En particular, mientras `docs/SABORA_AUTHORIZATION_GATE.md` prohíba registrar rutas operativas en `apps/api/src/server.mjs`, **mantener ese servidor sin exponerlas**. M2 debe producir un **bootstrap candidato separado, explícitamente opt-in y solo ensayado en PG17 aislado**. No convertirlo de forma encubierta en modo productivo ni abrir `EXECUTE` indiscriminado.
5. Identidad del actor ligada a JWT comprobado y capacidad HMAC transaccional, roles SQL mínimos, `FORCE RLS`, funciones selladas, claves/secretos ficticios de CI, validación de origen y revocación. Cualquier grant positivo nuevo requiere justificación de capacidades exactas y prueba de denegaciones/aislamiento; **no relajar controles para que el E2E pase**.
6. No inventar que `ready`/`claimed` equivale a entrega física ni que saldo cero implica cierre ordinario; aplicar literalmente política de coste cero y consentimiento de precio. No confundir mocks de Stripe con transacciones Stripe test de red.

## 2. Unidad de ejecución 1: M2 integral (CV-004 y CV-005), **PR Draft propio**

### Tarea A — reconciliar antes de integrar (CV-004)

**Hacer, no solo recomendar:** consultar con GitHub los PR abiertos, ramas y bases actuales (la cifra histórica de 37 Draft **puede haber cambiado**), construir una **tabla de dependencias y ancestros comprobada**, identificar duplicados/PR obsoletos/conflictos, comparar los cambios de #43→#44→#45 con la base elegida. Verificar alcance de migraciones, versión PostgreSQL, contratos de roles, disponibilidad de las dos PWA y orden de ejecución.

- Crear **rama de trabajo nueva** desde el HEAD candidato revisado y **PR Draft separado**, con base explícita y sin merge; nombre descriptivo, sin colisionar con ramas existentes.
- No hacer merges de los PR antiguos «para simplificar» ni resetear cambios de Codex u otros autores. Elegir una estrategia de integración reversible y documentar qué commits o trabajos quedaron excluidos.
- Dejar en el PR o en `docs/reviews/` un inventario PR→base/HEAD→capacidad/solapamiento→riesgo→decisión, con referencias GitHub y fecha. **No reescribir la matriz F/R.**

**Salida A:** base y ruta de integración verificadas; si aparece un conflicto normativo/seguridad sin resolución aprobada, marcar bloqueo exacto y no cruzar ese límite.

### Tarea B — montaje candidato completo H3–H6, no una colección de endpoints aislados (CV-005)

Sobre **una misma instancia PG17 limpia/deshechable**, implementar un punto de arranque **separado y opt-in**, con configuración comprobada y ciclo de vida controlado, que componga las capacidades existentes en vez de reimplementar módulos por duplicado:

- Verificar arranque y parada idempotente/segura de Fastify; pools SQL con logins físicos independientes, permisos preflight mínimos, ausencia de servicios ajenos, origen/cookies y firma JWT/HMAC verificable. Arranque debe fallar cerrado si falta configuración, autenticación, capacidades, migración o conexión. `/ready` del **candidato** solo devuelve listo cuando dependencias y servicios requeridos están realmente preparados; `/health` no debe fingir preparación.
- Integrar identidad y registro/visitas/QR, catálogo publicado y cotizaciones, confirmación de comanda H3–H6, cambio A→B autorizado y diferido, agrupación/corrección de revisión, saldos y cuenta, cocina/sala, eventos/outbox/SSE y planificador duradero **opt-in**, con recuperación/limpieza en cierre. La composición debe tener un recorrido continuo para **las dos PWA reales**, no fixtures HTTP que sustituyan operaciones de negocio.
- En la **confirmación de pedido**, verificar exactamente el corte entre `confirm_customer_round_h6_candidate` y `confirm_customer_round_h6_transfer_integration_candidate`: conservar la cuenta y autorización atómica de F12, idempotencia, origen histórico y destino de entrega; actualizar allowlist/preflight/grants solo dentro del **candidato aislado autorizado por normas**, no del servidor de producción prohibido. Si el límite vigente impide un grant positivo, aislar la capacidad o marcar bloqueo: no abrirla en silencio.
- Conectar las vistas reales de cliente y gestión autorizadas por el diseño; utilizar personal real del PG17 de pruebas, JWT firmados localmente y pertenencia/revocación SQL. No atribuir una acción de cierre de mesa a PWA gestión si solo se ejecutó la RPC desde un harness. Si ese flujo exige pantalla no aprobada, mantenerlo claramente **pendiente para M3/M4**.
- Reutilizar los flujos ya probados (300 s naturales, corrección inmutable, eventos, SSE, recibos de prueba, coste cero); no alterar sus contratos para conseguir un resultado rápido. **La confirmación normal y la de cambio no deben abrir cuentas diferentes**.

**La salida B se acepta como «M2 técnico candidato validado», no como arranque productivo**, únicamente si el recorrido integrado normal de los servicios incluidos se ejecuta en PG17/Fastify/dos Chromium, sobreviven reintento/revocación/cierre/carrera sin corrupción, las negativas de roles pasan, y queda demostrado que el servidor normal sigue en `health-only` sin accesos adicionales. El estado operacional final continuará sujeto a autorizaciones y otros hitos.

### Tarea C — resolver los dos SKIP sin falsificar resultados

Los dos `test.skip` están documentados en [matriz §37.3](SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). **No eliminarlos por estética** ni cambiar el conteo sustituyendo una prueba con un assert trivial. Una vez comprobada la ruta **efectivamente seleccionada por el arranque candidato**, portar los dos invariantes económicos al punto de entrada vigente, verificando bloqueo cuenta→persistencia y consumo único de concesión en la misma transacción **mediante prueba integradora real**. Conservar o convertir los tests legados en negativas según lo que corresponda; explicar cualquier SKIP restante. Si el corte no puede validarse por restricciones normativas, mantener SKIP y M2 parcialmente bloqueado.

### Puerta de salida M2 (no fragmentable)

**Un único recorrido principal de aceptación integrado**, más negativas críticas, que inicie los servicios opt-in y recorra: cliente entra por QR y crea visita/cuenta → confirma pedido → solicita cambio de mesa → camarero autenticado decide desde gestión → cliente confirma en otra mesa → preservación de cuenta, precios/historia y entregas → agrupación/corrección, cocina/sala y SSE → efectivo/cierre y caso de coste cero en sus condiciones válidas → logout/revocación/replay y recuperación de conexiones. Comprobar consecuencias en SQL y las dos interfaces. **No utilizar un único escenario para certificar Stripe de red, pantalla de caja no aprobada o entrega física.**

Reutilizar y ampliar el E2E existente cuando sea oportuno, sin crear sucesivos «hitos» de tests pequeños. Si una pantalla/capacidad bloqueada impide el circuito total, declarar explícitamente **M2 parcial** y certificar solo las partes que sí fueron ejecutadas. No maquillar límites con respuestas simuladas.

## 3. Unidad de ejecución 2: M3 integral (CV-006/CV-007), **solo tras revisar el resultado M2**

Este es el **siguiente bloque de implementación completo** del encargo, no una autorización para adelantar pantallas o bases antes de resolver el arranque M2. Usar rama/PR Draft nuevo o evolución claramente separada que preserve evidencia y compatibilidad. Contrastar primero la normativa visual y funcional actual, y detener exclusivamente las decisiones de diseño que no estén aprobadas.

**CV-006 — gestión integral de mesas y QR desde la PWA de gestión**: implementar, por las rutas y roles realmente aprobados, el ciclo de alta/edición, estados operativos normados, apertura/pausa/cierre de ocupación, emisión/rotación/revocación/impresión del QR y su efecto en cliente, visitas, autorizaciones, cocina y cuentas. No confundir estado de preparación de mesa con estado de ocupación. Al cerrar, verificar la norma de coste cero para múltiples cuentas; deudas o partidas pendientes **no** se convierten en pagadas/entregadas por automatismo. Si el contrato visual definitivo de caja/cierre no está aprobado, **no inventarlo**: bloquear solo ese tramo y registrar la dependencia CV-009.

**CV-007 — editor de catálogo y categorías dinámicas completo**: eliminar el rechazo rígido de categorías nuevas en el lector de gestión, preservando la semántica de categorías configurables; construir publicación explícita de draft, orden, disponibilidad, agotado/retirado, precio cero, extras/alérgenos y cálculo autorizado cuando el contrato los contemple. Comprobar la **misma fuente PG17** entre gestión, PWA cliente, confirmación y revisión correctiva F21, sin exponer borradores ni alterar pedidos ya confirmados. No derivar la fuente de verdad de un catálogo mock.

**Puerta de salida M3:** PWA gestión → operaciones autenticadas/roles SQL → PG17 → cliente en Chromium → comanda/cocina/sala/cuenta → revocación/rollback/reintento/eventos; pruebas integrales de estados y de categoría nueva con publicación correcta; responsive, accesibilidad y comparación con **diseño realmente aprobado**. No dar por completado CV-006/CV-007 con botones que llamen mocks o vistas deshabilitadas.

## 4. Trabajo explícitamente BLOQUEADO o fuera del encargo inmediato

- **M4/CV-008 Stripe sandbox real:** no activar, simular como real, solicitar secretos de producción, crear cobros ni registrar «Stripe validado». Requiere credenciales de prueba autorizadas y capacidad real para contactar al proveedor. Preparar únicamente las interfaces de integración necesarias para M2/M3 si no cambian el contrato.
- **M4/CV-009 caja/pagos/cierre visual final:** no inventar diseño, flujo o aceptación humana. Usar diseños aprobados o marcar dependencia del propietario; una RPC de arnés no es una pantalla aprobada.
- **M5/CV-012–016:** dos PWA instalables, reservas, dashboard, comunicaciones, Gemini y directorio siguen en el tablero para hitos posteriores; no mezclarlos en M2/M3 sin que sean dependencia estricta y normada.
- **M6/CV-010/CV-011/CV-017/CV-018:** no inspeccionar ni modificar VPS, Fleetia, Supabase operativo, proxy, redes compartidas, credenciales productivas, deployment o datos reales; validación/operación requieren puerta y autorización específica independiente.

## 5. Método de prueba y reporte de Codex

1. **Plan de un hito completo antes del primer commit**: capacidades, transiciones y actores, dependencias, diagrama de recorrido, IDs F/R de la matriz existente, entorno y criterios de salida. No redactar otra matriz.
2. **Integración en PostgreSQL 17 efímero real**, API Fastify, autentificación efectiva y ambas PWA Chromium para flujos visuales; negativas de RLS/roles/JWT, carreras de PG17, idempotencia, rollback/recovery, revalidaciones y cuentas económicas. Pruebas unitarias/aisladas solo para aislar defectos reproducibles o proteger requisitos críticos, **no** como entregables separados.
3. Ejecutar comandos de `package.json` y `scripts/ci/` reales, no comandos inventados; ejecutar y **esperar el resultado** de las suites y GitHub Actions del SHA de código con shell/consultas automatizadas, sin pedir al propietario intervenciones triviales. Corregir regresiones y repetir el bloque íntegro y la regresión global. Si un workflow no dispara para determinado SHA, no contabilizarlo como PASS.
4. En cada PR Draft incluir: base/HEAD, cambio funcional, seguridad/SQL, migraciones efímeras, escenarios exactos ejecutados, logs/artefactos/URLs de Actions, errores corregidos, **implementado / probado / validado / pendiente**, y dictamen de candidato/NO-GO.
5. Actualizar, **solo al cerrar un hito relevante**, el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y la [continuidad 23](../handoffs/SESSION_23_HANDOFF_2026-11-05.md). Añadir referencias/evidencias a la [matriz preexistente](SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) si cambian las F/R **sin reescribirla**. Cualquier nueva regla requiere decisión del propietario y actualización normativa distinta, no una inferencia de Codex.
6. **No iniciar un segundo hito para tapar un fallo del primero.** Si aparece un bloqueo ajeno a las autorizaciones, entregar el alcance implementado y la evidencia con dictamen parcial, sin proclamar cierre integral.

## 6. Entrega exigida al terminar

Codex debe publicar **un PR Draft por hito integrado revisable** (o documentar por qué M3 aún está bloqueado), con informe de cierre trazable. El mensaje final debe responder sin ambigüedades:

- ¿Qué código quedó implementado y en qué commit/PR, y qué se conservó sin tocar?
- ¿Qué integraciones PG17/Fastify/Chromium/CI se **ejecutaron realmente** en qué SHA, y con qué resultados?
- ¿Qué requisito/ID de la **matriz existente** quedó efectivamente acreditado y cuál permanece candidato/parcial/bloqueado?
- ¿Se resolvieron o conservaron los dos SKIP y por qué?
- ¿Qué queda pendiente por normativa, diseño, Stripe, identidad, credenciales o autorización?
- ¿Cuál es el siguiente **hito integral** y qué condición permite empezarlo?

**Estado de partida y de seguridad:** todos los PR siguen Draft; no merge, no deploy, no Supabase operativo, no VPS, no Fleetia. **NO-GO producción** hasta aceptación y permiso explícito del propietario.
