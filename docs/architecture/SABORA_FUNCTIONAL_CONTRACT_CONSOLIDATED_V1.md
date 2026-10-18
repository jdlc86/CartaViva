# Sabora — contrato funcional consolidado (borrador normativo)

Fecha: 2026-10-18. Fase: **documentación y revisión de requisitos**. Sin implementación ni certificación de pruebas. Rama documental; sujeto a revisión antes de integrar en main.

## Jerarquía y trazabilidad
Las decisiones explícitas más recientes prevalecen sobre formulaciones anteriores del mismo asunto. Se preservan como antecedentes `SABORA_CONTRACT_CONSISTENCY_V1.md` y `SABORA_DEEP_RECONCILIATION_AUDIT_V2.md`; no deben interpretarse sus preguntas antiguas como decisiones todavía abiertas si este contrato las resuelve. No inferir implementación del contenido documental.

## Mesa, QR, visita y cuentas
- QR fijo identifica mesa, no presencia física. Fotografía y renovación remota mientras la mesa esté abierta son riesgos aceptados. Revocar QR invalida permisos de pedido asociados al código anterior, no pedidos, cuentas ni pagos.
- Camarero abre, cierra y pausa mesa. Pausa temporal: permite carta, cuenta, pagos y llamar al camarero; bloquea añadir a cesta y enviar pedidos. Reanudación automática al vencimiento si no se cerró o amplió pausa; revalidar disponibilidad. Cierre bloquea nuevas autorizaciones/pedidos, no pagos ni deuda anterior.
- Cada comensal tiene cuenta individual; el grupo es agregación, y el personal puede corregir asociación sin reescribir historia financiera. Reapertura de mesa no crea automáticamente un grupo nuevo.
- Autorización de pedido comienza en primer escaneo, caduca tras duración configurable aún no fijada, sin reiniciarse por pedidos. Reescaneo del QR vigente renueva permiso y conserva cuenta/visita válida. No vincular visita anterior con ocupación posterior. Expiración no bloquea consultar/pagar cuenta ni llamar camarero.
- Pagar no cierra permiso ni cuenta: pedidos posteriores generan nuevas comandas y deuda adicional en la misma cuenta. Liquidaciones anteriores son inmutables.

## Carta, cesta y comandas
- **Decisión aprobada — guardar y publicar por separado:** guardar un plato nuevo o sus cambios conserva un borrador no visible al cliente; publicar es una acción explícita posterior. Los cambios guardados de un plato ya publicado no sustituyen su versión pública hasta nueva publicación. La publicación valida precio, opciones/extras, alérgenos y reglas de visibilidad; retirada y agotado siguen siendo estados distintos.
- Publicación y disponibilidad son distintas. Categoría publicada aparece si tiene al menos un plato publicado/no retirado, aunque todos estén agotados. Agotados visibles pero no seleccionables; retirados ocultos. «Todos» es filtro virtual.
- Opciones y extras configurados por restaurante; validar en servidor pertenencia al plato, límites, tenant, disponibilidad y precio, con snapshot de importes y alérgenos.
- Cesta offline es local; reconectar obliga a validar precios, opciones y disponibilidad, y a pedir confirmación expresa antes de enviar. En resultado de envío incierto, consultar por clave idempotente; nunca autoenviar ni duplicar.
- Comanda aceptada tiene identidad única; reintentos y transportes deduplicados. Revisiones anteriores al despacho preservan pedido lógico y revisiones inmutables; solo la revisión vigente se despacha. Tras recepción verificable en cocina, cliente no edita la comanda: gestiones operativas por camarero, con auditoría.
- **Identidades separadas:** pedido lógico con ID estable, revisión numerada e inmutable, y comanda/despacho con ID propio. Una corrección anterior a cocina genera revisión nueva del mismo pedido; nunca un segundo pedido cobrable por accidente. Un reenvío repetido no crea otra comanda ni otra autorización.
- **Disponibilidad cambia antes del despacho:** conservar snapshot original, invalidar exclusivamente la revisión afectada y bloquear su despacho. El cliente ve la incidencia y corrige explícitamente, sin sustitución silenciosa. Mostrar diferencia de precio y obtener consentimiento cuando proceda; ajustar autorización previa sin denominar reembolso a la liberación de fondos no capturados. La revisión corregida se envía inmediatamente, sin abrir otra ventana de agrupación.
- **Ventana de agrupación aprobada:** cinco minutos para agrupar pedidos antes de despacho, mediante vencimiento diferido y sin polling; no confundir este plazo con la caducidad configurable del permiso QR. La revisión corregida por incidencia se despacha inmediatamente tras validación, sin otra ventana de cinco minutos.
- **Carrera con ventana de agrupación:** vencimiento programado, invalidación de catálogo y confirmación deben competir mediante transacción/versión de estado. Solo una revisión vigente puede adquirir el derecho a despacho. El instante «recibida por cocina» exige acuse verificable; emitir un evento no equivale a recepción.
- **Comanda ya recibida:** no permitir al cliente corregir ni cancelar directamente. Las incidencias se tramitan por personal, con distinción entre cancelación solicitada por cliente, por camarero a causa del restaurante y por cocina, y con ajuste económico independiente.
- No exigir números de asiento: identificar comensal, comanda, mesa y personalizaciones. Sabora no gestiona inventario general, pero la disponibilidad limitada debe resolverse de forma atómica al confirmar pedidos concurrentes.
- Quejas de servicio se resuelven mediante «Llamar al camarero», sin formularios de reclamación al cliente.

