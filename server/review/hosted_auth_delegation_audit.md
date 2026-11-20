# VICORA + ARCA — verificación alojada, fase previa a delegación (17/11/2026)

**Alcance:** auditoría de metadatos del Supabase VICORA ADMIN (`nxdimgzcsjnjjdfdpatp`) por acceso autorizado, **solo SELECT**. El flujo transaccional experimental está probado en PR comercial #4 / fiscal #11, pero **NO está instalado ni validado sobre Auth alojado**. No se han otorgado permisos, creado funciones, migraciones, credenciales o cambiado datos.

## Evidencia concreta obtenida

1. `auth.users` y `auth.sessions`: propietario `supabase_auth_admin`, RLS habilitado. Las tablas comerciales `usuarios`, `negocios`, `suscripciones`, `clientes`, `ventas`, `ventas_detalle` también tienen RLS habilitado.
2. `postgres` dispone de SELECT y UPDATE sobre ambas tablas Auth, pero **tiene BYPASSRLS y privilegios elevados**. `postgres` no es miembro de `supabase_auth_admin`. `authenticated` no tiene SELECT sobre estas tablas. `service_role` tiene BYPASSRLS y tampoco debe utilizarse como login del preparador.
3. Columnas alojadas: `auth.users` contiene `id`, `banned_until`, `deleted_at`; `auth.sessions` tiene `id`, `user_id`, `not_after` y `refreshed_at` (timestamp without time zone). No asumir que su existencia equivale a todo el ciclo de expiración/revocación configurado en GoTrue.
4. `auth.refresh_tokens.session_id` referencia `auth.sessions.id` con `ON DELETE CASCADE`; revisar concretamente el comportamiento de cierre global, ban/delete, refresh, single-session y rutas administrativas. La auditoría NO acredita aún el orden de cada escritor del proveedor.
5. Las RPC comerciales `confirmar_venta`, `anular_venta` y `registrar_devolucion_parcial` son SECURITY DEFINER y pertenecen a `postgres`. Las ventas y detalles ya poseen triggers de vigencia, protección de ventas y costo histórico. Su concurrencia debe coexistir con cualquier fence; no modificarlos para acomodar tests.
6. La instancia comercial y Auth tiene una topología en la que una decisión durable puede persistirse en su **mismo** PostgreSQL. El instalador hipotético `server/lab/origin_schema.sql` **NO** puede aplicarse a managed Auth: necesita owners ficticios, relaciones ficticias y permisos creados en el contenedor aislado.

## Ruta mínima candidata, **sin autorización para ejecutar aún**

Explorar únicamente **una función interna altamente restringida de lectura/bloqueo Auth**, propiedad de un rol con acceso admitido por Supabase, detrás de una operación de preparación transaccional y outbox privada. Puede ser necesario un SECURITY DEFINER privilegiado para acceder a managed Auth; eso introduce una excepción de alto riesgo que requiere una auditoría independiente. **No otorgar credencial `postgres` ni `service_role` al backend, navegador o gateway**. La mera presencia de SELECT/UPDATE no valida esta arquitectura.

La operación final, de resultar factible, debería:
- verificar JWT con firma, iss/aud/alg y expiración por código servidor antes de llamar al SQL; en SQL, verificar vínculo real sid/sub y la semántica aplicable de sesión;
- validar negocio, rol y suscripción vigentes, cabecera/ítems/cliente de venta confirmada, con locks que serialicen cambios de revocación/venta según *escritores reales*, incluyendo RPC comerciales SECURITY DEFINER;
- registrar decisión inmutable e idempotente en la MISMA transacción de autorización, con los límites y reconciliación del PR #4;
- separar permisos **EXECUTE-only** de gateway y materializador, revocar EXECUTE a PUBLIC, esquemas privados no expuestos a Data API, propietarios NOLOGIN donde corresponda, search_path fijado, sin SQL dinámico;
- fallar cerrado ante cambio de contrato, carrera no coordinada, timeout, deadlock, respuesta incierta o permisos faltantes; no tocar R100, reservas ni emisión.

**Criterios de rechazo:** si los escritores Auth administrados no mantienen el fence necesario, si no se puede aislar/autorizar de manera segura el helper privileged, o si el impacto de locks en disponibilidad es inaceptable, **no promover** el diseño. Requiere otra topología aprobada; no lo reemplaza un webhook ni un cron.

## Siguiente intervención verificable

1. Revisar sin DDL la semántica actual de GoTrue y el esquema de sesiones/revocaciones alojado, incluyendo RPC y triggers/fuentes externas que mutan tablas relevantes.
2. Preparar **en una copia PG aislada** una propuesta explícita de funciones y grants mínimos, adaptada a los owners y tipos reales. Pruebas de escalamiento, SET ROLE, PUBLIC, shadowing, race logout/ban/delete/venta, rendimiento de locks y rollback.
3. Presentar *antes de ejecutar* una migración **específica, reversible, con checksum**, de manera que el titular pueda aprobar por separado la intervención sensible sobre VICORA ADMIN. Después aceptación alojada con cuentas y ventas de prueba autorizadas, TLS y proxy. No aplicar scripts sintéticos.
4. Mantener Contabo `vicora-preparer.service` disabled/inactive y `can_send=false`, `runtime_enabled=false`; no instalar el ZIP fiscal de 24 archivos antes de superar la aceptación.

### Reproducibilidad

`server/review/hosted_auth_preflight_readonly.sql` contiene las consultas reproducibles de metadatos (solo SELECT), sin consultar datos personales ni secretos. Este documento documenta **hallazgos y límites**, no permiso de despliegue.