# Informe de corrección y auditoría integral — PR #13

Fecha: 2026-10-26. Rama:
`integration/sabora-pr11-merge-reconciliation`. PR Draft:
<https://github.com/jdlc86/CartaViva/pull/13>.

## Alcance y método

La revisión tomó como base Git exacta
`f33c39e4e03fdb6f84a415a878519fee613cd757` y auditó el snapshot previo
`ad8760bd61a2a31703e2b53368037fe8f4eb39e1`. Se revisaron los 40 archivos de
código/configuración cambiados inventariados por la auditoría, más migraciones,
pruebas y documentación vinculadas. La documentación normativa se leyó antes
que la documentación de continuidad.

Fuentes normativas principales:

- `docs/security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md`.
- `docs/security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md`.
- `docs/security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md` y
  `docs/security/SABORA_OPERATIONAL_ACTOR_BINDING_DECISION_GATE.md`.
- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`,
  `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md` y
  `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`.
- `docs/SABORA_AUTHORIZATION_GATE.md`.

La validación combinó revisión de flujos y privilegios, pruebas Node, Fastify
real y un contenedor PostgreSQL 17 desechable publicado solo en loopback. No se
consultó ni modificó Supabase operativo, Fleetia, VPS u otro recurso compartido.

## Hallazgos de la segunda revisión

| Hallazgo | Causa confirmada | Corrección | Evidencia |
| --- | --- | --- | --- |
| P2 replay HTTP de `invite` | Node exigía que el UUID durable devuelto coincidiera con el UUID efímero regenerado | Se permite UUID distinto únicamente para `invite && repeated === true`; todas las demás acciones y filas nuevas conservan igualdad estricta | Unit test del repositorio y ruta JWT → coordinador → repositorio → PG17: 201 inicial, 200 replay, UUID/evento originales, un ledger/audit y ninguna segunda entrega |
| P2 lector acepta escritura por columna | El predicado negaba escrituras de tabla y columnas extra, pero no `INSERT/UPDATE/REFERENCES` sobre las tres columnas permitidas | Se niegan los tres privilegios con `has_any_column_privilege`, más `TRUNCATE/REFERENCES/TRIGGER` de tabla; solo queda SELECT exacto | Grants PG17 individuales y combinados fallan el preflight; tras revocarlos vuelve a pasar la lectura real bajo RLS |

Commit de implementación y pruebas: `06a32fe`.

## Revisión de los hallazgos anteriores

- **P1, caducidad tras `order_lines FOR UPDATE`: cerrado.** El wrapper vuelve a
  leer `clock_timestamp()` después del lock y antes de mutar. La prueba retiene
  la línea hasta superar el TTL y confirma cero eventos, requests,
  notificaciones o cambio de estado.
- **P2, intención durable de invite/resend: cerrado.** El fingerprint excluye
  solo UUID/token regenerables para `invite` y token para `resend`; actor,
  correlación e intención estable permanecen vinculados. Cambiar rol produce
  conflicto. El replay no persiste ni entrega el token nuevo.
- **P2, compatibilidad de preflight y lector real: cerrado para el POST
  aislado.** Se usa el rol real `sabora_staff_reader`, su política RLS y su
  consulta fijada, junto a un segundo login mutador sin acceso directo. Las
  lecturas de tablero/historial siguen fuera del gate y sin activar.

## Propiedades comprobadas

- HMAC incluye audiencia, `session_user`, actor, objetivo, correlación y
  ventana temporal; manipulación, clave desconocida, GUC y `SET ROLE` fallan.
- Revocación y cambio de membresía se revalidan bajo lock antes de replay o
  mutación; una revocación tardía impide accept/resend/replay.
- Atomicidad y rollback abarcan estado, ledger, auditoría, notificación y
  outbox según el wrapper probado; los reintentos concurrentes producen un
  único efecto y un único evento.
- Owners `SECURITY DEFINER` sellados, `search_path` fijado, FORCE RLS, grants
  por columna y ausencia de privilegios elevados/membresías fueron contrastados.
- El outbox conserva fencing antes del dispatch, cancela trabajo superseded o
  revocado y registra el resultado ambiguo del proveedor como terminal sin
  reintento automático.
- HTTP no acepta actor/rol del cuerpo, no expone tokens y normaliza fallos no
  clasificados a respuestas genéricas.

No surgió otro hallazgo abierto de severidad igual o superior dentro del diff
auditado. Los dos P2 originales se clasifican como severidad de seguridad baja
en el análisis de rutas (disponibilidad contractual y detector de deriva con
RLS independiente), sin rebajar su prioridad de corrección para el PR.

## Evidencia local reproducible

| Comando/harness | Resultado |
| --- | --- |
| `node --test tests/staff-lifecycle-repository.test.mjs tests/order-operations-identity-preflight.test.mjs` | 15/15 PASS |
| `npm test` | 891/891 PASS |
| `GITHUB_ACTIONS=true bash scripts/ci/catalog-postgres17-node-driver-smoke.sh` | 85/85 PASS: catálogo 22, operaciones 8, identidad 18, ciclo 12, outbox 25 |
| `node --check` de ambos harness modificados y `git diff --check` | PASS |

La primera ejecución ampliada detectó dos defectos del propio test: el rol
efímero no estaba cubierto por la política RLS nominal del lector y alterar el
último carácter base64url de una firma podía conservar bytes equivalentes. Se
corrigió la aceptación para usar el rol real sujeto a RLS y alterar un byte
significativo; la repetición completa quedó verde.

## Límites y riesgos residuales

- Todo continúa como candidato opt-in y sin importación desde `server.mjs`.
- No se provisionaron logins, claves o grants persistentes; el harness los
  modifica únicamente dentro del PostgreSQL desechable y lo elimina al salir.
- No se activaron worker, proveedor de correo, endpoints operativos, merge o
  despliegue. Las rutas GET de operaciones permanecen fuera del alcance.
- La entrega de correo real, WebAuthn, rotación operativa de secretos,
  observabilidad de proveedor y procedimientos de recuperación siguen
  requiriendo contratos y autorización propios.
- Esta es una autoauditoría de los cambios realizados. No se presenta como
  revisión independiente; tras CI verde debe solicitarse un revisor separado.

## GitHub Actions

El commit `78df0324eba1e5a5904f69c50905544e5b68a1bf`, que contiene la corrección,
las pruebas PostgreSQL 17 y este informe, obtuvo resultado satisfactorio en los
dos workflows disparados por el PR:

- [Sabora CI — run 40260595681](https://github.com/jdlc86/CartaViva/actions/runs/40260595681):
  `success`; incluye 891 pruebas Node, build, migraciones en PostgreSQL 17
  desechable, harness de integración mediante el driver `pg`, validación de
  Docker Compose, construcción aislada de la imagen y smoke tests sin red
  compartida.
- [Bootstrap Sabora lockfile — run 40260595794](https://github.com/jdlc86/CartaViva/actions/runs/40260595794):
  `success`; confirma lockfile reproducible y repite satisfactoriamente la
  migración PostgreSQL 17, el harness con driver real y los smoke tests
  aislados.

GitHub emitió únicamente avisos informativos sobre la migración futura de
`ubuntu-latest` y el uso forzado de Node.js 24 por acciones todavía basadas en
Node.js 20; no hubo errores ni avisos funcionales de la implementación. El
comentario final del PR registra además el resultado de CI sobre el SHA
documental definitivo. El PR permanece en Draft.

## Tercera auditoría independiente: reproducción y corrección

Se revisaron expresamente los dos P2 comunicados en
`discussion_r4373603589` y `discussion_r4373603592`, después de releer las
fuentes normativas enumeradas al inicio de este informe.

| Hallazgo | Reproducción previa | Corrección y resultado |
| --- | --- | --- |
| Replay durable de invitaciones | PostgreSQL 17 devolvía el enrollment durable de la primera llamada, pero el lookup del outbox añadía el hash del token recién regenerado y producía `staff_invitation_outbox_replay_missing` | El replay localiza el job por `(enrollment_id, invite_version)` durable. Un retry con UUID/token distintos devuelve el job original y no crea ninguna segunda fila o entrega |
| Caducidad durante bloqueo de suspensión/revocación | Una conexión retenía `staff_members`; la capacidad de suspensión y la clave de revocación caducaban mientras el wrapper esperaba en el `UPDATE`, pero ambas operaciones confirmaban | El wrapper toma `FOR UPDATE` sobre la membresía objetivo antes de la revalidación temporal final. Ambas reproducciones fallan cerradas con `42501`, hacen rollback total y mantienen los estados originales |

La línea base ampliada fue deliberadamente roja: las dos nuevas aserciones
estáticas obtuvieron 10/12 PASS y la ejecución PostgreSQL alcanzó 12/14 casos
de ciclo; los dos escenarios temporales produjeron `Missing expected
rejection`. Esto confirma que las regresiones detectan el SQL vulnerable y no
se limitaron a comprobar la implementación ya corregida.

La ejecución posterior queda así:

| Comando/harness | Resultado |
| --- | --- |
| `node --test tests/staff-lifecycle-sql.test.mjs tests/staff-invitation-outbox-schema-contract.test.mjs tests/staff-invitation-enqueue-candidate.test.mjs` | 19/19 PASS |
| `GITHUB_ACTIONS=true bash scripts/ci/catalog-postgres17-node-driver-smoke.sh` | 87/87 PASS: catálogo 22, operaciones 8, identidad 18, ciclo 14 y outbox 25 |
| `npm test` | 892/892 PASS |
| `npm run check` | PASS: 892 pruebas y builds de API, cliente y gestión |
| `node --check` de ambos harness modificados y `git diff --check` | PASS |

Las pruebas reales incluyen replays de invite, resend y custodia con material
regenerado; dos callers concurrentes; unicidad de enrollment/job/request/audit;
revocación que impide replay tardío; suspensión y revocación normales; doble
revocación; carrera activate/revoke; y expiración de capacidad y clave mientras
otra conexión posee el lock de membresía. Los accesos se realizan por los
principales SQL restringidos existentes en el harness, con FORCE RLS y sin
sustituirlos por el administrador para la llamada bajo aceptación.

La revisión adversarial posterior contrastó llamadas directas, estados de
replay hermanos, unicidad, orden de locks, RLS, grants y semántica de errores.
No se encontró un bypass sobreviviente en estos dos límites. El alcance sigue
siendo candidato opt-in: no se activaron rutas, worker, proveedor, Supabase
operativo, Fleetia, VPS ni recursos compartidos. La provisión y rotación real
de identidades/secretos, el envío real y la observabilidad del proveedor siguen
siendo riesgos operativos pendientes y ajenos a esta corrección. La evidencia
de GitHub Actions del SHA final se añadirá tras publicar los commits.
