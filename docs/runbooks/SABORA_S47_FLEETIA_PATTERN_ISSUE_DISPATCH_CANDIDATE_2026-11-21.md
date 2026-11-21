# S47 — puente de orden por Issue para la release gobernada de Sabora (candidato)

**Fecha:** 21-11-2026. **Estado:** propuesto en rama de desarrollo; NO incorporado a `main`, NO ejecutado, NO autoriza VPS/SQL/despliegue ni instalación de controlador. **Fuente normativa superior:** [autorizaciones](../SABORA_AUTHORIZATION_GATE.md), [release V1](../architecture/SABORA_GOVERNED_RELEASE_V1.md), [método de validación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [runbook instalación controlador S43](SABORA_S43_RELEASE_CONTROLLER_PROVISIONING_CANDIDATE_2026-11-19.md) y [frontera de proyectos](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md). La fuente de este patrón es **Fleetia únicamente como lectura de diseño**; no usar código/clave/cuenta/contenedores de Fleetia para la operación Sabora.

## 1. Problema comprobado y precedente auténtico

El conector GitHub conectado a esta sesión permite **crear Issues**, pero no ofrece una acción para invocar directamente `workflow_dispatch`. La limitación no es nueva ni obliga a utilizar Gateway: se comprobó **en lectura** el repositorio de Fleetia `jdlc86/GestionIntegral_Rutaa`, cuyos workflows en `main` son:
- `[automation] production-deploy <40_SHA>` → `.github/workflows/production-deploy-request.yml`, evento `issues: opened`, autor `repository_owner`, cuerpo vacío, SHA estricto y evidencia de `verify-ref`.
- El dispatcher llama a `github.rest.actions.createWorkflowDispatch({workflow_id:'production-deploy.yml', ref:'main',inputs:...})`. `production-deploy.yml` conserva su ejecución y secretos en un `environment` separado. No son necesariamente las protecciones adecuadas para Sabora; **el patrón de activación sí es reutilizable**.
- La documentación GitHub [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) confirma expresamente que `workflow_dispatch` y `repository_dispatch` sí pueden originar un nuevo run mediante `GITHUB_TOKEN`, a diferencia de los eventos ordinarios automatizados.

## 2. Implementación candidata dentro de CartaViva

Archivos:
- `.github/workflows/sabora-owner-issue-deploy-request.yml`: escucha exclusivamente `issues: opened` sobre la rama por defecto, `github.repository=jdlc86/CartaViva`, `github.actor==repository_owner`, `issue.user.login==repository_owner`, no PR; permisos mínimos para pedir ejecución (`actions:write`, `issues:write`, `contents:read`). Solo `checkout@v4` del SHA del evento de `main`, sin persistir la credencial, Node 22 y `github-script@v7`.
- `scripts/ci/sabora-owner-issue-dispatch.mjs`: valida además identidad del sender, owner, rama por defecto, estructura abierta y número de Issue, título cerrado y cuerpo vacío. Consulta HEAD real `main` antes de llamar la API de Actions. `deploy` exige SHA exactamente igual a HEAD de `main` en preflight; `plan` y `rollback` delegan ancestry al verificador actual del workflow destino. Si falla la admisión, no cierra el Issue.
- `tests/sabora-owner-issue-dispatch.test.mjs`: prueba integral con API GitHub simulada y secuencia exacta `getBranch → createWorkflowDispatch → createComment → update`; negativos de autor/sender/repo/branch/operación/cuerpo/sha/inyección, main obsoleto, API fallida, y contrato estático del puente + guardia del workflow destino. Forman parte de `pnpm test`; **no se ejecutan sobre VPS, solo validan el código**.

Título **exacto** del Issue permitido, sin cuerpo:

```text
[sabora] release plan <40hexsha>
[sabora] release deploy <40hexsha>
[sabora] release rollback <40hexsha>
```

Esta forma es distinta de Fleetia deliberadamente: `[sabora] release` no se cruza con su automatización. No existen verbos `bootstrap`, `controller-upgrade`, `sql`, `execute`, `ssh`, `root`, ni subcomandos. El Issue debe ser creado por `jdlc86` y no puede adjuntar instrucciones en el cuerpo.

El dispatcher **NO usa** `sabora-release`, ninguna clave SSH ni `SABORA_APPROVAL_*`; no se conecta al VPS. Su único efecto privilegiado es pedir al workflow existente de este mismo repositorio `sabora-governed-deploy.yml` la ejecución con inputs `operation` y `release_sha`. Si la API acepta la solicitud, comenta el Issue indicando **«petición aceptada»** (NO deploy correcto) y lo cierra. El run de despliegue **debe** revalidar SHA, ancestry, CI 5/5 aplicables, firma Ed25519, seis expedientes, `SABORA_RELEASE_AGENT_READY`, environment y agente `sabora-release` realmente instalado. Ninguna de estas puertas se elimina o reduce.

## 3. Fronteras críticas y pruebas pendientes

1. Hasta fusionar de manera autorizada este workflow a `main`, **crear un Issue no disparará este puente**. GitHub ignora los workflows `issues` si no están en la rama por defecto. No probarlo con un Issue real de `deploy` antes de la implantación y firmas.
2. La acción interna `createWorkflowDispatch` responde aceptada sin garantizar que los **jobs** concluyan. Comentar/cerrar Issue **NO equivale** a `SABORA_RELEASE_AGENT_READY`, ejecución SSH, instalación del controlador, pruebas runtime ni aprobación humana. Si la solicitud se despacha pero el comentario falla, el evento permanece abierto y se debe diagnosticar, sin repetir el ID de autorización ni forzar una segunda operación a ciegas.
3. CI automática del PR debe ejecutar pruebas Node 22, contratos completos y baterías integradoras PG17/HTTP/Chromium y lab Docker SSH desechable del mismo SHA. Una prueba con `github.rest` simulado no certifica que el `GITHUB_TOKEN` de GitHub permita `actions:write` en la configuración operativa. Tras merge y autorización distinta, validar primero **plan** real: no llega al VPS. Para `deploy` se exige aparte autorización firmada exacta y todos los gates reales.
4. El dispatcher no añade un canal de **actualización del controlador**. Ese segundo flujo está separado en la [propuesta S47 de maintenance](../architecture/SABORA_S47_CONTROLLER_MAINTENANCE_CHANNEL_CANDIDATE_2026-11-21.md) de la rama auxiliar de continuidad. Cuando exista un workflow de mantenimiento verificado y autorizado, se podrá aplicar el **mismo patrón owner Issue → dispatcher** con otro comando cerrado y otras identidades, pero no se autoriza ahora ningún `controller-upgrade`.
5. No se ha leído ni tocado ninguna credencial Fleetia. No se crea usuario ni servicio, no se modifica `sshd`, Compose, Docker, red, Supabase, TLS ni recursos de Fleetia. El workflow de deploy existente queda **sin modificar**.

## 4. Criterio de hito

**Código:** puente y tests integrados en una única rama/PR. **Pruebas:** comprobar CI exacta tras PR y registrar resultados, sin confundir `SKIPPED` con PASS. **Integración:** merge solo bajo decisión del propietario tras revisión. **Validación operativa del puente:** Issue `plan` creado por propietario y run `sabora-governed-deploy.yml` observado como `verify=success`, sin job `execute`; verificar el Issue correctamente cerrado y comentario rastreable. **Activación de release:** hito distinto sujeto a firmas, cuenta instalada y aceptación real.

La dependencia que esta mejora elimina es la **imposibilidad de invocar directamente `workflow_dispatch` desde este conector GitHub**. No elimina la dependencia inicial de instalación, credenciales SSH propias, firma del propietario, expedientes ni aprobación de VPS. Mantener seguimiento en [Issue #75](https://github.com/jdlc86/CartaViva/issues/75) y evitar un segundo sistema de despliegue.
