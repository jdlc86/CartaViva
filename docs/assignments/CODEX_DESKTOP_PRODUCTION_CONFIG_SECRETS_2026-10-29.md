# Encargo Codex Desktop — Hito P1: configuración, secretos y aislamiento de Sabora

**Fecha:** 2026-10-29  
**Repositorio exclusivo:** `jdlc86/CartaViva`  
**Referencia de partida:** PR Draft #40, SHA `97aa91aac9b273f216e6b938101eea8f2fbdd603` (verificar HEAD al empezar).  
**Estado:** encargo pendiente; no implica autorización de producción.

## Mandato y autoridad

Leer primero el índice y la **documentación normativa** vigente en GitHub, que prevalece sobre este documento, documentos de continuidad y cualquier suposición. Contrastar el diseño visual y flujos aprobados. Sabora sirve a **un solo restaurante**. No modificar requisitos normativos sin aprobación expresa. Si falta una decisión normativa, documentar bloqueo y no inventarla.

Trabajar únicamente en `jdlc86/CartaViva`. No acceder, modificar, reiniciar, parar ni depender de Fleetia u otros proyectos del VPS compartido. **No desplegar, no hacer merge, no tocar VPS ni Supabase operativo, no aplicar migraciones operativas, no crear recursos facturables.** Mantener PR Draft. No usar secretos reales en pruebas, logs, commits o capturas.

## Objetivo de aceptación: un bloque completo

Entregar un **candidato de configuración y gestión segura de secretos listo para ser evaluado antes del despliegue**, con pruebas y documentación operativa. No es una orden de despliegue ni de activación. Evitar microcorrecciones: implementar de forma cohesionada código, validación, pruebas y evidencia.

### 1. Auditoría normativa y superficie de configuración

Inventariar entradas de entorno, bootstrap, secretos, tokens, claves JWT, Stripe, Supabase, PostgreSQL, URLs públicas, CORS, cookies, orígenes PWA, webhooks, SSE, notificador y workers **solo si realmente existen en el código o normativa**. Clasificar por servicio y sensibilidad. Identificar defaults inseguros, secretos en cliente, mezcla de entornos y riesgos de compartir identidades. Entregar matriz fuente normativa → variable/componente → validación → prueba. No reproducir valores secretos.

### 2. Configuración tipada y arranque fail-closed

Implementar, donde lo requiera el contrato vigente, un módulo de configuración por proceso con esquema explícito, validación al inicio, errores sanitizados, prohibición de credenciales de prueba en producción y ausencia de fallback silencioso. Respetar la separación de roles SQL y de apps cliente/gestión. Los candidatos opt-in H4/H6 deben continuar sin montaje automático ni listeners por defecto. Mantener compatibilidad con los tests existentes y sin inventar una nueva arquitectura.

### 3. Contrato seguro de secretos y despliegue futuro

Documentar y probar el mecanismo **sin introducir secretos reales**: inventario de nombres y responsables, inyección en runtime, rotación, revocación, caducidad, comprobación de presencia, mínimo privilegio, no exposición en bundles, logs, CI ni mensajes de error. Preparar ejemplos `.env.example` únicamente con marcadores inocuos y acordes a normativa. No configurar secretos productivos ni GitHub Secrets reales sin instrucción posterior.

### 4. Aislamiento de infraestructura y costes

Preparar validaciones automáticas estáticas o sobre contenedores **desechables** para demostrar que el futuro servicio Sabora tiene recursos, nombres, redes, puertos, volúmenes, procesos, credenciales y procedimientos de arranque/parada independientes de Fleetia y terceros. No inspeccionar ni modificar el VPS compartido. Si la prueba requiere infraestructura real, dejarla como puerta explícita pendiente de autorización. Impedir que scripts de despliegue, limpieza, rollback o reinicio utilicen comandos globales que afecten a otros proyectos. Prohibir creación automática de instancias/workers por deploy sin control y documentar límites de recursos y procedimientos de apagado seguro si existen workers en la arquitectura normativa.

### 5. Pruebas, CI y entrega

Agregar tests positivos y negativos de configuración: faltantes, malformados, secretos de ejemplo, fuga de valores, entornos cruzados, privilegios, flags de activación, limpieza y fallos de arranque. Integrar con CI existente sin depender de producción. Ejecutar suites focalizadas y regresión completa; esperar por shell con polling y timeout, analizar logs, corregir y repetir. Comprobar CI **del SHA final**. Documentar evidencias y un informe de cierre con matriz de criterios cumplidos, pendientes y decisiones normativas necesarias.

## Criterios de cierre

- Configuración efectiva, validada, aislada por proceso y fail-closed en las superficies previstas por normativa.
- No se filtran secretos al frontend, artefactos, logs, errores o CI; pruebas que lo acreditan.
- Pruebas automáticas de aislamiento y ausencia de comandos que puedan afectar Fleetia.
- Scripts y documentación reproducibles en entorno desechable, sin tocar recursos reales.
- CI verde en HEAD final y documentación actualizada.
- Ningún merge, despliegue, cambio en Supabase operativo, VPS o Fleetia.

## Gestión del crédito Codex

Este es **solo el hito P1**, no encargar aún migraciones/rollback u observabilidad completos. No realizar ciclos exploratorios ilimitados: inspeccionar, diseñar una matriz breve, implementar un bloque completo y probar. Informar del saldo de créditos disponible al terminar si Codex lo conoce; si no, pedir al usuario el saldo para decidir P2. Detener ampliaciones de alcance si aparece un bloqueo normativo.

## Informe de salida obligatorio

PR Draft y SHA final, lista de archivos, matriz normativa, pruebas con cifras y enlaces de runs, limitaciones, riesgos, puertas de producción pendientes y confirmación explícita de **cero cambios en Fleetia, VPS y Supabase operativo**.
