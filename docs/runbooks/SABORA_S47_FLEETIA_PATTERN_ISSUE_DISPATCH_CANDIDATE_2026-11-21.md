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
- `scripts/ci/sabora-owner-issue-dispatch.mjs`: valida además identidad del sender, owner, rama por defecto, estructura abierta y número de Issue, título cerrado y cuerpo vacío. **Relee en vivo el Issue mediante `issues.get` inmediatamente antes de consultar main/solicitar dispatch:** si el propietario lo cerró, lo editó, cambió autor/estado/número o añadió instrucciones al cuerpo mientras estaba en cola, se rechaza sin dispatch. Una repetición posterior al cierre también se rechaza. Consulta HEAD real `main` antes de llamar la API de Actions. `deploy` exige SHA exactamente igual a HEAD de `main` en preflight; `plan` y `rollback` delegan ancestry al verificador actual del workflow destino. Si falla la admisión, no cierra el Issue.
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
4. El dispatcher no añade un canal de **actualización del controlador**. Ese segundo flujo está separado en la [propuesta S47 de mantenimiento (rama auxiliar, todavía no normativa)](https://github.com/jdlc86/CartaViva/blob/prep/sabora-offline-node-20261120/docs/architecture/SABORA_S47_CONTROLLER_MAINTENANCE_CHANNEL_CANDIDATE_2026-11-21.md) de la rama auxiliar de continuidad. Cuando exista un workflow de mantenimiento verificado y autorizado, se podrá aplicar el **mismo patrón owner Issue → dispatcher** con otro comando cerrado y otras identidades, pero no se autoriza ahora ningún `controller-upgrade`.
5. No se ha leído ni tocado ninguna credencial Fleetia. No se crea usuario ni servicio, no se modifica `sshd`, Compose, Docker, red, Supabase, TLS ni recursos de Fleetia. El workflow de deploy existente queda **sin modificar**.

## 4. Criterio de hito

**Código:** puente y tests integrados en una única rama/PR. **Pruebas:** comprobar CI exacta tras PR y registrar resultados, sin confundir `SKIPPED` con PASS. **Integración:** merge solo bajo decisión del propietario tras revisión. **Validación operativa del puente:** Issue `plan` creado por propietario y run `sabora-governed-deploy.yml` observado como `verify=success`, sin job `execute`; verificar el Issue correctamente cerrado y comentario rastreable. **Activación de release:** hito distinto sujeto a firmas, cuenta instalada y aceptación real.

La dependencia que esta mejora elimina es la **imposibilidad de invocar directamente `workflow_dispatch` desde este conector GitHub**. No elimina la dependencia inicial de instalación, credenciales SSH propias, firma del propietario, expedientes ni aprobación de VPS. Mantener seguimiento en [Issue #75](https://github.com/jdlc86/CartaViva/issues/75) y evitar un segundo sistema de despliegue.

## 5. Extensión S48 candidata — solo stage de ZIP inerte por Issue (22-11-2026)

Este diseño **amplía el puente existente**, sin introducir un despliegue paralelo. El comando adicional del propietario es exactamente `[sabora] bootstrap stage <40hexSHA_de_main>` con **cuerpo vacío**. NO se acepta `deploy`, `install`, `sql`, `controller-upgrade` ni SHA abreviado bajo el prefijo bootstrap. La comprobación del Issue relee estado abierto/autor/contenido y compara SHA con HEAD real de main; comenta aceptación de solicitud y cierra antes de habilitar un segundo job. Si cualquiera de esas operaciones falla, **no se llama** al stage. Solo el job aceptado llama al workflow existente `sabora-cloud-bootstrap-stage.yml` mediante `workflow_call`, conservando el actor propietario del evento y las mismas puertas: CI exacta, digest, environment exclusivo, identidad SSH Ed25519, PIN, receptor de una sola escritura. No se añade una clave SSH a la automatización de Issues.

**Estado: cambios propuestos dentro de PR #81 Draft, NO operativos en main antes de fusión autorizada.** La autorización S48-9 concernía específicamente a la transferencia sobre `main@85a811af...`; cualquier merge modifica el SHA y requiere revisión de consentimiento y preflight para ese nuevo SHA antes del Issue real. Un Issue de prueba creado antes del merge no habilita el flujo. El stage **no instala** el controlador. El mecanismo antiguo de `release plan/deploy/rollback` sigue separado y sin cambios de semántica.


## 6. Corrección S48 al acceso de secretos GitHub environment (PR #83 candidato)

Los dos secretos de transporte son exclusivos del environment `sabora-bootstrap-stage`. El caller de `workflow_call` no puede fijar `environment` y, por tanto, **no se presupone que pueda reenviar esas claves**. El Issue owner ejecuta primero el verificador reusable existente en modo `plan` (CI y ZIP sin SSH); una vez concluido PASS, un **job ordinario** posterior establece `environment: sabora-bootstrap-stage`, obtiene exclusivamente sus secretos propios, descarga el artefacto validado en el mismo run y llama al **mismo script de transporte** usado por el workflow manual. Se mantienen digest, clave/pin Ed25519, forced-command, rechazo de replay, SHA exacto y CI. No usar `secrets: inherit`, no crear una clave de ámbito global para superar el fallo, no reiniciar servicios compartidos.

La corrección es candidata y no demuestra recepción real. STOP tras el fallo de Issue #82: no reintentar ese run o Issue, no fusionar sin autorización ni crear una nueva petición de `stage` sin aprobación del SHA `main` posterior a la fusión.

## 7. Resultado real S48: recepción de ZIP verificada — NO instalación

El patrón corregido por PR #83 ha completado satisfactoriamente **una ejecución real** exclusivamente de transferencia inerte: [Issue #84](https://github.com/jdlc86/CartaViva/issues/84) → [run #45060021960](https://github.com/jdlc86/CartaViva/actions/runs/45060021960) → receptor restringido `sabora-bootstrap`. Se verificaron antes owner exacto, SHA actual `main@a5f0d90179515c8a2e539c584705654231e0e357`, CI 5/5 y hash del artifact. `bootstrap_issue_check` + `bootstrap_verify / verify` + `bootstrap_stage` fueron SUCCESS. El job `bootstrap_verify / stage` está SKIPPED **por diseño**, no es un fallo. [Evidencia oficial del hito](https://github.com/jdlc86/CartaViva/issues/75#issuecomment-7084313543).

El ZIP recibido fue comprobado directamente en el VPS mediante operaciones tipadas read-only: `/home/sabora-bootstrap/.sabora-original-launchers-426960f0.zip`, tamaño 8792, dueño UID/GID 22018, permisos `0600`, hash SHA256 `a94c3d09ca371fe2cf021c9fe38bf4694e0c85af9b3c01092eddc6abda6faf5c`. La transferencia se realizó **una sola vez**; el destino ausente antes de comenzar quedó presente tras ella.

**No reejecutar el stage**: el receptor protege contra sobreescritura y la autorización de ese único stage ya se consumió. El siguiente paso operativo (instalación/controlador o cualquier despliegue) NO ha sido autorizado; requiere revisión normativa y permiso nuevo específico. La presencia del ZIP no demuestra su instalación ni la operatividad del servicio. No tocar Fleetia ni otros contenedores, servicios, redes o volúmenes ajenos al proyecto.

## 8. Preflight S48-15 ante autorización posterior de instalación (STOP real, no instalar todavía)

El propietario autorizó continuar hacia la instalación, pero **el stage anterior no es un paquete instalable**: por [runbook cloud S47](SABORA_S47_CLOUD_ONLY_BOOTSTRAP_CANDIDATE_2026-11-21.md) es un ZIP de únicamente dos ELF históricos. Preflight real de rutas Sabora: `/srv/sabora` root:root `0700`, `tls` root:GID10001 `0750`, `origin.crt/key` root:GID10001 `0640`, `/etc/sabora/release` root:root `0755`, `bin` y `code` vacíos, `docker-config/cli-plugins` vacío, `sabora-release` y `installation.json` ausentes. **No se modificó nada** y la clave TLS privada no se leyó.

Aplican [S43](SABORA_S43_RELEASE_CONTROLLER_PROVISIONING_CANDIDATE_2026-11-19.md) y [S46 normativo](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md): no elevar el bootstrap SSH a identidad de release, no mover ELF sin un artefacto íntegro del SHA fuente aprobado, herramienta Node y Compose autenticados, hashes de todo el árbol, owner installation signature auténtica, revisión/evidencias y reserva de recursos. El orden S46 exige preflight DBA firmado y SQL específicamente autorizados antes de activar el controlador para primera prueba. **Resultado STOP/NO-GO de instalación; no se ha ejecutado la parte mutante de los 11 pasos S43.** Una aprobación verbal permite auditar pero no suplanta los expedientes o las firmas ni autoriza SQL. Conservar el ZIP en cuarentena y la cuenta temporal bajo su vencimiento original; cualquier limpieza/cambio es operación separada. No tocar Fleetia.
