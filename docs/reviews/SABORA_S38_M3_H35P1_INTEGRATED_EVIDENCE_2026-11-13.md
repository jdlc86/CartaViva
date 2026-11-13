# Sabora S38-18 — cierre técnico diferencial H35-P1 y evidencia real de PWA M3

**13-11-2026 · informe de validación técnica de código integrado, NO aceptación visual/operativa.** Se usa la [norma de titularidad única](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [RF](../REQUISITOS_FUNCIONALES.md), [DV](../DESIGN_SYSTEM_CONTRACT.md), [matriz visual](../design/APPROVAL_REGISTER.md) y [procedimiento visual](../design/VISUAL_CONTROL_GATE.md). Sin alterar normas, diseño aprobado ni reglas de acceso.

## 1. Qué se ha revisado sin repetir auditorías

- **Base exacta y no deriva:** integración `main` merge [`5caad1f39a018e44cb831df62f889a05ce85368d`](https://github.com/jdlc86/CartaViva/commit/5caad1f39a018e44cb831df62f889a05ce85368d). Comparación Git a [`9e49a1f4d2934049f7c1b9db35b1550f46f79adb`](https://github.com/jdlc86/CartaViva/commit/9e49a1f4d2934049f7c1b9db35b1550f46f79adb) devuelve **ocho rutas `docs/**` exclusivamente**. Por tanto las pruebas sobre el SHA de merge cubren el mismo SQL, API y PWA que se está verificando; esta revisión documental no ejecutó pruebas nuevas.
- **SQL real incluido:** [`supabase/migrations/20261110232000_sabora_m3_effective_management_permissions_candidate.sql`](../../supabase/migrations/20261110232000_sabora_m3_effective_management_permissions_candidate.sql), `sabora.read_admin_tables_m3_candidate` firma la lectura mediante `verify_management_capability_m3`, toma `admin_write_ownership FOR SHARE` antes de validación firmada, compara `actorId` con `owner_user_id` y genera `permissions`. ADMIN propietario = `configure/qr/readiness/occupancy:true`; ADMIN no titular y ROOT = cuatro falsos; camarero = solamente `readiness/occupancy:true`. Las lecturas firmadas de catálogo y comunicaciones aplican la misma titularidad, sin exponer UUID de owner al consumidor.
- **Servidor y vistas:** [`apps/api/src/m3-management-repository.mjs`](../../apps/api/src/m3-management-repository.mjs) ejecuta la lectura SQL restringida; [`m3-management-http.mjs`](../../apps/api/src/m3-management-http.mjs) valida proyección tipada en vez de inferir permiso solo por rol. [`TablesView.tsx`](../../apps/management/src/views/TablesView.tsx) usa `page.permissions`, fuerza releer en operaciones/foco y desactiva cuando falla la lectura; [`M3CatalogManagementView.tsx`](../../apps/management/src/views/M3CatalogManagementView.tsx) y [`CommunicationsView.tsx`](../../apps/management/src/views/CommunicationsView.tsx) restringen edición y la retiran ante 403; SQL sigue siendo autoridad final.
- **Recorrido integrador ya implementado:** [`scripts/ci/ownership-governance-postgres17.test.mjs`](../../scripts/ci/ownership-governance-postgres17.test.mjs), especialmente líneas **597–693**, inicia PostgreSQL 17 descartable, JWT/HMAC, Fastify y PWA gestión en Chromium. Demuestra titular vs no titular/ROOT/waiter por HTTP; muestra Crear mesa/Nuevo plato/Guardar borrador solo a titular, fuerza transferencia ROOT, confirma pérdida de edición en pestaña antigua sin polling, deniega POST con JWT anterior **HTTP 403** y confirma **0 filas** persistidas; el segundo ADMIN adquiere affordance. Incluye el circuito de camarero y avisos sin ampliar permisos ROOT. Este escenario protege exactamente el hallazgo H35-P1, no necesita una segunda suite aislada.

## 2. CI exacta y artefacto de capturas reales

| Evidencia | Resultado |
| --- | --- |
| [Sabora CI push main #43433947054](https://github.com/jdlc86/CartaViva/actions/runs/43433947054) | `completed/success` en `5caad1f`; paso `H6 consolidated acceptance (contracts + disposable PG17 + Chromium)` `success` y paso `Publish M3 real PG17 and Chromium journey screenshots` `success` |
| [Integración CV005+B2 #43424784656](https://github.com/jdlc86/CartaViva/actions/runs/43424784656) | `completed/success` con 99 SQL exactos y E2E PG17/HTTP/HMAC/Chromium/dos PWA |
| [Functional UI #43424784893](https://github.com/jdlc86/CartaViva/actions/runs/43424784893) | Cobertura funcional `success`; aceptación visual final **`skipped`** |
| **Artefacto M3 run #43433947054**, ID `14042573583` | `sabora-m3-pg17-two-pwa-browser`, ZIP ~1.6 MiB, **10 PNG** tomados el 13-11 a las 13:44Z, expiran el **20-11-2026 13:44Z**; recuperado e inspeccionado en la sesión |

**Índice de capturas del ZIP real (dimensiones de archivo confirmadas):**

| Pantalla | Archivo | Tamaño | Significado |
| --- | --- | --- | --- |
| Mesas y QR ADMIN escritorio | `management-admin-1440.png` | 1440×900 | Lista + ficha, datos PG17 reales del fixture, estado del canal conectado y capacidades |
| Mesas ADMIN móvil | `management-admin-390.png` | 390×900 | Navegación y acción de creación a 390px |
| Mesa/QR y estado operativo | `management-table-qr.png` | 1440×2801 | Gestión mesa, QR rotación/revocación, disponibilidad según permiso y políticas |
| Catálogo publicado | `management-published.png` | 1440×2407 | Categorías, borradores, edición, publicación |
| Catálogo móvil | `management-catalog-mobile.png` | 390×844 | Edición de categoría a 390px |
| Confirmación cliente | `customer-free-confirmed.png` | 390×844 | Pedido de coste cero en PWA cliente |
| Gestión/camarero y finanzas | `management-waiter-1440.png`, `management-waiter-390.png`, `finance-dashboard-admin-1440.png`, `finance-dashboard-admin-390.png` | Varios | Capturas adicionales del mismo recorrido, sin certificar economía externa |

**Conformidad visual preliminar, de alcance limitado:** en las vistas consultadas (Mesas desktop/móvil, QR, Catálogo desktop/móvil, cliente) se observa identidad de marca Sabora, paleta clara crema/blanco/verde/acento `#F8F7F4/#FFFFFF/#202622/#146B57/#D98B45`, navegación administrativa, maestro–detalle para mesas, campos de QR protegidos y editor de categorías. Se incluyen estados de laboratorio `OPERACIÓN RESTRINGIDA`; el texto no debe interpretarse como habilitación general de caja o proveedores. Las capturas son **artefacto de CI auténtico**, pero no capturas de usuario en el VPS ni fotografías licenciadas, y el screenshot de 1440px de longitud completa puede capturar una cabecera sticky en mitad del scroll. **No se ha realizado comparación pixel-perfect** ni se ha afirmado que la tipografía/espaciados de todas las vistas estén aprobados.

**Registro obligatorio de aprobación:** [`APPROVAL_REGISTER.json`](../design/APPROVAL_REGISTER.json) conserva `PENDING_EXACT_BASELINE` para cliente-home y management-shell. Ninguna captura del ZIP está promovida a baseline aprobado; falta decisión visual explícita por propietario, comparaciones con diseño normativo por estado y uso real en móvil. No usar iconos/fotos de laboratorios HTML como aprobados. No inventar fallo visual o regresión por la simple posición del header en screenshot de página desplazada.

## 3. Dictamen por puerta y siguiente actuación

| Control | Dictamen |
| --- | --- |
| H35-P1: veracidad de permisos M3/M5 tras cesión | **CERRADO TÉCNICAMENTE** por código y CI E2E del mismo árbol, sin necesidad de PR nuevo |
| CV-006 mesas/QR | **CANDIDATO TÉCNICO**, integrado y probado; no aceptación visual humana/operación real |
| CV-007 catálogo dinámico y publicación | **CANDIDATO TÉCNICO**, integrado y probado; no aceptación visual humana/operación real |
| CV-017 estética premium + aprobación | **PENDIENTE**; dirección/paleta aprobadas, pantallas exactas sin firma |
| Supabase PG17.11 con 99 SQL / backup Free | **NO-GO**, recuperación aplazada por decisión propietaria [S38-17](../handoffs/SESSION_38_HANDOFF_2026-11-12.md) |
| VPS y Fleetia | **NO INTERVENIDOS**; no inferir permiso de despliegue ni validación de aislación física |

**Próxima unidad de valor:** presentar el paquete de capturas **ya generado por la CI** al propietario para conformidad concreta de Mesas/QR/Catálogo y recoger observaciones, preservando las decisiones visuales realmente aprobadas. La aceptación funcional real sobre entorno instalado solo puede ejecutarse después de la ruta de despliegue autorizada; mientras la recuperación esté aplazada, no confundir el piloto de laboratorio con operación. En caso de defectos visuales demostrables, corregir en **un único bloque integral M3** (sin PR/test por cada píxel); para H35-P1 no abrir otro trabajo salvo regresión reproducible.

**Ejecutado en esta sesión:** lectura/cotejo de SQL, TSX, JWT/HMAC y test; verificación de CI/artifact y revisión de capturas reales; actualización del seguimiento. **No ejecutado:** tests adicionales, cambios de código, migraciones/DDL, despliegue, aprobación humana ni acceso al VPS/Supabase operativo/Fleetia.
