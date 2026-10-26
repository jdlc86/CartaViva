# CartaViva / Sabora — Continuidad de integración H3 → H4 → H5
Fecha: 2026-10-26. Estado: **ENCARGO DE DESARROLLO PROPUESTO, NO NORMA NUEVA**.
Repositorio autorizado: `jdlc86/CartaViva`.
Punto de partida conocido: PR Draft #15, SHA `516909987e8b479ddaefb4991e44af0f71d25318`. CI reportado y consultado: Sabora CI, Sabora client browser conformance y Bootstrap Sabora lockfile SUCCESS. No inferir de ello conexión a producción.

## Principio y límites
> Sabora debe parecer un restaurante de alta gama que ofrece una experiencia digital excepcional, tanto al comensal como al equipo.

**Precedencia absoluta**: documentación normativa del repositorio, en especial `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`, contratos de diseño y pantallas, especificaciones de QR, identidad, reservas, catálogo, pedidos, cocina, sala, permisos y eventos. Los documentos de continuidad y este encargo solo organizan trabajo: nunca inventan o reinterpretan normativa. Si hay ambigüedad material, registrar bloqueo y pedir decisión, no improvisar.

**Seguridad**: exclusivamente CartaViva. No tocar Fleetia ni ningún recurso ajeno del VPS compartido. No despliegues, reinicios, borrados, modificaciones del VPS, merge ni acciones en Supabase operativo sin autorización expresa. No cambiar datos reales ni secretos. Usar PostgreSQL 17 desechable y recursos aislados de prueba. No invocar Codex externo/revisor sin autorización.

## Paso 0 — Auditoría objetiva del PR #15
Antes de implementar, inspeccionar PR #15, base, HEAD, conflictos, estado Draft, CI, código y documentos normativos. Revisar informe de Codex y contrastar afirmaciones con rutas, pruebas y contratos. Determinar qué está completo de H1/H2/H3 y qué es solo presentación offline. No rehacer lo cerrado ni fusionar PR #15 sin autorización. Mantener tests 910/910, Playwright 12/12 y PG17 87/87 como referencias REPORTADAS, no como recuentos garantizados en nuevas ramas; verificar de nuevo. Verificar también separación real de cliente vs cocina/gestión en frontend y API.

Crear matriz `requisito | fuente normativa | implementación | evidencia | bloqueo`, incluyendo catálogo, identidad, QR, reservas, pedidos, anuncios, notificaciones, SSE/WebSocket, sala y cocina. Identificar interfaces ya existentes antes de añadir otras. Preservar las dos alternativas visuales de añadir a cesta como punto de partida no congelado; no cambiar navegación aprobada.

## Bloque A — Completar H3 sin simulaciones (integración real)
Objetivo: experiencia de cliente completa hasta donde lo permiten contratos aprobados y backend existente.
- Catálogo desde API y proyección autorizada: categorías publicadas y ordenadas por gestión, ocultar categorías vacías/ocultas, conservar categorías con todos los platos publicados agotados, distinguir agotado de retirado. Sin fixtures en producción.
- Identidad y sesiones según contrato normativo: no inventar registro obligatorio, passkeys, alias/ID o consentimiento; aplicar reglas documentadas. Aislamiento por restaurante único.
- QR real por mesa: generación/validación/revocación según contratos; no usar selector manual de QR. Cliente sin QR puede explorar y reservar platos reservables; PEDIR exige QR válido verificado en servidor; preservar cesta al cambiar contexto.
- Cesta persistente, opciones y precios: revalidación atómica, disponibilidad y versión; conservar selecciones inválidas con motivo, nunca borrarlas silenciosamente. Asegurar accesibilidad, ES/EN y offline sin falsas confirmaciones.
- Reserva: implementar únicamente estados y transiciones normativas; no inventar confirmaciones, pagos ni política comercial.
- Anuncios publicados/vigentes sobre «Nuestra carta»: `image:string|null`, con/sin foto, cero anuncios, imagen fallida, detalle, autoplay local cíclico, controles manuales, pausa al abrir detalle, reduced motion. Sin polling.
- Pedidos: confirmación real con idempotencia y concurrencia, ventana de agrupación configurable desde primer pedido confirmado, incorporaciones tardías y revisión de disponibilidad; respetar contratos normativos. No dar pedido por confirmado hasta confirmación del backend.
- Incidencias: distinguir (A) cesta, (B) pedido confirmado en ventana con revisión y «Reenviar pedido» inmediato, (C) comanda despachada a cocina con flujo operativo separado. Auditoría, versiones y reenvío idempotente.
- Eventos tras commit SSE/WebSocket y recuperación puntual por cursor/versión; push solo con consentimiento. Prohibido polling periódico de API/DB y workers que escaneen vencimientos. Para vencimientos usar planificación diferida fiable según contrato.
**Aceptación A**: tests integración API/PG17 y E2E navegador con escenarios sin QR, QR válido/inválido/revocado, reserva/pedido, cesta obsoleta, cambios concurrentes, anuncios y reconexión; toda función no implementable queda bloqueada honestamente, no simulada.

