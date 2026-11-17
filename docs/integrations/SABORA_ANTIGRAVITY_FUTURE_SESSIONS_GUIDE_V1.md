# Sabora / CartaViva — guía operativa de Antigravity para futuras sesiones (V1, 17-11-2026)

> **GUÍA DE USO Y CONTINUIDAD, NO CONTRATO NORMATIVO NI AUTORIZACIÓN.** La fuente de verdad de requisitos, seguridad, estética, SQL, despliegue y aprobaciones sigue siendo la normativa de GitHub. Leer primero [AGENTS.md](../../AGENTS.md), normativa pertinente, [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [última continuidad](../handoffs/SESSION_42_HANDOFF_2026-11-17.md) y el [contrato del puente Antigravity V1](SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md). Verificar sus revisiones actuales antes de actuar.
>
> **Ubicación y estado:** este documento se introduce **solo en la rama Draft del [PR #59](https://github.com/jdlc86/CartaViva/pull/59)** (`docs/sabora-dual-backup-vps-offsite-20261113`), todavía fuera de `main` al crear esta guía. Las sesiones futuras deben buscarlo en la rama de trabajo mientras no se haya integrado. Ni esta guía ni un informe `GO` permiten merge o despliegue.

## 1. Para qué sirve y qué NO hace

Permite que una sesión de ChatGPT encargue una **auditoría auxiliar, de solo lectura, sobre un SHA exacto** del repositorio `jdlc86/CartaViva` sin hablar directamente con el PC Windows. La sesión publica un **GitHub Issue** con un bloque JSON `SaboraAuditRequest v1.0`; el orquestador local del propietario lo recoge cuando está operativo, pide a Antigravity inspeccionar un worktree temporal y publica en el mismo Issue un comentario con un único bloque JSON de informe. ChatGPT relee y contrasta el resultado con código, pruebas y normas.

- **ChatGPT/GitHub:** crea y consulta el Issue, verifica autor, etiqueta, SHA, rutas y respuesta, actualiza documentación cuando se cierra un hito.
- **Equipo Windows del propietario:** alberga `agy.exe`, `start_realtime_bridge.ps1`, `webhook_listener.py`, `poll_github_audits.py`, `gh webhook forward` y el worktree efímero. **Estos scripts viven fuera del repositorio Sabora; ChatGPT no puede invocarlos ni inspeccionarlos solo por crear el Issue.**
- **Antigravity:** devuelve un informe consultivo. Ni `GO` ni `GO_WITH_WARNINGS` equivalen a aprobar PR, revisión Codex obligatoria, validación humana de diseño, SQL operativo, accesos, copias reales, merge o despliegue.

**Frontera innegociable:** jamás tocar Fleetia ni proyectos ajenos al VPS; ninguna modificación del VPS, Supabase operativo, DNS, red, secretos o despliegues por el hecho de solicitar una auditoría. Nunca subir claves de Windows, tokens, rutas sensibles ni información privada al Issue (el repositorio es público).

## 2. Evidencia REAL y resultado histórico (no confundir con disponibilidad permanente)

| Evidencia | Resultado verificable | Alcance y limitaciones |
| --- | --- | --- |
| [Issue #62 — primera auditoría S42](https://github.com/jdlc86/CartaViva/issues/62) y [comentario del informe](https://github.com/jdlc86/CartaViva/issues/62#issuecomment-6934523316) | Informe publicado el 17-11-2026 con `GO_WITH_WARNINGS`, SHA `ad07c4d7d0fc18e57f674d445a256ea24f7f2873`, etiqueta `audit-completed`. Hallazgos `AUD-S42-001` a `005`. | **El propietario tuvo que lanzarlo manualmente**: no demuestra recepción automática de este primer encargo. Las dos observaciones MEDIUM deben tratarse como riesgos a comprobar/corregir, no como mejoras ignorables. |
| [Issue #63 — prueba automática mínima](https://github.com/jdlc86/CartaViva/issues/63) y [comentario](https://github.com/jdlc86/CartaViva/issues/63#issuecomment-6934620403) | Issue `audit-request` creado 01:11:18 UTC; informe a las **01:11:44 UTC**; cambio a `audit-completed` a las **01:11:46 UTC**. Informe `GO`, una ruta `AGENTS.md`, misma SHA de 40 caracteres, respuesta sobre Fleetia y JSON único validable. **Sin lanzamiento manual de Antigravity por ChatGPT.** | **Prueba nominal automática superada** (~26 s hasta comentario), no prueba persistencia tras reiniciar Windows, pérdida de webhooks, autoría criptográfica del proceso, permisos OS reales ni idempotencia bajo reenvío. |
| [CI de `ad07c4d7`](https://github.com/jdlc86/CartaViva/commit/ad07c4d7d0fc18e57f674d445a256ea24f7f2873/checks) | **9/9 jobs aplicables SUCCESS**; dos puertas opt-in `SKIPPED`: visual final y CV-005 B2. | Estas pruebas acreditan el **contrato del repositorio** y otras baterías técnicas, no la seguridad del Windows local, la operación real o aprobación del PR #59. |

**Estado a 17-11-2026:** el circuito nominal GitHub Issue → orquestador Windows → Antigravity → comentario GitHub se ha comprobado **una vez automáticamente** (Issue #63); la recepción no atendida es **dependiente de que el puente local esté funcionando**. No presentar una sola prueba como fiabilidad 24/7.

## 3. Lecturas obligatorias ANTES de encargar una auditoría

1. Normativa de `AGENTS.md` y los contratos afectados. Para seguridad económica: `docs/REQUISITOS_FUNCIONALES.md`, `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, contratos de autorización/validación y migraciones correspondientes. Para UI: contrato visual y registro de aprobación. **Los handoffs no prevalecen sobre normas.**
2. Este documento y [`SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md`](SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md); inspeccionar el código [`scripts/ci/sabora-antigravity-audit-contract.mjs`](../../scripts/ci/sabora-antigravity-audit-contract.mjs) y [sus pruebas](../../tests/sabora-antigravity-audit-contract.test.mjs) si el esquema/canal ha cambiado.
3. [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), continuidad más reciente, [PR #59](https://github.com/jdlc86/CartaViva/pull/59), y cualquier Issue previo para **evitar duplicar encargos**. Evaluar si cabe una única revisión integral y no nuevas micro-auditorías redundantes.
4. **Verificar el SHA de 40 caracteres del código a auditar** en GitHub. Puede ser un SHA anterior al HEAD documental, pero explicar exactamente por qué. `HEAD` y SHA abreviado no se admiten en una solicitud operativa; si hay cambios posteriores en los archivos auditados, solicitar revisión del nuevo SHA.

## 4. Procedimiento para una sesión de ChatGPT

### Paso A — preparar un encargo concreto

Elegir una de las modalidades exactas: `targeted_paths_audit`, `security_review`, `architecture_consistency` o `release_readiness`. La modalidad **no concede acciones**. Definir archivos estrictamente necesarios (1 a 25) y preguntas de inspección (0 a 10; máximo 300 caracteres cada una). No incluir archivos de Fleetia, rutas absolutas, `..`, prefijos ocultos, claves ni material fuera del repo.

Ejemplo **de plantilla** (el campo `commit_sha` DEBE reemplazarse por un SHA real completo; el ejemplo literal no es una solicitud válida):

```json
{
  "schema_version": "1.0",
  "repository": "jdlc86/CartaViva",
  "commit_sha": "<SHA_GIT_COMPLETO_DE_40_HEX>",
  "audit_type": "targeted_paths_audit",
  "target_paths": [
    "apps/api/src/h6-stripe-webhook.mjs",
    "tests/h6-payments-events.test.mjs"
  ],
  "focus_questions": [
    "¿El webhook firmado evita aceptar una conciliación sin cargo y pedido coincidentes?"
  ]
}
```

El cuerpo definitivo del Issue lleva **exactamente un** bloque Markdown `json` con los campos anteriores, y puede incluir texto fuera del bloque aclarando que **solo se permite lectura**. Usar `renderAntigravityAuditIssue(request)` del contrato cuando sea viable; no improvisar otros campos. Confirmar que el campo `repository` y el autor autorizado son `jdlc86`.

### Paso B — publicar mediante GitHub, no mediante un comando al Windows

1. Crear un **Issue**, no PR, **únicamente en `jdlc86/CartaViva`**, con etiqueta exacta **`audit-request`** desde el mismo alta y por la identidad autorizada **`jdlc86`**. Si GitHub no está conectado o la identidad efectiva difiere, **STOP** y pedir reconexión/autorización; no simular un Issue ni inventar un enlace.
2. **Leer el Issue devuelto desde GitHub**; comprobar `issue.user.login`, etiqueta real `audit-request`, estado, **un solo bloque JSON**, tipos, rutas y SHA. Los métodos del repositorio `validateAntigravityAuditIssue` y `extractAntigravityJsonBlock` definen esta puerta.
3. Conservar URL y número de Issue. **No crear un segundo encargo por no ver una respuesta inmediata**. El equipo Windows puede estar apagado o el listener desconectado.

**Importante:** GitHub **no ejecuta** `agy.exe`. Crear el Issue transmite una orden estructurada solo a un puente local **si está operativo**.

### Paso C — comprobar recepción y respuesta

Consultar el mismo Issue y sus comentarios por GitHub. La entrega correcta exige **las tres evidencias juntas**:

- La etiqueta `audit-request` fue retirada y existe `audit-completed` (sin confiar únicamente en el nombre del label).
- Existe un **comentario real** con un **único bloque JSON** estructurado. Guardar su URL y fecha. Comprobar remitente del comentario y las identidades GitHub; la cuenta del propietario **no prueba criptográficamente** que se originó en `agy.exe`.
- El JSON contiene exactamente los campos esperados `repository`, `audited_commit_sha`, `audit_type`, `verdict`, `executive_summary`, `inspected_files`, `findings`, `questions_answered`. `audited_commit_sha` debe ser idéntico al `commit_sha` solicitado, `audit_type` debe coincidir y las rutas/observaciones deben referirse al alcance. Usar `validateAntigravityIssueComment(comment,request)` cuando sea posible.

**Estados que comunicar:** `SOLICITADO` = Issue creado; `PENDIENTE` = sin informe o etiqueta; `INFORME RECIBIDO` = comentario recuperado; `INFORME FORMALMENTE VÁLIDO` = esquema/identidad GitHub/SHA comprobados; `REVISIÓN TÉCNICA CONTRASTADA` = conclusiones comparadas contra código, CI y normativa; `ACEPTACIÓN` = otra puerta que **nunca se deriva** del veredicto de Antigravity.

Después de recibir el informe, **leerlo completo** y clasificar hallazgos por severidad y evidencia. `GO_WITH_WARNINGS` con MEDIUM, como en Issue #62, **no** significa que no haya riesgos de dinero/recuperación. No afirmar que Codex lo revisó; el encargo Codex S42 es otra revisión ([enlace](../assignments/CODEX_S42_POST_CORRECTIONS_INDEPENDENT_REVIEW_PR59_2026-11-17.md)).

### Paso D — cierre documental sin duplicaciones

Solo cuando hay un hito importante: actualizar el **tablero vivo** y la **continuidad actual** con Issue, comentario, SHA, dictamen, hallazgos P0–P3, estado de pruebas y próximo bloqueo. No alterar retrospectivamente informes inmutables. No crear una PR solo para un encargo de auditoría ni fusionar #59/#60 por la emisión de un informe.

## 5. Requisitos del ordenador Windows y recuperación de fallos

**Condiciones esperadas (documentadas, no inspeccionadas directamente por ChatGPT):** equipo despierto; autenticación `gh` y `agy.exe` disponibles; orquestador local y listener/túnel activos; proceso/usuario con permisos mínimos. La captura de un `ping` de GitHub solo demuestra recepción del ping, no que los eventos `issues.opened`/`issues.labeled` se ejecuten correctamente.

Para probar **modo automático**, mantener `start_realtime_bridge.ps1` activo y **no ejecutar manualmente** el sondeo del Issue mientras se diagnostica. En caso de solicitud sin respuesta: confirmar Issue/autor/etiqueta/JSON primero; luego observar logs locales del listener y de `gh webhook forward` para eventos `issues.opened`, `issues.labeled` e `issues.edited`. Si no llegan, revisar entrega/autorización del forwarding; si llegan, revisar filtros del orquestador, estado de `processed_audits.json`, worktree y publicación de comentarios. No hay pruebas de que todos esos disparadores estén implementados: **confirmarlos en código local, no suponerlo**.

**Recuperación manual de un encargo pendiente, no validación de automatismo:** con consentimiento del propietario, en otro PowerShell y con la ruta local real del equipo (la ruta siguiente está documentada, pero es dependiente del Windows):

```powershell
python C:\Users\Miko\Documents\Antigravity\Sabora\orchestrator\bin\poll_github_audits.py --poll-github --publish
```

No lanzar manualmente un Issue ya `audit-completed`. No recomendar reinicios que maten otras tareas antes de examinar logs. Para una prueba de recepción futura, usar **un solo Issue nuevo y mínimo**, sobre un SHA de repositorio y un archivo no sensible; verificar etiqueta+informe y evitar ciclos de pruebas continuos.

**Pendiente de demostrar formalmente:** reanudación tras caída/reinicio, pérdida de un webhook, reenvío duplicado, autenticación del origen del evento, sello de procedencia local `agy.exe`, confinamiento efectivo de lectura de FS/red y control real de ACL. Ningún `GO` debe elevar la confianza más allá de lo observado.

## 6. Mensaje exacto para abrir una futura sesión de ChatGPT

El propietario puede copiar este texto. La sesión debe **leer la guía en GitHub, no basarse en memoria de conversaciones anteriores**:

> Estamos trabajando en Sabora, repositorio `jdlc86/CartaViva`. Antes de encargar revisiones a Google Antigravity, lee íntegramente `docs/integrations/SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md` y `docs/integrations/SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md` en la rama activa del PR #59 (`docs/sabora-dual-backup-vps-offsite-20261113` mientras siga fuera de `main`). Lee también `AGENTS.md`, documentación normativa aplicable, tablero vivo y continuidad más reciente. Comprueba el estado real de GitHub y los Issues #62 (auditoría manual inicial) y #63 (prueba automática completada). Para cualquier auditoría nueva, usa solo GitHub Issues con `audit-request`, autor `jdlc86`, JSON v1.0 y SHA completo fijo; comprueba la recepción y el informe coincidente. No invoques el ordenador Windows directamente ni confundas una solicitud con una auditoría realizada. Antigravity es consultivo, no sustituye Codex, CI, aprobaciones ni autoriza merge/despliegue. No toques Fleetia, VPS, Supabase operativo, secretos ni otros proyectos. Mantén el trabajo en un hito integral, sin PR duplicados.

## 7. Enlaces y referencias de soporte

- [PR #59 — rama de integración, Draft](https://github.com/jdlc86/CartaViva/pull/59).
- [Issue #62 — revisión Antigravity S42 completada manualmente](https://github.com/jdlc86/CartaViva/issues/62); [informe `GO_WITH_WARNINGS`](https://github.com/jdlc86/CartaViva/issues/62#issuecomment-6934523316).
- [Issue #63 — prueba automática con un solo archivo](https://github.com/jdlc86/CartaViva/issues/63); [informe `GO`](https://github.com/jdlc86/CartaViva/issues/63#issuecomment-6934620403).
- [Contrato de uso e invariantes](SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md) y [validador JS](../../scripts/ci/sabora-antigravity-audit-contract.mjs).
- [Normativa de agentes](../../AGENTS.md); [documentación de validación y observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md).
- [Continuidad S42](../handoffs/SESSION_42_HANDOFF_2026-11-17.md), [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
