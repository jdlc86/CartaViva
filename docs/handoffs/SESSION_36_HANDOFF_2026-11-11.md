# Sabora / CartaViva — continuidad operativa de la sesión 36 (2026-11-11)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** Este archivo es la **continuidad viva desde la sesión 36** y reemplaza a la sesión 35 como registro de nuevos hitos. Conserva evidencias, SHA, decisiones y próximos bloques; **no** aprueba requisitos, diseño, revisión independiente, merge, migración ni despliegue. Ante cualquier diferencia mandan los documentos normativos de GitHub. No atribuir pruebas ejecutadas en un commit a otro SHA ni equiparar código implementado, CI satisfecha y funcionamiento aceptado.

## 1. Navegación y precedencia documental

- **Continuidad anterior, cerrada para nuevos hitos:** [sesión 35](SESSION_35_HANDOFF_2026-11-10.md), especialmente S35-6 (saneamiento S4), S35-7 (brecha real de permisos) y S35-8 a S35-10 (implementación, errores y correcciones del PR #56).
- **Tablero vivo, enlazado obligatoriamente:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). No usar su fotografía histórica como si fuera estado vigente sin contrastarla con GitHub.
- **Auditoría de selección de H35-P1:** [SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md](../reviews/SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md).
- **Conciliación de PR históricos:** [dictamen S35](../reviews/SABORA_S35_POSTMERGE_NINE_PR_DISPOSITION_2026-11-10.md) y [expediente del PR #8](../reviews/SABORA_S35_PR8_ACTOR_SQL_CONSOLIDATION_2026-11-10.md).
- **Seguimiento del candidato vigente:** [PR #56 — H35-P1](https://github.com/jdlc86/CartaViva/pull/56), único PR abierto en el corte de apertura.

### Fuentes normativas, superiores a esta continuidad

- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md) y [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md).
- [ADMIN/ROOT escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [titularidad operativa](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) y [cesión de titularidad](../security/ADMIN_WRITE_OWNERSHIP_V1.md). **El servidor resuelve al titular de la solicitud de cesión; el cliente no elige arbitrariamente al destinatario.**
- [Operaciones de cocina y sala](../architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md): respetar los flujos vigentes «Voy a recoger»/«Cancelo» y las correcciones autorizadas, sin restaurar una antigua semántica por comodidad.
- [Dos PWA independientes CV-012](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [contrato visual](../DESIGN_SYSTEM_CONTRACT.md) y [auditoría de estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md).
- [Hoja de ruta y ejecución por hitos completos](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [matriz F/R](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y [cobertura funcional/UI](../design/FUNCTIONAL_UI_COVERAGE.json). Las matrices y auditorías son trazabilidad/evidencias, no sustitutos de los requisitos aprobados.

## 2. S36-0 — fotografía revalidada directamente en GitHub al abrir la sesión (11-11-2026)

| Asunto | Hecho observado | Lectura correcta |
| --- | --- | --- |
| Repositorio | [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva) | **Único repositorio autorizado para cambios**; Fleetia es ajeno |
| Saneamiento S4 | #54 y #55 fusionados, 32 PR ancestrales y nueve divergentes históricos resueltos; [sesión 35 S35-6](SESSION_35_HANDOFF_2026-11-10.md) | **Cerrado administrativamente**, no supone aceptación global del producto |
| PR abierto | [#56 Draft](https://github.com/jdlc86/CartaViva/pull/56), `state=open`, `merged=false`, 11 commits y 27 archivos modificados | Único PR abierto en la consulta; **no** integrado en `main` |
| HEAD candidato | `27dc70f086a1d51bc14c3f61708740cdef4b0006` | Este SHA reemplaza al `1137ed8d...` de S35-10 |
| Base Git | `compare(main...branch)`: `diverged`, **11 commits ahead / 3 behind**; `main` consultado `af0f403498f63abb0fd3f4fc1a3893b7085bc3cb` | Reexaminar diferencias y base antes de decidir integración; no usar el estado de mergeabilidad como aceptación |
| Delta desde S35-10 | `compare(1137ed8d...27dc70f0)`: **un commit** y un archivo de prueba modificado, `scripts/ci/ownership-governance-postgres17.test.mjs`, **+7/−0** | Espera explícita de la lectura SQL efectiva antes de asertar que no aparece el botón «Crear mesa»; no son nuevas concesiones de permisos |
| Pruebas del último SHA | **Seis workflows `completed/success`** sobre `27dc70f0` | **Candidato técnicamente probado en esas seis rutas**, no revisión independiente ni aceptación visual humana |
| Activación | No hay evidencia de merge de #56, migración aplicada a Supabase operativo o despliegue | Ninguna autorización implícita de operaciones sobre VPS/Supabase |

### Evidencia exacta de la CI del HEAD `27dc70f0`

| Workflow de PR | Ejecución | Resultado GitHub |
| --- | --- | --- |
| Bootstrap Sabora lockfile — PostgreSQL 17 desechable | [#43000775447](https://github.com/jdlc86/CartaViva/actions/runs/43000775447) | **SUCCESS** |
| Sabora CI — aceptación H6 consolidada | [#43000775529](https://github.com/jdlc86/CartaViva/actions/runs/43000775529) | **SUCCESS** |
| Sabora management browser visual smoke | [#43000775551](https://github.com/jdlc86/CartaViva/actions/runs/43000775551) | **SUCCESS** |
| Sabora client browser conformance | [#43000775614](https://github.com/jdlc86/CartaViva/actions/runs/43000775614) | **SUCCESS** |
| Sabora CV-012 independent PWA installability | [#43000775460](https://github.com/jdlc86/CartaViva/actions/runs/43000775460) | **SUCCESS** |
| Sabora functional UI coverage and deferred visual acceptance | [#43000775481](https://github.com/jdlc86/CartaViva/actions/runs/43000775481) | **SUCCESS** |

**Log Bootstrap inspeccionado**, job `130456052138`: subtest `CV-014: actual PostgreSQL17 → signed Fastify → two Chromium PWAs → published notices, scheduling, roles, events and audit` **`ok 1`**; `PG17 single ADMIN writer: signed catalog/table/comms, root denied, transfer/replay fence, no side effects` **`ok 1`**; `PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs, transfer, ROOT force and stale writer denial` **`ok 1`**. La ejecución de Sabora CI `43000775529` concluyó `success`. Esto rectifica los antiguos estados 4/6 o «dos largas en curso» del corte S35-10: corresponden a **SHA anteriores**.

## 3. Alcance implementado, pruebas y límites de aceptación

**Código implementado en la rama #56, NO en `main`**: migración versionada `20261110232000_sabora_m3_effective_management_permissions_candidate.sql` con proyecciones SQL firmadas de permisos efectivos; API fail-closed y vistas de Mesas/QR, Catálogo y Comunicaciones desacopladas entre sí; gobierno de titular ADMIN vigente y negativa a no titulares/ROOT; retoma por foco/navegación sin polling; comprobaciones de cambio de titularidad, recuperación forzada y escritor obsoleto; auditoría de migración; runner de Chromium fijado a Ubuntu 24.04. La implementación sigue siendo candidata y no debe darse por aplicada al Supabase real.

**Pruebas ejecutadas y observadas**: 6/6 workflows `success` en **el mismo SHA**; en log PG17/Chromium se observaron expresamente los recorridos CV-014, escritor único y transferencia/revocación A→B con dos PWA. La ampliación final del test evita tomar un placeholder de carga fail-closed por una autorización visible. Se validan los escenarios realmente incluidos, **no todos** los casos funcionales del restaurante.

**Riesgo histórico no borrado**: en una ejecución anterior [Bootstrap #42997077436](https://github.com/jdlc86/CartaViva/actions/runs/42997077436) apareció un `40P01 deadlock detected` en el escenario de invitaciones/outbox. **No se documentó una causa raíz** en S35 y el commit final `27dc70f0` modifica únicamente el test de titularidad; una nueva batería global verde no permite afirmar que se corrigió causalmente ese interbloqueo. Verificar si el escenario concreto se ejecutó y si corresponde seguimiento de concurrencia antes de cerrar el riesgo.

**No validado por los checks anteriores**: revisión independiente actual de seguridad/HMAC/actor SQL, conformidad estética humana con las imágenes aprobadas (F28/R09), Stripe sandbox remoto (F20/R03–R05), recuperación M6/PITR, CV-013 y decisiones normativas aún abiertas de reservas, habilitación del arranque operativo ordinario y autorización de migración/despliegue. No confundir un test Chromium automatizado con aprobación visual humana.

## 4. Siguiente bloque integral de sesión 36 — B36-A

**Objetivo:** concluir técnicamente H35-P1 sin abrir PR redundantes, y emitir una decisión comprobable sobre su integración. Trabajar **en #56** si hay defecto real.

1. **Preflight final sobre GitHub:** cotejar `main`, HEAD y diff exactos de #56, nueva migración, permisos SQL mínimos/RLS/HMAC, proyecciones independientes M3 y M5, lector propio de Catálogo y las consecuencias de una cesión A→B/recuperación forzada. Confirmar que los 3 commits que separan la rama de `main` no invalidan el candidato; no inferir esto de `mergeable=true`.
2. **Valor probatorio:** verificar los subtests PG17/HTTP/Chromium del mismo SHA, sobre todo escritor antiguo y nuevo, ROOT/camarero, comunicaciones independientes, checkout H3/H4 y CV-014; verificar cobertura real del escenario antiguo de invitaciones/outbox y registrar cualquier incertidumbre reproducible sin llamar «flaky» al `40P01` ni crear pruebas minúsculas por defecto.
3. **Dictamen único de integración:** diferenciar **implementación**, **pruebas observadas**, **riesgos abiertos**, **contrato cumplido** y **validación pendiente**. Si hace falta corregir, hacerlo en el **mismo PR** y obtener batería integral sobre un único nuevo SHA. Si no, evaluar/solicitar autorización específica del merge de #56 y, tras ejecutar una integración autorizada, verificar la CI de `main` y documentar los SHA correspondientes; no presentar el mero plan como merge realizado.
4. **Cerrar el hito y actualizar el tablero** solo con resultado comprobado. Sin aprobación independiente ni estética humana no se declara GO general de activación.

**Bloque posterior B36-B (condicionado):** continuar el siguiente hito funcional completo que dicten los requisitos normativos y la auditoría post-S4; priorizar brechas de producto/seguridad reales, sin abrir en paralelo múltiples PR para microcorrecciones ni transformar cuestiones no aprobadas (reservas, CV-013, etc.) en reglas inventadas.

## 5. Restricciones operativas y disciplina de seguimiento

- **Solo actuar en `jdlc86/CartaViva`**; el VPS se comparte con Fleetia y otros proyectos. Está prohibido detener, modificar, consultar datos ajenos o crear dependencias entre servicios. Un eventual despliegue de Sabora requiere **autorización expresa y aislamiento completo**.
- No aplicar esta migración a **Supabase operativo**, no operar secretos, roles operativos, Stripe real ni el VPS al crear esta continuidad. No interpretar «sin usuarios» como permiso de despliegue.
- Los documentos normativos mandan; continuidad y tablero no son contratos. Los registros nuevos importantes desde ahora se incorporan **a la sesión 36**, no se sigue engordando la sesión 35. Actualizar el tablero al cerrar hitos completos.
- Pruebas aisladas únicamente para diagnosticar fallo concreto o proteger requisito crítico; por defecto recurrir a baterías integradoras PG17 + Fastify + JWT/HMAC + PWA/Chromium. Conservar referencia a **commit y ejecución exactos**; no hacer CI redundante por cambios exclusivamente documentales `[skip ci]`.

## 6. Registro vivo de sesión 36

### S36-0 — apertura y contraste de evidencias (11-11-2026)

**Realizado:** documento de continuidad nuevo, con enlaces a S35, tablero, normativa, auditoría y PR #56; consulta del HEAD `27dc70f0`, comparación con `1137ed8d` y con `main`; verificación directa de **6/6 workflows `completed/success`** y lectura del log PG17 con las rutas conectadas de titularidad/CV-014. Se actualiza el punto de partida de la sesión 35 sin reescribir sus hechos históricos.

**No realizado en la apertura:** cambio de runtime/SQL/PWA, ejecución manual nueva de pruebas, corrección causal del `40P01`, merge de #56, revisión independiente, aprobación visual humana, migración en Supabase operativo, despliegue o intervención en VPS/Fleetia.

**Siguiente hito:** B36-A, preflight técnico integral y decisión de integración del PR #56, sin considerar `main` actualizado hasta que GitHub confirme un merge autorizado.


### S36-1 — preflight completo de H35-P1 y revocación de Comunicaciones tras 403 (11-11-2026)

**Informe integral versionado:** [SABORA_S36_PR56_INTEGRATION_PREFLIGHT_2026-11-11.md](../reviews/SABORA_S36_PR56_INTEGRATION_PREFLIGHT_2026-11-11.md). Se cotejaron normas de escritor único, ROOT, cesión con destinatario resuelto en servidor, implementación SQL/API/PWA y la comparación de commits de la rama del [PR #56](https://github.com/jdlc86/CartaViva/pull/56) contra `main`. La diferencia exclusiva de `main` en ese cotejo constó **solo de tres rutas documentales** (sesiones 35/36 y tablero), no de un cambio funcional, pero debe reconsultarse antes del merge. La API devolvió `mergeable=true` en la segunda lectura; no significa autorización.

**Hallazgo real y corrección en el mismo PR:** la PWA de Comunicaciones conservaba controles de edición tras un `403` del servidor por titularidad caducada, hasta un refresco por foco/navegación. El backend SQL continuaba rechazando escrituras: no se demostró bypass. [Commit `f4e9d877`](https://github.com/jdlc86/CartaViva/commit/f4e9d8777e46e30642ab98890103fa7469907242) retira inmediatamente el editor en la misma pestaña y solo deja rehabilitarlo con permiso revalidado, sin polling ni concesión por rol. [Commit `ba0530f4`](https://github.com/jdlc86/CartaViva/commit/ba0530f4531e30afa70322d4b967ee49037be2ba) amplía **el escenario integrado existente** PG17/JWT/HMAC/Fastify/Chromium: el titular antiguo intenta guardar un borrador M5 tras cesión ROOT→ADMIN A, debe recibir 403, perder la edición sin cambiar de pantalla y no insertar una fila SQL. **Código implementado y prueba añadida, pendiente de resultado final de CI del mismo SHA**.

**Outbox ya comprobado realmente:** la batería Bootstrap anterior [#43000775447](https://github.com/jdlc86/CartaViva/actions/runs/43000775447), SHA `27dc70f0`, sí corrió `staff-invitation-outbox-postgres17.test.mjs` y dejó `ok 22` en el mismo test de sobres de despacho que anteriormente sufrió `40P01`; también `ok 23/24/25`. Esto descarta que el éxito se debiese a que el test no se ejecutó, **no certifica corrección causal ni ausencia futura del interbloqueo**.

**CI nueva al corte documental:** seis workflows del HEAD **`ba0530f4531e30afa70322d4b967ee49037be2ba`** iniciados: [Bootstrap #43067975140](https://github.com/jdlc86/CartaViva/actions/runs/43067975140), [Sabora CI #43067974953](https://github.com/jdlc86/CartaViva/actions/runs/43067974953), [gestión #43067974907](https://github.com/jdlc86/CartaViva/actions/runs/43067974907), [cliente #43067974930](https://github.com/jdlc86/CartaViva/actions/runs/43067974930), [CV-012 #43067975008](https://github.com/jdlc86/CartaViva/actions/runs/43067975008), [cobertura #43067975055](https://github.com/jdlc86/CartaViva/actions/runs/43067975055). **Cuatro workflows rápidos completaron `success`**, Bootstrap y Sabora CI continuaban `in_progress`. **No anunciar 6/6 ni hito cerrado antes de observar su conclusión.**

**Estado:** preflight y corrección implementados; PR #56 continúa Draft, no fusionado; H35-P1 **no cerrado** hasta comprobar el E2E nuevo y CI integradora. No se aplicaron migraciones a Supabase operativo ni se intervino en VPS, Fleetia, secretos o proveedores reales.



### S36-2 — verificación definitiva de CI del PR #56 y frontera de primera prueba operativa (11-11-2026)

**GitHub reconsultado:** único PR abierto [#56 Draft](https://github.com/jdlc86/CartaViva/pull/56), **sin merge**; HEAD exacto `ba0530f4531e30afa70322d4b967ee49037be2ba`. Las **seis** ejecuciones del mismo SHA constan `completed/success`: [Bootstrap PG17 #43067975140](https://github.com/jdlc86/CartaViva/actions/runs/43067975140), [Sabora CI #43067974953](https://github.com/jdlc86/CartaViva/actions/runs/43067974953), [gestión #43067974907](https://github.com/jdlc86/CartaViva/actions/runs/43067974907), [cliente #43067974930](https://github.com/jdlc86/CartaViva/actions/runs/43067974930), [CV-012 #43067975008](https://github.com/jdlc86/CartaViva/actions/runs/43067975008) y [cobertura/UI #43067975055](https://github.com/jdlc86/CartaViva/actions/runs/43067975055). Los dos jobs largos terminaron también `completed/success`.

**Logs integradores realmente leídos:** Bootstrap `generate-lockfile` job `130687911324` muestra `ok 1 - PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs, transfer, ROOT force and stale writer denial` tras incorporar la regresión S36 del rechazo 403 y revocación de Comunicaciones; el subtest del outbox que antiguamente falló aparece `ok 22 - PG17 fenced dispatch emits canonical envelopes for boundary and long tokens`. Sabora CI job `130687909513` confirma `[H6] PASS Block 2B: real PostgreSQL 17, HMAC, concurrency and Chromium E2E`. **La causa del `40P01` histórico no está certificada**, aunque se ha demostrado la ejecución positiva de esa misma prueba en la nueva ronda.

**Conclusión acotada:** H35-P1 es **candidato integrado técnicamente probado en PR #56, no fusionado ni desplegado**; falta dictamen de merge conforme a permisos, integración autorizada y comprobación CI post-merge. Ningún test de GitHub equivale a configuración real de Supabase, aceptación estética o recuperación operativa.

**Priorización para la primera prueba en el entorno operativo con datos ficticios (no aceptación general):** el bloqueo principal sigue siendo `apps/api/src/server.mjs` con solo `/health` y `/ready`, con `api-runtime-config.mjs` que rechaza modos operativos y secretos; hay composiciones H3–H6 probadas como candidatas opt-in pero **no existe el arranque real certificado**. Quedan la integración por proceso, credenciales/roles SQL exclusivos y firma/JWKS, aplicación segura de migraciones a Sabora, dominio/TLS, despliegue Sabora-only aislado de Fleetia, backups/restauración, observabilidad, dispositivos/QR y recorrido completo real. Dependencias de Stripe remoto, reservas, Excel, Gemini y estética humana deben quedar explícitamente fuera de la aceptación de un smoke acotado si no se validan; no darlas por resueltas ni reinterpretar la normativa. Un despliegue a VPS o intervención en Supabase operativo requiere autorización expresa y preflight de aislamiento.

**Acción documental:** se actualiza la continuidad 36 con CI final y límites probatorios; **no** se ejecutó merge, migración real, configuración de secretos, servidor, despliegue ni modificación de Fleetia.


### S36-3 — comprobación cruzada de matrices CV-001–CV-019 y F01–F28/R01–R10 (11-11-2026)

**Verificación concluida en alcance documental:** [informe integrado S36](../reviews/SABORA_S36_LIVE_MATRIX_REVALIDATION_2026-11-11.md). Se contrastaron **19 IDs CV**, **28 F**, **10 R** y la [matriz UI funcional](../design/FUNCTIONAL_UI_COVERAGE.json) con los contratos NF/RF/DV, el estado real de GitHub, el HEAD/CI de PR #56, `server.mjs` y `api-runtime-config.mjs`. Se preservan las fuentes históricas de prueba: [§40 y nuevo §52 F/R](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y [auditoría CV del 09-11](../reviews/SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md), marcada ahora como corte histórico para evitar reproducir su cifra obsoleta de 46 PR abiertos. El [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) corrige expresamente CV-004: saneamiento S4 completado, **solo #56 Draft** y ninguna fusión del HEAD funcional.

**Clasificación de aceptación sin cambios artificiales:** F01–F19/F21–F27 **26 candidatos** (F12 opt-in), F20 **parcial/bloqueado Stripe**, F28 **bloqueado visual**; R01/R02/R06/R07/R08 **5 candidatos** (R08 opt-in), R03–R05 **3 parciales**, R09 **bloqueado**, R10 **candidato técnico** con nueva CI **6/6 PASS del PR #56 SHA `ba0530f4`**, no `main` post-merge. La primera prueba operativa con datos ficticios aún depende principalmente del **arranque CV-005/F12/R08** más CV-010/CV-011 (roles/secretos, migraciones, recuperación y aislamiento VPS), dominio/TLS, autorización y ensayo real. El informe S36 documenta aparte las puertas de aceptación integral de Stripe, Excel empresarial, reservas, Gemini y diseño.

**No realizado por esta auditoría:** nuevos tests, revisión independiente, corrección del interbloqueo `40P01`, modificación de código, cambios de normas, merge, migraciones en Supabase operativo o intervención en VPS/Fleetia. Los cambios son exclusivamente documentales con `[skip ci]`. **No declarar GO/aceptación global** por este contraste.


### S36-4 — preparación de credenciales y bloqueo Supabase INACTIVE (11-11-2026)

**Dato aportado por el propietario:** confirma haber guardado en custodia privada tres contraseñas distintas para los logins documentados `sabora_staff_reader_login`, `sabora_catalog_login` y `sabora_customer_session_login`. **No se recibieron, leyeron, almacenaron ni versionaron sus valores**; no hay evidencia de creación de usuarios SQL, asignación de contraseñas, gestor de secretos seleccionado ni inyección efectiva al runtime. Estado: **preparadas fuera del repositorio; NO provisionadas / NO activadas**.

**Comprobación externa de solo lectura:** el conector de Supabase, usando la cuenta «RESTAURANTE» y la referencia del proyecto normativamente identificado `byhvmumqivmunkmomhup`, devuelve `name=restaurante`, PostgreSQL `17.11.0.003`, `status=INACTIVE`. **No se deduce sin confirmación de panel la causa de la inactividad**; en Supabase puede requerir reanudación del proyecto. No se ejecutó SQL, migración, restauración, reinicio ni cambio de configuración. El siguiente paso comunicado al propietario es abrir el panel específico y, si presenta `Resume project`, reanudarlo y verificar estado activo.

**Secuencia posterior, no ejecutada:** conciliar migraciones normativas y grants para cada login de mínimo privilegio, comprobar su existencia sin exponer contraseñas, elegir custodia/inyección por proceso, integrar arranque CV-005 con fallo cerrado, comprobar SQL/roles/negativas en PG17 desechable y solo entonces evaluar aprovisionamiento autorizado en Supabase operativo. El proceso ordinario sigue `health-only` y **rechaza** los secretos SQL en ese modo. No mezclar identidades, proyectos ni secretos Fleetia; no usar `service_role` en PWA.


### S36-5 — restauración de Supabase en curso, pendiente de verificación (11-11-2026)

**Confirmación del propietario:** la operación de reactivación/restauración del proyecto Supabase de Sabora `byhvmumqivmunkmomhup` **está en proceso**. Este dato reemplaza la instrucción anterior de iniciar la reactivación, pero **NO acredita que haya concluido ni que PostgreSQL esté disponible**. El último estado comprobado mediante lectura del conector era `INACTIVE` (S36-4); no se declara `ACTIVE` ni se deduce operatividad hasta nueva consulta explícita y conexión verificada.

**Credenciales:** las tres contraseñas preparadas por el propietario continúan bajo custodia privada; no se compartieron ni aprovisionaron. **Siguientes comprobaciones una vez reactivado:** consultar estado del proyecto, validar conectividad PostgreSQL 17/TLS sin exponer secretos, cotejar migraciones y roles mínimos normativos antes de cualquier operación DDL o asignación de contraseña, y avanzar CV-005/CV-010/CV-011 con pruebas PG17 aisladas. No asumir que hay tablas o roles operativos instalados por el mero hecho de reactivar el proyecto.

**Alcance exacto de esta actualización:** registro documental del estado comunicado por el propietario, **sin ejecutar reactivaciones, SQL, despliegues, cambios de secretos, merge o intervención en VPS/Fleetia**. Se mantiene la prohibición de acceso o modificación de recursos ajenos.


### S36-6 — reactivación Supabase comprobada y preflight SQL de solo lectura (11-11-2026)

**Comprobaciones realizadas en el proyecto exacto `byhvmumqivmunkmomhup`, cuenta conectada RESTAURANTE:** `get_project` devuelve `status=ACTIVE_HEALTHY`, región `eu-central-1`, motor PostgreSQL `17.11.0.003` y nombre `restaurante`. El anterior bloqueo `INACTIVE` de S36-4/S36-5 **queda resuelto en la comprobación del proveedor**. No atribuir la reactivación al asistente: fue iniciada por el propietario en su panel.

**Conectividad y estructura realmente observadas mediante un único `SELECT` read-only sobre el proyecto correcto:** `current_setting('server_version')='17.11'`, `current_database()='postgres'`; `to_regnamespace('sabora') IS NOT NULL` devuelve **false**; y `to_regrole(...)` devuelve **false** para los tres roles `sabora_staff_reader_login`, `sabora_catalog_login`, `sabora_customer_session_login`. Se acreditó **conectividad SQL real**, pero **la estructura Sabora no está aplicada** y estas tres identidades SQL no existen. La consulta **no inspeccionó** otros roles ni los secretos; no hay inferencia de compatibilidad total de la cadena de migraciones.

**Consecuencia operativa:** no intentar asignar contraseñas a roles inexistentes, no usar el superusuario PostgreSQL como runtime ni confundir `ACTIVE_HEALTHY` con Sabora desplegada. Preparar revisión de migraciones y roles mínimos desde normativa y HEAD GitHub, ensayar la cadena íntegra en PG17 desechable y obtener autorización específica antes de aplicar cambios a Supabase operativo. Las tres contraseñas aportadas permanecen en custodia privada del propietario, **no introducidas ni transmitidas**. El arranque estándar de API sigue `health-only` y PR #56 continúa no fusionado según el último corte de GitHub.

**Operaciones efectuadas:** solo consultas de metadatos y `SELECT` sin mutación, y actualización documental de este hito. **No** hubo `CREATE ROLE`, `CREATE SCHEMA`, migraciones, DDL/DML, operación en VPS/Fleetia, despliegue ni manipulación de secretos.


### S36-7 — preflight integral de migraciones y credenciales (11-11-2026)

**Hito documental/inspección de solo lectura realizado:** [informe de instalación PostgreSQL y custodia de secretos](../reviews/SABORA_S36_SUPABASE_DATABASE_ACTIVATION_PREFLIGHT_2026-11-11.md). El corte exacto de GitHub contiene **98 migraciones y 98 registros de auditoría en `main`** frente a **99 migraciones y 99 registros de auditoría en el candidato PR #56**, sin nombres omitidos ni sobrantes. La migración exclusiva #56 es `20261110232000_sabora_m3_effective_management_permissions_candidate.sql`; el PR permanece como rama no fusionada según el último estado comprobado. No confundir CI desechable 6/6 del SHA `ba0530f4` con ejecución sobre Supabase operativo.

**Preflight real sin mutación de Supabase:** un `SELECT` sobre `byhvmumqivmunkmomhup` devuelve `current_user=postgres`, PG **17.11**, `rolcreaterole=true`, `rolsuper=false`, `pgcrypto=1.3` disponible/instalada; no existen `sabora_migration_meta` ni `supabase_migrations.schema_migrations`. La consulta anterior S36-6 ya acreditó ausencia del esquema `sabora` y de los tres logins. Estas comprobaciones permiten **identificar incompatibilidades a revisar**, pero no garantizan que las migraciones probadas como superusuario en Docker funcionen con el rol `postgres` no superusuario de Supabase.

**Hallazgo normativo/operativo importante:** `docs/security/STAFF_READER_LOGIN_PROVISIONING_DRAFT.sql` prohíbe expresamente aplicarse en Supabase; el login de sesiones del cliente se crea en un fixture CI también **prohibido en producción**. Se preserva la diferencia `INHERIT` de lector de personal vs `NOINHERIT` y `SET ROLE` de catálogo/sesión. Las **tres contraseñas que tiene el propietario no equivalen a roles creados**; faltan los demás logins/secretos de H3–H6 y el bootstrap operativo de `server.mjs`.

**Próximas puertas, no ejecutadas:** autorización e integración #56 + CI post-merge; manifiesto checksum exacto; validación de compatibilidad Supabase/propietarios/roles; PG17 aislado con recorrido completo; procedimiento Sabora-only de aplicación/recuperación de migraciones; gestor de secretos y roles mínimos; autorización específica de cambios en Supabase operativo y VPS sin tocar Fleetia. **Estado: preparación inspeccionada, instalación NO-GO**. Sin SQL de escritura, creación de roles, aplicación de migraciones, despliegue ni cambios de secretos.


### S36-8 — metodología permanente de desarrollo, depuración y observabilidad (11-11-2026)

**DECISIÓN DEL PROPIETARIO — METODOLOGÍA OBLIGATORIA DE TRABAJO, REGISTRADA ANTES DE IMPLEMENTAR:**

1. **Laboratorio permanente, no desechado tras migrar.** Mantener GitHub Actions y PostgreSQL 17 **desechable, aislado, reproducible y sin secretos operativos** para regresión integradora, SQL/RLS/grants, HMAC/JWT, concurrencia, migraciones, idempotencia, resiliencia, dos PWA y Playwright/Chromium. Conservar capacidad de reconstruir, interrumpir y reanudar ensayos sin afectar datos reales ni VPS. El laboratorio es una **herramienta de diagnóstico y defensa contractual**, no un entorno de producto aceptado.
2. **Depuración complementaria sobre Sabora efectivamente desplegada.** Después de migración y despliegue autorizados, usar exclusivamente infraestructura y datos ficticios de Sabora para validar flujos QR→cliente→pedido→cocina/sala y sus trazas reales, errores de red/TLS, eventos, accesibilidad y apariencia en móvil y escritorio. No confundir CI verde con función validada sobre el entorno real. No crear un segundo proyecto productivo de prueba por presunción; no hay usuarios todavía.
3. **Circuito completo de corrección:** reproducir defecto en escenario real o laboratorio → identificar causa con evidencia y correlación → implementar corrección como parte de **hito integrado completo** → regresión con PG17 y las dos PWA en CI → nuevo despliegue Sabora-only autorizado → smoke funcional/visual → aceptación. Usar tests aislados solo para diagnosticar un fallo concreto o proteger requisito crítico; el resto, integradores.
4. **Observabilidad, recuperación y seguridad antes de primera activación:** trazas estructuradas/redactadas HTTP/SQL/eventos por request/operación, ID de correlación, readiness con comprobación real de dependencias, métricas e incidencias sin información sensible, auditoría append-only separada de telemetría, comprobaciones sintéticas sin secretos, alertas accionables, runbooks de incidentes y restauración Sabora-only, respaldos + ensayo de recuperación y parada/reversión sin tocar Fleetia u otros servicios. **Queda exigida su implementación y validación**, no solo su documentación. La elección de herramientas debe respetar los contratos normativos, los secretos y el aislamiento.
5. **Garantías innegociables:** ningún polling periódico de datos operativos prohibido por contrato; nunca secretos/PII/JWT/HMAC/QR ni datos económicos sensibles en logs, métricas, capturas o CI; nunca docker compose global/prune/restart host, ni dependencias compartidas con Fleetia. API productiva sigue `health-only` hasta bootstrap operativo completo y autorizado. Las consultas read-only a Supabase no equivalen a aprobación de migraciones/escrituras.

**Plan de ejecución S36-8:** inspeccionar los elementos reales de observabilidad y recuperación en el repositorio y distinguir ausencias de piezas ya implementadas; entregar **un bloque integrador** de instrumentos, pruebas y runbooks con enlaces/versiones y actualización de matriz de seguimiento. **Estado inicial:** metodología aprobada/registrada, implementación y validación adicionales pendientes de evidencia. No existe permiso implícito para merge, migraciones en Supabase, despliegue ni operar el VPS.


### S36-9 — instrumentación operativa y diagnóstico seguros en PR #56 (11-11-2026)

**Implementación versionada en el mismo PR #56, sin crear otro PR:** commit [`8534e0b8`](https://github.com/jdlc86/CartaViva/commit/8534e0b8fc5acbe5a3c6278ea7fb44a2ffb814d5) sobre rama `feat/sabora-s35-effective-admin-write-permissions-20261110`. El nuevo HEAD reemplaza la evidencia verde del SHA anterior `ba0530f4`; **NO reutilizar 6/6 de la versión anterior como prueba de esta nueva versión**. Se lanzaron automáticamente seis workflows del nuevo SHA, observados inicialmente `in_progress` y pendientes de dictamen final.

**Archivos concretos del bloque CV-011:** nuevo `apps/api/src/operational-observability.mjs`, `server.mjs` con logging Fastify crudo desactivado y hooks HTTP estructurados con `x-sabora-request-id` generado en servidor (no refleja cabeceras del cliente), `scripts/ops/sabora-diagnostics-summary.mjs` de lectura de STDIN por única vez, `tests/operational-observability.test.mjs`, `tests/operational-diagnostics-summary.test.mjs`, build de API con `node --check`, y [runbook de observabilidad e incidentes](../runbooks/SABORA_OBSERVABILITY_INCIDENT_RESPONSE_V1.md).

**Garantías candidatas:** eventos JSON de lista cerrada (sin URL/query/body/header/IP/QR/JWT/actor/errores SQL); categorías/latencias acotadas, métricas internas sin endpoint público, ráfaga 3 HTTP 5xx/60s con **emisión de alerta al log** disparada por eventos (sin polling), tolerancia a fallo del sink; análisis agregado únicamente de logs Sabora sin mostrar líneas/secretos. Se mantienen `/health`, `/ready` y `health-only` sin activación automática de H3–H6 ni inyección de credenciales. El runbook **reutiliza** recuperación P2/P3 y lifecycle Compose Sabora-only en lugar de duplicarlos.

**Alcance y pendientes:** instrumentación operativa de base **implementada en rama, no fusionada ni desplegada**; los tests de GitHub deben cerrar y se necesita validación integral del nuevo SHA. Esto **no** aporta aún readiness SQL/JWKS H3–H6, observabilidad end-to-end de restaurante desplegado, notificación de alertas externa, plan backup/PITR operativo, RTO/RPO aprobado ni aceptación visual humana. Esos son componentes restantes del hito de primera activación CV-005/CV-010/CV-011/M6. Ninguna escritura SQL real, despliegue VPS, operación Fleetia, secreto ni merge se realizó.

---

_Esta es la continuidad operativa vigente a partir de la sesión 36. [Sesión 35](SESSION_35_HANDOFF_2026-11-10.md) permanece como antecedente; los hitos posteriores se documentan aquí._
