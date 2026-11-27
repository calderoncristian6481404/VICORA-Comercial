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

function configure(s){s.db.auth.getUser=async()=>({data:{user:{id:'SYNTHETIC_USER'}},error:null});const writes=[];s.db.from=table=>table==='usuarios'?{select:()=>({eq:()=>({limit:async()=>({data:[{id_negocio:'SYNTHETIC_BUSINESS',rol:'ADMINISTRADOR',estado:'ACTIVO'}],error:null})})})}:{upsert:v=>{writes.push(v);return{select:()=>({single:async()=>({data:{estado:v.estado},error:null})})}},select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})};return writes;}
async function opened(){const s=setup();const writes=configure(s);await s.browser.vicoraArcaInstalar({db:s.db,role:'ADMINISTRADOR'});s.button.onclick();return {s,d:s.events.dialogs[0],writes};}
function complete(d){for(const [k,v] of Object.entries({issuer:'20123456789',condition:'MONOTRIBUTO',point:'4',businessName:'Comercio sintético',taxAddress:'Domicilio de prueba',activityStart:'2020-01-01'}))input(d,k).value=v;input(d,'declaraResponsabilidad').checked=true;}
test('representation is delegated and displayed without a selectable mode',async()=>{const {d}=await opened();assert.equal(input(d,'representation').type,'hidden');assert.equal(input(d,'representation').value,'DELEGADA');assert.ok(text(d).includes('Emisión mediante representante autorizado'));assert.equal(visit(d).filter(x=>x.tag==='select'&&x.name==='representation').length,0);});
test('registered gross income saves the existing text contract without new columns',async()=>{const {d,writes}=await opened();complete(d);input(d,'grossIncomeCondition').value='INSCRIPTO';input(d,'grossIncomeCondition').onchange();input(d,'grossIncomeNumber').value='901-123456';await button(d,'Enviar solicitud de habilitación').onclick();assert.equal(writes.length,1);assert.equal(writes[0].ingresos_brutos,'Inscripto: 901-123456');assert.equal(writes[0].representacion,'DELEGADA');assert.equal(writes[0].estado,'SOLICITADA');assert.ok(!('grossIncomeCondition' in writes[0]));});
test('exempt text carries only the condition explicitly entered by the business',async()=>{const {d,writes}=await opened();complete(d);input(d,'grossIncomeCondition').value='EXENTO';input(d,'grossIncomeExemption').value='Constancia informada por titular';await button(d,'Enviar solicitud de habilitación').onclick();assert.equal(writes[0].ingresos_brutos,'Exento: Constancia informada por titular');});
test('advice choice saves a pending draft and cannot send a fiscal request',async()=>{const {d,writes}=await opened();complete(d);input(d,'grossIncomeCondition').value='ASESORAMIENTO';input(d,'grossIncomeCondition').onchange();await button(d,'Enviar solicitud de habilitación').onclick();assert.equal(writes.length,0);await button(d,'Guardar borrador').onclick();assert.equal(writes[0].ingresos_brutos,null);assert.equal(writes[0].estado,'BORRADOR');});
test('registered number is mandatory and no guessed tax value is submitted',async()=>{const {d,writes}=await opened();complete(d);input(d,'grossIncomeCondition').value='INSCRIPTO';await button(d,'Enviar solicitud de habilitación').onclick();assert.equal(writes.length,0);});
test('unclassified historical text is preserved verbatim, never inferred',async()=>{const {s,d,writes}=await opened();const ordinary=s.db.from;s.db.from=table=>table==='vicora_arca_solicitudes_comercio'?{...ordinary(table),select:()=>({eq:()=>({maybeSingle:async()=>({data:{ingresos_brutos:'123-VALOR-HISTORICO',representacion:'DELEGADA'},error:null})})})}:ordinary(table);await button(d,'Cargar solicitud').onclick();assert.equal(input(d,'grossIncomeCondition').value,'');await button(d,'Guardar borrador').onclick();assert.equal(writes[0].ingresos_brutos,'123-VALOR-HISTORICO');});
