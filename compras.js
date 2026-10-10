/* VICORA Comercial · Paso 68.35 · Compras independiente */
'use strict';
let comprasActuales=[],comprasBusqueda='',comprasPagina=1,compraSeleccionada=null,compraLineas=[],compraProveedores=[],compraProductos=[];
const COMPRAS_PAGINA=15;
const compraEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compraMoney=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n)||0);
const compraFecha=d=>{if(!d)return '—';const s=String(d).slice(0,10).split('-');return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:compraEsc(d);};
const compraHoy=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const compraAviso=(t,m,tipo='info')=>notificarVicora(t,m,tipo);
async function compraAcceso(){await clienteVerificarAcceso();}
async function compraLeerTabla(tabla,campos,orden='fecha_alta'){
 const salida=[];let desde=0;
 while(true){const {data,error}=await db.from(tabla).select(campos).eq('id_negocio',perfil.id_negocio).order(orden,{ascending:false}).range(desde,desde+999);
  if(error)throw error;if((data||[]).some(x=>x.id_negocio!==perfil.id_negocio))throw new Error('Datos de otro negocio bloqueados.');
  salida.push(...(data||[]));if(!data||data.length<1000)break;desde+=1000;
 }return salida;
}
function mostrarCompras(boton){
 seleccionar(boton);comprasBusqueda='';comprasPagina=1;compraSeleccionada=null;
 $('contenidoPrincipal').innerHTML=`<h1 class="page-title">Compras</h1><p class="page-subtitle">Registro de compras a proveedores · ${compraEsc(negocio.nombre)}</p><div class="vi-client-toolbar"><input id="comprasBuscar" type="search" placeholder="Buscar compra, proveedor, comprobante..." oninput="compraBuscar()"><button class="vi-client-btn" onclick="abrirCompraNueva()">+ Nueva compra</button><button class="vi-client-btn alt" onclick="recargarCompras()">Actualizar</button></div><div id="comprasResumen" class="vi-client-count"></div><div id="comprasListado" class="vi-client-table-wrap"><div class="loading"><span class="spinner"></span>Cargando compras...</div></div><div id="comprasModal"></div>`;
 recargarCompras();
}
async function recargarCompras(){const el=$('comprasListado');if(!el)return;
 try{await compraAcceso();comprasActuales=await compraLeerTabla('compras','id_negocio,id_compra,id_proveedor,fecha_compra,tipo_comprobante,numero_comprobante,observaciones,subtotal,total,estado,fecha_alta,fecha_confirmacion,condicion_pago,importe_pago_inicial,medio_pago_inicial');
  compraProveedores=await compraLeerTabla('proveedores','id_negocio,id_proveedor,nombre,estado');
  if(el.isConnected)pintarCompras();
 }catch(e){if(el.isConnected)el.innerHTML=`<div class="vi-client-alert err">${compraEsc(e.message||e)}</div>`;compraAviso('Error al cargar compras',String(e.message||e),'error');}
}
function compraNombreProveedor(id){return compraProveedores.find(p=>p.id_proveedor===id)?.nombre||id;}
function compraBuscar(){comprasBusqueda=$('comprasBuscar')?.value||'';comprasPagina=1;pintarCompras();}
function pintarCompras(){const el=$('comprasListado');if(!el)return;const q=comprasBusqueda.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const lista=comprasActuales.filter(c=>!q||[c.id_compra,compraNombreProveedor(c.id_proveedor),c.numero_comprobante,c.tipo_comprobante,c.estado].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
 const sum=$('comprasResumen');if(sum)sum.textContent=`Total: ${comprasActuales.length} · Confirmadas: ${comprasActuales.filter(c=>c.estado==='CONFIRMADA').length} · Borradores: ${comprasActuales.filter(c=>c.estado==='BORRADOR').length} · Mostrando: ${lista.length}`;
 if(!lista.length){el.innerHTML='<div class="empty-state"><div class="empty-state-icon">🛒</div>No hay compras para mostrar.</div>';return;}
 const visibles=lista.slice(0,comprasPagina*COMPRAS_PAGINA);
 el.innerHTML=`<table class="vi-client-table"><thead><tr><th>ID</th><th>Fecha</th><th>Proveedor</th><th>Comprobante</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${visibles.map(c=>`<tr><td><strong>${compraEsc(c.id_compra)}</strong></td><td>${compraFecha(c.fecha_compra)}</td><td>${compraEsc(compraNombreProveedor(c.id_proveedor))}</td><td>${compraEsc([c.tipo_comprobante,c.numero_comprobante].filter(Boolean).join(' ')||'—')}</td><td>${c.estado==='BORRADOR'?'A calcular al confirmar':compraMoney(c.total)}</td><td><span class="vi-client-status ${c.estado==='ANULADA'?'off':''}">${compraEsc(c.estado)}</span></td><td><div class="vi-client-actions"><button type="button" data-compra-id="${compraEsc(c.id_compra)}">${c.estado==='BORRADOR'?'Continuar':'Ver'}</button></div></td></tr>`).join('')}</tbody></table>${visibles.length<lista.length?`<div class="vicora-ver-mas"><span>Mostrando ${visibles.length} de ${lista.length}</span><button class="vi-client-btn" onclick="compraVerMas()">Ver más</button></div>`:''}`;
}
function compraVerMas(){comprasPagina++;pintarCompras();}
function cerrarCompraModal(){const m=$('comprasModal');if(m)m.replaceChildren();}
async function abrirCompraNueva(){
 try{await compraAcceso();compraProveedores=await compraLeerTabla('proveedores','id_negocio,id_proveedor,nombre,estado');
 const activos=compraProveedores.filter(p=>p.estado==='ACTIVO');if(!activos.length)throw new Error('Primero registrá un proveedor activo en el módulo Proveedores.');
 $('comprasModal').innerHTML=`<div class="vi-prov-overlay"><div class="vi-prov-dialog" role="dialog" aria-modal="true" aria-label="Nueva compra"><h2>Nueva compra</h2><p class="vi-muted" style="margin-bottom:15px">Primero creá el borrador. Después agregá los productos y confirmá para actualizar el stock.</p><form id="compraNuevaForm" onsubmit="guardarCompraNueva(event)"><div class="vi-prov-fields"><label>Proveedor *<select name="id_proveedor" required>${activos.map(p=>`<option value="${compraEsc(p.id_proveedor)}">${compraEsc(p.nombre)}</option>`).join('')}</select></label><label>Fecha de compra *<input name="fecha_compra" type="date" required value="${compraHoy()}"></label><label>Tipo de comprobante<input name="tipo_comprobante" maxlength="70" placeholder="Factura A, B, remito..."></label><label>Número de comprobante<input name="numero_comprobante" maxlength="100"></label><label class="full">Observaciones<textarea name="observaciones" maxlength="2000"></textarea></label></div><p id="compraNuevaError" class="vi-prov-error" hidden></p><div class="vi-prov-footer"><button type="button" class="vi-client-btn alt" onclick="cerrarCompraModal()">Cancelar</button><button type="submit" class="vi-client-btn" id="compraNuevaGuardar">Crear borrador</button></div></form></div></div>`;
 }catch(e){compraAviso('No se puede crear la compra',String(e.message||e),'error');}
}
async function guardarCompraNueva(e){e.preventDefault();const f=e.currentTarget,btn=$('compraNuevaGuardar'),err=$('compraNuevaError');btn.disabled=true;err.hidden=true;
 try{await compraAcceso();const v=k=>String(f.elements.namedItem(k)?.value||'').trim();const prov=v('id_proveedor');if(!compraProveedores.some(p=>p.id_proveedor===prov&&p.estado==='ACTIVO'))throw new Error('Seleccioná un proveedor activo.');
 const datos={id_negocio:perfil.id_negocio,id_proveedor:prov,fecha_compra:v('fecha_compra'),tipo_comprobante:v('tipo_comprobante')||null,numero_comprobante:v('numero_comprobante')||null,observaciones:v('observaciones')||null,estado:'BORRADOR'};
 const {data,error}=await db.from('compras').insert(datos).select('id_compra').single();if(error)throw error;
 cerrarCompraModal();await recargarCompras();compraAviso('Borrador creado',`Compra ${data.id_compra}. Ahora agregá los productos.`,'exito');await abrirCompraDetalle(data.id_compra);
 }catch(x){err.textContent=String(x.message||x);err.hidden=false;compraAviso('No se pudo crear la compra',String(x.message||x),'error');}finally{if(btn.isConnected)btn.disabled=false;}
}
async function abrirCompraDetalle(id){
 try{await compraAcceso();const {data,error}=await db.from('compras').select('id_negocio,id_compra,id_proveedor,fecha_compra,tipo_comprobante,numero_comprobante,observaciones,total,estado,fecha_confirmacion,condicion_pago,importe_pago_inicial,medio_pago_inicial').eq('id_negocio',perfil.id_negocio).eq('id_compra',id).single();if(error)throw error;
 compraSeleccionada=data;const {data:det,error:de}=await db.from('compras_detalle').select('numero_linea,id_producto,cantidad,precio_compra,subtotal').eq('id_negocio',perfil.id_negocio).eq('id_compra',id).order('numero_linea');if(de)throw de;compraLineas=det||[];
 compraProductos=await compraLeerTabla('productos','id_negocio,id_producto,codigo,nombre,precio_compra,unidad_medida,stock,estado');
 pintarCompraDetalle();
 }catch(e){compraAviso('No se pudo abrir la compra',String(e.message||e),'error');}
}
function compraProducto(id){return compraProductos.find(p=>p.id_producto===id);}
function pintarCompraDetalle(){const c=compraSeleccionada;if(!c)return;const borrador=c.estado==='BORRADOR';const total=compraLineas.reduce((s,l)=>s+Math.round(Number(l.cantidad)*Number(l.precio_compra)*100)/100,0);
 const condicion=c.condicion_pago||'CUENTA_CORRIENTE';
 const opcionesCond=[['CUENTA_CORRIENTE','Cuenta corriente'],['CONTADO','Contado'],['PAGO_PARCIAL','Pago parcial']];
 const opcionesMed=[['EFECTIVO','Efectivo'],['TRANSFERENCIA','Transferencia'],['TARJETA','Tarjeta'],['CHEQUE','Cheque'],['OTRO','Otro']];
 const pagoPanel=borrador?`<section style="margin-top:20px;padding:16px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px"><h3 style="margin-bottom:12px">Condición de pago</h3><div class="vi-prov-fields"><label>Condición *<select id="compraCondicion" onchange="compraActualizarCamposPago()">${opcionesCond.map(([v,t])=>`<option value="${v}" ${condicion===v?'selected':''}>${t}</option>`).join('')}</select></label><label id="compraMedioCont">Medio de pago *<select id="compraMedio"><option value="">Seleccionar...</option>${opcionesMed.map(([v,t])=>`<option value="${v}" ${c.medio_pago_inicial===v?'selected':''}>${t}</option>`).join('')}</select></label><label id="compraImporteCont">Anticipo ($) *<input id="compraImporte" type="number" min="0.01" step="0.01" value="${compraEsc(c.importe_pago_inicial||'')}"></label></div><p class="vi-muted" style="margin-top:12px">Contado: se registra el pago completo. Cuenta corriente: queda pendiente. Pago parcial: se registra el anticipo. Guardá la condición antes de confirmar.</p><div class="vi-prov-footer"><button type="button" class="vi-client-btn" id="compraPagoGuardar" onclick="guardarCondicionCompra()">Guardar condición de pago</button></div></section>`:`<section style="margin-top:18px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><h3 style="margin-bottom:8px">Pago de la compra</h3><p>Condición: <strong>${compraEsc(opcionesCond.find(x=>x[0]===condicion)?.[1]||condicion)}</strong></p><p>Pago inicial: <strong>${compraMoney(condicion==='CONTADO'?c.total:c.importe_pago_inicial)}</strong></p><p>Saldo inicial pendiente: <strong>${compraMoney(Math.max(0,Number(c.total||0)-Number(condicion==='CONTADO'?c.total:c.importe_pago_inicial||0)))}</strong></p></section>`;
 const el=$('comprasModal');if(!el)return;
 el.innerHTML=`<div class="vi-prov-overlay"><div class="vi-prov-dialog" style="width:min(950px,100%)" role="dialog" aria-modal="true" aria-label="Detalle de compra"><h2>Compra ${compraEsc(c.id_compra)}</h2><div class="vi-prov-details" style="margin-bottom:18px"><div><small>Proveedor</small><strong>${compraEsc(compraNombreProveedor(c.id_proveedor))}</strong></div><div><small>Fecha</small><strong>${compraFecha(c.fecha_compra)}</strong></div><div><small>Comprobante</small><strong>${compraEsc([c.tipo_comprobante,c.numero_comprobante].filter(Boolean).join(' ')||'—')}</strong></div><div><small>Estado</small><strong>${compraEsc(c.estado)}</strong></div></div><h3 style="margin-bottom:12px">Productos de la compra</h3><div class="vi-client-table-wrap"><table class="vi-client-table" style="min-width:640px"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th>${borrador?'<th>Acción</th>':''}</tr></thead><tbody>${compraLineas.length?compraLineas.map(l=>`<tr><td>${compraEsc(compraProducto(l.id_producto)?.nombre||l.id_producto)}</td><td>${compraEsc(l.cantidad)}</td><td>${compraMoney(l.precio_compra)}</td><td>${compraMoney(Math.round(Number(l.cantidad)*Number(l.precio_compra)*100)/100)}</td>${borrador?`<td><button class="vi-client-btn warn" type="button" data-compra-borrar="${l.numero_linea}" style="padding:7px 10px">Quitar</button></td>`:''}</tr>`).join(''):`<tr><td colspan="${borrador?5:4}" style="text-align:center;color:#64748b">Todavía no hay productos.</td></tr>`}</tbody></table></div><p style="text-align:right;margin-top:15px;font-size:18px"><strong>Total: ${compraMoney(c.estado==='CONFIRMADA'?c.total:total)}</strong></p>${pagoPanel}${borrador?`<div id="compraAgregarContenedor" style="margin-top:18px"></div><p class="vi-muted" style="margin-top:12px">El stock aumenta únicamente cuando confirmás la compra.</p>`:''}<div class="vi-prov-footer"><button class="vi-client-btn alt" type="button" onclick="cerrarCompraModal()">Cerrar</button>${borrador?`<button class="vi-client-btn alt" type="button" onclick="compraMostrarAgregar()">+ Agregar producto</button><button class="vi-client-btn ok" type="button" onclick="confirmarCompraActual()" ${!compraLineas.length?'disabled':''}>Confirmar compra</button>`:''}${c.estado==='CONFIRMADA'?`<button class="vi-client-btn warn" type="button" onclick="compraAbrirAnulacion()">Anular compra</button>`:''}</div></div></div>`;
 if(borrador)compraActualizarCamposPago();
}
function compraMostrarAgregar(){const el=$('compraAgregarContenedor');if(!el)return;const productos=compraProductos.filter(p=>p.estado==='ACTIVO');if(!productos.length){compraAviso('Sin productos','Primero cargá productos activos.','advertencia');return;}
 el.innerHTML=`<form id="compraAgregarForm" onsubmit="agregarLineaCompra(event)" style="background:#f8fafc;border:1px solid #dbe3ec;border-radius:12px;padding:15px"><h3 style="margin-bottom:12px">Agregar producto</h3><div class="vi-prov-fields"><label>Producto *<select name="id_producto" required onchange="compraPrecioSugerido()"><option value="">Seleccionar producto...</option>${productos.map(p=>`<option value="${compraEsc(p.id_producto)}">${compraEsc(p.nombre)}${p.codigo?' · '+compraEsc(p.codigo):''}</option>`).join('')}</select></label><label>Cantidad *<input name="cantidad" type="number" step="0.001" min="0.001" required></label><label>Precio de compra unitario *<input name="precio_compra" type="number" step="0.01" min="0" required></label></div><p id="compraLineaError" class="vi-prov-error" hidden></p><div class="vi-prov-footer"><button class="vi-client-btn" id="compraLineaGuardar" type="submit">Guardar producto</button></div></form>`;
}
function compraPrecioSugerido(){const f=$('compraAgregarForm');if(!f)return;const p=compraProducto(f.elements.namedItem('id_producto').value);if(p)f.elements.namedItem('precio_compra').value=Number(p.precio_compra||0).toFixed(2);}
async function agregarLineaCompra(e){e.preventDefault();const f=e.currentTarget,btn=$('compraLineaGuardar'),err=$('compraLineaError'),c=compraSeleccionada;if(!c||c.estado!=='BORRADOR')return;btn.disabled=true;err.hidden=true;
 try{await compraAcceso();const id=f.elements.namedItem('id_producto').value,cant=Number(f.elements.namedItem('cantidad').value),precio=Number(f.elements.namedItem('precio_compra').value);
 if(!compraProducto(id)||compraProducto(id).estado!=='ACTIVO')throw new Error('Seleccioná un producto activo.');if(!Number.isFinite(cant)||cant<=0||!Number.isFinite(precio)||precio<0)throw new Error('Revisá la cantidad y el precio.');if(cant>999999999||precio>999999999)throw new Error('Cantidad o precio demasiado grande.');
 const linea=Math.max(0,...compraLineas.map(l=>Number(l.numero_linea)))+1;
 const {error}=await db.from('compras_detalle').insert({id_negocio:perfil.id_negocio,id_compra:c.id_compra,numero_linea:linea,id_producto:id,cantidad:cant,precio_compra:precio,subtotal:Math.round(cant*precio*100)/100});if(error)throw error;
 compraAviso('Producto agregado','El detalle de la compra se guardó.','exito');await abrirCompraDetalle(c.id_compra);
 }catch(x){err.textContent=String(x.message||x);err.hidden=false;compraAviso('No se pudo agregar el producto',String(x.message||x),'error');}finally{if(btn.isConnected)btn.disabled=false;}
}
async function quitarLineaCompra(n){const c=compraSeleccionada;if(!c||c.estado!=='BORRADOR')return;
 if(!await confirmarVicora('Quitar producto','¿Querés quitar este producto del borrador?',true))return;
 try{await compraAcceso();const {error}=await db.from('compras_detalle').delete().eq('id_negocio',perfil.id_negocio).eq('id_compra',c.id_compra).eq('numero_linea',n);if(error)throw error;compraAviso('Producto quitado','El borrador fue actualizado.','exito');await abrirCompraDetalle(c.id_compra);}catch(e){compraAviso('No se pudo quitar',String(e.message||e),'error');}
}
function compraActualizarCamposPago(){
 const condicion=$('compraCondicion')?.value;
 const medio=$('compraMedioCont'),importe=$('compraImporteCont');
 if(medio)medio.style.display=condicion==='CUENTA_CORRIENTE'?'none':'';
 if(importe)importe.style.display=condicion==='PAGO_PARCIAL'?'':'none';
}
async function guardarCondicionCompra(){
 const c=compraSeleccionada;if(!c||c.estado!=='BORRADOR')return false;
 const btn=$('compraPagoGuardar'),condicion=$('compraCondicion')?.value;
 const medio=condicion==='CUENTA_CORRIENTE'?null:($('compraMedio')?.value||null);
 const importe=condicion==='PAGO_PARCIAL'?Number($('compraImporte')?.value):0;
 const total=compraLineas.reduce((sum,l)=>sum+Math.round(Number(l.cantidad)*Number(l.precio_compra)*100)/100,0);
 try{
  if(condicion!=='CUENTA_CORRIENTE'&&!medio)throw new Error('Seleccioná el medio de pago.');
  if(condicion==='PAGO_PARCIAL'&&(!Number.isFinite(importe)||importe<=0||importe>=total))throw new Error('El anticipo debe ser mayor a cero y menor al total de la compra.');
  if(btn)btn.disabled=true;
  await compraAcceso();
  const {data,error}=await db.from('compras').update({condicion_pago:condicion,importe_pago_inicial:importe,medio_pago_inicial:medio}).eq('id_negocio',perfil.id_negocio).eq('id_compra',c.id_compra).eq('estado','BORRADOR').select('id_compra').single();
  if(error)throw error;if(!data)throw new Error('No se encontró el borrador.');
  c.condicion_pago=condicion;c.importe_pago_inicial=importe;c.medio_pago_inicial=medio;
  compraAviso('Condición guardada','La forma de pago quedó registrada en el borrador.','exito');return true;
 }catch(e){compraAviso('No se pudo guardar el pago',String(e.message||e),'error');return false;}
 finally{if(btn?.isConnected)btn.disabled=false;}
}
async function confirmarCompraActual(){const c=compraSeleccionada;if(!c||c.estado!=='BORRADOR'||!compraLineas.length)return;
 const condicion=$('compraCondicion')?.value||c.condicion_pago||'CUENTA_CORRIENTE';
 const importe=condicion==='PAGO_PARCIAL'?Number($('compraImporte')?.value):condicion==='CONTADO'?compraLineas.reduce((sum,l)=>sum+Math.round(Number(l.cantidad)*Number(l.precio_compra)*100)/100,0):0;
 if(!await confirmarVicora('Confirmar compra',`¿Confirmás la compra ${c.id_compra}? Se actualizará el stock y ${condicion==='CUENTA_CORRIENTE'?'quedará el saldo pendiente':`se registrará un pago de ${compraMoney(importe)}`}. Esta operación no se puede deshacer desde esta pantalla.`))return;
 if(!await guardarCondicionCompra())return;
 try{await compraAcceso();const {data,error}=await db.rpc('confirmar_compra',{p_id_negocio:perfil.id_negocio,p_id_compra:c.id_compra});if(error)throw error;
 if(data?.ok===false)throw new Error(data.mensaje||'No se pudo confirmar la compra.');
 compraAviso('Compra confirmada',`Stock actualizado. Pago inicial: ${compraMoney(data?.pago_inicial||0)}. Saldo pendiente: ${compraMoney(data?.saldo_pendiente||0)}.`,'exito');await recargarCompras();await abrirCompraDetalle(c.id_compra);
 }catch(e){compraAviso('No se pudo confirmar',String(e.message||e),'error');}
}
document.addEventListener('click',e=>{const abrir=e.target.closest('[data-compra-id]');if(abrir){abrirCompraDetalle(abrir.dataset.compraId);return;}const borrar=e.target.closest('[data-compra-borrar]');if(borrar)quitarLineaCompra(Number(borrar.dataset.compraBorrar));});

// =========================================================
// ANULACION DE COMPRAS · VICORA
// La operación de stock, reintegro y estado se ejecuta
// exclusivamente en la RPC transaccional de Supabase.
// =========================================================
function compraAbrirAnulacion(){
 const c=compraSeleccionada;
 if(!c||c.estado!=='CONFIRMADA')return;
 const el=$('comprasModal');if(!el)return;
 el.innerHTML=`<div class="vi-prov-overlay"><div class="vi-prov-dialog" style="width:min(560px,100%)" role="dialog" aria-modal="true" aria-label="Anular compra">
 <h2>Anular compra ${compraEsc(c.id_compra)}</h2>
 <p class="vi-muted" style="margin:10px 0 16px">Se descontarán del stock los productos ingresados en esta compra. Si no hay existencias suficientes, Supabase impedirá la anulación. Los pagos realizados quedarán registrados en el historial.</p>
 <form id="compraAnularForm" onsubmit="compraEjecutarAnulacion(event)">
 <div class="vi-prov-fields">
 <label class="full">Motivo de anulación *<textarea name="motivo" minlength="5" maxlength="2000" required placeholder="Explicá por qué se anula la compra"></textarea></label>
 <label class="full" style="display:flex;align-items:center;gap:10px"><input type="checkbox" name="reintegrado" id="compraReintegrado" onchange="compraActualizarDevolucion()" style="width:auto">El proveedor ya devolvió todo el dinero pagado</label>
 <label class="full" id="compraMedioDevolucionCont" style="display:none">Medio del reintegro *<select name="medio"><option value="">Seleccionar...</option><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="OTRO">Otro</option></select></label>
 </div>
 <p class="vi-muted" style="margin-top:12px">Si el proveedor todavía no devolvió el dinero, dejá la casilla desmarcada. El reintegro quedará pendiente y no se registrará ingreso en Caja.</p>
 <p id="compraAnularError" class="vi-prov-error" hidden></p>
 <div class="vi-prov-footer"><button type="button" class="vi-client-btn alt" onclick="abrirCompraDetalle(compraSeleccionada.id_compra)">Volver</button><button type="submit" id="compraAnularGuardar" class="vi-client-btn warn">Confirmar anulación</button></div>
 </form></div></div>`;
}
function compraActualizarDevolucion(){
 const activo=Boolean($('compraReintegrado')?.checked);
 const cont=$('compraMedioDevolucionCont');
 if(cont)cont.style.display=activo?'':'none';
 const sel=$('compraAnularForm')?.elements.namedItem('medio');
 if(sel)sel.required=activo;
}
async function compraEjecutarAnulacion(event){
 event.preventDefault();
 const form=event.currentTarget, c=compraSeleccionada;
 if(!c||c.estado!=='CONFIRMADA')return;
 const btn=$('compraAnularGuardar'),err=$('compraAnularError');
 const motivo=String(form.elements.namedItem('motivo')?.value||'').trim();
 const reintegrado=Boolean(form.elements.namedItem('reintegrado')?.checked);
 const medio=reintegrado?String(form.elements.namedItem('medio')?.value||''):null;
 if(motivo.length<5){err.textContent='Ingresá un motivo de al menos 5 caracteres.';err.hidden=false;return;}
 if(reintegrado&&!medio){err.textContent='Seleccioná el medio del reintegro.';err.hidden=false;return;}
 if(!await confirmarVicora('Anular compra',`¿Confirmás la anulación de ${c.id_compra}? Se descontará el stock y ${reintegrado?'se registrará en Caja el dinero reintegrado por el proveedor':'el reintegro del proveedor quedará pendiente si hubo pagos'}. Esta operación no se puede deshacer.`,true))return;
 if(btn)btn.disabled=true;
 if(err)err.hidden=true;
 try{
  await compraAcceso();
  const {data,error}=await db.rpc('anular_compra',{
   p_id_negocio:perfil.id_negocio,
   p_id_compra:c.id_compra,
   p_motivo:motivo,
   p_devolver_dinero:reintegrado,
   p_medio_devolucion:medio
  });
  if(error)throw error;
  if(data?.ok===false)throw new Error(data.mensaje||'No se pudo anular la compra.');
  compraAviso('Compra anulada',`Compra ${c.id_compra} anulada. Reintegrado: ${compraMoney(data?.importe_devuelto||0)}. Pendiente: ${compraMoney(data?.importe_pendiente||0)}.`,'exito');
  await recargarCompras();
  await abrirCompraDetalle(c.id_compra);
 }catch(e){
  if(err?.isConnected){err.textContent=String(e.message||e);err.hidden=false;}
  compraAviso('No se pudo anular la compra',String(e.message||e),'error');
 }finally{if(btn?.isConnected)btn.disabled=false;}
}
