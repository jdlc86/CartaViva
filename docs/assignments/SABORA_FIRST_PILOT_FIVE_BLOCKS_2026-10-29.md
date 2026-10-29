# Sabora — encargo de cierre de primera versión piloto

Fecha: 2026-10-29
Estado: ENCARGO DE IMPLEMENTACIÓN PREVIA A DESPLIEGUE; no autoriza merge, despliegue, VPS ni Supabase operativo.
Repositorio exclusivo: jdlc86/CartaViva.
Punto de partida: PR #40 Draft, auditoría P3, inventario docs/reviews/SABORA_FIRST_PILOT_READINESS_INVENTORY_2026-10-29.md.

## Objetivo
Cerrar los puntos abiertos de código, integración y verificación necesarios para un piloto de Sabora en el futuro entorno de producción, usando datos ficticios y sin usuarios reales. No confundir un candidato técnico con una aplicación desplegada. Priorizar implementación de bloques completos, no correcciones aisladas.

## Fuente de verdad
Antes de implementar, leer documentos normativos vigentes, incluidos docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md, docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md, docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md, docs/architecture/SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.md, docs/DESIGN_SYSTEM_CONTRACT.md, docs/design/DESIGN_REQUIREMENTS_V1.md, y contratos específicos de identidad, cocina/sala, permisos y publicación. Contrastar versiones y conflictos, sin reinterpretar ni sustituir la normativa por handoffs o este encargo. Mantener diseño visual aprobado.

## Bloques autónomos y persistentes

### Bloque 1 de 5 — Integración funcional backend
Cerrar la API actualmente health-only mediante composiciones operativas autorizadas por normativa, rutas de cliente/gestión, transacciones, idempotencia, permisos mínimos, validación negativa y PostgreSQL 17 desechable. No habilitar rutas sin autenticación y gates. Entregar pruebas y contrato E2E.

### Bloque 2 de 5 — Recorrido real QR a cocina y sala
Conectar ambas PWA con API, persistir mesa/QR/visita/catálogo/pedido/agrupación/cocina/sala y notificaciones según flujos aprobados. Probar concurrencia, revocaciones, reintentos, fallos de red, offline, pedidos tardíos, notificaciones y estados. No afirmar éxito en respuestas ambiguas.

### Bloque 3 de 5 — Estudio de Imágenes Google Gemini
Implementar exclusivamente lo previsto en docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md: foto original obligatoria e inmutable; backend-only Google Gemini con edición/generación sobre imagen de referencia, versión/modelo seleccionados tras verificar soporte real; versiones derivadas privadas, metadatos, límites, cuotas y coste; revisión, descarte, aprobación y publicación explícita autorizada, reversible y auditable. No alterar ingredientes ni prometer fidelidad absoluta. Formatos 5:4, 4:3, 1:1 con tratamiento determinista si procede. Sin credenciales reales en GitHub/CI, sin consumo facturable no autorizado; usar proveedor simulado en CI y dejar pruebas reales como gate condicionado. No simular generación si falta clave.

### Bloque 4 de 5 — Operación y despliegue seguro Sabora-only
Completar manifiestos y preflight no destructivo, HTTPS/PWA, configuración de secretos/roles, logs/observabilidad, workers acotados, controles de coste, backups/restores y rollback Sabora-only. Pruebas aisladas y gates que fallen cerrado. No acceder a VPS ni modificar Supabase operativo; no tocar contenedores, redes, volúmenes, puertos o recursos de Fleetia ni de terceros. Prohibido Docker global, prune, reinicios de host o acciones sobre servicios ajenos.

### Bloque 5 de 5 — Certificación piloto y expediente de despliegue
Matriz norma→código→prueba→SHA, pruebas completas Node/PG17/Playwright, E2E desde QR hasta cocina/sala y pruebas adversas, informe de bloqueos, checklist de intervención y reversión. Marcar PASS solo lo demostrado; marcar BLOCKED lo que requiera credenciales, proveedor facturable, inspección VPS, Supabase operativo o autorización expresa. No certificar producción GO por pruebas simuladas.

## Persistencia y autonomía
Tras CADA bloque: implementar, corregir, repetir pruebas, commit, push, actualizar documentación/tracking y comentar en PR con «Bloque N de 5 implementado», SHA, CI y pendientes. No acumular bloques localmente; si se interrumpe Codex, el siguiente agente retoma el último bloque PASS. Esperar por shell los workflows cuando sea posible y reintentar errores sin intervención del usuario. Mantener PR Draft, sin merge.

## Autorizaciones reservadas
La indicación del propietario de usar producción como escenario de pruebas define la estrategia de entorno, pero NO autoriza desplegar ni intervenir VPS, Supabase operativo, contratar consumo Gemini o tocar Fleetia. Antes de ejecutar cualquiera de esas acciones, pedir autorización específica y verificar aislamiento material completo. El piloto usa exclusivamente datos ficticios.
