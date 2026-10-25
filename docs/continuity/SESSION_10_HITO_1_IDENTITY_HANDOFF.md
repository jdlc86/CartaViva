# Continuidad — Issue #9 / Hito 1 de identidad

Fecha: 2026-10-25. Rama: `codex/issue-9-hito-1-identidad`. PR Draft:
<https://github.com/jdlc86/CartaViva/pull/10>. Base verificada:
`integration/sabora-order-management-review` en
`03f5a4796c5ffa392c868dab74525233e5155e66`.

## Orden de lectura respetado

Antes de tocar código se leyeron el contrato consolidado y los contratos
específicos de identidad, personal, ownership, permisos, operaciones y
seguridad. Solo después se leyó `SESSION_09_HANDOFF.md` como contexto de
continuidad. La decisión normativa ya consolidada permite revocar desde el
primer registro durable y no se reinterpretó.

## Bloques terminados

1. `870230f`: cierra la suplantación HTTP↔SQL para las transiciones de cocina y
   sala con capacidades HMAC verificadas dentro de PostgreSQL, owner sellado,
   privilegios mínimos y matriz adversaria.
2. `9be238a`: implementa invitación, aceptación, registro, activación, reenvío,
   suspensión y revocación del personal, con ledger idempotente, auditoría
   append-only, carreras serializadas y preflight SQL.
3. Documentación: decisión P0, contrato técnico del ciclo y actualización de
   gates. Este documento forma parte del commit documental posterior.

La migración nueva fue creada con Supabase CLI 2.122.0 y solo se aplicó contra
PostgreSQL 17 local desechable. El contenedor y el módulo temporal del driver se
eliminaron al terminar.

## Evidencia local

- `pnpm test`: 772/772.
- `pnpm --dir apps/management test`: 35/35.
- `pnpm --dir apps/api build`: correcto.
- PostgreSQL 17, ciclo de personal: 9/9.
- PostgreSQL 17, actor operativo: integrado en el mismo harness de CI; pruebas
  de capacidad, suplantación, privilegios, concurrencia y rollback.
- `git diff --check`: correcto antes de cada commit.

El build Vite completo no pudo ejecutarse en el sandbox local porque `esbuild`
no puede leer su binario fuera del workspace. No es un error del repositorio:
los dos workflows de GitHub sí construyen cliente y gestión en un runner limpio.
El cierre del PR debe registrar ambos sobre el mismo SHA final.

## Estado de activación

La implementación es deliberadamente candidata. `server.mjs` sigue sin rutas
de identidad u operaciones; los keyrings están vacíos; no existen logins ni
grants runtime nuevos. Siguen pendientes aprobación criptográfica, custodia y
rotación de claves, aprovisionamiento de mínimos privilegios, contrato de
invitación/WebAuthn/correo, lecturas operativas y autorización de despliegue.

No se modificó Fleetia, Supabase operativo ni el VPS. No se hizo merge ni
despliegue.
