# Sabora — continuidad breve, sesión 19 (2026-11-02)

**Contexto, no normativa.** Fuente de verdad: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md` y `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md` (matriz F01–F28/R01–R10).

**Repositorio:** `jdlc86/CartaViva` · **Rama:** `integration/sabora-h6-b2-delivery-board-contract-20261031` · **PR:** #43 Draft · **Cambio de mesa:** B3 **NO-GO**.

## Hitos comprobados

1. **SQL y seguridad del candidato B3:** seis identidades PostgreSQL 17 de capacidades segregadas, solicitud/decisión de sala, confirmación económica A→B y bandeja de gestión condicional. No montado en producción.
2. **Integración inicial `4229ee709`: cuatro workflows SUCCESS.** Fastify + PG17 real con PWA gestión en Chromium; conserva cuenta, saldo y entregas al confirmar B. Evidencia registrada en la matriz oficial.
3. **Hito integral `884399bb`: cuatro workflows SUCCESS.** En un mismo recorrido, gestión **y cliente** funcionan como PWA reales en Chromium contra el mismo Fastify/PG17 aislado. Cliente entra por QR B, cotiza y confirma pedido; cuenta única, saldo 2400→3100 céntimos, histórico de A intacto, entrega pendiente redirigida y replay sin duplicar ronda. Capturas móvil/escritorio en artefacto H6. [CI](https://github.com/jdlc86/CartaViva/actions/runs/41443383622) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41443383594).

## Pendiente para cerrar B3

- **Cliente completo:** interfaz para solicitar cambio tras escanear otra mesa con cuenta activa; cancelar, bloqueo 90 s, aprobación/rechazo, mensajes normativos y estado durable. En el hito probado, la solicitud inicial aún se realiza por HTTP en el arnés; no está cubierta por la UI real.
- **Identidad/producto:** reemplazar el adaptador de identidad y catálogo de pruebas por la composición productiva autorizada, sin ampliar privilegios; pagos, SSE, cocina/sala y pruebas de varios comensales.
- **Aceptación integral:** carreras de decisión/confirmación, rollback económico y pagos, revocación, expiración, conformidad visual aprobada y evidencia individual F01–F28/R01–R10 con regresión final.

**Metodología obligatoria:** avanzar mediante **hitos funcionales integrales** con PG17 + HTTP + PWA reales, no mediante micropruebas como unidades de trabajo. Tests aislados solo para diagnosticar fallos concretos o proteger requisitos críticos. Diferenciar implementación, ejecución y validación.

**Límites:** ningún merge/despliegue/migración operativa sin autorización expresa. No intervenir en Fleetia, VPS compartido ni Supabase operativo. Revisar CI del HEAD antes de seguir. Historial detallado recuperable en commits y versiones anteriores de este documento.
