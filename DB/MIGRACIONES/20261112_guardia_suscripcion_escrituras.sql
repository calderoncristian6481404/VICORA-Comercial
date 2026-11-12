-- VICORA Comercial 1.0 — bloqueo por vencimiento de la suscripcion; 2026-11-12
-- Exclusivamente tablas operativas. NO modifica suscripciones, pagos,
-- solicitudes de renovacion, VICORA ADMIN, ni ningun dato historico.
-- El estado ACTIVA sin fecha valida NO concede operaciones de escritura.
-- Mantiene lecturas RLS existentes para consultar historiales/renovar.
-- Triggers cubren REST, SQL y RPC SECURITY DEFINER (RLS por si solo no basta).
--
-- Unica excepcion de mantenimiento: llamadas de service_role sin usuario JWT
-- o conexiones SQL privilegiadas directas postgres sin usuario JWT.
-- Un usuario comercial, incluso si usa el mismo email que ADMIN, no saltea esto.

CREATE FUNCTION public.vicora_guardar_vigencia_escritura_20261112()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  v_negocio text;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_usuario uuid := auth.uid();
BEGIN
  -- Administracion interna del sistema, nunca una sesion de negocio.
  IF v_usuario IS NULL AND (
      session_user = 'postgres' OR auth.role() = 'service_role'
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'VICORA: inicia sesion para realizar esta operacion.'
      USING ERRCODE='42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_negocio := OLD.id_negocio;
  ELSE
    v_negocio := NEW.id_negocio;
  END IF;

  IF v_negocio IS NULL OR btrim(v_negocio) = '' THEN
    RAISE EXCEPTION 'VICORA: negocio no identificado.' USING ERRCODE='42501';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id_negocio IS DISTINCT FROM NEW.id_negocio THEN
    RAISE EXCEPTION 'VICORA: no se permite trasladar registros entre negocios.'
      USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.negocios n ON n.id_negocio=u.id_negocio
    WHERE u.auth_user_id=v_usuario
      AND u.id_negocio=v_negocio
      AND upper(btrim(u.estado))='ACTIVO'
      AND upper(btrim(n.estado))='ACTIVO'
  ) THEN
    RAISE EXCEPTION 'VICORA: usuario o negocio sin autorizacion vigente.'
      USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.suscripciones s
    WHERE s.id_negocio=v_negocio
      AND s.id_sistema='SIS-000001'
      AND (
        (upper(btrim(s.estado))='PRUEBA'
          AND s.fecha_fin_prueba IS NOT NULL
          AND s.fecha_fin_prueba >= v_hoy)
        OR
        (upper(btrim(s.estado))='ACTIVA'
          AND s.proximo_vencimiento IS NOT NULL
          AND s.proximo_vencimiento >= v_hoy)
      )
  ) THEN
    RAISE EXCEPTION 'VICORA: suscripcion vencida o no habilitada. Podes consultar tu historial y renovar desde Mi suscripcion.'
      USING ERRCODE='42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$f$;

REVOKE ALL ON FUNCTION public.vicora_guardar_vigencia_escritura_20261112()
  FROM PUBLIC, anon, authenticated;

-- 23 tablas con movimientos operativos. Se excluyen las de administracion,
-- suscripciones, planes y solicitudes de pago, para permitir renovaciones.
DO $guard$
DECLARE
  t text;
  tablas text[] := ARRAY['cajas','clientes','cobros_clientes','compras','compras_contadores','compras_detalle','cuentas_cobrar','devoluciones_compras','devoluciones_detalle','devoluciones_ventas','gastos','movimientos_caja','movimientos_stock','pagos_proveedores','presupuestos','presupuestos_detalle','productos','productos_contadores','proveedores','proveedores_contadores','ventas','ventas_contadores','ventas_detalle'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass(format('public.%I',t)) IS NULL THEN
      RAISE EXCEPTION 'Tabla operativa ausente: %',t;
    END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_trigger x
      WHERE x.tgrelid=to_regclass(format('public.%I',t))
        AND x.tgname='zz_vicora_guardar_vigencia'
        AND NOT x.tgisinternal
    ) THEN
      RAISE EXCEPTION 'Trigger ya existente, revisar manualmente: %',t;
    END IF;
    EXECUTE format(
      'CREATE TRIGGER zz_vicora_guardar_vigencia BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vicora_guardar_vigencia_escritura_20261112()',
      t
    );
  END LOOP;
END
$guard$;
