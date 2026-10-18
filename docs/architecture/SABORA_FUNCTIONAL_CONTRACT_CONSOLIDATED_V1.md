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
- Publicación y disponibilidad son distintas. Categoría publicada aparece si tiene al menos un plato publicado/no retirado, aunque todos estén agotados. Agotados visibles pero no seleccionables; retirados ocultos. «Todos» es filtro virtual.
- Opciones y extras configurados por restaurante; validar en servidor pertenencia al plato, límites, tenant, disponibilidad y precio, con snapshot de importes y alérgenos.
- Cesta offline es local; reconectar obliga a validar precios, opciones y disponibilidad, y a pedir confirmación expresa antes de enviar. En resultado de envío incierto, consultar por clave idempotente; nunca autoenviar ni duplicar.
- Comanda aceptada tiene identidad única; reintentos y transportes deduplicados. Revisiones anteriores al despacho preservan pedido lógico y revisiones inmutables; solo la revisión vigente se despacha. Tras recepción verificable en cocina, cliente no edita la comanda: gestiones operativas por camarero, con auditoría.
- **Identidades separadas:** pedido lógico con ID estable, revisión numerada e inmutable, y comanda/despacho con ID propio. Una corrección anterior a cocina genera revisión nueva del mismo pedido; nunca un segundo pedido cobrable por accidente. Un reenvío repetido no crea otra comanda ni otra autorización.
- **Disponibilidad cambia antes del despacho:** conservar snapshot original, invalidar exclusivamente la revisión afectada y bloquear su despacho. El cliente ve la incidencia y corrige explícitamente, sin sustitución silenciosa. Mostrar diferencia de precio y obtener consentimiento cuando proceda; ajustar autorización previa sin denominar reembolso a la liberación de fondos no capturados. La revisión corregida se envía inmediatamente, sin abrir otra ventana de agrupación.
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

## Política de pago de mesa
- En una sesión que eligió «Pagar al terminar», mantener esa modalidad para rondas posteriores mientras la política de mesa no cambie; no volver a pedir elección en cada ronda. En la primera ronda con importe positivo de una sesión iniciada solo con pedidos gratuitos, ofrecer modalidades permitidas entonces.
- Si la mesa tiene «Exigir pago conforme se pide», no ofrecer cuenta abierta en nuevos pedidos positivos. La condición no se activa automáticamente por ser terraza; requiere configuración explícita por mesa.
- Para «Pagar ahora», no dar por aprobada una persistencia idéntica de modalidad en rondas posteriores; conservar como detalle funcional pendiente.

**Cambio de política durante una visita:** no altera retroactivamente pedidos confirmados, autorizaciones, pagos ni deuda pendiente. La política vigente se aplica a nuevos pedidos; una sesión previamente marcada «Pagar al terminar» conserva el tratamiento de sus pedidos anteriores, mientras que una mesa que pasa a exigir pago inmediato no admite nuevas comandas positivas a cuenta abierta. Registrar versión de política por pedido y mostrar separadamente saldo anterior y operaciones nuevas. Arbitrar cambios concurrentes en servidor, sin que dos dispositivos puedan imponer modalidades contradictorias. Esta regla recoge la decisión ya tratada, sin reabrirla.

## Seguridad y conciliación: invariantes de diseño
- La identidad de la mesa no acredita identidad del comensal ni propiedad de cuenta. Cada acción de pedido, pago, ajuste, cancelación y suscripción a eventos exige autorización de servidor con alcance explícito de restaurante, mesa, visita y cuenta. El QR por sí solo no concede acceso a datos financieros de otros comensales.
- Un pago de tercero requiere intención explícita del pagador, selección de deudas concretas y asignación persistente de importes a cada cuenta; la notificación al beneficiario no constituye autorización ni puede transferir titularidad de pago.
- La misma deuda no puede liquidarse dos veces: bloqueo o reserva transaccional, una tentativa activa y claves idempotentes para cada operación. Dispositivos concurrentes reciben resultado de la operación existente, no crean un segundo cargo.
- Modelar estados durables y separados para pedido lógico, revisión, comanda, autorización, captura, entrega confirmada, cancelación, reembolso y liquidación en caja. Las transiciones entre Stripe y cocina no son atómicas: registrar intención antes de efectos externos, reconciliar respuesta/evento y compensar fallos sin recaptura ni doble despacho.
- Webhooks Stripe verificados criptográficamente y deduplicados por identificador de evento; nunca usar una notificación cliente como prueba de pago. Una captura incierta mantiene bloqueada la deuda también frente a caja hasta confirmación.
- Las incidencias y los eventos de mesa deben filtrarse por destinatario autorizado; notificar a afectados sin revelar pedidos o cuentas ajenas. Auditoría append-only de actor, motivo, objeto, importe y correlación.

## Eventos y resiliencia
- Sin polling periódico de API ni DB. Eventos después de commit, outbox duradero, SSE/WebSocket y recuperación puntual por cursor al reconectar; deduplicación de eventos y webhooks.
- Si restaurante pierde Internet, bloquear nuevos pedidos hasta restauración, preservar comandas aceptadas y no inventar estados de pago.
- Pausas y cierre de mesa prevalecen sobre notificaciones de reanudación: no anunciar permiso de pedido si ya no existe.

## Riesgos aceptados y asuntos aún técnicos
- QR fijo fotografiable: no garantiza presencia.
- Duración concreta de autorización por QR, retención de cursores, política de autorización Stripe y tiempos de recuperación requieren diseño técnico.
- Política de borradores/publicación automática, efectos de descuentos/cupones sobre coste cero y alcance exacto de pausa global siguen abiertos si no hay aprobación explícita en otras fuentes. El arbitraje por origen cocina/camarero sí está decidido; quedan por diseñar permisos, límites antifraude y resolución de casos concretos.
- Deben diseñarse identidades y permisos de comensal, camarero, cocina y gestor; estados durables de pedido/revisión/comanda/captura/devolución; exclusión concurrente, pruebas de doble pago y duplicación de despacho.

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
| P2-09 Modalidad en rondas | Caja persiste; pago inmediato por mesa; no inferir persistencia de «Pagar ahora» | Concretar solo modalidad no decidida |
| P2-10 Cancelación parcial en caja | Ajuste automático, devolución presencial registrada si ya cobrada | Diseño de interfaz y auditoría |
| P2-11 Borrador y publicación | Visibilidad de publicados fijada | Política de guardado/publicación pendiente |
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

**Estado:** contrato documental; no constituye evidencia de implementación, ejecución de pruebas, aprobación de PR ni despliegue.
