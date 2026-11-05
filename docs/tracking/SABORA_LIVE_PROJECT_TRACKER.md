# Sabora / CartaViva — tablero vivo de ejecución, aceptación y bloqueos

**Creado:** 2026-11-05. **Naturaleza:** instrumento vivo de seguimiento del trabajo, **NO es normativa** ni autoriza merge, despliegue, migraciones operativas ni gasto. **Ámbito:** un restaurante Sabora; directorio CartaViva separado.  
**Actualización:** después de **cada hito integral realmente concluido**, de un bloqueo/decisión importante, de una auditoría que cambie la prioridad, o de un cambio de autorización. **No** acumular microestados, hipótesis o pruebas pequeñas como logros.  
**Fuente de verdad del estado de implementación:** HEAD y código de GitHub, resultados CI del **mismo SHA**, actas de aceptación y validación observada. **Fuente de verdad de requisitos y diseño:** siempre la documentación normativa indicada abajo.

> **INICIO OBLIGATORIO DE TODA SESIÓN/AGENTE:** leer este tablero, el **documento de continuidad más reciente**, los documentos normativos aplicables y verificar en GitHub HEAD, base, commits y Actions. Todo documento nuevo de `docs/continuity/` o `docs/handoffs/` debe enlazar aquí. Este tablero puede quedarse desfasado; corregirlo con pruebas, no asumir que sus estados siguen vigentes.

## 1. Jerarquía documental y referencias estables

**Si hay conflicto, prevalecen los requisitos normativos y el diseño realmente aprobado, jamás este tablero, una instrucción de continuidad o un informe de Codex.** Antes de implementar una tarea, abrir y comparar los apartados vigentes que le apliquen; no reinterpretar decisiones ni editar normas para hacer encajar código.

