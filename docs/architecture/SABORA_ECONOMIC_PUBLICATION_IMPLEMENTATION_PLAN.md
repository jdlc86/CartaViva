# Sabora — contrato económico de publicación: diseño de implementación

Estado: **diseño no operativo**. Fuente normativa: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`. Este documento no autoriza desplegar ni activar rutas.

## Invariantes ya aprobados
- Guardar borrador y publicar son transacciones diferentes; solo el snapshot publicado es visible y cotizable.
- El descuento de plato se aplica sobre el precio base **más todos los extras seleccionados**; puede ser fijo en céntimos o porcentual, sin cupones.
- La disponibilidad y pertenencia de cada opción/extra al plato se verifican en servidor, no en la PWA.
- Cualquier cambio de precio o descuento entre cesta y confirmación exige recalcular y obtener aceptación explícita, también cuando el importe baja.
- Pedidos confirmados conservan snapshot económico inmutable, incluyendo precio base, extras, descuento y total.

## Contrato candidato para la siguiente migración (requiere revisión)
1. Definir versión del JSON público y esquemas tipados para `options`, `extras` y `discount`, con identificadores estables y límites de tamaño; no inferir estos campos a partir de entradas arbitrarias del cliente.
2. Validar estructuralmente en PostgreSQL cada modificador: identidad, pertenencia, importes enteros no negativos, límites de selección, alérgenos y disponibilidad. Rechazar claves desconocidas y referencias duplicadas.
3. El publicador debe congelar el borrador validado en un snapshot versionado, bajo bloqueo de fila y revisión esperada. La edición posterior no altera la publicación anterior.
4. El lector restringido solo proyectará el esquema público completo después de implementar sus validadores y DTO. Mientras tanto, rechaza snapshots con modificadores no representables.
5. El cálculo de cesta/pedido toma exclusivamente datos persistidos publicados y resuelve selecciones en servidor. `priceCatalogLine` es un cálculo puro auxiliar, **no** un autorizador de pedidos ni una validación de pertenencia.
6. Recalcular la cesta ante cambios publicados; bloquear confirmación hasta aceptación explícita de la nueva versión y sus importes. El backend controla idempotencia y snapshot de la línea.
7. Probar en PostgreSQL 17 desechable: publicación válida, rechazo de extras malformados, duplicados, precio fuera de rango, descuento inválido, edición sin republicar, retirada, agotado, concurrencia y permisos de roles.

## Estado de seguridad actual
`20261021190000_sabora_catalog_publication_guard.sql` **rechaza** opciones y extras no vacíos y descuentos no nulos. `projectPublishedCatalog` aplica la misma política de fallo cerrado para evitar omisiones económicas en la respuesta pública. No flexibilizar estas dos barreras antes de completar el contrato de extremo a extremo.

No aplicar migraciones al Supabase operativo, no conectar Gestión a funciones escritoras, no montar el endpoint ni desplegar sin autorización expresa.

## Implementación aislada de cotización (sin activación)
- `apps/api/src/catalog-selection-quote.mjs`: cotiza una selección contra un snapshot de catálogo **que debe proceder de persistencia autorizada**. Valida IDs, pertenencia al grupo/plato, máximos, selección obligatoria, disponibilidad, duplicados y precios de extras/opciones; ignora importes suministrados por el cliente (los rechaza como campos inesperados). Retiene desglose, alérgenos y descuento. No representa aún un contrato HTTP.
- `apps/api/src/catalog-reprice-gate.mjs`: compara cotización anterior con revisión y precios publicados actuales. Señala `requiresAcceptance` ante cambios de revisión o importes, incluidos descuentos y reducciones de precio. No autoriza ni confirma un pedido; no hay aceptación persistida, bloqueo transaccional ni idempotencia todavía.
- Pruebas unitarias: `tests/catalog-selection-quote.test.mjs` y `tests/catalog-reprice-gate.test.mjs`. Deben superar CI antes de integración.
- Pendiente: equivalencia SQL del esquema, congelación de snapshots versionados, permisos y transacciones, confirmación de aceptación explícita, serialización de importes y revisión de seguridad independiente. **No conectar** estas funciones al catálogo público ni a pedidos hasta completar esas puertas.

## Puerta de equivalencia diferencial JavaScript / PostgreSQL (implementada)
- `scripts/ci/catalog-economic-parity.mjs` genera casos positivos y negativos y calcula el resultado esperado con `validateEconomicModifiers`; el smoke aplica los mismos JSON al validador candidato `sabora.validate_catalog_economic_modifiers(jsonb)` en PostgreSQL 17 desechable.
- Cobertura actual: estructuras vacías y completas, descuentos fijo/porcentual, precio cero y límite superior, nombres/IDs ausentes, `null`, extras duplicados, valores de opción duplicados, límites de selección, claves desconocidas y alérgenos inválidos.
- `fbe6dc2b`: Sabora CI y Bootstrap SUCCESS después de corregir la inserción del delimitador `DO $$` en el script de pruebas. El validador SQL trata respuestas `NULL` de funciones auxiliares como rechazo explícito.
- **Alcance limitado:** es equivalencia de los casos incluidos, no demostración de equivalencia universal. Faltan fuzzing, revisión independiente, versionado del JSON público, pruebas de publicación con modificadores, contratos de aceptación transaccional y permisos de escritor. Las rutas operativas continúan inactivas.
