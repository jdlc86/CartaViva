# Sabora cliente — cierre de implementación de los hitos 1, 2 y 3

Fecha: 2026-10-26

Rama: `feat/sabora-client-premium-pwa-hitos-1-3`

Base inspeccionada: `audit/github-pr-global-consolidation-20261026` @ `7ba931fb657d02b411cd72f90a8231aeaf70c97b`

Estado: candidato en PR Draft; sin merge, despliegue ni activación operativa.

## 1. Alcance y precedencia

Se leyó íntegramente `docs/continuity/CODEX_HITOS_1_2_3_CONTINUITY_2026-10-26.md` y se utilizó `docs/design/references/sabora-client-premium-v2-lab.html` como laboratorio visual, no como contrato funcional ni baseline aprobado. Antes de implementar se contrastaron los contratos normativos de diseño, producto, cliente, identidad, QR, catálogo, pedidos, seguridad, permisos SQL, eventos e infraestructura referidos por la continuidad. `docs/design/APPROVAL_REGISTER.md` no existe en este snapshot.

No se modificó ningún contrato normativo para acomodar el resultado. Este documento registra implementación y evidencia; no concede aprobaciones de diseño ni activa candidatos.

## 2. Hito 1 — consolidación técnica

- Se partió del HEAD auditado de PR #14 sin reescribirlo. La rama base contenía 41 commits sobre `integration/sabora-pr11-merge-reconciliation`; el nuevo trabajo queda apilado sobre esa consolidación y no altera PR existentes.
- El baseline previo pasó `npm run check` con 898 pruebas y todos los builds. La batería PostgreSQL 17 desechable pasó 87/87 antes de modificar la PWA.
- El recorrido efectivo se volvió a inspeccionar: `server.mjs` publica solo `/health` y `/ready`; el catálogo y la confirmación de pedido permanecen composiciones candidatas opt-in. No hay activación aprobada de identidad cliente, resolución QR, reserva, anuncios, notificaciones o canal SSE/WebSocket.
- Se mantuvieron Node `>=22`, pnpm `10.17.1`, PostgreSQL 17 y el lockfile reproducible.
- La PWA cliente contiene únicamente superficie cliente. No importa código de gestión/personal/operaciones, no ofrece rutas de cocina o gestión y no solicita APIs privilegiadas.

## 3. Hito 2 — sistema visual premium y conformidad

La aplicación React/TypeScript reemplaza el prototipo anterior por una composición mobile-first de alta restauración: marca Sabora V3 real, tipografía editorial, blancos cálidos, profundidad discreta y jerarquía amplia. Usa los tokens nucleares contractuales `#F8F7F4`, `#FFFFFF`, `#202622`, `#146B57` y `#D98B45`; los tonos auxiliares derivan de esa identidad.

Componentes incorporados:

- cabecera con logo SVG V3, selector ES/EN, búsqueda contextual, cesta y campana;
- categorías derivadas exclusivamente del catálogo publicado, con `Todos` virtual;
- tarjetas accesibles con placeholder honesto cuando no hay activo autorizado, detalle, favorito y transición de CTA a `− / cantidad / +`;
- estados de carga, error recuperable, vacío, agotado y sin imagen;
- barra inferior exacta Información / Alérgenos / QR / Favoritos / Ajustes;
- diálogos con restauración y confinamiento de foco, cierre por Escape y fondo;
- transiciones de 180–200 ms y anulación con `prefers-reduced-motion`;
- puntos de ruptura para móvil y escritorio, objetivos táctiles mínimos de 44 px y foco visible.

El bloque de anuncios está situado antes de «Nuestra carta» y permanece oculto sin hueco cuando no hay datos. No se inventó un feed, carrusel, texto o fotografía: el repositorio no dispone de DTO ni endpoint contractual de anuncios. Las capturas de Playwright son **candidatas reproducibles**, no baselines aprobados.

El nuevo workflow `Sabora client browser conformance` compila el artefacto que va a probar, instala Chromium con tiempo acotado y publica durante siete días capturas, trazas e informe HTML. Las puertas estáticas comprueban tokens, marca, composición, PWA, límites de API y ausencia de superficie operativa; no se presentan como sustituto de inspección estética humana.

## 4. Hito 3 — PWA cliente funcional dentro de la superficie autorizada

Funcionalidad terminada:

- manifiesto instalable, icono, tema y service worker de carcasa same-origin;
- navegación offline de la carcasa con error recuperable del catálogo; ninguna respuesta `/api/` entra en caché;
- consumo estricto de `GET /api/v1/catalog`, sin credenciales, redirecciones ni caché;
- DTO público cerrado de seis campos; rechazo de propiedades privadas, duplicados, límites y categorías inválidas;
- búsqueda sin acentos por nombre, categoría y alérgenos, filtro de disponibles y categorías dinámicas conservando categorías con agotados;
- agotados visibles pero imposibles de añadir; detalle y advertencia correcta de posibles trazas;
- selección local versionada, cantidades y total informativo; revalidación de nombre/precio contra el catálogo y conservación explícita de líneas retiradas;
- favoritos y preferencias ES/EN/alias/empresa limitados a este dispositivo, sin afirmar cuenta o sincronización;
- persistencia local cerrada y acotada sin token, sesión, QR ni secreto;
- bloqueo explícito de pedido sin QR auténtico y de reserva sin API contractual;
- notificaciones vacías y honestas, sin datos simulados;
- ninguna llamada periódica ni polling.

## 5. Matriz de trazabilidad

