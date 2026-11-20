# Supabase alojado — unión Auth + comercio + decisión fiscal (LAB, 18/11/2026)

**Se implementó realmente en `VICORA-PRUEBAS-ARCA` (Supabase `fuwozgfxesspnstbklvt`), NO en VICORA ADMIN productivo.**

Migración aplicada: `vicora_origin_hosted_auth_commercial_decision_lab_20261118`. SQL exacto recuperado de `supabase_migrations.schema_migrations.statements`: [supabase_origin_hosted_lab_20261118.sql](supabase_origin_hosted_lab_20261118.sql). Depende de la migración ya aprobada `vicora_arca_lab_managed_auth_session_read_bridge_20261118`.

## Qué funciona en la instancia alojada de pruebas

- Se creó `vicora_origin_hosted_lab` con **6 tablas aisladas** para negocios, miembros, suscripciones, ventas, renglones y decisiones; los datos son de ensayo y las tablas tienen RLS habilitado sin políticas para navegador.
- `vicora_origin_hosted_lab.prepare(subject, session, sale)` verifica primero **filas reales** de `auth.users/auth.sessions` mediante `vicora_arca_auth_bridge_lab.session_live` y toma bloqueos `FOR SHARE`. En la misma transacción comprueba membresía/rol, negocio activo, suscripción vigente (fecha Argentina), venta confirmada y suma de renglones.
- Persiste una decisión de preparación por negocio/venta, con UUID único y huella de cabecera y líneas; reintentar conserva el UUID, cambiar la venta se rechaza.
- Devuelve **`PREPARADO_NO_EMITIDO`, `can_send=false`, `runtime_enabled=false`**. No invoca R100, servicios fiscales, ARCA, caja o movimientos de stock.
- El esquema y función no se exponen a `anon`, `authenticated`, `service_role` ni `PUBLIC`; el único permiso de la aplicación es EXECUTE para `vicora_fiscal_preparer_lab`, sin lectura directa de Auth, ventas ni decisiones.

## Pruebas alojadas realizadas

1. Con sesión Auth LAB vigente, preparación de venta comercial de ensayo → decisión única.
2. Segundo intento igual → **mismo decision_id** y ninguna duplicación.
3. Sesión inexistente → denegada.
4. Miembro inactivo → denegado.
5. Suscripción vencida → denegada.
6. Importe de venta alterado → denegado; decisión anterior no se sobrescribe.
7. Decisión permanece en preparación, sin permiso para emitir.
8. **Ensayo ejecutado bajo `current_user=vicora_fiscal_preparer_lab`:** operación `prepare` devuelve decisión correcta sin SELECT directo de Auth ni tablas de decisiones. Para comprobar `SET ROLE`, la sesión administradora hizo temporalmente `GRANT vicora_fiscal_preparer_lab TO postgres WITH SET TRUE` dentro de una transacción **con `ROLLBACK` al final**; no es un grant persistente ni una nueva credencial.
9. Los datos de ensayo se crearon dentro de transacciones explícitas con `ROLLBACK`. Tras la primera batería se verificó 0 negocios de ensayo, 0 ventas y 0 decisiones. La prueba de rol restringido también terminó con `ROLLBACK`.
10. La prueba del helper gestionado anterior verificó 4/4 sesiones vigentes, sin exponer las tablas Auth.

Un intento de comprobación extra de privilegios que usaba el nombre textual `auth.sessions` bajo el rol sin USAGE del esquema recibió `permission denied for schema auth`: era el **instrumento de prueba** que intentaba resolver ese nombre, no el helper. Se aisló: llamada independiente al helper con el mismo rol → true; operación completa `prepare` bajo el mismo rol → preparada. No se concedió USAGE de Auth para acomodar esa consulta.

## Límites y seguridad

**Este ensayo no equivale a conectar VICORA Comercial real.** Las seis tablas son una **copia sintética**, no las tablas productivas con sus RPC, triggers y políticas. No se comprobó la firma JWT de extremo a extremo en esta prueba SQL; la identidad se pasó como parámetro del ensayo. El futuro servidor debe verificar firma, issuer, audience, expiración y `sub/session_id` antes de invocar el procedimiento, y nunca aceptar identidad o negocio elegidos por navegador. Un rol SQL comprometido que conozca identificadores no queda criptográficamente autenticado dentro del procedimiento.

La función corre como `SECURITY DEFINER` de `postgres` (rol de amplios privilegios) en LAB: sus privilegios requieren auditoría y una revisión de delegación mínima antes de cualquier promoción. No se han validado todavía contra Supabase/Auth alojado los eventos reales de logout/ban/delete/refresh simultáneos, el perfil fiscal del emisor, bindings R100, TLS/HTTPS ni Contabo.

## Qué falta sin repetir desarrollos

1. Adaptar el procedimiento a **las tablas comerciales reales** y revisar los escritores/triggers de VICORA, sin reutilizar la fixture como migración de producción.
2. Verificar JWT del servidor y sesión con identidad real en un circuito HTTPS, con usuario y venta de prueba autorizados; probar revocación y escrituras concurrentes, RLS/ACL y reversión.
3. Aprobar una migración productiva específica y reversible; conectar binding R100 y Contabo existentes, y autorizar homologación fiscal separada por emisor.

**No modificar ni desplegar producción por esta evidencia.** Estado: unión **operativa y probada en Supabase alojado de LAB**, emisión fiscal real **desactivada**.
