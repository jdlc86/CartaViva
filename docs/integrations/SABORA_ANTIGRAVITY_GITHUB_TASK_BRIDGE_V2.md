# Sabora — encargos de lectura y escritura Antigravity V2 por GitHub Issues

**Fuente:** handoff `HANDOFF_CONTRATO_V2_PARA_CHATGPT.md` entregado por el propietario el 17-11-2026. **Esta es una guía operativa/documental; no sustituye la normativa de GitHub ni autoriza operaciones por sí misma.** Prevalecen [AGENTS.md](../../AGENTS.md), requisitos, seguridad, contrato visual y las aprobaciones específicas. Se complementa con [la guía permanente](SABORA_ANTIGRAVITY_FUTURE_SESSIONS_GUIDE_V1.md) y [el protocolo V1 de auditoría de solo lectura](SABORA_ANTIGRAVITY_AUDIT_BRIDGE_V1.md).

## Evidencia verificada y límites

[Issue #66](https://github.com/jdlc86/CartaViva/issues/66) terminó con la etiqueta `autonomy-completed`. El [comentario del agente](https://github.com/jdlc86/CartaViva/issues/66#issuecomment-6936826906) y el [commit remoto `5059b8d367adca47b1058169585423a33844f476`](https://github.com/jdlc86/CartaViva/commit/5059b8d367adca47b1058169585423a33844f476) constan en GitHub, sobre `test/antigravity-write-roundtrip-20261117`, padre `792c08bd4db367321922ec93b288d01d858c8598`. El diff tiene **1 archivo, 1 inserción, 1 eliminación**: la ruta del perfil Windows reemplazada por `$env:SABORA_ORCHESTRATOR_DIR`. **Es una prueba real de escritura en rama de prueba**, no una aprobación de release.

El informe **declara**, sin ejecución independiente accesible desde ChatGPT, `git fetch origin`, worktree aislado, `git diff --check` PASS, búsqueda de rutas PASS y **7/7 pruebas Node PASS**. GitHub no devolvió checks de Actions asociados a ese SHA. Los scripts del orquestador están en Windows, fuera del repositorio visible.

## Encargo con una etiqueta y rama explícitas

ChatGPT crea **un Issue en `jdlc86/CartaViva`** desde la cuenta `jdlc86`, usando la etiqueta de modalidad correspondiente **al crearlo** y una línea explícita de destino, por ejemplo `target_branch: docs/sabora-dual-backup-vps-offsite-20261113`. El webhook existente comunica el encargo a Antigravity en Windows. El propietario **no tiene que pegar instrucciones**. La recepción y la ejecución dependen de que el orquestador esté operativo y valide la autorización.

| Modalidad declarada en handoff | Etiqueta principal | Escritura autorizable | Etiqueta final declarada |
| --- | --- | --- | --- |
| Corregir hallazgos / bugs | `autonomy-fix` (alias `antigravity-fix`) | Sí, solo en rama y archivos expresamente permitidos | `autonomy-completed` |
| Programar, refactorizar, documentación | `antigravity-dev` (alias `autonomy-dev`) | Sí, solo con autorización del encargo | `autonomy-completed` |
| Analizar y proponer | `antigravity-suggest` (alias `autonomy-suggest`) | No | `autonomy-completed` |
| Seguridad adversarial | `security-audit` (complementaria) | Según permiso principal, nunca por la etiqueta de seguridad sola | `autonomy-completed` |
| Auditoría de solo lectura JSON V1 | `audit-request` | **Nunca** | `audit-completed` |

**Precaución:** el caso #66 prueba una publicación de corrección y la etiqueta de cierre. Los nombres/alias y todas las modalidades anteriores derivan del handoff local y **no se han probado individualmente** en GitHub; no inventar resultados. El contrato V1 no admite escritura.

## Rama de destino y condiciones mínimas

**Preferido:** especificar `target_branch: <rama-existente-autorizada>` en el cuerpo del Issue y el SHA base real. El handoff declara que el despachador acepta alternativamente `branch:`, `rama:`, un bloque JSON `target_branch` y `target_files` o la mención de `PR #59` para resolver su rama. Si se omite el destino, declara crear `autonomy/issue-N` desde `origin/main` y abrir un PR; **evitar ese fallback** para que el proyecto no acumule PRs redundantes. No usar `main` ni `master` como destino.

El Issue debe indicar objetivo completo, normas y flujos a leer, lista de **rutas permitidas para escribir**, criterios de aceptación, pruebas integradoras pertinentes (PG17, HTTP, Chromium, UI/seguridad), prohibiciones de recursos externos y entregables: SHA final, commit/push, diff, logs o CI, documentación y bloqueos. El agente sincroniza sin operaciones destructivas y solo escribe a la rama permitida. **No hacer merge, desplegar, ni acceder a Fleetia, otros proyectos, VPS, Supabase operativo, Stripe real, credenciales o secretos.**

## Pipeline V2 declarado por el handoff local — no validado por completo

1. **Triaje:** Gemini 4 Hydrogen, fallback Claude Sonnet 5.5; `TASK_BRIEF.md` y `routing.json`.
2. **Arquitectura:** Gemini 4 Argon high, fallback Claude Opus 5.5; `agent-architect` y `ARCH_PLAN.md`.
3. **Implementación:** Gemini 4 Hydrogen, fallback Claude Sonnet 5.5; `agent-coder` y `IMPL_SUMMARY.md`.
4. **QA:** Claude Sonnet 5.5, fallback Hydrogen; `agent-debugger-qa`, `QA_REPORT.md` y hasta dos reintentos de corrección.
5. **Seguridad:** Claude Opus 5.5, fallback Gemini 4 Carbon; `agent-security-auditor`, skill declarada `cloudflare/security-audit-skill`, `SEC_REPORT.md` para rutas críticas o etiqueta `security-audit`.
6. **Publicación:** Gemini 4 Hydrogen, fallback Claude Sonnet 5.5; `github-publisher`, exclusión de `.agent/workspace/`, commit/push a destino y comentario de SHA con telemetría `METRICS.json`.

El handoff declara `.agent/scripts/webhook_pipeline.py`, limpieza de webhooks huérfanos, heartbeat **90 s** y sondeo **15 s** bajo `AUDIT_LOCK`. **No se inspeccionó el código del orquestador local ni se certificaron esas seis fases, modelos, fallback 429, skill Cloudflare, heartbeat, ACL o comportamiento ante duplicados**. La prueba #66 demuestra solo la edición/publicación nominal. No ampliar el acceso del agente basándose en una declaración no probada.

## Comprobación posterior por ChatGPT

Leer el **mismo Issue**, etiquetas y comentarios. Confirmar en GitHub que el SHA completo del commit existe, coincide con la rama, desciende de la base indicada y solo modifica archivos autorizados; cotejar CI del SHA final. Diferenciar **solicitado, recibido, ejecutado, publicado, pruebas declaradas, pruebas comprobadas y funcionalidad validada**. El informe publicado con identidad `jdlc86` no prueba criptográficamente que lo produjera `agy.exe`.

La autorización del propietario para la **prueba #66** no es autorización genérica para enviar revisiones independientes, hacer merge ni desplegar. La prohibición de nuevas auditorías Antigravity/Codex continúa hasta indicación expresa.
