# CartaViva — Titularidad única de escritura administrativa (V1)

Estado: decisión funcional del usuario; implementación pendiente. Inspiración contractual: Fleetia/GestionIntegral_Rutaa, sin copiar directamente contratos o permisos sin adaptación.

## Principios aprobados
- Existe un perfil ROOT y pueden existir varios ADMIN.
- En cada instante hay **como máximo un ADMIN titular de escritura administrativa** por ámbito de restaurante; la elección de ámbito y bootstrap se fijarán en el modelo de datos.
- ADMIN no titular puede consultar lo autorizado y solicitar titularidad; no puede mutar recursos administrativos protegidos.
- La titularidad es independiente del rol y de la autenticación: una sesión Passkey válida no concede escritura por sí sola.
- Las operaciones de cocina y camareros siguen permisos funcionales específicos y no requieren titularidad administrativa.

## Operaciones de titularidad
1. **Solicitar**: ADMIN elegible pide titularidad; el servidor resuelve al titular vigente como destinatario, sin que el solicitante lo elija.
2. **Ceder**: el titular vigente ofrece titularidad a un ADMIN elegible; el destinatario puede aceptar o rechazar.
3. **Aceptar/rechazar**: aceptar una solicitud o cesión cambia titularidad atómicamente cuando corresponda; rechazar no la cambia.
4. **Cancelar**: emisor cancela una solicitud u oferta pendiente conforme a política.
5. **Reasignar forzosamente**: ROOT puede recuperar o reasignar titularidad con motivo obligatorio y auditoría. No extender esta potestad a ADMIN sin decisión expresa.

## Invariantes de seguridad
- Autorizar cada lectura/escritura en backend y PostgreSQL; no confiar en botones ocultos, claims de rol obsoletos ni estado cliente.
- Una transacción serializada/bloqueo de fila y restricciones únicas deben impedir dos titulares simultáneos, incluso bajo concurrencia, reintentos o doble clic.
- Validar estado activo, elegibilidad y vigencia de oferta/solicitud dentro de la transacción decisoria; cambios de titular invalidan solicitudes obsoletas según contrato.
- Registrar actor, acción, resultado, titular previo/nuevo, motivo, timestamp y correlation ID en auditoría append-only; notificar decisiones y reasignaciones.
- ROOT conserva acceso de recuperación; proteger el último ROOT activo frente a eliminación o revocación accidental.
- Sin escrituras administrativas si no hay titular válido; definir bootstrap y recuperación controlada.

## Alcance pendiente de definición
- Matriz exacta de recursos protegidos por titularidad (carta, precios, empleados, configuración, mesas, etc.).
- Si el ROOT puede escribir recursos administrativos ordinarios sin ostentar titularidad; **no asumir excepción implícita**.
- Ámbito de titularidad: restaurante único vs organización multirrestaurante.
- Política de caducidad, conflictos y notificaciones; semántica de ofertas pendientes.
- Diseño de endpoints, tablas, RLS, pruebas concurrentes y pruebas de aceptación.

## Pruebas de aceptación mínimas
- Dos ADMIN intentando aceptar solicitudes incompatibles: solo uno termina como titular.
- ADMIN no titular intenta modificar precios: rechazo en API y DB.
- ADMIN titular cede, destinatario rechaza: no cambia titularidad.
- Solicitud de ADMIN B dirigida automáticamente al titular vigente.
- ROOT reasigna con auditoría; sesiones antiguas del titular anterior pierden escritura inmediatamente.
- Operaciones legítimas de cocina/camarero continúan sin titularidad administrativa.

## Responsabilidades ADMIN confirmadas (18-10-2026)
Las siguientes mutaciones administrativas requieren titularidad vigente y autorización del servidor:
- Cambiar precios de platos cuando proceda, con auditoría del precio anterior y nuevo.
- Crear platos desde cero en el catálogo y editar sus fichas; retirar/eliminar platos según política de integridad referencial e historial de pedidos.
- Incorporar camareros por invitación; bloquear, suspender y dar de baja su acceso. La baja no puede borrar trazabilidad de pedidos.
- Planificar, activar, desactivar y retirar anuncios, respetando fechas y reglas de publicación.
- ADMIN sin titularidad conserva solo consulta autorizada y operaciones de solicitud/recepción de titularidad.
- ROOT recupera o reasigna titularidad excepcionalmente. La posibilidad de escritura administrativa ordinaria de ROOT queda **pendiente de decisión expresa**; no conceder bypass implícito.

