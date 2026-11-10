# Sabora H3 — coherencia local entre pestañas

Fecha: 2026-10-26. Evidencia de implementación, no contrato normativo.

Fuentes: `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`, `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`.

## Bloque

La cesta informativa se sincroniza entre pestañas abiertas del mismo origen usando el evento nativo `storage`. Se revalida el contenido mediante el mismo lector seguro del almacenamiento local; las cargas inválidas se descartan. Se ignoran cambios de claves ajenas y de otros almacenes. No se realiza polling, no se crean peticiones HTTP ni se accede a identidad/QR/visita.

Se han añadido pruebas unitarias para límites de identificadores y claves, y prueba de navegador con dos pestañas: añadir en una, observar en la otra, quitar en la segunda y verificar actualización en la primera.

## Límites

Sin sincronización entre dispositivos, sin garantía transaccional multi-pestaña para escrituras exactamente simultáneas; no es una fuente de verdad de pedidos. El servidor revalidará la confirmación real. No se han activado pedidos, despliegues, merges, VPS, Fleetia ni Supabase operativo.
