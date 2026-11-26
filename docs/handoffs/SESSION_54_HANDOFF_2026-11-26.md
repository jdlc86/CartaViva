# CartaViva / Sabora — continuidad de la sesión 54 (26-11-2026)

> CONTINUIDAD, no normativa, autorización, aceptación ni evidencia de ejecución propia. Prevalece la normativa de main; las decisiones expresas del propietario registradas en las adendas candidatas se conservan sin presumir su integración. Sabora: un restaurante, dos PWA. Solo jdlc86/CartaViva. Fleetia y otros recursos compartidos intocables. Prioridad: primer despliegue funcional ficticio por V2, sin arquitectura adicional.

## S54-01 — Punto de partida y auditoría de reanudación

El propietario confirma que la sesión 53 quedó registrada en el documento de sesión 52, hasta S52-31. Se abre esta continuidad S54 en la misma rama del [PR #92](https://github.com/jdlc86/CartaViva/pull/92); no abrir PR documental adicional. [Continuidad S52 completa en corte auditado](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/docs/handoffs/SESSION_52_HANDOFF_2026-11-25.md).

Consulta directa GitHub: #92 abierto/Draft, mergeable según metadatos (no significa aprobación), base main `da02d5d97c3eb26d4c1530e0b0c4c4f7a14012d7`, rama `fix/sabora-s51-first-deploy-20261124`, HEAD de código auditado `8a798c8d047d523a33060beddfbb7c53c6c0ec25`, 38 commits y 104 archivos modificados antes de crear S54. Último commit: feat(security): add encrypted ROOT recovery mail custody and fenced delivery. La lista completa de archivos cambiados no incluye supabase/migrations; los cinco overlays de identidad están en docs/security/sql-candidates. La igualdad del árbol de genesis `634d7e863554ba4d5704275164abbd30213d16b7` es evidencia histórica documentada; no se recalculó el árbol ni se consultó el ledger real en S54. No hay integración ni despliegue de #92.

Alcance de auditoría: revisión documental y estática focalizada en seguridad, recuperación ROOT, composición HTTP/PWA/SQL, brechas de H1-A y evidencia de CI, consultando AGENTS, contrato ROOT de base y candidato, V2, gate de invitaciones, tablero, matriz, ficheros SQL/Node/UI y el ensayo genesis. No es auditoría independiente (revisión del mismo agente que desarrolló partes del candidato), no se ejecutaron pruebas nuevas localmente, no se revisó exhaustivamente cada uno de los 104 archivos ni la totalidad de diseño/RF/NF, no se probaron proveedores alojados ni infraestructura. No atribuir aceptación visual ni operacional.

## S54-02 — Hitos principales acumulados

| Hito | Estado al corte / evidencia | Pendiente material |
| --- | --- | --- |
| H1-A login por passkey y sesión de gestión | Candidato publicado con autorización de membresía; Chromium/Fastify/PG17 en cortes previos | Auth alojado, revocación efectiva y aceptación |
| ROOT genesis y primer ADMIN titular | Concesión única, recibo, excepción acotada, primer ADMIN por ciclo durable y panel de reanudación; CI anterior 9d2f7ac9 7/7 | Provisión autorizada, arranque real desde navegador, prueba alojada, cierre de ruta excepcional en runtime |
| Directorio y ciclo de personal | Ficha, directorio, invitación, aceptación, registro, activación, suspensión y revocación candidatos; ensayo integrado ordinario con proveedores simulados | Composición runtime, vínculo con Auth/Resend alojados, reconciliación, retención, recuperación no ROOT |
| Recuperación ROOT | Kernel PG17 con código, contador durable, enlace, desafío, concesión, admisión por huella, registro pendiente y finalización interna | Flujo público, ceremonia de respaldo, reconciliación y revocación remota, fence de mutaciones |
| Seguridad ROOT PWA | Estado, reset y sustitución de código con ceremonia fresca; opt-in | Alta/cambio de email y respaldo, recorrido completo, CI del último árbol |
| Correo recuperación | Candidato S52-31: AES-GCM, prueba de destinatario, día 0, rotación, desafío, aviso, outbox y Resend cercado | Worker existente, alertas, reconciliación, retención, PWA, CI |
| H1-B llamada | Candidato funcional de dos PWA | Push/recordatorios y prueba alojada/aceptación |
| H1-C cambio mesa | Candidato conectado | Ventana administrativa y prueba alojada/aceptación |
| H1-D | Catálogo/QR/pedido y gateways existentes | Despacho agrupado en runtime sin Stripe y resto de inventario |
| H2 primer despliegue ficticio V2 | Preparación y genesis según continuidad S51/S52 | Delta SQL aprobado, receptor durable, controlador, egress/aislamiento, Environment y SSH exclusivos, plan exacto y autorización; comprobar situación real antes de repetir |
| H3/H4 | Inventario previo sigue vigente | Cierre posterior conforme a inventario y normativa; no reclasificar |

H2 histórico (no reinspeccionado): Supabase RESTAURANTE PG17.11, 103 migraciones aplicadas una vez, 23 LOGIN restringidos, 27 archivos secretos y dos LISTEN, JWT RSA/RS256, pooler verify-full; tres redes Sabora, ingress/TLS y puerto 8443 preparados. HMAC inicial vence 24-12-2026 20:42:58.423 UTC según S51/S52. No repetir genesis, no tocar ledger, no reprovisionar a ciegas. Mantener excepción primer ensayo exclusivamente ficticio, sin afirmar backup/restore ni habilitar usuarios reales. Orígenes históricos aprobados sabora.allaiso.com:8443 y gestion-sabora.allaiso.com:8443. [Inventario único](https://github.com/jdlc86/CartaViva/blob/50fb9398c6813c32b4c2f8a98efff567d59eea0e/docs/tracking/SABORA_FINAL_DEPLOYMENT_CLOSURE_INVENTORY_2026-11-25.md).

## S54-03 — CI verificada directamente

Corte 26-11-2026: SHA `8a798c8d047d523a33060beddfbb7c53c6c0ec25`. 5/7 controles aplicables PASS, 2 en ejecución; no fallos observados al consultar, no dictaminar CI verde completa.

| Control | Resultado | Evidencia |
| --- | --- | --- |
| web-publication | PASS | [job](https://github.com/jdlc86/CartaViva/actions/runs/45878368626/job/140111128369) |
| validate | RUNNING, H6 consolidado | [job](https://github.com/jdlc86/CartaViva/actions/runs/45878368626/job/140111128883) |
| generate-lockfile | RUNNING, PG17 real desechable | [job](https://github.com/jdlc86/CartaViva/actions/runs/45878368661/job/140111128763) |
| functional-ui-gate | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45878368534) |
| navegador gestión | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45878368614) |
| navegador cliente | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45878368732) |
| instalabilidad | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45878368789) |
| CV005+B2 opt-in | SKIPPED | [run](https://github.com/jdlc86/CartaViva/actions/runs/45878368672) |

La aceptación visual final no está acreditada; functional-ui-gate verifica trazabilidad, no toda la funcionalidad. La publicación de paquete inmutable main-only está omitida en web-publication del Draft. Se confirma por API de Actions 7/7 controles aplicables PASS del SHA anterior `9d2f7ac9fb2c7129a91a0ac70e7797fc353c20b0`, CV005+B2 omitido: [CI](https://github.com/jdlc86/CartaViva/actions/runs/45775038867), [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/45775038744). No transferir PASS a commits posteriores. S52-30 registró fallo de aserción de auditoría y S52-31 lo corrige, aún sujeto a la nueva CI. La creación de S54 es documental y puede generar nueva CI; verificar HEAD y árbol exactos antes de integrar.

## S54-04 — Decisiones aprobadas que no se reabren

Contrato ROOT en [candidato #92](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md) incorpora adendas S52 aprobadas por propietario; no están todavía en el contrato de main auditado. ROOT único, no titular ADMIN, arranque único y excepción primer ADMIN hasta asignación. Recuperación por segunda passkey ordinaria o excepcional mediante correo de seguridad y código independiente 128 bits/26 Base32. Código solo visible una vez y no en correo ni almacenamiento web; estable hasta uso/sustitución. Enlace cada 28 días por defecto configurable, desafío 10 min, concesión 5 min un uso, misma identidad ROOT, credenciales y sesiones anteriores revocadas al éxito, código nuevo y aviso. Contador acumulado por ROOT: 3 fallos/15 min, 5/1 h, 10 y cada admitido posterior/24 h; solicitudes bloqueadas no prolongan, no reset por tiempo, IP, rotación o reinicio. Reset por recuperación exitosa o acción ROOT con passkey reciente. Acceso ordinario se conserva durante bloqueo de intentos. No añadir factores ni recuperación alternativa por pérdida de todos.

No inferir aprobación de modalidad definitiva de invitación ordinaria, retención de material, recuperación de roles no ROOT, delta V2 ni operaciones reales. Resend elegido. V2 §9 solo permite reutilizar recibo genesis con igualdad exacta de las 103 migraciones; no usarlo para un delta diferente.

## S54-05 — Hallazgos de auditoría y prioridades

Clasificación de revisión propia: P1 bloquea cierre/activación, P2 requiere resolución antes de integración del flujo afectado. No son explotación demostrada ni auditoría externa.

| ID | Prioridad | Hallazgo y evidencia | Criterio de cierre |
| --- | --- | --- | --- |
| A54-01 | P1 | Composición incompleta: m2-restaurant-candidate.mjs solo registra directorio/revocación de este ciclo; rootSecurity, rootAccess, mail y enrolamiento candidato no constituyen runtime completo. RootSecurityPanel.tsx 17-47 solo ofrece reset y replace_code. | Un recorrido real PWA/API/PG17 desde alta ROOT a recuperación, composición explícita y preflights; sin flags ficticios ni rutas laboratorio en producción. |
| A54-02 | P1 | Fase registration_pending se activa al consumir concesión; complete es comando interno sin vínculo operativo con registro/revocación Auth. SQL líneas 149-165, 234-238 y 287-288. Si falla la frontera distribuida no hay cierre/reconciliación demostrados. El backup se incorpora por comando interno (add_backup), no ceremonia real. | Registrar y verificar nueva passkey de la misma identidad; reconciliar fallos e incertidumbre sin replay; revocar credenciales/sesiones previas y emitir código/aviso; probar respaldo y acceso nuevo. |
| A54-03 | P1 | Fence de admisión ROOT no es fence de mutación: root_recovery_access_candidate (SQL 276) toma lock solo en consulta de admisión; otra mutación admitida previamente puede continuar después de claim. No se ha reproducido carrera; el propio código reconoce el límite. | Revalidación durable dentro de las mutaciones ROOT sensibles y prueba integrada de carrera antes/después de recuperación. |
| A54-04 | P1 | Rotación incierta: finish unknown no elimina pending_link_hash; queue_link exige ausencia/caducidad del pendiente y list solo selecciona queued/accepted pendiente (SQL 445-478, 499-517). El job y el pendiente comparten vigencia de enlace (28 días por defecto); un fallo incierto de rotación cerca del vencimiento deja riesgo de ventana sin enlace vigente. La prueba 502-507 verifica no reenviar automáticamente, no recuperación inmediata. | Reconciliar evidencia de proveedor y alertar usando mecanismos existentes; conservar enlace anterior solo mientras válido; recuperación segura de incertidumbre, sin duplicación ni renovación indefinida. |
| A54-05 | P1 | No hay scheduler/worker de correo ROOT ni alertas durables conectadas. El candidato mail expone list/dispatch/queueLink; no acredita entrega efectiva. Acciones internas configure/reset/confirm_link/add_backup/complete deben quedar inaccesibles desde fronteras públicas. | Conectar worker existente, delimitar responsabilidades y credenciales mínimas, alertas y limpieza/retención verificables; probar fallo/reinicio/replay y acceso no autorizado. |
| A54-06 | P1 | Cinco overlays fuera del historial de migraciones; V2 §9 no permite considerar compatible una cadena nueva. | Consolidar delta append-only, inventario de LOGIN/grants/HMAC/secretos, prueba PG17 no-superuser/CV005 y extensión mínima V2 aprobada; autorización SQL separada. |
| A54-07 | P1 | Supabase Auth y Resend alojados no probados; el ensayo usa proveedor fixture y autenticador virtual, no prueba revocación remota ni entrega real. | Ensayo ficticio autorizado con proveedores alojados, alta, passkeys, login, recuperación/revocación y reconciliación verificadas. |
| A54-08 | P2 | Retención/custodia: borrado del sobre al terminar/expirar y cifrado de destinatario son positivos; no existe aún política final de metadatos y cleanup efectivo del worker, ni retención aprobada de invitaciones ordinarias. La expiración de job de enlace usa vigencia de enlace y puede conservar material en dispatching durante semanas tras caída. | Separar vencimiento de despacho de vigencia de enlace cuando proceda, limpieza y retención acordes a norma, sin nuevos servicios. |
| A54-09 | P2 | CI exacta incompleta, auditoría independiente y aceptación humana pendientes. El cuerpo del PR conserva corte histórico 1c7a2a61, no representa todo el HEAD. | Cerrar CI del árbol final, actualizar PR/tablero/matriz cuando el hito cambie de estado, revisión independiente si disponible y aceptación explícita. |

Referencias de código en el corte auditado: [SQL ROOT](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/docs/security/sql-candidates/staff_root_recovery_pg17.sql), [mail Node](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/apps/api/src/staff-root-recovery-mail-candidate.mjs), [sesión](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/apps/api/src/staff-passkey-session.mjs), [composición](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/apps/api/src/m2-restaurant-candidate.mjs), [PWA](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/apps/management/src/views/RootSecurityPanel.tsx), [ensayo genesis](https://github.com/jdlc86/CartaViva/blob/8a798c8d047d523a33060beddfbb7c53c6c0ec25/scripts/ci/staff-root-bootstrap-postgres17.test.mjs).

Controles positivos observados estáticamente: HMAC con dominios, login SQL restringido, lock singleton y caducidad posterior al lock, comparación de código, contador durable, no reenviar unknown automáticamente, AES-GCM con AAD ligada a actor/propósito/job, borrado de material en estados terminales, alerta al destinatario anterior como job sin secreto, separación de sesión de enrolamiento y operativa, feature opt-in. No equivalen a validación operacional.

## S54-06 — Orden de ejecución y siguiente hito

1. Comprobar CI del código auditado y nuevo HEAD; arreglar fallos reales sin bajar puertas. Completar en un solo bloque A54-01 a A54-05: correo y respaldo desde PWA, worker/rotación/alertas, flujo público y registro/reconciliación/revocación de Auth, fence transaccional. Reutilizar infra, módulos y ensayo genesis; integrar prueba negativa y concurrencia en la batería existente, no abrir micro-PRs. Si un proveedor impide garantía, documentar incompatibilidad y no improvisar bypass.
2. Cerrar H1-A como circuito único ordinario+genesis+recuperación, con permisos/preflights y delta exacto A54-06; resolver en conjunto decisiones normativas todavía abiertas sin reabrir recuperación aprobada. Prueba alojada y autorización operativa separadas A54-07.
3. Evaluar integración única #92, CI y revisión diferencial/independiente; no fusionar sin autorización. Después cerrar B-D, H2 y demás inventario sin repetir aprovisionamiento material acreditado. Mantener prioridad de primer despliegue ficticio.
4. Actualizar este documento S54 por hitos completos (SHA, evidencias, estado y bloqueantes), tablero vivo y matriz funcional al cambiar estado. Las pruebas de laboratorio, código, validación técnica y aceptación siguen separadas. No actualizar S52 para nuevos avances.

Normativa y fuentes: [AGENTS](../../AGENTS.md), [RF](../REQUISITOS_FUNCIONALES.md), [NF](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [estilo](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [home](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md), [aprobaciones](../design/APPROVAL_REGISTER.md), [gate visual](../design/VISUAL_CONTROL_GATE.md), [matriz](../design/FUNCTIONAL_UI_COVERAGE.json), [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [ciclo personal](../security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md), [gate invitaciones](../security/SABORA_STAFF_INVITATION_DELIVERY_DECISION_GATE.md), [V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md), [autorización](../SABORA_AUTHORIZATION_GATE.md). Antes de usar Antigravity leer íntegramente [guía](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md); no se ha usado ni encargado auditoría externa en S54.

**Dictamen S54-01:** H1-A parcial, NO-GO para integración como hito completo y NO-GO operativo. Cambios propios de este corte: creación de continuidad, revisión de código y consultas de GitHub/CI; sin cambios de código, normas, estados funcionales del tablero, main, merge, SQL/Auth/Resend real, VPS, secretos, despliegue ni Fleetia. Se eligió registrar la auditoría dentro de esta continuidad para evitar informes duplicados; no se introduce requisito normativo nuevo.


## S54-07 — Encargo integral a Codex publicado

El propietario solicita documento de encargo y prompt corto. Se publica [encargo S54 de cierre ROOT/H1-A](https://github.com/jdlc86/CartaViva/blob/c432f9b252b06fa385f29b778b44940f482f4752/docs/assignments/CODEX_S54_ROOT_RECOVERY_H1_A_CLOSURE_2026-11-26.md) en commit `c432f9b252b06fa385f29b778b44940f482f4752` de #92. Actualiza la ejecución pendiente del encargo H1-A de S52; no reimplementa lo completado ni abre otro PR. Prioridad A54-01..05 conjuntamente, después preparación/cierre de A54-06..09 dentro de decisiones y autorizaciones vigentes. Incluye criterios de prueba integrada PWA/API/PG17, revisión diferencial, delta append-only y propuesta mínima V2, preparación de prueba alojada (sin ejecución real), informe de hallazgos y actualización S54/tablero/matriz. Se preservan las decisiones ROOT aprobadas y se agrupan solo las restantes imprescindibles.

Prompt entregado:

> Ejecuta íntegramente el encargo: https://github.com/jdlc86/CartaViva/blob/c432f9b252b06fa385f29b778b44940f482f4752/docs/assignments/CODEX_S54_ROOT_RECOVERY_H1_A_CLOSURE_2026-11-26.md
>
> Continúa en el PR #92. Cierra por bloques completos la recuperación ROOT y H1-A, resuelve los hallazgos S54, ejecuta las pruebas integradoras y documenta evidencias. No te limites a otro plan. Respeta todas las restricciones del encargo.

Estado: publicado y verificado el documento; no consta envío a Codex ni ejecución. No se modifica código, normativa, estados funcionales, main, SQL/Auth/Resend real, VPS ni Fleetia. H1-A parcial / NO-GO. Revalidar HEAD y CI al retomar; el nuevo commit es documental.

## S54-08 — Resultado de implementación y revisión

La configuración de correo desde gestión, el fence transaccional y el despacho candidato se incorporan al mismo Draft #92. El [informe S54](../reviews/SABORA_S54_ROOT_RECOVERY_H1_A_REVIEW_2026-11-26.md) registra los estados A54-01–09, la prueba PG17 + Chromium, la propuesta V2 y el ensayo ficticio pendiente de autorización. H1-A permanece parcial. El siguiente corte requiere demostrar registro y reconciliación en el mismo UUID de Auth y verificar el delta con el DBA no-superusuario antes de cualquier decisión operativa.
