# Auditoría de separación CartaViva / Fleetia — 2026-10-25

**Alcance y límite de evidencia.** Revisión de código y documentación del PR Draft #7 (rama `integration/sabora-order-management-review`), búsqueda GitHub sobre la rama por defecto y examen de los scripts CI de PostgreSQL. No se inspeccionó ni se accedió al VPS, a contenedores ajenos, a Fleetia, ni a bases de datos operativas. Esta auditoría de repositorio **no certifica** por sí sola aislamiento de redes, secretos, volúmenes, DNS ni despliegue real.

## Fuente de verdad
- `docs/architecture/CARTAVIVA_PROJECT_BOUNDARY.md`: un solo restaurante Sabora, backend, base de datos y dos PWA propios; CartaViva como directorio central.
- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: contrato funcional normativo. Los handoffs son contexto, no requisitos.
- Queda prohibido alterar otros proyectos y cualquier despliegue en infraestructura compartida exige autorización y aislamiento comprobado.

## Hallazgos

| Área | Resultado comprobado | Riesgo |
| --- | --- | --- |
| Referencias textuales | La búsqueda GitHub sobre la rama por defecto no devolvió coincidencias para `Fleetia`, `GestionIntegral_Rutaa`, `fleetia.allaiso.com`, `GPS_TRACKER`, `Teltonika` ni el identificador conocido del servidor. **La búsqueda cubre solo la rama por defecto**, no sustituye un escaneo exhaustivo de todas las ramas. | Informativo |
| Documentación de PR #7 | Hay menciones explícitas a Fleetia en `SESSION_08_HANDOFF.md`, `SABORA_AUTHORIZATION_GATE.md`, `SABORA_INTEGRATION_PR4_PR5_READINESS.md` y documentación de seguridad. Son advertencias de **no intervención**; no se observaron instrucciones de conexión o reutilización de recursos de Fleetia en esos fragmentos. | Bajo: confusión documental si se interpreta como dependencia |
| Código operativo de PR #7 | La inspección de los módulos de operaciones de API y transporte de administración no mostró referencias a Fleetia ni a sus identificadores técnicos. | No se detectó mezcla en archivos inspeccionados |
| SQL candidato | La migración de cocina/camarero inspeccionada no mostró referencias a Fleetia ni al dominio de Fleetia. No se aplicó en una base operativa. | Sin indicios de mezcla en la migración inspeccionada |
| CI PostgreSQL con driver Node | `scripts/ci/catalog-postgres17-node-driver-smoke.sh` exige `GITHUB_ACTIONS=true`, crea contenedor con nombre `sabora-node-pg17-...` y publica puerto solo en `127.0.0.1`. | Bajo dentro del runner; no ejecutarlo en VPS |
| CI migraciones SQL | `scripts/ci/postgres-migration-smoke.sh` utilizaba `docker run --network none` y borraba su contenedor efímero, **pero no comprobaba que se ejecutara en GitHub Actions**. Se añade un rechazo temprano si no hay contexto de runner CI. | **Hallazgo corregido en código**, pendiente de CI |
| Identidad SQL | Las identidades de operaciones son técnicas propias de Sabora y permanecen sin permisos positivos de ejecución; el actor SQL sigue siendo bloqueo de seguridad independiente, no una dependencia de Fleetia. | Bloqueante para activar Sabora, no por mezcla de proyectos |

## Acciones y criterios pendientes

1. Verificar que ambos workflows de GitHub Actions pasan en el SHA que contiene la protección de `postgres-migration-smoke.sh`.
2. Completar inventario de **todas** las rutas del repositorio, workflows, ficheros de infraestructura y variables de entorno en la rama objetivo, además de las rutas cambiadas en PR #7; contrastar hosts, cadenas de conexión, nombres de contenedor, redes y volúmenes con recursos exclusivos de Sabora. No copiar credenciales a documentación.
3. Antes de cualquier despliegue, revisar un plan de infraestructura de Sabora con namespaces/nombres propios, redes y volúmenes independientes, sin operaciones Docker globales (`compose down`, `prune`, etc.), con evidencia de que no toca Fleetia ni otros proyectos.
4. No desplegar, no hacer merge, no tocar Supabase operativo ni infraestructura compartida sin autorización expresa.

**Conclusión provisional:** en los archivos examinados no se detectó integración funcional con Fleetia. Sí hay referencias documentales prohibitivas y se identificó una protección ausente en un script de Docker que ahora rechaza ejecución fuera de GitHub Actions. **No afirmar auditoría integral cerrada** hasta inventario completo y evidencia de aislamiento operacional.
