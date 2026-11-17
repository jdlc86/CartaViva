# Sabora — puente auxiliar de auditorías Antigravity V1 (17-11-2026)

**Estado: mecanismo documental/contractual candidato en [PR #59](https://github.com/jdlc86/CartaViva/pull/59), no puerta de aprobación ni proceso operativo siempre disponible.** Fuente de diseño: handoff entregado por el propietario `handoff_para_chatgpt.md`, «HANDOFF TÉCNICO PARA CHATGPT — INTEGRACIÓN CON GOOGLE ANTIGRAVITY». Este documento no altera los requisitos, contratos visuales, la puerta de autorización, ni el plan de revisión independiente Codex. La jerarquía normativa y `AGENTS.md` siguen intactos.

## Canal y límites acreditables

El equipo Windows del propietario **declara** disponer de `agy.exe` CLI autenticado, `poll_github_audits.py`, `webhook_listener.py`, `start_realtime_bridge.ps1`, un `gh webhook forward` y directorios `git worktree --detach` de solo lectura, todos **fuera** del repositorio de Sabora. Una prueba local `local-dry-run` sobre `main@59866219971a78237d14d7820d9b18a086ac2bfc` consta en el handoff; **no equivale a evidencia de un Issue completo publicado y procesado por GitHub, ni a auditoría del PR #59**. El puente depende de que el equipo Windows esté encendido y de que el usuario arranque el listener o el sondeo bajo demanda; no tenemos acceso remoto al ordenador ni podemos afirmar que esté encendido. La configuración `read_file(*)`/denegación `write_file(*)`/`command(*)`, las firmas/verificación del webhook, credenciales GH, confinamiento OS de lectura y `worktree_unmodified` son garantías **declaradas por la herramienta local, no comprobadas por este repositorio**.

Flujo esperado: ChatGPT genera payload JSON -> Issue GitHub **creado por `jdlc86` y etiquetado `audit-request`** -> orquestador local valida autor, campos, SHA y rutas -> crea worktree efímero -> invoca Antigravity en modo lector -> publica comentario Markdown con **un único bloque JSON del informe** -> cambia etiqueta a `audit-completed` -> ChatGPT recupera Issue y comentario y **comprueba el SHA del resultado**.

No instalar GitHub Actions para ejecutar Antigravity, no almacenar claves de AGY ni convertir su `GO` en permiso de merge/despliegue; la revisión basada en un solo modelo tampoco garantiza independencia frente a errores o prompt injection. Fleetia, otros proyectos, Supabase operativo y VPS quedan fuera.

## Contrato que consume el orquestador de Windows

El **esquema de entrada declarado `SaboraAuditRequest v1.0`** exige exactamente `schema_version:"1.0"`, `repository:"jdlc86/CartaViva"`, `commit_sha` (7–40 caracteres hex o `HEAD`), `audit_type` (`security_review`, `architecture_consistency`, `release_readiness`, `targeted_paths_audit`), `target_paths` (1–25 rutas relativas, caracteres seguros), `focus_questions` opcional (hasta 10 de 300 caracteres). La implementación `scripts/ci/sabora-antigravity-audit-contract.mjs` preserva el esquema de lectura original **pero exige SHA completo de 40 caracteres al producir solicitudes operativas para evitar ambigüedad**. Descarta rutas `..`, absolutas, ocultas, duplicadas o con separadores inseguros. Solamente el bloque JSON, y nunca el resto del Issue, es el encargo estructurado.

**Resultado declarado:** campos exactos `repository`, `audited_commit_sha` (SHA completo), `audit_type`, `verdict` (`GO`, `GO_WITH_WARNINGS`, `NO-GO`), `executive_summary`, `inspected_files`, `findings` con ID/severidad/ruta/líneas/título/evidencia/recomendación y `questions_answered` con pregunta y respuesta. El validador contrasta SHA y tipo exactos con el encargo. **Verificar que existe comentario y que el JSON es correcto no implica comprobar que el resultado fue realmente emitido por AGY ni que las conclusiones son ciertas.**

### Requisitos operativos para emitir un Issue

1. Confirmar `main`, PR y **commit completo de código que se desea auditar**. Preferir un SHA específico de código/test frente a `HEAD` de rama mutable, y no reutilizar conclusiones de `main` sobre #59.
2. Crear Issue en `jdlc86/CartaViva` como `jdlc86`, con etiqueta existente `audit-request` y exactamente un bloque ```json. **Leer el Issue creado para verificar la autoría y la etiqueta efectivamente aplicadas**; una etiqueta solicitada pero no materializada no dispara el orquestador. No crear múltiples Issues redundantes para el mismo trabajo.
3. Con el ordenador Windows activo, iniciar el puente en PowerShell con `start_realtime_bridge.ps1` **o** procesar una solicitud pendiente de forma puntual:
   ```powershell
   python C:\Users\Miko\Documents\Antigravity\Sabora\orchestrator\bin\poll_github_audits.py --poll-github --publish
   ```
   El orquestador debe impedir ejecución si el autor no es `jdlc86`, la etiqueta no es exacta o si el SHA/ruta no son válidos.
4. Comprobar el Issue, el cambio `audit-request` -> `audit-completed`, y el comentario con resultado estructurado del mismo SHA. Ejercitar `validateAntigravityAuditIssue` y `validateAntigravityIssueComment` antes de clasificar el resultado; si faltan etiqueta/informe/SHA, el estado es **PENDIENTE, no GO**.
5. Conservar URL del Issue/comentario, SHA de código exacto, fecha y conclusiones con `file_path`/`line_reference` en el tablero y continuidad. Contrastar hallazgos con normativa, SQL/HTTP/Chromium y revisión Codex, y actualizar solo hitos completos.

## Riesgos de seguridad pendientes de inspección local

- `gh webhook forward` escucha en `127.0.0.1:8765`; el handoff no prueba autenticación de eventos, separación frente a otros procesos locales ni si se evita `issue edited` con payload ambiguo. El listener debe comprobar el origen del evento o consultar GitHub como fuente autenticada; no confiar en JSON entrante ni permitir un evento local falsificado.
- `read_file(*)` no equivale a confinamiento del sistema de ficheros al worktree, aunque esté prohibida `write_file`. Verificar que el CLI no puede abrir credenciales Windows ni proyectos ajenos y que no admite comandos por canales alternativos; trabajar con usuario Windows limitado.
- `git status --porcelain` no prueba ausencia de lecturas fuera del worktree ni de solicitudes de red; deben revisarse permisos reales del host, conectividad y credenciales.
- El hecho de que los informes se publiquen con `gh` del propietario no acredita que el contenido provenga de AGY. Evaluar adjuntar un recibo de ejecución verificable de `agy`, versión/política, hash de parámetros, SHA y resultado sin incluir secretos.
- Faltan comprobación formal de registros `processed_audits.json`, entrega post reinicio, reenvíos/eventos duplicados, disponibilidad de la etiqueta, timeout, errores y reintentos seguros. No declarar operatividad extremo-a-extremo hasta ejecutar un Issue autenticado real.

## Primer encargo real registrado y verificado

**[Issue #62 — auditoría Antigravity S42 del PR #59](https://github.com/jdlc86/CartaViva/issues/62).** Creado mediante la identidad GitHub **`jdlc86`**, confirmado por lectura posterior de GitHub con etiqueta **`audit-request`**, Issue abierto, **un bloque JSON `SaboraAuditRequest v1.0`**, `audit_type:"targeted_paths_audit"`, **17 `target_paths`** y **8 `focus_questions`**. Objetivo inmutable final tras corregir el validador: [SHA completo `ad07c4d7d0fc18e57f674d445a256ea24f7f2873`](https://github.com/jdlc86/CartaViva/commit/ad07c4d7d0fc18e57f674d445a256ea24f7f2873). Una edición controlada del mismo Issue reemplazó el SHA inicial `0cc138cf` por `ad07c4d7` antes de tener informe, conservando etiqueta/autoría y evitando un segundo Issue. La idempotencia local declarada usa `issue_number + commit_sha + audit_type`; comprobar su comportamiento en la siguiente ejecución.

**Estado al emitir:** encargo **PUBLICADO / PENDIENTE DE PROCESAMIENTO LOCAL**. No se observó todavía un informe estructurado de Antigravity, ni `audit-completed`. Para ejecutarlo es indispensable que el propietario arranque `start_realtime_bridge.ps1` o procese el Issue pendiente mediante el comando de sondeo descrito arriba en su equipo Windows; ChatGPT no tiene canal de comandos al ordenador y no debe afirmar que se invocó `agy`. El resultado se considerará validado únicamente tras recuperar comentarios, comprobar JSON y SHA, y examinar críticamente los hallazgos. El dictamen `GO` del auditor nunca sustituye revisión independiente/aceptación humana ni autoriza merge/despliegue. La entrega Codex sigue organizada en `docs/assignments/CODEX_S42_POST_CORRECTIONS_INDEPENDENT_REVIEW_PR59_2026-11-17.md`.

**Validación del mecanismo (no de Antigravity local):** `node --test tests/sabora-antigravity-audit-contract.test.mjs`. El CI del PR deberá acreditar los casos positivos/negativos por SHA; no se han ejecutado tests en el ordenador Windows por este procedimiento.
