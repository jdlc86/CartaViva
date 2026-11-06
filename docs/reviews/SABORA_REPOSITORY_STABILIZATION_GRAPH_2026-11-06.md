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

## Conciliación semántica de las seis ramas terminales divergentes — 06-11-2026

**Corte auditado:** #49 = `aba9eb4b65cd3b546a8afffa2ef05b5d4658a218`; fuentes: comparaciones GitHub base común→HEAD histórica, hashes de blobs y lectura de contratos, código y nombres de pruebas. **Resultado de auditoría documental/estática, NO validación runtime de la HEAD actual.** Las seis HEAD históricas no son ancestros de #49. No hay rutas enteras ausentes, pero sí blobs distintos, por lo que ninguna PR queda automáticamente redundante.

| Terminal | Commits propios no ancestrales | Conciliación concreta y evidencia inspeccionada | Clasificación prudente |
| --- | ---: | --- | --- |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | 32 | Nueve rutas cambiadas respecto del ancestro `353e5160`: `App.tsx`, `client-state.ts`, E2E, test Node y cinco informes. Los **cinco informes** tienen SHA de blob **idéntico** en #49. Los **13 casos con nombre** de `tests/client-state.test.mjs` y los **ocho casos originales** de `apps/client/e2e/client-premium.spec.ts` siguen presentes por nombre; el candidato incluye 18 escenarios E2E y modelo de `selection` (opciones/extras), más la gestión histórica de incidencias, consentimiento explícito de precio y eventos `storage`. Los hashes del código/test difieren: NO afirmar paridad semántica integral ni equivalencia de comportamiento por mera coincidencia de nombres. | **CONTRATOS HISTÓRICOS LOCALIZADOS; PARIDAD FINAL PENDIENTE DE CI DEL SHA ACTUAL Y ACEPTACIÓN**, no cerrar PR |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) | 2 | `apps/api/src/order-operation-capability.mjs` y `tests/order-operation-capability.test.mjs` coinciden **byte a byte en blob SHA** con #49; otros contratos de seguridad/SQL han evolucionado. Mantener la garantía actor/SQL verificado y no restablecer migraciones antiguas. | **NÚCLEO DE CAPACIDAD PRESERVADO**, auditoría de límites globales pendiente |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | 4 | El informe `SABORA_H4_HTTP_READ_VALIDATION_2026-10-26.md` coincide por SHA, y las rutas `order-operations-http.mjs` y `tests/order-operations.test.mjs` están presentes con blobs posteriores distintos. La cobertura actual de lecturas H4 debe comprobarse sobre el mismo SHA que el resto de la API. | **FUENTE HISTÓRICA PRESERVADA; CONTRATO H4 EN VALIDACIÓN**, no cerrar |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | 11 | Sus 20 rutas exclusivas (modelos, navegación, lectura de mesas/catálogo, UI y pruebas) siguen presentes; la nueva interfaz M3 admite mutaciones autorizadas y proyección por rol. **No** confundir nueva implementación con aprobación visual de todos los estados. | **SUPERPOSICIÓN EVOLUTIVA CON M3; SEMÁNTICA Y VISUAL PENDIENTES** |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | 4 | Sus 23 rutas (cocina/sala, API, SQL y CI) existen en #49; los modelos de operación han evolucionado y los accesos se sellaron con capacidades y RLS. Reintroducir directamente su SQL/roles anteriores podría contradecir las restricciones actuales. | **FUNCIONALIDAD EVOLUCIONADA, NO AUTORIZADO REAPLICAR COMMITS** |
| [#31](https://github.com/jdlc86/CartaViva/pull/31) | 1 | Documento `docs/continuity/SESSION_13_H6_FULL_CODEX_BRIEF_2026-10-27.md` presente con blob distinto y longitud superior en el candidato: contenido histórico disponible, pero comparación de alcance y precedencia normativa obligatoria. Es un encargo/continuidad, **no normativa**. | **CONTEXTO PRESERVADO COMO DOCUMENTO; NO CIERRE AUTOMÁTICO** |

**Interpretación de números:** `32,2,4,11,4,1` son commits no ancestrales en seis terminales, no cantidad de defectos ni commits obligatorios a aplicar. Los cinco documentos idénticos de #22 son los de cesta/incidencias, integridad de selección, sincronización, consentimiento y revisión. Para la rama #22, la revisión del `App.tsx` nuevo identifica revalidación y confirmación económica en servidor; no se vuelve a tomar el precio local como autoridad de cobro.

### Estado de la corrección de permisos M3

Se inspeccionó el commit `a4229f1dca1a26c37b087da58996b2b320d5c2b8`: Fastify deriva `configure/qr/readiness/occupancy` de `request.verifiedStaff.role`; camarero puede preparar/cambiar ocupación y no configurar/rotar QR, administrador sí. El modelo PWA rechaza proyecciones extra o contradictorias; al cambiar permisos invalida snapshots. La prueba integradora existente en `scripts/ci/table-change-root-postgres17.test.mjs` recorre **PG17 + Fastify + Chromium**, alterna sesión de camarero y administrador, comprueba controles operativos/administrativos y recorre seis anchos (360/390/430/768/1024/1440). **Implementación comprobada por inspección, ejecución del cambio todavía no acreditada en GitHub Actions**; no atribuirle los 5/5 del SHA anterior `d075e735`.

### Decisión de saneamiento

**No hacer merge, rebase, force push, cierre masivo, borrado de ramas ni apertura de PR nuevo.** Conservar las seis terminales históricas y las diferencias intermedias documentales (#14, #40, #44) hasta disponer de evidencia de comportamiento en un único SHA candidato, revisión humana donde proceda y una decisión explícita de estrategia de integración. El avance verificable en este apartado es **la conciliación de contenido y riesgos**, no el cierre de los 42 PR.

**Puerta siguiente:** comprobar CI H6 consolidada sobre el candidato actual que incorpora `a4229f1d` (en particular recorrido PG17/Fastify/Chromium de roles M3), más pruebas cliente pertinentes y artefactos. Un commit exclusivamente documental no debe heredar automáticamente evidencia de su ancestro. Se mantiene `server.mjs` en `health-only`, producción **NO-GO**, y prohibición absoluta de tocar Fleetia, VPS o Supabase operativo sin autorización.
## Clasificación exhaustiva de ancestralidad de los 42 PR — 06-11-2026

Se comparó **cada una** de las 42 ramas HEAD de PR abiertos contra el candidato #49 `94f2b9446f3686b2b1f563bb8f0e2c3b9578da86` utilizando la API GitHub Compare. La relación de ancestro es de **historia Git**, no certificado de equivalencia funcional, aprobación de producto o integración en `main`.

| Relación Git HEAD histórica → candidato | PR | Total |
| --- | --- | ---: |
| HEAD ancestro exacto del candidato (behind = 0 al comparar HEAD→candidato) | #1, #2, #7, #10, #11, #12, #13, #15, #16, #23, #24, #25, #26, #27, #28, #29, #30, #32, #34, #36, #38, #41, #42, #43, #45, #46, #47 | **27** |
| HEAD no ancestro; contiene commits propios no presentes en historial de #49 | #4, #5, #8, #14, #17, #18, #19, #20, #21, #22, #31, #40, #44, #48 | **14** |
| Misma HEAD que el candidato | #49 | **1** |

**Los 14 PR divergentes no son 14 líneas de trabajo independientes:**

- **Familia H3 (#18–#22):** #18 es ancestro de #22 por 21 commits; #19 por 17, #20 por 11 y #21 por 7. Todos esos cambios exclusivos deben conciliarse bajo la auditoría semántica conjunta de #22, **sin declarar cuatro PR ya absorbidos**. Contra #49 presentan, respectivamente, 11/15/21/25/32 commits no ancestrales (los números se superponen y **no** se deben sumar).
- **Seis terminales históricas independientes de #49:** #4 (4 commits), #5 (11), #8 (2), #17 (4), #22 (32), #31 (1). Su conservación/alcance está detallado en la sección precedente; ninguna se cierra.
- **Ramas documentales intermedias:** #14 (1), #40 (1) y #44 (1) tienen historial divergente. Su reconciliación documental es independiente de la normativa y se debe comprobar sin sobrescribir documentos posteriores.
- **PR #48 (8 commits no ancestrales):** la incorporación de siete archivos desde su HEAD `ead7633b` a #49 fue por igualdad de blobs, no un merge; el PR aún presenta historia divergente frente a #49. No declararlo fusionado.
- **Otros 27 PR ancestros:** su historia es alcanzable desde #49, pero permanecen abiertos, Draft y con bases propias; Git no ha efectuado un merge a `main`. Cerrar o rebasar requiere decisión explícita después de verificar normativa, aprobación y plan de preservación.

**Regla de salida:** preparar un único dictamen de integración sobre SHA funcional validado, luego proponer qué PR retener, reorientar o cerrar sin ejecutarlo sin autorización. La documentación de este inventario es un hito de **conocimiento verificado del grafo**, no de saneamiento completado. Sigue faltando CI del cambio `a4229f1d`, revisión de divergencias en contenido y aceptación visual/operativa. `main` y producción **NO-GO**.
