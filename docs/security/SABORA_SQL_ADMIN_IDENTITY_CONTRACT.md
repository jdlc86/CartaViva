# Contrato de identidad SQL administrativa — fase cerrada

Estado: diseño de seguridad, sin aprovisionamiento de LOGIN ni grants operativos. Fuente normativa: `docs/architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md` y `docs/security/SABORA_SQL_WRITER_BOUNDARY_DESIGN.md`.

## Separación de identidades

- **Identidad del usuario:** verificada por el servidor antes de iniciar una mutación. El identificador del usuario nunca se acepta como autoridad solo porque aparezca en un JSON o en una cabecera enviada por el cliente.
- **Identidad técnica SQL:** conexión dedicada del backend, diferente de las identidades cliente y del lector de personal. No debe ser superuser, owner del esquema, ni BYPASSRLS.
- **Rol de permisos:** `sabora_admin_writer` permanece NOLOGIN, NOINHERIT y sin acceso al esquema. No se concederá membresía a un LOGIN antes de aprobar la matriz por recurso.
- **Autoridad de negocio:** el backend debe comprobar dentro de la misma transacción que el usuario es ADMIN activo y propietario actual de `admin_write_ownership`. ROOT solo dispone de las operaciones de gobierno previstas en el workflow, no de mutación administrativa ordinaria.

## Orden transaccional

1. Validar identidad de usuario autenticada en el backend, no desde campos del cliente.
2. Abrir transacción con la identidad técnica autorizada.
3. Bloquear `admin_write_ownership` (singleton).
4. Revalidar membresía durable y estado activo bajo bloqueo.
5. Ejecutar únicamente la operación permitida, sin escapar de la transacción.
6. Registrar auditoría con correlación; confirmar o revertir todo de forma atómica.

## Puertas de implementación

Antes de habilitar un LOGIN o un GRANT de escritura deben existir: matriz tabla/columna/función por operación; políticas RLS que funcionen bajo un rol no propietario y sin BYPASSRLS; pruebas de denegación de SQL directo fuera de la operación autorizada; verificación de identidad y manejo de sesiones; bootstrap y recuperación de ROOT; pruebas de concurrencia, rollback y replay; revisión de ACL de funciones nuevas y objetos creados por otros propietarios.

La conexión del servidor y los secretos operativos no forman parte de las migraciones. No se autoriza aplicación en Supabase operativo, VPS, merge ni despliegue con este documento.
