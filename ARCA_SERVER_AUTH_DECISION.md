# Actualización autorizada: implementación aislada en curso

La orden 6966494776 autoriza probar la frontera descrita abajo. El adaptador está
en `server/preparation_origin.py`; la delegación hipotética en
`server/lab/origin_schema.sql` y sus riesgos/ACL en `server/ORIGIN_THREAT_MODEL.md`.
El PR #11 materializa decisiones durables del origen. No se declara aceptación
alojada ni se habilitan servicios. Los resultados nuevos se registrarán tras CI.

El documento anterior se conserva como antecedente de la decisión; su estado
"adaptador no implementado" describe la revisión previa, no este código nuevo.

---

# Revisión final PR #4 / PR #11 — decisión sobre el adaptador servidor

**Estado: INTEGRACIÓN ALOJADA NO COMPLETADA. ADAPTADOR AUTORITATIVO NO ADMITIDO.**
La condición de salida de la orden 6965546606 se cumple: con las rutas actuales no
puede conservarse el contrato transaccional exigido. No se entregan un backend
aparente, una nueva réplica ni otro paquete incremental de diagnóstico. No instalar
el incremento fiscal de 24 archivos ni activar preparación. Este informe contiene
una única decisión arquitectónica concreta para continuar.

## Fuentes revisadas y qué existe realmente

- Comercial PR #4: `161c44d34da687587f454a1cd8d1dd9c8ae4a802`, rama
  codex/api-fiscal-integrada. Se verificaron contra GitHub los blobs exactos de
  14 archivos runtime; no se modificaron sus contenidos.
- Fiscal PR #11: código `d54804282a311c72cf6f8a314482ca062c060aca`, documentación
  `96b29666f223216c77fb2c190b71c3f22d525978`. Authority usa un archivo SQLite propio:
  register_session/renew_session/revoke_session/publish son escritores internos,
  no una integración implementada con los escritores alojados de VICORA/Auth.
- CI fiscal previo 44209844867: 41 métodos y 14 E2E PG17.12 ya aprobados. No se
  repiten. Demuestran la copia autoritativa aislada, NO la paridad con Auth real.
- Orden del titular: comentario 6965546606 del PR #4. Prohíbe modificar producción,
  instalar roles/grants/policies/migraciones o simular equivalencia de escrituras.

El navegador usa supabase-js directamente. index.html valida getSession/getUser y
lee usuarios, negocio y suscripción, pero no crea una transacción servidor común
con la autoridad fiscal. ventas.js inserta ventas y ventas_detalle, luego ejecuta
confirmar_venta. También usa anular_venta/registrar_devolucion_parcial.
index.html modifica clientes/productos y ejecuta ajustar_stock. compras.js cambia
compras y detalles; otros módulos ejecutan sus RPC comerciales aprobadas. No se
reimplementaron sus cuerpos SQL ni se inventaron efectos de triggers desconocidos.

El inventario mecanizable ARCA_SOURCE_INVENTORY.json registra por archivo 13
combinaciones literales tabla/método y 14 combinaciones archivo/RPC. No son un
recuento de todos los efectos SQL: hay RPC de lectura y escritura, triggers y
escritores externos que esa búsqueda estática NO certifica. No se inspeccionó
VICORA ADMIN ni otro repositorio protegido para inventar esas rutas.

Auth también tiene entradas independientes: cerrarSesion llama db.auth.signOut;
la reautenticación fiscal usa otro cliente signInWithPassword. Acceso/login,
refresco automático, panel administrativo, ban/delete y otras sesiones pueden
cambiar estado fuera de este PR. Cambiar únicamente arca.js, ventas.js o el fetch
del navegador no cierra esas rutas ni impide llamadas directas al proveedor.

## Límite exacto, no un problema de URL o credencial

El fence de trusted_authority.py bloquea su PROPIO SQLite. Supabase Auth confirma
sus cambios en OTRO PostgreSQL. Ninguno adquiere el lock del otro.

Traza admitida por esa topología:

1. El adaptador comprueba usuario/sesión o recibe estado vigente de Auth.
2. Inicia el fence de la fuente aislada.
3. Una ruta externa de Auth revoca la sesión y confirma su transacción.
4. La fuente aislada aún contiene active=true; el adaptador podría persistir el
   intent fiscal con esa concesión obsoleta.

El mismo problema existe con cambios de pertenencia, rol, suscripción o venta
fuera del escritor publish. Durable no significa coordinado. Un journal/outbox
agregado DESPUÉS del cambio, una firma de snapshot, un cron, un webhook eventual,
una doble lectura o una consulta HTTP inmediatamente antes/después no introducen
la exclusión mutua que falta. Si se acepta otra semántica de autorización debe
hacerse explícitamente; este PR no rebaja la garantía hasta commit.

Esto no significa que JWT/HTTP sean inseguros en general. Significa que NO prueban
el contrato fuerte específico que exige este proyecto entre dos autoridades que
pueden confirmar cambios independientemente.

Fuente pública comprobada, sin consultar ningún proyecto Supabase:
https://github.com/supabase/auth/blob/94d6777b0db6696bd40c8f1b6f9ee1836d65f3f3/internal/api/logout.go
Logout ejecuta db.Transaction y modelos Logout/LogoutSession/LogoutAllExceptMe,
confirma y devuelve 204; no participa en el fence de nuestro SQLite. Se fijó el
archivo por commit; NO se afirma que esa sea la versión instalada del proyecto.

Docs consultadas: https://supabase.com/docs/guides/auth/sessions y
https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook.
El custom access-token hook corre antes de emitir un token; no constituye un
protocolo transaccional general para logout, revocación, ban/delete y escrituras
comerciales. No se presupone un hook alojado que no fue aportado/verificado.

