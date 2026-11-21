-- VICORA Comercial · Alta opcional de facturación electrónica por comercio.
-- NO es un registro fiscal, ni crea certificados, autorizaciones ARCA o numeración.
-- Separación estricta entre SOLICITUD comercial y EMISIÓN FISCAL.
BEGIN;
DO $guard$ BEGIN
  IF to_regclass('public.vicora_arca_solicitudes_comercio') IS NOT NULL
     OR to_regclass('public.usuarios') IS NULL
     OR to_regclass('public.negocios') IS NULL
     OR to_regprocedure('public.vicora_guardar_vigencia_escritura_20261112()') IS NULL
  THEN RAISE EXCEPTION 'VICORA_ARCA_ONBOARDING_REQUIRES_REVIEW'; END IF;
END $guard$;

CREATE TABLE public.vicora_arca_solicitudes_comercio (
 id_negocio text PRIMARY KEY REFERENCES public.negocios(id_negocio) ON DELETE CASCADE,
 cuit_emisor text CHECK(cuit_emisor IS NULL OR cuit_emisor ~ '^[0-9]{11}$'),
 condicion_iva text CHECK(condicion_iva IS NULL OR condicion_iva IN ('MONOTRIBUTO','RI','EXENTO')),
 punto_venta integer CHECK(punto_venta IS NULL OR punto_venta BETWEEN 1 AND 99998),
 representacion text CHECK(representacion IS NULL OR representacion IN ('PROPIA','DELEGADA')),
 razon_social text CHECK(razon_social IS NULL OR length(btrim(razon_social)) BETWEEN 1 AND 160),
 domicilio_fiscal text CHECK(domicilio_fiscal IS NULL OR length(btrim(domicilio_fiscal)) BETWEEN 1 AND 240),
 ingresos_brutos text CHECK(ingresos_brutos IS NULL OR length(btrim(ingresos_brutos)) BETWEEN 1 AND 120),
 inicio_actividades date CHECK(inicio_actividades IS NULL OR inicio_actividades BETWEEN DATE '1900-01-01' AND CURRENT_DATE),
 declara_responsabilidad boolean NOT NULL DEFAULT false,
 estado text NOT NULL DEFAULT 'BORRADOR' CHECK(estado IN ('BORRADOR','SOLICITADA')),
 creada_en timestamptz NOT NULL DEFAULT now(),
 actualizada_en timestamptz NOT NULL DEFAULT now(),
 solicitada_en timestamptz,
 CONSTRAINT vicora_arca_solicitud_completa CHECK (
  estado='BORRADOR' OR (
   cuit_emisor IS NOT NULL AND condicion_iva IS NOT NULL AND
   punto_venta IS NOT NULL AND representacion IS NOT NULL AND
   razon_social IS NOT NULL AND domicilio_fiscal IS NOT NULL AND
   ingresos_brutos IS NOT NULL AND inicio_actividades IS NOT NULL AND
   declara_responsabilidad IS TRUE
  )
 )
);
COMMENT ON TABLE public.vicora_arca_solicitudes_comercio
IS 'Solicitud comercial de alta ARCA, sin credenciales ni habilitación de WSFE, número de factura o CAE.';
COMMENT ON COLUMN public.vicora_arca_solicitudes_comercio.estado
IS 'Solo BORRADOR o SOLICITADA. Nunca significa fiscalmente HABILITADO.';
REVOKE ALL ON public.vicora_arca_solicitudes_comercio FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.vicora_arca_solicitudes_comercio TO authenticated;
ALTER TABLE public.vicora_arca_solicitudes_comercio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vicora_arca_solicitudes_comercio FORCE ROW LEVEL SECURITY;

CREATE POLICY vicora_arca_alta_admin_read ON public.vicora_arca_solicitudes_comercio
FOR SELECT TO authenticated USING (
 EXISTS (
  SELECT 1 FROM public.usuarios u
  JOIN public.negocios n ON n.id_negocio=u.id_negocio
  WHERE u.auth_user_id=(SELECT auth.uid()) AND
        u.id_negocio=vicora_arca_solicitudes_comercio.id_negocio AND
        u.rol='ADMINISTRADOR' AND u.estado='ACTIVO' AND n.estado='ACTIVO'
 )
);

CREATE POLICY vicora_arca_alta_admin_insert ON public.vicora_arca_solicitudes_comercio
FOR INSERT TO authenticated WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.usuarios u
  JOIN public.negocios n ON n.id_negocio=u.id_negocio
  WHERE u.auth_user_id=(SELECT auth.uid()) AND
        u.id_negocio=vicora_arca_solicitudes_comercio.id_negocio AND
        u.rol='ADMINISTRADOR' AND u.estado='ACTIVO' AND n.estado='ACTIVO'
 )
);

CREATE POLICY vicora_arca_alta_admin_update ON public.vicora_arca_solicitudes_comercio
FOR UPDATE TO authenticated
USING (
 EXISTS (
  SELECT 1 FROM public.usuarios u
  JOIN public.negocios n ON n.id_negocio=u.id_negocio
  WHERE u.auth_user_id=(SELECT auth.uid()) AND
        u.id_negocio=vicora_arca_solicitudes_comercio.id_negocio AND
        u.rol='ADMINISTRADOR' AND u.estado='ACTIVO' AND n.estado='ACTIVO'
 )
)
WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.usuarios u
  JOIN public.negocios n ON n.id_negocio=u.id_negocio
  WHERE u.auth_user_id=(SELECT auth.uid()) AND
        u.id_negocio=vicora_arca_solicitudes_comercio.id_negocio AND
        u.rol='ADMINISTRADOR' AND u.estado='ACTIVO' AND n.estado='ACTIVO'
 )
);

CREATE FUNCTION public.vicora_arca_solicitud_metadata_20261121()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $f$
BEGIN
 IF TG_OP='UPDATE' AND NEW.id_negocio IS DISTINCT FROM OLD.id_negocio THEN
   RAISE EXCEPTION 'VICORA: no se permite mover la solicitud entre negocios' USING ERRCODE='42501';
 END IF;
 NEW.actualizada_en=clock_timestamp();
 IF NEW.estado='SOLICITADA' THEN
   IF TG_OP='INSERT' OR OLD.estado IS DISTINCT FROM 'SOLICITADA' THEN
     NEW.solicitada_en=clock_timestamp();
   ELSE NEW.solicitada_en=OLD.solicitada_en;
   END IF;
 ELSE
   NEW.solicitada_en=NULL;
 END IF;
 IF TG_OP='UPDATE' THEN NEW.creada_en=OLD.creada_en; END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.vicora_arca_solicitud_metadata_20261121() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER aa_vicora_arca_metadata
BEFORE INSERT OR UPDATE ON public.vicora_arca_solicitudes_comercio
FOR EACH ROW EXECUTE FUNCTION public.vicora_arca_solicitud_metadata_20261121();

-- Igual que los 23 módulos comerciales: la suscripción vencida solo consulta,
-- nunca inserta/edita datos. Utiliza guard existente, sin crear bypass.
CREATE TRIGGER zz_vicora_guardar_vigencia
BEFORE INSERT OR UPDATE OR DELETE ON public.vicora_arca_solicitudes_comercio
FOR EACH ROW EXECUTE FUNCTION public.vicora_guardar_vigencia_escritura_20261112();

COMMIT;