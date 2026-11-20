# Sabora / CartaViva — continuidad operativa de la sesión 45 (2026-11-20)

> **CONTINUIDAD, NO NORMATIVA NI AUTORIZACIÓN.** GitHub es la fuente de verdad; prevalecen los contratos normativos y las decisiones expresas del propietario. Este documento abre S45 y se mantendrá durante la sesión. No reescribir S44 ni los informes independientes. Actualizar el tablero vivo al cerrar hitos significativos, no por cada corrección.

## 1. Fuentes y relevo

- [S44 íntegra, fijada al HEAD de apertura](https://github.com/jdlc86/CartaViva/blob/15d00e96e90b0bc70b8584a8139681c9fba5324e/docs/handoffs/SESSION_44_HANDOFF_2026-11-19.md), especialmente S44-2q–2y; [S44 en rama](SESSION_44_HANDOFF_2026-11-19.md).
- [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §176 al abrir S45; seguimiento, no normativa.
- [AGENTS.md](../../AGENTS.md), [requisitos](../REQUISITOS_FUNCIONALES.md), [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [auditoría visual](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [home](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md), [inventario funcional UI](../design/FUNCTIONAL_UI_COVERAGE.json), [aprobaciones](../design/APPROVAL_REGISTER.md), [puerta visual](../design/VISUAL_CONTROL_GATE.md). Leer los textos aplicables íntegramente antes de implementar, sin inferir aprobación.
- [Autorización](../SABORA_AUTHORIZATION_GATE.md), [frontera](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [release gobernada](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [método de validación y observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [runbook S38](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md), [runbook S40 doble backup y primer despliegue](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md), en particular §5 y las últimas adendas S44.
- [Guía Antigravity V1](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente V2](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md), leídos en el relevo. Antigravity no operativo según propietario y Codex interrumpido por disponibilidad según S44; no se ha comprobado recuperación. No emitir nuevos encargos sin instrucción expresa.

## 2. Corte GitHub de apertura (20-11-2026)

| Objeto | Estado observado |
| --- | --- |
| PR activo | [#72](https://github.com/jdlc86/CartaViva/pull/72), abierto, Draft, mergeable=true, no fusionado |
| Rama | prep/sabora-gateway-readiness-20261117 |
| HEAD anterior a este documento | [15d00e96e90b0bc70b8584a8139681c9fba5324e](https://github.com/jdlc86/CartaViva/commit/15d00e96e90b0bc70b8584a8139681c9fba5324e) |
| Base main | [8d8189eabf92c5c15f4eb841cd367033558caceb](https://github.com/jdlc86/CartaViva/commit/8d8189eabf92c5c15f4eb841cd367033558caceb) |
| Merge de prueba reportado por PR | 8e8bd7c528de46be69204d45f6418561a0a9679a; no es merge real |
| Dictamen | CI del candidato verde; NO-GO operativo e integración pendiente de evaluación/autorización |

### Evidencia nueva: cierre de CI del ensayo ENOSPC pendiente en S44-2y

Consulta de check-runs del HEAD exacto antes de cualquier commit documental: **5/5 aplicables SUCCESS, 2 opt-in SKIPPED**. No se lanzaron ni relanzaron pruebas en S45.

| Job | Resultado | Evidencia |
| --- | --- | --- |
| generate-lockfile | SUCCESS | [136162507691](https://github.com/jdlc86/CartaViva/actions/runs/44698983311/job/136162507691) |
| validate | SUCCESS | [136162507650](https://github.com/jdlc86/CartaViva/actions/runs/44698983347/job/136162507650) |
| web-publication | SUCCESS | [136162508085](https://github.com/jdlc86/CartaViva/actions/runs/44698983347/job/136162508085) |
| windows-offline-signer | SUCCESS | [136162507964](https://github.com/jdlc86/CartaViva/actions/runs/44698983347/job/136162507964) |
| functional-ui-gate | SUCCESS | [136162508115](https://github.com/jdlc86/CartaViva/actions/runs/44698983557/job/136162508115) |
| visual-final-acceptance-gate | SKIPPED | [136162509530](https://github.com/jdlc86/CartaViva/actions/runs/44698983557/job/136162509530) |
| cv005-b2-disposable-integration | SKIPPED | [136162509016](https://github.com/jdlc86/CartaViva/actions/runs/44698983297/job/136162509016) |

Logs recuperados y comprobados directamente, 20-11 UTC:
- Bootstrap 08:09:34 sabora_vps_backup_ssh_ack_lost_after_commit_ok; 08:09:36 sabora_vps_backup_ssh_midbody_disconnect_preserved_previous_ok; 08:09:47 sabora_backup_governed_offline_coordinator_publish_and_purge_ok y sabora_backup_governed_dedicated_account_and_bounded_mount_ok.
- **08:09:49 sabora_vps_backup_ssh_enospc_after_admission_preserved_previous_ok y sabora_vps_backup_bounded_disk_unmounted_ok.** Cierra el ensayo de escritura del cuerpo preinstall después de admisión en volumen ext4 descartable. No es prueba de ENOSPC a mitad de un componente V2 grande, fallo eléctrico ni cuota del VPS real.
- 08:10:04 sabora_dual_backup_pg17_external_restore_ok, **103 migraciones**, captureMs=2212, restoreMs=25934, totalMs=41273, manifest SHA256 6cc82a09fb29104843bdc0e461148c7b59ee5605597d574719e4876463b76af9. restoredFrom=external-store-fixture, vpsReplicaUsedForRestore=false, plaintextPersistedInReplicas=false, operationalReceipt=false. Tiempos de fixture, no RPO/RTO operativo.
- Validate: H6 Block 1 PASS 07:59:38; 2A PASS 08:01:36; 2B PASS 08:16:12. Los otros tres checks se contrastaron por metadatos; no se han inspeccionado sus nuevos logs completos.

No transferir automáticamente estos checks a un SHA posterior. El nuevo commit de continuidad será exclusivamente documental con [skip ci]. No usar ningún artefacto de otro SHA como paquete aprobado de release. Las puertas opt-in omitidas no son PASS.

## 3. Estado heredado y límites

- #69, #70 y #71 ya integrados en main; no volver a fusionarlos. S43 registra laboratorio de release A→B→rollback A, preflight histórico Supabase PG17 sin esquemas/ledger Sabora en alcance observado y preflight VPS sin instalación: no certifican estado actual.
- Rotación cifrada: conservar una generación estable; dos solo durante sustitución/reconciliación. Verificar nueva antes de borrar anterior; fallo protege anterior y bloquea tercera. Mantener punto de retorno pre-SQL y retención externa conforme a S40. No se autorizó purga real.
- S44 acredita exclusión Linux, transiciones nominadas, consumo durable de autorizaciones, diagnóstico de cinco SIGKILL, recepción SSH Linux→Linux, pérdida de ACK, desconexión, receptor dedicado no-PAM, guard protegido e instalación inactiva verificable. Las pruebas de coordinador son de laboratorio (algunas fronteras reconstruidas sintéticamente), no habilitan reconciliación productiva.
- Windows: ejecutable nativo y ACL probados en CI, sonda local con peer no SSH; **no** hay transferencia autenticada Windows→Linux acreditada.
- Custodia: CAS persistente y reserva local/remota validados previamente en fixture de un mismo runner; pérdida de respuesta deja pending/lock sin retry. Diagnóstico distingue remoto consumido/predecesor y ambos quedan STOP. No hay custodia físicamente independiente, canal real, desbloqueo autorizado ni resistencia demostrada a rollback del custodio.
- Candidato de receptor instalado y paquete inactivo verificable: no hay instalador root operativo ni attestation material del host. /srv/sabora-backup y /var/lib/sabora-backup-control son propuestas no reservadas; UID/GID, puerto, capacidades y autoridades no se presumen. No cambiar /srv/sabora/TLS ni SSH compartido.
- Stripe remoto, conciliación, aceptación humana de ambas PWA y expedientes de activación siguen pendientes según S44/S40; no deducir aceptación de H6 verde.

## 4. Próximo hito integral — cierre técnico y evaluación de #72

**Plan de trabajo propuesto, no autorización de operación:** evitar extender indefinidamente el protocolo de checkpoint y mantener el único PR Draft.

1. Consolidar evidencia exacta de §2 y contrastar diferencias del candidato con S40, contratos y límites reales. Revisar riesgos residuales del receptor, custodia, sender, artefactos y recuperación. No introducir cambios por inercia ni repetir CI verde sin causa o nuevo SHA.
2. Preparar ensayo material del receptor instalado con cliente Windows nativo autenticado hacia Linux aislado, ACK válido, conservación/rotación, fallo y restauración externa; sin tocar host compartido ni sistemas operativos reales hasta autorización separada. Distinguir ensayo descartable e instalación real. No afirmar que es equivalente a la sonda Windows.
3. Concretar con propietario el canal de custodia físicamente independiente (medio Linux/alternativa NTFS revisada, autoridades, vigencia y plazo de intercambio, sin publicar listener/túnel por defecto). Integrar reserva con coordinador instalado bajo control de mantenimiento, exclusión efectiva, CAS previo a mutación, y procedimiento explícito de reconciliación ante pending/lock. Estado desconocido conserva bloqueo; no reset, descenso de secuencia, repetición de autorización consumida ni purga unilateral. No inventar mecanismos o nuevas políticas normativas.
4. Acordar parámetros materiales pendientes de S40 §5: capacidad física/reserva, frecuencia, retención externa, custodia, identidad y evidencias, y autorización por etapas. No convertir el volumen de 32 MiB de fixture ni las ventanas de prueba en configuración de producción.
5. Evaluar el SHA final con batería integradora robusta y revisión independiente autorizada; corregir hallazgos justificados en #72, documentar evidencia y solicitar decisión expresa sobre integración. Solo tras merge autorizado, GATE-01/GATE-02 del nuevo main exacto. La revisión propia no sustituye revisión independiente.

## 5. Primera instalación: secuencia y STOP vigente

Conforme a runbooks S38/S40: expedientes y autorización de preflight/reserva y provisión dedicada Sabora-only; instalación del receptor cifrado independiente del controlador de release antes del respaldo inicial; backup inicial real desde equipo externo con TLS verify-full y origen autenticado, verificación/restauración exigible y réplica VPS; autorización separada de SQL; backup V2 y recuperación externa con conservación de puntos de retorno necesarios; expediente de release gobernado, Stripe/conciliación, readiness/alertas, aislamiento y aceptación humana. Verificar la normativa y decisiones exactas en cada transición, no ejecutar esta secuencia por figurar aquí.

**Frontera:** exclusivamente jdlc86/CartaViva y un restaurante. Sin acceso ni dependencia de Fleetia u otros proyectos. No tocar recursos VPS, redes, DNS, credenciales, Stripe, Supabase operativo, backups reales o main sin autorización pertinente y aislamiento completo. Ausencia de usuarios no concede permiso automático. Ninguna orden nueva de auditoría, merge, SQL, instalación o despliegue se presume de la apertura S45.

## 6. Registro vivo S45

| Hito | Estado al abrir | Evidencia / siguiente paso |
| --- | --- | --- |
| S45-0 — relevo S44 y consulta exacta de GitHub | COMPLETADO documental | S44 íntegra, tracker §176, PR y checks §2. |
| S45-1 — cierre de ensayo ENOSPC post-admisión | COMPLETADO en laboratorio | HEAD 15d00e96; 5/5 + 2 SKIPPED y logs §2. No operación real. |
| S45-2 — consolidación de candidato y pruebas materiales | PENDIENTE | Windows→Linux autenticado, custodia real, coordinador/procedimiento y expediente material. |
| S45-3 — revisión e integración | STOP | SHA final, revisión independiente y autorización expresa. |
| S45-4 — primera operación | STOP | §5 y runbooks normativos; autorizaciones separadas. |

**Mantenimiento:** este archivo se crea en la rama existente de #72 con un único commit documental [skip ci], sin abrir otro PR ni alterar main. Conservar §176 del tracker en esta apertura; incorporar la evidencia de S45-1 y el cierre integral al próximo hito significativo, sin duplicar registros. No se ha cambiado código ni ejecutado nuevas pruebas, y no se ha operado sobre infraestructura.

## S45-2a — ensayo material del receptor instalado (candidato, CI pendiente)

Revisión de los módulos de instalación/activación, receptor, emisor, wire y rotación: el receptor de laboratorio previo no ejecutaba la entrada instalada ni su comprobación real de mountinfo, UUID, binarios, cuenta y activación. Se añade scripts/ci/sabora-backup-installed-receiver-lab.mjs al arnés PG17 existente, reutilizando las dos capturas iniciales reales y sus recuperaciones verificadas. Las autoridades y campos production-candidate/production son exclusivamente sintéticos y efímeros en runner GitHub-hosted Linux; jamás se copian a un host real. El nuevo ensayo exige rutas/cuenta/namespace ausentes, volumen ext4 loop identificado por imagen propia, raíz completa montada, guard root-owned y cuenta restringida sin privilegios. Ejecuta el emisor CLI instalado y el shell/receptor exactos mediante OpenSSH real; red confinada a un namespace sin uplink ni ruta por defecto, dirección TEST-NET en loopback, no listener público. Prueba preflight sin red, activaciones firmadas con identidad de host/inode incorrectos, dos generaciones con ACK vinculado a instalación/activación y replay rechazado; conserva ambas copias externas, verifica limpieza de cuenta/namespace/mount. No se modifica código operativo ni se agrega restauración PostgreSQL duplicada. La prueba nueva no se ha ejecutado localmente; CI del nuevo SHA necesaria. Su eventual PASS acreditaría Linux→Linux del receptor instalado en fixture, no Windows→Linux, custodia física, auditoría independiente ni instalación VPS. No hay autorización de operación ni cambios de main, Supabase, Fleetia o VPS. El receptor instalado sigue sin habilitar recuperación operativa.


## S45-2a — cierre del ensayo material Linux; S45-2b — emisor Windows instalado y custodia de ciphertext

HEAD funcional 5615f9c900127f7f80e5bb06a660b178662e8906: **5/5 aplicables SUCCESS, dos opt-in SKIPPED**, [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/44702495927/job/136173992340), [H6/validate](https://github.com/jdlc86/CartaViva/actions/runs/44702495858/job/136173992161), [web](https://github.com/jdlc86/CartaViva/actions/runs/44702495858/job/136173992622), [Windows](https://github.com/jdlc86/CartaViva/actions/runs/44702495858/job/136173992665), [UI](https://github.com/jdlc86/CartaViva/actions/runs/44702495896/job/136173992561). Logs Bootstrap 20-11-2026 08:36:45Z sabora_backup_installed_receiver_native_linux_ssh_ok, fixture_cleanup_ok, disposable_disk_unmounted_ok; a las 08:37:01Z restore externo PG17 de 103 migraciones, captura 2240 ms, restore 28974 ms, total 44513 ms, manifest 3ac642d70ff459788f95374a75be5de0f5513493301e44e42201d1ff19e8c335, operationalReceipt=false. ENOSPC revalidado. Receptor instalado y emisor CLI Linux superados en entorno CI descartable, no en VPS.

S45-2b candidato: el emisor instalado comprueba antes de red el inventario cerrado del directorio ciphertext y sus ACL/propietario. En Windows usa comprobación DACL real para directorio, manifiesto y componentes; en Linux propietario actual, modos privados y cadena de padres no escribibles por extraños salvo sticky root. Respeta la obligación normativa de custodia privada, no sustituye autenticación criptográfica ni prueba resistencia a un administrador/propietario comprometido. Wire sigue verificando bytes/longitud/hash durante transmisión. Se amplía el job Windows existente con CLI instalada, paquete real cerrado del Git SHA, autoridades sintéticas, perfil y archivos privados, preflight sin red; negativas de binario no aprobado, proof incorrecto, pin cambiado aun con huella local actualizada, ciphertext de ACL heredada e inventario extra. Negativas Linux en preparación existente. **CI del nuevo SHA pendiente**, no pruebas locales acreditadas. No abrir un nuevo PR ni repetir capturas PG17 como rutina fuera de la CI integradora. No es transferencia autenticada Windows→Linux.

Frontera material: no se dispone de enlace privado Windows→Linux entre jobs hospedados; no publicar listener/túnel, intercambiar claves privadas vía artefactos o rebajar el contrato para simular éxito. El siguiente ensayo conjunto requiere un Windows nativo y un Linux aislado en red privada, equipo/VM de prueba autorizado separadamente, paquete del SHA final, autoridades efímeras, medidas reales de UUID/guard/hash/UID, con captura/restore PG17 ficticios, recepción autenticada y ACK exacto, rotación, rechazo, cierre de sesión y destrucción del laboratorio. No usar el VPS compartido como extremo de prueba sin autorización. Falta completar custodia externa física y procedimiento de reconciliación; los hashes sintéticos y el preflight no autorizan operación.
