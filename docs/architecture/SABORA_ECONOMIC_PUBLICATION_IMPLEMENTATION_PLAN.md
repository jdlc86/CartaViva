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

## Adaptador de lectura transaccional de confirmaciones (candidato)
- `apps/api/src/catalog-confirmation-read-repository.mjs` añade tres operaciones de lectura SQL parametrizadas para el futuro escritor: `lookupIdempotency` (mesa, sesión, visita, cesta, actor y clave, `FOR UPDATE`), `lockCatalog` (snapshot publicado, revisión, retirada/agotado, `FOR SHARE`) y `loadPreviousQuote` (misma identidad/contexto/artículo, solo cotizaciones no caducadas, `FOR SHARE`).
- Las cantidades y revisión PostgreSQL bigint se convierten a enteros seguros de JavaScript, rechazando desbordamientos y totales inconsistentes. El repositorio no abre conexiones ni otorga permisos: exige la función `query` de la transacción existente.
- `catalog-confirmation-coordinator.mjs` exige ahora un `quoteId` recuperado del almacenamiento confiable y lo pasa a `persist` para que la FK compuesta pueda asociar la confirmación a **esa** cotización. Las pruebas rechazan cotizaciones sin identificador.
- **No integrar aún**: falta `lockContext` con autorización efectiva de QR/visita/identidad, falta `persist` transaccional con aceptación durable y escritor de mínimos privilegios. El repositorio de lectura no está montado en HTTP ni en producción. Antes de activarlo, verificar también que la selección/cantidad de la cotización mostrada corresponde a la selección/cantidad confirmada, no solo que coinciden los importes.

## Vinculación de selección y cantidad a la cotización mostrada
- `catalog-confirmation-read-repository.mjs` lee ahora `evidence` del ledger junto con el identificador, revisión e importes de la cotización, bajo bloqueo de fila y contexto.
- `catalog-displayed-quote-binding.mjs` verifica que la evidencia almacenada es consistente con la revisión/importes del ledger y que el artículo, la cantidad y el conjunto de identificadores de modificadores seleccionados coinciden con los de la confirmación recalculada. El orden de selección no altera el resultado, pero intercambiar extras, cambiar cantidad o artículo impide confirmar. La revisión y el precio pueden cambiar legítimamente, pero entonces se conserva el requisito independiente de aceptación de repricing.
- El coordinador ejecuta esta comprobación **antes** de devolver `acceptance_required` o persistir un pedido, para que el consentimiento económico no autorice un cambio silencioso de cesta.
- Limitaciones: este guard usa identificadores de modificadores; para activación se debe acreditar además que el registro de cotización fue emitido por un escritor autenticado a partir de snapshot publicado y que la selección original no puede sustituirse. Continúan pendientes `lockContext`, `persist` y el rol de mínimos privilegios.

## Emisión de cotización vinculada a visita (candidata no operativa)
- `apps/api/src/catalog-quote-issuer.mjs` incorpora un coordinador transaccional que primero invoca `lockContext`, exige autorización de visita/mesa/actor/cesta y verifica que el contexto retornado coincide con los identificadores solicitados; luego bloquea catálogo publicado y disponible, calcula la evidencia económica exclusivamente desde el snapshot servidor y llama `insertDisplayedQuote` en la misma transacción.
- La entrada rechaza precios, revisiones o evidencias enviados por el navegador; TTL configurable entre 1 y 1800 segundos, por defecto cinco minutos. Devuelve el identificador de cotización, vencimiento y evidencia congelada solo después de la inserción.
- `tests/catalog-quote-issuer.test.mjs` prueba rechazo de identidad ajena, contexto revocado, artículo agotado, selección inválida, precio inyectado y error de persistencia con rollback.
- **Limitación esencial:** `lockContext` e `insertDisplayedQuote` siguen siendo interfaces sin implementación real, y no hay rol PostgreSQL de escritor ni HTTP. Las pruebas con repositorio simulado no prueban autorización real de QR ni escrituras en PostgreSQL. No activar la ruta de pedidos ni migraciones en Supabase operativo.

