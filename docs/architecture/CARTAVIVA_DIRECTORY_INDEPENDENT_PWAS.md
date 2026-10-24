# CartaViva — Directorio central de instalaciones independientes

Decisión aprobada el 20 de octubre de 2026: cada restaurante dispone de **dos PWA independientes** (cliente y gestión), backend, base de datos y despliegue propios. CartaViva mantiene un directorio **separado** que relaciona un código alfanumérico de restaurante con el origen HTTPS de su PWA.

## Aplicaciones instalables por restaurante
- **PWA Cliente (`apps/client`)**: carta, cesta, pedidos, seguimiento y pagos del comensal. Se abre desde el QR del restaurante; instalarla no concede permisos permanentes para una mesa.
- **PWA Gestión (`apps/management`)**: interfaz instalable separada para camareros, cocina y administración, con vistas y autorizaciones por rol comprobadas en el servidor.
- Ambas pertenecen a la instalación del restaurante y no comparten datos de sesión ni almacenamiento con las PWA de otros restaurantes. Sus manifiestos, ámbitos (`scope`) y service workers deberán configurarse para evitar interferencias entre las dos PWA del mismo origen; el diseño concreto de rutas y orígenes queda sujeto a pruebas.
- **CartaViva Directorio no es una tercera PWA de operación** en esta decisión: es el registro y mecanismo de localización. Una PWA universal de clientes no está aprobada.

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
El directorio ya está creado en Supabase y su tabla privada `cartaviva_directory.installations` tiene cero registros; el resolvedor público y el alta administrativa todavía no están implementados. La migración de Sabora a restaurante único sigue en revisión; no se ha desplegado.
