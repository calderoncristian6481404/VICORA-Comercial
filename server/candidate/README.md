# Candidata de origen comercial gestionado — REVISIÓN, NO APLICADA

Orden PR4 #6976659412. Reutiliza el helper probado en Supabase LAB y las validaciones
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
sobre tablas/RPC ajenas. Roles y credenciales se aprovisionan aparte tras autorización.
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
La revisión debe aprobar esta excepción y su pin antes de instalación. RLS FORCE
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

## Instalación y reversión, todavía SIN AUTORIZAR

1. DBA verifica proyecto/host/TLS reales y checksum; revisa propietarios, PUBLIC,
   RLS, columnas, triggers y recursos con preflight (sólo catálogos). No ejecutar
   consultas comerciales ni ampliar permisos para que pase una guardia.
2. Revisar/aprobar roles y excepción SD; credenciales mediante canal privado.
   La variable de revisión GUC es guardia contra error del operador, NO identidad
   del proyecto ni autorización de un navegador. NO ejecutar estos SQL por esta orden.
3. Tras aprobación independiente, ejecutar la candidata transaccional y verificar
   que control.enabled=false. No tocar los esquemas LAB instalados ni R100.
4. Aceptar fuente/GoTrue/escritores/ACL/TLS con datos de prueba autorizados; sólo entonces
   habilitar preparación en el control nuevo, sin cambiar can_send/runtime_enabled.
5. La factory privada del PR11 exige aprobación expirable/pineada, JWKS comercial,
   dos credenciales de origen, CA, registry de emisores y proxy/socket aceptados.
   No reutiliza el JWT comercial como si perteneciera a LAB.

Rollback.sql deshabilita y revoca acceso sólo a la nueva API. Conserva decisiones,
ACKs, snapshots, roles, datos e historial; no contiene DROP/DELETE/TRUNCATE. Un rollback
no permite reemitir ni reiniciar secuencias. No se expone ningún botón de activación.
No se prepara un ZIP instalable para Contabo hasta aprobar el contrato/ACL real;
el manifiesto de release previo no se cambia para disfrazar esa admisión pendiente.
