# CartaViva — Directorio central de instalaciones independientes

Decisión aprobada el 20 de octubre de 2026: cada restaurante dispone de PWA, backend, base de datos y despliegue propios. CartaViva mantiene un directorio **separado** que relaciona un código alfanumérico de restaurante con el origen HTTPS de su PWA.

## Recursos
- Sabora: proyecto Supabase existente `byhvmumqivmunkmomhup`; no se modifica en este hito.
- Directorio: proyecto Supabase nuevo `indoaqfmsfmueuqoilwv` (organización RESTAURANTE, `eu-central-1`), creado con coste consultado de 0 USD/mes.
- Migración del directorio: `supabase/directory/20261020_directory_installations.sql`.

## Límites de seguridad
- `restaurant_code` identifica el restaurante, no concede autorización para una mesa.
- El QR contiene referencia al restaurante y credencial revocable de mesa; el backend de la instalación valida el token y la visita.
- El directorio no almacena pedidos, cuentas, pagos, empleados ni tokens QR.
- La tabla `installations` tiene RLS FORCE y no concede lectura o escritura a `anon` ni `authenticated`.
- El resolvedor público, los permisos de registro administrativo, la comprobación de titularidad del dominio y la protección contra abuso requieren diseño y pruebas antes de habilitarse.
- Un cambio de VPS no debe requerir cambiar el dominio de origen de una PWA instalada.
- Fleetia y cualquier otro proyecto del VPS están estrictamente fuera de alcance. No hay despliegue autorizado.

## Estado
Se crea el directorio de datos sin entradas de restaurantes y sin acceso público. La migración de Sabora a restaurante único sigue en revisión; no se ha desplegado.
