# Corrección instalada: suscripción vencida bloqueaba ventas solo visualmente

**Fecha de aplicación:** 12 de noviembre de 2026. **Proyecto:** VICORA Comercial 1.0 (producción, no ARCA).

## Diagnóstico

Antes del cambio, `index.html` evaluaba la suscripción solo por `estado IN ('ACTIVA','PRUEBA')` y los permisos de `ventas`, `ventas_detalle` y la RPC `confirmar_venta` no exigían vencimiento vigente. La tarjeta de inicio, en cambio, sí mostraba `Vencida` según la fecha real.

Por lo tanto, una suscripción con `estado='ACTIVA'` y `proximo_vencimiento` pasado podía seguir creando y confirmando ventas.

## Corrección aplicada directamente

- **Frontend:** `index.html` conserva acceso de lectura a perfiles existentes aunque su suscripción esté vencida, suspendida o pendiente; muestra estado efectivo en `Mi suscripción`. La nueva `vicoraExigirSuscripcionVigente()` vuelve a consultar la base y exige fecha vigente para una nueva escritura.
- **Ventas:** `ventas.js` comprueba vigencia al abrir **Nueva venta** y otra vez justo antes de registrar. El servidor sigue siendo la autoridad: no confiar en el reloj del navegador para seguridad.
- **PostgreSQL:** se aplicó la migración `vicora_comercial_suscripciones_bloquear_escrituras_vencidas_20261112` con una función `SECURITY DEFINER` con `search_path=''`, sin `EXECUTE` para `PUBLIC/anon/authenticated`, y 23 triggers `BEFORE INSERT OR UPDATE OR DELETE` para tablas operativas. Incluye escrituras que realizan RPC `SECURITY DEFINER`. No cambia políticas RLS originales, tablas de administración, documentos previos, fechas, estados ni pagos.
- **Estado real vs etiqueta:** la columna `suscripciones.estado` no se reescribe automáticamente. El acceso se decide por **estado + fecha**; el campo histórico puede decir `ACTIVA` mientras la UI muestra correctamente `VENCIDA`.

## Regla vigente

Una operación comercial se autoriza solamente cuando el usuario y el negocio están `ACTIVO` y existe para `SIS-000001`:

- `estado='PRUEBA'` y `fecha_fin_prueba >= fecha en Argentina`, o
- `estado='ACTIVA'` y `proximo_vencimiento >= fecha en Argentina`.

Una fecha nula, estado `VENCIDA`, `SUSPENDIDA` o `PENDIENTE`, usuario/negocio inactivo o empresa diferente bloquean las escrituras. El último día cuenta como válido hasta terminar ese día en `America/Argentina/Buenos_Aires`.

Las lecturas siguen sujetas a RLS por usuario/empresa. Las tablas de pagos de suscripción, solicitudes de transferencia, `usuarios`, `negocios` y `suscripciones` quedan fuera de los triggers comerciales para permitir administración y renovación.

La excepción operativa del trigger es únicamente para conexiones SQL directas `session_user='postgres'` sin identidad de cliente o para `service_role` sin `auth.uid()`. Una cuenta personal que tenga el mismo correo que VICORA ADMIN no obtiene bypass.

## Verificaciones realizadas

1. **Preflight:** 23 tablas operativas existentes con `id_negocio`; no había triggers con el nombre elegido.
2. **Migración en Supabase:** `success=true`.
3. **Post-instalación:** 23/23 triggers presentes y habilitados; función con rol de seguridad restringido, zona horaria Argentina y ambas fechas.
4. **Reglas de fechas/estados:** 11 casos sintéticos en PostgreSQL, 11 PASS.
5. **Ejecución real del trigger:** tabla temporal + `auth.uid()` ficticio, `INSERT` rechazado con `42501`; resultado PASS sin escribir ningún registro productivo.
6. **Validación real del JavaScript extraído de `index.html`** con mocks de respuesta Supabase y fechas locales: 11 escenarios, 11 PASS.
7. **Sintaxis JS:** las 10 etiquetas `script` inline de `index.html` y `ventas.js` se analizaron sin errores.

## Cómo comprobar manualmente

1. Cerrá sesión en VICORA Comercial, recargá la página con `Ctrl+F5` e iniciá sesión.
2. Si la suscripción está vencida, en Inicio y Mi suscripción debe verse **Vencida**, pero debe continuar la navegación por el historial.
3. En Ventas, pulsar Nueva venta debe mostrar el aviso de suscripción vencida y evitar el formulario; no se genera ninguna venta.
4. Desde VICORA ADMIN, una renovación autorizada que actualice `proximo_vencimiento` permitirá volver a operar sin cambiar el correo, mientras el estado quede `ACTIVA`. El pago anticipado conserva la fecha de vencimiento vigente según la lógica administrativa existente.

**Precaución:** no hacer ventas ficticias de comprobación en producción si se puede verificar el bloqueo sin insertar datos. No se alteraron datos del negocio.

## Reversión técnica

La migración original y el rollback limitado a estos 23 triggers + función se conservaron en `DB/MIGRACIONES/`. Solo aplicar rollback ante fallo confirmado bajo revisión: devolvería la vulnerabilidad de que suscripciones vencidas puedan registrar operaciones. La interfaz se puede revertir mediante el historial GitHub, sin tocar VICORA ADMIN ni ARCA.
