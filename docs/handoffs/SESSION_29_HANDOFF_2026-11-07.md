# Sabora / CartaViva — continuidad operativa de la sesión 29 (2026-11-07)

> **DOCUMENTO VIVO DE CONTINUIDAD; NO ES NORMATIVA, ACTA DE ACEPTACIÓN NI AUTORIZACIÓN DE DESPLIEGUE.** Se abre para que la sesión 29 retome un hito completo sin perder contexto verificable. No confundir código implementado, pruebas ejecutadas, candidato técnicamente validado y funcionalidad aceptada.
>
> **Tablero vivo obligatorio:** [SABORA_LIVE_PROJECT_TRACKER — M1–M6 / CV-001–CV-019](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). **Matriz H6:** [F01–F28 / R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). **Relevo anterior:** [continuidad de la sesión 28 (2026-11-07)](SESSION_28_HANDOFF_2026-11-07.md), particularmente §§12–16. La sesión 26 no se reconstruye: el salto 25 → 27 fue deliberado.

## 1. Fuente de verdad y reglas de precedencia

1. **Contrato normativo funcional**, que se debe leer antes de modificar flujos económicos: [SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), especialmente «Cancelación y ajuste económico», «Pagos», «Stripe: autorización, captura, fallos y recuperación», «Política de pago de mesa» y «Seguridad y conciliación»; junto con [REQUISITOS_FUNCIONALES](../REQUISITOS_FUNCIONALES.md). **Una instalación Sabora atiende un único restaurante.**
2. **Diseño y flujos aprobados**: [DESIGN_SYSTEM_CONTRACT](../DESIGN_SYSTEM_CONTRACT.md), [APPROVED_VISUAL_STYLE_AUDIT_V1](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [DESIGN_REQUIREMENTS_V1](../design/DESIGN_REQUIREMENTS_V1.md). Las propuestas no se convierten en decisiones aprobadas por implementarse; Chromium/axe no sustituyen aprobación humana.
3. **Arquitectura, autorización y aislamiento**: [hoja de ruta técnica](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md) y [auditoría de aislamiento Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).
4. **Evidencias y seguimiento, NO normativa**: [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), [acta de aceptación H6](../reviews/SABORA_H6_FUNCTIONAL_ACCEPTANCE_ACT_2026-11-07.md), [informe de frontera M4](../reviews/SABORA_M4_TIPS_THIRD_PARTY_PAYMENT_INTEGRAL_BOUNDARY_2026-11-07.md), [pagador tercero en efectivo](../reviews/SABORA_M4_THIRD_PARTY_CASH_PAYER_REFUND_CANDIDATE_2026-11-07.md), [propinas presenciales](../reviews/SABORA_M4_CASH_TIPS_INTEGRAL_CANDIDATE_2026-11-07.md), [consulta económica y SCA](../reviews/SABORA_H6_PAYMENT_AUTH_STATE_CANDIDATE_2026-11-07.md) y sesión 28.

**Precedencia:** normativa NF/RF/DV y autorizaciones aprobadas > criterios vinculantes de aceptación > evidencia efectivamente ejecutada > tablero > handoffs históricos. No reinterpretar un contrato para obtener pruebas verdes ni promover automáticamente una fila F/R al estado CERRADO.

## 2. Punto de partida comprobado al abrir la sesión 29 — 07-11-2026

- **Repositorio autorizado:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). **Rama actual de trabajo:** `feat/sabora-cv012-independent-pwas-20261106`.
- [PR #49](https://github.com/jdlc86/CartaViva/pull/49): **OPEN / Draft**, base `integration/sabora-session23-m3-acceptance-20261106` ([PR #48](https://github.com/jdlc86/CartaViva/pull/48)). Consulta en GitHub: `mergeable=true`; **no equivale a permiso de fusionar**. Base observada: `ead7633bd9796324de88bb024583ad16944941e8`.
- **HEAD al consultar antes de crear este archivo:** [`9a6fac1716726fe2ec7be47e69b306685ae1d551`](https://github.com/jdlc86/CartaViva/commit/9a6fac1716726fe2ec7be47e69b306685ae1d551), commit **solo documental** (`docs(session28): close H6 5/5 integrated payment-state evidence [skip ci]`). Al crear esta continuidad el HEAD cambia: comprobarlo en la siguiente sesión. **No atribuir CI del SHA funcional al HEAD documental.**
- **Último SHA funcional con aceptación técnica integrada registrada:** [`d531f6e4a8d303c6eefe97a11fe956fdf9a158d3`](https://github.com/jdlc86/CartaViva/commit/d531f6e4a8d303c6eefe97a11fe956fdf9a158d3). **Cinco workflows SUCCESS para ese mismo SHA**: [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42410451412) (bloques 1/2A/2B, PG17, Fastify/HMAC, concurrencia y Chromium), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42410451276) (**51/51**, con B3 y transporte Stripe simulado), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42410451350), [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42410451548) e [instalabilidad y aislamiento de ambas PWA](https://github.com/jdlc86/CartaViva/actions/runs/42410451539).
- **Estado general:** candidato técnico aislado con PostgreSQL 17 desechable y composición HTTP opt-in; servidor ordinario `health-only` según la continuidad, sin activación certificada. **M4/F20/R03–R05 PARCIAL/BLOQUEADO; F28/R09 sin aprobación humana; M6 y producción NO-GO.** Ningún merge/despliegue ni cambio operativo está autorizado por este documento.

**Nota de cronología:** en la sesión 28 §15 y tablero §43 figuran dos workflows FAILURE para el SHA anterior `79ef87ba`. La reparación y prueba integral posterior están en sesión 28 §16/tablero §44, SHA `d531f6e4`, **5/5 SUCCESS**. Conservar ambos cortes como historia, no presentarlos como fallos actuales ni como certificación de Stripe remoto.

## 3. Hitos útiles realmente alcanzados

| Subalcance | Evidencia de implementación y prueba | Límite de validez |
| --- | --- | --- |
| **M1/H6 cambio de mesa y coste cero** | Matriz F01–F28/R01–R10 trazada 38/38; transferencias diferidas, cuentas por persona, cocina/sala, eventos y cierre por fin de ocupación con PG17/Fastify/Chromium en candidato. | 38/38 trazadas/auditadas **no** son aceptación humana 38/38. Las filas económicas y visuales conservan bloqueos. |
| **M2/M3 dos PWA y gestión** | Cliente y gestión instalables de forma separada; mesas, QR, catálogo, variantes CV-019, caja y dashboard ADMIN con pruebas integradas. | No equivale a validación real Android/iOS, aceptación de estilo ni puesta en servicio. |
| **Caja individual H6** | Cobro parcial en efectivo con lectura restringida y cierre separado, 5/5 CI de `21e01a9e`; política de modalidad fija por cuenta/visita validada en `265e56df`. | No acredita efectivo físicamente entregado ni pago digital. |
| **M3 dashboard financiero** | Agregados verificables ADMIN-only, control SQL/RLS/HMAC, 5/5 CI de `4c88b496`. | Informativo, no contabilidad fiscal; «Sin datos» cuando no existe evidencia. |
| **M4 pago presencial de tercero** | Identidad/consentimiento explícito de A, rondas positivas completas `pay_at_end` de B/C, asignación durable por cuenta, idempotencia y devolución presencial vinculada al pagador A; 5/5 CI de `9a7490d4`. | **Solo candidato de efectivo**; no confirma intercambio físico ni cubre pago multicuenta digital. |
| **M4 propinas presenciales** | Seis opciones normativas, «Sin propina» por defecto, cálculo servidor, libro de propina separado, devolución expresa a pagador original y dashboard ADMIN; 5/5 CI de `2a0bb5a6`. | **Solo efectivo**; no propinas digitales ni distribución laboral/fiscal certificada. |
| **H6 lector de estado económico/SCA** | GET de pedido propio autenticado por sesión/mesa/visita, respuesta mínima, no convertir callback SCA en pago, no reintentar con deuda incierta; 5/5 CI de `d531f6e4`. | Proveedor Stripe simulado donde aplica; **no** pagos, SCA/3DS, capturas o reembolsos bancarios auténticos. |

**No hay evidencia nueva de pruebas por la apertura de sesión 29.** Los SHA anteriores se citan por sus respectivos recorridos; no se mezclan suites de distintos commits.

## 4. Contratos económicos que no se pueden relajar

- Pago de un tercero: **intención autenticada del pagador**, selección acotada de deudas, asignación duradera por cuenta y reembolso al **pagador y medio originales**; no transferir la titularidad de la cuenta beneficiaria ni usar el mero QR como identidad financiera.
- La misma deuda no se cobra dos veces. Tentativa duradera e idempotente; resultado incierto bloquea **Stripe y efectivo** hasta evidencia del proveedor. Timeout, callback del navegador o recepción de evento sin conciliación **no** significan éxito/fallo final.
- Para `pay_now`, autorización previa y captura gobernada por la revisión y despacho a cocina, sin preparar antes de confirmación; webhook firmado/deduplicado; recuperación y compensación de estados no atómicos sin recapturas ni doble despacho.
- Para efectivo, «Pagar en caja» es intención reversible; únicamente la recepción de dinero anotada por rol autorizado liquida. Una devolución en efectivo es presencial, auditada y no se simula como Stripe.
- Propinas: exclusivamente **5 %, 10 %, 1 €, 2 €, 5 € o «Sin propina»**, sin entrada libre ni propina positiva preseleccionada; porcentajes tras descuentos, cálculo en servidor en céntimos y registro separado de ventas. La cancelación de consumo no devuelve automáticamente la propina.
- La modalidad **«Pagar ahora» o «Pagar al terminar»** se fija con la primera ronda positiva por cuenta/visita y no se reelige arbitrariamente. Los pedidos gratuitos no fijan modalidad; cambios de política de mesa no producen conversiones retroactivas.

Estas reglas proceden del [contrato normativo consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md); el handoff únicamente las recuerda para facilitar su lectura, **no añade decisiones de producto**.

## 5. Bloqueos y estado de aceptación

1. **M4 / F20 / R03–R05**: faltan credenciales y autorización **Stripe sandbox auténticas**, componente seguro cliente (Stripe.js/Elements según contrato y compatibilidad verificada), SCA/3DS remota, autorización/captura/webhook/reembolso real, conciliación y recuperación de incidentes; además pagos digitales multicuenta y propinas digitales con devolución al pagador/método originales. El receptor firmado con eventos simulados y los 5/5 no resuelven esta puerta.
2. **F28/R09 — visual**: validación humana de flujos, jerarquía visual, variantes, checkout, caja y dashboard de ambas PWA, contra estilo **aprobado**; probar accesibilidad y dispositivos pertinentes. No reemplazarla con capturas o smoke.
3. **M6 / F12/R08 y operación**: `health-only`, secretos y separación de identidades SQL, TLS, observabilidad, backups/restauración, arranque/parada/rollback aislados, preflight, dominios/orígenes y autorización expresa. No tocar VPS, contenedores, redes ni datos de Fleetia.
4. **M1 H6**: conservar distinción entre trazabilidad completa de matriz y firma de aceptación por cada F/R; evitar marcar como cerrado por arrastre de CI.
5. **M5 y otros CV**: funcionalidades normativas pendientes (reservas y operaciones/avisos, etc.) requieren contraste explícito del tablero y de los requisitos antes de elegir un bloque autónomo; no inventar una nueva prioridad como si estuviera aprobada.

**No hay GO de producción.** Nunca presentar como verificado que un usuario recibió efectivo, que un banco devolvió dinero o que un dispositivo instaló una PWA si solo existe ejecución simulada de CI.

## 6. Siguiente hito completo: secuencia de trabajo de la sesión 29

1. **Reconciliar sin duplicar**: comprobar HEAD/base/diff del PR #49 y ejecuciones sobre el SHA funcional efectivo; releer sesión 28 §§12–16, tablero §§39–44, la matriz y normativa NF/RF/DV. Verificar en código los conectores existentes antes de implementar. No confiar exclusivamente en el cuerpo del PR ni en este relevo.
2. **Ruta crítica condicionada a permiso externo**: si existen autorización expresa y credenciales **Stripe test** accesibles de manera segura, abordar **como hito integrado** el ciclo digital cliente → Fastify/roles → PostgreSQL 17 desechable → Stripe sandbox real → autenticación SCA si procede → webhook firmado → captura/cocina/ACK → asignación por pagador y beneficiario → reembolso al método original → conciliación/caja/dashboard. Incluir propinas y pagos de tercero según alcance normativo, con operaciones inciertas, reintentos, concurrencia y ausencia de doble cargo. No usar Stripe live ni fingir que el mock es proveedor real.
3. **Si la puerta Stripe no está disponible**, no bloquearse en un plan ficticio ni fragmentar las pruebas: escoger **un hito normativo autocontenido de M5 u otro subalcance completo** del tablero, con criterios de cierre claros; no declarar resuelto F20 por mejorar la interfaz de pago.
4. **Prueba principal integradora**: reutilizar/extender el escenario de valor PG17 + Fastify/JWT/HMAC + PWA cliente y gestión/Chromium + seguridad/roles + concurrencia + regresión H6/B3 **en el mismo SHA**. Pruebas aisladas solo para diagnosticar un fallo concreto o proteger un requisito crítico. Reparar causa raíz y relanzar el recorrido integral; prohibido debilitar aserciones o privilegios para conseguir PASS.
5. **Cierre del hito**: registrar implementación, suites efectivamente ejecutadas y concluidas (SHA y URLs), alcance técnicamente validado, evidencia del proveedor/entorno y aceptación humana todavía pendiente. Actualizar [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [matriz](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) e informe específico **cuando cambie materialmente el estado**. No cerrar globalmente M4/H6/M6 por un subalcance verde.

## 7. Límites innegociables de ejecución

- Trabajar **exclusivamente en `jdlc86/CartaViva`**, ramas/commits/PR Draft y CI autorizados; **sin merge a `main`**, cierre de PR históricos o cambio de base sin decisión expresa.
- **Sin autorización expresa**: no VPS, despliegue, reinicio, borrado, migración a Supabase operativo, secretos/credenciales reales, activación Stripe, gastos externos o cambios productivos.
- Sabora debe ser autónomo al iniciar, parar y eliminar: **jamás detener, modificar, reiniciar o depender de Fleetia ni de otros proyectos compartiendo VPS**. Validar aislamiento antes de cualquier propuesta de operación.
- Cumplir diseño y flujos aprobados y su aceptación independiente. Un hito de CI verde es una **candidatura técnica**, no aprobación de usuario ni operación.
- Resolver mediante hitos completos y pruebas de integración; evitar la metodología de microcorrecciones/micropruebas, salvo diagnóstico puntual justificado.

## 8. Registro de apertura — 07-11-2026

**Acción de esta apertura:** creación documental de la continuidad 29 a partir de la lectura directa de sesión 28, tablero §44, contrato económico normativo y PR #49. No se ha creado ni modificado código funcional, ejecutado nueva prueba, hecho merge ni desplegado por este relevo. El HEAD cambia solo por el commit documental `[skip ci]`; sus evidencias técnicas siguen perteneciendo al SHA funcional `d531f6e4`.

**Próximo registro:** únicamente un hito de implementación/prueba integral con evidencia verificable o una decisión externa que altere el bloqueo. Consignar fecha, SHA, PR, norma aplicable, entornos usados, workflows del **mismo SHA**, límites de validación y siguiente puerta. Conservar incidencias históricas y sus reparaciones; no editar la normativa mediante continuidad.

**Enlace obligatorio de ida al seguimiento:** [SABORA_LIVE_PROJECT_TRACKER](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). El tablero no sustituye la normativa.

## 9. Hito de gobernanza visual: bloqueo verificable de derivaciones no aprobadas — 07-11-2026

Se ha descubierto que el HTML de laboratorio con emojis y controles provisionales **no es la imagen original aprobada en chat**. En normativa DV y [pantalla cliente 18-10](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md) consta la aprobación de dirección premium y **composición** (logo/idioma, lupa, cesta, campana, carrusel sobre carta, categorías, QR central), **pero NO una captura maestra píxel-a-píxel aprobada**. La imagen original continúa sin recuperarse. En el código actual de React la región de anuncios `announcement-region` está oculta; las capturas Chromium no equivalen a aprobación visual.

**PR #50 Draft separado, apilado sobre #49:** [puerta de control visual](https://github.com/jdlc86/CartaViva/pull/50), rama `feat/sabora-visual-contract-governance-20261107`. Incorpora `AGENTS.md` vinculante para agentes, [índice de aprobaciones](../design/APPROVAL_REGISTER.md), [registro verificable](../design/APPROVAL_REGISTER.json), [procedimiento](../design/VISUAL_CONTROL_GATE.md), [workflow](../../.github/workflows/visual-contract-gate.yml), [validador](../../scripts/ci/visual-contract-gate.mjs), regresión integradora Git/API y plantilla de PR. La puerta distingue código de UI, políticas visuales y otros cambios, exige referencia PNG aprobada preexistente en rama base, SHA256, captura Chromium de mismo SHA y comentario de aprobación propietario para HEAD exacto. No permite que la misma PR UI se «autoapruebe» añadiendo un baseline.

**Evidencia verificada:** SHA de la primera prueba de la puerta `d3ed642bbd466feb73711d35d907760634e0983a`: [workflow #42414482139](https://github.com/jdlc86/CartaViva/actions/runs/42414482139), **5/5 pruebas integradoras del validador PASS**; paso de aprobación de PR **FAILURE esperado por ausencia de comentario humano**, no defecto de test. Las demás suites del SHA todavía estaban ejecutándose en este corte; se actualizará el estado solo si GitHub informa su conclusión. Los commits posteriores de seguimiento son documentales y **no heredan pruebas como si fueran su propio SHA**.

**Sin afirmar cierre o activación:** la puerta no se vuelve imprescindible para fusionar hasta que el propietario configure GitHub ruleset/branch protection y required check sobre los destinos; eso **no se ha hecho**. Las capturas maestras de cliente/gestión siguen `PENDING_EXACT_BASELINE`, sin comparación pixel-to-pixel. El propietario debe aprobar explícitamente los activos concretos; ningún agente puede simular su conformidad, ni siquiera con acceso a su cuenta GitHub. Mantener F28/R09 y producción NO-GO, sin merge/despliegue, sin Fleetia/VPS/Supabase operativo. [Tablero §45](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
