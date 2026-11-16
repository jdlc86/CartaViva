# Sabora / CartaViva — continuidad operativa de la sesión 41 (2026-11-16)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA NI AUTORIZACIÓN.** La fuente de verdad son los requisitos, contratos de arquitectura/diseño y políticas normativas versionados en GitHub. Los estados de pruebas se atribuyen únicamente al SHA y entorno comprobados. No asumir que un PR Draft forma parte de `main`, que una CI verde acredita operaciones reales, o que un comentario del autor equivale a revisión independiente.
>
> **Documento vivo de esta sesión:** añadir aquí únicamente hitos relevantes, con fecha, SHA, artefacto/PR, cambios efectivos, evidencias, límites y próximos pasos; no reabrir sesiones anteriores ni multiplicar documentos paralelos. Comprobar el estado actual de GitHub antes de cada operación.

## 1. Cadena de continuidad y fuentes

- [Sesión 40 — continuidad anterior, en rama del PR #59](SESSION_40_HANDOFF_2026-11-14.md). Su cierre S40-9/S40-11 fija el orden vigente y el primer avance OFF-3; las secciones previas sustituidas no son el plan actual.
- [Tablero vivo de seguimiento](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), especialmente §§97–99, como registro transversal, sin sustituir los contratos.
- **Fuentes normativas prevalentes:** [requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [consistencia contractual](../architecture/SABORA_CONTRACT_CONSISTENCY_V1.md), [contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md), [registro de aprobación visual](../design/APPROVAL_REGISTER.md), [puertas de autorización](../SABORA_AUTHORIZATION_GATE.md) y [método normativo de validación/observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md). Los cambios normativos del PR #60 son candidatos **hasta integración**, no sustituyen automáticamente los de `main`.
- [Issue #61 — encargo y decisiones explícitas del circuito económico](https://github.com/jdlc86/CartaViva/issues/61).
- [PR #59 — M6 gobernanza, dos copias y publicación de dos PWA](https://github.com/jdlc86/CartaViva/pull/59), con [runbook S40](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md) y [acta S40](../reviews/SABORA_S40_THREE_PRIORITIES_IMPLEMENTATION_CLOSURE_2026-11-14.md).
- [PR #60 — OFF-3, conciliación integral del circuito económico](https://github.com/jdlc86/CartaViva/pull/60). La versión económica del tablero/documentos normativos está **en su propia rama** y se tendrá en cuenta al reconciliar la integración, sin sobrescribir las actualizaciones independientes del PR #59.

**Ubicación de este documento:** rama `docs/sabora-dual-backup-vps-offsite-20261113` / PR #59, para continuar la cadena S40 sin crear otro PR. El PR #60 es una rama diferente; los enlaces a su SHA y evidencias son referencias cruzadas, no incorporación de su código. Al integrar ambos PR se debe reconciliar explícitamente el tablero y cualquier archivo compartido; no permitir que el último merge borre actualizaciones de la otra rama.

## 2. Orden de trabajo aprobado que sigue vigente

1. **OFF-3 — primera prioridad de desarrollo:** cerrar requisitos funcionales reales, por hitos completos y contra normativa; no reproducir módulos ya integrados, no inventar políticas faltantes.
2. **OFF-2 — validación transversal:** PG17, HTTP real, cliente y gestión Chromium, accesibilidad y capturas cuando proceda; distinguir CI/entorno de laboratorio de aceptación humana y operativa.
3. **OFF-1 — puerta de revisión/integración:** revisión independiente y decisión informada sobre PR #59 y sobre el delta final del PR #60 antes de cualquier integración; solo corregir hallazgos verificables y obtener autorización expresa de merge.
4. **OFF-4 — condicionado al equipo doméstico:** completar configuración y custodios de la copia externa; recuperar desde ella y replicar ciphertext al VPS solo cuando existan acceso, aislamiento y autorizaciones particulares.

La preferencia operativa vigente es **trabajar fuera de VPS/SSH** mientras no exista acceso legítimo y autorizado. M6/activación queda NO-GO. No hay autorización nueva de merge, migraciones Supabase, operación sobre VPS, DNS, Cloudflare, copia real, restauración o despliegue.

## 3. S41-1 — corte GitHub e hito económico de Codex (16-11-2026)

### Estado real del repositorio (consulta de GitHub)

| Objeto | Estado comprobado | Límite |
| --- | --- | --- |
| `main` | base de ambos PR: `59866219971a78237d14d7820d9b18a086ac2bfc` en las lecturas de PR | No contiene por ese hecho los cambios Draft de #59/#60. |
| [PR #59](https://github.com/jdlc86/CartaViva/pull/59) | `OPEN / Draft / mergeable`; HEAD antes de documentar S41: `5bba8b4d4dfadcaa11c70b359f325283f6058125` | Gobernanza, backup y despliegue solo candidatos de laboratorio; revisión independiente y operación pendientes. El commit documental S41 cambia su HEAD sin convertirlo en código funcional nuevo. |
| [PR #60](https://github.com/jdlc86/CartaViva/pull/60) | `OPEN / Draft / mergeable`, sin merge; HEAD exacto `4ba655459dfe22a5cfd0a50f842000567e7919fc` | Candidato económico, no incorporado en `main`. GitHub no registra revisiones formales del #60 al corte. |

**Cambio funcional del PR #60:** se ha reemplazado/superado la propuesta inicial de devoluciones presenciales de S40-10/S40-11 con la conciliación acordada en [Issue #61](https://github.com/jdlc86/CartaViva/issues/61): momento de pago (`al pedir` / `al final`) independiente del canal; **Stripe como única fuente de movimientos monetarios de Sabora**; pagos/devoluciones por caja externa fuera de la app, con elección, comprobación y cierre estrictamente *operativos*, no registros de dinero. Incluye consumo individual/mesa, ajustes, cierre auditado, controles de pago previo, reembolsos Stripe ligados al pagador/cargo original, dashboard que separa consumo operativo de recaudación Stripe acreditada, API, dos PWA y migración **candidata número 100** con RLS/ACL. No afirmar que Stripe remoto, caja externa o la aplicación pública estén probados en funcionamiento real.

Codex indica haber corregido seis fallos diferenciados (permiso `EXECUTE`, identidad operativa de cliente, coordinación de refund, cierre duplicable, mesa histórica y clasificación errónea de replay). Su optimización de `scripts/ci/catalog-postgres17-node-driver-smoke.sh` reutiliza un PG17 ya migrado, Chromium y `pg@8.16.3`; admite selectores `all`, `h6` e `i49` con validación temprana, pero conserva la suite completa por defecto y la usa para el SHA final. La cardinalidad de migraciones en prueba de no-superusuario se deriva del inventario auditado, evitando un número fijo. Estas son afirmaciones respaldadas por el cambio y el [comentario de cierre](https://github.com/jdlc86/CartaViva/pull/60#issuecomment-6918713771), no un juicio independiente de seguridad.

### Evidencia observada: 7/7 controles aplicables del mismo SHA

| Control | Resultado | Evidencia |
| --- | --- | --- |
| `validate` — PG17, HTTP, Chromium, builds, aislamiento y Compose | **PASS, 16m22s** | [CI job](https://github.com/jdlc86/CartaViva/actions/runs/43879670011/job/133341867617) |
| `generate-lockfile` y recorrido económico I49 | **PASS, 10m29s** | [Bootstrap job](https://github.com/jdlc86/CartaViva/actions/runs/43879669927/job/133341868574) |
| `pg17-nonsuperuser` | **PASS**, 100 migraciones del candidato y límites de privilegios | [Job](https://github.com/jdlc86/CartaViva/actions/runs/43879669916/job/133341867827) |
| PWA cliente Chromium | **PASS** | [Job](https://github.com/jdlc86/CartaViva/actions/runs/43879670022/job/133341867547) |
| PWA gestión Chromium | **PASS** | [Job](https://github.com/jdlc86/CartaViva/actions/runs/43879670111/job/133341868706) |
| Instalabilidad de las dos PWA | **PASS** tras repetición selectiva del mismo SHA | [Job](https://github.com/jdlc86/CartaViva/actions/runs/43879669947/job/133344941334) |
| `functional-ui-gate` | **PASS** | [Job](https://github.com/jdlc86/CartaViva/actions/runs/43880385400/job/133344390851) |

**Dos omisiones legítimas, no PASS:** `visual-final-acceptance-gate` (requiere baseline y aprobación humana) y `cv005-b2-disposable-integration` (opt-in histórico no activado). En instalabilidad PWA hubo una carrera transitoria del service worker (`active` sin `controller`) que se resolvió con rerun del mismo SHA y sin modificación; registrar el antecedente sin declarar defecto funcional nuevo ni ocultarlo. Evidencias consolidadas en el [comentario final del PR](https://github.com/jdlc86/CartaViva/pull/60#issuecomment-6918713771).

**Dictamen de S41-1:** `IMPLEMENTADO EN RAMA`, `PRUEBAS INTEGRADORAS AUTOMATIZADAS PASS 7/7 APLICABLES`, `VALIDACIÓN DE LABORATORIO ACREDITADA PARA ESAS SUITES`; `REVISIÓN INDEPENDIENTE NO ACREDITADA`, `ACEPTACIÓN VISUAL HUMANA PENDIENTE`, `STRIPE REMOTO NO VALIDADO`, `INTEGRACIÓN EN MAIN NO REALIZADA` y `OPERACIÓN REAL NO VALIDADA`. «Sin bloqueos técnicos reales» solo puede aplicarse al corte de laboratorio del #60; no al GO de activación de Sabora.

## 4. Bloque siguiente: cierre de integración sin PRs redundantes

1. **Revisión diferencial realmente independiente del PR #60** sobre `4ba65545` con atención a concordancia normativa y escenarios de Issue #61, seguridad de identidad/roles/RLS, pago previo y cierre, idempotencia, webhooks/compensaciones, matriz de las dos PWA y persistencia económica. No repetir de oficio las siete puertas verdes; aportar archivo/línea, gravedad, escenario y prueba del fallo si hay hallazgo.
2. **Evaluar integración segura de #60 y #59:** ambas ramas parten de `main@59866219` y modifican, entre otros, documentación de seguimiento; contrastar árboles, dependencias, migraciones y orden de integración. La indicación `mergeable=true` de GitHub para cada PR no equivale a prueba de convivencia **después** de fusionar uno. Una vez autorizado el merge que corresponda, comprobar el árbol integrado y su batería pertinente. Ningún merge está autorizado por esta continuidad.
3. **Continuar OFF-3 por brechas verificadas:** CV-014 reservas, CV-013 Excel/atribución, CV-008 Stripe sandbox externo, CV-015 Gemini y CV-016 directorio, según normativa y estado real de implementación. Separar límites por decisión, proveedor y privacidad de lo ya resuelto en #60. No deducir reglas de reservas, retención, atribución empresarial, modelo/coste Gemini ni claves Stripe.
4. **Retener M6 como NO-GO operativo:** antes de primera activación siguen pendientes acceso administrado no dependiente de Gateway, `forced-command` Sabora-only, red ingress/egress aislada, 8443 verificado, copia cifrada real externa en ordenador doméstico y restauración real, réplica VPS exclusiva, SQL/roles y autorizaciones específicas, observabilidad y rollback. Dos URL previstas: `https://sabora.allaiso.com:8443` y `https://gestion-sabora.allaiso.com:8443`. No interpretar esas direcciones como servicio Sabora ya desplegado.

## 5. Límites de seguridad y operaciones

- **Fleetia y cualquier otro proyecto del VPS son intocables.** Desplegar, reiniciar o borrar Sabora jamás debe detener, modificar o depender de sus contenedores, redes o recursos. No usar Docker global, proxy/80/443 compartidos, usuario ajeno o cambio global en el host como atajo.
- No realizar merge, modificación SQL en Supabase operativo, captura/restauración real, ingreso VPS, cambios DNS/Cloudflare, secretos, red ni despliegue sin la autorización expresa que requiera su propia puerta. La creación de este documento tampoco concede permisos.
- No compartir claves de cifrado, certificados privados, identidades sensibles ni credenciales en el repositorio, Actions o chat. La copia externa obligatoria reside en equipo doméstico independiente; la segunda es ciphertext en espacio exclusivo Sabora del VPS. No proclamar que las copias existen sin verificarlas.
- Esta sesión no ejecutó nuevos tests, inspección del VPS, consulta a Supabase ni operación de Stripe; verificó resultados ya publicados en GitHub. Las evidencias de terceros o de fecha posterior se añadirán con su procedencia exacta.

## 6. Registro incremental de hitos de la sesión 41

| Hito | Fecha | Estado | Evidencia principal | Próxima puerta |
| --- | --- | --- | --- | --- |
| **S41-1**: corte documental y verificación del hito económico PR #60 | 2026-11-16 | **Candidato de laboratorio 7/7 PASS; Draft sin merge** | [SHA #60](https://github.com/jdlc86/CartaViva/commit/4ba655459dfe22a5cfd0a50f842000567e7919fc) · [comentario final](https://github.com/jdlc86/CartaViva/pull/60#issuecomment-6918713771) | Revisión independiente y evaluación de convivencia e integración |
| **S41-2 y siguientes** | Pendiente | **No ejecutado** | Añadir solo tras evidencia real | Anotar código / suites / revisión / aceptación / operación por separado |

**Regla de mantenimiento:** en cada hito importante, actualizar **este documento y la fila correspondiente del tablero vivo** en la rama de trabajo pertinente, enlazar SHA y Actions, y reconciliar al integrar ramas. Un cambio documental `[skip ci]` no hereda ni renueva la validez de un test anterior. Las decisiones futuras se incorporan solo cuando están expresamente aprobadas, nunca por inferencia.

## S41-2 — conciliación previa de recuperación PG17 y ramas #59/#60 (16-11-2026)

**Hallazgo material de integración:** #59 y #60 divergen de `main@59866219971a78237d14d7820d9b18a086ac2bfc`, con modificaciones comunes en `scripts/ci/catalog-postgres17-node-driver-smoke.sh`, el runbook S38 y el tablero vivo. Ambos son `mergeable=true` por separado, lo que **no garantiza** resultado ni CI del árbol combinado. El PR #60 agrega la migración SQL 100; la prueba de restauración cifrada del PR #59 rechazaba toda cuenta distinta de 99 y exigía un ledger igual a `'99'`, por lo que **un merge simple produciría regresión del gate de restauración**.

**Corrección de compatibilidad integrada en el mismo PR #59, sin PR adicional:** `sabora-dual-backup-postgres17.mjs` obtiene la lista exacta desde `buildMigrationAudit(root)`, que exige cobertura individual del registro de migraciones revisadas. Conserva el mínimo histórico de 99 y comprueba que cada elemento corresponde al SHA256 del archivo; el ledger de restauración se compara contra el número real auditado en el mismo árbol, y el recibo declara esa cifra. Se modifica el contrato de prueba S40 para rechazar el `99` fijo y comprobar el registro de auditoría, y se aclara en el runbook S40 que el hito previo de 99 es histórico, no un máximo normativo. No se debilita cifrado/AAD, comparación de inventarios, controles negativos de roles o restauración externa.

**Evidencia y alcance al publicar:** revisión estática de archivos exactos y preparación del cambio en rama #59; **CI combinada no ejecutada ni acreditada** al redactar. Tras el commit verificar en GitHub Actions el nuevo SHA de #59; una ejecución verde de #59 solamente prueba sus 99 migraciones actuales. Para acreditar las 100 y todo el producto integrado hace falta el SHA que contenga **ambos PR** y las baterías PG17/HTTP/Chromium/recuperación correspondientes. No se realizó merge, operación Supabase, VPS, Fleetia ni despliegue.

**Puerta de integración:** mantener evaluación independiente real sobre ambos deltas, confrontación de normas económicas y gobernanza, resolución conservadora de los tres archivos superpuestos, comprobación de roles/SQL 100 y pruebas del árbol combinado antes de dar GO de integración en `main`. No mezclar un GO de GitHub con GO operativo M6.

## S41-3 — candidato integrado #59 + #60 en la rama existente (16-11-2026)

**Integración entre ramas, no en main:** se combinan como dos progenitores el PR #59 `a9ccf1ff` y el PR #60 `4ba65545` sobre la base común `main@59866219`. Se conservan los 83 cambios del #60 y las capacidades de gobernanza, doble copia y publicación del #59; los tres archivos comunes se resuelven expresamente: catálogo PG17 con selector #61 y restauración cifrada total; runbook S38 con doble copia y 18/23 slots del nuevo contrato; tablero vivo con entradas económicas y toda la cadena S40/S41. El ensayo de restauración compara inventario auditado para 99 históricos o 100 en el candidato conjunto.

**Evidencia pendiente:** CI del nuevo SHA integrado, pruebas PG17/HTTP/Chromium, recuperación, permisos, build, UI y aislamiento. Ninguna CI previa de cada rama certifica el nuevo árbol. El PR #60 sigue Draft sin fusionar en main; la posible fusión posterior necesita revisión y decisión explícita. Sin operación SQL de Supabase, VPS, Fleetia ni despliegue.

## S41-4 — CI integral final del árbol combinado #59 + #60 (16-11-2026)

**SHA funcional exacto:** [`1b70069195cab6ac53ec6857809869c1056ec80b`](https://github.com/jdlc86/CartaViva/commit/1b70069195cab6ac53ec6857809869c1056ec80b), commit de dos progenitores en la rama Draft del PR #59. GitHub Actions comprobado nuevamente el 16-11-2026: **8/8 controles aplicables `completed/success`, 0 fallos**:

| Job | Resultado, evidencia |
| --- | --- |
| `validate` | **SUCCESS** [Sabora CI #43888424272](https://github.com/jdlc86/CartaViva/actions/runs/43888424272), final 14:57:30Z; H6/PG17/HTTP/Chromium, contratos, builds, Compose, seguridad e aislamiento completaron sus pasos |
| `generate-lockfile` | **SUCCESS** [Bootstrap #43888424825](https://github.com/jdlc86/CartaViva/actions/runs/43888424825), final 14:52:23Z; migración PG17, driver SQL loopback, integración y ensayo de restauración cifrada del catálogo completaron su paso compuesto |
| `pg17-nonsuperuser` | **SUCCESS** [#43888424411](https://github.com/jdlc86/CartaViva/actions/runs/43888424411), candidato con inventario 100 migraciones |
| `client-browser` | **SUCCESS** [#43888424383](https://github.com/jdlc86/CartaViva/actions/runs/43888424383) |
| `management-browser-smoke` | **SUCCESS** [#43888424304](https://github.com/jdlc86/CartaViva/actions/runs/43888424304) |
| `two-pwa-installability` | **SUCCESS** [#43888424318](https://github.com/jdlc86/CartaViva/actions/runs/43888424318) |
| `web-publication` | **SUCCESS** dentro de [#43888424272](https://github.com/jdlc86/CartaViva/actions/runs/43888424272): TLS de laboratorio, nftables efímero y actuación Docker estrictamente Sabora en runner |
| `functional-ui-gate` | **SUCCESS** [#43888424295](https://github.com/jdlc86/CartaViva/actions/runs/43888424295) |

**Dos puertas intencionalmente SKIPPED, no PASS:** aceptación visual exacta humana y `cv005-b2-disposable-integration` opt-in histórica. En el job `web-publication`, los pasos de creación y conservación de un paquete para `main` se omitieron correctamente porque esta ejecución procede de PR y no de un `push` a `main`; no existe paquete liberado por esta ejecución.

**Resultado limitado:** código unido en rama, suite automatizada conjunta **PASS** en GitHub Actions y restauración de laboratorio dentro del paso PG17 finalizado. **NO** es despliegue real, Stripe sandbox remoto, backup externo doméstico real, validación visual por el propietario, revisión independiente de código, aceptación de seguridad contra amenazas no cubiertas, integración en `main` ni autorización SQL/host. Los PR #59/#60 permanecen abiertos Draft en este corte.

**Próxima decisión de integración:** revisión independiente del SHA combinado, contraste con normativa económica Issue #61 y gobernanza, decisión explícita de fusión con metodología que no duplique el merge del #60 (ya contenido como segundo progenitor del commit #59), y verificación de `main` tras integrar. No crear un tercer PR para copiar lo mismo ni usar el GO de código para levantar Sabora en VPS.

## S41-5 — revisión técnica propia S41-rv01 del árbol económico + release integrado (16-11-2026)

**Objeto exacto:** [código integrado `1b70069195cab6ac53ec6857809869c1056ec80b`](https://github.com/jdlc86/CartaViva/commit/1b70069195cab6ac53ec6857809869c1056ec80b). **Revisión publicada** en [PR #59, revisión COMMENT #5922255670](https://github.com/jdlc86/CartaViva/pull/59#pullrequestreview-5922255670) por la cuenta propietaria `jdlc86`; **NO es APPROVE independiente** ni revisión Codex externa. No se ejecutaron nuevos tests ni Stripe real; se inspeccionó código/normativa y las 8 puertas CI anteriores siguen PASS para ese SHA.

| Hallazgo | Prioridad | Soporte concreto | Dictamen |
| --- | --- | --- | --- |
| **S41-rv01/P1-01**: captura Stripe acreditada sin comprobar importe efectivo ni moneda | **P1, bloqueante de merge** | `apps/api/src/h6-stripe-adapter.mjs:88-97`; `apps/api/src/economic-circuit-service.mjs:10-19`; `20261115115624_*.sql:421-454,892-905` | El `succeeded` y `ch_...` bastan para reducir todo `intent.amount_cents` incluso ante una respuesta de importe distinto. Conciliar `amount_received`/EUR y vínculo al cargo exacto en servicio y webhook, con pruebas negativas |
| **S41-rv01/P1-02**: devolución Stripe sin contrastar cantidad/cargo original | **P1, bloqueante de merge** | `h6-stripe-adapter.mjs:106-116`; `economic-circuit-service.mjs:45-56`; SQL `:773-812`; `h6-stripe-webhook.mjs:69-78` | Se acepta `refund.succeeded` por ID/estado y se liquida nominalmente el importe solicitado sin cotejar `refund.amount`, `charge`, moneda. Confrontar datos reales del proveedor antes de marcar incidencia `resolved` |
| **S41-rv01/P2-03**: estado de caja incompleto en cuentas con canales o devoluciones mixtos | **P2** | SQL `:507-543` selecciona una sola liquidación reciente por cuenta; `CashView.tsx:105-112` muestra su estado como distintivo global | Proyectar cada intento o agregado explícito; una captura con devolución pendiente no debe pasar a `SIN LIQUIDACIÓN` |

**Caso negativo propuesto antes de merge:** consumo 2200 céntimos, respuesta Stripe con `status=succeeded`, `ch_...` correcto pero `amount_received=1000`; hoy el adaptador no comprueba ese importe y SQL acredita 2200. Devolución solicitada de 800 céntimos con respuesta `succeeded` por 100 céntimos u otro `charge`; hoy el adaptador no verifica esos datos y SQL puede cerrar expediente. **No afirmar que esas respuestas se produjeron con Stripe real**: son riesgos reproducibles mediante fixtures de proveedor, aún no ensayados por esta revisión.

**Dictamen de integración:** `NO-GO de merge` en el corte hasta reparar ambos P1, hacer prueba negativa focalizada por invariante, repetir una única batería integral del SHA reparado y revisar el delta. Conservar el PR #59 como rama integradora; no abrir más PR ni duplicar #60. S41-rv01 no satisface la puerta de aprobación formal independiente; si la normativa la exige, mantenerla pendiente. M6 sigue NO-GO operativo por Stripe sandbox real, aceptación visual y autorizaciones de backup/SQL/VPS/host. Fleetia intocable.


## S41-6 — corrección integrada P1-01/P1-02/P2-03: candidato de revisión (16-11-2026)

**Motivo:** revisión propia [S41-rv01](https://github.com/jdlc86/CartaViva/pull/59#pullrequestreview-5922255670) del SHA `1b700691`, que detectó 2 P1 de integridad económica y 1 P2 de representación de caja. **Estado de este nuevo hito: código y pruebas nuevas publicados como candidato; CI del nuevo SHA y aceptación independientes PENDIENTES. No afirmar PASS antes de su evidencia.**

- **P1-01, captura:** el adaptador lee `amount_received`, `currency` e identificador `PaymentIntent` de la respuesta Stripe; el servicio exige coincidencia con importe exacto, EUR e intento persistido y registra `unknown` ante cualquier incongruencia. La RPC PostgreSQL de captura ahora exige `p_provider_amount_cents` y `p_provider_currency` iguales a los del intento antes de rebajar deuda (incluidas repeticiones); el request captura devuelve `amountCents` del intento. Webhook firmado transfiere importe/moneda y la RPC rechaza eventos económicos con discrepancias, preservando la ruta histórica por propietario. No se cambia la atribución de cobros externos.
- **P1-02, devolución:** el adaptador toma `refund.amount`, `refund.currency` y `refund.charge`; el servicio exige original idéntico antes de registrar `succeeded`. La RPC PostgreSQL rechaza discrepancias también en replay, antes de resolver incidencia o alimentar el stream financiero. La ruta webhook `refund.updated` comprueba cantidad/moneda y sigue vinculando `charge` al cargo del intento; `unknown` no equivale a reintegro.
- **P2-03, sala/caja:** SQL de personal devuelve `settlements[]` por cada asignación/intento (sin `LIMIT 1` como fuente única de la pantalla), manteniendo campos legacy en el wire. Contrato gateway valida cada liquidación; PWA gestión presenta estados por canal/intento, incluidos captura Stripe con devolución pendiente y externo pendiente, con verificación operativa por ID de intento. E2E cliente/gestión y fixtures actualizadas.
- **Pruebas nuevas:** unitarios negativos de importe parcial, moneda/cargo incompatibles y ausentes, más PG17 económico con webhooks incorrectos antes de éxito correcto; se conserva la batería completa H6/100 SQL, RBAC/RLS, Chromium y la restauración cifrada #59.

**Puertas:** revisión de código del delta y Actions sobre SHA nuevo, posible corrección si fallan; GO de merge no automático. Persiste ausencia de Stripe sandbox remoto y aprobación visual humana. El experimento no toca Supabase operativo, VPS, Cloudflare, Fleetia ni `main`.

## S41-7 — revisión técnica propia S41-rv02 del SHA corregido (16-11-2026)

**Revisión formalizada como `COMMENTED`, NO APPROVE independiente:** [revisión GitHub #5922856161](https://github.com/jdlc86/CartaViva/pull/59#pullrequestreview-5922856161), exacta sobre [`13d2ff406e3b534e72dc2dcde529b9a015a9bfb4`](https://github.com/jdlc86/CartaViva/commit/13d2ff406e3b534e72dc2dcde529b9a015a9bfb4). La persona revisora sigue siendo la propia cuenta autora. Se inspeccionó el delta de 16 archivos desde `cb973aa6`, normas económicas del Issue #61, ambas rutas de pago H6 y económica, adapter de Stripe, webhook firmado, PG17/SQL 100, RBAC/RLS y vista de caja.

**Reevaluación de rv01:** P1-01/P1-02 del circuito nuevo *pago al final* están protegidos en código por comparación exacta de `amount_received`, `currency='eur'`, PI, cargo original e importe de refund, con negativas unitarias y PG17. El P2 de caja ahora lista intentos y estados y evita ofrecer cierre en refund pendiente; SQL servidor ya impide cerrar con obligaciones económicas pendientes. **Estas observaciones no constituyen aprobación Stripe remoto ni PASS CI final.**

**S41-rv02/P1-04 — reembolso económico rompe por tipo `bigint`**: `economic-circuit-service.mjs:59–68` pasa `request.amount_cents` directamente a `stripe.refund`; el SQL `request_economic_stripe_refund_candidate` declara `amount_cents bigint` y `pg` lo entrega como string (el test PG17 compara `refundProof.amount_cents==='500'`); el adapter exige `Number.isSafeInteger` y genera `invalid_stripe_refund` antes de contactar Stripe. El mock de integración no verifica tipo; la ruta H6 anterior sí usa `Number(requested.amount_cents)`. **Bloqueante para funcionalidad real de reembolso.** Corregir conversión solo después de validación decimal/entero seguro e introducir test de solicitud real `'500'`.

**S41-rv02/P1-05 — conciliación monetaria incompleta en H6 `pay_now`**: `h6-payment-orchestrator.mjs:18–97`, SQL histórico `20261027122858_*.sql:759–790,1464–1501,1516–1558`, `h6-stripe-webhook.mjs`: autorizaciones/capturas/devoluciones admitidas por estado/ID sin cotejar importe/moneda/cargo en todos los caminos, incluidos recuperación y webhook firmado. SQL económico #100 delega H6 antiguo `SQL:866–875` sin nuevos campos monetarios. **El Issue #61 obliga a proteger también `pagar al pedir`**, no solo `pagar al final`. Resolver con migración **nueva y auditada** que reemplace funciones H6 selladas y con comprobaciones en servicio/webhook, sin reescribir SQL histórico y con PG17/HTTP negativos por diferencias de importe/currency/identidad.

**S41-rv02/P2-06 — reconciliación de `requires_capture` sin `latest_charge` expandido**: `h6-stripe-adapter.mjs:36–45` consulta `GET /v1/payment_intents/{id}` sin expansión; `captureBefore` exige atributos del objeto `latest_charge`, que Stripe declara campo expansible y devuelve como ID por defecto. Posible `stripe_capture_deadline_missing` y bloqueo de una deuda incierta; verificar con fixture HTTP realista y corregir petición/expansión y estados. [Referencia Stripe oficial](https://docs.stripe.com/api/payment_intents/object).

**Estado CI al publicar revisión:** 6/8 aplicables SUCCESS para `13d2ff40` (PG17 no-superusuario, UI funcional, dos PWA, publicación web laboratorio, navegadores cliente y gestión); `validate` y `generate-lockfile` todavía `in_progress`; dos puertas opt-in SKIPPED (aceptación visual y CV-005 B2). No atribuir 8/8 PASS a `13d2ff40` por el verde anterior de `1b700691`. Consulta [Actions](https://github.com/jdlc86/CartaViva/actions) y revalida **exactamente** el SHA final antes de cualquier GO.

**Dictamen:** NO-GO de merge `main` con **dos P1 nuevos y un P2**. Corregir conjuntamente en el PR integrador #59, con pruebas negativas de invariantes y batería integral única del SHA reparado; preservar el segundo progenitor #60 y evitar otro PR. Revisión independiente real y aceptación visual siguen pendientes; sin despliegue, ni SQL Supabase operativo, ni VPS/Fleetia.

## S41-8 — hito correctivo integral S41-rv02, Issue #61 / H6 (16-11-2026)

**Origen normativo:** `docs/REQUISITOS_FUNCIONALES.md` y `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, ambos momentos de pago, dinero Stripe exclusivo, fallo cerrado, identidad del pagador/charge original e idempotencia. Revisión [S41-rv02](https://github.com/jdlc86/CartaViva/pull/59#pullrequestreview-5922856161). **El alcance de este hito es código de la rama Draft #59**: no hay despliegue ni SQL aplicado al Supabase operativo.

- **P1-04:** normalización decimal estricta `bigint` de PostgreSQL a entero seguro antes de llamar a Stripe para devolución `pay_at_end`; se rechazan nulos, signos, decimales, ceros y valores mayores de `Number.MAX_SAFE_INTEGER` sin invocar proveedor.
- **P1-05:** protección integral `pay_now`: el orquestador valida importe efectivo, moneda EUR, PaymentIntent y cargo original en autorización/captura/reembolso/recuperación; no marca éxito si hay evidencia discordante. **Migración 101 candidata nueva**, `20261116210000_sabora_h6_provider_money_evidence_candidate.sql`, con cinco primitivas selladas de solicitud/lectura/captura/reembolso/webhook y retirada al rol proveedor de EXECUTE sobre los *recorders* y el webhook antiguo. Las funciones H6 históricas se conservan intactas, accesibles por el propietario NOLOGIN de los wrappers, sin cambiar sus migraciones ni los saldos durante la migración. El webhook de Issue #61 reutiliza el mismo ledger y deduplicación, pero ahora verifica también la ruta H6. Inventario `migration-audit.mjs` ampliado y examinado de manera estática; incluye negativos PG17 de importes/currency en ambas transiciones y replays.
- **P2-06:** `retrieve` solicita explícitamente `expand[]=latest_charge` al proveedor para conocer `payment_method_details.card.capture_before`; fixture HTTP inspecciona la query y la recuperación tras estado incierto. No se introdujo sondeo periódico.
- **Pruebas:** negativos de importes/currency/cargos, economía `bigint` realista, permisos PG17 (viejas RPC sin EXECUTE), round-trip cliente/gestión/HTTP/Chromium y backup-restauración cifrada con 101 SQL se encomiendan a las acciones del SHA final. **No afirmar que hayan pasado antes de ver su resultado**. La aceptación humana visual, Stripe sandbox remoto y revisión independiente mantienen puertas separadas.

**Situación:** implementación publicada para evaluación en PR #59, #60 preservado como progenitor; `main` no modificado. El resultado técnico depende de ejecución de Actions y revisión del delta; si falla se reparará en el mismo PR. Queda prohibido alterar Fleetia, otros contenedores, VPS o Supabase operativo.

## S41-9 — diagnóstico e integración complementaria de compensación (16-11-2026)

**Evidencia Actions del SHA `17ca77c1`:** `pg17-nonsuperuser` PASS con **101 migraciones**, `functional-ui-gate`, `client-browser`, `management-browser-smoke`, `web-publication` PASS. El gate de dos PWA **falló en el primer intento** por `cv012_service_worker_control_missing` con `/sw.js` ya activated pero sin controller, y fue **SUCCESS tras rerun del mismo SHA** (sin modificar PWA). `validate` y `generate-lockfile` **FAIL** por el mismo test integrador [PG17 B3 seis logins](https://github.com/jdlc86/CartaViva/actions/runs/43949653245): el mock de `requires_capture` omitía importe/moneda, por lo que el servicio corregido devolvía `authorization_unknown` en lugar de inferir captura. Se corrige el **fixture** introduciendo exactamente `amount:700,currency:'eur'` y el webhook `amount_received:700,currency:'eur'`. No se relaja la verificación real.

**Segunda vía de integridad detectada al recorrer todas las escrituras H6:** el `record_h6_capture_compensation_candidate` histórico podía persistir `refund_required` y generar tentativa de devolución desde el rol proveedor con solo un `chargeId`. La migración candidata #101 incorpora una **sexta** función SQL sellada `record_h6_capture_compensation_verified_candidate` que verifica importe/currency/PaymentIntent ante compensación y repetición, delegando después al legado atómico; retira el `EXECUTE` runtime de la vía sin evidencia, actualiza repositorio/orquestador/preflight y añade negativo PG17 por importe divergente. Mantiene propietario NOLOGIN y un solo ledger Stripe.

**Estado del hito:** cambios implementados y publicados en el PR #59, batería *del nuevo SHA* pendiente. La CI previa no basta para aprobar este nuevo cambio. No fusionar `main`, no aplicar migración Supabase operativo ni intervenir VPS/Fleetia.

