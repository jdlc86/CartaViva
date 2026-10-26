# Sabora — informe de integración H3, H4 y H5

Fecha: 2026-10-26

Rama: `integration/sabora-h3-h5-real-flow-20261026`

Base funcional: PR Draft #15, SHA `516909987e8b479ddaefb4991e44af0f71d25318`

Estado del documento: evidencia de implementación; **no modifica contratos normativos**.

## Resultado ejecutivo

Se cierra el circuito permitido por los contratos vigentes desde confirmación
autorizada del cliente hasta preparación, aviso durable a sala, recogida e
historial. La lectura de comandas, antes bloqueada, ya no necesita acceso directo
a tablas: tablero e historial pasan por dos wrappers `SECURITY DEFINER` ligados
por HMAC al login SQL, actor, rol, operación, filtro, cursor y límite. El principal
operativo de aceptación es un `LOGIN` real, `NOINHERIT`, sin `SUPERUSER`,
`BYPASSRLS`, membresías, DDL, tablas, columnas, secuencias ni acceso al keyring.

La solución continúa dormida por defecto: las migraciones no crean logins de
runtime, no conceden `EXECUTE`, no insertan claves y `server.mjs` mantiene
exclusivamente `/health` y `/ready`. La composición completa es opt-in e
inyectada. No se activaron workers, correo, polling, Supabase operativo ni
endpoints de producción.

H3 y H5 se cierran **hasta la frontera normativa actualmente aprobada**. Las
funciones que aún carecen de contrato material (reservas, anuncios persistidos,
eventos con retención/recuperación, incidencias económicas, entrega/cancelación
y activación de credenciales operativas) quedan bloqueadas expresamente; no se
simulan ni se presentan como terminadas.

## Matriz de trazabilidad

| Requisito | Fuente normativa principal | Implementación/evidencia | Estado o bloqueo |
|---|---|---|---|
| Separación cliente / gestión / cocina | `CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md`, `CARTAVIVA_PROJECT_BOUNDARY.md` | Bundles separados; `server.mjs` no importa la composición operativa; un JWT de cliente válido recibe 403 en rutas H4 | Cerrado |
| Catálogo cliente publicado | `SABORA_CATALOG_PUBLICATION_GATE.md`, contrato visual cliente | `apps/client` consume solo `/api/v1/catalog`; E2E cubre categorías, agotados, offline del shell y ausencia de llamadas privilegiadas | Cerrado para lectura publicada |
| Identidad persistente, sesión, QR y visita antes de pedir | `SABORA_CUSTOMER_IDENTITY_CONTRACT.md`, `SABORA_CUSTOMER_SESSION_SQL_PRIVILEGES.md`, contratos QR/visita | Candidatos backend y PG17 validan bearer, QR, visita, revocación, expiración y concurrencia; confirmación se mantiene opt-in | Activación UI/runtime bloqueada por aprovisionamiento y decisión operativa |
| Confirmación, revalidación e idempotencia | `SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`, `SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` | Confirmación real escribe pedido, evidencia económica y líneas en una transacción; replay no duplica; cambios requieren aceptación explícita | Cerrado como candidato aislado |
| Agrupación first/grouped/late | requisitos funcionales y diseño transaccional de pedido | Suite PG17 existente vuelve a verificar ventana configurable, contendientes y rollback | Cerrado en PG17 desechable |
| Cocina: confirmed → preparing → ready | `SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`, `SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md` | JWT staff + capacidad HMAC + principal SQL mínimo; operación idempotente y auditada | Cerrado como composición opt-in |
| Sala: aviso listo → picked_up | mismos contratos | `ready` crea aviso durable; sala lo recupera y `picked_up` lo reconoce; replay conserva evento y aviso | Cerrado como composición opt-in |
| Tablero e historial actor-bound | inventario SQL y gates Session 04/05 | Nueva migración `20261026120000`; wrappers de lectura con filtros por rol, paginación limitada y protección contra enumeración de órdenes | Cerrado |
| Concurrencia, fencing, revocación y expiración | contratos de identidad staff y operaciones | PG17 prueba expiración después de espera por lock, suspensión, revocación de clave, manipulación de actor/rol/alcance y transición concurrente | Cerrado |
| Ausencia de escalada SQL | inventario SQL de operaciones | Preflight exige exactamente tres wrappers y cero acceso privado; intentos de tabla, keyring, DDL, RPC antiguo y `SET ROLE` fallan | Cerrado |
| Sin polling | contrato consolidado y continuidad H3-H5 | UI solo carga al montar, tras acción o al pulsar “Actualizar estado”; tests estáticos impiden `setInterval` | Cerrado |
| Eventos dirigidos y recuperación por cursor | contrato consolidado | No se creó transporte provisional | Bloqueado: faltan política normativa de retención, backlog y cursor |
| Reservas | requisitos funcionales / contrato consolidado | Control permanece deshabilitado y separado de comandas | Bloqueado: faltan estados, transiciones y política comercial completos |
| Anuncios publicados/vigentes | contrato visual cliente | Región visual permanece sin datos simulados | Bloqueado: falta contrato backend de publicación, vigencia y prioridad |
| Incidencias, cancelación, entrega y cierre económico | contrato consolidado y gate cocina/sala | UI y SQL rechazan estados no aprobados; `picked_up` no se presenta como entrega | Bloqueado por arbitraje y contrato económico |
| Agotados/reposición operativa | publicación de catálogo | Cliente distingue agotado/retirado; no se inventó mutación de cocina | Bloqueado: no hay writer operativo aprobado para cocina |

