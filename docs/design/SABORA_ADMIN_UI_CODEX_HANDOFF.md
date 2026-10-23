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
