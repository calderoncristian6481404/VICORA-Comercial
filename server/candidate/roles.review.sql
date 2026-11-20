-- Proposal only; no secret or LOGIN is provisioned. Requires separate approval.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('vicora.review.installation',true) IS DISTINCT FROM 'APPROVED_SOURCE_CONTRACT_V1'
 THEN RAISE EXCEPTION 'REVIEW_APPROVAL_REQUIRED'; END IF;
END $guard$;
CREATE ROLE vicora_origin_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE vicora_origin_materializer NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
COMMIT;
-- Enabling LOGIN + secure credentials is an explicitly approved operator action.
-- Never pass a password through chat, shell command arguments, logs or Git.
