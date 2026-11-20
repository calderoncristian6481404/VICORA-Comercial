-- VICORA-PRUEBAS-ARCA ONLY: hosted-source decision bridge with REAL managed Auth
-- and an ISOLATED synthetic commercial fixture. Never apply to VICORA ADMIN.
BEGIN;
DO $guard$ BEGIN
 IF to_regnamespace('vicora_arca_auth_bridge_lab') IS NULL
 OR to_regprocedure('vicora_arca_auth_bridge_lab.session_live(uuid,uuid)') IS NULL
 OR to_regnamespace('vicora_origin_hosted_lab') IS NOT NULL
 THEN RAISE EXCEPTION 'VICORA_LAB_BRIDGE_PREREQUISITE_REFUSED'; END IF;
END $guard$;
CREATE SCHEMA vicora_origin_hosted_lab;
REVOKE ALL ON SCHEMA vicora_origin_hosted_lab FROM PUBLIC;
REVOKE ALL ON SCHEMA vicora_origin_hosted_lab FROM anon,authenticated,service_role;

CREATE TABLE vicora_origin_hosted_lab.businesses(
 id text PRIMARY KEY, state text NOT NULL CHECK(state IN ('ACTIVO','INACTIVO')));
CREATE TABLE vicora_origin_hosted_lab.members(
 subject uuid PRIMARY KEY, business text NOT NULL REFERENCES vicora_origin_hosted_lab.businesses(id),
 role text NOT NULL CHECK (role IN ('ADMINISTRADOR','VENDEDOR','OTRO')),
 state text NOT NULL CHECK (state IN ('ACTIVO','INACTIVO')));
CREATE TABLE vicora_origin_hosted_lab.subscriptions(
 business text PRIMARY KEY REFERENCES vicora_origin_hosted_lab.businesses(id),
 state text NOT NULL CHECK (state IN('PRUEBA','ACTIVA','VENCIDA')),
 expiry date NOT NULL);
CREATE TABLE vicora_origin_hosted_lab.sales(
 business text NOT NULL REFERENCES vicora_origin_hosted_lab.businesses(id),
 sale text NOT NULL,
 state text NOT NULL CHECK(state IN ('CONFIRMADA','BORRADOR','ANULADA')),
 total numeric NOT NULL, confirmed_at timestamptz,
 PRIMARY KEY (business,sale));
CREATE TABLE vicora_origin_hosted_lab.sale_lines(
 business text NOT NULL, sale text NOT NULL, line_no integer NOT NULL CHECK(line_no>0),
 qty numeric NOT NULL CHECK(qty>0),unit_price numeric NOT NULL CHECK(unit_price>=0),
 PRIMARY KEY (business,sale,line_no),
 FOREIGN KEY(business,sale) REFERENCES vicora_origin_hosted_lab.sales(business,sale));
CREATE TABLE vicora_origin_hosted_lab.decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business text NOT NULL, sale text NOT NULL, subject uuid NOT NULL,
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[0-9a-f]{64}$'),
 snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'PREPARADO_NO_EMITIDO'
 CHECK(state='PREPARADO_NO_EMITIDO'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(business,sale));
ALTER TABLE vicora_origin_hosted_lab.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_hosted_lab.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_hosted_lab.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_hosted_lab.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_hosted_lab.sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_hosted_lab.decisions ENABLE ROW LEVEL SECURITY;
-- No RLS policies or table privileges granted to the preparer or browser.

