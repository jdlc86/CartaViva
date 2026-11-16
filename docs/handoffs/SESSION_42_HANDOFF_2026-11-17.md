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
