# CartaViva / Sabora — continuidad de sesión 11
Fecha: 2026-10-26
Tipo: documento de continuidad, NO normativo. Fuente de verdad: documentación normativa vigente en GitHub.
Repositorio único autorizado: jdlc86/CartaViva.

## 1. Propósito de la sesión 11
Retomar desarrollo por HITOS COMPLETOS, sin repetir funcionalidades terminadas ni improvisar nuevos requisitos. Primero auditar e integrar el resultado de Codex de H1-H3; después cerrar conexiones reales del cliente y abordar H4 cocina/sala y H5 integración extremo a extremo en un plan coordinado. No declarar cerrado un flujo hasta probarlo realmente. No confundir la aceptación del alcance implementable de H1-H3 con la operatividad total del restaurante.

## 2. Entrega informada por Codex (pendiente de auditoría independiente del código)
PR Draft #15: https://github.com/jdlc86/CartaViva/pull/15
HEAD informado: 516909987e8b479ddaefb4991e44af0f71d25318
Commits: 8b7fa7c (PWA), d37b47f (Playwright/axe/CI), 5169099 (cierre).
Codex informa: npm run check 910/910, Chromium Playwright 12/12, PostgreSQL 17 desechable 87/87, tres GitHub Actions SUCCESS; PR Draft mergeable. Una consulta independiente a GitHub confirmó que en ese SHA los workflows «Sabora CI», «Sabora client browser conformance» y «Bootstrap Sabora lockfile» concluyeron SUCCESS. Los conteos locales y mergeability no se han auditado independientemente.
Alcance declarado: H1 consolidación técnica/trazabilidad/PG17; H2 sistema visual premium responsive accesible; H3 PWA cliente instalable con catálogo dinámico, búsqueda, agotados, detalle, favoritos, cesta, ES/EN y offline, sin acceso a cocina/gestión.
Pendientes declarados por Codex: activación real de catálogo, identidad, QR, pedidos, anuncios, reservas, notificaciones y SSE/WebSocket. No montar componentes con datos fingidos ni afirmar esos flujos completos.

## 3. Estado de referencias visuales y ramas
- Rama de auditoría existente: audit/github-pr-global-consolidation-20261026, asociada previamente al PR Draft #14. Verificar situación actual antes de escribir.
- Referencia HTML ejecutable de laboratorio: docs/design/references/sabora-client-premium-v2-lab.html (commit 2627fb22c55a28b56a397ef53304f933e4c90b0d). Es DEMO con fixtures, no producto ni baseline aprobado.
- Encargo anterior: docs/continuity/CODEX_HITOS_1_2_3_CONTINUITY_2026-10-26.md (commit 7ba931fb657d02b411cd72f90a8231aeaf70c97b).
- Documento de orientación: docs/design/SABORA_VISUAL_REFERENCE_EVOLVING_2026-10-26.md; subordinado a normativa.
- Código de referencia histórico: docs/design/references/sabora-client-home-v1.html; docs/design/references/client-menu-reference.html.
- Identidad: docs/design/brand/sabora-logo-outline-v3.svg.
Antes de implementar leer docs/DESIGN_SYSTEM_CONTRACT.md, docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md, docs/design/APPROVED_VISUAL_STYLE_AUDIT_V1.md, docs/design/NOTIFICATIONS_AND_MOTION_V1.md, demás contratos normativos y registros de aprobación. Verificar cambios recientes y conflictos. No reinterpretar documentación normativa.

## 4. Reglas visuales y arquitectónicas
Principio rector: «Sabora debe parecer un restaurante de alta gama que ofrece una experiencia digital excepcional, tanto al comensal como al equipo».
Cliente premium editorial, cálido, luminoso, fotografía auténtica con derechos verificados; identidad y tokens aprobados; animaciones EQUILIBRADAS, accesibilidad, responsive y estados honestos. Cabecera con logo V3, ES/EN, lupa desplegable, cesta y notificaciones. Carrusel de anuncios encima de «Nuestra carta»; imagen opcional, sin imagen composición tipográfica, sin anuncios ocultar; autoplay local, pausa al abrir detalle, reduced motion. Categorías dinámicas desde gestión; «Todos» virtual; agotados visibles, retirados ocultos. Barra inferior Información / Alérgenos / QR central / Favoritos / Ajustes.
Se conservaron dos alternativas visuales de cesta como referencias, sin aprobación definitiva de una sobre otra: «Añadir» con detalle y «− / cantidad / +» después del primer añadido. No imponer una variante no aprobada.
La PWA cliente NUNCA accede a cocina/sala/administración. La vista operativa es una PWA separada con autenticación, rutas, bundles y autorización backend. El conmutador cliente/cocina de un prototipo fue solo demo; no es producto.
Cocina y gestión: misma familia visual premium, pero ergonomía operativa y menor ornamentación. Respetar flujo passkey y restricciones de tapiz de acceso según contrato.

