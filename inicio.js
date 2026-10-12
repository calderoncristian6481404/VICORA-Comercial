/* VICORA Comercial | Inicio Supabase. Solo lectura; respeta RLS e id_negocio. */
'use strict';
const viHome={run:0};
const viH$=id=>document.getElementById(id);
const viHE=v=>typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viHM=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
const viHN=n=>new Intl.NumberFormat('es-AR').format(Number(n)||0);
const viHD=d=>{if(!d)return '—';let a=String(d).slice(0,10).split('-');return a.length===3?`${a[2]}/${a[1]}/${a[0]}`:viHE(d)};
const viHDate=d=>{let a=new Date(d);return [a.getFullYear(),String(a.getMonth()+1).padStart(2,'0'),String(a.getDate()).padStart(2,'0')].join('-')};
function viHEstilo(){if(viH$('viHomeCss'))return;let e=document.createElement('style');e.id='viHomeCss';e.textContent=`
.vi-home .vh-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
.vi-home .vh-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;border-top:4px solid #2563eb;min-width:0;box-shadow:0 5px 18px #0f172a0a}
.vi-home .vh-kpi:nth-child(4n+2){border-top-color:#16a34a}.vi-home .vh-kpi:nth-child(4n+3){border-top-color:#d97706}.vi-home .vh-kpi:nth-child(4n+4){border-top-color:#7c3aed}
.vi-home .vh-kpi span{font-size:12px;color:#64748b;font-weight:700}.vi-home .vh-kpi strong{display:block;font-size:clamp(20px,2vw,27px);color:#0f172a;margin:10px 0;overflow-wrap:anywhere}.vi-home .vh-kpi small{color:#64748b;font-size:11px}
.vi-home .vh-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr);gap:16px}.vi-home .vh-panel{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:19px;margin-bottom:16px;min-width:0}.vi-home .vh-panel h3{font-size:17px;margin:0 0 14px;color:#172554}.vi-home .vh-bars{height:205px;display:flex;align-items:end;gap:10px;border-bottom:1px solid #e2e8f0;padding:0 4px}.vi-home .vh-barbox{flex:1;height:100%;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:5px}.vi-home .vh-bar{width:min(75%,50px);background:linear-gradient(#60a5fa,#2563eb);border-radius:7px 7px 0 0}.vi-home .vh-barbox small{font-size:10px;color:#64748b}.vi-home .vh-quick{display:flex;flex-wrap:wrap;gap:9px}.vi-home .vh-quick button{padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;color:#1e40af;font-weight:700}.vi-home .vh-quick button:hover{background:#dbeafe}.vi-home .vh-alert{padding:11px 13px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;margin:9px 0;font-size:13px;display:flex;justify-content:space-between;gap:10px}.vi-home .vh-alert b{color:#172554}.vi-home .vh-table{width:100%;border-collapse:collapse;font-size:12px;min-width:420px}.vi-home .vh-table td,.vi-home .vh-table th{padding:11px;border-bottom:1px solid #e2e8f0;text-align:left}.vi-home .vh-table th{background:#f1f5f9}.vi-home .vh-scroll{overflow:auto}.vi-home .vh-note{color:#64748b;font-size:12px;line-height:1.5}.vi-home .vh-warn{color:#991b1b;font-size:12px;margin:8px 0}.vi-home .vh-btn{border:0;border-radius:9px;padding:10px 15px;background:#2563eb;color:white;font-weight:700}
@media(max-width:1100px){.vi-home .vh-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.vi-home .vh-grid{grid-template-columns:1fr}}@media(max-width:650px){.vi-home .vh-kpis{grid-template-columns:1fr 1fr;gap:9px}.vi-home .vh-kpi{padding:12px}.vi-home .vh-panel{padding:13px}.vi-home .vh-kpi strong{font-size:19px}}`;
document.head.appendChild(e)}
function vicoraMostrarInicio(boton){
 seleccionar(boton);viHEstilo();const run=++viHome.run;
 viH$('contenidoPrincipal').innerHTML=`<section class="vi-home"><div class="vi-heading"><div><h1>Panel de inicio</h1><p>Resumen de ${viHE(negocio?.nombre||'tu negocio')} · <span id="vhFecha">${new Date().toLocaleDateString('es-AR')}</span></p></div><button class="vh-btn" id="vhActualizar">↻ Actualizar</button></div><div class="vh-kpis" id="vhKpis"><div class="vh-panel">Cargando indicadores...</div></div><div class="vh-grid"><div class="vh-panel"><h3>Ventas confirmadas · últimos 7 días</h3><div id="vhGrafico" class="vh-note">Consultando...</div></div><div class="vh-panel"><h3>Alertas del negocio</h3><div id="vhAlertas" class="vh-note">Consultando...</div></div></div><div class="vh-panel"><h3>Accesos rápidos</h3><div class="vh-quick" id="vhAccesos"><button data-vh="ventas">Ventas</button><button data-vh="clientes">Clientes</button><button data-vh="productos">Productos</button><button data-vh="presupuestos">Presupuestos</button><button data-vh="caja">Caja</button><button data-vh="reportes">Reportes</button></div></div><div class="vh-grid"><div class="vh-panel"><h3>Últimas ventas confirmadas</h3><div class="vh-scroll" id="vhUltimas">Consultando...</div></div><div class="vh-panel"><h3>Resumen</h3><div id="vhResumen">Consultando...</div></div></div><p class="vh-note">Los importes corresponden a ventas confirmadas, no necesariamente a dinero cobrado. Cada consulta se limita al negocio de la sesión.</p></section>`;
 viH$('vhActualizar').onclick=()=>vicoraMostrarInicio(document.querySelector('.sidebar .menu-item.active'));
 viH$('vhAccesos').querySelectorAll('button').forEach(b=>b.onclick=()=>{const menu=[...document.querySelectorAll('.sidebar .menu-item')].find(x=>x.getAttribute('onclick')?.includes("'"+b.dataset.vh+"'"));mostrarModulo(b.dataset.vh,menu)});
 viHCargar(run);
}
async function viHCount(tabla,extra){let q=db.from(tabla).select('*',{count:'exact',head:true}).eq('id_negocio',perfil.id_negocio);if(extra)q=extra(q);let {count,error}=await q;if(error)throw error;return count??0}
async function viHRows(tabla,cols='*',limit=1000){let out=[],from=0;while(from<5000){let {data,error}=await db.from(tabla).select(cols).eq('id_negocio',perfil.id_negocio).range(from,from+limit-1);if(error)throw error;out.push(...(data||[]));if(!data||data.length<limit)break;from+=limit}return out}
async function viHSafe(fn){try{return {value:await fn(),error:null}}catch(e){return {value:null,error:String(e?.message||e)}}}
function viHVal(x,keys){for(let k of keys)if(x?.[k]!==undefined&&x[k]!==null&&x[k]!=='')return x[k];return null}
// Resumen financiero: consultas de solo lectura, independientes por indicador.
// No se suman ventas como si fueran cobros, ni gastos pendientes como egresos.
const viHSuma=(rows,key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
const viHArHoy=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const viHFechaLocal=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
async function viHCargar(run){
 try{
  await clienteVerificarAcceso();if(run!==viHome.run)return;
  const [clientes,productos,ventas,presupuestos,gastos,cajas,movimientos,cuentas,compras,pagos]=await Promise.all([
   viHSafe(()=>viHCount('clientes',q=>q.eq('estado','ACTIVO'))),
   viHSafe(()=>viHRows('productos','estado,stock,stock_minimo')),
   viHSafe(()=>viHRows('ventas','id_venta,fecha_venta,cliente,total,estado')),
   viHSafe(()=>viHCount('presupuestos',q=>q.eq('estado','PENDIENTE'))),
   viHSafe(()=>viHRows('gastos','fecha,fecha_pago,importe,estado')),
   viHSafe(()=>viHRows('cajas','id_caja,fecha,apertura,cierre,estado,saldo_inicial,efectivo_esperado')),
   viHSafe(()=>viHRows('movimientos_caja','fecha,tipo,medio_pago,importe')),
   viHSafe(()=>viHRows('cuentas_cobrar','saldo_pendiente,estado')),
   viHSafe(()=>viHRows('compras','id_compra,total,estado')),
   viHSafe(()=>viHRows('pagos_proveedores','id_compra,importe'))
  ]);
  if(run!==viHome.run||!viH$('vhKpis'))return;
  const hoy=viHArHoy(),mes=hoy.slice(0,7),confirmadas=(ventas.value||[]).filter(v=>v.estado==='CONFIRMADA'||v.estado==='COMPLETADA');
  const fechaVenta=v=>String(v.fecha_venta||'').slice(0,10);
  const hoyVentas=confirmadas.filter(v=>fechaVenta(v)===hoy),mesVentas=confirmadas.filter(v=>fechaVenta(v).slice(0,7)===mes);
  const activos=(productos.value||[]).filter(p=>String(p.estado||'ACTIVO').toUpperCase()==='ACTIVO');
  const stockBajo=activos.filter(p=>p.stock_minimo!=null&&Number(p.stock)<=Number(p.stock_minimo)).length;
  const gastosMes=(gastos.value||[]).filter(g=>String(g.fecha||'').slice(0,7)===mes&&g.estado!=='ANULADO');
  const gastosPagados=gastosMes.filter(g=>g.estado==='PAGADO');
  const gastosPendientes=gastosMes.filter(g=>g.estado==='PENDIENTE');
  const cobrar=(cuentas.value||[]).filter(c=>c.estado!=='ANULADA').reduce((s,c)=>s+Math.max(0,Number(c.saldo_pendiente)||0),0);
  const abonado=new Map();(pagos.value||[]).forEach(p=>abonado.set(String(p.id_compra),(abonado.get(String(p.id_compra))||0)+(Number(p.importe)||0)));
  const porPagar=(compras.value||[]).filter(c=>c.estado==='CONFIRMADA').reduce((s,c)=>s+Math.max(0,(Number(c.total)||0)-(abonado.get(String(c.id_compra))||0)),0);
  const cajasOrdenadas=[...(cajas.value||[])].sort((a,b)=>String(b.apertura||'').localeCompare(String(a.apertura||'')));
  const cajaAbierta=cajasOrdenadas.find(c=>c.estado==='ABIERTA');
  const cajaHoy=cajasOrdenadas.find(c=>String(c.fecha||'').slice(0,10)===hoy);
  const caja=cajaAbierta||cajaHoy;
  let efectivo=null,cajaDetalle='Sin caja abierta hoy';
  if(caja){
   if(caja.estado==='CERRADA'&&caja.efectivo_esperado!=null){efectivo=Number(caja.efectivo_esperado);cajaDetalle='Última caja cerrada · '+String(caja.fecha||'').slice(0,10);}
   else if(caja.estado==='ABIERTA'&&movimientos.value){
    const apertura=new Date(caja.apertura).getTime();
    const ms=movimientos.value.filter(m=>{const t=new Date(m.fecha).getTime();return Number.isFinite(t)&&t>=apertura&&m.medio_pago==='EFECTIVO';});
    efectivo=(Number(caja.saldo_inicial)||0)+ms.reduce((s,m)=>s+(m.tipo==='INGRESO'?1:m.tipo==='EGRESO'?-1:0)*(Number(m.importe)||0),0);
    cajaDetalle='Caja abierta · efectivo esperado';
   }else cajaDetalle='No se pudieron consultar los movimientos de Caja';
  }
  const card=(titulo,valor,nota)=>`<div class="vh-kpi"><span>${viHE(titulo)}</span><strong>${viHE(valor)}</strong><small>${viHE(nota)}</small></div>`;
  viH$('vhKpis').innerHTML=[
   card('Ventas de hoy',ventas.error?'—':viHM(viHSuma(hoyVentas,'total')),ventas.error?'No disponible':`${hoyVentas.length} operaciones`),
   card('Ventas del mes',ventas.error?'—':viHM(viHSuma(mesVentas,'total')),'Facturación confirmada, no cobros'),
   card('Efectivo en Caja',cajas.error||movimientos.error&&caja?.estado==='ABIERTA'?'—':efectivo===null?'—':viHM(efectivo),cajas.error?'No disponible':cajaDetalle),
   card('Por cobrar',cuentas.error?'—':viHM(cobrar),'Saldo pendiente de clientes'),
   card('Por pagar',compras.error||pagos.error?'—':viHM(porPagar),'Compras confirmadas menos pagos'),
   card('Gastos pagados · mes',gastos.error?'—':viHM(viHSuma(gastosPagados,'importe')),'Gastos operativos abonados'),
   card('Gastos pendientes · mes',gastos.error?'—':viHM(viHSuma(gastosPendientes,'importe')),'Todavía no pagados'),
   card('Clientes activos',clientes.error?'—':viHN(clientes.value),'Registrados'),
   card('Productos activos',productos.error?'—':viHN(activos.length),'En catálogo'),
   card('Stock bajo',productos.error?'—':viHN(stockBajo),'Stock menor o igual al mínimo'),
   card('Presupuestos pendientes',presupuestos.error?'—':viHN(presupuestos.value),'Por resolver'),
   card('Ventas confirmadas',ventas.error?'—':viHN(confirmadas.length),'Registros consultados')
  ].join('');
  const serie=Array.from({length:7},(_,i)=>{let d=new Date();d.setDate(d.getDate()-6+i);const clave=viHFechaLocal(d);return {clave,dia:d.toLocaleDateString('es-AR',{weekday:'short'}),total:viHSuma(confirmadas.filter(v=>fechaVenta(v)===clave),'total')}});
  const max=Math.max(1,...serie.map(s=>s.total));
  viH$('vhGrafico').innerHTML=ventas.error?`<p class="vh-warn">${viHE(ventas.error)}</p>`:`<div class="vh-bars">${serie.map(x=>`<div class="vh-barbox" title="${viHE(x.clave)}: ${viHE(viHM(x.total))}"><small>${viHE(viHM(x.total))}</small><div class="vh-bar" style="height:${Math.max(x.total?3:0,x.total/max*76)}%"></div><small>${viHE(x.dia)}</small></div>`).join('')}</div>`;
  const alert=(t,n)=>`<div class="vh-alert"><span>${viHE(t)}</span><b>${viHE(n)}</b></div>`;
  viH$('vhAlertas').innerHTML=alert('Productos con stock bajo',productos.error?'—':stockBajo)+alert('Presupuestos pendientes',presupuestos.error?'—':presupuestos.value)+alert('Cuentas por cobrar',cuentas.error?'—':viHM(cobrar))+alert('Cuentas por pagar',compras.error||pagos.error?'—':viHM(porPagar))+
   [clientes,productos,ventas,presupuestos,gastos,cajas,movimientos,cuentas,compras,pagos].filter(x=>x.error).map(x=>`<p class="vh-warn">Dato no disponible: ${viHE(x.error)}</p>`).join('');
  const ultimas=[...confirmadas].sort((a,b)=>String(b.fecha_venta||'').localeCompare(String(a.fecha_venta||''))).slice(0,8);
  viH$('vhUltimas').innerHTML=ventas.error?`<p class="vh-warn">${viHE(ventas.error)}</p>`:ultimas.length?`<table class="vh-table"><thead><tr><th>Fecha</th><th>Venta</th><th>Cliente</th><th>Total</th></tr></thead><tbody>${ultimas.map(v=>`<tr><td>${viHE(viHD(fechaVenta(v)))}</td><td>${viHE(v.id_venta)}</td><td>${viHE(v.cliente||'—')}</td><td>${viHE(viHM(v.total))}</td></tr>`).join('')}</tbody></table>`:'<p class="vh-note">Todavía no hay ventas confirmadas.</p>';
  viH$('vhResumen').innerHTML=alert('Usuario',perfil?.nombre||'—')+alert('Rol',perfil?.rol||'—')+alert('Ventas de hoy',ventas.error?'—':hoyVentas.length)+alert('Gastos del mes',gastos.error?'—':gastosMes.length)+`<p class="vh-note">Las ventas no equivalen a cobros. Caja muestra solo efectivo esperado; no incluye transferencias ni tarjetas. La ganancia no se calcula sin el costo de mercadería vendida.</p>`;
 }catch(e){if(run!==viHome.run)return;const el=viH$('vhKpis');if(el)el.innerHTML=`<div class="vh-panel"><p class="vh-warn">No se pudo cargar Inicio: ${viHE(e?.message||e)}</p></div>`;if(typeof notificarVicora==='function')notificarVicora('Error al cargar Inicio',String(e?.message||e),'error')}
}
