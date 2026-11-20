-- REVIEW ONLY. Metadata, no records, function bodies, secrets or mutations.
SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcreaterole,
 r.rolcreatedb,r.rolreplication,EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid) AS membership
FROM pg_roles r WHERE r.rolname IN('vicora_origin_gateway','vicora_origin_materializer','postgres');
SELECT worker.role_name,p.oid,n.nspname,p.proname,
 pg_get_function_identity_arguments(p.oid) AS signature,pg_get_userbyid(p.proowner) AS owner,
 has_function_privilege(worker.role_name,p.oid,'EXECUTE') AS effective_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN (SELECT rolname AS role_name FROM pg_roles WHERE rolname IN('vicora_origin_gateway','vicora_origin_materializer')) worker
WHERE n.nspname IN('public','auth') AND p.prosecdef
ORDER BY worker.role_name,p.oid;
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,
 a.attname,format_type(a.atttypid,a.atttypmod) AS type
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
WHERE ((n.nspname='auth' AND c.relname IN('users','sessions')) OR
 (n.nspname='public' AND c.relname IN('usuarios','negocios','suscripciones','ventas','ventas_detalle','clientes')))
AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum;
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,t.tgfoid::regprocedure::text AS function
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN('usuarios','suscripciones','ventas','ventas_detalle') AND NOT t.tgisinternal;

-- PUBLIC ACLs are visible even before the two operational roles exist.
SELECT p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS signature
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
WHERE n.nspname IN('public','auth') AND p.prosecdef AND a.grantee=0 AND a.privilege_type='EXECUTE'
ORDER BY p.oid;
