# Sesión 6 — integración candidata de confirmación (22-10-2026)

## Alcance publicado

Se añadió `apps/api/src/catalog-confirmation-candidate-runtime.mjs` para componer, sin rutas HTTP ni configuración de conexión, el coordinador de confirmación, el repositorio de lecturas, el escritor de pedidos y la frontera transaccional PostgreSQL existente. La fábrica recibe un pool inyectado, una clave secreta confiable y opcionalmente reloj y generador de UUID. No abre conexiones al construirse.

Se añadió `tests/catalog-confirmation-candidate-runtime.test.mjs` con pruebas de rechazo previo al checkout, configuración incompleta y rollback ante contexto de visita no autorizado usando un cliente simulado.

Commits: `122e540529d5a8fd3c6146bb6fcbb621df0ad3b2` y `aca308f08a0f0e7ec7c038b6704a48dcd8d48908`.

## Evidencia y límites

Los workflows del SHA previo `febb6dae3e3b5ab33fd62036767f77704f4736c4` finalizaron SUCCESS: Sabora CI `39801651213` y Bootstrap `39801650399`. No extrapolar ese resultado a los commits de sesión 6; comprobar los workflows del HEAD nuevo.

**No acreditado todavía:** ejecución del coordinador Node con driver `pg` real sobre PostgreSQL 17 desechable; integración de credenciales de cliente, permisos SQL mínimos, auditoría de actor individual, cierre concurrente y flujo operativo de pedidos. Las pruebas nuevas usan un cliente simulado. El `package.json` de API no declara aún dependencia `pg`; no agregar un pool operativo por inferencia.

## Siguiente bloque obligatorio

1. Diseñar harness Node + PostgreSQL 17 aislado, utilizando una dependencia declarada y lockfile coherente, sin conectar Supabase.
2. Ejercitar confirmación, replay, rollback y carreras contra el esquema migrado, verificando estado persistido de pedidos, líneas y ledger.
3. Acreditar rol SQL mínimo y atribución auditada antes de HTTP.
4. Mantener PR #2 Draft; no merge, despliegue, acceso a Fleetia ni modificaciones en Supabase operativo.
