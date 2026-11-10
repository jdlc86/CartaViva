# Sabora — runbook P2 de migración y recuperación

**Estado:** procedimiento candidato verificado únicamente en CI desechable. No autoriza merge, despliegue ni acceso a Supabase operativo, VPS o Fleetia.

## 1. Alcance y autoridades

Este runbook cubre las migraciones SQL del esquema Sabora, sus roles explícitos, `pgcrypto`, datos relacionales y permisos. No cubre Storage, correo, Stripe, secretos productivos, PITR gestionado ni infraestructura compartida.

Una intervención futura exige cuatro aprobaciones separadas y registradas: propietario de release (SHA/artefacto), DBA Sabora (backup/migración), seguridad (roles/RLS/secretos) y propietario del entorno (ventana y aislamiento). La persona que ejecuta no aprueba su propia evidencia. Ninguna aprobación permite tocar Fleetia ni otro proyecto.

## 2. Preparación obligatoria

1. Fijar PR, rama y SHA inmutable. Exigir worktree limpio y comprobar que el PR sigue Draft durante ensayos.
2. Ejecutar `node scripts/ci/migration-audit.mjs`; conservar salida sanitizada. El manifiesto debe contener exactamente 42 versiones y coincidir con [la auditoría individual](../security/SABORA_MIGRATION_AUDIT_P2_2026-10-29.md).
3. Revisar cambios vigentes de PostgreSQL 17 y Supabase. Confirmar versión de `pgcrypto`; comprobar que no existen extensiones obsoletas, índices `ltree`/`btree_gist` afectados ni cifrados heredados que requieran acción. Registrar la consulta, no asumir compatibilidad por una ejecución anterior.
4. Inventariar tamaño de tablas/índices, locks esperados y duración medida en una copia representativa. Las migraciones H6, códigos de personal y directorio requieren presupuesto explícito de tiempo/lock.
5. Verificar que la copia y el destino pertenecen exclusivamente a Sabora. Cualquier endpoint, credencial, red o volumen compartido, ambiguo o no inventariado es NO-GO.
6. Confirmar backups recientes, restaurables y cifrados, con custodio, retención y checksum. Validar por separado el mecanismo de recuperación de roles y el de datos.
7. Aprobar una ventana con tiempos máximos por fase. No hay un límite productivo preaprobado: antes de intervenir se deben rellenar `preflight`, `backup`, `apply`, `validate` y `restore/RTO` a partir del ensayo representativo. Ausencia de un valor aprobado es NO-GO.

El comando CI `migration-preflight.mjs` solo acepta el nombre exacto del contenedor creado por GitHub Actions y no acepta URL ni `--force`. No es un ejecutor productivo y no debe relajarse para reutilizarlo contra otro destino.

## 3. Copia y punto de retorno

- Pausar únicamente entradas Sabora mediante el mecanismo que se apruebe para esa instalación; no parar servicios ajenos.
- Tomar snapshot/PITR gestionado conforme al plan contratado y, como segunda evidencia lógica, un archivo custom de los objetos/datos Sabora.
- Exportar atributos y membresías de roles Sabora sin contraseñas. Las contraseñas y secretos se restablecen por el gestor autorizado, nunca desde el dump ni el repositorio.
- Registrar versión exacta de PostgreSQL, extensiones, checksum del archivo, hora inicial/final y prueba de lectura del archivo.
- Probar la restauración antes de aplicar. Crear `extensions.pgcrypto` con versión compatible, reconstruir roles mínimos, restaurar `sabora` con `--exit-on-error` y ejecutar la matriz de validación.
- No usar una copia completa de un clúster compartido como “backup de Sabora” ni incluir recursos Fleetia.

## 4. Aplicación y reanudación

1. Comparar la cadena aprobada con el historial durable: versión, nombre y SHA-256 deben coincidir. Una versión conocida con checksum distinto es STOP.
2. Aplicar en orden ascendente mediante el mecanismo de migración aprobado, con error-stop y ledger durable. No reejecutar una versión confirmada.
3. Tras cada versión, registrar resultado, duración, locks observados y checksum sin datos personales ni secretos.
4. Ejecutar gates de esquema, extensiones, funciones `SECURITY DEFINER`, owners, ACL, FORCE RLS, policies, constraints, índices y triggers antes de habilitar rutas.
5. Usar principales restringidos reales para aceptación positiva/negativa. `postgres`, owner y `service_role` solo pueden preparar/inspeccionar el fixture; no sustituyen al principal aceptado.

Tratamiento de fallos:

| Momento | Acción segura |
| --- | --- |
| Antes de empezar/conectar | No existe cambio; corregir preflight y repetir desde cero. |
| Dentro de una transacción no confirmada | Confirmar rollback y ausencia de parcial; corregir y repetir esa versión. |
| Después de versión y ledger confirmados | Reanudar: validar checksum, saltar la versión y continuar. |
| SQL posiblemente confirmado pero ledger ambiguo | **STOP**. No reintentar. Inspeccionar objetos/datos y logs; decidir restauración o corrección hacia delante revisada. |
| Drift, pérdida de datos, RLS/ACL divergente o escalada | **STOP/NO-GO**; mantener rutas cerradas y restaurar o corregir hacia delante desde evidencia aprobada. |

