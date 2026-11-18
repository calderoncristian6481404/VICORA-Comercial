-- REVIEW CANDIDATE ONLY. NOT APPLIED. No commercial/Auth table, owner, policy or trigger changes.
-- Execution requires explicit DBA approval and endpoint identity/TLS verification.
-- The review GUC prevents accidental execution; it is NOT proof of project identity.
BEGIN;
DO $guard$ DECLARE r record; BEGIN
 IF current_setting('vicora.review.installation',true) IS DISTINCT FROM 'APPROVED_SOURCE_CONTRACT_V1'
 THEN RAISE EXCEPTION 'REVIEW_APPROVAL_REQUIRED'; END IF;
 IF to_regnamespace('vicora_origin_api') IS NOT NULL OR to_regnamespace('vicora_origin_private') IS NOT NULL
 THEN RAISE EXCEPTION 'NO_REPLACE_EXISTING_SOURCE'; END IF;
 FOR r IN SELECT * FROM pg_roles WHERE rolname IN('vicora_origin_gateway','vicora_origin_materializer') LOOP
  IF NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit
  OR EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid)
  THEN RAISE EXCEPTION 'RESTRICTED_LOGIN_REQUIRED'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN('vicora_origin_gateway','vicora_origin_materializer'))<>2 THEN RAISE EXCEPTION 'PREPROVISIONED_ROLES_REQUIRED'; END IF;
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN (VALUES('vicora_origin_gateway'),('vicora_origin_materializer')) AS worker(role_name)
 WHERE n.nspname IN('public','auth') AND p.prosecdef AND has_function_privilege(worker.role_name,p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'INHERITED_PRIVILEGED_RPC_EXPOSED_REVIEW_EXISTING_ACL'; END IF;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('auth','public') AND c.relkind='r' AND c.relname IN('users','sessions','usuarios','negocios','suscripciones','ventas','ventas_detalle','clientes') AND NOT c.relrowsecurity)
 THEN RAISE EXCEPTION 'SOURCE_RLS_REQUIRED'; END IF;
 IF EXISTS(SELECT FROM (VALUES ('auth.users','id'),('auth.users','deleted_at'),('auth.users','banned_until'),('auth.sessions','id'),('auth.sessions','user_id'),('auth.sessions','not_after'),('public.usuarios','auth_user_id'),('public.usuarios','id_negocio'),('public.usuarios','rol'),('public.usuarios','estado'),('public.negocios','id_negocio'),('public.negocios','estado'),('public.suscripciones','id_negocio'),('public.suscripciones','id_sistema'),('public.suscripciones','estado'),('public.suscripciones','proximo_vencimiento'),('public.suscripciones','fecha_fin_prueba'),('public.ventas','id_negocio'),('public.ventas','id_venta'),('public.ventas','id_cliente'),('public.ventas','subtotal'),('public.ventas','descuento'),('public.ventas','total'),('public.ventas','estado'),('public.ventas','fecha_confirmacion'),('public.ventas_detalle','id_negocio'),('public.ventas_detalle','id_venta'),('public.ventas_detalle','numero_linea'),('public.ventas_detalle','id_producto'),('public.ventas_detalle','cantidad'),('public.ventas_detalle','precio_unitario'),('public.ventas_detalle','subtotal'),('public.clientes','id_negocio'),('public.clientes','id_cliente'),('public.clientes','nombre'),('public.clientes','apellido'),('public.clientes','documento'),('public.clientes','estado')) AS expected(relation,column_name)
 WHERE NOT EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 WHERE c.oid=to_regclass(expected.relation) AND a.attname=expected.column_name AND a.attnum>0 AND NOT a.attisdropped AND c.relrowsecurity))
 THEN RAISE EXCEPTION 'SOURCE_COLUMNS_OR_RLS_NOT_VERIFIED'; END IF;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('vicora_origin_gateway'),('vicora_origin_materializer')) AS worker(role_name)
 WHERE n.nspname IN('public','auth') AND c.relkind IN('r','p') AND
 (has_any_column_privilege(worker.role_name,c.oid,'SELECT,INSERT,UPDATE') OR has_table_privilege(worker.role_name,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES')))
 THEN RAISE EXCEPTION 'SOURCE_DIRECT_TABLE_PRIVILEGES_REFUSED'; END IF;
 IF EXISTS(SELECT FROM (VALUES('vicora_origin_gateway'),('vicora_origin_materializer')) AS worker(role_name)
 WHERE has_schema_privilege(worker.role_name,'auth','USAGE') OR has_schema_privilege(worker.role_name,'public','CREATE'))
 THEN RAISE EXCEPTION 'SOURCE_SCHEMA_PRIVILEGES_REFUSED'; END IF;
END $guard$;
CREATE SCHEMA vicora_origin_private AUTHORIZATION postgres;
CREATE SCHEMA vicora_origin_api AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA vicora_origin_private,vicora_origin_api FROM PUBLIC;
CREATE TABLE vicora_origin_private.control(id integer PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT false);
INSERT INTO vicora_origin_private.control VALUES(1,false);
ALTER TABLE vicora_origin_private.control OWNER TO postgres;
ALTER TABLE vicora_origin_private.control ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_private.control FORCE ROW LEVEL SECURITY;
CREATE TABLE vicora_origin_private.decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business text NOT NULL,sale text NOT NULL,
 payload jsonb NOT NULL,seal text NOT NULL CHECK(seal ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'ACCEPTED' CHECK(state IN('ACCEPTED','MATERIALIZED')),
 target_operation uuid,target_hash text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(business,sale),CHECK((state='ACCEPTED' AND target_operation IS NULL AND target_hash IS NULL) OR
 (state='MATERIALIZED' AND target_operation IS NOT NULL AND target_hash IS NOT NULL AND target_hash ~ '^[0-9a-f]{64}$')));
ALTER TABLE vicora_origin_private.decisions OWNER TO postgres;
ALTER TABLE vicora_origin_private.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vicora_origin_private.decisions FORCE ROW LEVEL SECURITY;
CREATE FUNCTION vicora_origin_private.session_live(
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

ALTER FUNCTION vicora_origin_private.session_live(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION vicora_origin_private.session_live(uuid,uuid) FROM PUBLIC;
CREATE FUNCTION vicora_origin_private.require_session(p_subject uuid,p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$ BEGIN
 IF vicora_origin_private.session_live(p_subject,p_session) IS NOT TRUE
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SESSION_REJECTED'; END IF;
END $f$;
ALTER FUNCTION vicora_origin_private.require_session(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION vicora_origin_private.require_session(uuid,uuid) FROM PUBLIC;
CREATE FUNCTION vicora_origin_private.receipt(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('id',id,'business',business,'sale',sale,'payload_text',payload::text,
 'seal',seal,'state',state,'target_operation',target_operation,'target_hash',target_hash)
 FROM vicora_origin_private.decisions WHERE id=p_id
$f$;
ALTER FUNCTION vicora_origin_private.receipt(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION vicora_origin_private.receipt(uuid) FROM PUBLIC;

-- Identity-only fence for private profiles/documents. No sale, outbox or R100 write.
CREATE FUNCTION vicora_origin_api.identity(p_subject uuid,p_session uuid,p_exp bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $f$
DECLARE claims jsonb;subject_id uuid;session_id uuid;expires bigint;member record;subrow record;today date;
BEGIN
 IF session_user<>'vicora_origin_gateway' OR NOT (SELECT enabled FROM vicora_origin_private.control WHERE id=1 FOR SHARE)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_LAB_CALLER_REQUIRED'; END IF;
 subject_id:=p_subject;session_id:=p_session;expires:=p_exp;
 IF subject_id IS NULL OR session_id IS NULL OR expires IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_CONTEXT_REJECTED'; END IF;
 -- The SQL login is a TRUSTED GATEWAY, not a browser login. It can set context;
 -- its Python adapter MUST verify JWT first. Arguments alone prove no identity.
 PERFORM vicora_origin_private.require_session(subject_id,session_id);
 LOCK TABLE public.usuarios,public.suscripciones IN SHARE MODE;
 SELECT count(*) AS n INTO member FROM public.usuarios WHERE auth_user_id=subject_id;
 IF member.n<>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MEMBERSHIP_AMBIGUOUS'; END IF;
 SELECT * INTO STRICT member FROM public.usuarios WHERE auth_user_id=subject_id FOR SHARE;
 IF member.estado IS DISTINCT FROM 'ACTIVO' OR member.rol IS NULL OR member.rol NOT IN('ADMINISTRADOR','VENDEDOR') OR length(member.id_negocio) NOT BETWEEN 1 AND 128 OR member.id_negocio ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MEMBER_REJECTED'; END IF;
 PERFORM 1 FROM public.negocios WHERE id_negocio=member.id_negocio AND estado='ACTIVO' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_BUSINESS_REJECTED'; END IF;
 SELECT count(*) AS n INTO subrow FROM public.suscripciones WHERE id_negocio=member.id_negocio AND id_sistema='SIS-000001';
 IF subrow.n<>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SUBSCRIPTION_AMBIGUOUS'; END IF;
 SELECT * INTO STRICT subrow FROM public.suscripciones WHERE id_negocio=member.id_negocio AND id_sistema='SIS-000001' FOR SHARE;
 today:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 IF COALESCE(((subrow.estado='ACTIVA' AND subrow.proximo_vencimiento>=today) OR (subrow.estado='PRUEBA' AND subrow.fecha_fin_prueba>=today)),false) IS NOT TRUE
 OR (CASE WHEN subrow.estado='PRUEBA' THEN subrow.fecha_fin_prueba ELSE subrow.proximo_vencimiento END) IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SUBSCRIPTION_REJECTED'; END IF;
 IF expires<=extract(epoch FROM clock_timestamp()) OR expires>extract(epoch FROM clock_timestamp())+3605
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_TOKEN_EXPIRED'; END IF;
 RETURN jsonb_build_object('subject',subject_id,'session',session_id,'business',member.id_negocio,'role',member.rol);
END $f$;
ALTER FUNCTION vicora_origin_api.identity(uuid,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION vicora_origin_api.identity(uuid,uuid,bigint) FROM PUBLIC;

CREATE FUNCTION vicora_origin_api.prepare(p_subject uuid,p_session uuid,p_exp bigint,p_sale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $f$
DECLARE claims jsonb;subject_id uuid;session_id uuid;expires bigint;member record;subrow record;
 h record;detail jsonb;customer jsonb;body jsonb;oldrow record;newid uuid;total_lines numeric;
 count_lines bigint;actor jsonb;today date;
BEGIN
 IF session_user<>'vicora_origin_gateway' OR NOT (SELECT enabled FROM vicora_origin_private.control WHERE id=1 FOR SHARE)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_LAB_CALLER_REQUIRED'; END IF;
 IF p_sale IS NULL OR length(p_sale) NOT BETWEEN 1 AND 128 OR p_sale ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SALE_REF_REJECTED'; END IF;
 subject_id:=p_subject;session_id:=p_session;expires:=p_exp;
 IF subject_id IS NULL OR session_id IS NULL OR expires IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_CONTEXT_REJECTED'; END IF;
 -- The SQL login is a TRUSTED GATEWAY, not a browser login. It can set context;
 -- its Python adapter MUST verify JWT first. Arguments alone prove no identity.
 PERFORM vicora_origin_private.require_session(subject_id,session_id);
 LOCK TABLE public.usuarios,public.suscripciones,public.ventas_detalle IN SHARE MODE;
 SELECT count(*) AS n INTO member FROM public.usuarios WHERE auth_user_id=subject_id;
 IF member.n<>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MEMBERSHIP_AMBIGUOUS'; END IF;
 SELECT * INTO STRICT member FROM public.usuarios WHERE auth_user_id=subject_id FOR SHARE;
 IF member.estado IS DISTINCT FROM 'ACTIVO' OR member.rol IS NULL OR member.rol NOT IN('ADMINISTRADOR','VENDEDOR') OR length(member.id_negocio) NOT BETWEEN 1 AND 128 OR member.id_negocio ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MEMBER_REJECTED'; END IF;
 PERFORM 1 FROM public.negocios WHERE id_negocio=member.id_negocio AND estado='ACTIVO' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_BUSINESS_REJECTED'; END IF;
 SELECT count(*) AS n INTO subrow FROM public.suscripciones WHERE id_negocio=member.id_negocio AND id_sistema='SIS-000001';
 IF subrow.n<>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SUBSCRIPTION_AMBIGUOUS'; END IF;
 SELECT * INTO STRICT subrow FROM public.suscripciones WHERE id_negocio=member.id_negocio AND id_sistema='SIS-000001' FOR SHARE;
 today:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 IF COALESCE(((subrow.estado='ACTIVA' AND subrow.proximo_vencimiento>=today) OR (subrow.estado='PRUEBA' AND subrow.fecha_fin_prueba>=today)),false) IS NOT TRUE
 OR (CASE WHEN subrow.estado='PRUEBA' THEN subrow.fecha_fin_prueba ELSE subrow.proximo_vencimiento END) IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SUBSCRIPTION_REJECTED'; END IF;
 SELECT * INTO h FROM public.ventas WHERE id_negocio=member.id_negocio AND id_venta=p_sale FOR SHARE;
 IF NOT FOUND OR h.estado IS DISTINCT FROM 'CONFIRMADA' OR h.fecha_confirmacion IS NULL OR h.subtotal IS NULL OR h.descuento IS NULL OR h.total IS NULL
 OR h.subtotal<0 OR h.descuento<0 OR h.total<=0 OR h.subtotal-h.descuento<>h.total
 OR h.total<>round(h.total,2) OR h.subtotal<>round(h.subtotal,2) OR h.descuento<>round(h.descuento,2)
 OR h.subtotal>999999999999.99 OR (h.id_cliente IS NOT NULL AND (length(h.id_cliente) NOT BETWEEN 1 AND 128 OR h.id_cliente ~ '[[:cntrl:]]'))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SALE_REJECTED'; END IF;
 SELECT count(*),sum(subtotal) INTO count_lines,total_lines FROM public.ventas_detalle WHERE id_negocio=member.id_negocio AND id_venta=p_sale;
 IF count_lines NOT BETWEEN 1 AND 1000 OR total_lines IS DISTINCT FROM h.subtotal OR EXISTS(
 SELECT FROM public.ventas_detalle WHERE id_negocio=member.id_negocio AND id_venta=p_sale AND
 (numero_linea<=0 OR id_producto IS NULL OR length(id_producto) NOT BETWEEN 1 AND 128 OR id_producto ~ '[[:cntrl:]]' OR cantidad IS NULL OR cantidad<=0 OR cantidad<>trunc(cantidad)
 OR cantidad>1000000 OR precio_unitario IS NULL OR precio_unitario<0 OR precio_unitario<>round(precio_unitario,2)
 OR subtotal IS NULL OR subtotal<>cantidad*precio_unitario))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DETAIL_REJECTED'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id_negocio',id_negocio,'id_venta',id_venta,'numero_linea',numero_linea,
 'id_producto',id_producto,'cantidad',cantidad::text,'precio_unitario',precio_unitario::text,'subtotal',subtotal::text) ORDER BY numero_linea)
 INTO detail FROM public.ventas_detalle WHERE id_negocio=member.id_negocio AND id_venta=p_sale;
 customer:=jsonb_build_object('name',NULL,'document',NULL);
 IF h.id_cliente IS NOT NULL THEN
  SELECT jsonb_build_object('name',concat_ws(' ',nullif(btrim(nombre),''),nullif(btrim(apellido),'')),'document',documento)
  INTO customer FROM public.clientes WHERE id_negocio=member.id_negocio AND id_cliente=h.id_cliente AND estado='ACTIVO' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_CUSTOMER_REJECTED'; END IF;
 END IF;
 actor:=jsonb_build_object('subject',subject_id,'session',session_id,'business',member.id_negocio,'role',member.rol);
 body:=jsonb_build_object('header',jsonb_build_object('id_negocio',h.id_negocio,'id_venta',h.id_venta,'id_cliente',h.id_cliente,
 'subtotal',h.subtotal::text,'descuento',h.descuento::text,'total',h.total::text,'estado',h.estado,'fecha_confirmacion',h.fecha_confirmacion),
 'lines',detail,'customer',customer);
 -- Existing decision is immutable. Another currently authorized member can
 -- recover it, but does not inherit the original author's role.
 PERFORM vicora_origin_private.require_session(subject_id,session_id);
 IF expires<=extract(epoch FROM clock_timestamp()) OR expires>extract(epoch FROM clock_timestamp())+3605
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_TOKEN_EXPIRED'; END IF;
 SELECT * INTO oldrow FROM vicora_origin_private.decisions WHERE business=member.id_negocio AND sale=p_sale FOR UPDATE;
 IF FOUND THEN
  IF oldrow.payload->'commercial' IS DISTINCT FROM body THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DECISION_CONFLICT'; END IF;
  PERFORM vicora_origin_private.require_session(subject_id,session_id);
  IF expires<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_TOKEN_EXPIRED'; END IF;
  RETURN jsonb_build_object('decision',vicora_origin_private.receipt(oldrow.id),'actor',actor);
 END IF;
 body:=jsonb_build_object('commercial',body,'authorizer',actor);
 INSERT INTO vicora_origin_private.decisions(business,sale,payload,seal)
 VALUES(member.id_negocio,p_sale,body,encode(sha256(convert_to(body::text,'UTF8')),'hex'))
 ON CONFLICT(business,sale) DO NOTHING RETURNING id INTO newid;
 IF newid IS NULL THEN
  SELECT * INTO STRICT oldrow FROM vicora_origin_private.decisions WHERE business=member.id_negocio AND sale=p_sale FOR UPDATE;
  IF oldrow.payload->'commercial' IS DISTINCT FROM body->'commercial' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DECISION_CONFLICT'; END IF;
  newid:=oldrow.id;
 END IF;
 PERFORM vicora_origin_private.require_session(subject_id,session_id);
 IF expires<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_TOKEN_EXPIRED'; END IF;
 RETURN jsonb_build_object('decision',vicora_origin_private.receipt(newid),'actor',actor);
END $f$;
ALTER FUNCTION vicora_origin_api.prepare(uuid,uuid,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION vicora_origin_api.prepare(uuid,uuid,bigint,text) FROM PUBLIC;

CREATE FUNCTION vicora_origin_api.load(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE r jsonb; BEGIN
 IF NOT (SELECT enabled FROM vicora_origin_private.control WHERE id=1 FOR SHARE) OR session_user<>'vicora_origin_materializer' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MATERIALIZER_REQUIRED'; END IF;
 r:=vicora_origin_private.receipt(p_id);
 IF r IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DECISION_MISSING'; END IF;
 RETURN r;
END $f$;
CREATE FUNCTION vicora_origin_api.pending() RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 IF NOT (SELECT enabled FROM vicora_origin_private.control WHERE id=1 FOR SHARE) OR session_user<>'vicora_origin_materializer' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MATERIALIZER_REQUIRED'; END IF;
 RETURN QUERY SELECT id FROM vicora_origin_private.decisions WHERE state='ACCEPTED' ORDER BY created_at LIMIT 100;
END $f$;
CREATE FUNCTION vicora_origin_api.ack(p_id uuid,p_operation uuid,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE r record; BEGIN
 IF NOT (SELECT enabled FROM vicora_origin_private.control WHERE id=1 FOR SHARE) OR session_user<>'vicora_origin_materializer' OR p_operation IS NULL OR p_operation='00000000-0000-0000-0000-000000000000'::uuid OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_ACK_REJECTED'; END IF;
 SELECT * INTO r FROM vicora_origin_private.decisions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR (r.state='MATERIALIZED' AND (r.target_operation<>p_operation OR r.target_hash<>p_hash))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_ACK_CONFLICT'; END IF;
 UPDATE vicora_origin_private.decisions SET state='MATERIALIZED',target_operation=p_operation,target_hash=p_hash WHERE id=p_id;
END $f$;
ALTER FUNCTION vicora_origin_api.load(uuid) OWNER TO postgres;
ALTER FUNCTION vicora_origin_api.pending() OWNER TO postgres;
ALTER FUNCTION vicora_origin_api.ack(uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vicora_origin_api FROM PUBLIC;
GRANT USAGE ON SCHEMA vicora_origin_api TO vicora_origin_gateway,vicora_origin_materializer;
GRANT EXECUTE ON FUNCTION vicora_origin_api.prepare(uuid,uuid,bigint,text),vicora_origin_api.identity(uuid,uuid,bigint) TO vicora_origin_gateway;
GRANT EXECUTE ON FUNCTION vicora_origin_api.load(uuid),vicora_origin_api.pending(),vicora_origin_api.ack(uuid,uuid,text) TO vicora_origin_materializer;

CREATE FUNCTION vicora_origin_api.admission() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$ BEGIN
 IF session_user NOT IN('vicora_origin_gateway','vicora_origin_materializer') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SOURCE_CALLER_REFUSED'; END IF;
 RETURN (SELECT enabled FROM vicora_origin_private.control WHERE id=1 FOR SHARE);
END $f$;
ALTER FUNCTION vicora_origin_api.admission() OWNER TO postgres;
REVOKE ALL ON FUNCTION vicora_origin_api.admission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vicora_origin_api.admission() TO vicora_origin_gateway,vicora_origin_materializer;
-- Private schemas stay outside the Data API. Never grant browser/service roles.
-- Existing PUBLIC RPC grants are NOT silently changed by this candidate.
REVOKE ALL ON ALL TABLES IN SCHEMA vicora_origin_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vicora_origin_private FROM PUBLIC;
COMMENT ON SCHEMA vicora_origin_api IS 'REVIEWED_SOURCE_V1; prepared only, no numbering or fiscal transport';
COMMIT;
