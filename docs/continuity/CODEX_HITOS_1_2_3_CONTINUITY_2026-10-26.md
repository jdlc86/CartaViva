# CODEX — CONTINUIDAD Y EJECUCIÓN INTEGRAL DE HITOS 1, 2 Y 3
Fecha de preparación: 2026-10-26. Repositorio EXCLUSIVO: jdlc86/CartaViva.
Estado del encargo: implementación autorizada por el usuario; NO autoriza merge, producción, VPS, Supabase destructivo ni tocar otros repositorios.

## 0. Mandato
Implementa tres hitos completos y verificables, no una sucesión de arreglos menores:
H1 consolidación técnica y contractual; H2 sistema visual premium y conformidad automatizada; H3 PWA cliente funcional conectada a backend real según contratos. Trabaja autónomamente dentro del repositorio permitido, ejecuta pruebas, corrige y reintenta. Entrega PR Draft y evidencia objetiva. Si hay contradicción, prevalece documentación NORMATIVA vigente de GitHub; documentos de continuidad son solo contexto. No inventes reglas ni presentes propuestas como aprobaciones.

Principio rector literal: **«Sabora debe parecer un restaurante de alta gama que ofrece una experiencia digital excepcional, tanto al comensal como al equipo.»**

## 1. Lectura obligatoria y precedencia
Antes de escribir, inventaría ramas, PR, HEAD, CI, dependencias, aplicaciones, API, migraciones, pruebas y contratos. Lee TODOS los documentos normativos relevantes; como mínimo:
- docs/DESIGN_SYSTEM_CONTRACT.md
- docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md
- docs/design/APPROVED_VISUAL_STYLE_AUDIT_V1.md
- docs/design/NOTIFICATIONS_AND_MOTION_V1.md
- docs/design/FUNCTIONAL_AND_MOTION_RESEARCH.md
- docs/design/APPROVAL_REGISTER.md si existe
- docs/design/SABORA_VISUAL_REFERENCE_EVOLVING_2026-10-26.md
- docs/design/references/sabora-client-home-v1.html
- docs/design/references/client-menu-reference.html
- docs/design/references/sabora-client-premium-v2-lab.html
- docs/design/brand/sabora-logo-outline-v3.svg
- demás especificaciones normativas de negocio, QR, identidad, permisos, reservas, comandas, eventos, seguridad, DB y arquitectura.

Registra en una matriz requisito -> fuente normativa exacta -> estado real -> pruebas -> evidencia. Si la lista difiere del repositorio, prevalece lo inspeccionado. NO tomes los prototipos como fuente de verdad funcional ni copies fixtures a producción. Conserva decisiones aprobadas y distingue APROBADO/PROPUESTO/PENDIENTE.

## 2. Seguridad y perímetro INNEGOCIABLE
- Solo jdlc86/CartaViva. No abrir/modificar Fleetia, sus contenedores, recursos, repositorios, secretos, redes, servicios ni volúmenes. VPS compartido: NO desplegar, reiniciar, eliminar ni alterar servicios; cualquier despliegue exige autorización expresa posterior y aislamiento total. No tocar otros proyectos del VPS.
- Supabase proyecto Sabora: https://byhvmumqivmunkmomhup.supabase.co. No alterar producción, credenciales, políticas ni migraciones de forma destructiva sin aprobación explícita. Para pruebas usar entornos aislados/efímeros según infraestructura existente. Mínimos privilegios, RLS/roles reales, validación servidor, transacciones, auditoría, idempotencia. No registrar datos sensibles.
- NO merge, NO marcar PR lista, NO desplegar, NO invocar otros agentes/Codex recursivamente. Crear rama de trabajo propia desde base correcta tras auditar integración; PR Draft. No sobreescribir trabajo concurrente ni forzar pushes.
- La PWA CLIENTE no contiene selector ni rutas a cocina, sala o gestión; separación efectiva de rutas, bundles y autorización API. Ocultar botones NO equivale a seguridad. La PWA operativa mantiene sus roles propios.

