# Sabora — CV-014 comunicaciones programadas: candidato de integración funcional (08-11-2026)

> **INFORME DE EVIDENCIAS / CANDIDATO, NO NORMATIVA NI ACEPTACIÓN OPERATIVA.** Un restaurante. No equivale al cierre total de CV-014 (reservas y llamada a sala siguen pendientes), a aceptación estética, ni a activación. Fuente normativa vinculante: [RF — Comunicaciones del restaurante y aclaración de rotación](../REQUISITOS_FUNCIONALES.md), [DV visual](../DESIGN_SYSTEM_CONTRACT.md), [inicio aprobado en composición](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md) y [contrato de coherencia](../architecture/SABORA_CONTRACT_CONSISTENCY_V1.md).

## Defecto original y objetivo

La PWA cliente conservaba una región de anuncios `hidden` y Gestión carecía de editor/ruta; el HTML histórico sí hacía una demostración pero no era producción ni backend. El objetivo de CV-014 en esta candidatura es que **el módulo sea utilizable de extremo a extremo**: un administrador crea y programa un anuncio, lo guarda en borrador, lo publica conscientemente, la API solo entrega anuncios vigentes, el cliente actualiza sin polling y abre el detalle opcional, y administración pausa/reanuda/retira con auditoría real. Los requisitos visuales de refinamiento y aprobación exacta no se dan por cumplidos.

## Implementación del candidato — PR #51 Draft

