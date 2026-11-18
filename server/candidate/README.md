# Contrato de origen comercial gestionado — instalado, desactivado

Estado vigente: instalación autorizada del 18/11/2026 comprobada mediante metadatos
en transacción READ ONLY. Ver `PRODUCTION_DISABLED_INSTALL_20261118.md`. Las tres
migraciones NO deben repetirse. Control apagado, cero decisiones, 23 triggers
habilitados. Los dos roles son LOGIN sin contraseña: todavía no se probaron sus
conexiones, sesiones comerciales ni el servidor Contabo.

Diseño original de la orden PR4 #6976659412. Reutiliza el helper probado en Supabase LAB y las validaciones
comerciales/outbox del protocolo anterior. No reinstala los dos esquemas LAB.
El código alojado que ya existe sigue siendo evidencia de viabilidad; sus seis
relaciones sintéticas NO se usan como si fueran las tablas de VICORA Comercial.

## Contrato concreto

`source_contract.sql` utiliza únicamente columnas inventariadas de public.usuarios,
negocios, suscripciones, ventas, ventas_detalle y clientes. Comprueba RLS y columnas
antes de crear objetos. No modifica esas relaciones, managed Auth, RPC, triggers,
propietarios, ACL o políticas existentes. Conserva SIS-000001, fecha Argentina,
venta CONFIRMADA, importes exactos, 1..1000 renglones, pertenencia y snapshot de cliente.
No ejecuta confirmar_venta/anular_venta ni duplica stock/caja/cobros.

Crea solamente vicora_origin_private (control y decisiones) y vicora_origin_api.
Helper session_live: mismo cuerpo que el ensayo alojado, copiado en el nuevo schema
privado para esta candidata; no depende de aplicar el SQL LAB a producción.
Decisión ACCEPTED/MATERIALIZED con UNIQUE negocio/venta, hash/cuerpo inmutables por
la API y ACK idempotente a UUID/hash únicos. Recuperación load/pending/ack sólo para
materializador; preparación/identidad sólo gateway. Nunca numeración, CAE o emisión.

La credencial del gateway debe ser vicora_origin_gateway, y la del materializador
vicora_origin_materializer, LOGIN sin SUPERUSER/BYPASSRLS/INHERIT/membresías ni derechos
sobre tablas/RPC ajenas. Los roles ya existen; sólo faltan credenciales distintas por canal privado autorizado.
No ejecutar nuevamente roles.review.sql.
`roles.review.sql` crea únicamente grupos NOLOGIN; no genera ni guarda passwords.
No hay permisos para anon/authenticated/service_role ni EXECUTE PUBLIC.

JWT se verifica en el servidor con el verificador existente antes de SQL. Sólo se
pasan sub/session_id/exp verificados y saleRef parametrizados. Ni GUC, negocio, rol
ni issuer del browser autorizan. Compromiso del gateway sigue siendo compromiso de
la delegación de identidad: este componente es parte de la base de confianza.

## Excepción SECURITY DEFINER explícita

El owner de las funciones es postgres, igual al ensayo gestionado verificado. Es
una delegación privilegiada real, NO se lo presenta como NOBYPASSRLS ni se entrega
su login a la app. Cuerpos cerrados, firmas UUID/bigint/text, nombres calificados,
search_path=pg_catalog, revocación PUBLIC en la misma transacción y schemas privados.
El helper sólo devuelve sesión viva; no es autenticación JWT ni autorización fiscal.
La función receipt es invoker, interna; los ocho otros entrypoints/helpers son SD.
La excepción y los grants ya fueron aprobados en la instalación registrada. RLS FORCE
no protege las decisiones frente al propio postgres/admin; hash no equivale a firma
independiente ni prueba contra restauración coordinada. R181 no se modifica.

