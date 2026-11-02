# Sabora — continuidad breve, sesión 19 (2026-11-02)

**Contexto, no normativa.** Fuente de verdad: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md` y `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md` (matriz F01–F28/R01–R10).

**Repositorio:** `jdlc86/CartaViva` · **Rama:** `integration/sabora-h6-b2-delivery-board-contract-20261031` · **PR:** #43 Draft · **Cambio de mesa:** B3 **NO-GO**.

## Hitos comprobados

1. SQL candidato de solicitud/decisión y confirmación A→B atómica; roles mínimos separados para cliente, camarero, escritor, lectores H6 y bandeja. Composición HTTP opt-in, sin activar en producción.
2. Bandeja candidata de gestión para ver pendientes y aprobar/rechazar; transporte bearer revocable, panel solo mediante habilitación explícita.
3. **SHA `4229ee709`: cuatro workflows SUCCESS.** PostgreSQL 17 real desechable con seis logins y Fastify; la **PWA de gestión en Chromium** lee la solicitud y aprueba; el transporte cliente confirma el pedido en B. Verificado: misma cuenta, saldo 2400→3100 céntimos, pedido histórico en A, entrega pendiente redirigida a B, permiso consumido y replay sin duplicar ronda. El doble GET de React se resolvió usando un pool real del lector. Logs: [CI](https://github.com/jdlc86/CartaViva/actions/runs/41441324253) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41441324189).
4. **SHA `0c3f6fc`: cuatro workflows SUCCESS** (CI H6, bootstrap PG17, conformidad cliente y smoke visual de gestión). Capturas de la bandeja conectada al flujo PG17 en Chromium móvil/escritorio; evidencia incorporada a la matriz. [CI](https://github.com/jdlc86/CartaViva/actions/runs/41442037781) · [PG17/bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/41442037768) · [Gestión](https://github.com/jdlc86/CartaViva/actions/runs/41442038039). Este es el último SHA con los cuatro resultados confirmados en verde. El posterior `4766df8` solo condensó esta continuidad; CI/bootstrap seguían ejecutándose al verificar.

## Pendiente para cerrar B3

- E2E **cliente en navegador real** contra el mismo SQL/API, JWT/verificación de identidad real y mensajes normativos.
- Pagos Stripe/efectivo, cuentas múltiples, SSE, entrega/cocina, caducidad, revocación, carreras económicas y rollback/replay del recorrido completo.
- Aceptación **individual y evidenciada** de F01–F28/R01–R10, conformidad visual aprobada y regresión final en el SHA definitivo.

**Metodología obligatoria:** avanzar mediante **hitos funcionales integrales** con PG17 + HTTP + PWA reales, no mediante micropruebas como unidades de trabajo. Tests aislados solo para diagnosticar fallos concretos o proteger requisitos críticos. Diferenciar implementación, ejecución y validación.

**Límites:** ningún merge/despliegue/migración operativa sin autorización expresa. No intervenir en Fleetia, VPS compartido ni Supabase operativo. Revisar CI del HEAD antes de seguir. Historial detallado recuperable en commits y versiones anteriores de este documento.
