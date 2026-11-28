/* All responses/identities are synthetic; never calls a fiscal endpoint. */
const {test}=require('node:test'),assert=require('node:assert/strict');const {client}=require('../arca.js');
const operation='00000000-0000-4000-8000-000000000099';
function setup(handle){let token='SYNTHETIC_A';const calls=[],db={auth:{getSession:async()=>({data:{session:{access_token:token}}})}};const api=client({recoveryDelayMs:0,sleep:async()=>{},db,apiOrigin:'https://fiscal.invalid',businessContext:'SYNTHETIC_BUSINESS_A',fetchImpl:async(url,o)=>{const path=url.split('/v1/fiscal/')[1];calls.push({path,...o});const value=await handle(path,o);return {ok:true,json:async()=>({can_send:false,runtime_enabled:false,...(path==='capabilities'?{preparation_enabled:true,configuration_enabled:true,document_types:[11,13],completion_enabled:true,completion_mode:'PRODUCCION',credit_c_enabled:true}:{}),...value})};}});return {api,calls,change:()=>{token='SYNTHETIC_B';}};}
const pending={status:'PENDIENTE_CONCILIACION',operation,environment:'PRODUCCION',authorization_verified:false,document_available:false};
const verified={status:'AUTORIZADO_PROD_VERIFICADO',operation,environment:'PRODUCCION',authorization_verified:true,document_available:true,receipt:{point:4,kind:13,number:1,cae:'11111111111111',expiry:'20261203',date:'2026-11-26'}};
test('full credit uses sale and legitimate reason; never browser amount/original CAE/issuer',async()=>{
 const s=setup(path=>path==='credit/prepare'?{status:'PREPARADO_NO_EMITIDO',operation,document_type:13}:{});await s.api.creditPrepare({saleRef:'SYNTHETIC_SALE',reason:'ANULACION FICTICIA'});const call=s.calls.find(c=>c.path==='credit/prepare');assert.deepEqual(JSON.parse(call.body),{saleRef:'SYNTHETIC_SALE',reason:'ANULACION FICTICIA'});assert.equal(call.headers['X-Vicora-Context'],'SYNTHETIC_BUSINESS_A');
 await assert.rejects(s.api.creditPrepare({saleRef:'SYNTHETIC_SALE',reason:'ANULACION FICTICIA',amount:2000}));assert.equal(s.calls.filter(c=>c.path==='credit/prepare').length,1);
});
test('credit timeout never repeats POST; continuation only consults',async()=>{
 const s=setup(path=>{if(path==='credit/request')throw new TypeError('SYNTHETIC_TIMEOUT');if(path==='credit/status')return pending;if(path==='credit/reconcile')return verified;return {};});const value=await s.api.creditAuthorizeAndConfirm({saleRef:'SYNTHETIC_SALE'});assert.equal(value.receipt.kind,13);assert.equal(s.calls.filter(c=>c.path==='credit/request').length,1);assert.equal(s.calls.filter(c=>c.path==='credit/reconcile').length,1);
});
test('existing invoice or MOCK cannot be shown as authorized credit',async()=>{
 for(const value of [{...verified,receipt:{...verified.receipt,kind:11}},{...verified,status:'DEMO_CONCILIADO_NO_FISCAL',environment:'LAB_TLS',authorization_verified:false,document_available:false}]){const s=setup(()=>value);await assert.rejects(s.api.creditStatus({saleRef:'SYNTHETIC_SALE'}));}
});
test('changed login cannot submit an old view invoice or credit for an identically named sale',async()=>{
 for(const method of ['requestAuthorization','creditRequest','prepare','creditStatus']){const s=setup(()=>({}));s.change();await assert.rejects(s.api[method]({saleRef:'SYNTHETIC_SALE'},'SYNTHETIC_A'));assert.ok(s.calls.every(c=>!['request','credit/request','prepare','credit/status'].includes(c.path)));}
});
test('disabled private credit capability performs no mutation',async()=>{
 const s=setup(()=>({credit_c_enabled:false}));await assert.rejects(s.api.creditRequest({saleRef:'SYNTHETIC_SALE'}));assert.ok(s.calls.every(c=>c.path==='capabilities'));
});
