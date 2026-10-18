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
- No exigir números de asiento: identificar comensal, comanda, mesa y personalizaciones. Sabora no gestiona inventario general, pero la disponibilidad limitada debe resolverse de forma atómica al confirmar pedidos concurrentes.
- Quejas de servicio se resuelven mediante «Llamar al camarero», sin formularios de reclamación al cliente.

## Cancelación y ajuste económico
- Cancelación solicitada por cliente sigue arbitraje configurado; una comanda recibida en cocina no puede modificarse unilateralmente desde PWA.
- **Origen cocina:** toda incidencia/cancelación iniciada por cocinero requiere expediente y arbitraje administrativo, incluso por falta de existencias. El arbitraje verifica hechos, unidades y cálculo; no autoriza negar el reintegro debido por servicio no prestado. Bloquear inmediatamente preparación imposible y avisar al cliente; solo unidades afectadas.
- **Origen camarero:** distinguir «Solicitado por el cliente» (arbitraje según configuración) de «Motivo del restaurante» (sin arbitraje; reintegro del importe afectado). Ambas rutas requieren permisos, motivo y auditoría.
- Cancelación iniciada por restaurante por causa propia: sin arbitraje de autorización; solo ítems afectados; ajustar cuenta automáticamente y comunicarlo al cliente. Si aún no se pagó en caja, reducir saldo exigible; si ya se pagó en efectivo, devolución presencial registrada y auditada, sin Stripe. Si se pagó digitalmente, reembolso al método y pagador originales, o liberación/reducción de autorización si no hubo captura.
- Cuando un tercero paga varias cuentas, guardar asignación por cuenta. Notificar al beneficiario tras éxito sin pedir aceptación. Una devolución posterior retorna al pagador original, ajustando la cuenta del beneficiario; idempotencia obligatoria.
- Disputa interpersonal sobre reparto no se arbitra en la app.

## Pagos
- Stripe es la pasarela digital elegida funcionalmente; capacidades concretas pendientes de validación técnica. Importes calculados en servidor en céntimos, nunca desde el cliente.
- En pago inmediato: autorización al confirmar y captura coordinada con registro durable y despacho a cocina. No preparar hasta confirmación de pago; si falla captura no despachar. Captura exitosa con despacho fallido exige reintento idempotente o compensación, nunca segunda captura. Acuse de cocina verificable.
- Estado de pago desconocido: bloquear liquidación de esa misma deuda por cualquier método, incluido efectivo, hasta éxito o fallo confirmados; reconciliar por eventos y consultas puntuales, no por suposición de timeout.
- «Pagar en caja» es intención reversible hasta registro de cobro efectivo. Tras liquidación en efectivo no se admite cobro digital de esa deuda. Alternativa efectivo ante fallo confirmado de Stripe solo si restaurante la habilita.
- Pagos, reembolsos, ajustes y sus causas son auditables, sin reescribir operaciones históricas. Cuentas de coste cero se cierran automáticamente cuando todas sus partidas quedan resueltas.

## Política de pago de mesa
- En una sesión que eligió «Pagar al terminar», mantener esa modalidad para rondas posteriores mientras la política de mesa no cambie; no volver a pedir elección en cada ronda. En la primera ronda con importe positivo de una sesión iniciada solo con pedidos gratuitos, ofrecer modalidades permitidas entonces.
- Si la mesa tiene «Exigir pago conforme se pide», no ofrecer cuenta abierta en nuevos pedidos positivos. La condición no se activa automáticamente por ser terraza; requiere configuración explícita por mesa.
- Para «Pagar ahora», no dar por aprobada una persistencia idéntica de modalidad en rondas posteriores; conservar como detalle funcional pendiente.

Cambios de política no alteran retroactivamente pedidos ni pagos existentes; la política vigente se aplica a nuevos pedidos. Registrar versión de política por pedido, impedir contradicciones entre dispositivos y presentar por separado saldos pendientes y pagados. Esta regla recoge la decisión ya tratada, sin reabrirla.

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

**Estado:** contrato documental; no constituye evidencia de implementación, ejecución de pruebas, aprobación de PR ni despliegue.