## 3. HITO 1 — Consolidación y base confiable
1. Identifica HEAD, base efectiva, PR Draft existentes (incluido #14 si sigue abierto), divergencias, trabajos concurrentes y checks GitHub Actions. No asumas que la rama de auditoría es la rama de integración final. Planifica integración sin destruir cambios.
2. Ejecuta tests/build/TS/lint existentes, documenta fallos reproducibles. Corrige causas raíz, no suprimas tests ni relajes controles. Verifica PostgreSQL 17 y Node >=22 / pnpm 10.17.1 si siguen siendo los contratos.
3. Revisa flujo extremo cliente->API->DB, permisos, QR, catálogo, reserva, pedidos, notificaciones, cambios de disponibilidad, eventos. Clasifica implementado/parcial/ausente con evidencia, sin porcentajes inventados.
4. Cierra inconsistencias de arquitectura y contratos dentro del alcance. Documenta decisiones, riesgos y pendientes ajenos a H1-H3. Revalida CI antes de continuar.
**Criterio H1:** árbol reproducible, checks existentes verdes o bloqueo externo justificado con evidencia, matriz de trazabilidad y plan de integración consistente.

## 4. HITO 2 — Diseño premium REAL y control automático
La dirección visual es alta restauración contemporánea, cálida, editorial, refinada, ágil y mobile-first. Inspiración funcional de Goiko/Porneat, nunca copiar su marca, código, imágenes ni layout. El cliente debe sentir placer al explorar; cocina/gestión comparten identidad premium pero sin distracción.

### Referencia ejecutable ya versionada
`docs/design/references/sabora-client-premium-v2-lab.html` es un laboratorio ilustrativo, NO implementación productiva ni baseline aprobado. Utiliza también `sabora-client-home-v1.html` y `client-menu-reference.html`. Conserva las dos alternativas de cesta:
A) CTA «Añadir» y detalle de plato;
B) al primer añadido, CTA pasa a control «− / cantidad / +» sin abrir la cesta.
No impongas la variante B como decisión definitiva. Implementa el patrón que mejor cumpla contratos actuales y deja variantes documentadas/evaluables, sin duplicar UX de producción.

### Requisitos visuales verificables
- Identidad: logo SVG Sabora V3 real, nunca emoji o logo tipográfico sustituto; paleta y tokens semánticos de los contratos. Referencias #F8F7F4, #FFFFFF, #202622, #146B57, #D98B45. Consulta el contrato para matices y estatus de aprobación; no convertir candidatos en aprobaciones.
- Composición cliente aprobada: cabecera logo + ES/EN + lupa desplegable + cesta + campana; anuncios SOBRE «Nuestra carta»; categorías dinámicas; productos fotográficos cuando haya activos autorizados; barra inferior Información/Alérgenos/QR central/Favoritos/Ajustes. No sustituir por navegación genérica.
- Diseño editorial premium: espacios deliberados, jerarquía legible, fotografías consistentes y licenciadas, tarjetas refinadas, profundidad discreta, estados vacíos elegantes, foco visible, transiciones funcionales. No usar imágenes de búsqueda/stock sin derechos ni inventar ingredientes, precios o datos reales.
- Movimiento intensidad EQUILIBRADA: feedback de acciones, cambios de tarjetas, búsqueda y cesta, ~120–220 ms como orientación contractual; sin parallax pesado, sin saltos de layout, sin animación bloqueante, respetar prefers-reduced-motion.
- Cocina/gestión: mismos tokens y componentes compartidos, mayor densidad y ergonomía; no carruseles decorativos, no alterar patrón exclusivo de acceso passkey. No mezclar navegación operativa con cliente.
- Responsive: controles y estados en 320/360/390/430/768/1024/1280/1440 según relevancia; 44px táctiles, contraste WCAG AA, teclado, lector de pantalla, zoom, estados carga/error/vacío/sin imagen/ag otado, textos largos, idiomas.
- Anuncios: foto opcional `image:string|null`; con imagen válida mostrar; sin foto tarjeta tipográfica SIN hueco; sin anuncios vigentes ocultar bloque; error de imagen fallback elegante; autoplay cíclico local, anterior/siguiente, pausa en detalle, reduced motion. Nunca polling de API.
- Crear tokens reutilizables y componentes reales; evitar hex literales arbitrarios, estilos inline ad hoc y duplicación. Evaluar librerías solo tras inspección; justificar licencia, bundle y mantenimiento.
- Tests: unitarios de tokens/componentes/estados; E2E navegador de flujos; accesibilidad automática y manual; capturas reproducibles de cliente y operativa. Comparaciones de screenshots contra baselines ÚNICAMENTE cuando el usuario haya aprobado esos baselines; antes guardar capturas como candidatas, NO afirmar aprobación.
- CI debe fallar ante desviaciones OBJETIVAMENTE verificables: tokens arbitrarios, contratos incumplidos, enlaces a cocina desde cliente, ausencia de controles, tests/E2E rotos, violaciones accesibilidad. Documentar límites de tests visuales; nunca afirmar que un simple grep garantiza calidad estética. Configurar required checks/branch protection solo si permisos y alcance permiten, sin debilitar reglas existentes; informar si requiere configuración administrativa.
**Criterio H2:** componentes y tokens utilizados por aplicaciones, controles CI operativos y evidencia visual reproducible, sin baseline falso.

