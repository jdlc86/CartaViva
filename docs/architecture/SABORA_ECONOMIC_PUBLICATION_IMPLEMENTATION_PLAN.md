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

## Cobertura ampliada y corrección de validación (sesión 3)
- `scripts/ci/catalog-economic-parity.mjs`: 29 fixtures explícitos + 300 mutaciones reproducibles de una semilla fija, comparadas con la función candidata SQL en PostgreSQL 17 desechable. Las mutaciones ejercitan `options`, `extras`, `discount`, campos internos, tipos, importes, límites y estructuras inválidas.
- La ampliación detectó un error de robustez: `uniqueIds` en JS podía intentar leer `.id` de una entrada nula antes de rechazarla. `9cc705a8` protege los elementos y evita excepciones inesperadas; Sabora CI y Bootstrap SUCCESS en ese commit.
- Se añadieron pruebas unitarias para colecciones con entradas `null` (`fb3e7efa`). Mantener esta regresión cuando se integre la publicación versionada.
- Las 329 pruebas diferenciales no habilitan permisos, rutas, escritura ni publicación económica. Requieren validación de seguridad independiente antes de cualquier activación.

## Evidencia económica de línea, contrato candidato v1 (sin escritura)
- `apps/api/src/catalog-line-evidence.mjs` implementa `buildCatalogLineEvidence`, que toma `itemId`, `publishedRevision`, snapshot publicado **confiable**, selección y cantidad. Produce un objeto profundamente congelado con `schemaVersion: 1`, nombre/categoría, selecciones con sus precios y alérgenos, descuento, desglose unitario y total. No contiene credenciales ni datos de cliente.
- Es un **constructor de evidencia**, no una verificación de integridad ni prueba criptográfica. No aceptar este objeto desde la PWA como fuente de verdad. El futuro escritor debe obtener snapshot y revisión de DB, bloquear la fila, cotizar y persistir evidencia en la **misma transacción**, con idempotencia y aceptación de recálculo cuando corresponda.
- `priceCatalogLine` usa aritmética `BigInt` para el producto intermedio de descuento porcentual y redondeo half-up exacto, conservando las salidas en céntimos enteros seguros. Se añadieron pruebas de límite `Number.MAX_SAFE_INTEGER`.
- No hay nuevas rutas HTTP, concesiones de permisos, cambios de publicación, despliegues ni escrituras a Supabase operativo.

## Aceptación de recotización firmada — candidato aislado
- `apps/api/src/catalog-reprice-acceptance.mjs` incorpora `issueCatalogRepriceAcceptance` y `verifyCatalogRepriceAcceptance`: token HMAC-SHA256 de servidor ligado a `basketId`, `actorId`, ID y revisión publicada, selección, cantidad y evidencia económica recalculada. TTL entre 1 y 600 segundos (predeterminado 300); clave de servidor de al menos 32 bytes. La firma se comprueba en tiempo constante; cualquier cambio de precio, descuento, disponibilidad, revisión, selección, cesta o identidad invalida el token.
- `tests/catalog-reprice-acceptance.test.mjs` comprueba firma, caducidad, revisión, subida y bajada de precio, cambios de descuento/disponibilidad, manipulación, identidad y errores de entrada.
- **Importante:** emitir o verificar un token NO demuestra que el usuario haya pulsado «Aceptar», ni impide reutilización del mismo token. Tampoco demuestra sesión, presencia en mesa, autorización de pedido, estado de mesa, versión de catálogo bloqueada, ni idempotencia. Son responsabilidades de un futuro flujo HTTP autenticado y transacción de escritura con comprobación de estado y registro de aceptación explícita. No incluir la clave en la PWA, logs ni base de datos del cliente.
- Este módulo es **candidato desconectado**. No se ha conectado a pedidos, lector público, writer SQL, ni rutas HTTP. No habilitar su uso operativo antes de implementar aceptación de interfaz, registro duradero e idempotencia bajo bloqueo de DB, pruebas concurrentes y revisión de seguridad.

