-- REVIEW ONLY: narrow ACL change for VICORA ADMIN, NOT EXECUTED.
-- Inspected 2026-11-18. All three SECURITY DEFINER functions retain
-- existing explicit EXECUTE grants to anon, authenticated and service_role.
-- Without this, the new restricted fiscal roles inherit execute via PUBLIC.
-- Requires independent authorization and a fresh preflight against production.
BEGIN;
SET LOCAL lock_timeout='800ms';
SET LOCAL statement_timeout='5s';
DO $guard$
DECLARE f oid; fn text; pub_count int; all_bad int;
BEGIN
 IF current_setting('vicora.review.installation', true) IS DISTINCT FROM 'APPROVED_SOURCE_CONTRACT_V1'
 THEN RAISE EXCEPTION 'REVIEW_APPROVAL_REQUIRED'; END IF;
 SELECT count(*) INTO pub_count
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','auth') AND p.prosecdef
 AND EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
 IF pub_count <> 3 THEN RAISE EXCEPTION 'PUBLIC_SD_BASELINE_CHANGED: %',pub_count;END IF;
 FOR fn IN SELECT unnest(ARRAY[
   'public.registrar_pago_proveedor(text,text,numeric,text,text,text,text)',
   'public.vicora_caja_pago_inicial_compra()',
   'public.vicora_guardar_costo_historico_venta()'
 ]) LOOP
   f:=to_regprocedure(fn);
   IF f IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=f)
      OR NOT EXISTS(SELECT FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE')
      OR (SELECT count(*) FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE p.oid=f AND a.grantee=ANY(ARRAY['anon'::regrole::oid,'authenticated'::regrole::oid,'service_role'::regrole::oid])
          AND a.privilege_type='EXECUTE')<>3
   THEN RAISE EXCEPTION 'EXISTING_ROLE_ACL_UNVERIFIED: %',fn; END IF;
 END LOOP;
END
$guard$;
-- These REVOKEs affect ONLY PUBLIC; existing role-specific grants are retained.
REVOKE EXECUTE ON FUNCTION public.registrar_pago_proveedor(text,text,numeric,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vicora_caja_pago_inicial_compra() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vicora_guardar_costo_historico_venta() FROM PUBLIC;
DO $verify$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
 WHERE s.nspname IN ('public','auth') AND p.prosecdef
 AND EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
 IF n<>0 THEN RAISE EXCEPTION 'PUBLIC_SD_REMAINS_EXPOSED: %',n;END IF;
 IF NOT (
 has_function_privilege('anon','public.registrar_pago_proveedor(text,text,numeric,text,text,text,text)','EXECUTE')
 AND has_function_privilege('authenticated','public.registrar_pago_proveedor(text,text,numeric,text,text,text,text)','EXECUTE')
 AND has_function_privilege('service_role','public.registrar_pago_proveedor(text,text,numeric,text,text,text,text)','EXECUTE'))
 THEN RAISE EXCEPTION 'EXISTING_ROLE_ACCESS_CHANGED';END IF;
END $verify$;
COMMIT;

-- RESTORE only if separate reviewed rollback is approved. This restores old
-- PUBLIC execute grants; do not run on a hardened production deployment by default.
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor(text,text,numeric,text,text,text,text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.vicora_caja_pago_inicial_compra() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.vicora_guardar_costo_historico_venta() TO PUBLIC;
-- COMMIT;