## Adaptador candidato de inserción de cotizaciones
- `apps/api/src/catalog-quote-insert-repository.mjs` añade `insertDisplayedQuote(query,{context,evidence,expiresAt})`: INSERT parametrizado en `sabora.catalog_displayed_quotes` con identidad de mesa/sesión/visita/cesta/actor, artículo, revisión, importes, evidencia JSON y expiración. Comprueba UUID, ámbito, enteros seguros, coherencia de descuentos, fecha ISO y resultado de la inserción. No abre conexiones ni inicia transacciones.
- `tests/catalog-quote-insert-repository.test.mjs` comprueba argumentos enlazados, rechazo previo a SQL de contextos/economía inválidos y respuestas inesperadas.
- **Importante:** `authorized:true` y `canOrder:true` son resultados esperados de un `lockContext` backend aún NO implementado, no autorizaciones suministrables por el navegador. Este adaptador por sí solo no demuestra la autorización. No existen todavía permisos de INSERT para un rol de runtime ni integración con la sesión QR; por ello no es seguro ni está conectado a producción. Antes de activar, implementar verificación transaccional de identidad y mesa, permisos mínimos, protección frente a uso directo del adaptador y prueba real en PostgreSQL 17.

## Verificador de mesa y QR candidato (sin autorización de visita)
- `apps/api/src/catalog-table-qr-verifier.mjs` compara el hash SHA-256 del token QR recibido con el hash almacenado en `sabora.dining_tables`, filtrando por UUID de mesa y UUID de sesión y bloqueando la fila con `FOR SHARE`. El token se transmite como parámetro SQL, nunca interpolado en el texto de la consulta.
- Si el QR ha rotado, la sesión es otra o la mesa no existe, devuelve `valid:false`; entradas malformadas o resultados contradictorios se rechazan. `tests/catalog-table-qr-verifier.test.mjs` cubre estos casos.
- **No es `lockContext`**: poseer un QR no prueba la identidad del cliente ni su pertenencia a una visita/cesta. No retornar `authorized:true` o `canOrder:true` basándose únicamente en esta comprobación. Sigue pendiente vincular la sesión de cliente autenticada y una visita durable, con controles transaccionales y privilegios mínimos.

## Candidato de visita durable y autorización por QR + sesión de cliente
- Migración `20261021240000_sabora_customer_table_visits_candidate.sql`: ledger privado de autorizaciones de visita con mesa, sesión de mesa, identidad de cliente, clave de visita, actor, versión QR autorizada, emisión, expiración y revocación; `UNIQUE` de ámbito, RLS y FORCE RLS, **sin grants de runtime**. `scripts/ci/catalog-visit-ledger-smoke.sql` prueba unicidad, validación y expiración al crear sobre PostgreSQL 17 desechable; el gate pasa a exigir 18 tablas RLS.
- `catalog-visit-context-repository.mjs`: lectura SQL transaccional que une mesa, visita y sesión de cliente. Exige coincidencia del hash QR vigente, token de sesión cliente, mesa/sesión, versión QR y expiración/revocación de ambos permisos, bloqueando las tres filas con `FOR SHARE`. El token QR y el token cliente se reciben como parámetros, nunca como SQL literal.
- `catalog-quote-issuer.mjs` ahora exige ambos tokens en su entrada y los entrega únicamente a `lockContext`; ni el catálogo ni la evidencia guardada deben almacenar los secretos. Tests unitarios de autorización y denegación.
- **Puerta aún abierta:** el contrato funcional exige que camarero pueda abrir, pausar y cerrar mesa; las tablas actuales no materializan completamente ese estado. El verificador candidato NO comprueba pausa/cierre y su `canOrder:true` no debe considerarse autorización operativa suficiente. También falta flujo backend autenticado que cree/renueve/revoque grants al escanear QR, vinculación segura actor↔cliente y restricciones de escritura/lectura mínimas. No montar en HTTP ni aplicar a Supabase operativo hasta completar estos controles.

