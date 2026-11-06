# CartaViva / Sabora — Inventario verificable de integración y estabilización Git (06-11-2026)

**Naturaleza:** informe de auditoría y control de ramas, **no normativa**. Los documentos funcionales, técnicos y visuales normativos de GitHub prevalecen sobre este informe y sobre cualquier handoff. Prohibido interpretar este inventario como autorización de merge, despliegue, migración operativa o intervención en Fleetia. Repositorio examinado exclusivamente: `jdlc86/CartaViva`.

## Alcance comprobado

- Fuente: API de GitHub, lista completa de PR abiertos, ramas base/HEAD, comparaciones de commits (ancestry) y árboles Git recursivos. **42 PR abiertos, todos Draft**, en la observación realizada el 06-11-2026. `main` = `42b46358a76162445fa9e0b20e7b87dd0a640b5b`.
- La candidata consolidada corresponde al PR #49 `feat/sabora-cv012-independent-pwas-20261106`, basado en el PR #48. El SHA funcional `d075e735b53d20722183e32ebefbfd291fd74475` pasó cinco workflows del mismo SHA: [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42229103103), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42229103099), [Chromium cliente](https://github.com/jdlc86/CartaViva/actions/runs/42229103205), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42229103106), [CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42229103118). Bootstrap: 1.348/1.348 Node PASS, 51/51 PG17 PASS, 4/4 coste cero PASS, cero SKIP en esos bloques.
- `d18707587aa9aa9d820b8f0dd0b02bae68044345` fue actualización **exclusivamente documental**, sin CI propio.
- La corrección integrada M3 de proyección de permisos servidor→PWA `a4229f1dca1a26c37b087da58996b2b320d5c2b8` está **implementada, pero todavía SIN CI observado al redactar este inventario**. No atribuirle resultados verdes de `d075e735`.

## Topología real de los 42 PR (PR hijo → PR base)

La lista es **topología declarada de GitHub**, no garantía de que la rama base actual sea ancestro exacto de cada HEAD. Una rama puede haber avanzado después de crearse el PR.

```text
main <- #1 <- #2 <- #7 <- #13 <- #14 <- #15 <- #16
#2 <- #4, #5
#7 <- #8, #10, #11 <- #12
#16 <- #17, #18 <- #19 <- #20 <- #21 <- #22
#16 <- #23 <- #24 <- #25 <- #26 <- #27 <- #28
#28 <- #31
#28 <- #29 <- #30 <- #32 <- #34 <- #36 <- #38 <- #40
#40 <- #41, #42 <- #43 <- #44 <- #45 <- #46 <- #47 <- #48 <- #49
```

**Diez ramas terminales** de este grafo: #4, #5, #8, #10, #12, #17, #22, #31, #41, #49. Entre las nueve terminales históricas, las HEAD de **#10, #12 y #41** son ancestros Git del candidato #49; las de **#4, #5, #8, #17, #22 y #31** presentan divergencia de commits. El hecho de que #10/#12/#41 sean ancestros no autoriza a cerrar sus PR sin comprobar además sus bases, revisiones y documentación.

## Ramas históricas terminales con commits no ancestrales

| PR | Commits propios respecto al ancestro pertinente | Ámbito de sus archivos de cambio | Tratamiento seguro |
| --- | ---: | --- | --- |
| #4 | 4 | cocina, sala, SQL de operaciones, gestión y CI | conciliar contenido vigente; no incorporar ciegamente permisos SQL antiguos |
| #5 | 11 | modelo de lectura y presentación de gestión | contrastar con M3 vigente y diseño aprobado |
| #8 | 2 | actor SQL y capacidades firmadas | conservar controles actuales; revisar cambios conceptuales |
| #17 | 4 | lectura H4 y validación de consultas HTTP | cotejar contrato y tests actuales |
| #22 | 32 | cesta, selección cliente, consentimiento de precio y sincronización entre pestañas | revisión funcional prioritaria: riesgo de divergencia de UX |
| #31 | 1 | encargo H6 documental | preservar decisiones sin elevar el encargo a norma |

De manera adicional, las ramas intermedias #14, #40 y #44 contienen commits documentales no ancestrales (uno cada una según comparación), y otras ramas históricas tienen bases desfasadas. Mantener registro explícito antes de cerrar o retargetear PR.

## Inventario de archivos y alcance de la evidencia

La comparación de árboles completos de las **diez ramas terminales** muestra que todos los **paths** de archivos presentes en ellas aparecen también en #49: no hay un archivo completo ausente. En la instantánea observada, el candidato tenía **859 blobs**; las nueve ramas históricas tenían entre 377 y 718 archivos cada una y contenidos diferentes en numerosos blobs.

**Este dato NO acredita equivalencia de código**: archivos con igual ruta y hash diferente pueden contener una implementación posterior correcta, una regresión o un cambio exclusivo perdido. Para declarar redundante cada rama hace falta comprobar diff semántico respecto al ancestro común, normativa afectada y evidencias integradas. En particular, las 32 confirmaciones exclusivas de #22 no se dan por absorbidas solo por compartir rutas.

## Gate de estabilización, no plan de desarrollo funcional

1. **Conservar el trabajo:** no cerrar masivamente PR, eliminar ramas, forzar referencias, fusionar con `main` ni modificar documentos normativos. El PR #49 se mantiene Draft como candidato técnico; no crear PR adicionales mientras dure este saneamiento.
2. **No confundir dos integraciones:** el contenido de siete archivos M3 de #48 se transfirió a #49 con hashes idénticos y sin solapamiento de rutas propias de CV-012, pero el historial de #48 y #49 **continúa divergente**. Un snapshot equivalente no es un merge de ramas.
3. **Calidad central:** mantener los 1.348 tests Node ampliados, PG17 real con migraciones, API autenticada, concurrencia, Chromium y los cinco workflows sobre **un único SHA**. Las pruebas de permisos M3 recién añadidas deberán aprobar la misma puerta completa y no alterar SQL de producción ni la instalación de Fleetia.
4. **Compatibilidad funcional:** resolver presentación por rol de gestión a partir de identidad verificada en servidor y control real de operaciones en PG17; documentar aprobaciones visuales que siguen pendientes sin inventar capturas aprobadas.
5. **Ramas históricas:** conciliar cambios exclusivos con un registro rama→requisito→implementación actual→prueba del SHA final, especialmente #22; clasificar cada PR como preservado/pendiente/sustituido **con evidencia**, antes de solicitar autorización de cierre o merge.
6. **Separación de estados:** implementación, pruebas ejecutadas y aceptación humana/operativa son tres columnas diferentes. `server.mjs` continúa `health-only`; M1/F/R, Stripe sandbox, caja, aprobación visual, M6, recuperación e infraestructura operativa continúan NO-GO.

**Diagnóstico a esta fecha:** la candidatura M3+CV-012 cuenta con una base técnica CI válida en `d075e735`. La revisión de 42 PR y diferencias ancestrales **no está cerrada semánticamente**, y la nueva corrección M3 queda en validación. No hay permiso de despliegue ni de modificación del VPS/Supabase/Fleetia.
