# Contrato experimental de preparación en origen

Autorización PR #4, comentario 6966494776. Este código NO instala nada en Supabase
ni Contabo. `server/lab/origin_schema.sql` sólo admite el cluster marcado de R131,
sin red y con nombre aleatorio; aborta antes de DDL en cualquier otro destino.
Todo el DDL está en una transacción: aun si psql continúa tras el error de la
guardia (ON_ERROR_STOP=0), no quedan roles ni schemas parcialmente instalados.
No se ha verificado que Supabase gestionado permita esta delegación/ownership.

## Cambio de semántica explícito

La autorización y la decisión durable se confirman juntas en el PostgreSQL que
contiene Auth y los datos comerciales. El backend fiscal materializa esa decisión
posteriormente. No promete mantener una transacción fuente abierta hasta un commit
en otro proyecto. Una revocación que confirma ANTES de la decisión la impide; una
revocación posterior impide peticiones nuevas, pero no borra la decisión anterior.
El worker privado puede recuperar esa decisión ya aceptada, sin emitir ni conceder
privilegios nuevos. Nunca se acepta un snapshot/decision/empresa desde el navegador.

El frontend existente sigue mandando sólo saleRef + bearer. El adaptador verifica
primero el JWT con el verificador servidor PyJWT/JWKS aprobado, luego usa un login
EXECUTE-only con parámetros SQL. El SQL vuelve a comprobar sid/sub reales, estado
de cuenta, pertenencia única, rol, negocio, suscripción argentina y venta/detalles/
cliente. La firma no autoriza por sí sola. Las rutas externas de Auth y negocio
escriben las MISMAS tablas y quedan ordenadas por row locks y SHARE locks nativos.
No hay cron, réplica, sincronización de sesiones ni SQLite como autoridad de origen.

## Delegación hipotética exclusivamente aislada

| Actor | Derechos del modelo |
|---|---|
| origin_gateway_lab | LOGIN sin SUPERUSER/BYPASSRLS/membresías, sólo EXECUTE prepare |
| origin_materializer_lab | LOGIN igual de restringido, sólo load/pending/ack |
| origin_command_owner | NOLOGIN, sin SUPERUSER/BYPASSRLS; propietario de outbox/API, SELECT/UPDATE para locks y RLS privada sobre tablas comerciales del modelo |
| origin_auth_owner | NOLOGIN sin BYPASSRLS; propietario de Auth en el modelo; dueño del helper de lectura/bloqueo |
| origin_auth_writer | Sólo fixture del servicio Auth nativo; puede SET ROLE al owner Auth |
| origin_business_writer | Sólo fixture del escritor comercial externo, dueño de sus tablas |

Ninguna identidad gateway/materializer recibe SELECT directo, UPDATE de tablas,
CREATE de schemas, roles privilegiados ni función de reserva R100. Auth tiene RLS
ENABLE y CERO policies: el helper propietario NO necesita alterarlas. Esto modela
una delegación NUEVA, no demuestra que esté disponible en el hospedado. Las nuevas
políticas/ACL comerciales sólo existen en la copia sintética aislada. No deben
aplicarse para acomodar producción. No hay credenciales en código, logs o artefactos.

## SECURITY DEFINER: riesgos analizados antes de exposición

- Escalamiento por SQL dinámico: no hay SQL dinámico en funciones API/helper. Todos
  los nombres se califican; search_path=pg_catalog. Public/temp no resuelven tablas.
- Ownership: separar owner Auth y owner comandos; ambos NOLOGIN. Gateway no puede
  SET ROLE a ninguno. Ningún propietario es SUPERUSER/BYPASSRLS.
- EXECUTE: revocado de PUBLIC en todas las funciones; auth_fence sólo puede ser
  invocado por el owner de comandos. receipt es privado. Cada API comprueba
  session_user. prepare y materialización tienen credenciales/ACL distintas.
- Confused deputy: sólo saleRef es entrada de negocio. La empresa y rol se obtienen
  en origen. Los parámetros sid/sub sólo los establece el gateway tras verificar
  JWT; el usuario web no tiene acceso SQL. Un GUC no es prueba de identidad.
- Compromiso del gateway: su credencial puede establecer contexto arbitrario; el
  motor NO verifica firmas JWT. La verificación criptográfica servidor es parte
  del TCB. No presentar este diseño como resistente a compromiso de ese servidor.
- Compromiso del materializer: está autorizado a leer decisiones y atestiguar su
  materialización. La comprobación de vínculo target pertenece al backend privado;
  no se expone ACK al usuario. Una credencial robada requiere revocación operativa.
- Integridad: payload/seal y clave negocio/venta son inmutables por las APIs; el
  hash SHA-256 se obtiene del JSON persistido y se vuelve a comprobar al cargar.
  No es firma criptográfica ni detecta alteración coordinada por el administrador.
