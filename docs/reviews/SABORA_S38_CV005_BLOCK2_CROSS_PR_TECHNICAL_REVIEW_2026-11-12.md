# Sabora S38 — revisión técnica cruzada CV-005 (#57) ↔ activación Bloque 2 (#58)

**Fecha:** 2026-11-12. **Naturaleza:** expediente técnico de código; **NO** es revisión independiente de DBA/seguridad, conformidad visual, autorización de merge, instalación ni GO operativo. Únicamente `jdlc86/CartaViva`; ningún acceso al VPS, Fleetia, otros proyectos, o DDL/secretos de Supabase.

## 1. Candidaturas reales y alcance comprobado

| Ítem | Estado e implicación |
| --- | --- |
| [PR #57 — CV-005](https://github.com/jdlc86/CartaViva/pull/57) | Draft. SHA de referencia `9c943e5b6ae2fa39e5abd18fc604688aa5689e5d`; 59 migraciones SQL modificadas, 99 en la cadena, más contratos/CI. PG17 no-superuser: [99/99 + 12/12 en laboratorio](https://github.com/jdlc86/CartaViva/actions/runs/43217686791). Opción A del titular para el DBA administrativo **no equivale** a integración normativa o instalación. Descripción pública del PR desactualizada: **hay 59 SQL modificadas**, no cero. |
| [PR #58 — Bloque 2](https://github.com/jdlc86/CartaViva/pull/58) | Draft, construido desde `main`; base `49420b2c9515fe83659d4e4dd463c8f8d4b6de7d`. En el corte de revisión original `b825b78e72fb501fee1521793f988dac0641e9bc`: [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/43240760450), [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/43240760447), [UI](https://github.com/jdlc86/CartaViva/actions/runs/43240760486) `success`. Se han añadido **correcciones posteriores** a ese SHA: no heredar sus PASS; exigir nuevamente CI sobre el HEAD final. |
| Colisión de archivos | Comparación de rutas cambiadas de ambos PR contra `main` a fecha del examen: **0 rutas coincidentes**. Esto facilita integración secuencial, **no** demuestra compatibilidad funcional/SQL ni ausencia de conflictos semánticos. |
| Integración de datos | #58 prueba en CI el SQL de su base `main`, mientras #57 modifica el contenido de 59 versiones históricas de la misma cadena de 99. **No hay aún una batería demostrada en un único SHA que combine los SQL finales de #57 con la API final de #58.** Evitar afirmar que ambas ramas han sido validadas juntas. |

## 2. Hallazgos de seguridad funcional y acciones de cierre en el mismo PR #58

### R1 — Exposición HTTP anterior a readiness: bloqueante, corregido en candidato

El runtime inicial publicaba el socket HTTP mediante `candidate.app.listen` **antes** de ejecutar `candidate.app.inject('/ready')`. Aunque la fábrica completaba su primer preflight SQL, en un fallo posterior de ready las rutas existían brevemente.

**Corrección:** ahora JWKS y fábrica SQL primero, luego `app.inject('/ready')=200` con el socket **cerrado** y únicamente después `app.listen`. Prueba de concurrencia determinista en `tests/operational-runtime.test.mjs`: un probe pendiente o 503 jamás ejecuta `listen`; error cierra recursos una sola vez. El E2E existente de PG17 usa el mismo `startOperationalM3Runtime`.

### R2 — Dos configuraciones de red no vinculadas: bloqueante, corregido en candidato

Antes, el manifiesto del API y el sidecar egress se admitían por separado, sin asegurar que apuntaban a idéntico host/puerto/protocolo. Además, los fixtures de 22 logins proponían **22 puertos de salida diferentes al mismo destino SQL**, pero la política del gateway rechaza destinos duplicados.

**Corrección:** `validateOperationalEgressBinding` exige igualdad exacta de cada tuple `listenPort/serverName/destinationPort/protocol` SQL/JWKS; todos los logins del mismo destino PostgreSQL pueden compartir **un puerto de gateway**, manteniendo roles y pools independientes. Sin destinos extra. Ambos servicios montan **el mismo archivo de política, en solo lectura**. La API coteja manifiesto y política **antes** de leer secretos, crear pools o abrir listener. Regresiones en `tests/operational-activation-manifest.test.mjs`, `tests/operational-server.test.mjs` y `tests/operational-deployment-isolation-contract.test.mjs` abarcan fichero real/17 slots/2 notifiers, deriva de SNI/puertos/protocolos, extras y montajes divergentes.

Esto comprueba consistencia de configuración: **no** acredita firewall efectivo ni conexión Supabase real.

### R3 — Proyecto Compose diferente de la normativa: corregido en candidato

`compose.sabora-operational.yml` inicial tenía `name: sabora-operational-candidate`, pero la [normativa permanente](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) exige proyecto **`sabora`**, archivo y servicio explícitos. Ahora ambos Compose son modos **alternativos** del mismo proyecto `sabora`, manteniendo red/puertos/servicios acotados. Actualizados la CI de Compose, el gate de aislamiento y el [runbook](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md) para prohibir coexistencia simultánea, comandos globales y efectos en contenedores ajenos.

### R4 — JWKS fuera de la disponibilidad posterior al primer arranque: corregido en candidato

El servidor obtenía JWKS al arrancar, pero la ruta `/ready` del candidato comprobaba solo SQL/eventos en llamadas posteriores. En modo operativo se añadió comprobación `requireTrustedKeysOnReadiness=true` (sin alterar el default opt-in histórico), fallo cerrado 503 con diagnóstico saneado de dependencia **staff**, y recuperación tras restablecer el proveedor. El laboratorio H3–H6/M3 con PostgreSQL 17 real ejerce 200→503→200 mientras `/health` permanece 200. La caché JWKS vigente y sus garantías de caducidad siguen siendo las de `jwks.mjs`; este ensayo no simula una caída de Internet real.

## 3. Bloqueos externos e integración final pendiente

**P0 todavía NO cerrados por esta revisión técnica:**

1. DBA/seguridad **independientes** sobre cambios históricos #57, owner HMAC, membresía administrativa PostgreSQL 17/Opción A, ejecución SQL privilegiada y ACL/EXECUTE/SECURITY DEFINER. El propio autor/agente no se auto-certifica.
2. Cadena SQL #57 aprobada e integrada conforme a la normativa y **regresión completa en un único SHA candidato combinado** (PG17 no-superuser → ACL/HMAC/REST → gateway/manifest/SQL TLS real → dos PWA Chromium). Los PASS anteriores de ramas distintas no sustituyen este gate.
3. Evidencia de arranque **real completo del contenedor operacional más gateway y secretos con Postgres 17 cifrado**. Lo que se añade ahora: prueba de integración de archivos/manifiesto↔política/pools construidos con `SpyPool`; el E2E H6 usa SQL real y la fábrica operacional, pero no reproduce todavía el trayecto completo de red TLS/proxy del Compose. **No presentar la prueba `SpyPool` como extremo a extremo SQL.**
4. Selección y prueba de endpoints reales directo IPv6 vs pooler sesión IPv4, CA/hostname, credenciales/LOGIN/rotación, HMAC y JWKS efectivos en el proveedor Sabora, **sin** postgres/service_role como login runtime.
5. Restauración y custodia cifrada Sabora reales autorizadas; plan Free no acredita PITR/backups automáticos. Receptor externo de alertas e aislamiento VPS Sabora-only sin dependencia de Fleetia; aceptación visual humana.
6. Aprobaciones separadas de integración, backup, DDL/roles/secretos, red, despliegue y vuelta atrás. No hacerlas implícitas por tener cero usuarios.

## 4. Puerta de evidencia y decisión de integración

- `IMPLEMENTADO`: se pueden revisar módulos/commits concretos de #58 y los 59 SQL de #57. Los cambios posteriores a `b825b78e` **necesitan sus propios checks**.
- `PROBADO`: consignar SHA exacto, Actions, prueba de SQL y negativas. No equiparar pruebas de contrato o del servidor falso con pruebas completas de proveedor.
- `VALIDADO OPERACIONALMENTE`: **NO** hasta pruebas autorizadas Supabase y VPS, backup/restore y monitorización real.
- `ACEPTADO`: **NO** mientras falten revisión DBA independiente y conformidad visual humana.

**Decisión técnica:** mantener ambos PR **Draft, sin fusionar**. Con CI del HEAD final de #58 verde, solicitar revisión independiente sobre #57 y #58; verificar después un único árbol combinado con regresión de 99 SQL modificadas + bootstrap y dos PWA antes de proponer el merge. No abrir otro PR para estas correcciones, ni intervenir Fleetia.

**Referencias:** [continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [contrato normativo](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) · [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md) · [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md).

## 5. S38 — ensayo de integración combinado y transporte operacional con PG17 real

**Delta posterior al primer expediente:** sin fusionar #57 ni abrir PR adicional, se añadió al **mismo #58** la batería [`sabora-cv005-b2-cross-candidate.yml`](../../.github/workflows/sabora-cv005-b2-cross-candidate.yml), guard de [fuente exacta](../../scripts/ci/cv005-b2-combined-candidate-rehearsal.sh) y [prueba del gateway TLS en PG17](../../scripts/ci/operational-transport-pg17-tls.test.mjs) junto al [preparador CI](../../scripts/ci/operational-transport-pg17-tls-smoke.sh).

La batería combinada solo opera en el **runner GitHub desechable** del PR #58, obtiene #57 en la referencia **fijada** `9c943e5b6ae2fa39e5abd18fc604688aa5689e5d`, comprueba 99 rutas idénticas y **59 SQL diferentes**, copia esas versiones temporalmente al checkout de #58 **sin crear commit ni modificar `main`**, reutiliza las pruebas CREATEROLE/NOSUPERUSER propias de #57 y ejecuta la aceptación H6 PostgreSQL17/HTTP/HMAC/Chromium con ambas PWA. Cualquier variación en el SHA SQL o número de rutas aborta antes de SQL; para actualizar la referencia será obligatoria una nueva revisión del delta.

El ensayo de transporte configura certificado SAN de vida corta exclusivamente en la base Docker PG17 del runner y un origen HTTPS JWKS ficticio. Un gateway real acepta solo SNI SQL/JWKS exactos; la conexión del cliente `pg` valida certificado y hostname originales. Solo la **inyección explícita de transporte del fixture** redirige las conexiones upstream al loopback del runner, sin acceso a Internet ni Supabase. El escenario refuerza además el arranque a partir de manifiesto y ficheros reales con **17 LOGIN físicos de prueba, 2 pools LISTEN dedicados, funciones SQL/ACL de PG17 reales, API Fastify autenticada, health/ready, catálogo y denegación de rutas no autorizadas**, y pérdida/recuperación del privilegio SQL. **No confundir** con un despliegue de los dos contenedores de Compose ni con conexiones al proveedor.

La primera ejecución completa de este ensayo detectó un fallo auténtico de socket: el gateway emitía un `EPIPE` no capturado al cortar un peer TLS, y el arranque real devolvió un error saneado genérico `sabora_operational_startup_failed`. Ejecuciones negativas de referencia: [Sabora CI #43271588836](https://github.com/jdlc86/CartaViva/actions/runs/43271588836), [Bootstrap #43271588874](https://github.com/jdlc86/CartaViva/actions/runs/43271588874) y [ensayo cruzado #43271588918](https://github.com/jdlc86/CartaViva/actions/runs/43271588918). **En esa ejecución, el guard de 99/59 y la instalación no-superusuario de 99 migraciones sí llegaron a PASS; el bloque E2E TLS/API falló.** No se reinterpreta un FAIL como GO.

Se corrigió el control de vida de las conexiones en `sabora-egress-gateway.mjs` para absorber `EPIPE` de abortos TLS/peer y destruir ambas puntas sin caída del proceso. La prueba de arranque ahora clasifica **solo errores de categorías no sensibles** para localizar el preflight sin imprimir SQL, DSN, identificadores ni secretos. **Estas correcciones posteriores necesitan CI nueva del SHA final, resultado todavía no registrado al redactar.**

**Puerta abierta:** hasta que el E2E combinado y el real-file bootstrap del nuevo SHA terminen verdes, no cerrar la compatibilidad de laboratorio entre #57/#58 ni declarar transporte resuelto. Tras ello siguen en **NO-GO operacional**: revisión independiente DBA/seguridad de owners y 59 SQL, compatibilidad con Supabase 17.11/supautils, SSL/endpoints/roles/secretos reales, backup/restore custodiado, alertas, aislamiento comprobado de VPS, aceptación visual y autorizaciones explícitas de merge/SQL/despliegue.

**Estado por nivel:** implementado en PR #58; pruebas de la nueva versión **pendientes**; proveedor/aceptación **NO VALIDADOS**.
