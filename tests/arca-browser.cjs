/* Local-only cross-repository browser acceptance. Server issues synthetic JWTs. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const origin=process.argv[2],u=new URL(origin);if(u.protocol!=='https:'||u.hostname!=='127.0.0.1')throw new Error('LOOPBACK_LAB_ONLY');
 const browser=await chromium.launch({headless:true,executablePath:process.env.VICORA_LAB_CHROMIUM||chromium.executablePath()});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}); // synthetic local TLS certificate only
  page.on('response',r=>{if(r.url().includes('/v1/'))console.error('LAB_HTTP:'+r.status()+':'+new URL(r.url()).pathname);});
  await page.goto(origin);await page.waitForFunction(()=>typeof window.vicoraArcaIniciarEmision==='function');
  await page.locator('#vicoraArcaConfiguracion').click();
  await page.locator('input[name=issuer]').fill('20000000001');await page.locator('select[name=condition]').selectOption('MONOTRIBUTO');
  await page.locator('input[name=point]').fill('321');await page.locator('input[name=enabled]').check();await page.locator('input[name=password]').fill('SYNTHETIC_PASSWORD');
  await page.getByRole('button',{name:'Guardar solicitud'}).click();await page.getByRole('status').filter({hasText:'Solicitud guardada'}).waitFor();
  assert.equal(await page.locator('input[name=password]').inputValue(),'');await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.evaluate(async()=>{await Promise.all([venGuardar(),venGuardar()]);});
  assert.deepEqual(await page.evaluate(()=>window.counts),{sales:1,details:1,confirm:1,stock:1,cash:1});
  await page.locator('#venElegirArca').click();await page.getByRole('heading',{name:'Factura preparada, no emitida'}).waitFor();
  assert.ok((await page.locator('dialog').innerText()).includes('Tipo C'));assert.ok((await page.locator('dialog').innerText()).includes('No hay CAE verificado'));
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.evaluate(async()=>{await venEmitirFiscalDesdeVenta('SALE');});
  assert.deepEqual(await page.evaluate(()=>window.counts),{sales:1,details:1,confirm:1,stock:1,cash:1});
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.evaluate(()=>{window.VICORA_ARCA_UI_HABILITADA=false;});
  assert.equal(await page.evaluate(()=>venArcaDisponible()),false);
  console.log(JSON.stringify({status:'PASS',scenarios:1,real_browser:true,synthetic_auth:true,mobile_viewport:true,commercial_confirmations:1,can_send:false,runtime_enabled:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
