# S54-29 · Aceptación de Supabase Auth alojado

**Dictamen del proveedor: NOT RUN · NO-GO.** El [Draft #92](https://github.com/jdlc86/CartaViva/pull/92) contiene las correcciones del ensayo manual. La clave administrativa temporal está declarada únicamente como secreto de GitHub Actions. El ensayo está reservado al operador manual y el intento anterior de publicar una vía privilegiada por Actions fue bloqueado antes de publicarse. El conector disponible ofrece la clave publicable y metadatos del proyecto. No ofrece las operaciones administrativas de Auth que exige este ensayo. En esta ejecución no hubo acceso a la clave ni mutaciones sobre identidades. [Seguimiento #93](https://github.com/jdlc86/CartaViva/issues/93).

## Criterios del recorrido alojado

| ID | Estado | Evidencia disponible y pendiente |
| --- | --- | --- |
| AP-01 | NOT RUN | El 27-11 se verificó por HTTPS el JWKS público con una clave de firma RS256. La sonda histórica también confirmó opciones WebAuthn con el RP esperado. Queda acreditar que Auth está vacío inmediatamente antes de crear la identidad del ensayo. |
| AP-02 | NOT RUN | Falta generar la invitación sin envío, intercambiarla y verificar el correo confirmado con el UUID del ensayo en Auth alojado. |
| AP-03 | NOT RUN | Chromium aislado registró una credencial sintética y firmó una aserción válida en local. Faltan el recibo alojado y la sesión firmada de Auth con AMR passkey. |
| AP-04 | NOT RUN | El arnés exige conservar el UUID, distinguir las dos credenciales y autenticar ambas antes de revocar. Falta el intercambio y registro alojados. |
| AP-05 | NOT RUN | La prueba local verifica la firma, el desafío, el origen, el RP, el identificador y la verificación del usuario. Falta la eliminación alojada, la comprobación de ausencia y el rechazo por el proveedor de la aserción válida de la credencial retirada. |
| AP-06 | NOT RUN | El arnés compara los `session_id` firmados en memoria y exige una sesión nueva con la passkey de reemplazo y el mismo UUID. Falta verificarlo en Auth alojado. |
| AP-07 | NOT RUN | El arnés solo clasifica la respuesta de `/user` después de un logout global cuando el JWT antiguo sigue vigente. Falta observar la respuesta alojada. El control de revocación de Sabora queda fuera del ensayo. |
| AP-08 | NOT RUN | El arnés permite una única eliminación de la identidad atribuida por UUID y correo exactos. Una respuesta perdida se reconcilia por la consulta de ese mismo UUID. En esta ejecución no se creó una identidad. |
| AP-09 | NOT RUN | La prueba local confirmó la lista positiva del entorno de Chromium y el contexto offline. El arnés emite marcadores y códigos permitidos. Falta revisar la evidencia de una ejecución con la custodia real. |

La [sonda alojada del 26-11](https://github.com/jdlc86/CartaViva/actions/runs/45905970780/job/140202634645) corresponde a `25ac3ef0`. El corte anterior del arnés `9324120044e65dcf169458195aa08764c95eb2c8` obtuvo 7/7 controles ordinarios. Ninguno de esos resultados ejecutó la aceptación administrativa. La revisión del arnés parte del HEAD `c53344e9b814ddf7e17cc15b678bcfd69bcbde6e`. Los resultados del nuevo árbol de Git y el SHA se registran en el PR y el Issue.

## Correcciones verificadas

- La API experimental documenta `webauthn_credential_not_found`. El código público de autenticación WebAuthn también devuelve HTTP 400 con `webauthn_verification_failed` cuando falla la búsqueda o la validación de la credencial durante la ceremonia. El arnés admite ese resultado únicamente con firma local válida, una autenticación positiva de la misma credencial antes de eliminarla y el listado posterior que confirma que solo queda la de reemplazo. Un desafío vencido, una respuesta genérica 404 o una aserción alterada quedan rechazados. [Documentación Passkeys](https://supabase.com/docs/guides/auth/passkeys) · [Código de autenticación](https://github.com/supabase/auth/blob/master/internal/api/passkey_authentication.go) · [Listado y revocación](https://github.com/supabase/auth/blob/master/internal/api/passkey_admin.go).
- El alta comprueba el destino de retorno de `generateLink`. El arnés prueba autenticación descubrible en dos contextos virtuales separados, revisa vigencia de desafíos y verifica la frescura de las sesiones con sus identificadores firmados. La observación poslogout distingue aceptación y rechazo mientras el JWT siga vigente. [Generación de enlaces](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) · [REST de generación](https://github.com/supabase/auth/blob/master/internal/api/mail.go) · [Sesiones y logout](https://supabase.com/docs/guides/auth/sessions).
- El arnés conserva el arranque manual por stdin privado y rechaza GitHub Actions y modos de depuración. El navegador trabaja offline, con origen interceptado, service workers bloqueados y política `default-src 'none'`. Los identificadores de sesiones, claves y desafíos quedan fuera del registro. Tras un resultado incierto la limpieza solo consulta el UUID atribuido y exige el código `user_not_found` de Auth. [Script](../../scripts/ops/sabora-hosted-auth-passkey-exercise.mjs) · [Contrato de ausencia del usuario](https://github.com/supabase/auth/blob/master/internal/api/admin.go).

Comprobación local del candidato: sintaxis Node, seis tests focalizados de seguridad y transporte, y una ceremonia Chromium offline con autenticador virtual que produjo una firma válida y rechazó el acceso de red desde la página. La firma local se verificó con la clave pública de registro. El único contacto alojado de esta ejecución fue la consulta pública de JWKS.

## Paso manual del propietario

Usar el [procedimiento manual revisado](SABORA_S54_HOSTED_AUTH_READINESS_2026-11-26.md#s54-25--resultado-de-la-sonda-y-ensayo-siguiente) desde una terminal propia de confianza, con Node 22, Chromium del proyecto, el SHA exacto del candidato y custodia local de las dos claves del proyecto RESTAURANTE. Confirmar Auth vacío y exclusividad de la ventana antes de ejecutar una única vez. El procedimiento produce un correo ficticio para reconciliación local si la ejecución se interrumpe. Compartir el SHA y los marcadores de resultado con el correo ficticio y los materiales sensibles suprimidos. Si aparece `CLEANUP NOT PROVEN`, mantener NO-GO y reconciliar únicamente esa identidad.

Cuando termine su uso, el propietario debe revocar la clave temporal y retirar el secreto de GitHub Actions. En este corte no hay evidencia de que se hayan retirado. La aceptación del proveedor, el cierre integral de H1-A y la autorización de despliegue son decisiones separadas.
