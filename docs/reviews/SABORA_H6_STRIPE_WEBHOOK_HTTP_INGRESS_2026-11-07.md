# Sabora — puerta HTTP de webhooks Stripe firmados, ensayo H6 (07-11-2026)

**Estado al crear este informe: IMPLEMENTADO EN CÓDIGO, PRUEBA INTEGRAL EN EJECUCIÓN; NO-GO de F20/R03–R05 y de producción.** No se trata de una aceptación de Stripe sandbox real, de caja ni de despliegue. Este informe es seguimiento, nunca fuente de verdad frente a [NF](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [RF](../REQUISITOS_FUNCIONALES.md) y [DV](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md).

## 1. Identidad y perímetro

- **Repositorio:** `jdlc86/CartaViva`; [PR #49 Draft](https://github.com/jdlc86/CartaViva/pull/49), rama `feat/sabora-cv012-independent-pwas-20261106`.
- **SHA funcional:** [`478df342b1cce7547d1df705397b9c0430d1010b`](https://github.com/jdlc86/CartaViva/commit/478df342b1cce7547d1df705397b9c0430d1010b). La posterior actualización documental es un commit diferente sin pruebas propias por defecto.
- **Contrato:** la autenticidad HMAC, asociación exacta al intento económico, deduplicación durable, estados desconocidos, protección de caja, compensación y reembolso al pagador original son obligatorios (NF § Stripe y escenarios H6; matriz F20/R03–R05). Un evento firmado de un objeto ajeno no debe liquidar la deuda.
- **Aislamiento:** ningún acceso a Stripe real/test remoto, Supabase operativo, VPS, Fleetia ni otras infraestructuras. Sin merge, activación de servidor ordinario ni modificaciones SQL/migraciones.

## 2. Código implementado

1. **Transporte HTTP de prueba:** nuevo `apps/api/src/h6-stripe-webhook-http.mjs`, registro explícito de `POST /api/v1/provider/stripe/webhook`. Parser JSON de **cuerpo binario bruto encapsulado** solo en el plugin; no se reserializa JSON antes de validar firma. Límite 1 MiB, timestamp máximo 300 s, HMAC Stripe con igualdad temporal segura, `expectedLivemode:false`, secreto con formato `whsec_...`, sin JWT de cliente/personal porque la autenticación es la firma Stripe. Respuesta de éxito genérica `{received:true}`, sin revelar SQL, identificadores ni eventos. Firma/payload inválidos 400; conflicto de identidad 409; fallo duradero SQL 503 (no fingir recepción).
2. **Composición opt-in:** `apps/api/src/m2-restaurant-candidate.mjs` monta el receptor solo si recibe `h6.webhook.secret` explícito, usando `createH6ProviderRepository` transaccional bajo el rol SQL de proveedor. Sin ese parámetro no existe la ruta. El servidor `apps/api/src/server.mjs` sigue **`health-only`**.
3. **Bloqueo desechable:** `scripts/ci/disposable-h6-runtime-bootstrap.mjs` rechaza una configuración con webhook al arrancar el ensayo M3 con Stripe necesariamente inerte, para impedir que ese harness cambie de naturaleza.
4. **Eventos tipados:** `apps/api/src/h6-stripe-webhook.mjs` valida coherencia de `payment_intent.`→`pi_`, `charge.refunded`→`ch_`, y `refund.updated`→`re_` en el modo estricto. La SQL existente gestiona `refund.updated` como evidencia de reembolso con vínculo al cargo original; `charge.refunded` por sí solo **no** acredita cierre de un reembolso en la base de datos.

## 3. Cobertura incorporada; no confundir con Stripe real

- **E2E PG17 #49 existente** (`scripts/ci/table-change-root-postgres17.test.mjs`): para el mismo cambio A→B y pedido económico, la notificación de captura `payment_intent.succeeded` y la de reembolso `refund.updated` cruzan ahora el **HTTP Fastify firmado** hacia el rol proveedor PostgreSQL 17. Se ejercitan HMAC alterado, timestamp vencido, evento `livemode:true`, replay de ID, evento de fallo tardío y reembolso firmado que señala un cargo ajeno. Se comprueba persistencia y bloqueo de efectos duplicados en el ledger SQL. Los eventos se generan con secretos **ficticios** dentro del ensayo; Stripe no ha enviado tráfico.
- **Prueba aislada, justificada por seguridad:** `tests/h6-payments-events.test.mjs` protege la verificación exacta del cuerpo, el aislamiento del parser Fastify, el rechazo de `livemode:true` y la respuesta 503 ante caída de persistencia. Esta prueba no pretende sustituir la integración PostgreSQL/Fastify/Chromium.

**Corte de CI al documentar la implementación:** `478df342` tiene [management browser](https://github.com/jdlc86/CartaViva/actions/runs/42355586485), [client browser](https://github.com/jdlc86/CartaViva/actions/runs/42355586469) y [dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42355586470) SUCCESS; [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42355586488) y [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42355586487) **EN EJECUCIÓN**. No declarar 5/5 hasta observar las conclusiones del mismo SHA y la nueva ruta SQL.

## 4. Límites y siguiente puerta

**F20/R03–R05 siguen PARCIAL/BLOQUEADO.** Falta verificar una secuencia completa con **Stripe sandbox real** y credenciales `sk_test_`/`rk_test_` autorizadas, manejo de `client_secret` con interfaz de pago segura y aceptada, captura real diferida/reconciliación, webhook de proveedor auténtico con secreto de ensayo, reembolso a cargo original, reintentos de incertidumbre y carrera contra caja. Se requiere además diseño de caja aprobado y aceptación humana F28/R09. No inferir funcionamiento financiero real de un adaptador con transporte simulado.

**Control inmediato:** comprobar ambos workflows largos del SHA `478df342`; ante fallo, diagnosticar y corregir el escenario integral (sin suprimir guardas ni maquillar resultados). Si superan la puerta, actualizar tablero/matriz/continuidad con los cinco enlaces y evidencias exactas, clasificando **subalcance de ingress sandbox como candidato técnico** y conservando NO-GO de M1/H6 global y de producción.

No cerrar PR, no fusionar a `main`, no actuar sobre Fleetia, VPS compartido, Supabase operativo ni hacer llamadas de pago remoto sin autorización.