## 5. Próxima secuencia de trabajo recomendada
### Bloque A — Auditoría e integración del PR #15
Inspeccionar estado real de PR #15 y #14, ramas, bases, HEADs, diferencias, CI, pruebas y documentación normativa. Confirmar qué funcionalidades H1-H3 existen realmente; evaluar conformidad visual con screenshots reales y contratos, autorización cliente/operativa, offline, pruebas de accesibilidad y regresiones. No rehacer H1/H2 por defecto. Resolver incompatibilidades de integración en rama aislada, mantener PR Draft y documentar hallazgos. No merge sin autorización.

### Bloque B — Cerrar los flujos reales del cliente (H3 extendido)
Derivar contratos exactos del repositorio para identidad/sesiones, catálogo y publicaciones, QR auténtico y revocable por mesa, reservas sin QR, pedidos con QR válido, cesta y opciones, anuncios, notificaciones y eventos. Implementar backend/API/DB/cliente según contratos y permisos, con transacciones, idempotencia, validación de disponibilidad/precios, errores recuperables y pruebas de concurrencia. La selección se conserva entre reserva y contexto QR. Sin QR se puede explorar y reservar platos reservables, pero PEDIR requiere QR verificado; con QR válido reservar se deshabilita. Incidencias de disponibilidad en cesta, pedido en ventana y comanda despachada tienen tratamientos distintos según norma. No fingir datos, confirmaciones, fotografías, identidad ni QR.
Prohibido polling periódico de red/DB; usar eventos postcommit SSE/WebSocket, recuperación puntual al reconectar y tareas diferidas para ventana de agrupación. Push solo con consentimiento.

### Bloque C — H4: cocina y sala operativas
Integrar comandas reales, estados, disponibilidad de platos/opciones, cancelaciones/incidencias, avisos listos para recoger, historial y deduplicación; aplicar permisos por rol y restricciones normativas. Diseñar e implementar componentes operativos con mismo sistema visual premium, priorizando velocidad, legibilidad y tactilidad. No crear flujos alternativos a los normativos.

### Bloque D — H5: extremo a extremo
Validar cliente -> API -> PostgreSQL 17 -> agrupación/worker -> cocina -> camarero -> entrega. Pruebas de carreras, doble envío, idempotencia, QR revocado, sesiones, autorizaciones negativas, pérdida/reconexión de eventos, reservas, cambios de disponibilidad, recuperación offline, fallos de red, accesibilidad y E2E móvil/escritorio. No simular confirmación real. Documentar bloqueos operativos externos por separado.

## 6. Método de ejecución y cierre
Trabajar autónomamente en bloques GRANDES con commits coherentes, pruebas y GitHub Actions; esperar resultados por shell cuando sea posible, corregir y volver a ejecutar. No pedir aprobaciones rutinarias. Actualizar documentación de GitHub al cerrar hitos importantes. Entregar informe: SHA, PR Draft, CI, tests con números verificables, matriz requisito->evidencia, capturas reales, riesgos y próximos pasos. Si una función requiere decisión normativa o autorización de producción, detener solo esa operación y continuar las independientes.

## 7. Límites absolutos
Únicamente modificar jdlc86/CartaViva. Fleetia y cualquier otro proyecto del VPS son INTOCABLES. El VPS es compartido: ningún despliegue, reinicio, borrado o cambio de contenedores, redes, volúmenes o servicios sin autorización expresa y aislamiento total. No hacer merge ni cambios operativos destructivos en Supabase (https://byhvmumqivmunkmomhup.supabase.co) sin autorización. No usar Codex u otros agentes adicionales sin autorización. No modificar normas para hacer pasar código incumplidor.

## 8. Primera acción de la sesión 11
Leer ESTE handoff y a continuación los documentos normativos reales. Inspeccionar GitHub PR #15, PR #14, commits y CI. Producir una evaluación de diferencias antes de modificar código. Continuar con el bloque completo más prioritario, preservando trabajo existente. El usuario desea autonomía, pero no autoriza despliegue, merge ni acciones fuera de CartaViva.
