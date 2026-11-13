# Sabora S38-15 — paquete de entrada a primera instalación y recuperación

**13-11-2026 · PAQUETE DE PREPARACIÓN COMPLETADO, EJECUCIÓN OPERATIVA NO AUTORIZADA / NO REALIZADA.** Este documento es **expediente de ejecución pendiente**, no normativa, no autorización de migración ni sustituto del [runbook S38 existente](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md). Cubre **solo** restaurante Sabora, proyecto Supabase `byhvmumqivmunkmomhup`; **ninguna** operación sobre Fleetia, otros proyectos ni recursos compartidos del VPS. La [norma CV-005 de autoridad DBA](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md), [puerta general de autorización](../SABORA_AUTHORIZATION_GATE.md) y [contrato de observabilidad y validación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) prevalecen.

## 1. Identidad congelada del candidato y pruebas reales

| Evidencia | Resultado y límite |
| --- | --- |
| Git funcional integrado | [Merge a main `5caad1f39a018e44cb831df62f889a05ce85368d`](https://github.com/jdlc86/CartaViva/commit/5caad1f39a018e44cb831df62f889a05ce85368d), ancestros #56/#57/#58; [corte documental previo `e6851401dce85eab5883cc35efc83ead5e0c283a`](https://github.com/jdlc86/CartaViva/commit/e6851401dce85eab5883cc35efc83ead5e0c283a). Nada autoriza instalar automáticamente `main` móvil; fijar SHA de instalación y reconstruir el manifiesto en esa ref |
| Migraciones | **99 archivos SQL** de `supabase/migrations` en árbol Git **`d26f1d4fc22acb13b6bda4927c424a74f5164c4a`**. Verificar igualdad de árbol **antes de instalar**, sin copiar/sobrescribir SQL. El SHA del árbol Git no sustituye al **SHA-256 individual** de cada migración |
| Registro auditable y checksums | `scripts/ci/migration-manifest.mjs` calcula **nombre, versión, SHA256 y bytes**; `scripts/ci/migration-audit.mjs` valida el registro de 99; `scripts/ci/postgres-migration-chain-smoke.sh` y `scripts/ci/supabase-nonsuperuser-migration-smoke.sh` prueban versión + ledger/transacción en **Docker descartable**. **Son arneses CI y rechazan destinos operativos**: no utilizarlos contra Supabase ni modificar sus guardias para hacerlo |
| CI final del código | Sobre `ee57c607`, 5/5 workflow SUCCESS: [PG17 no-superusuario](https://github.com/jdlc86/CartaViva/actions/runs/43424784850), [integración SQL/HTTP/Chromium](https://github.com/jdlc86/CartaViva/actions/runs/43424784656), [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/43424784968), [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/43424784844), [UI funcional](https://github.com/jdlc86/CartaViva/actions/runs/43424784893). Aceptación visual humana `skipped` |
| CI post-merge | [PG17 #43433947114](https://github.com/jdlc86/CartaViva/actions/runs/43433947114) y [Sabora CI/H6 #43433947054](https://github.com/jdlc86/CartaViva/actions/runs/43433947054), **2/2 completed/success** sobre el SHA de merge `5caad1f`. Los commits posteriores hasta el corte son **solo documentación**, no nueva CI ni aceptación operativa |
| Revisión independiente diferencial | PR #57 y #58 contienen recomendaciones `APPROVE` publicadas como `COMMENTED` por cuenta autora; cero hallazgos P0–P3 residuales declarados en ese alcance. **No son `APPROVED` formal GitHub** |

**Comprobación de cierre del paquete:** el próximo ejecutor deberá tomar exactamente el SHA firmado para el procedimiento, generar con Node `node scripts/ci/migration-manifest.mjs` desde una copia **local, limpia y fijada a ese SHA** y contrastar las **99** entradas con `migration-audit.mjs` y `supabase/migrations`. Guardar hash de manifiesto, no datos ni secretos. Esta preparación no ejecutó la generación local en un checkout; el árbol y las 99 entradas se acreditaron por GitHub y CI previos. Si cambia el árbol, STOP y nueva revisión del delta.

## 2. Estado REAL del proveedor antes de escritura

[Preflight de solo lectura del proyecto exacto](SABORA_S38_SUPABASE_PG17_11_READONLY_PREFLIGHT_2026-11-13.md): `ACTIVE_HEALTHY`, PostgreSQL **17.11.0.003**, `pgcrypto 1.3`, HMAC SHA-256 de datos públicos exitoso. La cuenta administrativa `postgres` es `CREATEROLE/NOSUPERUSER/BYPASSRLS` y **no** es miembro de `supabase_admin`. Actualmente **no existe** esquema `sabora`, `sabora_migration_meta`, LOGIN Sabora ni ledger. Las categorías de breaking change 17.11 consultables en catálogos no muestran objetos existentes afectados, **pero los hooks/DDL de `supautils` no se ensayaron contra el proveedor**. `ssl=on` del servidor no acredita verificación de CA ni enforcement para cada cliente.

**Riesgo central y STOP de autoridad:** la excepción normativa Opción A admite **solo** el grant automático del instalador DBA de `supabase_admin` `ADMIN TRUE/SET FALSE/INHERIT FALSE` para owner/capability `NOLOGIN`. El DBA puede autoconcesionarse `SET TRUE`; la frontera de confianza exige credencial bajo custodia separada de runtime. Los `GRANT SET/INHERIT/CREATE` transitorios de una migración se retiran **antes del COMMIT** y se verifican tras cada versión. Runtime→owner, privileges superuser o SQL directo no previsto: STOP.

## 3. Inventario normado por código: **17 slots mínimos + cinco opt-in, dos notifiers**

**Fuente exacta:** `apps/api/src/m2-runtime-identity-inventory.mjs` y `apps/api/src/operational-activation-manifest.mjs` (`describeOperationalSqlContract`). Cada fila refiere **una capacidad y un pool**; no son variables de entorno nuevas, ni logins creados, ni autorizaciones a inventar usuarios. El nombre real de LOGIN y la referencia de fichero secreto se fijan según la norma y el comprobador, deben ser distintos por pool, y **no están acreditados actualmente**.

| Nº | Pool (clave exacta) | Capacidad `NOLOGIN` | Uso previsto | Perfil | Estado de aprovisionamiento |
| ---: | --- | --- | --- | --- | --- |
| 1 | `customer.catalogReaderPool` | `sabora_catalog_reader` | `catalog_read` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 2 | `customer.registrationPool` | `sabora_customer_registration_runtime` | `customer_registration` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 3 | `customer.sessionPool` | `sabora_customer_session_runtime` | `customer_session` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 4 | `customer.flowPool` | `sabora_customer_flow_runtime` | `customer_flow` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 5 | `tableChange.customerPool` | `sabora_f12_customer_runtime` | `table_change_customer` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 6 | `tableChange.operationsPool` | `sabora_f12_operations_runtime` | `table_change_staff` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 7 | `tableChange.confirmationPool` | `sabora_b3_confirmation_runtime` | `order_confirmation` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 8 | `tableChange.h6ReadPool` | `sabora_b3_h6_reader_runtime` | `customer_economic_read` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 9 | `tableChange.pendingPool` | `sabora_f12_pending_reader_runtime` | `pending_table_change_read` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 10 | `staff.pool` | `sabora_staff_reader` | `staff_membership_read` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 11 | `h4.operationsPool` | `sabora_b3_h4_transition_runtime` | `kitchen_waiter_operations` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 12 | `h6.providerPool` | `sabora_h6_provider_runtime` | `payment_provider_ledger` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 13 | `h6.operationsPool` | `sabora_h6_operations_runtime` | `h6_staff_operations` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 14 | `h6.closePool` | `sabora_h6_account_close_runtime` | `account_close` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 15 | `h6.eventPool` | `sabora_m2_customer_event_runtime` | `customer_event_read` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 16 | `management.tablesPool` | `sabora_m3_tables_runtime` | `management_tables` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 17 | `management.catalogPool` | `sabora_m3_catalog_runtime` | `management_catalog_finance` | Mínimo | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 18 | `management.ownership.pool` | `sabora_ownership_runtime` | `admin_ownership_governance` | Opt-in | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 19 | `management.communications.adminPool` | `sabora_m5_comms_admin_runtime` | `communications_admin` | Opt-in | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 20 | `management.communications.publicPool` | `sabora_m5_comms_public_runtime` | `communications_public` | Opt-in | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 21 | `waiterCalls.customerPool` | `sabora_waiter_call_customer_runtime` | `waiter_call_customer` | Opt-in | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |
| 22 | `waiterCalls.staffPool` | `sabora_waiter_call_staff_runtime` | `waiter_call_staff` | Opt-in | LOGIN físico, referencia de secreto y custodia: **NO ACREDITADOS** |

**Notificadores obligatorios:** `tableChange.notificationPool` utiliza la credencial del slot `tableChange.operationsPool` con **conexión dedicada LISTEN**; `h6.notifierPool` utiliza `h6.operationsPool`, también conexión LISTEN dedicada. No representan dos roles/grants genéricos adicionales. El manifiesto exige además tres referencias de secretos de firma separadas `capabilitySecretRef`, `customerSecretRef`, `qrSecretRef`, `keyId` válido, issuer Auth HTTPS real `/auth/v1`, orígenes HTTPS distintos de cliente/gestión y destinos TLS exactamente iguales entre manifiesto y política gateway. Ninguna clave debe guardarse en Git/Actions/PWA ni exponerse aquí.

**Opt-in:** `management.ownership.pool`, los dos slots `management.communications.*` y los dos `waiterCalls.*` solo si se activan las funcionalidades correspondientes. Conjunto mínimo: 15 `CORE` + 2 `MANAGEMENT` = **17**; total con tres opt-in habilitados **22**. La existencia de tres contraseñas preparadas históricamente para lectores no acredita un total de 17 credenciales ni su validación operativa.

## 4. Recuperación real: política y demostración antes de tocar SQL

[Runbook P2 de recuperación](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md) documenta un **plan Free histórico** para el proyecto, por lo que **no presupone** backups automáticos ni PITR. **El plan contratado actual y el catálogo efectivo de backups/retención NO se han comprobado en este hito** con una consulta de facturación/Backups. [La documentación oficial de Supabase](https://supabase.com/docs/guides/platform/backups) indica que backups diarios automáticos corresponden a planes Pro/Team/Enterprise y que la opción Free requiere exportación propia; los backups físicos pueden excluir contraseñas de roles y cualquier backup DB excluye los bytes de Supabase Storage.

**Procedimiento exigible y evidencia pendiente:**
1. Antes de intervenir, custodio DBA y seguridad confirman plan efectivo, panel **Database > Backups**, disponibilidad o no de PITR, ventana/retención y un **destino externo exclusivo Sabora** (no repositorio, Actions ni VPS compartido). Si la opción es dump lógico manual, documentar su alcance y no confundirla con PITR.
2. Capturar preestado de esquema, roles/membresías incluyendo **grantor/admin/set/inherit**, owners, ACL, RLS, funciones, extensiones, referencias a Storage, versión PostgreSQL y manifiesto. La base Sabora está vacía antes de instalar; **un dump de esquema Sabora inexistente no demuestra recuperación posterior de un bootstrap que crea roles/objetos**. El ensayo debe cubrir cómo deshacer/reconstruir ese estado sin alterar schemas Supabase del proveedor.
3. Para cada artefacto con datos, usar cifrado autenticado con clave por canal/custodio independiente, checksum y custodia aprobada. El código `scripts/ci/encrypted-backup-artifact.mjs` implementa AES-256-GCM con manifiesto en CI; **no** acredita que exista un backup real ni su custodio. No reutilizar claves de fixture.
4. Restaurar la estructura y datos Sabora en un destino PostgreSQL 17 **aislado y autorizado**, con restablecimiento de contraseñas por otro canal; verificar **roles, grantor, todos los flags de membresía, grants de funciones, FORCE RLS, HMAC, ledger, checksums, capacidad negativa de runtime y avisos**. Ensayar también artefacto corrupto y reanudación después de una versión confirmada. **No** tomar el PASS del restore de Docker como prueba de restore Supabase gestionado: la concesión `supabase_admin` podría necesitar tratamiento específico aprobado.
5. Medir y aprobar **RTO/RPO**, intervalo de copia, retención, ventana y responsable del STOP. Actualmente **NO DETERMINADOS**, no rellenarlos con el presupuesto artificial de los tests CI. La restauración para un fallo al instalar 99 migraciones debe tener un camino seguro y verificable; **no hay rollback destructivo genérico**.

**Criterio de parada:** si el backup/restauración es imposible, carece de custodio, compromete componentes de Supabase o requiere intervención de Fleetia/VPS, **NO-GO de primera instalación**, aunque hoy no haya usuarios.

## 5. Conectividad y operación aislada: paquete de configuración pendiente

- **DDL/migración:** endpoint **directo** confirmado desde el panel del proveedor si la conectividad IPv6 o suplemento IPv4 lo permite; no inventar host/usuario ni convertir el pooler de transacciones en el ejecutor de DDL. Para runtime persistente, evaluar pooler de sesión aprobado si el host solo tiene IPv4. El código operacional exige puerto SQL **5432** y gateway interno con mapeo/sni verificado.
- **TLS/identidad:** obtener **CA real** del proyecto y validar cadena+hostname, issuer Auth y JWKS. `sslmode=require` **no** equivale a `verify-full`. [Guía SSL oficial](https://supabase.com/docs/guides/platform/ssl-enforcement) advierte que cambiar enforcement reinicia PostgreSQL: **nunca hacerlo de forma implícita**. El cliente y gateway deben verificar identidades reales.
- **Red y aislamiento:** el [Compose operativo candidato](../../deploy/compose.sabora-operational.yml) exige `SABORA_EGRESS_ALLOWLIST_NETWORK` **preaprovisionada y filtrada exteriormente**, política de destinos compartida por API y gateway, **sin red de salida abierta creada por Compose**. Probar firewall real con tráfico autorizado y destino prohibido solo cuando exista autorización VPS **separada**; no reutilizar redes Fleetia.
- **Alertas y dos PWA:** responsables, receptor, umbrales, prueba de recepción, dominios, HTTPS, pruebas QR→pedido→cocina/sala→cuenta y capturas de diseño aprobado permanecen no validados. `/health` correcto NO implica `/ready=200`.
- **No hay provisión de secretos acreditada aquí:** la existencia de rutas/config en el código no representa ficheros desplegados, caducidad, rotación o secreto bajo custodia. Los 16 campos `activationEvidence` son **declaraciones respaldadas por evidencia**, nunca forzar `true` para iniciar.

## 6. Matriz de GO/STOP y responsables pendientes — no falsificar firmas

| Puerta de entrada a instalación integral | Estado real | Prueba material necesaria / custodio |
| --- | --- | --- |
| Código Git y pruebas completas | **PASS laboratorio** | SHA `5caad1f`; comparación final antes de tocar DDL, 99 SQL + manifiesto con SHA256 reales |
| Compatibilidad PG17.11, `pgcrypto` básica | **PASS lectura limitada** | Preflight [13-11](SABORA_S38_SUPABASE_PG17_11_READONLY_PREFLIGHT_2026-11-13.md) |
| `supautils`, ownership/ACL/ledger en proveedor | **STOP** | DBA Sabora + seguridad aprueban procedimiento para **la instalación íntegra**, verifican efectos reales en cada COMMIT; no usar un SQL canario de múltiples parches |
| Backup cifrado/restauración del estado inicial y postinstalación | **STOP** | DBA + custodio de copia, destino independiente y ensayo documentado; RTO/RPO/retención aprobados |
| Identidades SQL y HMAC/JWKS | **STOP** | 17 slots mínimos, 2 LISTEN, login exacto por pool, custodio y canal de ficheros; prohibido DBA/runtime compartido |
| CA/host/puerto y conectividad | **STOP** | Endpoint real de la consola, SSL verify-full equivalente, DNS IPv4/IPv6, políticas y certificado |
| Alertas y firewall/VPS | **STOP separado** | Responsable de red y observabilidad; demostrar exclusividad Sabora antes de cualquier deploy |
| Producto, visual y pagos | **STOP aceptación plena** | Dos PWA en dispositivos, revisión humana, Stripe sandbox real y matriz F/R; no fingir aceptación de variantes no activadas |

## 7. Plan de intervención cuando existan pruebas y autorizaciones (no ejecutado)

**Puerta A — release y recuperación:** fijar SHA + manifiesto 99 SHA256, identidad DBA/alcance, modo/restauración del backup y quién revoca; registrar puntos de retorno, tiempo y abortos. Sin respaldo restaurable, **STOP**.

**Puerta B — SQL Sabora:** autorización específica para conexión e instalación SQL (no equivalente a autorización Git). Confirmar preestado limpio, versión exacta y `pgcrypto`; aplicar **en un solo hito controlado** las 99 versiones reales con ledger SHA256 **atómico y comprobación por COMMIT**, `ADMIN TRUE/SET FALSE/INHERIT FALSE` solo DBA y `NOLOGIN` owners. Comprobar políticas, owners, ACL/roles, HMAC, 99/99 ledger, y denegaciones con principales físicos restringidos. Si un cambio ya hizo COMMIT, **no** reintentar ciegamente ni deshacer por borrado de ledger. Mantener rutas cerradas ante STOP.

**Puerta C — secretos, runtime y VPS:** con autorización independiente, instalar credenciales y manifiesto válidos, gateway con firewall externo exclusivo Sabora y Compose acotado; verificar `/ready` y fallos cerrados, alertas recibidas, QR/cliente/gestión y semántica H6 real. Mantener Fleetia y servicios ajenos fuera de toda operación.

**Puerta D — aceptación del piloto:** capturas reales contrastadas con diseño aprobado y 38 F/R; Stripe remoto, reservas, Excel, Gemini y directorio solo si tienen decisión normativa, proveedor y autorización. Emitir GO/NO-GO por alcance explícito, no un GO general de Sabora por la ausencia de usuarios.

**Corte de este paquete:** preparación documental/contratos **COMPLETADA**; **no existen todavía** backup real verificado, roles login/secretos operativos, DNS/CA comprobados, ensayo `supautils` con la cadena ni autorizaciones SQL/VPS. **NO-GO instalación/despliegue.** Sin nuevos PR, sin red, DDL, backups ni conexiones operativas de escritura en este hito.