## Cancelación y ajuste económico
- Cancelación solicitada por cliente sigue arbitraje configurado; una comanda recibida en cocina no puede modificarse unilateralmente desde PWA.
- **Origen cocina:** toda incidencia/cancelación iniciada por cocinero requiere expediente y arbitraje administrativo, incluso por falta de existencias. El arbitraje verifica hechos, unidades y cálculo; no autoriza negar el reintegro debido por servicio no prestado. Bloquear inmediatamente preparación imposible y avisar al cliente; solo unidades afectadas.
- **Origen camarero:** distinguir «Solicitado por el cliente» (arbitraje según configuración) de «Motivo del restaurante» (sin arbitraje; reintegro del importe afectado). Ambas rutas requieren permisos, motivo y auditoría.
- **Efecto económico de una cancelación imputable al restaurante:** el ajuste de la cuenta y el reintegro debido no son discrecionales, aunque una incidencia **iniciada por cocina** exija revisión administrativa obligatoria. Para **camarero con motivo del restaurante** no existe arbitraje previo. Afectar únicamente los ítems anulados y comunicarlo al cliente. Si aún no se pagó en caja, reducir saldo exigible; si ya se pagó en efectivo, devolución presencial registrada y auditada, sin Stripe. Si se pagó digitalmente, reembolso al método y pagador originales, o liberación/reducción de autorización si no hubo captura.
- Cuando un tercero paga varias cuentas, guardar asignación por cuenta. Notificar al beneficiario tras éxito sin pedir aceptación. Una devolución posterior retorna al pagador original, ajustando la cuenta del beneficiario; idempotencia obligatoria.
- Disputa interpersonal sobre reparto no se arbitra en la app.