## ÚNICA decisión propuesta: autorización/preparación en la transacción de origen

**Autorizar una frontera servidor transaccional colocada con Auth y los datos
comerciales, primero en copia aislada, con una decisión de preparación durable en
ese mismo PostgreSQL.** No trasladar R100 ni crear otro contador fiscal.

Contrato mínimo de ese cambio de arquitectura:

- El gateway verifica el bearer del proyecto comercial; la transacción servidor
  verifica además sid/sub contra la sesión real, usuario activo, membresía única,
  rol, negocio, suscripción vigente y venta/detalles/cliente reales. No acepta
  negocio, rol ni permisos elegidos por el navegador.
- La frontera puede leer/bloquear las filas necesarias y evitar phantoms hasta
  confirmar la decisión. Así las escrituras PostgreSQL externas, incluidas las
  de Auth, se ordenan mediante locks de su PROPIO motor y no por un lock privado
  que esas rutas desconocen. Debe probarse timeout/deadlock y cerrar ante duda.
- En ESA transacción se persiste una decisión inmutable/idempotente de preparación,
  vinculada a sujeto/sesión/negocio/venta/revisión/huella. Su commit es el punto
  explícito de autorización. La revocación posterior no se presenta como anterior.
- La entrega al adaptador fiscal es materialización recuperable de esa decisión,
  no una nueva autorización basada en réplica eventual. Se reutilizan bindings e
  intents existentes y se liga cada transferencia de forma verificable/única;
  incertidumbre se concilia por clave, sin repetir efectos comerciales o reservar.
- R100 continúa siendo la única autoridad de numeración. Esta decisión NO autoriza
  emisión, CAE ni transporte. Sigue haciendo falta autorización fiscal independiente.

Esto modifica dónde se confirma la preparación; no es compatible sin cambios con
la factory actual basada en fence SQLite hasta el commit remoto. No se declara
implementado mediante una interfaz inventada ni se añade una segunda copia de
intents llamándola solución definitiva.

### Autorización externa que falta exactamente

El responsable comercial/Auth/DBA debe autorizar el nuevo límite de confianza y
la delegación mínima para esa operación servidor en el proyecto que contiene las
sesiones/datos. Hoy Auth tiene RLS sin políticas para el lector y propietario
supabase_auth_admin, según la metadata aportada en PR #11. Un usuario SELECT nuevo
no basta. El preparador no está autorizado a convertirse en postgres/service_role,
usar BYPASSRLS ni añadir UPDATE/policies/owners a tablas protegidas para superarlo.

La delegación debe ser de una operación acotada, no de credenciales generales ni
permisos de tablas al navegador. Si se propone un procedimiento privilegiado,
necesita revisión explícita de owner, EXECUTE, search_path, identidad del invocador,
RLS y escalamiento antes de exponerlo. No se supone que el rol necesario pueda
aprovisionarse en Supabase gestionado. Esa disponibilidad debe verificarla el
administrador autorizado; no se inventa aquí.

Ese cambio/privilegio sensible NO está autorizado por la prohibición actual de
intervenir el origen protegido. Preparar una simulación que conceda esas facultades
no certificaría la instalación real. Por eso no se publica otro backend que pase
tests únicamente después de concederse permisos que el hospedado no tiene.

Después de esa decisión y su implementación aislada, corresponde una sola
aceptación agrupada: identidad/sesión reales, escritores externos concurrentes,
venta e idempotencia, recuperación y HTTPS/socket. No repetir LAB14/14 ni el
almacenamiento de perfiles ya aceptados. No hay una migración, cuenta SQL o comando
Contabo autorizado para ejecutar con esta revisión.

## Código cambiado, pruebas y reversión de esta revisión

Sólo inventario, cuatro comprobaciones estáticas, CI y este informe. Ningún cambio
runtime a VICORA, factory fiscal o estado de source; ningún nuevo backend admitido.
Las pruebas comprueban integridad/procedencia de los 14 runtime, concordancia de
rutas literales, publicación apagada y controles de suscripción intactos. Su PASS
NO acredita autenticación alojada, un servidor nuevo ni integración E2E nueva.
Resultados verificados después de leer los logs:

- Commit de revisión/tests: `5b8837bab111f46505abd1e0fb0e4c54d5e9d5e2`.
- GitHub Actions 44213424725: **success**.
  https://github.com/calderoncristian6481404/VICORA-Comercial/actions/runs/44213424725
- Ubuntu24.04, job134497190810: 4 tests, 4 pass, 0 fail.
- Windows2022, job134497191109: 4 tests, 4 pass, 0 fail.
- Son **4 métodos estáticos / 8 ejecuciones**, no 8 métodos nuevos ni E2E.
- Los mismos 4 métodos aprobaron localmente con Node24. CI usa Node22.
- Se conservaron, sin repetir, las 41 pruebas fiscales previas ya aprobadas.
  No hubo una nueva prueba PG/servidor/Auth alojado. El E2E solicitado con un
  adaptador nuevo **no se ejecutó**: ese adaptador no existe de forma admisible.

La única conclusión aprobada es la integridad del contrato revisado, NO el
funcionamiento de la arquitectura propuesta ni la instalación de un backend.

No se fabrica un ZIP nuevo. Mantener sin instalar el incremento fiscal anterior.
Reversión: retirar sólo estos archivos de revisión mediante un commit sobre la
rama experimental, sin tocar runtime/DB ni revertir las protecciones comerciales.
No se fusiona ni despliega este PR. can_send=false, runtime_enabled=false y
arca.config.js deshabilitado. Producción, Supabase, Contabo y ARCA intactos.
