# Hito 1 — ciclo seguro de identidad del personal

Fecha: 2026-10-25. Estado: **implementación candidata completa; no activada**.
Commit de código: `9be238a`. PR Draft:
<https://github.com/jdlc86/CartaViva/pull/10>.

Este documento concreta el Hito 1 sin modificar el contrato funcional
consolidado. La regla normativa de `03f5a47` se conserva literalmente: la
revocación debe existir desde el primer registro durable, antes de aceptación,
registro de credencial o activación.

## Secuencia durable

```text
invited -> accepted -> registered -> active -> suspended
    |          |            |          |          |
    +----------+------------+----------+----------+--> revoked
```

`staff_enrollments` es el primer registro durable y se crea al invitar. Guarda
solo el HMAC normalizado del email y el hash del token, no sus valores en claro.
`accepted` vincula el UUID autenticado del invitado; `registered` exige evidencia
de credencial verificada; `active` crea la membresía efectiva. `revoke` funciona
desde todos los estados, invalida el token y, si procede, revoca también
`staff_members`. Un registro revocado no puede reactivarse por una petición
tardía o un replay.

Los roles incorporables son `admin`, `waiter` y `kitchen`. `root` queda fuera de
este flujo. Las acciones administrativas (`invite`, `resend`, `activate`,
`suspend`, `revoke`) exigen ADMIN activo que coincida con el owner durable del
restaurante; el singleton de ownership se bloquea y revalida dentro de la
transacción. El invitado solo puede ejecutar `accept` y `register` sobre su UUID
JWT verificado. No se acepta `actorUserId` ni rol desde el cuerpo.

## Idempotencia, auditoría y carreras

`staff_lifecycle_requests` serializa actor y correlación mediante advisory lock,
persiste un fingerprint de toda la intención y devuelve el mismo resultado a un
replay idéntico. La misma correlación con otro payload produce conflicto.
`staff_lifecycle_audit` es append-only y se escribe en la misma transacción que
el cambio de estado. Triggers impiden `UPDATE`, `DELETE` y `TRUNCATE` del ledger
y de la auditoría.

El wrapper vuelve a comprobar la capacidad tras adquirir locks. En una carrera
activación/revocación, la operación que obtiene primero el lock termina y la
siguiente observa el nuevo estado; el resultado final probado es `revoked`, sin
reactivación tardía. Una segunda revocación es no-op de negocio, idempotente y
auditable bajo una correlación nueva.

## Identidad SQL y mínimo privilegio

La única mutación es
`sabora.transition_staff_lifecycle_authorized_candidate(...)`, una rutina
`SECURITY DEFINER` con `search_path=pg_catalog,pg_temp`. Recibe una capacidad
HMAC que firma audiencia, `session_user`, actor, acción, enrollment, sujeto,
rol, hashes, razón, correlación y tiempos. La vigencia máxima es 30 segundos.

El owner `sabora_staff_lifecycle_fn_owner` es sellado: `NOLOGIN`, `NOINHERIT`,
sin privilegios elevados ni membresías. Sus RLS y grants son por columna y solo
para los cuatro recursos del flujo. `PUBLIC`, `anon`, `authenticated`, lectores
y writers previos permanecen revocados. El keyring se entrega vacío; no se crea
login runtime ni se concede `EXECUTE`.

El preflight exige al futuro login: identidad `session_user=current_user`,
`LOGIN`, `NOINHERIT`, cero membresías, sin `CREATE` de esquema o base, sin
acceso directo a tablas/secuencias y ejecución exclusiva del wrapper. También
comprueba owner sellado, función única y RLS habilitada y forzada.

## Backend candidato

- `staff-lifecycle-capability.mjs`: canonicalización estricta, emisión HMAC,
  HMAC del email y hash del token.
- `staff-lifecycle-repository.mjs`: consulta SQL fijada y validación cerrada de
  resultados/transiciones.
- `staff-lifecycle-coordinator.mjs`: separación entre actor autenticado,
  autoridad administrativa y datos de negocio; el token nuevo se expone solo
  mediante un `Symbol` no enumerable para su futura entrega confiable.
- `staff-lifecycle-identity-preflight.mjs`: inspección del principal SQL y de
  toda la superficie de privilegios.

No se montan endpoints ni controles UI porque todavía no existe un contrato
aprobado para entrega de invitaciones, WebAuthn, provisión de clave/login ni
activación operativa. Mostrar éxito sin esas fronteras sería engañoso. El
coordinador y repositorio quedan listos para composición explícita posterior.

## Matriz ejecutada en PostgreSQL 17 desechable

| Caso | Resultado |
| --- | --- |
| Login de ciclo restringido | Solo puede ejecutar el wrapper firmado |
| Revocación de invitación pendiente | Bloquea accept, resend y replay tardíos |
| Reenvío | Rota token; replay no duplica cambios ni auditoría |
| Revocación accepted/registered | Impide completar el alta |
| Revocación active/suspended | Revoca membresía y capacidad operativa ya emitida |
| Carrera activate/revoke | Estado final revoked, sin reactivación tardía |
| Doble revoke | Idempotente y auditable |
| UUID, ROOT, rol erróneo, GUC y SET ROLE | Denegados sin efectos |
| Correlación alterada y error intermedio | Conflicto / rollback total |

Resultado local: 9/9 casos PostgreSQL, con contenedor eliminado al finalizar;
772/772 pruebas raíz; 35/35 pruebas de gestión; build sintáctico API correcto.

## Pendiente de autorización

Quedan fuera de este hito: aplicar la migración en Supabase, provisionar o rotar
secretos, crear el login operativo, enviar correo, registrar credenciales
WebAuthn, montar rutas/UI, desplegar y migrar datos existentes. Todo ello exige
contrato y autorización posteriores. Fleetia y VPS están fuera de alcance.
