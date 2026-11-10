# Contrato normativo — lectura segura del personal Sabora (28-10-2026)

## Alcance y precedencia
Decisión aprobada para un único restaurante Sabora. Complementa, sin sustituir, `docs/REQUISITOS_FUNCIONALES.md`, `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md` y los contratos vigentes de autorización, cocina/sala y diseño. Ante contradicción, resolver explícitamente contra la normativa existente antes de implementar; no reinterpretar permisos ni habilitar rutas por conveniencia.

## Tres ámbitos de lectura
1. **Administración autorizada:** listado paginado, búsqueda y ficha del personal del restaurante con nombre, apellidos, correo, código operativo, rol, estado y datos administrativos estrictamente necesarios. La lectura de historial, asignaciones y mantenimiento requiere autorización administrativa específica conforme a contratos vigentes. Respetar cualquier distinción entre administradores con escritura y de solo lectura; nunca otorgar escritura por tener lectura.
2. **Operaciones de sala y cocina:** no existe endpoint de directorio general de compañeros. Las proyecciones de comandas, tareas de recogida y eventos SSE exponen únicamente identificador operativo compacto del responsable pertinente (p. ej. `JG-027`) y datos funcionales imprescindibles. No exponer correo, nombre completo, historial ni UUID ajenos en el contrato público de operaciones. Las instantáneas históricas no se reinterpretan al reasignar un código.
3. **Datos propios:** un empleado activo puede consultar su propia ficha limitada a nombre, apellidos, correo, rol y código operativo, sin datos de otros ni facultad de edición por este hecho.

## Autorización, privacidad y seguridad
- Validar identidad verificada, pertenencia al único restaurante, rol/capacidad efectiva, estado y revocación en cada solicitud; las sesiones previas no permiten acceso después de revocar.
- Las restricciones se aplican en PostgreSQL mediante proyecciones/funciones de lectura con RLS forzado, privilegios mínimos y principales SQL apropiados, además de comprobaciones en API. No basta ocultar campos en React.
- Evitar `SELECT *` sobre tablas base, grants amplios y filtrado exclusivamente en cliente. Separar DTOs por ámbito; campos desconocidos no se serializan.
- No exponer identidades de empleados de otros ámbitos, ni datos personales en logs, notificaciones, SSE operativos o mensajes de error.
- La PWA de gestión presenta carga, vacío, error, paginación, accesibilidad y responsive conforme al diseño aprobado; el directorio no inventa datos ni usa fixtures en runtime.

## Pruebas y puertas de activación
- PG17 desechable: permisos positivos/negativos, denegación cruzada, revocación inmediata, estados, principal SQL restringido, RLS, no lectura directa, y reutilización histórica de códigos.
- API: serialización mínima, paginación, errores y autorización. PWA: responsive, accesibilidad y regresión de Equipo y recogidas; CI completo.
- La activación de rutas, credenciales, migraciones productivas, merges y despliegues requiere autorización posterior; Fleetia y demás proyectos del VPS quedan fuera de alcance.
