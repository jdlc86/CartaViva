# Sabora / CartaViva — continuidad operativa de la sesión 28 (2026-11-07)

> **DOCUMENTO VIVO DE CONTINUIDAD, NO NORMATIVA NI ACTA DE ACEPTACIÓN.** Su objetivo es permitir que la sesión 28 retome un hito integral con el estado más reciente, las evidencias y los bloqueos verificables. Este documento no autoriza merge, despliegue, gastos, migraciones operativas ni cambios en servicios externos.
>
> **Fuente viva de seguimiento obligatoria:** [SABORA_LIVE_PROJECT_TRACKER — M1–M6 / CV-001–CV-019](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). **Matriz H6:** [F01–F28 / R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). **Relevo inmediatamente anterior:** [sesión 27](SESSION_27_HANDOFF_2026-11-07.md), especialmente §§8–16. No se debe reconstruir una supuesta sesión 26: el salto histórico de 25 a 27 fue deliberado.

## 1. Fuentes de verdad y límites de este relevo

1. **Normativa funcional:** [contrato consolidado Sabora](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md) y [requisitos funcionales](../REQUISITOS_FUNCIONALES.md). La instalación Sabora corresponde a **un único restaurante**. Las reglas de cuentas, ocupaciones, pago, caja, roles y dashboard se toman de esos textos, no de la interpretación del handoff.
2. **Diseño aprobado:** [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [auditoría de estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [requisitos visuales](../design/DESIGN_REQUIREMENTS_V1.md). Diferenciar explícitamente decisiones **APROBADAS** de propuestas/maquetas. Chromium, axe, capturas y CI **no sustituyen la aceptación humana**.
3. **Arquitectura y seguridad:** [hoja de ruta técnica](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [dos PWA/directorio](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md) y [aislamiento de Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).
4. **Evidencias no normativas:** tablero vivo, matriz H6, [acta H6](../reviews/SABORA_H6_FUNCTIONAL_ACCEPTANCE_ACT_2026-11-07.md), [revisión integral económica F20](../reviews/SABORA_F20_R03_R05_INTEGRAL_PAYMENTS_CASH_GAP_REVIEW_2026-11-07.md), [informe de caja](../reviews/SABORA_H6_CASHIER_PG17_INTEGRATION_CANDIDATE_2026-11-07.md), [informe de dashboard M3](../reviews/SABORA_M3_ADMIN_FINANCE_DASHBOARD_CANDIDATE_2026-11-07.md) y sesión 27. Estos informes describen implementación y prueba; no crean requisitos ni autorizaciones.

**Precedencia obligatoria:** NF/RF/DV e instrucciones de autorización aprobadas > criterios de aceptación vinculantes > evidencias verificadas > tablero de seguimiento > documentos históricos de continuidad. Ante contradicción, no reinterpretar la normativa para lograr una prueba verde.

## 2. Fotografía real verificada para iniciar la sesión 28 — 07-11-2026

- **Repositorio único habilitado para cambios:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva).
- **Rama de trabajo:** `feat/sabora-cv012-independent-pwas-20261106`; [PR #49](https://github.com/jdlc86/CartaViva/pull/49) **OPEN / Draft**, base `integration/sabora-session23-m3-acceptance-20261106` ([PR #48](https://github.com/jdlc86/CartaViva/pull/48)). GitHub informó `mergeable=true` / `mergeable_state=clean` en esta consulta, **no** autorización para fusionar.
- **HEAD consultado antes de crear la sesión 28:** `4558f1d463936157fd80da01c1d78aa202f8fd5a` (commit de **solo documentación**, mensaje `[skip ci]`). Base PR #49: `ead7633bd9796324de88bb024583ad16944941e8`; `main`: `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. La creación de este archivo **moverá el HEAD**, por lo que hay que volver a comprobarlo en el siguiente inicio.
- **Último SHA funcional con validación integral observada:** [`4c88b4968ec269641fb00aad2141897f00f08dd0`](https://github.com/jdlc86/CartaViva/commit/4c88b4968ec269641fb00aad2141897f00f08dd0). **Cinco workflows del mismo SHA COMPLETED/SUCCESS**, comprobados en GitHub:
  - [CI Sabora H6](https://github.com/jdlc86/CartaViva/actions/runs/42382160647): bloques 1, 2A y 2B **PASS**.
  - [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42382160546): suite integrada PostgreSQL 17 **51/51** y coste cero **4/4**; [registro completo de ejecución](../reviews/SABORA_M3_ADMIN_FINANCE_DASHBOARD_CANDIDATE_2026-11-07.md).
  - [Chromium cliente](https://github.com/jdlc86/CartaViva/actions/runs/42382160732), [Chromium gestión](https://github.com/jdlc86/CartaViva/actions/runs/42382160676), [dos PWA instalables](https://github.com/jdlc86/CartaViva/actions/runs/42382160618): **SUCCESS**.
- **Interpretación correcta:** el `5/5` pertenece a **`4c88b496`**; **no** se atribuye al SHA documental `4558f1d4` ni al futuro commit de este handoff. No se ha ejecutado aquí una nueva batería ni una nueva revisión humana.
- **Operación:** **PRODUCCIÓN NO-GO**. El servidor ordinario sigue descrito como `health-only`; los recorridos H3–H6 son composiciones de prueba opt-in sobre PostgreSQL 17 efímero/loopback. No equivalen a un arranque certificado, a conexión al Supabase operativo, a cobros remotos reales ni a un despliegue.

## 3. Hitos consolidados hasta la sesión 27: qué está realmente validado

| Ámbito | Implementación y prueba registrada | Dictamen que **sí** se puede sostener |
| --- | --- | --- |
| **M1 / H6, cambio de mesa y coste cero** | Matriz F01–F28/R01–R10 conciliada **38/38**; SQL/HTTP/roles/Chromium, traslado diferido A→B, cuentas individuales, outbox/SSE y cierre de ocupación con coste cero en candidato. | **Evidencia y acta por fila**, NO aceptación global. No equiparar mesa cerrada con fin individual de sesión ni `ready/picked_up` con entrega física. F20, F28 y R03–R05/R09 siguen abiertos según su clasificación. |
| **M2/M3 — mesas, QR, catálogo, PWA** | Gestión de mesas/QR/categorías dinámicas; editor/publicación; dos PWA instalables independientes; variantes de un mismo plato **CV-019** en cesta, instantáneas económicas y cocina. Integración PG17, Fastify, Chromium. | **Candidatos técnicos** verificados en los SHA del tablero; **sin** conformidad visual humana global, instalación física certificada ni operación ordinaria. |
| **H6 caja individual** | Consulta financiera de mínimo privilegio HMAC, pantalla Caja de gestión, cobro presencial parcial idempotente y cierre separado; ejemplo integrado de 8 EUR con 3 EUR recibidos y 5 EUR pendientes. | **Candidato técnicamente validado**: `21e01a9e` con cinco workflows SUCCESS. No implica caja visual/fiscal aprobada. |
| **H6 modalidad fija de pago** | El cliente consulta modo de pago de cuenta/visita por servidor; primera ronda positiva fija modalidad, las gratuitas no, la selección no se reabre por QR/cambio autorizado de mesa. | **Candidato técnicamente validado**: `265e56df`, cinco workflows SUCCESS y PG17 I49. No equivale a integración segura de Stripe real. |
| **M3 dashboard financiero solo ADMIN** | Agregados reales con SQL/RLS/HMAC, registro de capturas/devoluciones, lectura Fastify autorizada, vista Configuración PWA gestión, filtros, evolución, KPIs y clasificación condicionada a datos verificables; denegación a roles no autorizados. | **Candidato técnicamente validado** en `4c88b496` con **5/5**. Es informativo, no fiscal. Históricos sin fecha acreditada y métricas no respaldadas muestran «Sin datos»; no inventar cobros. |
| **F20 recepción de webhook Stripe** | Ingreso HTTP opt-in con firma y cuerpo original, idempotencia/persistencia SQL en I49 con eventos generados por el harness. | **Candidato técnico de receptor**, **no** Stripe sandbox remoto ni autorización/captura/reembolso de extremo a extremo con proveedor externo. |

Los resultados antiguos `EN EJECUCIÓN` o `FAIL` de la sesión 27 son **historia de diagnósticos** cuando existe un cierre posterior con SHA y alcance idénticos; no borrarlos ni sumarlos como incidencias actuales. Confirmar siempre el árbol real antes de reusar un estado.

## 4. Bloqueos que impiden declarar H6/M4/M6 completados

- **F20/R03–R05; M4; CV-008/CV-009:** faltan credenciales **Stripe sandbox auténticas y autorizadas**, componente cliente seguro, ciclo real autorización manual → captura/reembolso → webhook del proveedor → conciliación y reintentos/incertidumbre; además propinas, pagador tercero/repartos y cierre económico/visual aprobado. El receptor con eventos simulados no supera esta puerta.
- **F28/R09; CV-017:** revisión/aceptación **humana** del diseño y flujos aprobados de ambas PWA, Configuración/dashboard y caja; accesibilidad manual, recursos visuales y pruebas en dispositivos pertinentes. CI no concede esa aprobación.
- **F12/R08; CV-005/CV-010/CV-011; M6:** servidor normal `health-only`, secretos, permisos/identidades, TLS, observabilidad, backup/restore y parada segura, preflight de operación, aislamiento pleno de Fleetia, autorización explícita para operar. La rama candidata no sustituye una instalación real ni un plan de recuperación probado.
- **M1 / CV-001 y CV-003:** **38/38 auditadas no son 38/38 aceptadas**. La firma de aceptación y la comprobación de bloqueos normativos siguen independientes de cualquier 5/5 técnico. Mantener trazabilidad por F/R sin cambiar el texto normativo.
- **M5:** están pendientes otras funcionalidades del contrato (p. ej., reservas anticipadas, anuncios/llamar camarero, informes ampliados, directorio, Estudio de imágenes IA) y sus decisiones/servicios externos donde corresponda. Consultar IDs CV-012–CV-019 y estados exactos del tablero; no declarar M5 completado por las dos PWA y el dashboard.

## 5. Siguiente secuencia de trabajo — un hito completo, no microcorrecciones

1. **Reconciliar el punto de partida antes de escribir código:** leer §§15–16 de [sesión 27](SESSION_27_HANDOFF_2026-11-07.md), §§34–36 del [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §§49–51 de la [matriz](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y normativa NF/RF/DV; comprobar el HEAD/base de #49, novedades de terceros y el estado CI del SHA que vaya a utilizarse.
2. **Prioridad funcional condicionada:** el gran frente pendiente de economía es **F20/R03–R05 / M4**. Cuando existan autorización y credenciales Stripe **test** y decisiones de pago/visual requeridas, preparar **un recorrido integrado** cliente → Fastify/roles → PostgreSQL 17 desechable → Stripe sandbox real → webhooks → captura/devolución/conciliación → caja/gestión → eventos; incluir idempotencia, fallos de red y no doble cargo. **Nunca** activar Stripe live, ejecutar gastos/cobros reales ni tratar transporte simulado como proveedor validado.
3. **Si la puerta externa no está abierta:** no inventar credenciales, diseños, fechas ni certificaciones. Elegir un **hito normativo autocontenido** que cierre una funcionalidad real de M5 o un subalcance completo de M4, tras contrastar los contratos y el tablero. Documentar explícitamente qué dependencias externas permanecen bloqueadas; no fraccionar el trabajo en decenas de micropruebas.
4. **Validación del hito elegido:** preferir prueba integradora PostgreSQL 17 + Fastify/JWT/HMAC + ambas PWA/Chromium + seguridad, concurrencia y regresión H6 en **el mismo SHA**. Pruebas aisladas únicamente si diagnostican un fallo concreto o protegen una invariante crítica (p. ej., firma de proveedor). Si falla, instrumentar causa, corregir y ejecutar de nuevo la prueba integral existente; **no** debilitar aserciones, relajar privilegios ni cambiar la normativa para conseguir verde.
5. **Distinguir cuatro resultados:** código **implementado**; pruebas **realmente ejecutadas**; subalcance **técnicamente validado**; funcionalidad **aceptada por responsable y apta para operación**. No pasar a `CERRADO` una fila F/R o un hito M por mero éxito de GitHub Actions.

## 6. Reglas permanentes de seguridad y trabajo

- Únicos recursos modificables bajo este encargo: **ramas, commits, documentación, PR Draft y pruebas/Actions de `jdlc86/CartaViva`**. No modificar `main` ni fusionar/cerrar PR históricos sin decisión expresa. No promover trabajo documental como aceptación.
- **Fleetia no se toca ni se comparte operacionalmente:** prohibido reiniciar, parar, modificar, eliminar, reutilizar o depender de sus contenedores, redes y otros recursos del VPS. Sabora debe poder pararse/desplegarse/eliminarse de forma autónoma, sin afectar a ningún otro proyecto.
- **Sin autorización expresa:** no despliegues, VPS, Supabase operativo, migraciones en bases reales, secretos/credenciales de producción, Stripe real, proveedores de IA con coste o cambios operativos. Todos los recorridos aquí citados son de CI/entorno desechable, salvo evidencia nueva explícita.
- Diseño aprobado y flujos aprobados son vinculantes. Nunca sustituir aprobación visual humana por capturas Playwright o pruebas axe. No inventar una nueva pantalla de negocio cuando falta decisión normativa.
- Mantener hitos completos y pruebas integradoras; tomar decisiones desde el código y documentación de GitHub, no de recuerdos de chat ni de la descripción de un PR.

## 7. Mantenimiento de este documento vivo

Actualizar **solamente al cerrar hitos relevantes** o cuando cambie un bloqueo/decisión material. En cada nueva entrada registrar **fecha, alcance normativo, implementación real, commit/PR, workflows del mismo SHA, entorno/proveedor usados, validación y límites, aceptación pendiente, próxima puerta**. Actualizar también el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), la [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y el informe de hito si el contenido cambia de estado. No reescribir los handoffs históricos; conservar la evidencia de fallos y de sus correcciones.

El enlace relativo `../tracking/SABORA_LIVE_PROJECT_TRACKER.md` es obligatorio para los documentos de continuidad. El tablero no reemplaza la normativa. **No confundir la creación documental de esta sesión con una nueva implementación o prueba.**

## 8. Apertura de la continuidad 28 — hito documental, 07-11-2026

Se crea esta continuidad como relevo de la sesión 27, incorporando el cierre técnico del dashboard ADMIN con **5/5 SUCCESS de `4c88b496`**, los candidatos ya verificados de caja y modalidad fija, y los bloqueos remanentes de Stripe sandbox, terceros/propinas, aprobación visual y arranque seguro. **No se realiza código funcional nuevo, prueba nueva, merge ni despliegue mediante esta apertura.** El estado global permanece **NO-GO de producción**.

**Próximo registro:** solo tras un hito integral realmente verificado o una decisión externa que desbloquee la ruta crítica.
