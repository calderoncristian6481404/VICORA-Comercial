/* Optional preparation-only client. No sale RPC, fiscal credentials or send API. */
(function(root){
'use strict';
function client({db,apiOrigin,fetchImpl=root.fetch,timeoutMs=15000}){
  const u=new URL(apiOrigin);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Configuración fiscal no disponible.');
  const origin=u.origin,inflight=new Map();
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
root.vicoraArcaInstalar=function({db,createAuthClient,role}){
  root.VICORA_ARCA_UI_HABILITADA=false;
  const button=document.getElementById('vicoraArcaConfiguracion');if(button)button.hidden=true;
  const config=root.VICORA_ARCA_CONFIG;
  if(config?.enabled!==true)return;
  let api;try{api=client({db,apiOrigin:config.apiOrigin});}catch(_){return;}
  root.vicoraArcaIniciarEmision=async body=>{
    const value=await api.prepare(body),view=dialog('Factura preparada, no emitida');
    view.d.append(node('p','Tipo '+({1:'A',6:'B',11:'C'}[value.document_type])+'. La venta ya está registrada. No se reservó numeración ni se envió a ARCA.'));
    view.d.append(node('p','No hay CAE verificado: no se habilitan PDF, QR ni impresión fiscal.'),view.close);view.d.showModal();return value;
  };
  root.VICORA_ARCA_UI_HABILITADA=true;
  if(button&&role==='ADMIN'){
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
            profile.version=result.profile.version;message.textContent='Solicitud guardada. Pendiente de verificación fiscal; emisión deshabilitada.';
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