- Carreras/phantoms: row locks para Auth/cuenta/negocio/venta/cliente; SHARE para
  membresías, suscripciones y detalles. Son globales por tabla y pueden limitar
  throughput o retrasar revocaciones. Timeouts cierran; nunca se omiten locks.
- Recuperación: fuente ACCEPTED sin ACK se drena por clave; mismo intent. ACK es
  idempotente y rechaza otro UUID/hash. Target perdido después de ACK obliga a
  conciliación antes de crear otra operación. UNKNOWN no es permiso de reenvío.

El registro ACCEPTED es una decisión de PREPARACIÓN, jamás CAE, reserva o factura.
R100 sigue siendo la única autoridad de numeración y no es invocada. R181 intacto.
El perfil experimental de materialización bloquea configuración de perfiles por
HTTP: no extiende este contrato a cambios sensibles de configuración. Mantiene el
almacén privado ya instalado como puerto servidor y exige evidencia fiscal revisada.
Esa ruta sólo podrá abrirse con su propia decisión durable/reauth verificada.

## Contratos operativos

prepare(token,saleRef) -> decisión persistida + actor actual; el commit en origen
es el punto de autorización. Si la venta cambió respecto a una decisión anterior,
se rechaza, sin borrar historia ni crear otra clave. Otro miembro vigente del mismo
negocio puede recuperar la misma decisión sin heredar el rol de su autor original.
load/pending/ack son puertos internos, no rutas HTTP públicas. El receptor fiscal
vuelve a comprobar origen/ámbito/seal y usa los bindings/intents existentes.
La pérdida de respuesta/ACK no implica repetir una venta o un envío fiscal.

## Promoción y reversión

No hay migración alojada autorizada. Antes de promover, el DBA/Auth debe confirmar
si puede crear y asignar propietarios a esta delegación acotada bajo managed Auth,
revisar catálogos/permisos/policies/FKs y versionar las diferencias reales. Esta
prueba no usa un rol privilegiado de aplicación para ocultar la falta de permisos.
Si el proveedor no admite esa delegación, el diseño queda LAB; no hay fallback.

Después: aceptación real agrupada de JWT/JWKS/configuración, sesiones/ban/deletion,
mutadores externos, suscripción/ventas y TLS/HTTPS/socket, usando datos autorizados.
No repetir la conexión LAB14/14 ni cargar certificados; no activar servicios ahora.
No se habilita arca.config.js/can_send/runtime_enabled ni se crea paquete Contabo.
Reversión LAB: parar el test y destruir su contenedor. Reversión futura alojada:
revocar sólo EXECUTE de los nuevos endpoints y apagar el componente; conservar
outbox/intents/evidencia, sin borrar operaciones ni tocar R100 o tablas comerciales.

## Garantías deliberadamente no acreditadas

Las tablas Auth/negocio del experimento son estructuras ficticias de las columnas
conocidas, no el servicio GoTrue alojado ni todos sus triggers. Deben verificarse
not_after, last_refreshed_at, timebox/inactividad/single-session/reuse, borrado de
sesiones y rotación/revocación de signing keys de la configuración real. No se
presupone su algoritmo ni que existencia de sesión equivalga a toda política Auth.
La delegación owner-helper y ACL comerciales no existen aprobadas en producción.
Rendimiento bajo carga, HA, restauración coordinada y testigo independiente tampoco
se acreditan aquí. Estas limitaciones impiden promover sólo porque el laboratorio
apruebe. La aceptación futura debe cubrirlas con datos/contratos autorizados.

## Optional fiscal profile commands (final functional scope)

`origin_api.identity()` reuses the same authoritative Auth/account, business,
role and subscription checks without requiring a sale or creating a decision.
The source transaction retains its native locks through the private callback.
The source client verifies JWT first and on each recheck. SQL/tenant context is
never browser authorization. It grants neither reservation nor emission.

The fiscal composition requires a separate `profile_commands_enabled=True`
server setting; its default is closed. ProfileService requires an administrator,
a second live session of the SAME subject/business and a recent signed password
AMR, plus a version CAS and replay-proof history. Passwords never enter this
server. Profile updates remain drafts requiring separately reviewed tax facts.

The private profile commit happens while source revocation locks are held. A
lost response after that commit is ambiguous, resolved by rereading the profile
or an exact idempotent retry. There is no distributed rollback guarantee. A
bounded pool/lock timeout fails closed; two source connections may be needed for
password reauthentication. Exhaustion can reduce availability, not grant access.

This remains an isolated proof of a delegation. It does NOT establish that the
managed Auth owner can or should grant this capability in production. The
reported `auth.sessions.refreshed_at` is timestamp WITHOUT time zone; there is
no claimed `last_refreshed_at` column. Inactivity/single-session semantics need
actual provider acceptance. No global replication/synchronization is introduced.
