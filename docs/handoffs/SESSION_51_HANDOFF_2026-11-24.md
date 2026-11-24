# CartaViva / Sabora — continuidad de la sesión 51 (24-11-2026)

> **DOCUMENTO DE CONTINUIDAD, NO NORMA, PRUEBA NI AUTORIZACIÓN OPERATIVA.** La fuente de verdad son los contratos normativos de `main`. Sabora es un único restaurante, dos PWA (cliente y gestión), y su prioridad es el primer despliegue funcional de prueba con datos exclusivamente ficticios en el VPS existente. No detener, modificar, reiniciar ni depender de Fleetia u otros proyectos. No añadir complejidad al procedimiento de despliegue.

## S51-01 — inicio y corte comprobado en GitHub (24-11-2026)

Se leyó [la continuidad S50](SESSION_50_HANDOFF_2026-11-23.md), incluido S50-11 y su cierre de auditoría. **El estado de PR #85 registrado en S50 quedó superado:** la consulta directa de GitHub de esta sesión confirma que [PR #85](https://github.com/jdlc86/CartaViva/pull/85) está CLOSED/MERGED, no Draft, fusionado el 24-11-2026 a las 10:42:44 UTC (11:42:44 Madrid). HEAD final de la rama candidata: `db81abff54bbc8495437143cb413962d65cdc39d`. Merge y HEAD de `main` observados: [`30d40ee3a342a1b59af05e12963aedbf253f67ed`](https://github.com/jdlc86/CartaViva/commit/30d40ee3a342a1b59af05e12963aedbf253f67ed). GitHub devolvió `protected=true`; S50 acreditó la [ruleset sabora-rule #27933106](https://github.com/jdlc86/CartaViva/rules/27933106), sin bypass y con PR y cuatro checks obligatorios. No volver a solicitar crear esa regla. La configuración de `sabora-live` sigue siendo una comprobación distinta.

**CI del SHA exacto de main, consultada en esta sesión:**

