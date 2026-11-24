# S48 — cadena real de procedencia y compilación de controlador fuera del VPS (22-11-2026)

**Dictamen:** **GO de integridad del código fuente del SHA revisado y dos compilaciones reproducibles de ELF, únicamente para revisión off-host. NO-GO de instalación, firma de host, SQL o deploy**. A diferencia del ZIP de cuarentena S48-14, este paquete procede de un `main` posterior, incluye el código del controlador, y fue comprobado fuera del VPS. Este informe no sustituye la normativa [S43](../runbooks/SABORA_S43_RELEASE_CONTROLLER_PROVISIONING_CANDIDATE_2026-11-19.md), [S46](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) o [frontera de proyectos](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md).

## 1. Entrada verificable de GitHub

| Campo | Valor observado |
|---|---|
| Repositorio | `jdlc86/CartaViva` |
| Fuente exacta | `main@a5f0d90179515c8a2e539c584705654231e0e357` (PR #83 integrado) |
| Acción de CI fuente | [push run #45050207002](https://github.com/jdlc86/CartaViva/actions/runs/45050207002), job `web-publication` **SUCCESS** |
| Artifact del controlador | [#14765500563](https://github.com/jdlc86/CartaViva/actions/runs/45050207002/artifacts/14765500563), `sabora-real-docker-release-driver-lab` |
| ZIP original GitHub | 64.294 bytes, SHA256 `c631c22417ce76f83d9019d1d2fba2f95ed8bf38e5417209baef91381d50d97a` |
| `controller-artifact/artifact.json` | SHA256 `c3433da639ce54118bdd0fa9e81cb665dd055644730a45e12e2b68f488e64fcd` |
| Manifiesto | `sabora-controller-artifact/v1`, repositorio/commit exactos, **28 ficheros** |
| Prueba de integridad local | 28/28 SHA256 de los ficheros reproducen el manifiesto; conjunto de entradas exacto, sin entradas extra, ausencia de duplicados, traversal o symlinks |
| Recibo de laboratorio incluido en artifact GitHub | `sabora-controller-disposable-lab/v1`, 42 pruebas enumeradas; `externalAuthorities=synthetic-lab-only`, `operationalAcceptance=false`, `sqlExecuted=false` |

**Diferenciar:** el recibo de CI no es firma de custodia, evidencia DBA real, reserva de infraestructura ni aprobación independiente. La descarga fue por el conector GitHub y se comprobó el SHA256 sobre bytes locales; no se extrajo nada en VPS.

## 2. Compilación reproducible fuera del VPS

Se extrajeron las fuentes verificadas `deploy/sabora-release-shell.c` y `deploy/sabora-release-root.c` en dos carpetas temporales distintas del entorno local de revisión. Cada ejecutable se compiló **dos veces** con `gcc -O2 -Wall -Wextra -Werror`, sin instalar ni modificar bibliotecas globales del VPS. Se compararon byte a byte ambas salidas; **resultado idéntico**.

| Objeto local Linux x86_64 | SHA256 obtenido |
|---|---|
| `ssh-entry` | `9181b3201bf7c79fa7d314c5a8502ab930304d3193c97747fc6d09a6dc05f7d8` |
| `root-entry` | `3c9c10af61220e09f63f94d2e4ad6cd58f5b3a8a7bf316529f892eae1b31995a` |

Compilador de la revisión: GCC `14.2.0` (Debian), `glibc 2.41`; ambos artefactos empiezan por la cabecera ELF. Los hashes coinciden con la preparación local S43 para las mismas fuentes C, **no se afirma compatibilidad binaria real ni ejecución privilegiada en VPS**. Comprobar toolchain autorizada y ABI efectivas en la instalación posterior.

El ZIP **histórico ya recibido** por S48-14 está anclado a **otro** source SHA, `426960f0c6e645cd21575e0883e8a03638cc9e3a`, no al actual `a5f0...`. Se volvió a descargar para comprobar los digests internos: `ssh-entry = a9028d71545387af18625c0851e3f486aa95f98992fa04e458bbc1ad16a7b8f0` y `root-entry = 0715d57ec87674ef71c36534ecae66195c8a387834772278e0ba6f56a5e0e2f5`. **No son byte idénticos** a los compilados desde el árbol actual. Está expresamente prohibido tratar los antiguos ELF de cuarentena como lanzadores del nuevo código sin una autoridad de instalación que valide todos los SHA y su compatibilidad.

## 3. Paquete de revisión local generado

Archivo efímero de revisión `sabora-controller-offhost-review-a5f0d901.zip`, 72.303 bytes, SHA256 `305b0a549e4ef8b71a484837c27ca6bdfa366a108ecab1832e0ced78d4fe5cfc`: incluye el código ya verificado, dos ELF de compilación doble, `provenance.json`, `SHA256SUMS` y README explícito **NO INSTALABLE**; 34 entradas. Se comprobó vuelta de lectura de todas las entradas. **El expediente durable de procedencia sigue siendo GitHub Actions #14765500563**; este ZIP local no se ha subido a Git, firmado por el propietario ni transferido al VPS. Caducidad de Actions: plazo normal de retención; no inventar permanencia.

El archivo `provenance.json` declara explícitamente `installable=false`, `ownerInstallationSignatureVerified=false`, `runtimeNodeBundled=false`, `privateComposePluginBundled=false`, `signedProductionConfigurationBundled=false`, `authenticatedRealCustodianDossiersBundled=false`, `sqlInitialPreflightPerformed=false`, `sqlMigrationsExecuted=false` y `liveDeploymentValidated=false`.

## 4. Puertas no cerradas y orden normativo vigente

1. **Preparar y autenticar Node 22 linux-x64** (canal oficial, hash/firma independiente, binario privado sin symlink), y el plugin Compose propio y hash de las herramientas del host. Este informe **no** avala copiar Node/Compose encontrados en otra instalación o usar toolchain sin firma.
2. **Resolver la identidad de release** `sabora-release`, sus restricciones SSH/forced-command/sudoers, configuración y ACL root, registros y reserva material de nombres/puerto/3 redes/egress sin interferir otros proyectos. Un directorio presente no es un agente instalado.
3. **Preparar configuración y autoridad real:** nueve claves/autoridades separadas según S43, evidencia de revisión, seis expedientes materiales y reserva/recepción de alertas, firma Ed25519 del **propietario**, en `installation.json` como último acto. No generar firmas simuladas ni usar claves de fixture de CI.
4. **Respetar S46**, que antepone preflight DBA real PostgreSQL 17 de origen Sabora inicialmente vacío, firmado, a autorización SQL exacta y aplicación append-only. La excepción de recuperación genesis con datos ficticios no dispensa esas autoridades. Ni esta preparación ni la autorización para instalar constituyen permiso para consultar o modificar Supabase.
5. **Instalación y primer despliegue** solo con autorización operativa posterior, pruebas reales de aislamiento y origen TLS, y demás controles S43/S40/S46. El ZIP previo permanece inerte en cuarentena; no reintentar el stage ni instalar directamente los ELF.

**Alcance observado:** operaciones sobre artifact GitHub y entorno temporal off-host; **no hubo intervención en VPS, Supabase ni Fleetia** en este hito. La documentación de S48-15 deja identificado el preflight remoto anterior (también read-only), que no se repitió al compilar.

## 5. Paquete de publicación API/web verificado contra el mismo SHA

Se descargó por el conector GitHub el [artifact `sabora-governed-release-package` #14765780063](https://github.com/jdlc86/CartaViva/actions/runs/45050207002/artifacts/14765780063) del run `push main` #45050207002, correspondiente a `a5f0d90179515c8a2e539c584705654231e0e357`. ZIP exterior: **89.995.677 bytes**, SHA256 **`ff7528866650009ab9659f41aac3ef884fa4a2b372f45628dc19dfe2f5716ee4`**; coincidencia de digest real con GitHub, `expired=false` durante inspección, vencimiento 29-nov-2026 17:37:31 UTC.

Su inventario exacto consta de cinco entradas regulares sin symlinks ni extras: `manifest.json`, `api.tar`, `web.tar`, `operational.yml`, `web.yml`. El manifiesto SHA256 **`d36f6e48cecf40aeec3205cd183f377fe0dbad0ec8dd06585418e62483b33074`** declara `sabora-release-bundle/v1`, proyecto `sabora`, SHA `a5f0d901...`, servicios `sabora-egress`, `api`, `web`.

| Entrada | Bytes originales | SHA256 comprobado del contenido |
|---|---:|---|
| `api.tar` | 194.465.792 | `7599a85efcd7755f32717c7cf63d22d2017ba917245ff7c8c65d05563a545e81` |
| `web.tar` | 66.765.824 | `1be7110133871f3b7e5ff644211df93a40390304915997d4bbf95eadec5e9ef9` |
| `operational.yml` | 3.252 | `bda8bf58cc922ab2775bf9fa8b7ed1947bf4f23066f585cdb34ca58e7d7237d8` |
| `web.yml` | 2.181 | `94af6c5d71c4c24dd2109ceb3324bdcf9f541c6667c1e6b77fc29ea79e547921` |

**4/4 digests internos PASS**, comprobados realmente leyendo ZIP sin extraer TAR, cargar imágenes, ejecutar Compose o conectar VPS. IDs de imagen declarados por manifiesto (no importados de nuevo): API `sha256:e0c22c5cb00141896c54bae0aee3fe74604d71277e46e0d68faf55852ddcf331`; web `sha256:1f4754be8b1209f5589438a3244b463dbfd870824b1c35d0bbc9313bcc0192a5`. El laboratorio integrado de CI es evidencia distinta, no certificación operativa.

**Dictamen adicional:** existencia y **bytes verificados del paquete de aplicación** del SHA exacto. No equivale a instalación del controlador, firmas Ed25519 reales, SQL PG17/S46, límites de red ni primer despliegue. No se transfirió el paquete ni se operó VPS/Fleetia. Al vencer el artifact debe regenerarse y revisarse, no eludir la firma ni reusar el ZIP antiguo.
