# Sabora S50 — V2 real SSH/Docker in disposable CI, no external release signatures

**Fecha:** 2026-11-23. **Alcance:** `jdlc86/CartaViva` exclusivamente, PR [#85](https://github.com/jdlc86/CartaViva/pull/85) Draft. **Resultado:** V2 **PASS en ensayo de Docker/SSH desechable** en SHA `1972d26c0944fb551b8175b39efac3d2cff033cb`, sin dar por superada toda la CI ni el despliegue real.

## Fuentes y qué se comprobó realmente

- [GitHub Actions #45128918875](https://github.com/jdlc86/CartaViva/actions/runs/45128918875), job `web-publication`, **SUCCESS**: paso **`Exercise isolated controller transport, two releases, rollback and sentinel with real Docker`** terminó SUCCESS. No confundir con las demás puertas CI.
- Evidencias positivas en el log del **mismo job y SHA**:
  - `sabora_controller_lab_pass:v2-real-ssh-unsigned-deploy-C-and-sentinel`: paquete de cuatro ficheros, manifiesto, hashes y TAR reales recibidos por SSH bajo binarios C restringidos y verificador root V2; servicio API, egress y web creados/validados mediante Docker/Compose; HTTPS/readiness/ACK V2 y commit durable, todos en fixture disposable
  - `sabora_controller_lab_pass:v2-one-use-replay-denied`: la misma autorización no puede causar segunda mutación
  - `sabora_controller_lab_pass:v2-real-ssh-unsigned-rollback-A-and-sentinel`: rollback exclusivamente de release previamente healthy, sin transferir imágenes ajenas
  - `sabora_controller_lab_pass:v2-rollback-replay-denied`: rechazo de reintento
  - `sabora_controller_lab_pass:v2-disposable-transport-restores-v1-test-fixtures`: restauración de fixtures de la **misma VM desechable**, no reversión de instalaciones reales
  - `sabora_controller_lab_pass:integrated-sequence-complete`: control de no modificación de sentinel, más regresiones históricas V1 y estado unknown durable ante fallo de alerta
- Se añadió posteriormente, en SHA `ba575cb75e4ca73c3633927dfafdb84054f3ac26`, vigilancia **continua** del sentinel durante V2 y negativo de orden firmada V1 contra entrada V2. **La evidencia #45128918875 no acredita esos dos ensayos nuevos**: consultar la CI del SHA posterior exacto antes de atribuirles PASS.
- El laboratorio reutiliza SSHd real en `127.0.0.1:22229`, C `ssh-entry`/sudo root con argv fijo, redes Docker y tablas nft exclusivamente temporales, un sentinel ajeno en otro network, certificados locales desechables, paquetes API/web reales de CI con fixture de negocio, mismo esquema de ledger y migraciones PG17 validadas en jobs separados. **No conecta con VPS, Fleetia, Supabase operativo ni Cloudflare real.**

## Estado técnico y seguridad

La modificación S50 elimina del **modelo V2** la firma Ed25519 de autorización externa, los seis expedientes criptográficos y las nueve identidades firmantes. No elimina el canal SSH propio, manifest/hash, verificaciones de contenedores/red, comando forzado, TLS, auditoría de consumo, autenticación y permisos de aplicación, ni las autorizaciones separadas de instalación, SQL y deploy.

**Limitaciones todavía STOP para activación:** controlador V2 no instalado en el VPS; GitHub Environment/secrets V2 no acreditados como operativos; reserva de redes, modos y ACL, aislamiento live, alerta de producción y HTTPS de ambas PWA no comprobados en destino real; DBA PG17 `verify-full` y árbol SQL no autorizados/ejecutados; CI `validate`/`generate-lockfile` del HEAD pendiente; sin backup/restore real bajo excepción de **primera activación ficticia**; sin aceptación humana funcional/visual. No se declara conformidad completa ni `GO deploy`.

**Frontera absoluta:** no se ha usado o alterado ninguna credencial, volumen, red, servicio, contenedor o mecanismo operativo de Fleetia. El sentinel del runner es un testigo de laboratorio, **no demuestra por sí solo** que Fleetia en el VPS vaya a permanecer inalterado; esto exige preflight real con autorización separada antes de la instalación.

## Siguiente hito único, sin procedimientos redundantes

Cerrar la CI exacta del último HEAD del PR, eliminar regresiones, revisión interna de código y aislamiento V2, preparar **una sola** instalación de controlador Sabora con manifiesto root-owned y comandos restringidos, receptor HTTPS v2 y preflight DBA material. Probar el primer deploy con datos ficticios bajo autorizaciones expresas distintas de merge/SQL/VPS/deploy. No reintroducir firmas externas o expedientes ni crear otros VPS/PC, y no usar un bypass temporal al controlador para adelantar el despliegue.

## Actualización S50-6 — manifiesto V2 derivado del árbol root-owned, no de declaraciones

Se añadió `deriveControllerInstallationManifestV2` en `scripts/ops/sabora-release-installation-v2.mjs`, que no instala ni autoriza por sí misma; calcula un manifiesto inmutable de artefacto, fuentes individuales, Node, dos binarios C, herramientas/Compose y configuración a partir de ficheros efectivos controlados por root. La ruta de producción vuelve a comprobar su inventario sin firmas. **No se sustituye** la comprobación de origen GitHub con calcular el digest local.

[CI #45132977421](https://github.com/jdlc86/CartaViva/actions/runs/45132977421), job `web-publication` SUCCESS, SHA `e772b0880cc27b1d25f7377fc05d349d08a6d51f`: log positivo `v2-root-owned-generated-installation-accepted-without-signature`, negativos `v2-modified-source-denied-before-ssh-or-docker` y `v2-modified-installation-config-denied-before-ssh-or-docker`, además de `v2-real-ssh-unsigned-deploy-C-and-sentinel`, `v2-real-ssh-unsigned-rollback-A-and-sentinel`, `v2-foreign-sentinel-never-interrupted` e `integrated-sequence-complete`. El PASS de un **paso** no equivale a toda la CI, instalación en VPS, Supabase, alerta productiva o aceptación humana. La CI del commit documental final se comprobará separadamente.
