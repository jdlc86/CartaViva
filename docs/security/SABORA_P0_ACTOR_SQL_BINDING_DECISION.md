# Decisión de seguridad P0 — vinculación del actor SQL en operaciones

- Fecha: 2026-10-25
- Rama candidata: `codex/sabora-p0-actor-sql-binding`
- Base inspeccionada: `964f1415cf264d786d53349e371fc78ff227f668`
- Commit de implementación: `de04faba7cf70c918cdda13de30250db11b4cf5c`
Estado: **implementación candidata completa; no desplegada; cierre final condicionado a CI verde del SHA publicado**.

Este documento registra la decisión y las evidencias del plan
`SABORA_P0_ACTOR_SQL_BINDING_CODEX_EXECUTION_PLAN.md`. No autoriza aplicar
migraciones, aprovisionar claves, conceder permisos ni montar rutas en un
entorno operativo.

## Hallazgo reproducido

La función anterior
`transition_order_line_idempotent_candidate(uuid,uuid,text,text)` recibe
`p_actor_user_id` del caller. Revalidar que ese UUID corresponde a un miembro
activo no demuestra que el login SQL compartido esté actuando por ese miembro.
En PostgreSQL 17 desechable, el harness concede temporalmente los permisos que
habría requerido ese diseño y prueba que el login técnico puede pasar el UUID
de un ADMIN ajeno: la transición, el evento y el ledger quedan atribuidos a
ese ADMIN. La transacción se revierte y todos los permisos/policies inseguros
se eliminan dentro de la fixture.

La exposición versionada anterior estaba cerrada: `EXECUTE` revocado, cero
permisos positivos y rutas ausentes de `server.mjs`. El P0 era un bloqueo de
diseño/activación, no evidencia de explotación del despliegue.

## Modelo de amenaza y ancla de confianza

El adversario principal posee la credencial del login SQL técnico y puede
ejecutar cualquier SQL permitido, conocer UUID/correlaciones, establecer GUC y
probar `SET ROLE`. No posee simultáneamente la memoria del proceso Node emisor,
el material HMAC privilegiado ni una credencial de administración de base de
datos. Un compromiso conjunto de proceso emisor y login SQL queda fuera de la
garantía y requiere separación física del emisor en una fase operativa.

La autoridad no procede de un UUID, JWT verificado solo en Node, GUC,
`current_user` mutable ni `SECURITY DEFINER`. Procede de una **capacidad HMAC
efímera y acotada a una operación**, emitida después de obtener la identidad
verificada y comprobada nuevamente dentro de PostgreSQL con una clave que el
login técnico no puede leer.

La entrada firmada canónica contiene, en este orden:

1. audiencia fija `sabora.order-line-transition.v1`;
2. `keyId`;
3. `databaseRole`, que debe ser exactamente `session_user`;
4. UUID del actor;
5. UUID de la línea;
6. estado destino;
7. correlación, que actúa como nonce/jti durable del replay;
8. `issuedAtMs`;
9. `expiresAtMs`.

Todos los campos capaces de cambiar autoridad, atribución o efecto están
firmados. La vigencia máxima es 30 segundos y el emisor usa 15 segundos por
defecto. La firma es HMAC-SHA-256 sobre bytes UTF-8 y PostgreSQL compara los 32
bytes completos acumulando diferencias, sin salida anticipada.

## Frontera SQL elegida

La migración candidata crea:

- `sabora.order_operation_signing_keys`, keyring inicialmente vacío, con RLS
  habilitada y forzada;
- `sabora_order_operations_fn_owner`, rol `NOLOGIN`, `NOINHERIT`,
  `NOSUPERUSER`, `NOBYPASSRLS`, sin membresías;
- `transition_order_line_authorized_candidate(...)`, única rutina mutadora
  candidata `SECURITY DEFINER`, con `search_path=pg_catalog,pg_temp` y sin SQL
  dinámico;
- policies exclusivas para el owner sellado y privilegios por columna. Los
  `UPDATE(state)` y `UPDATE(disabled_at)` existen únicamente porque PostgreSQL
  exige privilegio UPDATE para los locks `FOR SHARE`; el cuerpo no modifica
  esas columnas.

La migración aborta antes de conceder privilegios si el rol owner ya existe
con `LOGIN`, herencia, capacidades elevadas o cualquier membresía entrante o
saliente. No basta con que el preflight detecte esa deriva después del `GRANT`.

La migración no introduce login técnico, secreto, fila de clave ni `GRANT
EXECUTE` de runtime. `PUBLIC`, `anon`, `authenticated`, lectores y escritores
existentes permanecen revocados. Las RPC antiguas con actor libre siguen
inaccesibles.

## Orden transaccional y replay

El wrapper valida forma, audiencia implícita, rol de sesión, vigencia y firma;
bloquea la clave activa; serializa actor+correlación; bloquea y revalida la
membresía; vuelve a comprobar reloj y expiración después de cualquier espera;
y solo entonces puede devolver un replay o mutar la línea.

La clave queda estable hasta commit. Una deshabilitación que obtiene antes el
lock gana y rechaza la capacidad. La suspensión o el cambio de rol que obtiene
antes el lock de membresía también gana, incluido un replay. Si la operación
obtiene primero el lock, termina antes de que la revocación pueda confirmar.

