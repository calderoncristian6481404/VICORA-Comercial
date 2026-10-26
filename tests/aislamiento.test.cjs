'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'config/pruebas-arca.js'), 'utf8');
const testRef = 'fuwozgfxesspnstbklvt'; // Nunca se contacta: fetch y cliente simulados.
const originalRef = 'nxdimgzcsjnjjdfdpatp';
function entorno(config) {
  const metas = [], requests = [], clients = [];
  const context = {
    URL,
    window: {
      VICORA_PRUEBAS_ARCA_LOCAL: config,
      fetch: async (...args) => { requests.push(args); return { ok: true }; }
    },
    document: {
      createElement: () => ({ style: {} }),
      head: { appendChild: el => metas.push(el) },
      body: { appendChild: () => {} }
    }
  };
  // Ejecutar exactamente el código guardado, sin reemplazar referencias.
  vm.runInNewContext(source, context);
  const sdk = { createClient: (...args) => { clients.push(args); return args; } };
  return { ...context, metas, requests, clients, crear: () => context.window.VicoraPruebasArca.crearCliente(sdk) };
}
const valido = { supabaseUrl: `https://${testRef}.supabase.co`, publishableKey: 'sb_publishable_ficticia_sin_red' };
test('configuración ausente o incompleta bloquea antes de createClient', () => {
  for (const config of [undefined, null, {}, { supabaseUrl: valido.supabaseUrl }]) {
    const e = entorno(config);
    assert.throws(e.crear, /bloqueado/);
    assert.equal(e.clients.length, 0);
    assert.equal(e.requests.length, 0);
    assert.match(e.metas[0].content, /connect-src 'none'/);
  }
});
test('producción, proyectos ajenos y URLs manipuladas quedan bloqueados', () => {
  for (const url of [
    `https://${originalRef}.supabase.co`, 'https://otro.supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co',
    `http://${testRef}.supabase.co`, `https://${testRef}.supabase.co.ejemplo.invalid`,
    `https://usuario@${testRef}.supabase.co`, `https://${testRef}.supabase.co/ruta`,
    `https://${testRef}.supabase.co?project=${originalRef}`, 'URL_INVALIDA'
  ]) {
    const e = entorno({ ...valido, supabaseUrl: url });
    assert.throws(e.crear, /bloqueado/);
    assert.equal(e.clients.length, 0);
    assert.equal(e.requests.length, 0);
    assert.match(e.metas[0].content, /connect-src 'none'/);
  }
  assert.ok(source.includes(`const ORIGINAL_REF = '${originalRef}';`));
  assert.ok(source.includes('EXPECTED_TEST_REF === ORIGINAL_REF'));
});
test('rechaza claves secretas, heredadas y marcadores', () => {
  for (const key of ['sb_secret_ficticia', 'service_role', 'eyJ.fake.jwt', '', 'CLAVE_PUBLICA_PENDIENTE']) {
    const e = entorno({ ...valido, publishableKey: key });
    assert.throws(e.crear, /clave pública/);
    assert.equal(e.clients.length, 0);
    assert.equal(e.requests.length, 0);
    assert.match(e.metas[0].content, /connect-src 'none'/);
  }
});
test('cliente usa solo pruebas y almacenamiento separado', () => {
  const e = entorno(valido); e.crear();
  const [url, key, options] = e.clients[0];
  assert.equal(url, valido.supabaseUrl);
  assert.equal(key, valido.publishableKey);
  assert.equal(options.auth.storageKey, `vicora-pruebas-arca-${testRef}-auth`);
  assert.equal(options.auth.detectSessionInUrl, false);
  assert.equal(e.clients.length, 1);
  assert.equal(e.requests.length, 0);
  assert.equal(e.metas[0].content, `connect-src https://${testRef}.supabase.co; form-action 'none'; object-src 'none'; base-uri 'self'`);
});
test('fetch bloquea producción, funciones y redirecciones; solo usa mock local', async () => {
  const e = entorno(valido); e.crear();
  const fetch = e.clients[0][2].global.fetch;
  await assert.rejects(fetch(`https://${originalRef}.supabase.co/rest/v1/ventas`), /bloqueada/);
  await assert.rejects(fetch('https://abcdefghijklmnopqrst.supabase.co/rest/v1/ventas'), /bloqueada/);
  await assert.rejects(fetch(`${valido.supabaseUrl}/functions/v1/vicora-mp-crear-suscripcion`), /deshabilitadas/);
  assert.equal(e.requests.length, 0);
  await fetch(`${valido.supabaseUrl}/auth/v1/user`, { redirect: 'follow' });
  assert.equal(e.requests.length, 1);
  assert.equal(e.requests[0][1].redirect, 'error');
});
test('ambas páginas cargan la protección y no conservan conexión ni acceso productivos', () => {
  for (const file of ['index.html', 'VICORA_Comercial_Mi_Suscripcion_PREPARACION.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!html.includes(originalRef));
    assert.ok(!html.includes('github.io/vicora-acceso/'));
    assert.ok(!html.includes('sb_publishable_4Lby'));
    assert.ok(html.indexOf('config/pruebas-arca.js') < html.indexOf('@supabase/supabase-js'));
    assert.match(html, /if\(!window.VicoraPruebasArca\)throw/);
    assert.match(html, /db=window.VicoraPruebasArca.crearCliente/);
    assert.ok(!html.includes('supabase.createClient('));
  }
});
