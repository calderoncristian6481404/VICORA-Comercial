/* Synthetic HTTP only. No commercial writes or fiscal network. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {client}=require('../arca.js');
function fixture(handler){const calls=[];const api=client({db:{auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC_ONLY'}}})}},apiOrigin:'https://fiscal.invalid',fetchImpl:async(url,opts)=>{const path=url.split('/').at(-1);calls.push([path,opts]);return {ok:true,json:async()=>({can_send:false,runtime_enabled:false,...(path==='capabilities'?{preparation_enabled:true,configuration_enabled:false,document_types:[1,6,11]}:{}),...await handler(path,opts)})};}});return {api,calls};}
const pending={status:'PENDIENTE_CONCILIACION',environment:'PRODUCCION',authorization_verified:false,document_available:false};
const verified={status:'AUTORIZADO_PROD_VERIFICADO',environment:'PRODUCCION',authorization_verified:true,document_available:true,receipt:{point:4,kind:11,number:1,cae:'11111111111111',expiry:'20261203',date:'2026-11-26'}};
test('timeout never repeats POST; status and independent reconciliation only',async()=>{
 const {api,calls}=fixture(path=>{if(path==='capabilities')return {completion_enabled:true,completion_mode:'PRODUCCION'};if(path==='request')throw new TypeError('SYNTHETIC_TIMEOUT');if(path==='status')return pending;if(path==='reconcile')return verified;throw Error('UNEXPECTED');});
 const result=await api.authorizeAndConfirm({saleRef:'SYNTHETIC-SALE'});assert.equal(result.status,verified.status);assert.equal(calls.filter(x=>x[0]==='request').length,1);assert.deepEqual(calls.map(x=>x[0]),['capabilities','request','status','capabilities','reconcile']);
});
test('continued uncertainty performs at most three reads and never another issuance',async()=>{
 const {api,calls}=fixture(path=>path==='capabilities'?{completion_enabled:true,completion_mode:'PRODUCCION'}:pending);const result=await api.authorizeAndConfirm({saleRef:'SYNTHETIC-SALE'});assert.equal(result.status,pending.status);assert.equal(calls.filter(x=>x[0]==='request').length,1);assert.equal(calls.filter(x=>x[0]==='reconcile').length,3);
});
test('malformed or unverified receipt cannot become printable fiscal data',async()=>{
 for(const row of [{...verified,receipt:{...verified.receipt,number:true}},{...verified,receipt:{...verified.receipt,cae:'PRIVATE'}},{...verified,authorization_verified:false},{...pending,receipt:verified.receipt}]){
  const {api}=fixture(()=>row);await assert.rejects(api.status({saleRef:'SYNTHETIC-SALE'}));
 }
});
test('tax setup carries neither tenant nor role; authenticated server derives scope',async()=>{
 const {api,calls}=fixture(()=>({version:2,data:{receivers:{},products:{}}}));await api.saveTaxSettings(1,{receivers:{},products:{}});assert.deepEqual(JSON.parse(calls[0][1].body),{version:1,data:{receivers:{},products:{}}});assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].redirect,'error');
});
test('fiscal-disabled account cannot attempt issuance; ordinary ticket path untouched',async()=>{
 const {api,calls}=fixture(()=>({completion_enabled:false}));await assert.rejects(api.authorizeAndConfirm({saleRef:'SYNTHETIC-SALE'}));assert.ok(calls.every(x=>x[0]!=='request'));assert.ok(calls.every(x=>!String(x[0]).includes('venta')));
});
test('explicit read permission reconciles while issuance is OFF, without a POST of emission',async()=>{
 const {api,calls}=fixture(path=>path==='capabilities'?{completion_enabled:false,completion_mode:'OFF',reconciliation_enabled:true}:pending);await api.reconcile({saleRef:'SYNTHETIC-SALE'});await assert.rejects(api.requestAuthorization({saleRef:'SYNTHETIC-SALE'}));assert.equal(calls.filter(x=>x[0]==='reconcile').length,1);assert.ok(calls.every(x=>x[0]!=='request'));
});