## 5. HITO 3 — PWA CLIENTE PREMIUM CON FUNCIONALIDAD REAL
Implementar React/TypeScript dentro de arquitectura existente, no HTML aislado. Conectar exclusivamente a APIs/autorizaciones reales y crear contratos/implementación faltantes solo si las normas lo permiten. No marcar una función completa con un botón de demostración.

### Experiencia
- Pantalla inicial con composición aprobada, ES/EN según contrato, búsqueda contextual desplegable con foco y cierre, notificaciones reales autorizadas, cesta visible, anuncios vigentes y categorías autorizadas dinámicas.
- Categorías NO hardcoded en producción: orden gestión, ocultar inexistentes/despublicadas/vacías, conservar con platos publicados agotados; «Todos» virtual. Datos y visibilidad filtrados por servidor.
- Platos publicados con nombre, foto autorizada o placeholder elegante, descripción verificada, precio y alérgenos verificados; agotado visible sin poder añadir; retirado no visible. No asumir que falta de declaración de alérgeno significa seguro.
- Ficha de producto accesible, detalle y opciones solo si están contratadas; favoritos según contratos, persistencia/autorización real si disponible; no fingir sincronización.
- Cesta con cantidades y totales, persistencia coherente con sesión; feedback inmediato sin dobles envíos; líneas inválidas se conservan con motivo explícito y corrección voluntaria, jamás borrado silencioso.
- Sin QR: exploración y reserva de platos reservables; PEDIR bloqueado y explicación clara. Con QR auténtico validado por servidor: habilitar PEDIR y deshabilitar RESERVAR, sin perder selección. Nunca selector manual de contexto QR ni falso escaneo.
- Confirmación de pedidos y reservas: atomicidad, idempotencia, concurrencia, versionado, autorización, precio/disponibilidad revalidados en backend. Respetar ventana de agrupación configurable y reglas de incorporación tardía. Si existe un bloqueo funcional normativo, documentarlo y no inventar una ruta alternativa.
- Incidencias de disponibilidad: cesta, pedido en ventana y comanda ya despachada son estados DISTINTOS; aplicar exactamente el contrato normativo, reenvío versionado e idempotente cuando corresponda, sin duplicar pedidos ni cobros.
- Eventos de catálogo, disponibilidad, comandas, anuncios y avisos mediante SSE/WebSocket/eventos poscommit y recuperación puntual por cursor/versión. **Prohibido polling periódico** en cliente/API/workers. Push solo con suscripción/consentimiento.
- PWA instalable y móvil, resiliencia a red, accesibilidad, errores recuperables y estados honestos. Nunca anunciar «pedido confirmado» antes de confirmación real del servidor.
- Prohibición total de rutas, enlaces, permisos y acceso API de cocina desde cliente. Test negativo automatizado para cliente no autorizado.
- Internacionalización completa de textos UI relevantes; sin contenido ficticio en producción.

### Pruebas de aceptación obligatorias
Cubrir: catálogo vacío/desactivado/agotado/retirado/ordenado; anuncios con foto/sin foto/sin anuncios/fallo de imagen/autoplay/reduced motion; búsqueda, favoritos, cesta cantidades, persistencia y errores; sin QR/con QR válido/inválido/revocado; reserva vs pedido; carreras entre stock y confirmación; idempotencia; selección conservada ante incidencia; reconexión SSE sin polling; permiso denegado cocina; responsive y accesibilidad. Usar datos de prueba aislados, no modificar datos reales.

**Criterio H3:** recorridos reales demostrables, tests E2E y de integración verdes, sin simulaciones de producción y sin acceso cliente a cocina. Si falta una dependencia externa, no falsifiques cumplimiento: entrega avance verificable y bloqueo concreto.

## 6. Forma de trabajar y entregables
- Prioriza bloques grandes, con commits coherentes por hito; ejecuta shell para esperar resultados CI, reintenta tras corregir causas; no pidas al usuario aprobaciones rutinarias.
- No alteres documentación normativa para acomodar una implementación que la incumple. Documenta propuestas separadas y solicita decisión solo ante contradicción material o cambio de producto.
- Entrega: código de producción + pruebas + screenshots de candidato + informe de accesibilidad + matriz trazabilidad + CI + documentación de hito + PR Draft. Actualiza documentación del repo al cerrar cada hito importante.
- Informe final con tabla H1/H2/H3 (completo/parcial/bloqueado), commit SHA, PR URL, pruebas ejecutadas y resultados exactos, defectos abiertos, decisiones pendientes y confirmación explícita de NO merge, NO deploy, NO Fleetia.
- Evita prometer que todos los hitos están cerrados si alguna aceptación no se ha demostrado. No usar Codex como revisor externo adicional sin autorización.
