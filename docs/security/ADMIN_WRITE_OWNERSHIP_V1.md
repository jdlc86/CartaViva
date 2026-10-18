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
