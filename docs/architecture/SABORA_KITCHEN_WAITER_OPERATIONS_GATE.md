# Puerta de operaciones de cocina y camarero — Sabora

Fecha: 2026-10-24

Estado: **candidato integrado, sin activación operativa ni grants de runtime**

Este documento delimita el bloque implementado en la rama
`codex/sabora-kitchen-waiter-operational`. No amplía el contrato funcional
consolidado ni autoriza un despliegue.

## Alcance cerrado

El flujo persistente se ejecuta por línea de pedido y admite exclusivamente:

1. `confirmed -> preparing`, por cocina o ADMIN.
2. `preparing -> ready`, por cocina o ADMIN. La misma transacción crea el aviso
   durable de recogida.
3. `ready -> picked_up`, por camarero o ADMIN. La misma transacción confirma el
   aviso de recogida.

`picked_up` significa recogida por sala, no entrega al comensal. No existe una
transición agregada del pedido completo. Las vistas de cocina y sala se
reconstruyen desde PostgreSQL después de una recarga; no se conserva un estado
operativo en el navegador y no se ha incorporado sondeo automático.

## Límite de identidad y autorización

- Las rutas solo consumen `verifiedIdentity` y `verifiedStaff`, poblados por los
  hooks criptográficos y de membresía existentes. Actor y rol no forman parte
  del cuerpo HTTP.
- La membresía activa y el rol se vuelven a leer con `FOR SHARE` en la misma
  transacción que la lectura o mutación solicitada.
- La composición es opt-in y exige pools inyectados y declaradamente separados
  para lectura de personal y operaciones. No lee variables de entorno, no abre
  conexiones y no se importa desde `server.mjs`.
- La función SQL es `SECURITY INVOKER`. La tabla de reintentos tiene RLS
  habilitada y forzada. `PUBLIC`, `anon` y `authenticated` no reciben permisos
  de tabla ni ejecución de la función.
- No se ha creado un login operativo ni una política RLS permisiva. La ruta no
  puede activarse hasta aprobar y probar la identidad PostgreSQL de mínimos
  privilegios y su bootstrap.

## Atomicidad, concurrencia e idempotencia

La correlación pertenece al actor verificado. Una petición nueva:

1. valida identificadores y transición;
2. toma un advisory lock transaccional sobre actor y correlación;
3. estabiliza y revalida la membresía activa, también para un replay;
4. reproduce el resultado durable si existe el mismo fingerprint o rechaza la
   reutilización con parámetros diferentes;
5. bloquea la línea con `FOR UPDATE`;
6. cambia el estado, crea o confirma el aviso, escribe el evento y registra el
   resultado idempotente dentro de una sola transacción.

Las restricciones y locks impiden dos avances efectivos de la misma línea. Un
fallo intermedio revierte estado, aviso, evento y registro de correlación. Los
eventos y los resultados de correlación tienen triggers que rechazan
`UPDATE`, `DELETE` y `TRUNCATE`.

## Contrato HTTP candidato

Las rutas se mantienen sin montar en el servidor general:

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/v1/operations/order-lines` | Proyección paginada y filtrada por el rol verificado |
| `POST /api/v1/operations/order-lines/:lineId/transitions` | Transición atómica; `201` nueva y `200` replay idéntico |
| `GET /api/v1/operations/orders/:orderId/history` | Historial append-only sin identificador privado del actor |

La respuesta usa códigos públicos acotados, `Cache-Control: no-store` y no
propaga mensajes SQL. La PWA consume estas rutas mediante un transporte
inyectado; el módulo no realiza autenticación ni `fetch` directo.

## Bloqueos contractuales deliberados

### Entrega al comensal

El esquema vigente termina en `picked_up` y la documentación declara que ese
estado no acredita entrega. Añadir `delivered` o inferir entrega por pedido
completo sería inventar semántica, destinatario y autorización. La acción queda
deshabilitada hasta que exista contrato y migración aprobados.

### Cancelación e incidencias

El contrato distingue origen cocina, solicitud de cliente y motivo del
restaurante, con arbitraje, ajuste de deuda o reembolso y notificaciones a
destinatarios concretos. Todavía faltan permisos detallados, límites
antifraude, expediente durable y coordinación económica. Por ello no se ha
añadido una transición de cancelación ni un campo de motivo aislado: hacerlo
podría cancelar preparación sin ejecutar el efecto económico obligatorio. La
PWA muestra la acción bloqueada.

## Puerta pendiente para activación

Antes de montar las rutas deben aprobarse y verificarse en PostgreSQL 17
desechable:

1. login técnico exclusivo sin propiedad, `BYPASSRLS` ni privilegios ajenos;
2. políticas RLS y grants mínimos para las consultas y la función exactas;
3. preflight de `current_user` y `session_user` para ambos pools;
4. bootstrap de autenticación que inyecte el transporte autorizado en la PWA;
5. contrato de entrega y modelo completo de incidencia/cancelación;
6. mecanismo de eventos si se aprueba actualización en tiempo real sin polling.

No se aplicó ninguna migración a Supabase operativo, no se desplegó y no se
modificó infraestructura compartida.

## Composición con verificación previa explícita

`registerVerifiedOrderOperationsFromPools(app, options)` ejecuta el preflight
asíncrono de las identidades SQL antes de delegar el registro de rutas. Una
identidad incorrecta o un fallo de inspección impiden montar las rutas; las
pruebas comprueban que el objeto HTTP no recibe registros en ese caso.
La función es **opt-in**, no está importada por `server.mjs`, y no abre ni
configura conexiones. El bootstrap operativo sigue bloqueado por los grants,
las políticas RLS y el contrato de autorización pendientes. La composición
histórica no debe utilizarse como bypass del nuevo gate de activación.