**Bloqueo por PUBLIC:** si roles nuevos heredan EXECUTE de cualquier SD en public/auth,
la instalación y la admisión runtime lo rechazan. PostgreSQL no ofrece DENY por rol
para un grant PUBLIC. No se revocan permisos antiguos a escondidas: preflight.sql
identifica las firmas efectivas y el DBA debe revisar/aprobar, si procede, revocación
puntual y grants alternativos compatibles. Los tres OID históricos no prueban la ACL
actual; no se vuelven a pedir los 21 cuerpos SQL ni se publican originales privados.

## Concurrencia, Auth y fallos

Control de admisión FOR SHARE → Auth row FOR SHARE → tablas usuarios/suscripciones/detalles SHARE → filas de negocio,
suscripción, venta y cliente → outbox. Hay costo de bloqueo global para evitar
phantoms sin inventar constraints que no se verificaron. Los escritores existentes,
incluidos RPC SD de postgres, respetan locks PG; sus órdenes pueden causar deadlocks.
La app impone statement_timeout=3s y lock_timeout=800ms ANTES del RPC; abortos o
respuesta perdida son incertidumbre, nunca permiso para duplicar. No se confía sólo
en statement_timeout dentro del SET de una función para temporizar la llamada exterior.
No se alteran zz_vicora_guardar_vigencia/proteger_venta/proteger_detalle_venta.
No se afirma paridad con todos sus cuerpos confidenciales a partir de una fixture.

La consulta managed comprueba user/session, not_after, ban y deleted_at. Logout,
ban/borrado y refresh nativos deben aceptarse con GoTrue real; refrescar un JWT no
hace válida una sesión borrada. La eliminación aislada de refresh_tokens NO es prueba
de revocación inmediata del access token. refreshed_at es timestamp sin zona;
inactividad y single-session necesitan política/configuración efectiva del proveedor.
No se inventa last_refreshed_at ni se elimina esa comprobación por pasar una prueba.

Revocación anterior niega una nueva decisión. Una concurrente espera o aborta; una
posterior no destruye una decisión ya comprometida. La materialización no concede
un permiso nuevo para reservar/enviar. Entre origen y LAB no hay transacción distribuida:
ACK perdido se recupera; ACK contradictorio, target perdido tras ACK o UNKNOWN bloquean.
Perfiles usan la misma identidad bloqueada, segundo password AMR y sesión vigente,
CAS/replay del almacén privado existente. Nunca se almacenan certificados o claves.

## Continuación sin reinstalar

1. Verificar proyecto exacto y TLS antes de inspeccionar. `installed_readback.sql`
   es exclusivamente de catálogos/estado agregado, con READ ONLY y ROLLBACK; no
   prueba la autenticación de los trabajadores ni lee ventas/usuarios.
2. NO repetir source_contract.sql, roles.review.sql ni la corrección PUBLIC.
   Las tres migraciones ya se aplicaron; no volver a abrir los grants corregidos.
3. Aprovisionar las dos contraseñas mediante canal privado y almacén seguro en el
   servidor. Nunca usar postgres/service_role como identidad del preparador.
4. Usar el incremento final del PR11 y su inspección de ambos logins con el control
   apagado. Esa inspección ejecuta admission() con bloqueo compartido: no es una
   transacción READ ONLY, pero no realiza DML ni llama procedimientos comerciales.
5. La habilitación temporal de preparación y las pruebas con datos de ensayo reales
   necesitan aprobación aparte. No implica reservar R100, emitir o iniciar servicios.
   La factory conserva aprobación expirable y cinco puertos reales; nunca reutiliza
   el JWT comercial como si fuera de LAB.

[Guía única de conexión, instalación incremental y reversión](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/DOCUMENTACION_LAB/CONTABO_FINAL_CONEXION_DESACTIVADA.md).
El ZIP es sólo código; no instala SQL ni activa nada. El rollback del código conserva
perfiles/CA/credenciales y servicios apagados. rollback.sql queda como procedimiento
histórico de deshabilitación/revocación de la API, para autorización expresa; no se
necesita ejecutarlo ahora. Conserva decisiones y ACKs y nunca permite reemitir.
