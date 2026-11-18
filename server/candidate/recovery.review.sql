-- REVIEW ONLY. Separate source recovery permission; NEVER executed by the package.
-- Does not enable preparation, mutate Auth/commercial data, or delete decisions.
-- Explicit owner approval and verified endpoint/TLS are mandatory before installation.
BEGIN;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='800ms';
DO $install$
BEGIN
 IF current_setting('vicora.review.recovery_installation',true) IS DISTINCT FROM 'APPROVED_SOURCE_RECOVERY_V1'
 OR obj_description(to_regnamespace('vicora_origin_api'),'pg_namespace') IS DISTINCT FROM 'REVIEWED_SOURCE_V1; prepared only, no numbering or fiscal transport'
 OR to_regclass('vicora_origin_private.decisions') IS NULL
 THEN RAISE EXCEPTION 'SOURCE_RECOVERY_REVIEW_REQUIRED'; END IF;
 IF (SELECT enabled FROM vicora_origin_private.control WHERE id=1) IS DISTINCT FROM false THEN RAISE EXCEPTION 'PREPARATION_MUST_REMAIN_DISABLED'; END IF;
 IF to_regnamespace('vicora_origin_recovery') IS NOT NULL THEN
  IF obj_description(to_regnamespace('vicora_origin_recovery'),'pg_namespace') IS DISTINCT FROM 'SOURCE_RECOVERY_V1_DISABLED_BY_DEFAULT'
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='vicora_origin_recovery'::regnamespace)<>4
  OR (SELECT enabled FROM vicora_origin_recovery.control WHERE id=1) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'RECOVERY_EXISTING_INSTALLATION_REQUIRES_REVIEW'; END IF;
  RETURN;
 END IF;
 EXECUTE $ddl$
 CREATE SCHEMA vicora_origin_recovery AUTHORIZATION postgres;
 REVOKE ALL ON SCHEMA vicora_origin_recovery FROM PUBLIC;
 COMMENT ON SCHEMA vicora_origin_recovery IS 'SOURCE_RECOVERY_V1_DISABLED_BY_DEFAULT';
 CREATE TABLE vicora_origin_recovery.control(id integer PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT false);
 ALTER TABLE vicora_origin_recovery.control OWNER TO postgres;
 ALTER TABLE vicora_origin_recovery.control ENABLE ROW LEVEL SECURITY;
 ALTER TABLE vicora_origin_recovery.control FORCE ROW LEVEL SECURITY;
 INSERT INTO vicora_origin_recovery.control VALUES(1,false);
 CREATE FUNCTION vicora_origin_recovery.admission() RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 BEGIN
  IF session_user<>'vicora_origin_materializer' THEN RAISE EXCEPTION 'RECOVERY_ROLE_REJECTED' USING ERRCODE='42501'; END IF;
  RETURN (SELECT enabled FROM vicora_origin_recovery.control WHERE id=1 FOR SHARE);
 END $fn$;
 CREATE FUNCTION vicora_origin_recovery.load(p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 DECLARE value jsonb;
 BEGIN
  IF vicora_origin_recovery.admission() IS DISTINCT FROM true THEN RAISE EXCEPTION 'RECOVERY_DISABLED' USING ERRCODE='42501'; END IF;
  value:=vicora_origin_private.receipt(p_id);
  IF value IS NULL THEN RAISE EXCEPTION 'RECOVERY_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  RETURN value;
 END $fn$;
 CREATE FUNCTION vicora_origin_recovery.pending() RETURNS SETOF uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 BEGIN
  IF vicora_origin_recovery.admission() IS DISTINCT FROM true THEN RAISE EXCEPTION 'RECOVERY_DISABLED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT id FROM vicora_origin_private.decisions WHERE state='ACCEPTED' ORDER BY created_at,id LIMIT 100;
 END $fn$;
 CREATE FUNCTION vicora_origin_recovery.ack(p_id uuid,p_operation uuid,p_hash text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 DECLARE row vicora_origin_private.decisions%ROWTYPE;
 BEGIN
  IF vicora_origin_recovery.admission() IS DISTINCT FROM true THEN RAISE EXCEPTION 'RECOVERY_DISABLED' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_operation IS NULL OR p_operation='00000000-0000-0000-0000-000000000000'
  OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RECOVERY_ACK_REJECTED'; END IF;
  SELECT * INTO row FROM vicora_origin_private.decisions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF row.state='MATERIALIZED' THEN
   IF row.target_operation IS DISTINCT FROM p_operation OR row.target_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'RECOVERY_ACK_CONFLICT'; END IF;
   RETURN false;
  END IF;
  IF row.state<>'ACCEPTED' OR row.target_operation IS NOT NULL OR row.target_hash IS NOT NULL THEN RAISE EXCEPTION 'RECOVERY_STATE_REJECTED'; END IF;
  UPDATE vicora_origin_private.decisions SET state='MATERIALIZED',target_operation=p_operation,target_hash=p_hash WHERE id=p_id;
  RETURN true;
 END $fn$;
 ALTER FUNCTION vicora_origin_recovery.admission() OWNER TO postgres;
 ALTER FUNCTION vicora_origin_recovery.load(uuid) OWNER TO postgres;
 ALTER FUNCTION vicora_origin_recovery.pending() OWNER TO postgres;
 ALTER FUNCTION vicora_origin_recovery.ack(uuid,uuid,text) OWNER TO postgres;
 REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vicora_origin_recovery FROM PUBLIC;
 GRANT USAGE ON SCHEMA vicora_origin_recovery TO vicora_origin_materializer;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vicora_origin_recovery TO vicora_origin_materializer;
 $ddl$;
END $install$;
COMMIT;
