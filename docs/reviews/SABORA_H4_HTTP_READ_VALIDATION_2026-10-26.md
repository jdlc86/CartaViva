# Sabora H4 — frontera HTTP de lectura estricta (2026-10-26)

**Estado:** evidencia de implementación y regresión; no modifica ni sustituye documentación normativa.

## Alcance del bloque

Sobre la rama de integración del PR #16 se endurecen los endpoints restringidos de lectura de cocina y sala:

- `GET /api/v1/operations/order-lines`
- `GET /api/v1/operations/orders/:orderId/history`

Los parámetros de filtro y paginación deben ser escalares. Se rechazan valores repetidos que Fastify represente como arrays, antes de convertir `limit` a número. Se mantiene la validación previa del cursor completo y de los estados autorizados por rol. Una solicitud rechazada devuelve HTTP 400 sin llamar al coordinador de lectura.

## Regresión

`tests/order-operations.test.mjs` ejercita mediante `Fastify.inject` límites duplicados en ambos endpoints, estados duplicados y cada componente de cursor duplicado. Comprueba tanto la respuesta 400 como que el contador de lecturas del coordinador permanezca a cero.

La validación del cambio corresponde a GitHub Actions del SHA final de esta rama; no debe inferirse éxito a partir de ejecuciones de commits anteriores.

## Límites y seguridad

No se habilita ningún endpoint nuevo, no se cambian roles, HMAC, SQL, permisos, credenciales ni contratos de cliente. No se realiza merge ni despliegue. El cierre del flujo cliente QR → visita → confirmación y las decisiones normativas pendientes siguen fuera de este bloque. No se interviene en Fleetia, VPS compartido ni Supabase operativo.
