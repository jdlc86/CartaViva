# Sabora — preparación de versión candidata RC1

Fecha: 2026-10-27
Rama: `integration/sabora-production-readiness-rc1-20261026`
Base: `docs/sabora-production-readiness-codex-handoff-20261026` (`ae27b9087fda5f844a8b6d696e128ccb0e5bbe2d`)
Estado: candidato aislado; **no activado, no desplegado y no apto todavía para producción**.

Este documento registra implementación y evidencia. No modifica ni completa por
inferencia ningún contrato normativo.

## Fuentes normativas aplicadas

Se revisaron antes de implementar:

- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`;
- `docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md`;
- `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`;
- `docs/architecture/SABORA_CUSTOMER_SESSION_SQL_PRIVILEGES.md`;
- `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`;
- `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`;
- `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`;
- `docs/architecture/SABORA_CATALOG_PUBLICATION_GATE.md`;
- `docs/architecture/SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.md`;
- `docs/architecture/CARTAVIVA_PROJECT_BOUNDARY.md`;
- los contratos visuales y de pantalla de `docs/design/`.

Los documentos de continuidad se usaron únicamente para ordenar el trabajo.

## Resultado por bloque

### H3 — identidad, sesión, visita, quote y confirmación

Se incorpora una composición candidata, inyectada y desconectada por defecto:

1. registro de perfil y sesión en una única transacción;
2. cookie `__Secure-sabora_customer`, `HttpOnly`, `Secure`, `SameSite=Strict`;
3. recuperación de sesión y logout con revocación durable;
4. autorización de visita mediante sesión vigente, mesa abierta y QR vigente;
5. cotización multiproducto contra snapshots publicados y ledger privado;
6. confirmación multiproducto atómica, con idempotencia durable;
7. aceptación HMAC exacta y temporal de cualquier cambio de revisión o precio,
   incluido un precio inferior;
8. creación de pedido, líneas de cocina y ledger de intento en una transacción;
9. revalidación de sesión, visita, QR, mesa, disponibilidad y quote en cada
   operación relevante.

La PWA cliente recupera la sesión al montar, crea identidad desde Ajustes y
cierra sesión. La cookie sigue siendo la única credencial de identidad. El
token de mesa solo se recibe al leer el QR y se conserva en memoria durante la
visita: nunca se escribe en storage, URL de red, DOM, telemetría o service
worker. La navegación premium, la cesta local, los favoritos, el catálogo
publicado, ES/EN, accesibilidad y el comportamiento offline se conservan.

Por instrucción expresa se cerró el contrato que faltaba entre `tableId` y el
secreto revocable. V1 usa
`https://<origin>/qr/v1/<restaurantCode>/<tableId>#<token>`, con UUID canónico y
token CSPRNG de 32 bytes en Base64URL sin relleno. El fragmento se retira con
`history.replaceState` antes de montar React o iniciar red. La PWA admite enlace
directo y cámara local como mejora progresiva, detiene las pistas al leer,
cancelar o fallar, y no ofrece selector manual de mesa. Origen, restaurante,
versión o forma divergentes se rechazan sin llamar al endpoint de visita.

### H4–H5 — cocina, sala y circuito vertical

Se consolidan los cambios ya verificados de PR #16–#22:

- `confirmed → preparing → ready → picked_up`, sin equiparar recogida con
  entrega;
- principal operativo SQL mínimo con capacidad HMAC, fencing y revalidación;
- tablero e historial paginados y ligados al actor/rol;
- aviso durable a sala y reconocimiento idempotente;
- rechazo de acceso cliente a cocina y gestión;
- acciones explícitas y sin polling periódico;
- protección ante resultado ambiguo mediante correlation/request key estable.

La regresión de PostgreSQL 17 vuelve a recorrer el circuito cliente → pedido →
cocina → sala y las carreras, suspensiones, revocaciones y expiraciones del
principal operativo. No se rehicieron pantallas ni transiciones ya cerradas.

## Modelo SQL y ausencia de escalada

La migración `20261026222958_sabora_production_customer_flow_candidate.sql`
añade cuatro roles `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`:

