# Sabora — acta de decisión sobre aceptación funcional integral H6 (07-11-2026)

**Dictamen emitido: NO-GO de aceptación funcional global H6.** Esta es una **auditoría técnica/documental independiente de evidencias**, **NO** una firma del propietario, autorización de despliegue, sustituto de una prueba con Stripe sandbox real ni cierre del PR. Una ejecución verde no cambia un requisito normativo. El alcance es **un solo restaurante Sabora**.

## 1. Identidad, jerarquía y regla de evidencia

- **Repositorio y candidato:** [jdlc86/CartaViva, PR #49 Draft](https://github.com/jdlc86/CartaViva/pull/49), rama `feat/sabora-cv012-independent-pwas-20261106`, base `integration/sabora-session23-m3-acceptance-20261106`.
- **SHA del HEAD inspeccionado y de los cinco workflows:** `36bda8f6b57af76d2c237d710ddec7caeb1d31cd` (**5/5 SUCCESS**). **SHA del último cambio funcional anterior al informe documental:** `92781a4980b7db1a2bf94ddfa29ebba764e52fef`. La diferencia son documentos de seguimiento/revisión; las pruebas del HEAD se han comprobado por separado.
- **Normativa prevalente:** [contrato funcional consolidado (NF)](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), especialmente «Cambio de mesa con consumición activa» y «Decisión de coste cero»; [requisitos funcionales (RF)](../REQUISITOS_FUNCIONALES.md); [diseño aprobado y sus límites (DV)](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md). No se modifican ni se reinterpretan para encajar resultados.
- **Criterios literales:** [matriz H6 §§4–5, F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). [Conciliación fila por fila §40](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) e [informe independiente anterior](SABORA_H6_INDEPENDENT_INTEGRAL_ACCEPTANCE_REVIEW_2026-11-06.md) se usan como evidencias **no normativas**, con contradicciones temporales conservadas.
- **Semántica de evidencia:** **PG#n**: subtest del `table-change-root-postgres17.test.mjs` del job Bootstrap; **I49**: PG#49 completo con Fastify, Chromium PWA cliente/gestión, JWT/HMAC y SQL con seis logins aislados; **H§n**: pruebas históricas documentadas en los apartados de la matriz, **no ejecutadas de nuevo individualmente en esta acta**; **UI-C/UI-G**: comprobaciones de navegador, algunas con fixture HTTP. «CANDIDATO» es alcance probado con límites, **no** aceptación formal.
- **Lo realizado al emitir este acta:** lectura de requisitos, árbol/arranque, tabla F/R y logs existentes, sin tests nuevos, modificación de código, migración, merge, despliegue ni acceso a recursos operativos. **No se han vuelto a ejecutar manualmente los escenarios H§ históricos**.

## 2. Ejecuciones verificadas del MISMO SHA `36bda8f6`

| Puerta CI | Evidencia objetiva | Conclusión |
| --- | --- | --- |
| [Sabora CI H6 #42307773016](https://github.com/jdlc86/CartaViva/actions/runs/42307773016) | Bloques 1 contratos/Node, 2A migraciones y privilegios PG17, 2B PG17/Fastify/HMAC/Chromium | **SUCCESS** |
| [Bootstrap PG17 #42307773053](https://github.com/jdlc86/CartaViva/actions/runs/42307773053) | **1.350/1.350 Node**, **51/51 PG17 (#49 PASS)**, **4/4 coste cero**, sin fallos en esas suites | **SUCCESS** |
| [Cliente Chromium #42307772993](https://github.com/jdlc86/CartaViva/actions/runs/42307772993) | **36/36** escenarios de navegador | **SUCCESS** |
| [Gestión Chromium #42307772979](https://github.com/jdlc86/CartaViva/actions/runs/42307772979) | Smoke de gestión (no reemplaza el I49 real) | **SUCCESS** |
| [Instalación dos PWA #42307773012](https://github.com/jdlc86/CartaViva/actions/runs/42307773012) | Scopes independientes, cachés acotadas y flujos online/offline del harness | **SUCCESS** |

La [regresión H3/CV-019](SABORA_H6_INDEPENDENT_INTEGRAL_ACCEPTANCE_REVIEW_2026-11-06.md) también conserva dos variantes independientes, precio, edición, snapshots, replay idempotente, cocina/gestión y evidencia visual a 390/1440 px. **Nada de esto demuestra Stripe sandbox real, instalación física móvil, aceptación humana ni arranque productivo.**

## 3. Acta F01–F28: estado individual, prueba atribuible y puerta no cubierta

| Criterio | Dictamen, NO cierre | Evidencia real / histórica | Falta para aceptar formalmente |
| --- | --- | --- | --- |
| **F01** | CANDIDATO | I49, H§§7–9: QR sin vinculación previa | Revisar todas las combinaciones de escaneo libre con la operativa aprobada |
| **F02** | CANDIDATO | PG#10/#29, I49: vinculación al primer pedido | Revisión funcional de la ventana de agrupación en interfaz |
| **F03** | CANDIDATO | I49: cancelar aviso QR sin crear solicitud | Validación humana del texto, navegación y retorno |
| **F04** | CANDIDATO | PG#35, I49: solicitud sin destino y aviso a sala | Conformidad completa de estados/aviso en gestión |
| **F05** | CANDIDATO | PG#35/I49, H§§9–10: unicidad y bloqueo | Trazar todos los patrones de doble toque en aceptación de producto |
| **F06** | CANDIDATO | H§§18–19: conservación de operación en A | Recorrido humano completo de pedido y pago en A bajo solicitud pendiente |
| **F07** | CANDIDATO | PG#15, H§21: rechazo y cooldown | Validación del contador y de los mensajes a los 20/21 s |
| **F08** | CANDIDATO | PG#15, H§24: caducidad y decisiones tardías | Acta de frontera exacta de los 90 s con UI |
| **F09** | CANDIDATO | PG#14/#20/I49: aprobación y aviso automático | Verificar mensaje literal y flujo visual aprobado |
| **F10** | CANDIDATO | I49, H§§10,21: rechazo y comunicación | Aprobar presentación exacta y ausencia de motivo |
| **F11** | CANDIDATO | PG#15/#17, I49, H§§9,22: concesión sin traslado | Revisar secuencia de múltiples QR y permanencia en A |
| **F12** | CANDIDATO opt-in | PG#22/#26/#29/#41, I49: A→B transaccional | Composición operativa ordinaria no activada: server.mjs health-only |
| **F13** | CANDIDATO | PG#27: segunda transferencia exige permiso nuevo | Validar UX de denegación tras B→C sin autorización |
| **F14** | CANDIDATO | H§4 y PG#22: concesión no consumida en origen | No hay aceptación individual nueva de pedido adicional en A |
| **F15** | CANDIDATO | PG#15, H§22: vigencia de concesión aprobada | Aprobar comportamiento visual pasados 90 s |
| **F16** | CANDIDATO | PG#23/#25/I49, H§§17,23,26: cierre/revocación | Cerrar evidencia por cada ruta de revocación y sesión |
| **F17** | CANDIDATO | PG#24/#25, I49: QR revocado y mesa no operativa | Revisión final de cada transición negativa en PWA |
| **F18** | CANDIDATO | I49, H§§12,36: comensales independientes en A/B | Firma de aceptación multicuenta CV-001/M1 pendiente |
| **F19** | CANDIDATO | PG#16/#17/#26, I49, H§§12,28: destinos y recogida | No inferir entrega física a partir de estados de recogida |
| **F20** | PARCIAL / BLOQUEADO | PG#31/#32, H§§18–20,26,32–36: dinero y Stripe simulados | Stripe sandbox real y diseño/recorrido de caja CV-008/CV-009 |
| **F21** | CANDIDATO | PG#9/#26, H§§29–31,34: agrupación/outbox | Conservar prueba histórica de 300 s; no afirmar reejecución individual |
| **F22** | CANDIDATO | PG#30/#32, H§15: concurrencia B/C, una concesión | Validación de estados UI ante carreras |
| **F23** | CANDIDATO | PG#25, H§§16,23: rollback SQL íntegro | Las fallas externas del proveedor no están cubiertas por SQL |
| **F24** | CANDIDATO | PG#32, I49, H§§8–9,15: replay idempotente | No equiparar replay a protección de doble cargo real Stripe |
| **F25** | CANDIDATO | I49, H§§11,30–31: SSE/cursor/reconexión | Aprobar presentación y avisos en las tres superficies |
| **F26** | CANDIDATO | PG#12/#37–#50, I49: roles y denegación de cocina | Validar después el montaje ordinario con permisos mínimos |
| **F27** | CANDIDATO | PG#22/#35/I49, H§§25,27: auditoría sin motivo | Revisión independiente completa del ledger por secuencia |
| **F28** | BLOQUEADO | Chromium 36/36, visual gestión, capturas I49/CV-019 | Falta acta humana del diseño aprobado, vistas y caja |

**Balance F:** **26 CANDIDATO**, **1 PARCIAL/BLOQUEADO (F20)** y **1 BLOQUEADO (F28)**. Los 26 candidatos no están firmados, y F12 no deja de ser opt-in.

## 4. Acta R01–R10: estado individual, prueba atribuible y puerta no cubierta

| Criterio | Dictamen, NO cierre | Evidencia real / histórica | Falta para aceptar formalmente |
| --- | --- | --- | --- |
| **R01** | CANDIDATO | PG17 desechable 51/51 y migraciones | No equivale a Supabase operativo |
| **R02** | CANDIDATO | PG#11/#12/#37–#51: FORCE RLS, roles/capacidades | Custodia de secretos y revisión operativa M6 |
| **R03** | PARCIAL | PG#14/#20/#30/#32, coste cero 4/4, H§§22–26,32–33 | Carreras con Stripe sandbox y caja real no acreditadas |
| **R04** | PARCIAL | PG#23/#25, H§§16,23: rollback/denegación SQL | Proveedor externo/recovery operativo y fallos por fase |
| **R05** | PARCIAL | PG#22/#26/#31/#32, coste cero 4/4, H§§18–20 | Reconciliación/captura/refund/webhooks de Stripe sandbox |
| **R06** | CANDIDATO | PG#16/#17/#26/#33, I49, H§§28–31,34 | Validación operativa no acredita entrega física |
| **R07** | CANDIDATO | I49 y H§§11,30–31,34: SSE/replay/aislamiento | Observabilidad y recuperación de M6 no ensayadas |
| **R08** | CANDIDATO opt-in | PG#37–#51 e I49: HTTP/JWT/roles aislados | Proceso principal sigue health-only, sin cutover certificado |
| **R09** | BLOQUEADO | Chromium cliente 36/36, smoke gestión, capturas 390/1440, axe | No hay conformidad humana completa ni caja visual |
| **R10** | CANDIDATO TÉCNICO | 5/5 SUCCESS en SHA 36bda8f6; Node 1350/1350; PG17 51/51; 4/4 coste cero; cliente 36/36 | No autoriza operación ni corrige bloqueos F20/F28 |

**Balance R:** **6 CANDIDATO** (R01, R02, R06, R07, R08 opt-in y R10 técnico), **3 PARCIAL (R03–R05)** y **1 BLOQUEADO (R09)**. Son categorías de aceptación, **no porcentajes de avance**.

## 5. Hallazgos, contradicciones y riesgo residual

1. **F12/R08: montaje operativo todavía no disponible.** La comprobación de `apps/api/src/server.mjs` muestra solo `/health` y `/ready`. `apps/api/src/api-runtime-config.mjs` acepta únicamente `health-only`. Las rutas H3–H6 probadas son una composición **explícita/aislada** en el harness; seis logins y un I49 PASS **no** certifican un arranque ordinario.
2. **F20/R03–R05 y CV-008/CV-009: bloqueo externo y de producto.** Hay PG17 real y pruebas de captura incierta, webhook y efectivo **simulados**, pero no ensayo con proveedor Stripe **sandbox real** (autorización/captura/reconciliación/reembolso, doble cobro evitado) ni caja final con diseño aprobado y verificación económica del recorrido completo. No moverlos a candidato por CI.
3. **F28/R09 y CV-017: aprobación humana inexistente.** Las capturas y aserciones de 44 px/responsive/axe permiten detectar regresiones, pero no certifican identidad visual, fotografía licenciada, todos los viewports/estados ni la caja. La [matriz de diseño aprobada](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) distingue explícitamente componentes aprobados de baselines y recursos pendientes. No inventar firma.
4. **Intermitencia H6/M3 #49 no cerrada causalmente.** Un Bootstrap de `ef943174` [#42305060332](https://github.com/jdlc86/CartaViva/actions/runs/42305060332) terminó **50/51**, esperando `Cesta: 1` antes del QR, mientras los posteriores `92781a49` y `36bda8f6` aprobaron **51/51**. La estabilización de la persistencia en el test no demuestra la causa original de todas las apariciones. **Condición:** si vuelve a fallar, capturar estado del producto, catálogo, cesta, persistencia y navegación dentro del escenario integral antes de cambiar tiempos o selectores.
5. **CV-001/coste cero:** pruebas PG17 **4/4** y cierre económico por fin de ocupación acreditan un subalcance técnico, **sin** afirmar entrega física por estado `ready`/«Voy a recoger», cierre de otras cuentas, firma multicomensal completa ni aceptación global M1.
6. **Trazabilidad histórica:** §§7–36 de la matriz contienen ejecuciones pasadas relevantes para F06/F07/F10/F14/F21, etc. Esta acta **no** las convierte en ensayos nuevos del SHA `36bda8f6`. Mantener cada límite en §3.

## 6. Puertas de salida, responsable y decisión

| Puerta integral | Estado acreditable | Para cambiar a aceptación |
| --- | --- | --- |
| P1. Regresión técnica candidata (migraciones, roles, transferencia, dos PWA, HMAC, SSE, cero e idempotencia) | **CANDIDATO TÉCNICO VALIDADO** en el SHA indicado | No eliminar el seguimiento de intermitencia #49; conservar evidencia y repetir integrada ante cambios funcionales |
| P2. Recorrido funcional y visual por actores (F28/R09, CV-017, incluidos estados de caja) | **BLOQUEADO** | Revisión de pantallas reales frente a decisiones DV aprobadas, acta del propietario y correcciones integrales verificadas |
| P3. Economía (F20/R03–R05, CV-008/CV-009) | **PARCIAL/BLOQUEADO** | Diseño caja aprobado; credenciales de prueba autorizadas; sandbox Stripe real + PG17 + HTTP + PWA + conciliación/refund y reintentos |
| P4. Runtime H6 desde servidor ordinario, roles mínimos (F12/R08, CV-005) | **CANDIDATO solo opt-in** | Integración de arranque segura y autónoma contra PG17 **desechable**, sin habilitar servicio real ni tocar Supabase operativo |
| P5. Piloto/producción M6 | **NO-GO** | Preflight independiente, secretos/TLS/backup/recuperación/observabilidad, aislamiento total Fleetia/VPS y **autorización expresa de despliegue** |

**Decisión de la auditoría (07-11-2026):** **aceptación técnica del subalcance automatizado: CANDIDATO VALIDADO; aceptación funcional global H6: NO-GO; producción Sabora: NO-GO**. No cerrar ninguna fila F/R con este informe. **CV-003:** conciliación y acta documental efectuadas, pero la firma de aceptación de sus 38 puertas sigue pendiente; **M1/CV-001 continúan en curso**. El siguiente bloque implementable sin depender de Stripe ni de aprobaciones visuales es la **integración de arranque H6 segura y completa en un entorno desechable**, sin desplegar y con un único recorrido PG17 + HTTP + ambas PWA; esta recomendación no autoriza activación.

**Validación del propietario de producto:** PENDIENTE (sin nombre, firma, fecha de aprobación ni conformidad inventados). **Validación de caja:** PENDIENTE. **Stripe sandbox real:** NO EJECUTADO. **Despliegue:** NO AUTORIZADO.

**Límites permanentes:** solo `jdlc86/CartaViva`; ninguna fusión ni cierre de PR; no tocar `main`, Fleetia, otros proyectos, VPS compartido, Supabase operativo, Stripe real, contenedores ni redes compartidas. Un nuevo commit de esta **acta documental** tendrá un SHA diferente: la conclusión de 5/5 documentada corresponde expresamente al SHA `36bda8f6`, no se extrapola a ejecuciones posteriores.