## Pagos
- Stripe es la pasarela digital elegida funcionalmente; capacidades concretas pendientes de validación técnica. Importes calculados en servidor en céntimos, nunca desde el cliente.
- En pago inmediato: autorización al confirmar y captura coordinada con registro durable y despacho a cocina. No preparar hasta confirmación de pago; si falla captura no despachar. Captura exitosa con despacho fallido exige reintento idempotente o compensación, nunca segunda captura. Acuse de cocina verificable.
- Estado de pago desconocido: bloquear liquidación de esa misma deuda por cualquier método, incluido efectivo, hasta éxito o fallo confirmados; reconciliar por eventos y consultas puntuales, no por suposición de timeout. Una solicitud de «Pagar en caja» no acredita liquidación ni permite sortear este bloqueo.
- La cuenta individual conserva saldo e historial propios aunque el grupo muestre un agregado. Pagar deuda ajena no traslada la deuda ni modifica quién realizó el pedido: se registra una asignación de pago a la cuenta beneficiaria y un pagador original para cualquier devolución posterior.
- «Pagar en caja» es intención reversible hasta registro de cobro efectivo. Tras liquidación en efectivo no se admite cobro digital de esa deuda. Alternativa efectivo ante fallo confirmado de Stripe solo si restaurante la habilita.
- Pagos, reembolsos, ajustes y sus causas son auditables, sin reescribir operaciones históricas. Cuentas de coste cero se cierran automáticamente cuando todas sus partidas quedan resueltas.

## Stripe: autorización, captura, fallos y recuperación (contrato documental)
- **Intento único por deuda y revisión:** antes de invocar Stripe, registrar en almacenamiento duradero el intento, su clave idempotente estable, cuenta, importe en céntimos, pedido/revisión y estado. Repetir una petición con resultado incierto reutiliza la misma identidad, nunca crea un nuevo cargo.
- **Autorización previa:** al confirmar una ronda de pago inmediato se solicita autorización; durante la ventana de agrupación no se captura. Si cambia el precio antes del despacho, requerir consentimiento cuando aumente y actualizar/sustituir autorización conforme a las capacidades reales de Stripe. La liberación de una autorización no es reembolso.
- **Captura y cocina:** solo la revisión vigente autorizada puede entrar en la transición de captura al despacho. Registrar intención de captura antes de llamar a Stripe. Confirmada la captura, emitir entrega idempotente a cocina y esperar acuse; no considerar «recibida» la comanda por haber emitido el evento. Cocina no prepara antes de confirmación de pago.
- **Fallo confirmado de captura:** no despachar; informar de incidencia y permitir alternativa de caja únicamente si política y restaurante la admiten, mediante transición explícita que impida un cargo tardío del mismo importe.
- **Resultado desconocido (timeout, pérdida de red, webhook retrasado):** conservar el intento pendiente y **reservar/bloquear la misma deuda contra todo método, incluido efectivo**, hasta éxito o fallo confirmado por evidencia del proveedor. Un timeout no es un fallo confirmado ni autoriza crear otra tentativa. Reconciliación puntual tras incidente o evento, nunca polling periódico.
- **Captura confirmada, despacho fallido:** conservar captura, no cobrar otra vez; reintentar entrega a cocina con identidad estable y acuse deduplicado. Si la entrega no puede completarse, abrir incidencia y tramitar compensación/reembolso según causa y estado, sin afirmar que la comanda fue recibida.
- **Webhook:** verificar firma y pertenencia de la operación al restaurante/entorno, deduplicar por ID de evento, tolerar entrega repetida o fuera de orden y comprobar transiciones de estado. El navegador no certifica un cobro. Aplicar asignaciones a cuentas una sola vez.
- **Reembolsos:** crear operación separada e idempotente vinculada al cargo original y a la asignación por cuenta; reembolsar al pagador original, nunca al comensal beneficiario por defecto. Diferenciar solicitado, confirmado y fallido; no declarar devolución bancaria por el simple registro de la solicitud.
- **Caja:** «Pagar en caja» es intención; solo el registro autorizado del efectivo cobrado liquida deuda. Ante cargo Stripe incierto, bloquear caja para esa deuda. Una devolución de efectivo ya cobrado es presencial y queda registrada en Sabora, sin invocar Stripe.
- **Límites de afirmación:** este documento no prueba compatibilidad de Stripe manual capture, vigencia de autorizaciones, importes capturables ni métodos de pago concretos. Verificar con Stripe antes de programar y probar estados de compensación.

