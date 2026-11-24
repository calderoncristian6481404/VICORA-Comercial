'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {client}=require('../arca.js');
const operation='00000000-0000-4000-8000-000000000001',body={saleRef:'SALE'};
const db={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC_SESSION'}}})}};
const caps={completion_enabled:true,completion_mode:'LAB_TLS',preparation_enabled:true,configuration_enabled:false,document_types:[11],can_send:false,runtime_enabled:false};
const uncertain={status:'RESULTADO_INCIERTO',operation,environment:'LAB_TLS',authorization_verified:false,document_available:false,can_send:false,runtime_enabled:false};
// Deliberately synthetic: never a CAE issued by ARCA.
const fixtureReceipt={point:4,kind:11,number:1,cae:'12345678901234',expiry:'20261215',date:'2026-11-24'};
function api(fn){return client({db,apiOrigin:'https://fiscal.invalid',fetchImpl:fn});}
function ok(x){return {ok:true,json:async()=>x};}
test('emitter-wide configuration is queried, not supplied or enabled for each sale',async()=>{
 const calls=[];const c=api(async(url,o)=>{calls.push([url,o]);return ok(url.endsWith('/capabilities')?caps:uncertain);});
 assert.equal((await c.requestAuthorization(body)).status,'RESULTADO_INCIERTO');assert.equal(calls.length,2);
 assert.deepEqual(JSON.parse(calls[1][1].body),body);assert.ok(calls.every(([url,o])=>!url.includes('SYNTHETIC')&&o.credentials==='omit'));
 await assert.rejects(c.requestAuthorization({...body,enabled:true}));assert.equal(calls.length,2);
});
test('OFF commerce cannot request emission, and ticket/prepare need no completion switch',async()=>{
 let posts=0;const c=api(async(url,o)=>{if(o.method==='POST')posts++;return ok({...caps,completion_enabled:false,completion_mode:'OFF'});});
 await assert.rejects(c.requestAuthorization(body));assert.equal(posts,0);
});
test('uncertain status never requests again and never downloads a mock document',async()=>{
 const calls=[];const c=api(async(url,o)=>{calls.push(url);return ok(url.endsWith('/capabilities')?caps:uncertain);});
 await c.requestAuthorization(body);await assert.rejects(c.document(body,'A4'));assert.equal(calls.filter(x=>x.endsWith('/request')).length,1);assert.equal(calls.filter(x=>x.endsWith('/document')).length,0);
});
test('simulated or browser-forged fiscal flags cannot enable document download',async()=>{
 for(const forged of [{...uncertain,status:'DEMO_CONCILIADO_NO_FISCAL',document_available:true},{...uncertain,status:'AUTORIZADO_HOMO_VERIFICADO',environment:'LAB_TLS',authorization_verified:true},{...uncertain,status:'AUTORIZADO'}])await assert.rejects(api(async()=>ok(forged)).status(body));
});
test('concurrent invoice requests share POST while backend retains durable idempotency',async()=>{
 let posts=0;const c=api(async(url,o)=>{if(url.endsWith('/capabilities'))return ok(caps);posts++;await new Promise(r=>setTimeout(r,5));return ok(uncertain);});
 await Promise.all([c.requestAuthorization(body),c.requestAuthorization(body)]);assert.equal(posts,1);
});
test('explicit reconciliation calls only read-side coordinator endpoint',async()=>{
 const calls=[];const c=api(async(url)=>{calls.push(url);return ok(url.endsWith('/capabilities')?caps:uncertain);});
 await c.reconcile(body);assert.ok(calls[1].endsWith('/reconcile'));assert.ok(!calls.some(x=>x.endsWith('/request')||x.endsWith('/emit')));
});
test('synthetic fixture exercises PDF MIME/header recheck, not an authentic CAE claim',async()=>{
 const state={...uncertain,status:'AUTORIZADO_HOMO_VERIFICADO',environment:'HOMOLOGACION',authorization_verified:true,document_available:true};
 const c=api(async(url,o)=>url.endsWith('/status')?ok(state):({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['%PDF-SYNTHETIC-NOT-A-FISCAL-DOCUMENT'])}));
 assert.equal((await c.document(body,'80mm')).type,'');await assert.rejects(c.document(body,'OTHER'));
});

test('real production CAE is downloadable only with matching independently verified status',async()=>{
 const verified={status:'AUTORIZADO_PROD_VERIFICADO',operation,environment:'PRODUCCION',authorization_verified:true,document_available:true,receipt:fixtureReceipt,can_send:false,runtime_enabled:false};
 const calls=[];const c=api(async(url,opts)=>{
  calls.push(url);
  if(url.endsWith('/status'))return ok(verified);
  if(url.endsWith('/document'))return {ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['%PDF-VERIFIED-FIXTURE-ONLY'])};
  throw Error('UNEXPECTED_ROUTE');
 });
 const result=await c.document(body,'A4');assert.equal(result.type,'');assert.deepEqual(calls.map(x=>x.split('/').at(-1)),['status','document']);
 for(const forged of [
  {...verified,receipt:undefined},
  {...verified,receipt:{...fixtureReceipt,cae:'0'.repeat(14)}},
  {...verified,receipt:{...fixtureReceipt,kind:99}},
  {...verified,receipt:{...fixtureReceipt,number:0}},
  {...verified,receipt:{...fixtureReceipt,date:'2026-02-30'}},
  {...verified,receipt:{...fixtureReceipt,expiry:'20260230'}},
  {...verified,receipt:{...fixtureReceipt,untrusted:'x'}},
  {...verified,environment:'HOMOLOGACION'},
  {...verified,authorization_verified:false},
  {...verified,document_available:false},
  {...verified,status:'CONSULTA_REGISTRADA'},
  {...verified,status:'PENDIENTE_CONCILIACION'},
 ])await assert.rejects(api(async()=>ok(forged)).document(body,'A4'));
});
test('production mode only sends an existing saleRef; never allows direct reserve/emit',async()=>{
 const prod={...caps,completion_mode:'PRODUCCION'};
 const pending={...uncertain,status:'PENDIENTE_CONCILIACION',environment:'PRODUCCION'};
 const calls=[];const c=api(async(url,opts)=>{calls.push([url,opts]);return ok(url.endsWith('/capabilities')?prod:pending);});
 assert.equal((await c.requestAuthorization(body)).status,'PENDIENTE_CONCILIACION');
 assert.equal((await c.reconcile(body)).status,'PENDIENTE_CONCILIACION');
 assert.deepEqual(calls.filter(v=>v[1].body).map(v=>JSON.parse(v[1].body)),[body,body]);
 assert.equal(calls.filter(v=>/\/(emit|reserve)$/.test(v[0])).length,0);
 assert.equal(calls.filter(v=>/\/request$/.test(v[0])).length,1);
});

test('verified-production flags without exact receipt never permit PDF or status',async()=>{
 const incomplete={status:'AUTORIZADO_PROD_VERIFICADO',operation,environment:'PRODUCCION',authorization_verified:true,document_available:true,can_send:false,runtime_enabled:false};
 let downloads=0;
 const c=api(async(url)=>{if(url.endsWith('/document'))downloads++;return ok(incomplete);});
 await assert.rejects(c.status(body),/comprobante fiscal de producción/);
 await assert.rejects(c.document(body,'A4'),/comprobante fiscal de producción/);
 assert.equal(downloads,0);
});
