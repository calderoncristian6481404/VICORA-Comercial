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
 for(const label of ['VISTA PREVIA','no se guardan','Certificado digital','Punto de venta','Nombre o razón social','CUIT','Ingresos Brutos'])assert.ok(text(d).includes(label),label);
 assert.equal(s.events.calls,0);
});
test('local format review never validates actual ARCA authorization or stores sensitive CUIT',async()=>{
 const s=setup();await s.browser.vicoraArcaInstalar({db:s.db,role:s.role});s.button.onclick();
 const d=s.events.dialogs[0],check=button(d,'Revisar datos ingresados');
 check.onclick();assert.ok(text(d).includes('Faltan datos'));
 input(d,'issuer').value='20999999990';input(d,'point').value='1';input(d,'condition').value='MONOTRIBUTO';input(d,'representation').value='PROPIA';input(d,'businessName').value='Comercio de prueba';
 check.onclick();assert.ok(text(d).includes('NO comprueba CUIT'));
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
test('production config remains OFF and script cache updated',()=>{
 const cfg=fs.readFileSync(require.resolve('../arca.config.js'),'utf8');
 const page=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.ok(cfg.includes("enabled:false,apiOrigin:'',showSetup:true"));
 assert.ok(page.includes('arca.js?v=20261121-formulario-v1'));
 assert.ok(page.includes('arca.config.js?v=20261121-formulario-v1'));
 assert.ok(!code.includes('localStorage'));
 assert.ok(!code.includes('/v1/fiscal/emit'));
});
