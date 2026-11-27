'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../arca.js'),'utf8');
function setup({role='ADMINISTRADOR',enabled=false,showSetup=true,apiOrigin=''}={}){
 const events={calls:0,dialogs:[],copied:null};
 function element(tag){
   return {tag,children:[],style:{},value:'',textContent:'',append(...c){this.children.push(...c);if(tag==='dialog'&&!this.firstElementChild)this.firstElementChild=c[0];},
     addEventListener(){},remove(){},setAttribute(){},showModal(){events.dialogs.push(this);},close(){}};
 }
 const button=element('button');button.hidden=true;
 const document={getElementById:id=>id==='vicoraArcaConfiguracion'?button:null,createElement:element,body:element('body')};
 const browser={VICORA_ARCA_CONFIG:{showSetup,enabled,apiOrigin},fetch:async()=>{events.calls++;throw Error('NETWORK_FORBIDDEN');},navigator:{clipboard:{writeText:async v=>{events.copied=v;}}}};
 const context={window:browser,document,URL,AbortController,setTimeout,clearTimeout};
 vm.createContext(context);vm.runInContext(code,context);
 const db={auth:{getSession:async()=>{events.calls++;throw Error('AUTH_NOT_REQUIRED');}}};
 return {browser,button,events,db,role};
}
function visit(node,output=[]){output.push(node);for(const ch of node.children||[])visit(ch,output);return output}
function text(node){return visit(node).map(n=>n.textContent||'').join(' ')}
function input(dom,key){return visit(dom).find(n=>n.name===key)}
function button(dom,name){return visit(dom).find(n=>n.tag==='button'&&n.textContent===name)}
test('admin preview displays editable fields without calling fiscal API or saving information',async()=>{
 const s=setup();await s.browser.vicoraArcaInstalar({db:s.db,role:s.role});
 assert.equal(s.button.hidden,false);assert.equal(s.browser.VICORA_ARCA_UI_HABILITADA,false);
 assert.equal(s.browser.vicoraArcaIniciarEmision,undefined);
 s.button.onclick();const d=s.events.dialogs[0];assert.ok(d);
 for(const k of ['issuer','condition','point','representation','businessName','taxAddress','grossIncome','activityStart'])assert.ok(input(d,k),k);
 for(const label of ['ALTA DE COMERCIO','Guardar borrador','Enviar solicitud de habilitación','Certificado digital','Punto de venta','Nombre o razón social','CUIT','Ingresos Brutos'])assert.ok(text(d).includes(label),label);
 assert.equal(s.events.calls,0);
});
test('local format review never validates actual ARCA authorization or stores sensitive CUIT',async()=>{
 const s=setup();await s.browser.vicoraArcaInstalar({db:s.db,role:s.role});s.button.onclick();
 const d=s.events.dialogs[0],check=button(d,'Revisar datos ingresados');
 check.onclick();assert.ok(text(d).includes('Faltan datos'));
 input(d,'issuer').value='20999999990';input(d,'point').value='1';input(d,'condition').value='MONOTRIBUTO';input(d,'representation').value='PROPIA';input(d,'businessName').value='Comercio de prueba';
 check.onclick();assert.ok(text(d).includes('No verifica autorización ARCA'));
 assert.equal(s.events.calls,0);assert.equal(s.browser.VICORA_ARCA_UI_HABILITADA,false);
});
test('copy checklist includes generic requirements but not the typed fiscal data',async()=>{
 const s=setup();await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});s.button.onclick();
 const d=s.events.dialogs[0];input(d,'issuer').value='20999999990';
 await button(d,'Copiar requisitos para el cliente').onclick();
 assert.ok(s.events.copied.includes('Requisitos para facturación electrónica'));
 assert.ok(!s.events.copied.includes('20999999990'));
 assert.equal(s.events.calls,0);
});
test('seller cannot open setup, and stale admin callback is invalidated on role switch',async()=>{
 const s=setup();await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});
 const old=s.button.onclick;
 await s.browser.vicoraArcaInstalar({db:s.db,role:'VENDEDOR'});
 assert.equal(s.button.hidden,true);assert.equal(s.button.onclick,null);old();
 assert.equal(s.events.dialogs.length,0);assert.equal(s.events.calls,0);
});
test('untrusted API origin still presents offline preview without authorization or network call',async()=>{
 const s=setup({enabled:true,apiOrigin:'http://example.invalid'});await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});
 assert.equal(s.button.hidden,false);s.button.onclick();assert.equal(s.events.dialogs.length,1);assert.equal(s.events.calls,0);
});
test('production config is limited to the selected pilot and scripts share updated cache',()=>{
 const cfg=fs.readFileSync(require.resolve('../arca.config.js'),'utf8');
 const page=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const context={window:{}};vm.runInNewContext(cfg,context);
 const config=context.window.VICORA_ARCA_CONFIG;
 assert.equal(config.enabled,true);assert.equal(config.showSetup,true);assert.equal(new URL(config.apiOrigin).protocol,'https:');assert.match(config.pilotBusiness,/^NEG-[A-F0-9]{32}$/);
 assert.ok(page.includes('arca.js?v=20261126-daily-candidate-v1'));
 assert.ok(page.includes('arca.config.js?v=20261126-vitalia-pilot-v1'));
 assert.ok(!code.includes('localStorage'));
 assert.ok(!code.includes('/v1/fiscal/emit'));
 assert.ok(code.includes("vicora_arca_solicitudes_comercio"));
});

