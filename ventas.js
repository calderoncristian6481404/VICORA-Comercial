/* VICORA Comercial · Ventas · Supabase · v1.0
   Requiere globales del index: db, perfil, negocio, seleccionar, esc,
   clienteVerificarAcceso, notificarVicora, confirmarVicora, $.
*/
'use strict';
let venVisibles=15;
function venVerMas(){venVisibles+=15;venPintar();}
const ventasUI={lista:[],productos:[],clientes:[],carrito:[],modalidad:'CONTADO',cliente:'',descuento:0,anticipo:0,medio:'EFECTIVO',busqueda:'',cargando:false,guardando:false};
const venDinero=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n)||0);
const venNumero=n=>Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:3});
const venFecha=v=>v?new Date(v).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}):'—';
const venError=e=>String(e?.message||e||'Error desconocido');
const venN=(n)=>Math.round((Number(n)||0)*100)/100;
function venToast(t,m,tipo='info'){notificarVicora(t,m,tipo);}
async function venAcceso(){await clienteVerificarAcceso();if(!db||!perfil?.id_negocio)throw new Error('Sesión no disponible.');}
function venEstado(v){return `<span class="badge ${v==='CONFIRMADA'?'badge-active':v==='ANULADA'?'badge-inactive':''}">${esc(v||'—')}</span>`;}
function venCss(){if(document.getElementById('ventasCss'))return;const s=document.createElement('style');s.id='ventasCss';s.textContent=`
.ven-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:18px}.ven-card{background:#fff;border:1px solid #e2e8f0;border-radius:15px;padding:19px;margin-bottom:16px}.ven-card h3{margin:0 0 15px;color:#172554}.ven-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.ven-row>*{min-width:0}.ven-input,.ven-select{padding:11px;border:1px solid #cbd5e1;border-radius:9px;font:inherit;width:100%;background:#fff}.ven-label{display:block;font-size:12px;color:#475569;font-weight:700;margin-bottom:6px}.ven-field{flex:1;min-width:145px}.ven-items{width:100%;border-collapse:collapse;font-size:13px;min-width:600px}.ven-items th,.ven-items td{padding:11px;border-bottom:1px solid #e2e8f0;text-align:left}.ven-items th{background:#f1f5f9}.ven-table{overflow:auto}.ven-muted{color:#64748b;font-size:12px}.ven-total{font-size:25px;font-weight:800;color:#172554}.ven-totals{display:grid;gap:9px}.ven-totals>div{display:flex;justify-content:space-between;gap:12px}.ven-list{width:100%;border-collapse:collapse;min-width:750px;font-size:13px}.ven-list th,.ven-list td{padding:12px;border-bottom:1px solid #e2e8f0;text-align:left}.ven-list th{background:#f1f5f9}.ven-qty{width:88px}.ven-product{display:flex;justify-content:space-between;gap:10px;padding:11px;border-bottom:1px solid #e2e8f0;align-items:center}.ven-product:last-child{border:0}.ven-busy{opacity:.6;pointer-events:none}.ven-info{padding:12px;border-radius:9px;background:#eff6ff;color:#1e40af;font-size:12px;margin:10px 0}.ven-empty{padding:24px;text-align:center;color:#64748b}.ven-modal{position:fixed;inset:0;z-index:3500;background:#0f172a99;display:grid;place-items:center;padding:18px}.ven-dialog{width:min(750px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;padding:24px}.ven-dialog h2{color:#172554;margin-bottom:15px}.ven-modal-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}@media(max-width:1000px){.ven-grid{grid-template-columns:1fr}}`;
s.textContent+=`
/* Botones del pie del detalle de venta: colores propios, sin depender del tema global. */
#venCerrarDetalle{background:#475569!important;color:#fff!important;border:1px solid #475569!important;font-weight:700}
#venCerrarDetalle:hover{background:#334155!important;border-color:#334155!important}
#venDevolucionParcial{background:#0d9488!important;color:#fff!important;border:1px solid #0d9488!important;font-weight:700}
#venDevolucionParcial:hover{background:#0f766e!important;border-color:#0f766e!important}
#venCerrarDetalle:focus-visible,#venDevolucionParcial:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
`;
s.textContent+=`
/* Botones de detalle de venta: estilos con prioridad sobre el tema global */
#venCerrarDetalle,#venCerrar {background:#dc2626!important;color:#fff!important;border:1px solid #dc2626!important;}
#venCerrarDetalle:hover,#venCerrar:hover{background:#b91c1c!important;}
#venAnular {background:#fff1f2!important;color:#be123c!important;border:1px solid #fda4af!important;}
#venAnular:hover{background:#ffe4e6!important;}
#venDevolucionParcial {background:#e6f6f4!important;color:#0f766e!important;border:1px solid #99d9d1!important;}
#venDevolucionParcial:hover{background:#d2efeb!important;}

/* En pantallas pequeñas, todos los botones del detalle deben quedar visibles. */
.ven-modal-foot{display:flex!important;flex-wrap:wrap!important;justify-content:flex-start!important;gap:9px!important;width:100%!important;min-width:0!important}
.ven-modal-foot .vi-client-btn{min-width:0!important;white-space:normal!important;overflow-wrap:break-word!important;flex:1 1 150px!important;padding:12px 10px!important;line-height:1.3!important}
@media(max-width:600px){.ven-modal{padding:8px!important}.ven-dialog{padding:16px!important;max-height:calc(100dvh - 16px)!important;width:100%!important}.ven-modal-foot{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.ven-modal-foot .vi-client-btn{width:100%!important;min-height:48px!important}.ven-modal-foot #venCerrarDetalle{order:4}.ven-modal-foot #venImprimir{order:1}.ven-modal-foot #venDevolucionParcial{order:2}.ven-modal-foot #venAnular{order:3}}

/* VICORA: acciones del detalle de ventas, sin desplazamiento horizontal en celular */
#venModal .ven-dialog{max-width:100%;min-width:0;box-sizing:border-box}
#venModal .ven-modal-foot{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;
  width:100%!important;min-width:0!important;gap:10px!important;justify-content:stretch!important}
#venModal .ven-modal-foot > button{display:flex!important;align-items:center!important;justify-content:center!important;
  width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;
  margin:0!important;padding:12px 7px!important;white-space:normal!important;
  overflow-wrap:anywhere!important;word-break:normal!important;line-height:1.25!important;
  font-size:13px!important;text-align:center!important}
#venModal #venCerrarDetalle,#venModal #venCerrar{background:#dc2626!important;color:#fff!important;border-color:#dc2626!important}
#venModal #venConfirmar{background:#15803d!important;color:#fff!important;border-color:#15803d!important}
@media(max-width:420px){
 #venModal .ven-dialog{padding:12px!important}
 #venModal .ven-modal-foot > button{font-size:12px!important;padding:12px 5px!important}
}
`;document.head.appendChild(s);}
async function mostrarVentas(boton){venVisibles=15;seleccionar(boton);venCss();$('contenidoPrincipal').innerHTML=`<div class="module-header"><div><h1 class="page-title">Ventas</h1><p class="page-subtitle">Registro y seguimiento de ventas · ${esc(negocio.nombre)}</p></div><div class="ven-row"><button class="vi-client-btn alt" id="venConfigPrint">⚙ Impresión</button><button class="vi-client-btn" id="venNueva">+ Nueva venta</button></div></div><div class="ven-card"><div class="ven-row"><div class="ven-field"><label class="ven-label" for="venBuscar">Buscar por número o cliente</label><input id="venBuscar" class="ven-input" placeholder="Ej.: VEN-000001"></div><div><label class="ven-label" for="venFiltro">Estado</label><select id="venFiltro" class="ven-select"><option value="">Todos</option><option>BORRADOR</option><option>CONFIRMADA</option><option>ANULADA</option></select></div><button class="vi-client-btn alt" id="venRecargar">Actualizar</button></div><div class="ven-muted" id="venContador" style="margin:14px 0">Cargando ventas...</div><div class="ven-table" id="venTabla"></div></div><div id="venModal"></div>`;
$('venConfigPrint').onclick=venConfigImpresion;$('venNueva').onclick=venNueva;$('venRecargar').onclick=venCargar;$('venBuscar').oninput=()=>{venVisibles=15;venPintar();};$('venFiltro').onchange=()=>{venVisibles=15;venPintar();};await venCargar();}
async function venCargar(){const t=$('venTabla');if(!t)return;t.innerHTML='<div class="ven-empty">Cargando...</div>';try{await venAcceso();const {data,error}=await db.from('ventas').select('id_venta,fecha_venta,cliente,total,modalidad_cobro,estado,cobrado_inicial').eq('id_negocio',perfil.id_negocio).order('fecha_venta',{ascending:false}).limit(500);if(error)throw error;ventasUI.lista=data||[];venPintar();}catch(e){t.innerHTML=`<div class="ven-empty">${esc(venError(e))}</div>`;venToast('No se pudieron cargar las ventas',venError(e),'error');}}
function venPintar(){const t=$('venTabla');if(!t)return;const q=($('venBuscar')?.value||'').toLocaleLowerCase(),estado=$('venFiltro')?.value||'';const lista=ventasUI.lista.filter(v=>(!estado||v.estado===estado)&&(!q||`${v.id_venta} ${v.cliente}`.toLocaleLowerCase().includes(q)));$('venContador').textContent=`Mostrando ${Math.min(venVisibles,lista.length)} de ${lista.length} ventas (últimas 500)`;t.innerHTML=lista.length?`<table class="ven-list"><thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Modalidad</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${lista.slice(0,venVisibles).map(v=>`<tr><td><strong>${esc(v.id_venta)}</strong></td><td>${esc(venFecha(v.fecha_venta))}</td><td>${esc(v.cliente)}</td><td>${venDinero(v.total)}</td><td>${esc(v.modalidad_cobro)}</td><td>${venEstado(v.estado)}</td><td><button class="vi-client-btn alt" data-ven-ver="${esc(v.id_venta)}">Ver</button></td></tr>`).join('')}</tbody></table>`:'<div class="ven-empty">No hay ventas para mostrar.</div>';if(lista.length>venVisibles)t.insertAdjacentHTML('beforeend',`<div class="vicora-ver-mas"><button class="vi-client-btn alt" onclick="venVerMas()">Ver más</button></div>`);t.querySelectorAll('[data-ven-ver]').forEach(b=>b.onclick=()=>venDetalle(b.dataset.venVer));}
async function venCatalogos(){await venAcceso();const [a,b]=await Promise.all([db.from('productos').select('id_producto,codigo,nombre,precio_venta,stock,unidad_medida,estado').eq('id_negocio',perfil.id_negocio).eq('estado','ACTIVO').order('nombre'),db.from('clientes').select('id_cliente,nombre,apellido,estado').eq('id_negocio',perfil.id_negocio).eq('estado','ACTIVO').order('nombre')]);if(a.error)throw a.error;if(b.error)throw b.error;ventasUI.productos=a.data||[];ventasUI.clientes=b.data||[];}
async function venNueva(){try{await venCatalogos();ventasUI.carrito=[];ventasUI.modalidad='CONTADO';ventasUI.cliente='';ventasUI.descuento=0;ventasUI.anticipo=0;ventasUI.medio='EFECTIVO';venFormulario();}catch(e){venToast('No se pudo abrir Nueva venta',venError(e),'error');}}
function venSubtotal(){return venN(ventasUI.carrito.reduce((s,p)=>s+venN(p.cantidad*p.precio),0));}
function venTotal(){return Math.max(0,venN(venSubtotal()-ventasUI.descuento));}
function venFormulario(){const m=$('venModal');if(!m)return;m.innerHTML=`<div class="ven-modal" id="venOverlay"><div class="ven-dialog" style="width:min(1050px,100%)"><div class="ven-row" style="justify-content:space-between;margin-bottom:17px"><h2>Nueva venta</h2><button class="vi-client-btn alt" id="venCerrar">Cerrar</button></div><div class="ven-grid"><section><div class="ven-card"><h3>Productos</h3><div class="ven-row"><div class="ven-field"><input class="ven-input" id="venProductoBuscar" placeholder="Buscar por nombre, código o lector de barras" autocomplete="off"></div></div><div id="venCatalogo" style="max-height:220px;overflow:auto"></div></div><div class="ven-card"><h3>Detalle</h3><div class="ven-table" id="venCarrito"></div></div></section><section><div class="ven-card"><h3>Cliente y cobro</h3><label class="ven-label">Cliente</label><select class="ven-select" id="venCliente"><option value="">Consumidor final</option>${ventasUI.clientes.map(c=>`<option value="${esc(c.id_cliente)}">${esc(`${c.nombre||''} ${c.apellido||''}`.trim())}</option>`).join('')}</select><label class="ven-label" style="margin-top:14px">Modalidad</label><select class="ven-select" id="venModalidad"><option value="CONTADO">Contado</option><option value="CUENTA_CORRIENTE">Cuenta corriente</option><option value="PARCIAL">Pago parcial</option></select><div id="venCobroCampos"></div><label class="ven-label" style="margin-top:14px">Descuento ($)</label><input class="ven-input" type="number" id="venDescuento" min="0" step="0.01" value="0"><div id="venTotales" style="margin-top:20px"></div></div><div class="ven-info">El stock se descuenta únicamente al confirmar. La confirmación registra también el cobro y su movimiento de Caja cuando corresponda.</div><button class="vi-client-btn ok" style="width:100%" id="venConfirmar">Confirmar venta</button><div class="ven-muted" style="margin-top:10px">Si ocurre un error antes de confirmar, la venta puede quedar como borrador.</div></section></div></div></div>`;
$('venCerrar').onclick=venCerrar;$('venProductoBuscar').oninput=venCatalogoPintar;$('venProductoBuscar').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const q=e.currentTarget.value.trim().toLowerCase();const p=ventasUI.productos.find(p=>String(p.codigo||'').toLowerCase()===q);if(p){venAgregar(p.id_producto);e.currentTarget.value='';venCatalogoPintar();}}};$('venCliente').onchange=e=>{ventasUI.cliente=e.target.value;venResumen();};$('venModalidad').onchange=e=>{ventasUI.modalidad=e.target.value;venCobroPintar();venResumen();};$('venDescuento').oninput=e=>{ventasUI.descuento=venN(e.target.value);venResumen();};$('venConfirmar').onclick=venGuardar;venCatalogoPintar();venCarritoPintar();venCobroPintar();venResumen();}
function venCerrar(){$('venModal').innerHTML='';}
function venCatalogoPintar(){const el=$('venCatalogo');if(!el)return;const q=($('venProductoBuscar').value||'').trim().toLowerCase();const ps=ventasUI.productos.filter(p=>!q||`${p.codigo||''} ${p.nombre}`.toLowerCase().includes(q)).slice(0,30);el.innerHTML=ps.length?ps.map(p=>`<div class="ven-product"><div><strong>${esc(p.nombre)}</strong> <span class="ven-muted">${esc(p.codigo||'')}</span><div class="ven-muted">${venDinero(p.precio_venta)} · Stock: ${venNumero(p.stock)} ${esc(p.unidad_medida||'')}</div></div><button class="vi-client-btn alt" data-ven-add="${esc(p.id_producto)}" ${Number(p.stock)<=0?'disabled':''}>Agregar</button></div>`).join(''):'<div class="ven-empty">No se encontraron productos.</div>';el.querySelectorAll('[data-ven-add]').forEach(b=>b.onclick=()=>venAgregar(b.dataset.venAdd));}
function venAgregar(id){const p=ventasUI.productos.find(x=>x.id_producto===id);if(!p)return;const actual=ventasUI.carrito.find(x=>x.id===id);if(actual){if(actual.cantidad+1>Number(p.stock)){venToast('Stock insuficiente',p.nombre,'advertencia');return;}actual.cantidad+=1;}else{if(Number(p.stock)<=0)return;ventasUI.carrito.push({id,nombre:p.nombre,codigo:p.codigo,unidad:p.unidad_medida,stock:Number(p.stock),cantidad:1,precio:venN(p.precio_venta)});}venCarritoPintar();venResumen();}
function venCarritoPintar(){const el=$('venCarrito');if(!el)return;el.innerHTML=ventasUI.carrito.length?`<table class="ven-items"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody>${ventasUI.carrito.map(p=>`<tr><td>${esc(p.nombre)}</td><td><input class="ven-input ven-qty" type="number" min="0.001" max="${p.stock}" step="0.001" value="${p.cantidad}" data-ven-qty="${esc(p.id)}"></td><td>${venDinero(p.precio)}</td><td>${venDinero(venN(p.cantidad*p.precio))}</td><td><button class="vi-client-btn alt" data-ven-del="${esc(p.id)}">Quitar</button></td></tr>`).join('')}</tbody></table>`:'<div class="ven-empty">Agregá productos para comenzar.</div>';el.querySelectorAll('[data-ven-qty]').forEach(inp=>inp.onchange=()=>{const p=ventasUI.carrito.find(x=>x.id===inp.dataset.venQty);if(!p)return;const n=Number(inp.value);if(!Number.isFinite(n)||n<=0||n>p.stock){venToast('Cantidad inválida',`Stock disponible: ${venNumero(p.stock)}`,'advertencia');venCarritoPintar();return;}p.cantidad=Math.round(n*1000)/1000;venCarritoPintar();venResumen();});el.querySelectorAll('[data-ven-del]').forEach(b=>b.onclick=()=>{ventasUI.carrito=ventasUI.carrito.filter(p=>p.id!==b.dataset.venDel);venCarritoPintar();venResumen();});}
function venCobroPintar(){const el=$('venCobroCampos');if(!el)return;const m=ventasUI.modalidad;el.innerHTML=m==='CUENTA_CORRIENTE'?'<p class="ven-info">La venta quedará pendiente de cobro.</p>':`<label class="ven-label" style="margin-top:14px">Medio de pago</label><select class="ven-select" id="venMedio"><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option><option value="OTRO">Otro</option></select>${m==='PARCIAL'?'<label class="ven-label" style="margin-top:14px">Importe cobrado inicialmente ($)</label><input class="ven-input" type="number" id="venAnticipo" min="0.01" step="0.01" value="'+ventasUI.anticipo+'">':''}`;if($('venMedio')){$('venMedio').value=ventasUI.medio;$('venMedio').onchange=e=>ventasUI.medio=e.target.value;}if($('venAnticipo'))$('venAnticipo').oninput=e=>{ventasUI.anticipo=venN(e.target.value);venResumen();};}
function venResumen(){const el=$('venTotales');if(!el)return;const total=venTotal(),cobrado=ventasUI.modalidad==='CONTADO'?total:ventasUI.modalidad==='PARCIAL'?ventasUI.anticipo:0;el.innerHTML=`<div class="ven-totals"><div><span>Subtotal</span><strong>${venDinero(venSubtotal())}</strong></div><div><span>Descuento</span><strong>− ${venDinero(ventasUI.descuento)}</strong></div><hr><div><strong>Total</strong><strong class="ven-total">${venDinero(total)}</strong></div><div><span>Cobro inicial</span><strong>${venDinero(cobrado)}</strong></div><div><span>Saldo pendiente</span><strong>${venDinero(Math.max(0,total-cobrado))}</strong></div></div>`;}
async function venGuardar(){if(ventasUI.guardando)return;const cart=ventasUI.carrito.map(p=>({...p})),modalidad=ventasUI.modalidad,idCliente=ventasUI.cliente,descuento=ventasUI.descuento,anticipo=ventasUI.anticipo,medio=ventasUI.medio,total=venTotal();if(!cart.length)return venToast('Faltan productos','Agregá al menos un producto.','advertencia');if(total<=0||descuento<0||descuento>venSubtotal())return venToast('Importe inválido','Revisá el descuento y el total.','advertencia');if(modalidad!=='CONTADO'&&!idCliente)return venToast('Seleccioná un cliente','Cuenta corriente y pago parcial requieren cliente registrado.','advertencia');if(modalidad==='PARCIAL'&&!(anticipo>0&&anticipo<total))return venToast('Cobro parcial inválido','El anticipo debe ser mayor que cero y menor al total.','advertencia');if(cart.some(p=>p.cantidad<=0||p.cantidad>p.stock||!Number.isFinite(p.cantidad)))return venToast('Cantidad inválida','Revisá las cantidades y el stock.','advertencia');const ok=await confirmarVicora('Confirmar venta',`¿Registrar la venta por ${venDinero(total)}? Se descontará stock y se registrará el cobro correspondiente.`);if(!ok)return;ventasUI.guardando=true;const btn=$('venConfirmar');if(btn){btn.disabled=true;btn.textContent='Registrando venta...';}let idVenta=null;try{await venAcceso();const cliente=ventasUI.clientes.find(c=>c.id_cliente===idCliente);const nombreCliente=cliente?`${cliente.nombre||''} ${cliente.apellido||''}`.trim():'Consumidor final';const payload={id_negocio:perfil.id_negocio,id_cliente:idCliente||null,cliente:nombreCliente,descuento,modalidad_cobro:modalidad,medio_pago:modalidad==='CUENTA_CORRIENTE'?null:medio,cobrado_inicial:modalidad==='PARCIAL'?anticipo:0,estado:'BORRADOR'};const {data:venta,error:ev}=await db.from('ventas').insert(payload).select('id_venta').single();if(ev)throw ev;idVenta=venta.id_venta;const detalles=cart.map((p,i)=>({id_negocio:perfil.id_negocio,id_venta:idVenta,numero_linea:i+1,id_producto:p.id,cantidad:p.cantidad,precio_unitario:p.precio,subtotal:venN(p.cantidad*p.precio)}));const {error:ed}=await db.from('ventas_detalle').insert(detalles);if(ed)throw ed;const {data:conf,error:ec}=await db.rpc('confirmar_venta',{p_id_negocio:perfil.id_negocio,p_id_venta:idVenta});if(ec)throw ec;if(!conf?.ok)throw new Error('Supabase no confirmó la operación.');venCerrar();venToast('Venta confirmada',`${idVenta} · Total: ${venDinero(conf.total)} · Saldo: ${venDinero(conf.saldo_pendiente)}`,'exito');await venCargar();}catch(e){venToast('No se pudo confirmar',`${venError(e)}${idVenta?' · Borrador: '+idVenta:''}`,'error');if(idVenta){venCerrar();await venCargar();}}finally{ventasUI.guardando=false;if(btn?.isConnected){btn.disabled=false;btn.textContent='Confirmar venta';}}}
async function venDetalle(id){try{await venAcceso();const [a,b,c,d]=await Promise.all([db.from('ventas').select('*').eq('id_negocio',perfil.id_negocio).eq('id_venta',id).single(),db.from('ventas_detalle').select('numero_linea,id_producto,cantidad,precio_unitario,subtotal').eq('id_negocio',perfil.id_negocio).eq('id_venta',id).order('numero_linea'),db.from('cobros_clientes').select('fecha_cobro,importe,medio_pago,origen,estado').eq('id_negocio',perfil.id_negocio).eq('id_venta',id).order('fecha_cobro'),db.from('cuentas_cobrar').select('saldo_pendiente,estado,total_cobrado').eq('id_negocio',perfil.id_negocio).eq('id_venta',id).maybeSingle()]);for(const r of [a,b,c,d])if(r.error)throw r.error;const v=a.data,det=b.data||[],cob=c.data||[],deuda=d.data;const modal=$('venModal');modal.innerHTML=`<div class="ven-modal"><div class="ven-dialog"><h2>Venta ${esc(v.id_venta)}</h2><div class="ven-row" style="justify-content:space-between"><span>${esc(venFecha(v.fecha_venta))} · ${esc(v.cliente)}</span>${venEstado(v.estado)}</div><div class="ven-card" style="margin-top:16px"><h3>Productos</h3><div class="ven-table"><table class="ven-items"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${det.map(p=>{const prod=ventasUI.productos.find(x=>x.id_producto===p.id_producto);return `<tr><td>${esc(prod?.nombre||p.id_producto)}</td><td>${venNumero(p.cantidad)}</td><td>${venDinero(p.precio_unitario)}</td><td>${venDinero(p.subtotal)}</td></tr>`;}).join('')}</tbody></table></div><div class="ven-totals" style="margin-top:12px"><div><span>Descuento</span><strong>${venDinero(v.descuento)}</strong></div><div><strong>Total</strong><strong class="ven-total">${venDinero(v.total)}</strong></div><div><span>Saldo pendiente</span><strong>${venDinero(deuda?.saldo_pendiente||0)}</strong></div></div></div><div class="ven-card"><h3>Cobros registrados</h3>${cob.length?cob.map(p=>`<div class="ven-product"><span>${esc(venFecha(p.fecha_cobro))} · ${esc(p.medio_pago)} · ${esc(p.origen)}</span><strong>${venDinero(p.importe)}</strong></div>`).join(''):'<div class="ven-muted">Sin cobros registrados.</div>'}</div><div class="ven-modal-foot"><button class="vi-client-btn alt" id="venCerrarDetalle">Cerrar</button><button class="vi-client-btn" id="venImprimir">Imprimir / Reimprimir</button>${v.estado==='CONFIRMADA'?'<button class="vi-client-btn alt" id="venDevolucionParcial">↩ Devolver productos</button><button class="vi-client-btn alt" id="venAnular">Anular venta</button>':''}</div></div></div>`;$('venCerrarDetalle').onclick=venCerrar;$('venImprimir').onclick=()=>venImprimir80(v,det,cob);if($('venAnular'))$('venAnular').onclick=()=>venAbrirAnulacion(v);if($('venDevolucionParcial'))$('venDevolucionParcial').onclick=()=>venAbrirDevolucionParcial(v.id_venta);;}catch(e){venToast('No se pudo abrir la venta',venError(e),'error');}}


