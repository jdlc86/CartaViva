# Encargo P3 para Codex: cinco bloques persistentes

Fecha: 2026-10-29
Repositorio: jdlc86/CartaViva
Punto de partida: P2, PR Draft #40, commit 1391c5b6a0ec097904429009708a74e06e671327

Este documento es un encargo de trabajo, no un requisito normativo ni una autorización de despliegue. Leer primero la documentación normativa vigente de GitHub. Si P3 ya tiene una definición normativa, respetarla y adaptar la división de trabajo sin modificar sus requisitos. Los documentos de continuidad solo proporcionan contexto.

## Regla principal de continuidad

Ejecutar cinco bloques completos y persistir CADA bloque en GitHub antes de comenzar el siguiente. No acumular cambios locales de varios bloques. Si se agotan los créditos o se interrumpe la sesión, los bloques anteriores deben permanecer recuperables en la rama remota y documentados.

Para cada bloque:
1. Comprobar normativa, alcance, dependencias y estado real de la rama.
2. Implementar el bloque completo en el repositorio autorizado, con pruebas y documentación.
3. Ejecutar pruebas focalizadas, corregir fallos y repetir. Esperar por shell cuando sea necesario.
4. Hacer commit y push del bloque terminado a la rama remota; conservar PR en Draft.
5. Comprobar workflows del SHA publicado. No afirmar PASS hasta tener evidencia. Si CI falla, corregir, subir y volver a comprobar.
6. Actualizar este documento o un informe de seguimiento con estado, SHA, pruebas, riesgos y siguiente bloque.
7. Publicar comentario en el PR: "P3 — Bloque N de 5 implementado y validado", con SHA, enlaces de CI y resumen. Si hay bloqueo, publicar "P3 — Bloque N de 5 pendiente" y detallar causa; nunca simular éxito.
8. Continuar automáticamente con el bloque siguiente sin solicitar confirmación ordinaria.

Si un bloque requiere autorización reservada, ejecutar solo su preparación y pruebas aisladas, registrar BLOCKED para la acción operativa y avanzar con los trabajos permitidos. No llamar cerrado a P3 si faltan criterios normativos.

## Bloque 1 de 5 — aislamiento

Diseñar y comprobar aislamiento de Sabora frente a Fleetia y demás proyectos: servicios, redes, volúmenes, puertos, nombres, recursos, reinicios, healthchecks, despliegue y parada. Implementar guardias y pruebas estáticas o aisladas que no necesiten tocar el VPS. No ejecutar comandos globales Docker/Compose ni cambiar infraestructura ajena.

## Bloque 2 de 5 — seguridad operativa

Inventariar variables y secretos sin revelar valores. Verificar configuración fail-closed, roles mínimos, separación de credenciales, rotación y revocación previstas, ausencia de secretos en logs y artefactos, y controles de arranque. Pruebas reproducibles con datos ficticios.

## Bloque 3 de 5 — recuperación y continuidad

Definir y ensayar en entornos desechables recuperación Sabora-only, dependencias de Storage, límites y alternativas de PITR, objetivos y medición de RTO, escenarios de error, y cargas/locks representativos dentro de las capacidades de CI. No afirmar que un ensayo aislado acredita producción.

## Bloque 4 de 5 — validación funcional integral

Ejecutar o completar pruebas de flujos aprobados cliente y gestión: QR, visita, catálogo, pedido, agrupación, cocina, sala, notificaciones, estados de error, offline y revocaciones. Mantener estilos y flujos visuales aprobados. No abrir rutas operativas ni cambiar requisitos.

## Bloque 5 de 5 — auditoría y cierre

Ejecutar suites, builds, pruebas de seguridad y regresiones pertinentes. Elaborar matriz requisito normativo -> código -> prueba -> SHA/CI -> PASS/BLOCKED. Revisar riesgos residuales, actualizar documentación de cierre y publicar informe de P3 con decisión motivada. Cierre técnico no equivale a autorización de producción.

## Restricciones

Solo jdlc86/CartaViva. Sin merge, despliegue, reinicio, eliminación o cambio de Fleetia, VPS compartido, Supabase operativo ni otros proyectos. No crear recursos facturables ni usar datos o secretos reales. Toda intervención operativa requiere autorización expresa e independencia total de Fleetia. Los tests pueden usar exclusivamente recursos desechables aislados y propios. Si falta un permiso, documentarlo y continuar con trabajo seguro.

## Informe por bloque

Mantener una tabla de cinco filas: bloque, estado NOT_STARTED/IN_PROGRESS/PASS/BLOCKED, commit remoto, CI y enlace, evidencia, riesgos pendientes. Cada comentario de avance debe indicar "Bloque N de 5" y nunca afirmar validación antes de concluir CI. En caso de interrupción, dejar una instrucción breve para retomar desde el último SHA remoto y el primer bloque pendiente.

Codex debe trabajar autónomamente hasta donde lo permitan los recursos y autorizaciones. El usuario continuará enviando "continúa"; no necesita intervenir en las pruebas normales.
