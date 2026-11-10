# Control de completitud funcional e interfaz; aprobación visual al final (07-11-2026)

> **Procedimiento de desarrollo y trazabilidad, no norma de producto ni nueva decisión estética.** Fuentes vinculantes: [RF](../REQUISITOS_FUNCIONALES.md), [NF](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [DV](../DESIGN_SYSTEM_CONTRACT.md), [inicio aprobado en composición](screens/SABORA_HOME_IMPLEMENTATION_V1.md) y [auditoría de estilo](APPROVED_VISUAL_STYLE_AUDIT_V1.md). Prioridad expresa actual del propietario: **funcionalidad operable con interfaz desde su implementación; refinamiento visual definitivo al final**.

## 1. Problema real y dictamen CV-014

Se confunden tres artefactos diferentes: un prototipo HTML de anuncios creado en 2026-10-18, un requisito funcional RF aprobado y una PWA React realmente operable. El HTML de demostración tiene anuncios y rotación; **no** es el frontend actual. En la rama base auditada antes de PR #51, `apps/client/src/App.tsx` conservaba `announcement-region` con `hidden`, `apps/management/src/main.tsx` carecía de Comunicaciones y no existía prueba integral. **PR #51 implementa ahora ese subalcance como candidato técnico** y [Bootstrap PG17 del SHA `92927048`](https://github.com/jdlc86/CartaViva/actions/runs/42460735464) pasó el recorrido PG17 + Fastify + ambas PWA/Chromium; no extender dicho resultado a cambios posteriores. CV-014 en su conjunto sigue abierto (reservas anticipadas y llamada camarero), y la estética/piloto siguen sin aceptación.

La decisión histórica de composición (campana y carrusel sobre «Nuestra carta») **sí** se preserva; iconos, fotos y captura exacta no están aprobados. No forzar iconos de demostración ni bloquear el desarrollo de un control funcional por no existir todavía PNG final.

## 2. Primera puerta — soporte gráfico funcional obligatorio ahora

Se implementa `docs/design/FUNCTIONAL_UI_COVERAGE.json` y su control `scripts/ci/functional-ui-coverage-gate.mjs`, que se ejecuta en PR desde el workflow `Sabora functional UI coverage and deferred visual acceptance / functional-ui-gate`.

Cada módulo inventariado contiene estado, superficies de cliente/gestión, entrada visible en código producto, frontera API, escenario de prueba integrador y restricciones. Para registrar `CANDIDATO_TECNICO` se exige que el módulo tenga **entrada gráfica en todas sus superficies declaradas**, ruta de servidor y evidencia de navegador y PostgreSQL. Para registrar `FUNCIONALMENTE_VALIDADO` se exige además integración de gestión cuando corresponda y evidencia atribuible. Un módulo `PENDIENTE` conserva el bloqueo explícito; la comprobación normal permite seguir desarrollando otros hitos sin fingir que está cerrado. El modo `--release` **rechaza cualquier módulo pendiente**.

El gate de texto **solo prueba coherencia y presencia de referencias**; no demuestra que los botones funcionen ni sustituye una ejecución real PG17/Fastify/JWT/HMAC/Chromium. La prueba integradora de cada hito debe **interactuar desde la PWA** (crear/publicar/consultar/actuar), comprobar persistencia/permisos/eventos y estados de error, no limitarse a comprobar que aparece un botón. GitHub Actions que prueben el SHA exacto y su resultado verificable siguen siendo necesarios.

En todas las funcionalidades nuevas: documentar antes de cerrar el hito qué actor puede usarlas, desde qué sección, qué botón o acción inicia el flujo, qué resultado recibe, los casos vacío/error/caducidad y qué prueba atraviesa frontend→API→SQL→frontend. Si falta una sola cara requerida, **no marcar IMPLEMENTADO/VALIDADO** aunque backend y SQL estén escritos. No sustituir una función con un botón inerte o una simulación que simule éxito.

### Inventario de deuda expresamente visible

- `CV-014-comunicaciones-anuncios`: **CANDIDATO_TECNICO PR #51**, interfaz cliente y gestión + servidor, roles + PG17, prueba integradora Chromium del SHA `92927048`; controles y pruebas revisados en el SHA real del PR. Faltan aceptación humana y puerta final, sin afirmación de producción.
- `CV-014-reservas-anticipadas`: PENDIENTE de decisiones normativas abiertas e integración.
- `CV-014-llamada-camarero`: PENDIENTE de recorrido compartido de sala y UI.
- M4 Stripe sandbox y aprobaciones humanas siguen bloqueadas según tablero; el registro de cobertura no los declara resueltos.

## 3. Segunda puerta — estética final (aplazada, no eliminada)

El validador `scripts/ci/visual-contract-gate.mjs` y su prueba anterior **se conservan**, pero no deben bloquear todas las PR de interfaz funcional antes de existir capturas maestras exactas. La aceptación final se invoca **de forma separada** mediante `visual-final-acceptance-gate`; exige primero `functional-ui-coverage-gate.mjs --release` sin módulos pendientes, después PNG baselines aprobadas en `APPROVAL_REGISTER.json` **antes de la PR**, SHA256, capturas Chromium de la misma revisión y declaración personal inequívoca del propietario. Un agente nunca firma en su nombre.

Composición, dirección aprobada, legibilidad, semántica, estados y accesibilidad **se respetan ahora**. Tipografía definitiva, recursos fotográficos licenciados, ajuste de iconos, composición pixel-perfect, baselines finales y aceptación humana se revisan en la fase visual. **No modificar la normativa, crear aprobaciones inventadas ni tomar el HTML provisional como fuente visual definitiva**.

## 4. Límites de aplicación y protección GitHub

Crear el workflow/CI da verificación técnica, **no** protección obligatoria de fusión mientras no se configure un ruleset/branch protection sobre cada rama de destino. El check requerido inmediato debería ser `functional-ui-gate`; la puerta `visual-final-acceptance-gate` se exige en la candidatura final M6, después de cerrar los pendientes. Configurar protección y bypass necesita decisión/gestión del propietario; no declarar que ya existe.

**Sin cambios de producción, VPS, Fleetia, Supabase operativo, Stripe externo o merges** derivados de este control. Cada hito completo actualiza [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y [continuidad de sesión 29](../handoffs/SESSION_29_HANDOFF_2026-11-07.md) con estado probado por SHA; pruebas aisladas sólo por diagnóstico o requisito crítico.
