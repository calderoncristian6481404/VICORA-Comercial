-- Revisión administrativa autorizada, únicamente metadatos/estado agregado.
-- Antes: comprobar en el proveedor el proyecto nxdimgzcsjnjjdfdpatp,
-- VICORA ADMIN, y conexión TLS. No ejecutar como sustituto de un login técnico.
-- No incluye definiciones SQL, datos Auth/comerciales, contraseñas ni hashes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='800ms';
SELECT current_setting('transaction_read_only') AS enforced_read_only;
SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit,rolcreatedb,
       rolcreaterole,rolreplication,
       (SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
FROM pg_roles r WHERE rolname IN ('vicora_origin_gateway','vicora_origin_materializer')
ORDER BY rolname;
SELECT enabled FROM vicora_origin_private.control WHERE id=1;
SELECT count(*) AS decisions FROM vicora_origin_private.decisions;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef,pg_get_userbyid(p.proowner) AS owner,p.proconfig,
       has_function_privilege('vicora_origin_gateway',p.oid,'EXECUTE') AS gateway,
       has_function_privilege('vicora_origin_materializer',p.oid,'EXECUTE') AS materializer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='vicora_origin_api' ORDER BY p.proname;
ROLLBACK;
