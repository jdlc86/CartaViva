# Sabora — plan de integración M3 (CV-006/CV-007)

Fecha: 2026-11-05. Estado: plan previo a implementación. Este documento no es normativa, no autoriza despliegue y no sustituye la matriz F01–F28/R01–R10.

## Punto de partida y límites

- Base: cierre documental M2 `a65b2a3275d4fedef302fad870aaffbc30f56ab5`, rama M3 propia `feat/sabora-session23-m3-management-20261105`.
- M2 quedó validado en PostgreSQL 17/Fastify/dos Chromium sobre `7f90000077ab77759935cf291ac6ec637411b983`. M3 reutiliza esa composición opt-in y no modifica `apps/api/src/server.mjs`, que continúa en `health-only`.
- No se activan servicios, Stripe, correo, worker o recursos operativos. No se accede a Supabase operativo, VPS, Fleetia ni proyectos ajenos.
- La pantalla de caja/cierre continúa fuera de alcance mientras no exista aprobación visual; M3 no atribuye entrega, pago ni cierre por cambiar el estado de una mesa.

## Corte funcional y actores

### CV-006 — mesas y QR

La persistencia conservará dos ejes independientes:

1. **Preparación administrativa:** `EN_PREPARACION`, `LISTA`, `BLOQUEADA`. El alta siempre nace en `EN_PREPARACION`; solo `LISTA` admite nuevas entradas y confirmaciones. `BLOQUEADA` no cancela pedidos ya aceptados.
2. **Ocupación de servicio:** `open`, `paused`, `closed`, con las transiciones, revocaciones y política de coste cero ya normadas.

Solo administración podrá crear/editar mesas, cambiar preparación y emitir/rotar/revocar QR. Camarero y administración conservarán las transiciones de ocupación permitidas por el contrato vigente. Cada mutación será atómica, auditada y ejecutada por una capacidad SQL exacta bajo identidad JWT y pertenencia SQL vigente.

El token QR V1 se generará en el servidor con 32 bytes aleatorios, se validará por la RPC y solo se devolverá en la respuesta de emisión/rotación. Persistirá únicamente su SHA-256 y la versión. Listados, relecturas y logs no recuperarán el token. Revocación invalidará acciones nuevas sin alterar el historial.

### CV-007 — catálogo dinámico

- Las categorías serán filas ordenables con identidad estable; se sembrarán las cinco categorías iniciales normadas y se conservarán las categorías históricas existentes.
- El borrador administrativo contendrá nombre, descripción, imagen opcional, categoría, precio en céntimos —incluido cero—, alérgenos estructurados y reglas económicas validadas. Publicar será una acción explícita que copia un snapshot inmutable y aumenta la revisión.
- Ocultar una categoría impedirá nuevas publicaciones en ella, pero no reescribirá snapshots ni pedidos históricos. “Todos” seguirá siendo solo un filtro virtual del cliente.
- Agotado permanecerá visible y no seleccionable; retirado dejará de formar parte del catálogo público. Las confirmaciones y revisiones usarán la misma revisión publicada de PostgreSQL.

## Frontera técnica

```text
PWA gestión → JWT + pertenencia vigente
             → rutas M3 opt-in
             → LOGIN físico NOINHERIT
             → SET LOCAL ROLE a capacidad exacta
             → RPC SECURITY INVOKER / RLS / auditoría
                         │
                         ├─ mesas/preparación/ocupación/QR
                         └─ categorías/borradores/publicación/retirada
                                      │
PWA cliente ← catálogo público / QR / visita / confirmación H6
                                      ↓
                        cocina → sala → cuenta → outbox/SSE
```

La lectura y la escritura administrativas usarán identidades físicas separadas de cliente, confirmación H6 y operaciones. No se concederá acceso directo a tablas/secuencias, `BYPASSRLS`, creación o herencia. Los preflights comprobarán identidad efectiva, membresía exacta, RPC autorizadas y ausencia de privilegios extra.

## Estrategia de implementación y prueba

1. Migración única coherente de modelo/capacidades, con compatibilidad de datos históricos y denegaciones por defecto.
2. Repositorios/rutas M3 opt-in y extensión del candidato M2 sin registrar rutas en el servidor normal.
3. Gateways y pantallas de gestión dentro del sistema visual aprobado; sin mocks, polling periódico ni secretos QR persistidos en navegador.
4. Pruebas focalizadas durante el desarrollo solo para aislar fallos. La aceptación final ejecutará una vez el recorrido integral en PostgreSQL 17 limpio, JWT real y Chromium de ambas PWA; después `npm run check`, build y Actions del mismo SHA. Solo se repetirá una fase que falle o una regresión afectada por la corrección.

La puerta integral deberá acreditar: alta y edición; estados de preparación y ocupación; emisión/rotación/revocación QR; rechazo cliente por QR/mesa no válidos; categoría nueva ordenada; borrador/publicación/retiro; precio cero, alérgenos y reglas económicas; confirmación/replay/revisión; cocina/sala/cuenta; SSE; concurrencia, idempotencia, rollback, RLS y escalada denegada.

## Criterio de salida

CV-006 y CV-007 solo se declararán candidatos validados si el recorrido PWA gestión → SQL autorizado → PostgreSQL 17 → cliente Chromium → H6 pasa en el mismo SHA y GitHub Actions queda satisfactorio. Una operación sin interfaz conectada, un mock, un fixture administrativo o una RPC ejecutada como superusuario no cerrará el criterio.

Producción continúa **NO-GO**: sin merge, despliegue, migración operativa o autorización productiva.