## Política de pago de mesa
- **Decisión aprobada — modalidad fija por visita/cuenta:** en la primera ronda con importe positivo, ofrecer las modalidades permitidas por la política vigente; una vez elegida «Pagar ahora» o «Pagar al terminar», conservarla para las rondas posteriores de esa cuenta durante toda la visita, sin volver a preguntar. Las rondas gratuitas previas no fijan modalidad. «Pagar ahora» exige su propia autorización/captura por cada nueva ronda positiva; «Pagar al terminar» acumula deuda de caja. El cliente no cambia unilateralmente la modalidad durante la visita; excepciones operativas requieren intervención del personal, conciliación y trazabilidad, sin alterar cobros ya confirmados.
- Si la mesa tiene «Exigir pago conforme se pide», no ofrecer cuenta abierta en nuevos pedidos positivos. La condición no se activa automáticamente por ser terraza; requiere configuración explícita por mesa.
- **Concurrencia:** la primera elección se fija atómicamente por cuenta/visita; dos dispositivos vinculados no pueden registrar modalidades contradictorias. La política obligatoria de pago inmediato por mesa prevalece al admitir nuevos pedidos, sin conversión retroactiva ni cambio silencioso de cuentas ya abiertas.

**Cambio de política durante una visita:** no altera retroactivamente pedidos confirmados, autorizaciones, pagos ni deuda pendiente. La política vigente rige la admisión de pedidos nuevos, **pero no convierte automáticamente una sesión existente «Pagar al terminar» en «Pagar ahora»**. Si la mesa pasa a exigir pago inmediato, bloquear nuevas comandas positivas a cuenta abierta hasta resolver explícitamente el conflicto de modalidad con el personal y conciliar el saldo anterior; no forzar un cambio silencioso ni permitir eludir la política. Registrar versión de política por pedido y mostrar por separado deuda anterior y operaciones nuevas. Arbitrar cambios concurrentes en servidor, sin que dos dispositivos impongan modalidades contradictorias. El procedimiento detallado de transición es ingeniería pendiente, no una decisión para reabrir la no retroactividad.

## Seguridad y conciliación: invariantes de diseño
- La identidad de la mesa no acredita identidad del comensal ni propiedad de cuenta. Cada acción de pedido, pago, ajuste, cancelación y suscripción a eventos exige autorización de servidor con alcance explícito de restaurante, mesa, visita y cuenta. El QR por sí solo no concede acceso a datos financieros de otros comensales.
- Un pago de tercero requiere intención explícita del pagador, selección de deudas concretas y asignación persistente de importes a cada cuenta; la notificación al beneficiario no constituye autorización ni puede transferir titularidad de pago.
- La misma deuda no puede liquidarse dos veces: bloqueo o reserva transaccional, una tentativa activa y claves idempotentes para cada operación. Dispositivos concurrentes reciben resultado de la operación existente, no crean un segundo cargo.
- Modelar estados durables y separados para pedido lógico, revisión, comanda, autorización, captura, entrega confirmada, cancelación, reembolso y liquidación en caja. Las transiciones entre Stripe y cocina no son atómicas: registrar intención antes de efectos externos, reconciliar respuesta/evento y compensar fallos sin recaptura ni doble despacho.
- Webhooks Stripe verificados criptográficamente y deduplicados por identificador de evento; nunca usar una notificación cliente como prueba de pago. Una captura incierta mantiene bloqueada la deuda también frente a caja hasta confirmación.
- Las incidencias y los eventos de mesa deben filtrarse por destinatario autorizado; notificar a afectados sin revelar pedidos o cuentas ajenas. Auditoría append-only de actor, motivo, objeto, importe y correlación.

