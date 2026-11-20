# Resultado probado en Supabase gestionado — Auth privado, 18/11/2026

**Proyecto intervenido:** `VICORA-PRUEBAS-ARCA` (`fuwozgfxesspnstbklvt`), NO `VICORA ADMIN` productivo (`nxdimgzcsjnjjdfdpatp`).

## Modificación REAL ejecutada

Migration `vicora_arca_lab_managed_auth_session_read_bridge_20261118` aplicada correctamente por Supabase en LAB. Código exacto y rollback: `server/review/supabase_managed_auth_lab_bridge_20261118.sql`.

Se creó el esquema PRIVADO `vicora_arca_auth_bridge_lab` con la función `session_live(uuid,uuid)`:

- SECURITY DEFINER, owner real `postgres` del proyecto LAB, `search_path=pg_catalog`; timeout 2.5 s / lock timeout 750 ms. No escribir ni alterar tablas de Auth.
- Lee `auth.users` + `auth.sessions` reales del Supabase gestionado, verifica relación `user_id`, `deleted_at`, `banned_until`, `not_after` y adquiere `FOR SHARE` sobre ambas filas.
- EXECUTE revocado de PUBLIC/anon/authenticated/service_role; solo `vicora_fiscal_preparer_lab` tiene USAGE de esquema y EXECUTE específico. Ese login conserva **SIN SELECT** sobre `auth.users`/`auth.sessions`.
- No hay secreto/certificado/usuario nuevo, nuevos GRANT sobre Auth, cambio de owner/RLS, cambio de trigger, tabla comercial, perfil fiscal o documento.

## Comprobaciones ejecutadas directamente en LAB (consultas SQL, sin secretos)

- Resultado de migración Supabase: `success=true`.
- Hay 2 usuarios y 4 sesiones en Auth LAB. **4/4 pares de sesión vigentes** devolvieron TRUE; cero falsos negativos en ese conjunto.
- Par de UUID inexistentes: FALSE. Parámetros NULL: FALSE.
- `anon`, `authenticated`, `service_role`: sin permiso de esquema ni ejecución de la función.
- `vicora_fiscal_preparer_lab`: permiso de esquema y ejecución TRUE; SELECT directo de Auth usuarios/sesiones FALSE.
- El catálogo confirma SECURITY DEFINER true, owner `postgres`, rutas `search_path=pg_catalog`, límites de tiempo; antes/después, 2 usuarios Auth, no se modificaron.
- Security Advisor posterior: sin una alerta nueva que cite el esquema creado; conserva alertas anteriores de laboratorio (tablas RLS sin políticas) y protección de contraseñas filtradas deshabilitada.
- **Límite:** la llamada con sesiones se ejecutó usando la conexión administradora del SQL editor; se validaron permisos concedidos mediante catálogo, pero NO se realizó una conexión de red autenticada con el login restringido para repetir la llamada. No afirmar esa prueba como completada.

## Qué demuestra y qué NO

**Sí demuestra:** Supabase managed Auth admite en este proyecto una función privada que lee y bloquea filas reales de sesión, sin dar SELECT directo al login de preparación ni afectar las tablas Auth. Supera el obstáculo de la fixture puramente sintética para la parte de lectura/lock de identidad.

**NO demuestra todavía:** el contrato completo venta + rol + membresía + suscripción + decisión durable en la misma transacción; JWT real validado por gateway; permiso de escritura de outbox; coordinación contra logout/ban/delete bajo carga/HA; política de inactivity/single-session/refresh; la seguridad y disponibilidad de un definer privilegiado `postgres` en VICORA ADMIN; ni aceptación HTTPS/Contabo/ARCA.

**Precaución:** el owner postgres del helper tiene BYPASSRLS. Aunque no se entrega al login de aplicación y el cuerpo SQL es fijo, esta excepción privilegiada necesita revisión formal de amenaza y garantía contra confused-deputy antes de promoverse. La función devuelve una comprobación de sesión, NO una autorización fiscal. El servidor debe verificar criptográficamente JWT y luego establecer identidad de origen. El código experimental `server/lab/origin_schema.sql` de PR #4 no es una migración válida de Supabase real.

## Próximos pasos mínimos (sin repetir pruebas históricas)

1. Adaptar la decisión comercial durable al esquema real de VICORA, manteniendo el helper Auth en un esquema privado y con permisos EXECUTE-only separados de gateway/materializador. Probar en LAB de forma completa con escritor comercial y logout/revocación del Auth alojado; revisar costos de locks y variantes Auth. No modificar aún producción.
2. Preparar y auditar una migración **reversible específica** para VICORA ADMIN; no usar roles propietarios sintéticos ni conceder `postgres`/service_role al servidor. Llevar la excepción SECURITY DEFINER a revisión específica antes de aplicarla en producción.
3. Una vez validada, instalar en forma controlada, conectar HTTPS/Contabo y R100, aceptar con comercios de prueba autorizados. ARCA permanece disabled hasta homologación y autorización independiente.

Estado: **puente de verificación de Auth real instalado y probado en Supabase LAB, integración fiscal completa aún NO instalada ni habilitada.**
