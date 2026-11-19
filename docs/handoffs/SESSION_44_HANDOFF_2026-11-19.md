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
| S44-1 — cierre CI de recuperación durable | EN CURSO (Bootstrap PASS) | 708d58c2: 4 SUCCESS, validate en curso, 2 SKIPPED; cinco SIGKILL y diagnósticos corroborados en S44-1a. |
| S44-2 — cierre integral rotación/SSH/reconciliación | PENDIENTE | PR #72, alcance §4; cuota/frecuencia/autoridades y compatibilidad pendientes. |
| S44-3 — evaluación de integración y release exacto | STOP | Candidato final, pruebas y autorización expresa. |
| S44-4 — preparación y primera operación | STOP | §5; evidencias materiales y autorizaciones separadas. |

**Mantenimiento:** crear S44 exclusivamente en rama existente del PR #72 con commit documental [skip ci], sin nuevo PR, para conservar main 8d8189ea intacto. El SHA documental posterior no hereda checks de 708d58c2; contrastar delta y ejecuciones originales al continuar. El tablero mantiene §156 hasta cierre significativo; no duplicar registro por apertura. No modificar retrospectivamente S43. Esta continuidad no es un dictamen de seguridad ni una nueva aprobación.


## S44-1a — recuperación durable y cinco interrupciones verificadas en Bootstrap (19-11-2026)

PR #72 sigue Draft, base 8d8189eabf92c5c15f4eb841cd367033558caceb, HEAD funcional 708d58c2f95cfcc6293e9d71216fe906b13b73f6, descendiente preactualización 64af876c40c6ed1ec7e80ecc76bee1773e1ce927 exclusivamente documental. [Bootstrap 44547468641/job 135641796250](https://github.com/jdlc86/CartaViva/actions/runs/44547468641/job/135641796250) COMPLETED/SUCCESS; log real 14:58:06–14:58:31Z: cinco marcadores sabora_vps_backup_rotation_sigkill_ok y cinco sabora_vps_backup_recovery_diagnosis_ok (copy-started, previous-moved, candidate-promoted, state-published, purge-started); 11 negativos de wire (magic, header-limit, header-truncated, signature, predecessor, capacity, body-limit, body-length, body-truncated, digest, extra); pipe, dos capturas iniciales, preinstalación→V2→V2, concurrencia y conservación del predecesor al rechazar. Restore externo 103 migraciones, captureMs=3480, restoreMs=10015, totalMs=33719, sin réplica VPS para restore, plaintextPersistedInReplicas=false, operationalReceipt=false. Son tiempos de fixture, no RPO/RTO operativo.

**4/5 aplicables SUCCESS, 1 en curso:** [validate](https://github.com/jdlc86/CartaViva/actions/runs/44547467980/job/135641793453) ejecuta H6 consolidada en el último corte; 2 opt-in SKIPPED. No se ha relanzado CI. El hito S44-1 sigue abierto hasta validate final; el diagnóstico integrado de cinco interrupciones sí dispone de evidencia. No atribuir checks al descendiente documental. No se ha ejecutado ninguna prueba de host ni operación real en esta sesión.

**Contraste del código de rotación y tabla de fases S40:** inspectVpsRotationRecovery es solo observacional: writerExcluded=false, deletionAuthorized=false, automaticRecovery=false. Un lock persistente ni un PID grabado prueban ausencia de escritor; un verified-subset de previous no autoriza borrarlo, un candidate unverified no autoriza limpieza. No hay entrada de reparación operativa. El siguiente diseño candidato (no implementado ni decisión normativa) debe resolver conjuntamente exclusión efectiva de escritores y reconciliación: considerar un guard de exclusión de proceso estable fuera de la raíz rotada, compartido por todas las entradas instaladas y retenido hasta finalizar; conservar rotation.lock durable frente a SIGKILL. Preferir una autorización firmada, de alcance estrecho y no reutilizable, ligada a identidad de almacenamiento, digest del lock/intención y acción nominada; releer estado bajo exclusión antes de toda mutación. Conservar current recuperable, no purgar si no existe sustituta materialmente verificada; unknown o restos no verificables STOP y plan individual. Nunca confiar en PID, retirar lock por diagnóstico o usar rm recursivo. Contrastar con S40 y pruebas del mismo arnés (escritor vivo, autorización discordante/replay, cortes durante reparación y verificación final); no introducir una entrada de reparación abierta. Integrar transporte SSH separado de release, sin shell/Docker ni scope desde el stream, y verificar cuota física y compatibilidad del emisor externo. Frecuencia/autoridades/reserva real requieren decisión separada. No se modifica código ahora mientras se recoge la evidencia final de validate; no se proclama hito integral cerrado.

Sin cambios en main, VPS, Supabase, Fleetia, secretos o normativa. Sin nuevo PR ni revisión independiente; STOP operativo.
