# Encargo a Codex — Hito de identidad SQL no falsificable (24-10-2026)

## Mandato y fuente de verdad

Repositorio exclusivo: `jdlc86/CartaViva`. Rama de referencia: `integration/sabora-order-management-review`, PR Draft #7. Leer **antes de cambiar nada**:

1. `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`
2. `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`
3. `docs/security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md`
4. `docs/security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md`
5. `apps/api/src/order-operations-{composition,coordinator,repository,identity-preflight}.mjs`
6. `supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql`
7. `scripts/ci/order-operations-identity-postgres17.test.mjs` y `scripts/ci/order-operations-postgres17-integration.test.mjs`.

La documentación vigente es normativa: **no inventar semántica de restaurante, roles, políticas ni permisos**. Un solo restaurante Sabora. No tocar otros repositorios, Fleetia, recursos compartidos ni VPS. No aplicar migraciones, GRANTs o cambios en Supabase operativo; no desplegar, reiniciar, fusionar ni activar endpoints.

## Objetivo: cerrar un hito verificable, no pequeñas correcciones

Realizar una **revisión de seguridad independiente con prueba adversarial reproducible en PostgreSQL 17 efímero** sobre la vinculación del actor HTTP con la identidad autorizada ante PostgreSQL. La RPC candidata `sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)` recibe `p_actor_user_id` como argumento y actualmente **no garantiza que el actor suministrado sea el llamante real** bajo un login SQL técnico compartido. Las rutas están sin montar y los permisos de ejecución revocados: mantener ambas barreras.

### Entregables obligatorios

1. **Modelo de amenazas**: trazar desde JWT verificado, `verifiedStaff`, transacción, conexión técnica y RPC hasta las filas mutadas. Distinguir suplantación HTTP, acceso SQL directo, `SET ROLE`, GUC/`set_config` falsificable, roles con herencia, RLS y `SECURITY DEFINER`/`INVOKER`. Identificar con precisión el límite de confianza y la condición necesaria para habilitar escritura.
2. **Prueba adversarial en PostgreSQL 17 desechable de CI**, sin tocar bases operativas: demostrar de forma aislada qué sucede cuando una identidad SQL compartida recibe temporalmente los permisos mínimos necesarios para invocar la RPC con el UUID de *otro* empleado activo. Si el escenario requiere grants adicionales, limitar al contenedor efímero, limpiar con `finally` y documentar cada privilegio. La prueba debe **probar la debilidad sin dejar un grant positivo en el estado final**, o registrar claramente por qué el caso no puede reproducirse bajo la migración actual. No debilitar ni retirar los tests de denegación existentes.
3. **Evaluación de alternativas** con criterios explícitos: identidad PostgreSQL individual no compartida; servicio privilegiado con verificación de prueba criptográfica en frontera controlada; otra alternativa si se fundamenta. No presentar `current_setting` de un GUC escrito por el mismo login, ni un parámetro UUID, como identidad no falsificable. Analizar revocación, concurrencia, pool de conexiones, idempotencia, auditoría y superficie de privilegios.
4. **Documento de decisión propuesto** en `docs/security/` que especifique la arquitectura recomendada, invariantes, permisos requeridos, migración gradual, pruebas positivas/negativas y criterios de aceptación. Marcar como **propuesta pendiente de aprobación**, no como contrato aprobado.
5. **Pruebas automatizadas y evidencia**: ejecutar pruebas unitarias, integración PG17 y GitHub Actions disponibles; consignar SHA exacto y resultados. Si un workflow falla, diagnosticar y corregir solo fallos dentro de este encargo, sin ocultarlos.

## Límites de ejecución y coordinación

- Crear **rama propia de Codex** desde el SHA actual de la rama de integración; commits coherentes y PR **Draft** hacia `integration/sabora-order-management-review`. No sobrescribir commits de la integración ni hacer push directo a ella.
- Permitido modificar únicamente código de pruebas, scripts CI y documentación necesarios para este hito. **No modificar** contratos funcionales, endpoint de producción, migraciones operativas, permisos reales ni bootstrap de despliegue. Si la solución exige código productivo, describir propuesta y solicitar revisión posterior; no implementarlo silenciosamente.
- Mantener la suite existente y los gates de activación: la ausencia de permisos y el no montaje de rutas deben seguir verificándose.
- No llamar a otros agentes ni consumir revisiones externas de Codex sin autorización.
- Priorizar un bloque completo: amenaza + demostración reproducible + decisión documentada + CI. Evitar sucesiones de commits cosméticos.

## Definición de terminado

El PR Draft debe contener: (a) amenaza y prueba reproducible o limitación técnicamente demostrada, (b) recomendación razonada sin afirmar autorización, (c) tests y documentación enlazados, (d) ambos workflows verificados en HEAD, (e) lista explícita de riesgos y bloqueos que aún impiden activar operaciones. Si falta cualquiera de estos puntos, informar **hito incompleto**. No solicitar despliegue ni merge.

## Informe final de Codex

Entregar enlace al PR Draft, rama, SHA, matriz de pruebas y conclusiones sobre la suplantación SQL. Señalar expresamente que Fleetia, VPS y Supabase operativo permanecieron intactos.