## Bloque A — H3 sin simulaciones

Se preserva la PWA premium del PR #15 y su catálogo autorizado. Las pruebas de
navegador confirman en 390 px y 1440 px: catálogo dinámico, favoritos y cesta
local, producto agotado visible y no seleccionable, accesibilidad sin hallazgos
serios, `prefers-reduced-motion`, manifest instalable y shell offline sin cachear
datos API.

La cadena backend que H3 puede ejecutar con contratos actuales sí participa en
la nueva prueba vertical: sesión de cliente vigente + QR vigente + visita
autorizada + quote server-owned → confirmación/idempotencia → pedido/línea. No se
montó este candidato en la PWA por defecto porque el repositorio no dispone de
un flujo aprobado y provisionado para entregar a la UI todos los identificadores
y credenciales de visita sin inventar un contrato. La PWA sigue describiendo ese
límite honestamente y nunca muestra una confirmación local falsa.

No se implementaron anuncios, reservas ni SSE/WebSocket: sus contratos de
persistencia, estados o recuperación siguen incompletos. Tampoco se añadió
polling como sustituto.

## Bloque B — H4 cocina y sala

### Frontera SQL de lectura

La migración candidata añade:

- `authorize_order_operation_read_candidate`: verificador interno con
  comparación HMAC de tiempo constante, bloqueo compartido de clave y membresía,
  y segunda comprobación temporal tras las esperas;
- `read_order_operations_board_authorized_candidate`: proyección paginada,
  máximo 100 filas visibles más lookahead, filtros de rol y cursor ligado a la
  firma;
- `read_order_operations_history_authorized_candidate`: máximo 200 eventos y
  comprobación de visibilidad actual para impedir usar UUID de orden como oráculo.

El owner sellado recibe solo las columnas necesarias y políticas RLS explícitas.
El login de runtime no recibe ninguna de ellas. El emisor Node canónico y el
repositorio vuelven a validar forma, alcance, orden, unicidad, transiciones y
notificaciones antes de devolver datos.

### Composición y UI

`registerVerifiedRestrictedOrderOperationsFromPools` valida antes de montar:

1. dos pools y logins distintos;
2. JWT/JWKS y dependencias de autenticación;
3. lector staff con las tres columnas exactas;
4. principal operativo con exactamente los tres wrappers autorizados;
5. ausencia previa de las tres rutas.

