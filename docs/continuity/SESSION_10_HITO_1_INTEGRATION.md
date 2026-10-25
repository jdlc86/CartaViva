# Integración aislada — Hito 1 identidad y personal

**Base:** `integration/sabora-order-management-review` @ `03f5a4796c5ffa392c868dab74525233e5155e66`.
**Origen incorporado sin merge:** PR #10 @ `8598ee31a51edd80b1d7799013946766f67a0dfa` (3 commits por delante, 0 por detrás).
**Estado:** integración de código candidata, **no activación de runtime**.

## Alcance incorporado
- Capacidad HMAC de actor SQL para transiciones de cocina/sala, validación en PostgreSQL, owner sellado y migración candidata.
- Ciclo de vida del personal: invitación, aceptación, registro, activación, reenvío, suspensión y revocación desde el primer registro persistente.
- Repositorios, coordinadores, preflight de identidad, pruebas Node/PG17 y contratos técnicos del PR #10.

## Evidencia
- En SHA de origen `8598ee31a51edd80b1d7799013946766f67a0dfa`: Sabora CI #40176893065 SUCCESS; Bootstrap Sabora lockfile #40176892976 SUCCESS.
- Comparación de ramas: 3 commits delante, ninguno detrás. **Estos resultados no certifican futuros commits de integración.**

## Fronteras que permanecen cerradas
- `server.mjs` no monta endpoints de operaciones ni ciclo de personal.
- Keyrings vacíos; no se crea login operativo, no se concede EXECUTE a login de producción ni se aplican migraciones a Supabase operativo.
- Aprobación pendiente de HMAC/pgcrypto, custodia y rotación de claves, credenciales mínimas, entrega de invitaciones y registro WebAuthn, integración de lecturas y gateway UI autenticado.
- No hay merge a ramas protegidas, despliegue ni acceso a Fleetia/VPS.

## Criterios para el siguiente bloque
1. Revisar la arquitectura de claves y contratos pendientes antes de abrir rutas.
2. Construir la composición explícita del ciclo de personal solo después de disponer de transporte seguro de invitaciones y credenciales verificadas.
3. Ejecutar regresión Node, PG17 efímero y ambos workflows sobre el SHA exacto de cada cambio.
4. Documentar las decisiones y mantener el PR Draft.

No confundir integración del código candidato con disponibilidad funcional en producción.

## Bloque siguiente — composición de ciclo de personal (25-10-2026)

- `apps/api/src/staff-lifecycle-composition.mjs` incorpora `createVerifiedStaffLifecycleFromPool`, fábrica explícita que exige todas las dependencias de emisión/verificación y ejecuta el preflight SQL antes de exponer el coordinador. Reutiliza el repositorio candidato y `createPostgresTransaction`.
- `tests/staff-lifecycle-composition.test.mjs` verifica ausencia de conexiones cuando faltan dependencias, rechazo de roles prohibidos antes de abrir conexiones, liberación tras preflight fallido y que `server.mjs` no importa la composición.
- **No se habilitan rutas ni grants.** El módulo no emite correo, no autentica HTTP ni aprovisiona claves; esas decisiones permanecen pendientes de contrato y autorización.
- Los commits de este bloque requieren CI del SHA final; la certificación verde de `52f9a374` no los cubre.
