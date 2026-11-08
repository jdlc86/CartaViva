# Sabora / CartaViva — continuidad operativa de la sesión 30 (2026-11-08)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA, APROBACIÓN VISUAL NI AUTORIZACIÓN DE PRODUCCIÓN.** Este relevo conserva contexto y evidencias verificables para cerrar hitos completos. La fuente de verdad son los documentos normativos de GitHub; un resultado CI correcto certifica solo el recorrido realmente ejecutado.
>
> **Tablero vivo obligatorio:** [SABORA_LIVE_PROJECT_TRACKER](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) (hitos M1–M6 y CV; §§53–56 para gobierno administrativo). **Relevo anterior:** [sesión 29](SESSION_29_HANDOFF_2026-11-07.md), especialmente §§16–20. **Matriz H6:** [F01–F28 / R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).

## 1. Precedencia normativa y límites del proyecto

- **Funcionalidad y economía:** [REQUISITOS_FUNCIONALES](../REQUISITOS_FUNCIONALES.md) y [SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md). Una instalación Sabora atiende **un único restaurante**. Conservar las garantías de pagos, deuda por persona, pagador tercero, devolución al pagador y medio originales, Stripe/efectivo, idempotencia y cambio de mesa.
- **Diseño y recorridos aprobados:** [DESIGN_SYSTEM_CONTRACT](../DESIGN_SYSTEM_CONTRACT.md), [APPROVED_VISUAL_STYLE_AUDIT_V1](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [DESIGN_REQUIREMENTS_V1](../design/DESIGN_REQUIREMENTS_V1.md) y [matriz funcional↔UI](../design/FUNCTIONAL_UI_COVERAGE.json). La apariencia actual y las capturas automatizadas **no sustituyen la aprobación humana**; en conversaciones previas el usuario rechazó imágenes de la PWA que no respetaban el diseño aprobado ni la banda de anuncios. No presentar maquetas como capturas de la aplicación real.
- **Gobierno y seguridad:** [ROOT/ADMIN y escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [ADMIN_WRITE_OWNERSHIP_V1](../security/ADMIN_WRITE_OWNERSHIP_V1.md) —aplicar su **rectificación vinculante de 20-10-2026**—, [SABORA_OWNERSHIP_OPERATION_CONTRACT](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [matriz de recursos](../security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md), [identidad SQL](../security/SABORA_SQL_ADMIN_IDENTITY_CONTRACT.md) y [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md).
- **Arquitectura y aislamiento:** [hoja de ruta](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md) y [auditoría de aislamiento Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).
- **Jerarquía:** normativa/decisiones expresas > criterios de aceptación > pruebas efectivamente ejecutadas > tablero/informes > continuidades históricas. Ante discrepancia, **comprobar fuente normativa y código**, no resolverla interpretando una continuidad como requisito.

## 2. Estado comprobado al preparar la sesión 30 — 08-11-2026

- Repositorio autorizado: [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva).
- Cadena **OPEN / Draft**, todavía **sin fusionar**: [PR #50 — contrato visual](https://github.com/jdlc86/CartaViva/pull/50) → [PR #51 — CV-014/M3/M5](https://github.com/jdlc86/CartaViva/pull/51) → [PR #52 — gobierno de titularidad](https://github.com/jdlc86/CartaViva/pull/52). El PR #52 usa la rama `feat/sabora-admin-ownership-end-to-end-20261108`, basada en la rama de PR #51. No inferir que el código ya está en `main`.
- **Último commit FUNCIONAL efectivamente probado:** [`bea0851c190d993464918e664824fd6b5b7bbe39`](https://github.com/jdlc86/CartaViva/commit/bea0851c190d993464918e664824fd6b5b7bbe39). Se verificaron **6/6 workflows `completed/success` del MISMO SHA**, no la simple presencia de checks verdes de revisiones históricas:

| Workflow GitHub Actions | Resultado confirmado | Evidencia |
| --- | --- | --- |
| Bootstrap, migraciones y driver Node en PostgreSQL 17 efímero, Chromium integrado | **SUCCESS** | [Run 42518257251](https://github.com/jdlc86/CartaViva/actions/runs/42518257251) |
| H6 consolidado: contratos, PostgreSQL 17, HMAC/JWT, Fastify y Chromium | **SUCCESS** | [Run 42518257261](https://github.com/jdlc86/CartaViva/actions/runs/42518257261) |
| Instalación, offline y separación de ambas PWA, CV-012 | **SUCCESS** | [Run 42518257240](https://github.com/jdlc86/CartaViva/actions/runs/42518257240) |
| Conformidad Chromium PWA cliente | **SUCCESS** | [Run 42518257227](https://github.com/jdlc86/CartaViva/actions/runs/42518257227) |
| Navegador de gestión | **SUCCESS** | [Run 42518257244](https://github.com/jdlc86/CartaViva/actions/runs/42518257244) |
| Correspondencia funcional ↔ UI; aceptación visual humana diferida | **SUCCESS** | [Run 42518257268](https://github.com/jdlc86/CartaViva/actions/runs/42518257268) |

**Precisión documental:** el commit que crea este archivo y actualiza el tablero es **solo documental**. Sus cambios no son un nuevo SHA funcional ensayado. No atribuirle las seis ejecuciones del commit `bea0851c`; si se modifica código después, requerir nuevas pruebas de ese SHA.

## 3. Hito de la sesión 29 que recibe la sesión 30: gobierno ADMIN de escritor único

- [Informe del gobierno integral candidato](../reviews/SABORA_ADMIN_OWNERSHIP_GOVERNANCE_INTEGRAL_CANDIDATE_2026-11-08.md) y [frontera de escritor único M3/M5](../reviews/SABORA_ADMIN_SINGLE_WRITER_M3_M5_SECURITY_CANDIDATE_2026-11-08.md) describen la **implementación candidata**, sin constituir nueva normativa.
- **Regla vinculante:** varios ADMIN posibles; **un único ADMIN activo titular de escritura administrativa**; ROOT no ocupa titularidad y no obtiene bypass de escritura ordinaria. ROOT sí puede reasignarla excepcionalmente a ADMIN activo con motivo y auditoría.
- **Recorrido implementado:** ADMIN no titular solicita; titular ofrece cesión; actor habilitado acepta, rechaza o cancela; ROOT fuerza reasignación; reintento semánticamente igual no duplica efectos; transferencia invalida la escritura administrativa del titular antiguo incluso si conserva un JWT todavía válido.
- **Fronteras técnicas candidatas:** migraciones `20261108121000_sabora_m3_m5_admin_single_writer_candidate.sql` y `20261108150000_sabora_admin_ownership_governance_rpc_candidate.sql`; propietario/roles técnicos SQL mínimos, RLS forzada, bloqueo del singleton, firma HMAC y actor/JWT verificados; API Fastify opt-in, pantalla Equipo de gestión, auditoría y bandeja durable de notificaciones. No confundir avisos consultables manualmente con push en tiempo real.
- **Escenarios integradores previstos y ejecutados por el pipeline:** solicitud/oferta/decisión, traspaso y caducidad lógica de propuestas anteriores, denegación de no titular/ROOT ordinario, reasignación ROOT auditada, concurrentes con un solo ganador, rollback/replay, acciones de cocina/camarero preservadas, y recorrido PostgreSQL 17/Fastify/Chromium. El resultado **6/6 SUCCESS** demuestra ejecución satisfactoria del conjunto automatizado, no una revisión de seguridad independiente de toda ruta futura.

## 4. Incidencias relevantes que sí se corrigieron antes del 6/6

1. **Autorización SQL 42501 `invalid_ownership_capability`:** se detectó que tres expresiones regulares aceptaban erróneamente UUID de estructura 8-4-4-12 en vez de 8-4-4-4-12. La migración fue reconstruida sin duplicación accidental y corregida en [`48411f47`](https://github.com/jdlc86/CartaViva/commit/48411f4742d3304b01aa22d1b40a116d04a14e27). No se retiró la firma ni la comprobación de rol/estado.
2. **CV-014 editor de anuncios:** selección/foco diferido de la herramienta Negrita permitía que el emoji de la banda sustituyera texto previamente formateado; corregido y protegido con aserción en el recorrido de Chromium en [`f6eb8db6`](https://github.com/jdlc86/CartaViva/commit/f6eb8db67efa444bc07cdd600d7043793bfe0dfe).
3. **CV-012 intermitencia Chromium:** registro SW activo pero página sin controlador tras `reload()`; recorrido ajustado para esperar `serviceWorker.ready` y verificar una nueva navegación real después de instalar, [`47ce6df4`](https://github.com/jdlc86/CartaViva/commit/47ce6df4e4766e9eb364108fba24b52159d90c4b). Mantiene exigencia de almacenamiento aislado, exclusión de API y fallback offline.
4. **Pantalla Equipo duplicaba «Titularidad de escritura»:** coexistían el panel operativo y la tarjeta informativa anterior; al habilitar el panel real se oculta el marcador de posición, [`bea0851c`](https://github.com/jdlc86/CartaViva/commit/bea0851c190d993464918e664824fd6b5b7bbe39). La prueba integrada llegó al panel real y toda la cadena final terminó verde.

Conservar el historial de fallos sin presentar correcciones provisionales como cierre; **el hito técnico culmina en el SHA funcional `bea0851c` y sus seis ejecuciones correctas**.

## 5. Qué sigue ABIERTO (prohibido inferir cierre automático)

- **Revisión independiente de seguridad/PR apilados:** verificar permisos efectivos, firmas, RLS, auditoría, accesos mínimos y todas las escrituras administrativas del ámbito autorizado. Una batería verde no autoriza merge ni concede credenciales productivas.
- **F28/R09 y diseño:** pendiente aceptación visual humana en la PWA real, siguiendo composición aprobada y banda de anuncios; pruebas de accesibilidad/Chromium no equivalen a aprobación del usuario. Evitar inventar capturas o presentar mockups como app.
- **CV-014 funcional:** anuncios/comunicaciones cuentan con candidato integrado; **reservas anticipadas y «llamar camarero» pendientes** según la continuidad y tablero. Determinar estado exacto consultando normativa/implementación antes de abrir otro bloque.
- **M4 económico:** lo probado en efectivo, pagador tercero, propinas y estados de autorización/SCA **no acredita Stripe sandbox real, captura, refund bancario ni liquidación física**. No duplicar deuda ni devolver a persona distinta de quien pagó.
- **M6/preparación productiva:** accesos operativos y secretos, dominios/orígenes, procedimientos de bootstrap/rollback, observabilidad y recuperación, aislamiento de infraestructura y autorización de despliegue **NO-GO**.
- **H6/matriz:** F01–F28/R01–R10 trazados no significa aceptación humana de todas sus filas. Mantener registros de qué fue implementado, probado y efectivamente validado.

## 6. Próxima secuencia sugerida para la sesión 30

1. **Leer normativa y situación real de GitHub** (estado de PR #50/#51/#52, rama base, checks del HEAD, revisiones de seguridad y tablero); no iniciar desde un supuesto histórico. El primer cierre lógico es una **revisión independiente integral del hito ADMIN titular único**, no una colección de pruebas pequeñas ni un merge anticipado.
2. Si esa revisión descubre un defecto demostrado, **corregir el flujo completo** en PR #52 y lanzar el conjunto integrado PG17 + API + Chromium + H6 para el nuevo SHA, sin suprimir aserciones ni relajar autorizaciones. Documentar solo cambios/hitos relevantes en el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y en esta continuidad.
3. Si no se encuentran defectos bloqueantes, dejar el PR preparado para decisión explícita del usuario; **no fusionar ni desplegar sin autorización**. Pasar al siguiente hito normativamente priorizado, conservando requisitos pendientes de CV-014, M4, visual y M6; no inventar requisitos ni nuevos flujos.
4. Cuando se requiera inspección de pantalla, usar la **PWA real y su artefacto de ejecución** y contrastarlo con el diseño aprobado antes de declarar aprobación; distinguir screenshot real, diseño histórico aprobado y propuesta hipotética.

## 7. Reglas operativas de obligado cumplimiento

- **Solo `jdlc86/CartaViva`:** se permiten ramas, commits, PR Draft y GitHub Actions de este repo conforme a la autorización vigente. **Ningún merge ni despliegue sin autorización expresa.**
- **No tocar Fleetia** ni sus contenedores, redes, volúmenes, servicios, bases, VPS compartido o recursos de otros proyectos. Sabora debe mantenerse totalmente aislado.
- **No operar Supabase real `byhvmumqivmunkmomhup.supabase.co`** para ensayar candidatos: PostgreSQL 17 **desechable/aislado** y pruebas integradas, no datos operativos.
- Cerrar **hitos completos**; usar pruebas específicas solo para diagnosticar un fallo concreto o proteger una invariante crítica, y pruebas **integradoras** para aceptación técnica. Corregir y repetir la cadena cuando sea necesario.
- La información del handoff se mantiene en el tiempo para contexto, pero **nunca reemplaza los contratos normativos**. Cada entrada posterior debe indicar archivo/SHA, qué se implementó, qué CI se ejecutó, límites de la validación y qué sigue pendiente.

**Enlaces de navegación:** [PR #52](https://github.com/jdlc86/CartaViva/pull/52) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [sesión 29](SESSION_29_HANDOFF_2026-11-07.md) · [informe técnico de gobierno](../reviews/SABORA_ADMIN_OWNERSHIP_GOVERNANCE_INTEGRAL_CANDIDATE_2026-11-08.md).

## 8. 08-11-2026 — auditoría independiente de seguridad PR #52 (hito en curso)

Después del 6/6 de `bea0851c`, la revisión independiente del código normativo y SQL encontró **cuatro incidencias** que el CI anterior no cubría: HMAC/caducidad nulos aceptables por semántica SQL `IF NULL` en (i) gobierno de titularidad, (ii) verificador compartido M3/M5, (iii) identidad/directorio del personal; además (iv) el lock del destinatario se obtenía después de la propuesta, cuando la normativa exige staff ordenado antes de propuesta. **Se han corregido en código candidato**, con nuevas pruebas negativas en PostgreSQL 17 y sin tocar migraciones históricas, producción ni Fleetia.

**SHA funcional nuevo bajo verificación:** `d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1`. **No heredar el 6/6 anterior**: la cadena nueva PostgreSQL 17/H6/Chromium aún debe completarse y corregirse si falla. La auditoría distingue un control SQL objetivamente incompleto de una explotación HTTP real **no acreditada**. [Informe detallado](../reviews/SABORA_ADMIN_OWNERSHIP_INDEPENDENT_SECURITY_AUDIT_2026-11-08.md) · [tablero §57](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). PR #52 Draft, no merge ni despliegue.