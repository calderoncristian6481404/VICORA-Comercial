# Cierre de implementación experimental — frontera transaccional en origen

**IMPLEMENTADO Y PROBADO EN LABORATORIO. NO INSTALADO NI APROBADO EN SUPABASE REAL.**
Orden autorizada: PR #4, comentario 6966494776. Se supera la revisión anterior que
sólo identificaba la separación de autoridades. Este informe es el cierre conjunto
del PR #4 comercial y PR #11 fiscal; no habilita preparación alojada ni emisión.

## Código funcional entregado

Comercial, PR #4:
- Implementación inicial `ad703758f174e891cc92086af66f0b59114227f0`.
- Validación de recibos/vencimientos `be62bd17320c712e5cd9f6e75cc176dfd2bb6893`.
- **Código final `98e5474205f012639ec730cbc3598c928e22ad7d`.**
- server/preparation_origin.py: gateway de firma JWT verificada → RPC limitada;
  carga, listado pendiente y ACK separados para el materializador privado.
- server/lab/origin_schema.sql: decisión durable/idempotente dentro de la misma
  transacción que valida cuenta/sesión, negocio, permisos, suscripción y venta.
- server/ORIGIN_THREAT_MODEL.md: propietarios, ACL, SECURITY DEFINER, riesgos y límites.

Fiscal, PR #11:
- Implementación `7c75a52c0f4e07957d210da53bf4bfcdb807277a`.
- **Código final `5e517c0719b0e6cb50dbf2fba1d81a04bee84185`.**
- CIERRE_LAB/origin_preparation.py: validación/materialización y recuperación de
  decisiones comprometidas usando bindings/intents existentes; no contador nuevo.
- Fixture comercial fijada al commit final y a sus blobs SHA, no una reimplementación
  independiente. Permite CI entre repositorios privados sin añadir secretos.
- Runner y 23 casos PG reales; no se sustituyen los controles de permisos/roles SQL.
  Sólo el transporte PG se adapta al socket Unix marcado del contenedor sin red.

Los 14 archivos runtime del cliente comercial permanecen intactos. Se utiliza el
arca.js exacto aprobado (blob 204088a4a1d77c90e3922eb9ed97c324c7aeedb8); conserva
saleRef + bearer y PREPARADO_NO_EMITIDO. El test Node usa IPC como transporte de
prueba hacia WSGI real, RPC origen real y PostgreSQL real. NO acredita HTTPS real.
El backend no ejecuta confirmar_venta ni repite stock/caja/cobros; lee venta ya
confirmada. No se reescribieron los contratos ni triggers comerciales originales.

## Semántica que cambió y quedó demostrada

La autorización de preparación queda COMMITTEADA en el PostgreSQL de origen,
no en la autoridad SQLite anterior. Auth y los datos comerciales se leen/bloquean
junto a la decisión durable. Los escritores externos del mismo PostgreSQL quedan
serializados por locks del motor, sin depender de un proxy, cron o webhook.

- Revocación confirmada antes de esa transacción: no crea decisión ni intent.
- Revocación concurrente que encuentra el fence: espera y confirma después de la
  decisión, o aborta por timeout; no se presenta ese aborto como revocación exitosa.
- Revocación posterior: bloquea solicitudes NUEVAS; no borra una decisión previa.
  Un worker privado puede materializar esa decisión ya autorizada. Eso NO concede
  permiso nuevo para emitir o reservar: el resultado sigue siendo sólo preparación.

No se afirma atomicidad distribuida origen/destino. Origen ACCEPTED sin ACK se
recupera por clave. La materialización reutiliza un único intent y ACK idempotente;
no admite otro UUID/hash. Si destino se perdió DESPUÉS del ACK, se exige
conciliación antes de crear otro UUID. UNKNOWN permanece bloqueado. No se acepta
un snapshot/rol/negocio/decisión suministrado por el navegador.

La firma JWT prueba identidad; el SQL comprueba además sid/sub y permisos reales
del modelo. El gateway es parte del límite de confianza: tiene una credencial SQL
EXECUTE-only capaz de establecer contexto, por lo que debe verificar JWT ANTES
(con el verificador PyJWT/JWKS aprobado). Un GUC por sí solo no autentica. La clave
de ese gateway nunca pertenece al navegador. El materializador tiene otro rol.

## SECURITY DEFINER acotado, únicamente hipotético en PG aislado

