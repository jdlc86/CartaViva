# Sabora — candidato P1 de configuración y secretos

**Fecha:** 2026-10-29

**Estado:** candidato técnico para evaluación; no es una autorización de activación, despliegue ni aprovisionamiento.

**Ámbito:** una instalación Sabora para un único restaurante.

Este documento aplica los contratos normativos vigentes sin modificarlos. En particular, mantiene separados Sabora y Fleetia, las PWA cliente y gestión, los principales SQL y las composiciones H3–H6. Los documentos normativos siguen siendo la fuente de verdad.

## Estado efectivo

El único proceso productivo ensamblado en `apps/api/src/server.mjs` publica `/health` y `/ready`. Su modo único es `health-only`. No monta identidad, catálogo, visitas, pedidos, cocina, sala, SSE, Stripe, invitaciones, correo, jobs ni workers. En este modo está prohibido inyectar secretos PostgreSQL: una presencia accidental hace fallar el arranque antes de abrir el listener.

Las composiciones funcionales continúan opt-in, reciben dependencias ya validadas y no leen el entorno. No se define aquí un bootstrap operativo para ellas porque no están aprobados todavía todos los orígenes, identidades, secretos y controles del proveedor. Convertirlas en variables de entorno ahora inventaría un contrato de activación.

## Matriz normativa, configuración y prueba

| Fuente normativa | Proceso o componente | Entrada | Sensibilidad / responsable futuro | Validación P1 | Evidencia automática |
|---|---|---|---|---|---|
| `CARTAVIVA_PROJECT_BOUNDARY.md`; `CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md` | API activa | `NODE_ENV` | pública; release Sabora | solo `development`, `test`, `production`; producción explícita | `production-config-secrets.test.mjs`; gate de artefactos |
| mismos contratos de aislamiento | API activa | `SABORA_API_HOST` | pública; plataforma Sabora | explícita en producción; solo loopback o todas las interfaces **dentro** de la red privada del contenedor | test de arranque; Compose publicado únicamente en `127.0.0.1` |
| hoja de ruta y puertas de activación | API activa | `SABORA_API_PORT` | pública; plataforma Sabora | entero 1024–65535; sin fallback en producción | tests positivos/negativos y health del contenedor CI |
| contratos H3–H6 opt-in | API activa | `SABORA_API_MODE` | pública; release Sabora | único valor admitido: `health-only` | rechazo de `candidate`/`h6`; ausencia de rutas funcionales |
| contrato QR V1 / PWA cliente | build PWA cliente | `VITE_SABORA_RESTAURANT_CODE` | pública; propietario de la instalación | 3–32 caracteres `A-Z`, dígitos, `_` o `-`; ausencia/malformación falla cerrada | typecheck, Playwright y prueba estática P1 |
| contrato lector de personal | lector SQL de personal dormido | `SABORA_STAFF_DB_{HOST,PORT,NAME,USER,PASSWORD,CA_PEM}` | password/CA sensibles; DBA Sabora y seguridad | login exacto `sabora_staff_reader_login`, TLS verificado, pool acotado, rechazo de ejemplos en producción | tests de pool y P1 |
| contrato de publicación de carta | lector SQL de catálogo dormido | `SABORA_CATALOG_DB_{HOST,PORT,NAME,USER,PASSWORD,CA_PEM}` | password/CA sensibles; DBA Sabora y seguridad | login exacto `sabora_catalog_login`, mismas garantías TLS/producción | tests de pool y P1 |
| contrato de sesión cliente | sesión SQL cliente dormida | `SABORA_CUSTOMER_SESSION_DB_{HOST,PORT,NAME,USER,PASSWORD,CA_PEM}` | password/CA sensibles; DBA Sabora y seguridad | login exacto `sabora_customer_session_login`, mismas garantías TLS/producción | tests de runtime/pool y P1 |
| autenticación de personal | proveedor JWKS inyectado | issuer Supabase Auth y claves JWKS | issuer público; claves públicas; identidad/seguridad | HTTPS, ruta `/auth/v1`, RS256, caché y límites; **sin nombre de entorno aprobado** | suites `auth`/`jwks`; no montado |
| H3 cliente | composición inyectada | origen cliente permitido y HMAC de aceptación | origen público; HMAC secreto; seguridad | origen HTTPS exacto; HMAC ≥32 bytes; pools distintos; **sin bootstrap aprobado** | suites de composición/HTTP; no montado |
| ciclo de personal e invitaciones | capacidades y keyring inyectados | claves HMAC y cifrado, identificadores de clave | secreto crítico; identidad/seguridad | key IDs, límites, cierre y resolución de claves; **sin worker ni correo** | suites criptográficas/PG17 existentes; no montado |
| H6 pagos | adaptador Stripe inyectado | credencial Stripe y secreto webhook | secreto crítico; responsable de pagos/seguridad | el candidato actual acepta solo `sk_test_`/`rk_test_`; webhook `whsec_`; por ello producción queda bloqueada | suites H6; ninguna variable ni llamada real |
| H6 SSE | notifier PostgreSQL inyectado | conexión LISTEN dedicada | credencial SQL; DBA Sabora | se crea solo al registrar explícitamente H6 y se cierra en fallo/parada | suites H6; servidor activo no lo importa |