## Sesiones QR, autorización y aislamiento de cuentas (contrato documental)
- **QR ≠ identidad:** el QR fijo identifica restaurante y mesa, pero no demuestra presencia ni acredita acceso a una cuenta existente. El servidor debe resolver QR vigente, estado de mesa, visita activa y permiso de pedido antes de aceptar una operación; nunca confiar en IDs enviados por el cliente sin verificar relaciones y permisos.
- **Visita y ocupación:** cada ocupación activa tiene identidad de visita distinta. Al cerrar y volver a abrir la mesa, los permisos de pedido de la visita anterior no habilitan pedidos en la nueva. El reescaneo del QR vigente puede renovar autorización dentro de la misma visita válida, pero no heredar cuentas ni saldos de ocupaciones anteriores.
- **Permiso temporal de pedido:** nace en primer escaneo válido y vence en un plazo configurable pendiente de fijar. No se amplía al añadir productos, confirmar pedidos ni pagar; solo se renueva mediante reescaneo válido. Revocar/rotar QR impide nuevas autorizaciones con el código antiguo. Vencimiento, pausa o cierre bloquean cesta/envío según contrato, sin ocultar la cuenta propia, impedir su pago o bloquear «Llamar al camarero».
- **Titularidad de cuenta:** crear credencial de sesión no adivinable vinculada en servidor a restaurante, mesa, visita y cuenta individual; validar alcance en cada consulta, mutación y suscripción a eventos. Conocer el número de mesa, ID de cuenta o QR no autoriza leer el saldo ni los pedidos de otros comensales. Un dispositivo adicional solo se vincula a la misma cuenta mediante flujo de vinculación autorizado, no por enumeración de identificadores.
- **Pago de tercero:** permitir seleccionar expresamente deudas ajenas mediante un flujo limitado de pago, sin conceder acceso general al historial, datos privados o facultades de modificar la cuenta beneficiaria. Registrar pagador, deuda concreta, asignación y reembolso al método original. No confundir permiso para pagar con titularidad o permiso para cancelar.
- **Personal:** camarero, cocina y gestor requieren credenciales y autorización por rol y restaurante; cocina solo accede a datos necesarios para preparar comandas. Las correcciones, cancelaciones y cobros en caja deben auditar actor, motivo, visita, cuenta y correlación.
- **Carreras y eventos:** revalidar permisos dentro de la misma operación transaccional que crea el pedido; no basta una comprobación anterior en el navegador. Filtrar eventos SSE/WebSocket por destinatario autorizado y revalidar permisos en reconexión/cambio de visita. No filtrar información de otras cuentas en payloads, errores, contadores ni cursores.
- **Riesgo aceptado:** el QR fotografiado puede usarse remotamente mientras esté vigente; esta política no promete geolocalización ni presencia física. El aislamiento de cuentas y la imposibilidad de usar visitas caducadas siguen siendo requisitos de seguridad, no riesgos aceptados.

## Eventos y resiliencia
- Sin polling periódico de API ni DB. Eventos después de commit, outbox duradero, SSE/WebSocket y recuperación puntual por cursor al reconectar; deduplicación de eventos y webhooks.
- Si restaurante pierde Internet, bloquear nuevos pedidos hasta restauración, preservar comandas aceptadas y no inventar estados de pago.
- Pausas y cierre de mesa prevalecen sobre notificaciones de reanudación: no anunciar permiso de pedido si ya no existe.

