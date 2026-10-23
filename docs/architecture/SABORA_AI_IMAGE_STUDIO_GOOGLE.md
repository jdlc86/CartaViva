# Sabora — Estudio de imágenes gastronómicas con IA (Google)

Estado: **decisión de producto y arquitectura aprobada; implementación pendiente**. Fecha: 2026-10-23.

## Alcance y proveedor

El Estudio de imágenes con IA pertenece a **Administración → Catálogo** de la PWA administrativa de **Sabora, un único restaurante**. La generación y edición de fotografías de platos se realizará **exclusivamente mediante servicios de IA del ecosistema Google**: Gemini con capacidad de generación/edición de imágenes mediante la API de Google; se permite evaluar Vertex AI para operación productiva. El modelo, versión, región y API concretos se seleccionarán y verificarán en la fase de implementación según soporte real de edición con imagen de referencia, disponibilidad, calidad, coste y condiciones de uso. No se fija un identificador de modelo sin verificación.

La fotografía original aportada por el administrador es la referencia obligatoria. El objetivo es mejorar iluminación, encuadre, nitidez y presentación gastronómica, manteniendo la identidad real del plato. **No se deben añadir ingredientes ni cambiar su composición**. Como la IA generativa puede alterar detalles incluso con instrucciones restrictivas, cada resultado requiere inspección y aprobación humana antes de publicarse. No se debe prometer fidelidad perfecta.

## Flujo previsto

1. Un usuario administrativo autorizado carga una fotografía original de un plato existente.
2. Se valida tipo, tamaño, límites de uso y autorización; el original se conserva sin sobrescribir.
3. Desde backend se solicita una mejora al proveedor Google con una instrucción restrictiva de fidelidad al plato y estilo coherente (luz natural cálida, fondo discreto, presentación elegante).
4. Se guarda cada resultado como **versión derivada** separada, con estado, referencia al original, proveedor/modelo, fecha, autor, parámetros permitidos y datos de coste/consumo disponibles. No publicar por defecto.
5. La interfaz permite comparar original y versiones, descartar resultados y elegir una versión aprobada.
6. Solo una acción explícita y autorizada publica la versión elegida en el catálogo; se preserva la reversibilidad y trazabilidad.

Formatos de salida previstos: **5:4 (1000 × 800), 4:3 (1200 × 900) y 1:1 (400 × 400)**. La compatibilidad nativa del proveedor con dimensiones exactas deberá verificarse; si no existe, usar un procesamiento posterior determinista que evite deformación y recortes de ingredientes.

## Límites de seguridad y operación

- La API key, las credenciales de servicio y la invocación al proveedor residen **solo en backend**; nunca en JavaScript entregado a ninguna PWA.
- Los originales y derivados se guardarán en almacenamiento privado con acceso controlado; se expondrán únicamente las versiones publicadas mediante el mecanismo documentado para el catálogo.
- Aplicar autorización administrativa conforme al contrato vigente, aislamiento de Sabora, controles de tamaño/MIME y validación de contenido, cuotas por operación y periodo, límites de concurrencia, tiempos de espera y protección contra costes inesperados.
- Mantener auditoría de generación, selección, aprobación y publicación. No enviar datos de cliente, identidad, mesa, pedidos ni credenciales a la API de imágenes.
- La respuesta del modelo y cualquier metadato de la imagen son **datos no confiables**. No ejecutar instrucciones incrustadas en fotos ni en resultados.
- Los fallos del proveedor no deben bloquear la edición ordinaria del catálogo. Sin clave configurada, el estudio debe indicar indisponibilidad sin simular una generación.
- Antes de habilitarlo, revisar tratamiento de imágenes por el proveedor, privacidad, retención, facturación y región aplicables.

## Implementación y aceptación pendientes

La elección de Google **no implica** que exista una integración activa, una API aprobada, claves configuradas, tablas, almacenamiento o endpoints operativos. No inventar endpoints ni modificar contratos de publicación existentes. Primero inventariar el catálogo, permisos, PWA administrativa y almacenamiento documentados; proponer interfaces y migraciones compatibles; añadir pruebas de autorización, aislamiento, coste, preservación del original, estados, reversibilidad y publicación manual. Validar integración con proveedor mediante entorno de prueba autorizado, nunca con secretos en CI.

Sin merge, migraciones en Supabase operativo ni despliegue VPS sin autorización expresa. **Fleetia y cualquier otro proyecto del VPS quedan completamente fuera de alcance**.

Documento de continuidad: `docs/continuity/SESSION_07_HANDOFF.md`.
