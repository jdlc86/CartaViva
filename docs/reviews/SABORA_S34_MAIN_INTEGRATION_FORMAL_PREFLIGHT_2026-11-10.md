# Sabora / CartaViva — S34: preflight formal de integración del candidato #54 hacia `main` (2026-11-10)

> **DICTAMEN DE PREPARACIÓN, NO REVISIÓN INDEPENDIENTE NI AUTORIZACIÓN DE MERGE.** Este expediente compara un SHA fijo de `main` con un SHA fijo de la rama integradora. La documentación normativa del repositorio prevalece; la continuidad solo contextualiza. Se han inspeccionado metadatos, árboles Git completos, reglas/CI, diferencias normativas, registro de migraciones y puertas de liberación. **No se ha ejecutado una nueva suite, enviado una revisión `APPROVED`, cambiado la base del PR, aplicado migraciones, fusionado o desplegado nada.**

**PR:** [#54 Draft](https://github.com/jdlc86/CartaViva/pull/54) · **base actual:** [#53](https://github.com/jdlc86/CartaViva/pull/53), rama `feat/sabora-cv014-waiter-calls-integral-20261109` · **ramal candidato:** `integration/sabora-s32-admin-waiter-sanitization-20261109` · **continuidad:** [S34](../handoffs/SESSION_34_HANDOFF_2026-11-10.md) · **saneamiento de PR:** [matriz S34](SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md).

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