## Sincronización en tiempo real y recuperación tras desconexiones
- **Fuente de verdad:** cada transición de mesa, visita, cuenta, pedido, comanda, cobro o incidencia se confirma en la base de datos antes de publicarse. Un evento recibido en la PWA es una notificación de estado confirmado, no autorización para saltarse validaciones de servidor.
- **Outbox transaccional:** registrar evento e identidad única en la misma transacción que modifica el estado; un proceso posterior entrega por SSE/WebSocket con semántica de al menos una vez. Consumidores y clientes deduplican por ID y versión; no prometer entrega exactamente una vez.
- **Orden y cursores:** asignar secuencia monotónica dentro del alcance autorizado, guardar cursor por suscripción y permitir recuperación puntual desde el último cursor válido. Si el cursor ya no existe o hubo un hueco, devolver señal explícita de resincronización y obtener una instantánea autorizada, sin bucle de consultas.
- **Conexión y reconexión:** reintentar el canal de eventos con backoff exponencial y dispersión; tras reconectar, validar identidad, visita, cuenta y permisos de mesa antes de entregar backlog. Una desconexión no concede permisos nuevos ni reactiva una mesa cerrada.
- **Privacidad:** el servidor filtra cada evento y recuperación por restaurante, rol, visita y cuenta; no incluir datos de otros comensales en el evento de grupo, el cursor, los errores o el historial recuperado. La invalidación de una credencial corta el acceso a eventos futuros.
- **Sin polling:** prohibidas consultas periódicas de API o base de datos para refrescar estados. Se admiten consultas puntuales provocadas por reconexión, acción del usuario, detección de hueco o reconciliación de un pago incierto. La infraestructura puede usar latidos del transporte sin convertirlos en consultas periódicas de negocio.
- **Offline:** la PWA puede conservar cesta local, pero no acepta pedidos ni simula confirmación de pago sin conectividad al servidor. Al volver la conexión, revalidar mesa, visita, precios y disponibilidad; si algo cambió, solicitar confirmación expresa. No reenviar automáticamente pedidos con resultado incierto: consultar su clave idempotente.
- **Incidencias y destinatarios:** avisar únicamente a comensales o personal afectados por cambio de pedido, falta de disponibilidad, pago o cancelación; deduplicar alertas de la misma transición. No confundir aviso de «enviado a cocina» con acuse de recepción.
- **Parada y pausa:** eventos de reanudación retrasados nunca prevalecen sobre versión más reciente de pausa, cierre o revocación QR. La PWA debe reflejar el estado confirmado más reciente y el servidor rechazar toda acción que ya no sea válida.
- **Parámetros pendientes de ingeniería:** ventana de retención de cursores, tamaño de backlog, política de instantáneas, reintentos máximos y observabilidad; deben decidirse y probarse antes de producción, sin atribuir cifras no aprobadas al usuario.

## Riesgos aceptados y asuntos aún técnicos
- QR fijo fotografiable: no garantiza presencia.
- Duración concreta de autorización por QR, retención de cursores, política de autorización Stripe y tiempos de recuperación requieren diseño técnico.
- Política de publicación resuelta: guardar borrador y publicar explícitamente, sin publicación automática. Efectos de descuentos/cupones sobre coste cero y alcance exacto de pausa global siguen abiertos si no hay aprobación explícita en otras fuentes. El total final exigible cero no debe generar cargo Stripe; cómo se aplican cupones, descuentos, extras, impuestos y propinas sigue necesitando definición específica. El arbitraje por origen cocina/camarero sí está decidido; quedan por diseñar permisos, límites antifraude y resolución de casos concretos.
- Deben diseñarse identidades y permisos de comensal, camarero, cocina y gestor; estados durables de pedido/revisión/comanda/captura/devolución; exclusión concurrente, pruebas de doble pago y duplicación de despacho.

## Cierre de revisión cruzada (18 de octubre de 2026)
- Contrastado este contrato con `SABORA_CONTRACT_CONSISTENCY_V1.md` y `SABORA_DEEP_RECONCILIATION_AUDIT_V2.md` en `main`. Recuperada la ventana de agrupación de **cinco minutos** que estaba omitida en el consolidado.
- Corregida una simplificación potencialmente contradictoria: el cambio de política de mesa no convierte silenciosamente sesiones «Pagar al terminar» en pago inmediato. Se bloquean pedidos nuevos incompatibles hasta conciliación explícita.
- Permanecen abiertas sin atribuir aprobación: tratamiento detallado de cupones/descuentos/extras y alcance de pausa global. La persistencia de ambas modalidades de pago por visita queda aprobada el 18 de octubre de 2026. Los parámetros de infraestructura y Stripe se validan en ingeniería.
- Esta revisión es documental y **no** equivale a revisión de código, ejecución de pruebas, aprobación de PR ni despliegue.

