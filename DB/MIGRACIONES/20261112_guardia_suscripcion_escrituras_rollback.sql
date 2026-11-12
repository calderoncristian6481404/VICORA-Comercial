-- Rollback SOLO de la proteccion de vigencia instalada el 12/11/2026.
-- No altera datos, politicas RLS ni funciones originales de VICORA.
DO $undo$
DECLARE t text;
  tablas text[] := ARRAY['cajas','clientes','cobros_clientes','compras','compras_contadores','compras_detalle','cuentas_cobrar','devoluciones_compras','devoluciones_detalle','devoluciones_ventas','gastos','movimientos_caja','movimientos_stock','pagos_proveedores','presupuestos','presupuestos_detalle','productos','productos_contadores','proveedores','proveedores_contadores','ventas','ventas_contadores','ventas_detalle'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_vicora_guardar_vigencia ON public.%I',t);
  END LOOP;
END $undo$;
DROP FUNCTION IF EXISTS public.vicora_guardar_vigencia_escritura_20261112();
