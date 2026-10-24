# Auditoría global de conformidad documental — Sabora

Fecha: 2026-10-20. Alcance: rama `feat/sabora-pnpm-bootstrap`, PR #2.
**Estado: hallazgos de auditoría; no certifica conformidad, despliegue ni revisión independiente.**

## Fuentes normativas

- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` (contrato funcional vigente, 18-10-2026).
- `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md` (fases y aislamiento).
- Los documentos históricos son antecedentes y no prevalecen frente al consolidado.

## Evidencia verificada

- `apps/api/src/server.mjs`: solo `/health` y `/ready`; no hay endpoints funcionales.
- `apps/api/src/domain.mjs`: modelo en memoria de mesas, QR, agrupación e idempotencia; estados de orden completa y asignación interna de roles.
- `supabase/migrations/20261020140000_sabora_order_core.sql`: cinco tablas base, RLS FORCE y revocaciones.
- `supabase/migrations/20261020150000_sabora_order_transaction.sql`: confirmación transaccional, idempotencia y agrupación etiquetada.
- `supabase/migrations/20261020160000_sabora_qr_rotation.sql`: revocación de token y cambio de sesión.
- `supabase/migrations/20261020170000_sabora_order_lifecycle.sql`: transiciones de orden completa y eventos de estado.
- `apps/client/src/main.tsx` y `apps/management/src/main.tsx`: pantallas placeholder.
- CI #97 verde para la migración de ciclo de vida; este resultado no valida conformidad funcional integral.

## Matriz de desviaciones (orden de prioridad)

| ID | Severidad | Contrato normativo | Implementación | Corrección exigida |
|---|---|---|---|---|
| A-01 | P0 | Autorización por principal verificado, rol y tenant | RPC acepta `p_actor_user_id`; ninguna autenticación real | JWT verificado, identidad derivada del token, privilegios mínimos, permisos por cuenta y tenant; mantener RPC cerrada |
| A-02 | P0 | Captura confirmada antes de despacho, acuse de cocina verificable, reintentos durables | `confirm_order` crea orden confirmada sin estado de captura, revisión ni acuse | Separar aceptación, pago, despacho y recepción; no exponer confirmación actual como flujo productivo |
| A-03 | P1 | Cocina inicia expediente con arbitraje administrativo obligatorio; camarero distingue causa cliente/restaurante | Cocina puede pasar orden completa directamente a `cancelled` | Incidencia por unidades, bloqueo operativo, expediente y ajuste económico; no cancelación unilateral de cocina |
| A-04 | P1 | Plato/unidad, aviso `listo para recoger`, recogida y notificación recuperable | Solo `orders.status` global y transición `ready → delivered` | Estados por línea/unidad y notificación separada de recogida y entrega |
| A-05 | P1 | Ventana de agrupación de cinco minutos con despacho diferido y revisión vigente única | Solo etiqueta `first/grouped/late` y plazo; sin scheduler ni despacho | Agregación por visita, temporización duradera y carrera transaccional con invalidación/revisión |
| A-06 | P1 | QR identifica mesa; permiso temporal por visita, pausa/cierre/reescaneo y cuentas individuales | Token QR permite confirmar; rotación cambia `session_id` y borra agrupación | Modelar visita, permiso, cuenta y mesa separadamente; no inferir nueva visita de rotación |
| A-07 | P1 | Pedido lógico estable, revisiones inmutables, despacho propio | Una fila `orders` contiene JSON de ítems y estado mutable | Modelo de pedido/revisión/despacho y versiones con trazabilidad |
| A-08 | P1 | Cancelación parcial ajusta únicamente ítems afectados y deuda/reembolso correspondiente | Cancelación de orden completa, sin contabilidad | Operaciones económicas independientes e idempotentes |
| A-09 | P2 | Catálogo borrador/publicado, extras, alérgenos, precios y descuentos en céntimos | JSON de nombre/categoría/cantidad sin precio ni producto persistido | Catálogo versionado, snapshots y validación de precio en servidor |
| A-10 | P2 | Modos de pago por cuenta, Stripe, caja, propinas y devoluciones | No implementados | Implementar tras controles de seguridad, sin cobros reales prematuros |
| A-11 | P2 | Eventos duraderos, deduplicación, reconexión sin polling | No implementados | Outbox, cursor y snapshot autorizados |
| A-12 | P2 | Interfaces cliente/cocina/camarero/admin y dashboard | Placeholders | Implementar flujos por rol y pruebas E2E |
| A-13 | P2 | Gestión de empleados, roles ROOT/ADMIN, activación y auditoría | Tabla de miembros `admin/waiter/kitchen`; asignación de prueba en memoria | Modelo completo de identidad, activación y titularidad |
| A-14 | P2 | VPS aislado y Supabase exclusivo | Compose aislado en borrador, migraciones sin aplicar | Inspección de capacidad/aislamiento y autorización expresa antes de desplegar |

## Aspectos conformes parcialmente

1. Separación nominal de aplicaciones API/cliente/gestión y estructura pnpm.
2. Uso de esquema `sabora`, RLS FORCE y revocación explícita a roles públicos; aún no es autorización de extremo a extremo.
3. Token QR almacenado como hash, rotación e idempotencia básicas; todavía no modelan la semántica completa de visitas/cuentas.
4. PostgreSQL 17 desechable para pruebas de migración, sin tocar Supabase operativo.
5. Compose de Sabora sin dependencias explícitas de Fleetia, pero aislamiento de VPS no verificado.

## Riesgos adicionales de diseño

- `rotate_table_qr` cambia `session_id` automáticamente. El contrato exige que revocar QR no borre ni cambie cuentas, pagos o visitas; la rotación debe invalidar permisos anteriores sin confundir la ocupación.
- `transition_order_status` no prueba la identidad del actor recibido: el lookup de membresía por sí solo no es autenticación.
- Las pruebas existentes prueban el prototipo diseñado, no las 56 pruebas de aceptación del contrato consolidado.
- No inferir que CI verde implica conformidad normativa, seguridad, ni disponibilidad de un producto desplegado.

## Orden de remediación recomendado

1. Congelar exposición pública de RPC y rutas operativas; establecer contratos de identidad, tenant, visita, cuenta y autorización.
2. Reemplazar modelo monolítico de orden por pedido lógico/revisión/despacho/líneas y estados operativos por unidad.
3. Modelar cocina, incidencias, recogida de sala y notificaciones sin cancelar unilateralmente.
4. Implementar catálogo versionado, economía exacta y agregación con temporización duradera.
5. Añadir captura/acuses, reconciliación y pruebas de fallo; solo entonces integrar flujos E2E.
6. Ejecutar matriz de aceptación del consolidado y revisión independiente; mantener PR en Draft y sin despliegue.

**Regla de aislamiento:** no desplegar, reiniciar, modificar ni depender de Fleetia ni de otros proyectos del VPS. El despliegue de Sabora exige autorización expresa y aislamiento verificado.
