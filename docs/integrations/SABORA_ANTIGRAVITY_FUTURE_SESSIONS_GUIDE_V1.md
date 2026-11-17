# Sabora / CartaViva — guía operativa de Antigravity para futuras sesiones (V1, 17-11-2026)

> **GUÍA DE USO Y CONTINUIDAD, NO CONTRATO NORMATIVO NI AUTORIZACIÓN.** La fuente de verdad de requisitos, seguridad, estética, SQL, despliegue y aprobaciones sigue siendo la normativa de GitHub. Leer primero [AGENTS.md](../../AGENTS.md), normativa pertinente, [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [última continuidad](../handoffs/SESSION_42_HANDOFF_2026-11-17.md) y el [contrato del puente Antigravity V1](SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md). Verificar sus revisiones actuales antes de actuar.
>
> **RESTRICCIÓN VIGENTE 17-11-2026 (mandato del propietario): NO iniciar ni enviar nuevas auditorías/revisiones a Antigravity o Codex hasta nueva indicación expresa.** Investigar sus capacidades, documentar su uso futuro y ejecutar pruebas CI del repositorio no constituyen autorización para crear Issues `audit-request`, usar `/swarm`, `/boost`, `/run-workflow`, ejecutar `agy` ni enviar un encargo local. La referencia histórica a cómo emitir una auditoría en las secciones siguientes es una **guía condicional**, no un permiso vigente.
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
python "$env:SABORA_ORCHESTRATOR_DIR\bin\poll_github_audits.py" --poll-github --publish
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


## 8. Capacidades de programación y ciberseguridad descubiertas (verificación documental: 17-11-2026)

**Naturaleza de esta actualización:** investigación de documentación oficial pública de Google Antigravity, **NO** inspección del PC Windows del propietario, prueba de suscripciones/modelos disponibles, modificación del puente local, revisión de la PR #59 ni autorización para ejecutar agentes. Las funciones mencionadas dependen de versión, sistema operativo, plan, configuración y despliegue gradual. Ninguna función se declara instalada, configurada o ensayada en Sabora hasta obtener evidencia local identificable.

### 8.1. Novedades contrastadas con fuentes oficiales

| Capacidad anunciada | Verificación y alcance | Aplicabilidad potencial y limitación en Sabora |
| --- | --- | --- |
| **Gemini 4 Carbon (10-11-2026)** | Modelo presentado para ingeniería compleja, investigación larga y **ciberseguridad**. Google lo describe apropiado para revisar arquitectura y verificar adversarialmente en la coordinación de equipos `/swarm`. | Buen candidato **futuro** para analizar RLS/`SECURITY DEFINER`, HMAC Stripe, races, backups, PWA y separación de recursos; **no equivale a un scanner de seguridad certificado**. Su disponibilidad inicial se vincula a Google AI Ultra/planes empresariales elegibles; no se ha consultado la cuenta Windows. |
| **Gemini 4 Hydrogen y Orchestrator (12-11-2026)** | Hydrogen realiza cambios cotidianos, refactorizaciones y ensayos. **Orchestrator** coordina un modelo planificador (Carbon o Argon) y Hydrogen para implementar, compilar y probar, con traspasos de control. | Potencial pareja planificación/ejecución de hitos integrales. Elegibilidad de Orchestrator (Carbon/Argon) depende del plan. **No conectar automáticamente a GitHub/Supabase/VPS ni otorgar permisos de escritura.** |
| **`/swarm` (vista previa, 10-11-2026)** | Equipo multiagente con coordinación y modelos especializados sobre worktrees aislados. Permite separar implementación, comprobación de contratos y adversarialidad; puede consumir bastante más cuota. | Útil para paquetes grandes, **solo si** un futuro flujo autorizado garantiza ramas/worktrees Sabora-only y asigna permisos de solo lectura a revisores independientes. Ningún `/swarm` está integrado en el puente V1. |
| **`/boost`** | Comando de análisis profundo que puede delegar subagentes y contrastar iteraciones para fallos complicados y carreras. Documentado para planes de pago. | Candidato para condiciones de carrera Stripe/SQL; no sustituye una reproducción real PG17, una revisión de otro agente ni el dictamen independiente. |
| **`/run-workflow` y Dynamic Workflows (App 2.32.0, 13-11-2026)** | Agente genera **un script Python** que coordina fases paralelas y secuenciales; exige revisión/aprobación del script. Documentado para Google AI Pro/Ultra. | Futuro pipeline reproducible: auditoría del diff -> pruebas negativas -> reparación en rama -> pruebas integradoras -> reporte. **Este script no se debe ejecutar ni se debe publicar como encargo sin autorización.** |
| **Agentes especializados (`agent.md`), skills, reglas, MCP y SDK** | Se pueden definir subagentes especializados. La propia documentación ilustra un `security-reviewer` de solo lectura que busca secretos, inyección y privilegios excesivos; el SDK permite coordinación programática. | Potencial auditor de seguridad dedicado, siempre aislado y sin credenciales operativas. MCP o plugins de terceros **amplían la superficie de acceso** y deben partir de denegación por defecto; no habilitarlos por el mero hecho de documentarlos. |
| **Navegador, artefactos y diffs** | Agentes de navegador, evidencias visuales y revisión de diffs; sujetos a políticas de permisos y versión. | Complemento para inspección de las dos PWA (flujos, accesibilidad, consola, CSP y registros). **No reemplaza baselines aprobados, pruebas reales ni aceptación humana.** |

**Fuentes primarias fechadas (consultadas el 17-11-2026):**

- [Google Antigravity: Gemini 4 Carbon y `/swarm` (10-11-2026)](https://antigravity.google/blog/gemini-4-carbon-in-google-antigravity/).
- [Google Antigravity: Gemini 4 Hydrogen y Orchestrator (12-11-2026)](https://antigravity.google/blog/gemini-4-hydrogen-in-google-antigravity/).
- [Historial oficial de versiones: App 2.32.0 y disponibilidad gradual](https://antigravity.google/docs/changelog).
- [`/run-workflow`: Dynamic Workflows y requisitos de plan](https://antigravity.google/docs/dynamic-workflows/).
- [`/boost`: verificación profunda multiagente y requisitos de plan](https://antigravity.google/docs/boost/).
- [Ejemplo oficial de subagente `security-reviewer` en plugins](https://antigravity.google/docs/build-plugins/).
- [Funciones y restricciones de agentes, navegador y proyectos](https://antigravity.google/docs/features).
- [Permisos y presets](https://antigravity.google/docs/secure-mode) y [configuración por superficie/Windows](https://antigravity.google/docs/agent-settings).
- [Antigravity CLI: agentes personalizados](https://antigravity.google/docs/cli/commands/agents).

**No encontrado como garantía oficial autónoma:** un producto llamado «escáner automático SAST integral», certificación de ausencia de vulnerabilidades, capacidad del bridge V1 de escribir código o ejecutar `/swarm`, ni concesión automática de autenticidad e independencia a la revisión hecha por el mismo agente que programó. Para usar analizadores específicos (por ejemplo, herramientas de dependencias, SAST o generación SBOM) deben estar instalados, configurados, autorizados y ejecutados con evidencia independiente. Una descripción promocional de «ciberseguridad» no sustituye pruebas.

### 8.2. Separación estricta de modos: lo existente, lo propuesto y lo prohibido

| Modo | Estado en CartaViva | Política vigente |
| --- | --- | --- |
| **Puente GitHub Issue -> Windows -> Antigravity (V1, solo lectura)** | **Probado nominalmente** en Issue #63; informe completo posterior #64 recibido, sin demostrar seguridad del host. | **No volver a solicitar auditorías** hasta orden expresa. El contrato JSON V1 no conoce `task_type=programming`, permisos de escritura, modelo, agentes, workflows ni ejecución arbitraria. No extenderlo en silencio. |
| **Antigravity como auditor de ciberseguridad especializado** | **Capacidad del producto documentada; sin perfil ni configuración local verificadas.** | En el futuro: prompt de solo lectura, ámbito SHA/worktree autorizado, mínimos permisos, informe con CWE/OWASP cuando corresponda, ruta/línea, reproducción no destructiva y límites expresos. Revisión consultiva, no GO. |
| **Antigravity como desarrollador por el puente V1** | **NO IMPLEMENTADO como ejecución automática.** Sí puede recibir **un encargo manual** mediante un documento versionado en GitHub y una instrucción pegada por el propietario en su aplicación. | La programación necesita permiso de esa tarea, rama/worktree aislado, GitHub exclusivamente `jdlc86/CartaViva`, pruebas integradas en SHA final, sin acceso a secretos, Supabase operativo, VPS ni Fleetia. Sin secretos, sin Supabase operativo, VPS ni Fleetia. |
| **Autorrevisión del código generado por el mismo agente** | Sirve como control de calidad interno. | **No acredita auditoría independiente**; conservar una instancia lectora/contexto separado y, cuando se autorice, revisión adicional Codex u otro revisor independiente. |
| **Despliegue, cambios en main o sistemas externos** | Fuera del puente y sin autorización. | **Prohibido** sin orden expresa y aislamiento verificable; ni `/run-workflow`, MCP, `/swarm`, un informe GO ni la suscripción elevan permisos. |

### 8.3. Diseño recomendado para una futura adopción, sujeto a nueva orden

**Fase A — inventario y confinamiento local, solo tras autorización del propietario.** Verificar en Windows versión real de App/`agy`, edición, modelos disponibles, plan y comandos realmente admitidos; no inferir Carbon o `/swarm` por documentación de Google. Confirmar carpeta de Sabora como **única raíz de lectura**; impedir selección multicarpeta con Fleetia, acceso fuera de workspace, shell, red, GitHub con credenciales de escritura, plugins/MCP operativos y repositorios adyacentes. La documentación de permisos distingue App y CLI: **`Request Review` no es sandbox por sí mismo**, `Default/Auto` pueden ejecutar comandos permitidos; `Turbo` y `Always Proceed` tienen riesgo alto. Windows puede conservar políticas anteriores o no disponer de sandbox en builds concretas: comprobarlo realmente, no asumirlo. Mantener el usuario Windows limitado.

**Fase B — perfil auditor ciberseguridad, solo lectura.** Si el usuario ordena una auditoría, seleccionar modelo disponible (Carbon si autorizado/disponible, Argon cuando proceda), con subagentes de revisión en worktrees temporales de lectura. Alcances útiles para **Sabora**:

1. Economía H6 / Issue61: exclusividad PaymentIntent->pedido y charge->payer, HMAC Stripe, orden de locks, retries, `ignored` irreversible, ledger inmutable, importes en céntimos, estados ambiguos, pruebas reales PG17+HTTP.
2. Persistencia y privilegios: RLS `FORCE`, `SECURITY DEFINER`, `search_path`, revocaciones/grants mínimos, migraciones append-only, invariantes intertablas.
3. Resiliencia y recuperación: snapshots MVCC, integridad/firma/ACL de copia, restauración externa, TLS `verify-full`, aislamiento de redes y recursos Fleetia.
4. Cliente/gestión: QR/cookies, XSS, CSRF, privacidad de caché PWA, headers/CSP, navegación, regresiones de UX y accesibilidad.

Entregable esperado: matriz de hallazgos **P0–P3** con evidencia trazable, rutas/líneas y pruebas reproducibles **no destructivas**, falsos positivos/limitaciones, pruebas realmente corridas y juicio consultivo. Evitar ejecutar PoC contra sistemas reales, extraer datos, imprimir secretos, emitir comunicaciones, manipular pagos o lanzar scripts no autorizados.

**Fase C — eventual modo programador (nunca implícito).** Si el propietario lo ordena expresamente, diseñar una **V2 separada**, con nuevo esquema versionado y aprobación previa de tareas; no sobrecargar `SaboraAuditRequest v1.0` ni reutilizar `audit-request`. El operador prepara rama/worktree de CartaViva exclusivo; el agente genera un plan, implementa un hito completo y ejecuta pruebas **en laboratorio desechable**, produciendo cambios Git/diff y evidencias. Publicación en GitHub, commits, acciones y revisión de resultados solo con permisos explícitos limitados a este repositorio; **merge y despliegue permanecen denegados**. Sin asumir que el Windows ya contiene este mecanismo.

**Fase D — puertas y operación:** cotejar SHA, normativa, CI integradora PG17/HTTP/Chromium, seguridad, aceptación visual y revisión independiente (si se autoriza después). Registro por estado: `ANUNCIADA` -> `DISPONIBLE LOCALMENTE` -> `CONFIGURADA` -> `PROBADA EN AISLAMIENTO` -> `AUTORIZADA PARA TAREA` -> `EVIDENCIA CONTRASTADA`; no promover automáticamente ninguna etapa.

### 8.4. Instrucción para futuras sesiones (añadido obligatorio al mensaje de §6)

> **Antes de usar capacidades nuevas de programación o ciberseguridad de Antigravity**, leer íntegramente esta guía (especialmente §8), el contrato del puente V1 y `AGENTS.md`. Comprobar versión real Windows, modelo y plan, normativa del repositorio y SHA, distinguiendo capacidades anunciadas de instaladas, configuradas y probadas. **Por orden expresa del propietario, NO crear Issues de auditoría, NO enviar revisiones a Antigravity/Codex y NO invocar modelos, `/swarm`, `/boost` o `/run-workflow` para Sabora hasta que lo autorice.** El puente V1 es solo lectura: no usarlo para programar ni ampliar sus permisos sin diseñar y aprobar un contrato V2 distinto. No tocar Fleetia, otros recursos del VPS, Supabase operativo, secretos, `main` o despliegues. Actualizar la continuidad con evidencia, no con expectativas.

### 8.5. Consulta directa sobre capacidades de ESTA instalación (17-11-2026)

**Consulta enviada a Antigravity por instrucción explícita del propietario:** [Issue #65 — inventario local de revisión, programación y ciberseguridad](https://github.com/jdlc86/CartaViva/issues/65). Se utiliza el **canal de solo lectura V1** y el SHA inmutable `e479ac7978f95d1baab470592ec0811eb959f924`, con tres rutas de documentación y diez preguntas. **No es una revisión del código del PR #59**, no autoriza cambiar ficheros, ejecutar herramientas ni iniciar otra auditoría.

El encargo le pregunta al propio Antigravity por capacidades **utilizables en esta sesión**, y no meramente anunciadas: modelos, edición real, revisión de seguridad, agentes/skills/MCP/SDK, `/swarm`, `/boost`, `/run-workflow`, permisos actuales, acceso al worktree, comandos, navegador, GitHub y recepción de órdenes. También exige detallar cómo se lanzarían encargos de programación, si existe **un protocolo adicional ya instalado** y cómo demostrarlo. Debe distinguir **observado**, **declarado/configurado**, **documentado** y **no verificable**; la identidad del autor GitHub por sí sola no autentica el proceso Windows.

**Resultado publicado y comprobado:** [respuesta de Antigravity a #65](https://github.com/jdlc86/CartaViva/issues/65#issuecomment-6936041755), con etiqueta final `audit-completed`, autor `jdlc86`, el mismo SHA, un bloque JSON de respuesta, todas las rutas y preguntas cubiertas y dictamen documental `GO_WITH_WARNINGS` (2 MEDIUM, 2 LOW, 1 INFO). En su sesión CLI observó `Gemini 4 Argon (Medium)`, lectura e informe de código. **Declaró, pero no ejecutó**, herramientas `write_file`, `edit_file`, `run_command`, `define_subagent`, `invoke_subagent`, `swarm` y `run_workflow`; constató skills `agy-customizations`, `antigravity-guide`, `run-workflow`, `swarm` y `swarm_monitor`. En UI el atajo de equipos es `/teamwork`, `/boost` es un comando de interfaz; `swarm` y `run_workflow` son herramientas nativas, **no** comandos `/swarm` o `/run-workflow` observados. No hubo herramienta de navegador interactivo en la sesión CLI ni servidores MCP conectados. Carbon/Hydrogen, edición real, versión/plan de `agy` y seguridad del host **no se verificaron**.

**Para futuras sesiones:**

1. Leer [#65](https://github.com/jdlc86/CartaViva/issues/65) y sus comentarios **íntegros**; verificar autor, único JSON del contrato V1, SHA, cobertura de rutas/preguntas y `audit-completed`; comparar con la configuración local real, si fue suministrada.
2. Registrar cada función por separado como `ANUNCIADA`, `DECLARADA POR EL AGENTE`, `COMPROBADA EN WINDOWS`, `INTEGRADA EN EL PUENTE`, `PROBADA EN AISLAMIENTO` o `AUTORIZADA PARA UNA TAREA`. Una función puede estar disponible en la aplicación y **no** ser invocable por ChatGPT desde el canal GitHub.
3. Documentar para cada capacidad **entrada exacta**, disparador autenticado, cuenta/permisos, versión, directorio de trabajo permitido, necesidad de intervención humana, salida y errores, con evidencia reproducible **sin secretos**. Si Antigravity declara una herramienta pero no puede verificarla, anotar `NO VERIFICABLE`; nunca improvisar comandos locales.
4. **Auditoría V1:** seguir el flujo de §4 y el contrato V1 únicamente cuando el propietario **autorice expresamente una auditoría concreta**. **Programación y ciberseguridad con comandos/escritura:** solo mediante un canal distinto, diseñado y aprobado, si efectivamente existe y se demuestra; de lo contrario, `NO IMPLEMENTADO EN CHATGPT↔ANTIGRAVITY`. La instrucción de preguntar capacidades **no levanta** la prohibición de enviar nuevas revisiones del PR ni concede escritura.
5. No convertir conclusiones del agente en aprobaciones de seguridad, integración o despliegue. Fleetia y recursos de otros proyectos quedan fuera; Supabase y VPS requieren autorización operativa propia. No ejecutar automatizaciones destructivas ni probar contra sistemas reales.

**Alcance acreditado:** la respuesta del agente es evidencia de la superficie de herramientas que declaró ver, no prueba de permisos efectivos Windows ni autorización para ejecutar. El reporte usa severidades JSON `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`; cualquier conversión a P0–P3 se hace **después** en la continuidad. Las normas del repositorio se cargaron desde `AGENTS.md` y no desde `agent.md`. Antigravity identificó además un riesgo documental por incluir rutas de usuario Windows: usar rutas configurables sin nombre de perfil.

### 8.6. Encargos mediante Issue + webhook: recepción automática, ejecución condicionada

**Corrección del flujo:** el propietario **no tiene que copiar ni pegar el encargo en Antigravity** cuando el puente recibe automáticamente las notificaciones de GitHub. El ejemplo acreditado es [Issue #65](https://github.com/jdlc86/CartaViva/issues/65): abrió con `audit-request` y el orquestador Windows publicó el [resultado](https://github.com/jdlc86/CartaViva/issues/65#issuecomment-6936041755) con `audit-completed`. El canal `GitHub Issue -> webhook -> listener Windows` funciona nominalmente para **auditorías V1**, siempre que el receptor local esté operativo.

**Forma de encargar una tarea:**

1. ChatGPT **redacta un Issue completo en `jdlc86/CartaViva`**: objetivo, requisitos normativos y rutas, tareas por hito integral, pruebas PG17/HTTP/Chromium y seguridad, entregables, ramas autorizadas, operaciones prohibidas y criterios de cierre. Puede enlazar un documento de `docs/assignments/` si necesita mucho detalle; el Issue es la entrada y fuente de seguimiento.
2. El **webhook entrega el evento** al listener local, sin que el propietario tenga que pegar instrucciones manualmente. **La recepción por webhook no demuestra por sí sola que el orquestador sepa ejecutar tareas de programación.** El código local del receptor está fuera del repositorio y no es inspeccionable desde esta sesión.
3. **Solo si el despachador Windows implementado admite de forma verificable ese tipo de Issue y sus permisos**, Antigravity debe leer el encargo, actuar sobre **CartaViva exclusivamente** en rama/worktree aislado, ejecutar las pruebas permitidas y publicar SHA, cambios, logs/CI y bloqueantes. **No usar la etiqueta `audit-request` ni el JSON `SaboraAuditRequest v1.0` para obtener escritura**; ambos siguen siendo de solo lectura. No inventar una etiqueta de desarrollo, formato de tarea o disparador sin comprobar primero el contrato real del orquestador.
4. ChatGPT comprueba el Issue, los commits, el SHA y las pruebas **publicadas en GitHub** y actualiza tablero/continuidad. Una tarea recibida no es tarea iniciada; una tarea iniciada no es código publicado; y un commit publicado no equivale a funcionalidad validada ni a autorización operativa.

**Estado comprobado tras #65:** recepción y respuesta automáticas para consultas/auditorías V1 **SÍ**; herramientas de programación `write_file`, `edit_file`, `run_command`, subagentes, `swarm` y `run_workflow` **declaradas** en la sesión Antigravity pero **NO ejecutadas** allí; **enrutamiento automático de Issues de programación NO acreditado todavía** por el puente V1. No hace falta interacción manual para notificar el Issue: lo que falta comprobar es si el receptor dispone de un **despachador de trabajos de escritura** con autorizaciones y respuesta verificables.

**Prohibiciones vigentes:** no enviar otra revisión a Antigravity/Codex sin nueva orden, ni hacer merge, despliegue, cambios en Supabase operativo/VPS, accesos a secretos ni acciones sobre Fleetia. Ninguna instrucción recibida por webhook amplía estas facultades. Una vez se demuestre el procesamiento de un Issue de programación, documentar su etiqueta, esquema, reglas de autorización, comandos exactos, permisos y resultados reales **sin inventarlos**.

### 8.7. Modelo objetivo aprobado en conversación: ChatGPT encarga, Antigravity ejecuta y devuelve a GitHub

**Objetivo operativo solicitado por el propietario:** reproducir la colaboración que existía con Codex, pero utilizando el **Issue de GitHub como único encargo** y el **webhook ya existente como transporte**. El propietario **no debe pegar instrucciones** en Antigravity. La tarea puede ser de **LECTURA** (revisar, analizar, informar) o de **ESCRITURA** (programar/corregir, ejecutar pruebas, publicar cambios en una rama autorizada). **La recepción automática de Issues para lectura está demostrada; la ejecución automática de escritura todavía NO está implementada/verificada en el orquestador local accesible desde este repositorio.** Este apartado define el objetivo, no certifica su implantación.

**Flujo deseado, sencillo y único:**

1. ChatGPT publica **un único Issue** en `jdlc86/CartaViva` con el modo `LECTURA` o `ESCRITURA`, objetivo, normativa aplicable, SHA/base de trabajo, alcance, prohibiciones, pruebas esperadas y criterio de entrega. Cuando sea útil adjunta un documento de `docs/assignments/`, sin duplicar Issues ni crear una PR por cada paso.
2. GitHub notifica al **mismo receptor webhook Windows**. El orquestador consulta GitHub para validar autor, repositorio, estado y permiso **antes** de actuar; no toma la sola recepción del webhook como autorización. Debe evitar reejecuciones por entrega duplicada.
3. Si es **LECTURA**, Antigravity inspecciona el SHA inmutable en un worktree de solo lectura y responde en el Issue con un informe y evidencias. **El actual `SaboraAuditRequest v1.0` sirve para esta modalidad**, sujeto a autorización expresa de cada auditoría y a sus límites existentes.
4. Si es **ESCRITURA**, un despachador **nuevo y explícitamente autorizado** comprueba que el encargo permite modificar *únicamente* CartaViva y que existe una rama de destino permitida. Antigravity desarrolla el **hito completo**, corre pruebas integradoras en laboratorios desechables, hace commits y envía los cambios a **esa rama de GitHub**, nunca a `main`; publica en el **mismo Issue** los commits/SHA final, resultados CI, ficheros modificados, bloqueantes y documentación actualizada. Sin permiso de escritura comprobado, debe **rechazar el encargo sin ejecutar**.
5. ChatGPT recupera el Issue, compara el SHA y el código publicado con la normativa, comprueba pruebas reales y continúa con el siguiente hito solo según las instrucciones del propietario. No confundir `Issue recibido`, `trabajo ejecutado`, `push completado`, `CI aprobado`, `validado funcionalmente` y `autorizado para integrar/desplegar`.

**Dos modos, mismos Issues y webhook, permisos diferentes.** No enviar un Issue de escritura con la etiqueta `audit-request` para burlar la política de solo lectura. **Todavía no hay etiquetas o JSON de desarrollo demostrados como soportados por el Windows del propietario**: antes de emplear la ruta de escritura, verificar e implementar en el orquestador local la distinción de permisos, el disparador, la idempotencia, el rechazo seguro y la publicación de evidencia; documentar los nombres *reales* de campos/etiquetas en esta guía. **No inventar que el Issue se ejecutó** si solo está publicado.

**Límites permanentes:** exclusiva propiedad `jdlc86/CartaViva`; no tocar Fleetia u otros proyectos; sin acceso operativo al VPS, Supabase real, Stripe productivo, secretos, DNS o despliegues; sin merge a `main` ni acciones remotas no autorizadas. Exigir aislamiento efectivo Windows (usuario/ACL/credenciales), no solo instrucciones textuales. Las revisiones independientes nuevas siguen suspendidas hasta orden expresa: este diseño **no envía ningún encargo**.

**Criterio para declarar el mecanismo operativo:** evidencia de **un Issue real de escritura autorizado**, recepción webhook, confinamiento, commit publicado en rama CartaViva, pruebas y comentario de cierre sobre ese mismo Issue; confirmar también que un Issue sin permiso de escritura **no puede** modificar el repositorio. Hasta entonces, **diseño documentado; capacidad de ejecución en escritura no acreditada**.
