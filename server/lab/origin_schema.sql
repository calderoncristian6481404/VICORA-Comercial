-- HYPOTHETICAL DELEGATION, DISPOSABLE PG17 ONLY. Never a hosted migration.
DO $guard$ BEGIN
 IF current_database() !~ '^r131_[0-9a-f]{24}$' OR inet_server_addr() IS NOT NULL
 OR current_setting('listen_addresses')<>'' OR pg_read_file('/run/r131/marker')<>current_database()
 THEN RAISE EXCEPTION 'ORIGIN_DISPOSABLE_ONLY'; END IF;
END $guard$;
CREATE ROLE origin_command_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
CREATE ROLE origin_auth_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
CREATE ROLE origin_auth_writer LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
GRANT origin_auth_owner TO origin_auth_writer;
CREATE ROLE origin_business_writer LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
CREATE ROLE origin_gateway_lab LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
CREATE ROLE origin_materializer_lab LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
CREATE SCHEMA auth AUTHORIZATION origin_auth_owner;
CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,deleted_at timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
ALTER TABLE auth.users OWNER TO origin_auth_owner;
ALTER TABLE auth.sessions OWNER TO origin_auth_owner;
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
-- Zero Auth policies, matching the reported managed-Auth obstacle. No SELECT for gateway.
CREATE TABLE public.usuarios(id_usuario text PRIMARY KEY,id_negocio text NOT NULL,rol text NOT NULL,estado text NOT NULL,auth_user_id uuid NOT NULL);
CREATE TABLE public.negocios(id_negocio text PRIMARY KEY,estado text NOT NULL);
CREATE TABLE public.suscripciones(id_suscripcion text PRIMARY KEY,id_negocio text NOT NULL,id_sistema text NOT NULL,estado text NOT NULL,proximo_vencimiento date,fecha_fin_prueba date);
CREATE TABLE public.ventas(id_negocio text,id_venta text,id_cliente text,subtotal numeric,descuento numeric,total numeric,estado text,fecha_confirmacion timestamptz,PRIMARY KEY(id_negocio,id_venta));
CREATE TABLE public.ventas_detalle(id_negocio text,id_venta text,numero_linea integer,id_producto text,cantidad numeric,precio_unitario numeric,subtotal numeric,PRIMARY KEY(id_negocio,id_venta,numero_linea));
CREATE TABLE public.clientes(id_negocio text,id_cliente text,nombre text,apellido text,documento text,estado text,PRIMARY KEY(id_negocio,id_cliente));
DO $tables$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['usuarios','negocios','suscripciones','ventas','ventas_detalle','clientes'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO origin_business_writer',n);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
  -- Delegation exists only inside this isolated hypothetical authority. It is
  -- NOT available/approved in managed Supabase, and never granted to gateway.
  EXECUTE format('GRANT SELECT,UPDATE ON public.%I TO origin_command_owner',n);
  EXECUTE format('CREATE POLICY origin_internal_read ON public.%I FOR SELECT TO origin_command_owner USING(true)',n);
  EXECUTE format('CREATE POLICY origin_internal_lock ON public.%I FOR UPDATE TO origin_command_owner USING(true) WITH CHECK(false)',n);
 END LOOP;
END $tables$;
CREATE SCHEMA origin_private AUTHORIZATION origin_command_owner;
CREATE SCHEMA origin_api AUTHORIZATION origin_command_owner;
REVOKE ALL ON SCHEMA origin_private,origin_api FROM PUBLIC;
GRANT USAGE ON SCHEMA auth,public TO origin_command_owner;
GRANT USAGE ON SCHEMA origin_private TO origin_auth_owner;
CREATE TABLE origin_private.decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business text NOT NULL,sale text NOT NULL,
 payload jsonb NOT NULL,seal text NOT NULL CHECK(seal ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'ACCEPTED' CHECK(state IN('ACCEPTED','MATERIALIZED')),
 target_operation uuid,target_hash text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(business,sale),CHECK((state='ACCEPTED' AND target_operation IS NULL AND target_hash IS NULL) OR
 (state='MATERIALIZED' AND target_operation IS NOT NULL AND target_hash ~ '^[0-9a-f]{64}$')));
ALTER TABLE origin_private.decisions OWNER TO origin_command_owner;
ALTER TABLE origin_private.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE origin_private.decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON origin_private.decisions TO origin_command_owner USING(true) WITH CHECK(true);

CREATE FUNCTION origin_private.auth_fence(p_subject uuid,p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_subject AND deleted_at IS NULL
  AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_ACCOUNT_REJECTED'; END IF;
 PERFORM 1 FROM auth.sessions WHERE id=p_session AND user_id=p_subject
  AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SESSION_REJECTED'; END IF;
END $f$;
ALTER FUNCTION origin_private.auth_fence(uuid,uuid) OWNER TO origin_auth_owner;
REVOKE ALL ON FUNCTION origin_private.auth_fence(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION origin_private.auth_fence(uuid,uuid) TO origin_command_owner;

CREATE FUNCTION origin_private.receipt(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('id',id,'business',business,'sale',sale,'payload_text',payload::text,
 'seal',seal,'state',state,'target_operation',target_operation,'target_hash',target_hash)
 FROM origin_private.decisions WHERE id=p_id
$f$;
ALTER FUNCTION origin_private.receipt(uuid) OWNER TO origin_command_owner;
REVOKE ALL ON FUNCTION origin_private.receipt(uuid) FROM PUBLIC;

CREATE FUNCTION origin_api.prepare(p_sale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $f$
DECLARE claims jsonb;subject_id uuid;session_id uuid;expires bigint;member record;subrow record;
 h record;detail jsonb;customer jsonb;body jsonb;oldrow record;newid uuid;total_lines numeric;
 count_lines bigint;actor jsonb;today date;
BEGIN
 IF session_user<>'origin_gateway_lab' OR current_database() !~ '^r131_[0-9a-f]{24}$'
 OR inet_server_addr() IS NOT NULL OR current_setting('listen_addresses')<>''
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_LAB_CALLER_REQUIRED'; END IF;
 IF p_sale IS NULL OR length(p_sale) NOT BETWEEN 1 AND 128 OR p_sale ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_SALE_REF_REJECTED'; END IF;
 BEGIN
  claims:=current_setting('request.jwt.claims',true)::jsonb;
  subject_id:=(claims->>'sub')::uuid;session_id:=(claims->>'session_id')::uuid;expires:=(claims->>'exp')::bigint;
  IF subject_id IS NULL OR session_id IS NULL OR expires IS NULL THEN RAISE EXCEPTION 'MISSING'; END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_CONTEXT_REJECTED'; END;
 -- The SQL login is a TRUSTED GATEWAY, not a browser login. It can set context;
 -- its Python adapter MUST verify JWT first. GUC itself proves no identity.
 PERFORM origin_private.auth_fence(subject_id,session_id);
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
 PERFORM origin_private.auth_fence(subject_id,session_id);
 IF expires<=extract(epoch FROM clock_timestamp()) OR expires>extract(epoch FROM clock_timestamp())+3605
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_TOKEN_EXPIRED'; END IF;
 SELECT * INTO oldrow FROM origin_private.decisions WHERE business=member.id_negocio AND sale=p_sale FOR UPDATE;
 IF FOUND THEN
  IF oldrow.payload->'commercial' IS DISTINCT FROM body THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DECISION_CONFLICT'; END IF;
  RETURN jsonb_build_object('decision',origin_private.receipt(oldrow.id),'actor',actor);
 END IF;
 body:=jsonb_build_object('commercial',body,'authorizer',actor);
 INSERT INTO origin_private.decisions(business,sale,payload,seal)
 VALUES(member.id_negocio,p_sale,body,encode(sha256(convert_to(body::text,'UTF8')),'hex'))
 ON CONFLICT(business,sale) DO NOTHING RETURNING id INTO newid;
 IF newid IS NULL THEN
  SELECT * INTO STRICT oldrow FROM origin_private.decisions WHERE business=member.id_negocio AND sale=p_sale FOR UPDATE;
  IF oldrow.payload->'commercial' IS DISTINCT FROM body->'commercial' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DECISION_CONFLICT'; END IF;
  newid:=oldrow.id;
 END IF;
 RETURN jsonb_build_object('decision',origin_private.receipt(newid),'actor',actor);
END $f$;
ALTER FUNCTION origin_api.prepare(text) OWNER TO origin_command_owner;
REVOKE ALL ON FUNCTION origin_api.prepare(text) FROM PUBLIC;

CREATE FUNCTION origin_api.load(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE r jsonb; BEGIN
 IF session_user<>'origin_materializer_lab' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MATERIALIZER_REQUIRED'; END IF;
 r:=origin_private.receipt(p_id);
 IF r IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_DECISION_MISSING'; END IF;
 RETURN r;
END $f$;
CREATE FUNCTION origin_api.pending() RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 IF session_user<>'origin_materializer_lab' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_MATERIALIZER_REQUIRED'; END IF;
 RETURN QUERY SELECT id FROM origin_private.decisions WHERE state='ACCEPTED' ORDER BY created_at LIMIT 100;
END $f$;
CREATE FUNCTION origin_api.ack(p_id uuid,p_operation uuid,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE r record; BEGIN
 IF session_user<>'origin_materializer_lab' OR p_operation IS NULL OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_ACK_REJECTED'; END IF;
 SELECT * INTO r FROM origin_private.decisions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR (r.state='MATERIALIZED' AND (r.target_operation<>p_operation OR r.target_hash<>p_hash))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ORIGIN_ACK_CONFLICT'; END IF;
 UPDATE origin_private.decisions SET state='MATERIALIZED',target_operation=p_operation,target_hash=p_hash WHERE id=p_id;
END $f$;
ALTER FUNCTION origin_api.load(uuid) OWNER TO origin_command_owner;
ALTER FUNCTION origin_api.pending() OWNER TO origin_command_owner;
ALTER FUNCTION origin_api.ack(uuid,uuid,text) OWNER TO origin_command_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA origin_api FROM PUBLIC;
GRANT USAGE ON SCHEMA origin_api TO origin_gateway_lab,origin_materializer_lab;
GRANT EXECUTE ON FUNCTION origin_api.prepare(text) TO origin_gateway_lab;
GRANT EXECUTE ON FUNCTION origin_api.load(uuid),origin_api.pending(),origin_api.ack(uuid,uuid,text) TO origin_materializer_lab;
