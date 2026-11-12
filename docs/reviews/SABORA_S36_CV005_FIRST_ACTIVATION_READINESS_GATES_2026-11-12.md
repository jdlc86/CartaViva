# Sabora — S36 · Puerta integral de primera activación CV-005 / CV-010 / CV-011 (2026-11-12)

**Tipo:** expediente técnico y evidencia de preparación, **no normativa, no autorización y no comprobación del VPS ni del Supabase operativo**. Fuentes de verdad: [método normativo del laboratorio y aceptación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [aislamiento](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [hoja de ruta](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [autorización](../SABORA_AUTHORIZATION_GATE.md), [contrato de permisos](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md) y [seguridad de credenciales candidata](../security/SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md).

## 1. Hallazgo y corrección del límite de salud

**Antes de la corrección:** `apps/api/src/server.mjs` respondía HTTP **200** a `/ready` en modo `health-only`, aun cuando no contenía catálogo, autentificación, pedidos, pagos, avisos o pools SQL. Esto permitía que una comprobación superficial confundiese un proceso vivo con un restaurante realmente preparado.

**En el candidato del PR #56:** `/health` conserva 200; `/ready` en `health-only` responde siempre **503** con `{status:'unavailable',service:'sabora-api',mode:'health-only'}`. El observador emite clase de respuesta y correlación sin credenciales ni datos privados. El `Dockerfile` y el `healthcheck` de Compose comprueban exclusivamente **/health** para liveness; no se autorizan nuevas rutas operativas. Se amplió `production-config-secrets-gate.mjs` para detectar regresión de la marca 503, con prueba mutacional y prueba de API Fastify real.

**En el laboratorio H3–H6/M3:** la composición opt-in de `m2-restaurant-candidate.mjs` tiene su propia `/ready` con **preflight SQL vivo**, falla 503 ante indisponibilidad/pérdida de notificador, y emite diagnósticos categorizados. Estos resultados son del laboratorio **PG17 desechable**, no una API operativa de Supabase.

## 2. Lista de condiciones de primera activación

El módulo candidato `apps/api/src/pilot-activation-gate.mjs` mantiene una **lista cerrada de 16 declaraciones**. Una respuesta positiva es `self_reported_evidence_complete_unverified`: **nunca** confiere permiso para abrir HTTP, aplicar migraciones, instalar secretos o desplegar. Las declaraciones son:

| Control | Evidencia exigida antes de autorizar |
| --- | --- |
| `normativeConformance` | Mapa de requisitos y flujos aprobados, sin reinterpretaciones |
| `customerFlow` / `staffOperations` | QR→identidad→catálogo→pedido→cocina/sala sobre mismo SHA |
| `twoPwasValidated` | PWA cliente y gestión, autenticación, accesibilidad y controles visuales |
| `migrationChecksumsVerified` | 99 migraciones auditadas del SHA final, ledger y reanudación sin drift |
| `sqlLeastPrivilege` | Identidades físicas mínimas, FORCE RLS y positivos/negativos reales |
| `secretsProvisioned` | Cada valor en su proceso exclusivo y política de rotación |
| `jwtHmacIdentityVerified` | JWT/JWKS, keyring/capacidades firmadas y revocación efectiva |
| `tlsAndEgressVerified` | Salida de red **solo Sabora** a Supabase/Auth y proveedores aprobados, TLS real |
| `vpsIsolationVerified` | Compose, dominios, puertos, red, CPU/RAM, logs, recursos y ausencia de dependencia de otro proyecto |
| `backupRestoreVerified` | Copia/restauración real y proceso de reparación específico de Sabora |
| `observabilityReady` / `alertDeliveryVerified` | Correlación real, incidentes, métricas y recepción efectiva de alarmas |
| `rollbackVerified` | Reversión/stop **exclusiva Sabora** comprobada y punto de retorno |
| `operationalBootstrapVerified` | Ensamble H3–H6/M3 real, 17+ logins auditados, dos PWA y `/ready` operativa |
| `deploymentAuthorized` | Permiso **específico y separado** de cambios en Supabase y despliegue VPS |

Son **declaraciones de control interno**, no pruebas firmadas ni sustitutos de evidencias externas. Los valores booleanos que pasa un llamador **no se aceptan como autorización operativa**. La única autorización de cambios sigue siendo la explícita exigida por los contratos normativos.

## 3. Situación verificada al iniciar esta puerta

- Proyecto Supabase **Sabora únicamente** `byhvmumqivmunkmomhup`: último preflight read-only S36-6/S36-7 devolvió `ACTIVE_HEALTHY`, PostgreSQL **17.11** y `pgcrypto 1.3`; no existían el esquema `sabora`, el ledger de migraciones o los tres LOGIN `sabora_staff_reader_login`, `sabora_catalog_login`, `sabora_customer_session_login`. **No se presupone permanencia del estado sin nueva consulta.**
- Tres contraseñas de esos logins: **guardadas exclusivamente por el propietario**; no asignadas, copiadas ni transmitidas. Los módulos integrales H3–H6/M3 requieren **más identidades SQL** que esas tres. Su esquema de inyección productiva no ha sido aprobado.
- `main`: **98** migraciones frente a **99** en PR #56, con `20261110232000_sabora_m3_effective_management_permissions_candidate.sql` aún sin integrar en `main`. El `postgres` de Supabase real dispone de atributo CREATEROLE, pero **no es superusuario**; el resultado de PG17 CI con superusuario **no prueba** compatibilidad en el proveedor.
- API ordinaria: solo `health-only`; el Compose `deploy/compose.sabora.yml` conserva `sabora_private internal:true` y **no permite dar por probada la salida** hacia Supabase y Auth. No instalar una configuración egress por suposición ni conectarla a redes ajenas.
- Laboratorio: CI PG17 desechable, driver Node, JWT/HMAC, Fastify, cocina/sala, cliente/gestión, Chromium y recuperación P2/P3. Es permanente, reproducible y **no** empleará datos/secretos operativos.

## 4. Secuencia de cierre de hito completo antes de primera prueba real

1. **Integración aprobada y SHA fijo:** revisar #56 de nuevo, decidir autorización **específica del merge**, validar CI post-merge e inventario/checksums de las 99 migraciones del SHA realmente integrado.
2. **Plan SQL reversible/recuperable:** compatibilidad PG17.11 Supabase sin superuser, migraciones ordenadas, ledger consistente, roles NOLOGIN/LOGIN segregados, FORCE RLS, negativos, snapshots gestionados, copia/restauración ensayada, condiciones STOP.
3. **Bootstrap CV-005 con secretos:** inventario **completo** de identidades de los flujos activados, HMAC/JWT/JWKS, identidad/propietario de cada secreto, CA/TLS y fuente de inyección, sin usar `postgres` o `service_role` como runtime. Los secretos preparados se provisionan solo cuando existan logins correctos y canal aprobado.
4. **Conectividad y aislamiento:** resolver egress DNS/TLS Sabora-only sin redes/volúmenes ajenos; proxy HTTPS y orígenes correctos, dos PWA, disponibilidad real de PostgreSQL y eventos, alertas externas probadas, sin reinicios globales.
5. **Piloto autorizado de restaurante único:** datos ficticios con trazas seguras y escenarios QR→carta/anuncios→pedido→cocina→«Voy a recoger»→cuenta/cambio de mesa, reversión/backup, pantallas e instalación PWA en dispositivos reales. Stripe sandbox remoto y demás variantes pendientes **no** se declaran aceptadas si no se prueban.

**No ejecutado en este bloque:** migraciones de Supabase, creación de roles ni contraseñas, gestión del VPS, despliegue, solicitud de redes compartidas, activación de Stripe real o recursos Fleetia. Todo procedimiento de laboratorio debe seguir usando el runner aislado de GitHub Actions.

## 5. Evidencia que habilita a avanzar de etapa

- **Implementado en PR #56:** señal falsa corregida en `server.mjs`, puerta 16 controles en `pilot-activation-gate.mjs`, guard de configuración fail-closed y tests de HTTP y mutación; se conserva integración H3–H6/M3 ya aprobada en el laboratorio.
- **CI:** se exige el resultado **6/6** del SHA final que contenga estos cambios, sin reutilizar `ac0d22fd` para declarar aprobado un commit posterior.
- **Validación real:** no existe todavía. Nadie debe confundir `/health` en 200 o una CI verde con restaurante desplegado, permisos correctos en Supabase, alertas recepcionadas, backup restaurado o aceptación humana.
- **Decisión:** la preparación puede proseguir **sin permiso de escritura en la infraestructura operativa**. Para pasar a migración/despliegue hay una puerta de aprobación independiente y explícita; no la sustituye el mensaje genérico «continúa».


## 6. Inventario determinista de identidades SQL que exige el ensamblaje

Se incorporó el contrato **reutilizable por el arranque opt-in y por GitHub Actions** `apps/api/src/m2-runtime-identity-inventory.mjs`. Su función `validateM2RuntimeSqlIdentities(options)` coteja todas las parejas `pool/expectedLogin` contra la estructura de dependencia inyectada y rechaza **antes de hacer queries o registrar rutas** las identidades duplicadas, pools reutilizados, logins inválidos y falta de los dos pools de notificación. Devuelve **únicamente rutas lógicas y contadores**, nunca contraseñas, usernames, URLs de conexión ni CA. No abre conexiones, no crea roles ni lee variables de entorno.

| Bloque de capacidad | Pool y expectedLogin exactos (propiedades del contrato de código) | Número |
| --- | --- | ---: |
| Cliente y carta | `customer.catalogReaderPool / expectedCatalogLogin`; `customer.registrationPool / expectedRegistrationLogin`; `customer.sessionPool / expectedSessionLogin`; `customer.flowPool / expectedFlowLogin` | 4 |
| Cambio de mesa | `tableChange.customerPool / expectedCustomerLogin`; `operationsPool / expectedOperationsLogin`; `confirmationPool / expectedConfirmationLogin`; `h6ReadPool / expectedH6ReadLogin`; `pendingPool / expectedPendingLogin` | 5 |
| Identidad del personal | `staff.pool / expectedLogin` | 1 |
| Cocina/sala H4 | `h4.operationsPool / expectedOperationsLogin` | 1 |
| H6 economía y eventos | `h6.providerPool / expectedProviderLogin`; `operationsPool / expectedOperationsLogin`; `closePool / expectedCloseLogin`; `eventPool / expectedEventLogin` | 4 |
| **Subtotal base H3–H6** | Todas las capacidades anteriores | **15** |
| Gestión M3 mínima | `management.tablesPool / expectedTablesLogin`; `catalogPool / expectedCatalogLogin` | **+2 = 17** |
| Gobierno titularidad | `management.ownership.pool / expectedLogin` | +1 |
| Comunicaciones M5 | `management.communications.adminPool / expectedAdminLogin`; `publicPool / expectedPublicLogin` | +2 |
| Llamar camarero | `waiterCalls.customerPool / expectedCustomerLogin`; `staffPool / expectedStaffLogin` | +2 |
| **Configuración completa opcional** | M3 + gobierno + M5 + llamadas al camarero | **22** |
| Notificadores dedicados | `tableChange.notificationPool` y `h6.notifierPool` | **2 pools adicionales**, sin `expectedLogin` independiente en el contrato actual; verificar sus permisos/identidades reales en la puerta operativa |

**Advertencia de interpretación:** los nombres de las *propiedades* de este cuadro son los ya implementados, **no** nombres nuevos de variables de entorno ni SQL `LOGIN` que se deban crear manualmente. La relación final entre cada conexión, rol SQL `NOLOGIN`, login físico, secreto, emisor y política TLS/rotación debe derivarse de las migraciones normativas y de los checks reales del proveedor **antes de provisionar**. No basta un `postgres` común ni tres contraseñas para habilitar 17–22 capacidades.

**Evidencia automatizada:** `tests/m2-runtime-identity-inventory.test.mjs` comprueba 15/17/22, unicidad/negativas, obligatoriedad de los dos notificadores y no divulgación de DSN; `scripts/ci/disposable-h6-runtime-bootstrap.mjs` ejerce la misma función **dentro de la aceptación integrada real PG17 y Fastify**, además de todas las comprobaciones SQL de privilegios ya existentes. La suite debe completarse verde en el SHA que contenga estos cambios. Su resultado jamás equivale a logins operativos instalados ni a la aprobación de un contrato de inyección de secretos.

[Continuidad S36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) · [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [Preflight Supabase](SABORA_S36_SUPABASE_DATABASE_ACTIVATION_PREFLIGHT_2026-11-11.md).
