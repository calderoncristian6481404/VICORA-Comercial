-- VICORA Comercial / ARCA: auditoría de prepromoción, LECTURA SOLAMENTE.
-- Fecha: 2026-11-17. Ejecutar solo con acceso administrativo autorizado.
-- NO es una migración ni se debe agregar GRANT/CREATE/ALTER para pasar un control.
-- Ninguna consulta lee filas de usuarios, ventas ni secretos; solo catálogos PG.
--
-- Gate 1. Tabla y políticas; owners/Auth managed permanecen bajo su propietario.
WITH tables(name) AS (
 VALUES ('auth.users'),('auth.sessions'),('public.usuarios'),('public.negocios'),
 ('public.suscripciones'),('public.clientes'),('public.ventas'),('public.ventas_detalle')
)
SELECT t.name AS relation, c.oid IS NOT NULL AS exists,
 pg_get_userbyid(c.relowner) AS owner,
 c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
 (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count
FROM tables t LEFT JOIN pg_class c ON c.oid=to_regclass(t.name) ORDER BY t.name;

-- Gate 2. La cuenta que autorice la función no puede convertirse en credencial del servidor.
SELECT r.rolname, r.rolcanlogin, r.rolinherit, r.rolbypassrls,
 has_schema_privilege(r.rolname,'auth','USAGE') AS auth_usage,
 has_table_privilege(r.rolname,'auth.users','SELECT') AS users_select,
 has_table_privilege(r.rolname,'auth.sessions','SELECT') AS sessions_select,
 has_table_privilege(r.rolname,'auth.users','UPDATE') AS users_update,
 has_table_privilege(r.rolname,'auth.sessions','UPDATE') AS sessions_update
FROM pg_roles r
WHERE r.rolname IN ('postgres','supabase_auth_admin','authenticated','service_role')
ORDER BY r.rolname;

-- Gate 3. Campos exactos del Auth real; NO asumir la estructura de la fixture.
SELECT c.table_schema || '.' || c.table_name AS relation,
 array_agg(c.column_name || ':' || c.data_type ORDER BY c.ordinal_position) AS columns
FROM information_schema.columns c
WHERE (c.table_schema='auth' AND c.table_name IN ('users','sessions'))
GROUP BY c.table_schema,c.table_name ORDER BY relation;

-- Gate 4. Autorizadores previos de ventas. Revisar todas las rutas de escritores externos.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
 pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
 AND p.proname IN ('confirmar_venta','anular_venta','registrar_devolucion_parcial')
ORDER BY p.proname,arguments;

-- Gate 5. Evidencia de guardias de escritura existentes; no modificarlas.
SELECT n.nspname||'.'||c.relname AS relation,t.tgname,t.tgenabled,
 pg_get_triggerdef(t.oid,false) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname='public'
 AND c.relname IN ('usuarios','negocios','suscripciones','ventas','ventas_detalle','clientes')
ORDER BY relation,t.tgname;

-- Gate 6. La revocación real requiere verificar el ciclo Auth de GoTrue (también
-- refresh_tokens); la mera existencia de auth.sessions no certifica revocación.
SELECT conname,conrelid::regclass::text AS relation,confrelid::regclass::text AS references_table,
 pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('auth.sessions'::regclass,'auth.refresh_tokens'::regclass)
 AND contype IN ('f','p','u') ORDER BY relation,conname;

-- NO habilitar operación por resultados exitosos de estas consultas.
-- Antes: diseño SECURITY DEFINER revisado, pruebas Auth/logout, rollback,
-- permisos EXECUTE ONLY, validación JWT del gateway, concurrencia y servicio apagado.
