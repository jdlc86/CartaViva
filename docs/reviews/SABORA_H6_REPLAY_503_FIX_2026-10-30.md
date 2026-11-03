# Sabora — cierre del HTTP 503 en replay H6

Fecha: 2026-10-30. Rama de partida: `integration/sabora-activation-readiness-20261028` en `07043088d49761eae4f32480ff3d0b1cbb0181f6`.

Estado: corrección candidata aislada; no desplegada, no fusionada y sin cambios en Supabase operativo, VPS, Fleetia, worker, correo o Stripe real.

## Contrato aplicado

Se contrastaron antes de editar `SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `SABORA_CONTRACT_CONSISTENCY_V1.md`, `SABORA_CUSTOMER_IDENTITY_CONTRACT.md`, `SABORA_CUSTOMER_SESSION_SQL_PRIVILEGES.md`, `SABORA_AUTHORIZATION_GATE.md` y el candidato H6. El resultado incierto o repetido debe recuperar la intención durable sin crear otro pedido o cobro; conocer un identificador no permite saltarse sesión, visita, mesa ni cuenta. Los errores SQL internos no forman parte de la respuesta HTTP.

## Reproducción inicial

El commit diagnóstico `0704308` añadió una consulta directa con `roundId`. Los dos workflows del commit fallaron sobre PostgreSQL 17 en `scripts/ci/h6-postgres17.test.mjs:189` con SQLSTATE `42501` y `customer_round_scope_forbidden`:

- CI principal: `41028098422`.
- Bootstrap PostgreSQL 17: `41028098689`.

La reproducción local desde cero obtuvo el mismo resultado. El primer probe estaba invertido: `read_customer_round_h6_candidate` recibe `p_order_id` y `customer-production-flow.mjs` ya le entrega `orderId`. Sin embargo, al corregir el probe para enviar `orderId`, el fallo persistió y reprodujo el `503 customer_flow_unavailable` del replay HTTP. Por tanto, la hipótesis orderId/roundId no era la causa raíz.

## Causa raíz exacta

La consulta de `read_customer_round_h6_candidate` relacionaba correctamente sesión, visita, mesa, cuenta, pedido y ronda, pero terminaba con:

```sql
FOR SHARE OF s,v,t,a,o,r
```

`orders` tiene FORCE RLS y una policy SELECT para `sabora_h6_fn_owner`, pero deliberadamente no tiene policy UPDATE. PostgreSQL aplica también la visibilidad de escritura al adquirir el row lock de `SELECT ... FOR SHARE`; por ello la fila `o` desaparecía bajo el owner restringido aunque todos sus valores de pertenencia fueran correctos. Las mismas siete filas eran visibles por separado y la unión devolvía la ronda al excluir únicamente `o` del lock, lo que aisló el defecto.

## Solución mínima y seguridad

La migración `20261030091748_sabora_h6_customer_round_replay_rls_fix.sql` reemplaza exclusivamente el lector y conserva:

- la entrada por `orderId`, no por `roundId`;
- las igualdades de sesión, visita, mesa, cuenta, pedido y ronda;
- la comprobación de sesión y visita vigentes, no revocadas y con versión QR actual;
- los locks de sesión, visita, mesa, cuenta y ronda;
- el owner `NOLOGIN`, el `search_path` fijo y el único EXECUTE del runtime cliente H6;
- el error interno genérico y la respuesta HTTP sanitizada.

Solo se retira `o` de `FOR SHARE`. No se crea una policy UPDATE ni se concede UPDATE/SELECT directo a ningún runtime. La fila de pedido es identidad inmutable en este circuito; cuenta y ronda continúan bloqueadas, y el pedido sigue siendo un predicado obligatorio de pertenencia. Esta alternativa preserva mínimo privilegio y evita ampliar una superficie de escritura para resolver una lectura.

## Regresión PostgreSQL 17

La aceptación usa un contenedor `postgres:17-alpine` desechable, todas las migraciones y los cuatro logins H6 separados y restringidos. Comprueba en el mismo pedido:

- primera confirmación HTTP `201 confirmed`;
- replay HTTP `200 replayed` con `orderId` y `roundId` originales;
- dos replays HTTP concurrentes, ambos `200 replayed` y con las mismas identidades;
- exactamente un pedido, una ronda, un batch idempotente, un intento de pago y un despacho;
- reutilización de la clave con cantidad modificada: `409 order_idempotency_conflict`;
- cookie de otro cliente: `401`, sin detalle SQL;
- `roundId` presentado como si fuera `orderId`, visita ajena y hash de sesión ajeno: `customer_round_scope_forbidden` en la frontera SQL;
- continuidad posterior del mismo pedido por autorización, captura, despacho, ACK de cocina y recogida de sala;
- preflight, RLS, denegación de tablas directas, roles cruzados y `SET ROLE` sin cambios.

Evidencia focalizada local inicial tras la corrección: `2/2 PASS`, incluida la prueba integral H6. La regresión completa, `npm run check` y los enlaces de Actions del SHA final se incorporan al comentario de cierre del PR; un CI verde no sustituye las negativas de pertenencia enumeradas arriba.

## Riesgos y límites residuales

- La migración está diseñada para aplicación única con checksum; no se ha aplicado a ningún proyecto operativo.
- El candidato H6 continúa opt-in y no está activado en `server.mjs`.
- No se prueba volumen productivo, latencia operativa ni una ventana de migración real.
- Persisten las puertas generales de producción ya documentadas; ninguna es necesaria para validar esta corrección aislada.
