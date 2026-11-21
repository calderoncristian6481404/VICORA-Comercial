'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../arca.js'),'utf8');
function setup({role='ADMINISTRADOR',enabled=false,showSetup=true,apiOrigin='',withSession=true}={}){
  const events={calls:0,dialogs:[]};
  function element(tag){
    return {tag,children:[],style:{},append(...items){this.children.push(...items);},
      showModal(){events.dialogs.push(this);},addEventListener(){},close(){},remove(){}};
  }
  const button=element('button');button.hidden=true;
  const document={getElementById(id){return id==='vicoraArcaConfiguracion'?button:null;},createElement:element,body:element('body')};
  const browser={VICORA_ARCA_CONFIG:{showSetup,enabled,apiOrigin},fetch:async()=>{events.calls++;throw new Error('Network MUST NOT be used in offline setup');}};
  const env={window:browser,document,URL,AbortController,setTimeout,clearTimeout};
  vm.createContext(env);vm.runInContext(source,env);
  const db={auth:{getSession:async()=>{events.calls++;return {data:{session:{access_token:'INTERNAL'}}};}}};
  return {browser,button,events,db,role};
}
function textOf(node){return [node.textContent||'',...(node.children||[]).flatMap(textOf)].join(' ');}
test('ADMIN sees read-only ARCA setup even when fiscal API is OFF; no network or login call',async()=>{
  const s=setup();
  await s.browser.vicoraArcaInstalar({db:s.db,role:s.role});
  assert.equal(s.button.hidden,false);
  assert.equal(s.browser.VICORA_ARCA_UI_HABILITADA,false);
  assert.equal(s.browser.vicoraArcaIniciarEmision,undefined);
  s.button.onclick();
  assert.equal(s.events.dialogs.length,1);
  const all=textOf(s.events.dialogs[0]);
  for(const term of ['emisión fiscal pendiente','primer comercio','CUIT','numeración real','NO FISCAL'])
    assert.ok(all.includes(term),term);
  assert.equal(s.events.calls,0);
});
test('a seller cannot open onboarding or use fiscal actions before issuer authorization',async()=>{
  const s=setup({role:'VENDEDOR'});
  await s.browser.vicoraArcaInstalar({db:s.db,role:s.role});
  assert.equal(s.button.hidden,true);
  assert.equal(s.button.onclick,null);
  assert.equal(s.browser.vicoraArcaIniciarEmision,undefined);
  assert.equal(s.events.calls,0);
});
test('if API origin is absent or misconfigured, admin still gets safe setup information',async()=>{
  const s=setup({enabled:true,apiOrigin:'http://untrusted.invalid'});
  await s.browser.vicoraArcaInstalar({db:s.db,role:s.role});
  assert.equal(s.button.hidden,false);
  s.button.onclick();assert.equal(s.events.dialogs.length,1);
  assert.equal(s.events.calls,0);
  assert.equal(s.browser.VICORA_ARCA_UI_HABILITADA,false);
});
test('re-installing as seller removes old administrator handler and blocks stale click',async()=>{
  const s=setup();
  await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});
  const old=s.button.onclick;
  await s.browser.vicoraArcaInstalar({db:s.db,role:'VENDEDOR'});
  assert.equal(s.button.hidden,true);
  assert.equal(s.button.onclick,null);
  old();
  assert.equal(s.events.dialogs.length,0);
});
test('published configuration exposes onboarding but remains strictly FISCAL_OFF',()=>{
  const code=fs.readFileSync(require.resolve('../arca.config.js'),'utf8');
  assert.match(code,/enabled:false/);
  assert.match(code,/apiOrigin:''/);
  assert.match(code,/showSetup:true/);
  assert.ok(!code.includes('service_role'));
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.ok(html.includes('arca.js?v=20261121-alta-visible-v1'));
  assert.ok(html.includes('arca.config.js?v=20261121-alta-visible-v1'));
});