## Decisión de confirmación económica previa a transacción (candidato aislado)
- `apps/api/src/catalog-confirmation-decision.mjs` añade `decideCatalogLineConfirmation`: compara la cotización anterior con evidencia reconstruida de snapshot publicado confiable y revisión vigente. Devuelve `acceptance_required` si cambió la revisión, subtotal, descuento o total, aunque el precio disminuya; solo devuelve `ready_for_transaction` sin cambios o con token firmado válido para **exactamente** la revisión, cesta, actor y selección actual.
- `tests/catalog-confirmation-decision.test.mjs` cubre subida/bajada, cambio de revisión sin variación de precio, descuentos, tokens caducados/de otra identidad, cotizaciones previas manipuladas y evidencia congelada.
- **`ready_for_transaction` no significa pedido confirmado ni autorizado.** El paso posterior debe: (1) verificar actor y visita QR vigentes; (2) bloquear filas y revalidar estado de mesa, disponibilidad y revisión publicada; (3) comprobar y consumir consentimiento explícito cuando corresponda; (4) aplicar idempotencia con clave y huella de petición; (5) guardar evidencia y revisión del pedido atómicamente; (6) publicar evento solo después de commit. Si falla cualquiera, abortar. Este candidato no implementa ninguno de esos pasos de DB y no está montado en HTTP.

## Coordinador transaccional candidato (adaptador no implementado)
- `apps/api/src/catalog-confirmation-coordinator.mjs` define una secuencia de servidor: transacción única → `lockContext` (visita/mesa/cesta y autorización) → `lookupIdempotency` → `lockCatalog` (revisión publicada y disponibilidad) → `decideCatalogLineConfirmation` → `persist` (evidencia económica y clave idempotente). El coordinador no acepta importes del navegador; exige un adaptador privado de persistencia y una clave de firma de servidor.
- Un replay devuelve el resultado previo únicamente si coincide la huella canónica de la petición; un cambio económico devuelve `acceptance_required` sin persistencia; cualquier fallo de autorización, disponibilidad o escritura aborta la transacción. Las pruebas con adaptador simulado comprueban orden, replay, rollback y consentimiento.
- **No es un flujo de pedidos operativo:** no existe todavía implementación PostgreSQL del adaptador, garantía SQL de unicidad, bloqueo real de visita/mesa/catálogo, consumo durable de consentimiento ni emisión poscommit. El adaptador debe demostrar estas propiedades con pruebas de concurrencia en PostgreSQL 17 antes de montar HTTP. La huella calculada en JS es un identificador de equivalencia local, no una firma ni una garantía de unicidad en DB.
- `ready_for_transaction` significa solo que se superó la puerta económica pura; nunca sustituye las comprobaciones de autorización y disponibilidad del adaptador ni permite activar el antiguo `confirm_order` para aceptar importes arbitrarios.

## Corrección crítica: precio anterior nunca procede del navegador
- `catalog-confirmation-coordinator.mjs` ya no admite `previous` en la petición. El adaptador obligatorio `loadPreviousQuote(query,{context,itemId,basketId,actorId})` debe recuperar de almacenamiento confiable, **bajo la misma transacción y con bloqueo apropiado**, la revisión e importes que el servidor mostró a ese cliente. Si falta, el pedido se rechaza; no se debe inventar una cotización anterior ni tomarla del cliente.
- Motivo: el prototipo previo admitía `previous` del navegador y podía omitir `acceptance_required` mediante una revisión/precio falsificados iguales a la publicación vigente. Se cerró esa vía antes de activar HTTP.
- Se añadieron pruebas de rechazo de `previous` en el payload, ausencia de cotización almacenada y discrepancia de revisión almacenada. El adaptador real aún está pendiente: debe registrar cotizaciones servidas, asociarlas a visita/cesta/actor y asegurar que no se sustituyan por el cliente.

## Ledger SQL candidato de cotización mostrada e idempotencia
- `supabase/migrations/20261021220000_sabora_catalog_quote_ledger_candidate.sql` crea dos tablas privadas: `catalog_displayed_quotes` (revisión, importes, evidencia, mesa/sesión/visita/cesta/actor, caducidad máxima 30 min) y `catalog_confirmation_attempts` (clave idempotente por contexto, huella de petición, referencia a cotización, aceptación explícita y evidencia, pedido asociado).
- Ambas tienen RLS habilitado y forzado, **sin políticas ni concesiones de runtime**. La confirmación posee restricción UNIQUE por sesión/visita/cesta/actor/clave y FK compuesta que impide vincular cotizaciones de otra visita, cesta o identidad. No hay funciones de escritura ni se conecta al coordinador; los campos `accepted_reprice` y `accepted_at` no son prueba de consentimiento sin un escritor seguro.
- CI valida presencia de RLS, restricciones y ausencia de privilegios para roles cliente y roles candidatos. El recuento de tablas RLS del esquema pasa de 15 a 17.
- **Pendiente antes de activar:** escritor mínimo y pruebas concurrentes, registro del acto de aceptación, identidad autenticada y QR vigente, bloqueo transaccional, semántica de expiración, comprobación de revisión y permisos. La tabla por sí sola no garantiza inmutabilidad ante un rol propietario o superusuario; no dar acceso de escritura directo a la aplicación.

