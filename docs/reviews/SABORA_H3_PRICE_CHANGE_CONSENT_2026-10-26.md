# H3 — Aceptación explícita de cambios de precio

Fecha: 2026-10-26. Evidencia de implementación, no normativa.

Fuentes: `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`, `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`.

## Implementado

- La reconciliación del catálogo no cambia silenciosamente el precio histórico de la selección local.
- Una diferencia de precio crea incidencia `price_changed`, bloquea el avance hacia pedido y muestra el precio actualizado.
- La persona puede aceptar expresamente el nuevo precio. La operación conserva identificador y cantidad, y solo acepta el precio de un plato publicado y disponible.
- Cambiar cantidad antes de aceptar no borra la incidencia ni altera el precio original.
- Comparación de identificadores insensible a mayúsculas tanto en tarjeta como en cesta.
- Pruebas para precio pendiente, aceptación, cantidades, agotado y plato retirado.

## Límites

El total de cesta es informativo; ninguna aceptación local autoriza cobro, reserva o confirmación. La API debe validar precio, opciones, identidad, QR, mesa y disponibilidad en transacción antes de confirmar. Sin despliegue, merge ni intervención en VPS, Fleetia o Supabase operativo.
