# Sabora H6 — cierre de cuenta de coste cero al finalizar la ocupación (2026-11-05)

> Informe de implementación candidata. No autoriza despliegue, migración operativa ni activación de servicios. La fuente de verdad sigue siendo la documentación normativa del repositorio.

## Decisión aprobada y alcance

La cuenta de una ronda cuyo importe final es cero no selecciona modalidad de pago ni inicia Stripe o efectivo. Mientras la visita y la ocupación sigan activas, la cuenta permanece abierta: un pedido posterior con importe positivo reutiliza la misma cuenta y entonces exige una modalidad de pago. Al cerrar la ocupación, solo puede cerrarse automáticamente una cuenta cuyo historial completo sea de coste cero y cuyas obligaciones de cocina, incidencias, reembolsos y recogida estén resueltas.

`ready` con tarea durable `ready/claimed` es resolución operacional suficiente para este cierre económico; no significa entrega física. Una ronda cancelada puede resolverse sin inventar `ready`, recogida o entrega, pero no con una incidencia pendiente. Una cuenta que haya tenido importe positivo, intento de pago o liquidación en efectivo nunca entra en el cierre automático, aunque su saldo actual sea cero.

## Implementación candidata

- `20261105070000_sabora_h6_zero_cost_account_auto_close_candidate.sql` añade procedencia generada de cierre (`staff` o `system_zero_cost`), una función interna `SECURITY DEFINER` sellada y un trigger de frontera de ocupación.
- El cierre comprueba la cuenta y su vinculación operacional bajo bloqueo, historial exclusivamente cero, ausencia de pagos/efectivo, estados terminales de ronda y despacho, tareas de recogida, incidencias y reembolsos. Revoca solicitudes/concesiones de cambio de mesa y emite un único evento durable `sabora.account.closed` con `deliveryConfirmed:false`.
- Ningún rol de navegador, cliente H6, operaciones H6, proveedor, cierre explícito ni escritor administrativo recibe `EXECUTE` sobre las funciones internas.
- El cierre de mesa adquiere el mismo advisory fence por cliente que la confirmación H6 antes del bloqueo de mesa. Revalida la sesión tras obtener el bloqueo y falla con conflicto serializable si el alcance cambió. Así se evita invertir el orden de locks entre una confirmación y el trigger de cierre.
- La PWA ya enviaba `paymentMode:null` para coste cero. La regresión añadida demuestra en una misma visita que el primer pedido gratuito oculta las modalidades y que un pedido positivo posterior vuelve a mostrarlas.

## Evidencia local ejecutada sobre PostgreSQL 17 desechable

- Cadena limpia de **83 migraciones**: PASS.
- `zero-cost-account-postgres17.test.mjs`: **4/4 PASS**. Incluye RLS/grants, cierre único, revocación, replay, cancelación, incidencia pendiente, tarea ausente y carrera advisory real contra pedido positivo.
- `h6-postgres17.test.mjs`: **2/2 PASS**. La ronda gratuita y la positiva comparten `accountId`; omitir pago en la positiva se rechaza y revierte sin duplicar rondas.
- `table-change-root-postgres17.test.mjs`: **51/51 PASS** con PostgreSQL 17, seis identidades SQL restringidas, Fastify, SSE y Chromium.
- `npm run check`: **1.175 PASS, 2 SKIP, 0 FAIL** de 1.177 pruebas, builds de API/PWA cliente/PWA gestión y puerta de secretos PASS.
- Playwright de la PWA cliente en móvil y escritorio: **36/36 PASS**, incluidos los dos casos del nuevo flujo. GitHub Actions del SHA final se registra en el PR Draft.

La primera ejecución local de la regresión integral falló porque `RUNNER_TEMP`, variable proporcionada por GitHub Actions, no estaba definida. Esa interrupción dejó una solicitud de prueba pendiente y provocó una segunda falsa negativa. Se recreó PostgreSQL desde cero, se definió el entorno equivalente a CI y los **51/51** casos pasaron. No se alteró producto para ocultar el fallo del arnés.

## Límites y riesgos residuales

- La migración permanece candidata en PR Draft; no se aplicó a Supabase operativo ni se activó ningún endpoint, worker, correo o proveedor.
- El trigger automático se ejecuta en la transición de ocupación a `closed`. Si la cuenta aún contiene una obligación sin resolver en ese instante, permanece abierta y requiere el flujo económico/operativo posterior autorizado; no se fuerza un estado terminal ni se afirma entrega.
- La ruta soportada para cerrar mesa es `transition_table_ordering_candidate`; los roles de runtime no poseen DML directo. Una actualización administrativa privilegiada directa sigue fuera de la interfaz operativa y no sustituye sus fences previos.
- Esta evidencia no certifica Stripe sandbox, identidad de Supabase operativo, despliegue ni la matriz completa de producción. Cierra el bloque candidato de cuenta de coste cero, no el GO global del proyecto.
