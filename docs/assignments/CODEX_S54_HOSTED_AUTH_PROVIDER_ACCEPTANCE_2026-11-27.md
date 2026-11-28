# Encargo Codex S54-29 — aceptación real de Supabase Auth (H1-A)

Fecha: 27-11-2026. Exclusivamente `jdlc86/CartaViva`. Encargo técnico, no modificación de normativa ni autorización de despliegue.

## 1. Objetivo y estado verificado

Cerrar la validación real del proveedor Auth para invitación, registro, autenticación, recuperación y revocación de passkeys de una identidad ficticia no ROOT, conservando su UUID. Continuar [Draft #92](https://github.com/jdlc86/CartaViva/pull/92), rama `fix/sabora-s51-first-deploy-20261124`, y [Issue #93](https://github.com/jdlc86/CartaViva/issues/93). HEAD de referencia `9324120044e65dcf169458195aa08764c95eb2c8`; revalidar y conciliar trabajo concurrente. No abrir otro PR, force-push ni fusionar.

- CI ordinaria 7/7 PASS en ese SHA: [H6](https://github.com/jdlc86/CartaViva/actions/runs/45909975716), [PG17](https://github.com/jdlc86/CartaViva/actions/runs/45909975729) y controles web. CV005+B2 omitido, aceptación visual final no acreditada.
- [Sonda Auth alojada PASS](https://github.com/jdlc86/CartaViva/actions/runs/45905970780/job/140202634645): HTTPS, JWKS RS256, opciones WebAuthn y RP ID `gestion-sabora.allaiso.com`. No acredita ceremonia, registro ni recuperación.
- Ensayo preparado en `scripts/ops/sabora-hosted-auth-passkey-exercise.mjs`, helper `sabora-hosted-auth-exercise-safety.mjs` y `tests/hosted-auth-exercise-safety.test.mjs`. S54-28 endureció aislamiento del navegador y reconciliación. Aún no ejecutado contra Auth real.
- Propietario confirma que existe un secreto temporal de GitHub Actions a nivel de repositorio, `SABORA_AUTH_TEST_SECRET_KEY`. No se ha verificado su valor ni funcionamiento. La propuesta de workflow administrativo anterior quedó bloqueada por controles de seguridad de OpenAI antes de publicarse; motivo interno desconocido. Issue #93 es seguimiento, no disparador de ejecución. No intentar eludir controles de seguridad, trasladar la operación bloqueada a otro agente ni extraer el secreto. Si el entorno autorizado no admite la prueba, informar y dejar el procedimiento manual revisado al propietario; no confundirlo con una prueba ejecutada.

## 2. Fuentes y límites

Leer AGENTS.md y referencias normativas, en especial `docs/security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md` (adenda S54), `docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md`, `docs/SABORA_AUTHORIZATION_GATE.md`, `docs/architecture/SABORA_SIMPLIFIED_DEPLOYMENT_V2.md`. Leer [encargo general S54](CODEX_S54_ROOT_RECOVERY_H1_A_CLOSURE_2026-11-26.md) y [revisión del ensayo](../reviews/SABORA_S54_HOSTED_AUTH_READINESS_2026-11-26.md). La continuidad no sustituye la normativa. Este encargo acota A54-07 al proveedor Auth; no duplica H1-A ni altera decisiones aprobadas.

Único destino: proyecto RESTAURANTE, `https://byhvmumqivmunkmomhup.supabase.co/auth/v1`; RP/origen de gestión `https://gestion-sabora.allaiso.com:8443`. Confirmar contratos vigentes en [Passkeys](https://supabase.com/docs/guides/auth/passkeys), [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) y [signOut](https://supabase.com/docs/reference/javascript/auth-signout). No inventar endpoints o formas de respuesta. No usar Fleetia, VPS, despliegue, SQL administrativo, cambios de configuración Auth/Resend, roles/membresías reales ni recrear genesis. No enviar correo real: el ensayo de proveedor genera enlaces sin entrega. No registrar ROOT ni usar correo real. Las pruebas PWA/SQL/Resend y recuperación excepcional ROOT son posteriores y no se declaran superadas aquí.

## 3. Bloque único de trabajo

1. Revisar el script y sus invariantes frente al contrato real del proveedor. Corregir agrupadamente las incompatibilidades justificadas, respetar el límite manual del candidato y conservar los checks de seguridad. Sin nuevas dependencias salvo necesidad demostrada y lockfile reproducible. Verificar el aislamiento del proceso de navegador y cualquier proceso hijo: nunca heredar credenciales, tokens o material sensible. No imprimir cuerpos de respuestas con credenciales, JWT ni desafíos.
2. Validar la preparación de ejecución con autorización del propietario y un entorno de confianza que admita expresamente la operación. No intentar leer, exportar, mostrar o recuperar el valor del secreto de GitHub. No publicar un workflow privilegiado como vía de evasión de la restricción anterior, ni reutilizar el bridge de despliegue. Mantener el procedimiento de operador manual existente si no hay canal admitido. No ejecutar simultáneamente ni hacer reintentos ciegos; confirmar Auth vacío y alcance antes de mutar.
3. En una ejecución legítimamente disponible, obtener evidencia del recorrido de la sección 4 con una única identidad sintética generada para el ensayo, autenticadores virtuales desechables, comprobaciones firmadas y limpieza exacta. Si falta autorización o capacidad, detener la operación real, explicar el bloqueo concreto y entregar la preparación verificable; avanzar solo en revisión y pruebas sin credenciales.
4. Resolver fallos del contrato o del ensayo de forma fundada, sin relajar verificaciones. Ante resultado incierto no repetir mutaciones; reconciliar únicamente la identidad de ensayo mediante UUID y correo exactos. Si la limpieza no puede acreditarse, NO-GO y avisar al propietario. Nunca tocar identidades ajenas.
5. Publicar informe de evidencia del SHA exacto, resultados, defectos, límites y dictamen; actualizar #93, #92, tablero y continuidad. Si cambia código, repetir batería ordinaria completa. No publicar secretos ni identificadores de sesiones, enlaces o desafíos. Solicitar al propietario retirar la clave temporal y su secreto cuando deje de ser necesario; no afirmar que se han eliminado sin evidencia.

## 4. Criterios de aceptación del proveedor

| ID | Control | Evidencia exigida |
|---|---|---|
| AP-01 | Preflight | Destino exacto, proyecto Auth vacío, RP y origen esperados; sin otros usuarios |
| AP-02 | Invitación | Enlace de alta sin envío, intercambio con email confirmado y UUID identificado |
| AP-03 | Registro/login | Primera passkey real mediante ceremonia Chromium, receipt, firma JWT RS256, AMR passkey y UUID correctos |
| AP-04 | Recuperación | Intercambio de recuperación del mismo UUID, registro de credencial nueva inequívocamente distinta, verificación de ambas antes de revocar |
| AP-05 | Revocación | Eliminar únicamente credencial anterior del usuario ficticio; listado confirma ausencia, assertion válida de la antigua rechazada por credencial no encontrada |
| AP-06 | Nuevo acceso | Login válido con nueva passkey, mismo UUID, sesión fresca |
| AP-07 | Sesiones | Medir respuesta a JWT antiguo tras logout; no presumir invalidación instantánea; distinguir fence local Sabora pendiente |
| AP-08 | Limpieza | Retirar sesiones de ensayo cuando proceda, eliminar únicamente identidad ficticia verificada y comprobar ausencia; si resultado incierto, reconciliación exacta o NO-GO |
| AP-09 | Custodia | Evidencia redacted sin claves, JWT, tokens, material WebAuthn sensible; navegador sin credencial administrativa |

Informe con tabla PASS/FAIL/NOT RUN por control, enlace a evidencia real, SHA ejecutado y aclaración de entorno/alcance. PASS del proveedor exige AP-01 a AP-09 acreditados, incluyendo observación honesta de AP-07, sin convertirla en garantía de revocación inmediata. No basta el mock, la sonda pública, CI verde o un HTTP 200. H1-A integral permanece parcial hasta composición real PWA/API/SQL, entrega y revocación local verificadas conforme a normativa; sin GO operativo, merge ni despliegue.

## 5. Entrega

Un informe en `docs/reviews/` y actualización del Issue #93 con resultado. Mantener todo en Draft #92. Registrar si hay impedimento de ejecución, qué comprobaciones sí se realizaron y cuál es el paso manual mínimo del propietario. No ampliar arquitectura ni seguridad por requisitos no aprobados.