| Requisito | Fuente normativa | Estado real | Prueba/evidencia |
|---|---|---|---|
| Composición cliente aprobada | `DESIGN_SYSTEM_CONTRACT.md`; `SABORA_HOME_IMPLEMENTATION_V1.md` | Implementado | `App.tsx`, `BottomNav.tsx`, E2E móvil/escritorio |
| Logo Sabora V3 | `SABORA_BRAND_V1.md` | Implementado reutilizando el SVG versionado | puerta `client-premium-contract` y capturas |
| Tokens y movimiento equilibrado | `APPROVED_VISUAL_STYLE_AUDIT_V1.md`; `NOTIFICATIONS_AND_MOTION_V1.md` | Implementado | puerta estática, `prefers-reduced-motion`, axe |
| Anuncios encima de carta y ausencia sin hueco | `SABORA_HOME_IMPLEMENTATION_V1.md` | Estructura implementada; datos bloqueados por ausencia de contrato/API | prueba de orden DOM; región vacía `hidden` |
| Categorías servidor + `Todos` virtual | `CLIENT_MENU_V1.md`; continuidad §5 | Implementado | unitarias de derivación, agotados y rechazo de `Todos` inyectado |
| Catálogo público mínimo | `SABORA_CATALOG_PUBLICATION_GATE.md` | Consumidor implementado; ruta operativa no montada | loader, parser cerrado, Node y E2E con doble controlado |
| Fotos/descripción/metadatos reservables | `CLIENT_MENU_V1.md`; continuidad §5 | Bloqueado: el DTO aprobado actual no contiene esos campos ni activos | placeholder no engañoso; sin contenido inventado |
| Selección, favoritos y preferencias | contratos cliente y privacidad | Implementado como estado local explícito | 4 pruebas de estado + E2E de recarga |
| Pedido solo con QR servidor | `SABORA_CUSTOMER_IDENTITY_CONTRACT.md`; contrato funcional consolidado | Bloqueado y explicado sin falso escaneo | diálogo QR y E2E negativo |
| Reserva de platos reservables | contrato funcional consolidado | Bloqueado: sin campo reservable, política temporal ni API aprobada | CTA deshabilitado con explicación |
| Confirmación atómica/idempotente | contrato funcional consolidado y gates candidatos | Backend candidato probado, no cableado a la PWA por gate de activación | PG17 real 22/22 catálogo; transporte cliente permanece opt-in |
| Eventos sin polling | `SABORA_CONTRACT_CONSISTENCY_V1.md` | No implementado: falta contrato/retención/canal; no se añadió polling | búsqueda negativa y puerta de superficie cliente |
| PWA instalable y resiliente | continuidad §5 | Implementado | CDP sin errores de instalabilidad; navegación offline E2E |
| Accesibilidad | contratos de diseño | Implementado en alcance automatizable | axe sin violaciones serias/críticas, teclado/foco, 390/1440 |
| Sin cocina/gestión en cliente | perímetro normativo de continuidad | Implementado | prueba negativa de bundle y registro de requests E2E |

## 6. Evidencia de pruebas locales

| Ejecución | Resultado |
|---|---|
| `npm run check` | 910/910 pruebas Node; builds API, cliente y gestión satisfactorios |
| `pnpm --filter @sabora/client test:e2e` | 12/12 en Chromium: seis escenarios en 390×844 y seis en 1440×1000, incluida matriz 320–1440 px |
| axe-core | 0 violaciones `serious`/`critical` en portada poblada y diálogo QR |
| CDP `Page.getInstallabilityErrors` | lista vacía en ambos perfiles |
| offline | carcasa disponible, catálogo falla de forma visible y recuperable, API no cacheada |
| `GITHUB_ACTIONS=true bash scripts/ci/catalog-postgres17-node-driver-smoke.sh` | 87/87: catálogo 22, operaciones 8, identidad 18, personal 14, invitaciones/outbox 25 |
| inspección visual manual | portada y bloqueo QR revisados en capturas móvil y escritorio; sin baseline declarado |

Durante el desarrollo las pruebas detectaron y se corrigieron: dos expectativas antiguas de categorías fijas, contraste insuficiente del naranja y texto secundario, análisis axe durante la animación, un riesgo de servir `dist` obsoleto en E2E, falta de captura de foco en diálogos y una colisión de categoría `Todos` con espacios. Se repitieron las suites después de cada corrección.

## 7. Límites y trabajo pendiente por decisión/activación externa

Estos puntos no pueden declararse funcionales sin contradecir los contratos vigentes:

1. `server.mjs` no monta el catálogo ni la composición cliente verificada. Activarlos requiere aprobar identidades SQL, secretos, grants y readiness; este PR no lo hace.
2. No existen contrato/API aprobados para anuncios, reservas, imágenes/descripciones de producto, metadatos reservables ni notificaciones cliente.
3. Identidad cliente, QR/visita, confirmación de pedido y transporte existen como candidatos separados y probados, pero su gate prohíbe activación operativa. La PWA no los simula.
4. SSE/WebSocket, cursores, retención y recuperación siguen pendientes de diseño. No se introdujo polling como sustituto.
5. Configurar este workflow como required check requiere una decisión administrativa fuera del código.
6. La aprobación visual de baselines y activos fotográficos corresponde al usuario; los artefactos actuales solo facilitan esa evaluación.

## 8. Seguridad operativa

Toda la validación de base de datos usó PostgreSQL 17 desechable y aislado. No se accedió ni modificó Supabase operativo. No se activaron proveedores, correo, workers ni endpoints. No se consultaron ni alteraron Fleetia, VPS o recursos compartidos. No hubo merge ni despliegue.
