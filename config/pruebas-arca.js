/* Exclusivo de desarrollo-facturacion-arca. Bloquea antes de crear el cliente. */
(function () {
  'use strict';
  const ORIGINAL_REF = 'nxdimgzcsjnjjdfdpatp';
  // Dato público: reemplazar únicamente tras verificar la referencia de PRUEBAS.
  const EXPECTED_TEST_REF = 'fuwozgfxesspnstbklvt';

  function validar(config) {
    if (!/^[a-z0-9]{20}$/.test(EXPECTED_TEST_REF) || EXPECTED_TEST_REF === ORIGINAL_REF)
      throw new Error('PRUEBAS ARCA bloqueado: falta fijar la referencia verificada de VICORA-PRUEBAS-ARCA en config/pruebas-arca.js.');
    if (!config || typeof config.supabaseUrl !== 'string')
      throw new Error('PRUEBAS ARCA bloqueado: falta config/pruebas-arca.local.js.');
    let url;
    try { url = new URL(config.supabaseUrl); }
    catch (_) { throw new Error('PRUEBAS ARCA bloqueado: URL inválida.'); }
    if (url.origin !== `https://${EXPECTED_TEST_REF}.supabase.co` ||
        url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash)
      throw new Error('PRUEBAS ARCA bloqueado: solo se permite el proyecto de pruebas verificado.');
    if (typeof config.publishableKey !== 'string' ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey))
      throw new Error('PRUEBAS ARCA bloqueado: se requiere una clave pública sb_publishable_ del proyecto de pruebas. No se admiten claves secretas ni JWT heredados.');
    return Object.freeze({ url: url.origin, key: config.publishableKey });
  }

  let config, error;
  try { config = validar(window.VICORA_PRUEBAS_ARCA_LOCAL); }
  catch (e) { error = e; }

  // Defensa adicional del navegador para fetch, XHR y WebSocket, incluso fuera del cliente.
  // Sin configuración válida no se permite ninguna conexión de datos.
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = `connect-src ${config ? config.url : "'none'"}; form-action 'none'; object-src 'none'; base-uri 'self'`;
  document.head.appendChild(policy);
  const aviso = document.createElement('div');
  aviso.textContent = 'ENTORNO DE PRUEBAS ARCA · Sin validez fiscal';
  aviso.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#854d0e;color:white;text-align:center;font:700 12px Arial;padding:6px;pointer-events:none';
  document.body.appendChild(aviso);

  function crearCliente(sdk) {
    if (error) throw error;
    const nativeFetch = window.fetch.bind(window);
    const isolatedFetch = (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin !== config.url)
        return Promise.reject(new Error('PRUEBAS ARCA: conexión fuera del proyecto bloqueada.'));
      // Las funciones existentes incluyen cobros de suscripciones y envío de comprobantes.
      // No se habilitan durante esta etapa de aislamiento.
      if (url.pathname.startsWith('/functions/'))
        return Promise.reject(new Error('PRUEBAS ARCA: funciones de servidor deshabilitadas en etapa 1.'));
      return nativeFetch(input, { ...options, redirect: 'error' });
    };
    return sdk.createClient(config.url, config.key, {
      global: { fetch: isolatedFetch },
      auth: {
        storageKey: `vicora-pruebas-arca-${EXPECTED_TEST_REF}-auth`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    });
  }
  window.VicoraPruebasArca = Object.freeze({ crearCliente });
}());