## Seguimiento de hallazgos de auditoría V2 (reconciliación documental)

| Hallazgo | Situación documental tras consolidación | Puerta restante |
| --- | --- | --- |
| P1-01 Caja y cancelación | Resuelto: saldo pendiente ajustado; efectivo ya cobrado se devuelve presencialmente y registra | Diseño y pruebas de ajuste/devolución |
| P1-02 Política de mesa durante visita | Regla normativa de no retroactividad y nueva política para pedidos nuevos | Prueba de sesiones y dispositivos concurrentes |
| P1-03 Captura y cocina | Invariantes y estados durables exigidos | Implementación, acuse y pruebas de fallo |
| P1-04 Arbitraje de cocina | Resuelto: cocina siempre revisión; camarero motivo restaurante sin arbitraje | Permisos y pruebas de expediente |
| P1-05 Validación de opciones | Contrato explícito de tenant, plato, grupo, límites, precios | Corregir kernel y probar servidor |
| P1-06 Identidad de revisión | Pedido lógico estable y revisión inmutable | Alinear kernel, persistencia y despacho |
| P1-07 Autorización y privacidad | Invariantes explícitos por cuenta/visita/actor | Diseño de credenciales, permisos y pruebas |
| P2-08 Precio cero y descuentos | Gratuito no genera Stripe; alcance de cupones/extras no presumido | Confirmar casos no aprobados |
| P2-09 Modalidad en rondas | Resuelto: «Pagar ahora» y «Pagar al terminar» persisten por cuenta/visita tras primera elección positiva | Implementar elección atómica y regresiones multidispositivo |
| P2-10 Cancelación parcial en caja | Ajuste automático, devolución presencial registrada si ya cobrada | Diseño de interfaz y auditoría |
| P2-11 Borrador y publicación | Resuelto: guardar borrador no publica; publicar es explícito y valida contenido | Implementar versionado y pruebas de publicación |
| P2-12 Autorización y agrupación | Captura al despacho, revisión inmediata y carreras prohibidas | Vigencia Stripe, reloj y concurrencia |
| P2-13 Eventos y reconexión | Sin polling, SSE/WebSocket, cursor, dedup y reconciliación puntual | Retención y recuperación de cursor |
| P2-14 Documentos históricos | Contrato consolidado separado de antecedentes | Revisión final de referencias y jerarquía |
| P2-15 Identidad visual | Sabora V3 vigente; assets anteriores históricos | Validación de recursos finales de producción |
| P2-16 Pruebas | Matriz de pruebas documentada | Ejecución real y CI aún no acreditados |

Esta matriz registra **resolución documental**, no certifica código, tests ni integración. No reabrir P1-01, P1-02, P1-04 o P2-10 por formulaciones obsoletas en la auditoría.

