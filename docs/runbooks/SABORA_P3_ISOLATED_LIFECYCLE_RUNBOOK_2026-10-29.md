# Sabora — runbook P3 de ciclo de vida aislado

**Estado:** contrato operativo candidato validado únicamente de forma estática y en CI. No autoriza despliegue, inicio o parada en VPS.

## Alcance fijo

- Proyecto Compose: `sabora`.
- Archivo: `deploy/compose.sabora.yml`.
- Único servicio activo: `api`.
- Red: `sabora_private`, bridge interna y propia del proyecto.
- Puerto: `127.0.0.1:4100`; no se publica en interfaces externas.
- Sin volúmenes persistentes, redes externas, socket Docker, secretos, `env_file`, nombres de contenedor fijos ni dependencias con otros proyectos.
- Proceso `health-only`, usuario no root, filesystem de solo lectura, `/tmp` efímero, capacidades eliminadas, límites de CPU/memoria/PID y logs rotados.

El identificador de proyecto, archivo, servicio y argumentos se consideran una unidad indivisible. `scripts/ci/deployment-isolation-contract.mjs` genera y valida exclusivamente las operaciones `validate`, `build`, `start`, `status`, `logs`, `stop` y `remove`. Cualquier parámetro libre, servicio omitido, proyecto diferente o acción global falla cerrado.

## Secuencia futura autorizable

La ejecución futura requiere autorización expresa, SHA fijado, inspección material del host y una ventana propia de Sabora. El operador debe obtener las órdenes tokenizadas del contrato y comprobarlas visualmente antes de ejecutar:

1. `validate`: solo analiza la configuración.
2. `build`: construye únicamente `api`.
3. `start`: usa `--no-deps`, espera el healthcheck y solo afecta `api`.
4. `status` y `logs`: se limitan al servicio `api`; el log tiene cola máxima de 200 líneas.
5. `stop`: envía `SIGTERM`, espera 20 segundos y nombra `api` obligatoriamente.
6. `remove`: elimina únicamente el contenedor del servicio `api`; no elimina redes, imágenes ni volúmenes.

No usar `down`, `restart` global, `docker stop` por listado o comodín, `prune`, socket Docker, `systemctl`, operaciones sobre el daemon ni comandos que descubran y actúen sobre recursos ajenos. La ausencia de un volumen persistente significa que la eliminación del contenedor no es un procedimiento de recuperación de datos: PostgreSQL y Storage no forman parte de este Compose.

## Healthcheck, fallo y parada

- La activación solo podría continuar si `/health` responde dentro del contenedor y Compose declara el servicio healthy.
- `restart: "no"` evita bucles automáticos y reinicios inesperados.
- Ante healthcheck fallido, configuración divergente, nombre ambiguo, puerto ocupado, red externa, secreto presente o dependencia ajena: detener el procedimiento antes de `start`.
- Una parada autorizada debe usar la operación `stop`; no matar el proceso ni el daemon. Después, `status` debe confirmar que solo `api` cambió de estado.
- No se ha verificado coexistencia real en VPS. Esa comprobación permanece NO-GO y debe realizarse sin cambios sobre Fleetia u otros proyectos.

## Evidencia automática

- `tests/deployment-isolation-contract.test.mjs`: alcance exacto, comandos permitidos/denegados y mutaciones inseguras.
- `scripts/ci/deployment-isolation-contract.mjs`: gate fail-closed del Compose y Dockerfile.
- `scripts/ci/production-config-secrets-gate.mjs`: incorpora el gate de aislamiento.
- GitHub Actions valida el Compose con nombre de proyecto explícito y ejecuta el contenedor de CI sin red.

Este runbook no contiene credenciales, endpoints operativos ni órdenes ejecutadas contra infraestructura compartida.
