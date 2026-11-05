# Sabora — plan e inventario de integración M2 (CV-004/CV-005)

Fecha de comprobación: 2026-11-05. Estado: plan previo a implementación. Este documento no es normativo, no autoriza despliegue ni modifica la matriz F01–F28/R01–R10.

## Base GitHub comprobada

GitHub presenta **38 PR abiertos, todos Draft**. La integración M2 parte de `d87dd6ac005554b7373370ce452f235ca78c1a56`, HEAD comprobado del PR #45, en la rama propia `integration/sabora-session23-m2-bootstrap-20261105`.

| PR | Base → HEAD comprobado | Capacidad y solapamiento | Riesgo / decisión M2 |
| --- | --- | --- | --- |
| #40 | `feat/sabora-staff-directory-rls-20261028` → `03e874df` | Consolidación y gates previos | Ancestro histórico; no reabrir ni fusionar. |
| #41 | `integration/sabora-activation-readiness-20261028` → `cc40543d` | Corrección de replay H6 | Ancestro comprobado de #42; funcionalmente absorbido. |
| #42 | `integration/sabora-activation-readiness-20261028` → `d0aba892` | Refactor raíz A→B | Ancestro comprobado de #43; conservar mediante la cadena. |
| #43 | `integration/sabora-h6-end-to-end-pilot-20261030` → `79092962` | Destino operativo y recogida H6 | Ancestro comprobado de #44. |
| #44 | `integration/sabora-h6-b2-delivery-board-contract-20261031` → `43a8acaf` | Revisión correctiva, cuentas de coste cero y documentación posterior | #45 contiene los 16 commits funcionales/documentales anteriores a `43a8acaf`. El único commit no ancestro es una revisión documental anterior a la aceptación integrada de #45; no se trasplanta ni se reescribe. |
| #45 | `feat/sabora-table-change-final-closure-20261104` → `d87dd6ac` | Aceptación multicomensal, conciliación F/R y encargo M2/M3 | Base elegida. Es la evidencia candidata más reciente; M1 permanece abierto y producción NO-GO. |

La relación comprobada es #41 ⊂ #42 ⊂ #43 ⊂ #44. Entre los HEAD actuales #44 y #45 existe una divergencia documental de un commit en #44 y trece commits propios en #45; no existe divergencia de código funcional de aplicación que deba fusionarse para M2. Los PR históricos apilados continúan abiertos por decisión del propietario; M2 no los cierra ni cambia sus bases.

## Unidad integral M2

### Capacidades y actores

- Cliente: registro, cookie segura, sesión/revocación, QR V1, visita, catálogo publicado, cotización, confirmación/replay, solicitud A→B, revisiones y SSE.
- Personal: JWT firmado localmente, pertenencia SQL vigente, cola y decisión A→B, cocina, sala, incidencias, recogida y cierre económico permitido por contrato.
- Sistema: cuenta/rondas, agrupación y despacho durable opt-in, outbox/SSE, recuperación de conexión y cierre seguro de recursos.
- SQL: logins físicos `NOINHERIT` separados por capacidad; cada login solo puede hacer `SET ROLE` a un rol sin login con una lista exacta de RPC. Sin acceso directo a tablas/secuencias, `BYPASSRLS`, creación o escalada.

### Recorrido y fronteras

```text
PWA cliente → Fastify candidato opt-in → registro/sesión/QR/visita/catálogo
           → confirmación H6 normal → cuenta/ronda/outbox
           → solicitud A→B ───────────────┐
                                          ↓
PWA gestión → JWT + pertenencia SQL → decisión de camarero
                                          ↓
PWA cliente → confirmación en B → writer F12 sellado → misma cuenta/historia
           → cocina/sala/revisión/SSE → efectivo/cierre o coste cero válido
           → replay/logout/revocación/reconexión
```

El corte candidato seleccionará `confirm_customer_round_h6_transfer_integration_candidate` mediante un writer exclusivo. El lector económico, las solicitudes F12, decisiones, cola, H4, proveedor H6 y operaciones H6 permanecerán en principales distintos. `apps/api/src/server.mjs` y `api-runtime-config.mjs` seguirán en `health-only`.

### Aceptación reutilizada y nueva

- Referencias centrales: F12/R08 para el corte A→B, F21/R06 para revisión/despacho, F20/R03–R05 solo en el alcance económico local ya autorizado, R01/R02/R06/R07 para consistencia, eventos e idempotencia, y R10 para la regresión del mismo SHA.
- Los dos `test.skip` se reemplazarán por invariantes sobre el entrypoint realmente seleccionado: cuenta y concesión antes de persistir; consumo único dentro de la transacción. La función H6 original quedará como negativa de aislamiento, no como evidencia de transferencia.
- Un único banco PostgreSQL 17 limpio recorrerá Fastify y las dos PWA Chromium. Las negativas cubrirán login/rol/grant extra, JWT revocado, sesión/QR revocados, manipulación de ámbito, replay y rollback.
- Se ejecutarán pruebas focalizadas solo al diagnosticar un defecto. La puerta final será una ejecución integral PG17/Chromium, seguida una vez por `npm run check`; solo se repetirá aquello que falle.

### Criterio de salida

M2 solo se marcará candidato validado si arranque, readiness, parada, recorrido continuo y negativas pasan en el mismo SHA y GitHub Actions queda satisfactorio. Stripe de red, entrega física, pantalla definitiva de caja/cierre, despliegue y producción permanecen fuera de esta aceptación.

M3 no comienza hasta publicar y revisar el resultado de esta puerta. Si una dependencia normativa o visual impide el recorrido, M2 se documentará parcial sin simular la capacidad faltante.
