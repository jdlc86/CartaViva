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

---

_Esta es la continuidad operativa vigente a partir de la sesión 36. [Sesión 35](SESSION_35_HANDOFF_2026-11-10.md) permanece como antecedente; los hitos posteriores se documentan aquí._
