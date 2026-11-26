# Sabora — ROOT y titularidad administrativa única (decisión 2026-10-20)

## Contrato confirmado
- Una instalación Sabora = un restaurante = exactamente un ROOT; no es un ROOT global de CartaViva.
- Pueden existir múltiples ADMIN; como máximo uno posee la titularidad de escritura administrativa vigente.
- Los ADMIN restantes solo tienen lectura administrativa autorizada. Las operaciones de camarero y cocina mantienen sus permisos independientes.
- ROOT es la autoridad superior y puede asignar, retirar y recuperar titularidad. Ningún ADMIN puede alterar ROOT.

## Referencia Fleetia
Revisar en modo exclusivamente lectura el mecanismo de Fleetia: reasignación forzosa, solicitud, oferta, aceptación, rechazo, cancelación, auditoría y concurrencia. No copiar automáticamente código o contratos ni modificar recursos Fleetia.

## Invariantes de implementación
1. Comprobar identidad, rol, estado activo y titularidad durable en el servidor en cada mutación administrativa; ocultar botones no basta.
2. Transiciones atómicas, con protección contra dos escritores concurrentes y pruebas PostgreSQL 17 desechables.
3. Auditoría append-only de actor, operación, resultado y correlación, sin secretos.
4. ROOT único protegido frente a eliminación, suspensión, revocación y degradación; recuperación excepcional explícita.
5. Titularidad ADMIN no confiere privilegios ROOT; ADMIN sin titularidad conserva lectura permitida.
6. No autorizar escritura por un JWT obsoleto o estado local del navegador.

## Estado y siguiente puerta
Decisión de negocio confirmada. Las migraciones draft `20261020210000`–`20261020240000`, el workflow interno y los smokes PostgreSQL 17 implementan la titularidad ADMIN singleton, las cesiones, la revalidación durable, la auditoría append-only y la reasignación forzosa de ROOT hacia un ADMIN activo. ROOT no es elegible como titular y no puede usar el límite de escritura administrativa ordinaria. La existencia inicial de exactamente un ROOT, la identidad SQL mínima del writer, las notificaciones y las rutas administrativas siguen pendientes; por ello el runtime HTTP permanece cerrado. No ejecutar migraciones operativas, crear ROOT real, desplegar ni fusionar sin autorización.

## Referencia verificada en Fleetia (solo lectura)
Consultados `docs/04_ACCESS_SECURITY_CONTRACT.md`, `docs/01_PRODUCT_CONTRACT.md` y `packages/database/migrations/20261002170000_f1_manager_ownership_request_semantics.sql` de `jdlc86/GestionIntegral_Rutaa` en commit `7c7f3b50087685488185ce0bbc8b2150c62aaee7`. En Fleetia la titularidad es independiente del rol, la solicitud la decide el titular, la oferta la acepta el destinatario, la transferencia aceptada es atómica, hay auditoría/notificaciones y se bloquea concurrentemente con advisory lock y fila FOR UPDATE. **Diferencia intencionada:** Fleetia concede escritura de gestor a EMPLEADO_GESTOR y permite reasignación forzosa a ROOT/ADMIN; Sabora concede la titularidad exclusivamente a un ADMIN y reserva la reasignación forzosa a ROOT, según la decisión de este proyecto. No se modificó Fleetia.

## Límite único de autorización de escritura
El antiguo `admin-write-gate.mjs` se retiró: su consulta separada no podía impedir un TOCTOU entre autorización y mutación, y un precheck permisivo podía reutilizarse erróneamente como control final. El único límite admitido es `transactional-admin-write.mjs`, que bloquea singleton, revalida al ADMIN activo y ejecuta la mutación en la misma transacción. **No está conectado todavía a rutas HTTP ni a una identidad SQL operativa**. `staff-authorization.mjs` reconoce ROOT activo para el plano de gobierno, pero ROOT solo puede usar `ownership-workflow.mjs` para reasignar forzosamente a un ADMIN activo con motivo y auditoría.

## Adenda de estado técnico — integración candidata S34 (2026-11-10)

**Esta adenda actualiza exclusivamente el estado de implementación; no cambia el contrato normativo precedente.** Las frases anteriores «no está conectado todavía a rutas HTTP» y «la identidad SQL mínima está pendiente» describen una **etapa histórica**. El repositorio actual contiene una superficie **opt-in** y comprobada solo en PostgreSQL 17 desechable, no una activación en Supabase operativo:

