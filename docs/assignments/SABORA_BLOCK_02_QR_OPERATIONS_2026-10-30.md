# Sabora — Bloque 2 de 5: recorrido QR y operación de sala, aceptación completa

Fecha: 2026-10-30. Estado: **PENDIENTE DE IMPLEMENTACIÓN Y CERTIFICACIÓN**. Rama de trabajo: `integration/sabora-activation-readiness-20261028`; PR #40 Draft.

## Fuente de verdad y límites

Aplicar exclusivamente los contratos normativos vigentes de `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`, `docs/architecture/SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.md`, `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/design/DESIGN_REQUIREMENTS_V1.md` y los contratos normativos específicos de H3/H4/H6. Este encargo no crea decisiones nuevas. No reabrir el cierre aislado del Bloque 1, documentado en `docs/reviews/SABORA_BLOCK_01_FULL_STACK_CLOSURE_2026-10-30.md`.

Sin merge, despliegue, consumo facturable, acceso a Supabase operativo ni intervención en VPS/Fleetia. Únicamente PG17 desechable y listeners loopback en CI.

## Entrega indivisible

1. **QR, visita y carta**: navegación PWA cliente real con QR V1 revocable, identidad y cookie HttpOnly, mesa correcta, catálogo y agotados, visita autorizada, cotización de precios del servidor. Probar QR revocado/rotado, visita expirada y pérdida de sesión sin fuga de datos.
2. **Comanda y agrupación**: confirmar múltiples líneas con la misma clave de idempotencia; comprobar ventana de 300 s y semántica `first/grouped/late` mediante reloj controlado o persistencia temporal aislada, sin manipular el reloj global ni inventar resultados. Probar reintento ambiguo, confirmación paralela, conflicto de clave y rollback real.
3. **Cocina y sala**: usar las dos PWA reales con JWT/JWKS y roles SQL restringidos sobre el **mismo pedido**. Estados `confirmed → preparing → ready → picked_up`, notificación durable, recogida sin duplicidad, cancelación/corrección conforme a contrato, historial y separación de roles. Cliente no ve estados operativos.
4. **Avisos y desconexión**: comprobar SSE/eventos autorizados, reconexión, cursor/re-sincronización, revocación durante conexión, fallos de red, offline sin falsas confirmaciones y ausencia de polling periódico. No prometer entrega de avisos sin evidencia.
5. **Conformidad visual**: Chromium móvil/escritorio de ambas PWA, diseño aprobado, Axe, ausencia de overflow y capturas de los estados críticos; conservar artefactos en CI aun ante fallo.

## Gates para PASS

- Pruebas Node, API, PG17 real, navegador Chromium y gestión completas; ejecutar el flujo íntegro en una única factoría opt-in y seis roles restringidos.
- Evidencia de casos negativos, agrupación tardía, reconexión de avisos y transiciones de sala, sin mocks de negocio en los puntos certificados.
- Cuatro GitHub Actions SUCCESS en el SHA final, con esperas por shell, corrección de fallos y reejecución.
- Informe de cierre `docs/reviews/SABORA_BLOCK_02_QR_OPERATIONS_CLOSURE_2026-10-30.md` con matriz norma→código→prueba→SHA y distinción PASS/BLOCKED; actualización de este seguimiento y comentario en PR #40.
- El bloque no puede marcarse PASS si quedan pendientes de evidencia los casos `late`, SSE/reconexión, offline o notificaciones. El cierre técnico no implica GO de producción.

## Estado de partida verificado

Bloque 1: PASS aislado, SHA `e3d17db469cfcec76280be49268dd0c3d0f38bab`, CI 4/4 SUCCESS. Ya existen PWA cliente y gestión reales en Chromium, Fastify H3/H4 y PG17 aislado; el Bloque 2 amplía la cobertura a escenarios normativos completos y resiliencia, sin duplicar el trabajo certificado.

## Evidencia incorporada — agrupación tardía PostgreSQL 17 (30-oct)

SHA `6fab504e82f98d3b3fb50e541eaf74883235f8a6`: ampliada `scripts/ci/customer-production-postgres17.test.mjs` para probar `late` con el **mismo flujo H3 real**, sin simular resultado ni cambiar el reloj global. Se envejece exclusivamente `sabora.dining_tables.first_confirmed_at` de la mesa de prueba a 301 segundos antes de la confirmación de una cotización que requiere aceptación explícita por cambio de precio. Se verifica que el nuevo pedido persistido tiene `grouping='late'`; su repetición idempotente conserva el mismo `orderId` y no altera la clasificación. Se complementan los casos `first` y `grouped` ya ejercitados por el test.

**4/4 workflows SUCCESS:** CI `41008652051`, bootstrap `41008652054`, cliente `41008652175`, gestión `41008652191`. Esta evidencia cierra el subcaso de agrupación tardía, **no el Bloque 2 completo**: quedan por certificar reconexión SSE, offline, notificaciones y resto de casos de aceptación exigidos arriba. No hay GO ni despliegue.
