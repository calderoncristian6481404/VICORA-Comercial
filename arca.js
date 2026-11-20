/* Optional preparation-only client. No sale RPC, fiscal credentials or send API. */
(function(root){
'use strict';
function client({db,apiOrigin,fetchImpl=root.fetch,timeoutMs=15000}){
  const u=new URL(apiOrigin);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Configuración fiscal no disponible.');
  const origin=u.origin,inflight=new Map();
  const states=['NO_DISPONIBLE','PREPARADO_NO_EMITIDO','RESULTADO_INCIERTO','BLOQUEADO','EMISION_BLOQUEADA','RECHAZADO','CONFLICTO_BLOQUEADO','DEMO_CONCILIADO_NO_FISCAL','AUTORIZADO_HOMO_VERIFICADO'];
  function checkedStatus(value){
    if(!states.includes(value.status))throw new Error('Estado fiscal no verificable.');
    if(value.status==='AUTORIZADO_HOMO_VERIFICADO'){if(value.environment!=='HOMOLOGACION'||value.authorization_verified!==true)throw new Error('Autorización fiscal no verificable.');}
    else if(value.document_available===true||value.authorization_verified===true)throw new Error('Una simulación no autoriza documentos fiscales.');
    return value;
  }
  async function session(){const {data,error}=await db.auth.getSession();if(error||!data?.session?.access_token)throw new Error('Iniciá sesión nuevamente.');return data.session;}
  async function request(path,method,body,token,reauth){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(origin+'/v1/fiscal/'+path,{method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,
        headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...(reauth?{'X-Vicora-Reauth':reauth}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const value=await response.json();
      if(!response.ok)throw new Error('La operación fiscal está bloqueada. Revisá permisos y configuración; la venta no se vuelve a registrar.');
      if(value.can_send!==false||value.runtime_enabled!==false)throw new Error('Respuesta fiscal no válida.');
      return value;
    }catch(error){
      if(error.name==='AbortError')throw new Error('No se pudo confirmar la preparación. No se reenvió: consultá nuevamente desde la venta.');
      if(error instanceof TypeError)throw new Error('Conexión fiscal no disponible. La venta ya registrada no cambia.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  return {
    async prepare(body){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const s=await session(),key=s.access_token+'|'+body.saleRef;
      if(inflight.has(key))return inflight.get(key);
      const promise=request('prepare','POST',{saleRef:body.saleRef},s.access_token).then(value=>{
        if(value.status!=='PREPARADO_NO_EMITIDO'||![1,6,11].includes(value.document_type)||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(value.operation)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value.operation))throw new Error('Respuesta de preparación no válida.');
        return value;
      }).finally(()=>inflight.delete(key));
      inflight.set(key,promise);return promise;
    },
    async capabilities(){
      const value=await request('capabilities','GET',null,(await session()).access_token);
      if(typeof value.preparation_enabled!=='boolean'||typeof value.configuration_enabled!=='boolean'||!Array.isArray(value.document_types)||value.document_types.some(k=>![1,3,6,8,11,13].includes(k)))throw new Error('Habilitación fiscal no verificable.');
      return value;
    },
    async status(body){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const value=await request('status','POST',{saleRef:body.saleRef},(await session()).access_token);
      return checkedStatus(value);
    },
    async requestAuthorization(body){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const capability=await this.capabilities();
      if(capability.completion_enabled!==true||!['LAB_TLS','HOMOLOGACION'].includes(capability.completion_mode))throw new Error('La autorización fiscal sigue deshabilitada. La venta no cambia.');
      const token=(await session()).access_token,key='completion|'+token+'|'+body.saleRef;
      if(inflight.has(key))return inflight.get(key);
      const promise=request('request','POST',body,token).then(checkedStatus).finally(()=>inflight.delete(key));inflight.set(key,promise);return promise;
    },
    async reconcile(body){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const capability=await this.capabilities();if(capability.completion_enabled!==true)throw new Error('Conciliación fiscal deshabilitada.');
      return checkedStatus(await request('reconcile','POST',body,(await session()).access_token));
    },
    async document(body,format){
      if(!['A4','80mm'].includes(format))throw new Error('Formato no disponible.');
      const value=await this.status(body);
      if(value.status!=='AUTORIZADO_HOMO_VERIFICADO'||value.environment!=='HOMOLOGACION'||value.authorization_verified!==true||value.document_available!==true)throw new Error('No hay CAE verificado para descargar.');
      const token=(await session()).access_token,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await fetchImpl(origin+'/v1/fiscal/document',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({saleRef:body.saleRef,format})});
        if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new Error('Documento fiscal no disponible.');
        const blob=await response.blob();if(blob.size>8*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error('Documento fiscal no verificable.');return blob;
      }catch(_){throw new Error('Documento fiscal no disponible. La venta no cambia.');}finally{clearTimeout(timer);}
    },
    async profile(){return request('config','GET',null,(await session()).access_token);},
    async saveProfile(profile,reauthenticate){
      const s=await session(),fresh=await reauthenticate();
      if(!fresh||fresh===s.access_token)throw new Error('Es necesaria una reautenticación reciente.');
      return request('config','PUT',profile,s.access_token,fresh);
    }
  };
}
function node(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
function dialog(title){
  const d=node('dialog');d.style.cssText='width:min(520px,90vw);max-height:90vh;overflow:auto;border:0;border-radius:14px;padding:24px';
  d.append(node('h2',title));const close=node('button','Cerrar');close.type='button';close.onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);return {d,close};
}
root.vicoraArcaInstalar=async function({db,createAuthClient,role}){
  root.VICORA_ARCA_UI_HABILITADA=false;
  const button=document.getElementById('vicoraArcaConfiguracion');if(button)button.hidden=true;
  const config=root.VICORA_ARCA_CONFIG;
  if(config?.enabled!==true)return;
  let api;try{api=client({db,apiOrigin:config.apiOrigin});}catch(_){return;}
  async function refresh(){
    root.VICORA_ARCA_UI_HABILITADA=false;
    const capability=await api.capabilities();
    root.VICORA_ARCA_UI_HABILITADA=capability.preparation_enabled===true;
    return capability;
  }
  root.vicoraArcaRefrescarDisponibilidad=refresh;
  async function showStatus(body,value){
    const view=dialog('Estado del comprobante');
    const labels={NO_DISPONIBLE:'No hay una preparación disponible.',PREPARADO_NO_EMITIDO:'Preparada: no emitida, sin CAE.',EMISION_BLOQUEADA:'Preparada; autorización fiscal deshabilitada.',RESULTADO_INCIERTO:'Resultado incierto. No reenviar; requiere conciliación.',BLOQUEADO:'Operación bloqueada. Requiere revisión.',CONFLICTO_BLOQUEADO:'Respuestas contradictorias. Operación bloqueada sin reenvío.',RECHAZADO:'Solicitud rechazada. No se reenvía automáticamente.',DEMO_CONCILIADO_NO_FISCAL:'Ensayo conciliado. NO FISCAL: no tiene CAE auténtico ni documento fiscal.',AUTORIZADO_HOMO_VERIFICADO:'Autorización de homologación verificada; no es emisión de producción.'};
    view.d.append(node('p',labels[value.status]||'Preparada, sin emisión.'),node('p','La venta ya fue registrada una sola vez. El ticket VICORA es NO FISCAL.'));
    if(value.status==='AUTORIZADO_HOMO_VERIFICADO'&&value.environment==='HOMOLOGACION'&&value.authorization_verified===true&&value.document_available===true){
      for(const format of ['A4','80mm']){
        const download=node('button',format==='A4'?'Descargar PDF A4':'Descargar / reimprimir 80 mm');download.type='button';
        download.onclick=async()=>{download.disabled=true;try{const blob=await api.document(body,format),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='vicora-homologacion-'+format+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_){view.d.append(node('p','No se pudo verificar el documento. No vuelvas a registrar la venta.'));}finally{download.disabled=false;}};
        view.d.append(download);
      }
    }else view.d.append(node('p','No hay CAE verificado: no se habilitan PDF, QR ni impresión fiscal.'));
    if(value.status==='RESULTADO_INCIERTO'){
      const reconcile=node('button','Consultar y conciliar (sin reenviar)');reconcile.type='button';reconcile.onclick=async()=>{reconcile.disabled=true;try{const result=await api.reconcile(body);view.d.close();await showStatus(body,result);}catch(_){view.d.append(node('p','Conciliación no disponible. La solicitud permanece bloqueada.'));}finally{reconcile.disabled=false;}};view.d.append(reconcile);
    }
    view.d.append(view.close);view.d.showModal();return value;
  }
  root.vicoraArcaIniciarEmision=async body=>{
    const capability=await refresh();
    if(capability.preparation_enabled!==true)throw new Error('El comercio no tiene preparación fiscal habilitada. El ticket común sigue disponible.');
    let value=await api.prepare(body);
    // Preparation never reserves. This separate request only follows the seller's
    // explicit invoice choice and a SERVER-owned emitter-wide admission.
    if(capability.completion_enabled===true)value=await api.requestAuthorization(body);
    return showStatus(body,value);
  };
  root.vicoraArcaConsultarEstado=async body=>showStatus(body,await api.status(body));
  let capability;try{capability=await refresh();}catch(_){return;}
  if(button&&role==='ADMINISTRADOR'&&capability.configuration_enabled===true){
    button.hidden=false;button.onclick=async()=>{
      const view=dialog('Configuración · Facturación electrónica');
      view.d.append(node('p','Opcional por comercio. Usá la identidad fiscal propia del comercio. Guardar no habilita emisión ni valida representación.'));
      const message=node('p');message.setAttribute('role','status');view.d.append(message);
      const form=node('form');view.d.append(form);
      try{
        const {profile}=await api.profile();
        const fields={};
        function field(name,label,type,value,options){const wrap=node('label',label);wrap.style.cssText='display:block;margin:12px 0';const input=node(options?'select':'input');input.name=name;
          if(options){for(const [v,t] of options){const o=node('option',t);o.value=v;input.append(o);}input.value=value||options[0][0];}
          else{input.type=type;if(type==='checkbox')input.checked=value===true;else input.value=value||'';}
          input.required=type!=='checkbox';input.style.cssText='display:block;width:100%;box-sizing:border-box';wrap.append(input);form.append(wrap);fields[name]=input;return input;}
        field('issuer','CUIT del comercio','text',profile.issuer).inputMode='numeric';
        field('condition','Condición fiscal',null,profile.condition,[['RI','Responsable inscripto'],['MONOTRIBUTO','Monotributo'],['EXENTO','Exento']]);
        const point=field('point','Punto de venta','number',profile.point);point.min='1';point.max='99998';
        field('representation','Representación',null,profile.representation,[['PROPIA','Propia'],['DELEGADA','Delegada']]);
        field('enabled','Solicitar habilitación de preparación (no emisión)','checkbox',profile.enabled);
        const password=field('password','Tu contraseña actual de VICORA','password','');password.autocomplete='current-password';
        const save=node('button','Guardar solicitud');save.type='submit';form.append(save);
        form.onsubmit=async event=>{
          event.preventDefault();if(save.disabled)return;save.disabled=true;
          const body={version:profile.version,issuer:fields.issuer.value.trim(),condition:fields.condition.value,point:Number(fields.point.value),representation:fields.representation.value,enabled:fields.enabled.checked};
          try{
            const result=await api.saveProfile(body,async()=>{
              const {data,error}=await db.auth.getUser();if(error||!data?.user?.email)throw new Error('No se pudo verificar tu cuenta.');
              const isolated=createAuthClient();
              let response;
              try{response=await isolated.auth.signInWithPassword({email:data.user.email,password:password.value});}
              finally{password.value='';}
              if(response.error||response.data?.user?.id!==data.user.id||!response.data?.session?.access_token)throw new Error('Reautenticación rechazada.');
              // Never signOut globally: that could revoke the main VICORA session.
              return response.data.session.access_token;
            });
            profile.version=result.profile.version;try{await refresh();}catch(_){root.VICORA_ARCA_UI_HABILITADA=false;}message.textContent='Solicitud guardada. Pendiente de verificación fiscal; emisión deshabilitada.';
          }catch(_){message.textContent='No se pudo confirmar el cambio. Consultá la configuración antes de reintentar y revisá la contraseña y los permisos.';}
          finally{password.value='';save.disabled=false;}
        };
      }catch(_){message.textContent='Configuración no disponible. La venta y el ticket común siguen funcionando.';}
      view.d.append(view.close);view.d.showModal();
    };
  }
};
if(typeof module==='object'&&module.exports)module.exports={client};
})(typeof window==='object'?window:globalThis);
