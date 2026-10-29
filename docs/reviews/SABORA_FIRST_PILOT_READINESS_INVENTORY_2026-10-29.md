# Sabora — inventario de preparación del primer piloto (producción usada para pruebas)

Fecha: 2026-10-29
Estado: INVENTARIO DE GAPS / no equivale a autorización de despliegue
Fuente: auditoría P3 y runbook candidato de activación. Los documentos normativos de GitHub prevalecen.

## Decisión de entorno
El propietario ha indicado que no hay usuarios reales y acepta utilizar el futuro entorno de producción para el piloto con datos ficticios. Esta decisión NO autoriza por sí sola intervención en VPS, Supabase operativo, merge ni despliegue. Aislamiento total de Fleetia y terceros obligatorio.

## Inventario de preparación

| Área | Evidencia existente | Falta para piloto | Prioridad |
| --- | --- | --- | --- |
| API | API actualmente health-only; candidatos aislados validados P3 | Componer y habilitar rutas operativas según contratos normativos, autenticación, autorización y pruebas E2E reales | P0 |
| Cliente PWA | Build y Playwright PASS | Conexión a API piloto y recorrido real QR→visita→catálogo→pedido | P0 |
| Gestión PWA | Build y Chromium PASS | Operaciones reales mesas, catálogo, cocina, sala y personal con roles | P0 |
| QR/visita | Matriz funcional aislada | QR reales de prueba, revocación y sesión persistente segura | P0 |
| Pedido/agrupación | Contratos e integración PG17 aislada | Persistencia transaccional, ventanas configuradas, idempotencia y dispatch real | P0 |
| Cocina/sala | Contratos candidatos y navegador | Comandas reales y acciones autorizadas, estados y avisos | P0 |
| Notificaciones | Contratos candidatos | Entrega, outbox, reintentos, permisos y observabilidad | P1 |
| Identidad/roles | SQL y tests aislados | Principales SQL mínimos, secretos operativos y controles de revocación | P0 |
| Catálogo e imágenes | Interfaz Estudio de Imágenes desarrollada; backend IA no acreditado en auditoría P3 | Verificar implementación efectiva del proveedor IA, coste, límites, original/versionado, aprobación, Storage y publicación; no asumir integración Gemini operativa | P1 |
| Datos piloto | Sin usuarios reales según propietario | Semillas ficticias de mesas, empleados, platos, visitas y pedidos; procedimiento de limpieza exclusiva Sabora | P0 |
| Infraestructura | Compose/gates de aislamiento CI | Verificar aislamiento material VPS, puertos, recursos, volúmenes, redes y capacidad sin tocar Fleetia | P0 |
| Secretos | Inventario y fail-closed | Provisionar exclusivamente Sabora, rotación, revocación, segregación y logs sin PII | P0 |
| Recuperación | PostgreSQL 17 desechable probado | Backup/restore real del ámbito Sabora, RTO/RPO, Storage/PITR y rollback seguro | P0 |
| Dominio/TLS/PWA | Builds comprobados | Dominio, HTTPS, service worker, permisos, instalaciones en dispositivos y accesibilidad en piloto | P1 |
| Observabilidad/costes | Gates de CI | Logs, alertas, límites de servicios, workers y cuotas IA; mecanismos seguros de parada Sabora-only | P1 |

## Puertas de autorización
1. Lectura y reconciliación de documentos normativos y diseño visual aprobado antes de tocar código funcional.
2. Preparación de entorno y configuración aislados sin afectar Fleetia.
3. Autorización expresa para cualquier despliegue, intervención VPS o Supabase operativo.
4. Piloto con datos ficticios y criterios de aceptación funcionales y de recuperación.

## Preguntas abiertas: Estudio de Imágenes
- ¿Se quiere mejora fotográfica conservadora o generación creativa de nuevas imágenes? Debe respetarse la representación fiel del plato.
- ¿Cuál es el proveedor/modelo aprobado normativamente? Google Gemini se ha discutido, pero su integración operativa no está acreditada en P3.
- ¿Cómo se aprueban y publican versiones, se conserva el original y se controlan coste, cuotas, fallos y acceso?
- ¿La mejora de imágenes es requisito bloqueante del primer piloto o puede ejecutarse con imágenes originales?

## Criterio de trabajo
Priorizar bloques completos y persistir cada bloque en GitHub (commit, pruebas, CI, documentación y comentario PR). No presentar una interfaz visual como backend operativo. No merge ni despliegue sin autorización.
