# ENCARGO A CODEX — Refactorización integral del cambio de mesa H6
**Fecha:** 2026-10-30  
**Repositorio exclusivo:** `jdlc86/CartaViva`  
**Rama de trabajo existente:** `integration/sabora-h6-end-to-end-pilot-20261030`  
**Estado inicial:** NO-GO. **Modalidad:** bloques lógicos autocontenidos con commits y push al terminar cada bloque. **No despliegues ni merges.**

## 0. Instrucción principal: leer antes de escribir
No improvises una solución ni añadas parches para superar pruebas. Primero comprueba en GitHub y en el árbol de trabajo las versiones vigentes, migraciones, contratos, dependencias, rutas y tests. **La fuente de verdad es la documentación normativa del repositorio**, especialmente:
1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, sección «Cambio de mesa con consumición activa — decisión funcional 2026-10-30».
2. Las restantes normas de seguridad, pagos, identidad, operación, diseño visual premium y flujos aprobados presentes en el repositorio.
3. `docs/assignments/SABORA_TABLE_CHANGE_ROOT_CAUSE_INTEGRATION_AUDIT_2026-10-30.md`.
4. `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`, matriz **F01–F28** y **R01–R10**.
5. `docs/assignments/SABORA_TABLE_CHANGE_B0_DEPENDENCY_INVENTORY_2026-10-30.md` y `docs/assignments/SABORA_TABLE_TRANSFER_IMPLEMENTATION_2026-10-30.md` como contexto técnico, no autoridad normativa.

Si una hipótesis de estos documentos no coincide con el código real, **demuéstralo con rutas, firmas y líneas, corrige el diseño y documenta la discrepancia**. No alteres unilateralmente requisitos normativos. Los handoffs de sesiones no son fuente de verdad.

## 1. Objetivo funcional no negociable
El cliente escanea libremente QR sin mover nada; su **primera confirmación de pedido** fija mesa operativa incluso dentro de agrupación. Si ya tiene consumo, solicita al camarero permiso **sin indicar destino**. Ventana configurable de respuesta **90 s por defecto**, medida con reloj del servidor; rechazo no permite repetir antes del vencimiento; decisión tardía inválida. Camarero autenticado aprueba/rechaza **sin motivo**. Notificaciones literales:
- Aprobación: «Cambio de mesa aprobado. Ya puedes escanear el código QR de tu nueva mesa y continuar realizando pedidos».
- Rechazo: «Cambio de mesa no autorizado. Tu solicitud de cambio de mesa no ha sido aprobada. Si necesitas más información, consulta al personal del restaurante».

La aprobación **no cambia mesa** y permanece sin nueva caducidad hasta uso único, cierre o revocación. El cliente sigue operando en origen. **Solo la primera confirmación de pedido en otra mesa operativa** consume autorización y traslada atómicamente la cuenta existente y destinos de entrega pendientes. Se conserva `account_id`, saldo, pagos parciales, Stripe, pedidos históricos, estados cocina/sala, plazo de agrupación y auditoría; no recobrar, reexpedir ni mezclar otras cuentas. Origen histórico inmutable, destino operativo actual independiente. Revalidar QR, mesa y sesión al confirmar. Evitar cruces SSE y carreras. Todo para **un solo restaurante Sabora**.

## 2. Problema de raíz que DEBES resolver, no rodear
En `supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql`, `confirm_customer_round_h6_candidate` persiste pedido **antes** de resolver cuenta; crea/selecciona `customer_accounts` por `table_id/session_id/visit_key/customer_id`. `read_customer_round_h6_candidate` vincula la consulta histórica a la mesa actual. `order_rounds.account_id`, `payment_attempts.account_id`, cuentas, visitas, órdenes y `event_outbox` tienen dependencias de identidad/mesa. `kitchen_dispatches` carece de destino de entrega separado. La composición `apps/api/src/customer-production-composition.mjs` usa SQL allowlist y roles limitados; `apps/api/src/table-change-postgres-store.mjs` tiene `applyTransfer` deshabilitado. La migración provisional `20261030143000_sabora_h6_cross_table_account_guard_candidate.sql` bloquea pedidos en otras mesas pero también puede bloquear visitas legítimas con cuentas antiguas abiertas. **No conviertas ese bloqueo provisional en diseño definitivo.**