No existe rollback SQL destructivo genérico. Una sentencia inversa no demuestra reversibilidad. Las migraciones clasificadas aquí usan corrección hacia delante o restauración verificada.

## 5. Validación de seguridad e integridad

La aceptación exige igualdad con la fuente aprobada para:

- versión PG17 y `pgcrypto` en `extensions`;
- atributos/membresías de roles Sabora, sin contraseñas incluidas en evidencia;
- owner y privilegios efectivos del esquema, relaciones, secuencias y funciones;
- definición/owner/`SECURITY DEFINER`/`search_path`/EXECUTE de funciones;
- FORCE RLS y definición exacta de policies;
- constraints, índices, triggers y conteos por tabla;
- contenido del fixture confirmado, ausencia del fallido y unicidad efectiva;
- acceso positivo del lector restringido y denegación de tablas ajenas, DDL y `SET ROLE postgres`;
- cadena real completa, un solo registro por versión y rechazo de checksum alterado.

La prueba CI usa dos contenedores `postgres:17-alpine` con `--network none`. El segundo no comparte roles globales con el origen. Los artefactos temporales se crean en `RUNNER_TEMP` y se eliminan mediante trap incluso en fallo.

## 6. Condiciones de parada

Detener inmediatamente ante: destino no inequívocamente Sabora; SHA/checksum/orden distinto; backup ilegible; versión/extensión inesperada; timeout presupuestado; bloqueo fuera de ventana; dato parcial; historial ambiguo; owner/ACL/RLS/policy divergente; principal con privilegio excesivo; secreto en log/artefacto; dependencia de Fleetia; fallo de limpieza.

No continuar “porque la siguiente migración puede arreglarlo” salvo que exista una corrección hacia delante revisada, aprobada y probada desde el estado exacto observado.

## 7. Evidencia y cierre

Conservar SHA final, manifiesto/auditoría, logs sanitizados, duración, checks de GitHub Actions y matriz de aceptación. El informe debe distinguir:

- PASS de CI desechable;
- limitaciones de activación (datos/volumen real, PITR, secretos, Storage y entorno);
- autorización de despliegue, que siempre permanece separada.

## 8. Matriz P2

| Requisito | Implementación | Prueba/evidencia | Criterio |
| --- | --- | --- | --- |
| Inventario individual completo | `migration-audit.mjs` + auditoría P2 | `migration-audit.test.mjs` | 42/42, cero `unverified` |
| SHA, orden y checksum offline | `migration-manifest.mjs`, `migration-preflight.mjs` | tests manifest/preflight | destino ajeno rechazado antes de conectar |
| Cadena real PG17 | `postgres-migration-chain-smoke.sh` | Sabora CI + Bootstrap | 42 aplicadas en orden |
| Fallo antes de inicio | guarda offline y contrato estático | preflight/harness tests | sin Docker/DB ante destino inválido |
| Fallo durante transacción | `postgres-migration-failure-smoke.sh` | PostgreSQL 17 | cero escritura parcial y reintento único |
| Fallo tras confirmación | chain smoke con interrupción 75 | PostgreSQL 17 | ledger conserva timestamp, resume sin reejecutar |
| Drift/idempotencia | ledger version/name/SHA | checksum tamper probe | rechazo antes de SQL |
| Backup solo Sabora | dump custom `--schema=sabora` | recovery smoke | archivo restaurable con fixture |
| Clúster limpio | segundo contenedor aislado | fingerprints source/target | roles no compartidos; paridad exacta |
| Permisos/RLS | fingerprints + LOGIN probe | recovery y suites PG17 | acceso mínimo y escalada denegada |
| Limpieza/timeouts | traps y workflows acotados | Actions | sin contenedores/artefactos residuales |
| Recuperación no destructiva | este runbook | revisión documental + CI | forward-fix/restore; sin down genérico |

## 9. Límites que no invalida P2 pero bloquean producción

El ensayo no prueba duración con el volumen operativo, PITR de un proyecto contratado, recuperación de Storage, reset de credenciales, integración real con proveedores ni aislamiento material del VPS. Tampoco autoriza migrar Supabase. Esas evidencias pertenecen a activación/producción y siguen siendo NO-GO hasta aprobación y ensayo propios.

## 10. Referencias externas verificadas

- [PostgreSQL 15.19 / 17.11: acciones para `ltree`, `pgcrypto`, `btree_gist` y operadores](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- [Backup y restauración mediante Supabase CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [Backups de base de datos y límites de contraseñas/Storage](https://supabase.com/docs/guides/platform/backups).

Estas referencias se consultan para compatibilidad y preparación; no constituyen autorización para conectar ni ejecutar comandos en Supabase operativo.
