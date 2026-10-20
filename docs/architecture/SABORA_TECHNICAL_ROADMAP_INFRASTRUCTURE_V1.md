# Sabora — hoja de ruta técnica e infraestructura V1

Fecha: 2026-10-18. Estado: decisiones aprobadas y propuesta técnica; no implica implementación ni contratación.

## Alcance corregido (2026-10-20)
- Sabora es una aplicación para **un único restaurante**. Quedan fuera de alcance las entidades `restaurants` como colección de establecimientos, el campo `restaurant_id` en cada recurso, los selectores de establecimientos y cualquier autorización multitenant.
- Se mantiene la independencia de infraestructura de Sabora respecto de Fleetia y de otros proyectos del VPS. El aislamiento entre proyectos no es arquitectura multirrestaurante.

## Decisiones confirmadas por el propietario
- Sabora utilizará **un proyecto Supabase propio**, separado del proyecto de Fleetia, para PostgreSQL, autenticación y almacenamiento. No compartir bases de datos, usuarios, claves ni políticas entre productos.
- Se **propone reutilizar el VPS ya contratado para Fleetia** como alojamiento de aplicaciones, API y servicios auxiliares de Sabora, **condicionado a verificar previamente su capacidad y aislamiento**. No se autoriza intervenir en los contenedores o despliegues de Fleetia.
- Mantener separación de contenedores, redes cuando corresponda, variables de entorno, secretos, volúmenes, dominios, backups, observabilidad y pipelines. No compartir credenciales ni privilegios entre aplicaciones.
- No contratar infraestructura adicional ni activar pagos reales en esta fase.

## Arquitectura objetivo (propuesta; pendiente de validación)
- `apps/client`: interfaz/PWA de clientes, React + TypeScript + Vite.
- `apps/management`: interfaz/PWA de cocina, sala y administración, React + TypeScript + Vite.
- `apps/api`: backend Node.js + Fastify; fuente de verdad de precios, permisos, mesas, pedidos y pagos.
- Paquetes compartidos: contratos, dominio, componentes UI y tokens visuales.
- Supabase exclusivo de Sabora: PostgreSQL, Auth/Passkeys y Storage; privilegios mínimos y autorización en API y DB.
- Sincronización: eventos duraderos y canal en tiempo real (WebSocket u opción compatible por evaluar), sin polling funcional; recuperación por versión/snapshot tras reconexión.
- Stripe para pagos, capturas, reembolsos y conciliación, **solo tras completar los controles y pruebas**.
- GitHub Actions para CI y despliegue por commit, con entornos separados. Tecnologías concretas, versiones y proveedores de ejecución quedan sujetos a prueba técnica.

## Secuencia de entrega y puertas
**Fase 0 — Fundamentos:** inventario del repositorio y contratos vigentes; estructura del monorepo; decisiones de modelo transaccional, límites de autorización, estrategia de pruebas y amenazas. Salida: arquitectura y ADRs revisados.

**Fase 1 — Plataforma y seguridad:** proyecto Supabase de Sabora, migraciones versionadas, API mínima, identidad/Passkeys, invitación→activación explícita, roles ROOT/ADMIN/operativos, titularidad única de escritura, auditoría append-only, CI y entorno aislado. Salida: pruebas de permisos, concurrencia, recuperación y migraciones.

**Fase 2 — Gestión y catálogo:** restaurantes, empleados, catálogo, opciones/extras, alérgenos, disponibilidad, precios e impuestos, descuentos sobre plato más extras, publicaciones y trazabilidad de cambios. Salida: pruebas de autorización y cálculo monetario en céntimos/decimal exacto.

**Fase 3 — Operación sin cobros reales:** mesas, QR, visitas, cuentas, cesta, comandas, cocina, sala, pausa/reanudación, notificaciones y recuperación de desconexiones. Salida: flujos completos e idempotentes; pruebas de eventos obsoletos y concurrencia.

**Fase 4 — Economía y pagos:** Stripe en entorno de prueba, modalidad de pago, propinas voluntarias separadas de ventas/IVA, devoluciones, webhooks, conciliación y recuperación de fallos. Salida: pruebas de doble cobro, reintentos, liquidación y validación fiscal profesional antes de producción.

**Fase 5 — Explotación:** dashboard de solo lectura para administradores, ventas/cobros/saldos/propinas diferenciados, filtros y comparativas; E2E, rendimiento, accesibilidad, seguridad, backup/restore y despliegue controlado. Salida: candidatura a producción, no autorización automática.

## Verificaciones pendientes antes de usar el VPS
1. Inspección de CPU, RAM, almacenamiento, swap, límites de contenedores, carga y crecimiento de Fleetia, sin cambios de configuración.
2. Revisión de puertos, proxy/TLS, redes Docker, DNS, firewall, secretos, políticas de backup y restauración.
3. Presupuesto de recursos de Sabora, límites y alertas; decisión documentada de coexistencia o VPS independiente si la capacidad es insuficiente.
4. Identificar región y plan del nuevo proyecto Supabase, políticas RLS, retención, backups y coste; **no reutilizar el proyecto de Fleetia**.

## Método de ejecución
- Trabajar en ramas y PRs acotados; pruebas automáticas y revisión independiente para cambios críticos.
- No copiar módulos de Fleetia sin inventario, comparación de contratos, adaptación y pruebas propias.
- No fusionar PR documental como prueba de implementación. No ejecutar despliegues ni operaciones sobre producción sin verificación específica.
- Mantener como referencia el contrato funcional consolidado en `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` del PR #1.
