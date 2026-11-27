# CartaViva / Sabora — continuidad de la sesión 55 (27-11-2026)

> CONTINUIDAD, no normativa, autorización ni aceptación. La normativa de main prevalece; las decisiones expresas del propietario recogidas en adendas candidatas no se presumen integradas. Solo jdlc86/CartaViva, un restaurante, dos PWA. Fleetia y demás recursos compartidos intocables. Prioridad: primer despliegue funcional de prueba con datos ficticios por V2, sin complejidad adicional.

## S55-01 — Apertura y corte verificable

El propietario solicita localizar S54 y crear S55. Se abre esta continuidad en el mismo [Draft #92](https://github.com/jdlc86/CartaViva/pull/92), sin PR adicional. [S54 completo hasta S54-35, corte inmutable](https://github.com/jdlc86/CartaViva/blob/8dcc29f05a0f4ae072fcd1e7e01998f9852377fe/docs/handoffs/SESSION_54_HANDOFF_2026-11-26.md). S54 queda como historial; registrar aquí los nuevos hitos.

Consulta directa GitHub: PR abierto, Draft, no fusionado, mergeable según metadatos (no aprobación), rama `fix/sabora-s51-first-deploy-20261124`, base `da02d5d97c3eb26d4c1530e0b0c4c4f7a14012d7`, HEAD previo a este documento `8dcc29f05a0f4ae072fcd1e7e01998f9852377fe`. La lista de archivos cambiados del PR no incluye supabase/migrations; no se recalcula el árbol ni se consulta ledger operativo. Issue #93 abierto. Se consulta AGENTS, S54, V2 candidato §10, CI, logs y tramo del harness fallido. No constituye auditoría integral ni independiente.

## S55-02 — CI exacta: 5/7 PASS, 2 FAIL

Corte `8dcc29f05a0f4ae072fcd1e7e01998f9852377fe`, 27-11-2026. Todos los workflows consultados finalizaron.

| Control | Resultado | Evidencia |
| --- | --- | --- |
| web-publication | PASS | [job](https://github.com/jdlc86/CartaViva/actions/runs/45988118477/job/140468809984) |
| validate / H6 consolidado | FAIL | [job](https://github.com/jdlc86/CartaViva/actions/runs/45988118477/job/140468810402) |
| generate-lockfile / PG17 real desechable | FAIL | [job](https://github.com/jdlc86/CartaViva/actions/runs/45988118751/job/140468811586) |
| functional-ui-gate | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45988118675) |
| navegador gestión | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45988118683) |
| navegador cliente | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45988118689) |
| instalabilidad | PASS | [run](https://github.com/jdlc86/CartaViva/actions/runs/45988118671) |
| CV005+B2 opt-in | SKIPPED | [run](https://github.com/jdlc86/CartaViva/actions/runs/45988118949) |

Los dos fallos coinciden en el ensayo PG17 + Fastify + Chromium de ROOT y primer ADMIN. El log de Bootstrap registra HTTP 400, `invalid_staff_lifecycle_request`, esperado 200; `activateForRecovery`, línea 523 de [staff-root-bootstrap-postgres17.test.mjs](https://github.com/jdlc86/CartaViva/blob/8dcc29f05a0f4ae072fcd1e7e01998f9852377fe/scripts/ci/staff-root-bootstrap-postgres17.test.mjs#L505-L535), llamada línea 526. H6 falla Block 2B en el mismo ensayo. El helper llama a la acción activate del ciclo ordinario para preparar el camarero objetivo antes de probar la recuperación del ADMIN titular. La causa raíz no está demostrada: contrastar payload con contrato HTTP y contexto de autoridad/fixture, sin asumir error de SQL ni rebajar aserciones. Las pruebas posteriores del recorrido no quedan acreditadas por este run. No confundirlo con el fallo previo B3/HMR de S54-33 ni dar éste por resuelto.

El gate UI comprueba trazabilidad, no aceptación humana. Los PASS históricos de S54 (incluido 62be3e98, 7/7) no se trasladan al HEAD. Este commit documental puede disparar nueva CI; comprobar SHA exacto y árbol antes de cualquier integración.

## S55-03 — Decisiones vigentes y alcance de Auth alojado

- S54-32: propietario decide validar Supabase Auth sobre el primer despliegue real de prueba de Sabora, no exigir ensayo aislado previo. Registrado en [V2 candidato §10](https://github.com/jdlc86/CartaViva/blob/8dcc29f05a0f4ae072fcd1e7e01998f9852377fe/docs/architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md#10-decisión-s54--aplazamiento-del-ensayo-aislado-auth-al-primer-despliegue-de-prueba).
- AP-01 a AP-09 siguen NOT RUN/aplazados, no PASS. Mantener criterios de passkeys, identidad, recuperación, revocación, sesiones y limpieza adaptada al despliegue, sin borrar identidades legítimas de arranque. [Informe proveedor](../reviews/SABORA_S54_HOSTED_AUTH_PROVIDER_ACCEPTANCE_2026-11-27.md); [seguimiento #93](https://github.com/jdlc86/CartaViva/issues/93). Sonda pública JWKS RS256 y opciones WebAuthn/RP ID PASS histórica, no acreditación del ciclo alojado.
- Retirada del secreto temporal de Actions confirmada por propietario en S54-33/34; revocación de la clave Supabase no acreditada. No recuperar ni trasladar secretos por chat/repo ni insistir en workflows administrativos bloqueados.
- ROOT único, separado del ADMIN titular. Conservar íntegramente decisiones aprobadas de recuperación ROOT en S54-04 y contrato candidato: segunda passkey ordinaria o recuperación excepcional por email de seguridad y código independiente de 128 bits, límites acumulativos y rotación conforme a contrato. No reabrir ni añadir factores.
- Resend elegido; la entrega real no está validada. Mantener las reglas de autoridad y recuperación no ROOT registradas en S54; no inferir aprobación de decisiones normativas restantes.
- La excepción V2 de primera activación ficticia no autoriza uso real ni elimina otras puertas. Merge, delta SQL, VPS y despliegue requieren autorizaciones correspondientes; no heredarlas de la decisión de calendario.

## S55-04 — Inventario de continuidad por hitos

| Hito | Estado de partida | Pendiente |
| --- | --- | --- |
| H1-A login, genesis, primer ADMIN, directorio y ciclo ordinario | Candidatos y evidencia histórica de laboratorio | Resolver CI roja, composición completa y prueba integradora |
| H1-A recuperación ROOT | Núcleo PG17, correo/rotación, fence y piezas PWA candidatos; ver S54 e informes | Verificar recorrido completo, respaldo, registro/reconciliación y revocación remota, alertas, permisos y delta |
| H1-A recuperación no ROOT | Intención durable, entrega cifrada, consumo vinculado a UUID/sesión, fence local y recibos candidatos; S54-34 conecta worker candidato, S54-35 revalida huella del ADMIN titular | CI actual FAIL; composición HTTP/PWA, correlación real Auth, fence de mutaciones en vuelo, alertas/retención y prueba integral |
| H1-B llamada | Candidato de ambas PWA según S54 | Push/recordatorios, aceptación funcional |
| H1-C cambio mesa | Candidato conectado según S54 | Ventana administrativa y aceptación |
| H1-D catálogo/QR/pedidos y operación | Inventario previo | Despacho agrupado runtime y resto de inventario |
| H2 primer despliegue ficticio V2 | Preparación histórica, genesis previamente ejecutado según S54 | Delta append-only aprobado y no-superuser, receptor durable, controlador, egress/aislamiento, Environment/SSH exclusivos, plan exacto y autorización |
| H3/H4 | Inventario previo vigente | Cierre según normativa e inventario, no reclasificar |

H2 histórico no reinspeccionado: RESTAURANTE PG17.11, 103 migraciones genesis, 23 LOGIN restringidos, 27 ficheros de secretos, dos LISTEN, pooler verify-full, JWT RSA/RS256, redes Sabora, TLS/8443. HMAC inicial vence 24-12-2026 20:42:58.423 UTC según continuidad previa. No repetir genesis ni reprovisionar a ciegas. V2 §9 limita reutilización del recibo genesis a igualdad exacta; no extrapolar a un delta distinto. Consultar [inventario de cierre único](../tracking/SABORA_FINAL_DEPLOYMENT_CLOSURE_INVENTORY_2026-11-25.md) y estado real antes de operar. No afirmar backup/restore, aceptación visual ni disponibilidad de usuarios reales.

## S55-05 — Orden de ejecución propuesto

1. Resolver el fallo de activación del fixture/contrato con diagnóstico de causa raíz, conservando el escenario de recuperación del titular y las negativas. Ejecutar batería integradora del mismo PR; no crear PRs de microcorrecciones ni desactivar gates.
2. Cerrar H1-A como bloque funcional: composición ROOT/no ROOT, rutas y controles PWA aprobados, identidad existente, autoridad durable, fence transaccional y revocación/reconciliación, worker y alertas usando infraestructura existente. Resolver A54-01..06, 08..09 según informe y estado actualizado; A54-07 se valida sobre despliegue conforme a S54-32. Consolidar delta append-only y preflight DBA no-superuser sin modificar genesis. No presentar el proveedor simulado como prueba real.
3. Evaluar integración única #92 con batería robusta, revisión diferencial e independiente si disponible. Actualizar tablero y matriz al cerrar hito, no por este documento de apertura. Solicitar autorización de merge cuando se cumplan las puertas aplicables.
4. Completar B-D y preparación del primer arranque ficticio por V2 de acuerdo con inventario vigente, reutilizando lo ya acreditado. Acreditar Auth/Resend y ambas PWA en entorno desplegado bajo autorización y datos ficticios. Mantener seguridad y aislamiento absoluto de Fleetia.

## S55-06 — Referencias y límites

Antes de implementar, leer normativa vigente: [AGENTS](../../AGENTS.md), [RF](../REQUISITOS_FUNCIONALES.md), [NF](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [home](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md), [aprobaciones](../design/APPROVAL_REGISTER.md), [gate visual](../design/VISUAL_CONTROL_GATE.md), [matriz](../design/FUNCTIONAL_UI_COVERAGE.json), [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [ciclo personal](../security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md), [gate invitaciones](../security/SABORA_STAFF_INVITATION_DELIVERY_DECISION_GATE.md), [V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md) y [autorización](../SABORA_AUTHORIZATION_GATE.md). Contrastar main y adendas candidatas sin sustituir normativa por continuidad. Antes de usar Antigravity leer íntegramente [guía](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md).

**Dictamen de apertura:** H1-A parcial, CI roja, NO-GO de integración en este corte y NO-GO operativo. Solo se crea continuidad, se consulta GitHub y se propone orden de ejecución; no se modifica código, normativa, matriz, tablero, main, secretos, SQL/Auth/Resend operativo, VPS ni Fleetia. Sin merge ni despliegue, sin pruebas nuevas propias. La decisión editorial de abrir S55 en el Draft existente evita duplicar documentación y PRs. Diagnóstico de causa raíz y verificación de infraestructura pendientes. Registrar nuevos avances aquí con SHA, evidencias y distinción código/pruebas/validación/aceptación.


## S55-07 — Corrección de activación validada

El commit [5157d50b](https://github.com/jdlc86/CartaViva/commit/5157d50b43c863d070d33ef54af0e48eb2f40ce5) corrige el fixture de activación ordinaria: el endpoint durable exige subjectUserId=null y resuelve la identidad desde PostgreSQL, no acepta un UUID proporcionado por el cliente aunque sea correcto. Se conserva la negativa 400 y se comprueban ausencia de membresía tras la petición rechazada, activación 200 y rol/estado durable de camarero y cocina. CI 7/7 PASS en ese SHA ([CI/H6](https://github.com/jdlc86/CartaViva/actions/runs/46010457209), [PG17](https://github.com/jdlc86/CartaViva/actions/runs/46010457344)), CV005+B2 omitido. Cierre del fallo reproducido, no de H1-A.

## S55-08 — Ceremonia candidata de recuperación del personal

Se incorpora [coordinador de registro y revocación](https://github.com/jdlc86/CartaViva/commit/0a6759fc4dc90b1381b74e56c1453a51f99a62db), con ensayo integrador ampliado [c2e320df](https://github.com/jdlc86/CartaViva/commit/c2e320df79d6397b2985a9e5e20e738c06a07dbd). Reutiliza sesión Auth firmada en custodia del servidor, intención consumida, ticket HMAC ligado a sujeto/sesión/intención/desafío/origen/caducidad, y rutina PG17 de preparación de un solo uso. Antes de registrar remotamente, el fence durable impide el acceso con cualquier credencial del usuario. Se exige recibo de registro nuevo no presente en el inventario anterior del proveedor y coincidencia exacta del inventario posterior. Registra evidencia, revoca únicamente las passkeys anteriores del mismo sujeto, comprueba que solo queda la nueva y exige acuse de logout global antes del recibo de revocación y cierre. Ante fallo o respuesta incierta posterior a prepare conserva el fence y no repite mutaciones automáticamente. No interpreta el acuse de logout como revocación inmediata de todo JWT.

El harness existente sustituye el cierre positivo por la ceremonia con proveedor simulado: ticket alterado/intención distinta, tres competidores, una sola mutación, fence observable desde HTTP y SQL, rechazo de cierre prematuro, revocación y acceso nuevo; escenario de pérdida de respuesta para camarero conserva bloqueo tras reinstanciar el coordinador. CI del nuevo árbol pendiente al publicar; no se acredita ejecución propia ni prueba alojada. No se abre ruta pública ni se monta en runtime: siguen pendientes el adaptador administrativo Auth exacto, generación y vinculación del proof de correo, custodia de sesión restringida en HTTP, revalidación de mutaciones en vuelo, reconciliación durable atribuible de efectos inciertos, UI y cierre integral ROOT/no ROOT. La evidencia hash no sustituye a un expediente recuperable de reconciliación. No se da por aprobado ningún detalle de retención ni vigencia nuevo. No se crean servicios, LOGIN, migraciones de genesis ni claves operativas. A54-07/AP-01..09 continúan aplazados conforme a S54-32.

Dictamen: H1-A parcial; sin autorización de integración ni despliegue, sin cambios operativos en Supabase/Resend/VPS/Fleetia. Se conserva mismo Draft #92. Actualizar matriz y tablero cuando se cierre el hito con evidencia, no promover estado por este subavance.
