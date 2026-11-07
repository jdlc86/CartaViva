# Puerta de conformidad visual — procedimiento técnico (07-11-2026)

**No es normativa nueva ni aprobación de diseño.** Fuentes: [contrato visual](../DESIGN_SYSTEM_CONTRACT.md) §§4,7,9,11,12,14, [pantalla cliente aprobada en composición](screens/SABORA_HOME_IMPLEMENTATION_V1.md), [requisitos de anuncios](../REQUISITOS_FUNCIONALES.md), [auditoría de estilo](APPROVED_VISUAL_STYLE_AUDIT_V1.md). Se respetan los estados APROBADO, PENDIENTE y PROPUESTA. Este procedimiento no reinterpreta RF/DV.

## Defecto que motiva el control

La pantalla histórica de octubre tenía **composición aprobada** pero no se conserva una **captura exacta aprobada**. El HTML histórico incluye controles e iconos provisionales que no deben confundirse con una imagen aprobada. La PWA React actual contiene una región de anuncios oculta; sus capturas Chromium no demuestran la conformidad con el flujo de comunicaciones ni la aceptación estética humana. El sistema de trabajo anterior permitía declarar avances visuales técnicamente verdes sin evidencias comparables contra una referencia autorizada.

## Controles implementados en el candidato

1. **Instrucciones persistentes:** AGENTS.md en raíz ordena al agente leer normativa, preservar la composición realmente aprobada y no usar maquetas/emoji provisionales como diseño final.
2. **Registro de estado verificable:** APPROVAL_REGISTER.md y APPROVAL_REGISTER.json distinguen aprobación de dirección/composición frente a baseline PNG exacta; actualmente la captura exacta es PENDIENTE, no se inventa.
3. **Control automático por PR:** el workflow Sabora visual contract governance inspecciona diff real entre SHA base y cabeza. Abarca archivos de PWA cliente, PWA gestión, componentes compartidos y cambios sensibles de políticas visuales. No permite evadir el análisis borrando o moviendo archivos.
4. **Referencia de rama base obligatoria:** cada superficie UI cambiada requiere registro APPROVED_EXACT_BASELINE **anterior** al propio PR, PNG versionado en docs/design/baselines, digest SHA256 coincidente, fecha, autor y vínculo de aprobación. Una PR no puede introducir su propia imagen/registro y usarla para autovalidarse.
5. **Evidencia real del mismo SHA:** lectura solo de GitHub Actions para confirmar éxito de Sabora client browser conformance o Sabora management browser visual smoke según superficie afectada, más el artefacto de captura no caducado. Una captura de otro commit o una simple etiqueta en el PR no son evidencia.
6. **Aprobación humana auditada:** el propietario escribe **personalmente**, tras ver la comparativa y los artefactos, un comentario exacto en el PR. Para cliente: SABORA-VISUAL-APPROVED HEAD_SHA client-home; para gestión: SABORA-VISUAL-APPROVED HEAD_SHA management-shell; para ambos: SABORA-VISUAL-APPROVED HEAD_SHA client-home,management-shell; para una modificación solo de política: SABORA-VISUAL-GATE-APPROVED HEAD_SHA. El validador verifica GitHub usuario jdlc86 y SHA; un nuevo commit invalida el comentario.
7. **Prohibición de firma delegada:** ningún agente/desarrollador debe escribir, simular ni publicar una aprobación humana, aunque pueda técnicamente publicar comentarios con la identidad vinculada. GitHub no diferencia criptográficamente a una persona de un agente que utiliza la **misma** cuenta; por ello la comprobación exige además inspección humana y protección de ramas.

## Cómo superar la puerta sin fingir una aprobación

- Recuperar la **imagen original** aprobada, o presentar una nueva referencia a la persona propietaria para que la apruebe explícitamente. No considerar aprobados los iconos del prototipo HTML.
- Crear PR documental con capturas exactas por pantalla/viewport/estado y su hash; obtener aprobación humana, registrar dato aprobado y consolidarlo en la **rama base** antes de modificar la UI.
- En la siguiente PR de UI conservar la estructura aprobada, adjuntar comparativa visual antes/después, capturas reproducibles, estados de catálogo, QR, anuncios (sin anuncio, anuncio con/sin imagen y error), móvil 390 y escritorio 1440 y los demás viewports aplicables, accesibilidad y test integrador. No reemplazar tests por minipruebas.
- Esperar a que los **workflows Chromium del mismo HEAD** concluyan correctamente y el usuario revise capturas. Tras su comentario exacto, volver a ejecutar el workflow visual para comprobarlo. Un SUCCESS de CI por sí solo nunca acredita aprobación de producto.
- **Si falta la imagen o la aprobación: BLOQUEADO.** No modificar la normativa ni reducir tests para conseguir verde.

## Lo que falta para que GitHub impida realmente la fusión

Este código puede **fallar un check**, pero GitHub no prohíbe fusionar una PR roja si no se configura la protección de las ramas de destino. Se requiere autorización y acción administrativa de la persona propietaria para activar **ruleset/branch protection** en ramas de integración destinatarias y, cuando proceda, main, exigiendo el status check Sabora visual contract governance / visual-contract-gate, los checks Chromium aplicables y evitando bypass administrativo.

**No se ha activado dicha protección.** Tampoco hay comparación automática píxel-a-píxel porque ninguna captura maestra ha sido aprobada: verificar existencia, hashes y resultados de Chromium es comprobable, pero la aceptación estética seguirá siendo un acto humano independiente. Producción NO-GO.

## Cierre documental y seguridad

Este mecanismo no realiza deploy, merge, migraciones en Supabase operativo ni operaciones de VPS; no toca Fleetia. Las pruebas de regresión del validador usan repositorios Git temporales y datos simulados para el metadata check, no representan una aprobación visual real. Guardar estado implementado/probado/validado/aceptado por separado y enlazar el hito con tablero y continuidad sesión 29.
