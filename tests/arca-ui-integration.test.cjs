/* Executes the actual UI installer/client against synthetic HTTP, never ARCA. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const operation='00000000-0000-4000-8000-000000000001';
function result(status,extra={}){return {status,operation,can_send:false,runtime_enabled:false,authorization_verified:false,document_available:false,...extra};}
async function ui(state,{ready=true,failStatus=false}={}){
 const calls=[],dialogs=[];
 function element(tag){return {tag,style:{},children:[],append(...c){this.children.push(...c);},addEventListener(){},remove(){},showModal(){dialogs.push(this);},close(){},setAttribute(){}};}
 const browser={VICORA_ARCA_CONFIG:{enabled:true,apiOrigin:'https://fiscal.invalid'},fetch:async(url,o)=>{
  const path=url.split('/').at(-1);calls.push([path,o]);let value;
  if(path==='capabilities')value={preparation_enabled:ready,configuration_enabled:false,document_types:[1,6,11],completion_enabled:true,completion_mode:'LAB_TLS',can_send:false,runtime_enabled:false};
  else if(path==='status'){if(failStatus)throw new TypeError('SYNTHETIC_NETWORK_FAILURE');value=state;}
  else if(path==='prepare')value=result('PREPARADO_NO_EMITIDO',{document_type:11});
  else if(path==='request')value=result('DEMO_CONCILIADO_NO_FISCAL',{environment:'LAB_TLS'});
  else throw Error('UNEXPECTED_WRITE');
  return {ok:true,json:async()=>value};
 }};
 const document={getElementById:()=>null,createElement:element,body:element('body')};
 const env={window:browser,document,URL,AbortController,setTimeout,clearTimeout};vm.createContext(env);vm.runInContext(fs.readFileSync(require.resolve('../arca.js'),'utf8'),env);
 await browser.vicoraArcaInstalar({db:{auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC_ONLY'}}})}},role:'VENDEDOR'});calls.length=0;
 return {browser,calls,dialogs};
}
test('uncertain, rejected, contradictory and DEMO history never prepare or send again',async()=>{
 for(const status of ['RESULTADO_INCIERTO','RECHAZADO','CONFLICTO_BLOQUEADO','DEMO_CONCILIADO_NO_FISCAL']){
  const s=await ui(result(status));await s.browser.vicoraArcaIniciarEmision({saleRef:'SALE'});
  assert.deepEqual(s.calls.map(c=>c[0]),['capabilities','status']);assert.equal(s.dialogs.length,1);
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
 assert.equal(s.calls.filter(c=>c[0]==='prepare').length,0);assert.equal(s.calls.filter(c=>c[0]==='request').length,1);assert.equal(s.dialogs.length,1);
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
