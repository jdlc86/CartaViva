# S47 — Canal persistente e independiente de Gateway para mantenimiento del controlador Sabora (PROPUESTA)

**Estado: DISEÑO CANDIDATO, NO NORMATIVO, NO IMPLEMENTADO NI AUTORIZADO EN VPS.** Fecha: 21-11-2026. Esta propuesta **no sustituye** [autorizaciones](../SABORA_AUTHORIZATION_GATE.md), [despliegue gobernado V1](SABORA_GOVERNED_RELEASE_V1.md), [límites entre proyectos](CARTAVIVA_PROJECT_BOUNDARY.md), [método de validación](SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) ni [instalación de controlador S43](../runbooks/SABORA_S43_RELEASE_CONTROLLER_PROVISIONING_CANDIDATE_2026-11-19.md). Cualquier conflicto con esas fuentes es STOP y requiere decisión documentada del propietario. Referencias de continuidad [S47](../handoffs/SESSION_47_HANDOFF_2026-11-21.md) y [issue único #75](https://github.com/jdlc86/CartaViva/issues/75).

## 1. Motivo y alcance

El bootstrap inicial del controlador mediante SSH convencional no resuelve actualizaciones de código/Node/launcher/configuración posterior, ni la recuperación ante un binario instalado defectuoso. La cuenta temporal `sabora-bootstrap` creada S47 sirve **solo para el primer staging**, no será identidad permanente ni root y expira el 28-11-2026. El workflow existente `.github/workflows/sabora-governed-deploy.yml` autoriza solo `plan/deploy/rollback` de la **aplicación**, no una mutación del TCB del propio controlador. No ampliar silenciosamente esas operaciones ni conservar una shell administrativa.

La necesidad solicitada es un **canal institucional duradero**: el propietario puede aprobar mantenimiento del controlador desde GitHub Actions y un operador/ChatGPT con permisos efectivos puede preparar cambios o iniciar las operaciones que su integración permita, sin que Gateway forme parte del transporte. **No significa** que ChatGPT almacene indefinidamente una clave privada o mantenga una sesión SSH: la sesión del asistente es efímera y su conector GitHub actual no expone `workflow_dispatch` como acción de escritura. Si esa capacidad sigue ausente, la activación manual será por un operador en la interfaz de Actions o por una integración expresamente autorizada que ofrezca el disparador; no afirmar automatización ChatGPT→VPS que no existe.

## 2. Topología objetivo, dos canales SSH distintos

```text
                                    GITHUB (CartaViva solamente)
  main + checks exactos + artefacto fuente controlador con SHA256
                       |                                  |
  workflow_dispatch gobernado: RELEASE       workflow_dispatch gobernado: MAINT
  credencial independiente SABORA_RELEASE    credencial independiente SABORA_MAINT
  aprobación operación/sha/6 evidencias      autorización Ed25519 de MANTENIMIENTO
                       |                                  |
          SSH/22 + known_hosts pinned         SSH/22 + known_hosts pinned
                       |                                  |
        sabora-release (forced-command)       sabora-maint (forced-command)
        root-owned release actuator            helper fijo de verificación/staging
        deploy / app rollback                  upgrade / maintenance rollback
                       |                                  |
      SOLO app Sabora, ledger release          SOLO binarios/código/config controlador
                                                + ledger mantenimiento
                                    NO FLEETIA
```

Gateway **no** es proxy, intérprete ni dependencia para el segundo camino después del bootstrap inicial. Puede seguir siendo diagnóstico de respaldo, pero un fallo o suspensión de Gateway **no impide** el mantenimiento gobernado desde GitHub.

- El segundo usuario permanente sería `sabora-maint`, **no** `ubuntu`, `root`, `sabora-bootstrap` ni `sabora-release`, sin contraseña utilizable, sin Docker/sudo general, sin grupo de otros proyectos. La cuenta solo admite la shell/forced-command **fijos, revisados y root-owned** de mantenimiento, sin shell interactiva, SCP/SFTP, port forwarding, X11, agente o TTY. Si el listener compartido no permite esas restricciones por cuenta/clave sin afectar terceros, STOP. **No editar/reiniciar sshd compartido**.
- Clave SSH distinta de deploy: privada de transporte almacenada como secreto de repositorio/entorno restringido únicamente a CartaViva o custodio dedicado con entrega efímera; nunca en código, ChatGPT ni Fleetia. Rotación y revocación planificadas. La clave SSH demuestra identidad de transporte; **NO autoriza actualización por sí sola**.
- Firma Ed25519 de **propietario** para cada mantenimiento, con clave privada custodiada **fuera de VPS, GitHub, CI y ChatGPT**, y su fingerprint de confianza instalado offline. No reutilizar la clave de login como firma. La autoridad de mantenimiento tiene alcance distinto de la autorización de release y de migración SQL. El hash aprobado debe cubrir el **código que verifica la próxima firma**: no permitir actualizar unilateralmente el verificador para aceptar claves nuevas.
- Cuenta y ruta de mantenimiento de solo lectura antes del acto de actualización. Privilegios root únicamente en helper **de argumentos fijos** con allowlist de destinos propios Sabora y una política verificable de archivos, nunca una ejecución de shell, npm, `curl | sh`, `docker`, `systemctl restart`, `nft flush` ni escritura libre.

## 3. Contrato de actualización, pendiente de implementación

**Entrada canónica propuesta** `sabora-controller-maintenance/v1` (no reutilizable como `sabora-governed-release/v1`): operation `inspect|upgrade|rollback-controller`, repo exacto `jdlc86/CartaViva`, host exacto, versión instalada/expected manifest y versión destino, SHA completo de `main`, hashes del artifact fuente, hashes de Node/Compose/launcher C compilados, `installation.json` vigente, hash de política y conjunto de rutas limitado a `/etc/sabora/release` y `/var/lib/sabora-release/controller`, `authorizationId` aleatorio único, `approvedAt`, `expiresAt` no mayor de una hora, sujeto de identidad y firma válida. Campos/estructura exactos requieren contrato normativo y pruebas antes de activar. La operación `inspect` no puede leer ni imprimir secretos; la inspección de emergencia no muta.

**Preparar:** el runner oficial GitHub Actions en main crea artefacto reproducible con `git show <SHA>:path`, exige CI exact-SHA y digest inmutable; prohíbe PR-only como origen deployable, symlinks, TAR traversal, selección de ejecutables por usuario, scripts arbitrarios, tags Docker o dependencia de internet desde el VPS. Los binarios root-entry/ssh-entry y versión de Node/Compose se producen en un entorno CI identificado y **sus hashes exactos entran en la firma propietaria**. La instalación nueva mantiene la semántica S43 de dueños/root, ACL, ausencia de enlaces, verificador y `installation.json` firmado. Un commit GitHub por sí solo no aprueba cambio.

**Aplicar:** el helper nunca permite escribir fuera del árbol Sabora ni modifica ninguna ruta que pertenezca a Fleetia/u otros proyectos, configuración SSH compartida, daemon Docker, reglas nft de otros proyectos o variables/secretos de otros repositorios. Bajo bloqueo exclusivo Sabora, comprueba que no hay `deploy/rollback` activo, valida las dos firmas y expedientes reales aplicables, precondición del manifest viejo, identidad del host y destino, hash de todos los bytes nuevos, propietario/ACL/tipo, disponibilidad de espacio y rollback retenido íntegro. Registra `authorizationId` consumido **durablemente antes de la primera mutación**; conserva journal/receipt, no borra locks parciales para facilitar un reintento. Promueve de forma atómica el árbol candidato a una ruta versionada root-owned, y solo después cambia el punto de entrada de mantenimiento/release con mecanismo de promoción revisado; nunca sobrescribe ejecutable que el propio proceso esté usando. No reescribe la clave de confianza por un solo request de actualización. La coherencia de instalación se verifica de nuevo **desde una conexión independiente** tras promoción.

**Fallo/rollback:** un crash deja diagnóstico/STOP y rastro durable, no una reejecución ciega del mismo ID. Volver a versión anterior requiere autorización **nueva** y firma exacta de `rollback-controller`, solo si el antiguo bundle/manifiesto está retenido/verificado y el ledger de mantenimiento y el runtime coinciden. No se revierte SQL ni se reinician apps. El acto de rollback no depende de que GitHub conserve artefactos caducados. Una actualización del controlador que altere su protocolo o autoridades exige instalación normativa S43/revalidación y firma propietaria nuevas, no un `self-update` automático.

**Orden de confianza:** autenticar firmante/objeto/caducidad/replay usando binario/clave vieja antes de aceptar el binario nuevo. La cuenta `sabora-maint` nunca puede crear su propia autoridad. El propietario conserva mecanismo de recuperación físico/administrativo de último recurso ajeno al agente, **sin poner claves root de recuperación en GitHub**. Esta propuesta aún debe resolver un problema delicado: validación y rollback cuando se modifica el propio launcher/entry que recibe SSH; no declarar resuelta esa transición sin un ensayo real con SSH separado y cierre de ventanas de fallo.

## 4. Pruebas integradoras requeridas

1. Suite Linux efímera con `sshd` real: dos cuentas, dos claves distintas, forced-command y permisos, pruebas negativas de shell/PTY/SCP/forwarding, colisión entre canales y contraseña; comprobar que ninguna clave de mantenimiento puede desplegar app y viceversa. Ensayar sin depender de Gateway ni de su servidor.
2. Instalación S43 anterior real en laboratorio; upgrade A→B del código del controlador/Node/launcher compilado, lectura desde una **segunda conexión**, persistencia de ledger e identidad del binario, A sigue retenido. Ensayos con firma falsa, digest malicioso, symlink/hardlink, fallback a otra cuenta, paths fuera de Sabora, key sustituta, permisos débiles y cambio concurrente.
3. Ensayo de corte de energía/SSH en puntos críticos (antes de consumir, después de consumir, staging, promoción, postcheck), reconciliación documentada sin auto-retry y retorno explícitamente autorizado B→A. Comprobar que la actualización **no detiene ni modifica la PWA** cuando la operación no requiere servicio; prohibir `docker down`, `prune`, `systemctl restart`, ediciones de unidades/sshd globales.
4. Validación estática y dinámica de `workflow_dispatch`, environment, secret refs, origen exact-main, pin `known_hosts`, timeout, ausencia de sudo general o runner autohospedado, rotación y revocación de clave; recibo digital verificable. No dar por aprobado el canal por pasar tests con fixture.
5. Prueba en VPS de la segunda identidad **solo tras autorización específica**: fingerprint del host confirmado fuera de banda, limitación por cuenta/clave observada con intentos negativos, paths/owner/ACL, prueba read-only de `inspect`, lock Sabora y recibo. Ensayar invariancia de los servicios ajenos mediante evidencia proporcionada por el custodio sin inspeccionarlos/manipularlos desde Sabora.

## 5. Dependencias, bloqueo y aceptación

**Lo que existe:** `sabora-governed-deploy.yml` con transporte de release por SSH; 28 fuentes del controlador en stage privado (S46), paquete de control/launchers auditados offline (S47); cuenta temporal `sabora-bootstrap` creada pero **sin clave y sin acceso SSH**. `main@d83f66a3e3c5331e7906bc5e3976eeddb0ce3bae`, 5/5 checks requeridos al último corte S46. El conector GitHub de esta sesión permite commits, comentarios y PR, **no iniciar directamente workflow_dispatch**; el entorno del asistente no tiene una credencial SSH privada ni conexión SSH persistente.

**Lo que falta:** implementación y pruebas de mantenimiento, decisión normativa sobre nuevo protocolo y authority, credencial independiente `sabora-maint`, cuenta/forced-command real, instalación y firma originales del controlador S43, etapa inicial de staging SSH admitida, verificación host/known_hosts, firma del propietario y aprobación expresa por fase. **Ningún acceso permanente está actualmente operativo**, ni este documento lo crea.

**Salida del hito futuro:** CI real del mismo SHA, cuenta exclusiva y secreta de mantenimiento configurada sin clave privada entregada al modelo, firma de propietario real, artefacto hash-exacto, recibo de update A→B y rollback autorizado B→A por SSH/22 sin Gateway, demostración de fallos negativos y no intervención de Fleetia, y retirada de `sabora-bootstrap`. Hasta entonces NO-GO de mantenimiento y del primer deploy. No abrir nuevos PRs por esta propuesta; centralizar seguimiento en [issue #75](https://github.com/jdlc86/CartaViva/issues/75) y decidir inclusión en el hito integral de activación.
