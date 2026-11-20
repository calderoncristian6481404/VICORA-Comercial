-- REVIEW ONLY: no DROP, DELETE or reversal of already committed ACKs.
BEGIN;
SET LOCAL lock_timeout='800ms'; SET LOCAL statement_timeout='3s';
UPDATE vicora_origin_recovery.control SET enabled=false WHERE id=1;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA vicora_origin_recovery FROM vicora_origin_materializer;
REVOKE USAGE ON SCHEMA vicora_origin_recovery FROM vicora_origin_materializer;
COMMIT;
