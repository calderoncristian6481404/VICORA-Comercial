'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {client}=require('../arca.js');
const db={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC'}}})}};
const caps={preparation_enabled:false,configuration_enabled:true,document_types:[],can_send:false,runtime_enabled:false};
const response=value=>({ok:true,json:async()=>value});
function browser(capability,role='ADMINISTRADOR'){
 const button={hidden:true},root={VICORA_ARCA_CONFIG:{enabled:true,apiOrigin:'https://fiscal.invalid'},fetch:async()=>response(capability)};
 const env={window:root,document:{getElementById:()=>button},URL,AbortController,setTimeout,clearTimeout};vm.createContext(env);vm.runInContext(fs.readFileSync(require.resolve('../arca.js'),'utf8'),env);
 return {root,button,install:()=>root.vicoraArcaInstalar({db,role,createAuthClient:()=>({})})};
}
test('browser flag cannot enable fiscal preparation against backend OFF',async()=>{
 const b=browser(caps);await b.install();assert.equal(b.root.VICORA_ARCA_UI_HABILITADA,false);assert.equal(b.button.hidden,false);
 await assert.rejects(b.root.vicoraArcaIniciarEmision({saleRef:'SALE'}),/no tiene preparación/);
});
test('backend readiness is required, seller never receives admin control',async()=>{
 const b=browser({...caps,preparation_enabled:true,document_types:[11]},'VENDEDOR');await b.install();assert.equal(b.root.VICORA_ARCA_UI_HABILITADA,true);assert.equal(b.button.hidden,true);
});
test('capability network failure or malformed response keeps UI closed',async()=>{
 for(const c of [{...caps,preparation_enabled:'true'},{...caps,can_send:true},{...caps,document_types:[999]}]){
  const b=browser(c);await b.install();assert.equal(b.root.VICORA_ARCA_UI_HABILITADA,false);assert.equal(b.button.hidden,true);
 }
});
test('status is authenticated and never prepares a sale again',async()=>{
 let calls=0;const api=client({db,apiOrigin:'https://fiscal.invalid',fetchImpl:async(url,opt)=>{calls++;assert.equal(url,'https://fiscal.invalid/v1/fiscal/status');assert.equal(opt.headers.Authorization,'Bearer SYNTHETIC');assert.deepEqual(JSON.parse(opt.body),{saleRef:'SALE'});return response({status:'RESULTADO_INCIERTO',operation:null,can_send:false,runtime_enabled:false});}});
 assert.equal((await api.status({saleRef:'SALE'})).status,'RESULTADO_INCIERTO');assert.equal(calls,1);
 await assert.rejects(api.status({saleRef:'SALE',business:'OTHER'}));assert.equal(calls,1);
});
test('an invented authorized status or simulated CAE cannot unlock UI documents',async()=>{
 const api=client({db,apiOrigin:'https://fiscal.invalid',fetchImpl:async()=>response({status:'AUTORIZADO',cae:'FAKE',can_send:false,runtime_enabled:false})});await assert.rejects(api.status({saleRef:'SALE'}));
});
test('failed or expired session cannot consult readiness',async()=>{
 const api=client({db:{auth:{getSession:async()=>({error:true})}},apiOrigin:'https://fiscal.invalid',fetchImpl:()=>{throw Error('MUST_NOT_FETCH');}});await assert.rejects(api.capabilities(),/sesión/);
});
test('readiness revocation closes subsequent fiscal requests',async()=>{
 const c={...caps,preparation_enabled:true,document_types:[11]},b=browser(c);await b.install();assert.equal(b.root.VICORA_ARCA_UI_HABILITADA,true);
 c.preparation_enabled=false;await b.root.vicoraArcaRefrescarDisponibilidad();assert.equal(b.root.VICORA_ARCA_UI_HABILITADA,false);
});
test('nonfiscal ticket and later choice remain available without fiscal credentials',()=>{
 const sales=fs.readFileSync(require.resolve('../ventas.js'),'utf8');assert.ok(sales.includes('Ticket VICORA (no fiscal)'));assert.ok(sales.includes('Más tarde'));assert.ok(sales.includes('No válido como factura fiscal'));assert.ok(!sales.includes('FECAESolicitar'));
});