| Check | Resultado | Evidencia |
| --- | --- | --- |
| validate | SUCCESS | [Job](https://github.com/jdlc86/CartaViva/actions/runs/45377375360/job/138387128193) |
| web-publication | SUCCESS | [Job](https://github.com/jdlc86/CartaViva/actions/runs/45377375360/job/138387128562) |
| generate-lockfile | SUCCESS | [Job](https://github.com/jdlc86/CartaViva/actions/runs/45377375292/job/138387129094) |
| functional-ui-gate | SUCCESS | [Job](https://github.com/jdlc86/CartaViva/actions/runs/45377375292/job/138387129329) |

Los cuatro checks están completed/success; no trasladar estos resultados a otro SHA. La aceptación visual final y CV005+B2 opt-in quedaron SKIPPED en el corte de S50; no se acredita su ejecución o PASS por esta consulta. `functional-ui-gate` no equivale a aceptación de los flujos por el propietario. No hay evidencia nueva de ejecución física de VPS o SQL. No había PR abiertos al consultar GitHub antes de crear esta continuidad.

## S51-02 — metodología integrada y alcance

El [contrato V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md) ya se encuentra en main por la fusión verificada. Las menciones históricas a Draft/no merge de su texto describen el estado al redactarlo, no el estado GitHub actual. Su §7 fija la secuencia única de integración → identidad/SQL → preparación host → solicitud GitHub → aplicación aislada → aceptación. No reintroducir V1, firmas externas Ed25519 de release, seis expedientes, nueve custodios, firma DBA, ordenador doméstico, Codespace obligatorio, Tailscale ni otro VPS como requisitos. Se mantienen controles SSH/TLS, integridad SHA256, permisos mínimos, seguridad de aplicación y pagos, ledger/replay, aislamiento, verificaciones materiales y autorizaciones expresas separadas.

El [informe de Codex](../reviews/SABORA_S50_CODEX_PR85_V2_FINAL_TECHNICAL_REVIEW_2026-11-23.md) emitió GO MERGE CON CONDICIONES y NO-GO OPERATIVO; el código corregido `0c6eecab6ca4e4833105421e56b6f1f9fdc4f0bd` pasó cuatro checks. Se corrigieron reejecuciones por otro actor, revalidación del Issue, consumo huérfano/estados ambiguos del ledger y checks S46. El escáner de seguridad no pudo abrir el checkout; revisión directa y pruebas dirigidas no son una segunda auditoría independiente. [Laboratorio Docker/SSH V2](../reviews/SABORA_S50_V2_DOCKER_SSH_INTEGRATION_2026-11-23.md) acreditó despliegue, rollback, rechazo de replay y testigo ajeno en runner desechable, no en el VPS real. El merge no es autorización operativa.

**Riesgo residual de V2:** GitHub y el canal SSH son la raíz de autorización; no se dispone de la barrera adicional de firma de aprobación fuera de banda. Mantener protección de main, entorno exclusivo, credenciales Sabora-only y controles de host. No afirmar equivalencia criptográfica con V1.

## S51-03 — tablero de situación para reanudar

| Hito | Estado y evidencia |
| --- | --- |
| Integración V2 | COMPLETADA en main 30d40ee3; cuatro checks SUCCESS |
| Entorno GitHub sabora-live | PENDIENTE de acreditar restricciones a main, permisos y credenciales propias; no inferir por existencia del entorno |
| Supabase restaurante | PENDIENTE preflight real PostgreSQL 17 con TLS verify-full, identidad del proyecto, catálogo inicial y control de concurrencia; 103 migraciones pendientes según S50. Lecturas históricas de catálogo vacío o TLS 1.3 no acreditan estado actual ni verify-full |
| Controlador root-owned V2 | PENDIENTE de instalación física autorizada y verificada. ZIP histórico de [Issue #84](https://github.com/jdlc86/CartaViva/issues/84) quedó inerte en cuarentena, no es instalador V2. No repetir stage consumido ni reutilizar binarios V1; vigencia de bootstrap histórica hasta 28-11-2026, reconfirmar antes de usar |
| Aislamiento VPS | PENDIENTE de comprobar reserva/colisiones, usuarios, rutas, puertos, redes, nft, Compose, permisos/ACL y ausencia de efectos ajenos |
| Alertas | PENDIENTE receptor durable HTTPS autenticado V2 y ACK correlacionado real |
| Publicación | PENDIENTE primer despliegue y comprobación HTTPS de sabora.allaiso.com y gestion-sabora.allaiso.com |
| Aceptación | PENDIENTE recorridos reales de ambas PWA conforme a RF y diseño aprobado; CI no es aceptación |
| Copias y restauración | Excepción limitada al primer ensayo ficticio: backupPerformed=false, restorePerformed=false, realUsersAllowed=false. No segundo release ni datos/usuarios reales hasta requisitos ordinarios de respaldo/restauración y aceptación aplicables |

El proyecto Supabase es exclusivamente `byhvmumqivmunkmomhup`. El plan histórico [Issue #86](https://github.com/jdlc86/CartaViva/issues/86) no ejecutó SSH, SQL ni deploy. Los resultados previos de TLS de dominios y transferencia de bootstrap se mantienen como evidencia histórica, no como validación de disponibilidad actual.

## S51-04 — siguiente hito integral: primera activación ficticia

Mantener la secuencia normativa V2 §7. Organizar los preparativos en bloques completos, sin micro-PR ni repetir trabajo ya acreditado:

1. **Preparar y verificar identidad/SQL:** cotejar SHA vigente, árbol exacto de migraciones, preflight real con credencial mínima de lectura y verify-full. Obtener autorización SQL específica antes de aplicar las 103 migraciones (reconfirmar número/árbol), comprobar invariantes y resultado. No exponer credenciales ni cambiar privilegios globales.
2. **Aprovisionamiento Sabora-only:** preparar en un bloque la instalación V2, procedencia/digests, usuario SSH dedicado con comando forzado, manifiesto root-owned, entorno sabora-live, red/puertos/nft/Compose, TLS y receptor durable de alertas. Realizar cada operación física bajo autorización expresa correspondiente, sin privilegios genéricos ni uso de credenciales Fleetia. No habilitar `SABORA_RELEASE_AGENT_READY=explicitly-provisioned-v2` hasta acreditar todos los requisitos.
3. **Primera activación:** tras puertas materiales y autorización específica del propietario, utilizar únicamente Issue/Actions → SSH V2 de Sabora. Comprobar SHA exacto, resultado durable, HTTPS, alertas, flujos de cliente/gestión y aceptación humana. Usar solo datos ficticios. Genesis no tiene versión healthy anterior para rollback. No usar atajos, limpiar ledger ni reintentar a ciegas estados unknown.

Las comprobaciones de lectura y la preparación documental no autorizan migración, instalación, nft/red, despliegue ni fusión de nuevos PR. Detener ante colisión o aislamiento no demostrable. Nunca ejecutar Docker global, prune, compose down, reinicio de servicios compartidos ni tocar Fleetia.

## S51-05 — referencias y registro de la sesión

- [AGENTS.md](../../AGENTS.md), [contrato V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [registro de aprobación](../design/APPROVAL_REGISTER.md) y [puerta visual](../design/VISUAL_CONTROL_GATE.md). Leer antes de desarrollar o validar las PWA.
- [Guía Antigravity](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente V2](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md) leídos para continuidad. No se ha enviado encargo ni nueva auditoría; no asumir disponibilidad del orquestador. Solo tras indicación expresa y con alcance autorizado.
- Se leyó S50 y se comprobó merge, main, protección de rama y cuatro checks del SHA actual. Se creó este documento por orden del propietario en rama documental, sin cambio de código ni normas. No se efectuó merge, SQL, VPS, despliegue, cambios de configuración ni operación alguna sobre Fleetia en S51 al redactar este corte.
- Actualizar este mismo documento y el tablero vivo al cerrar hitos relevantes; evitar nuevas ramas/PR documentales por cada microcorrección. Verificar el estado real de GitHub y las normas antes de continuar.

**Dictamen de corte S51:** integración y CI de main completadas; **NO-GO operativo** hasta materializar las puertas restantes. Objetivo: primer despliegue completo con datos ficticios, sin aumentar complejidad.


## S51-06 — preflight de preparación real y solicitud plan V2 (24-11-2026)

**Lectura efectiva, no migración:** mediante conexión Supabase RESTAURANTE se verificó proyecto `byhvmumqivmunkmomhup` ACTIVE_HEALTHY, región eu-central-1, PostgreSQL 17.11; una SELECT de catálogo devolvió pgcrypto 1.3 en extensions, cero esquemas y roles con nombres Sabora/CartaViva, ledger y tabla restaurant_settings ausentes, SSL activo TLS 1.3. La consulta no acredita verificación de CA/hostname por cliente, catálogo completo bajo custodia ni exclusión DDL; **NO equivale al preflight formal verify-full**. No se ejecutó SQL mutante. GitHub confirma 103 archivos SQL en supabase/migrations del SHA main `30d40ee3a342a1b59af05e12963aedbf253f67ed`.

**Artefacto y plan:** [CI main #45377375360](https://github.com/jdlc86/CartaViva/actions/runs/45377375360) contiene artefacto `sabora-governed-release-package`, ID 14912092060, no expirado al consultar, 88.026.429 bytes; existencia no acredita cotejo del contenido en el VPS. Se creó [Issue #88](https://github.com/jdlc86/CartaViva/issues/88) del propietario para `release plan` del SHA exacto, cuerpo vacío, usando puente existente, sin SSH ni SQL. [Run del puente #45381492142](https://github.com/jdlc86/CartaViva/actions/runs/45381492142) estaba en ejecución al corte; no declarar dispatch ni plan PASS hasta comprobar el resultado. No repetir Issue.

**Bloqueos concretos descubiertos:** el endpoint del Environment sabora-live no está permitido por el conector GitHub; no se pudo certificar configuración/secretos. El [runbook DBA S48/S46](../runbooks/SABORA_S48_S46_AUTOMATED_DBA_READONLY_PREFLIGHT_CANDIDATE_2026-11-22.md) sigue especificando ejecutor Linux fuera del VPS compartido y de Actions para observe; no existe ejecutor de ese tipo acreditado. El workflow S46 solo planifica, no conecta a DB. El script actual exige usuario postgres, mientras contrato V2 §7 solicita credencial mínima de solo lectura: no confundir transacción READ ONLY con identidad sin capacidad de mutación. La propuesta histórica de observador en Actions no se habilitó. Resolver explícitamente esta incompatibilidad sin añadir otro servidor/PC ni pasar credenciales DBA a Actions. **Propuesta no aprobada:** evaluar ejecutar preflight y migraciones desde entorno aislado exclusivo Sabora en el VPS existente, con CA oficial, credenciales custodiadas, preflight read-only y autorización SQL aparte; requiere conciliación normativa, revisión del verificador y permiso específico de VPS antes de usarlo. No sortear el rechazo off-host del código.

**Estado:** integración CI acreditada; preparación avanza; verify-full, instalación V2, alertas, aislamiento, SQL y deploy siguen NO-GO. Ningún recurso Fleetia ni VPS se ha consultado o modificado en esta actuación. Sin cambios de normativa o código.

## S51-09 — cierre del plan V2 y diagnóstico del camino DBA (24-11-2026)

[Issue #88](https://github.com/jdlc86/CartaViva/issues/88) cerrado con recibo; [puente #45381492142](https://github.com/jdlc86/CartaViva/actions/runs/45381492142) SUCCESS; [plan V2 #45381538988](https://github.com/jdlc86/CartaViva/actions/runs/45381538988) completed/success sobre main 30d40ee3. Job verify SUCCESS (actor, SHA/ancestría, plan y CI exacta), log sabora_release_ci_pass con cuatro checks; execute SKIPPED por modo plan. **Hito de preparación validado, no SSH, SQL ni despliegue.** Main permanece 30d40ee3.

Se revisó el contrato V2, runbook S46, observador y tests, runbook P2 y harness de cadena. Hallazgos: observador exige postgres y solo guarda resumen (originalCatalogCustodied=false); la norma §7 exige credencial mínima de lectura. Harness de aplicación CI usa Docker exclusivo de runner y no admite destino operativo; no eliminar guardias. Se añadió [propuesta S51 §8](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md#8-propuesta-s51--un-único-ejecutor-dba-temporal-sabora-en-el-vps-existente-pendiente-de-aprobación) en el mismo PR #87, pendiente de decisión expresa del propietario sobre ubicación temporal y riesgo de credencial DBA. Sin aprobación implícita, sin alterar código, main o credenciales. Próximo bloque: resolver esa decisión, preparar ejecutor SQL conforme al mecanismo atómico existente y verificar custodia/aislamiento antes de solicitar autorización de SQL. No repetir plan mientras main siga exacto.

## S51-11 — decisión DBA aprobada e incremento de preparación (24-11-2026)

El propietario responde «Ok adelante» a la solicitud expresa de aprobación de diseño de ejecución temporal DBA aislada en el VPS y utilización excepcional de la credencial administrativa de Supabase RESTAURANTE bajo custodia. **No autoriza SQL mutante, provisión, acceso a credenciales o VPS, merge ni deploy.** Se actualizan V2 §8 y runbook S46 en el mismo PR #87; `main` permanece 30d40ee3. Candidato técnico: original del catálogo en directorio privado 0600 con fsync, verificación de rutas y no root, rechazo de Actions conservado. Constructor SQL compartido con checksum y ledger dentro del COMMIT original, sin cambiar las 103 migraciones; se usa en el ensayo no-superusuario existente y añade prueba de fallo diferido al COMMIT y rechazo de TRUNCATE. CI pendiente del SHA resultante; no hay PASS nuevo ni ejecución de Supabase o VPS. Queda completar el ejecutor operativo de cadena con lock/revalidación del catálogo y autorizaciones separadas, además de aislamiento/canal de secretos real. No utilizar el constructor manualmente para migrar.

## S51-12 — candidato de ejecutor inicial y ensayo del ledger (24-11-2026)

[PG17 no-superusuario #45382753849](https://github.com/jdlc86/CartaViva/actions/runs/45382753849) SUCCESS sobre `5317e462851ea8301cbc3ce8d553eaf66477ca3b`; logs: 103/103, frontera privilegios, ledger exacto y prueba de fallo COMMIT/TRUNCATE. La prueba negativa de ese SHA aceptaba también fallo de generación; el candidato posterior exige generar correctamente antes de comprobar violación FK real. Se añade `scripts/ops/sabora-s46-genesis.mjs` candidato: misma sesión psql con revalidación catálogo, lock cooperativo, cada COMMIT con checksum y comprobación CV005, resultado privado, postcheck ledger/RLS/roles, fallo cerrado y no replay. Se adapta el ensayo no-superusuario existente para usar el mismo generador de sesión completa y rechazar replay; CI del nuevo SHA no acreditada todavía. No se confunde local ref con live GitHub, variable con autorización, ni lock con exclusión de DDL ajeno. Faltan autorización/instalación física de operador, canal tmpfs de credencial, CA/pin, verify-full, exclusión DDL y autorización SQL exacta; postchecks runtime/HMAC y despliegue también pendientes. Sin intervención VPS, Supabase mutante ni Fleetia.