## Estados de mesa y bloqueo de nuevos pedidos (candidato)
- `20261021250000_sabora_table_ordering_lifecycle_candidate.sql` añade a `dining_tables` el estado `closed` (por defecto), `open` o `paused`, el vencimiento opcional de pausa y la fecha de cambio. Una pausa sin vencimiento bloquea indefinidamente; una pausa vencida permite pedidos sin polling, pero **no modifica automáticamente el estado persistido**.
- `catalog-visit-context-repository.mjs` solo retorna contexto autorizable si la mesa está abierta o su pausa temporal ha vencido, además de verificar QR, visita, actor, sesión cliente y caducidades. La consulta bloquea la fila de mesa durante la transacción, serializando contra futuros cambios de estado que utilicen UPDATE.
- `catalog-table-ordering-lifecycle-smoke.sql` y pruebas JS cubren estado inicial cerrado, transición a abierto, pausa, restricciones de estados y denegación SQL de mesas no elegibles.
- **No activar todavía:** faltan endpoints y permisos restringidos para que el personal abra, pause, reanude o cierre mesas; el flujo de renovación de visitas; pruebas integradas de autorización/orden bajo concurrencia. Los cambios son candidatos aislados, sin aplicación a Supabase operativo.

## Límite de ocupación al cerrar y reabrir una mesa (candidato)
- La migración `20261021260000_sabora_table_occupancy_boundary_candidate.sql` añade disparadores de ciclo de vida: cerrar una mesa previamente abierta o pausada rota `session_id`, reinicia el reloj de agrupación y revoca los permisos de visita de la sesión anterior en la misma transacción. Una pausa no rota la sesión. Reabrir desde `closed` conserva la nueva identidad de ocupación.
- El smoke `catalog-table-occupancy-boundary-smoke.sql` valida la separación entre ocupaciones, revocación y persistencia de la identidad durante la pausa, con rollback de datos de prueba.
- Las transiciones de personal siguen pendientes de autenticación y autorización. No existe endpoint de cierre/reapertura habilitado, ni permisos de escritura operativos. El cierre de mesa **no** liquida ni cancela automáticamente deudas anteriores: cuentas y pagos deben continuar vinculados a su ocupación histórica.

## Transiciones de mesa autorizadas por personal (candidato)
- `20261021270000_sabora_table_staff_transitions_candidate.sql` incorpora la función SQL privada `transition_table_ordering_candidate`. Bloquea la fila de membresía activa del actor, comprueba rol `waiter`, `admin` o `root`, bloquea la mesa y valida transiciones `closed→open`, `open→paused`, `paused→open`, `open/paused→closed`. Rechaza cocina, invitaciones pendientes, repeticiones de estado y pausas ya vencidas. El cierre ejecuta los disparadores de rotación/revocación de ocupación existentes.
- `catalog-table-staff-transition-smoke.sql` prueba las transiciones y denegaciones en PostgreSQL 17 desechable, y verifica que los roles públicos, de cliente, lector y escritor administrativo dormido carecen de EXECUTE.
- **No conectar a producción:** el argumento de actor debe provenir de una sesión de personal verificada por backend, jamás del cuerpo del navegador. No hay login runtime, grant, endpoint HTTP, autorización de escritura por dueño administrativo ni auditoría de transición de mesa. Faltan pruebas de concurrencia real cierre/pedido y notificaciones de reanudación versionadas. La función no es una API operativa.