- [Rama candidata](https://github.com/jdlc86/CartaViva/pull/51): `feat/sabora-cv014-communications-full-flow-20261108`, base PR #50 Draft, ninguna fusión.
- `supabase/migrations/20261108070000_sabora_m5_communications_candidate.sql`: propietario/superficies de ejecución NOLOGIN aislados, tres tablas FORCE RLS privadas, snapshots de borrador/publicación, solicitud idempotente y auditoría inmutable; SQL de publicación/pausa/reactivación/retirada y consulta pública que filtra fecha, día ISO, franja local y zona IANA. NOTIFY después del commit; cálculo de próxima transición. Se reemplaza el verificador HMAC M3 conservando validación de roles, hashes, expiración y permisos, y ampliando **solo** `comms.manage` hasta un cuerpo firmado limitado a 200 KiB para soportar fotografía opcional. No hay permisos de tabla al navegador ni a roles operativos.
- `apps/api/src/m5-communications.mjs` + integración opcional en `m2-restaurant-candidate.mjs`: endpoints públicos GET de proyección y SSE; GET/POST administrativos con rol autorizado y firmador, límites de entrada, acciones de revisión, gestión de errores y cliente LISTEN con temporizador de vencimiento **de una sola ejecución**, sin polling periódico de DB o red.
- `apps/management/src/views/{ConfigurationView,CommunicationsView}.tsx`, tipos y gateway autenticado: formulario con título, mensaje y formato enriquecido básico acotado, emojis rápidos, imagen propia/licenciada y previsualización; prioridad ALTA/BAJA, programación una fecha/cada día/días múltiples, inicio/fin/horario/zona, borrador, publicación explícita, edición, pausa, reactivación y retirada.
- `apps/client/src/components/CommunicationsBar.tsx` y `App.tsx`: sustitución del bloque oculto por franja, rotación circular (mayor tiempo ALTA y sin excluir BAJA), preferencias de movimiento reducido, desaparición si no hay activos, detalle con fotografía opcional y texto enriquecido limitado renderizado como componentes seguros, no como HTML.
- Proxies Vite **solo de CI local loopback** para dos PWAs reales contra un Fastify/PG17 efímero. No modifican los recursos operativos ni exponen credenciales productivas.

## Evidencia conocida, separada por revisión

El SHA `929270485e91200741aac3fbfaf39f8e859f365e` tuvo:
- [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42460735464) **SUCCESS**: cadena de migraciones real y `scripts/ci/catalog-postgres17-node-driver-smoke.sh`, con escenario CV-014 que atraviesa identidades SQL restringidas + firma HMAC + Fastify + ambas PWA Chromium + publicación, programación, eventos, imagen e idempotencia.
- [PWA cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42460735384) **SUCCESS**; [PWA gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42460735363) **SUCCESS**; [dos PWA instalables](https://github.com/jdlc86/CartaViva/actions/runs/42460735403) **SUCCESS**; [puerta de interfaz funcional](https://github.com/jdlc86/CartaViva/actions/runs/42460735415) **SUCCESS**.
- [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42460735385) en ejecución en el momento del primer registro de este informe; debe consultarse su estado final. **No extrapolar esas pruebas automáticamente a commits posteriores del PR.**

Las pruebas de contrato específicas `tests/cv014-communications-contract.test.mjs` cubren límites de contenido, roles, HTTP, ciclo de eventos sin intervalos, ampliación exclusiva de tamaño de firma de comunicaciones y rechazo de controles no autorizados. El escenario `scripts/ci/cv014-communications-postgres17.test.mjs` es la **prueba integradora principal**, no una maqueta: usa PostgreSQL 17 desechable, backend real en loopback, reacciones de las PWA y almacenamiento durable; guarda capturas para artifactualización en CI.

## Criterios de cierre / limitaciones que no se deben ocultar

- El último SHA del PR puede diferir del SHA probado arriba: consultar las seis ejecuciones **del mismo último SHA** antes de declarar nuevamente 5/5 o 6/6; corregir fallos y repetir la prueba principal, no cambiar pruebas para ocultarlos.
- Solo se admite una imagen propia/licenciada y optimizada, con tipo verificado por firma inicial; no se realiza un análisis forense de contenido multimedia. No existen fotografías de catálogo aprobadas ni baseline exacta del diseño; **el acabado visual y F28/R09 humano siguen pendientes**.
- No existe certificación de experiencia real en dispositivos Android/iOS ni operación restaurable. Runtime principal sigue `health-only`; composición de comunicaciones únicamente mediante opt-in y SQL logins restringidos.
- No se ha ejecutado una batería específica de transición DST con reloj virtual de PostgreSQL ni carga masiva de anuncios. Son puntos a auditar en aceptación final; no atribuirles resultados no observados.
- M5 queda **parcial** por reservas anticipadas, llamada a camarero y otras funciones fuera de este subalcance. M4 Stripe sandbox, M6 y producción siguen **NO-GO**.
- Nunca hubo autorización de merge, desplegar, migrar Supabase operativo, tocar secretos/proveedores reales o intervenir en VPS/Fleetia. Solo hay cambios versionados y ejecutados en CI efímero.

## Seguimiento

[Tablero vivo — M5/CV-014](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y [continuidad de sesión 29](../handoffs/SESSION_29_HANDOFF_2026-11-07.md). La normativa tiene precedencia sobre el presente informe y ninguna decisión estética pendiente se rellena aquí por inferencia.

## Cierre de regresión B3 del candidato — evidencia del 08-11-2026

La última revisión **funcionalmente probada** es `41d2451409fbd7f9c23041a285357fcff38d1cef` y muestra **6/6 GitHub Actions SUCCESS** en un mismo SHA: [Bootstrap PG17/B3](https://github.com/jdlc86/CartaViva/actions/runs/42468335478), [H6 consolidado](https://github.com/jdlc86/CartaViva/actions/runs/42468335561), [Chromium cliente](https://github.com/jdlc86/CartaViva/actions/runs/42468335464), [Chromium gestión](https://github.com/jdlc86/CartaViva/actions/runs/42468335655), [PWA independientes](https://github.com/jdlc86/CartaViva/actions/runs/42468335480), [cobertura funcional](https://github.com/jdlc86/CartaViva/actions/runs/42468335460). El escenario B3 real tiene **51/51 PASS** (`ok 49` para la travesía completa cliente A/camarero/economía B).

En `ba3b2437` se había producido un timeout intermitente buscando `Cesta: 1` en B3, aunque la misma prueba también había pasado en una revisión anterior. La captura/diagnóstico del fallo añadida en `f49f1ea7` mantiene la aserción original y ese SHA pasó nuevamente la batería [Bootstrap #42467419305](https://github.com/jdlc86/CartaViva/actions/runs/42467419305). Se corrigió además un defecto observable: al ejecutarse la PWA cliente frente a una composición heredada sin CV-014, la banda intentaba abrir/reintentar SSE aunque la API pública devolviese 404. El cliente ahora evita ese canal **solo para API inexistente (404)**; sigue intentando recuperarse de fallos transitorios. Los tests del cliente y de B3 comprueban 404 sin SSE, con cesta y selección persistente. **No se ha demostrado que el SSE fuese la causa exacta del timeout histórico**; las dos rondas integrales posteriores sí acreditan funcionamiento y compatibilidad del candidato.

**No se ha obtenido aceptación humana visual F28/R09 ni validación operativa real.** M5/CV-014 total, M4 Stripe sandbox, M6 y producción siguen abiertos; el PR permanece Draft sin merge ni despliegue. Los commits `[skip ci]` documentales posteriores no heredan CI como si lo hubieran ejecutado.

## Análisis causal posterior del B3 no determinista (08-11-2026)

La conclusión previa de este informe («causa exacta aún sin demostrar») se **actualiza con evidencias nuevas**, no se elimina para conservar cronología. Tras descargar los artefactos del [Bootstrap fallido #42461987932](https://github.com/jdlc86/CartaViva/actions/runs/42461987932) y del [Bootstrap correcto #42467419305](https://github.com/jdlc86/CartaViva/actions/runs/42467419305), la captura `management-published.png` muestra que en la ejecución fallida «Brunch de cortesía M3» heredó extras **Trufa**, grupo obligatorio **Salsa**, descuento 20 % y alérgeno Leche del artículo «Bocado M3». En el caso exitoso estaban vacíos. `changeFromCard` en cliente **abre detalle, no cesta**, si el artículo tiene opciones o extras; esto da una explicación directa del `getByRole(... Cesta: 1)` no encontrado.

La limpieza del editor administrativo se difería a un `useEffect` tras `setNewItem(true)`; el artículo nuevo podía ser interactuado con datos de edición anteriores. Cambios candidatos `f3d5fef9` (limpieza atómica y sincrónica al pulsar «Nuevo plato», sin rehidratación mientras se crea) y `24b0f8ee` (aserciones en el mismo E2E B3 sobre formulario limpio y snapshot publicado vacío de modificadores). **La reproducción prueba la fuga de configuración, no permite asignar una microtarea precisa del scheduler React original.** No afirmar que el SSE originó este fallo. **Validación CI de los nuevos commits aún sin concluir al redactar.**

Se conservan la puerta PostgreSQL 17, roles reales, ruta administración→cliente, autorización económica y el test largo completo, sin cambiar su timeout. Referencias: [continuidad §13](../handoffs/SESSION_29_HANDOFF_2026-11-07.md) y [tablero §49](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
