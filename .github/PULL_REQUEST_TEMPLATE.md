## Puerta funcional — obligatoria ahora

- [ ] He leído contratos NF/RF/DV aplicables e identificado decisión aprobada vs pendiente (enlaces/secciones).
- [ ] He definido alcance completo del hito y actualizado `docs/design/FUNCTIONAL_UI_COVERAGE.json` y tablero para cada funcionalidad afectada.
- [ ] Para cada función implementada he identificado actor/rol, acceso en la PWA cliente/gestión, botones reales, estados de carga/éxito/error y efectos de persistencia. No hay botones ficticios ni funciones solo de backend declaradas completas.
- [ ] He ejecutado una prueba integradora de valor desde la interfaz hasta API/roles/PG17 y de regreso (ambas PWA cuando corresponda), además de regresión: SHA y enlaces a Actions.
- [ ] La UI funcional conserva la composición/dirección visual **realmente aprobada**, teclado/accesibilidad y requisitos de seguridad, sin introducir un rediseño no autorizado.
- [ ] Los huecos PENDIENTES y dependencias externas están expresos; no se presenta un prototipo o mock como producto operativo.

## Puerta visual — solo en la fase final de diseño/aceptación

- [ ] ¿Este PR declara cierre visual final? Sí / No. Si NO, no exige una nueva captura maestra exacta para desarrollar controles funcionales.
- [ ] Si SÍ: hay baselines aprobados **antes** de la PR, capturas Chromium comparativas del mismo SHA y aprobación personal explícita del propietario; ejecutado `visual-final-acceptance-gate`. Un agente no publica aprobación en nombre del propietario.
- [ ] Mantengo separados código implementado, tests ejecutados, subalcance técnicamente validado y aceptación humana/operativa.

**No merge ni despliegue sin autorización expresa.** Un solo restaurante Sabora. Prohibido tocar Fleetia o Supabase operativo/VPS sin permiso y aislamiento completo.
