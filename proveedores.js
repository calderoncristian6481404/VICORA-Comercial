/* VICORA Comercial - Paso 67.4 - Proveedores independiente */
'use strict';
let proveedoresActuales=[], proveedoresBusqueda='', proveedoresPagina=1;
const PROVEEDORES_POR_PAGINA=15;
const proveedorEsc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function proveedorPorId(id){return proveedoresActuales.find(p=>p.id_proveedor===id);}
async function proveedorVerificarAcceso(){await clienteVerificarAcceso();}
function proveedorFecha(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-AR');}
function proveedorAviso(titulo,detalle,tipo='info'){notificarVicora(titulo,detalle,tipo);}
async function proveedorObtenerTodos(){
 await proveedorVerificarAcceso();
 const todos=[];let offset=0;
 while(true){
  const {data,error}=await db.from('proveedores').select('id_negocio,id_proveedor,tipo,nombre,nombre_contacto,cuit_cuil,telefono,email,direccion,localidad,provincia,observaciones,fecha_alta,estado').eq('id_negocio',perfil.id_negocio).order('fecha_alta',{ascending:false}).order('id_proveedor',{ascending:false}).range(offset,offset+999);
  if(error)throw error;
  if((data||[]).some(p=>p.id_negocio!==perfil.id_negocio))throw new Error('Se bloquearon datos de otro negocio.');
  todos.push(...(data||[]));if(!data||data.length<1000)break;offset+=1000;
 }
 return todos;
}
function mostrarProveedores(boton){
 seleccionar(boton);
 $('contenidoPrincipal').innerHTML=`<h1 class="page-title">Proveedores</h1><p class="page-subtitle">Administración de proveedores · ${proveedorEsc(negocio.nombre)}</p><div class="vi-prov-toolbar"><input id="proveedoresBuscar" type="search" placeholder="Buscar por nombre, CUIT/CUIL, contacto, localidad..." aria-label="Buscar proveedores" oninput="proveedorBuscar()"><button class="vi-client-btn" type="button" onclick="abrirProveedorFormulario()">+ Nuevo proveedor</button></div><div id="proveedoresResumen" class="vi-client-count"></div><div id="proveedoresListado" class="vi-prov-table-wrap"><div class="loading"><span class="spinner"></span>Cargando proveedores...</div></div><div id="proveedoresModal"></div>`;
 proveedoresBusqueda='';proveedoresPagina=1;recargarProveedores();
}
async function recargarProveedores(){
 const cont=$('proveedoresListado');if(!cont)return;
 try{proveedoresActuales=await proveedorObtenerTodos();if(cont.isConnected)pintarProveedores();}
 catch(e){if(cont.isConnected)cont.innerHTML=`<div class="vi-client-alert err">No se pudieron cargar los proveedores: ${proveedorEsc(e.message||e)}</div>`;proveedorAviso('Error al cargar proveedores',String(e.message||e),'error');}
}
function proveedorBuscar(){proveedoresBusqueda=$('proveedoresBuscar')?.value||'';proveedoresPagina=1;pintarProveedores();}
function pintarProveedores(){
 const cont=$('proveedoresListado');if(!cont)return;
 const normalizar=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const q=normalizar(proveedoresBusqueda.trim());
 const items=proveedoresActuales.filter(p=>!q||normalizar([p.id_proveedor,p.nombre,p.nombre_contacto,p.cuit_cuil,p.telefono,p.email,p.localidad,p.provincia,p.tipo].join(' ')).includes(q));
 const activos=proveedoresActuales.filter(p=>p.estado==='ACTIVO').length;
 const resumen=$('proveedoresResumen');if(resumen)resumen.textContent=`Total: ${proveedoresActuales.length} · Activos: ${activos} · Mostrando: ${items.length}`;
 if(!items.length){cont.innerHTML='<div class="empty-state"><div class="empty-state-icon">🚚</div>No hay proveedores para mostrar.</div>';return;}
 const visibles=items.slice(0,proveedoresPagina*PROVEEDORES_POR_PAGINA);
 cont.innerHTML=`<table class="vi-prov-table"><thead><tr><th>ID</th><th>Proveedor</th><th>Tipo</th><th>CUIT/CUIL</th><th>Teléfono</th><th>Localidad</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${visibles.map(p=>`<tr><td>${proveedorEsc(p.id_proveedor)}</td><td><strong>${proveedorEsc(p.nombre)}</strong>${p.nombre_contacto?`<div class="vi-muted">${proveedorEsc(p.nombre_contacto)}</div>`:''}</td><td>${p.tipo==='PERSONA'?'Persona':'Empresa'}</td><td>${proveedorEsc(p.cuit_cuil||'—')}</td><td>${proveedorEsc(p.telefono||'—')}</td><td>${proveedorEsc(p.localidad||'—')}</td><td><span class="vi-client-status ${p.estado==='ACTIVO'?'':'off'}">${proveedorEsc(p.estado)}</span></td><td><div class="vi-prov-actions"><button type="button" data-prov-accion="ficha" data-prov-id="${proveedorEsc(p.id_proveedor)}">Ver</button><button type="button" data-prov-accion="editar" data-prov-id="${proveedorEsc(p.id_proveedor)}">Editar</button><button type="button" data-prov-accion="estado" data-prov-id="${proveedorEsc(p.id_proveedor)}">${p.estado==='ACTIVO'?'Desactivar':'Activar'}</button></div></td></tr>`).join('')}</tbody></table>${visibles.length<items.length?`<div class="vicora-ver-mas"><span>Mostrando ${visibles.length} de ${items.length}</span><button type="button" class="vi-client-btn" onclick="proveedorVerMas()">Ver más</button></div>`:''}`;
}
function proveedorVerMas(){proveedoresPagina++;pintarProveedores();}
function cerrarProveedorModal(){$('proveedoresModal')?.replaceChildren();}
function abrirProveedorFormulario(id=null){
 const p=id?proveedorPorId(id):null;if(id&&!p)return;
 const modal=$('proveedoresModal');if(!modal)return;
 const val=k=>proveedorEsc(p?.[k]??'');
 modal.innerHTML=`<div class="vi-prov-overlay" role="presentation"><div class="vi-prov-dialog" role="dialog" aria-modal="true" aria-label="${p?'Editar proveedor':'Nuevo proveedor'}"><h2>${p?'Editar proveedor':'Nuevo proveedor'}</h2><form id="proveedorForm" onsubmit="guardarProveedor(event)"><div class="vi-prov-fields"><label>Tipo de proveedor<select name="tipo" required><option value="EMPRESA" ${!p||p.tipo==='EMPRESA'?'selected':''}>Empresa</option><option value="PERSONA" ${p?.tipo==='PERSONA'?'selected':''}>Persona particular</option></select></label><label>Nombre / Razón social *<input name="nombre" maxlength="180" required value="${val('nombre')}" autocomplete="organization"></label><label>Nombre de contacto<input name="nombre_contacto" maxlength="180" value="${val('nombre_contacto')}"></label><label>CUIT / CUIL<input name="cuit_cuil" maxlength="20" value="${val('cuit_cuil')}" inputmode="numeric"></label><label>Teléfono<input name="telefono" maxlength="40" value="${val('telefono')}" autocomplete="tel"></label><label>Correo electrónico<input name="email" type="email" maxlength="180" value="${val('email')}" autocomplete="email"></label><label>Dirección<input name="direccion" maxlength="220" value="${val('direccion')}"></label><label>Localidad<input name="localidad" maxlength="120" value="${val('localidad')}"></label><label>Provincia<input name="provincia" maxlength="120" value="${proveedorEsc(p?.provincia??'Córdoba')}"></label><label class="full">Observaciones<textarea name="observaciones" maxlength="2000">${val('observaciones')}</textarea></label></div><p id="proveedorFormError" class="vi-prov-error" hidden></p><div class="vi-prov-footer"><button type="button" class="vi-client-btn alt" onclick="cerrarProveedorModal()">Cancelar</button><button id="proveedorGuardarBtn" class="vi-client-btn" type="submit">${p?'Guardar cambios':'Registrar proveedor'}</button></div></form></div></div>`;
 modal.dataset.editando=id||'';
 modal.querySelector('input[name="nombre"]')?.focus();
}
async function guardarProveedor(event){
 event.preventDefault();const form=event.currentTarget;const modal=$('proveedoresModal');const id=modal?.dataset.editando||null;
 const boton=$('proveedorGuardarBtn'),err=$('proveedorFormError');if(!boton||!err)return;
 const campos=['tipo','nombre','nombre_contacto','cuit_cuil','telefono','email','direccion','localidad','provincia','observaciones'];
 const datos={};for(const k of campos){const v=String(form.elements.namedItem(k)?.value||'').trim();datos[k]=v||null;}
 datos.tipo=datos.tipo||'EMPRESA';boton.disabled=true;err.hidden=true;
 try{
  if(!datos.nombre)throw new Error('Ingresá el nombre o razón social.');
  await proveedorVerificarAcceso();
  let respuesta;
  if(id){respuesta=await db.from('proveedores').update(datos).eq('id_negocio',perfil.id_negocio).eq('id_proveedor',id).select('id_proveedor').single();}
  else{respuesta=await db.from('proveedores').insert({...datos,id_negocio:perfil.id_negocio,estado:'ACTIVO'}).select('id_proveedor').single();}
  if(respuesta.error)throw respuesta.error;
  cerrarProveedorModal();await recargarProveedores();proveedorAviso(id?'Proveedor actualizado':'Proveedor registrado',id?'Los cambios se guardaron correctamente.':`ID asignado: ${respuesta.data?.id_proveedor||'automático'}`,'exito');
 }catch(e){err.textContent='No se pudo guardar: '+String(e.message||e);err.hidden=false;proveedorAviso('No se pudo guardar el proveedor',String(e.message||e),'error');}finally{if(boton.isConnected)boton.disabled=false;}
}
function verFichaProveedor(id){
 const p=proveedorPorId(id);if(!p)return;
 const campos=[['ID',p.id_proveedor],['Tipo',p.tipo==='PERSONA'?'Persona particular':'Empresa'],['Nombre / Razón social',p.nombre],['Contacto',p.nombre_contacto],['CUIT/CUIL',p.cuit_cuil],['Teléfono',p.telefono],['Correo',p.email],['Dirección',p.direccion],['Localidad',p.localidad],['Provincia',p.provincia],['Observaciones',p.observaciones],['Fecha de alta',proveedorFecha(p.fecha_alta)],['Estado',p.estado]];
 const modal=$('proveedoresModal');if(!modal)return;
 modal.innerHTML=`<div class="vi-prov-overlay"><div class="vi-prov-dialog" role="dialog" aria-modal="true" aria-label="Ficha del proveedor"><h2>Ficha del proveedor</h2><div class="vi-prov-details">${campos.map(([k,v])=>`<div class="${k==='Observaciones'?'full':''}"><small>${proveedorEsc(k)}</small><strong>${proveedorEsc(v||'—')}</strong></div>`).join('')}</div><div class="vi-prov-footer"><button type="button" class="vi-client-btn alt" onclick="cerrarProveedorModal()">Cerrar</button><button type="button" class="vi-client-btn" id="provEditarDesdeFicha">Editar</button></div></div></div>`;
 modal.querySelector('#provEditarDesdeFicha').onclick=()=>abrirProveedorFormulario(id);
}
async function alternarProveedor(id){
 const p=proveedorPorId(id);if(!p)return;
 const nuevo=p.estado==='ACTIVO'?'INACTIVO':'ACTIVO';
 if(!await confirmarVicora(nuevo==='ACTIVO'?'Activar proveedor':'Desactivar proveedor',`¿Querés ${nuevo==='ACTIVO'?'activar':'desactivar'} a ${p.nombre}?`,nuevo==='INACTIVO'))return;
 try{await proveedorVerificarAcceso();const {error}=await db.from('proveedores').update({estado:nuevo}).eq('id_negocio',perfil.id_negocio).eq('id_proveedor',id).select('id_proveedor').single();if(error)throw error;await recargarProveedores();proveedorAviso(nuevo==='ACTIVO'?'Proveedor activado':'Proveedor desactivado','El estado se actualizó correctamente.','exito');}
 catch(e){proveedorAviso('No se pudo cambiar el estado',String(e.message||e),'error');}
}
document.addEventListener('click',event=>{
 const btn=event.target.closest('[data-prov-accion]');if(!btn)return;
 const id=btn.dataset.provId;
 if(btn.dataset.provAccion==='ficha')verFichaProveedor(id);
 if(btn.dataset.provAccion==='editar')abrirProveedorFormulario(id);
 if(btn.dataset.provAccion==='estado')alternarProveedor(id);
});
