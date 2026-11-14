# Sabora S40 — cierre de implementación de las tres prioridades

**Corte 14-11-2026 · PR [#59 Draft](https://github.com/jdlc86/CartaViva/pull/59) · sin merge, despliegue ni cambios externos.** Dictamen de implementación: **candidato integrado listo para CI y revisión independiente; NO-GO operativo** hasta las decisiones/autorizaciones enumeradas abajo. El [runbook S40](../runbooks/SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md) es el procedimiento único.

## 1. Resultado diferencial

| Prioridad | Implementación nueva | Evidencia prevista en el mismo SHA | Límite real |
| --- | --- | --- | --- |
| Gobernanza | driver Docker real de laboratorio, inspector de redes/puerto, reglas reales en bridges efímeros, imágenes `save/load`, Compose exacto, HTTPS/API/alerta, ledger `fsync` | `web-publication` publica recibos nftables y release-driver | forced-command del VPS sigue sin instalar; `authorizeHostOperation()` continúa STOP |
| Doble copia | captura streaming AES-256-GCM separada en roles/esquema/datos/inventario, manifiesto estricto, dos clases de réplica, restore solo desde externa | PG17 plenamente migrado → dos réplicas → segundo PG17 sin red → fingerprint/ledger/negativas | no existe proveedor externo elegido, copia real, clave/custodios o RTO/RPO |
| Primer despliegue | paquete y recorrido real Docker/HTTPS reproducidos de extremo a extremo en runner; procedimiento de instalación ordenado | Docker+nftables lab más PG17/Fastify/Chromium heredado del gate H6 | no hay permiso de merge, SQL, red, VPS o deploy; no existen URLs reales disponibles para aceptación |

No se ha cambiado funcionalidad de producto ni composición visual. Por ello `docs/design/FUNCTIONAL_UI_COVERAGE.json` conserva sus estados: añadir una fila de despliegue habría mezclado una puerta operativa con capacidades RF/UI y no demostraría aceptación humana.

## 2. Controles de seguridad materializados

- El backup cifra cada `stdout` antes de escribir el componente y nunca recibe claves/contraseñas en argv. Réplicas contienen solo ciphertext y manifiesto; restauración usa temporales claros únicamente en el entorno aislado y los elimina.
- El manifiesto completo de procedencia/frescura forma parte del AAD. La interfaz operativa exige plan y SQL protegidos, binarios PostgreSQL absolutos fijados fuera del plan y rechaza ejecución arbitraria, DSN/secretos, salidas laterales y metaórdenes `psql`.
- Se excluyen `auth`, `extensions`, `realtime`, `storage`, `supabase_functions` y `vault`; el alcance incluido queda fijado a `sabora` y `sabora_migration_meta`.
- La restauración compara roles, membresías/grantor/opciones, owners/ACL, FORCE RLS, políticas, funciones, constraints, índices, triggers, default ACL, secuencias, contenido de todas las tablas y ledger 99/99.
- La red se aplica primero en namespace desechable y luego, para el driver, únicamente sobre tres bridges recién creados en runner. Se verifican casos permitidos y denegados antes/después, rollback de tablas y no cambio del inventario de tablas del host.
- El driver rechaza contexto no GitHub Actions/root/opt-in, recursos preexistentes, solapamientos de rutas, imágenes/Compose desviados, servicios extra, tags colisionados, readiness incompleto o replay del ledger. Tanto el driver como el laboratorio nftables mantienen un inventario de propiedad y eliminan exclusivamente recursos cuya creación iniciaron después de comprobar ausencia; no ejecutan `prune`, reinicio global ni operaciones sobre proyectos externos.

## 3. Pruebas ejecutadas antes de publicar

- `node --test tests/sabora-encrypted-backup-bundle.test.mjs tests/sabora-s40-three-priorities-contract.test.mjs`: 8 pruebas, **7 PASS + 1 SKIP esperado en Windows** (ACL NTFS se acredita operativamente), 0 fallos. Incluye alteración negativa de AAD, comandos/formatos/esquemas laterales y propiedad de limpieza.
- `node --check` de módulo, CLI, restore PG17 y driver Docker: PASS.
- `git diff --check`: PASS.
- Regresión Node completa local del árbol final: 1.446 pruebas, 1.441 PASS, 1 SKIP, **4 fallos exclusivos de portabilidad Windows preexistente** en utilidades POSIX de release (`process.getuid` y paths `/srv`); son los mismos cuatro casos ya presentes antes de este delta y sus contratos se ejecutan en Ubuntu en CI. No se ocultan ni cuentan como PASS local.

La revisión diferencial de seguridad del código nuevo registró dos hallazgos bajos y ambos se corrigieron antes de publicar: AAD incompleto de frescura/versión y ejecución de plan operativo no suficientemente acotada. La segunda pasada adversarial añadió rechazo de claves desconocidas del manifiesto, formatos/alias equivalentes, protección contra sustitución de SQL entre validación y uso, y propiedad explícita de recursos de limpieza. El dictamen final sigue sujeto a CI Linux y revisión independiente del SHA, no a autoaprobación.

Las pruebas PG17/Docker/nftables nuevas exigen Ubuntu root desechable y se consideran **pendientes** hasta observar GitHub Actions del SHA publicado. No se reutilizará el 5/5 anterior como evidencia del código nuevo.

## 4. Bloqueos reales

1. revisión independiente del delta y resultados del SHA final;
2. elección de almacén externo, custodios, retención, RPO/RTO y canal de clave;
3. autorizaciones específicas separadas para merge, captura+restore, SQL 99/99, red/forced-command y deploy;
4. seis expedientes operativos reales y distintos que exige Ed25519;
5. aceptación humana funcional/visual sobre las dos URLs reales después de deploy.

Hasta resolverlos, no hay copia externa real, copia VPS, migración, contenedor, firewall, usuario SSH, despliegue, rollback ni aceptación. No se ha accedido a Fleetia ni a recursos ajenos.
