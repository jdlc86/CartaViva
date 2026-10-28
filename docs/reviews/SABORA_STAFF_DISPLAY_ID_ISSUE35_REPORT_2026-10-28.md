# Cierre de implementación — Issue #35: identidad operativa de personal

Fecha: 2026-10-28

Rama: `feat/sabora-staff-display-id-20261027`

PR: #36 (Draft)
Base: `feat/sabora-pickup-claim-cancel-20261027`

## Fuente de verdad y alcance

La implementación se contrastó con la normativa vigente del repositorio, en especial:

- `docs/REQUISITOS_FUNCIONALES.md`.
- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`.
- `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`.
- `docs/security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md`.
- `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`.
- `docs/architecture/SABORA_H6_EVENTS_PAYMENTS_OPERATIONS_CANDIDATE.md`.
- `docs/SABORA_AUTHORIZATION_GATE.md` y los contratos SQL de mínimo privilegio.
- `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/design/DESIGN_REQUIREMENTS_V1.md` y el estilo visual aprobado.
- Issue #35, que concreta la secuencia, el mantenimiento exclusivamente global y la conducta ante agotamiento.

No se modificó ningún contrato normativo para acomodar la solución.

## Resultado funcional

El bloque candidato queda implementado de extremo a extremo:

1. El alta exige nombre, apellidos, correo y rol, y conserva el UUID como identidad interna.
2. PostgreSQL reserva de forma transaccional un código único de tres caracteres. La prioridad es `001`–`999`, sin `000`, y continúa en orden base 36 excluyendo los valores completamente numéricos: `00A`, `00B`, …, `ZZZ`. El pool contiene 46.655 códigos.
3. El identificador de presentación se deriva en servidor y queda protegido por constraint: inicial del nombre + inicial del primer apellido + guion + código, por ejemplo `JG-027` o `JG-00A`. No participa en autenticación ni autorización.
4. La misma transacción confirma el ciclo de vida, reserva el código, persiste nombre y apellidos y añade evidencia inmutable de asignación. Un fallo en cualquier paso revierte el alta completa.
5. Los reintentos con la misma correlación devuelven la asignación durable original; un cambio de intención produce conflicto de idempotencia.
6. «Voy a recoger» toma una instantánea del identificador operativo en la tarea de recogida. La proyección del tablero y los eventos SSE para sala y cocina incluyen `claimedDisplayId` y `actorDisplayId`, de modo que una reutilización futura del código no reescribe el historial.
7. La PWA de gestión incorpora formulario de alta, resultado con código/identificador, explicación accesible del agotamiento y mantenimiento global con previsualización, motivo obligatorio, confirmación explícita y resumen de elegibles, bloqueados, disponibles y recuperados.
8. No existe acción ni API de liberación individual.

## Mantenimiento global y agotamiento

La recuperación se ejecuta únicamente mediante `maintain_staff_employee_codes_authorized_candidate`:

- requiere una capacidad HMAC de vida máxima de 30 segundos, ligada al principal SQL, actor, acción, confirmación, motivo, correlación y tiempos;
- revalida bajo bloqueo al titular administrativo y su membresía activa;
- serializa las operaciones globales y los reintentos;
- en `preview` no modifica el pool;
- en `recover` libera en bloque únicamente asignaciones revocadas sin una recogida todavía reclamada;
- conserva la fila de alta y añade un evento `released` inmutable con actor, motivo y solicitud de mantenimiento;
- impide que la misma correlación represente otra intención;
- rechaza campos obligatorios nulos y firmas de longitud incorrecta antes de cualquier efecto.

Cuando los 46.655 códigos están ocupados, el wrapper eleva `staff_employee_codes_exhausted`. El alta, su registro de idempotencia, su evento y cualquier reserva quedan completamente revertidos. HTTP responde `409` con un error de dominio estable y una indicación para abrir el mantenimiento global. La PWA informa de que no se reservó ningún código parcial y ofrece el acceso únicamente dentro del área administrativa.

## Seguridad y auditoría

- Las tablas nuevas tienen RLS habilitado y forzado.
- El owner de funciones es `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`, sin membresías ni capacidad de crear roles, bases o replicar.
- Los grants del pool están limitados por columna: lectura de código/orden/asignación y escritura solo de la reserva.
- Los principales de aceptación son logins SQL restringidos distintos para ciclo de vida y mantenimiento; las pruebas no sustituyen esos principales por el administrador de PostgreSQL.
- `PUBLIC`, `anon`, `authenticated`, lectores y runtimes existentes no reciben acceso a las nuevas tablas o funciones.
- Los historiales de asignación, solicitudes de identidad y mantenimiento son append-only, incluido `TRUNCATE`.
- La firma HMAC se compara byte a byte y se vuelve a comprobar la caducidad tras los bloqueos relevantes.
- El principal restringido no puede leer el pool, modificar altas directamente, usar funciones internas, alterar el esquema ni escalar mediante roles.
- La revocación no libera códigos automáticamente. La recuperación solo ocurre después de la revisión global confirmada.

## Validación ejecutada

### PostgreSQL 17 desechable

Se ejecutaron desde cero todas las migraciones en contenedores `postgres:17-alpine`, sin red hacia Supabase ni uso del VPS:

- `scripts/ci/postgres-migration-smoke.sh`: finalización correcta de migraciones, RLS, gates negativos, concurrencia e invariantes históricas.
- `scripts/ci/catalog-postgres17-node-driver-smoke.sh`: 97/97 pruebas reales mediante `node-postgres`.
- Bloque específico Issue #35: 3/3.
  - orden completo, reintento durable, asignaciones concurrentes y frontera `999` → `00A`;
  - mantenimiento global idempotente, auditado, sin liberación individual, rechazo de capacidad incompleta y denegaciones directas al principal restringido;
  - agotamiento total con rollback de alta, idempotencia y auditoría, sin efectos parciales.
- Regresión dentro del mismo arnés: ciclo de vida 14/14, invitaciones/outbox 25/25, H3 1/1 y H6 1/1, además de operaciones y lecturas de cocina/sala.

### Node, TypeScript y builds

- `npm run check`: correcto.
- Suite monorepo: 982/982.
- Builds de API, PWA cliente y PWA de gestión: correctos.
- Suite focal del nuevo contrato: 4/4.
- Suite de gestión: 38/38.

### Playwright y conformidad visual

`scripts/ci/management-browser-visual-smoke.sh` generó correctamente 12 capturas del preview local aislado:

- vistas `Resumen`, `Comandas` y `Equipo`;
- anchuras 360, 460, 900 y 1440 píxeles.

Durante la validación se detectaron reglas base duplicadas situadas después de los media queries que comprimían las tarjetas de roles en móvil. Se eliminaron y se añadió una aserción de contrato responsive. El resultado final conserva el diseño aprobado y es legible en las cuatro anchuras.

## Defectos corregidos durante la integración

- grants necesarios para que el owner sellado pudiera tomar bloqueos `FOR SHARE`/`FOR UPDATE` sin ampliar la superficie de mutación funcional;
- compatibilidad del wrapper anterior al ampliar la fila de `staff_enrollments`;
- propagación de nombre y apellidos a través del wrapper atómico de invitación + outbox;
- fixtures de integración con tiempos no deterministas;
- replay de alta con intención estable y material regenerado;
- validación explícita de nulos en la capacidad de mantenimiento;
- constraint exacto para impedir identificadores de presentación válidos por regex pero incoherentes con el nombre y código;
- validación fail-closed de relojes, TTL y contadores de mantenimiento;
- carrera del arnés de lectura que instalaba tarde el observador de un rechazo esperado tras un bloqueo SQL;
- regresión visual responsive de la vista Equipo.

## Límites y activación pendiente

Este PR entrega código candidato, migración, adapters, UI, pruebas y documentación, pero respeta las puertas operativas existentes:

- no se aplicó ninguna migración a Supabase operativo;
- no se montaron ni activaron rutas candidatas en el servidor productivo;
- no se provisionaron logins, claves HMAC ni secretos operativos;
- no se activaron worker, correo, endpoints ni servicios;
- el directorio conectado de personal continúa deliberadamente vacío hasta disponer de su proyección RLS aprobada; no se inventaron datos ni un contrato de listado;
- no se realizó merge ni despliegue y no se intervino sobre Fleetia, VPS o recursos compartidos.

Estas tareas son puertas de activación/despliegue posteriores; no se han simulado como completadas en este hito.