| Clave | Fuente y papel |
| --- | --- |
| NF | [Contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), incluyendo cambio de mesa, pagos, coste cero aprobado 2026-11-05, cocina y sala: **normativa**. |
| RF | [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md): requisitos, decisiones incorporadas y cuestiones que el propio texto deja abiertas. Atender a su estado por sección, no convertir propuestas en aprobaciones. |
| DV | [Contrato de sistema visual](../DESIGN_SYSTEM_CONTRACT.md), [auditoría de estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [requisitos visuales](../design/DESIGN_REQUIREMENTS_V1.md), [pantalla de inicio cliente](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md), [avisos y movimiento](../design/NOTIFICATIONS_AND_MOTION_V1.md): **solo APROBADO** obliga; mockups, fotos, tipografías y baselines pendientes requieren visto bueno. |
| IN | [Hoja de ruta técnica y política de hitos integrales](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [directorio de dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [aislamiento de Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md). |
| IA | [Contrato aprobado de Estudio de Imágenes Google](../architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md); no asumir que una pantalla de maqueta es servicio operativo. |
| H6 | [Matriz de cambio de mesa F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), [informe de cierre candidato de Codex](../reviews/SABORA_TABLE_CHANGE_FINAL_INTEGRAL_CLOSURE_REPORT_2026-11-04.md) y [coste cero](../reviews/SABORA_H6_ZERO_COST_ACCOUNT_LIFECYCLE_2026-11-05.md): **evidencia, no normativa**. |
| CT | [Continuidad más reciente, sesión 22](../handoffs/SESSION_22_HANDOFF_2026-11-04.md), con fecha de última revisión 2026-11-05; otras continuidades preservan su fotografía histórica, no sustituir este tablero por ellas. |
| PL | [Plan de piloto completo](../assignments/SABORA_FIRST_PILOT_FIVE_BLOCKS_2026-10-29.md), [inventario de preparación](../reviews/SABORA_FIRST_PILOT_READINESS_INVENTORY_2026-10-29.md), [runbook de activación](../runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md) e [inventario de secretos](../security/SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md): planes y evidencias que hay que reevaluar contra la normativa actual. |

**Reglas permanentes:** una sola instalación Sabora; PWA cliente y gestión separadas; ninguna dependencia, intervención o parada de Fleetia ni de otros proyectos del VPS; no tocar Supabase operativo ni el proyecto de directorio, VPS, secretos, contenedores o proveedores reales sin autorización expresa; ningún merge/despliegue por el simple hecho de tener CI verde. Los permisos SQL mínimos, JWT/HMAC, RLS, idempotencia y recuperación son condiciones, nunca obstáculos a sortear.

## 2. Fotografía verificada de partida — 2026-11-05, 09:05 CET (HISTÓRICA)

**Repositorio:** [`jdlc86/CartaViva`](https://github.com/jdlc86/CartaViva). **Rama candidata observada:** `feat/sabora-table-change-final-closure-20261104`; [PR #44 Draft](https://github.com/jdlc86/CartaViva/pull/44) sobre [PR #43 Draft](https://github.com/jdlc86/CartaViva/pull/43). **SHA de implementación realmente inspeccionado:** `2d22e917b888e24e6fdef31a1414d371f6cfe1d3`. Después se creó el commit **solo documental** `c5cdb6e9c53012b815226f026bea07172b406a65`; volver a consultar el HEAD a cada sesión. El contenido de este tablero y los enlaces son documentación, no prueba funcional nueva.

**Resultados del SHA `2d22e917` realmente contrastados en GitHub:**
- [CI consolidado](https://github.com/jdlc86/CartaViva/actions/runs/41980845238): SUCCESS, bloques H6 1/2A/2B PASS.
- [Bootstrap y PG17](https://github.com/jdlc86/CartaViva/actions/runs/41980845224): SUCCESS; logs de PostgreSQL 17 con **51/51** prueba integrada y **4/4** pruebas focalizadas de coste cero. `pnpm test` **1175 PASS, 0 FAIL, 2 SKIP**, builds y gate de configuración.
- [PWA cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41980845128): SUCCESS, **36/36**; sus escenarios de coste cero interceptan respuestas HTTP.
- [PWA gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/41980845129): SUCCESS; fixture HTTP aislado, no prueba de caja final aprobada.
- La cadena de **83 migraciones** figura PASS sobre PG17 efímero según [informe específico](../reviews/SABORA_H6_ZERO_COST_ACCOUNT_LIFECYCLE_2026-11-05.md). Las **dos omisiones** Node son pruebas antiguas de «readiness» de transferencia H6; revisar justificación, no calificarlas como fallos sin reproducir.

**Acreditado en candidato:** A→B diferido y transaccional, cuentas individuales y destino operativo, revisión inmutable F21/R06, agrupación natural de 300 s, outbox/SSE, cocina/sala, concurrencia pedido/efectivo/cierre, nueva política de coste cero implementada con trigger de ocupación; **no** equivale a Stripe sandbox ni a uso operacional del restaurante.

**Hechos de arquitectura confirmados en lectura de código:**
- `apps/api/src/server.mjs` registra solo `/health` y `/ready`; `apps/api/src/api-runtime-config.mjs` solo acepta `health-only`. Las composiciones H3–H6 siguen opt-in. **No existe arranque productivo integral certificado**.
- En `apps/management/src/views/TablesView.tsx` están deshabilitados estado de mesa, emisión/rotación/revocación/impresión QR; `SummaryView.tsx` presenta métricas sin origen; `ImageStudio.tsx` declara generación no disponible.
- En `apps/management/src/catalog-read-model.js` la whitelist fija de categorías `Bebidas/Primeros/Segundos/Postres` rechaza otras; la normativa de categorías de gestión es **dinámica**. Hay una **incompatibilidad de código con requisito aprobado** que requiere corrección integral y regresión. El cliente sí deriva categorías de la proyección; gestión aún no.
- `apps/client/src/App.tsx` tiene una región de anuncios vacía y el integrador `confirmStripePayment` opcional no está suministrado por el bootstrap estándar. La gestión no expone una pantalla definitiva de caja/cierre.
- La PWA gestión tiene `index.html` y Vite, pero en el árbol observado no hay manifiesto/service worker propios; verificar instalación independiente, ámbitos, sesión y no interferencia con cliente.
- La rama candidata está **3813 commits por delante** de `main`, cuya instantánea consultada tenía **30 entradas y ninguna aplicación ni migración**. Se observaron **37 PR abiertos, todos Draft**. Estos valores son fotografía de auditoría, no autorización de merge masivo; revisar la cadena real de ancestros, PR obsoletos y cambios externos antes de consolidar.

## 3. Semántica del tablero (estados y evidencia)

- **PENDIENTE:** trabajo identificado y fundamentado, todavía no ejecutado/comprobado como hito.
- **EN CURSO:** hay trabajo en rama/PR, pero no aceptación integral cerrada.
- **CANDIDATO VALIDADO:** implementación y aceptación del **alcance aislado** verificadas por SHA/CI/entorno. No es producción.
- **BLOQUEADO:** requisito pendiente de decisión aprobada, credencial, servicio externo, aprobación visual o autorización de operación; registrar condición de desbloqueo, no fingir PASS.
- **CERRADO:** todas las condiciones específicas de aceptación cumplidas, evidencia reproducible/independiente y decisión explícita del hito registrada. **Jamás** inferir `CERRADO` de CI 4/4 o de un informe de autor.
- **DESCARTADO:** solo si normativa aprobada lo elimina; explicar decisión y fecha. No borrar filas por obsolescencia.

**Prioridades:** `P0` requisito para candidato/piloto utilizable o seguridad crítica; `P1` funcionalidad normativa de producto o certificación global; `P2` mejora/saneamiento no bloqueante si se demuestra. La prioridad **no cambia** ninguna exigencia normativa. **Responsable:** por asignar por el propietario; no atribuir tareas a Codex u otro agente sin encargo real.

## 4. Hitos integrales para ejecutar (orden lógico; sin fechas inventadas)

| Hito | Dependencia principal | Estado | Puerta de salida obligatoria |
| --- | --- | --- | --- |
| **M1 — Revisión independiente y cierre del candidato H6** | PR #44, contratos NF/H6 | **EN CURSO (auditoría de lectura)** | Prueba integrada nueva del cierre cero en PG17→Fastify→PWA, varios comensales, cuenta positiva en misma visita, cierre con pendiente, sin falsa entrega; decisión sobre evento individual de fin de visita si difiere de cierre de ocupación; revisión económica/SQL, F/R y acta sin bloqueos obsoletos. |
| **M2 — Consolidación segura de GitHub y arranque del restaurante** | M1 + cadena de PR | **PENDIENTE** | Inventario exacto de ancestros/PR, rama de integración revisable sin sobreescritura, bootstrap real opt-in con autenticación y roles mínimos, API/PWA cliente/gestión conectadas sobre PG17 limpio, health/readiness reales, ningún acceso cruzado. No fusionar hasta autorización. |
| **M3 — Gestión operativa integral de mesas, QR y catálogo** | M2 + NF/RF/DV | **PENDIENTE** | Alta/estados/cierre mesa, QR emitir/rotar/revocar/imprimir, categorías configuradas dinámicamente, editor draft→publicación explícita, disponibilidad y extras; PWA cliente/cocina/sala sobre mismo dato, eventos/rollback/seguridad y conformidad visual. |
| **M4 — Economía real de test y caja** | M2–M3 + diseño caja aprobado + test Stripe | **BLOQUEADO parcialmente por aprobación/credenciales** | Stripe test real autorización manual→captura/reconciliación/webhook/reembolso/reintentos, efectivo y cuenta cero, factura/recibo según normativa, caja/cierre aprobados, trazabilidad cuenta y E2E PG17+HTTP+Chromium+Stripe sandbox; sin cargos reales. |
| **M5 — Producto normativo restante y PWA instalables** | M2–M4 + decisiones pendientes | **PENDIENTE/BLOQUEADO por apartados** | Reservas anticipadas, anuncios y comunicaciones, filtros dietéticos y extras, llamada camarero, dashboard e informes, identidad/Passkey, directorio CartaViva y Estudio de imágenes Gemini conforme a sus fuentes; completar y probar cada flujo aprobado por bloques integrales. Resolver decisiones no especificadas antes de implementar. |
| **M6 — Certificación piloto y operación Sabora-only** | M1–M5 + autorización específica | **BLOQUEADO** | Matriz normativa completa con evidencia por requisito, revisión visual humana, pruebas seguridad/recuperación, secretos/DB/Storage/TLS, backup/restore, supervisión, límites de coste e independencia material de Fleetia; expediente GO/NO-GO. El despliegue sigue requiriendo permiso independiente. |

**No convertir M1–M6 en seis pruebas aisladas:** cada hito abarca las capas y escenarios completos; se permiten tests de diagnóstico/seguridad críticos como complemento. Si un subapartado se bloquea por una aprobación externa, cerrar honestamente el **resto de alcance verificado** sin certificar el hito completo.

## 5. Registro de tareas auditable — IDs estables

En cada ejecución añadir **responsable asignado, fecha, rama/PR, SHA, enlace de job/escenario, resultado real y siguiente acción**. La columna «responsable» permanece **SIN ASIGNAR** hasta un encargo específico; nadie puede reclamar trabajo por el estado de esta tabla.

| ID | Prio. | Hito | Tarea / defecto preciso | Estado inicial 05-11 | Cierre verificable |
| --- | --- | --- | --- | --- | --- |
| **CV-001** | P0 | M1 | Revisar SQL `20261105070000_sabora_h6_zero_cost_account_auto_close_candidate.sql`, evidencias 4/4 + 51/51, casos multi-cuenta, fiabilidad del cierre y procedencia `system_zero_cost`. | EN CURSO | Auditoría independiente sin contradicciones, E2E orgánico PG17/HTTP/2 PWA, carreras/reintentos/outbox y no entrega física; SHA y logs. |
| **CV-002** | P0 | M1 | Aclarar si «fin de visita individual» es evento distinto de «mesa/ocupación closed» y cuándo debe activarse autocierre según NF. | BLOQUEADO si la normativa no lo define | Referencias de norma y transiciones reales; aprobación funcional si falta decisión; prueba de ambos eventos aplicables. |
| **CV-003** | P0 | M1 | Reconciliar acta H6 F01–F28/R01–R10 y dos omisiones Node: el informe 04-11 indica coste cero BLOQUEADO pese a aprobación y pruebas 05-11. | PENDIENTE | Cada fila con estado actual, evidencia del **mismo SHA**, límites y aceptación independiente; dos SKIP justificados o cerrados sin saltar seguridad. |
| **CV-004** | P0 | M2 | Inventariar y reconciliar dependencia real de **37 PR Draft** y diferencia frente a `main`, preservando código/decisiones, con estrategia de integración segura. | PENDIENTE | Mapa PR→base/HEAD→funcionalidad→riesgo; PR obsoletos identificados; regresión en rama consolidada; ninguna fusión no autorizada. |
| **CV-005** | P0 | M2 | Montaje operativo H3–H6 desde `health-only`, identidad, pools SQL mínimos, origen, HMAC, SSE/planificador opt-in, lifecycle y readiness. | PENDIENTE | API autenticada arranca en PG17 desechable, dos PWA reales conectadas a la misma sesión; fallos de secretos/roles/DB cierran acceso, health/readiness precisos y CI integral. |
| **CV-006** | P0 | M3 | Gestión completa mesa/QR: crear/editar, estados normados EN_PREPARACION/LISTA/BLOQUEADA, apertura/pausa/cierre según NF, QR revocable/generable/imprimible; no confundir estos ejes de estado. | PENDIENTE | PWA gestión controla el ciclo real, PWA cliente lo respeta, revocación segura, historial intacto, roles/triggers probados en navegador + PG17. |
| **CV-007** | P0 | M3 | Categorías dinámicas y catálogo editable: quitar whitelist rígida de gestión; crear/ordenar/ocultar categorías, draft/publicar, precio 0 €, opciones/extras, alérgenos, agotado/retirado. | PENDIENTE (defecto concreto observado) | Categoría creada por gestión aparece solo cuando corresponde en PWA cliente, precio y selección verificables, publicación e invalidación atómicas, históricos y pruebas visuales. |
| **CV-008** | P0 | M4 | Adaptador Stripe **sandbox real**: autorizar/capturar/reconciliar/invalidar/refund, webhooks firmados, `capture_unknown`, compensación, idempotencia y fallos de red. | BLOQUEADO por credenciales test autorizadas | Evidencia de operaciones proveedor **test reales** y PG17, IDs saneados, cero doble cargo, devolución al pagador correcto. Mocks no cuentan. |
| **CV-009** | P0 | M4 | Flujo PWA gestión **caja/cobro/cierre** con roles, múltiples cuentas, cero y positivo, incidencias y cierre sin fingir entrega. | BLOQUEADO por aceptación de diseño | Decisión visual aprobada y capturas, E2E caja→cuenta→cierre contra PG17, accesibilidad y contabilidad conciliada. |
| **CV-010** | P0 | M6 | Bootstrap/secretos operativos, privilegios SQL, TLS, identidad Passkey/roles, supervisión y parada segura, datos piloto ficticios. | BLOQUEADO por entorno/autorización | Preflight aislado + plan de custodia/rotación, alertas, fallos cerrados, pruebas de parada sin tocar recursos ajenos. |
| **CV-011** | P0 | M6 | Aislamiento material y rollback/backup/restore **exclusivo Sabora**, límites y dependencia de Fleetia. | BLOQUEADO por inspección/autorización de VPS/Supabase | Prueba de reversión y recuperación de Sabora con RTO/RPO definidos, sin reiniciar ni depender de ningún servicio Fleetia; autorización independiente. |
| **CV-012** | P1 | M5 | **Dos PWA instalables** con manifest/scope/service worker propios, seguridad de caché, acceso QR y continuidad de sesión. | PENDIENTE | Instalar por separado sin colisión, sin caché de datos sensibles, offline/online, reconexión y compatibilidad móvil ensayadas. |
| **CV-013** | P1 | M5 | Dashboard, ventas/cobros/saldos/propinas, informes y exportaciones por contrato normativo. | PENDIENTE (vista sin origen) | Consultas autorizadas con cálculos auditables, filtros, importes reales y E2E; no datos ficticios mostrados como reales. |
| **CV-014** | P1 | M5 | Reservas anticipadas de platos y comunicaciones/anuncios programados, incl. carrusel cliente y llamada camarero. | PENDIENTE; decisiones RF por cerrar | Decisiones pendientes identificadas/aprobadas; servidor/gestión/cliente, límites, estados, eventos y pruebas de recorrido completo. |
| **CV-015** | P1 | M5 | Estudio de imágenes Google Gemini: original inmutable, derivadas privadas, cuotas/costes, revisión, aprobación y publicación explícita. | BLOQUEADO por proveedor/credenciales/coste/autorización | Integración backend real autorizada, seguridad Storage, flujo editor, trazabilidad, pruebas de costes y aprobación visual; no generación ficticia. |
| **CV-016** | P1 | M5/M6 | Directorio CartaViva separado: resolvedor público, alta con titularidad de dominio y límites antiabuso según contrato; sin datos operativos. | PENDIENTE | Contrato normativo, seguridad y prueba en entorno separado; operación real sujeta a autorización. |
| **CV-017** | P1 | M6 | Validación humana diseño premium V3 y accesibilidad de cliente/gestión/caja con estado aprobado/pendiente; fotos con licencia. | BLOQUEADO por aprobaciones | Capturas reales y matriz por viewport/estado aprobadas; Playwright/axe y test de flujos; ningún baseline inventado. |
| **CV-018** | P1 | M6 | Cierre final de piloto: normas→rutas/migraciones→tests→SHA/PR/CI→validación→autorizaciones. | PENDIENTE | Acta integral auditada, cero bloqueos P0 sin excepción aprobada, riesgos y plan de operación documentados; dictamen explícito GO/NO-GO técnico sin desplegar. |

**Dependencias críticas:** CV-001/002/003 → CV-004/005 → CV-006/007 → CV-008/009 → CV-010/011/017/018. CV-012–016 deben planificarse según el objetivo **real del siguiente piloto** y las decisiones normativas; no ocultarlas ni prometer una primera versión completa sin ellas. El propietario decide prioridades y bloqueos de producto, no los tests.

## 6. Reglas de aceptación y operación del seguimiento

1. **Arranque de una sesión:** leer este documento y el último handoff; verificar cabeza, base y estado GitHub de cada PR concernido; revisar cambios en normativa NF/RF/DV/IN; consultar código/migraciones y CI. Nunca copiar los SHAs históricos como «actuales».
2. **Inicio de un hito:** elegir una unidad funcional completa, documentar precondiciones, actores, recorrido, dependencias, flujos y criterios de aceptación aprobados. La prioridad de P0/P1 no autoriza nuevas decisiones normativas.
3. **Evidencia al cerrar:** anotar la distinción `implementado` / `pruebas realmente ejecutadas` / `funcionalidad validada` / `aún bloqueada`; commit, rama/PR, CI exacto, versión PostgreSQL, prueba integral y capturas visuales cuando apliquen. No cerrar una fila con solo un mock, una prueba aislada ni `pnpm build`.
4. **Transiciones de estado:** mover a `CERRADO` solo si cumple la puerta de salida **completa**; si falta proveedor o aprobación, queda `BLOQUEADO`. Conservar notas históricas si se corrige un fallo. Nunca borrar defectos para mejorar el porcentaje.
5. **Actualización documental:** **este tablero es el índice vivo**. Actualizarlo tras hitos validados y actualizar el handoff más reciente con resumen/link y SHAs; actualizar matrices/actas si corresponde. Modificar normativas exclusivamente al aprobarse una nueva regla. No reescribir historiales de sesiones previas.
6. **Revisión independiente:** verificar diffs de seguridad, ergonomía de gestión, errores 409/503, ACL/RLS, cajas, autorización económica, eventos, locks de PG17 y coherencia con los flujos. El autor del código no certifica solo su propio trabajo.
7. **Seguridad:** solo ramas/PR/Actions en `jdlc86/CartaViva`; sin merges, despliegues, reinicios, migraciones operativas ni acceso a VPS/Fleetia/otros proyectos sin autorización expresa. Despliegues futuros deberán ser completamente independientes de Fleetia.
8. **Compatibilidad documental:** todo archivo `.md` nuevo o editado bajo `docs/continuity/` y `docs/handoffs/` ha de incluir un enlace relativo a `../tracking/SABORA_LIVE_PROJECT_TRACKER.md` **sin omitir los enlaces a los requisitos normativos**. Los handoffs antiguos son fotografías y no se actualizan sus estados históricos.

## 7. Plantilla de registro de hito (copiar solo al cerrar)

```text
Fecha y hito / IDs: ...
Estado: CANDIDATO VALIDADO | BLOQUEADO | CERRADO (motivo)
Alcance normativo y diseño aprobado (rutas, apartados): ...
Implementado: ...
Pruebas ejecutadas de verdad (PG17/API/Chromium/Stripe/etc.): ...
Validación observada y límites; evidencia por fila: ...
Rama, PR Draft, SHA, 4 workflows/jobs/artefactos: ...
Incidencias corregidas y regresión completa: ...
Bloqueos y aprobación externa pendiente: ...
Siguiente hito integral y responsables asignados: ...
Merge/despliegue/Supabase/VPS/Fleetia: SIN AUTORIZACIÓN; no ejecutado
```

## 8. Bitácora mínima de decisiones y cambios del tablero

| Fecha | Cambio / fundamento | Referencia |
| --- | --- | --- |
| 2026-11-05 | Se crea el seguimiento único a partir de revisión de PR #43/#44, normas y árbol completo. Se distinguen 18 tareas, seis hitos y bloqueos, sin afirmar porcentaje de avance. Política de cero ya aprobada e implementada en candidato; revisar cierre de visita individual. | PR #44 SHA `2d22e917`, [informe coste cero](../reviews/SABORA_H6_ZERO_COST_ACCOUNT_LIFECYCLE_2026-11-05.md), [handoff 22](../handoffs/SESSION_22_HANDOFF_2026-11-04.md). |
| 2026-11-05 | Se establece referencia universal al tablero desde **todos los archivos de continuidad existentes** en `docs/continuity/` y `docs/handoffs/`; su contenido histórico permanece intacto. | Inspección de árbol GitHub y actualización documental de estos archivos. |

**Última decisión global:** **NO-GO de producción**. Candidato H6 técnicamente avanzado y pruebas aisladas fuertes, pero faltan ciclo operativo, pagos Stripe reales de test, gestión visual completa, seguridad/infraestructura y aceptación final. El seguimiento no concede permisos de operación.
