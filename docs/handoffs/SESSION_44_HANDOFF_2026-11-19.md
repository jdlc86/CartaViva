# Sabora / CartaViva — continuidad operativa de la sesión 44 (2026-11-19)

> **CONTINUIDAD, NO NORMATIVA NI AUTORIZACIÓN.** GitHub es la fuente de verdad. Los requisitos, contratos y decisiones del propietario prevalecen; no reinterpretarlos desde este documento. Este archivo abre S44 y se mantendrá durante la sesión. No reescribir S43 ni informes independientes. Actualizar el tablero vivo cuando se cierre un hito con evidencia.

## 1. Fuentes y relevo

- [S43 íntegra, fijada al último HEAD funcional observado](https://github.com/jdlc86/CartaViva/blob/708d58c2f95cfcc6293e9d71216fe906b13b73f6/docs/handoffs/SESSION_43_HANDOFF_2026-11-19.md): especialmente S43-3e.8–17; [S43 en rama](SESSION_43_HANDOFF_2026-11-19.md).
- [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §156 al abrir S44; seguimiento, no normativa.
- [AGENTS.md](../../AGENTS.md), [RF/NF](../REQUISITOS_FUNCIONALES.md), [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [auditoría visual](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [home](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md), [inventario UI](../design/FUNCTIONAL_UI_COVERAGE.json), [aprobaciones](../design/APPROVAL_REGISTER.md), [puerta visual](../design/VISUAL_CONTROL_GATE.md).
- [Autorización](../SABORA_AUTHORIZATION_GATE.md), [frontera de proyecto](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [release gobernado](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [validación/observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [S38 primera activación](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md), [S40 doble backup y primer despliegue](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md).
- [Guía Antigravity V1](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente V2](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md): leer íntegramente antes de encargos. Antigravity no operativo según propietario; Codex interrumpió su ensayo por disponibilidad. No presumir que se han recuperado ni emitir nuevos encargos sin instrucción expresa.

## 2. Hitos heredados (no son nueva validación)

- [#69](https://github.com/jdlc86/CartaViva/pull/69) integrado: reparación de evidencia de release y gate UI histórico. [#70](https://github.com/jdlc86/CartaViva/pull/70) integrado: modalidad preinstalación, respaldo V2 y ensayo PG17. [#71](https://github.com/jdlc86/CartaViva/pull/71) integrado: controlador gobernado, laboratorio SSH/Docker A→B→rollback A y correcciones internas de autoridad, identidad, TLS y mounts. No volver a fusionarlos.
- Main de referencia [8d8189eabf92c5c15f4eb841cd367033558caceb](https://github.com/jdlc86/CartaViva/commit/8d8189eabf92c5c15f4eb841cd367033558caceb), merge real #71. S43-3e.9 documenta 5/5 SUCCESS, H6 bloques 1/2A/2B y 42 marcadores de laboratorio. [CI main](https://github.com/jdlc86/CartaViva/actions/runs/44526746999), [release evidence](https://github.com/jdlc86/CartaViva/actions/runs/44526747022), [artefacto](https://github.com/jdlc86/CartaViva/actions/runs/44526746999/artifacts/14532095645), caducidad histórica 26-11-2026 12:47:23Z. El acta off-host S43-3e.10 registra descarga y verificación de artefactos exactos. No reutilizar paquete anterior para otro SHA.
- [Preflight real Supabase S43-3b](SESSION_43_HANDOFF_2026-11-19.md#s43-3b--preflight-real-supabase-autorizado-origen-inicial-confirmado-19-11-2026): PG17, origen inicial Sabora sin esquemas/roles/ledger en alcance inspeccionado. No instalación SQL, backup real ni TLS verify-full desde ordenador doméstico acreditados. 103 migraciones previstas en el candidato previo, comprobar inventario del SHA aprobado antes de operar.
- [Acta preflight VPS read-only](../reviews/SABORA_S43_GATEWAY_READONLY_PROVISIONING_PREFLIGHT_2026-11-19.md) y [preparación off-host](../reviews/SABORA_S43_CONTROLLER_OFFHOST_PREPARATION_2026-11-19.md): 8443 libre y recursos Sabora ausentes en corte histórico, TLS histórico 10001 y permisos 0700/0400; controlador, runtime y reservas reales pendientes. No inferir vigencia actual. No modificar SSH compartido ni reiniciar host. Revisión interna no satisface revisión independiente real exigida por S40.
- Decisión expresa de rotación S43-3e.11: una última generación verificada estable en VPS; candidata temporal adicional durante sustitución/reconciliación, nunca acumulación indefinida. Verificar nueva copia antes de eliminar anterior. Fallo conserva anterior y bloquea tercera generación. Respetar punto de retorno pre-SQL y retención externa según S40; no se autorizó purga real.

## 3. Corte GitHub de apertura S44 — 19-11-2026, aproximadamente 15:48 Madrid

| Objeto | Estado observado |
| --- | --- |
| PR activo | [#72](https://github.com/jdlc86/CartaViva/pull/72), open / Draft / no merged / mergeable=true |
| Rama | prep/sabora-gateway-readiness-20261117 |
| Base main del PR | 8d8189eabf92c5c15f4eb841cd367033558caceb |
| HEAD antes de este nuevo documento | [708d58c2f95cfcc6293e9d71216fe906b13b73f6](https://github.com/jdlc86/CartaViva/commit/708d58c2f95cfcc6293e9d71216fe906b13b73f6) |
| Alcance PR según metadatos | 13 commits, 11 archivos antes de apertura |
| Dictamen | Candidato en desarrollo, NO-GO operativo; no autorizar merge/despliegue |

### Evidencia CI por SHA

Último candidato previo 77056bb1: S43-3e.17 registra 5/5 PASS, 2 opt-in SKIPPED, [CI 44542957831](https://github.com/jdlc86/CartaViva/actions/runs/44542957831), [Bootstrap 44542958082](https://github.com/jdlc86/CartaViva/actions/runs/44542958082/job/135625890474). 11 negativos de wire, cuatro SIGKILL, pipes reales, inicial→V2→V2 mismo origen, recuperación externa PG17 de 103 migraciones, H6 integral. Métricas de fixture 2252/5585/20197 ms, no RPO/RTO operativo. No heredar PASS al HEAD nuevo.

Consulta de jobs del HEAD 708d58c2 en apertura:

| Job | Estado | Evidencia |
| --- | --- | --- |
| functional-ui-gate | SUCCESS | [135641804798](https://github.com/jdlc86/CartaViva/actions/runs/44547470410/job/135641804798) |
| windows-offline-signer | SUCCESS | [135641792940](https://github.com/jdlc86/CartaViva/actions/runs/44547467980/job/135641792940) |
| web-publication | SUCCESS | [135641793110](https://github.com/jdlc86/CartaViva/actions/runs/44547467980/job/135641793110) |
| validate | IN_PROGRESS | [135641793453](https://github.com/jdlc86/CartaViva/actions/runs/44547467980/job/135641793453) |
| generate-lockfile | IN_PROGRESS | [135641796250](https://github.com/jdlc86/CartaViva/actions/runs/44547468641/job/135641796250) |
| visual-final-acceptance-gate | SKIPPED | [135641807849](https://github.com/jdlc86/CartaViva/actions/runs/44547470410/job/135641807849) |
| cv005-b2-disposable-integration | SKIPPED | [135641879924](https://github.com/jdlc86/CartaViva/actions/runs/44547468005/job/135641879924) |

**3/5 aplicables SUCCESS, 2 en curso, 2 opt-in SKIPPED.** Consulta de estados, no logs nuevos ni pruebas ejecutadas por S44. No afirmar que el quinto SIGKILL o la recuperación durable pasaron hasta comprobar la evidencia.

## 4. Hito integral inmediato — cerrar PR #72

Código candidato heredado: [rotación durable](../../scripts/ops/sabora-vps-backup-rotation.mjs), receptor streaming cifrado y misma batería PG17. Reutilizar exportador, wire, verificación de copia externa, lock, intención firmada, inventario, promoción fsync y purga exacta. El diagnóstico actual es solo lectura, no reparación automática.

1. Consultar los dos jobs pendientes de 708d58c2, verificar logs/recibos de intención durable, firmas inválidas, quinta interrupción y remanente de purga. Si falla, diagnosticar causa; preservar negativas y batería integradora existente. No cancelar ni duplicar ejecuciones por inercia.
2. Completar recuperación/reconciliación gobernada conforme a S40: identidad y fases fiables, ausencia de tercera generación, anterior preservada si nueva no es recuperable, actuación explícitamente autorizada ante estado incierto; no inferir seguridad frente a corte eléctrico por SIGKILL.
3. Completar entrada y transporte SSH real de backup en laboratorio, independiente del controlador de release para no crear dependencia circular pre-SQL; configuración autenticada, identidades/autoridades, capacidades mínimas, cuota física/reserva, sender Windows y custodia externa según contratos. La frecuencia y parámetros operativos aún requieren decisión; no inventar valores ni convertir fixtures en recibos reales.
4. Ejecutar el ensayo integrador de recepción→verificación→promoción→purga→recuperación, con fallos y restauraciones externas por fase, y comprobar CI del SHA final. Mantener un solo PR Draft; actualizar S44 y tablero al cerrar bloques. Solicitar decisión de integración expresa tras contrastar el candidato; no confundir revisión interna con independiente, ni merge con deploy.
5. Tras eventual merge autorizado, verificar GATE-01 y GATE-02 del nuevo main exacto, sin reutilizar paquete de otro commit. No cambiar main para simples anotaciones durante la producción de evidencia.

## 5. Camino hacia primera activación — STOP operativo vigente

- Resolver revisión independiente requerida por S40, runtime autenticado y provisioning Sabora-only (cuentas/UID/GID, custodia TLS, SSH, redes/puertos, cuotas, egress/ingress, observabilidad y rollback). Preflight/instalación necesitan autorización de alcance separada; no modificar listener global.
- Preparar equipo doméstico externo, acceso directo TLS verify-full, CA e identidad de clúster aprobadas independientemente, claves/ACL, espacio y retención. Por decisión del propietario, realizar backup inicial real antes de instalación SQL; verificar recuperación y réplica cifrada VPS autorizada. No usar copia de laboratorio como evidencia.
- Autorizar y ejecutar SQL por separado según S38/S40; después respaldo V2 y restauración externa real exigible, sin borrar puntos de retorno todavía necesarios.
- Completar expedientes materiales y firma de autorización gobernada, Stripe remoto/sandbox y conciliación según normativa, readiness/alertas, aislamiento y aceptación humana de ambas PWA. Opt-in SKIPPED no es PASS. No confundir ausencia de usuarios con permiso implícito.

**Frontera absoluta:** exclusivamente jdlc86/CartaViva, una instalación Sabora. Prohibido tocar, depender de, detener o modificar Fleetia o cualquier recurso ajeno del VPS. No operar VPS, Supabase, Stripe, secretos, backups reales, cambios DNS o despliegue ni fusionar PR por esta apertura. Ninguna aprobación nueva se presume.

## 6. Registro vivo S44

| Hito | Estado | Evidencia |
| --- | --- | --- |
| S44-0 — relevo S43 y corte GitHub | COMPLETADO (documental) | Este documento y consulta de PR/jobs; no cambios de código, ni pruebas nuevas. |
| S44-1 — cierre CI de recuperación durable | COMPLETADO (laboratorio) | 708d58c2: 5/5 SUCCESS, 2 SKIPPED; S44-1a/b. |
| S44-2 — cierre integral rotación/SSH/reconciliación | EN CURSO | Guard y purga firmada candidato lab (S44-2a); otras fases/SSH/cuota/frecuencia/autoridades pendientes. |
| S44-3 — evaluación de integración y release exacto | STOP | Candidato final, pruebas y autorización expresa. |
| S44-4 — preparación y primera operación | STOP | §5; evidencias materiales y autorizaciones separadas. |

**Mantenimiento:** crear S44 exclusivamente en rama existente del PR #72 con commit documental [skip ci], sin nuevo PR, para conservar main 8d8189ea intacto. El SHA documental posterior no hereda checks de 708d58c2; contrastar delta y ejecuciones originales al continuar. El tablero mantiene §156 hasta cierre significativo; no duplicar registro por apertura. No modificar retrospectivamente S43. Esta continuidad no es un dictamen de seguridad ni una nueva aprobación.


## S44-1a — recuperación durable y cinco interrupciones verificadas en Bootstrap (19-11-2026)

PR #72 sigue Draft, base 8d8189eabf92c5c15f4eb841cd367033558caceb, HEAD funcional 708d58c2f95cfcc6293e9d71216fe906b13b73f6, descendiente preactualización 64af876c40c6ed1ec7e80ecc76bee1773e1ce927 exclusivamente documental. [Bootstrap 44547468641/job 135641796250](https://github.com/jdlc86/CartaViva/actions/runs/44547468641/job/135641796250) COMPLETED/SUCCESS; log real 14:58:06–14:58:31Z: cinco marcadores sabora_vps_backup_rotation_sigkill_ok y cinco sabora_vps_backup_recovery_diagnosis_ok (copy-started, previous-moved, candidate-promoted, state-published, purge-started); 11 negativos de wire (magic, header-limit, header-truncated, signature, predecessor, capacity, body-limit, body-length, body-truncated, digest, extra); pipe, dos capturas iniciales, preinstalación→V2→V2, concurrencia y conservación del predecesor al rechazar. Restore externo 103 migraciones, captureMs=3480, restoreMs=10015, totalMs=33719, sin réplica VPS para restore, plaintextPersistedInReplicas=false, operationalReceipt=false. Son tiempos de fixture, no RPO/RTO operativo.

**4/5 aplicables SUCCESS, 1 en curso:** [validate](https://github.com/jdlc86/CartaViva/actions/runs/44547467980/job/135641793453) ejecuta H6 consolidada en el último corte; 2 opt-in SKIPPED. No se ha relanzado CI. El hito S44-1 sigue abierto hasta validate final; el diagnóstico integrado de cinco interrupciones sí dispone de evidencia. No atribuir checks al descendiente documental. No se ha ejecutado ninguna prueba de host ni operación real en esta sesión.

**Contraste del código de rotación y tabla de fases S40:** inspectVpsRotationRecovery es solo observacional: writerExcluded=false, deletionAuthorized=false, automaticRecovery=false. Un lock persistente ni un PID grabado prueban ausencia de escritor; un verified-subset de previous no autoriza borrarlo, un candidate unverified no autoriza limpieza. No hay entrada de reparación operativa. El siguiente diseño candidato (no implementado ni decisión normativa) debe resolver conjuntamente exclusión efectiva de escritores y reconciliación: considerar un guard de exclusión de proceso estable fuera de la raíz rotada, compartido por todas las entradas instaladas y retenido hasta finalizar; conservar rotation.lock durable frente a SIGKILL. Preferir una autorización firmada, de alcance estrecho y no reutilizable, ligada a identidad de almacenamiento, digest del lock/intención y acción nominada; releer estado bajo exclusión antes de toda mutación. Conservar current recuperable, no purgar si no existe sustituta materialmente verificada; unknown o restos no verificables STOP y plan individual. Nunca confiar en PID, retirar lock por diagnóstico o usar rm recursivo. Contrastar con S40 y pruebas del mismo arnés (escritor vivo, autorización discordante/replay, cortes durante reparación y verificación final); no introducir una entrada de reparación abierta. Integrar transporte SSH separado de release, sin shell/Docker ni scope desde el stream, y verificar cuota física y compatibilidad del emisor externo. Frecuencia/autoridades/reserva real requieren decisión separada. No se modifica código ahora mientras se recoge la evidencia final de validate; no se proclama hito integral cerrado.

Sin cambios en main, VPS, Supabase, Fleetia, secretos o normativa. Sin nuevo PR ni revisión independiente; STOP operativo.


## S44-1b — CI final del diagnóstico durable, COMPLETADO en laboratorio

SHA funcional 708d58c2f95cfcc6293e9d71216fe906b13b73f6, validate COMPLETED/SUCCESS. [Logs](https://github.com/jdlc86/CartaViva/actions/runs/44547467980/job/135641793453): H6 PASS Block 1 14:47:17Z, Block 2A 14:49:15Z, Block 2B 15:03:29Z. 5/5 aplicables SUCCESS, 2 opt-in SKIPPED; evidencia Bootstrap de S44-1a se conserva íntegra. No nueva ejecución duplicada. Descendientes previos a cambios funcionales 64af876c y 496c351e solo continuidad. No heredar checks.

## S44-2a — exclusión de escritores y finalización de purga firmada (candidato)

Propietario autoriza continuar desarrollo. En el mismo #72 se añade guard Linux flock sobre inode permanente externo a los slots, descriptor retenido durante toda la transacción; compartido por local/streaming/reconciliación. El lock durable sigue siendo intención, no testigo de escritor vivo. Prueba aislada local del descriptor flock: primer fd obtiene 0, segundo 75, tras cerrar primero segundo obtiene 0. No se ejecutó aún prueba integral nueva local. Recuperación deliberadamente acotada a state-published: sujeto de lectura y firma Ed25519 de autoridad distinta, ligada a almacenes, lock, manifiestos, remanente y prueba externa vigente. Se revalida bajo exclusión, fsync y purga solo ficheros exactos, luego cierre de intención. Producción STOP explícito. No se elimina current ni externa. No hay API/SSH operativa nueva.

Ampliación de la batería PG17: espera acotada de escritor real, rechazo de concurrencia/alias/alcance/tiempo/firma/objeto inesperado, finalización de purga parcial y completa, SIGKILL durante reconciliación con autorización vieja rechazada por cambio de remanente, recuperación con nuevo acto y rechazo de repetición tras completar. [S40 actualizado](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md). Código 0de0bce8, arnés 287621f2; publicación de documentación y activación CI normal del conjunto, sin lanzar manualmente ni duplicar baterías. Resultado pendiente. Limitaciones: autorizar nuevamente si cambia sujeto, no existe ledger de consumo global, una interrupción sin mutación puede permitir repetir autorización aún vigente; no cubre otras fases ni fallo eléctrico ni escritor ajeno al protocolo, falta transporte SSH independiente y configuración autenticada/Windows, cuota física, frecuencia, revisión independiente. No considerar S44-2 cerrado; main intacto, no merge, VPS, Supabase ni Fleetia.


## S44-2b — evidencia integrada de reconciliación y exclusión

SHA 986fbe9bb2f0789656fd9daeeb68545303e4efe1, [Bootstrap 44557552518/job 135677617527](https://github.com/jdlc86/CartaViva/actions/runs/44557552518/job/135677617527) SUCCESS. Logs 15:51:28–15:51:44Z: cinco SIGKILL/diagnósticos, sabora_vps_backup_reconciliation_sigkill_ok, sabora_vps_backup_published_purge_reconciled_ok state-published y purge-started, pipe y ciclos inicial/V2/V2. Restore externo 103 migraciones, 2303/6396/21264 ms (fixture, no RPO/RTO, operationalReceipt=false). UI/Windows/web SUCCESS; [validate 135677619998](https://github.com/jdlc86/CartaViva/actions/runs/44557552548/job/135677619998) H6 en curso en última consulta; 4/5 + 2 SKIPPED, no declarar 5/5 todavía. Comprobación independiente local (contenedor Linux, no VPS) del mecanismo flock por fd: 0/75/0 al liberar. No se relanza CI anterior.

## S44-2c — reconciliación nominada y secuencia durable (candidato)

Propietario autoriza continuar. Se implementan acciones determinadas por observación bajo guard, nunca comando/ruta del documento: descarte de candidato con bytes comprobados inicial/prepromoción; restaurar previous→current dejando candidato y lock; publicar estado del current nuevo dejando previous y lock; purga posterior con autorización separada. Prueba de recuperación externa vigente referida al bundle que debe conservarse y segundo firmante. Sujeto liga fase/acto/lock/manifiestos/estado/remanente; producción se rechaza. Registro de secuencia acotado sibling con temporal fijo, fsync/rename y persistencia antes de modificación; firmado siguiente número, acto viejo no reutilizable aunque no hubiera borrado. Temporal/registro inválido STOP. Retener contador fuera de rotación, no borrar automáticamente; lab permite inicializar si ausente, producción necesitará anclaje, custodia y política de restore del contador. Un fichero truncado que no coincide con hash, estado desconocido o temporal inesperado no se trata como resto autorizado. No se toca copia externa ni current mediante purga.

Código 3d965349; batería PG17 ampliada d8b4257e y 89c45b80 (pruebas de acciones, nuevo acto tras cada transición, negativa de producción, fase/alcance/secuencia, extra, estado de contador interrumpido, SIGKILL inicial, SIGKILL antes del primer unlink y durante purga, replay aunque sujeto sin cambio). [S40 actualizado](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md), tracker §158. No se han ejecutado localmente esas nuevas pruebas; publicar un único candidato con CI normal, cotejar SHA, no repetir manualmente ni atribuir evidencia anterior. Queda por integrar receptor SSH/config autenticada independiente de release, compatibilidad Windows, cuota física y frecuencia, revisión independiente, tratamiento operativo unknown y prueba de fallo de alimentación si se exige por norma. No GO integral ni autorización de borrado/instalación real. Main 8d8189ea, PR #72 Draft, VPS/Supabase/Fleetia intactos.


## S44-2d — reconciliación y consumo durable: CI completada en laboratorio

11198e9911bc20c11b50a5daa0f02c0bde4e9c56: 5/5 SUCCESS, 2 opt-in SKIPPED. [CI 44560406893](https://github.com/jdlc86/CartaViva/actions/runs/44560406893), [Bootstrap 44560406152/job 135687798116](https://github.com/jdlc86/CartaViva/actions/runs/44560406152/job/135687798116). Logs 16:06:29–16:06:47Z: discard copy-started y previous-moved, restore-predecessor-name, publish-promoted-state, purge candidate-promoted/state-published/purge-started, initial-receipt, contador interrumpido STOP, autorización consumida antes de modificar y SIGKILL durante reparación. Wire pipe y ciclos inicial→V2→V2 PASS, restore externo de 103 migraciones, 2152/8282/24553 ms (fixture, no RPO/RTO ni recibo operativo). H6 1/2A/2B PASS (final 16:11:41Z). No heredar los checks al nuevo código. El soporte de estados desconocidos sigue siendo STOP, no limpieza automática.

## S44-2e — candidato de transporte SSH de backup independiente

Propietario autoriza continuar desarrollo. Emisor Node/OpenSSH y receptor de laboratorio publicados (976276d1, 046b05e7); fixture sshd independiente de loopback (4686256f), integración en PG17 (87bd76f7), herramientas/syntax gate full (502bb801). Entrada no root y scope firmado fijan origen/UID/raíz/autoridades independientes/FS/límites, verbo remoto exacto; no se instala servicio ni se expone producción. Cliente fija host key, desactiva configuración/agent/proxy/forwarding/contraseña, usa wire existente y coteja ACK limitado con ID/digest/predecesor y salida/EOF. Resultado ambiguo bloquea reintento automático. Prueba nueva usa dos capturas iniciales existentes, luego dos backups V2 de restauraciones externas PG17 verificadas, mismo clúster; canal SSH real de laboratorio sustituye solo el pipe de los ciclos post-SQL (se conservan escenarios pipe/local previos). Negativos: comando/shell/subsistema, pin, configuración alterada, device, cuota lógica, producción, header truncado, replay/downgrade. Cierre del listener. Nuevas pruebas no ejecutadas localmente; CI del candidato por verificar.

Decisiones de diseño candidatas: servidor de transporte separado, loopback/puerto efímero y cuenta del runner para prueba; no constituye identidad de producción ni anclaje del ejecutable. Scope firmado y statfs no acreditan cuota dura física; falta reserva/volumen/medición límites. Herramientas de Windows portables por diseño sin prueba efectiva ni ACL certificada, falta configuración autenticada del cliente real y receiver root-owned con mínimos privilegios. Falta desconexión SSH a mitad del cuerpo y pérdida de ACK posterior a promoción (pipe/SIGKILL ya validados); debe permanecer outcome desconocido y sin reintento. Mantener S44-2 en curso, pendiente cuota física, frecuencia/custodia, revisión independiente, tratamiento operativo unknown y autorizaciones. Actualizados S40 y tracker §159. PR #72 Draft, main sin cambios, no VPS, SQL, Supabase ni Fleetia.


## S44-2f — canal SSH de laboratorio validado, 5/5

SHA e4a07250a562222e2f73b4762c29d40c414e76d6: [Bootstrap 44564905175/job 135703878552](https://github.com/jdlc86/CartaViva/actions/runs/44564905175/job/135703878552) SUCCESS, marcadores SSH restricted_commands, host_scope_and_truncation, initial_cycle, preinstall-to-v2, v2-to-v2, disposable_listener_closed, restore externo PG17 103 migraciones (2286/13445/32567 ms fixture, operationalReceipt=false). [Validate](https://github.com/jdlc86/CartaViva/actions/runs/44564904954/job/135703879162) SUCCESS, H6 1/2A/2B PASS, resto 3/3 aplicables PASS, 2 opt-in SKIPPED. No heredar checks al código nuevo ni confundir CI y VPS.

## S44-2g — interrupción de cliente y volumen del laboratorio (candidato)

Cambios 990a3ccf (cancelación del emisor), 7fafc66a (capacidad de FS firmada), f852390c (wrapper de ACK retenido, desconexión SSH real y volumen), 22c28193 (integración en mismo PG17), c3bc70e7 (herramientas obligatorias). Se añade prueba de ACK auténtico retenido exclusivamente en wrapper de CI: commit comprobado, abortar cliente OpenSSH, outcome desconocido y replay rechazado. En segunda instancia aislada se recibe frame ciphertext parcial real y SIGKILL al cliente con stdin abierto, espera liberación guard, conserva copia anterior y lock, proceso de reconciliación se niega a descartar bytes no verificados. Se comprueba identidad del dispositivo/tipo/capacidad de FS firmada y cuota lógica dentro de la capacidad. Volumen físico de ensayo ext4 loopback 32 MiB y cuota lógica 16 MiB solo en GitHub-hosted Linux; imagen/ruta propias, nodev,nosuid,noexec, hard limit mediante fallocate sobredimensionado, presión de espacio sólo en ese volumen, rechazo sin mutar anterior, liberar presión, repetir escenario de body, cerrar SSH y desmontar. No nuevos parámetros operativos decididos, no montar volumen en VPS. No se ha ejecutado CI de este candidato aún, ni nuevas pruebas locales. No atribuir PASS de e4a07250.

Pendientes principales: validación CI, Windows ssh.exe/ACL y config autenticada, receptor instalable y autoridades/custodia, pruebas de ENOSPC durante escritura y verificación de límite real, política de capacidad/reserva y frecuencia, custodia de contador/unknown, revisión independiente, autorización explícita de provisioning y ejecución. Mantener un solo #72 Draft; nueva evidencia y decisiones en S44 y tracker §160. [S40](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md). Main 8d8189ea intacto, no operación sobre entorno real, VPS, Supabase ni Fleetia.
