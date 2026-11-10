# Sabora — contrato de payload QR de mesa V1

Fecha: 2026-10-27. Estado: **decisión normativa aprobada por instrucción expresa del usuario**.

Este contrato cierra únicamente la representación del QR físico y su consumo
por la PWA cliente. No convierte el QR en identidad, prueba de presencia,
credencial de cuenta ni permiso permanente. Se mantienen todas las reglas de
visita, mesa, revocación, expiración, sesión de cliente y revalidación
transaccional del contrato funcional consolidado.

## Representación canónica

El contenido del QR es una URL HTTPS absoluta y tiene exactamente esta forma:

```text
https://<origen-pwa>/qr/v1/<restaurantCode>/<tableId>#<token>
```

Ejemplo no operativo, con secretos ficticios:

```text
https://sabora.example/qr/v1/SABORA_01/ca710000-0000-4000-8000-000000000001#AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA
```

- `origen-pwa`: origen HTTPS exacto registrado para la PWA cliente, sin ruta,
  credenciales, query ni fragmento. HTTP solo se admite en pruebas locales
  sobre `localhost`, `127.0.0.1` o `[::1]`; nunca en una instalación real.
- `restaurantCode`: código del directorio, entre 3 y 32 caracteres, conforme a
  `^[A-Z0-9][A-Z0-9_-]{2,31}$`. Identifica la instalación, pero no autoriza.
- `tableId`: UUID en minúsculas y escritura canónica con guiones. Identifica la
  mesa dentro de esa instalación y no es secreto.
- `token`: 32 bytes generados por un CSPRNG, codificados como Base64URL canónico
  sin `=`. Tiene exactamente 43 caracteres. No contiene datos personales,
  número de mesa, restaurante ni información derivada de ellos.

No son V1 válidos los payload JSON, parámetros query, tokens en el path,
Base64 estándar, relleno `=`, mayúsculas alternativas del UUID, códigos de otra
instalación, rutas equivalentes mediante percent-encoding ni campos extra. Una
versión futura usará una ruta nueva; no se reinterpretará silenciosamente V1.

## Motivo del fragmento

El token se coloca tras `#` para que el navegador no lo envíe en la petición
HTTP inicial, la cabecera `Referer`, la caché del servidor ni los access logs.
La PWA debe:

1. reconocer y validar el payload completo antes de cualquier autorización;
2. retirar ruta y fragmento con `history.replaceState` antes de iniciar llamadas
   de red o montar el flujo React;
3. mantener el token exclusivamente en memoria durante el contexto de mesa;
4. no escribirlo en `localStorage`, `sessionStorage`, IndexedDB, telemetría,
   mensajes de error, analítica, eventos, DOM visible ni service worker;
5. enviarlo solo dentro del cuerpo POST same-origin protegido por la sesión de
   cliente; nunca en URL ni cabecera reutilizable por JavaScript ajeno.

Un lector que no reconozca el origen, código, versión o forma canónica muestra
un error genérico y no llama al endpoint de visitas. El token nunca se refleja
en la respuesta.

## Emisión, custodia y rotación

- La emisión se realiza en backend autorizado. El backend genera los 32 bytes,
  construye la URL canónica y persiste únicamente `SHA-256(UTF-8(token))` junto
  con la versión de QR. El secreto y el payload completo se entregan una sola
  vez al proceso de render/impresión y no aparecen en listados de mesas.
- El render físico codifica los bytes UTF-8 exactos de la URL. El tamaño, nivel
  de corrección de errores y soporte impreso no pueden recortar ni reescribir el
  fragmento; su inspección visual forma parte de la aceptación de impresión.
- Rotar o revocar reemplaza el hash e incrementa la versión en una transacción.
  El token anterior deja de autorizar inmediatamente tras commit. No elimina
  pedidos, cuentas o auditoría existentes.
- La PWA vuelve a validar token, versión, mesa, visita, cliente y estado en el
  servidor al cotizar y confirmar. Conservar el token en memoria no evita esas
  comprobaciones ni prolonga la expiración.
- El endpoint de lectura de mesas, eventos y errores jamás devuelve token,
  payload o hash. El principal SQL de cliente no obtiene privilegio directo
  sobre `dining_tables` ni sobre tablas de visita.

La migración candidata `20261027072924_sabora_table_qr_payload_v1.sql`
restringe la rotación a tokens V1 canónicos. No monta endpoints, no genera
credenciales operativas y no se ha aplicado a Supabase operativo.

## Lectura en cliente y accesibilidad

- La acción de QR permanece en la navegación cliente aprobada. La cámara se
  activa únicamente tras un gesto del usuario, solicita permiso explícito,
  procesa frames localmente y detiene todas las pistas al leer, cancelar,
  cerrar o fallar. Los frames no se suben ni se guardan.
- El escaneo de cámara usa una API del navegador como mejora progresiva. Si no
  existe, la URL del QR puede abrirse mediante la cámara del sistema; no se
  ofrece un selector manual de mesa ni campos para copiar `tableId` o token.
- Si todavía no existe sesión de cliente, la PWA limpia la URL, conserva la
  credencial solo en memoria y solicita crear/recuperar identidad. La visita se
  autoriza una sola vez cuando la sesión queda acreditada.
- Un resultado autorizado informa de la mesa verificada y caducidad sin mostrar
  el secreto. Fallos, mesa bloqueada, QR rotado y sesiones revocadas permanecen
  cerrados y no habilitan pedidos.
- El escaneo de frames no es polling de API o base de datos. No introduce
  temporizadores de red; la única llamada se produce al obtener un payload.

## Riesgo aceptado y límites

Una fotografía o copia del QR puede utilizarse remotamente mientras el token,
la mesa y la visita sigan vigentes. Esta limitación ya está aceptada por el
contrato consolidado y V1 no promete geolocalización ni presencia física. Las
defensas obligatorias siguen siendo identidad de cliente, duración de visita,
estado de mesa, rotación/revocación, aislamiento de cuentas, rate limiting y
revalidación en cada operación. No está aprobada ninguna recogida de ubicación.

La activación de una instalación exige configurar de forma auditada su
`restaurantCode` exacto y origen HTTPS, generar/rotar los QR con el emisor V1 y
probar el material impreso. Sin esa configuración la PWA falla cerrada.

## Criterios de aceptación

1. Serialización y parseo producen una única representación canónica.
2. Origen, restaurante, versión, UUID o token divergentes se rechazan sin red.
3. El fragmento se elimina antes de las peticiones y no aparece en storage,
   service worker, URLs de red, logs ni respuestas.
4. Un principal SQL restringido autoriza con token vigente; token rotado,
   visita caducada, sesión revocada o mesa no autorizada fallan cerrados.
5. Dos efectos de montaje o escaneos concurrentes no crean autorizaciones
   duplicadas desde la PWA.
6. Rotación solo acepta token V1, invalida el anterior y permite una nueva
   visita con el nuevo payload, sin escalar privilegios ni debilitar RLS.
7. Cámara, apertura por cámara del sistema, permiso denegado, cancelación,
   accesibilidad y reducción de movimiento se prueban en los navegadores
   objetivo antes de activar una instalación.

Este contrato no activa el worker, correo, pagos, endpoints operativos,
Supabase ni despliegue alguno.
