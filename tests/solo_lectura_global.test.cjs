// VICORA Comercial — solo lectura global: tests offline sin secretos ni red.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const page=read('index.html');
const code=read('solo_lectura.js');
const modules={
 'index.html':['abrirClienteFormulario','guardarCliente','alternarCliente','abrirProductoFormulario','guardarProducto','abrirAjusteStock','alternarProducto','clienteCobrarVenta'],
 'ventas.js':['venNueva','venGuardar','venAbrirAnulacion','venEjecutarAnulacion','venAbrirDevolucionParcial','venConfirmarDevolucionParcial'],
 'compras.js':['abrirCompraNueva','guardarCompraNueva','compraMostrarAgregar','agregarLineaCompra','quitarLineaCompra','guardarCondicionCompra','confirmarCompraActual','compraAbrirAnulacion','compraEjecutarAnulacion'],
 'proveedores.js':['abrirProveedorFormulario','guardarProveedor','alternarProveedor'],
 'pagos.js':['vpAbrirPago','vpGuardar'],
 'cobros.js':['vcAbrirCobro','vcGuardar'],
 'caja.js':['cjAbrir','cjRegistrar','cjCerrar','cjRpc'],
 'gastos.js':['vgNuevo','vgGuardar','vgPagar','vgConfirmarPago'],
 'presupuestos.js':['preNuevo','preGuardar','preEstado','preAbrirConversion','preConfirmarConversion']
};
function hoy(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function fecha(dias){
 const x=new Date(hoy()+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+dias);
 return x.toISOString().slice(0,10);
}
function boton(text){
 let attrs={};
 return {
  textContent:text,disabled:false,dataset:{},id:'',value:'',
  getAttribute(key){return attrs[key]??null},
  setAttribute(key,v){attrs[key]=v},
  hasAttribute(key){return Object.hasOwn(attrs,key)},
  removeAttribute(key){delete attrs[key]}
 };
}
function escena(){
 const acciones=[
  'Nueva compra','Agregar producto','Nuevo proveedor','Registrar cobro',
  'Registrar pago','Nuevo presupuesto','Abrir caja','Registrar movimiento','Pagar gasto','Cambiar estado',
  'Ver','Ver más','Detalle','Imprimir','Exportar PDF','Historial','Actualizar','Cerrar'
 ].map(boton);
 const estado={renovacion:false,aviso:null,bloqueo:false,listener:null};
 const cont={
  querySelector(selector){
   if(selector.includes('.vi-sub-head'))return estado.renovacion?{}:null;
   if(selector.includes('#vicoraAvisoSoloConsulta'))return estado.aviso;
   return null;
  },
  querySelectorAll(){return acciones},
  get firstChild(){return null},
  insertBefore(el){estado.aviso=el}
 };
 const body={classList:{toggle(cls,active){if(cls==='vicora-modo-consulta')estado.bloqueo=active}}};
 const document={
  getElementById(id){return id==='contenidoPrincipal'?cont:null},
  createElement(){return {id:'',style:{},setAttribute(){},textContent:'',remove(){estado.aviso=null}}},
  body,addEventListener(){}
 };
 const ctx={window:{},document,MutationObserver:class{observe(){}},perfil:{id_negocio:'NEG-LAB'},
  db:{from(){return {select(){return {eq(){return this},async maybeSingle(){return {data:null,error:null}}}}}}},
  Intl,Date,Object,String};
 vm.runInNewContext(code,ctx);
 return {api:ctx.window,acciones,estado};
}
test('Todos los módulos cargan sintaxis válida',()=>{
 new vm.Script(code);
 for(const name of Object.keys(modules)){
  if(name==='index.html'){
   const scripts=[...page.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
   for(const s of scripts)if(s[1].trim())new vm.Script(s[1]);
  }else new vm.Script(read(name));
 }
});
test('La interfaz tiene protecciones de mutación en todos los módulos operativos',()=>{
 assert.match(page,/solo_lectura\.js\?v=20261112-modo-consulta-v1/);
 assert.match(page,/vicoraSoloLecturaInicio\(suscripciones\[0\]\)/);
 assert.match(page,/vicoraSoloLecturaRefrescar\(\)/);
 for(const [file,names] of Object.entries(modules)){
  const source=read(file);
  for(const fn of names){
   const re=new RegExp('(?:async\\s+)?function\\s+'+fn+'\\s*\\([^)]*\\)\\s*\\{[\\s\\S]{0,90}?vicoraBloquearEdicion\\(\\)');
   assert.match(source,re,'Sin protección: '+file+':'+fn);
  }
 }
});
test('ACTIVA vencida: deshabilita acciones y conserva vista, filtros y exportación',()=>{
 const s=escena();
 s.api.vicoraSoloLecturaInicio({estado:'ACTIVA',proximo_vencimiento:fecha(-1)});
 assert.equal(s.estado.bloqueo,true);
 assert.ok(s.estado.aviso);
 for(const b of s.acciones){
  if(['Ver','Ver más','Detalle','Imprimir','Exportar PDF','Historial','Actualizar','Cerrar'].includes(b.textContent))assert.equal(b.disabled,false,b.textContent);
  else assert.equal(b.disabled,true,b.textContent);
 }
 assert.equal(s.api.vicoraBloquearEdicion(),true);
});
test('PRUEBA vencida y SUSPENDIDA bloquean; el último día ACTIVA y PRUEBA permite',()=>{
 const s=escena();
 for(const sub of [
  {estado:'PRUEBA',fecha_fin_prueba:fecha(-1)},
  {estado:'SUSPENDIDA',proximo_vencimiento:fecha(3)},
  {estado:'ACTIVA',proximo_vencimiento:null}
 ]){
  s.api.vicoraSoloLecturaFijar(sub);
  assert.equal(s.api.vicoraBloquearEdicion(),true);
 }
 for(const sub of [
  {estado:'ACTIVA',proximo_vencimiento:fecha(0)},
  {estado:'PRUEBA',fecha_fin_prueba:fecha(0)}
 ]){
  s.api.vicoraSoloLecturaFijar(sub);
  assert.equal(s.api.vicoraBloquearEdicion(),false);
  assert.equal(s.estado.bloqueo,false);
  assert.equal(s.estado.aviso,null);
  assert.ok(s.acciones.every(x=>!x.disabled));
 }
});
test('La pantalla Mi suscripción siempre habilita enviar comprobante y renovar',()=>{
 const s=escena();
 s.api.vicoraSoloLecturaInicio({estado:'ACTIVA',proximo_vencimiento:fecha(-1)});
 s.estado.renovacion=true;
 s.api.vicoraSoloLecturaFijar({estado:'ACTIVA',proximo_vencimiento:fecha(-1)});
 assert.equal(s.estado.bloqueo,false);
 assert.ok(s.acciones.every(x=>!x.disabled));
});
