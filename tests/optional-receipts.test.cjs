/* Actual UI functions in an isolated DOM harness; no Supabase/ARCA calls. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {client}=require('../arca.js');
function screen(enabled=false,paper='80'){
 const elements={},writes=[],events=[];
 const ctx={document:{addEventListener(){}},window:{VICORA_ARCA_UI_HABILITADA:enabled,vicoraArcaIniciarEmision:async b=>events.push(['fiscal',b]),open:()=>({document:{open(){},write:s=>writes.push(s),close(){}},addEventListener(){}})},
  localStorage:{getItem:()=>JSON.stringify({papel:paper})},perfil:{id_negocio:'COMMERCE-A'},negocio:{nombre:'Comercio'},esc:s=>String(s??''),Intl,Date,Number,console,
  $:id=>elements[id]??=( {} ),notificarVicora:(...a)=>events.push(['message',...a]),clienteVerificarAcceso:async()=>{},db:{},vicoraBloquearEdicion:()=>false,vicoraExigirSuscripcionVigente:async()=>{}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../ventas.js'),'utf8'),ctx);
 vm.runInContext('venDetalle=async id=>events.push(["ticket",id]);venCerrar=()=>events.push(["close"]);',Object.assign(ctx,{events}));
 return {ctx,elements,writes,events};
}
test('ordinary ticket requires no fiscal identity/client and is explicitly nonfiscal on 80mm/58mm/A4',()=>{
 for(const paper of ['80','58','A4']){
  const {ctx,writes,events}=screen(false,paper);
  ctx.venImprimir80({id_venta:'SALE-A',estado:'CONFIRMADA',total:10},[],[]);
  assert.match(writes[0],/NO FISCAL/);assert.match(writes[0],/No válido como factura fiscal/);
  assert.doesNotMatch(writes[0],/CAE N|codAut|Token|Sign/);assert.deepEqual(events,[]);
 }
});
test('per-sale selector never sends automatically and ordinary-ticket/later choices do not call fiscal API',async()=>{
 const {ctx,elements,events}=screen(true);ctx.venElegirComprobante('SALE-A');
 assert.deepEqual(events,[]);assert.match(elements.venModal.innerHTML,/Ticket VICORA \(no fiscal\)/);
 await elements.venElegirComun.onclick();elements.venElegirMasTarde.onclick();
 assert.equal(events.filter(e=>e[0]==='fiscal').length,0);assert.equal(events.filter(e=>e[0]==='ticket').length,1);
});
test('una habilitación del comercio permite elegir libremente el ticket de cada venta, sin reactivar ARCA',async()=>{
 const {ctx,elements,events}=screen(true);
 ctx.venElegirComprobante('VENTA-FISCAL');
 assert.match(elements.venModal.innerHTML,/Ticket VICORA \(no fiscal\)/);
 assert.match(elements.venModal.innerHTML,/Factura electrónica ARCA/);
 assert.doesNotMatch(elements.venModal.innerHTML,/Solicitar habilitación|Habilitar para esta venta/);
 elements.venElegirArca.onclick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(events.filter(e=>e[0]==='fiscal').map(e=>e[1].saleRef),['VENTA-FISCAL']);
 ctx.venElegirComprobante('VENTA-COMUN');
 await elements.venElegirComun.onclick();
 ctx.venElegirComprobante('VENTA-LUEGO');
 elements.venElegirMasTarde.onclick();
 assert.deepEqual(events.filter(e=>e[0]==='fiscal').map(e=>e[1].saleRef),['VENTA-FISCAL']);
 assert.deepEqual(events.filter(e=>e[0]==='ticket').map(e=>e[1]),['VENTA-COMUN']);
 const disabled=screen(false);
 disabled.ctx.venElegirComprobante('VENTA-SIN-ARCA');
 assert.match(disabled.elements.venModal.innerHTML,/Ticket VICORA/); // selector remains useful without fiscal availability
});

test('explicit invoice choice sends only the existing sale reference, never a commercial mutation',async()=>{
 const {ctx,events}=screen(true);await ctx.venEmitirFiscalDesdeVenta('SALE-A');
 const call=events.find(e=>e[0]==='fiscal');assert.equal(JSON.stringify(call[1]),JSON.stringify({saleRef:'SALE-A'}));
});
test('expired commercial subscription blocks fiscal preparation before calling API',async()=>{
 const {ctx,events}=screen(true);ctx.vicoraExigirSuscripcionVigente=async()=>{throw Error('expired');};
 await ctx.venEmitirFiscalDesdeVenta('SALE-A');assert.equal(events.filter(e=>e[0]==='fiscal').length,0);
});
test('concurrent client retries share one preparation and server errors cannot become success',async()=>{
 let calls=0,resolve;const waiting=new Promise(r=>resolve=r);
 const db={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC'}}})}};
 const c=client({db,apiOrigin:'https://fiscal.invalid',fetchImpl:async()=>{calls++;await waiting;return {ok:true,json:async()=>({status:'PREPARADO_NO_EMITIDO',operation:'11111111-1111-4111-8111-111111111111',document_type:11,can_send:false,runtime_enabled:false})};}});
 const first=c.prepare({saleRef:'SALE-A'}),second=c.prepare({saleRef:'SALE-A'});await new Promise(r=>setImmediate(r));resolve();
 assert.deepEqual(await first,await second);assert.equal(calls,1);
 const rejected=client({db,apiOrigin:'https://fiscal.invalid',fetchImpl:async()=>({ok:false,json:async()=>({status:'PREPARADO_NO_EMITIDO',can_send:false,runtime_enabled:false})})});
 await assert.rejects(rejected.prepare({saleRef:'SALE-A'}));
});
test('timeout does not retry or invoke sale persistence; malformed and foreign-issuer client fields rejected',async()=>{
 let calls=0;const db={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC'}}})}};
 const c=client({db,apiOrigin:'https://fiscal.invalid',fetchImpl:async()=>{calls++;const e=new Error();e.name='AbortError';throw e;}});
 await assert.rejects(c.prepare({saleRef:'SALE-A'}),/no se reenvió/i);assert.equal(calls,1);
 await assert.rejects(c.prepare({saleRef:'SALE-A',issuer:'UNTRUSTED'}));assert.equal(calls,1);
});
