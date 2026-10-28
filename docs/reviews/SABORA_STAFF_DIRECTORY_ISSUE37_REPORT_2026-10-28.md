# Issue #37 — cierre del directorio de personal con RLS

Fecha de cierre técnico: 2026-10-28

Rama: `feat/sabora-staff-directory-rls-20261028`

PR: `#38` (Draft)

## Alcance normativo

La implementación se ha contrastado con `docs/security/SABORA_STAFF_DIRECTORY_READ_CONTRACT_V1.md` y con los contratos vigentes de identidad, ciclo de vida, identificador operativo, recogida de comandas y eventos H6. Este cambio no modifica contratos normativos.

El resultado mantiene tres proyecciones distintas:

- administración: listado paginado, búsqueda y detalle con nombre, apellidos, correo, rol, estado e identificador operativo;
- sala y cocina: únicamente identificadores operativos compactos dentro del contexto de la comanda, la recogida y los eventos SSE;
- empleado activo: consulta limitada de sus propios datos, sin acceso al directorio general.

La lectura no concede capacidades de escritura. Las operaciones de alta, suspensión, revocación, recuperación global de códigos y mantenimiento siguen separadas.

## Implementación

### PostgreSQL 17 y RLS

La migración candidata `20261028120000_sabora_staff_directory_read_candidate.sql` incorpora:

- `sabora.staff_directory_contacts`, con correo normalizado, unicidad y `FORCE ROW LEVEL SECURITY`;
- propietario sellado `sabora_staff_directory_fn_owner`, sin login, herencia ni bypass de RLS;
- wrapper transaccional de ciclo de vida que enlaza identidad, contacto e invitación sin escrituras parciales;
- función de lectura autorizada con audiencias HMAC separadas para listado, detalle y datos propios;
- comprobación por petición de identidad, pertenencia, rol, estado, revocación, caducidad y principal SQL;
- resultados con columnas explícitas y paginación acotada;
- eliminación de UUID, nombres y correo de las proyecciones operativas públicas y de SSE.

No se han concedido accesos directos a tablas ni permisos DDL al principal lector. La única capacidad prevista es ejecutar la función `SECURITY DEFINER` concreta, después de superar el preflight de privilegio mínimo.

### API candidata

Se han añadido capacidades, repositorio, coordinador, preflight de identidad, composición y adaptador HTTP separados para:

- `GET /api/v1/staff/directory`;
- `GET /api/v1/staff/directory/:enrollmentId`;
- `GET /api/v1/staff/me`.

Los DTO de administración y perfil propio son distintos y rechazan campos inesperados. El adaptador candidato no se ha montado en el servidor operativo: el Issue exige cerrar la solución sin activar rutas, credenciales o servicios productivos.

El ciclo de vida conserva compatibilidad con el wrapper anterior y añade el correo normalizado al mensaje firmado del wrapper de directorio. El encolado de invitaciones continúa usando explícitamente el contrato anterior, evitando mezclar autoridades o activar accidentalmente el nuevo borde.

### PWA de gestión

La vista de equipo queda conectada mediante un gateway de lectura independiente del gateway escritor e incluye:

- perfil propio limitado;
- listado, búsqueda, paginación y detalle solo para administración;
- estados de carga, vacío, error y reintento;
- actualización tras invitaciones sin convertir la lectura en escritura;
- presentación responsive y accesible, conservando el sistema visual premium aprobado.

Sala y cocina no reciben un directorio. En comandas y recogida solo se expone el identificador compacto (`claimedDisplayId`/`actorDisplayId`), también en mutaciones y SSE.

## Validación realizada

### PostgreSQL 17 desechable

El harness completo de integración aplicó todas las migraciones desde cero sobre PostgreSQL 17 y terminó satisfactoriamente. La suite específica del directorio verificó:

- principal SQL `LOGIN` restringido y preflight real de privilegios;
- denegación de lectura directa de las tablas, DDL, `SET ROLE` y escalada de privilegios;
- `FORCE RLS` sobre todas las tablas protegidas;
- alta transaccional de identidad, contacto e invitación;
- rollback total ante fallo y contradicción de replay;
- replay idempotente;
- listado, búsqueda, detalle y datos propios con DTO mínimos;
- denegación por firma falsificada, rol insuficiente, objetivo ajeno, suspensión, revocación y caducidad;
- 16 lecturas concurrentes frente a revocación y denegación garantizada después de confirmarse la revocación;
- recuperación global y reutilización controlada del código operativo;
- conservación de la identidad histórica tras reutilizar un código;
- paginación estable y límites acotados.

También pasaron las suites reales de ciclo de vida (14 escenarios), outbox de invitaciones (25 escenarios), H3, H6, recogida, identificadores operativos y el resto del catálogo PostgreSQL.

### Node, compilación y navegador

- `npm run check`: 991 pruebas superadas, 0 fallos; compilaciones de API, cliente y gestión correctas.
- `pnpm --filter @sabora/management test`: 41 pruebas superadas, 0 fallos.
- `pnpm --filter @sabora/management build`: correcto.
- Playwright visual de gestión: 12 capturas correctas en 360, 460, 900 y 1440 px para resumen, comandas y equipo; comprobación manual sin desbordamientos ni ruptura del diseño aprobado.
- `postgres-migration-smoke.sh`: correcto sobre PostgreSQL 17 desechable después de actualizar el inventario RLS a 44 tablas protegidas.
- `git diff --check`: correcto.

## Defectos encontrados y corregidos

Durante la integración real se detectaron y corrigieron cinco defectos que no aparecían en pruebas aisladas:

1. el puente HMAC hacia el wrapper anterior omitía los hashes de nombre y apellidos;
2. una aserción heredada esperaba el nombre de error anterior después de endurecer el borde;
3. una prueba H6 aún esperaba el UUID `claimedBy`, contrario al contrato de minimización;
4. una búsqueda de fixture colisionaba por coincidencia parcial del correo.
5. el smoke global conservaba el inventario anterior de 43 tablas RLS en vez de las 44 resultantes al añadir el almacén protegido de contactos.

Las suites completas se repitieron después de cada corrección.

## Límites y activación pendiente

- No se han activado rutas HTTP, principales SQL, secretos, workers ni servicios en ningún entorno operativo.
- No se ha ejecutado ninguna migración sobre Supabase operativo ni se han realizado cambios en Fleetia, VPS o recursos compartidos.
- Los empleados históricos anteriores a este candidato solo conservan el hash normativo del correo. Antes de una futura activación será necesaria una reconciliación autorizada de contactos; no es seguro ni posible reconstruir el correo original desde el hash.
- La habilitación de credenciales, montaje de rutas y migración productiva requieren una autorización posterior y un runbook específico. No forman parte de este PR Draft.

Los resultados remotos de GitHub Actions y el SHA final se publican en el informe de cierre del PR, una vez que el commit que contiene este documento queda disponible para CI.
