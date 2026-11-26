# S54-22 — Preparación de prueba Auth alojado en RESTAURANTE

Estado: preparación candidata; NO-GO para activar H1-A. No sustituye los contratos normativos ni autoriza SQL, VPS o merge.

## Observaciones reales de solo lectura

26-11-2026, con el conector del proyecto RESTAURANTE y referencia exacta `byhvmumqivmunkmomhup`: proyecto `ACTIVE_HEALTHY`, PG 17.11, región eu-central-1. Consulta en transacción READ ONLY: auth.users=0, miembros ROOT=0, otros miembros=0; tablas root_recovery_state_candidate y staff_recovery_registration_candidate ausentes. No se leyeron correos, secretos ni datos de otro proyecto. No se ha verificado la configuración de Auth mediante Management API, ni el TLS verify-full del circuito DBA con esta observación. No reejecutar genesis.

## Configuración que debe cotejar el propietario en el panel

- [Authentication > Passkeys](https://supabase.com/dashboard/project/byhvmumqivmunkmomhup/auth/passkeys): habilitado; RP ID `gestion-sabora.allaiso.com`; RP display name Sabora Gestión; RP origins `https://gestion-sabora.allaiso.com:8443` (origen exacto del candidato existente; comprobar contra TLS/configuración V2 antes de cambiar).
- [Authentication > URL Configuration](https://supabase.com/dashboard/project/byhvmumqivmunkmomhup/auth/url-configuration): comprobar Site URL y redirects mínimos del mismo origen, no comodines; ningún redirect a Fleetia. Mantener RP estable.
- Resend: comprobar remitente/dominio verificado y custodia de clave en el backend propio; distinguir SMTP de Auth (si lo requiere el flujo autorizado) de API Resend que entrega el outbox Sabora. Evitar doble envío. No colocar clave secreta en PWA, chat, repo ni CI. No crear otro servicio ni proyecto.
- Verificar RS256/JWKS actual y claves publicables; no rotar las claves existentes por esta revisión. El conector disponible no permite leer/escribir /config/auth; no se declara habilitado Passkeys ni SMTP.

Fuentes públicas: [Passkey authentication](https://supabase.com/docs/guides/auth/passkeys), [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [signOut](https://supabase.com/docs/reference/javascript/auth-signout), [REST verify](https://github.com/supabase/auth/blob/master/internal/api/verify.go). Passkeys experimental, verificar contrato desplegado con prueba real; el índice changelog.md no fue recuperable con el lector web.

## Integración existente y delta de código

No duplicar proveedor: `gateway-jwks-fetch.mjs` contiene `createGatewayPasskeyProvider` y el canal TLS exacto hacia Auth; el manifiesto de activación ya conecta login por passkey cuando dispone de clave publicable. Se añade intercambio `POST /auth/v1/verify` con token_hash limitado a invite/recovery, devuelve solo accessToken para circuito restringido. No genera enlace ni registra sesión operativa. Antes de invocarlo desde HTTP, comprobar intención, propósito, versión y token Sabora; después verificar JWT/UUID/session_id/email y caducidad; descartar/retirar sesión auxiliar si no coincide. No confiar en metadata de navegador ni modificar contraseña. El transporte no autentica por sí solo el propósito de negocio. Prueba focalizada del contrato de transporte en el test existente.

## Único ensayo alojado pendiente

Preparar autorización de operación Auth explícita sobre cuentas ficticias del proyecto actual, no sobre un usuario real; mismo RP de gestión y canal restringido. No hace falta otro VPS, nuevo servicio, workflow de deploy ni nueva base. No activar endpoints públicos antes de que estén conectados y probados. Conservar 103 migraciones genesis; delta append-only con ledger y CV005 bajo contrato V2, autorización SQL separada. Completar adaptador admin generateLink/listPasskeys/deletePasskey con autoridad y UUID acotados, enlace ligado al outbox/intención, intercambio real y correlación inequívoca de receipt con huella nueva. La prueba del proveedor puede arrancar sin escribir tablas Sabora cuando exista cuenta de ensayo autorizada; el recorrido integrado exige el delta validado. Acreditar login/registro/revocación y denegación de sesiones/credenciales viejas, UUID estable, limpieza exacta de las cuentas ficticias y material temporal sin secretos en informe. No atribuir a logout revocación instantánea de JWT. ROOT requiere ensayo especial separado con prueba de dos factores y revocación. El núcleo S54-21 y sus receipts siguen pendientes de validación remota y fence de escrituras.

CI anterior `26fe16c2`: cinco jobs verdes, H6 rojo (subtest 49 B3 navegación destruye execution context en línea 6570 de table-change-root-postgres17.test.mjs; subtest 50 F12 encuentra solicitud pendiente posterior al fallo B3). No atribuir esos fallos a Auth sin evidencia; Bootstrap PG17 aún en curso al revisar. No relajar aserciones, no declarar flake sin comprobación; nuevo SHA debe superar todo. No se ha cambiado el harness B3, ni desplegado ni aplicado SQL.
