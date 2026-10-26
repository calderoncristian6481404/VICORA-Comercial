# Etapa 1: aislamiento de VICORA-PRUEBAS-ARCA

Cambios locales en `work`, destinados exclusivamente a `desarrollo-facturacion-arca`.
No publicar estas páginas en el sitio de VICORA 1.0. No integrar en `main`.
No se crearon migraciones ni se cambió ninguna base de datos.

## Estado inicial: bloqueado

El nombre de un proyecto no permite deducir su URL. Falta verificar su referencia
pública (20 caracteres) y obtener su clave pública `sb_publishable_`.
Sin esos datos el cliente Supabase no se crea y la política de conexiones es
`connect-src 'none'`. No hay fallback a producción.

## Configuración pendiente

1. Confirmar en el panel que la referencia corresponde a VICORA-PRUEBAS-ARCA.
2. Reemplazar `EXPECTED_TEST_REF` en `config/pruebas-arca.js` por esa referencia
   pública verificada. Este valor fija el único destino admitido.
3. Copiar `config/pruebas-arca.local.example.js` a
   `config/pruebas-arca.local.js` y completar URL y clave pública de ese proyecto.
   El archivo local está ignorado por Git. Un 404 de ese archivo antes de
   configurarlo es esperado y deja bloqueado el inicio.
4. Revisar el circuito de autenticación de pruebas antes de usar la aplicación.
   No existe todavía una pantalla de login de pruebas ni se reutiliza VICORA Acceso
   publicado. Reintentar y cerrar sesión permanecen en esta misma página.

La clave pública puede estar en el navegador por diseño; la autorización depende
de RLS. No colocar service_role, sb_secret_, JWT privilegiados, certificados ni
claves privadas en ninguno de estos archivos, incluso en el archivo ignorado.
Este desarrollo acepta solamente el formato moderno sb_publishable_.

## Protecciones

- Ambas páginas HTML usan el mismo guardián antes de crear Supabase.
- Solo se acepta HTTPS y el host exacto fijado; sin rutas, credenciales ni parámetros.
- El proyecto original está expresamente prohibido, incluso como referencia esperada.
- Sesiones aisladas mediante `vicora-pruebas-arca-<referencia>-auth`.
- Sin importación automática de sesión desde la URL ni redirección al acceso original.
- Política CSP de conexión restringida al proyecto validado; WebSocket no habilitado.
- El fetch del cliente rechaza otros destinos y redirecciones HTTP.
- Funciones de servidor deshabilitadas en esta etapa, incluidas las funciones existentes
  de suscripciones y envío de comprobantes. Su uso requiere revisión posterior.
- Aviso visible de pruebas sin validez fiscal.

La CSP requiere un navegador que la implemente y se aplica desde que se carga el
guardián. No reemplaza RLS ni protege frente a alguien que modifique el código.
La clave publishable moderna no identifica por sí sola el proyecto de forma
verificable sin red: su pertenencia debe comprobarse en el panel al configurar.

## Verificación local sin red

Ejecutar `node --test tests/aislamiento.test.cjs`.
Los clientes, fetch y DOM son simulados. No se contacta Supabase ni ARCA.
La referencia ficticia se reemplaza solo en memoria durante las pruebas.
El comportamiento efectivo de CSP en navegador y el login de pruebas quedan
pendientes; no se ejecutó la aplicación contra servicios remotos.

## Git y siguientes pasos

No se hicieron commits, pushes, despliegues ni cambios en referencias de main.
Antes de trasladar el trabajo, actualizar las referencias remotas por el canal
autorizado y comparar work con desarrollo-facturacion-arca. Aplicar únicamente
estos cambios sobre la base revisada, resolviendo diferencias; no asumir que las
ramas tienen el mismo contenido. Revisar automatizaciones antes de cualquier push.

También falta habilitar en la política de red el host del proyecto de pruebas,
revisar usuarios/perfiles/suscripciones y confirmar el esquema/RLS de ese proyecto.
No importar datos productivos ni ejecutar pruebas de escritura durante esta etapa.
La información aportada sobre restricciones y confirmar_venta se toma como
verificada por el equipo; no se volvió a consultar Supabase.
