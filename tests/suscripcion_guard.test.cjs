// Regresion de suscripciones: frontend + reglas estructurales SQL. SIN red ni datos reales.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const home=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sales=fs.readFileSync(path.join(__dirname,'..','ventas.js'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','DB','MIGRACIONES','20261112_guardia_suscripcion_escrituras.sql'),'utf8');
const start=home.indexOf('async function vicoraExigirSuscripcionVigente()');
const end=home.indexOf('async function obtenerClientesDB()',start);
assert(start>=0 && end>start,'Missing write-only date gate');
const fn=home.slice(start,end);

function dateAR(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
}
function relativeDate(days) {
  const d=new Date(dateAR()+'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
async function runGate(subscription,dbError=null){
  const eq=[];
  const ctx={
    perfil:{id_negocio:'NEG-SYNTHETIC'},
    clienteVerificarAcceso:async()=>{},
    db:{from(table){
      assert.equal(table,'suscripciones');
      return {select(fields){
        assert(fields.includes('fecha_fin_prueba'));
        assert(fields.includes('proximo_vencimiento'));
        return {eq(key,val){
          eq.push([key,val]);
          return this;
        },async maybeSingle(){return {data:subscription,error:dbError}}};
      }};
    }},
    Intl,Date,String,Object,Error
  };
  const check=vm.runInNewContext(fn+'; vicoraExigirSuscripcionVigente',ctx);
  let error=null;
  try {await check()} catch(e){error=String(e.message||e)}
  assert.deepEqual(eq,[['id_negocio','NEG-SYNTHETIC'],['id_sistema','SIS-000001']]);
  return error;
}
test('JavaScript principal y formulario de ventas compilan',()=>{
  const inlines=[...home.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for(const m of inlines) if(m[1].trim())new vm.Script(m[1]);
  new vm.Script(sales);
});
test('venta nueva y confirmacion revalidan la suscripcion',()=>{
  assert.match(sales,/async function venNueva\(\)\{try\{await vicoraExigirSuscripcionVigente\(\);/);
  assert.match(sales,/let idVenta=null;try\{await venAcceso\(\);await vicoraExigirSuscripcionVigente\(\);/);
});
test('ACTIVA vigente y dia de vencimiento permiten operar',async()=>{
  assert.equal(await runGate({estado:'ACTIVA',proximo_vencimiento:relativeDate(1)}),null);
  assert.equal(await runGate({estado:'ACTIVA',proximo_vencimiento:relativeDate(0)}),null);
});
test('ACTIVA vencida, nula y sin registro niegan',async()=>{
  for(const s of [
    {estado:'ACTIVA',proximo_vencimiento:relativeDate(-1)},
    {estado:'ACTIVA',proximo_vencimiento:null},
    null
  ])assert.match(await runGate(s),/suscripci[oó]n/i);
});
test('prueba dentro del plazo y vencida',async()=>{
  assert.equal(await runGate({estado:'PRUEBA',fecha_fin_prueba:relativeDate(0)}),null);
  assert.match(await runGate({estado:'PRUEBA',fecha_fin_prueba:relativeDate(-1)}),/vencida/i);
});
test('estados VENCIDA, SUSPENDIDA y PENDIENTE niegan aun con fecha futura',async()=>{
  for(const estado of ['VENCIDA','SUSPENDIDA','PENDIENTE'])
    assert.match(await runGate({estado,proximo_vencimiento:relativeDate(20)}),/vencida/i);
});
test('error del servidor nunca permite operar',async()=>{
  assert.match(await runGate({estado:'ACTIVA',proximo_vencimiento:relativeDate(20)},new Error('offline')),/No se pudo verificar/i);
});
test('bloqueo en base incluye RPC SECURITY DEFINER y tablas operativas',()=>{
  assert.match(sql,/RETURNS trigger[\s\S]*SECURITY DEFINER/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/s\.fecha_fin_prueba >= v_hoy/);
  assert.match(sql,/s\.proximo_vencimiento >= v_hoy/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  const m=sql.match(/tablas text\[\] := ARRAY\[([^\]]+)\]/);
  assert(m,'Missing protected table list');
  const protectedTables=[...m[1].matchAll(/'([a-z_]+)'/g)].map(x=>x[1]);
  assert.equal(protectedTables.length,23);
  for(const table of ['ventas','ventas_detalle','clientes','productos','compras','presupuestos','cajas','cobros_clientes'])
    assert(protectedTables.includes(table),table+' not guarded');
  for(const table of ['suscripciones','vicora_solicitudes_pago','pagos','usuarios','negocios'])
    assert(!protectedTables.includes(table),'Renewals/administration must remain accessible: '+table);
});
test('lectura historica de suscripcion no depende del estado ACTIVA',()=>{
  assert.match(home,/Conservamos acceso al historial y a Mi suscripcion/);
  assert.equal(home.includes("if(!suscripciones.some(s=>['ACTIVA','PRUEBA'].includes(String(s.estado||'').toUpperCase())))"),false);
});