CREATE FUNCTION vicora_origin_hosted_lab.prepare(
 p_subject uuid,p_session uuid,p_sale text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
SET statement_timeout='3500ms'
SET lock_timeout='800ms'
AS $body$
DECLARE m record;b record;s record;v record;item_count bigint; subtotal numeric;
 payload jsonb;hash text;prior record;d_id uuid;
BEGIN
 IF p_subject IS NULL OR p_session IS NULL OR p_sale IS NULL
 OR length(p_sale) NOT BETWEEN 1 AND 128 OR p_sale ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_BAD_INPUT';END IF;
 IF vicora_arca_auth_bridge_lab.session_live(p_subject,p_session) IS NOT TRUE
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_AUTH_DENIED';END IF;
 -- TABLE SHARE locks protect against new membership/subscription/line rows
 -- until the decision commits, including phantoms.
 LOCK TABLE vicora_origin_hosted_lab.members,
   vicora_origin_hosted_lab.subscriptions,
   vicora_origin_hosted_lab.sale_lines IN SHARE MODE;
 SELECT * INTO m FROM vicora_origin_hosted_lab.members
 WHERE subject=p_subject AND state='ACTIVO' AND role IN('ADMINISTRADOR','VENDEDOR') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_MEMBERSHIP_DENIED';END IF;
 SELECT * INTO b FROM vicora_origin_hosted_lab.businesses WHERE id=m.business AND state='ACTIVO' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_BUSINESS_DENIED';END IF;
 SELECT * INTO s FROM vicora_origin_hosted_lab.subscriptions WHERE business=m.business FOR SHARE;
 IF NOT FOUND OR s.state NOT IN('PRUEBA','ACTIVA')
 OR s.expiry < (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_SUBSCRIPTION_DENIED';END IF;
 SELECT * INTO v FROM vicora_origin_hosted_lab.sales
 WHERE business=m.business AND sale=p_sale AND state='CONFIRMADA'
 AND confirmed_at IS NOT NULL AND total>0 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_SALE_DENIED';END IF;
 SELECT count(*),coalesce(sum(qty*unit_price),0) INTO item_count,subtotal
 FROM vicora_origin_hosted_lab.sale_lines WHERE business=m.business AND sale=p_sale;
 IF item_count NOT BETWEEN 1 AND 1000 OR subtotal<>v.total
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_LINES_DENIED';END IF;
 SELECT jsonb_build_object(
  'business',v.business,'sale',v.sale,'total',v.total::text,
  'confirmed_at',v.confirmed_at,
  'lines',(SELECT jsonb_agg(jsonb_build_object(
    'line',l.line_no,'quantity',l.qty::text,'unit_price',l.unit_price::text)
    ORDER BY l.line_no) FROM vicora_origin_hosted_lab.sale_lines l
    WHERE l.business=v.business AND l.sale=v.sale)
 ) INTO payload;
 hash:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 INSERT INTO vicora_origin_hosted_lab.decisions(business,sale,subject,snapshot_hash,snapshot)
 VALUES(v.business,v.sale,p_subject,hash,payload)
 ON CONFLICT(business,sale) DO NOTHING RETURNING id INTO d_id;
 IF d_id IS NULL THEN
  SELECT * INTO prior FROM vicora_origin_hosted_lab.decisions
  WHERE business=v.business AND sale=v.sale FOR UPDATE;
  IF prior.snapshot_hash<>hash OR prior.snapshot IS DISTINCT FROM payload
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_DECISION_CONFLICT';END IF;
  d_id:=prior.id;
 END IF;
 -- Re-check Auth while locks are held up to commit.
 IF vicora_arca_auth_bridge_lab.session_live(p_subject,p_session) IS NOT TRUE
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LAB_AUTH_REVOKED';END IF;
 RETURN jsonb_build_object('state','PREPARADO_NO_EMITIDO',
    'decision_id',d_id,'business',v.business,'sale',v.sale,
    'snapshot_hash',hash,'can_send',false,'runtime_enabled',false);
END
$body$;
REVOKE ALL ON FUNCTION vicora_origin_hosted_lab.prepare(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION vicora_origin_hosted_lab.prepare(uuid,uuid,text) FROM anon,authenticated,service_role;
GRANT USAGE ON SCHEMA vicora_origin_hosted_lab TO vicora_fiscal_preparer_lab;
GRANT EXECUTE ON FUNCTION vicora_origin_hosted_lab.prepare(uuid,uuid,text) TO vicora_fiscal_preparer_lab;
COMMENT ON FUNCTION vicora_origin_hosted_lab.prepare(uuid,uuid,text) IS
 'LAB ONLY, synthetic business tables + real managed Auth. Gateway MUST verify JWT and sid/sub. No R100, ARCA or emission. Do not install on VICORA ADMIN.';
COMMIT;

-- LAB teardown only, after reviewing retained decisions:
-- DROP SCHEMA IF EXISTS vicora_origin_hosted_lab CASCADE;
