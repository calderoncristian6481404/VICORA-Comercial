# VICORA + ARCA — instalación controlada en VICORA ADMIN (18/11/2026)

**Estado real: INSTALADO EN SUPABASE COMERCIAL Y APAGADO.** Esta evidencia prevalece, para el estado alojado, sobre los informes anteriores que decían «candidata no aplicada». Código candidato: comercial `aa525cd3a089077b5a908299b331b6a85df88f75`, fiscal `f50e90d17eb04fe1d958cd7c27dc782ad59468ec`. La ejecución productiva fue aprobada explícitamente por el titular en la conversación el 18/11/2026. **No hay emisión, integración Contabo ni fusión de los PR.**

## Tres migraciones realmente aplicadas a VICORA ADMIN (`nxdimgzcsjnjjdfdpatp`)

1. **`20261118121116 vicora_arca_secure_public_sd_acl_20261118`** — Se revocó **solo** `EXECUTE FROM PUBLIC` de estas tres funciones `SECURITY DEFINER` ya existentes en `public`:
   - `registrar_pago_proveedor(text,text,numeric,text,text,text,text)`
   - `vicora_caja_pago_inicial_compra()`
   - `vicora_guardar_costo_historico_venta()`

   Se comprobaron precondiciones y se preservaron los grants directos a `anon`, `authenticated` y `service_role`. Verificación posterior: las tres tienen PUBLIC=false y los tres roles habituales mantienen EXECUTE=true. No se modificaron cuerpos ni triggers.

2. **`20261118121159 vicora_arca_origin_restricted_roles_dormant_20261118`** — Se crearon `vicora_origin_gateway` y `vicora_origin_materializer` como roles LOGIN **sin contraseña**, `NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION`, sin membresías. Quedan sin credenciales de servidor hasta aprovisionamiento privado autorizado.

3. **`20261118121236 vicora_arca_origin_private_disabled_install_20261118`** — Se aplicó transaccionalmente el código exacto del candidato `server/candidate/source_contract.sql` con la variable de aprobación operatoria en la misma transacción. Creó esquemas privados `vicora_origin_private` y `vicora_origin_api`, tablas `control` y `decisions`, y sus funciones de origen. NO se hicieron ALTER/DROP/UPDATE sobre Auth, relaciones comerciales, R100 ni triggers.

## Verificaciones posteriores con consultas de catálogo

- `vicora_origin_private.control.enabled = false`.
- `vicora_origin_private.decisions` contiene **0 filas**.
- API: 6 funciones, todas SECURITY DEFINER, 0 EXECUTE PUBLIC; privados: 3 funciones, 2 SD y 0 EXECUTE PUBLIC.
- Gateway: EXECUTE `prepare` e `identity`, **sin** `pending`, sin USAGE del esquema privado y sin SELECT de Auth, ventas ni decisiones.
- Materializador: EXECUTE `pending`/carga/ACK, **sin** prepare/identity, sin SELECT directo de Auth, ventas ni decisiones.
- `anon`, `authenticated`, `service_role`: no tienen USAGE del esquema API ni EXECUTE de las nuevas funciones.
- `public` y `auth`: **0** SECURITY DEFINER con EXECUTE otorgado a PUBLIC. Existían 3; se resolvieron por los REVOKE específicos.
- Sin cambios en triggers comerciales observados: ventas sigue con 3, ventas_detalle con 2, compras con 4, clientes con 1; otros según su estado anterior.
- Security Advisor posterior: INFO `rls_enabled_no_policy` incluye las dos tablas privadas nuevas con FORCE RLS, esperado para la API fuera de Data API; persisten WARN existentes `function_search_path_mutable`, `anon_security_definer_function_executable`, `authenticated_security_definer_function_executable` y `auth_leaked_password_protection`. Ningún WARN nuevo nombró el esquema de origen.

## Límites no superados por instalar apagado

**NO se probó un LOGIN real por red con los dos roles** ni JWT/JWKS, HTTPS o GoTrue/logout con usuarios y ventas comerciales autorizadas. Tampoco se verificó la instalación actual con tráfico comercial mientras un preparador está habilitado, se aprobó la custodia fiscal, el binding de emisor en R100 ni se conectó Contabo. Las pruebas 39/39 de la candidata son CI offline, no ensayo alojado. Las pruebas previas de Supabase LAB son con modelo comercial sintético, no sustituyen las pendientes.

Los dos logins creados NO tienen contraseña ni secreto suministrado a Contabo. No crear una contraseña en repositorio, chat, logs ni SQL visible. El servicio sigue apagado; `can_send=false` y `runtime_enabled=false`. No se invocó ARCA ni se habilitó emisión.

## Próximo paso indispensable

1. Aprovisionamiento privado de credenciales distintas de gateway/materializador y verificación TLS `verify-full` desde servidor autorizado (Contabo u otro entorno aprobable). No activar fiscal.
2. Prueba alojada con token JWT legítimo y sesión GoTrue, roles, suscripción y venta comercial de prueba, revocación antes/durante, timeout/concurrencia, ACK y conciliación. Se requiere aceptar explícitamente el acceso/datos usados para la prueba y la revisión de impacto de locks.
3. Solo después, aceptar/activar preparación (NO emisión), instalar delta de Contabo con manifiesto y rollback; homologación fiscal y habilitación productiva requieren aprobaciones independientes de cada emisor.

## Reversión

`server/candidate/rollback.sql` pone `control.enabled=false` y revoca accesos de API nueva, preservando decisiones/ACK y los datos comerciales. Como el control ya está OFF, no hace falta ejecutarlo. Para las tres ACL históricas, el script separado `public_sd_acl_remediation.review.sql` documenta la restauración de PUBLIC, que solo debe usarse si una incidencia funcional demuestra la necesidad: reabriría permisos globales. **No hacer rollback borrando decisiones ni reiniciando series R100.**

La candidata es aditiva y controlada, pero instalarla apagada no equivale a integración fiscal productiva completa.
