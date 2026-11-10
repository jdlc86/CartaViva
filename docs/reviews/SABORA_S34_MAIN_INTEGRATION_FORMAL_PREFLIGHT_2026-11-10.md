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