test('only explicit admin action persists a tenant-scoped draft; never uses client-supplied tenant identity',async()=>{
 const s=setup(),calls=[];
 s.db.auth.getUser=async()=>({data:{user:{id:'USER-1'}},error:null});
 s.db.from=table=>{
   calls.push(['table',table]);
   if(table==='usuarios')return {select:()=>({eq:(col,value)=>{assert.equal(col,'auth_user_id');assert.equal(value,'USER-1');return {limit:async()=>({data:[{id_negocio:'NEG-1',rol:'ADMINISTRADOR',estado:'ACTIVO'}],error:null})}}})};
   assert.equal(table,'vicora_arca_solicitudes_comercio');
   return {upsert:(value,options)=>{
     assert.equal(options.onConflict,'id_negocio');calls.push(['write',value]);
     return {select:()=>({single:async()=>({data:{estado:value.estado},error:null})})};
   }};
 };
 await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});s.button.onclick();
 const d=s.events.dialogs[0];assert.equal(calls.length,0);
 input(d,'issuer').value='20123456789';input(d,'businessName').value='Cliente de prueba';
 await button(d,'Guardar borrador').onclick();
 assert.equal(calls[0][1],'usuarios');assert.equal(calls[1][1],'vicora_arca_solicitudes_comercio');
 const saved=calls.find(x=>x[0]==='write')[1];
 assert.equal(saved.id_negocio,'NEG-1');assert.equal(saved.estado,'BORRADOR');
 assert.equal(saved.cuit_emisor,'20123456789');assert.ok(!('password' in saved));
 assert.ok(text(d).includes('Borrador guardado'));
});
test('request may be submitted only with all fiscal fields and explicit responsible declaration',async()=>{
 const s=setup(),writes=[];
 s.db.auth.getUser=async()=>({data:{user:{id:'USER-2'}},error:null});
 s.db.from=table=>{
  if(table==='usuarios')return {select:()=>({eq:()=>({limit:async()=>({data:[{id_negocio:'NEG-2',rol:'ADMINISTRADOR',estado:'ACTIVO'}],error:null})})})};
  return {upsert:v=>{writes.push(v);return {select:()=>({single:async()=>({data:{estado:v.estado},error:null})})}}};
 };
 await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});s.button.onclick();
 const d=s.events.dialogs[0],send=button(d,'Enviar solicitud de habilitación');
 await send.onclick();assert.equal(writes.length,0);assert.ok(text(d).includes('Para enviar'));
 for(const [k,v] of Object.entries({issuer:'20123456789',condition:'MONOTRIBUTO',point:'5',representation:'PROPIA',businessName:'Tienda',taxAddress:'Calle 12',grossIncome:'Exento',activityStart:'2024-03-11'}))
   input(d,k).value=v;
 await send.onclick();assert.equal(writes.length,0);assert.ok(text(d).includes('declaración del responsable'));
 input(d,'declaraResponsabilidad').checked=true;
 await send.onclick();assert.equal(writes.length,1);
 assert.equal(writes[0].estado,'SOLICITADA');
 assert.equal(writes[0].id_negocio,'NEG-2');
 assert.ok(text(d).includes('Todavía NO estás autorizado'));
 assert.equal(s.browser.VICORA_ARCA_UI_HABILITADA,false);
});
test('saved request can be loaded only after authenticated administrator membership check',async()=>{
 const s=setup();
 const records={cuit_emisor:'20123456789',condicion_iva:'MONOTRIBUTO',punto_venta:5,representacion:'PROPIA',
  razon_social:'Tienda',domicilio_fiscal:'Calle 12',ingresos_brutos:'Exento',inicio_actividades:'2024-03-11',
  declara_responsabilidad:true,estado:'SOLICITADA'};
 s.db.auth.getUser=async()=>({data:{user:{id:'USER-3'}},error:null});
 s.db.from=table=>{
  if(table==='usuarios')return {select:()=>({eq:()=>({limit:async()=>({data:[{id_negocio:'NEG-3',rol:'ADMINISTRADOR',estado:'ACTIVO'}],error:null})})})};
  return {select:()=>({eq:(key,value)=>{assert.equal(key,'id_negocio');assert.equal(value,'NEG-3');return {maybeSingle:async()=>({data:records,error:null})}}})};
 };
 await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});s.button.onclick();
 const d=s.events.dialogs[0];await button(d,'Cargar solicitud').onclick();
 assert.equal(input(d,'point').value,'5');
 assert.equal(input(d,'businessName').value,'Tienda');
 assert.equal(input(d,'declaraResponsabilidad').checked,true);
 assert.ok(text(d).includes('pendiente de revisión'));
});
test('failed membership checks cannot save any onboarding details',async()=>{
 const s=setup(),actions=[];
 s.db.auth.getUser=async()=>({data:{user:{id:'USER-NOT-ADMIN'}},error:null});
 s.db.from=table=>{actions.push(table);return {select:()=>({eq:()=>({limit:async()=>({data:[{id_negocio:'NEG-4',rol:'VENDEDOR',estado:'ACTIVO'}],error:null})})})}};
 await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});s.button.onclick();
 await button(s.events.dialogs[0],'Guardar borrador').onclick();
 assert.deepEqual(actions,['usuarios']);assert.ok(text(s.events.dialogs[0]).includes('No se pudo guardar'));
});

test('authenticated membership precedes capability lookup; unavailable capabilities never enable fiscal UI',async()=>{
 for(const [role,business,expected] of [['ADMINISTRADOR','PILOT',1],['ADMINISTRADOR','OTHER',1],['VENDEDOR','PILOT',1]]){
  const s=setup({enabled:true,apiOrigin:'https://fiscal.invalid',role});s.browser.VICORA_ARCA_CONFIG.pilotBusiness='PILOT';
  s.db.auth.getUser=async()=>({data:{user:{id:'SYNTHETIC'}},error:null});
  s.db.auth.getSession=async()=>({data:{session:{access_token:'SYNTHETIC'}}});
  s.db.from=()=>({select:()=>({eq:()=>({limit:async()=>({data:[{id_negocio:business,rol:role,estado:'ACTIVO'}],error:null})})})});
  await s.browser.vicoraArcaInstalar({db:s.db,role});assert.equal(s.events.calls,expected);assert.equal(s.browser.VICORA_ARCA_UI_HABILITADA,false);
  assert.equal(typeof s.browser.vicoraArcaIniciarEmision,expected?'function':'undefined');
 }
});
