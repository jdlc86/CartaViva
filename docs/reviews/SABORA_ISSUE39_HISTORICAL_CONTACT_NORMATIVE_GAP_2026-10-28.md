# Bloqueo normativo detectado — reconciliación histórica de contactos

Fecha: 2026-10-28. Issue #39 / PR Draft #40.

## Hecho técnico verificado
La migración candidata `20261028120000_sabora_staff_directory_read_candidate.sql` crea `sabora.staff_directory_contacts` con correo único y RLS forzado. Su función `transition_staff_lifecycle_with_directory_candidate` inserta correo únicamente en la acción `invite`, firmada por una capacidad específica. El wrapper de lectura hace `INNER JOIN` a contactos: una identidad histórica sin contacto no aparecerá en directorio ni perfil propio.

No existe en ese contrato una operación autorizada de recuperación/actualización de contacto para un enrollment histórico. La normativa `docs/security/SABORA_STAFF_DIRECTORY_READ_CONTRACT_V1.md` define tres ámbitos de lectura y exige autorización, RLS y mínimo privilegio, pero **no define** quién puede incorporar un correo histórico, qué evidencia de titularidad es suficiente ni el ciclo de auditoría de esa modificación.

## Consecuencia
No se implementará por inferencia un `INSERT` directo, `SECURITY DEFINER` nuevo, endpoint de actualización, grant ni script de migración productiva. Hacerlo inventaría una facultad de escritura no aprobada y eludiría la separación de lectura y mantenimiento.

## Lo implementado sin ampliar permisos
`staff-contact-reconciliation-plan.mjs` genera únicamente un inventario offline sin PII, excluye revocados y declara `writesAuthorized=false` y `deliveryAuthorized=false`. Su suite está cubierta por CI verde en `e6d1b80660fc2c6091f5aea0a779bbd7a856935d`.

## Decisión normativa necesaria antes de la reconciliación ejecutable
Aprobar expresamente el actor facultado para registrar/verificar contacto histórico, la evidencia de verificación, los estados elegibles, la semántica de unicidad y conflictos, la idempotencia/auditoría y las consecuencias de revocación. Una vez documentado en normativa, implementar wrapper SQL de mínimo privilegio, prueba PG17 aislada de carreras/replay/revocación y API candidata. Hasta entonces, este subbloque está **bloqueado por contrato**, no por limitación técnica.

No se modifica Supabase operativo, VPS ni Fleetia.

## Resolución de alcance acordada con el propietario (28-10-2026)
El propietario confirma que **no existen empleados reales registrados en Sabora**; cualquier registro existente es de pruebas y puede descartarse tras identificarlo y comprobar sus dependencias. En consecuencia, **no se requiere una migración de contactos históricos** ni se aprueba un mecanismo de escritura retroactiva. Este bloqueo queda cerrado por **ausencia de datos históricos a conservar**, no por ampliación de permisos.

El flujo candidato para **altas nuevas** deberá preservar conjuntamente identidad, correo normalizado, unicidad, autorización, revocación e idempotencia según los contratos normativos vigentes. El inventario offline queda como herramienta de diagnóstico, no como requisito de activación. Antes de cualquier borrado operativo se verificará el ámbito exclusivo de Sabora, las referencias y la posibilidad de revertir; la autorización para descartar fixtures no autoriza tocar Fleetia ni otros recursos. **No se ha ejecutado ningún borrado ni consulta de datos reales.**
