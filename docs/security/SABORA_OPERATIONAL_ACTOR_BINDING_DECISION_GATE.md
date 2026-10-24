# Puerta de decisión: vinculación de actor HTTP ↔ PostgreSQL (propuesta, no contrato aprobado)

Fecha: 2026-10-24. Estado: **bloqueador de activación**. Alcance: Sabora, un restaurante. Esta nota no sustituye el contrato funcional consolidado ni concede permisos.

## Evidencia y amenaza

El coordinador obtiene `verifiedIdentity.userId` y `verifiedStaff` desde los hooks de autenticación y revalida la membresía dentro de la transacción. Sin embargo, la función candidata `sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)` recibe `p_actor_user_id` como argumento SQL. Si el login técnico compartido obtuviese `EXECUTE` y los permisos de tabla necesarios, un cliente SQL que posea ese login podría pasar el UUID de otro miembro activo. Comprobar que ese UUID existe y está activo no prueba quién originó la operación. Los tests HTTP de actor verificado no eliminan esta vía directa.

Los parámetros SQL, `SET LOCAL`, `set_config`, una variable GUC personalizada y un rol funcional enviado por el cliente no son pruebas criptográficas: quien controla la conexión puede suministrarlos. `SECURITY INVOKER` conserva los privilegios del login técnico, pero no resuelve la atribución del actor. Un `SECURITY DEFINER` sin un mecanismo independiente de identidad ampliaría el riesgo.

## Invariantes obligatorias antes de aprobar una arquitectura

1. La identidad de actor debe proceder de evidencia autenticada que un cliente SQL con las credenciales técnicas no pueda fabricar ni reemplazar.
2. La comprobación del actor, membresía activa, permiso para la transición, bloqueo de línea, idempotencia, evento y notificación debe ejecutarse con garantías transaccionales verificables.
3. El cliente web y los logins compartidos no deben poder alterar directamente estados, eventos, avisos ni correlaciones para saltarse la transición autorizada.
4. Las lecturas de tablero e historial deben respetar el alcance del personal; ningún permiso de consulta de tablas debe permitir extraer información fuera de la proyección autorizada.
5. Revocación de personal, repetición idempotente, concurrencia y fallo intermedio deben mantener las garantías ya probadas en PG17.
6. No se deben habilitar rutas en `server.mjs`, ejecutar grants positivos ni desplegar hasta que el diseño y las pruebas sean aprobados.

## Alternativas a evaluar; ninguna seleccionada

**A. Identidades SQL por actor.** PostgreSQL verifica al actor mediante `session_user` o identidad de sesión que no pueda cambiarse con `SET ROLE`. Requiere aprovisionamiento y revocación de credenciales por persona, aislamiento de conexiones y políticas RLS; evaluar si es operativamente viable sin exponer credenciales a la PWA.

**B. Evidencia firmada verificada dentro de PostgreSQL.** La base de datos valida emisor, audiencia, caducidad, sujeto y firma de un comprobante que el login técnico no pueda emitir. Debe verificarse que el secreto o clave de firma no sea legible ni sustituible por el login SQL, que la validación no dependa de una GUC falsificable y que la verificación sea transaccional. Requiere revisión criptográfica y de extensiones disponibles; no asumir soporte en Supabase.

**C. Mediación por identidad privilegiada aislada.** Un componente confiable ejecuta operaciones después de autenticar al actor y reduce la superficie del login expuesto. Requiere demostrar que el login técnico ordinario no puede llamar directamente a mutaciones equivalentes, ni usar las credenciales del mediador. Una mera capa Node con el mismo login SQL compartido no satisface por sí sola este requisito.

No elegir una alternativa por conveniencia sin inventario de amenazas, coste operativo y prueba de suplantación.

## Matriz de aceptación en PostgreSQL 17 desechable

| Escenario | Resultado exigido |
| --- | --- |
| Login técnico invoca transición con UUID de otro miembro activo | Denegado sin mutación, evento, aviso ni correlación |
| Login técnico invoca transición con UUID propio pero sin evidencia de identidad | Denegado |
| Cliente modifica rol, actor o GUC de sesión | No aumenta permisos |
| Token/evidencia con firma inválida, emisor o audiencia incorrectos, expirado o reutilizado fuera de alcance | Denegado sin efectos |
| Actor legítimo cocina: confirmed→preparing→ready | Éxito autorizado, evento y aviso atómicos |
| Actor legítimo camarero: ready→picked_up | Éxito autorizado, acuse atómico |
| Actor legítimo intenta transición de otro rol | Denegado |
| Personal suspendido antes de adquirir lock | Denegado, incluso replay |
| Dos operaciones simultáneas sobre la misma línea | Un único avance efectivo, sin doble aviso |
| Replay idéntico / correlación reutilizada con fingerprint diferente | Mismo resultado / conflicto, respectivamente |
| Error inyectado entre mutaciones | Rollback total |
| Consulta SQL directa fuera de proyección permitida | Denegada |
| Login técnico intenta DDL, SET ROLE, herencia, SECURITY DEFINER y escritura directa | Denegado |

Para cada negativo se inspeccionan estado, filas de eventos, notificaciones y correlaciones antes y después. Para cada positivo se usa el **login realmente restringido**, nunca la conexión superusuario de preparación del fixture. La matriz actual de cero concesiones es solo la línea base negativa.

## Secuencia de implementación propuesta

1. Registrar decisión de identidad y límites de confianza, con revisión de la documentación normativa.
2. Prototipar exclusivamente en contenedor PG17 efímero, sin cambios de Supabase operativo.
3. Añadir pruebas de suplantación directa con los logins restringidos y pruebas de permisos por recurso y columna.
4. Integrar en coordinador/repositorio, actualizar documentación y obtener CI verde en SHA común.
5. Solicitar autorización explícita para cualquier activación, grant operativo, merge o despliegue.

**Estado:** no hay diseño aprobado; la composición opt-in y el preflight de cero concesiones deben seguir bloqueando la activación. Fleetia y otros recursos del VPS quedan fuera de alcance.