La correlación firmada y el fingerprint durable permiten un replay idéntico
sin segundo evento. La misma correlación con otra línea o destino falla. Una
capacidad interceptada solo puede representar exactamente su operación, rol
SQL y corta ventana; si ya se consumió, únicamente reproduce el resultado. El
riesgo de robo previo al primer uso pertenece al compromiso del proceso/canal,
no a la posesión aislada de la credencial SQL.

## Matriz de privilegios candidata

| Principal | Permiso permitido | Permiso denegado |
| --- | --- | --- |
| Login técnico de transición | `USAGE` en `sabora`; `EXECUTE` solo del wrapper autorizado | tablas, columnas, secuencias, keyring, owners, RPC antiguas, `CREATE` |
| Owner sellado | columnas y policies exactas necesarias por el cuerpo; `hmac(bytea,bytea,text)` y triggers requeridos | login, herencia, bypass RLS, creación de objetos, acceso ajeno al flujo |
| Lector de personal | ninguno sobre el wrapper o keyring | transición y recursos operativos |
| `PUBLIC` / `anon` / `authenticated` | ninguno | wrapper, keyring y tablas privadas |
| Administrador de despliegue | futuro aprovisionamiento/rotación explícitos, fuera de runtime | no se provisiona en esta entrega |

`preflightOrderTransitionIdentity` acepta únicamente esa superficie positiva y
rechaza permisos extra. El preflight de composición HTTP conserva la política
de cero permisos: tablero e historial todavía no tienen una frontera SQL de
lectura positiva aprobada. Por ello las rutas completas siguen sin poder
montarse y `server.mjs` no cambia.

## Alternativas descartadas

- **Login PostgreSQL por actor:** ofrece ancla fuerte mediante `session_user`,
  pero exige aprovisionamiento, revocación y pooling por persona no existentes.
- **GUC / claims de sesión / `SET ROLE`:** falsificables por el mismo login y
  por tanto inválidos como identidad.
- **`SECURITY DEFINER` sin capacidad:** encapsula privilegios, pero conserva el
  UUID libre y aumenta el impacto.
- **JWT validado solo en Node:** la prueba desaparece al cruzar la frontera SQL.
- **Firma asimétrica:** reduce secretos dentro de PostgreSQL, pero no existe una
  primitiva/extensión aprobada en los contratos actuales. HMAC con keyring
  inaccesible es el cambio candidato mínimo y queda sujeto a aprobación antes
  de producción.

## Evidencia automatizada

El harness PostgreSQL 17 desechable cubre:

- reproducción de la suplantación anterior y rollback de la fixture insegura;
- cocina, camarero y ADMIN legítimos con login no propietario;
- falsificación de UUID, GUC, `SET ROLE`, firma, rol SQL, línea, destino,
  correlación, clave y expiración;
- destino SQL `NULL` contra un replay ajeno conocido, para impedir que la
  lógica trivaluada omita HMAC o fingerprint;
- expiración tras espera, deshabilitación concurrente de clave, suspensión,
  cambio de rol y replay revocado;
- concurrencia, idempotencia, conflicto, rollback, auditoría y aviso;
- denegación de tablas, columnas, keyring, secuencia, DDL y RPC antiguas;
- `PUBLIC`, `anon`, `authenticated` y lector sin `EXECUTE`;
- Fastify sin actor/rol controlables desde el cuerpo.

Comandos locales ejecutados en la rama:

```text
pnpm test
GITHUB_ACTIONS=true bash scripts/ci/catalog-postgres17-node-driver-smoke.sh
GITHUB_ACTIONS=true bash scripts/ci/postgres-migration-smoke.sh
```

Resultados locales: 758/758 tests unitarios; integración PG17 22/22 de
catálogo, 6/6 del flujo operativo y 12/12 de identidad/adversario; smoke
integral de migraciones PG17 correcto; `pnpm build` correcto para API, cliente
y gestión.

La revisión independiente posterior a las pruebas encontró dos defectos en el
primer candidato: propagación de `NULL` capaz de revelar un replay y validación
tardía de un owner preexistente inseguro. Ambos están corregidos en el commit
de implementación: rechazo explícito de `NULL`, digests fail-closed,
fingerprint con `IS DISTINCT FROM`, prueba SQL directa del replay y validación
del rol antes de todo privilegio. Los dos workflows del SHA publicado se
registran en el PR Draft antes del cierre final.

## Riesgos y autorizaciones pendientes

1. Aprobar `pgcrypto`/HMAC en el entorno objetivo y el modelo de amenaza.
2. Diseñar provisión, custodia, rotación, solapamiento y revocación de claves;
   no reutilizar credenciales del login técnico.
3. Aprovisionar un login `NOINHERIT` sin membresías y conceder solo el wrapper,
   mediante procedimiento separado y revisado.
4. Resolver la lectura mínima de tablero/historial antes de permitir que la
   composición registre rutas completas.
5. Revisar qué ocurre si se compromete también el proceso emisor; valorar
   emisor aislado o firma asimétrica.
6. Aplicar y volver a probar la migración solo con autorización operativa
   expresa. Esta entrega no la aplica fuera de PostgreSQL 17 desechable.

No se ha hecho merge, despliegue, modificación de Fleetia/VPS, acceso a
Supabase operativo ni uso de secretos reales.
