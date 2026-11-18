-- Additive shutdown only; retains decisions, snapshots, ACKs and Auth objects.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('vicora.review.installation',true) IS DISTINCT FROM 'APPROVED_SOURCE_CONTRACT_V1'
 THEN RAISE EXCEPTION 'REVIEW_APPROVAL_REQUIRED'; END IF;
END $guard$;
UPDATE vicora_origin_private.control SET enabled=false WHERE id=1;
REVOKE ALL ON SCHEMA vicora_origin_api FROM vicora_origin_gateway,vicora_origin_materializer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vicora_origin_api FROM vicora_origin_gateway,vicora_origin_materializer;
COMMIT;
