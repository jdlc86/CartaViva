# Sabora / CartaViva — S34: reducción justificada de PR abiertos y paquete de revisión independiente (2026-11-10)

> **DOCUMENTO DE ANÁLISIS Y PROPUESTA; NO ES UNA ORDEN DE CIERRE, MERGE O DESPLIEGUE.** El repositorio y sus **documentos normativos** mandan sobre este informe y sobre las continuidades. El candidato [#54 Draft](https://github.com/jdlc86/CartaViva/pull/54) contiene trabajo todavía ausente de `main`. «Redundante como PR separado» **NO significa** «integrado en `main`», «aprobado» ni «prescindible como código». Solo el propietario puede autorizar disposiciones concretas después de acreditar la custodia del código.

**Documentos de contexto:** [continuidad sesión 34](../handoffs/SESSION_34_HANDOFF_2026-11-10.md) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [inventario histórico S4 47/47](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md) · [reconciliación nueve divergentes S34](SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md) · [evidencia conectada PG17/Fastify/Chromium](SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md) · [plan de saneamiento](SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md).

## 1. Inventario vivo contrastado

Se ha reconsultado GitHub `pulls?state=open&per_page=100`, `pulls/54`, `pulls/54/reviews` y `branches/main`, cotejando los 43 números y HEAD históricos con el expediente anterior. Corte observado, **10-11-2026**:

| Indicador | Resultado | Implicación |
| --- | --- | --- |
| PR abiertos | **43/43 Draft** | Ninguno puede confundirse con merged |
| Ancestros con HEAD contenido en #54 | **33** | Propuestas de integración individuales **redundantes en destino**, NO integradas en `main` |
| Divergentes funcionales/H3 | **9** | No declarar absorbidos solo por semejanza de pruebas o árbol |
| Candidato #54 | **1 Draft** | Necesario como consolidación, pero su base actual es **#53**, no `main` |
| #54 HEAD al corte | `98eb4028d48b130707fb885fbd5e007f0a6d4bc2` | Incluye los últimos cambios de documentación; no atribuirle ejecuciones nuevas |
| `main` | `42b46358a76162445fa9e0b20e7b87dd0a640b5b` | Aún no tiene la integración de #54 |
| Revisiones de #54 | **0** | No hay aprobación externa o independiente |
| CI funcional exacta | `782974063bebe39fd423363eb2f806bc6b8acef9` | **6/6 SUCCESS**, no prueba de producción ni del HEAD documental |
| Cierres previos de sesión 33 | **#14, #31, #40 y #44** | Ya están `closed/merged=false`; **NO** forman parte de los 43 |

**Método para los 33:** la clasificación `ANCESTRO` deriva de la genealogía verificable `compare_commits` de los 46 HEAD en el [expediente S4 S32, §§1 y 3](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md), que comprobó HEAD y parentesco; esta sesión revalidó que esos 33 PR y sus HEAD siguen presentes sin cambio funcional identificado. No se reivindica una nueva auditoría de 4293 commits ni una comparación exhaustiva de archivos usando el endpoint truncado a 300 archivos.

## 2. Los **33 PR innecesarios como vías de merge separadas**, pero de conservación obligada hasta consolidación aprobada

La solución razonable es **una integración revisada del candidato completo**, con trazabilidad de los PR antecesores, en lugar de 33 operaciones de merge aisladas. **Hoy no está permitido cerrarlos**, ya que sus commits siguen fuera de `main`.

| Bloque genealógico | PR exactamente afectados | Total | Propuesta |
| --- | --- | ---: | --- |
| Normativa, bootstrap, identidad/seguridad y primeras PWA | [#1](https://github.com/jdlc86/CartaViva/pull/1) · [#2](https://github.com/jdlc86/CartaViva/pull/2) · [#7](https://github.com/jdlc86/CartaViva/pull/7) · [#10](https://github.com/jdlc86/CartaViva/pull/10) · [#11](https://github.com/jdlc86/CartaViva/pull/11) · [#12](https://github.com/jdlc86/CartaViva/pull/12) · [#13](https://github.com/jdlc86/CartaViva/pull/13) · [#15](https://github.com/jdlc86/CartaViva/pull/15) · [#16](https://github.com/jdlc86/CartaViva/pull/16) | 9 | Cierre *sin merge individual* **solo después** de que el candidato aprobado quede integrado en el destino autorizado |
| H3 identidad/sesiones y HTTP restringido | [#23](https://github.com/jdlc86/CartaViva/pull/23) · [#24](https://github.com/jdlc86/CartaViva/pull/24) · [#25](https://github.com/jdlc86/CartaViva/pull/25) · [#26](https://github.com/jdlc86/CartaViva/pull/26) · [#27](https://github.com/jdlc86/CartaViva/pull/27) · [#28](https://github.com/jdlc86/CartaViva/pull/28) · [#29](https://github.com/jdlc86/CartaViva/pull/29) · [#30](https://github.com/jdlc86/CartaViva/pull/30) | 8 | Igual; conservar pruebas y procedencia de sesiones/cookies |
| H6 sala, cocina, pagos, recuperación e integración | [#32](https://github.com/jdlc86/CartaViva/pull/32) · [#34](https://github.com/jdlc86/CartaViva/pull/34) · [#36](https://github.com/jdlc86/CartaViva/pull/36) · [#38](https://github.com/jdlc86/CartaViva/pull/38) · [#41](https://github.com/jdlc86/CartaViva/pull/41) · [#42](https://github.com/jdlc86/CartaViva/pull/42) · [#43](https://github.com/jdlc86/CartaViva/pull/43) · [#45](https://github.com/jdlc86/CartaViva/pull/45) · [#46](https://github.com/jdlc86/CartaViva/pull/46) | 9 | Igual; auditar expresamente política de recogida y seguridad de cambio de mesa |
| M2/M3/CV-012/visual y administración/CV-014 | [#47](https://github.com/jdlc86/CartaViva/pull/47) · [#48](https://github.com/jdlc86/CartaViva/pull/48) · [#49](https://github.com/jdlc86/CartaViva/pull/49) · [#50](https://github.com/jdlc86/CartaViva/pull/50) · [#51](https://github.com/jdlc86/CartaViva/pull/51) · [#52](https://github.com/jdlc86/CartaViva/pull/52) · [#53](https://github.com/jdlc86/CartaViva/pull/53) | 7 | Igual; #52 gobierno ADMIN y #53 llamadas sala requieren revisión independiente de sus permisos y flujos |
| **TOTAL** | **33 identificados y enlazados** | **33** | **Redundancia de gestión, no de contenido** |

**No** borrar ramas, recrear sus commits como cherry-picks ni cerrar #52/#53 por parecido funcional. Los contratos de titularidad ADMIN/ROOT, las llamadas al camarero y los hitos de integridad deben permanecer en el candidato revisado. El cierre de un PR no fusiona sus commits: comprobar el SHA real que quedaría en `main`.

## 3. Los **nueve divergentes**: reducción adicional factible, pero no acreditada para cierre

| PR | Naturaleza | Qué evidencia se ha ganado | Propuesta S34 | Por qué no se cierra hoy |
| --- | --- | --- | --- | --- |
| [#18](https://github.com/jdlc86/CartaViva/pull/18) | Integridad local H3 | 9/9 nombres de pruebas históricos identificables en candidato | **CANDIDATO A RETIRAR EN BLOQUE H3** | Confirmar paridad de sanitización/persistencia tras sustitución |
| [#19](https://github.com/jdlc86/CartaViva/pull/19) | Incidencias de agotado/retirado | 10/10 nombres y modelo de incidencias actual | **CANDIDATO A RETIRAR EN BLOQUE H3** | La nueva ruta PG17 de precio no certifica por sí sola todos los casos de disponibilidad |
| [#20](https://github.com/jdlc86/CartaViva/pull/20) | Consentimiento de precios | 11/11 nombres; E2E real de aceptación individual de dos variantes tras cambio de precio | **CANDIDATO A RETIRAR EN BLOQUE H3** | Revisión independiente del cambio de precio y cuotas |
| [#21](https://github.com/jdlc86/CartaViva/pull/21) | Revisión de selección | 12/12 nombres; confirmación/QR reales y bloqueo de cesta mediante modelo actual | **CANDIDATO A RETIRAR EN BLOQUE H3** | No equiparar escenario observado a todas las incidencias acumuladas |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | Sincronización entre pestañas y familia H3 | 13/13 nombres Node y 8/8 nombres Chromium; nuevo E2E con variantes, autorización, cotización, dos líneas, idempotencia | **CANDIDATO A RETIRAR EN BLOQUE H3**, junto con #18–#21 | Mantener prueba explícita de sincronización `storage`, offline y cambios de disponibilidad; aprobación independiente |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | Lectura mesas/catálogo legado vs M3 | E2E PG17 auténtico crea categoría dinámica desde ADMIN y la consume cliente; 12/12 nombres en modelos históricos | **REDUNDANCIA PROBABLE SOLO PARA CATÁLOGO** | La ruta completa de mesas, roles, UI visual histórica y evolución M3 no están conciliadas íntegramente |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | Endurecimiento GET H4 | 25/25 nombres históricos conservados; entradas estrictas en HTTP actual | **RETENER HASTA REVISIÓN DE SEGURIDAD** | Comprobar semántica de rechazo y autorización en ruta efectiva H4/H6 |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) | Vinculación actor SQL | Blob de test de capacidad HMAC idéntico; PG17/HMAC/concurrencia PASS, revalidación post-lock en SQL | **RETENER HASTA REVISIÓN DE SEGURIDAD** | Nunca retirar una garantía por similitud de código o número de tests |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | Cocina/camarero legado | H4/H6 actual y líneas de cocina conectadas; modelo «Voy a recoger»/«Cancelo» sustituyó acciones históricas | **RETENER HASTA CONCILIACIÓN NORMATIVA H6** | Acreditar roles, exclusividad, concurrencia, auditoría y no resucitar `picked_up` legado |

**Conclusión operativa sobre divergentes:** **cinco (#18–#22) son el primer paquete plausible de reducción** si se confirma paridad del delta H3 y el propietario autoriza su cierre sin merge. **#5 no está todavía en ese paquete**, por las rutas de mesas además de catálogo. **#4/#8/#17 no deben considerarse redundantes sin revisión específica.** El candidato #54 se conserva abierto.

**No convertir la existencia de pruebas o de un E2E conectado en equivalencia semántica absoluta.** La nueva aceptación [6/6 en `78297406`](SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md) supera la brecha **M3 ADMIN→cliente→H3/H4**, no las demás puertas del producto.

## 4. Paquete listo para revisión **independiente** de #54

### 4.1 Objeto exacto y entradas para el revisor

- **PR candidato:** [#54](https://github.com/jdlc86/CartaViva/pull/54), Draft, HEAD documental `98eb4028d48b130707fb885fbd5e007f0a6d4bc2`, base `feat/sabora-cv014-waiter-calls-integral-20261109` (#53), **no `main`**. Las pruebas del código funcional se hicieron en `782974063bebe39fd423363eb2f806bc6b8acef9`; documentar qué commits posteriores son solo `[skip ci]`.
- **Normativa:** [requisitos](../REQUISITOS_FUNCIONALES.md), [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [operación titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [diseño aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [matriz funcional/UI](../design/FUNCTIONAL_UI_COVERAGE.json).
- **Evidencias:** [S32 S4 47/47](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md), [S34 9 divergencias](SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md), [S34 PG17/Chromium](SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md), [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
- **Registro de ejecución:** [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42820426039), [H6 consolidado](https://github.com/jdlc86/CartaViva/actions/runs/42820425977), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42820426047), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42820426063), [CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42820425999), [cobertura UI](https://github.com/jdlc86/CartaViva/actions/runs/42820426019).

### 4.2 Preguntas que la revisión debe contestar por escrito

1. **Custodia completa:** identificar diff real del candidato respecto a `main` sin depender del `compare` de GitHub truncado (aprox. 4293 commits ahead y 300 archivos de límite en el corte S33); enumerar cambios operativos, 98 migraciones nuevas y plan de rollback, y confirmar qué requeriría llevar realmente a `main`.
2. **Titularidad/ROOT:** verificar identidad y estado activo de ADMIN en **cada escritura** en el mismo límite SQL transaccional; solicitud dirigida al titular que resuelve servidor; aceptación, transferencia, revocación y recuperación forzosa por ROOT con auditoría; denegaciones cruzadas y concurrencia. No copiar la política de Fleetia ni tocarla.
3. **Seguridad de operaciones (#8/#17):** comprobar capacidades firmadas post-lock, caducidad/revocación, conexión SQL de mínimos privilegios y consultas GET tipadas, incluyendo arrays/objetos y cursos de historial inválidos.
4. **Sala/cocina (#4):** reconciliar el contrato vigente de tareas `ready → claim → cancel` y las entregas con el legado `picked_up` histórico, incluyendo usuario incorrecto, doble reclamación, SSE/auditoría, y consumo previo.
5. **M3/cliente (#5/#18–#22):** comprobar nueva categoría desde ADMIN hasta cliente real, opciones distintas, agotado/retirado, consentimiento de cambio de precio por línea, sincronización entre pestañas, modo offline, confirmación económica e idempotencia. Señalar qué aspectos **no** cubre el E2E S34.
6. **Integración completa:** comprobar separación de las dos PWA y ausencia de fugas de cookies/roles; ensamblador integral con los opt-ins requeridos, no solo los harness CI M3+H3/H4 y ADMIN+llamadas realizados en pruebas separadas.
7. **Visual/producto:** las capturas y axe **no sustituyen aprobación humana** F28/R09; verificar identidad visual aprobada sin inventar pantallas o estilos ni reclamar GO de Stripe M4, M6, CV-013/CV-014, piloto o producción.
8. **Dictamen administrativo uno a uno:** expresar en cada divergente `equivalencia verificada`, `sustitución normativa verificada`, `brecha` o `sin prueba`, con ruta/contrato/test y recomendación; explicitar si se pueden retirar los cinco H3 como familia y bajo qué condiciones.

### 4.3 Resultado solicitado al revisor y secuencia condicionada

La **revisión tiene que ser de un tercero/agente distinto del autor**, con evidencia versionada y un resultado explícito, no un comentario de autoaprobación. Estado actual: **0 reviews en #54**, por lo que la revisión **NO SE HA REALIZADO**.

**Plan, no acción ejecutada:**

1. Completar revisión independiente sobre #54 y nueve diferencias, registrar hallazgos y subsanaciones verificadas.
2. Obtener aceptación visual humana F28/R09 donde aplique. Esta puerta es distinta de los tests técnicos.
3. Acordar con el propietario **una estrategia explícita** para llevar el conjunto completo y revisado a `main`. En particular, **fusionar #54 tal como está a su base #53 no es fusionarlo a `main`**. Evaluar base/ramificación y diff exhaustivo sin reescribir SHA o saltarse controles.
4. Solo **tras integración real verificada en `main`**, proponer cierre sin merge individual de los **33 ancestros** y archivar su relación con el SHA integrado, con autorización específica del propietario.
5. Los **nueve divergentes** requieren disposición separada: propuesta preferente para #18–#22 como familia **solo tras verificación semántica independiente**, #5 después de mesas/roles/visual y #4/#8/#17 tras su evaluación crítica. No cerrar por antigüedad ni para disminuir el contador.
6. Mantener #54 como el único candidato integrador hasta que exista revisión y decisión. Después de integración, su estado se resolverá conforme a la estrategia autorizada; no ejecutar merge ahora.

## 5. Estado de ejecución de este documento

**Ejecutado:** censo y clasificación documental de 43 PR abiertos, matriz nominativa de 33 redundantes como PR separados, prioridad de los nueve divergentes y paquete verificable para revisión independiente. **No ejecutado:** review por un tercero, aprobación externa, cierre/merge/rebase/retarget, modificación de código de producto o pruebas, despliegue o cambio de `main`, VPS, Supabase operativo o Fleetia.

**Dictamen S4:** reducción recomendada del *backlog administrativo* potencial de **42 PR secundarios** si todo el trabajo se reconcilia y se integra correctamente; **NO afirma que 42 puedan cerrarse hoy**. La capacidad de pasar de 43 PR a uno solo depende de decisiones, pruebas y del destino de integración. **Estado actual: 43 abiertos, S4 NO-GO**.
