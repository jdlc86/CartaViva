# Sabora — propuesta de siguiente hito tras P3

Fecha: 2026-10-29
Estado: PROPUESTA / NO APROBADO COMO REQUISITO NORMATIVO
Repositorio: jdlc86/CartaViva
Base de continuidad: P3 cerrado en alcance técnico aislado, PR #40 Draft.

## Regla de autoridad

Este documento NO define requisitos funcionales nuevos ni autoriza producción. Antes de cualquier implementación, localizar y leer los documentos normativos vigentes del repositorio, especialmente contratos funcionales, consistencia, QR, operaciones cocina/sala, directorio y diseño visual aprobado. Si el repositorio ya define el siguiente hito, su alcance prevalece y esta propuesta se adapta o descarta. No inferir requisitos de los handoffs.

## Objetivo de la siguiente etapa

Cerrar, sin intervención operativa, las lagunas documentales y de prueba que separan el candidato técnico aislado de una decisión informada de activación. Mantener separadas preparación técnica y autorización operativa.

## Cinco bloques propuestos, sujetos a normativa

1. Reconciliación normativa: inventario de documentos normativos, requisitos y flujos aprobados; matriz de trazabilidad, conflictos y criterios de aceptación. Publicar informe sin modificar normativa.
2. Preparación de aislamiento: especificación y comprobaciones automatizadas para redes, contenedores, puertos, recursos, nombres, ciclo de vida y rollback Sabora-only. No inspeccionar ni intervenir VPS sin autorización.
3. Seguridad y credenciales: contrato de provisión, custodia, rotación y revocación de secretos; mínimos privilegios y pruebas negativas con fixtures. No provisionar credenciales reales.
4. Continuidad operativa simulada: plan de RTO/RPO, PITR, Storage y pruebas desechables de restauración, bloqueo y recuperación; separar evidencia CI de evidencia de producción.
5. Informe de preparación y decisión: matriz norma->implementación->prueba->SHA, riesgos y gates PASS/BLOCKED; conclusión NO-GO mientras falten autorizaciones y pruebas materiales.

## Persistencia obligatoria

Cada bloque debe tener commit, push, documentación, pruebas y comentario de PR con la fórmula "Bloque N de 5" y enlaces al SHA/CI. Nunca acumular bloques sin publicarlos. Si se interrumpe el trabajo, el último bloque terminado queda recuperable y el siguiente marcado IN_PROGRESS. Mantener PR Draft; no merge.

## Límites absolutos

Solo jdlc86/CartaViva. No tocar Fleetia ni recursos de otros proyectos. No intervenir VPS compartido, Supabase operativo, datos reales, secretos reales, ni realizar despliegue, reinicio, eliminación o acciones Docker globales. Las pruebas deben utilizar recursos propios y desechables. No crear recursos facturables sin autorización. El desarrollo visual debe respetar el diseño y flujos aprobados.

## Precondición de arranque

Confirmar contra documentación normativa el nombre, alcance y orden del siguiente hito. Si no se puede acreditar, limitarse a inventario y análisis; solicitar decisión del usuario antes de convertir esta propuesta en un plan de implementación. La aprobación del usuario es imprescindible para acciones operativas reservadas.
