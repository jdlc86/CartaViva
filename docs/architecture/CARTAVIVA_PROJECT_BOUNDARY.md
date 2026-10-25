# Límite del proyecto CartaViva / Sabora

Estado: directriz de alcance y aislamiento. Referencia normativa: [contrato funcional consolidado](SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md).

## Producto y repositorio

- **CartaViva** es el directorio central que identifica instalaciones de restaurantes independientes.
- **Sabora** es la instalación operativa de **un único restaurante**, con su propia base de datos, backend y dos PWA independientes: cliente y gestión.
- El desarrollo, las pruebas, las incidencias, los commits, los PR y la documentación de este trabajo pertenecen exclusivamente al repositorio `jdlc86/CartaViva`.
- Las referencias a proyectos externos no forman parte del contrato funcional, la planificación, el estado de avance ni la documentación de continuidad de CartaViva.

## Aislamiento técnico y operacional

- No leer, modificar, reiniciar, detener, desplegar ni eliminar servicios, contenedores, datos, credenciales, redes o recursos pertenecientes a otros proyectos.
- Cualquier futura ejecución sobre infraestructura compartida exige autorización expresa y evidencia previa de aislamiento completo; la operación de Sabora debe ser independiente y no provocar interrupciones en otros servicios.
- El trabajo de desarrollo y CI se mantiene dentro del repositorio. Los ensayos con PostgreSQL se ejecutan únicamente en entornos desechables y aislados; no son autorización para aplicar migraciones en Supabase operativo.
- Ninguna integración, fusión de ramas o despliegue se presume autorizado por el hecho de que las pruebas terminen correctamente.

## Jerarquía documental

La fuente de verdad para requisitos de producto es la documentación **normativa** de este repositorio. Los documentos de continuidad solo transfieren contexto entre sesiones y no pueden sustituir ni ampliar los requisitos normativos. Ante una contradicción, se revisa primero el contrato normativo; no se inventan decisiones.

Este documento delimita el proyecto y sus recursos; no introduce funciones de producto, roles, permisos o flujos de negocio adicionales.
