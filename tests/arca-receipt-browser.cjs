/* Actual Chromium, isolated synthetic HTTP only; never authorization evidence. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 let scenarios=0;
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:844}});const calls=[];
   let verified=true;
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!=='https://fiscal.invalid')throw Error('UNEXPECTED_EXTERNAL_REQUEST');
    calls.push([req.method(),url.pathname,req.postData()]);
    const value=url.pathname.endsWith('/capabilities')?{preparation_enabled:false,configuration_enabled:false,document_types:[],completion_enabled:false,can_send:false,runtime_enabled:false}:verified?{status:'AUTORIZADO_PROD_VERIFICADO',operation:'00000000-0000-4000-8000-000000000001',environment:'PRODUCCION',authorization_verified:true,document_available:true,receipt:{point:4,kind:11,number:7,cae:'12345678901234',expiry:'20261203',date:'2026-11-23'},can_send:false,runtime_enabled:false}:{status:'RESULTADO_INCIERTO',operation:'00000000-0000-4000-8000-000000000001',authorization_verified:false,document_available:false,can_send:false,runtime_enabled:false};
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(value)});
   });
   await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic receipt display only</title>');
   await page.evaluate(()=>{window.VICORA_ARCA_CONFIG={enabled:true,apiOrigin:'https://fiscal.invalid'};window.fixtureDb={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC_ONLY'}}})}};});
   await page.addScriptTag({path:path.resolve(__dirname,'../arca.js')});
   await page.evaluate(async()=>{await window.vicoraArcaInstalar({db:window.fixtureDb,role:'VENDEDOR'});await window.vicoraArcaConsultarEstado({saleRef:'SYNTHETIC_SALE'});});
   const dialog=page.locator('dialog[open]');assert.match(await dialog.innerText(),/Factura C 00004-00000007/);assert.match(await dialog.innerText(),/CAE: 12345678901234/);
   assert.equal(await dialog.getByRole('button',{name:'Descargar PDF A4',exact:true}).count(),1);
   const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'dialog must fit viewport');
   await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();verified=false;
   await page.evaluate(()=>window.vicoraArcaConsultarEstado({saleRef:'SYNTHETIC_SALE'}));
   assert.equal(await page.getByRole('button',{name:'Descargar PDF A4',exact:true}).count(),0);
   assert.match(await page.locator('dialog[open]').innerText(),/No reenviar/);
   assert.ok(calls.every(([method,path,body])=>(method==='GET'&&path.endsWith('/capabilities'))||(method==='POST'&&path.endsWith('/status')&&body===JSON.stringify({saleRef:'SYNTHETIC_SALE'}))),'status display must only call capabilities and the existing read-side status endpoint');
   scenarios++;await page.close();
  }
  console.log(JSON.stringify({status:'PASS',scenarios,real_browser:true,synthetic_only:true,mobile:true,desktop:true,commercial_writes:0,can_send:false,runtime_enabled:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
