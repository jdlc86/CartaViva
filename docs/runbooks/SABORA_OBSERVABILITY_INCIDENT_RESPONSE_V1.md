# Sabora — Observabilidad, diagnóstico, incidentes y recuperación · candidato S36

**Estado:** implementación de instrumentación de base para el servidor `health-only` y contratos de extensión opt-in. **NO** autoriza despliegue ni certifica observabilidad H3–H6 en Supabase real. Prevalecen contratos normativos de seguridad, flujos y aislamiento.

## 1. Método permanente de dos entornos complementarios

- **Laboratorio inmutable/efímero:** cada revisión ejecuta tests Node, PostgreSQL 17 en GitHub Actions, migraciones con checksums/reanudación, RLS, identidades/JWT/HMAC, carreras económicas, dos PWA, Chromium/Playwright y ensayo de recuperación. Se recrea desde cero y **no** usa Supabase operativo, secretos privados ni VPS.
- **Sabora operativo (solo tras autorización):** mismo SHA, misma matriz, datos ficticios, logging seguro y comprobaciones reales sobre QR, cliente, cocina, sala, gestión, pagos habilitados, SSE, dominios y TLS. Inspecciones visuales en móvil y escritorio cotejadas con el diseño **aprobado**; una captura CI no constituye aceptación visual humana.
- **Corrección por hito integrado:** incidencia identificada → reproducción/evidencia → causa y cambio completo → CI PG17/dos PWA → despliegue aislado Sabora-only autorizado → smoke/aceptación → actualización matriz/continuidad. Solo tests aislados para diagnóstico específico o contrato crítico. No duplicar PRs ni suites de larga duración.
- Referencia del acuerdo: [continuidad S36-8](../handoffs/SESSION_36_HANDOFF_2026-11-11.md). Fuentes normativas: [límites de proyecto](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [contrato consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md).

## 2. Instrumentación instalada en código candidato

`apps/api/src/operational-observability.mjs` y `server.mjs`:
- Sustituyen el logging HTTP por defecto de Fastify por eventos JSON **con campos elegidos de una lista cerrada**; Fastify ya no imprime ruta cruda, query, IP, user agent ni cabeceras por defecto.
- Generan en el servidor `x-sabora-request-id` **aleatorio** para cada solicitud; jamás aceptan el valor de la cabecera aportada por el cliente como identidad verificable.
- Evento HTTP `http_request`: `schema=1`, `source=sabora_observability`, `service=sabora-api`, `at`, `level`, `requestId`, `route` (solo `/health`, `/ready` u `other`), `method` enumerado, `statusClass` y `durationMs` acotado.
- Eventos `operation` (componente/operación/resultado enumerados, duraciones), `dependency_failed`, `lifecycle` y `alert`. **La instrumentación HTTP también se conecta por inyección al candidato integrado M2/M3 de laboratorio**, cuyo bootstrap GitHub Actions verifica HTTP real + PostgreSQL 17 con los tres tipos de rutas sanitizadas; **no** está conectada a un bootstrap de producción operativo. La instrumentación específica de operaciones SQL/outbox/Stripe y de las dos PWA sigue pendiente.
- Un umbral **basado en eventos** (3 HTTP 5xx en 60 segundos) emite `alert: http_5xx_burst` como registro estructurado; no instala sondeo recurrente ni envía mensajes a un proveedor. Un sink de diagnóstico que falla **no altera la operación**.
- `snapshot()` ofrece contadores internos y bandas de duración sin endpoints nuevos. No existe `/metrics`, `/debug` o visualizador HTTP público. `/health` y `/ready` siguen indicando **solo disponibilidad del proceso health-only**, no preparación del restaurante ni conectividad SQL.

**No se almacenan ni emiten** cuerpos, SQL, URLs completas, parámetros, cookies, identificadores de actor/mesa/QR, JWT, claves, IP, correo, tarjetas, importes detallados, headers o errores sin limpiar. La auditoría **append-only transaccional** permanece en PostgreSQL; este stream de diagnóstico no la sustituye.

## 3. Análisis puntual sin nuevas dependencias

`node scripts/ops/sabora-diagnostics-summary.mjs` consume **únicamente STDIN** y produce un JSON agregado seguro, sin consultas externas, writes, timers ni eco de líneas originales. Ejemplo de un operador autorizado, **tras verificar el scope exacto del Compose y el VPS**:

```bash
docker compose --project-name sabora --file deploy/compose.sabora.yml logs --no-color --tail 200 api | node scripts/ops/sabora-diagnostics-summary.mjs
```

Se exige archivo `deploy/compose.sabora.yml`, nombre `sabora`, servicio `api`, máximo 200 registros. No ejecutar sobre el VPS sin autorización y aislamiento demostrado. La salida agregada incluye peticiones, 4xx/5xx, operaciones, fallos de dependencia y avisos; **no** indica salud de la API H3–H6 si el proceso no está montado. El análisis ignora líneas ajenas y datos imprevistos; no guardar logs brutos en documentación, capturas ni GitHub.

## 4. Respuesta a incidentes

| Señal | Diagnóstico permitido | Condición de parada |
| --- | --- | --- |
| `http_5xx_burst`, latencia elevada o 5xx aislado | Identificar SHA/servicio y franja horaria; correlacionar `x-sabora-request-id` entre cliente/API sin guardar tokens o datos personales; reproducir en el laboratorio | 5xx persistentes, respuesta inesperada o pérdida de idempotencia: cerrar **solo** entrada Sabora según runbook |
| 401/403/revocación inesperada | Verificar rol efectivo, titular ADMIN único, actor firmado y expiración; usar tests negativos JWT/HMAC/PG17; nunca revelar JWT | Cualquier bypass RLS o suplantación: **NO-GO inmediato** |
| DB no disponible o rol SQL incorrecto | Comprobar estado del proyecto, TLS, rol exacto y restricciones mediante lecturas de metadatos autorizadas; observar readiness de dependencias **cuando exista bootstrap CV-005** | No cambiar a `postgres`, `service_role` ni desactivar TLS o RLS como workaround |
| Evento SSE/outbox ausente o repetido | Correlacionar cursor de eventos y ledger idempotente con pruebas PG17; no activar polling prohibido | Repetición económica, pérdida de evento durable o doble entrega |
| Pago/reembolso | Distinguir adaptador test de proveedor remoto; examinar identificadores ficticios y auditoría sin valores PCI en log | Discordancia contable o webhook no autenticado |
| Captura visual no conforme | Reproducir en móvil real + captura del mismo SHA; comparar con la maqueta y flujos aprobados; agrupar cambios | No declarar F28/R09 validados por Playwright aislado |
| Saturación, reinicio o crash | Consultar exclusivamente estado/cola de logs del contenedor Sabora; límites mem/CPU/PID y rotación | Riesgo para otro servicio del VPS: parar la operación sobre Sabora; **no** reiniciar host ni Docker global |

**Circuito mínimo de un incidente:** congelar SHA y contexto sin secretos → clasificar severidad → activar parada de **solo** Sabora si corresponde → evidencia agregada + pruebas del laboratorio → corrección integrada → revisión independiente de permisos/aislamiento → regresión de dos PWA/PG17 → autorización de redeploy → validación real → cierre documentado.

## 5. Recuperación y preservación de evidencia

Se **reutilizan**, no se reemplazan, los procedimientos ya existentes:
- [P2 migraciones, checksum, reanudación y rollback/restore](SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md).
- [P3 recuperación de datos/roles, corrupción e interrupción](SABORA_P3_RECOVERY_CONTINUITY_RUNBOOK_2026-10-29.md).
- [P3 ciclo de vida de contenedores estrictamente Sabora-only](SABORA_P3_ISOLATED_LIFECYCLE_RUNBOOK_2026-10-29.md).

Esas pruebas se ejecutan en PostgreSQL 17 desechable, **no** garantizan PITR/Storage ni restauración real de Supabase. Los RTO/RPO operativos permanecen **sin definir/validar**. Antes de activar CV-005/CV-010/CV-011: comprobar mecanismo de backup del plan contratado, recuperación real (o procedimiento probado en copia autorizada), custodia separada de logins/secretos, retención de logs, alarmas externas y rotación. La copia/restore jamás tocará recursos Fleetia ni otros proyectos, y no debe alterar servicios ajenos.

## 6. Alertas, responsables y puertas pendientes

La instrumentación emite `alert` al log, pero **no existe todavía receptor externo de alertas, panel persistente ni integración con el runtime H3–H6**. No afirmar monitoreo 24/7. Antes del GO operativo:
1. Acoplar instrumentación y propagación segura de correlación a **cada** composición H3–H6, outbox/SSE, Stripe test, SQL pools y dos PWA; definir categorías seguras y verificar redacción y métricas de extremo a extremo.
2. Sustituir readiness health-only por verificación real de las dependencias SQL/JWKS/eventos, con 503 ante fallo y sin rutas de debug; mantener /health solo liveness. Prohibido dar una disponibilidad falsa.
3. Seleccionar custodio y receptor de alertas sin secretos de otros proyectos, definir umbrales/horario/retención, ensayar disparo y recepción, y probar fallo del sink sin impacto funcional. No publicar métricas privadas en un endpoint abierto.
4. Probar recuperación/backup de **solo** Sabora sobre una copia representativa y acordar objetivos RTO/RPO; conservar SHA y resultados, nunca dumps ni credenciales en CI.
5. Realizar inspección humana de ambas PWA y recorrido QR→pedido→cocina/sala tras autorización de despliegue. Stripe sandbox remoto, Excel, reservas y Gemini mantienen sus puertas individuales.

## 7. Pruebas y evidencia

- `tests/operational-observability.test.mjs`: Fastify real con inyección HTTP, correlación, no fuga de valores inyectados en URL/cabeceras, cardinalidad/errores, aislamiento de fallos del sink y ráfaga 5xx sin polling.
- `tests/operational-diagnostics-summary.test.mjs`: resumen solo de eventos Sabora, no eco de secretos ni líneas de otros proyectos.
- `scripts/ci/disposable-h6-runtime-bootstrap.mjs` (preflight H3–H6/M3 PG17): conecta observador opt-in antes de escuchar, ejecuta HTTP real `/health`, `/ready`, catálogo y denegación a personal no autorizado, y comprueba telemetría tipada sin campos crudos. `tests/operational-observability.test.mjs` también exige rechazo temprano de observadores incompletos.
- Suites preexistentes `tests/api-exposure-guard.test.mjs`, `tests/production-config-secrets.test.mjs`, `tests/deployment-isolation-contract.test.mjs`, `tests/recovery-continuity-contract.test.mjs` mantienen la puerta health-only, cero rutas operativas y aislamiento.
- El comando `pnpm test` incluye automáticamente `tests/*.test.mjs`, y los seis workflows actuales de PR prueban los sistemas existentes. **Solo marcar PASS de CI cuando el nuevo SHA realmente concluya correctamente.**

**Dictamen del alcance:** instrumentación HTTP y diagnóstico de base son un avance implementable ahora; la **observabilidad de restaurante completo, alertas externas, RTO/RPO real y restauración productiva siguen pendientes** del bootstrap, proveedores y autorización. No convertir documentación o CI en aceptación de producción.
