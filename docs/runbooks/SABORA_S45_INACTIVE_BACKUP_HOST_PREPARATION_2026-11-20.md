# S45 — preparación material inactiva del receptor de backups

**Propuesta pendiente de autorización de operación. NO EJECUTADA.** Release exacto `7eb11cee0ceeeaf72e49c3b3ff1ee5530c7d2bb9`, sin modificación de main ni nuevos tests integrales. [S40](SABORA_S40_DUAL_BACKUP_AND_FIRST_DEPLOY_EXECUTION_2026-11-14.md) y [metodología](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md) prevalecen. No modifica el contrato de activación.

## 1. Base material comprobada

[Acta del volumen](https://github.com/jdlc86/CartaViva/pull/72#issuecomment-7043880082). Archivo preasignado 2147483648 B, /srv/sabora-backup-storage/volume.ext4 (root:root 0600; padre 0700), UUID b08fc057-e866-465f-821b-c4776f10c218, montado en /srv/sabora-backup como ext4 con nodev,nosuid,noexec. Capacidad statfs 2040373248 B, disponible no-root 1915674624 B. Ambos puertos propios candidatos 8443 y 22239 sin listener en la verificación anterior. UID/GID candidato 22017 ausentes NSS en inspección previa, sin reserva. No autorizar por mera disponibilidad histórica. Ninguna copia, recepción ni servicio operativo.

## 2. Alcance de siguiente autorización (preparación inactiva)

1. Comprobar nuevamente identidad de montaje: fuente loop debe corresponder exactamente al archivo preasignado, UUID, longitud, nlink, bloques físicos y propietario raíz. Comprobar de nuevo capacidad agregada y margen 20 GiB acordado como guard técnico de la operación inicial; abortar si cambió el estado. Confirmar systemd, systemd-escape, systemd-analyze, rutas root protegidas, ninguno de los nombres Sabora del plan ocupado. No listar servicios/contenedores de otros proyectos ni consultar datos ajenos.
2. Montaje persistente mediante una unidad .mount propia, cuyo nombre exacto debe derivarse con `systemd-escape --path --suffix=mount /srv/sabora-backup` y coincidir con `srv-sabora\\x2dbackup.mount`. **Candidato** a comprobar con systemd-analyze verify en el host antes de habilitar; no escribir fstab ni modificar unidades de otros proyectos. No formatear, desmontar, remontar ni recrear el volumen existente. Habilitar exclusivamente la unidad de Sabora para el arranque futuro con `systemctl enable --no-reload` si la versión real admite dicha opción, sin daemon-reload global, sin start/stop/restart ni reboot. Si no es viable sin operación global, STOP y decisión específica. Verificar symlink de habilitación, bytes exactos y que el montaje actual no cambió. Una unidad habilitada y validada no demuestra arranque tras reboot.

```ini
[Unit]
Description=Sabora exclusive encrypted backup volume
RequiresMountsFor=/srv/sabora-backup-storage

[Mount]
What=/srv/sabora-backup-storage/volume.ext4
Where=/srv/sabora-backup
Type=ext4
Options=loop,nodev,nosuid,noexec,nofail
TimeoutSec=30s

[Install]
WantedBy=local-fs.target
```

El enlace de UUID y el dev del loop pueden cambiar con el arranque. Antes de cualquier recepción el contrato instalado exige UUID vinculado al dispositivo efectivo y activación nueva si dev/guard cambian; no fijar /dev/loop0 en la unidad ni permitir recepción sobre el directorio subyacente sin montar. El backing file queda limitado físicamente. No activar automount ni listener; no probar reiniciando VPS compartido.

3. Cuenta dedicada `sabora-backup` con UID/GID 22017 centralmente propuestos (launcher ya compilado para esos números). Revalidar ausencia de nombre y números NSS, política de asignación de IDs sin colisión, y autorización de la reserva para Sabora. Si no se puede demostrar reserva, STOP, no reutilizar un UID o cuenta existente ni buscar IDs a ciegas. Crear únicamente grupo y cuenta con esos identificadores, sin home, sin grupos complementarios, sin contraseña utilizable, shell temporal /usr/sbin/nologin (comprobar binario), sin acceso Docker/sudo. Usar useradd sin inicialización lastlog/failog si la versión lo permite. No generar todavía hash de contraseña aleatorio ni asignar shell del receptor operativo: son decisiones de activación SSH posteriores. No alterar cuentas/grupos existentes ni sudoers/sshd compartido.
4. Preparar estructura exigida por `loadInstalledBackupReceiver`: raíz del *montaje comprobado* root:22017 0750, cache UID:GID 22017:22017 0700, recovery root:root 0700, guard exclusivo .cache.rotation.guard vacío root:22017 0440 nlink1. Crear /var/lib/sabora-backup-control root:root 0700 fuera del filesystem del volumen; sin registro genesis ni checkpoint ficticios. Confirmar ausencia previa de cada ruta a crear; si hay parcial, STOP/reconciliación explícita, sin borrar/restaurar a ciegas. No chown/chmod recursivo. Verificar identidad e inode del guard y acceso mínimo mediante setpriv sin grupos suplementarios, sin escribir datos ni copiar bundles. No aceptar enlaces, otro dispositivo, montajes internos, ACL ACL indebida ni permisos inesperados.
5. Guardar recibo de ejecución y segunda lectura de identidad/estado. Cuenta bloqueada y listener ausente deben seguir verificándose; no instalar Node/launcher ni configuración SSH en este bloque, no generar claves de titularidad ni firmar expedientes. No cambiar firewall, recursos ajenos, main, SQL ni iniciar servicios. La reserva lógica propuesta 1536 MiB, máximo bundle 512 MiB, metadatos 16 MiB y reserva 256 MiB se validará al aprobar plan firmado y medir tamaño real; no habilita recepción.

## 3. Dependencia siguiente: ordenador externo

Seleccionar Linux nativo o contenedor Linux en ordenador doméstico físicamente independiente. Confirmar volumen privado persistente, cuenta, capacidad, acceso directo TLS a proyecto correcto, dirección de origen para SSH dedicado, custodio distinto de clave de cifrado y autoridades de firma. No recibir claves privadas por chat ni guardar en Git/VPS; no considerar CI como custodia. Obtener identidad del clúster mediante procedimiento DBA autorizado, huella CA, claves públicas y evidencia de revisión aprobada; solo entonces plan firmado, staging y activación acotada. Recuperación de producción sigue bloqueada por contrato. El primer despliegue continúa sujeto a copia inicial/restore y réplica antes de SQL, copia V2/restore después, expedientes de release y autorización separada. 

**Criterio de cierre de esta propuesta:** plan revisado y autorización específica. No afirmamos instalación ejecutada ni prueba de supervivencia a reboot. El volumen existente no se toca mientras falte permiso.
