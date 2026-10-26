# Sabora H3 — integridad de selección local (2026-10-26)

Documento de evidencia de implementación. No sustituye los contratos normativos.

## Bloque completado como candidato

La cesta de la PWA cliente es una **selección local informativa**, nunca una comanda confirmada ni una fuente de precios para el servidor. Este cambio unifica sus límites en persistencia y operaciones: máximo 100 platos distintos, 99 unidades por línea, identificadores UUID únicos sin distinguir mayúsculas, precios enteros seguros y registros de cuatro campos exactos. La función de guardado rechaza íntegramente la selección inválida antes de escribir en almacenamiento.

La edición de cantidad no permite añadir el plato 101, duplicar una línea mediante variantes de mayúsculas del UUID, añadir agotados ni eliminar un plato inexistente. La reconciliación con el catálogo publicado actualiza nombre y precio incluso cuando cambia el uso de mayúsculas del UUID. No se borra una selección simplemente porque el catálogo esté temporalmente inaccesible.

## Pruebas

`tests/client-state.test.mjs` amplía regresiones para duplicados, campos inyectados, límites de cantidades y precios, 101 platos, cambio de cantidades con UUID en distinta capitalización y reconciliación con el catálogo. La aceptación exige GitHub Actions del commit final; no se presume el resultado de una ejecución anterior.

## Frontera funcional

Este bloque no habilita pedidos reales, QR, visitas, sesión de identidad, reserva, pago ni anuncios. La confirmación seguirá dependiendo de validación server-owned y contratos normativos; no se almacenan tokens, credenciales ni contextos de mesa en la selección. Sin despliegue, merge, ni acceso a Fleetia, VPS o Supabase operativo.