- `sabora_customer_registration_runtime` y su owner sellado;
- `sabora_customer_flow_runtime` y su owner sellado.

El login de aceptación es distinto para registro, sesión y flujo de cliente.
Cada login es `NOINHERIT`, sin administración del clúster ni privilegios de
tabla, y solo puede hacer `SET LOCAL ROLE` sobre su capacidad. Node admite una
lista exacta de sentencias RPC y descarta la conexión si la transacción queda en
estado incierto. Las dos tablas nuevas de idempotencia/evidencia tienen RLS
forzada y triggers append-only. `anon` y `authenticated` no reciben acceso.

Los wrappers `SECURITY DEFINER` fijan `search_path`, tienen owner sin login y
reciben solo las columnas y políticas RLS necesarias. El runtime conserva
únicamente `USAGE` del schema y `EXECUTE` de los wrappers exactos.

La migración `20261027072924_sabora_table_qr_payload_v1.sql` mantiene
`rotate_table_qr` como `SECURITY INVOKER`, sin grants a browser, y restringe la
rotación al token V1 canónico. El emisor Node persiste el hash SHA-256 y entrega
el payload secreto solo al proceso autorizado de render/impresión; esta rama no
crea ese endpoint ni activa QR operativos.

## Defectos encontrados y corregidos

1. `grouping` sin delimitar en `RETURNS TABLE` era rechazado por PostgreSQL 17.
2. El gate de activación interpretaba las políticas exactas del owner sellado
   como políticas de browser/runtime. Ahora admite solo los dos nombres y el rol
   exactos, manteniendo el rechazo de cualquier política adicional.
3. El smoke esperaba 25 tablas RLS; los dos ledgers nuevos elevan el total a 27
   y se comprueban además de forma nominal.
4. El lookup de intento aplicaba `FOR UPDATE` al lado anulable de un `LEFT JOIN`.
   Se eliminó ese lock inválido; la escritura serializa después mediante lock
   advisory y bloqueo del intento existente.
5. El timestamp `first_confirmed_at` se calculaba una segunda vez. Ahora se
   persiste exactamente el `confirmed_at` de la primera orden.
6. La huella idempotente dependía del orden de claves JSON. Se sustituyó por una
   serialización canónica estable.
7. PostgreSQL exige privilegio `UPDATE` y una política `UPDATE` para los rows
   bloqueados por `FOR SHARE/UPDATE`. Se concedió únicamente `UPDATE(id)` al
   owner sellado `NOLOGIN`; runtime y login siguen sin acceso de tabla.
8. Dos lecturas `SELECT *` reclamaban columnas fuera del grant mínimo. Se
   sustituyeron por listas explícitas en mesas y catálogo, en vez de ampliar la
   superficie de lectura.
9. El preflight intentaba resolver firmas `regprocedure` antes de hacer
   `SET ROLE`; el login restringido rechazaba correctamente el acceso al schema.
   La introspección usa ahora `pg_proc`/`oidvectortypes` y ACL explícitas, sin
   exigir `USAGE` prematuro ni confundir membresía `NOINHERIT` con acceso directo.
10. La comparación del presupuesto persistido dependía del orden de propiedades
    que PostgreSQL `jsonb` no conserva. Se reutiliza la representación canónica;
    una simple reordenación ya no genera una aceptación HMAC falsa.
11. `node-postgres` convertía el array multiproducto en un array SQL antes del
    cast a `jsonb`. El lote se serializa ahora explícitamente como JSON y una
    regresión comprueba el contrato exacto del parámetro.
12. El adaptador HTTP clasificaba cualquier error interno con prefijo `invalid_`
    como petición inválida. Ahora solo los dos errores de entrada documentados
    devuelven 400; resultados SQL contradictorios o malformados permanecen
    cerrados como indisponibilidad 503 sin revelar detalles.
13. El smoke histórico rotaba a una cadena heredada de 64 caracteres. El nuevo
    contrato la rechazó correctamente; el fixture usa ahora dos tokens V1
    canónicos distintos y conserva la prueba real de rotación y fencing.
