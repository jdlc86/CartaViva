# Sabora — inventario P3 de seguridad operativa

**Estado:** candidato técnico verificable, no aprovisionado y no activado. No contiene valores de secretos.

## Superficie activa

El proceso ensamblado continúa siendo exclusivamente `health-only`. Recibe `NODE_ENV`, `SABORA_API_HOST`, `SABORA_API_PORT` y `SABORA_API_MODE`; todos son configuración pública del proceso. El build cliente recibe únicamente `VITE_SABORA_RESTAURANT_CODE`, que es un identificador público y no una credencial. El gate rechaza cualquier variable `VITE_` sensible.

El Compose no recibe contraseña, CA, token, HMAC, clave Stripe, Supabase `service_role`, URL PostgreSQL ni secreto de webhook. La presencia de cualquier nombre sensible durante el arranque productivo provoca fallo antes de abrir el listener y solo produce el código sanitizado `sabora_api_startup_failed`.

## Pools dormidos y principales separados

| Componente | Principal exacto | Entradas documentadas | Estado |
| --- | --- | --- | --- |
| Lector de personal | `sabora_staff_reader_login` | host, puerto, base, usuario, password, CA | Dormido; TLS verificado, pool máximo 3 |
| Lector de catálogo | `sabora_catalog_login` | host, puerto, base, usuario, password, CA | Dormido; TLS verificado, pool máximo 3 |
| Sesión cliente | `sabora_customer_session_login` | host, puerto, base, usuario, password, CA | Dormido; TLS verificado, pool máximo 3 |

Los tres nombres deben ser distintos y exactos. No se aceptan URL de conexión, `postgres`, owner, `anon`, `authenticated`, `service_role`, ejemplos ni TLS permisivo. Su provisión permanece fuera de migraciones y requiere validar en PostgreSQL 17 atributos, membresías, superficie de funciones y denegaciones. El proceso activo rechaza estas entradas en vez de ignorarlas.

## Dependencias sensibles todavía sin variables aprobadas

El inventario machine-readable registra como `dependency_injection`, `dormant` y `environmentName: null`: JWKS de personal, origen cliente, HMAC de aceptación, lifecycle/email/directorio/mantenimiento/H6, keyring de invitaciones, cuatro identidades SQL H6/SSE, credencial Stripe restringida de pruebas y secreto webhook de pruebas. Ninguna dispone de nombre de entorno, bootstrap o activación aprobados. Crear uno exige contrato, custodio, rotación, revocación y pruebas nuevas; no se puede “activar” mediante una variable ad hoc.

## Custodia, rotación y revocación

- Cada secreto o material de confianza debe tener custodio de seguridad/DBA Sabora y nunca residir en Git, imagen, frontend, log, artefacto o comentario.
- SQL: inyectar credencial nueva, reiniciar únicamente el proceso Sabora autorizado, repetir identidad/ACL, drenar el pool con límite y revocar la anterior. Credenciales diferentes por componente.
- CA/JWKS: conservar solape compatible cuando el emisor lo exija, verificar el nuevo material y retirar el anterior. No existe `rejectUnauthorized=false`.
- HMAC/keyrings: key ID obligatorio, clave activa y resolución de claves anteriores durante su ventana contractual; revocación/purga solo cuando no rompa descifrado o validación durable.
- Stripe/webhook: solo fixtures de prueba. Una futura clave se revoca en proveedor, se sustituye por credencial restringida, se verifica firma/permisos y después se retira la anterior.
- Una credencial comprometida fuerza cierre de la composición afectada, revocación, rotación y preflight; no se registra el valor ni se reutiliza otra identidad.

## Controles automáticos

`scripts/ci/operational-security-inventory.mjs` exige correspondencia exacta entre inventario y `.env.example`, secretos conocidos y rechazo de arranque, tres principales SQL separados, ausencia de entradas dormidas en Compose, lifecycle completo y ninguna credencial material en fuentes/artefactos productivos. Las pruebas usan canarios ficticios y comprueban drift, alias de principal, lifecycle incompleto y credencial incrustada.

El gate no demuestra la custodia de un secret manager real porque ninguno ha sido seleccionado ni autorizado. Tampoco provisiona roles, conecta Supabase, abre rutas funcionales o activa Stripe, correo, SSE o workers.
