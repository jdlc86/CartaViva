# Sabora — runbook P3 de recuperación y continuidad

**Estado:** candidato ensayable solo en PostgreSQL 17 desechable. No es un procedimiento autorizado para Supabase operativo, VPS o producción.

## Alcance y contrato verificable

Este bloque amplía, sin sustituir, el [runbook P2](SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md). El contrato machine-readable fija únicamente el alcance demostrable por CI:

- esquema relacional `sabora`, PostgreSQL 17 y segundo clúster `--network none`;
- 10.000 filas deterministas con payload de 64 bytes, constraint e índice funcional;
- contención real con `ACCESS EXCLUSIVE`, `lock_timeout=500ms`, error observado y reintento posterior;
- rechazo de archivo truncado y descarte/recreación del destino parcialmente restaurado;
- fingerprints de contenido, roles, membresías, extensión, owners, ACL, RLS, funciones, constraints, índices y triggers;
- principal LOGIN restringido para aceptación positiva y denegación de escalada;
- presupuesto del ensayo CI de 180.000ms y métricas por fase.

El presupuesto CI no es un RTO de producción. `productionRto` y `productionRpo` permanecen `null`: definirlos exige volumen representativo autorizado, plan contratado, carga/locks observados y acuerdo del propietario de servicio.

## Ensayo desechable

`postgres-migration-smoke.sh` aplica primero la cadena real. `postgres-recovery-smoke.sh` solo acepta el nombre exacto del contenedor efímero de GitHub Actions; no recibe URL, project ref, credencial externa ni bypass.

Secuencia:

1. Insertar carga determinista y comprobar rollback de escritura parcial.
2. Mantener un lock exclusivo desde una segunda sesión. El probe debe agotar 500ms y, liberado el lock, la misma escritura debe poder ejecutarse y revertirse.
3. Generar dump completo y archivo custom `--schema=sabora`.
4. Truncar una copia y exigir fallo de `pg_restore --exit-on-error`.
5. Restaurar solo `pre-data` en un destino para representar interrupción. Está prohibido reanudar sobre ese estado ambiguo: se elimina la base desechable, se crea otra con OID distinto y se restaura el archivo completo.
6. Restaurar también en un segundo clúster PG17 sin red, reconstruyendo roles Sabora sin contraseñas y `extensions.pgcrypto`.
7. Comparar fingerprints y las 10.000 filas completas; probar lectura permitida y denegaciones con el LOGIN mínimo.
8. Emitir una única línea sanitizada `sabora_p3_recovery_metrics` con filas, lock configurado/observado y milisegundos de dump, restores y total. Superar 180.000ms falla CI pero no establece por sí solo un objetivo productivo.

## Matriz de fallos

| Escenario | Respuesta exigida | Evidencia automática |
| --- | --- | --- |
| Lock incompatible | abortar por timeout, no esperar indefinidamente | error real `lock timeout`; operación posterior válida |
| Archivo truncado | rechazo inmediato | `pg_restore` no puede terminar con éxito |
| Restore interrumpido | no continuar sobre destino ambiguo | `pre-data`, `dropdb`, nuevo OID, restore completo |
| Escritura parcial | rollback total | fixture P2 conserva solo fila confirmada |
| Drift de datos | STOP | count + hash ordenado de 10.000 filas |
| Drift de seguridad | STOP | fingerprints de roles/ACL/RLS/funciones/objetos |
| Escalada del lector | STOP | pedidos y `SET ROLE postgres` denegados |
| Tiempo CI excedido | fallo de ensayo | total mayor de 180.000ms |

No se usa rollback SQL destructivo genérico. En un incidente real, un resultado ambiguo permanece STOP hasta decidir entre restauración desde evidencia aprobada o corrección hacia delante revisada.

## Storage

La búsqueda automática no encuentra dependencia de Supabase Storage en los flujos aprobados actuales. El gate falla si aparece acceso a `storage.objects`, buckets o API Storage sin ampliar este contrato.

Un backup de base de datos puede conservar metadatos, pero no contiene los bytes de objetos de Storage. Antes de introducir cualquier archivo operativo se requiere inventario de buckets/objetos, copia separada cifrada, checksum, retención, restauración de bytes, reconciliación con metadatos y prueba de autorización. Sin esa evidencia, activar un flujo que dependa de Storage es NO-GO.

## PITR y RTO/RPO operativos

PITR no se ha consultado ni activado sobre ningún proyecto. Antes de producción, DBA y propietario del entorno deben acreditar en una copia autorizada:

- modalidad contratada, retención, earliest/latest recovery point y región;
- punto seleccionado anterior al incidente y RPO resultante;
- downtime medido con volumen y WAL representativos;
- suscripciones/replication slots, Realtime y trabajos externos que deban detenerse o reconstruirse;
- validación de aplicación posterior, rotación de passwords de roles custom y plan Storage separado;
- RTO/RPO aprobados y criterio de abortar/escalar.

La restauración gestionada deja el proyecto inaccesible durante un periodo que depende del tamaño y actividad; por eso no se extrapola el tiempo del contenedor CI.

## Evidencia y límites

Conservar SHA, enlaces Actions, línea de métricas, fingerprints y resultado de cada escenario sin dumps ni credenciales. Una ejecución verde demuestra que el procedimiento aislado es reproducible; no demuestra capacidad, aislamiento material, PITR, Storage ni tiempos de producción.

No se autoriza merge, despliegue, creación de recursos facturables, migración en Supabase, acceso al VPS ni intervención sobre Fleetia.

Referencias oficiales verificadas al preparar este contrato:

- [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups): passwords de roles custom no incluidas, objetos Storage fuera del backup y comportamiento general de restore/PITR.
- [Supabase — Restore to a new project](https://supabase.com/docs/guides/platform/clone-project): reconfiguración manual, Storage separado y riesgos de trabajos externos al restaurar.
- [Supabase — Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod): pruebas de carga y selección de mecanismo según RPO.