### Obligación de análisis de impacto
Antes de cambiar una firma o tabla, inventaria **todos sus consumidores y dependencias**: SQL, funciones SECURITY DEFINER, triggers, FK, RLS, grants, roles, preflight, Node, HTTP, workers, outbox/SSE, PWA cliente, administración, sala/cocina, Stripe, pagos, visitas, revocaciones, reintentos y tests. Distingue identidad económica, visita, mesa histórica, mesa actual y destino de entrega. Determina el orden global de bloqueos y el límite transaccional. No asumas que dos mesas comparten `session_id`; tampoco que una cuenta abierta de visita antigua pertenece a la visita nueva. Explica cómo se identifica la **cuenta elegible**, con pruebas positivas y negativas.

## 3. Plan de ejecución por bloques grandes (optimizado para crédito limitado)
Trabaja **secuencialmente**. En cada bloque: inspección focalizada → implementación completa del bloque → pruebas pertinentes → correcciones → documentación → **commit(s) coherentes y push inmediato** → resumen corto de SHA, pruebas y riesgos. **No esperes a terminar todos los bloques para subir.** Evita conversaciones intermedias, microcommits, refactors cosméticos y volver a leer archivos no modificados sin necesidad. Si el contexto/crédito se agota, deja la rama y documentación de continuidad listas para reanudar exactamente donde acabaste. No sacrifiques seguridad ni afirmes pruebas no ejecutadas para ahorrar crédito.

### BLOQUE A — Auditoría ejecutable y arquitectura de raíz
- Revisa estado de rama, cambios locales y PRs; no sobreescribas trabajo ajeno. Traza dependencias H6 y contrasta auditoría/hoja de ruta.
- Reproduce en **PG17 aislado** el fallo de segunda cuenta y el de lectura histórica (con fixtures y aserciones de regresión), así como caso de dos mesas con sesiones diferentes y nueva visita con cuenta antigua abierta. Identifica los flujos reales de entrega/recogida y de eventos.
- Define modelo coherente de identidad económica y proyección de destino operativo, migración de datos, idempotencia, bloqueo, autorización y rollback. Comprueba implicaciones sobre funciones/consumidores; no codifiques esquema especulativo.
- **Salida A:** informe de diseño con referencias reales + tests que reproducen defectos + comandos y logs; commit y push. Si hay contradicción normativa o impedimento estructural, documenta y detente en ese punto, no improvises.

### BLOQUE B — Modelo SQL PG17, seguridad y confirmación atómica
- Refactoriza **desde la función raíz** la confirmación H6, no con una actualización posterior. La cuenta original se determina y bloquea **antes de persistir**; la autorización se consume **dentro de la misma transacción** que el nuevo pedido, ronda y cambio de destino. Revalidación final de QR, mesa operativa, identidad, cuenta, visita, sesión y concesión.
- Reintentos idempotentes deben recuperar `order_rounds.account_id` original; evitar segunda cuenta, segundo cobro o doble consumo. Preservar `orders.table_id` histórico, saldos y estados; no reiniciar agrupación.
- Diseña y aplica **solo en PG17 aislado** migraciones ordenadas con constraints, FK, índices, auditoría, funciones SECURITY DEFINER mínimas, search_path seguro, propietarios, grants, RLS, revocación/cierre y consulta histórica. Sustituye/elimina de la **rama candidata** el guard provisional cuando la alternativa completa esté probada; nunca lo retires dejando el riesgo abierto.
- Redirige únicamente destinos operativos de entrega pendientes, sin alterar cocina histórica ni pagos. Comprueba semántica real de recogido/cancelado antes de cambiar estados.
- Prueba concurrencia real B/C, doble toque, expiración en frontera, cierre/revocación, transacciones abortadas, pagos pendientes, Stripe, sesiones diferentes, visitantes simultáneos y otras cuentas en destino. Incluye pruebas de seguridad con roles reales.
- **Salida B:** migraciones y funciones integradas, PG17 real con evidencias, commit y push. Si no existe PG17 aislado disponible, no toques Supabase operativo: deja harness reproducible, indica **NO EJECUTADO** y continúa solo lo seguro.

### BLOQUE C — Composición backend, API, sala/cocina y eventos
- Integra solicitud/decisión/consumo en composición real; sustituye SQL directo no autorizado por contratos restringidos. Ajusta allowlists exactas, `h6-sql-preflight.mjs`, roles mínimos, verificación de identidad y auditoría.
- Implementa notificaciones durables, expiración, cooldown, cuenta atrás coherente con reloj servidor, revocación, cierre y endpoints con idempotencia, errores seguros y sin motivos.
- Corrige consultas de rondas históricas, pagos, sala/cocina, pickup, outbox/SSE, reconexión y aislamiento multiusuario. Revisa todos los consumidores, no solo rutas nuevas.
- Ejecuta suites API y PG17 del bloque; **commit y push** con evidencias.

