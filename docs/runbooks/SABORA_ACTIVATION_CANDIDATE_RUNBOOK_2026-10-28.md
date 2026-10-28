# Runbook candidato de preparación de activación — Sabora

**Estado:** borrador técnico para pruebas aisladas. No autoriza activación. Los requisitos normativos de GitHub prevalecen sobre este documento.

## 1. Preflight de integración
1. Fijar SHA de la rama candidata y comprobar ascendencia de #15, #32, #34, #36 y #38; registrar migraciones exactas y versiones de Node, pnpm y PostgreSQL 17.
2. Ejecutar desde cero sobre PostgreSQL 17 **desechable** la cadena completa de migraciones; validar `FORCE RLS`, grants negativos, propietarios sellados, firmas HMAC, límites de TTL, revocación, idempotencia y outbox.
3. Ejecutar suite monorepo, builds de API/PWA cliente/PWA gestión y Playwright para cliente y gestión, incluyendo flujo QR→catálogo→pedido→cocina→«Voy a recoger» y estados de error/offline.
4. Comprobar que ningún adapter candidato está expuesto accidentalmente en rutas operativas y que no hay secretos reales en código, fixtures, logs o artifacts.
5. No marcar PASS sin salida verificable y SHA; ante fallo, corregir y repetir el conjunto afectado.

## 2. Reconciliación de contactos históricos (solo procedimiento, sin datos reales)
- El hash de correo existente no permite reconstruir el correo; no inferirlo por nombre, proveedor o historial.
- Previsualizar identidades que carecen de contacto verificable, con UUID interno y estado, sin exponer hashes ni PII en reportes.
- Capturar el correo actual mediante canal autorizado y verificación de titularidad; normalizar y comprobar unicidad según contrato SQL.
- Aplicar por identidad, con intención/correlación idempotente, autorización administrativa efectiva, auditoría de actor y origen de verificación, sin almacenar tokens de verificación en claro.
- Conflictos, correos no verificados, identidades revocadas o cuentas sin titular verificable: **no asignar contacto**; conservar caso pendiente y no enviar invitación. La recuperación no activa por sí misma una cuenta.
- Ensayar datos ficticios en PostgreSQL desechable y validar concurrencia, revocación y reintentos antes de solicitar autorización operativa.

## 3. Matriz de secretos y privilegios (sin valores)
- Principal SQL de ciclo de vida: acceso exclusivamente a wrappers autorizados; sin DDL ni SELECT directo.
- Principal SQL de directorio: EXECUTE únicamente de función de lectura autorizada, RLS forzado y audiencias HMAC diferenciadas para lista, detalle y propio.
- Principal de mantenimiento de códigos: capacidad separada, TTL acotado, confirmación y motivo; nunca liberación individual.
- Outbox, cocina/sala, pagos y eventos: mantener segregación normativa y credenciales por función; inventariar cada variable antes de provisionar.
- Todos los secretos deben ser suministrados fuera del repositorio, rotables y con revocación definida. Preflight fail-closed si falta uno.

## 4. Secuencia futura (requiere autorización expresa)
1. Aprobar revisión normativa y de seguridad, inventario de datos y ventana de intervención.
2. Validar aislamiento de infraestructura Sabora respecto a Fleetia y otros proyectos: propietarios de contenedores, redes, volúmenes, puertos, rutas, recursos y mecanismos de restart/rollback. Prohibido usar comandos globales de Docker Compose, prune o reinicio del host.
3. Preparar copia de seguridad y restauración verificable **exclusivamente** de Sabora, sin afectar otros proyectos.
4. Aplicar migraciones de Sabora conforme a preflight y orden verificado; validar grants y RLS antes de abrir rutas.
5. Provisionar principales y secretos exclusivos de Sabora; ejecutar comprobaciones negativas.
6. Activar rutas y servicios Sabora por fases, con smoke y observabilidad, sin dependencia ni modificación de Fleetia.
7. Reconciliar contactos históricos autorizados antes de utilizar funciones que requieran correo en claro.
8. Comprobar salud y funcionalidad de Sabora, y aislamiento de Fleetia; registrar resultado y punto de retorno.

## 5. Reversión y condiciones de parada
- Parar inmediatamente ante acceso cruzado, RLS fallido, privilegio excesivo, secreto faltante, fallo de idempotencia, migración no compatible, pérdida de datos o dependencia de Fleetia.
- Preferir **desactivar exclusivamente rutas/servicios Sabora** y corrección hacia delante para migraciones SQL no reversibles. No ejecutar rollback destructivo sin un procedimiento específico probado y aprobado.
- Nunca reiniciar ni detener servicios ajenos; no eliminar volúmenes/redes compartidos.
- Conservar evidencias de error, SHA y auditoría sin registrar datos personales o secretos.

## 6. Puertas abiertas
Pendientes de implementación y prueba: reconciliación de contactos con datos ficticios; comprobación automatizada de configuración/secretos; validación combinada de PWA premium/H6 y cadena de personal; ensayo de recuperación/reversión. Ninguna operación productiva realizada.