Auth tiene RLS ENABLE y CERO policies en el modelo. Su helper pertenece al owner
Auth NOLOGIN; no se le da al gateway acceso directo ni BYPASSRLS. El owner de
comandos, también NOLOGIN/NOBYPASSRLS, tiene los derechos específicos de lectura/
bloqueo de las tablas comerciales del modelo y la outbox privada. Los servidores
usan roles gateway/materializer sin SUPERUSER, BYPASSRLS ni membresías.

search_path=pg_catalog, nombres calificados, sin SQL dinámico en las APIs, EXECUTE
revocado de PUBLIC y helper privado invocable sólo por el owner de comandos.
Gateway no puede asumir esos owners ni consultar Auth, negocio u outbox directamente.
La búsqueda por sesión/miembro/venta está vinculada al contexto firmado verificado.
El rol de un autor anterior no se transfiere a otro usuario del mismo comercio.

Este ownership/delegación NO existe aprobado en managed Auth alojado. Las políticas
y ACL del modelo son sintéticas: no deben copiarse a producción para acomodarla
al test. El archivo SQL completo está guardado por BD/marcador/red y una transacción:
aunque el cliente SQL continúe después del error de guardia, todos los objetos se
revierten. No es una migración ni un instalador para un proyecto existente.

## Pruebas ejecutadas y verificadas

| Grupo | Métodos distintos | Resultado/evidencia |
|---|---:|---|
| Cliente servidor de origen | 3 nuevos | Comercial run 44223446789, job 134530732258, success |
| Composición fiscal y cierre por defecto | 2 nuevos | Fiscal run 44223667496, job 134531470208, success |
| Flujo transaccional/end-to-end PG | 23 nuevos | Fiscal run 44223667496, job 134531595561, success |
| Manifiesto aprobado sin cambios | 1 regresión | Mismo job fiscal de composición, success |
| Inventario/UI apagada/suscripción | 4 regresiones | Comercial run 44221006150, Linux y Windows, success |

**28 métodos nuevos + 5 regresiones = 33 métodos distintos.** Las cuatro
regresiones Node corren en Linux y Windows: el conjunto suma 37 ejecuciones, no
37 métodos nuevos. No se cuentan repeticiones locales ni runs intermedios.

FISCAL, **26 métodos** (23 PG +2 composición +1 manifiesto), todos aprobados:
https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/actions/runs/44223667496
COMERCIAL, **3 métodos** nuevos aprobados:
https://github.com/calderoncristian6481404/VICORA-Comercial/actions/runs/44223446789
Regresión comercial, **4 métodos /8 ejecuciones** aprobadas:
https://github.com/calderoncristian6481404/VICORA-Comercial/actions/runs/44221006150

PG real **17.12**, cero fallos/errores/omisiones, limpieza PASS. Contenedor sin red,
puertos ni volúmenes persistentes. Guardia genérica y guardia origen comprobadas.
También pasó `origin_guard_atomic_with_error_stop_disabled`: marcador inválido,
ON_ERROR_STOP=0, ningún rol/schema creado. Es una comprobación adicional de setup,
NO se cuenta como otro método unittest. No se ejecutó el autotest histórico R100
de reservas; se reutilizó sólo su DDL verificado como dependencia del destino.

Escenarios ejecutados: cliente JS→API→origen→intent, JWT vencido/alterado/otro
issuer, sesión revocada/expirada y refresh de JWT, ban/deleted_at, rol o miembro
inactivo, suscripción vencida/prueba, cambio de negocio, venta/detalles/cliente,
phantoms externos bloqueados, dos comercios autorizados, ocho preparaciones
concurrentes con una decisión/intent, respuesta/ACK perdido y recuperación, cambio
de venta tras decisión, target perdido tras ACK, UNKNOWN, manipulación de recibo,
ACK contradictorio, denegaciones de acceso/SET ROLE/helper privado, EXECUTE PUBLIC
revocado y sombreado con tabla temporal. Ninguna reserva, CAE, QR o PDF auténtico.

El primer run fiscal 44222060038 también pasó 23/23. La revisión posterior detectó
que el instalador dependía de que el cliente detuviera errores: se envolvió TODO
el DDL en transacción y se agregó la prueba de continuación insegura del cliente.
El run final citado aprueba esa corrección. No hubo pruebas fallidas ocultas.
No se repitieron las 41 pruebas fiscales históricas ni LAB14/14.

## Límites que NO están aprobados

