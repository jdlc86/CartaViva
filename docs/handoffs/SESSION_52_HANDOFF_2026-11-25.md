# CartaViva / Sabora — continuidad de la sesión 52 (25-11-2026)

> DOCUMENTO DE CONTINUIDAD. No constituye normativa, aceptación, evidencia de ejecución propia ni autorización operativa. Prevalecen los documentos normativos de main. Repositorio exclusivo jdlc86/CartaViva; Sabora es un único restaurante con dos PWA. Fleetia y demás recursos compartidos son intocables. Prioridad: primer despliegue funcional ficticio, sin añadir complejidad a V2.

## S52-01 — Reanudación de S51 y corte de GitHub

El propietario pidió retomar el cierre de autenticación que Codex no terminó al final de S51. Se leyó [continuidad S51 en main](SESSION_51_HANDOFF_2026-11-24.md) y también su [versión posterior y más completa, 706ca202](https://github.com/jdlc86/CartaViva/blob/706ca2027f71c8faa463263141338788d3b7b12a/docs/handoffs/SESSION_51_HANDOFF_2026-11-24.md). La versión main no recoge todos los avances posteriores de aprovisionamiento; evitar recuperar pendientes ya resueltos basándose solo en ese corte antiguo.

GitHub confirma [PR #92](https://github.com/jdlc86/CartaViva/pull/92) abierto y Draft, rama `fix/sabora-s51-first-deploy-20261124`, base `da02d5d97c3eb26d4c1530e0b0c4c4f7a14012d7`, HEAD antes de este documento `fc14d64af7754adc984b66a7519d489f1be69e61` (encargo documental S52). HEAD de implementación previo `a9d072d93221efb00149d3927a9c2ed4bd8d7d28`; no se ha integrado ni desplegado. La base protegida y los cuatro checks históricos de main están documentados en el [inventario único de cierre](https://github.com/jdlc86/CartaViva/blob/50fb9398c6813c32b4c2f8a98efff567d59eea0e/docs/tracking/SABORA_FINAL_DEPLOYMENT_CLOSURE_INVENTORY_2026-11-25.md). El inventario es punto de partida: sus brechas de entrypoints preceden al trabajo posterior de Codex.

## S52-02 — Resultado parcial de Codex: H1 conexión funcional

Se leyó [informe H1 de Codex](https://github.com/jdlc86/CartaViva/blob/a9d072d93221efb00149d3927a9c2ed4bd8d7d28/docs/reviews/SABORA_FINAL_CLOSURE_H1_FUNCTIONAL_CONNECTION_REVIEW_2026-11-25.md) y la descripción actual del PR #92. Se conserva la distinción entre candidato, pruebas de laboratorio, proveedor real y aceptación.

| Bloque | Candidato implementado/probado según informe | Pendiente |
| --- | --- | --- |
| H1-A / A03-F01 identidad | Login por passkey en entrypoint publicado; Fastify verifica JWT RS256, AMR passkey, sesión en Auth y membresía SQL; origen/UV, roles, cookie segura, recarga/caducidad/logout | Auth alojado, ROOT inicial, primer ADMIN titular, invitación y entrega durable, aceptación/registro de passkey, activación, directorio, recuperación, revocación integral desde UI |
| H1-B / F07-CV014 llamada | Descubrimiento real de feature, petición cliente y atención por gestión; PG17/Fastify y dos builds en Chromium | Recordatorios fuera de PWA y push de dispositivo; prueba con Auth alojado y aceptación |
| H1-C / F08-H6 cambio mesa | Entry cliente, solicitud/estado/decisión/cola en runtime; se preserva visita si falla destino | Prueba con Auth alojado en gestión, escritura administrativa y UI de ventana de cambio |
| H1-D funciones conectadas | Catálogo/QR/cesta/pedido y gateways M2/M3, regresiones existentes | Despacho agrupado conectado a runtime distribuible sin Stripe, funciones H3/H4 según inventario y aceptación |

El propietario eligió Resend para invitaciones. El informe propone SMTP personalizado de Supabase Auth con remitente verificado y secreto de envío custodiado. No reabrir la elección de proveedor; quedan por cerrar protocolo durable, enlace seguro de enrolamiento, custodia, claims, recuperación, reconciliación, política y validación real. No confundir correo tardío con autorización: revocación desde el primer registro invalida el acceso aunque el proveedor entregue posteriormente.

### Evidencia de CI del candidato previo

Según el PR, el SHA de implementación `a9d072d93221efb00149d3927a9c2ed4bd8d7d28` y el SHA de prueba `420a044f1dc68071a755d6356153e550c40f8824` comparten árbol `9442344bc3ced37060bc4a12b35776c1180aea9f`.

- [validate y web-publication](https://github.com/jdlc86/CartaViva/actions/runs/45684102340), [generate-lockfile](https://github.com/jdlc86/CartaViva/actions/runs/45684102391) y [functional-ui-gate](https://github.com/jdlc86/CartaViva/actions/runs/45684102404): 4/4 PASS reportados.
- [Ensayo Chromium/Fastify/PG17](https://github.com/jdlc86/CartaViva/actions/runs/45684102391/job/139452015165): login desde bundle operativo con proveedor aislado y autenticador virtual, recuperación tras recarga, atención de llamada auditada y logout. [Navegador cliente](https://github.com/jdlc86/CartaViva/actions/runs/45684102424), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/45684102502) e [instalabilidad](https://github.com/jdlc86/CartaViva/actions/runs/45684102456) PASS reportados.
- Visual final y opt-in histórico CV005+B2 SKIPPED; no PASS. Gate funcional no equivale a aprobación humana. Escaneo Codex Security no pudo abrir checkout; revisión directa del autor no es revisión independiente.
- S52 no volvió a ejecutar ni consultar individualmente los jobs. No atribuir los resultados anteriores a un SHA documental posterior. Verificar el nuevo HEAD y sus checks en próxima sesión.

Dictamen: H1 parcial, NO-GO de integración como hito completo y NO-GO operativo. Autenticación real y ciclo de personal no están cerrados.

## S52-03 — Encargo único de cierre H1-A publicado

Se recuperó el [encargo H1 original](https://github.com/jdlc86/CartaViva/blob/8c0218731501bfa2457ac82ef09dd7b022dfb3fa/docs/assignments/CODEX_FINAL_CLOSURE_H1_FUNCTIONAL_CONNECTION_2026-11-25.md) y se contrastó con AGENTS.md, el ciclo de personal, el gate de invitaciones y el contrato ROOT/ADMIN. No se localizó el encargo nuevo anterior publicado; se reconstruyó y publicó en la misma rama de PR #92, sin abrir PR adicional.

**[Encargo H1-A completo para Codex](https://github.com/jdlc86/CartaViva/blob/fc14d64af7754adc984b66a7519d489f1be69e61/docs/assignments/CODEX_H1_STAFF_AUTHENTICATION_CLOSURE_2026-11-25.md)** — commit documental `fc14d64af7754adc984b66a7519d489f1be69e61`.

Alcance: ROOT único y protegido; arranque seguro del primer ADMIN titular conforme a norma; invitación Resend, aceptación UUID, enrolamiento y activación; directorio, sesión y acciones autorizadas; recuperación, suspensión y revocación; outbox transaccional, custodia cifrada, fencing, reconciliación y permisos mínimos. Reusar módulos existentes. Mantener ROOT fuera del flujo ordinario y de la titularidad ADMIN. No sustituir passkeys de gestión por password/OTP/magic link operativos ni importar permisos Fleetia. Resolver juntas decisiones normativas pendientes, sin presumir aprobación. No reimplementar B–D ni perder regresiones. Una prueba integradora principal, y pruebas aisladas solo para diagnóstico o invariantes críticas. Preparar ensayo alojado con usuarios ficticios, sin efectuar cambios reales sin autorización expresa.

Prompt corto entregado al propietario:

> Ejecuta íntegramente el encargo: https://github.com/jdlc86/CartaViva/blob/fc14d64af7754adc984b66a7519d489f1be69e61/docs/assignments/CODEX_H1_STAFF_AUTHENTICATION_CLOSURE_2026-11-25.md
>
> Continúa sobre el PR #92. Cierra integralmente la autenticación y el ciclo de identidad del personal, reutilizando lo ya desarrollado. Implementa, ejecuta pruebas integradoras, revisa la seguridad y documenta los resultados. No te limites a elaborar otro plan. Respeta las restricciones y autorizaciones del documento.

**Estado:** encargo publicado, prompt entregado; no consta envío a Codex, ejecución, nuevo código, pruebas ni respuesta de cierre. No abrir otro encargo por defecto: consultar PR #92 y reporte de Codex, recuperar cambios concurrentes y evaluar resultados.

## S52-04 — Estado material previo de H2 y SQL, no repetir trabajo

Fuentes: [continuidad S51 completa](https://github.com/jdlc86/CartaViva/blob/706ca2027f71c8faa463263141338788d3b7b12a/docs/handoffs/SESSION_51_HANDOFF_2026-11-24.md) y [informe de preparación operativa H2](https://github.com/jdlc86/CartaViva/blob/8c9497225651602d848cc805321bc14b1ec0ef77/docs/reviews/SABORA_S51_FIRST_TEST_DEPLOYMENT_CLOSURE_2026-11-24.md). Evidencia histórica, no inspección nueva S52.

- Supabase RESTAURANTE `byhvmumqivmunkmomhup`: PG17.11; 103 migraciones ya aplicadas una vez, árbol `634d7e863554ba4d5704275164abbd30213d16b7`; recibo genesis original de `fa1759a0` protegido y ledger exacto. 23 LOGIN restringidos, keyring HMAC inicial, 27 archivos de secretos y dos LISTEN ya provisionados; autenticación al pooler TLS verify-full verificada. JWKS RSA/RS256 compatible tras actuación del propietario. Vigencia HMAC inicial hasta 24-12-2026 20:42:58.423 UTC: planificar rotación controlada antes del vencimiento, no rotar por rutina. No repetir genesis, aprovisionamiento ni rotación JWT. Readiness y HMAC funcional en API real aún pendientes.
- Mantener las 103 migraciones byte a byte y recibo/ledger originales. Para H1-A los 23 slots no cubren todo el ciclo/directorio/despacho; determinar delta exacto de principales, grants, keyrings, secretos y SQL. Si son necesarias migraciones append-only, preparar propuesta normativa y mecanismo V2 probado para esa cadena distinta; §9 de igualdad no permite declarar compatible por inferencia. Aplicación real requiere autorización SQL separada. No reescribir historia, ni reejecutar genesis.
- VPS: tres redes Sabora y tabla ingress ya creadas; TLS origen y puerto dedicado 8443 preparados según inspección histórica. Mantener aislamiento. Orígenes aprobados https://sabora.allaiso.com:8443 y https://gestion-sabora.allaiso.com:8443. RP ID gestión: gestion-sabora.allaiso.com.
- H2 pendiente: publicación autorizada del receptor HTTPS durable (candidato Worker/DO), ACK real, acceso ficticio restringido de ambos hosts/API, egress/reserva/aislamiento verificados, instalación de controlador V2 root-owned, canal SSH exclusivo, Environment sabora-live (último informe lo registraba ausente; reconfirmar), configuración final, plan exacto del SHA integrado, autorización de deploy y postchecks reales. No reusar paquetes de un SHA anterior. No introducir otro VPS, PC doméstico, V1, Tailscale, firmas adicionales ni procedimientos paralelos.
- Excepción genesis limitada a primer ensayo ficticio; no usuarios reales, ni segundo release/rollback ordinario hasta recuperación aplicable. No simular copias, restore o aceptación. H3/H4 conservan el resto de requisitos según inventario.

## S52-05 — Orden de continuación y entregables

1. Consultar PR #92, HEAD, commits, checks y resultado de Codex H1-A. Si no se ha ejecutado, enviar el prompt anterior. No dar por cerrado por informe sin implementación.
2. Revisar recorrido completo, matriz de permisos y seguridad, delta de migraciones y configuración, prueba integrada PG17/Fastify/Chromium del bundle real, revisión independiente cuando disponible. Resolver solo decisiones indispensables no aprobadas. Separar autorización para configuración real de Auth/Resend, ROOT ficticio y pruebas de proveedor de la tarea técnica. Sin cierre material no declarar H1-A plenamente validado.
3. Conservar pendientes B–D del informe H1 y H3/H4 del inventario; seguir por bloques grandes. Avanzar H2 en paralelo si autorizado sin interferir con el candidato. Antes de fusionar, evaluar un único PR consolidado #92, CI exacta y riesgos de integración; solicitar autorización expresa. No fusionar ni desplegar por inferencia.
4. El propietario prueba y acepta ambas PWA tras activación autorizada. Actualizar tablero vivo, matriz funcional, informe H1-A y esta continuidad al cerrar hitos materiales, sin crear documentos normativos paralelos.

## S52-06 — Referencias, cambios y límites

Fuentes obligatorias para agentes: [AGENTS.md](../../AGENTS.md), [RF](../REQUISITOS_FUNCIONALES.md), [NF consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [registro de aprobación](../design/APPROVAL_REGISTER.md), [puerta visual](../design/VISUAL_CONTROL_GATE.md), [matriz funcional](../design/FUNCTIONAL_UI_COVERAGE.json), [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [ciclo personal](../security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md), [entrega de invitaciones](../security/SABORA_STAFF_INVITATION_DELIVERY_DECISION_GATE.md), [ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [V2](../architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md), [autorización](../SABORA_AUTHORIZATION_GATE.md). Leer versiones normativas de main, cotejar cambios candidatos; continuidad no prevalece.

Antigravity es opcional como auditor independiente si disponible y autorizado; leer íntegramente [guía](../integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [puente V2](../integrations/SABORA_ANTIGRAVITY_GITHUB_TASK_BRIDGE_V2.md) antes de usar. No se encargó auditoría en S52.

Cambios propios S52: publicación del encargo H1-A y creación de este documento en la misma rama Draft #92 para evitar PR documental adicional. No cambios funcionales, normas, main, merge, SQL, Auth, Resend, VPS, Cloudflare, secretos, despliegue ni Fleetia. No se han ejecutado nuevas pruebas en S52. No se ha actualizado estado funcional del tablero por la mera creación de un encargo. No transferir autorización histórica a operaciones nuevas.

**Corte S52:** H1-A pendiente de ejecución y revisión de Codex; H1 parcial y NO-GO operativo. Mantener prioridad primer despliegue ficticio funcional.

## S52-07 — Integración candidata de directorio y revocación

[Draft #92](https://github.com/jdlc86/CartaViva/pull/92) conecta la ficha propia, el directorio de ADMIN y la revocación por el titular desde la PWA de gestión y a través de dos LOGIN SQL dedicados. Se añade un adaptador aislado de Resend y se conserva el árbol de genesis. El resultado del ensayo PG17/Fastify/Chromium, los pendientes agrupados y el inventario de configuración se registran en el [informe S52](../reviews/SABORA_S52_H1_A_STAFF_IDENTITY_REVIEW_2026-11-25.md) y en los checks del PR. El [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) conserva H1-A parcial y NO-GO operativo.

## S52-08 — Contraste del resultado H1-A y decisiones para completar el ciclo

El propietario trasladó el informe de Codex. Consulta de GitHub confirma #92 abierto/Draft, base `da02d5d97c3eb26d4c1530e0b0c4c4f7a14012d7`, HEAD de implementación `1c7a2a613bc88f58f11e244324dc039926d17852`. Este corte sustituye la indicación de S52-03 de que no constaba ejecución. Se leyó íntegramente el [informe H1-A](https://github.com/jdlc86/CartaViva/blob/1c7a2a613bc88f58f11e244324dc039926d17852/docs/reviews/SABORA_S52_H1_A_STAFF_IDENTITY_REVIEW_2026-11-25.md).

**Resultado candidato:** login por passkey desde bundle de gestión, ficha propia /api/v1/staff/me, directorio ADMIN /api/v1/staff/directory, revocación motivada POST /api/v1/staff/lifecycle. Revalidación SQL de titularidad y membresía bajo locks, auditoría y rechazo de aceptación tardía. El adaptador API de Resend usa un POST tras fence, idempotencia por job y resultado incierto cercado para reconciliación; probado con respuesta simulada, no entrega real. El circuito de envío durable, material del enlace y despacho apto para instalación siguen pendientes.

**Evidencia reportada por PR, no reejecutada por ChatGPT:** commit de prueba `876cccdf5c975c2fd8801c88c0a8d1057f580823` comparte árbol `fc9855cab4e7d5f0f4e85a1ab72c409318f6ddd6` con 1c7a2a61. Cuatro checks requeridos PASS: [validate/web-publication](https://github.com/jdlc86/CartaViva/actions/runs/45719455100), [generate-lockfile y ensayo PG17](https://github.com/jdlc86/CartaViva/actions/runs/45719456483/job/139573806797), [functional-ui-gate](https://github.com/jdlc86/CartaViva/actions/runs/45719455125). El ensayo Chromium/Fastify/PG17 verifica ficha propia, directorio, denegación al ADMIN lector, revocación de invitación pendiente y de miembro activo, auditoría y bloqueo de acceso posterior. [Cliente](https://github.com/jdlc86/CartaViva/actions/runs/45719455067), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/45719454916) y [PWA](https://github.com/jdlc86/CartaViva/actions/runs/45719454899) PASS reportados; visual final y CV005+B2 histórico SKIPPED. Codex Security no pudo resolver HEAD; revisión diferencial del autor no equivale a auditoría independiente.

**Delta:** árbol de 103 migraciones originales `634d7e863554ba4d5704275164abbd30213d16b7` sin alteración según informe. Directorio y revocación requieren dos LOGIN dedicados adicionales y dos claves HMAC separadas (dos contraseñas + dos secretos HMAC), aún no provisionados. `staff.directory.pool` y `staff.revocation.pool`, con preflight exacto, TLS verify-full y filas correspondientes del keyring lifecycle. No confundir estos cuatro archivos potenciales con un inventario final del ciclo completo; el generador S51 conserva los 23 slots originales y outbox/contactos/custodia requerirán delta append-only. Adaptador API requiere destino exacto api.resend.com:443, clave de envío restringida y remitente verificado. Sin cambios operativos.

**Cuatro decisiones agrupadas que Codex solicita explícitamente, aún NO aprobadas en este corte:**

1. Concesión de un solo uso del propietario para bootstrap ROOT y enrolamiento excepcional del primer ADMIN, con prueba de passkey y consumo durable auditable. ROOT no se convierte en titular ni escritor ordinario; asigna titularidad mediante mecanismo existente al ADMIN activo. Falta concretar el mecanismo verificable sin backdoor.
2. Custodia cifrada temporal del enlace y retención máxima: propuesta Auth generateLink + único envío por API Resend, en lugar de SMTP de Auth como vía de despacho de invitaciones. Motivo indicado por Codex: el SMTP no ofrece interfaz documentada para clave de idempotencia por job; API sí permite asociarla. Resend ya fue elegido, pero la modalidad concreta y política de retención aún requieren aprobación. No usar doble vía de envío; revisar privilegio de generación de enlace, cercado de resultados ambiguos y recepción efectiva.
3. Recuperación ordinaria mediante segunda passkey y procedimiento excepcional auditado para pérdida de todas. La segunda credencial no es un bypass del requisito passkey. Concretar autoridad, prueba de identidad y protección frente a toma de cuenta, incluido ROOT; no aprobar una recuperación por correo sin más.
4. Reconocer en V2 un recibo del delta encadenado a genesis que verifique prefijo original, digests posteriores, identidad DBA, resultado y compatibilidad del release. No repetir genesis ni modificar el ledger original. Ensayo PG17 no-superuser y autorización SQL separada. No adoptar como norma sin aprobación expresa.

**Siguiente acción:** resolver esas decisiones conjuntamente con el propietario para que Codex pueda acabar el encargo H1-A ya existente en #92, no crear otro micro-PR ni otro encargo redundante. Cerrar bootstrap, enrolamiento, activación, suspensión, recuperación y entrega durable con prueba integral. Prueba de proveedores alojados y cualquier aprovisionamiento real requieren autorización operativa separada. Mantener restantes pendientes H1-B/C/D y H2-H4.

**Dictamen S52 actualizado:** H1-A parcial con incremento técnico probado en laboratorio; NO-GO para integración como ciclo completo y NO-GO operativo. No se ha realizado auditoría independiente, prueba remota Auth/Resend, aprobación normativa, nuevo test por ChatGPT, merge, deploy ni intervención Supabase/VPS/Fleetia en este corte. Actualización documental en el mismo Draft.

## S52-09 — Aprobación del arranque y comienzo de implementación propia (26-11-2026)

El propietario respondió «Okk» tras solicitar explícitamente aprobación del flujo de arranque ROOT y primer ADMIN: concesión inicial de un solo uso, ROOT con identidad/passkey verificada, excepción de incorporación del primer ADMIN, asignación de titularidad por ROOT a ADMIN ya activo y cierre permanente de la excepción. ROOT no adquiere escritura administrativa ordinaria. La aprobación es de diseño, no de SQL real, usuarios, configuración de proveedores, merge o despliegue. No extiende por inferencia las decisiones de retención, recuperación ni compatibilidad V2 del delta.

Se comprobó el ciclo existente: el wrapper ordinario exige ADMIN activo titular para invitar/activar, mientras la titularidad requiere ADMIN activo; por tanto el arranque necesita frontera excepcional explícita. No se cambia la regla ordinaria ni se asigna provisionalmente titularidad a ROOT.

Primer incremento de desarrollo propio en #92: SQL candidato `docs/security/sql-candidates/staff_root_bootstrap_pg17.sql`, coordinador `apps/api/src/staff-root-bootstrap-candidate.mjs` y ruta opcional de ceremonia fresca en `staff-passkey-session.mjs` (sin habilitación en composición operativa). Concesión de operador vinculada a UUID de Auth, verificador de código aleatorio, HMAC ligada a LOGIN, concesión, UUID, sesión y ventana breve; lock de singleton de gobierno, comprobación de ausencia de personal y titular, alta ROOT, consumo irreversible y recibo append-only en una transacción. El verificador se borra al consumir; no se devuelve código ni token a HTTP. El runtime no puede emitir concesiones ni acceder a tablas. Se propone ventana máxima de concesión de 15 minutos y de capacidad de 30 s como decisión técnica candidata, no política normativa adicional. El código se entrega al propietario solo por canal seguro; la provisión real queda pendiente.

Prueba integradora añadida al harness PG17 existente usando una base desechable clonada antes de sembrar personal, Fastify y proveedor aislado con JWT firmado: acceso sin concesión, UUID incorrecto, caducidad, código inválido, SQL directo denegado, carrera de dos consumos, recibo único, verificador borrado, ROOT protegido y login posterior. El proveedor del test no valida criptográficamente WebAuthn; no equivale a navegador ni Auth alojado. CI pendiente; no marcar PASS sin resultado exacto. El SQL permanece fuera de las 103 migraciones; falta traslado append-only conforme a CV005 con DBA no-superuser y aprobación de compatibilidad V2.

**Límite:** este incremento no completa el primer ADMIN ni el arranque desde PWA, no monta la ruta en runtime ni provee credenciales; faltan preflight operativo del LOGIN y emisión/custodia autorizada de concesión, integración con enrolamiento/entrega durable, activación excepcional estrictamente ligada a primer ADMIN y cierre de excepción, recuperación, pruebas reales e independiente. Se continuará en mismo PR #92, sin tocar infraestructura ni Fleetia.
