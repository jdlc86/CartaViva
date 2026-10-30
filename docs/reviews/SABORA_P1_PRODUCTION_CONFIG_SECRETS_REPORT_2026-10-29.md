# Sabora P1 — informe de configuración, secretos y aislamiento

**Fecha:** 2026-10-29

**Rama:** `integration/sabora-activation-readiness-20261028`

**PR:** #40 Draft

**Alcance:** candidato P1; sin merge, despliegue, aprovisionamiento ni activación.

## Resultado

P1 queda implementado como bloque cohesionado alrededor de la superficie real del repositorio. El API activo es ahora fail-closed en producción, acepta solo el modo `health-only`, no recibe secretos y mantiene dormidas las composiciones H3–H6. Los tres lectores PostgreSQL ya existentes conservan sus logins separados, TLS estricto y pools acotados, y además rechazan credenciales/marcadores de ejemplo en producción. La PWA cliente deja de aceptar silenciosamente un código de restaurante ausente.

El contenedor candidato no se inicia ni reinicia automáticamente, usa una red interna propia y conserva límites de recursos y privilegios. Una puerta CI inspecciona configuración, scripts, workflows, fuentes y bundles para detectar secretos de servidor, credenciales y controles Docker globales.

## Cambios verificables

- `api-runtime-config.mjs`: esquema explícito, configuración inmutable y error único sanitizado.
- `server.mjs`: factoría testeable, validación antes del listener, cierre por señal y error de arranque sin valores.
- `production-secret-policy.mjs` y los tres `*-pool-config.mjs`: rechazo de secretos de prueba y endpoints/certificados de ejemplo en producción.
- `table-qr.ts`: identificador público obligatorio y validado; sin fallback vacío.
- Compose/CI/Docker: configuración explícita no sensible, red interna, `restart: "no"`, health efímero y gate de artefactos.
- `.env.example`: nombres y marcadores deliberadamente inválidos, nunca valores reales.
- `SABORA_PRODUCTION_CONFIG_SECRETS_CANDIDATE_V1.md`: matriz, custodios, inyección, rotación, revocación, caducidad, aislamiento y puertas pendientes.

## Criterios de aceptación

| Criterio | Estado | Evidencia |
|---|---|---|
| Inventario normativa → entrada → validación → prueba | Cumplido | contrato P1, matriz por componente |
| Arranque de producción sin fallback | Cumplido | tests de faltantes, formatos, entorno, modo y error sanitizado |
| Prohibición de secreto innecesario | Cumplido | `health-only` rechaza los seis nombres sensibles SQL conocidos |
| Principales SQL separados y TLS | Cumplido para lectores existentes | login exacto por componente, CA obligatoria, `rejectUnauthorized=true` |
| No secretos en PWA/bundles/CI | Cumplido para artefactos candidatos | gate ejecutado después del build; CI sin GitHub Secrets |
| H4/H6 continúan opt-in | Cumplido | el servidor no importa composiciones, Stripe, notifier o workers |
| Aislamiento de infraestructura y costes | Cumplido estáticamente/efímero | red privada interna, loopback host, límites, no root, sin volumen/socket/red externa |
| Pruebas PostgreSQL 17 y regresión | Regresión local cumplida; PG17 reservado a CI aislada | 1.031/1.031 Node; el arnés PG17 rechazó correctamente la máquina local y se ejecutará en Actions |
| GitHub Actions del SHA final | Pendiente de registrar en comentario de cierre | se esperará por shell y se enlazará el run |

## Evidencia local previa al commit

- `npm test`: **1.031/1.031** pruebas aprobadas.
- `npm run check`: **PASS**; repite 1.031 pruebas, typecheck/build de API, cliente y gestión, y `production_config_gate_ok` sobre los bundles.
- Playwright cliente: **28/28** en Chromium, 14 flujos en 390 px y 14 en 1.440 px.
- `docker compose -f deploy/compose.sabora.yml config --quiet`: **PASS**. Docker emitió solo una advertencia local al no poder leer el fichero de configuración del usuario; el Compose se validó.
- Pruebas focalizadas P1: **8/8**, incluidos arranque negativo, no fuga, detección de limpieza global y pools SQL separados.
- `postgres-migration-smoke.sh`: rechazo local esperado `isolated GitHub Actions runner required`. Esta barrera impide ejecutar el arnés en una máquina compartida; la evidencia PostgreSQL 17 válida será el job `validate` del SHA final.

## Reproducciones negativas cubiertas

- Producción sin host, puerto o modo; puerto/host/entorno malformados.
- Modo `candidate`/`h6` y variables heredadas `HOST`/`PORT`.
- Secreto SQL o nombre sensible `VITE_` introducido en el proceso de salud.
- Password corto/de ejemplo, host `.test` y CA placeholder en cada lector SQL.
- Arranque fallido con un valor señuelo: salida exacta sanitizada y ausencia del valor.
- Intento de ruta funcional sobre el API activo: 404.
- Referencias de secretos en frontend/bundle, credenciales reconocibles, red externa, privilegios o comandos Docker globales.

## Límites y bloqueos reales

- No existe bootstrap operativo aprobado para H3–H6; no se inventaron variables para dependencias inyectadas.
- No están decididos los dominios/orígenes finales, secret manager, propietarios nominativos, caducidades ni credenciales SQL reales.
- Stripe productivo está bloqueado: el adaptador candidato acepta expresamente solo credenciales de test/restricted-test.
- No se ha autorizado migración, rollback, observabilidad o prueba sobre infraestructura productiva.
- No hay personal dado de alta ni correos históricos; no se requiere ni se ha creado backfill.
- La revisión de compatibilidad PostgreSQL 17.11/pgcrypto y TLS actual de Supabase queda como puerta operativa futura, sin tocar Supabase.

## Confirmación de límites

Cero cambios en Fleetia, VPS, Supabase operativo, GitHub Secrets o proveedores. No se hizo merge, despliegue, migración, envío de correo, pago, creación de worker ni activación de endpoints funcionales.