1. No hay Supabase/Gotrue alojado conectado. Auth/negocio son tablas ficticias de
   columnas conocidas y escritores SQL representativos, no una certificación de
   todos los triggers y contratos internos del proveedor.
2. Deben verificarse en el origen autorizado not_after/last_refreshed_at,
   timebox/inactividad/single-session/reuse, ban/borrado y rotación/revocación de
   signing keys. No se presupone algoritmo ni configuración del proyecto.
3. La delegación privada y ownership aún no están verificados como posibles en
   Supabase gestionado. No hay credencial nueva aprovisionada ni SQL para ejecutar
   hoy sobre tablas reales. El esquema del experimento no es ese permiso.
4. TLS fuente y HTTPS/socket alojados no se probaron: el laboratorio usa socket
   sin red. Origen y destino son schemas del mismo cluster/BD de prueba, con
   conexiones y transacciones independientes; NO es una prueba entre dos proyectos
   Supabase reales. Pérdida de respuesta/ACK se inyecta, no es una partición de red
   ejecutada. No se probó caída física del servidor. El cliente normal exige
   verify-full; no hay fallback a plaintext.
5. El sello SHA-256 y la carga autenticada comprueban contenido/procedencia del
   registro en el modelo, NO firma no repudiable ni resistencia a administrador
   comprometido/restauración coordinada. R181 permanece intacto, no se sustituye.
6. SHARE locks globales tienen costo de disponibilidad; carga real, HA y recuperación
   de infraestructura no se acreditan. Timeout/deadlock debe cerrar la operación.
7. La composición nueva cubre PREPARACIÓN. Los cambios sensibles de perfil por HTTP
   quedan cerrados; no heredan este grant. Se reutiliza el almacén privado ya listo,
   con evidencia fiscal revisada del servidor. Su apertura requiere contrato propio
   de autorización durable y reautenticación; no se declara implementada aquí.

## Intervenciones externas estrictamente indispensables

**A. Responsable Auth/DBA del origen:** confirmar si existe una delegación equivalente
acotada y admitible sobre Auth/datos comerciales, sin convertir el backend en
postgres/service_role/BYPASSRLS, alterar propietarios o acomodar RLS protegida.
Verificar metadatos, configuración Auth y dependencias de venta reales con acceso
específicamente autorizado. Preparar/aprobar una migración reversible basada en
esos datos; NO copiar las ACL/policies sintéticas ni quitar la guardia del fixture.
Si el proveedor no admite esa delegación, este diseño no es promovible allí: haría
falta autorizar un origen Auth/comercial bajo control de sus propietarios. Ningún
proxy de sincronización elimina ese requisito. No se contrata infraestructura.

**B. Sólo después de A:** aprovisionar credenciales/CA y JWKS/configuración reales
por canal privado al destino autorizado, validar la composición y aceptar de una
vez sesiones, mutadores externos concurrentes, venta real, aislamiento y HTTPS.
Se mantiene sin activar hasta aprobación expresa. La autorización de emisión ARCA,
certificados y homologación es independiente y no se solicita con este cierre.

El bloqueo ya NO es falta de código para demostrar la transacción en laboratorio;
es la verificación/delegación real, su semántica Auth y la aceptación alojada. No se
presenta toda la aplicación fiscal como productiva ni toda su configuración como
terminada por aprobar este experimento de preparación.

## Rollback y conservación

Durante el experimento: detener el test y destruir el contenedor único; limpieza
PASS. No hubo cambios en Supabase/Contabo para revertir. El manifiesto aprobado
CIERRE_LAB/release_manifest.json y sus archivos base/overlay siguen idénticos; el
protocolo hipotético está EXCLUIDO del instalador aprobado. No se genera otro ZIP
ni se instala el incremento de 24 archivos. No reinicializar perfiles/CA/credencial
ni repetir las 14 comprobaciones LAB ya aceptadas.

Una eventual promoción exige su propia reversión revisada: apagar la nueva ruta
y revocar EXECUTE únicamente de los endpoints nuevos, conservando decisiones,
ACK/intents y evidencia. No borrar operaciones, Auth/datos comerciales ni R100.
No hay ningún comando de despliegue/GRANT autorizado para ejecutar en esta entrega.

main y VICORA Comercial publicado intactos; sin modificación productiva o de Supabase
real/Contabo; ningún servicio iniciado allí ni contacto ARCA. arca.config.js apagado,
can_send=false y runtime_enabled=false. No se fusiona ninguno de los PR.