// ============================================================
// VICORA · Ticket térmico 80 mm y anulación de ventas
// ============================================================
// Preferencias por negocio y navegador. No son configuración remota ni selección de dispositivo.
function venClaveImpresion(){return 'vicora_impresion_v2_'+String(perfil?.id_negocio||'sin_negocio');}
function venPreferenciasImpresion(){
  const base={papel:'80',logo:true};
  try{const dato=JSON.parse(localStorage.getItem(venClaveImpresion())||'{}');return {papel:['80','58','A4'].includes(dato.papel)?dato.papel:'80',logo:dato.logo!==false};}
  catch(e){return base;}
}
function venConfigImpresion(){
  const m=$('venModal');if(!m)return;
  const conf=venPreferenciasImpresion();
  m.innerHTML=`<div class="ven-modal"><div class="ven-dialog" style="width:min(520px,100%)">
    <h2>Configuración de impresión</h2>
    <p class="ven-info">Elegí el papel para este negocio en este navegador. La impresora USB o Bluetooth debe estar instalada en el sistema operativo. La selección de impresora se realiza al imprimir.</p>
    <label class="ven-label" for="venPapel">Tamaño del comprobante</label>
    <select id="venPapel" class="ven-select"><option value="80">Ticket térmico 80 mm</option><option value="58">Ticket térmico 58 mm</option><option value="A4">Hoja A4</option></select>
    <label style="display:flex;align-items:center;gap:10px;margin-top:16px"><input type="checkbox" id="venMostrarLogo"> Mostrar logo del negocio si está configurado</label>
    <p class="ven-muted" style="margin-top:15px">La reimpresión está disponible desde el detalle de cualquier venta. En el diálogo del navegador, seleccioná el papel y la impresora correcta; el navegador no permite fijarlos automáticamente.</p>
    <div class="ven-modal-foot"><button class="vi-client-btn alt" id="venConfigCancelar">Cancelar</button><button class="vi-client-btn" id="venConfigGuardar">Guardar preferencias</button></div>
  </div></div>`;
  $('venPapel').value=conf.papel;$('venMostrarLogo').checked=conf.logo;
  $('venConfigCancelar').onclick=venCerrar;
  $('venConfigGuardar').onclick=()=>{
    try{localStorage.setItem(venClaveImpresion(),JSON.stringify({papel:$('venPapel').value,logo:$('venMostrarLogo').checked}));venCerrar();venToast('Impresión configurada','Preferencias guardadas en este navegador.','exito');}
    catch(e){venToast('No se pudo guardar',venError(e),'error');}
  };
}
function venImprimir80(v,det,cob){
  const conf=venPreferenciasImpresion();
  const w=window.open('','_blank');
  if(!w){venToast('Impresión bloqueada','Permití ventanas emergentes para imprimir.','advertencia');return;}
  const papel=conf.papel;
  const ancho=papel==='58'?58:papel==='80'?80:210;
  const area=papel==='58'?50:papel==='80'?72:190;
  const pagina=papel==='A4'?'A4':'80'===papel?'80mm 200mm':'58mm 200mm';
  const logoCandidato=negocio?.logo_url||negocio?.url_logo||negocio?.logo||'';
  const logoSeguro=typeof logoCandidato==='string'&&/^https:\/\//i.test(logoCandidato)?logoCandidato:'';
  const logoHtml=conf.logo&&logoSeguro?`<img class="logo" src="${esc(logoSeguro)}" alt="Logo del negocio">`:'';
  const detalle=(det||[]).map(p=>{const prod=ventasUI.productos.find(x=>x.id_producto===p.id_producto);
    return `<tr><td colspan="2" class="nombre">${esc(prod?.nombre||p.id_producto)}</td></tr><tr><td>${esc(venNumero(p.cantidad))} x ${esc(venDinero(p.precio_unitario))}</td><td class="derecha">${esc(venDinero(p.subtotal))}</td></tr>`;
  }).join('');
  const cobrado=(cob||[]).filter(c=>c.estado==='REGISTRADO').reduce((s,c)=>s+Number(c.importe||0),0);
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket ${esc(v.id_venta)}</title><style>
  @page{size:${pagina};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
  body{font:12px/1.35 Arial,sans-serif;width:${ancho}mm;padding:3mm 4mm;overflow-wrap:anywhere}
  .ticket{width:100%;max-width:${area}mm;margin:0 auto}.logo{display:block;max-width:35mm;max-height:22mm;object-fit:contain;margin:0 auto 5px}
  h1{font-size:17px;text-align:center;margin:0 0 6px}.centro{text-align:center}.derecha{text-align:right}
  .linea{border-top:1px dashed #000;margin:8px 0}.nombre{padding-top:5px}table{width:100%;border-collapse:collapse;table-layout:fixed}td{vertical-align:top;padding:2px 0}td:last-child{width:42%}
  .total{font-size:16px;font-weight:bold}.estado{font-size:16px;font-weight:bold;text-align:center;margin:8px 0}
  @media screen{body{margin:12px auto;border:1px solid #ddd}.ayuda{font:12px Arial;margin:8px auto;text-align:center}}
  @media print{html,body{width:${ancho}mm!important;min-height:0!important}.ayuda{display:none!important}}
  </style></head><body><div class="ticket">${logoHtml}<h1>${esc(negocio?.nombre||'VICORA')}</h1><div class="centro">Comprobante de venta</div>
  <div class="linea"></div><div>Venta: ${esc(v.id_venta)}</div><div>Fecha: ${esc(venFecha(v.fecha_venta))}</div>
  <div>Cliente: ${esc(v.cliente||'Consumidor final')}</div><div class="linea"></div>
  <table><tbody>${detalle}</tbody></table><div class="linea"></div>
  <table><tbody><tr><td>Subtotal</td><td class="derecha">${esc(venDinero(v.subtotal))}</td></tr>
  <tr><td>Descuento</td><td class="derecha">${esc(venDinero(v.descuento))}</td></tr>
  <tr class="total"><td>TOTAL</td><td class="derecha">${esc(venDinero(v.total))}</td></tr>
  <tr><td>Cobrado registrado</td><td class="derecha">${esc(venDinero(cobrado))}</td></tr>
  <tr><td>Modalidad</td><td class="derecha">${esc(v.modalidad_cobro||'—')}</td></tr>
  <tr><td>Medio inicial</td><td class="derecha">${esc(v.medio_pago||'—')}</td></tr></tbody></table>
  ${v.estado==='ANULADA'?'<div class="estado">VENTA ANULADA</div>':''}
  <div class="linea"></div><div class="centro">Gracias por su compra</div></div>
  <div class="ayuda">Seleccioná en el diálogo la impresora instalada y el papel ${esc(papel==='A4'?'A4':papel+' mm')}; escala 100 %, márgenes ninguno y encabezados desactivados.</div></body></html>`;
  w.document.open();w.document.write(html);w.document.close();
  w.addEventListener('load',()=>{w.focus();w.print();},{once:true});
}

function venAbrirAnulacion(v){
  if(v.estado!=='CONFIRMADA')return venToast('No disponible','Solo se anulan ventas confirmadas.','advertencia');
  const modal=$('venModal');if(!modal)return;
  modal.innerHTML=`<div class="ven-modal"><div class="ven-dialog" style="width:min(540px,100%)">
    <h2>Anular venta ${esc(v.id_venta)}</h2>
    <p class="ven-info">Se restituirá el stock y se cancelará el saldo pendiente. La venta permanecerá en el historial.</p>
    <label class="ven-label" for="venMotivo">Motivo de anulación (obligatorio)</label>
    <textarea id="venMotivo" class="ven-input" rows="3" maxlength="500" placeholder="Escribí el motivo"></textarea>
    <label class="ven-label" for="venDevolver" style="margin-top:15px">Dinero recibido del cliente</label>
    <select id="venDevolver" class="ven-select"><option value="NO">No se devolvió: dejar pendiente</option><option value="SI">Sí, se devolvió todo lo cobrado</option></select>
    <div id="venMedioWrap" style="display:none;margin-top:12px"><label class="ven-label" for="venMedioDevolucion">Medio de devolución</label>
    <select id="venMedioDevolucion" class="ven-select"><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option><option value="OTRO">Otro</option></select></div>
    <div class="ven-modal-foot"><button class="vi-client-btn alt" id="venCancelarAnulacion">Cancelar</button>
    <button class="vi-client-btn" id="venConfirmarAnulacion">Confirmar anulación</button></div></div></div>`;
  $('venCancelarAnulacion').onclick=()=>venDetalle(v.id_venta);
  $('venDevolver').onchange=()=>{$('venMedioWrap').style.display=$('venDevolver').value==='SI'?'block':'none';};
  $('venConfirmarAnulacion').onclick=()=>venEjecutarAnulacion(v.id_venta);
}

async function venEjecutarAnulacion(id){
  const motivo=($('venMotivo')?.value||'').trim();
  const devolver=$('venDevolver')?.value==='SI';
  const medio=devolver?$('venMedioDevolucion')?.value:null;
  if(!motivo)return venToast('Motivo obligatorio','Escribí por qué se anula la venta.','advertencia');
  const ok=await confirmarVicora('Confirmar anulación',`¿Anular definitivamente la venta ${id}? ${devolver?'Se registrará la devolución de todo lo cobrado.':'El dinero cobrado quedará pendiente de devolución.'}`);
  if(!ok)return;
  const boton=$('venConfirmarAnulacion');if(boton){boton.disabled=true;boton.textContent='Anulando...';}
  try{
    await venAcceso();
    const {data,error}=await db.rpc('anular_venta',{
      p_id_negocio:perfil.id_negocio,p_id_venta:id,p_motivo:motivo,
      p_devolver_dinero:devolver,p_medio_devolucion:medio
    });
    if(error)throw error;
    if(!data?.ok)throw new Error('La base de datos no confirmó la anulación.');
    venCerrar();await venCargar();
    venToast('Venta anulada',`${id} · Devolución pendiente: ${venDinero(data.devolucion_pendiente)}`,'exito');
  }catch(e){venToast('No se pudo anular',venError(e),'error');}
  finally{if(boton?.isConnected){boton.disabled=false;boton.textContent='Confirmar anulación';}}
}

// ============================================================
// VICORA · Devoluciones parciales
// Requiere RPC seguras en Supabase:
// obtener_contexto_devolucion(p_id_venta)
// registrar_devolucion_parcial(p_id_venta,p_productos,p_medio,p_motivo,p_reponer_stock)
// No habilitar en producción hasta instalar/verificar las RPC.
// ============================================================
let venDevolucionEnProceso=false;
let venContextoDevolucion=null;
let venDevDatosFinancieros=null;

async function venAbrirDevolucionParcial(idVenta){
  try{
    await venAcceso();
    const {data,error}=await db.rpc('obtener_contexto_devolucion',{p_id_venta:idVenta});
    if(error)throw error;
    if(!data?.ok)throw new Error(data?.mensaje||'No se pudo consultar la devolución.');
    venContextoDevolucion=data;
    venDevDatosFinancieros=null;
    // Datos solo para la vista previa; Supabase sigue validando el importe definitivo.
    try{
      const [v,d,c,r]=await Promise.all([
        db.from('ventas').select('total').eq('id_negocio',perfil.id_negocio).eq('id_venta',idVenta).single(),
        db.from('ventas_detalle').select('id_producto,cantidad,subtotal').eq('id_negocio',perfil.id_negocio).eq('id_venta',idVenta),
        db.from('cuentas_cobrar').select('saldo_pendiente').eq('id_negocio',perfil.id_negocio).eq('id_venta',idVenta).maybeSingle(),
        db.from('devoluciones_detalle').select('credito').eq('id_negocio',perfil.id_negocio).eq('id_venta',idVenta)
      ]);
      if([v,d,c,r].some(x=>x.error))throw new Error('No se pudo consultar la vista previa');
      venDevDatosFinancieros={total:Number(v.data?.total||0),detalles:d.data||[],deuda:Number(c.data?.saldo_pendiente||0),creditoPrevio:(r.data||[]).reduce((a,x)=>a+Number(x.credito||0),0)};
    }catch(e){console.warn('Vista previa de reintegro no disponible:',e);}
    const productos=(data.productos||[]).filter(p=>Number(p.disponible)>0);
    if(!productos.length){venToast('Sin productos disponibles','Todos los artículos de esta venta ya fueron devueltos.','advertencia');return;}
    const m=$('venModal');if(!m)return;
    m.innerHTML=`<div class="ven-modal"><div class="ven-dialog" style="width:min(850px,100%)">
      <h2>↩ Devolver productos · ${esc(idVenta)}</h2>
      <p class="ven-info">Seleccioná las cantidades a devolver. El importe se calculará respetando los descuentos de la venta y se aplicará primero a la deuda pendiente.</p>
      <div class="ven-table"><table class="ven-items"><thead><tr><th>Producto</th><th>Vendido</th><th>Disponible para devolver</th><th>Devolver</th></tr></thead><tbody>
      ${productos.map(p=>`<tr><td>${esc(p.producto||p.nombre||p.id_producto)}</td><td>${venNumero(p.cantidad_original)}</td><td>${venNumero(p.disponible)}</td><td><input class="ven-input ven-qty" type="number" min="0" max="${Number(p.disponible)}" step="0.001" value="0" data-ven-dev-id="${esc(p.id_producto)}"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="ven-card" style="margin-top:16px">
      <label class="ven-label" for="venDevMotivo">Motivo de devolución (obligatorio)</label>
      <textarea id="venDevMotivo" class="ven-input" maxlength="300" rows="3" placeholder="Explicá por qué se devuelve"></textarea>
      <label style="display:flex;align-items:center;gap:10px;margin-top:14px;font-size:13px"><input type="checkbox" id="venDevReponer" checked> Reincorporar los productos al stock disponible</label>
      <p class="ven-muted" style="margin-top:6px">Desmarcá esta opción si los productos están dañados o no pueden volver a venderse.</p>
      <div id="venDevReintegroInfo" class="ven-info" style="margin-top:14px">Calculando si corresponde un reintegro...</div>
      <div id="venDevMedioWrap" style="display:none"><label class="ven-label" for="venDevMedio">¿Cómo vas a devolver el dinero al cliente?</label>
      <select class="ven-select" id="venDevMedio"><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option><option value="OTRO">Otro</option></select></div>
      <div class="ven-info" id="venDevResumen">Seleccioná al menos un producto.</div></div>
      <div class="ven-modal-foot"><button class="vi-client-btn alt" id="venDevCancelar">Cancelar</button><button class="vi-client-btn ok" id="venDevConfirmar">Confirmar devolución</button></div>
      </div></div>`;
    $('venDevCancelar').onclick=()=>venDetalle(idVenta);
    m.querySelectorAll('[data-ven-dev-id]').forEach(x=>x.addEventListener('input',venActualizarResumenDevolucion));
    $('venDevConfirmar').onclick=()=>venConfirmarDevolucionParcial(idVenta);
    venActualizarResumenDevolucion();
  }catch(e){venToast('No se pudo abrir la devolución',venError(e),'error');}
}
function venSeleccionDevolucion(){
  const inputs=$('venModal')?.querySelectorAll('[data-ven-dev-id]')||[];
  const items=[];
  for(const input of inputs){
    const cantidad=Number(input.value);
    const p=(venContextoDevolucion?.productos||[]).find(x=>String(x.id_producto)===input.dataset.venDevId);
    if(!p||!Number.isFinite(cantidad)||cantidad<0||cantidad>Number(p.disponible)+0.000001||Math.abs(cantidad*1000-Math.round(cantidad*1000))>0.00001)
      throw new Error('Revisá las cantidades. No pueden superar lo disponible ni tener más de tres decimales.');
    if(cantidad>0)items.push({id_producto:p.id_producto,cantidad});
  }
  return items;
}
function venEstimarDevolucion(items){
  const f=venDevDatosFinancieros;
  if(!f)return null;
  const bruto=f.detalles.reduce((s,p)=>s+Number(p.subtotal||0),0);
  if(bruto<=0||f.total<=0)return null;
  let seleccionado=0;
  for(const item of items){
    const lineas=f.detalles.filter(p=>String(p.id_producto)===String(item.id_producto));
    const cant=lineas.reduce((s,p)=>s+Number(p.cantidad||0),0);
    if(cant<=0)return null;
    seleccionado+=lineas.reduce((s,p)=>s+Number(p.subtotal||0),0)*item.cantidad/cant;
  }
  // Vista previa orientativa. La función SQL decide el importe final con los redondeos.
  const credito=Math.max(0,venN(f.total*seleccionado/bruto));
  return {credito,deudaReducida:Math.min(credito,f.deuda),reintegro:Math.max(0,venN(credito-f.deuda))};
}
function venActualizarResumenDevolucion(){
  const el=$('venDevResumen'),info=$('venDevReintegroInfo'),wrap=$('venDevMedioWrap');
  if(!el)return;
  if(wrap)wrap.style.display='none';
  try{
    const items=venSeleccionDevolucion();
    if(!items.length){el.textContent='Seleccioná al menos un producto.';if(info)info.textContent='Elegí los productos para saber si corresponde devolver dinero.';return;}
    const calculo=venEstimarDevolucion(items);
    if(!calculo){
      el.textContent='Supabase calculará los importes definitivos al confirmar.';
      if(info)info.textContent='No se pudo calcular la vista previa. Elegí el medio solo si Supabase determina que corresponde un reintegro.';
      if(wrap)wrap.style.display='block';
      return;
    }
    el.textContent=`Crédito estimado: ${venDinero(calculo.credito)} · Deuda a reducir: ${venDinero(calculo.deudaReducida)}.`;
    if(calculo.reintegro>0){
      if(info)info.textContent=`Reintegro estimado: ${venDinero(calculo.reintegro)}. Seleccioná cómo entregarás el dinero.`;
      if(wrap)wrap.style.display='block';
    }else{
      if(info)info.textContent='Sin reintegro de dinero: el importe se descontará de la cuenta corriente (o no corresponde devolver efectivo).';
    }
  }catch(e){el.textContent=venError(e);if(info)info.textContent='Revisá las cantidades seleccionadas.';}
}
async function venConfirmarDevolucionParcial(idVenta){
  if(venDevolucionEnProceso)return;
  let items;
  try{items=venSeleccionDevolucion();}catch(e){return venToast('Cantidades inválidas',venError(e),'advertencia');}
  if(!items.length)return venToast('Sin productos','Seleccioná alguna cantidad para devolver.','advertencia');
  const motivo=($('venDevMotivo')?.value||'').trim();
  if(!motivo)return venToast('Motivo obligatorio','Ingresá el motivo de la devolución.','advertencia');
  const medio=$('venDevMedioWrap')?.style.display==='none'?null:$('venDevMedio')?.value;
  const reponer=$('venDevReponer')?.checked===true;
  const ok=await confirmarVicora('Confirmar devolución',`¿Registrar la devolución de ${items.length} producto(s)? ${reponer?'Se reincorporarán al stock.':'No se reincorporarán al stock.'} Supabase calculará el ajuste económico.`);
  if(!ok)return;
  venDevolucionEnProceso=true;
  const boton=$('venDevConfirmar');if(boton){boton.disabled=true;boton.textContent='Registrando...';}
  try{
    await venAcceso();
    const {data,error}=await db.rpc('registrar_devolucion_parcial',{p_id_venta:idVenta,p_productos:items,p_medio:medio,p_motivo:motivo,p_reponer_stock:reponer});
    if(error)throw error;
    if(!data?.ok)throw new Error(data?.mensaje||'La base de datos no confirmó la devolución.');
    venContextoDevolucion=null;venCerrar();await venCargar();
    venToast('Devolución registrada',`Crédito: ${venDinero(data.credito)} · Deuda reducida: ${venDinero(data.deuda_reducida)} · Reintegro: ${venDinero(data.reintegro)}`,'exito');
  }catch(e){venToast('No se pudo registrar la devolución',venError(e),'error');}
  finally{venDevolucionEnProceso=false;if(boton?.isConnected){boton.disabled=false;boton.textContent='Confirmar devolución';}}
}
