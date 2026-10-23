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
