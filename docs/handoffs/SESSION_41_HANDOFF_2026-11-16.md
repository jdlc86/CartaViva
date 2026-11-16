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

