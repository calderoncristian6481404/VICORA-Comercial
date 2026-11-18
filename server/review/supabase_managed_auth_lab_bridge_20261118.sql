-- VICORA-PRUEBAS-ARCA / Supabase managed Auth integration feasibility.
-- ALREADY APPLIED AND VERIFIED IN LAB ON 2026-11-18.
-- NEVER apply this script directly to VICORA ADMIN production.
-- This private function is not a complete fiscal authorization; the server MUST
-- verify signed JWT first and business/sale permissions must be checked in
-- the same source transaction before durable preparation.
BEGIN;
CREATE SCHEMA vicora_arca_auth_bridge_lab;
REVOKE ALL ON SCHEMA vicora_arca_auth_bridge_lab FROM PUBLIC;
REVOKE ALL ON SCHEMA vicora_arca_auth_bridge_lab FROM anon, authenticated, service_role;

CREATE FUNCTION vicora_arca_auth_bridge_lab.session_live(
 p_subject pg_catalog.uuid, p_session pg_catalog.uuid
) RETURNS pg_catalog.bool
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET statement_timeout = '2500ms'
SET lock_timeout = '750ms'
AS $fn$
BEGIN
 IF p_subject IS NULL OR p_session IS NULL THEN
   RETURN FALSE;
 END IF;
 PERFORM 1
 FROM auth.users AS u
 INNER JOIN auth.sessions AS s ON s.user_id = u.id
 WHERE u.id = p_subject
   AND s.id = p_session
   AND u.deleted_at IS NULL
   AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.clock_timestamp())
   AND (s.not_after IS NULL OR s.not_after > pg_catalog.clock_timestamp())
 FOR SHARE OF u, s;
 RETURN FOUND;
END
$fn$;

REVOKE ALL ON FUNCTION vicora_arca_auth_bridge_lab.session_live(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION vicora_arca_auth_bridge_lab.session_live(pg_catalog.uuid, pg_catalog.uuid) FROM anon, authenticated, service_role;
GRANT USAGE ON SCHEMA vicora_arca_auth_bridge_lab TO vicora_fiscal_preparer_lab;
GRANT EXECUTE ON FUNCTION vicora_arca_auth_bridge_lab.session_live(pg_catalog.uuid, pg_catalog.uuid) TO vicora_fiscal_preparer_lab;
COMMENT ON FUNCTION vicora_arca_auth_bridge_lab.session_live(pg_catalog.uuid, pg_catalog.uuid)
IS 'LAB ONLY, managed Auth source read/row-lock feasibility. Requires externally validated JWT gateway; not sufficient for production authorization, inactivity/single-session policies, or fiscal issuance.';
COMMIT;

-- ROLLBACK for this lab-only addition (separate execution, if authorized):
-- DROP SCHEMA vicora_arca_auth_bridge_lab CASCADE;
