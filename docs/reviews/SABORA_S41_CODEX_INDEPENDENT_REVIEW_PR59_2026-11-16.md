# S41 — revisión independiente del PR #59 y propuestas de solución

**Fecha de corte:** 16-11-2026

**Repositorio único:** `jdlc86/CartaViva`

**PR revisado:** [#59 Draft](https://github.com/jdlc86/CartaViva/pull/59)

**Base:** `main@59866219971a78237d14d7820d9b18a086ac2bfc`

**HEAD exacto revisado:** `f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0`

**Último commit no documental:** `1cfba81216ea7a6bccb7fb9c3c4bc6e746c3856e` (prueba ejecutable); último cambio de runtime/SQL: `a1ec5434d5f418161637704908f651fc5c6c23a1`

**SHA con CI integrada:** `e34956444f901ec6ee2dbf4f2f434d55ea5488e7`

**PR #60 integrado genealógicamente:** sí; `4ba655459dfe22a5cfd0a50f842000567e7919fc` es ancestro de #59. No debe fusionarse por segunda vez.

## 1. Dictamen

**Dictamen técnico para merge: NO-GO / REQUEST CHANGES.** El hallazgo previo P1-07 queda **confirmado y reproducido independientemente**: un webhook Stripe firmado y válido de `payment_intent.amount_capturable_updated` se rechaza con HTTP 400 cuando `latest_charge` llega como el ID expandible ordinario `ch_...`. La CI verde no cubre esa representación.

**Dictamen para instalación/despliegue real: NO-GO.** Además del P1, la captura de backup no garantiza que sus componentes pertenezcan a una única instantánea ni vincula materialmente el `sourceProjectRef` declarado con la conexión real. Tampoco existen las dos copias reales, restauración externa, Stripe sandbox, aislamiento material/actuador host, aceptación visual humana ni autorización de despliegue. El código de host conserva el STOP deliberado.

El resultado por severidad es:

- **P0:** ninguno demostrado.
- **P1:** 1 confirmado (`P1-07`).
- **P2:** 3 elementos: cobertura Stripe insuficiente (`P2-08`, ya anticipado), consistencia/identidad del backup (`P2-09`, nuevo) y CLI de firma offline inoperante silenciosamente en Windows (`P2-10`, nuevo).
- **P3:** ninguno adicional demostrado. Las recomendaciones de endurecimiento del futuro driver host no se elevan a defecto actual porque la mutación de host no está conectada.

Este dictamen es técnico. **No es aprobación humana, autorización de merge ni autorización operativa.**

## 2. Preparación, genealogía y evidencia

### 2.1 Estado Git/GitHub comprobado

- `origin` fetch/push: `https://github.com/jdlc86/CartaViva.git`; no hay otro remoto.
- Rama local de revisión: `review/s41-pr59-independent`, basada sin reescritura en la rama remota del PR.
- El árbol estaba limpio antes de crear este informe.
- GitHub volvió a informar #59 `OPEN`, `Draft`, `MERGEABLE`, base `main`, cabeza remota exacta `f9f5adf...`.
- `git merge-base --is-ancestor 4ba6554... f9f5adf...` terminó con código 0: #60 ya está incluido.
- Entre el SHA de CI `e3495644...` y `f9f5adf...` solo cambian tres documentos: el encargo S41, la continuidad y el tablero. No hay cambio posterior de runtime, SQL o prueba.

### 2.2 CI heredada, no reejecutada localmente

Se consultaron de nuevo los check-runs del SHA `e3495644...`. Resultado: **8 aplicables SUCCESS y 2 opt-in SKIPPED**:

| Control | Resultado | Evidencia |
|---|---:|---|
| `validate` | SUCCESS | [job 133602899103](https://github.com/jdlc86/CartaViva/actions/runs/43953798016/job/133602899103) |
| `generate-lockfile` | SUCCESS | [job 133602900168](https://github.com/jdlc86/CartaViva/actions/runs/43953798275/job/133602900168) |
| `pg17-nonsuperuser` | SUCCESS | [job 133602898865](https://github.com/jdlc86/CartaViva/actions/runs/43953798004/job/133602898865) |
| `management-browser-smoke` | SUCCESS | [job 133602898530](https://github.com/jdlc86/CartaViva/actions/runs/43953797982/job/133602898530) |
| `client-browser` | SUCCESS | [job 133602899001](https://github.com/jdlc86/CartaViva/actions/runs/43953798028/job/133602899001) |
| `functional-ui-gate` | SUCCESS | [job 133602898622](https://github.com/jdlc86/CartaViva/actions/runs/43953798029/job/133602898622) |
| `web-publication` | SUCCESS | [job 133602899606](https://github.com/jdlc86/CartaViva/actions/runs/43953798016/job/133602899606) |
| `two-pwa-installability` | SUCCESS | [job 133602900186](https://github.com/jdlc86/CartaViva/actions/runs/43953798108/job/133602900186) |
| `cv005-b2-disposable-integration` | SKIPPED | [job 133602983128](https://github.com/jdlc86/CartaViva/actions/runs/43953797974/job/133602983128) |
| `visual-final-acceptance-gate` | SKIPPED | [job 133602901223](https://github.com/jdlc86/CartaViva/actions/runs/43953798029/job/133602901223) |

Esta evidencia prueba los laboratorios PG17/HTTP/Chromium/restore del propio SHA; no prueba Stripe remoto, Supabase operativo, custodias reales, VPS, Cloudflare ni aceptación humana.

### 2.3 Verificación propia ejecutada

| Comando/prueba | Resultado |
|---|---|
| Inventario diferencial completo `main...#59` | 74 archivos fuente/configuración/migración revisados, además de pruebas, normativa y documentación asociada. |
| `node <directorio-temporal>/p1-07-nonexpanded-latest-charge-poc.mjs` contra `verifyH6StripeWebhook`, cuerpo raw con HMAC válido, misma carga con `latest_charge` string frente a objeto expandido | String: `accepted=false`, `invalid_stripe_webhook_payload`; expandido: `accepted=true`, `captureBefore` recuperado. SHA-256 del PoC ejecutado: `0e648ddfe82613999b43a8ab99ae8862f402667b4c235d21f6dee016851ffce6`; el temporal no quedó en el repositorio. |
| `node --test --test-name-pattern="Stripe|webhook|capturable" tests/h6-payments-events.test.mjs` | **7/7 PASS**. Confirma que la batería actual pasa, pero solo usa objeto expandido en el evento capturable. |
| `node scripts/ops/sabora-sign-release-approval.mjs` en Windows | **Exit 0, sin salida ni error**, aun faltando todos los argumentos: reproducción de P2-10. |
| `node scripts/ops/sabora-encrypted-backup-cli.mjs` sin operación, como control de entrypoint | Exit 1 con `sabora_backup_cli_stop:operation_not_allowed`, comportamiento fail-closed esperado. |

**NO EJECUTADO:** suite PG17 completa, Chromium completo, restore Docker completo, Stripe CLI/sandbox, Supabase, VPS, Fleetia, despliegue o restauración real. Repetir las suites completas no añadía cobertura al riesgo concreto descubierto; se reutilizó la evidencia 8/8 y se ejecutaron solo pruebas focalizadas.

### 2.4 Normativa y superficies contrastadas

Se contrastaron los contratos obligatorios de `AGENTS.md`: requisitos funcionales, contrato funcional consolidado, autorización, límite CartaViva/Sabora, release gobernado, activación S38, seguridad CV-005/P0, identidad/privilegios de cliente y personal, pagos e integridad H6, diseño/UI funcional, registro de aprobación, puerta visual, tablero vivo y continuidad S41. También se revisaron los cambios de:

- circuito económico cliente/gestión/API y migraciones candidatas 100/101;
- webhook, adapter, orquestador y repositorio Stripe;
- `SECURITY DEFINER`, propietarios NOLOGIN, grants/revokes y roles mínimos;
- release firmado, artefactos, receiver/agent/actuator, Compose y redes;
- backup cifrado, CLI, inventario, réplica externa/VPS y restore CI;
- dos PWA, rutas, estados, errores, cierre por cuenta/mesa y representación separada de consumo, Stripe y verificación externa.

## 3. Verificación de hallazgos anteriores

| Hallazgo anterior | Resultado independiente |
|---|---|
| P1-01 captura Stripe sin confrontar importe/moneda | **Corregido en el candidato.** Adapter, servicio/orquestador y SQL sellado cotejan importe entero, EUR, PI/cargo y fallan a `unknown`; CI PG17 incluye negativos. Sin validación Stripe remota. |
| P1-02 refund sin confrontar importe/cargo/moneda | **Corregido en el candidato.** Se vincula refund con cargo original, importe y moneda, también en webhook/replay. |
| P2-03 pantalla de caja reducía varias liquidaciones a la última | **Corregido.** La proyección entrega `settlements[]`; gestión muestra cada canal/intento y bloquea cierres con estados pendientes. |
| P1-04 `bigint` de `pg` impedía reembolso | **Corregido.** La normalización decimal estricta rechaza valores inseguros antes de Stripe y admite la representación textual esperada. |
| P1-05 ruta H6 histórica no cotejaba dinero | **Corregido en código/migración candidata 101.** Nuevas envolturas selladas validan evidencia y retiran `EXECUTE` runtime de recorders antiguos; no se ha aplicado en Supabase real. |
| P2-06 recuperación no expandía `latest_charge` | **Corregido para llamadas REST de conciliación.** `retrieve` solicita `expand[]=latest_charge`. Esto no expande por sí solo el snapshot del webhook y, por tanto, no corrige P1-07. |
| P1-07 webhook capturable exige expansión | **Confirmado y reproducido.** Véase §4.1. |
| P2-08 fixture de webhook no realista | **Confirmado.** Véase §4.2. |

## 4. Hallazgos P0–P3

### 4.1 P1-07 — webhook Stripe válido rechazado por `latest_charge` no expandido

**Gravedad:** P1, alta. **Estado:** demostrado/reproducido.

**Condición:** Stripe entrega un evento snapshot firmado `payment_intent.amount_capturable_updated` cuyo `data.object.latest_charge` es `"ch_..."`, no un objeto expandido.

**Impacto:** el parser rechaza el evento antes de persistirlo; HTTP responde 400, no 503; no se conserva el evento para reintento y no existe un llamador de producción de `payments.reconcile`. Puede quedar una autorización válida sin plazo conciliado, bloqueando captura/despacho seguro. No permite falsificar pagos porque exige HMAC Stripe válido.

**Código exacto:**

- [`h6-stripe-webhook.mjs:71-74`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/apps/api/src/h6-stripe-webhook.mjs#L71-L74) desreferencia únicamente el objeto expandido.
- [`h6-stripe-webhook-http.mjs:26-30`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/apps/api/src/h6-stripe-webhook-http.mjs#L26-L30) convierte el fallo en HTTP 400.
- [`h6-stripe-webhook.mjs:96-101`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/apps/api/src/h6-stripe-webhook.mjs#L96-L101) llama directamente al repositorio tras parsear; no hay reconciliación de proveedor en esa ruta.

Stripe define `latest_charge` como campo *expandable* y muestra respuestas en las que es un ID de cargo; los eventos snapshot pueden requerir recuperar el recurso para obtener su estado actual: [PaymentIntent object](https://docs.stripe.com/api/payment_intents/object), [webhooks](https://docs.stripe.com/webhooks).

**Normativa afectada:** ambos momentos de pago, integridad exacta de PI/cargo/importe/EUR, recuperación segura de `unknown`, idempotencia y prohibición de inferir autorización o plazo sin evidencia.

**Solución mínima recomendada:**

1. Mantener primero la verificación HMAC sobre el cuerpo raw y la comprobación `livemode/account/object`.
2. Para el evento capturable, aceptar el ID `latest_charge`; consultar puntualmente a Stripe mediante un adapter inyectado y restringido, recuperando el PaymentIntent con `latest_charge` expandido o el Charge exacto.
3. Confrontar antes de SQL: PI del evento, cargo recuperado, `metadata.sabora_order_id`, importe esperado, moneda `eur` y `capture_before` entero/positivo. No aceptar datos cruzados ni inventar fecha.
4. Persistir una sola transición idempotente. Firma/estructura inválida → 400; proveedor no disponible, resultado ambiguo o falta temporal de expansión → 503 para que Stripe reintente. Documentar y fijar la versión de API del endpoint coherente con el adapter.

**Alternativa:** inbox durable de eventos firmados tras HMAC, con worker asíncrono que consulta Stripe y reintenta. Ventaja: desacopla latencia/proveedor y conserva el evento. Inconveniente: exige tabla/worker/observabilidad, política de reintentos y más superficie operacional. Para el primer hito, la consulta puntual síncrona es la reparación acotada; el inbox es preferible si el SLA del proveedor hace frágil el webhook síncrono.

**Riesgos y rollback:** no reescribir migraciones históricas ni relajar HMAC. La consulta debe estar detrás de inyección y timeouts, sin claves en logs. El rollback de aplicación vuelve al comportamiento defectuoso y, por tanto, no es una salida operativa aceptable después de habilitar Stripe; antes de despliegue basta revertir el commit correctivo sin datos porque el PR aún no está aplicado.

**Pruebas de aceptación:** HMAC + HTTP + PG17 con string y objeto expandido; lookup caído devuelve 503 y el mismo replay concluye; PI/cargo/order/importe/moneda/plazo incompatibles fallan sin rebajar deuda ni despachar; duplicado y orden invertido no duplican SQL/evento; fixture de versión API fijada; `payment_intent.succeeded` y refund siguen ligados a cargo/dinero exactos.

### 4.2 P2-08 — la batería usa un evento capturable optimista

**Gravedad:** P2, cobertura. **Estado:** demostrado.

**Condición:** el test unitario construye siempre `latest_charge` como objeto expandido en [`tests/h6-payments-events.test.mjs:219-229`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/tests/h6-payments-events.test.mjs#L219-L229). La prueba HTTP cubre firma y fallo SQL, pero no el evento capturable realista string → consulta → persistencia.

**Impacto:** permite 8/8 CI verde mientras el flujo real falla. No es un segundo defecto de producción independiente; es la razón por la que P1-07 escapó.

**Solución mínima:** sustituir el fixture principal por un snapshot Stripe realista completo (`object:event`, `livemode:false`, `data.object.object:payment_intent`, amount/currency/metadata y `latest_charge:"ch_..."`) y conservar un caso separado expandido. La aceptación debe recorrer Fastify raw body, adapter simulado, repositorio y PG17, no solo el parser.

**Alternativa:** además del fixture contractual, replay con Stripe CLI/sandbox sobre el SHA final. Es valioso para compatibilidad externa, pero no sustituye una regresión determinista en CI.

### 4.3 P2-09 — bundle de backup sin snapshot único ni identidad material de origen

**Gravedad:** P2, integridad/recuperación. **Estado:** defecto estático demostrado; el disparo concurrente no se ejecutó contra producción.

**Condición:** captura con escrituras, secuencias o DDL concurrentes, o plan que conecta a otra base mientras declara el `sourceProjectRef` aprobado.

**Impacto:** se pueden crear dos réplicas criptográficamente auténticas de un bundle cuyos roles, esquema, datos e inventario no representan un mismo estado, o cuya identidad del origen es autodeclarada. El restore puede fallar —correctamente— y dejar sin copia restaurable válida en la ventana de despliegue. En bases estructuralmente similares, la etiqueta de proyecto por sí sola no demuestra procedencia.

**Código exacto:**

- [`sabora-encrypted-backup-bundle.mjs:158-175`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/scripts/ops/sabora-encrypted-backup-bundle.mjs#L158-L175): cuatro comandos secuenciales independientes.
- [`sabora-encrypted-backup-cli.mjs:95-127`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/scripts/ops/sabora-encrypted-backup-cli.mjs#L95-L127): valida formato/esquemas, pero no exige snapshot común ni testigo de quiescencia.
- [`sabora-encrypted-backup-bundle.mjs:48-70`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/scripts/ops/sabora-encrypted-backup-bundle.mjs#L48-L70): autentica el texto constante `sourceProjectRef`, no la conexión efectiva.
- [`sabora-backup-inventory.sql:109-134`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/scripts/ci/sabora-backup-inventory.sql#L109-L134): fingerprints y secuencias se leen después, en otra sesión y mediante varias sentencias.

PostgreSQL ofrece `pg_dump --snapshot` y `pg_export_snapshot`; la instantánea exportada puede importarse por otras transacciones mientras la exportadora permanezca abierta: [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), [funciones de snapshot](https://www.postgresql.org/docs/17/functions-admin.html), [`SET TRANSACTION SNAPSHOT`](https://www.postgresql.org/docs/17/sql-set-transaction.html).

**Solución recomendada:** coordinador de captura que abra `REPEATABLE READ READ ONLY`, obtenga `pg_export_snapshot()` y mantenga esa transacción viva; pasar el mismo snapshot a los dumps de esquema/datos y ejecutar todo el inventario en una transacción que lo importe. Los roles de clúster, que no pertenecen a esa instantánea de base, deben capturarse y versionarse separadamente con orden explícito. Antes y después, obtener por consulta protegida un testigo de identidad autorizado de la base/proyecto, versión, ledger de migraciones y snapshot/tiempo, y vincularlo al AAD/manifiesto.

**Alternativa:** ventana autorizada de quiescencia de escrituras **solo Sabora**, con prueba de que no hubo sesiones/transacciones/migraciones Sabora durante toda la captura e identidad antes/después. Ventaja: implementación menor. Inconveniente: pausa operativa, disciplina manual y peor escalabilidad. No debe detener servicios ajenos ni tocar Fleetia.

**Compatibilidad/rollback:** no cambia datos de origen. Debe versionarse el manifiesto si se añaden campos obligatorios; el lector puede aceptar v1 solo para fixtures históricos no operativos y exigir v2 para copia real. Nunca promover un bundle v1 no ensayado a “restaurado”.

**Pruebas de aceptación:** escritor concurrente y DDL concurrente; todos los componentes reflejan el snapshot congelado o la captura falla; inventario restaurado idéntico; conexión a proyecto/base equivocada rechazada aunque el plan declare el ref correcto; ledger cambia durante captura → STOP; se conservan negativos de clave incorrecta/corrupción y restore exclusivamente desde réplica externa.

### 4.4 P2-10 — el firmador offline sale 0 y no hace nada en Windows

**Gravedad:** P2 operativa, fail-closed. **Estado:** reproducido en Windows.

**Condición:** ejecutar la herramienta offline del propietario en Windows.

**Impacto:** [`sabora-sign-release-approval.mjs:19`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/scripts/ops/sabora-sign-release-approval.mjs#L19) compara `process.argv[1]` con `new URL(import.meta.url).pathname`; la forma `/C:/...` no coincide con la ruta Windows. El bloque CLI no se ejecuta y termina 0 sin archivos ni diagnóstico. No habilita un despliegue: el workflow sigue fallando sin firma, pero impide el circuito de consentimiento y puede inducir al operador a creer que firmó.

**Solución mínima:** importar `fileURLToPath` y comparar rutas resueltas, como ya hace la CLI de backup; añadir prueba subprocess Windows/Linux que exija error no-cero sin argumentos y creación exclusiva de `.json/.sig/.pub.pem` con fixture Ed25519 y rutas temporales externas al checkout.

**Alternativa:** separar biblioteca y un wrapper CLI `.mjs` sin detección de módulo principal. Simplifica el entrypoint, pero mueve archivos y exige ajustar documentación. La reparación mínima es suficiente.

**Rollback:** sin datos ni migración. Revertir deja el flujo Windows roto, aunque fail-closed.

## 5. Resultados positivos y falsos positivos descartados

- **No se encontró duplicación de #60 ni de migraciones 100/101.** La genealogía es real y debe preservarse con un solo merge futuro de #59.
- **No se encontró una nueva vía de dinero externo.** La verificación externa reduce saldo operativo, pero no crea recaudación/finanzas; la PWA lo expresa de forma honesta.
- **No se encontró bypass nuevo de `SECURITY DEFINER`/roles.** Las funciones selladas fijan `search_path`, propietarios NOLOGIN y grants mínimos; los recorders viejos quedan sin `EXECUTE` runtime. La autoridad temporal CV-005 está permitida por la decisión aprobada y se revoca dentro de la transacción candidata.
- **No se encontró cierre prematuro nuevo.** Cuentas/mesas exigen saldo cero y ausencia de autorización/captura/refund/incidencia pendiente; PostgreSQL conserva la autoridad.
- **No existe actuador host operativo alcanzable.** [`authorizeHostOperation`](https://github.com/jdlc86/CartaViva/blob/f9f5adf60f07a9d156d91eef2e17c85e6d26d9e0/scripts/ops/sabora-release-host-agent.mjs#L158-L161) mantiene STOP y receiver/router lo invocan. Los laboratorios no equivalen a driver privilegiado instalado.
- Firma Ed25519, expiración, exact SHA, seis evidencias, one-use, manifest/image hashes, servicios/puerto/red nominados, rollback de aplicación y ausencia de dependencia Fleetia están implementados como candidato y probados en laboratorio. Su seguridad futura sigue dependiendo de padres root-owned, lecturas por descriptor/no-follow y un inspector host real; esto es puerta de provisión, no vulnerabilidad explotable del sistema actualmente desconectado.
- El backup cifra en streaming con AES-256-GCM, separa clave, replica el mismo ciphertext y valida corrupción/clave incorrecta/restore externo. **No afirma que las copias reales existan ni que la restauración esté validada**, por lo que no se refuta un estado que la documentación no reclama.
- Los 8 PASS no son falsos: prueban exactamente los fixtures ejecutados. Lo falso sería extrapolarlos a Stripe remoto, snapshot consistente bajo concurrencia, host real o aceptación humana.

## 6. Plan de corrección por bloques integrales

### Bloque A — webhook Stripe íntegro y recuperable (prioridad 1, bloquea merge)

Modificar de forma conjunta parser/HTTP/composición/adapter, fixture unitario, prueba HTTP y PG17. Conservar HMAC raw, idempotencia, importe/EUR/PI/cargo/pagador y estados `unknown`. Aceptación: toda la matriz de §4.1/§4.2 y después las suites aplicables sobre el mismo SHA.

### Bloque B — backup coherente e identificado (prioridad 2)

Elegir explícitamente snapshot exportado o quiescencia. Implementar coordinador, contrato de plan/manifiesto versionado, identidad de origen, inventario transaccional, concurrent-writer/DDL y restore externo desechable. No crear copias reales todavía. Mantener la réplica doméstica como primaria externa y la réplica VPS cifrada separada.

### Bloque C — gobernanza offline multiplataforma (prioridad 2, mismo hito)

Corregir el entrypoint del firmador y probar Windows/Linux/macOS compatibles a nivel Node. Reejecutar negativos de firma, expiración, digest, one-use y ausencia de secretos. No conectar el actuador host.

### Bloque D — cierre de candidato

Revisión diferencial independiente de A–C, CI aplicable sobre el SHA final, documentación solo de hitos reales y decisión expresa de merge. No abrir otro PR: actualizar #59. #60 permanece ancestro y no se fusiona por separado.

## 7. Quién podría ejecutar las correcciones

| Trabajo | Codex | ChatGPT/propietario/operador | Recomendación |
|---|---|---|---|
| Bloque A, código y pruebas deterministas | Adecuado: alcance acotado, trazable y verificable en repo. Riesgo medio-alto por dinero; exige revisión posterior. | El propietario decide estrategia síncrona vs inbox y configuración/versionado Stripe. | Codex puede implementar tras autorización; propietario fija la decisión y un revisor independiente valida. |
| Bloque B, coordinador/snapshot/tests | Adecuado para diseño e implementación repo/PG17 desechable. Dificultad alta. | DBA/propietario decide quiescencia, custodia, parámetros reales y autoriza futuras operaciones. | Implementación repo delegable a Codex; elección operativa y ejecución real no delegables sin autorización específica. |
| Bloque C, portabilidad CLI | Adecuado y de bajo alcance. | El propietario verifica el equipo real y custodia de clave. | Delegable a Codex, con prueba en Windows real y revisión. |
| Stripe sandbox, backup doméstico/VPS, Supabase, deploy | No autorizado en este encargo y no debe inferirse. | Requiere propietario/operadores autorizados, secretos y aislamiento físico. | Mantener separado después del merge y de permisos específicos. |

No me autoadjudico ninguna corrección: el propietario debe decidir quién ejecuta cada bloque.

## 8. Puertas pendientes

### Antes de merge a `main`

1. Corregir P1-07/P2-08 y, dado el alcance declarado del PR, P2-09/P2-10 en #59.
2. Ejecutar pruebas focalizadas negativas e integradoras y después la batería aplicable PG17/HTTP/Chromium/backup/UI sobre **un único SHA final**.
3. Revisión independiente del delta correctivo y dictamen sin autovalidación.
4. Mantener #59 Draft hasta decisión; no fusionar #60 por separado.
5. Aprobación expresa de merge y verificación posterior del SHA de `main`; CI no sustituye ruleset/protección.

### Antes de instalación real

1. Stripe sandbox/event destination real con versión fijada, webhooks string/expandido, retries y conciliación observada.
2. Equipo doméstico configurado y autorizado; copia externa cifrada realmente creada, leída y restaurada en PG17 aislado; RPO/RTO medidos. Réplica VPS solo con autorización, cuota/ACL/espacio/retención Sabora-only y sin Fleetia.
3. Identidad real de Supabase, backup/rollback y DBA autorizados; migraciones 100/101 todavía no están aplicadas por esta revisión.
4. Driver host root-owned, forced command, rutas por descriptor, redes/puerto/nftables y ausencia de recursos ajenos inspeccionados materialmente; autorización firmada fresca y one-use.
5. Aceptación funcional/visual humana de ambas PWA en el SHA desplegable y baselines de la puerta visual final.
6. Autorizaciones separadas de merge, backup, Supabase, VPS y despliegue.

## 9. Estado honesto por nivel de evidencia

| Estado | Resultado al cierre |
|---|---|
| **IMPLEMENTADO EN CÓDIGO** | Circuito económico, migraciones 100/101, dos PWA, release gobernado desconectado y backup cifrado candidato. P1-07/P2-09/P2-10 siguen sin corregir. |
| **PROBADO EN CI/LAB** | 8 controles aplicables PASS en `e3495644...`; 2 opt-in SKIPPED; PoC focalizado confirma P1; prueba focalizada existente 7/7. |
| **VALIDADO EN ENTORNO REAL** | No: sin Stripe remoto, Supabase operativo, copia doméstica/VPS, restore real ni despliegue. |
| **APROBADO** | No: no hay aceptación humana/operativa ni autorización de merge/despliegue derivada de esta revisión. |

**Conclusión:** el candidato contiene mejoras sustanciales y corrige los bloqueos monetarios anteriores, pero todavía no cumple la puerta de merge por P1-07. Los dos defectos operativos nuevos deben resolverse en el mismo hito si #59 pretende entregar backup y gobernanza utilizables. No se modificó código, migraciones, Supabase, VPS, Fleetia ni infraestructura durante esta revisión.