La vista de comandas ya existente conserva diseño premium, densidad operativa,
estados de carga/error, correlación estable ante resultado ambiguo y recarga
explícita. Se corrigió su estado global para que, cuando el gateway está
realmente inyectado, muestre “OPERACIÓN RESTRINGIDA” y no el mensaje
contradictorio “sin operaciones conectadas”. Entrega y cancelación siguen
bloqueadas de forma visible.

## Bloque C — H5 vertical real

La nueva aceptación PG17 ejecuta, en una única base desechable:

1. creación de perfil/sesión/visita/QR y quote server-owned;
2. confirmación canónica con revalidación y un replay;
3. generación transaccional de una sola orden, ledger y línea `confirmed`;
4. recuperación por cocina con JWT real y wrapper HMAC;
5. `preparing` y `ready` idempotentes;
6. recuperación del aviso durable por sala;
7. `picked_up`, reconocimiento e historial completo;
8. comprobación durable final: 1 orden, 1 intento, 1 línea, 3 eventos y 1 aviso.

La misma suite prueba cliente sin membresía (403), firma JWT alterada (401),
actor/rol/filtro/orden/límite alterados, capacidad expirada, suspensión, clave
revocada, esperas concurrentes y cero acceso directo. Las suites preexistentes
siguen cubriendo agrupación, incorporaciones tardías, contendientes, rollback,
QR revocado, bearer revocado, disponibilidad/reprecio y resultados ambiguos.

Este cierre vertical no equivale a cierre comercial del pedido. No existe aún
una transición aprobada desde `picked_up` a entrega/cobro/cancelación ni un
contrato de eventos dirigidos con retención. Esos escenarios permanecen fuera
del circuito en vez de ser fingidos.

## Defectos encontrados durante la validación

1. PostgreSQL 17 rechazó inicialmente `grouping` sin delimitación en la firma
   `RETURNS TABLE`; se corrigió a `"grouping"` y se recreó el contenedor desde
   cero.
2. El primer fixture del lector H4 concedía columnas al login desechable pero no
   su política RLS específica; PostgreSQL denegó correctamente al actor legítimo.
   Se añadió la política únicamente al fixture de aceptación, nunca a la
   migración ni a un rol operativo.
3. La shell de gestión anunciaba “sin operaciones conectadas” aun con gateway
   inyectado; se corrigió el estado visual conectado.

## Evidencias ejecutadas localmente

- `npm test`: 920/920 después de incorporar los tests nuevos.
- `pnpm --filter @sabora/management test`: 35/35.
- `pnpm --filter @sabora/client test:e2e`: 12/12, Chromium, mobile 390 y desktop 1440.
- `scripts/ci/postgres-migration-smoke.sh`: PASS en PostgreSQL 17 desechable.
- `scripts/ci/catalog-postgres17-node-driver-smoke.sh`: 92/92:
  - catálogo/cliente 22/22;
  - operaciones base 8/8;
  - identidad/transiciones restringidas 18/18;
  - nuevas lecturas H4/H5 5/5;
  - ciclo de personal 14/14;
  - invitaciones/outbox/custodia 25/25.
- `npm run check`: PASS; incluye 920/920 tests raíz y builds API/cliente/gestión.
- GitHub Actions del [PR Draft #16](https://github.com/jdlc86/CartaViva/pull/16)
  sobre `7aa3b53006eb8bc8248d57052020abc4533e4b16`: PASS en los tres jobs
  publicados (`validate`, `generate-lockfile` y `management-browser-smoke`).

## Límites operativos y siguiente decisión

Para activar el candidato fuera de CI harían falta, mediante una autorización
separada: provisionar logins/credenciales, una clave HMAC fuera del runtime SQL,
montar las composiciones verificadas, definir el transporte de eventos y
resolver los contratos bloqueados. Nada de eso forma parte de este cambio.

No se modificaron Fleetia, VPS, recursos compartidos ni Supabase operativo. No
hubo merge, despliegue, worker, proveedor de correo ni envío real.
