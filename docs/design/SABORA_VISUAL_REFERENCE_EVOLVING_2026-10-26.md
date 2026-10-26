# Sabora — referencia visual evolutiva y puertas de conformidad V1

Estado: **REFERENCIA MEJORABLE, NO NUEVA APROBACIÓN NI BASELINE CONGELADO**. Registrada el 26-10-2026 a petición del usuario.

## Jerarquía y alcance
Prevalecen los documentos normativos y aprobaciones históricas de GitHub: `docs/DESIGN_SYSTEM_CONTRACT.md`, `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`, `docs/design/APPROVED_VISUAL_STYLE_AUDIT_V1.md` y requisitos funcionales. Esta ficha **no los modifica**. La previsualización interactiva mostrada en conversación el 26-10-2026 se considera **aproximación mejorable**, no captura maestra ni activo productivo. No se dispone de un archivo reproducible exacto de esa vista: no atribuirle fidelidad píxel a píxel.

## Rasgos a conservar y perfeccionar
- Identidad Sabora V3 (usar el SVG versionado, no sustituto tipográfico); paleta de referencia crema #F8F7F4, blanco #FFFFFF, tinta #202622, verde #146B57 y acento #D98B45.
- Experiencia premium, cálida, fotográfica y móvil; tarjetas de carta, categorías **dinámicas desde gestión**, lupa que revela buscador, cesta y notificaciones.
- Carrusel de comunicaciones **encima de «Nuestra carta»**: imagen opcional `image: string | null`; sin imagen, composición tipográfica sin huecos; sin anuncios vigentes, ocultar sección. Avance automático cíclico, anterior/siguiente manual, pausa durante detalle y preferencia de movimiento reducido. Rotación local sin polling de red.
- Barra inferior aprobada: Información, Alérgenos, **QR central**, Favoritos y Ajustes. No sustituirla por una barra arbitraria de Inicio/Carta/Reservas/Cesta.
- Carta y reserva sin QR; pedido presencial solo con QR auténtico validado; preservar selección entre ambos contextos. No simuladores de mesa en producto.
- Intensidad de movimiento **EQUILIBRADA** aprobada: transiciones útiles y fluidas, no parallax pesado ni animaciones que obstaculicen.
- Cocina y gestión deben expresar la **misma familia visual y tokens de marca**, adaptando densidad, contraste, ergonomía y jerarquía a su tarea. **No copiar sin más la navegación cliente ni añadir efectos decorativos a pantallas operativas**. Conservar las reglas específicas de cocina, incluida la restricción del tapiz a la pantalla de acceso passkey si así lo exige el contrato.

## Deuda existente, no conformidad aprobada
El cliente React actual tiene estética oscura y carece de varios elementos aprobados. La referencia HTML `docs/design/references/sabora-client-home-v1.html` contiene parte de la estructura, pero utiliza fixtures y no sustituye la PWA. El ejemplo conversacional de 26-10-2026 contiene platos/fotos ilustrativos y no tiene autoplay real; NO copiar esos datos, fotos o interacciones ficticias a producción.

## Mecanismo de control exigido para cerrar el hito
1. Contratos de componentes y tokens compartidos cliente/cocina/gestión; tests de estructura y estados por app.
2. Pruebas de comportamiento de anuncios con foto, sin foto, vacío, fallo de imagen, navegación manual, autoplay, pausa, teclado y movimiento reducido; pruebas de QR/reservas sin simulación.
3. Capturas reales en navegadores y viewports representativos, comparación con referencias versionadas, informe de diferencias; baselines exactos solo con aprobación expresa.
4. Puerta de CI **obligatoria y fallida** si faltan contratos, pruebas o evidencia en PR visual. Protección de rama/required checks para impedir merge cuando falle (requiere permisos de administración y configuración aparte).
5. Las excepciones visuales requieren decisión documentada y aprobación explícita, nunca aceptación silenciosa.

Esta ficha registra el objetivo y la evidencia, **no afirma que las puertas de CI ya estén implementadas**.

## Orientación de refinamiento solicitada el 26-10-2026 — alta gama y frescura contemporánea

El usuario precisa que **todas las aplicaciones deben percibirse como producto de restaurante de alto standing** y que la inspiración de las referencias Goiko y Porneat se aproveche como frescura visual, no como copia literal. Se registra como orientación para la siguiente iteración y revisión; no se declara aprobación de una captura final, nueva tipografía, librería o efecto específico.

- **Cliente:** experiencia gastronómica editorial, luminosa, sofisticada, moderna y emocional; fotografía real autorizada, jerarquía tipográfica cuidada, espacio en blanco, profundidad sutil, carrusel de anuncios ya contratado, interacciones de tarjetas/fichas/cesta fluidas y navegación móvil impecable.
- **Cocina y gestión:** identidad de la misma casa de alta gama, con superficies y componentes refinados, contraste, estados claros y microinteracciones discretas; prioridad absoluta a lectura, velocidad, ergonomía y operaciones fiables. No trasladar carruseles decorativos ni animación persistente a comandas.
- **Común:** usar los tokens y activos aprobados, consistencia entre aplicaciones, accesibilidad y reducción de movimiento. Mantener la intensidad EQUILIBRADA aprobada: «premium» no significa exceso de animaciones.
- **Aceptación futura:** comprobar en navegador la coherencia entre pantallas cliente y cocina, incluyendo capturas por viewport/estado, transiciones funcionales, accesibilidad, rendimiento y regresión visual. Los detalles nuevos requieren prototipo y aprobación explícita antes de congelar baselines.

Referencias de inspiración documentadas: `docs/design/FUNCTIONAL_AND_MOTION_RESEARCH.md` (Goiko y Porneat). La presente orientación no reemplaza las decisiones normativas anteriores.

## Principio rector literal — 26-10-2026

> Sabora debe parecer un restaurante de alta gama que ofrece una experiencia digital excepcional, tanto al comensal como al equipo.

Este principio guía la evolución de la experiencia cliente, cocina y gestión, subordinado a los contratos normativos y sujeto a verificación visual y funcional.