No existen en el proceso activo variables aprobadas para `service_role`, anon key de navegador, Stripe, webhooks, HMAC, keyrings, correo, notifier o workers. Añadirlas exige un contrato posterior y pruebas de mínimo privilegio. Una clave `service_role` nunca puede incorporarse a una PWA.

## Inyección, presencia y custodia

1. Los valores sensibles se crearán fuera del repositorio y de las imágenes. El mecanismo concreto de secret manager es una decisión de despliegue pendiente; no se ha configurado GitHub Secrets.
2. Cada proceso recibirá únicamente sus valores. El API `health-only` recibe cero secretos. Las PWA solo reciben valores públicos con prefijo `VITE_`; la puerta P1 rechaza nombres o patrones sensibles en fuente y bundles.
3. `.env.example` contiene nombres y marcadores inocuos. Los marcadores son inválidos en producción. Los archivos `.env`, certificados y claves están ignorados por Git y por el contexto Docker.
4. Los errores de configuración son códigos cerrados. El arranque imprime solo `sabora_api_startup_failed`; no serializa valores, entorno, URLs de conexión ni errores de driver.
5. Los secretos no deben aparecer en logs, CI, artefactos, capturas ni comentarios. La CI usa únicamente configuración no sensible para el contenedor efímero.

## Rotación, revocación y caducidad

- **Contraseñas SQL:** rotación por el DBA Sabora en el login exclusivo correspondiente, revocación inmediata de la credencial anterior, drenaje acotado del pool y repetición del preflight de identidad/ACL. Nunca se comparte un login entre componentes.
- **CA/TLS:** sustituir el bundle mediante inyección, reiniciar solo el proceso Sabora autorizado y comprobar `rejectUnauthorized=true`. No existe modo TLS permisivo.
- **HMAC/cifrado:** un contrato de activación debe definir key IDs, ventana de solape, clave activa, resolución de claves antiguas, caducidad y purga. No se permite reemplazar una clave en uso sin conservar la capacidad de descifrado/revocación exigida por el contrato.
- **JWT/JWKS:** las claves públicas siguen el emisor configurado; una sesión o membresía revocada debe volver a validarse contra el estado durable. Nunca se confía en URL o rol del token.
- **Stripe/webhook:** revocar desde el proveedor, inyectar la credencial restringida nueva, verificar permisos y firma y retirar la anterior. Esta operación permanece bloqueada porque no hay credencial productiva ni activación aprobada.
- **Invitaciones:** no hay correos históricos ni personal dado de alta; no procede migración o backfill de contactos. Tampoco hay envío real activado.

Toda credencial productiva futura debe tener propietario funcional, fecha de alta, fecha o política de revisión, procedimiento de revocación y evidencia de mínimo privilegio. Si falta cualquiera, el preflight debe fallar.

## Aislamiento, coste y parada segura

El Compose candidato usa proyecto y red propios, red bridge interna, puerto de host limitado a `127.0.0.1`, usuario no root, filesystem de solo lectura, capacidades eliminadas, `no-new-privileges`, límites de CPU/memoria/PID y logs rotados. No monta volúmenes, socket Docker, redes externas ni recursos compartidos. `restart: "no"` evita arranques o reinicios automáticos.

No hay workers, cron, correo ni listener SSE en el proceso activo. Si H6 se autoriza, el propietario de la composición debe conservar su `close()` y cerrar la conexión LISTEN antes de detener el proceso. Cualquier futura orden de inicio/parada debe apuntar al archivo Compose y al servicio Sabora exactos; están prohibidos `docker system prune`, podas globales, selecciones por comodines y operaciones sobre proyectos ajenos.

## Puertas pendientes antes de producción funcional

1. Aprobar dominios/orígenes definitivos y el bootstrap por proceso para H3–H6.
2. Aprovisionar y auditar cada login SQL mínimo; actualmente no hay credenciales operativas.
3. Seleccionar el inyector de secretos, propietarios y caducidades sin compartir recursos con Fleetia.
4. Resolver el contrato de pagos productivos: el adaptador aprobado es exclusivamente de pruebas.
5. Ejecutar en infraestructura Sabora autorizada los preflights, migración/rollback, observabilidad y recuperación. P1 no autoriza esas operaciones.
6. Antes de una migración PostgreSQL operativa, revisar los cambios de PostgreSQL 17.11/pgcrypto y compatibilidad TLS vigentes en Supabase; no se ha aplicado ninguna migración real.
