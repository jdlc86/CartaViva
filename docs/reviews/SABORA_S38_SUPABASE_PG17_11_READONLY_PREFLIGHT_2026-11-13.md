# Sabora / CartaViva — S38: preflight REAL de Supabase PG17.11, solo lectura

**Fecha:** 2026-11-13. **Estatus:** PREPARACIÓN REAL / LECTURA COMPLETADA; **compatibilidad de DDL de las 99 migraciones NO VALIDADA; NO-GO operativo**. Acta de evidencia, **no normativa** ni autorización de migración, backup externo, creación de roles, secretos o despliegue. Repositorio exclusivo `jdlc86/CartaViva`; restaurante único Sabora; cero acciones sobre Fleetia y otros proyectos.

## Contexto fijo y prueba de laboratorio

- Main: [merge CV005+B2 `5caad1f39a018e44cb831df62f889a05ce85368d`](https://github.com/jdlc86/CartaViva/commit/5caad1f39a018e44cb831df62f889a05ce85368d) y acta [S38 de integración](SABORA_S38_CV005_B2_MAIN_INTEGRATION_2026-11-13.md); subárbol `supabase/migrations` = **`d26f1d4fc22acb13b6bda4927c424a74f5164c4a`**, 99 archivos SQL exactamente.
- En el SHA integrado de código/normas `ee57c607` terminaron 5/5 Actions del laboratorio; la revisión diferencial Codex terminó **`COMMENTED` con recomendación técnica `APPROVE`**, sin aprobación formal independiente de GitHub ni aceptación visual.
- **Post-merge en main (mismo SHA de merge):** [PG17 NOSUPERUSER #43433947114](https://github.com/jdlc86/CartaViva/actions/runs/43433947114) **completed/success**; [Sabora CI/H6 #43433947054](https://github.com/jdlc86/CartaViva/actions/runs/43433947054) **completed/success**. No se disparó despliegue ni migración remota.
- Fuente de obligaciones: [opción A CV-005](../security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [método de validación y recuperación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) y [runbook S38 de primera activación](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md). Los handoffs aportan contexto, no modifican contratos.

## 1. Evidencia obtenida del **único** Supabase del restaurante

Conector identificado **RESTAURANTE**, `project_id=byhvmumqivmunkmomhup`. Inspección de metadatos y consultas `SELECT` al proyecto **sin DDL, DML, transacciones de escritura, alta de roles, configuración ni claves**:

| Control verificado | Resultado observado el 13-11-2026 | Interpretación limitada |
| --- | --- | --- |
| Estado y versión del proyecto | `restaurante`, `ACTIVE_HEALTHY`, región `eu-central-1`, versión administrada **17.11.0.003** / PostgreSQL `17.11` | Proyecto conectado y saludable, **no** instalación |
| Identidad conectada | `current_user=postgres`, `LOGIN=true`, `CREATEROLE=true`, `NOSUPERUSER`, `BYPASSRLS=true` | Apta **en principio** para evaluar opción A; nunca identidad runtime de Sabora |
| Administrador del proveedor | `supabase_admin` existe y es `SUPERUSER` interno; `pg_has_role('postgres','supabase_admin','SET')=false` y `MEMBER=false` | No asumir acceso a ese superusuario ni una elevación no autorizada |
| Inicio limpio Sabora | 0 esquemas `sabora/sabora_migration_meta`, 0 roles `sabora_*`, 0 relaciones Sabora; ledger Sabora inexistente; migrations del proveedor `[]` | Las **99 migraciones aún NO se instalaron**; el bootstrap de owner y membresía no se ha probado en este proyecto |
| Extensión criptográfica | `extensions.pgcrypto` **1.3**, instalada. `extensions.hmac(...,'sha256')` sobre cadenas públicas de prueba devolvió digest válido | **Primitiva HMAC presente**, sin validar ninguna clave operativa ni identidad HTTP↔SQL |
| Disponibilidad de TLS | Servidor PostgreSQL `ssl=on` | **No demuestra** obligatoriedad de TLS para clientes ni validación de CA/hostname |
| Avisos proveedor | `get_advisors(health)`: 0; `get_advisors(security)`: 0 | No sustituye audit de 99 SQL posteriores ni pruebas de red/backup |

`supautils` **no debe darse por ausente** por no aparecer como fila en `pg_extension`; la documentación oficial explica su integración gestionada. Ni la configuración `shared_preload_libraries` ni las listas de extensiones garantizan que las 99 operaciones SQL pasen los hooks del proveedor. La membresía automática DBA definida en opción A **no es observable todavía para un rol Sabora que aún no existe**.

## 2. Postgres 17.11: cambios reales y aplicabilidad al estado Sabora

[Changelog oficial Supabase de 25-09-2026, PostgreSQL 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) enumera cuatro riesgos **condicionados al uso**; no es una incompatibilidad general de PostgreSQL 17.11:

| Riesgo de actualización | Consulta de metadatos en el proyecto | Conclusión actual |
| --- | --- | --- |
| Índices `ltree` y colaciones UTF8/ICU | `UTF8`, proveedor de colación `i` (ICU); **0 índices `ltree`** | No hay índice `ltree` existente que reindexar; si se introduce uno, reevaluar |
| `btree_gist` / GiST en floats con `NaN` | **0 índices GiST con opclass float4/float8** | No se identificó un índice afectado |
| Operadores personalizados con selectividad no integrada | **0 operadores no pertenecientes a extensiones con estimadores personalizados de OID no integrado** | No se identificó impedimento actual de dump/restore |
| `pgcrypto` con cifrado PGP legacy `bf/blowfish/cast5` | El esquema y los datos de Sabora aún no existen; HMAC-SHA256 de prueba funciona | No hay datos históricos Sabora que descifrar. Este check **NO equivale** a auditar todos los posibles usos de cifrado heredado del proveedor o los archivos SQL por segunda vez |

La verificación de índices/operadores fue contra catálogos PostgreSQL, **solo lectura**, sin acceder a contenido personal ni ejecutar los scripts de reparación. No se ejecutaron `REINDEX`, `CREATE EXTENSION` ni cambios de cifrado.

## 3. El bloqueo verdadero: autoridad SQL del proveedor, recuperación y operación

1. **CV-005 con `supautils`: NO VALIDADO sobre el proveedor real.** El laboratorio demuestra 99/99 con `CREATEROLE/NOSUPERUSER/BYPASSRLS` y negativas runtime. El proveedor documenta [membresía `ADMIN TRUE/SET FALSE/INHERIT FALSE` concedida por `supabase_admin`](https://supabase.com/kb/troubleshooting/cant-revoke-a-role-membership-granted-by-supabase_admin-d08922), incluso cuando `postgres` no puede revocarla. Pero no hemos creado ni autorizado un rol Sabora real; **no certificar** GRANT/REVOKE temporales, OWNER, ACL, `SECURITY DEFINER`, esquema y transacciones/ledger de las 99 versiones en este proyecto.
2. **Backup/restore/PITR: NO VERIFICADOS.** [Supabase backups](https://supabase.com/docs/guides/platform/backups) distingue planes con backups automáticos y PITR como complemento de pago; desconocemos el plan y estado habilitado de este proyecto. Nunca presuponer PITR, backup descargable, contraseñas de roles en restauración, restauración ensayada ni retención. El respaldo real debe estar cifrado, con checksum, custodia, esquema/roles/ACL, punto verificable de recuperación y procedimiento de restauración **solo Sabora**. No se ha generado ni ejecutado backup real.
3. **Conexiones y TLS: NO VALIDADOS.** [Supabase conexiones](https://supabase.com/docs/guides/database/connecting-to-postgres) recomienda conexión directa para DDL/migraciones y conexión de sesión para backend persistente solo si IPv4 lo exige. El host real del pooler **no se inventa por región**. `sslmode=require` no verifica identidad; usar CA/hostname (`verify-full` o equivalente), egress DNS/TLS y la política de redes del runbook. [Cambiar SSL enforcement provoca reinicio de DB](https://supabase.com/docs/guides/platform/ssl-enforcement): no hacerlo sin permiso separado.
4. **Runtime y VPS: NO VALIDADOS.** Falta inventario aprobado de 17 identidades/pools SQL mínimos (o 22 si opt-ins habilitados), 2 notifiers, roles `NOLOGIN`, HMAC/JWKS, secretos y rotación, `/ready` y alerta recibida, salidas filtradas con firewall **externo real** Sabora-only, y dos PWA aceptadas visualmente. No se ha inspeccionado, modificado o reiniciado VPS/Fleetia.
5. **Sin nuevo proyecto por defecto.** Al no tener usuarios reales, el proyecto actual puede servir para el piloto **cuando** se autorice un hito completo de instalación con respaldo, rollback y condiciones STOP. No inventar una necesidad de crear otro proyecto de pago ni llamar «compatibilidad comprobada» a un preflight de solo lectura.

## 4. Puertas de la siguiente intervención (hito de instalación aún pendiente)

| Puerta | Estado | Qué exige para pasar |
| --- | --- | --- |
| Integración main + regresión GitHub | **PASS** | Merge `5caad1f`, 99 SQL exactos; post-merge 2/2 PASS, 5/5 anteriores |
| Conexión al proyecto y diagnóstico básico PG17.11 | **PASS solo lectura** | Este expediente identifica DBA/pgcrypto/version/estado y ausencia de datos Sabora |
| Compatibilidad `supautils`/DBA con 99 SQL en gestor real | **STOP** | Procedimiento autorizado que confirme `CREATE ROLE`, membresía automática, grants dentro de transacción, owners, ACL, FORCE RLS, y ledger atómico SHA256 **por versión**; abortar ante primera discrepancia |
| Backup/restauración y custodia de credenciales | **STOP** | Plan realmente disponible, backup cifrado verificable, recuperación/rollback ensayados, custodia DBA y logins mínimos |
| TLS/pooler/allowlist y egress aislado del VPS | **STOP** | CA/hostname y puerto verificados, host del proveedor confirmado, firewall externo propio de Sabora sin impacto en Fleetia |
| Eventos y observabilidad | **STOP** | Receptor de alertas probado, degradación de readiness y respuesta ante incidentes |
| Aceptación final visual/funcional con dos PWA | **STOP** | Capturas de runtime y flujos contrastados con diseño aprobado en dispositivos reales |

**Paso siguiente sin inventar pruebas redundantes:** preparar el paquete de instalación y recuperación completo según [runbook S38](../runbooks/SABORA_S38_FIRST_OPERATIONAL_ACTIVATION_RUNBOOK_2026-11-12.md), fijar SHA, confirmar la disponibilidad de backup y CA/endpoint del proyecto, custodios y secreto de migración, inventario de roles y pruebas de restauración. Después solicitar autorización **específica** para el hito SQL+bootstrap y más tarde, **separada**, para activar VPS Sabora-only; no hacer DDL de «canario» ni 99 pruebas pequeñas que sustituyan el hito. Repetir solo las pruebas integradoras exigidas por su SHA y cualquier prueba aislada ante riesgo nuevo concreto.

**Estado final de este preflight:** **READ-ONLY GO**; **INSTALACIÓN/DEPLOY NO-GO**. No se accedió a recursos de otros proyectos ni se consumieron ni imprimieron secretos operativos.