## Carrera de cierre frente a autorización de pedido (PostgreSQL 17)
- `scripts/ci/catalog-table-close-order-lock-smoke.sh` ejecuta dos sesiones PostgreSQL independientes en contenedor desechable: la primera mantiene `FOR SHARE` sobre una mesa abierta durante una transacción; la segunda intenta cerrarla mediante la función candidata de personal y debe esperar el bloqueo. Una autorización posterior al cierre no encuentra mesa abierta.
- Este test demuestra **orden de bloqueos de fila**, no una confirmación completa de pedido: aún falta conectar el escritor de pedidos a `lockContext` y demostrar una inserción de pedido bajo la misma transacción, consentimiento e idempotencia.

## Carrera entre autorización de mesa y cierre por personal
- `scripts/ci/catalog-table-close-concurrency-smoke.sh` ejecuta dos conexiones PostgreSQL 17 independientes: una transacción de cliente retiene `FOR SHARE` sobre mesa abierta y otra intenta `transition_table_ordering_candidate(...,'closed')`. La prueba exige observar a la segunda esperando un bloqueo, confirmar el cierre tras liberar la primera y verificar que la mesa ya no está abierta.
- El gate corre en el contenedor Docker `--network none` del CI; no utiliza Supabase operativo. Este ensayo demuestra serialización del bloqueo de mesa, **no** la persistencia completa de una comanda ni el consentimiento de repricing. El futuro escritor debe conservar el bloqueo hasta confirmar de forma atómica la orden.

## Auditoría candidata de transiciones de mesa
- `20261021280000_sabora_table_ordering_audit_candidate.sql` registra cada cambio de estado o plazo de pausa mediante trigger PostgreSQL, incluyendo sesión anterior/nueva, momento y estados. Tabla con RLS/FORCE RLS, sin permisos runtime, y disparador que impide UPDATE/DELETE. `catalog-table-ordering-audit-smoke.sql` prueba tres transiciones, rotación de sesión, inmutabilidad y ACL en PostgreSQL 17 aislado.
- **Actor todavía no acreditado:** `actor_user_id` queda NULL deliberadamente. No se acepta identidad de una variable SQL manipulable por cliente. Antes de activar operaciones de personal, conectar sesión de empleado verificada y un mecanismo de atribución durable y no falsificable, además de permisos mínimos y pruebas de carrera.

## Candidato de coordinación de transiciones con identidad de personal
- `staff-table-transition-coordinator.mjs` recibe credencial opaca, mesa, destino y pausa. Rechaza campos inesperados (incluido actor enviado por navegador) y deriva `actorId` exclusivamente de `resolveStaffSession` dentro de la misma transacción que llama a la función SQL candidata. El adaptador parametriza todos los argumentos.
- Tests comprueban sesión activa, rechazo de identidad suplantada, validación de estados, rollback y argumentos SQL.
- **No es autenticación real:** `resolveStaffSession` es todavía un puerto sin implementación de backend, y la función SQL `SECURITY INVOKER` sigue sin permisos de runtime. La auditoría SQL no puede atribuir actor hasta disponer de procedencia verificable y operación de escritura autorizada. No montar HTTP.

## Verificación de credencial del personal (adaptador candidato)
- `verified-staff-session-resolver.mjs` exige un `verifyBearer` inyectado por backend que compruebe criptográficamente firma, emisor, audiencia y expiración. No interpreta JWT sin verificar ni admite un actor proporcionado por cliente. El sujeto verificado se contrasta mediante SELECT parametrizado y `FOR SHARE` con `staff_members.state='active'`; las filas contradictorias fallan cerradas.
- El coordinador también exige `role` `waiter/admin/root` y rechaza `kitchen` antes de intentar la transición SQL.
- **Bloqueo de activación:** `verifyBearer` todavía es un puerto, NO una implementación criptográfica concreta. El consumidor no debe fabricar flags `verified/audienceValid/issuerValid/notExpired` a partir de payloads sin verificar. Se necesita proveedor real y configuración segura, conexión DB de privilegios mínimos, auditoría con actor acreditado y revisión de despliegue.
