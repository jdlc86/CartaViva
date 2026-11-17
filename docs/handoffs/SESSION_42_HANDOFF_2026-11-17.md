# Sabora / CartaViva — continuidad operativa de la sesión 42 (2026-11-17)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA, APROBACIÓN NI AUTORIZACIÓN.** Las fuentes de verdad son los requisitos, contratos de arquitectura/diseño, normas de validación/seguridad y puertas de autorización versionadas en GitHub. Este documento registra contexto, evidencias por SHA y trabajo pendiente; no modifica reglas aprobadas. Comprobar el estado real de GitHub y del entorno antes de cada operación.
>
> **Regla de mantenimiento S42:** actualizar este mismo archivo y el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) solo al completar hitos importantes con evidencias y enlaces. No abrir nuevas ramas/PR para fragmentos del mismo hito; no inventar PASS, aceptación, restauraciones, Stripe real ni despliegues.

## 1. Cadena de continuidad y jerarquía documental

- **Sesión anterior:** [S41 — continuidad operativa (16-11-2026)](SESSION_41_HANDOFF_2026-11-16.md); su último apartado, S41-13, documentó el **encargo** de revisión, antes de recibir el resultado.
- **Resultado que cierra aquella dependencia y abre S42:** [informe independiente Codex S41 del PR #59](../reviews/SABORA_S41_CODEX_INDEPENDENT_REVIEW_PR59_2026-11-16.md), publicado en la [rama del PR #59](https://github.com/jdlc86/CartaViva/pull/59) y acompañado de comentario en el PR. Dictamen **NO-GO / REQUEST CHANGES** para merge y **NO-GO** para despliegue.
- [Sesión 40 — continuidad y orden OFF-3/OFF-2/OFF-1/OFF-4](SESSION_40_HANDOFF_2026-11-14.md); [tablero vivo de ejecución](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), que es seguimiento y no normativa.
- **Normativa prevalente:** [requisitos](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [consistencia contractual](../architecture/SABORA_CONTRACT_CONSISTENCY_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [registro de aprobación visual](../design/APPROVAL_REGISTER.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [metodología de validación y observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) y [AGENTS.md](../../AGENTS.md).
- **Economía:** [Issue #61 — decisión y escenarios económicos](https://github.com/jdlc86/CartaViva/issues/61), [PR #60 — circuito económico](https://github.com/jdlc86/CartaViva/pull/60), contenido genealógicamente en [PR #59 — rama integradora](https://github.com/jdlc86/CartaViva/pull/59). No crear un segundo merge de #60.

**Ubicación de S42:** `docs/handoffs/SESSION_42_HANDOFF_2026-11-17.md`, **en la rama existente del PR #59** `docs/sabora-dual-backup-vps-offsite-20261113`, sin crear PR adicional. Este archivo comienza un nuevo periodo documental; no desplaza ni reescribe retrospectivamente S41. Si una futura integración afecta a archivos comunes, reconciliar el tablero, normativa y continuidad antes de darla por cerrada.

## 2. Corte comprobado al inicio de S42 — 17-11-2026

| Objeto | Evidencia y estado | Límite |
| --- | --- | --- |
| `main` | SHA `59866219971a78237d14d7820d9b18a086ac2bfc` | No contiene los candidatos #59/#60; **ningún merge observado** en este corte. |
| [PR #59](https://github.com/jdlc86/CartaViva/pull/59) | `OPEN / Draft / merged=false / mergeable=true`; HEAD previo a crear S42: [`d044981a8d18bda823cb43320b73582d69efed52`](https://github.com/jdlc86/CartaViva/commit/d044981a8d18bda823cb43320b73582d69efed52) | HEAD posterior cambiará por commits **solo documentales**; `mergeable` no implica seguridad ni autorización. |
| [PR #60](https://github.com/jdlc86/CartaViva/pull/60) | `OPEN / Draft / merged=false`, HEAD [`4ba655459dfe22a5cfd0a50f842000567e7919fc`](https://github.com/jdlc86/CartaViva/commit/4ba655459dfe22a5cfd0a50f842000567e7919fc) | Ya es ancestro de #59: **no fusionar por segunda vez**. |
| Código combinado probado | [`e34956444f901ec6ee2dbf4f2f434d55ea5488e7`](https://github.com/jdlc86/CartaViva/commit/e34956444f901ec6ee2dbf4f2f434d55ea5488e7) | **8/8** controles aplicables `SUCCESS` en CI/laboratorio del SHA; **dos opt-in SKIPPED** (visual final humana y CV-005 B2). No cierran defectos que las fixtures no cubren. |
| Migraciones SQL | Candidatas **100 y 101** incluidas en #59, auditadas y ejercitadas en PG17 desechable | **No aplicadas** a Supabase operativo por esta secuencia de trabajo. |
| Revisión independiente Codex | Informe de 16-11-2026 sobre HEAD revisado `f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0` | **NO-GO / REQUEST CHANGES**; sin código corregido en ese informe. |
| Activación M6 | **NO-GO** | Sin Stripe sandbox remoto validado, copias doméstica/VPS reales restauradas, driver host autorizado/aislado, aceptación visual humana ni autorización operativa. |

Las pruebas y estados de esta tabla son **evidencia histórica localizada**, no CI de un hipotético SHA correctivo S42. Esta creación documental no ejecuta pruebas, no aplica migraciones, no opera Stripe, no prueba Windows, no cambia despliegues ni acredita aceptación.

## 3. Dictamen independiente recibido: hallazgos abiertos

La [revisión Codex](../reviews/SABORA_S41_CODEX_INDEPENDENT_REVIEW_PR59_2026-11-16.md) examinó la integración #59/#60 y distinguió los fallos demostrados de los riesgos todavía no operativos:

| ID | Gravedad | Estado de evidencia | Condición a reparar |
| --- | --- | --- | --- |
| **P1-07** | **P1 bloqueante de merge** | **Confirmado y reproducido**: evento válido y firmado `payment_intent.amount_capturable_updated` con `latest_charge: "ch_..."` produce HTTP 400 | El webhook no debe exigir que Stripe entregue el objeto expandido; consultar evidencia fiable sin inferir importe, cargo, PI, plazo ni éxito. |
| **P2-08** | P2 cobertura | **Confirmado**: fixture principal usa objeto expandido | Añadir envelope/evento Stripe realista, versión y recorrido HMAC + Fastify HTTP + adapter + PG17, negativos y replay. |
| **P2-09** | P2 backup | **Defecto estático confirmado; concurrencia de producción no ensayada** | Los componentes del backup no comparten instantánea y `sourceProjectRef` se declara sin probar materialmente que la conexión sea la aprobada. |
| **P2-10** | P2 gobernanza offline | **Reproducido en Windows**: firmador devuelve exit 0 sin actuar | Normalizar detección del entrypoint y probar fallo cerrado y firma real con claves de test en Windows/Linux. |

**Reparaciones previas verificadas por Codex en el candidato:** P1-01, P1-02, P1-04, P1-05, P2-03 y P2-06, con los límites descritos en el informe. La solución REST `expand[]=latest_charge` de P2-06 **no** corrige el webhook P1-07. No se ha demostrado ningún P0 nuevo ni que haya ocurrido un cobro real incorrecto; tampoco hay autorización para asumir ausencia de otros fallos.

## 4. Próximo hito integral S42 — un único PR y cuatro bloques de cierre

**Objetivo:** convertir el candidato #59 en un candidato revisable **sin defectos conocidos P1/P2 del informe**, preservando todas las invariantes del Issue #61 y las fronteras de seguridad M6. Trabajar por bloques completos, no por micro-PR ni correcciones desligadas. El siguiente orden es planificación documentada, **no afirmación de implementación**:

### Bloque A — webhook Stripe íntegro, recuperable y probado (primero, P1-07/P2-08)

- Inspeccionar composición Fastify/webhook/adapter/repositorio y la versión API Stripe fijada; después de HMAC válida, aceptar tanto `latest_charge` ID como objeto expandido, sin confiar en contenido no verificado.
- Decidir explícitamente entre consulta puntual síncrona autenticada (alternativa acotada recomendada en el informe) e inbox durable; **ninguna alternativa queda aprobada por el mero hecho de estar en este handoff**.
- Acreditar PI, cargo exacto, pagador/correlación de pedido, importe, EUR y `capture_before` sin inventar fecha; fallo de proveedor o dato incierto permanece **reintentable/unknown** sin descontar deuda ni despachar.
- Pruebas de integridad: firma inválida → rechazo; evento string y expandido → misma conciliación correcta; proveedor caído → 503/reintento; PI/charge/order/importe/moneda/plazo incongruentes → fallo cerrado; duplicados/eventos fuera de orden → un solo efecto idempotente. Recorrer HMAC raw + HTTP realista + PG17 y conservar rutas de captura/refund existentes.

### Bloque B — respaldo coherente y origen verificado (P2-09)

- Elegir y documentar **antes de implementar** la estrategia entre `pg_export_snapshot()`/`pg_dump --snapshot` con inventario en la misma instantánea, o quiescencia autorizada de escrituras **solo Sabora** con pruebas de identidad y ausencia de concurrencia. No asumir que una estrategia ya fue aprobada.
- Definir la vinculación verificable de conexión/base/proyecto real al manifiesto/AAD, versión y ledger; tratar los roles globales de clúster separadamente del snapshot de base. Mantener compatibilidad explícita y el STOP de bundles históricos no aptos para recuperación real.
- Ejercitar escritor concurrente, DDL y ledger cambiante, origen incorrecto con etiqueta aparentemente válida, restauración cifrada desde réplica externa desechable y negativos de corrupción/clave; medir RPO/RTO **solo cuando se realice el ensayo pertinente**.
- La intención de dos copias sigue vigente: **primaria externa en equipo doméstico** y **segunda réplica del mismo ciphertext en ubicación exclusiva Sabora del VPS**, pero ninguna se acredita creada por pruebas CI.

### Bloque C — firma offline interoperable (P2-10)

- Reparar el entrypoint Node Windows usando rutas de fichero correctas o una CLI separada, conservando firma Ed25519, vencimiento, exact SHA, nonces/one-use y fallo cerrado.
- Probar procesos subprocess sin argumentos → exit no-cero; con material de test → artefactos esperados `.json/.sig/.pub.pem`; pruebas de firma/alteración/expiración y comportamiento en Windows real antes de declararlo validado. No usar claves privadas operativas ni publicar secretos.

### Bloque D — aceptación técnica y propuesta de integración

- Revisar diferencialmente A–C respecto al SHA previamente validado, con evidencia de archivo/línea y pruebas de escenarios de fallo.
- Tras completar el código correctivo, ejecutar **una batería integradora final sobre un único SHA**: PG17 con 101 migraciones auditadas (o inventario realmente vigente), no-superusuario/RLS/ACL, HTTP/Fastify/H6/Stripe, Chromium cliente y gestión, accesibilidad y gate UI, instalabilidad de PWA, backup/restore, builds, aislamiento y release de laboratorio.
- Registrar explícitamente `SUCCESS`, `FAIL`, `SKIPPED` e `IN_PROGRESS` por SHA y job; las dos puertas opt-in no se convierten en PASS por omisión.
- Solicitar **revisión independiente del delta correctivo**; un comentario del autor no equivale a `APPROVE`. Solo después de un dictamen favorable y **autorización expresa del propietario** evaluar una única integración de #59 en `main`, sin fusionar de nuevo #60, y comprobar el árbol/CI posterior.

**No iniciar OFF-3 adicional (CV-014 reservas, CV-013 Excel/atribución, CV-008 Stripe externo, CV-015 Gemini, CV-016 directorio) como duplicación de este trabajo:** recuperar primero puertas del candidato económico y luego escoger brechas normativas verificadas por hito integral. OFF-2 acompaña al desarrollo con pruebas integradoras; OFF-1 decide revisión/merge; OFF-4 queda condicionado al ordenador doméstico, acceso y autorizaciones.

## 5. Puertas separadas de merge y de activación

**Merge de código — NO-GO actualmente.** Requiere corrección con pruebas y revisión independiente de P1-07/P2-08/P2-09/P2-10, evaluación de reglas normativas vigentes, CI final del árbol combinado, ausencia de regresión y **autorización expresa de integración**. `mergeable=true` o un 8/8 de SHA anterior no son GO. La fusión no puede duplicar #60 ni sobrescribir el tablero compartido.

**Activación operativa M6 — NO-GO independiente del merge.** Además de la puerta anterior: validar Stripe sandbox remoto/endpoints/webhooks; identidad, roles y recuperación de Supabase autorizados; copia real cifrada en equipo externo y ensayo real de restauración; eventual réplica ciphertext VPS Sabora-only; preflight material de servidor, `forced-command`, redes ingress/egress, TLS y TCP/8443; observabilidad, readiness y rollback probados; aceptación humana visual de ambas PWA y **autorizaciones específicas** de secretos, copia, red, SQL, VPS y despliegue. Las URL `https://sabora.allaiso.com:8443` y `https://gestion-sabora.allaiso.com:8443` son destinos previstos, **no evidencia de servicios publicados**.

**Límite absoluto:** el VPS se comparte con Fleetia. Desplegar, parar, reiniciar o eliminar Sabora **no debe detener, modificar, utilizar ni depender** de contenedores, redes, puertos compartidos, proxy, certificados o recursos de Fleetia ni de otro proyecto. No usar Docker global, 80/443 compartidos ni modificaciones de host como atajo. Ninguna operación sobre Supabase operativo, Gateway/SSH, VPS, DNS, Cloudflare, credenciales o backup real se autoriza por este documento.

## 6. Registro vivo de hitos de la sesión 42

| Hito | Fecha | Código | Pruebas/evidencia | Decisión/pendiente |
| --- | --- | --- | --- | --- |
| **S42-0 — apertura documental y recepción del dictamen Codex S41** | 17-11-2026 | **Sin cambios funcionales ni SQL** | [Informe independiente](../reviews/SABORA_S41_CODEX_INDEPENDENT_REVIEW_PR59_2026-11-16.md), [PR #59](https://github.com/jdlc86/CartaViva/pull/59) y corte de GitHub; no se ejecutaron nuevas pruebas ni operaciones | **NO-GO** de merge/despliegue; reparar P1-07 y P2-08/09/10 en #59, con revisión y CI final |
| **S42-1 y sucesivos** | Pendiente | **No ejecutado** | Registrar SHA, rutas, PR, runs, casos negativos y entorno cuando exista evidencia | No dar por completado ningún bloque antes de verificarlo |

**Instrucción para la siguiente actualización:** cotejar estado actual de GitHub antes de actuar; conservar el historial previo, añadir únicamente hitos relevantes con SHA y evidencias reales, actualizar [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) sin duplicar documentación, y no convertir un commit `[skip ci]` en prueba del candidato funcional. Este documento no sustituye el informe independiente ni la normativa.


## S42-1 — corrección conjunta en rama #59: Stripe, firma Windows y backup coherente V2 (17-11-2026)

**Objeto:** [PR #59 Draft](https://github.com/jdlc86/CartaViva/pull/59) que conserva #60 como ancestro. **Código en rama, no merge ni despliegue.** No se tocaron Supabase operativo, VPS, Fleetia ni otros proyectos.

**P1-07/P2-08, candidatura de reparación:** [commit inicial de Stripe `4fd02f3e`](https://github.com/jdlc86/CartaViva/commit/4fd02f3e2fda95cfc7a43fcc57102ced27473ad7) introduce aceptación estructural del Charge ID después de comprobar HMAC raw. El handler recupera evidencia puntual desde Stripe inyectado, exige identidad PaymentIntent/Charge, importe exacto, EUR, pedido y fecha `capture_before`, y devuelve 503 reintentable si no hay prueba; no persiste éxito a partir del ID. Tests Node Fastify firmados incluyen objeto expandido, string, proveedor caído/cargo errado y replay. [Commit `4d9095d2`](https://github.com/jdlc86/CartaViva/commit/4d9095d2e5964ce37d93f50cb9e937cf17c34105) añade el recorrido de evento firmado y no expandido hacia el **repositorio PostgreSQL 17 real y sellado**; [`38e7f2fa`](https://github.com/jdlc86/CartaViva/commit/38e7f2fa9a92ccb49a6578f80abb1287caa35c3d) mantiene precisión de segundos Stripe en la aserción.

**P2-10, candidatura de reparación:** [`cfe63836`](https://github.com/jdlc86/CartaViva/commit/cfe638363cab7c995567b903f98d93dbff2971dd) cambia `URL.pathname` por `fileURLToPath`, exige recibo ACL NTFS en Windows y crea un test subprocess de firma real con clave Ed25519 de prueba. El primer `validate` y `generate-lockfile` en CI **falló (1468/1469)** por descubrir una segunda incidencia en el propio firmador: `process.argv.slice(2).map(resolve)` transmitía índice/array adicionales a `path.resolve`; [`eb92efd1`](https://github.com/jdlc86/CartaViva/commit/eb92efd14134d5cd00eb9a889a058b1d01996a34) sustituye el mapeo por `value=>resolve(value)`. No afirmar validación Windows real sin ejecución en el equipo Windows del custodio.

**P2-09, candidatura de reparación:** [coordinador de snapshot `6ab16237`](https://github.com/jdlc86/CartaViva/commit/6ab1623713eae1b141061abdf39df7f6e2ffdc20), [bundle cifrado V2 `63953c33`](https://github.com/jdlc86/CartaViva/commit/63953c33e65f76c24ccbda77ab03ffb6e1ad4fc9), [CLI con pin de origen `c7301193`](https://github.com/jdlc86/CartaViva/commit/c7301193efdfebc40079f0fe56a7995e0306a8e8), [CI PG17 con snapshot `bacfbf82`](https://github.com/jdlc86/CartaViva/commit/bacfbf82496975222634327c2ac45504019a2049). `pg_export_snapshot` mantiene abierta la transacción; ambos `pg_dump --snapshot` y el inventario importan el mismo snapshot, con comparaciones adicionales ante cambios de secuencias/roles. El manifiesto V2 vincula `snapshotId`, `sourceSystemIdentifier` y base al AAD. La CLI requiere host directo Supabase bajo `verify-full`, CA y system identifier **aprobado independientemente**; los overrides de conexión están prohibidos, con negativos [`545b58f5`](https://github.com/jdlc86/CartaViva/commit/545b58f540a3dae43a34f1c2d84cbfa73898b253). V1 queda como artefacto/fixture histórico y **no es opción de captura operativa**. La ruta pooler todavía no está habilitada para la prueba material de origen, y no se ha ensayado el origen Supabase real.

**Pruebas observadas — NO apropiarse de verdes anteriores:** al registrar inicialmente, varias acciones largas de los SHAs nuevos seguían en curso/cola. El SHA anterior `cfe63836` tuvo `validate`/`generate-lockfile` **FAIL** por el error del test/CLI ya corregido. El `bacfbf82` mostró otro FAIL en `validate` en un test CV-014 de anuncios (`initialPublic.items.length=0` frente a 1), cercano al cambio de día UTC; **no está demostrada su causa ni corresponde asumir regresión de S42 o transitoriedad sin contraste**. Es obligatorio comprobar la batería **del SHA funcional final `38e7f2fa...`**, los jobs y sus logs antes de concluir el hito; no convertir una ejecución parcial o [skip ci] posterior en éxito.

**Estado inequívoco:** `CÓDIGO CORRECTIVO PUBLICADO EN RAMA`; `BATERÍA FINAL AÚN NO ACREDITADA`; `REVISIÓN INDEPENDIENTE DE DELTA PENDIENTE`; `ACEPTACIÓN/OPERACIÓN REAL NO ACREDITADAS`. El P1/P2 se consideran **pendientes de cierre verificado** hasta el resultado de CI + revisión. Sin nuevos PR, sin merge, sin despliegue.

**Siguiente puerta:** leer resultados `validate`, `generate-lockfile`, PG17-no-superuser, HTTP/Chromium, instalación PWA, UI, web-publication, backup/restore; corregir únicamente fallos reproducidos en #59, repetir batería SHA final, revisión independiente formal y decisión expresa del propietario sobre integración. Documentar caso por caso cualquier bloqueo no relacionado. Fleetia intocable.


### S42-1a — ensayo adicional de concurrencia PG17 y portabilidad de fixtures (17-11-2026)

La [prueba integradora `e67601d6`](https://github.com/jdlc86/CartaViva/commit/e67601d6052fb77ba608cc2e6f12239e944e325d) añade al ensayo de backup una transacción `pg_export_snapshot()` viva; confirma en PostgreSQL 17 desechable que una escritura de fila y un DDL **confirmados después de exportar** son visibles para lectura corriente pero invisibles para otra sesión que importe el mismo snapshot, y verifica que el identificador de clúster incorrecto se rechaza. Solo ejercita recursos desechables de Sabora; **su aprobación depende de la CI de ese SHA**. La [corrección de portabilidad `150ec742`](https://github.com/jdlc86/CartaViva/commit/150ec74249e597d88d52ba47a38a9bc5375ff7b7) utiliza rutas absolutas derivadas de `tmpdir()` también en los negativos de respaldo, para evitar fixtures POSIX falsamente inaplicables en Windows.

**Trazabilidad:** SHA último de cambio runtime `38e7f2fa`; último SHA con nuevas pruebas `150ec742`. Ninguno modifica `main`. Los checks de `38e7f2fa` observados en la consulta anterior tenían 6/8 controles aplicables `SUCCESS`, `validate` y `generate-lockfile` todavía en curso; la prueba adicional de concurrencia requiere el resultado del SHA `150ec742` para acreditar su efectividad. Las dos puertas opt-in continúan `SKIPPED`, no `PASS`. Mantener NO-GO hasta verificar el corte final exacto y obtener revisión independiente.


### S42-1b — corte verificable de la batería del SHA de pruebas final (17-11-2026)

**Objeto exacto:** [SHA de pruebas `150ec74249e597d88d52ba47a38a9bc5375ff7b7`](https://github.com/jdlc86/CartaViva/commit/150ec74249e597d88d52ba47a38a9bc5375ff7b7). Último runtime distinto: `38e7f2fa...`. En la consulta GitHub: `pg17-nonsuperuser`, `client-browser`, `management-browser-smoke`, `two-pwa-installability`, `functional-ui-gate` **SUCCESS (5/8 aplicables)**; `validate` y `generate-lockfile` **IN_PROGRESS (2/8)**; `web-publication` **FAIL (1/8)**, [job #133711732354](https://github.com/jdlc86/CartaViva/actions/runs/43985284091/job/133711732354). Las dos opt-in visual final y CV005 B2 continúan `SKIPPED`.

**Diagnóstico acotado, NO resolución:** el fallo de `web-publication` fue `sabora_nft_lab_stop:expected_reachable:ingress_allowed_pre`, **antes de instalar el filtro nftables** en el namespace desechable. Las dos compilaciones PWA y el smoke TLS de laboratorio pasaron previamente dentro del mismo job. El script `sabora-nftables-enforcement-lab.sh` da cinco sondeos con 0,2 s de espera al iniciar varios servidores efímeros. **Hipótesis:** carrera de arranque/ruta/red del runner; no está demostrada. No rebajar los controles de aislamiento ni atribuir el FAIL a infraestructura productiva/Fleetia. Un reintento selectivo **del mismo SHA** debe esperar a que termine su ejecución global; GitHub devuelve 403 si se solicita mientras el workflow sigue en marcha.

**Puerta de cierre:** *NO-GO* hasta comprobar logs/resultados finales de `validate` y `generate-lockfile`, repetir focalmente `web-publication` y resolver causa si el error persiste. No hay revisión independiente del delta correctivo ni autorización para integración/operación. No declarar 8/8; los FAIL previos de otros SHA tampoco se ocultan ni se adjudican automáticamente al nuevo.


### S42-2 — estabilización del laboratorio de red y Windows real (17-11-2026)

Se publica [`748d86a9`](https://github.com/jdlc86/CartaViva/commit/748d86a961dd6aa63e64d56fc2d18110e9ec8440) sobre `scripts/ci/sabora-nftables-enforcement-lab.sh`: antes del test de enrutamiento, comprueba que todos los procesos efímeros realmente sirven su endpoint; mantiene las negativas y el firewall strict fail-closed, introduce espera acotada **solo** en positivos previos y añade diagnóstico de namespaces/rutas si falla. El fallo anterior `expected_reachable:ingress_allowed_pre` de `150ec742` sucedió **antes de instalar reglas**; no correspondía a evidencia de un fallo de red real de Sabora, pero sin repetición no podía atribuirse con certeza a carrera de arranque.

[`a424f2f1`](https://github.com/jdlc86/CartaViva/commit/a424f2f1f68222a961bf3396535c18d4bd814513) añade un job **Windows 2022** que ejecuta `tests/sabora-governed-deployment.test.mjs` en el sistema Windows real del runner usando **solo clave Ed25519 desechable**. [Job Windows #133718599553](https://github.com/jdlc86/CartaViva/actions/runs/43987286465/job/133718599553): **SUCCESS, 5/5 tests PASS**, incluida la CLI que antes salía 0 silenciosamente; no verifica ACL operativa del equipo doméstico. [`web-publication` #133718599033](https://github.com/jdlc86/CartaViva/actions/runs/43987286465/job/133718599033): **SUCCESS** con prueba de aislamiento nftables, restauración de reglas y controlador Docker desechable. Sus `validate`/`generate-lockfile` resultaron **FAIL** por un test estático de orden de ejecución: el job Windows había quedado delante del guard del lockfile (test `tests/ci-order.test.mjs`). Se corrige **sin cambiar ni desactivar ese test** moviendo Windows detrás del `validate` histórico en [`e2b6faa8`](https://github.com/jdlc86/CartaViva/commit/e2b6faa8d37ea6217f32c2dd5cbe7cabbbfac893).

**Batería observada de `e2b6faa8` al redactar:** **6/9 aplicables SUCCESS** (`pg17-nonsuperuser`, `windows-offline-signer`, `client` y `management` se contabilizan solo cuando sus jobs acaban; en el corte actual: `pg17-nonsuperuser`, `windows-offline-signer`, `web-publication`, `management-browser-smoke`, `two-pwa-installability`, `functional-ui-gate` = **6 SUCCESS**; `client-browser`, `validate` y `generate-lockfile` aún `IN_PROGRESS`). Las puertas opt-in de visual final y CV-005 B2 siguen `SKIPPED`; no son PASS. **No declarar hito cerrado** hasta estado final de todos los checks por SHA. [Ver Actions](https://github.com/jdlc86/CartaViva/commit/e2b6faa8d37ea6217f32c2dd5cbe7cabbbfac893/checks).

Se preparó [encargo S42 de revisión independiente](../assignments/CODEX_S42_POST_CORRECTIONS_INDEPENDENT_REVIEW_PR59_2026-11-17.md) para que Codex reexamine críticamente el delta correctivo y publique dictamen en #59 con SHA; **no es una revisión ya ejecutada**. Sin nueva aceptación independiente, sin merge ni despliegue, sin uso de Stripe/Supabase operativos y sin operación sobre VPS/Fleetia.


### S42-3 — puente GitHub Issues ↔ Antigravity y primer encargo (17-11-2026)

Se incorporó en la rama existente [PR #59](https://github.com/jdlc86/CartaViva/pull/59) un **contrato de entrada/salida para auditorías auxiliares** según el handoff aportado por el propietario (sin copiar scripts locales ni intervenir su Windows): [`scripts/ci/sabora-antigravity-audit-contract.mjs`](../../scripts/ci/sabora-antigravity-audit-contract.mjs), [tests de contratos](../../tests/sabora-antigravity-audit-contract.test.mjs) y [runbook de integración](../integrations/SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md). Se comprueban campos JSON permitidos, autor `jdlc86`, etiqueta `audit-request`, SHA de 40 caracteres para emisión, tipo, 1–25 rutas seguras, 0–10 preguntas acotadas, informe estructurado y SHA coincidente. Son **guardas del lado GitHub/ChatGPT**; no prueban los controles locales de `agy`, de Windows ni la autenticidad de un informe.

**Issue creado y leído de vuelta:** [#62 — Antigravity S42 / PR #59](https://github.com/jdlc86/CartaViva/issues/62), `OPEN`, autor real `jdlc86`, etiqueta real `audit-request`, único JSON v1.0, 17 rutas y 8 preguntas. SHA solicitado inicialmente `0cc138cf`; actualizado **en el mismo Issue** a [`ad07c4d7d0fc18e57f674d445a256ea24f7f2873`](https://github.com/jdlc86/CartaViva/commit/ad07c4d7d0fc18e57f674d445a256ea24f7f2873) tras corregir un defecto en la regex de lectura multilínea del contrato. En el SHA inicial `0cc138cf`, `validate` y `generate-lockfile` fallaron por **dos tests nuevos del parser**; se corrigió en `ad07c4d7`. **No trasladar verde de otro SHA ni asumir que el nuevo ya pasó**: consultar CI y registrar su conclusión cuando termine.

**Entrega de Antigravity: PENDIENTE.** No se ha ejecutado `agy` desde ChatGPT y no hay certificado el circuito Issue→Windows→Issue Comment hasta que el usuario arranque su orquestador local y se publique informe verificable. El test previo `local-dry-run` del handoff era sobre `main@59866219`, no sobre #59. El Issue auxiliar no reemplaza a Codex ni autorización del propietario; NO-GO merge/despliegue permanece. Nada de Supabase operativo, VPS, DNS, Fleetia o despliegue.


### S42-4 — primera auditoría publicada y recepción automática nominal de Antigravity (17-11-2026)

**Hito de interoperabilidad completado en ámbito nominal, no de seguridad integral:** se documenta la [guía permanente de futuras sesiones](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y se actualiza el [contrato del puente](../integrations/SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md). El [Issue #62](https://github.com/jdlc86/CartaViva/issues/62) **fue procesado manualmente** por el propietario y produjo un [informe Antigravity `GO_WITH_WARNINGS`](https://github.com/jdlc86/CartaViva/issues/62#issuecomment-6934523316) que considera reparados P1-07/P2-08/P2-09/P2-10, pero identifica `AUD-S42-001` y `002` **MEDIUM** (validación Stripe por pedido y snapshot de roles), `003`/`004` LOW y `005` INFO. **No declarar cerrados de manera independiente esos riesgos** ni convertir el veredicto en permiso de integración.

**Prueba automática mínima real:** [Issue #63](https://github.com/jdlc86/CartaViva/issues/63) creado con una sola ruta `AGENTS.md`, autor `jdlc86` y etiqueta `audit-request` a las `2026-11-17T01:11:18Z`; [comentario estructurado](https://github.com/jdlc86/CartaViva/issues/63#issuecomment-6934620403) con SHA `ad07c4d7d0fc18e57f674d445a256ea24f7f2873` y `GO` a `01:11:44Z`; etiqueta `audit-completed` a `01:11:46Z`. **Sin lanzamiento manual** de Antigravity en este segundo caso. Esto acredita que el **circuito nominal funciona** cuando el puente local está activo; **NO** acredita recuperación tras reinicio, no pérdida de webhooks, no duplicación de eventos ni autenticación/confinamiento reales del proceso Windows.

**CI del SHA auditado `ad07c4d7`: 9/9 jobs aplicables SUCCESS**, con `visual-final-acceptance-gate` y `cv005-b2-disposable-integration` `SKIPPED`. El PR #59 sigue Draft, no fusionado; Codex S42 independiente y aceptación real siguen pendientes. Actualizar esta continuidad por hitos completos, no microcambios; Fleetia, VPS y Supabase operativo intocados.
