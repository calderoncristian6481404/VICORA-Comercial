/* VICORA Comercial · Paso 68.23 · Compras independiente */
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
 try{await compraAcceso();comprasActuales=await compraLeerTabla('compras','id_negocio,id_compra,id_proveedor,fecha_compra,tipo_comprobante,numero_comprobante,observaciones,subtotal,total,estado,fecha_alta,fecha_confirmacion');
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
 try{await compraAcceso();const {data,error}=await db.from('compras').select('id_negocio,id_compra,id_proveedor,fecha_compra,tipo_comprobante,numero_comprobante,observaciones,total,estado,fecha_confirmacion').eq('id_negocio',perfil.id_negocio).eq('id_compra',id).single();if(error)throw error;
 compraSeleccionada=data;const {data:det,error:de}=await db.from('compras_detalle').select('numero_linea,id_producto,cantidad,precio_compra,subtotal').eq('id_negocio',perfil.id_negocio).eq('id_compra',id).order('numero_linea');if(de)throw de;compraLineas=det||[];
 compraProductos=await compraLeerTabla('productos','id_negocio,id_producto,codigo,nombre,precio_compra,unidad_medida,stock,estado');
 pintarCompraDetalle();
 }catch(e){compraAviso('No se pudo abrir la compra',String(e.message||e),'error');}
}
function compraProducto(id){return compraProductos.find(p=>p.id_producto===id);}
function pintarCompraDetalle(){const c=compraSeleccionada;if(!c)return;const borrador=c.estado==='BORRADOR';const total=compraLineas.reduce((s,l)=>s+Math.round(Number(l.cantidad)*Number(l.precio_compra)*100)/100,0);
 const el=$('comprasModal');if(!el)return;
 el.innerHTML=`<div class="vi-prov-overlay"><div class="vi-prov-dialog" style="width:min(950px,100%)" role="dialog" aria-modal="true" aria-label="Detalle de compra"><h2>Compra ${compraEsc(c.id_compra)}</h2><div class="vi-prov-details" style="margin-bottom:18px"><div><small>Proveedor</small><strong>${compraEsc(compraNombreProveedor(c.id_proveedor))}</strong></div><div><small>Fecha</small><strong>${compraFecha(c.fecha_compra)}</strong></div><div><small>Comprobante</small><strong>${compraEsc([c.tipo_comprobante,c.numero_comprobante].filter(Boolean).join(' ')||'—')}</strong></div><div><small>Estado</small><strong>${compraEsc(c.estado)}</strong></div></div><h3 style="margin-bottom:12px">Productos de la compra</h3><div class="vi-client-table-wrap"><table class="vi-client-table" style="min-width:640px"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th>${borrador?'<th>Acción</th>':''}</tr></thead><tbody>${compraLineas.length?compraLineas.map(l=>`<tr><td>${compraEsc(compraProducto(l.id_producto)?.nombre||l.id_producto)}</td><td>${compraEsc(l.cantidad)}</td><td>${compraMoney(l.precio_compra)}</td><td>${compraMoney(Math.round(Number(l.cantidad)*Number(l.precio_compra)*100)/100)}</td>${borrador?`<td><button class="vi-client-btn warn" type="button" data-compra-borrar="${l.numero_linea}" style="padding:7px 10px">Quitar</button></td>`:''}</tr>`).join(''):`<tr><td colspan="${borrador?5:4}" style="text-align:center;color:#64748b">Todavía no hay productos.</td></tr>`}</tbody></table></div><p style="text-align:right;margin-top:15px;font-size:18px"><strong>Total: ${compraMoney(c.estado==='CONFIRMADA'?c.total:total)}</strong></p>${borrador?`<div id="compraAgregarContenedor" style="margin-top:18px"></div><p class="vi-muted" style="margin-top:12px">El stock aumenta únicamente cuando confirmás la compra.</p>`:''}<div class="vi-prov-footer"><button class="vi-client-btn alt" type="button" onclick="cerrarCompraModal()">Cerrar</button>${borrador?`<button class="vi-client-btn alt" type="button" onclick="compraMostrarAgregar()">+ Agregar producto</button><button class="vi-client-btn ok" type="button" onclick="confirmarCompraActual()" ${!compraLineas.length?'disabled':''}>Confirmar compra</button>`:''}</div></div></div>`;
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
async function confirmarCompraActual(){const c=compraSeleccionada;if(!c||c.estado!=='BORRADOR'||!compraLineas.length)return;
 if(!await confirmarVicora('Confirmar compra',`¿Confirmás la compra ${c.id_compra}? Esta operación sumará las cantidades al stock y no podrá deshacerse desde esta pantalla.`))return;
 try{await compraAcceso();const {data,error}=await db.rpc('confirmar_compra',{p_id_negocio:perfil.id_negocio,p_id_compra:c.id_compra});if(error)throw error;
 if(data?.ok===false)throw new Error(data.mensaje||'No se pudo confirmar la compra.');
 compraAviso('Compra confirmada','El stock se actualizó automáticamente.','exito');await recargarCompras();await abrirCompraDetalle(c.id_compra);
 }catch(e){compraAviso('No se pudo confirmar',String(e.message||e),'error');}
}
document.addEventListener('click',e=>{const abrir=e.target.closest('[data-compra-id]');if(abrir){abrirCompraDetalle(abrir.dataset.compraId);return;}const borrar=e.target.closest('[data-compra-borrar]');if(borrar)quitarLineaCompra(Number(borrar.dataset.compraBorrar));});
