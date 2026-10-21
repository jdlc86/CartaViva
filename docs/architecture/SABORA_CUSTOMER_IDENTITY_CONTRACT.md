# Sabora — Contrato de identidad persistente del cliente
Fecha: 2026-10-21 · Estado: **decisión funcional aprobada; implementación pendiente**.

## Objetivo y alcance
Una instalación Sabora corresponde a un único restaurante. La PWA de cliente debe reconocer a un cliente habitual entre visitas, sin solicitar reiteradamente información personal o corporativa. La PWA de gestión mantiene su autenticación y permisos independientes. No se crea un directorio global entre restaurantes ni se comparte identidad con Fleetia.

## Alta y perfil
1. El cliente elige **alias/nick**; puede cambiarlo después.
2. Sabora genera en el servidor un **identificador interno inmutable y no reutilizable** (UUID) y un **número ID visible, único dentro de esta instalación** (ejemplo ilustrativo: SB-004827). El cliente no elige ni puede cambiar el ID. La unicidad debe imponerse en base de datos y la emisión resistir concurrencia.
3. **Empresa opcional**, editable y no verificada por defecto. No exigir DNI, número de empleado real, correo o credenciales corporativas. Nunca asumir que el ID de Sabora es un número de empleado.
4. Un alias no necesita ser único. No mostrar el UUID interno ni usar el ID visible como contraseña, token de sesión o prueba de titularidad.
5. La creación del perfil debe establecer una sesión de cliente segura y recuperable; la mera persistencia local de alias/ID no acredita identidad ante el servidor.

## Persistencia y experiencia
- Primera visita: alta mínima; no se exige invitación ni passkey para navegar o comenzar el flujo autorizado.
- Visitas siguientes, PWA instalada o navegador: recuperar la sesión mientras siga válida, sin volver a pedir alias, ID ni empresa; escanear QR para asociar una mesa y confirmar pedidos. La instalación no garantiza almacenamiento permanente.
- Sin QR válido: permitir consulta de carta y preparación de selección/reserva según el contrato funcional vigente; **no** confirmar un pedido presencial.
- QR: credencial de contexto de mesa, revocable y regenerable, **no** identidad del cliente ni prueba de presencia física. Revalidar token y estado de mesa en backend en cada pedido.
- Cada pedido debe asociarse a la identidad interna verificada de cliente y a la sesión de mesa. La lectura del historial propio se autoriza por esa identidad, nunca por alias, empresa o ID visible.
- Tras cierre de sesión, borrado de almacenamiento o pérdida de dispositivo, no asumir que el cliente sigue autenticado; no permitir suplantación por conocer el ID.

## Passkey opcional y recuperación
- Ofrecer **«Proteger mi perfil con passkey»** tras el alta y desde ajustes. La passkey es **opcional** para el uso básico y no se requiere en cada pedido.
- Implementar con WebAuthn/FIDO2: desafío aleatorio de un solo uso, verificación de origen y RP ID de Sabora, credencial pública ligada al UUID interno, contador/estado y medidas antirreplay según el autenticador. La biometría/PIN se valida localmente en el dispositivo; Sabora no almacena huellas ni imágenes faciales.
- En dispositivo nuevo, **«Ya tengo un perfil»** inicia autenticación con una passkey previamente registrada y disponible, incluida una sincronizada por un gestor compatible. Si no existe o no está disponible, **no** permitir recuperar una cuenta únicamente con alias o número ID.
- Definir y auditar antes de producción un procedimiento alternativo seguro para passkeys perdidas, revocación de dispositivos, alta de passkeys adicionales y recuperación ante pérdida total. No prometer recuperación universal ni asumir sincronización entre plataformas.
- Mantener sesiones con tokens opacos o equivalentes robustos emitidos por el servidor, caducidad, revocación y rotación; protegerlos frente a XSS/CSRF según arquitectura elegida. No almacenar secretos de autenticación en texto plano ni en datos de perfil.
- La passkey no sustituye autorización: toda operación de lectura/mutación debe comprobar identidad y permisos en servidor.

## Privacidad y separación de identidades
- Minimizar datos: alias, ID visible y empresa opcional; limitar exposición en cocina/sala a lo necesario para operar.
- Una vinculación empresarial **verificada** futura será una entidad separada, explícita y autorizada, sin convertir automáticamente la empresa declarada en identidad corporativa.
- Un cambio de empresa o alias no modifica el UUID ni la titularidad del historial.
- Definir conservación, exportación y eliminación de datos conforme a requisitos aplicables antes de producción.

## Brecha con prototipo y puertas de implementación
- La función SQL actual `sabora.confirm_order` exige `p_company` y `p_employee_number`, y la tabla `sabora.orders` conserva esos campos obligatorios. **No cumplen aún este contrato**: se requieren migraciones/versionado, compatibilidad de dominio y pruebas. No inventar un valor corporativo ficticio como solución.
- Diseñar tablas y RLS de perfiles, credenciales, sesiones y asociaciones de pedidos; rutas de alta, autenticación, recuperación, edición y cierre de sesión; migración de historial si procede.
- Pruebas obligatorias: concurrencia de IDs, identidad entre visitas, sesión caducada/revocada, dispositivo perdido, passkey inexistente, suplantación por ID/alias, aislamiento entre clientes, QR revocado, mesa bloqueada y doble confirmación.
- Hasta completar esos controles, **no** habilitar acceso HTTP a datos de clientes ni abrir permisos SQL. No desplegar ni aplicar migraciones operativas sin autorización expresa.
