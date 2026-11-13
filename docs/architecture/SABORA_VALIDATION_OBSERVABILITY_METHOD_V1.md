# Sabora — metodología permanente de validación, depuración, observabilidad y recuperación V1

**Decisión del propietario:** 11-11-2026, sesión 36. **Naturaleza:** contrato normativo **de ingeniería y validación** para el restaurante único Sabora. No autoriza por sí solo migraciones, integración en `main`, aprovisionamiento ni despliegue. Los contratos normativos de producto, seguridad, permisos, visuales y aislamiento mantienen su plena vigencia; si un punto parece entrar en conflicto, debe resolverse contra esos contratos, no reinterpretarlos desde continuidad.

**Base:** [contrato funcional consolidado](SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [límite del proyecto](CARTAVIVA_PROJECT_BOUNDARY.md), [hoja de ruta técnica](SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [contrato de titularidad administrativa](SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [diseño visual aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [pantalla principal aprobada](../design/screens/SABORA_HOME_IMPLEMENTATION_V1.md). Los handoffs son contexto, **no fuente de reglas**.

## 1. El laboratorio es permanente

- Mantener **PostgreSQL 17 desechable** en GitHub Actions, en red/recursos aislados y sin secretos operativos, junto con la cadena de migraciones, integridad de auditoría, permisos mínimos, RLS forzado, autenticación y vinculación JWT/HMAC, idempotencia, concurrencia, fallos controlados, recuperación y dos PWA probadas con Chromium/Playwright.
- El laboratorio se reconstruye desde un SHA concreto y puede ser destruido o restaurado sin afectar datos operativos, Fleetia ni otros proyectos. **No reemplazar el laboratorio por Supabase operativo** una vez migrado.
- Los tests deben ser **integradores por defecto**. Introducir pruebas aisladas solamente para localizar un fallo concreto o proteger un requisito crítico; no fragmentar una entrega integral en múltiples pruebas, PR o correcciones triviales.
- CI verde significa **validación de laboratorio sobre ese SHA**, no prueba de aceptación estética, seguridad independiente, despliegue o satisfacción del contrato operativo.

## 2. Depuración real complementaria después de activar

- Sabora **no tiene usuarios reales** en este corte. El entorno operativo se utilizará también para las primeras pruebas, siempre con **datos ficticios**, custodia de secretos, seguridad, restauración y permisos propios. No existe una necesidad normativa de crear otro ambiente productivo de prueba si el propietario no lo decide.
- Tras **autorización expresa e aislamiento completo**, desplegar API y las PWA cliente/gestión y revisar el mismo SHA mediante flujos reales: QR de mesa, identidad, carta y anuncios, pedidos/agrupación, cocina, sala, mesa/cambio/cuentas, alertas y pagos únicamente en las variantes aprobadas.
- Probar en móviles y escritorio, contrastando screenshots capturadas del runtime con la **interfaz aprobada**, no con renders inventados. Registrar defectos visuales, funcionales, SQL, TLS, redes, proveedores, accesibilidad e instalación PWA.
- Cualquier corrección seguirá el circuito **reproducción con evidencia → causa → hito completo de código → regresión integradora de laboratorio → revisión → despliegue Sabora-only autorizado → verificación real y aceptación**. No contabilizar como validados flujos no ejecutados.

## 3. Observabilidad mínima antes de GO operativo

La aplicación debe permitir diagnosticar sin privilegios excesivos ni fuga de datos:

1. **Correlación:** identificador de petición generado/controlado por el servidor, utilizable para relacionar solicitud cliente, autenticación, operación, evento durable y resultado, sin confiar en un header aportado por un cliente como identidad.
2. **Registros seguros:** JSON estructurado, niveles/eventos y taxonomía de errores **de listas cerradas**, duración y resultado. Prohibido registrar cuerpos, JWT, QR/token, cookies, contraseñas, HMAC, claves, correo, datos económicos sensibles, headers, URL/query crudos, SQL con parámetros, IP de cliente o errores sin saneamiento.
3. **Estado y disponibilidad:** `/health` indica vitalidad del proceso; `/ready` operativo solo devuelve éxito cuando **las dependencias reales exigidas para el modo activo** pasan preflight y siguen disponibles. Un `health-only` que responde no acredita que el restaurante funcione.
4. **Eventos y métricas:** contadores de baja cardinalidad, latencias, errores, denegaciones, conexiones SQL, cola/outbox/SSE, pagos y fallos de proveedores; correlación sin exponer información personal. Emisión por eventos, sin `polling` periódico prohibido por el contrato visual/arquitectónico.
5. **Alertas accionables:** detección de umbrales, clasificación, responsable/receptor, vía segura de notificación, retención y **prueba efectiva del disparo y de la recepción**. Una alerta solo escrita en stdout **no demuestra monitoreo operativo de incidentes**.
6. **Instrumentación E2E:** ambas PWA, API H3–H6, autenticación, roles SQL, eventos y operaciones económicas deben producir evidencia segura del flujo completo; no basta instrumentar el proceso `health-only`.
7. **Privacidad y fallo cerrado:** sin endpoints públicos de métricas/depuración ni privilegios de diagnóstico que eludan RLS; errores del sink de telemetría no deben cambiar estado económico o permisos del usuario. Logs de infraestructura limitados a Sabora; sin secretos en CI/artefactos.

**Estado técnico a fecha de decisión:** [candidato de instrumentación S36 en PR #56](https://github.com/jdlc86/CartaViva/pull/56) con eventos de HTTP y ensayos del candidato H3–H6/M3 en PG17; **no** hay monitorización real completa, alerta externa, readiness operacional ni proveedor seleccionado. La implementación debe acreditarse con el SHA final y sus CI y luego con pruebas reales; este documento no los da por cerrados.

## 4. Backup, recuperación y parada segura

### Decisión del propietario (13-11-2026): estrategia de doble copia sin dependencia de Fleetia

Se admiten **dos destinos complementarios**, nunca dos copias equivalentes de un mismo fallo:

1. **Copia operativa local, opcional, en el VPS:** conservar **solo el artefacto ya cifrado** de Sabora en almacenamiento dedicado e inventariado para Sabora, con propietario/ACL propios, cuotas, reserva de espacio, retención acotada y purga controlada. Sirve para recuperación rápida o diagnóstico autorizado si el VPS permanece sano; **no es backup externo independiente** ni único punto de retorno. No instalar una base PostgreSQL de restauración ni lanzar ensayos de recuperación en el VPS compartido. Ningún directorio, volumen, red, credencial o servicio del sistema de copia puede compartirse con Fleetia u otros proyectos ni afectar sus recursos; si el aislamiento o la capacidad de disco no pueden demostrarse sin inspeccionar/alterar otros servicios, omitir la copia local y mantener la externa.
2. **Copia externa obligatoria:** custodiar una copia cifrada y verificable **fuera de Supabase, del VPS y de GitHub/Actions**, en almacén independiente, con claves en canal/custodio separado y política aprobada de acceso, retención y recuperación. Debe seguir disponible incluso ante pérdida total o compromiso del VPS; la copia local no la sustituye. Se puede generar una única exportación autorizada desde un equipo de captura externo y distribuir **el mismo artefacto cifrado verificado** a los dos destinos, sin realizar dos extracciones ni dos rutinas de migración.
3. **Integridad y recuperación:** registrar hash, esquema/roles/datos y ámbito, hora, versión PostgreSQL, ledger y SHA256 de migraciones, propietario, cifrado y resultados de transferencia a cada destino. Exigir ensayo de restauración **desde la copia externa**, en PostgreSQL 17 aislado fuera del VPS compartido, contrastando objetos/roles grantor/ADMIN/SET/INHERIT, RLS, ledger y negativas. La copia local cuenta como útil únicamente si su lectura e integridad están verificadas; cualquier falta de copia externa restaurable es **STOP para SQL operativo**. Actualizar copias después de la instalación y ante cambios significativos, con RTO/RPO y retención medidos, no inventados.
4. **Seguridad operativa:** extracción real Supabase, transporte al VPS, provisión de credenciales, ensayos externos, migraciones y despliegue requieren **autorizaciones específicas distintas**. La copia local se almacena cifrada **antes de persistir**; prohibido guardar allí dumps en claro, claves de descifrado, contraseñas o artefactos de otros proyectos. Verificar TLS/identidad de extremos y usar solo rutas/mecanismos exclusivos Sabora; sin Docker global ni intervenciones sobre Fleetia.

Esta revisión **no acredita la existencia de ninguna copia**, no da por reanudada una captura antes aplazada ni reduce las puertas CV-005/CV-010/CV-011 o M6. GitHub Actions permanece efímero y separado; sus artefactos no son backups operativos.


- Conservar y extender los runbooks existentes [P2 migración/recuperación](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md), [P3 continuidad](../runbooks/SABORA_P3_RECOVERY_CONTINUITY_RUNBOOK_2026-10-29.md) y [P3 ciclo aislado](../runbooks/SABORA_P3_ISOLATED_LIFECYCLE_RUNBOOK_2026-10-29.md). **No** crear copias duplicadas ni afirmar restauración real basándose solo en Docker CI.
- Antes de la intervención, verificar copia de seguridad y restauración **exclusivamente Sabora**, migraciones ordenadas con checksum/historial, roles y grants positivos/negativos, firmas y TLS, backup/retención del proveedor y cualquier Storage externo por separado. Definir objetivos RTO/RPO conforme a recuperación comprobada; mientras no estén acordados, consignar `NO VALIDADO`.
- Las operaciones de Docker deben tener proyecto `sabora`, archivo Compose y servicio explícitos. No ejecutar `prune`, reinicios globales, borrados de red/volumen compartido ni comandos sobre otros servicios. Una restauración Sabora no puede detener Fleetia ni depender de sus contenedores.
- **Conectividad aislada:** el Compose `health-only` original utiliza red `sabora_private` con `internal: true`, que no acredita salida necesaria hacia Supabase/Auth, Stripe y receptor de alertas. Antes de activar, definir/probar egress **solo para Sabora**, TLS verificado, reglas de red, dominios/orígenes y puntos de retorno sin abrir recursos compartidos.
- No alterar directamente la base operativa a partir de fixtures CI ni proporcionar credenciales de login a los clientes. Los tres secretos SQL preparados por el propietario siguen separados del repositorio y no tienen efectos hasta su aprovisionamiento seguro.

## 5. Evidencia y criterio de cierre por hito

En matriz viva y continuidad de sesiones registrar por separado:

| Nivel | Evidencia exigida | Lo que NO demuestra |
| --- | --- | --- |
| **Implementado** | Archivo/commit/rama, función y límites de alcance | Corrección o seguridad ejecutada |
| **Pruebas ejecutadas** | SHA exacto, workflow, casos integrados, resultados reales, negativa de privilegios y fallo | Uso efectivo en Supabase y VPS |
| **Validado operacionalmente** | Deploy autorizado Sabora-only con SHA fijo, flujos de dos PWA y dispositivos, SQL/alertas/backup realmente observados, restauración y rollback verificados | Aceptación de funciones expresamente excluidas |
| **Aceptado** | Conformidad humana de diseño y flujos aprobados, puertas P0 resueltas y evidencia conservada | Una aprobación general de funciones no incluidas |

**Puerta para primera prueba real:** migraciones y permisos con preflight sobre PG17.11 de Supabase, bootstrap CV-005, secretos propios, TLS/egress propios, respaldo/recuperación, observabilidad completa para los flujos activados, aprobación de integración y **autorización expresa de operaciones en VPS/Supabase**. Pueden acotarse funciones de prueba con datos ficticios sin declarar completadas Stripe remoto, Gemini, reservas, Excel u otras pendientes normativas.

**Invariantes permanentes:** una instalación Sabora/un restaurante; dos PWA separadas; ROOT y ADMIN según contrato vigente, auditores sin atribución de titularidad; ninguna alteración de Fleetia ni recursos de otros proyectos; requisitos normativos prevalecen sobre la continuidad.
