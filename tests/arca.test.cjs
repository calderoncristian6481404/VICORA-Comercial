'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const {client}=require('../arca.js');
const operation='00000000-0000-4000-8000-000000000001';
const prepared={status:'PREPARADO_NO_EMITIDO',operation,document_type:11,can_send:false,runtime_enabled:false};
const db={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC_SESSION'}}})}};
function api(fetchImpl,extra={}){return client({db,apiOrigin:'https://fiscal.invalid',fetchImpl,...extra});}
function ok(value=prepared){return {ok:true,json:async()=>value};}
test('one authenticated request, saleRef only, no browser company or fiscal proof',async()=>{
 let count=0;const service=api(async(url,options)=>{count++;assert.equal(url,'https://fiscal.invalid/v1/fiscal/prepare');assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_SESSION');assert.deepEqual(JSON.parse(options.body),{saleRef:'SALE'});assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return ok();});
 assert.deepEqual(await service.prepare({saleRef:'SALE'}),prepared);assert.equal(count,1);
 await assert.rejects(service.prepare({saleRef:'SALE',issuer:'FORBIDDEN'}));assert.equal(count,1);
});
test('concurrent clicks share preparation, manual retry reuses backend operation',async()=>{
 let count=0;const service=api(async()=>{count++;await new Promise(r=>setTimeout(r,10));return ok();});
 const results=await Promise.all([service.prepare({saleRef:'SALE'}),service.prepare({saleRef:'SALE'})]);assert.equal(count,1);assert.equal(results[0].operation,results[1].operation);
 assert.equal((await service.prepare({saleRef:'SALE'})).operation,operation);assert.equal(count,2);
});
test('timeout never retries or calls reserve, emit or commercial RPC',async()=>{
 let count=0;const service=api((url,o)=>new Promise((resolve,reject)=>{count++;o.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'})));}),{timeoutMs:5});
 await assert.rejects(service.prepare({saleRef:'SALE'}),/No se reenvió/);assert.equal(count,1);
});
test('forged authorization, arbitrary type, malformed intent and rejection stay blocked',async()=>{
 for(const value of [{...prepared,can_send:true},{...prepared,runtime_enabled:true},{...prepared,document_type:3},{...prepared,operation:'NOT_UUID'},{...prepared,status:'AUTORIZADO'}])await assert.rejects(api(async()=>ok(value)).prepare({saleRef:'SALE'}));
 await assert.rejects(api(async()=>({ok:false,json:async()=>({error:'PRIVATE_XML'})})).prepare({saleRef:'SALE'}),e=>!e.message.includes('PRIVATE_XML'));
});
test('HTTPS endpoint fixed, no token in URL, existing-account reauth header only',async()=>{
 for(const url of ['http://fiscal.invalid','https://user:password@fiscal.invalid','https://fiscal.invalid/?token=BAD'])assert.throws(()=>client({db,apiOrigin:url}));
 const service=api(async(url,o)=>{assert.equal(url,'https://fiscal.invalid/v1/fiscal/config');assert.equal(o.headers['X-Vicora-Reauth'],'SYNTHETIC_FRESH_PASSWORD_SESSION');assert.equal(o.headers.Authorization,'Bearer SYNTHETIC_SESSION');assert.ok(!o.body.includes('SYNTHETIC'));return ok({profile:{version:1},can_send:false,runtime_enabled:false});});
 await service.saveProfile({version:0,issuer:'20000000001'},async()=>'SYNTHETIC_FRESH_PASSWORD_SESSION');
 await assert.rejects(service.saveProfile({},async()=>'SYNTHETIC_SESSION'));
});
function salesContext({refreshFails=false,confirmFails=false,fiscal=true}={}){
 let confirms=0,inserts=0,details=0,stock=0,cash=0,fiscalCalls=0;const messages=[];const nodes={venConfirmar:{isConnected:true},venModal:{innerHTML:''}};
 const context={console,window:{VICORA_ARCA_UI_HABILITADA:fiscal,vicoraArcaIniciarEmision:async body=>{fiscalCalls++;assert.deepEqual(JSON.parse(JSON.stringify(body)),{saleRef:'SALE'});return prepared;}},document:{getElementById:id=>nodes[id]||null,addEventListener:()=>{}},setTimeout,clearTimeout};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../ventas.js'),'utf8'),context);
 Object.assign(context,{$:id=>nodes[id]||null,perfil:{id_negocio:'SERVER_SOURCE_HINT',id_usuario:'USER'},vicoraBloquearEdicion:()=>false,venAcceso:async()=>{},vicoraExigirSuscripcionVigente:async()=>{},confirmarVicora:async()=>{await new Promise(r=>setTimeout(r,5));return true;},venCerrar:()=>{},venToast:(...args)=>messages.push(args),venCargar:async()=>{if(refreshFails)throw new Error('VIEW_UNAVAILABLE');},venElegirComprobante:()=>{},venFechaISO:()=> '2026-11-16',venId:()=> 'SALE',db:{from(table){return {insert(){if(table==='ventas'){inserts++;return {select:()=>({single:async()=>({data:{id_venta:'SALE'}})})};}details++;return Promise.resolve({error:null});}};},async rpc(name){assert.equal(name,'confirmar_venta');confirms++;if(confirmFails)return {error:new Error('DECLINED')};stock++;cash++;return {data:{ok:true,total:100,saldo_pendiente:0}};}}});
 vm.runInContext("ventasUI.carrito=[{id:'P',cantidad:1,precio:100,stock:5}];ventasUI.modalidad='CONTADO';ventasUI.cliente=null;ventasUI.descuento=0;ventasUI.anticipo=0;ventasUI.medio='EFECTIVO';ventasUI.clientes=[];",context);
 return {context,messages,counts:()=>({confirms,inserts,details,stock,cash,fiscalCalls})};
}
test('double confirm click registers sale once; fiscal preparation never confirms sale again',async()=>{
 const s=salesContext();await Promise.all([s.context.venGuardar(),s.context.venGuardar()]);
 assert.deepEqual(s.counts(),{confirms:1,inserts:1,details:1,stock:1,cash:1,fiscalCalls:0});
 await s.context.venEmitirFiscalDesdeVenta('SALE');await s.context.venEmitirFiscalDesdeVenta('SALE');
 assert.deepEqual(s.counts(),{confirms:1,inserts:1,details:1,stock:1,cash:1,fiscalCalls:2});
});
test('post-confirm refresh failure preserves success, never suggests a new sale',async()=>{
 const s=salesContext({refreshFails:true});await s.context.venGuardar();assert.equal(s.counts().confirms,1);assert.ok(s.messages.some(m=>m[0]==='Venta registrada'));assert.ok(!s.messages.some(m=>m[0]==='No se pudo confirmar'));
});
test('disabled module leaves ordinary sales working and fiscal action closed',async()=>{
 const s=salesContext({fiscal:false});await s.context.venGuardar();await s.context.venEmitirFiscalDesdeVenta('SALE');assert.equal(s.counts().confirms,1);assert.equal(s.counts().fiscalCalls,0);
});
test('UI default off, memory-only password reauth, no fiscal credential or printable mock path',()=>{
 const code=fs.readFileSync(require.resolve('../arca.js'),'utf8');const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.ok(code.includes('root.VICORA_ARCA_UI_HABILITADA=false'));assert.ok(code.includes("password.value=''"));assert.ok(code.includes('signInWithPassword'));
 assert.ok(html.includes('persistSession:false,autoRefreshToken:false,detectSessionInUrl:false'));
 assert.ok(!code.includes('localStorage'));assert.ok(!code.includes('db.rpc'));assert.ok(!code.includes('/emit'));assert.ok(!code.includes('/reserve'));
 assert.ok(code.includes('No hay CAE verificado'));assert.ok(code.includes("role==='ADMIN'"));
});
