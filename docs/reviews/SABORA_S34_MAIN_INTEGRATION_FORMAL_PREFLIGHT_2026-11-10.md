# Sabora / CartaViva — S34: preflight formal de integración del candidato #54 hacia `main` (2026-11-10)

> **DICTAMEN DE PREPARACIÓN, NO REVISIÓN INDEPENDIENTE NI AUTORIZACIÓN DE MERGE.** Este expediente compara un SHA fijo de `main` con un SHA fijo de la rama integradora. La documentación normativa del repositorio prevalece; la continuidad solo contextualiza. Se han inspeccionado metadatos, árboles Git completos, reglas/CI, diferencias normativas, registro de migraciones y puertas de liberación. **No se ha ejecutado una nueva suite, enviado una revisión `APPROVED`, cambiado la base del PR, aplicado migraciones, fusionado o desplegado nada.**

**PR:** [#54 Draft](https://github.com/jdlc86/CartaViva/pull/54) · **base actual:** [#53](https://github.com/jdlc86/CartaViva/pull/53), rama `feat/sabora-cv014-waiter-calls-integral-20261109` · **ramal candidato:** `integration/sabora-s32-admin-waiter-sanitization-20261109` · **continuidad:** [S34](../handoffs/SESSION_34_HANDOFF_2026-11-10.md) · **saneamiento de PR:** [matriz S34](SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md).

## Estado vigente posterior al corte original — PR #54 retargeteado a `main` (10-11-2026)

**La base de [#54](https://github.com/jdlc86/CartaViva/pull/54) ES AHORA `main`, no #53.** El cambio de base **sí se ha ejecutado** en GitHub en la sesión 34, manteniendo la misma rama y sin fusionar código. La plataforma ha recalculado `mergeable=true`, `mergeable_state=clean`, **4.357 commits y 931 archivos cambiados** frente al `main` fijo `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. Estos resultados se aplican al HEAD documental `ec0c17d7730e37eae1efbd222df093e5422ca555` inmediatamente tras el retarget; los siguientes commits de documentación aumentan el conteo, sin modificar el código de aplicación.

**No interpretar las afirmaciones históricas de §§1–8 «base #53», «no se ha retargeteado» y «se requiere autorización para cambiar la base» como descripción vigente.** Se conservaron para trazabilidad de la preparación anterior. La **decisión de fusionar a `main` permanece separada y sin ejecutar**, así como cualquier cierre de PR.

**Control diferencial después de la última CI funcional:** comparación directa de árboles Git de `782974063bebe39fd423363eb2f806bc6b8acef9` y `ec0c17d7730e37eae1efbd222df093e5422ca555` (ambos `truncated=false`) muestra **4 documentos añadidos y 4 documentos modificados; 0 cambios no documentales**. La CI 6/6 del SHA funcional es evidencia útil, pero **se requiere ejecución sobre el último HEAD del PR ya dirigido a `main`** antes de decidir una integración. Los árboles del corte actual de la integración muestran 928 archivos añadidos + 3 modificados + 0 eliminados. El manifiesto congelado anterior contiene 929 rutas y se preserva como fotografía válida de su SHA, no como manifest mutable del HEAD nuevo.

**Alcance de aprobación:** el usuario ha indicado continuar el proceso de integración de desarrollo. No se convierte un retarget en aprobación de merge, aprobación independiente ni permiso para tocar Supabase, Fleetia o VPS. No existen usuarios ni servicio productivo activo según el usuario; las puertas de producción quedan separadas de la integración de desarrollo.

## 1. Evidencia reproducible — no confundir diff del PR y diff a `main`

| Comprobación | Resultado exacto |
| --- | --- |
| `main` congelado para comparación | `42b46358a76162445fa9e0b20e7b87dd0a640b5b` |
| #54 HEAD al corte de árboles | `e2b078abec100b1cd9ac770ca373bb40176a506d` |
| Merge-base entre esos SHA | mismo SHA de `main` |
| Commit ahead/behind | **4.349 por delante / 0 por detrás** |
| `git/trees?recursive=1` | **no truncado en ambos lados**: 21 blobs en `main`, 947 en #54 |
| Archivos **añadidos** | **926** |
| Archivos existentes **modificados** | **3** |
| Archivos **eliminados** | **0** |
| Cambios de rutas totales | **929** |
| Migraciones SQL nuevas | **98** |
| Workflows Actions nuevos | **6** |
| Archivos que GitHub `compare` devuelve en una sola llamada | **300/929**, insuficiente para auditar completamente |
| Diff habitual del PR #54 a su base #53 | **44 archivos, 173 commits** al corte; **NO ES** el diff a `main` |
| #54 revisiones | **0**; continúa Draft |
| Protección `main` | `protected=false`; no hay barrera GitHub obligatoria acreditada |

**Manifiesto completo y versionado:** [`SABORA_S34_MAIN_INTEGRATION_FILE_MANIFEST_2026-11-10.json`](SABORA_S34_MAIN_INTEGRATION_FILE_MANIFEST_2026-11-10.json). Contiene **929 rutas ordenadas**, estado añadido/modificado, Git blob SHA de destino y, en las tres modificaciones, Git blob SHA origen. **No** confundir Git blob SHA con un hash de migración SHA-256. El manifiesto captura `e2b078ab`; los commits de documentación generados después de ese corte **no están en la fotografía**. Antes de una revisión final o de tocar bases, **regenerar y confrontar el inventario con el HEAD congelado y `main` actual**.

**Desglose de los 926 archivos añadidos:**

| Área | Rutas |
| --- | ---: |
| `apps/api` | 207 |
| `docs` | 191 |
| `tests` | 187 |
| `scripts` | 102 |
| `supabase/migrations` | 98 |
| `apps/management` | 76 |
| `apps/client` | 36 |
| `packages` | 12 |
| `.github/workflows` | 6 |
| Raíz, despliegue y otros | 11 |
| **TOTAL** | **926** |

## 2. Tres documentos normativos de `main` que cambian, y por qué merecen revisión

Los **únicos tres blobs de `main` cambiados** son:

1. [`docs/REQUISITOS_FUNCIONALES.md`](../REQUISITOS_FUNCIONALES.md): sustituye la frase histórica de empleado/identificación corporativa por la identidad de **cliente** (alias, ID visible Sabora, UUID, empresa opcional), persistencia de sesión y Passkey opcional según contrato específico. **Verificar** que la prioridad de decisiones aprobadas prevalece y que las frases históricas `implementación pendiente` no se confunden con estado actual del código.
2. [`docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`](../architecture/SABORA_CONTRACT_CONSISTENCY_V1.md): cambia la situación documental del **cierre de cuenta de coste cero** (visita sigue abierta, cierre automático solo cuando todas las rondas, tareas e incidencias queden resueltas; saldo cero por reembolso no es coste cero); mantiene decisiones pendientes de caja y pagadores múltiples.
3. [`docs/security/ADMIN_WRITE_OWNERSHIP_V1.md`](../security/ADMIN_WRITE_OWNERSHIP_V1.md): añade patrón de invitación/Passkey y la **rectificación vinculante de ROOT**: ROOT gobierna, pero no ocupa la titularidad de escritura ordinaria; solo reasigna forzosamente a ADMIN activo con auditoría. El contenido de Fleetia es únicamente referencia de adaptación documentada; **no es dependencia ni autorización para tocar sus recursos**.

Los cambios están versionados en los tres blobs y proceden de decisiones históricas, pero un revisor debe confirmar la concordancia con [contrato consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [single writer](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [operación de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md) y el corpus normativo completo. El manifest no legitima por sí mismo una nueva interpretación.

## 3. Inventario y recuperación de 98 migraciones: control necesario

- Se contaron **98** archivos SQL bajo `supabase/migrations` en el árbol del candidato. El catálogo `REVIEWED_MIGRATION_AUDIT` de [`scripts/ci/migration-audit.mjs`](../../scripts/ci/migration-audit.mjs) tiene **98 registros únicos**: cotejadas las cadenas de nombre, **0 ausentes / 0 sobrantes**. Cada registro exige objeto, dependencias, permisos, impacto de locks/datos, compatibilidad, reversibilidad y `reviewed:true`; su ejecución se ha probado históricamente en PG17 aislado dentro del workflow Bootstrap.
- El [runbook P2 histórico del 29-10](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md) todavía especifica **exactamente 42 versiones** y una auditoría de 42/42. **Esto es un procedimiento de un corte anterior, no el preflight definitivo para las 98 migraciones actuales.** No usarlo sin rebaselinar inventario, locks, privilegios, estrategia forward-fix/restore y pruebas de recuperación sobre un SHA fijo; no reescribir la historia del 29-10 como si ya contuviera 98.
- Los [runbooks P3](../runbooks/SABORA_P3_RECOVERY_CONTINUITY_RUNBOOK_2026-10-29.md) son candidatos aislados; **RTO/RPO de producción no están definidos**. Los 98 SQL en una CI desechable no prueban reversión con volumen real, PITR gestionado, tiempos de bloqueo productivos ni recuperación completa de datos externos.
- **Bloqueador antes de migración/despliegue:** un *runbook operativo actualizado* a las 98 versiones con evidencia de copia representativa, manifiesto SHA256/orden, plan de parada y restauración, autorizaciones separadas DBA/seguridad/entorno. **No ejecutar ni apuntar CI contra Supabase operativo.**

## 4. CI existente y puertas no satisfechas

**Automatización acreditada sobre SHA FUNCIONAL exacto `782974063bebe39fd423363eb2f806bc6b8acef9`:** [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42820426039), [H6](https://github.com/jdlc86/CartaViva/actions/runs/42820425977), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42820426047), [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42820426063), [CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42820425999) y [funcional/UI](https://github.com/jdlc86/CartaViva/actions/runs/42820426019): **6/6 `completed/success`**, cliente Chromium en segundo intento por timeout de instalación previo. El [expediente M3→H3/H4](SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md) distingue el alcance PG17/Fastify/dos PWA del ensamblador total M3–H6. **No afirmar 6/6 en el HEAD documental posterior `e2b` o siguientes commits `[skip ci]`.**

**Gate visual:**
- [`docs/design/FUNCTIONAL_UI_COVERAGE.json`](../design/FUNCTIONAL_UI_COVERAGE.json) contiene **5 capacidades `CANDIDATO_TECNICO` y 1 `PENDIENTE` (reservas anticipadas CV-014)**, comprobado leyendo el JSON.
- [`visual-contract-gate.yml`](../../.github/workflows/visual-contract-gate.yml) contiene dos jobs distintos: `functional-ui-gate` (PR, validación de trazabilidad) y `visual-final-acceptance-gate` (solo `workflow_dispatch`). El segundo exige primero `--release` y baselines exactos, artefactos Chromium del SHA y aprobación personal. **NO se ha ejecutado ni aprobado la puerta final**.
- [`APPROVAL_REGISTER.md`](../design/APPROVAL_REGISTER.md) indica ausencia de baseline PNG exacto autorizado para cliente/gestión. El diseño/composición premium vigente se preserva; faltan aceptación humana F28/R09 y activos aprobados, no se inventan.

**Gobierno GitHub:** `main protected=false`. El workflow existe, pero **no impone por sí solo** revisión, aprobaciones ni checks. Requiere decisión administrativa separada sobre ruleset/protecciones, con el conjunto de comprobaciones exigibles antes de integrar. **No se han cambiado protecciones**.

**Por producto:** siguen pendientes revisión independiente (#54 y diferencias #4/#5/#8/#17/#18–#22), ensamblador global M3–H6, Stripe sandbox remoto M4, M6 operacional/recuperación, privacidad CV-013, reservas CV-014, piloto/autorización de producción. «6/6» no afirma que esos gates estén satisfechos.

## 5. Procedimiento de integración **propuesto**, aún no autorizado

**Elección recomendada para evitar otro PR redundante:** usar **#54 como único candidato de consolidación**, pero **no integrarlo contra #53 como si eso alcanzase `main`**. Una vía posible, **solo tras autorización expresa para cambiar la base**, es retargetear #54 de #53 a `main`, después de congelar HEAD, comparar los **929+** archivos por árboles y completar revisión independiente del delta real.

### Secuencia de puertas condicionadas

1. **Congelar** `main` y el SHA funcional/docs de #54; nueva auditoría completa de árboles y topología por script o GitHub Git trees (sin confiar en 300 primeras filas). Verificar las tres modificaciones de normativa, los 98 SQL, seis workflows y cumplimiento de restricciones de aislamiento.
2. **Obtener revisión por actor independiente** del autor, con conclusiones específicas para 9 divergentes, #52/#53 y módulos críticos. Una autoevaluación de ChatGPT **no es** esa aprobación. Si no se dispone de revisor, permanecer Draft.
3. **Aprobar la estrategia GitHub:** propietario decide protección de `main`, checks obligatorios, método de preservación de historial y si autoriza cambiar base de #54 a `main`. Evitar un segundo PR de integración salvo necesidad técnica demostrada. **No ejecutar retarget, rebase, force-push, merge ni cierre solo por este expediente**.
4. **Revalidar el PR contra `main`** y reejecutar la batería relevante del nuevo base/HEAD; comprobar que los seis checks referencian el SHA correcto, no solo CI en la base apilada. La revisión cubre también los archivos heredados (no solo los 44 actuales).
5. **Decisión de integración separada** y expresa del propietario después de revisión y checks, con inventario de límites pendientes; si se aprueba un merge de código no equivale automáticamente a GO productivo.
6. **Solo tras comprobar la presencia íntegra del código en `main`**, elaborar cierre documentado **sin merge individual** de los **33 PR ancestrales**, verificando contenido/identidad (un squash merge no hace que los SHAs históricos aparezcan como ancestros). Los nueve divergentes requieren decisión propia y consentimiento separado; no borrar ramas por comodidad.
7. **Despliegue siempre separado:** DBA/seguridad/operador autorizados; preflight de 98 SQL; VPS Sabora aislado; no tocar red, Docker, servicios ni volúmenes de Fleetia u otros proyectos.

### Requisitos para un dictamen `GO PARA REVISIÓN`

- Inventario 929 rutas trazable al SHA, sin ficheros ocultos por límite API.
- Matriz normativa + 98 migraciones auditadas con runbook vigente marcado explícitamente como pendiente de actualización.
- Evidencia CI exacta, jobs funcionales y visuales separados.
- Acceso del revisor a todos los archivos/commits desde `main`, no solo al diff #54→#53.
- Candidatura Draft intacta y registro de responsables/autorizaciones aún pendientes.

**Dictamen de preflight S34:** **LISTO COMO PAQUETE DOCUMENTAL PARA REVISIÓN; NO-GO PARA RETARGET/MERGE/PRODUCCIÓN SIN LAS DECISIONES PENDIENTES.** No hay revisión independiente ya practicada, no se ha integrado en `main` ni se han cerrado más PR. El candidato #54 puede continuar su saneamiento sin multiplicar PR, manteniendo la distinción entre implementación, pruebas CI y aceptación humana.

## 6. Acciones efectivamente ejecutadas durante este hito

- Lectura de GitHub del grafo, PR #54/#53, 43 abiertos Draft, 0 reviews, main sin protección; comparación **completa por árboles Git** y compare de 4349 commits.
- Cotejo de los tres blobs normativos modificados, 98 SQL frente a 98 entradas de auditoría y procedimientos de recuperación, seis workflows y estado funcional/UI.
- Creación de manifiesto de 929 archivos y este expediente de preflight, ambos **en la misma rama del #54**.
- **No** se han realizado en este hito nuevas pruebas, escrituras de código de producto, cambios normativos, cierres, reviews externas, retarget, merge, cambios a `main`, modificación de protecciones, ni operación en Supabase operativo, VPS o Fleetia.

_El documento fija una fotografía reproducible; antes de cualquier actuación de gobierno GitHub se requiere nueva comprobación de SHA y autorización específica._

## 7. Verificación cruzada del manifiesto y registro SQL — control de integridad S34

**Comprobación de lectura independiente de la generación del manifiesto, realizada sobre los SHAs inmutables declarados en §1:** se reobtuvieron del API Git los dos árboles recursivos completos `42b46358a76162445fa9e0b20e7b87dd0a640b5b` (`main` congelado, `truncated=false`) y `e2b078abec100b1cd9ac770ca373bb40176a506d` (candidato congelado, `truncated=false`); se generó de nuevo en memoria el conjunto de diferencias por ruta y Git blob SHA, y se cotejó contra **cada entrada** de [manifiesto de 929 archivos](SABORA_S34_MAIN_INTEGRATION_FILE_MANIFEST_2026-11-10.json).

**Resultado verificable:** **929/929 rutas coinciden exactamente; 926 añadidas, 3 modificadas y 0 eliminadas**; **0 rutas ausentes, 0 rutas inesperadas, 0 SHA de blob discrepantes y 0 rutas duplicadas**. Esta comprobación se hizo **sin usar** el límite de 300 archivos del compare REST. Su validez está limitada a **esos dos commits congelados**. No es prueba de que el HEAD dinámico posterior contenga solo cambios inocuos; cada cambio exige nueva comparación final.

**Inventario de migraciones:** se compararon los 98 nombres de archivo `.sql` bajo `supabase/migrations` del mismo árbol congelado contra las claves explícitas de `REVIEWED_MIGRATION_AUDIT` en `scripts/ci/migration-audit.mjs`: **98/98 coinciden, 98 claves únicas, 0 omisiones, 0 excedentes, 0 duplicados**. Esto verifica presencia y registro nominal, **no** deriva automáticamente un plan de reversión ni acredita evaluación independiente del contenido SQL. El runbook de recuperación P2 contiene únicamente el alcance histórico de **42 migraciones**, por lo que **la puerta de restauración de 98 versiones permanece abierta**.

**Puertas tras este control:** revisión independiente de las 929 rutas y de las decisiones normativas críticas; nuevo SHA fijo y CI contra la base de destino real si se autoriza retarget; controles administrativos de GitHub en `main`; plan de migración/restauración con responsables; aceptación visual final y activación productiva como decisiones separadas. **No-GO para merge/retarget/despliegue** a partir de esta verificación por sí sola. No se han cambiado código, permisos, ramas de destino, CI, VPS, Fleetia ni Supabase operativo.

## 8. Aclaración de entorno del propietario: desarrollo sin usuarios ni producción activa (10-11-2026)

**Hecho declarado por el propietario en la conversación de S34:** «Ahora mismo no hay usuario, no hay escenario de producción activo». Se registra como **declaración de alcance**, no como descubrimiento técnico de conectores, ausencia de datos en la base, certificación de infraestructura o permiso para utilizar el proyecto Supabase existente. Si esta condición cambia, reabrir la evaluación de riesgo antes de operar.

### Separación de puertas — corregir la lectura excesivamente conservadora de §§3–5

| Puerta | Para integrar código en `main` de este proyecto todavía en desarrollo | Para activar servicio/datos reales |
| --- | --- | --- |
| Requisitos y semántica de seguridad | **Sí**: contrastar contratos vigentes y diferencias de PR, mínimos privilegios, ADMIN titular/ROOT y RLS. El uso posterior no exime corregir defectos de seguridad ahora | **Sí**, más comprobación operativa de identidades y secretos |
| Trazabilidad de diff + integración | **Sí**: evitar fusionar #54 contra #53 creyendo que es `main`; inventario completo y revalidación del nuevo SHA/base | **Sí**, además liberación y control de artefactos |
| CI PG17 y ambas PWA | **Sí**: suites integradas sobre SHA y destino final; los 6/6 de `78297406` son evidencia previa, no aprobación del SHA nuevo | **Sí**, más aceptación en el entorno real y monitoreo |
| Revisión independiente y autorización de `main` | **Pendiente** conforme al gobierno de saneamiento S32–S34. No fingir aprobación; si no hay revisor disponible, registrar bloqueo de revisión sin sustituirlo con autorrevisión. La configuración de protección de GitHub se decide aparte | **Sí**; autorización explícita de operación y despliegue |
| Runbook P2 ampliado de 42 a 98, PITR, RTO/RPO, respaldo de datos activos | **NO bloquear solo el merge de código** por esta puerta de **despliegue** mientras no haya usuarios/datos productivos que migrar. Conservar el diagnóstico: runbook de 42 es insuficiente para cualquier ejecución real de 98 migraciones en un servicio operativo | **Obligatorio antes** de aplicar migraciones/usar datos reales; pruebas de restauración, RTO/RPO, responsables y copias autorizadas |
| Stripe sandbox remoto M4, credenciales de terceros, observabilidad M6 productiva | **NO** exigir éxito con proveedores reales para permitir integrar módulos incompletos/aislados a `main`, **siempre que** las rutas no validadas permanezcan inactivas/fail-closed y no se presente una funcionalidad como lista | **GO propio** antes de activar cobros y operación |
| Aprobación visual humana exacta F28/R09 y reservas pendientes | **NO** convertir la puerta de estilo final en bloqueo de integración de código funcional; [AGENTS.md](../../AGENTS.md) obliga a priorizar funcionalidad y usabilidad sin adjudicar aprobación final. Mantener la matriz PWA sincera | **Pendiente** para aceptación visual/lanzamiento y funciones aún no terminadas |
| VPS y Fleetia | **Fuera de alcance**, no dependen del merge de GitHub | **Siempre requieren autorización, aislamiento verificable y prohibición de afectar Fleetia** |

**Conclusión diferenciada:** la ausencia declarada de usuarios y producción **reduce el riesgo de migración de datos existentes**, y evita imponer indiscriminadamente puertas de release a un merge de desarrollo. **No elimina** el riesgo de introducir código defectuoso en `main`, de dejar seguridad incorrecta, de perder trazabilidad al cerrar 33 PR ni de confundir las ramas apiladas. **No autoriza** usar/migrar Supabase operativo ni desplegar.

**Secuencia eficiente recomendada para cerrar S4:** realizar revisión independiente de los contratos de seguridad y nueve divergencias (o registrar explícitamente su falta), fijar la vía única hacia `main` en PR #54 sin PR adicionales innecesarios, obtener autorización específica para retarget/merge, revalidar suites del SHA/base, integrar, confirmar el árbol de destino y solo entonces proponer saneamiento de ancestros. **Visual final, proveedores y recuperación productiva siguen como hitos posteriores**, no como excusa para prolongar indefinidamente la estabilización del repositorio.

**Acciones por esta aclaración:** solo documentación y reordenación de puertas; sin nuevas pruebas, cambios de seguridad, reglas GitHub, PR, retarget, merge, cambios en `main`, Supabase, VPS o Fleetia.

## 9. Resultado final de CI sobre PR #54 con base `main` — S34-9 (10-11-2026)

**Puerta S3 del candidato reorientado: PASS automatizado.** La consulta directa de los seis `actions/runs` de GitHub ha confirmado **seis workflow runs `completed/success`, primera ejecución cada uno, todos en el mismo SHA `d49ee05b103620ce30cfc976fa62182cc9d954df`**, que es el commit que provocó CI tras apuntar [#54](https://github.com/jdlc86/CartaViva/pull/54) a **`main`**. Al consultar el PR, su HEAD seguía siendo exactamente `d49ee05b`, su base `main`, `mergeable_state=clean`, Draft y sin reviews. No se mezclan resultados de `78297406` ni de ramas antiguas.

| Workflow y enlace | Run ID | Resultado exacto |
| --- | --- | --- |
| [Bootstrap lockfile, PG17, Node driver, Docker Sabora](https://github.com/jdlc86/CartaViva/actions/runs/42836528469) | `42836528469` | **SUCCESS**: PG17 real desechable, Docker aislado |
| [H6 consolidado, PG17, HMAC, concurrencia y Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42836528459) | `42836528459` | **SUCCESS**: etapa de aceptación consolidada |
| [PWA cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42836528305) | `42836528305` | **SUCCESS** |
| [PWA gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42836528322) | `42836528322` | **SUCCESS** |
| [Independencia e instalabilidad CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42836528449) | `42836528449` | **SUCCESS** |
| [Cobertura funcional/UI](https://github.com/jdlc86/CartaViva/actions/runs/42836528481) | `42836528481` | **SUCCESS**; el job separado `visual-final-acceptance-gate` sigue **SKIPPED** por ser de aceptación humana y `workflow_dispatch` |

**Verificación técnica adicional en Github:** el job H6 `129900098271` tiene `success` en su etapa «H6 consolidated acceptance (contracts + disposable PG17 + Chromium)» y Docker en red aislada. El job Bootstrap `129900098922` presenta `success` en cadena PG17, driver PG real, imágenes y contenedor aislado. La CI de esta ronda **no falló ni necesitó repetición**. La finalidad de este control es validar código ya implementado en destino de PR `main`, **no** certificar un entorno desplegado.

**Confrontación de nueve divergencias:** los HEAD históricos #4, #5, #8, #17, #18, #19, #20, #21 y #22 siguen **diverged** al compararlos con `d49ee05b`, con commits exclusivos en cada lado. No se ha demostrado paridad semántica global solo por un `6/6`. Mantener propuestas de [expediente S34 por PR](SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md): #18–#22 candidatos en bloque a conciliación, #5 con rutas de mesas/visual pendientes, #4/#8/#17 críticos de operación/seguridad. **Ninguno debe cerrarse solo con CI verde.** Los 33 ancestros no están en `main` todavía.

**Puertas restantes para el merge de desarrollo, separadas de producción:** revisión crítica de contratos y de diferencias de seguridad/cocina/sala, revisión independiente externa **aún 0 reviews**, autorización de integrar en `main` y verificación del SHA final. `main` continúa en `42b46358a76162445fa9e0b20e7b87dd0a640b5b` y sin protección; el retarget no fusiona código. El usuario ha declarado ausencia de usuarios/producción activa, por lo que Stripe remoto, backup/RTO/PITR productivo y visual final **no son prerequisitos de este merge de desarrollo**, pero siguen bloqueando sus propias activaciones. No hubo operación en Supabase, VPS ni Fleetia.

**Dictamen actualizado:** **GO técnico de CI para solicitar revisión/decisión de merge de desarrollo de #54, NO merge realizado, NO aprobación independiente**. Si se modifica código del candidato, volver a validar su SHA. Los commits exclusivamente documentales posteriores con `[skip ci]` no tienen nuevas ejecuciones y no se describirán como ensayados.

## 10. Revisión técnica preparatoria de código y PR Ready for Review — S34-10 (10-11-2026)

**Acción efectivamente ejecutada:** [PR #54](https://github.com/jdlc86/CartaViva/pull/54) ha cambiado de **Draft** a **Ready for Review**, conservando la base `main` y sin fusionar. La descripción/título del PR explicitan que es una **revisión de integración de desarrollo**, no una release aprobada. El último SHA probado permanece **`d49ee05b103620ce30cfc976fa62182cc9d954df`**, 6/6 workflows SUCCESS (§9); el HEAD posterior añade únicamente documentación `[skip ci]` y no tiene batería propia. En las revisiones registradas de #54 existe **0 APPROVED y 0 revisiones**, y no se ha identificado un revisor humano independiente en los antecedentes consultados (#52/#53/#45/#32); no inventar asignación o aprobación.

### Cotejo manual acotado al código vigente — no revisión independiente

| Contrato/PR histórico | Archivo actual e invariante comprobado por lectura | Evidencia y límite |
| --- | --- | --- |
| Titularidad ADMIN/ROOT (#52) | `apps/api/src/transactional-admin-write.mjs` bloquea singleton `FOR UPDATE`, reconsulta `staff_members` `FOR UPDATE`, exige ADMIN `active` y coincidencia con propietario antes de `mutate`; excluye a ROOT de la escritura ordinaria | En `m2-restaurant-candidate.mjs`, gobierno opt-in pasa `assertOwnershipRuntimeIdentity` y el `allowedSql` permite **solo** `OWNERSHIP_SQL`; `ownership-governance-candidate.mjs` deriva actor de `verifiedIdentity/verifiedStaff`, no del cuerpo. PG17+JWT/HMAC real en Bootstrap; no aprovisionamiento operativo |
| Capacidad SQL y bloqueo (#8) | `apps/api/src/order-operation-capability.mjs` firma actor, rol de login, línea, destino, correlación y expiración; las migraciones candidatas restringen grants y hacen verificación SQL. `20261109010000_sabora_ownership_post_lock_expiry_candidate.sql` revalida caducidad después de esperar locks | CI PG17/H6, roles restringidos y concurrencia PASS; una lectura del código no es pentest externo ni confirma configuración real de secretos |
| GET H4 (#17) | `apps/api/src/order-operations-http.mjs` exige strings escalares en `status/limit/cursor`, valida valor de `limit` y clave exacta, evita coerción de arrays hacia `Number` | El propio parche histórico #17 concuerda con este control y la batería H6 PASS; no afirmar equivalencia de todo el módulo solo por ese parche |
| Cocina/sala (#4) | `apps/api/src/m2-restaurant-candidate.mjs` llama `registerOrderOperationsHttp(...,legacyPickupDisabled:true)` y monta H6 nuevo por separado, impidiendo que el endpoint candidato activo ofrezca recogida legada `picked_up` | No revivir los estados del PR antiguo. La equivalencia total de denegaciones, concurrencia y percepción de la PWA de sala queda bajo revisión de la semántica H6 aprobada |
| Gestión M3 (#5) | `apps/management/src/views/CatalogView.tsx` enruta al editor `M3CatalogManagementView` si hay `managementGateway`; el lector legado de categorías estáticas solo se usa sin dicho gateway | El E2E PG17 de M3 catálogo dinámico publicó categoría/plato y llegó a cliente; faltan conformidad visual y todo el dominio de mesas |
| Cesta y consentimiento H3 (#18–#22) | `apps/client/src/client-state.ts` conserva variantes por configuración y funciones `basketIssues/acceptBasketPrice`; `App.tsx` escucha `storage`, mantiene líneas de variante y no deja confirmar incidencias sin resolver | El E2E M3→cliente→H3→cocina con dos variantes y reprecio + SQL real PASS; aún no puede afirmarse equivalencia universal de casos de agotado, reconexión o sincronización |

**Corrección de verdad documental sin alterar decisiones normativas:** se añadieron únicamente notas fechadas de *estado técnico* a [SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md) y [SABORA_OWNERSHIP_OPERATION_CONTRACT](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), porque sus frases históricas describían gobierno sin HTTP, mientras la rama actual tiene registro opt-in y RPC de mínimos privilegios en PG17 desechable. Las prohibiciones a ROOT, la titularidad única y los requisitos de autorización permanecen idénticos. Esas adendas son **documentación**, no migraciones ni aprobación del funcionamiento productivo.

**Dictamen de la revisión preparatoria:** no se encontró, en **estos puntos concretos**, contradicción directa demostrada que justifique restaurar los nueve commits divergentes o bloquear el paso a una revisión formal. **No es una revisión de todos los archivos ni independencia del autor**; hay **0 reviews** de terceros. La aprobación de merge de desarrollo en `main` y la disposición de 33+9 PR continúan separadas y pendientes. El registro de GO técnico de CI en §9 no cambia a GO productivo ni a merge automático. No se creó PR adicional, no se reejecutaron suites por comentarios `[skip ci]` ni se tocó Supabase operativo, VPS o Fleetia.

## 11. Integración a main ejecutada y contenido comprobado — S34-11 (10-11-2026)

**Autorización expresa del propietario:** el usuario aceptó integrar #54 en `main` como **código de desarrollo sin esperar revisión independiente**, asumiendo esa excepción de gobierno. Esta decisión NO autoriza desplegar, aplicar SQL operativo, reiniciar el VPS o cerrar los nueve PR divergentes.

**Operación efectivamente ejecutada:** GitHub API fusionó [PR #54](https://github.com/jdlc86/CartaViva/pull/54), mediante **merge commit normal** (no squash ni rebase) con control `expected_head_sha=9c03ed0a25320f7502a18854b1b31bfd4e771bf4`. Resultado `merged=true`; `main` pasó de `42b46358a76162445fa9e0b20e7b87dd0a640b5b` a **[`a91867fbacb9319d16496b04a5fe237739c31837`](https://github.com/jdlc86/CartaViva/commit/a91867fbacb9319d16496b04a5fe237739c31837)**. Se comprobaron padres de merge: primero `42b46358...` (`main` antiguo); segundo `9c03ed0...` (HEAD exacto del #54).

**Integridad de contenido verificada:** los árboles recursivos Git de `main@a91867fb` y del HEAD exacto `9c03ed0`, ambos `truncated=false`, contienen **949 blobs cada uno, con 949/949 rutas y Git blob SHA iguales**; ningún archivo perdido, sustituido ni borrado durante la fusión. El control directo posterior informa [PR #54](https://github.com/jdlc86/CartaViva/pull/54) `state=closed/merged=true`, `main` en el SHA anterior y **41 PR todavía abiertos**. GitHub marcó además [PR #1](https://github.com/jdlc86/CartaViva/pull/1) como `merged=true` de forma automática (sin cierre manual), con `merged_at` 2026-11-10T15:15:07Z.

**Estado corregido del backlog:** de 43 antes del merge a **41 abiertos** después; **32 ancestrales** de #54 siguen abiertos como propuestas superpuestas y **nueve divergentes** #4/#5/#8/#17/#18/#19/#20/#21/#22 siguen pendientes de su conciliación semántica. Aunque el código genealógico de las ramas ancestrales está incorporado al merge commit, **no afirmar que los nueve divergentes estén totalmente absorbidos** ni convertir el auto-merge #1 en aprobación externa. No se han ejecutado cierres manuales de los 32+9 restantes. Sus disposiciones y autorizaciones son un hito administrativo posterior.

**CI y riesgos delimitados:** seis workflows del SHA `d49ee05b103620ce30cfc976fa62182cc9d954df` del PR apuntando a `main` dieron `SUCCESS` (§9). Un cotejo de árboles entre ese SHA probado y el HEAD exacto fusionado `9c03ed0` reveló solo **cinco rutas de documentación modificadas**, sin cambios en aplicaciones, SQL, workflows ni tests. Esto respalda funcionalmente el contenido integrado, pero **no es una ejecución CI del merge commit**; no atribuir a este SHA prueba inexistente. La aprobación independiente seguía ausente y se omitió por decisión consciente del propietario, no porque el repositorio la hubiera satisfecho.

**Hito realmente alcanzado:** **integración de desarrollo a main COMPLETADA**; **saneamiento administrativo de 41 PR NO FINALIZADO**; activación de producción y verificación visual definitiva pendientes por separado. `main` sigue sin protecciones GitHub según lectura previa; definirlas es decisión posterior. No se ejecutaron migrations de Supabase operativo ni cambios en Docker/VPS/Fleetia. Esta actualización documental posterior al merge no crea una nueva validación de runtime.

## 12. Post-merge: comprobación de los 32 PR ancestrales (S34-12, 10-11-2026)

**Comprobación específica, no inferencia:** tras [fusionar #54](https://github.com/jdlc86/CartaViva/pull/54), se reconsultaron GitHub y **los HEAD actuales de los 32 PR que permanecen abiertos** en el conjunto previamente clasificado como ancestro. Para cada PR se invocó `compare_commits` con **base = SHA exacto del HEAD de ese PR** y **head = `a91867fbacb9319d16496b04a5fe237739c31837`** (`main` tras integración). Todos devolvieron `status=ahead`, `behind_by=0` y **`merge_base_commit.sha = HEAD del propio PR`**, lo que acredita que **32/32 HEAD son ancestros del merge de `main`**, incluidos #52 y #53. Esta comprobación no altera ningún PR ni depende del truncamiento de archivos del diff.

| Grupo | Números verificados individualmente | Resultado |
| --- | --- | --- |
| Base y primeras funciones | #2, #7, #10, #11, #12, #13, #15, #16 | **8/8** `HEAD ⊆ main@a91867fb` |
| H3 y cliente | #23, #24, #25, #26, #27, #28, #29, #30 | **8/8** |
| H6/sala/cocina | #32, #34, #36, #38, #41, #42, #43, #45, #46 | **9/9** |
| M2/M3/gestión y gobierno | #47, #48, #49, #50, #51, #52, #53 | **7/7** |
| **Total** | **32 PR abiertos con HEAD incorporado a main** | **32/32** |

Además, **#1 fue marcado como merged automáticamente por GitHub**, y [#54](https://github.com/jdlc86/CartaViva/pull/54) `merged=true`. No quedan pendientes otras ramas **ancestrales con commits exclusivos** según la consulta; por contra, los nueve PR #4/#5/#8/#17/#18–#22 permanecen clasificados como **divergentes**, no se atribuyen a este recuento ni se recomienda cerrarlos por simple genealogía.

**Disposición preparada:** los **32 PR anteriores son administrativamente redundantes como propuestas de integración del código que YA está en `main`**, y podrían cerrarse **sin hacer merges individuales, sin borrar ramas y sin perder sus commits**, cada uno enlazando a la integración `a91867fb`. Queda pendiente la **autorización específica para ejecutar cierres**; aceptar el merge de #54 no se reinterpretó como permiso para cerrar indiscriminadamente PR secundarios. El procedimiento preferente es registrar una sola disposición auditable de los 32, verificar su estado y preservar los nueve divergentes hasta conciliación semántica formal.

**CI posterior a la fusión:** GitHub inició automáticamente [Sabora CI sobre `main@a91867fb`](https://github.com/jdlc86/CartaViva/actions/runs/42842459366) con evento `push`. En la consulta de este hito figuraba `status=in_progress` y `conclusion=null`, por lo que **NO se declara éxito, fallo ni aceptación hasta que termine**. La CI anterior (6/6) pertenece a `d49ee05b`, no a este merge commit. Las adendas `[skip ci]` de documentación en `main` son posteriores, con SHA propio y sin nuevas pruebas de runtime.

**Estado de saneamiento:** integración completa en `main` y genealogía de 32/32 verificadas; 41 PR aún abiertos (32 redundantes genealógicos + 9 divergentes); **cierre administrativo pendiente**, **sin despliegue, sin migraciones a Supabase operativo ni intervención en Fleetia/VPS**.

## 13. S34-13 — cierre ejecutado de 32 PR ancestrales verificados (10-11-2026)

**Autorización expresa y distinta del merge:** el propietario indicó «Adelante con los 32 PR» tras [la comprobación de genealogía 32/32](#12-post-merge-comprobación-de-los-32-pr-ancestrales-s34-12-10-11-2026). No se ha ampliado esa autorización a las nueve divergencias ni a despliegues.

**Preflight de cierres contra el SHA actualizado:** antes de cambiar estados se reconsultó `main@9ced23b7759d6748f787dd786d6339405b6b21d4`, con [PR #54](https://github.com/jdlc86/CartaViva/pull/54) ya fusionado. Se repitió la comparación para **cada HEAD de los 32 PR**: `compare_commits(base=HEAD propio, head=main@9ced23b)` devolvió **32/32 `status=ahead`, `behind_by=0` y `merge_base_commit.sha=HEAD del PR`**. Ninguno conservaba commits exclusivos que hubiera que fusionar. La fuente de verdad de los contratos y el código es el árbol de `main`, no las notas de continuidad.

| Familia | PR cerrados sin merge individual, tras verificar ancestro | Resultado API |
| --- | --- | --- |
| Base e identidad | [#2](https://github.com/jdlc86/CartaViva/pull/2), [#7](https://github.com/jdlc86/CartaViva/pull/7), [#10](https://github.com/jdlc86/CartaViva/pull/10), [#11](https://github.com/jdlc86/CartaViva/pull/11), [#12](https://github.com/jdlc86/CartaViva/pull/12), [#13](https://github.com/jdlc86/CartaViva/pull/13), [#15](https://github.com/jdlc86/CartaViva/pull/15), [#16](https://github.com/jdlc86/CartaViva/pull/16) | **8/8 `closed`, `merged=false`** |
| H3 / cliente | [#23](https://github.com/jdlc86/CartaViva/pull/23), [#24](https://github.com/jdlc86/CartaViva/pull/24), [#25](https://github.com/jdlc86/CartaViva/pull/25), [#26](https://github.com/jdlc86/CartaViva/pull/26), [#27](https://github.com/jdlc86/CartaViva/pull/27), [#28](https://github.com/jdlc86/CartaViva/pull/28), [#29](https://github.com/jdlc86/CartaViva/pull/29), [#30](https://github.com/jdlc86/CartaViva/pull/30) | **8/8 `closed`, `merged=false`** |
| H6 / cocina / sala | [#32](https://github.com/jdlc86/CartaViva/pull/32), [#34](https://github.com/jdlc86/CartaViva/pull/34), [#36](https://github.com/jdlc86/CartaViva/pull/36), [#38](https://github.com/jdlc86/CartaViva/pull/38), [#41](https://github.com/jdlc86/CartaViva/pull/41), [#42](https://github.com/jdlc86/CartaViva/pull/42), [#43](https://github.com/jdlc86/CartaViva/pull/43), [#45](https://github.com/jdlc86/CartaViva/pull/45), [#46](https://github.com/jdlc86/CartaViva/pull/46) | **9/9 `closed`, `merged=false`** |
| M2/M3 / gobierno / UI | [#47](https://github.com/jdlc86/CartaViva/pull/47), [#48](https://github.com/jdlc86/CartaViva/pull/48), [#49](https://github.com/jdlc86/CartaViva/pull/49), [#50](https://github.com/jdlc86/CartaViva/pull/50), [#51](https://github.com/jdlc86/CartaViva/pull/51), [#52](https://github.com/jdlc86/CartaViva/pull/52), [#53](https://github.com/jdlc86/CartaViva/pull/53) | **7/7 `closed`, `merged=false`** |
| **Total** | **32 PR cerrados individualmente sin ejecución de otros merges** | **32/32 confirmados** |

**Verificación posterior de GitHub:** la API de `pulls?state=open` devolvió **exactamente nueve PR abiertos**: [#4](https://github.com/jdlc86/CartaViva/pull/4), [#5](https://github.com/jdlc86/CartaViva/pull/5), [#8](https://github.com/jdlc86/CartaViva/pull/8), [#17](https://github.com/jdlc86/CartaViva/pull/17), [#18](https://github.com/jdlc86/CartaViva/pull/18), [#19](https://github.com/jdlc86/CartaViva/pull/19), [#20](https://github.com/jdlc86/CartaViva/pull/20), [#21](https://github.com/jdlc86/CartaViva/pull/21), [#22](https://github.com/jdlc86/CartaViva/pull/22). Ninguno de los 32 aparecía aún abierto, y `main` no cambió durante los cuatro lotes de cierres. **No se borraron ramas, no se reescribió historial, no se crearon PR nuevos**. El cierre de un PR cuyo HEAD está en el grafo de main **no significa** que GitHub marque individualmente `merged=true`; la integración del código ocurre por el merge previo de #54.

**CI de post-integración comprobada después:** [Sabora CI run #42842459366](https://github.com/jdlc86/CartaViva/actions/runs/42842459366), `event=push`, `head_sha=a91867fbacb9319d16496b04a5fe237739c31837`, **`completed/success`**. Esta ejecución real actualiza la observación histórica `in_progress` del §12. Los cierres de 32 PR **no alteran código** ni son una nueva prueba funcional; el `main` documental de lectura posterior es `9ced23b...`.

**Dictamen de saneamiento:** **S4 rama ancestral COMPLETADO**. Quedan **9 divergencias abiertas**; su reconciliación debe preservar requisitos de seguridad, cocina/sala, catálogo M3 y H3 y exigir decisiones propias. **S4 global permanece parcialmente abierto**. No hubo operaciones en Supabase operativo, VPS, Fleetia ni lanzamiento productivo.