## Bloque B — H4 cocina y sala funcionales
- Inspeccionar PWA operativa existente y normativa antes de diseñar o reemplazar módulos. Mantener roles/permissions de servidor, rutas y bundles separados del cliente; probar rechazo de acceso cruzado. La PWA cliente NO puede acceder a cocina ni gestión.
- Cocina: comandas reales por mesa, ventana/cola, estados normativos, incidencias, agotados/reposiciones, acciones idempotentes, auditoría y estados de carga/error. Separar solicitudes de reserva de comandas.
- Sala: avisos persistentes y compartidos, listo para recoger, retirada/recuperación e historial/deduplicación según normativa, sin notificaciones ficticias. No asumir estados de preparación/entrega no aprobados.
- Gestión: respetar módulos y permisos existentes, publicación de categorías/platos/anuncios, mesas y QR solo en operaciones aprobadas; no reimplementar pantallas ya terminadas.
- Identidad visual común premium, pero densidad operativa, alto contraste y microinteracciones discretas. Tapiz exclusivamente en acceso passkey cocina si así lo establece la norma.
**Aceptación B**: operación real desde pedido confirmado hasta aviso a sala con eventos dirigidos, pruebas de autorización y concurrencia, E2E y capturas por viewport; no introducir controles de cocina en cliente.

## Bloque C — H5 integración extremo a extremo y robustez
- Probar cliente → confirmación → agrupación → cocina → sala → cierre según transiciones normativas. Incluir 2+ clientes de mesa, incorporaciones tardías, cancelaciones permitidas, agotado concurrente, reconexión, duplicados, fallo de red, rollback, versionado, reenvío y permisos.
- PG17 desechable: transacciones, aislamiento, índices, constraints, idempotencia, auditoría append-only, outbox/eventos y no duplicidad. Test de fallo de proceso en frontera commit/publicación; recuperación sin polling.
- Pruebas de seguridad: RLS/roles mínimos, auth y QR revocado, endpoints operativos inaccesibles para cliente, datos no expuestos, no dependencia de Fleetia. Pruebas de rendimiento, offline, accesibilidad WCAG AA, teclado y reduced motion.
- CI: gates funcionales y visuales objetivos, Playwright, axe, contratos, tests PG17 y screenshots reproducibles; no actualizar baseline visual congelado sin aprobación expresa. No afirmar que CI certifica estética final ni integración operativa no probada.
**Aceptación C**: demostración E2E reproducible en entorno aislado, reporte de cobertura y fallos, todos los gates aplicables verdes, límites explícitos.

## Ejecución autónoma y entregables
Trabajar en bloques completos, sin microcorrecciones inconexas. Ejecutar pruebas, esperar CI por shell, corregir y volver a probar. Commits por bloque, PR Draft, documentación actualizada al cerrar hitos, trazabilidad normativa, screenshots y resultados exactos de pruebas. Evitar conflictos con PR #15; si se requiere integración/merge o autorización operativa, detener solo esa acción y seguir con trabajo aislado.

**Informe final**: H3 restante/H4/H5 completos-parciales-bloqueados, rutas y SHA, PR Draft, checks GitHub Actions, tests ejecutados, limitaciones y decisiones pendientes. Confirmación explícita de que no se tocó Fleetia, VPS ni Supabase operativo, ni hubo merge/despliegue.

## Orden recomendado
0 auditoría PR #15 y normas → A cierre funcional H3 → B H4 cocina/sala → C H5 circuito completo. Implementar contratos backend compartidos una sola vez, sin duplicarlos por hito. El cierre de un bloque requiere evidencia, no solo documentación.
