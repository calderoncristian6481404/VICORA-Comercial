/* VICORA Comercial: suscripción vencida = SOLO CONSULTA, en todos los módulos.
   Complementa el bloqueo de escritura del servidor; nunca reemplaza RLS/triggers.
   Mi suscripción y sus renovaciones conservan sus acciones originales. */
(function(){
'use strict';
let suscripcion=null;
let observador=null;
let revision=0;
const zona='America/Argentina/Buenos_Aires';
function hoy(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:zona,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const a=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return a.year+'-'+a.month+'-'+a.day;
}
function vigente(s){
  if(!s || typeof s!=='object')return false;
  const estado=String(s.estado||'').trim().toUpperCase();
  if(!['ACTIVA','PRUEBA'].includes(estado))return false;
  const campo=estado==='PRUEBA'?s.fecha_fin_prueba:s.proximo_vencimiento;
  const fecha=String(campo||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha)&&fecha>=hoy();
}
function renovacion(root){
  return !!(root&&root.querySelector('.vi-sub-head, .vi-transfer-card'));
}
// En caso de duda se deshabilitan acciones operativas, pero nunca consultas.
function consultaPermitida(control){
  const label=String(control.textContent||control.value||control.getAttribute('aria-label')||control.getAttribute('title')||'')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const id=String(control.id||'').toLowerCase();
  const accion=String(control.getAttribute('onclick')||'').toLowerCase();
  if(/^(ver\b|consultar\b|detalle\b|imprimir\b|descargar\b|exportar\b|pdf\b|csv\b|historial\b|cuentas\b|actualizar\b|recargar\b|buscar\b|filtrar\b|cerrar\b|volver\b|cancelar\b|limpiar\b|anterior\b|siguiente\b|mostrar más\b|copiar\b)/.test(label))return true;
  if(/(?:vermas|verfic|detalle|imprim|ticket|export|descarg|filtro|buscar|actualiz|recarg|historial|cerrar|cancel|pagin|siguiente|anterior)/.test(id+' '+accion))return true;
  // Algunas pestañas de solo lectura se muestran por su nombre.
  if(/^(cuentas corrientes|cobros registrados|pagos registrados|registrados|pendientes|todos|todos los registros|por mes|por año)$/.test(label))return true;
  return false;
}
function actualizar(){
  const root=document.getElementById('contenidoPrincipal');
  if(!root||typeof perfil==='undefined'||!perfil)return;
  const sinVigencia=!vigente(suscripcion);
  const bloquear=sinVigencia&&!renovacion(root);
  document.body.classList.toggle('vicora-modo-consulta',bloquear);
  const existente=root.querySelector('#vicoraAvisoSoloConsulta');
  if(bloquear&&!existente){
    const aviso=document.createElement('section');
    aviso.id='vicoraAvisoSoloConsulta';
    aviso.setAttribute('role','status');
    aviso.textContent='🔒 Suscripción vencida: modo solo consulta. Podés ver el historial, los detalles, los reportes y tus comprobantes. Para volver a registrar operaciones, renová desde Mi suscripción.';
    aviso.style.cssText='padding:13px 16px;margin:0 0 16px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74;border-radius:12px;font-size:13px;font-weight:700;line-height:1.5';
    root.insertBefore(aviso,root.firstChild);
  }else if(!bloquear&&existente)existente.remove();
  for(const control of root.querySelectorAll('button,input[type="submit"],input[type="button"]')){
    if(!bloquear){
      if(control.dataset.vicoraSoloLecturaBloqueado==='1'){
        control.disabled=false;
        if(control.dataset.vicoraSoloLecturaTituloAnterior===undefined)control.removeAttribute('title');
        else control.setAttribute('title',control.dataset.vicoraSoloLecturaTituloAnterior);
        delete control.dataset.vicoraSoloLecturaBloqueado;
        delete control.dataset.vicoraSoloLecturaTituloAnterior;
      }
    }else if(!consultaPermitida(control)&&!control.disabled){
      control.dataset.vicoraSoloLecturaBloqueado='1';
      if(control.hasAttribute('title'))control.dataset.vicoraSoloLecturaTituloAnterior=control.getAttribute('title');
      control.setAttribute('title','Solo lectura: renová tu suscripción para operar.');
      control.disabled=true;
    }
  }
}
function fijar(s){suscripcion=s||null;actualizar();}
function bloquearEdicion(){
  if(vigente(suscripcion))return false;
  if(typeof notificarVicora==='function')notificarVicora(
    'Suscripción vencida',
    'Tu cuenta está en modo consulta. Podés ver tus registros y renovar desde Mi suscripción.',
    'advertencia'
  );
  return true;
}
async function refrescar(){
  if(typeof db==='undefined'||!db||typeof perfil==='undefined'||!perfil?.id_negocio)return;
  const ticket=++revision;
  try{
    const {data,error}=await db.from('suscripciones')
      .select('id_negocio,id_sistema,estado,fecha_fin_prueba,proximo_vencimiento')
      .eq('id_negocio',perfil.id_negocio).eq('id_sistema','SIS-000001').maybeSingle();
    if(ticket!==revision)return;
    suscripcion=(!error&&data&&data.id_negocio===perfil.id_negocio&&data.id_sistema==='SIS-000001')?data:null;
  }catch(e){if(ticket===revision)suscripcion=null;}
  if(ticket===revision)actualizar();
}
function iniciar(s){
  fijar(s);
  if(observador)return;
  const root=document.getElementById('contenidoPrincipal');
  if(!root)return;
  observador=new MutationObserver(actualizar);
  observador.observe(root,{subtree:true,childList:true});
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden)refrescar().catch(()=>{});
  });
}
window.vicoraSoloLecturaInicio=iniciar;
window.vicoraSoloLecturaRefrescar=refrescar;
window.vicoraSoloLecturaFijar=fijar;
window.vicoraBloquearEdicion=bloquearEdicion;
window.vicoraSoloLecturaVigente=vigente;
})();
