# Sabora — entrega Codex Desktop de la interfaz administrativa

Fecha: 2026-10-23. Estado: **implementación frontend completa no operativa, PR Draft sin merge ni despliegue**.

## Referencias de Git

- Repositorio: `jdlc86/CartaViva`.
- Rama base: `feat/sabora-pnpm-bootstrap`.
- SHA base leído y usado al crear la rama: `3d59539f9216fa05ebc460b074f82d76516a14d2`.
- Rama de trabajo: `feat/sabora-management-ui`.
- SHA final del bloque de código, pruebas y capturas: `69ea6cf` (`feat(management): build complete admin workspace`).
- Pull request: [#3 — feat(management): complete Sabora admin workspace](https://github.com/jdlc86/CartaViva/pull/3), **Draft**, con base `feat/sabora-pnpm-bootstrap`.
- El commit que incorpora este informe es posterior al SHA de código anterior. El HEAD exacto de entrega se consulta en el PR, ya que un archivo versionado no puede autorreferenciar el SHA del commit que lo contiene.

## Alcance implementado

La PWA de gestión se ha convertido de una maqueta mínima en un espacio administrativo modular, responsive y coherente con la dirección visual aprobada. No incorpora datos ficticios ni crea una apariencia de operación conectada.

### Resumen

- Centro operativo con las métricas documentadas: ventas netas, recaudación cobrada, saldo pendiente, pedidos confirmados y ticket medio.
- Periodos documentados, gráfico y ranking sin cifras simuladas.
- Tratamiento visual explícito de carga, vacío y error.
- Última actualización y variaciones permanecen sin valor hasta recibir una proyección autorizada.

### Mesas y QR

- Workbench maestro-detalle para inventario y ficha de mesa.
- Campos documentados: número, capacidad, descripción y estado operativo.
- Estados visibles `EN_PREPARACION`, `LISTA` y `BLOQUEADA`; controles de transición deshabilitados.
- Área QR sin patrón, token ni credencial de demostración. Emisión, rotación, revocación e impresión están deshabilitadas.
- Nota contractual para la política por mesa «Exigir pago conforme se pide».

### Catálogo

- Espacios separados para platos, categorías y Estudio de imágenes.
- Ficha editorial con distinción entre borrador, publicado, agotado y retirado.
- Guardar borrador, publicar, retirar, crear plato y crear categoría permanecen deshabilitados.
- Categorías descritas como proyección dinámica; «Todos» no se presenta como categoría persistida.

### Estudio de imágenes con IA de Google

- Selección local de una imagen y vista previa mediante `URL.createObjectURL`, con revocación del objeto al cambiar o retirar el archivo.
- Formatos de revisión 5:4 (1000 × 800), 4:3 (1200 × 900) y 1:1 (400 × 400).
- Comparación visual entre original y panel de versión derivada pendiente.
- Aviso de fidelidad y revisión humana obligatoria.
- No existe petición de red, subida, credencial, modelo, endpoint ni simulación de resultado. «Mejorar con Google», aprobar y aplicar permanecen deshabilitados.

### Comandas

- Espacios de Cocina, Sala y Reservas, manteniendo las reservas separadas de los pedidos presenciales.
- Resumen vacío, filtros y acciones de transición/incidencia deshabilitados.
- No se simulan comandas, tiempos, notificaciones ni cambios de estado.

### Equipo y accesos

- Presentación del modelo de roles `ROOT`, `ADMIN`, camarero y cocina.
- ROOT descrito como gobierno excepcional, no escritor administrativo ordinario.
- Varios ADMIN permitidos y como máximo uno con titularidad de escritura.
- Directorio vacío sin identidades ficticias; invitación, activación, suspensión y gestión de titularidad deshabilitadas.

## Diseño y accesibilidad

- Reutilización de la identidad Sabora V3 y copia app-local del SVG aprobado para que Vite lo sirva sin depender de rutas documentales.
- Paleta aprobada: canvas `#F8F7F4`, superficie `#FFFFFF`, tinta `#202622`, marca `#146B57` y acento `#D98B45`.
- Gestión desktop/tablet-first con navegación lateral; navegación horizontal desplazable en móvil.
- Objetivos táctiles de 44 px, foco visible, semántica de botones, etiquetas de campos, mensajes `status`/`alert` y estados que no dependen sólo del color.
- Movimiento breve basado en CSS y anulado con `prefers-reduced-motion`.
- Sin biblioteca UI nueva, sin fuentes remotas y sin cambios del lockfile.
- Revisión responsive instrumental a 360, 390, 430, 768, 1024 y 1440 px: sin desbordamiento horizontal.

Capturas versionadas:

- [Mesas y QR, escritorio 1440 px](../../apps/management/docs/screenshots/mesas-desktop-1440.png).
- [Estudio de imágenes, móvil 390 px](../../apps/management/docs/screenshots/estudio-mobile-390.png).

Las capturas muestran estados desconectados reales de la interfaz, no fixtures de producto.

## Archivos

- `apps/management/src/main.tsx`: shell, navegación y aviso de estado no operativo.
- `apps/management/src/style.css`: tokens, componentes, layouts, responsive y reducción de movimiento.
- `apps/management/src/components/Icon.tsx`: familia única de iconos lineales sin dependencia externa.
- `apps/management/src/components/Primitives.tsx`: cabeceras, botones bloqueados, estados vacíos, avisos y definiciones.
- `apps/management/src/views/SummaryView.tsx`: dashboard informativo vacío.
- `apps/management/src/views/TablesView.tsx`: mesas y ciclo visual QR.
- `apps/management/src/views/CatalogView.tsx`: catálogo y categorías.
- `apps/management/src/views/ImageStudio.tsx`: selección y comparación local de imágenes.
- `apps/management/src/views/OrdersView.tsx`: comandas de cocina/sala y reservas.
- `apps/management/src/views/TeamView.tsx`: personal, roles y titularidad.
- `apps/management/tests/ui-contract.test.mjs`: guardias de alcance, seguridad, bloqueo y diseño.
- `apps/management/public/sabora-logo.svg`: activo Sabora V3 aprobado para la aplicación.
- `apps/management/docs/screenshots/*.png`: evidencias responsive.
- `apps/management/index.html` y `package.json`: metadatos de la aplicación y script local de pruebas, sin dependencias nuevas.

## Validaciones ejecutadas

| Comando o comprobación | Resultado |
| --- | --- |
| `pnpm --filter @sabora/management test` | PASS, 5/5 pruebas locales |
| `apps/management/node_modules/.bin/tsc.CMD --noEmit -p apps/management/tsconfig.json` | PASS, sin diagnósticos |
| `node --test tests/management-scaffold.test.mjs` | PASS, 3/3 guardias heredadas |
| `pnpm test` | PASS, 519/519 pruebas del monorepo |
| `pnpm build` | PASS, API + PWA cliente + PWA gestión |
| Navegador local `http://127.0.0.1:4173` | PASS, sin errores ni avisos de consola observados |
| Viewports 360/390/430/768/1024/1440 | PASS, `scrollWidth <= innerWidth` en todos |
| Mesas y QR en navegador | 8 controles bloqueados; 0 elementos `canvas` QR |
| Estudio en navegador | Selector local habilitado; 3 ratios; acción Google deshabilitada |
| `git diff --check` | PASS |

## GitHub Actions

- Ejecuciones iniciales del SHA de código `69ea6cf`: `generate-lockfile` [run 39940316395](https://github.com/jdlc86/CartaViva/actions/runs/39940316395) y `validate` [run 39940316403](https://github.com/jdlc86/CartaViva/actions/runs/39940316403).
- Ambas ejecuciones terminaron en **failure** dentro de la prueba PostgreSQL 17 compartida `scripts/ci/catalog-postgres17-driver-integration.test.mjs`, subprueba «PG17 independently rejects expired visit and expired customer session»: la inserción del fixture fue rechazada por `customer_table_visit_lifetime` (`SQLSTATE 23514`). Las diez subpruebas PostgreSQL anteriores habían pasado.
- El mismo fallo se reprodujo en ejecuciones directas de la rama base posteriores al punto de bifurcación, entre ellas `Sabora CI` [run 39940516116](https://github.com/jdlc86/CartaViva/actions/runs/39940516116) y `Bootstrap Sabora lockfile` [run 39940516044](https://github.com/jdlc86/CartaViva/actions/runs/39940516044), ambas sobre `15b27a89`.
- No hubo un fallo atribuible a `apps/management/**`: las pruebas, comprobación TypeScript y build de la aplicación pasaron localmente. La reparación de la prueba PostgreSQL pertenece al bloque backend concurrente y, conforme al aislamiento del encargo, no se modificó desde esta rama.
- La ejecución más reciente observada de la rama base, `Sabora CI` [run 39940617788](https://github.com/jdlc86/CartaViva/actions/runs/39940617788) sobre `0b5f44b8`, también terminó en **failure** en esa subprueba, esta vez al ser rechazado el fixture por `customer_session_expiry_check` (`SQLSTATE 23514`); 11/12 subpruebas PostgreSQL pasaron. El estado definitivo de las Actions del HEAD entregado se verificará en el PR después de publicar este commit documental.

## Dependencias y límites pendientes

1. No existe contrato operativo de autenticación/sesión para la PWA de gestión; no se ha inventado uno.
2. No existen endpoints administrativos autorizados para dashboard, catálogo, mesas/QR, comandas o equipo. Las pantallas están preparadas para recibir proyecciones, pero todas las mutaciones permanecen cerradas.
3. La generación Google requiere backend, proveedor/modelo verificado, credenciales, cuotas, almacenamiento privado, auditoría y contratos de publicación. Ninguno se ha simulado.
4. El selector local de imagen sólo ofrece previsualización. La validación autoritativa de MIME, peso, contenido y metadatos corresponde al futuro backend.
5. No hay datos reales ni fixtures productivos. Por ello no se han validado densidad con listas largas, estados autorizados reales ni rendimiento de imágenes de catálogo.
6. Las capturas son evidencia de implementación, no baselines visuales congelados ni aprobación de activos fotográficos.
7. La integración futura debe conservar el bloqueo por defecto y comprobar identidad, rol, estado durable y titularidad en servidor; habilitar un botón nunca será autorización suficiente.

## Operaciones no realizadas

- No se hizo merge ni se cambió el estado Draft del PR.
- No se desplegó en VPS ni se reinició contenedor, red, volumen o servicio alguno.
- No se accedió ni modificó Fleetia.
- No se aplicaron migraciones ni cambios a Supabase operativo.
- No se usaron Gemini, Vertex AI, Google APIs, claves, secretos ni servicios de pago.
- No se modificaron `apps/api/**`, `apps/client/**`, `supabase/**`, `scripts/ci/**`, `.github/workflows/**` ni documentos compartidos de continuidad/arquitectura.

## Siguiente bloque recomendado

Definir con el asistente principal un contrato de lectura administrativa autenticada por recurso. Empezar por una proyección read-only de mesas y catálogo con estados vacíos/error versionados, manteniendo las mutaciones deshabilitadas. Después conectar cada acción por separado sólo cuando exista endpoint, autorización transaccional, auditoría e idempotencia acreditadas. El Estudio de imágenes debe ser el último flujo de escritura en activarse, después de storage privado y control de coste.

---

## Fase 2 — Estudio de imágenes preparado para integración futura

Fecha: 2026-10-23. Rama: `feat/sabora-management-ui`. Estado: **frontend local completo; generación, persistencia, aprobación durable, asociación y publicación bloqueadas**.

### Flujo y experiencia implementados

- Flujo guiado de cinco pasos: seleccionar, configurar, revisar, aprobar y preparar publicación. Sólo los tres primeros pueden recorrerse localmente; aprobar y publicar exigen contrato y resultado del servidor.
- Selección local con validación de tipo de archivo, error recuperable si el navegador no puede decodificar la imagen y limpieza inmediata al sustituirla, retirarla o desmontar la vista.
- Controles de intención para iluminación, encuadre, fondo y presentación. Su texto exige conservar ingredientes, ración, composición e identidad; no construyen ni envían instrucciones a un proveedor.
- Formatos documentados exactos: 5:4 (1000 × 800), 4:3 (1200 × 900) y 1:1 (400 × 400), con uso previsto visible.
- Revisión original/resultado. El original admite visor modal y zoom por teclado; el resultado permanece vacío y declara que no existe una respuesta de IA.
- Patrones visibles de carga, error, rechazo y aprobación, identificados como contrato de interfaz y no como estados activos o datos de demostración.
- Biblioteca filtrable preparada para originales, derivadas y aprobadas, siempre vacía mientras no exista almacenamiento privado autorizado.
- Asociación visual `versión aprobada → plato → borrador editorial`, con selector y acciones deshabilitados. Asociar, preparar y publicar siguen siendo operaciones distintas.
- Responsive revisado en 360, 390, 430, 768, 1024 y 1440 px sin desbordamiento horizontal. El flujo usa desplazamiento horizontal acotado sólo en su stepper y navegación móvil.

### Decisiones técnicas

1. La configuración previa y el filtrado de una biblioteca vacía son estado efímero React; no se usa `localStorage`, `sessionStorage`, cookies ni red.
2. `createImagePreviewController` centraliza la propiedad de cada `blob:` URL y garantiza revocación una sola vez en reemplazo, limpieza y desmontaje.
3. El modelo de navegación es independiente de React y se prueba con Node: revisar exige imagen y al menos un ajuste; aprobar y publicar nunca se habilitan localmente.
4. Los estados futuros se muestran como especificación visual, no mediante un conmutador de demostración. No se incluyen resultados, platos, identificadores ni metadatos ficticios.
5. Se mantiene la identidad aprobada, los componentes existentes, objetivos táctiles de 44 px, foco visible, diálogo nativo, etiquetas accesibles y `prefers-reduced-motion`. No se añadieron dependencias.

### Contratos backend necesarios antes de conectar el Estudio

Los siguientes contratos deben definirse y aprobarse sin deducir rutas HTTP ni nombres de tablas desde esta interfaz:

1. **Identidad y autorización administrativa:** sesión verificada por backend, membresía durable activa, rol permitido y titularidad de escritura revalidada en la misma operación. Ningún actor, rol o permiso enviado por el navegador es autoridad.
2. **Ingreso del original:** límites autoritativos de MIME, bytes, dimensiones y contenido; procedencia/licencia; digest; idempotencia; conservación inmutable del original y respuesta JSON versionada.
3. **Almacenamiento privado:** identidad y relación entre original y derivadas, acceso de lectura autorizado, URLs temporales o mecanismo equivalente, retención, borrado y aislamiento respecto a los activos publicados.
4. **Solicitud de mejora:** proveedor/modelo/región verificados, parámetros permitidos, ratio, instrucción restrictiva de fidelidad construida en servidor, correlación, idempotencia, cuotas, concurrencia, timeout y límites de coste. Las credenciales Google permanecen exclusivamente en backend.
5. **Ciclo de estado:** contrato versionado para consultar trabajo y resultado, incluidos progreso, fallo recuperable, rechazo y aprobación; reglas de reintento sin duplicar consumo ni versiones.
6. **Metadatos de derivación:** referencia al original, proveedor y versión de modelo, autor verificado, fecha de servidor, parámetros permitidos, formato real, coste/consumo disponible y comprobación del procesamiento determinista cuando el proveedor no entregue dimensiones exactas.
7. **Revisión humana:** operaciones autorizadas e idempotentes para rechazar o aprobar una versión, con motivo cuando proceda, bloqueo concurrente, auditoría append-only y prohibición de sobrescribir el original.
8. **Biblioteca:** lectura administrativa paginada y acotada de originales/derivadas/aprobadas; estados y metadatos suficientes sin exponer objetos privados directamente ni datos de cliente.
9. **Asociación con catálogo:** selección de una versión aprobada y asociación al borrador de un plato existente con control de versión y auditoría. Esta operación no puede publicar por sí sola.
10. **Publicación explícita:** integración separada con el contrato de publicación del catálogo, validación del snapshot y reversibilidad; la imagen sólo pasa a exposición pública tras una publicación autorizada confirmada.
11. **Eventos y recuperación:** resultado confirmado antes de notificar, deduplicación, recuperación puntual y ausencia de polling de negocio periódico, conforme al contrato general de eventos.
12. **Privacidad y operación:** política de tratamiento/retención de Google, región, observabilidad sin secretos, protección contra metadatos no confiables, rate limiting y comportamiento de indisponibilidad sin bloquear la edición ordinaria del catálogo.

Ninguno de estos contratos, endpoints, tablas, credenciales, jobs o integraciones se ha implementado en esta rama.

### Archivos de la Fase 2

- `apps/management/src/views/ImageStudio.tsx`: flujo, configuración, comparación, visor, estados, biblioteca y asociación.
- `apps/management/src/image-studio-model.js` y `.d.ts`: pasos, formatos, controles y validaciones puras.
- `apps/management/src/image-preview-lifecycle.js` y `.d.ts`: ciclo de vida de recursos temporales.
- `apps/management/src/components/Icon.tsx`: iconos lineales de zoom, cierre y biblioteca.
- `apps/management/src/style.css`: layouts desktop/móvil, estados, diálogo y controles accesibles.
- `apps/management/tests/image-studio-behavior.test.mjs`: navegación, validación, ratios y limpieza de URLs.
- `apps/management/tests/ui-contract.test.mjs`: guardias de seguridad y acciones privilegiadas ampliadas.

### Validación de la Fase 2

| Comando o comprobación | Resultado |
| --- | --- |
| `pnpm --filter @sabora/management test` | PASS, 9/9 |
| `apps/management/node_modules/.bin/tsc.CMD --noEmit -p apps/management/tsconfig.json` | PASS |
| `node --test tests/management-scaffold.test.mjs` | PASS, 3/3 |
| `pnpm --filter @sabora/management build` | PASS, 38 módulos; JS 264,49 kB y CSS 35,45 kB antes de gzip |
| `pnpm test` | PASS, 519/519 |
| Navegación real | PASS: selección → configuración → revisión; aprobación/publicación bloqueadas |
| Archivo no imagen | PASS: error anunciado y configuración inaccesible |
| Visor ampliado | PASS: diálogo accesible, cierre y zoom por teclado |
| Responsive | PASS en 360/390/430/768/1024/1440; sin overflow horizontal |
| Consola del navegador | PASS, sin errores ni avisos observados |

El build necesitó ejecutarse fuera del sandbox local porque `esbuild` no podía leer `vite.config.ts` bajo ese aislamiento; el mismo comando terminó correctamente.

GitHub Actions del commit de código de Fase 2 `f94fdc8191dfa6ff0731251aed6de579bd902601`:

- `Sabora CI` [run 39946469295](https://github.com/jdlc86/CartaViva/actions/runs/39946469295): **SUCCESS**, incluidas pruebas, migraciones PostgreSQL 17, driver real, build, Compose, imagen API y smoke tests aislados.
- `Bootstrap Sabora lockfile` [run 39946469297](https://github.com/jdlc86/CartaViva/actions/runs/39946469297): **SUCCESS**.

### Operaciones no realizadas en la Fase 2

- Sin llamadas, SDK, credenciales ni resultados Gemini, Vertex AI o Google APIs.
- Sin backend, Supabase, almacenamiento remoto, migraciones, endpoints, fixtures operativos ni lockfile nuevo.
- Sin merge, despliegue, VPS, contenedores o cambios en Fleetia.

---

## Hito posterior — navegación y lectura administrativa de mesas (2026-10-24)

### Referencia y alcance

- Rama aislada: `codex/sabora-management-tables-workspace`.
- Base verificada: `origin/feat/sabora-pnpm-bootstrap` en `8297a71cbc776574fbb055078c0326af4d46a247`.
- PR administrativo anterior [#3](https://github.com/jdlc86/CartaViva/pull/3): `MERGED` en la base antes de abrir esta rama. PR #2 permanece Draft y no se modifica directamente.
- Alcance exclusivo: `apps/management/**` y este handoff. No se incorporan los cambios backend/cocina del PR paralelo #4.

El hito convierte la navegación y el workbench de Mesas en una frontera frontend completa de **solo lectura**, preparada para recibir la proyección administrativa versionada existente sin activar por sí misma ninguna conexión. La aplicación distribuida continúa sin transporte, sesión ni datos por defecto.

### Funcionalidad implementada

1. Navegación profunda mediante `#resumen`, `#catalogo`, `#mesas`, `#comandas` y `#equipo`, compatible con historial atrás/adelante.
2. Movimiento de foco al área cargada tras navegar, anuncio `aria-live`, `aria-current` y marca accesible que devuelve al Resumen.
3. Puerto inyectable `AdminTablesGateway`; el entrypoint de producción no lo instancia y no contiene `fetch`, credenciales ni almacenamiento del navegador.
4. Validación cerrada del contrato `version: 1`: solo admite `id`, `number`, `capacity`, `description` y `orderingState`; rechaza claves extra, accessors, UUID/enteros/estados inválidos, desorden, duplicados y cursores inconsistentes.
5. Estados de interfaz desconectado, carga, error recuperable, vacío y datos disponibles; un error inicial descarta cualquier respuesta parcial.
6. Paginación keyset manual, sin reintentos ocultos ni polling. Un fallo al cargar más conserva la página ya validada y ofrece reintento explícito.
7. Inventario seleccionable, filtro local sobre páginas cargadas y ficha maestro-detalle responsive.
8. Limpieza de solicitudes mediante `AbortController` al desmontar o sustituir la dependencia.
9. QR, alta de mesa, cambios de estado y política de pago continúan deshabilitados. La proyección no acepta ni representa hashes, tokens o sesiones QR.

### Conciliación de estados

La primera entrega visual mostraba `EN_PREPARACION`, `LISTA` y `BLOQUEADA`, procedentes del borrador funcional inicial. El contrato consolidado posterior y la proyección administrativa efectiva exponen `open`, `paused` y `closed`. Este hito utiliza esa evidencia más reciente y muestra las etiquetas `ABIERTA`, `PAUSADA` y `CERRADA`, sin crear una traducción ficticia entre dos máquinas de estado distintas. Las transiciones permanecen bloqueadas.

### Archivos del hito

- `apps/management/src/navigation-model.js` y `.d.ts`: rutas permitidas y normalización fail-safe.
- `apps/management/src/tables-read-model.js` y `.d.ts`: gateway, DTO versionado, validación y unión de páginas.
- `apps/management/src/main.tsx`: navegación por URL, historial, foco y dependencia de lectura opcional.
- `apps/management/src/views/TablesView.tsx`: ciclo completo de lectura, paginación, filtro, selección y detalle.
- `apps/management/src/components/Primitives.tsx`: estados reutilizables de carga y error y aviso con tono de lectura.
- `apps/management/src/style.css`: lista de mesas, estados, navegación y responsive conforme a tokens aprobados.
- `apps/management/tests/navigation-model.test.mjs`, `tables-read-model.test.mjs` y `ui-contract.test.mjs`: navegación, contrato hostil, ausencia de reintentos implícitos y bloqueo de mutaciones.

### Validaciones locales

| Comando o comprobación | Resultado |
| --- | --- |
| `pnpm --filter @sabora/management test` | PASS, 17/17 |
| `apps/management/node_modules/.bin/tsc.CMD --noEmit -p apps/management/tsconfig.json` | PASS |
| `node --test tests/management-scaffold.test.mjs` | PASS, 3/3 |
| `pnpm --filter @sabora/management build` | PASS, 40 módulos; JS 273,46 kB y CSS 39,23 kB antes de gzip |
| `pnpm test` | PASS, 603/603 |
| `pnpm build` | PASS, API + PWA cliente + PWA gestión |
| Navegación local Catálogo → atrás → Mesas | PASS; URL, título y foco del área correctos |
| Consola del navegador | PASS; 0 errores y 0 avisos observados |
| Viewports 360/390/430/768/1024/1440 | PASS; sin desbordamiento horizontal |
| `git diff --check` | PASS |

Las capturas PNG versionadas existentes pertenecen a la entrega anterior y no se sustituyen en este hito. La revisión actual se realizó instrumentalmente sobre la aplicación local; no se añadieron fixtures ni imágenes binarias nuevas al producto.

### Contratos pendientes antes de conectar la lectura

1. Bootstrap de la PWA de gestión que obtenga una identidad de personal verificada y construya el gateway sin aceptar rol o actor desde la interfaz.
2. Decisión explícita de montar la composición opt-in de `GET /api/v1/admin/tables`; en la base actual `server.mjs` no la registra.
3. Configuración autorizada de origen, transporte de credencial, expiración/revocación y tratamiento de `401/403/503`; no se inventa en este hito.
4. Identidad PostgreSQL operativa y preflight de mínimos privilegios aprobados para el entorno real; las pruebas candidatas no autorizan producción.
5. Contratos independientes para alta/edición de mesa, transiciones, política de pago, emisión/rotación/revocación/impresión QR y auditoría. Ninguna de esas operaciones puede reutilizar el lector.
6. Contratos de dashboard, catálogo, equipo y restantes proyecciones; no se generaliza el gateway de mesas a recursos no documentados.

### Límites y operaciones no realizadas

- No se implementó backend, endpoint, autenticación, PostgreSQL, migración, RLS o credencial.
- No se añadió un transporte HTTP por defecto ni se simuló una sesión administrativa.
- No se incluyeron datos de demostración, polling, WebSocket, almacenamiento local ni QR ficticio.
- No se modificó Fleetia, VPS, Supabase operativo, Google ni otro servicio externo.
- No se hizo merge ni despliegue.
- La evidencia de GitHub Actions de esta rama se añadirá al PR Draft después de publicar el commit; un verde de la base no sustituye el del SHA entregado.

### Siguiente bloque recomendado

Cuando el backend autorice y monte la lectura de mesas, crear la composición runtime mínima que implemente `AdminTablesGateway` y probar `401/403/503`, expiración y revocación sin relajar la validación frontend. Después, aplicar el mismo patrón a una proyección administrativa de catálogo **solo si** aparece su contrato versionado; no activar mutaciones de mesa o QR como parte de esa integración de lectura.

---

## Hito posterior — lectura del catálogo publicado (2026-10-24)

### Referencia y alcance

- Rama aislada: `codex/sabora-management-tables-workspace`; PR Draft #5 con base `feat/sabora-pnpm-bootstrap`.
- Base remota comprobada antes de editar: `a79a3edf8fd603a8b3694e91fbc6ddac78d50d14`. Su avance desde `8297a71` no introduce diferencia de árbol respecto al punto de bifurcación de esta rama.
- Commit funcional: `c057550ae14fca392423f3c89c27fc9855ab2831` (`feat(management): add published catalog read workspace`).
- Alcance exclusivo: `apps/management/**` y este handoff. No se modifican API, cliente, PostgreSQL, migraciones, workflows ni el PR paralelo #4.

El hito utiliza el contrato ya versionado por `createVerifiedAdminCatalogReader`: envelope `version: 1`, `scope: 'published'` y elementos públicos `id`, `name`, `category`, `priceCents`, `available` y `allergens`. No generaliza esta lectura a borradores ni usa la ruta pública no montada como si fuese autenticación administrativa.

### Funcionalidad implementada

1. Puerto inyectable `AdminCatalogGateway`; el entrypoint distribuido no lo instancia y no contiene `fetch`, credenciales ni persistencia del navegador.
2. Validación cerrada del envelope y de cada plato: objetos de datos planos, allowlist exacta, UUID único, nombre acotado, categorías documentadas por el DTO vigente, céntimos enteros no negativos, disponibilidad booleana y alérgenos acotados.
3. Rechazo previo a lectura de propiedades accesoras en platos y arrays de alérgenos; las respuestas inválidas no producen una vista parcial.
4. Estados desconectado, carga, error recuperable, vacío y datos disponibles. La carga ocurre al entrar y el reintento es explícito, sin polling ni reintentos ocultos.
5. Exploración maestro-detalle del catálogo publicado, selección accesible, búsqueda local por nombre/categoría/alérgeno y filtros locales de categoría.
6. Precio presentado desde céntimos mediante formato EUR; agotado permanece visible y marcado como no disponible.
7. Categorías visibles derivadas únicamente de los platos publicados recibidos. `Todos` se conserva como filtro virtual y no se representa como registro persistido.
8. La ficha identifica que la fotografía no forma parte de la proyección v1. Borrador, creación, retirada y publicación continúan mediante controles deshabilitados.
9. El estado global sólo anuncia «lectura parcial» si se inyecta una proyección de mesas o catálogo; por defecto la compilación sigue en modo no operativo.

### Archivos del hito

- `apps/management/src/catalog-read-model.js` y `.d.ts`: gateway, DTO versionado, validación cerrada, búsqueda y formato monetario.
- `apps/management/src/views/CatalogView.tsx`: ciclo de lectura, estados, filtros, selección, detalle publicado y agrupación de categorías.
- `apps/management/src/main.tsx`: inyección opcional e independiente del gateway de catálogo.
- `apps/management/src/style.css`: lista, filtros y categorías responsive mediante tokens aprobados.
- `apps/management/tests/catalog-read-model.test.mjs`: contrato válido, payloads hostiles, una sola solicitud, cancelación, filtros y precios.
- `apps/management/tests/ui-contract.test.mjs`: guardias de desconexión por defecto, estados y bloqueo de mutaciones.

### Validaciones

| Comando o comprobación | Resultado |
| --- | --- |
| `pnpm --filter @sabora/management test` | PASS, 24/24 |
| `apps/management/node_modules/.bin/tsc.CMD --noEmit -p apps/management/tsconfig.json` | PASS |
| `pnpm --filter @sabora/management build` | PASS fuera del sandbox local; 41 módulos, JS 280,37 kB y CSS 41,90 kB antes de gzip |
| `pnpm test` | PASS, 603/603 |
| `pnpm build` | PASS, API + PWA cliente + PWA gestión |
| Navegador 1440 × 1000 y 390 × 844 | PASS, Catálogo desconectado, controles privilegiados bloqueados y sin overflow de página |
| Consola del navegador | PASS, 0 errores y 0 avisos |
| `git diff --check` del bloque funcional | PASS |

El primer intento de build dentro del sandbox de Windows falló porque esbuild no podía leer `vite.config.ts`; la repetición autorizada fuera de ese aislamiento terminó correctamente. No es un fallo de TypeScript ni del bundle.

### Dependencias antes de conectar el gateway

1. Una composición runtime administrativa que obtenga identidad verificada y membresía ADMIN durable en servidor. El navegador no puede aportar rol, actor ni titularidad como autoridad.
2. Un contrato HTTP autenticado y versionado que entregue exactamente `{version: 1, scope: 'published', items}`. La ruta pública candidata `GET /api/v1/catalog` devuelve un array y permanece sin montar; no implementa este gateway administrativo.
3. Pool/login de lectura catalogado con mínimos privilegios, preflight de identidad efectivo y activación expresamente autorizada. Las pruebas candidatas no aprovisionan producción.
4. Tratamiento documentado de `401`, `403`, `503`, revocación y expiración al construir el adaptador HTTP; no se deduce en la vista.
5. Contratos separados para borradores, edición de categorías, disponibilidad, retirada y publicación, con autorización, control de versión, auditoría e idempotencia. Esta lectura no habilita ninguna mutación.
6. Extensión explícita del DTO si se desea mostrar una imagen publicada. La interfaz no fabrica URL, asset ni relación con el Estudio de imágenes.

### Límites y operaciones no realizadas

- No se añadió transporte HTTP, autenticación, datos de demostración, polling, caché, almacenamiento local ni imagen ficticia.
- No se conectaron borradores ni acciones editoriales y no se reutilizó la lectura pública como autorización administrativa.
- No se modificaron backend, cliente, PostgreSQL, Supabase operativo, VPS, Fleetia, servicios Google ni otros repositorios.
- No se hizo merge ni despliegue. El PR permanece Draft.

### Siguiente bloque recomendado

Conectar `AdminTablesGateway` y `AdminCatalogGateway` sólo después de que existan montajes runtime autorizados y contratos HTTP coincidentes, con pruebas de `401/403/503` y revocación. Si esos gates continúan cerrados, el siguiente bloque frontend debe limitarse a otra proyección versionada que ya exista; no activar escrituras ni inventar DTOs para Resumen, Equipo o Catálogo editorial.

---

## Hito posterior — actualización explícita y estados resilientes de lectura (2026-10-24)

### Referencia y alcance

- Rama: `codex/sabora-management-tables-workspace`; PR [#5](https://github.com/jdlc86/CartaViva/pull/5) en estado **Draft**, con base `feat/sabora-pnpm-bootstrap`.
- El PR administrativo anterior [#3](https://github.com/jdlc86/CartaViva/pull/3) está `MERGED`; este trabajo continúa exclusivamente en su PR sucesor y no modifica el PR #2.
- Base incorporada inicialmente en `8951dfbaaef096e9bba31ed623d17e7f8554c3c7` mediante `b05cf6a` y sincronizada al cierre con `ea01357613894085a221de7a2d4be52fd259b370` mediante `0237610`; ninguno de esos avances modificó `apps/management/**`.
- Commit funcional: `9d676b82e1eea67abb6a4744b79667157191eece` (`feat(management): harden explicit read refreshes`).
- Diferencia funcional limitada a `apps/management/**`; la única documentación modificada es este handoff.

### Funcionalidad implementada

1. Mesas y Catálogo ofrecen actualización manual de la proyección conectada, sin temporizadores, reintentos ocultos ni polling.
2. La actualización conserva visible el último snapshot validado. Si la nueva lectura falla, no borra datos, no aplica respuestas parciales y ofrece un reintento explícito.
3. Una lectura nueva aborta e invalida la anterior. Esto cubre desmontaje, sustitución de gateway, recarga, actualización y la colisión entre paginación de mesas y actualización completa.
4. Las respuestas tardías no pueden sobrescribir una lectura posterior. Finalizar una tarea obsoleta tampoco libera ni invalida la tarea vigente.
5. Una actualización correcta conserva la selección actual si el recurso continúa presente; en caso contrario selecciona el primer elemento válido o deja la selección vacía.
6. Mesas reinicia de forma coherente su cursor a la primera página al actualizar; un fallo de paginación sigue conservando las páginas ya validadas.
7. El estado compartido distingue lectura cargada, actualización en curso y fallo recuperable mediante texto visible, `aria-busy`, anuncio `aria-live` y `role="alert"` sin duplicar anuncios.
8. La barra de estado responde a móvil con objetivo táctil de 44 px, botón a ancho completo y animación compatible con `prefers-reduced-motion`.
9. El resumen de categorías publicadas se calcula en una sola pasada memoizada sobre el snapshot recibido.
10. Alta/edición de mesas, QR, borradores, disponibilidad, retirada y publicación continúan deshabilitados. El entrypoint no instancia transportes y la aplicación distribuida permanece desconectada por defecto.

### Archivos del hito

- `apps/management/src/latest-read-task.js` y `.d.ts`: coordinador independiente de la última lectura, cancelación, vigencia y finalización segura.
- `apps/management/src/views/TablesView.tsx`: actualización conservadora, cancelación de paginación obsoleta, selección y cursor coherentes.
- `apps/management/src/views/CatalogView.tsx`: actualización conservadora compartida entre Platos y Categorías, selección estable y agrupación memoizada.
- `apps/management/src/components/Primitives.tsx` e `Icon.tsx`: barra de estado accesible e icono de actualización.
- `apps/management/src/style.css`: estados visuales, animación y responsive de la barra de lectura.
- `apps/management/tests/latest-read-task.test.mjs`: sustitución, cancelación, finalización idempotente y aislamiento entre tareas.
- `apps/management/tests/ui-contract.test.mjs`: actualización explícita, ausencia de `setInterval`, cancelación, conservación ante error y anuncios accesibles.

### Decisiones técnicas

1. El coordinador no almacena datos ni conoce React: sólo entrega `AbortSignal` y una comprobación de vigencia. Los componentes conservan la propiedad de su snapshot validado.
2. Un refresh no cambia la fase a carga inicial, de modo que la interfaz no confunde indisponibilidad momentánea con ausencia de datos y no oculta información ya verificada.
3. El refresh de mesas reemplaza las páginas cargadas por una primera página nueva y su cursor. Mezclar páginas de snapshots distintos habría producido una lista temporalmente incoherente.
4. Se mantiene una única lectura activa por workspace. Esta política evita carreras sin introducir deduplicación, caché o semántica de backend no documentada.
5. Se aplicó la revisión React del entorno: inicialización estable en `useRef`, efectos con limpieza, actualizaciones funcionales de selección, cálculos derivados memoizados y componentes definidos fuera del render.

### Validaciones locales

| Comando o comprobación | Resultado |
| --- | --- |
| `pnpm --filter @sabora/management test` | PASS, 28/28 |
| `apps/management/node_modules/.bin/tsc.CMD --noEmit -p apps/management/tsconfig.json` | PASS, TypeScript estricto |
| `node --test tests/management-scaffold.test.mjs` | PASS, 3/3 |
| `pnpm test` | PASS, 708/708 sobre la base final integrada |
| `pnpm --filter @sabora/management build` | PASS, 42 módulos; JS 282,94 kB y CSS 43,10 kB antes de gzip |
| `pnpm build` | PASS, API + PWA cliente + PWA gestión |
| Navegador 1265 px y 390 × 844 | PASS en Mesas y Catálogo desconectados, sin overflow horizontal |
| Consola del navegador | PASS, 0 errores y 0 avisos |
| Controles privilegiados | PASS, QR y escrituras de mesas/catálogo permanecen deshabilitados |
| `git diff --check` | PASS |

La instalación exacta se restauró con `pnpm install --frozen-lockfile --force` sin modificar el lockfile. Los builds Vite se ejecutaron fuera del sandbox local porque esbuild no podía resolver `vite.config.ts` bajo ese aislamiento; ambos terminaron correctamente.

### GitHub Actions

- `Sabora CI` [run 40093626823](https://github.com/jdlc86/CartaViva/actions/runs/40093626823), job `validate` `120871227499`: **SUCCESS** para `9d676b82e1eea67abb6a4744b79667157191eece` en 1m44s.
- El job completó lockfile, tests, migraciones en PostgreSQL 17 desechable, driver `pg` real, build, Compose, construcción de imagen API y smoke tests aislados.
- GitHub emitió únicamente avisos de plataforma por la transición de actions desde Node 20 y la futura migración de `ubuntu-latest`; no hubo fallo atribuible al repositorio.

### Riesgos y dependencias pendientes

1. La barra de actualización sólo aparece cuando se inyecta un gateway y la primera lectura termina correctamente; el bundle de producción continúa sin composición runtime administrativa.
2. Siguen pendientes contratos/montajes HTTP coincidentes, sesión verificada, tratamiento de `401/403/503`, expiración y revocación antes de conectar ambos gateways.
3. Las mutaciones necesitan contratos separados con autorización de servidor, control de versión, idempotencia y auditoría. Una lectura verde no autoriza a reutilizar sus privilegios para escritura.
4. La proyección de catálogo v1 no contiene imagen, y la proyección de mesas no contiene secretos QR. La interfaz no debe inferirlos ni añadirlos al DTO.
5. Una actualización de mesas vuelve deliberadamente a la primera página; restaurar una posición profunda exigiría un contrato de snapshot/cursor estable que no existe.

### Operaciones no realizadas

- No se modificaron `apps/api/**`, `apps/client/**`, `packages/customer-consent/**`, migraciones PostgreSQL, escritores transaccionales ni workflows.
- No se añadió `fetch`, autenticación, endpoint, dato de demostración, almacenamiento del navegador, polling, caché o QR ficticio.
- No se accedió ni modificó Fleetia, VPS, Supabase operativo, Google ni otro repositorio o servicio.
- No se hizo merge, despliegue ni cambio del estado Draft del PR.

### Siguiente bloque recomendado

Mantener las escrituras cerradas y conectar el adaptador runtime de lectura sólo cuando el backend publique el contrato HTTP administrativo versionado y las reglas de sesión. La siguiente ampliación frontend independiente puede mejorar Resumen o Equipo únicamente si aparece una proyección documentada; sin ella, debe centrarse en accesibilidad y pruebas de los estados ya contratados, no en inventar datos o acciones.
