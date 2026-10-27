# Sabora H3 — incidencias de selección ante catálogo actualizado

Fecha: 2026-10-26. **Evidencia de implementación candidata, no contrato normativo.**

## Fuente normativa
- `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`: conservar selección ante agotados/retirados, exigir corrección explícita y no confirmar líneas inválidas.
- `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`: cesta local no detectable por servidor, revalidación transaccional indispensable, no polling.

## Alcance implementado
- Detección pura y determinista de dos incidencias para platos de la selección local: agotado temporalmente y ya no publicado en el catálogo.
- La cesta conserva sus líneas, cantidades y snapshots, sin sustitución ni borrado automático.
- La interfaz de cesta informa del motivo y ofrece retirar explícitamente cada línea afectada.
- La navegación «Pedir en mesa» queda deshabilitada mientras haya incidencias o el catálogo no esté cargado; no se representa confirmación real.
- Pruebas de regresión de incidencias, conservación, recuperación y retirada explícita.

## Límites
No hay datos de opciones/ingredientes en el DTO público actual; no se afirma detectar sus incidencias. La disponibilidad y precio definitivos deben verificarse por servidor en una transacción al confirmar. El acceso QR sigue desactivado; este bloque **no** habilita pedidos, identidad, reservas ni notificaciones. No hay polling. Sin merge, despliegue ni acceso a Fleetia o VPS.