## Matriz de pruebas obligatoria antes de declarar implementado
1. Dos comensales y dos dispositivos intentando liquidar la misma deuda: una sola liquidación.
2. Stripe con resultado desconocido, intento simultáneo de cobro en efectivo: efectivo bloqueado hasta resolución.
3. Captura exitosa y fallo de entrega a cocina: una sola captura, reintento sin doble comanda.
4. Cancelación restaurante de un ítem en cuenta pendiente en efectivo: reducción inmediata del saldo; pago previo en efectivo: devolución presencial registrada.
5. Pago de tercero por varias cuentas y cancelación posterior de ítem ajeno: reembolso al pagador original.
6. Expiración de permiso QR, reescaneo, cierre y rotación de QR: nunca crear pedido en visita incorrecta.
7. Mesa pausada: bloquear cesta/envío, permitir carta/cuenta/pago/llamar; evitar reanudación falsa tras cierre.
8. Última unidad disponible y dos pedidos concurrentes: solo uno confirmado y cobrable.
9. Cesta offline, precio cambiado, reintento con clave idempotente: consentimiento explícito y sin duplicación.
10. Eventos duplicados o desconexión: recuperación puntual, sin polling y sin filtrar datos entre cuentas.
11. Usuario con QR de mesa pero sin permiso de cuenta intenta consultar o pagar saldo ajeno: acceso denegado, salvo pago voluntario de tercero mediante flujo explícito.
12. Dos dispositivos, webhook Stripe duplicado y reintento de cocina: una sola captura, un solo despacho y auditoría correlacionada.
13. Plato agotado durante agrupación y vencimiento simultáneo: revisión inválida nunca llega a cocina; corrección del mismo pedido y despacho inmediato único.
14. Precio cambiado antes del despacho: consentimiento expreso, autorización ajustada o reemplazada según Stripe y cero reembolso ficticio de importes no capturados.
15. Comanda ya acusada por cocina y cliente intenta editar desde PWA: denegación, conservación de histórico y derivación a camarero.
16. Timeout tras solicitud de captura y webhook tardío: deuda bloqueada para caja y tarjeta; un único cargo tras reconciliación.
17. Captura confirmada con caída de cocina y reintento duplicado: no recapturar, una sola comanda tras acuse.
18. Webhooks duplicados o fuera de orden: sin duplicar pagos, asignaciones ni devoluciones.
19. Revisión que incrementa o reduce importe autorizado antes de captura: consentimiento cuando corresponda, operación idempotente y sin reembolso ficticio.
20. QR fotografiado de mesa abierta: pedido permitido solo dentro de permiso y visita vigentes, sin acceso a cuentas ajenas.
21. Cierre y reapertura de mesa con QR anterior: credencial de visita antigua nunca autoriza pedido ni lectura de nueva ocupación.
22. Segundo dispositivo intenta unirse a cuenta ajena con solo ID o número de mesa: acceso denegado sin vinculación autorizada.
23. Pago voluntario de deuda ajena: operación permitida solo para deuda seleccionada, sin acceso general a historial o cancelaciones.
24. Pausa, revocación de QR y envío concurrente: transacción rechaza el pedido si el permiso dejó de ser válido.
25. Reconexión de SSE/WebSocket tras cambio de visita: no se entregan eventos de cuentas o visitas ajenas.
26. Evento outbox entregado dos veces y fuera de orden: estado final único, sin alertas duplicadas ni retroceso visual.
27. Cursor caducado o hueco en secuencia: resincronización puntual autorizada, sin polling.
28. Reconexión tras cierre, pausa o rotación QR: el cliente no recupera permisos antiguos ni recibe datos de otra visita.
29. Pérdida de red al confirmar pedido: consultar resultado por clave idempotente y no reenviar ni cobrar automáticamente.
30. Desconexión de restaurante y cesta local: bloquear nuevos pedidos, revalidar al volver y solicitar consentimiento por cambios.
31. Edición de plato publicado guardada como borrador: clientes siguen viendo versión publicada anterior hasta publicación explícita; validar precio, extras y alérgenos al publicar.
32. Primera ronda positiva elige «Pagar ahora»: siguiente ronda positiva conserva modalidad y crea autorización/captura propia sin nueva pregunta.
33. Primera ronda positiva elige «Pagar al terminar»: rondas siguientes acumulan deuda de caja sin nueva pregunta; dos dispositivos simultáneos no pueden imponer modalidades distintas.
34. Visita con rondas gratuitas iniciales: modalidad se decide únicamente al primer pedido positivo; no se permite cambio unilateral posterior.

**Estado:** contrato documental; no constituye evidencia de implementación, ejecución de pruebas, aprobación de PR ni despliegue.