### BLOQUE D — PWA cliente y operativa, flujos completos
- Conecta QR ajeno, aviso solicitar/cancelar, solicitud sin destino, estado y contador, mensajes literales, aprobación/rechazo sala, uso diferido de permiso y confirmación en destino. Mantén pedidos/pagos en origen hasta consumo.
- Respeta **identidad visual premium aprobada**, flujos discutidos, separación cliente/operación, responsive, accesibilidad, ES/EN si procede y comportamiento PWA. No rediseñar por iniciativa propia.
- Playwright real cliente+camarero+cocina, múltiples usuarios, capturas y axe; **commit y push**.

### BLOQUE E — Regresión global y candidatura
- Ejecuta **F01–F28 y R01–R10**, suites completas Node/gestión/PG17/Playwright, CI de GitHub; no marcar PASS por existencia de test. Repetir tras correcciones.
- Revisa integridad económica, seguridad, concurrencia, privilegios, fugas SSE, migraciones limpias y regresiones de otros flujos. Si una prueba falla, diagnostica causa raíz y reejecuta lo necesario.
- Actualiza documentación normativa **solo si existe decisión normativa aprobada que incorporar**; actualiza arquitectura, matriz de trazabilidad, resultados con SHA, comandos, totales, logs/Actions, defectos abiertos y dictamen GO/NO-GO. PR **Draft**, nunca merge.
- **Salida E:** candidatura completa verificable; commit y push.

## 4. Pruebas y reglas de calidad obligatorias
- Cumplir matriz F01–F28 y R01–R10 **sin excepciones silenciosas**. No sustituir PG17 real o navegador por mocks/regex.
- Orden de bloqueos documentado, integridad por FK/constraints, serialización y rollback atómico, tests de carreras y replays; validar esquema desde cero y migraciones incrementales donde corresponda.
- Mantener mínima superficie de privilegios: ninguna concesión general de acceso SQL, sin bypass de RLS ni secretos en logs. No usar conexión de producción.
- No añadir nuevos guards provisionales, duplicación de lógica ni excepciones por caso particular; **resolver la causa raíz** y retirar código temporal tras validar reemplazo.
- Las pruebas deben ser independientes y reproducibles. Diferenciar `PASS`, `FAIL`, `SKIP` y `NO EJECUTADO`. Un bloque no queda cerrado si no satisface su puerta de salida.
- Prohibido alterar la identidad visual aprobada o reinterpretar contratos para hacer pasar tests.
- No confundir `npm test` o tests unitarios con certificación de migraciones PG17 y flujos E2E.

## 5. Seguridad operacional y límites absolutos
- Solo `jdlc86/CartaViva`; puedes crear rama de trabajo derivada si evita conflictos, commits, push y PR Draft. **No merge, despliegue, reinicio, eliminación, migración sobre Supabase operativo ni modificación del VPS** sin autorización expresa.
- **Fleetia y todos los contenedores/volúmenes/redes/servicios de otros proyectos están fuera de alcance**. No usar `docker compose down`, comandos de limpieza global, redes compartidas ni operaciones que afecten terceros.
- PG17 aislado y contenedores propios con nombres/red/volúmenes independientes si existen recursos autorizados. Nunca asumir que la URL de Supabase facilitada es entorno de pruebas.
- No ejecutar acciones de producción aunque CI esté verde. GO técnico no equivale a autorización de despliegue.

## 6. Formato de entrega tras CADA bloque
```text
BLOQUE: A/B/C/D/E
Estado: PASS / PARCIAL / BLOQUEADO (sin maquillar)
Rama / SHA / enlace PR Draft:
Causa raíz / decisiones arquitectónicas:
Archivos modificados y consumidores revisados:
Comandos y entorno de pruebas:
Resultados: PASS / FAIL / SKIP / NO EJECUTADO (totales exactos):
Evidencias: logs, fixtures, URLs CI, capturas:
Riesgos pendientes / siguiente bloque:
Commit(s) y push: [SHA verificable]
```

**Inicia ahora por BLOQUE A**. Al cerrarlo, haz commit y push; continúa B, C, D y E mientras haya crédito, sin solicitar aprobaciones para lectura, commits, pruebas aisladas o push. Si falta una autorización real de producción, no la solicites: deja la operación pendiente y sigue el trabajo seguro. Nunca anuncies el refactor como terminado sin pruebas PG17 + E2E y regresión global.