14. El check general transpila TypeScript con Vite, pero no ejecutaba el
    comprobador estático. Se integró `tsc --noEmit` en los builds de cliente y
    gestión, se declararon los tipos de Vite y se corrigieron estrechamientos
    inseguros de datos de cesta que el typecheck estricto hizo visibles.

## Evidencia local

| Verificación | Resultado |
|---|---:|
| `npm run check` | PASS, 967/967, typecheck estricto y builds API/cliente/gestión |
| `pnpm --filter @sabora/management test` | PASS, 35/35 |
| `pnpm --filter @sabora/client test:e2e` | PASS, 26/26 en 390 px y 1440 px |
| `scripts/ci/postgres-migration-smoke.sh` | PASS, PostgreSQL 17 desechable |
| Driver Node + PostgreSQL 17 | PASS, 93/93: 92 regresiones históricas + H3 restringido |
| GitHub Actions, PR #30, implementación `726527a` | PASS: `validate` 2m09s, `client-browser` 1m07s, `management-browser-smoke` 40s, `generate-lockfile` 2m09s |

La aceptación nueva del driver verifica con logins reales y restringidos:
registro, sesión, visita, dos líneas cotizadas, rollback si falla la segunda
línea, confirmación concurrente `confirmed/replayed`, una sola orden, dos líneas,
un solo intento, conflicto por reutilización divergente, repricing descendente,
aceptación HMAC, expiración de visita, revocación de sesión, RLS y ausencia de
privilegios directos. La misma prueba genera el QR mediante el emisor real,
parsea su payload, verifica el hash persistido, rechaza formato heredado, rota
la credencial, bloquea el token anterior y autoriza una visita nueva solo con
el token V1.

Playwright cubre enlace directo y escaneo de cámara simulado, limpieza de URL
antes de red, ausencia del secreto en URL/storage, rechazo de otro restaurante,
una sola autorización de visita, limpieza de contexto al cerrar sesión y parada
de todas las pistas multimedia. Un resultado tardío del detector tras cancelar
se ignora y no provoca llamadas de visita.

La matriz histórica ejecutada en la misma instancia desechable permanece verde:
catálogo/visitas (22), operaciones (8), identidad operativa (18), lectura y
circuito H5 (5), ciclo de personal (14) y invitaciones/outbox (25). El caso H3
nuevo añade una aceptación integral y deja el total del driver en 93 pruebas.

## Bloqueadores reales para producción

La RC queda en **NO-GO** hasta resolver y aprobar:

1. configurar y auditar el código/origen de restaurante, generar los QR V1 y
   verificar impresión, cámaras físicas y navegadores objetivo;
2. transporte dirigido de eventos, cursor, retención y recuperación de backlog;
3. contratos pendientes de reservas, anuncios publicados y comunicaciones;
4. entrega, cancelación, incidencias económicas, cobro y cierre del pedido;
5. recuperación de identidad/passkey y política de retención definitiva;
6. provisión auditada de logins, secretos/HMAC, TLS y observabilidad;
7. ensayo de migración y rollback sobre una copia aislada representativa;
8. revisión independiente y autorización expresa de activación/despliegue.

## Plan de activación futuro (no ejecutado)

1. congelar SHA revisado y obtener aprobación independiente;
2. respaldar y verificar restauración en entorno aislado;
3. aplicar migraciones a un clon y ejecutar todos los gates PG17;
4. provisionar los tres logins sin herencia y custodiar secretos fuera de SQL;
5. ejecutar preflight de identidad/privilegios antes de montar rutas;
6. habilitar la composición opt-in detrás de una ventana controlada;
7. ejecutar smoke sin correo, worker ni operaciones destructivas;
8. abortar y retirar la composición si falla cualquier gate; las migraciones
   candidatas no autorizan por sí mismas tráfico de producción.

No se modificó `server.mjs`, no se crearon logins operativos, no se desplegó y
no se tocaron Supabase operativo, Fleetia, VPS ni recursos compartidos. La API
nativa `BarcodeDetector` sigue siendo una mejora progresiva: donde no existe,
la vía compatible es abrir el enlace QR con la cámara del sistema. La aceptación
con material impreso y dispositivos físicos queda como requisito de activación,
no como funcionalidad simulada en esta RC.
