# Decisión P0 — vinculación no falsificable del actor HTTP ↔ PostgreSQL

Fecha: 2026-10-25. Estado: **candidato demostrado; no activado**. Rama:
`codex/issue-9-hito-1-identidad`. Base normativa:
`03f5a4796c5ffa392c868dab74525233e5155e66`. Implementación:
`870230f`. PR Draft: <https://github.com/jdlc86/CartaViva/pull/10>.

Esta decisión resuelve técnicamente el bloqueo descrito en
`SABORA_OPERATIONAL_ACTOR_BINDING_DECISION_GATE.md`; no autoriza aplicar la
migración, provisionar secretos o logins, conceder permisos, montar rutas,
fusionar ni desplegar.

## Hallazgo y modelo de amenaza

La RPC anterior aceptaba `p_actor_user_id`. Revalidar ese UUID contra
`staff_members` no probaba quién controlaba la conexión. Un login SQL técnico
con permisos suficientes podía atribuir la transición a otro miembro activo.
El adversario considerado conoce UUID, correlaciones y la credencial del login
técnico; puede emitir SQL, GUC y `SET ROLE`, pero no controla simultáneamente el
proceso emisor ni lee el material criptográfico sellado en PostgreSQL.

La autoridad elegida es una capacidad HMAC-SHA-256 efímera emitida después de
verificar la identidad HTTP. La entrada canónica firma audiencia, `keyId`,
`session_user`, actor, línea, destino, correlación y ventana temporal. La
vigencia máxima es 30 segundos. PostgreSQL verifica todos los campos, compara
los 32 bytes completos y vuelve a comprobar expiración después de adquirir
locks. UUID, GUC, rol funcional y `current_user` no se aceptan como prueba.

## Frontera SQL candidata

- `sabora.order_operation_signing_keys` permanece vacío y con RLS forzada.
- `sabora_order_operations_fn_owner` es un owner `NOLOGIN`, `NOINHERIT`, sin
  superusuario, `BYPASSRLS`, creación de roles/base ni membresías.
- `transition_order_line_authorized_candidate(...)` es la única rutina
  mutadora candidata `SECURITY DEFINER`, con `search_path` cerrado y sin SQL
  dinámico.
- El owner recibe solo columnas y funciones indispensables. La migración aborta
  si encuentra un owner preexistente inseguro antes de conceder privilegios.
- No se crea un login runtime, no se inserta una clave y no se concede
  `EXECUTE`. La RPC anterior con actor libre sigue revocada.

La correlación firmada funciona como nonce durable. Un replay idéntico devuelve
el mismo resultado sin un segundo evento; la reutilización con otro fingerprint
falla. La clave, la membresía y la línea se bloquean y se revalidan dentro de la
misma transacción. Una suspensión confirmada antes del lock invalida incluso el
replay.

## Alternativas evaluadas

| Alternativa | Decisión |
| --- | --- |
| Login PostgreSQL por persona | No elegida: requeriría credenciales y pooling por actor no disponibles. |
| GUC, claims o `SET ROLE` | Rechazada: el propio login puede falsificarlos. |
| `SECURITY DEFINER` con UUID libre | Rechazada: encapsula privilegios, pero no identidad. |
| JWT validado solo en Node | Rechazada: la evidencia desaparece al cruzar la frontera SQL. |
| Firma asimétrica | Diferida: no existe una primitiva/extensión aprobada en los contratos actuales. |
| Capacidad HMAC verificada en PostgreSQL | Elegida como candidato mínimo, sujeto a aprobación operativa. |

## Evidencia de PostgreSQL 17

El harness desechable prueba, con login realmente restringido:

- reproducción y cierre de la suplantación del diseño anterior;
- cocina, sala y ADMIN legítimos;
- falsificación de actor, rol SQL, GUC, `SET ROLE`, firma, línea, destino,
  correlación, clave y tiempo;
- expiración tras espera, deshabilitación de clave, suspensión y cambio de rol;
- replay, conflicto, concurrencia, rollback, evento y notificación atómicos;
- denegación de tablas, columnas, secuencias, keyring, DDL y RPC antiguas;
- `PUBLIC`, `anon`, `authenticated` y lectores sin `EXECUTE`.

Las pruebas unitarias verifican además que Fastify no admita actor o rol desde
el cuerpo y que el preflight rechace cualquier deriva positiva no prevista.

## Activación pendiente

Antes de producción aún hacen falta aprobación del modelo HMAC/`pgcrypto`,
custodia y rotación de claves, procedimiento de creación del login restringido,
frontera de lectura del tablero/historial y autorización operativa expresa.
Hasta entonces `server.mjs` no registra las rutas y el keyring queda vacío.

No se ha accedido a Supabase operativo, Fleetia ni el VPS.