- `apps/api/src/m2-restaurant-candidate.mjs` precomprueba `management.ownership.pool` con `assertOwnershipRuntimeIdentity`; si se configura, crea una transacción acotada por rol `sabora_ownership_runtime` y permite exclusivamente `OWNERSHIP_SQL`, y registra `registerOwnershipGovernanceHttp`. No se monta mediante `server.mjs` de health-only ni habilita operaciones sin configuración aprobada.
- `apps/api/src/ownership-governance-candidate.mjs` expone lectura y acciones por HTTP verificadas a través de `forRoles(['admin','root'])`, con identidad derivada de sesión verificada y capacidad JWT/HMAC acotada. El SQL `sabora.admin_ownership_action_candidate` revalida titularidad/rol y caducidad tras adquirir locks; los grants se limitan a la función exacta, no a mutación directa de tablas por el login de aplicación.
- Las migraciones candidatas `20261108150000`, `20261108180000` y `20261109010000` y la prueba integradora `scripts/ci/ownership-governance-postgres17.test.mjs` documentan la implementación y las denegaciones ante escritor obsoleto, la petición resuelta por titular y recuperación ROOT. La prueba conjunta de dos PWA, Fastify y PG17 superó Bootstrap en el SHA `d49ee05b103620ce30cfc976fa62182cc9d954df` ([workflow](https://github.com/jdlc86/CartaViva/actions/runs/42836528469)); la batería total del candidato fue **6/6 SUCCESS** sobre ese mismo SHA con base `main`.

**No confundir:** implementación candidata y CI aislada **no** equivalen a identidad operativa aprovisionada, usuarios reales, despliegue, revisión externa ni autorización de fusionar o de aplicar migraciones. ROOT sigue **sin poder** ser titular ADMIN ni hacer escrituras administrativas ordinarias; nada en esta adenda inventa excepciones. [Preflight de integración S34](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md).

## Adenda S52 — decisión de arranque inicial (26-11-2026)

El propietario aprobó el flujo excepcional de inicialización: una autorización inicial de un solo uso vincula una identidad confirmada y passkey verificada a ROOT único y activo; su consumo y la creación de ROOT deben ser atómicos y auditables. No existe alta ordinaria de ROOT ni reutilización de la autorización tras consumo.

Antes de existir el primer ADMIN titular, ROOT puede autorizar exclusivamente la incorporación excepcional del primer ADMIN, mediante el ciclo de invitación, aceptación, registro de passkey y activación, con revocación desde el primer registro durable. Una vez activo, ROOT le asigna la titularidad por el mecanismo de gobierno existente. La excepción queda inutilizada al completar el arranque. ROOT nunca se convierte en titular ni adquiere escritura administrativa ordinaria; no se alteran los permisos del ciclo posterior. La implementación debe impedir carreras, altas paralelas por la excepción, replay y activación sin credencial verificada; cualquier reanudación antes de finalizar conserva la auditoría y no permite reactivar un registro revocado.

Esta decisión se incorpora como candidata en el PR #92 hasta integración autorizada. No autoriza crear usuarios, aplicar SQL, desplegar ni configurar proveedores. El primer incremento técnico de ROOT se mantiene en SQL desechable; las decisiones de retención/recuperación y extensión de V2 se resuelven separadamente.


## Adenda S52 — recuperación excepcional de ROOT aprobada (26-11-2026)

El propietario aprueba expresamente la combinación de una segunda passkey como
respaldo ordinario y recuperación excepcional mediante **correo de seguridad
independiente + código secreto de recuperación custodiado fuera de ese correo**.
Esta decisión amplía el punto 4 de los invariantes, sin alterar el ROOT único,
la titularidad ADMIN ni el arranque inicial de un solo uso. La recuperación
conserva la identidad ROOT existente; no crea otro ROOT.

### Requisitos aprobados

- ROOT configura un correo de recuperación desde la PWA de gestión, tras
  autenticarse y volver a verificar una passkey. El cambio de correo exige
  verificación reciente, comprobación del nuevo destinatario y aviso al
  correo anterior. ADMIN y otros roles no pueden consultar o cambiar estos
  factores ni autorizar la recuperación de ROOT.
- Desde Seguridad de ROOT, el servidor genera un código de recuperación
  criptográficamente aleatorio de alta entropía, tras una nueva verificación
  por passkey. Se muestra una única vez para guardarlo fuera del correo
  (por ejemplo, impreso o en un gestor independiente). Solo se conserva
  un verificador criptográfico, nunca el código en claro ni en emails,
  logs, URLs, auditoría, copias de datos en claro o almacenamiento web.
  El código permanece estable hasta sustitución expresa o uso exitoso.
- Al configurar el correo (día 0) y cada N semanas se envía automáticamente
  un enlace rotatorio al buzón de seguridad. N es configurable; no se ha
  fijado un intervalo definitivo. Solo la generación vigente puede iniciar
  el flujo; la sustitución controlada invalida la anterior. Un fallo de
  envío no debe invalidar prematuramente la generación anterior dentro de
  su vigencia ni renovar indefinidamente una autorización; debe alertarse.
- El enlace periódico **no es una credencial de acceso**. Abrirlo, incluido
  el escaneo automático de correo, no consume factores ni concede sesión.
  Permite iniciar una recuperación y solicitar una comprobación reciente de
  posesión del correo mediante desafío de corta duración. Son necesarios
  dicha comprobación y el código independiente; ninguno basta por sí solo.
- Solo tras validar ambos factores se concede una autorización restringida,
  de corta duración y de un solo uso para registrar una nueva passkey de
  la misma identidad ROOT; no otorga acceso operativo, no permite invitar
  personal, reasignar titularidad ni eludir la verificación por passkey.
  El éxito exige registro verificable y nueva autenticación por passkey.
- Una recuperación exitosa invalida el código empleado, el enlace y las
  autorizaciones de recuperación anteriores, revoca credenciales y sesiones
  anteriores, emite un código nuevo para guardar una sola vez y notifica
  la recuperación. Los mecanismos de revocación deben ser efectivos también
  frente a sesiones y JWT aún no caducados. Ningún ADMIN adquiere autoridad
  sobre ROOT. La segunda passkey previamente registrada es el mecanismo
  ordinario, sin consumir este procedimiento excepcional.

### Condiciones técnicas de aceptación, no decisiones operativas

El diseño debe prevenir intentos concurrentes, replay, abuso de solicitudes,
enumeración, fuga de secretos, autorización caducada tras locks, modificación
del destinatario y bypass mediante Auth directo o sesión de correo.
Auditoría durable sin secretos; límites de intentos y vigencias acotadas.
Reutilizar el transporte durable de correo previsto para Sabora sin añadir
infraestructura de despliegue. La frontera entre registro/revocación en Auth
y la transacción SQL es distribuida: no asumir atomicidad de proveedor;
ante respuesta incierta, impedir sesión operativa hasta reconciliación
verificable, sin repetir acciones destructivas ni perder los factores por
un GET o un registro fallido. No reabrir genesis ni alterar las 103
migraciones originales.

El intervalo N, vigencias exactas, almacenamiento temporal de material de
correo, retención, parámetros antiabuso restantes y resolución de fallo total (pérdida
del correo y del código y de todas las passkeys) siguen pendientes de
concreción. No existe bypass por correo solo ni procedimiento de emergencia
inventado. La recuperación de roles no ROOT, la modalidad de generación y
entrega de las invitaciones ordinarias y el delta V2 son decisiones separadas.

La aprobación es de diseño para implementar en el PR #92. No acredita
implementación, prueba alojada, aceptación visual, aprovisionamiento,
modificación de usuarios, envío real, SQL operativo, integración en main
ni despliegue. No afecta a Fleetia.


### Adenda aprobada — protección contra fuerza bruta (26-11-2026)

El propietario aprueba expresamente los siguientes requisitos para la
recuperación excepcional de ROOT:

- Código generado mediante CSPRNG con 128 bits de entropía, representado
  en 26 caracteres Base32 canónicos (agrupación visual permitida).
  No admitir PIN, código elegido por el usuario ni reducción de entropía.
- Bloqueos progresivos por intentos fallidos acumulados: 3 intentos,
  15 minutos; 5 intentos, 1 hora; 10 intentos, 24 horas. Nunca bloqueo
  permanente automático.
- Contador y plazo de bloqueo durables en PostgreSQL, vinculados al ROOT
  existente, independientes de IP, navegador, sesión, desafío o generación
  del enlace. No reiniciar por pedir otro enlace, rotar, cambiar IP,
  reiniciar procesos o concurrencia. Comprobar y actualizar de forma
  atómica; no extender el bloqueo por solicitudes rechazadas durante el
  mismo. No registrar código, desafío ni verificadores en auditoría.
- Bloqueo exclusivamente del flujo excepcional: las passkeys vigentes
  siguen permitiendo autenticarse. Auditar los intentos y alertar sobre
  abuso, sin revelar factores ni facilitar enumeración. No crear un
  bypass por correo o ADMIN.

La semántica exacta del contador después del último umbral (sin bloqueo
permanente), la recuperación del contador mediante una passkey vigente,
el control de solicitudes de desafíos, la agrupación de alertas y los
plazos restantes se concretarán en el diseño técnico antes de activar.
No se reduce ninguna garantía del contrato anterior. La aceptación
integrada debe cubrir los umbrales y sus vencimientos, concurrencia,
persistencia, rotación y acceso ordinario durante bloqueo. Este acuerdo
no autoriza operaciones reales ni acredita implementación.