## Integridad referencial negativa en PostgreSQL 17 (siguiente hito)
- La confirmación candidata incluye ahora `item_id` y una FK compuesta hacia la cotización mostrada que vincula **mesa, sesión, visita, cesta, actor y artículo**. Una segunda FK compuesta hacia `orders(table_id,session_id,id)` impide vincular pedidos de otra mesa/sesión.
- `scripts/ci/catalog-quote-ledger-smoke.sql` crea datos ficticios únicamente en PostgreSQL 17 de CI y revierte toda la transacción. Comprueba: inserción válida, duplicación de clave idempotente, artículo ajeno, visita ajena, pedido de otra mesa y totales inconsistentes; valida el nombre de la restricción que rechaza cada operación.
- El ledger sigue siendo **candidato inerte**: los tests usan propietario de DB desechable y no representan privilegios de runtime. No hay escritor de mínimos privilegios, confirmación real ni pruebas de dos sesiones concurrentes. No conceder permisos ni activar HTTP.

## Prueba de concurrencia PostgreSQL 17 para idempotencia del ledger (candidata)
- `scripts/ci/catalog-quote-concurrency-smoke.sh`, invocado por `scripts/ci/postgres-migration-smoke.sh`, crea exclusivamente datos ficticios en el PostgreSQL 17 desechable sin red. Abre **dos conexiones independientes**: la primera inserta la confirmación y mantiene la transacción abierta; la segunda intenta la misma clave de petición con huella y pedido distintos y `ON CONFLICT ... DO NOTHING`. Tras ambos commits verifica que solo permanece la primera huella.
- La sincronización espera a que la primera conexión esté ejecutando `pg_sleep` después de su inserción no confirmada; evita una prueba meramente secuencial. Se comprueba además el aislamiento por sesión, visita, cesta y actor fijado en la restricción UNIQUE.
- **Alcance de la prueba:** demuestra comportamiento concurrente de la restricción SQL, **no** un escritor de mínimos privilegios, verificación de sesión/QR, política de bloqueo de mesa, cotización anterior bloqueada, ni consumo de consentimiento. No conectar HTTP ni conceder permisos de runtime por este resultado.

## Barrera append-only para evidencias económicas candidatas
- `20261021230000_sabora_catalog_ledger_append_only_candidate.sql` incorpora una función trigger `SECURITY INVOKER` sin EXECUTE público y dos triggers `BEFORE UPDATE OR DELETE`, uno por cada ledger privado. Toda mutación ordinaria posterior a la inserción se rechaza con `catalog_ledger_append_only`.
- El smoke PostgreSQL 17 intenta modificar y borrar tanto cotizaciones mostradas como confirmaciones y exige el rechazo exacto; además verifica que ambos triggers estén habilitados. El script concurrente sigue probando la unicidad idempotente con dos sesiones.
- **Límite:** un propietario/superusuario podría deshabilitar triggers o alterar DDL. Esto no sustituye mínimos privilegios, ni acredita autenticación, consentimiento expreso, publicación económica o escritor de pedidos. La migración continúa siendo candidata no aplicada a Supabase operativo.

## Cierre del bypass TRUNCATE en ledgers económicos candidatos
- Los triggers por fila `BEFORE UPDATE OR DELETE` no interceptan `TRUNCATE`. Se añadieron dos triggers `BEFORE TRUNCATE FOR EACH STATEMENT` a `20261021230000_sabora_catalog_ledger_append_only_candidate.sql`, usando la misma función que rechaza mutaciones.
- `scripts/ci/catalog-quote-ledger-smoke.sql` intenta ambos `TRUNCATE` y exige `catalog_ledger_append_only`; `postgres-migration-smoke.sh` verifica los **cuatro triggers habilitados**.
- Esta barrera impide las tres formas ordinarias de borrar/modificar registros (UPDATE, DELETE, TRUNCATE), pero no protege contra DDL de un propietario/superusuario. No concede privilegios ni habilita pedidos o escrituras operativas.
