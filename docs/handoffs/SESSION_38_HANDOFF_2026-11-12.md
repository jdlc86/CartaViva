# Sabora / CartaViva — continuidad operativa de la sesión 38 (2026-11-12)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** Fuente de verdad: los contratos normativos existentes en GitHub; esta sesión no puede aprobar cambios de seguridad, diseño o flujos por sí misma. El estado de GitHub/CI del **SHA actual** prevalece sobre todo resumen. Registrar aquí nuevos hitos integrales con enlaces, no microestados.

## 0. Estado vigente — primera lectura de la siguiente sesión

**Corte auditado:** 2026-11-12; [PR #57](https://github.com/jdlc86/CartaViva/pull/57) **Draft / no fusionado**; HEAD verificado `9c943e5b6ae2fa39e5abd18fc604688aa5689e5d`. [CI de compatibilidad PostgreSQL17 #43217686791](https://github.com/jdlc86/CartaViva/actions/runs/43217686791) **SUCCESS**, **12/12 contratos** y **99/99 migraciones** ejecutadas por un operador `CREATEROLE/NOSUPERUSER` en Docker PG17 **desechable**, con limpieza de membresías transitorias, prueba de roles runtime, FORCE RLS y negativas. **Esto cierra el bloqueo SQL reproducido anteriormente en laboratorio, NO valida instalación en Supabase, la revisión independiente ni el hito CV-005 completo.**

Acciones **del mismo SHA**:
- [PG17 sin superusuario #43217686791](https://github.com/jdlc86/CartaViva/actions/runs/43217686791) — `completed/success`; log `sabora_nonsuperuser_pg17_migration_chain_ok:99`.
- [Bootstrap Sabora #43217687760](https://github.com/jdlc86/CartaViva/actions/runs/43217687760) — `completed/success` al corte de S38.
- [Cobertura UI #43217686802](https://github.com/jdlc86/CartaViva/actions/runs/43217686802) — `completed/success`; el job de **aceptación visual final** figura `skipped`, no es aprobación humana.
- [Sabora CI H6 #43217687786](https://github.com/jdlc86/CartaViva/actions/runs/43217687786) — **`in_progress`** en el último corte; **verificar antes de declarar 4/4** y comprobar que HEAD no haya avanzado. No reutilizar un PASS de otro SHA.

**Diferencia respecto a la [sesión 37](SESSION_37_HANDOFF_2026-11-12.md):** su cabecera documenta HEAD antiguo `9722b663`, 55 SQL modificados y el error `must be owner of function verify_management_capability_m3`. El PR #57 avanzó **7 commits** hasta `9c943e5b` con cambios adicionales y su diff respecto a `main` ya alcanza **59 migraciones SQL** entre 67 archivos; el gate PG17 se tornó verde **tras ejecutar de verdad las 99 versiones**, no como simple prueba negativa. Por eso **no repetir la corrección del fallo ya resuelto en el laboratorio**. La descripción del PR #57 está atrasada y aún habla de cero migraciones SQL modificadas; requiere conciliación antes de revisión/merge.

**Rama base:** `main` incluye el [merge real de PR #56](https://github.com/jdlc86/CartaViva/pull/56) (`7dcf90df`) y su validación post-merge histórica; en el corte inmediatamente anterior a la creación de S38, `main` apuntaba a `1783deb174efd5987aaa9867c0ee7e548332eb0d`, con añadidos posteriores **solo documentales** de S38. PR #57 es el **único PR abierto observado**; no inventar PR pendientes obsoletos. Se crearon únicamente documentos en `main`, **sin merge del #57 ni cambios operativos**.

**Proveedor operativo real:** proyecto **solo Sabora** `byhvmumqivmunkmomhup` en cuenta RESTAURANTE, `ACTIVE_HEALTHY`, PostgreSQL **17.11**, `current_user=postgres`, `NOSUPERUSER/CREATEROLE`; consulta SELECT de S37/S38 confirma **sin esquema `sabora`, sin ledger `public.sabora_migration_meta`, cero roles `sabora_*`**. No se aplicaron migraciones, grants ni contraseñas. **NO-GO de activación** hasta pruebas del proveedor, respaldo, seguridad, secretos y autorización expresa.

## 1. Índice operativo y jerarquía

- [Tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) (**obligatorio, aunque también debe revalidarse**).
- [Continuidad de sesión 37](SESSION_37_HANDOFF_2026-11-12.md), contexto de decisión **opción A**, causa y revisión de seguridad CV-005.
- **[Expediente S38 — viabilidad del Bloque 2 de activación paralela](../reviews/SABORA_S38_PARALLEL_ACTIVATION_READINESS_ANALYSIS_2026-11-12.md)**, diagnóstico detallado, inventario y orden de implementación; **es propuesta técnica, no normativa**.
- [Contratos normativos: metodología/laboratorio/observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [hoja de ruta](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [límite CartaViva–otros proyectos](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [funcional aprobado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [diseño visual](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md).
- [Norma **candidata** CV-005 para DBA, en PR #57 (no en main)](https://github.com/jdlc86/CartaViva/blob/feat/sabora-cv005-pg17-provider-compat-20261112/docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md), [contrato HMAC P0 candidato](https://github.com/jdlc86/CartaViva/blob/feat/sabora-cv005-pg17-provider-compat-20261112/docs/security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md); **no sustituir la normativa integrada de `main` hasta revisión e integración autorizadas**.
- [Runbook backup/migración P2](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md), [recuperación P3](../runbooks/SABORA_P3_RECOVERY_CONTINUITY_RUNBOOK_2026-10-29.md), [contrato candidato de secretos](../security/SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md), [preparación CV-005/010/011](../reviews/SABORA_S36_CV005_FIRST_ACTIVATION_READINESS_GATES_2026-11-12.md).

## 2. Directrices innegociables para S38 y siguientes

1. **Un único restaurante Sabora; dos PWA independientes** (cliente y gestión) con el diseño y flujos aprobados. La documentación normativa es la autoridad de requisitos. No convertir informes o handoffs en nuevas políticas.
2. **Hitos grandes integrales**, no cascada de correcciones pequeñas; pruebas aisladas solo para fallo concreto o contrato crítico, demás PG17+HTTP+HMAC/JWT+Chromium/dos PWA integradores. Documentar por separado **implementado / ejecutado / validado operacionalmente** y SHA exacto.
3. **Laboratorio permanente** después del eventual despliegue: CI/PG17 aislado sin secretos reales, backup/rollback, observabilidad segura y diagnósticos. Complementar con pruebas reales Sabora, no sustituir una por otra.
4. **No tocar Fleetia ni recursos de otros proyectos**, ni siquiera para detenerlos, inspeccionarlos o usarlos como dependencias. Ningún Docker global, reinicio del host, red/volumen compartido, credenciales o servicio cruzado. Una parada de Sabora no puede detener, modificar ni depender de Fleetia.
5. **Permisos separados:** código/documentación GitHub pueden prepararse; **merge, DDL/migración/roles/secretos en Supabase, backup real y cualquier despliegue/cambio VPS requieren sus autorizaciones específicas** y preflight. No hay usuarios reales, pero eso no elimina seguridad ni recuperación.

## 3. Hito S38-1 — análisis del Bloque 2: preparación paralela de activación

**Petición del propietario:** evaluar avanzar en paralelo con **copia/restauración de Supabase, gestión de secretos, conexión TLS, redes aisladas de Sabora y arranque funcional de API** mientras se cierra CV-005; no basta ejecutar 99 migraciones para hacer funcionar el restaurante.

**Dictamen:** **VIABLE COMO DESARROLLO DE CÓDIGO + CONTRATOS + CI, NO COMO INSTALACIÓN/ACTIVACIÓN INMEDIATA.** Se ha creado el [expediente técnico detallado](../reviews/SABORA_S38_PARALLEL_ACTIVATION_READINESS_ANALYSIS_2026-11-12.md). No se han implementado aún módulos nuevos de ese Bloque 2 ni se ha intervenido en ningún servidor.

**Fronteras comprobadas en código real:**
- `apps/api/src/server.mjs`: únicamente `/health` (200) y `/ready` (503); `api-runtime-config.mjs` permite **solo `health-only`** y rechaza valores de secretos en producción. `scripts/ci/production-config-secrets-gate.mjs` exige esa condición y prohíbe el montaje accidental del runtime dormido.
- Existe **composición completa H3–H6/M3 opt-in** en `m2-restaurant-candidate.mjs` / `m3-restaurant-candidate.mjs`, que sirve a PG17 desechable con `createM3RestaurantCandidate`, preflight de **17 capacidades SQL** mínimas M3, **hasta 22** con módulos opt-in y **2 conexiones de notificación**. **No hay bootstrap ordinario autorizado** ni proveedor de secretos conectado.
- `deploy/compose.sabora.yml`: proyecto `sabora`, puerto loopback y red `sabora_private internal:true`, proceso no-root con límites y sin dependencias extranjeras. Esta red es segura para health-only, pero **no acredita salida DNS/TLS** hacia Supabase/Auth/JWKS ni alertas. Cambiarla por una red genérica abierta sería degradación, no solución.
- Runbooks P2/P3 y test `postgres-recovery-smoke.sh` ya cubren dump/restore, corrupción, permisos y fallo en PG17 **aislado**. Supabase **Free** no acredita backup diario/PITR; no se ha exportado ni restaurado el proveedor real. Custodia cifrada y restauración real siguen pendientes.
- El inventario existente de secretos recoge **tres contraseñas** privadas del propietario para roles aún no creados, NO suficientes por sí solas para el runtime de 17+ capacidades. Nunca almacenar valores en Git, logs, artefactos, imágenes o PWA.
- TLS exige **verificar servidor/CA y hostname**; decidir endpoint directo IPv6 vs pooler sesión IPv4 según conectividad real sin inventar un hostname ni suponer condiciones de VPS.

## 4. Plan de cierre **sin nuevos PR redundantes**

**Carril A — PR #57 / CV-005:** revalidar HEAD y la **CI H6 todavía pendiente**, conciliación de descripción y 59 SQL, auditoría de permisos/owner/SECURITY DEFINER/ledger y dictamen **independiente** DBA/seguridad. Aprobar, fusionar y migrar son tres decisiones distintas; no instalar ni desplegar por un simple 99/99 verde.

**Carril B — Bloque 2 preparatorio:** trabajar desde código/base verificados **sin mezclar el diff SQL pendiente de #57**; crear una rama de implementación solo cuando se vaya a cerrar el paquete integral; evitar PR nuevo hasta tener una candidatura completa. Entregable común: manifiesto de 17+ identidades y custodias, TLS/egress estrictos con pruebas de aislamiento, backup cifrado/restauración PG17 desechable, **bootstrap operativo separado y fail-closed** que ensamble JWT/HMAC/roles/eventos y registre rutas únicamente tras preflight, `/ready` de dependencias reales, observabilidad/alertas y suite E2E de dos PWA. Adaptar coordinadamente **los gates de seguridad existentes**: no comentar ni eliminar validaciones solo para que una CI pase.

**Puerta final:** después de validación/CI en laboratorio, comprobar restauración real y seguridad de Supabase de forma autorizada, custodia de secretos, salida TLS y aislamiento del VPS real; permitir únicamente prueba con datos ficticios de Sabora y aprobación de despliegue separada. El servidor ordinario continúa **health-only** hasta ese punto. Diseño visual humano y flujo completo de restaurante siguen sin validar operacionalmente.

**Estado S38-1:** **análisis y documentación realizados**, código nuevo del Bloque 2 **NO IMPLEMENTADO**, ensayos nuevos del Bloque 2 **NO EJECUTADOS**, operación real **NO VALIDADA**. Esta es una vía de avance paralela sin eludir el NO-GO de activación.

## 5. Siguiente actuación prioritaria para la nueva sesión

Al reabrir: (1) comprobar GitHub HEAD de #57 y **cuatro Actions del mismo SHA**; (2) contrastar normativa y diff, identificar si existe un revisor independiente; (3) priorizar un **único hito integral** del Bloque 2 por sobre pequeños parches; (4) establecer antes del código el contrato de bootstrap/producto realmente activable y las negativas de seguridad; (5) ejecutar integración PG17/HTTP/Chromium y documentar hechos observados; (6) mantener este documento y el tablero actualizados por **hitos completos**, nunca por estados especulativos.

**Referencias de seguimiento:** [PR #57](https://github.com/jdlc86/CartaViva/pull/57) · [PG17 99/99](https://github.com/jdlc86/CartaViva/actions/runs/43217686791) · [Sabora CI H6](https://github.com/jdlc86/CartaViva/actions/runs/43217687786) · [expediente Bloque 2](../reviews/SABORA_S38_PARALLEL_ACTIVATION_READINESS_ANALYSIS_2026-11-12.md) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
