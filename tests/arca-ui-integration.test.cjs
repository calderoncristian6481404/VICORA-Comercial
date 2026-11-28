/* Executes the actual UI installer/client against synthetic HTTP, never ARCA. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const operation='00000000-0000-4000-8000-000000000001';
function result(status,extra={}){return {status,operation,can_send:false,runtime_enabled:false,authorization_verified:false,document_available:false,...extra};}
async function ui(state,{ready=true,failStatus=false,documentType=11,switchSession=false}={}){
 const calls=[],dialogs=[],session={token:'SYNTHETIC_ONLY'};
 function element(tag){return {tag,dataset:{},style:{},children:[],append(...c){this.children.push(...c);},addEventListener(){},remove(){},showModal(){dialogs.push(this);},close(){},setAttribute(){}};}
 const browser={VICORA_ARCA_CONFIG:{enabled:true,apiOrigin:'https://fiscal.invalid'},fetch:async(url,o)=>{
  const path=url.split('/').at(-1);calls.push([path,o]);let value;
  if(path==='capabilities')value={preparation_enabled:ready,configuration_enabled:false,document_types:[1,6,11],completion_enabled:true,completion_mode:'LAB_TLS',can_send:false,runtime_enabled:false};
  else if(path==='status'){if(failStatus)throw new TypeError('SYNTHETIC_NETWORK_FAILURE');value=state;if(switchSession)session.token='SYNTHETIC_OTHER_USER';}
  else if(path==='prepare')value=result('PREPARADO_NO_EMITIDO',{document_type:documentType});
  else if(path==='request')value=result('DEMO_CONCILIADO_NO_FISCAL',{environment:'LAB_TLS'});
  else throw Error('UNEXPECTED_WRITE');
  return {ok:true,json:async()=>value};
 }};
 const document={getElementById:()=>null,createElement:element,head:element('head'),body:element('body')};
 const env={window:browser,document,URL,AbortController,setTimeout,clearTimeout};vm.createContext(env);vm.runInContext(fs.readFileSync(require.resolve('../arca.js'),'utf8'),env);
 const db={auth:{getSession:async()=>({data:{session:{access_token:session.token}}}),getUser:async()=>({data:{user:{id:'synthetic-subject'}}})},from:table=>{assert.equal(table,'usuarios');return {select:()=>({eq:()=>({limit:async()=>({data:[{id_negocio:'SYNTHETIC_BUSINESS',rol:'VENDEDOR',estado:'ACTIVO'}]})})})}}};
 await browser.vicoraArcaInstalar({db,role:'VENDEDOR'});calls.length=0;
 return {browser,calls,dialogs,db};
}
test('uncertain, rejected, contradictory and DEMO history never prepare or send again',async()=>{
 for(const status of ['RESULTADO_INCIERTO','RECHAZADO','CONFLICTO_BLOQUEADO','DEMO_CONCILIADO_NO_FISCAL']){
  const s=await ui(result(status));await s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'});
  assert.deepEqual(s.calls.map(c=>c[0]),['capabilities','status']);assert.ok(s.dialogs.length>=1);
 }
});
test('authorized history remains consultable when preparation is disabled, without another request',async()=>{
 const s=await ui(result('AUTORIZADO_HOMO_VERIFICADO',{environment:'HOMOLOGACION',authorization_verified:true,document_available:true}),{ready:false});
 await s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'});assert.deepEqual(s.calls.map(c=>c[0]),['capabilities','status']);
 assert.ok(s.dialogs[0].children.some(c=>c.textContent==='Descargar PDF A4'));
});
test('new invoice is status, preparation, then separate request; only saleRef leaves UI',async()=>{
 const s=await ui(result('NO_DISPONIBLE'));await s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'});
 assert.deepEqual(s.calls.map(c=>c[0]),['capabilities','status','prepare','capabilities','request']);
 for(const [path,o] of s.calls.filter(c=>c[1].body))assert.deepEqual(JSON.parse(o.body),{saleRef:'SALE'});
});
test('already prepared operation resumes without a second prepare and concurrent UI actions share flow',async()=>{
 const s=await ui(result('PREPARADO_NO_EMITIDO'));
 await Promise.all([s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'}),s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'})]);
 assert.equal(s.calls.filter(c=>c[0]==='prepare').length,0);assert.equal(s.calls.filter(c=>c[0]==='request').length,1);assert.ok(s.dialogs.length>=1);
});
test('status timeout or unconfigured commerce never falls back to a write',async()=>{
 for(const options of [{failStatus:true},{ready:false}]){
  const s=await ui(result('NO_DISPONIBLE'),options);await assert.rejects(s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'}));
  assert.ok(s.calls.every(c=>!['prepare','request','config'].includes(c[0])));
 }
});
test('two sales reuse merchant configuration; seller never saves or enables profile',async()=>{
 const s=await ui(result('NO_DISPONIBLE'));
 for(const saleRef of ['SALE-A','SALE-B'])await s.browser.vicoraArcaIniciarEmision({saleRef});
 assert.equal(s.calls.filter(c=>c[0]==='request').length,2);assert.equal(s.calls.filter(c=>c[0]==='config').length,0);
 await assert.rejects(s.browser.vicoraArcaIniciarEmision({saleRef:'SALE',enabled:true}));
});

test('A/B/C come from server fiscal preparation, never a seller-provided type',async()=>{
 for(const documentType of [1,6,11]){
  const s=await ui(result('NO_DISPONIBLE'),{documentType});
  await s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'});
  assert.equal(s.calls.filter(c=>c[0]==='request').length,1);
  assert.ok(s.calls.filter(c=>c[1].body).every(c=>JSON.stringify(JSON.parse(c[1].body))===JSON.stringify({saleRef:'SALE'})));
 }
});

test('session change during status cannot continue preparation or show another account result',async()=>{
 const s=await ui(result('NO_DISPONIBLE'),{switchSession:true});
 await assert.rejects(s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'}),/sesión cambió/);
 assert.ok(!s.calls.some(c=>['prepare','request'].includes(c[0])));assert.equal(s.dialogs.length,0);
 const history=await ui(result('RESULTADO_INCIERTO'),{switchSession:true});
 await assert.rejects(history.browser.vicoraArcaConsultarEstado({saleRef:'SALE'}),/sesión cambió/);assert.equal(history.dialogs.length,0);
});
test('disabling/reinstalling module invalidates old callbacks and clears administrative handler',async()=>{
 const s=await ui(result('NO_DISPONIBLE'));const old=s.browser.vicoraArcaIniciarEmision;
 s.browser.VICORA_ARCA_CONFIG.enabled=false;await s.browser.vicoraArcaInstalar({db:s.db,role:'VENDEDOR'});
 assert.equal(s.browser.vicoraArcaIniciarEmision,undefined);
 await assert.rejects(old({saleRef:'SALE'}));assert.equal(s.calls.length,0);
});

test('production CAE from server may show print options without another fiscal write',async()=>{
 const s=await ui(result('AUTORIZADO_PROD_VERIFICADO',{environment:'PRODUCCION',authorization_verified:true,document_available:true}),{ready:false});
 await s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'});
 assert.deepEqual(s.calls.map(x=>x[0]),['capabilities','status']);
 assert.ok(s.dialogs[0].children.some(c=>c.textContent==='Descargar PDF A4'));
 assert.ok(!s.calls.some(x=>['prepare','request','reconcile'].includes(x[0])));
});
test('unverified production consultation cannot print or pretend it received CAE',async()=>{
 const s=await ui(result('PENDIENTE_CONCILIACION',{environment:'PRODUCCION'}),{ready:false});
 await s.browser.vicoraArcaConsultarEstado({saleRef:'SALE'});
 assert.ok(s.dialogs[0].children.every(c=>c.textContent!=='Descargar PDF A4'));
 assert.ok(s.dialogs[0].children.some(c=>c.textContent==='Consultar y conciliar (sin reenviar)'));
 assert.ok(!s.calls.some(x=>['request','prepare'].includes(x[0])));
});
