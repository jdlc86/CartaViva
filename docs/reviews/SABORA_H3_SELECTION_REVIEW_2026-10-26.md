# H3 — Revisión integral de selección local

Fecha: 2026-10-26. Evidencia de implementación, no contrato normativo.

## Fuente de verdad
`docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md` y `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`.

## Bloque integrado

- Revisión bilingüe de todas las incidencias simultáneas de la cesta: plato agotado, despublicado y cambio de precio.
- Resumen de incidencias con número por causa, con texto accesible y actualizado según decisiones del cliente.
- Conservación de snapshots, cantidades y precios anteriores hasta decisión explícita.
- Retirada individual de cualquier línea inválida y aceptación expresa del precio nuevo si el plato sigue disponible.
- La acción «Pedir en mesa» se mantiene bloqueada hasta resolver todas las incidencias y cargar catálogo publicado.
- Prueba de resolución de incidencias mixtas sin mutar el snapshot original.

## Frontera de seguridad

La cesta y sus precios son solo informativos. Esta revisión no crea identidad, visita, reserva, pedido, comanda ni cargo. La confirmación futura exige validación server-owned y transaccional de QR, identidad, opciones, publicación, stock y precios. No se implementa polling. Sin merge, despliegue, acceso al VPS, Fleetia ni Supabase operativo.