## Acceso por invitación y reenvío — patrón Fleetia F1
Se adopta el modelo funcional de Fleetia como referencia a adaptar y verificar en CartaViva, no se presume que su código ya esté integrado:
1. Un ADMIN titular o ROOT autorizado emite invitación a un empleado con rol explícito, identidad de destino y estado **invited**.
2. El destinatario confirma su identidad mediante el proveedor de autenticación; **la sesión Auth no implica acceso empresarial**.
3. Registra una credencial Passkey vinculada al origen/RP ID propios de CartaViva.
4. Un actor autorizado realiza **activación explícita** y pasa a estado **active**; sin activación no accede a módulos de negocio.
5. Estados de referencia: **invited, active, suspended, revoked**. Definir aparte archivo/baja lógica y reglas de reincorporación.
6. Reenvío de invitación: acción autorizada, idempotente o protegida contra duplicados, con límites de frecuencia y tratamiento seguro de tokens expirados o revocados.
7. El backend verifica rol, estado y titularidad actual en cada operación sensible; registrar invitación, reenvío, activación, bloqueo y baja en auditoría append-only.
8. Proteger la permanencia de al menos un ROOT activo y evitar escalada de roles o reactivaciones mediante enlaces antiguos.

### Pruebas mínimas adicionales
- ADMIN no titular intenta cambiar precio, crear/eliminar plato, suspender camarero o publicar anuncio: denegado.
- Invitado con Auth y Passkey pero sin activación: denegado.
- Reenvío repetido no crea dos empleados ni reactiva revocados.
- Suspensión revoca acceso empresarial aunque la sesión Auth siga válida.
- Titularidad transferida invalida inmediatamente escrituras del titular anterior.
- Historial de pedidos permanece íntegro tras baja de camarero o retirada de plato.

## Decisión expresa: ROOT puede forzar titularidad (18-10-2026)
- ROOT activo y autorizado puede **asumir para sí** o **reasignar a un ADMIN activo** la titularidad de escritura administrativa sin consentimiento del titular anterior.
- ROOT que asume titularidad actúa como **único titular** (ROOT es un principal elegible, además de ADMIN); no existe bypass de escritura ordinaria paralelo.
- La operación es atómica y serializada; revoca inmediatamente la facultad de escritura del titular anterior, incluso con sesiones preexistentes. No se admiten dos titulares simultáneos.
- Requiere motivo registrado y auditoría append-only (actor ROOT, titular anterior y nuevo, instante, resultado y correlation ID). No elimina datos del negocio.
- Esta decisión concreta y prevalece sobre la redacción anterior que reservaba la titularidad únicamente a ADMIN; el resto de requisitos de seguridad permanecen vigentes.

## Decisión arquitectónica: Fleetia como base de referencia para acceso y permisos (18-10-2026)

**Repositorio fuente:** `jdlc86/GestionIntegral_Rutaa` (Fleetia). **Repositorio destino:** `jdlc86/CartaViva`.

- Para implementar en CartaViva los mecanismos de **invitación, reenvío, confirmación de identidad, registro Passkey, activación explícita, suspensión/revocación, autorización, titularidad única y auditoría**, se estudiará primero la implementación real de Fleetia.
- **Reutilización selectiva, no copia ciega**: identificar invariantes de seguridad, límites transaccionales, contratos HTTP/DB, pruebas, fallos conocidos y dependencias antes de trasladar código. Adaptar nombres, roles, recursos, modelo de datos, dominio de autenticación y flujos de negocio de CartaViva.
- Se permite y se espera un **refactor parcial** de módulos reutilizables cuando mejore separación de responsabilidades, legibilidad, testabilidad o ajuste al proyecto; no se exige replicar la arquitectura de Fleetia ni introducir acoplamiento en tiempo de ejecución entre ambos productos.
- Priorizar preservar las garantías comprobadas: Auth válido ≠ acceso empresarial; invitado → confirmación → Passkey → activación explícita; único titular de escritura; ROOT puede forzar toma o reasignación; control de concurrencia en PostgreSQL; privilegios mínimos y auditoría append-only.
- No importar secretos, claves, usuarios, datos de producción, URLs de origen/RP ID ni configuración específica de Fleetia. Cada producto tendrá credenciales y entorno propios.
- Antes de implementar, inventariar archivos, migraciones, endpoints y pruebas pertinentes de Fleetia, con referencia a commit/SHA. Contrastar contra los requisitos de CartaViva y documentar diferencias deliberadas.
- Exigir pruebas de regresión, concurrencia y autorización en entorno aislado de CartaViva. La existencia de pruebas satisfactorias en Fleetia **no sustituye** la verificación en CartaViva.
- Mantener trazabilidad entre requisito, mecanismo de referencia, decisión de adaptación, implementación y pruebas. Revisar cambios de seguridad antes de desplegar.

**Estado:** decisión de metodología aprobada; no implica que los módulos estén ya implementados en CartaViva.
