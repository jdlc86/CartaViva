# Sabora S38 — candidato de integración Git real CV-005 + Bloque 2

**Fecha:** 13-11-2026. **Naturaleza:** informe de candidato técnico y evidencia de CI, **no norma**, no autorización de integración en `main`, DDL, provisión de secretos ni despliegue. Ámbito único: repositorio `jdlc86/CartaViva` y restaurante Sabora. Fleetia y otros proyectos del VPS quedan expresamente excluidos.

## 1. Cambio de estrategia: de overlay temporal a un único árbol Git

Los PR [#57 CV-005](https://github.com/jdlc86/CartaViva/pull/57) y [#58 B2 operativo](https://github.com/jdlc86/CartaViva/pull/58) terminaron sus remediaciones con 4/4 Actions `SUCCESS` **por separado** en los SHAs `a60548955d559da7ecc4b686f59c01974298dd46` y `31e76b484ec0cc43cbfc929821afa1e9ffa7c100`. Esto no acreditaba un árbol realmente integrado.

Se preparó **dentro de la rama ya existente del PR #58**, sin PR nuevo ni cambio en `main`, el commit de dos padres:

- [SHA integrado `c3216fecf2133cd1852d3b6d21516308836e6a2d`](https://github.com/jdlc86/CartaViva/commit/c3216fecf2133cd1852d3b6d21516308836e6a2d).
- Padre 1: `31e76b484ec0cc43cbfc929821afa1e9ffa7c100` (B2).
- Padre 2: `a60548955d559da7ecc4b686f59c01974298dd46` (CV-005).
- SHA del árbol unido: `bf2d2f064ad8734b975c8bbfbdbc7ba938e6edca`.
- Diferencia frente a `main` en este corte: **111 archivos, 61 SQL**, 99 migraciones SQL presentes. Los **70 archivos específicos de CV-005** se integraron como blobs Git originales: 61 SQL + 9 contratos/harness/documentación. No había rutas solapadas entre ambos PR ni entre los cambios de #57 y los 18 commits `main` posteriores a su base.
- **Comprobación estructural independiente:** el SHA del árbol directorio `supabase/migrations` unido, `d26f1d4fc22acb13b6bda4927c424a74f5164c4a`, es **idéntico** al de CV-005, demostrando igualdad exacta de los 99 blobs SQL.

## 2. Nueva puerta integradora sin copia de SQL

La misma rama #58 actualizó [`cv005-b2-combined-candidate-rehearsal.sh`](../../scripts/ci/cv005-b2-combined-candidate-rehearsal.sh) y [su workflow](../../.github/workflows/sabora-cv005-b2-cross-candidate.yml):

1. GitHub Actions obtiene el **SHA exacto** del PR #58 y todo su historial Git para validar el segundo padre `a60548955...` como ancestro.
2. Descarga CV-005 por el **SHA inmutable** (no una rama móvil). Comprueba **99 nombres y contenidos SQL idénticos**, los nueve archivos de contrato/instalación idénticos y **61 diferencias contra `origin/main`**.
3. **No copia, superpone, modifica ni regenera SQL** en la aceptación. Ejecuta las 99 migraciones del **árbol real del PR #58**, el harness no-superuser PG17, la suite H6/HTTP/HMAC, Chromium y build de la API y ambas PWA.
4. El workflow PG17 independiente de CV-005 también se activa para el PR #58 ahora que contiene sus archivos. Si un SHA fuente, archivo, grant, ledger o migración difiere, el guard falla.

Esto cierra la laguna de afirmar «mismo SHA» basándose únicamente en un overlay de SQL en un runner. **El árbol está listo para probarse; la regresión debe citar su propio SHA `c3216fec`, no resultados anteriores.**

## 3. Evidencia de ejecución al momento de crear este informe

En el SHA integrado `c3216fec...` GitHub lanzó cinco workflows:

| Ejecución | Resultado consultado inicialmente |
| --- | --- |
| [CV-005 PG17 sin superusuario #43420817442](https://github.com/jdlc86/CartaViva/actions/runs/43420817442) | **SUCCESS** |
| [Functional UI #43420817632](https://github.com/jdlc86/CartaViva/actions/runs/43420817632) | **SUCCESS**; aceptación visual final `skipped` |
| [Sabora CI/H6 #43420817427](https://github.com/jdlc86/CartaViva/actions/runs/43420817427) | **EN EJECUCIÓN**, no atribuir PASS antes de cierre |
| [Bootstrap PG17 #43420817720](https://github.com/jdlc86/CartaViva/actions/runs/43420817720) | **EN EJECUCIÓN**, no atribuir PASS antes de cierre |
| [SHA integrado SQL+API+Chromium #43420817510](https://github.com/jdlc86/CartaViva/actions/runs/43420817510) | **EN EJECUCIÓN**, guard de árbol superado y fase H6 iniciada; no declarar éxito final |

*Este documento registra un corte histórico; comprobar los cinco runs en GitHub antes de decidir.* No contar como prueba de aceptación humana ni de proveedor.

## 4. Dictamen provisional y siguiente puerta

- **Implementación de candidato integrado:** SÍ, árbol Git real con segundo padre CV-005 y blobs SQL íntegros.
- **Pruebas integradas del SHA:** PARCIALES en el primer corte, tres workflows largos pendientes.
- **Revisión DBA/seguridad formal sobre el nuevo SHA:** PENDIENTE. Los dictámenes anteriores siguen como `COMMENTED` y `REQUEST_CHANGES` técnico sobre SHAs antiguos; las remediaciones posteriores no constituyen `APPROVED` automático.
- **Integrado en `main`: NO.** PR #57 y #58 continúan Draft.
- **Operación real validada: NO.** Falta verificación gestionada Supabase 17.11/`supautils`, DBA/ledger y rollback reales, credenciales/roles, backups/custodia/PITR, CA y endpoints, restricción material egress/firewall en namespace Sabora del VPS, alertas externas y aceptación visual.

**Decisión del corte:** mantener ambos PR Draft y sin merge `main` ni operaciones de infraestructura hasta completar las cinco Actions, confirmar revisión independiente sobre el árbol final, subsanar eventuales hallazgos, y recibir las autorizaciones expresas correspondientes. Ningún contenedor Fleetia o de otro proyecto debe verse afectado por instalación, reversión o reinicio de Sabora.

**Documentos relacionados:** [normativa de validación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [modelo de autoridad DBA CV-005 en el PR #57](https://github.com/jdlc86/CartaViva/blob/a60548955d559da7ecc4b686f59c01974298dd46/docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md), [revisión de remediación en continuidad S38](../handoffs/SESSION_38_HANDOFF_2026-11-12.md), [tracker vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
