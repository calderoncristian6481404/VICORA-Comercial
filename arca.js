/* Optional per-sale fiscal client. No sale RPC or fiscal credentials in the browser. */
(function(root){
'use strict';
let installation=0;
function client({db,apiOrigin,fetchImpl=root.fetch,timeoutMs=15000}){
  const u=new URL(apiOrigin);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Configuración fiscal no disponible.');
  const origin=u.origin,inflight=new Map();
  const states=['NO_DISPONIBLE','PREPARADO_NO_EMITIDO','RESULTADO_INCIERTO','BLOQUEADO','EMISION_BLOQUEADA','RECHAZADO','CONFLICTO_BLOQUEADO','DEMO_CONCILIADO_NO_FISCAL','AUTORIZADO_HOMO_VERIFICADO','PENDIENTE_CONCILIACION','CONSULTA_REGISTRADA','AUTORIZADO_PROD_VERIFICADO'];
  function checkedStatus(value){
    if(!states.includes(value.status))throw new Error('Estado fiscal no verificable.');
    const verified=(value.status==='AUTORIZADO_HOMO_VERIFICADO'&&value.environment==='HOMOLOGACION')||
      (value.status==='AUTORIZADO_PROD_VERIFICADO'&&value.environment==='PRODUCCION');
    if(verified){
      if(value.authorization_verified!==true||value.document_available!==true)
        throw new Error('La autorización fiscal no fue comprobada.');
    }else if(value.document_available===true||value.authorization_verified===true)
      throw new Error('Un comprobante pendiente no autoriza documentos fiscales.');
    if(['PENDIENTE_CONCILIACION','CONSULTA_REGISTRADA'].includes(value.status)&&value.environment!=='PRODUCCION')
      throw new Error('Estado de producción no verificable.');
    // A production success without its own verified CAE receipt is incomplete.
    // Never show a fiscal download solely because success booleans were supplied.
    if(value.status==='AUTORIZADO_PROD_VERIFICADO'&&value.receipt===undefined)
      throw new Error('Falta el comprobante fiscal de producción verificable.');
    if(value.receipt!==undefined){
      const r=value.receipt,keys=['point','kind','number','cae','expiry','date'];
      if(value.status!=='AUTORIZADO_PROD_VERIFICADO'||!verified||!r||typeof r!=='object'||Object.keys(r).sort().join('|')!==keys.sort().join('|')||!Number.isInteger(r.point)||r.point<1||r.point>99998||![1,6,11].includes(r.kind)||!Number.isInteger(r.number)||r.number<1||r.number>99999999||typeof r.cae!=='string'||!/^[0-9]{14}$/.test(r.cae)||/^0+$/.test(r.cae)||typeof r.expiry!=='string'||!/^[0-9]{8}$/.test(r.expiry)||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw new Error('Datos del comprobante no verificables.');
      const validDate=(v)=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
      if(!validDate(r.date)||!validDate(r.expiry.slice(0,4)+'-'+r.expiry.slice(4,6)+'-'+r.expiry.slice(6)))throw new Error('Fechas del comprobante no verificables.');
    }
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
      if(capability.completion_enabled!==true||!['LAB_TLS','HOMOLOGACION','PRODUCCION'].includes(capability.completion_mode))throw new Error('La autorización fiscal sigue deshabilitada. La venta no cambia.');
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
      if(!['AUTORIZADO_HOMO_VERIFICADO','AUTORIZADO_PROD_VERIFICADO'].includes(value.status)||value.authorization_verified!==true||value.document_available!==true)throw new Error('No hay CAE verificado para descargar.');
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
    },
    async enrollmentStatus(){
      const value=await request('enrollment','GET',null,(await session()).access_token);
      if(value.environment!=='PRODUCCION'||!['SIN_CONFIGURAR','PENDIENTE_VERIFICACION','HABILITADO','REQUIERE_REVALIDACION'].includes(value.state))throw new Error('Verificación fiscal no disponible.');
      return value;
    },
    async verifyEnrollment(version,reauthenticate){
      if(!Number.isSafeInteger(version)||version<1||typeof reauthenticate!=='function')throw new Error('Configuración fiscal incompleta.');
      const s=await session(),fresh=await reauthenticate();
      if(!fresh||fresh===s.access_token)throw new Error('Es necesaria una reautenticación reciente.');
      const value=await request('enrollment','POST',{version},s.access_token,fresh);
      if(value.environment!=='PRODUCCION'||value.state!=='HABILITADO')throw new Error('ARCA no verificó la habilitación fiscal.');
      return value;
    }
  };
}
function node(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
function dialog(title){
  const d=node('dialog');d.style.cssText='box-sizing:border-box;width:min(520px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:90vh;overflow:auto;border:0;border-radius:14px;padding:24px';
  d.append(node('h2',title));const close=node('button','Cerrar');close.type='button';close.onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);return {d,close};
}
root.vicoraArcaInstalar=async function({db,createAuthClient,role}){
  const generation=++installation;
  for(const name of ['vicoraArcaIniciarEmision','vicoraArcaConsultarEstado','vicoraArcaRefrescarDisponibilidad'])delete root[name];
  root.VICORA_ARCA_UI_HABILITADA=false;
  const button=document.getElementById('vicoraArcaConfiguracion');if(button){button.hidden=true;button.onclick=null;}
  const config=root.VICORA_ARCA_CONFIG;
  // Merchant onboarding is separate from invoice emission. Admin may explicitly
  // store a draft/request under its Supabase RLS business; never private keys.
  // No ARCA issuance, WSAA call, invoice number or CAE from this UI.
  function offlineSetup(){
    const view=dialog('Facturación electrónica · Alta de comercio');
    view.d.style.cssText='box-sizing:border-box;width:min(680px,calc(100vw - 20px));max-width:680px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #dfe5ef;border-radius:16px;padding:clamp(14px,3vw,26px);color:#243247;background:#fff;box-shadow:0 22px 70px #11182733';
    const heading=view.d.firstElementChild;
    if(heading)heading.style.cssText='font-size:clamp(19px,4vw,23px);line-height:1.25;margin:0 0 12px';
    const note=node('div');
    note.style.cssText='padding:11px 13px;background:#fef3c7;color:#713f12;border:1px solid #fde68a;border-radius:10px;margin:12px 0 18px;font-size:13px;line-height:1.5';
    note.textContent='ALTA DE COMERCIO · Podés guardar un borrador o enviar la solicitud de configuración para tu negocio. Esto NO habilita la emisión. ARCA y la numeración se verificarán después con el titular.';
    view.d.append(note);
    function section(title,help){
      const wrap=node('section');wrap.style.cssText='margin:18px 0;padding:15px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px';
      const h=node('h3',title);h.style.cssText='font-size:16px;margin:0 0 6px;color:#1e3a8a';
      const p=node('p',help);p.style.cssText='font-size:12px;color:#475569;line-height:1.5;margin:0 0 13px';
      wrap.append(h,p);view.d.append(wrap);return wrap;
    }
    function field(container,key,title,type,options,placeholder,help){
      const row=node('label');row.style.cssText='display:block;margin:13px 0';
      const label=node('span',title);label.style.cssText='display:block;font-weight:600;font-size:13px;margin-bottom:5px';
      const input=node(options?'select':'input');input.name=key;
      if(options){
        const placeholderOption=node('option','Seleccionar…');placeholderOption.value='';input.append(placeholderOption);
        for(const [value,title] of options){const option=node('option',title);option.value=value;input.append(option)}
        input.value='';
      }else{
        input.type=type;input.value='';if(placeholder)input.placeholder=placeholder;
        if(key==='issuer'){input.inputMode='numeric';input.maxLength=11;input.autocomplete='off'}
        if(key==='point'){input.min='1';input.max='99998';input.step='1';input.inputMode='numeric'}
        if(key==='businessName'||key==='taxAddress')input.maxLength=160;
      }
      input.style.cssText='box-sizing:border-box;display:block;width:100%;min-height:42px;padding:9px 10px;font-size:14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a';
      row.append(label,input);
      if(help){const caption=node('small',help);caption.style.cssText='display:block;font-size:12px;color:#64748b;margin-top:5px;line-height:1.5';row.append(caption)}
      container.append(row);return input;
    }
    const primary=section('1. Datos fiscales del comercio','Son los cuatro datos que identifica y controla el perfil fiscal de VICORA.');
    const issuer=field(primary,'issuer','CUIT emisor · 11 números','text',null,'Ej.: 20XXXXXXXXX','Debe ser del propio comercio, sin guiones.');
    const condition=field(primary,'condition','Condición frente al IVA',null,[['MONOTRIBUTO','Monotributista'],['RI','Responsable inscripto'],['EXENTO','Exento']],null,'Los tipos A/B/C se determinan luego con la condición verificada por ARCA.');
    const point=field(primary,'point','Punto de venta habilitado para Web Services','number',null,'Ej.: 4','No inventes ni reutilices un punto de Comprobantes en línea; debe estar habilitado para WSFE.');
    const representation=field(primary,'representation','Forma de representación',null,[['PROPIA','Emisión con representación propia'],['DELEGADA','Emisión por representante autorizado']],null,'La relación con WSFE se verifica por un canal privado.');
    const invoice=section('2. Datos para el comprobante','Se necesitan para completar y revisar la presentación de las facturas; algunos requisitos varían según el contribuyente.');
    const businessName=field(invoice,'businessName','Nombre o razón social','text',null,'Nombre registrado del emisor');
    const taxAddress=field(invoice,'taxAddress','Domicilio fiscal','text',null,'Calle, número, ciudad y provincia');
    const grossIncome=field(invoice,'grossIncome','Ingresos Brutos o condición de exención','text',null,'Inscripción / exento según corresponda');
    const activityStart=field(invoice,'activityStart','Inicio de actividades','date',null,null,'Según constancia fiscal del comercio.');
    const requirements=section('3. Autorizaciones que tiene que gestionar el titular','VICORA no puede autorizarse automáticamente en nombre de un tercero.');
    const checklist=[
      'CUIT y condición fiscal reales del comercio',
      'Punto de venta habilitado para Factura Electrónica por Web Services (WSFE)',
      'Certificado digital de producción y relación autorizada con el servicio wsfe',
      'Delegación a la identidad técnica que corresponda, si es representación de terceros',
      'Número fiscal vigente de cada punto/tipo, a conciliar con ARCA antes de emitir'
    ];
    const list=node('ul');list.style.cssText='margin:8px 0 10px;padding-left:21px;line-height:1.6;font-size:13px';
    for(const item of checklist)list.append(node('li',item));
    requirements.append(list);
    const arcaLink=node('a','Ver instrucciones oficiales de certificados ARCA');
    arcaLink.href='https://www.arca.gob.ar/ws/documentacion/certificados.asp';arcaLink.target='_blank';arcaLink.rel='noopener noreferrer';
    arcaLink.style.cssText='display:inline-block;color:#1d4ed8;font-weight:600;font-size:13px';
    requirements.append(arcaLink);
    const warning=node('p','Seguridad: nunca ingreses claves fiscales, certificados privados, Token ni Sign en este formulario. Los datos ingresados se guardan únicamente cuando elegís Guardar borrador o Enviar solicitud. Solo un administrador de este comercio puede consultarlos.');
    warning.style.cssText='font-size:12px;line-height:1.5;color:#475569;margin:15px 0';
    view.d.append(warning);
    const consentRow=node('label');consentRow.style.cssText='display:flex;align-items:flex-start;gap:9px;font-size:13px;line-height:1.5;padding:12px;background:#eef2ff;border-radius:10px';
    const consent=node('input');consent.type='checkbox';consent.name='declaraResponsabilidad';consent.checked=false;consent.style.cssText='width:18px;height:18px;flex-shrink:0;margin-top:2px';
    consentRow.append(consent,node('span','Declaro que soy titular o tengo autorización del comercio para solicitar la configuración fiscal. Esto no sustituye la representación formal ante ARCA.'));
    view.d.append(consentRow);
    const message=node('p');message.setAttribute('role','status');
    message.style.cssText='font-size:13px;line-height:1.5;color:#334155;min-height:18px;margin:7px 0';
    const actions=node('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:14px';
    function action(title,kind){
      const b=node('button',title);b.type='button';
      b.style.cssText='min-height:42px;padding:10px 13px;border-radius:9px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;'+(kind==='primary'?'background:#1d4ed8;color:white;border-color:#1d4ed8':'background:white;color:#1e293b');
      actions.append(b);return b;
    }
    const check=action('Revisar datos ingresados','primary');
    check.onclick=()=>{
      const errors=[];
      if(!/^[0-9]{11}$/.test(issuer.value.trim()))errors.push('CUIT: ingresá 11 números sin guiones.');
      if(!['MONOTRIBUTO','RI','EXENTO'].includes(condition.value))errors.push('Seleccioná la condición frente al IVA.');
      const n=Number(point.value);
      if(!/^[0-9]{1,5}$/.test(String(point.value))||!Number.isInteger(n)||n<1||n>99998)errors.push('Punto de venta: número válido entre 1 y 99998.');
      if(!['PROPIA','DELEGADA'].includes(representation.value))errors.push('Seleccioná la representación.');
      if(!businessName.value.trim())errors.push('Indicá el nombre o razón social.');
      message.textContent=errors.length
        ? 'Faltan datos: '+errors.join(' ')
        : 'Formato revisado. No verifica autorización ARCA ni guarda datos por sí solo.';
      message.style.color=errors.length?'#991b1b':'#166534';
    };
    // The business is taken ONLY from a server-verified Supabase Auth user and
    // its tenant-scoped users row, never from form fields or browser storage.
    async function member(){
      if(generation!==installation || role!=='ADMINISTRADOR')throw new Error('La sesión cambió.');
      const {data:auth,error:authError}=await db.auth.getUser();
      if(authError||!auth?.user?.id)throw new Error('Iniciá sesión nuevamente.');
      const {data:users,error:userError}=await db.from('usuarios')
        .select('id_negocio,rol,estado').eq('auth_user_id',auth.user.id).limit(2);
      if(userError||!Array.isArray(users)||users.length!==1||
         users[0].rol!=='ADMINISTRADOR'||users[0].estado!=='ACTIVO'||
         !users[0].id_negocio||generation!==installation)
        throw new Error('No se pudo verificar el administrador del comercio.');
      return users[0].id_negocio;
    }
    function values(){
      const clean=x=>String(x.value||'').trim()||null;
      return {
        cuit_emisor:clean(issuer),condicion_iva:clean(condition),
        punto_venta:clean(point)?Number(point.value):null,
        representacion:clean(representation),razon_social:clean(businessName),
        domicilio_fiscal:clean(taxAddress),ingresos_brutos:clean(grossIncome),
        inicio_actividades:clean(activityStart),declara_responsabilidad:consent.checked===true
      };
    }
    function renderStatus(record){
      if(!record){message.textContent='No hay una solicitud guardada para este comercio.';return;}
      message.style.color='#334155';
      message.textContent=record.estado==='SOLICITADA'
        ? 'Solicitud registrada y pendiente de revisión. Todavía NO estás autorizado a emitir facturas ARCA.'
        : 'Borrador guardado para este comercio. Podés completarlo y enviarlo cuando quieras.';
    }
    const savedStatus=node('p','Podés guardar la solicitud por comercio, sin activar ARCA. Consultá el estado con Cargar solicitud.');
    savedStatus.style.cssText='font-size:13px;color:#475569;margin:10px 0';
    view.d.append(savedStatus);
    const load=action('Cargar solicitud');
    load.onclick=async()=>{
      load.disabled=true;
      try{
        const id=await member();
        const {data,error}=await db.from('vicora_arca_solicitudes_comercio')
          .select('cuit_emisor,condicion_iva,punto_venta,representacion,razon_social,domicilio_fiscal,ingresos_brutos,inicio_actividades,declara_responsabilidad,estado,solicitada_en')
          .eq('id_negocio',id).maybeSingle();
        if(error||generation!==installation)throw new Error('No se pudo recuperar la solicitud.');
        if(data){
          issuer.value=data.cuit_emisor||'';
          condition.value=data.condicion_iva||'';
          point.value=data.punto_venta==null?'':String(data.punto_venta);
          representation.value=data.representacion||'';
          businessName.value=data.razon_social||'';
          taxAddress.value=data.domicilio_fiscal||'';
          grossIncome.value=data.ingresos_brutos||'';
          activityStart.value=data.inicio_actividades||'';
          consent.checked=data.declara_responsabilidad===true;
        }
        renderStatus(data);
      }catch(_){message.textContent='No se pudieron cargar los datos. Comprobá tu sesión y conexión.';message.style.color='#991b1b';}
      finally{load.disabled=false;}
    };
    async function persist(submit,button){
      if(generation!==installation)return;
      const v=values(),errors=[];
      if(submit){
        if(!/^[0-9]{11}$/.test(v.cuit_emisor||''))errors.push('CUIT de 11 dígitos');
        if(!['MONOTRIBUTO','RI','EXENTO'].includes(v.condicion_iva))errors.push('condición IVA');
        if(!Number.isInteger(v.punto_venta)||v.punto_venta<1||v.punto_venta>99998)errors.push('punto WSFE');
        if(!['PROPIA','DELEGADA'].includes(v.representacion))errors.push('representación');
        if(!v.razon_social||!v.domicilio_fiscal||!v.ingresos_brutos||!v.inicio_actividades)
          errors.push('datos para el comprobante');
        if(v.declara_responsabilidad!==true)errors.push('declaración del responsable');
      }
      if(errors.length){
        message.textContent='Para enviar la solicitud completá: '+errors.join(', ')+'.';
        message.style.color='#991b1b';return;
      }
      button.disabled=true;
      try{
        const id=await member();
        const payload={...v,id_negocio:id,estado:submit?'SOLICITADA':'BORRADOR'};
        const {data,error}=await db.from('vicora_arca_solicitudes_comercio')
          .upsert(payload,{onConflict:'id_negocio'})
          .select('estado,solicitada_en,actualizada_en').single();
        if(error||!data||generation!==installation)throw new Error('REQUEST_NOT_SAVED');
        renderStatus(data);
      }catch(_){
        message.textContent='No se pudo guardar la solicitud. Revisá tu sesión o suscripción; si persiste, contactá a soporte VICORA.';
        message.style.color='#991b1b';
      }finally{button.disabled=false;}
    }
    const save=action('Guardar borrador');
    save.onclick=()=>persist(false,save);
    const submit=action('Enviar solicitud de habilitación','primary');
    submit.onclick=()=>persist(true,submit);
    const copy=action('Copiar requisitos para el cliente');
    copy.onclick=async()=>{
      const text=['VICORA · Requisitos para facturación electrónica',...checklist,
        'Datos que debe informar: CUIT, condición IVA, punto WSFE, representación, nombre o razón social, domicilio fiscal, Ingresos Brutos/exención, inicio de actividades.',
        'Nunca enviar clave fiscal, contraseña ni certificados privados por WhatsApp.'].join('\n- ');
      try{
        if(!root.navigator?.clipboard?.writeText)throw new Error('NO_CLIPBOARD');
        await root.navigator.clipboard.writeText(text);
        message.textContent='Lista de requisitos copiada. No se copiaron los datos ingresados.';
      }catch(_){message.textContent='No se pudo copiar automáticamente. Podés copiar el listado del apartado 3.';}
    };
    view.close.style.cssText='min-height:42px;padding:10px 13px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;cursor:pointer';
    actions.append(view.close);view.d.append(message,actions);view.d.showModal();
  }
  if(config?.showSetup===true && button && role==='ADMINISTRADOR'){
    button.hidden=false;
    button.onclick=()=>{
      if(generation!==installation)return;
      offlineSetup();
    };
  }
  if(config?.enabled!==true)return;
  let api;try{api=client({db,apiOrigin:config.apiOrigin});}catch(_){return;}
  async function refresh(){
    root.VICORA_ARCA_UI_HABILITADA=false;
    const capability=await api.capabilities();
    if(generation!==installation)throw new Error('La sesión cambió. Volvé a consultar desde la venta.');
    root.VICORA_ARCA_UI_HABILITADA=capability.preparation_enabled===true;
    return capability;
  }
  root.vicoraArcaRefrescarDisponibilidad=refresh;
  async function showStatus(body,value){
    const view=dialog('Estado del comprobante');
    const labels={NO_DISPONIBLE:'No hay una preparación disponible.',PREPARADO_NO_EMITIDO:'Preparada: no emitida, sin CAE.',EMISION_BLOQUEADA:'Preparada; autorización fiscal deshabilitada.',RESULTADO_INCIERTO:'Resultado incierto. No reenviar; requiere conciliación.',BLOQUEADO:'Operación bloqueada. Requiere revisión.',CONFLICTO_BLOQUEADO:'Respuestas contradictorias. Operación bloqueada sin reenvío.',RECHAZADO:'Solicitud rechazada. No se reenvía automáticamente.',DEMO_CONCILIADO_NO_FISCAL:'Ensayo conciliado. NO FISCAL: no tiene CAE auténtico ni documento fiscal.',AUTORIZADO_HOMO_VERIFICADO:'Autorización de homologación verificada; no es emisión de producción.',PENDIENTE_CONCILIACION:'Solicitud fiscal registrada; falta verificar el resultado con ARCA. No reenviar.',CONSULTA_REGISTRADA:'Consulta registrada; se está verificando el comprobante.',AUTORIZADO_PROD_VERIFICADO:'Factura ARCA verificada en producción; CAE validado mediante consulta independiente.'};
    view.d.append(node('p',labels[value.status]||'Preparada, sin emisión.'),node('p','La venta ya fue registrada una sola vez. El ticket VICORA es NO FISCAL.'));
    if(['AUTORIZADO_HOMO_VERIFICADO','AUTORIZADO_PROD_VERIFICADO'].includes(value.status)&&value.authorization_verified===true&&value.document_available===true){
      if(value.status==='AUTORIZADO_PROD_VERIFICADO'&&value.receipt){
        const r=value.receipt;
        view.d.append(node('p','Factura '+({1:'A',6:'B',11:'C'}[r.kind])+' '+String(r.point).padStart(5,'0')+'-'+String(r.number).padStart(8,'0')),node('p','CAE: '+r.cae),node('p','Vencimiento CAE: '+r.expiry.slice(6)+'/'+r.expiry.slice(4,6)+'/'+r.expiry.slice(0,4)));
      }
      for(const format of ['A4','80mm']){
        const download=node('button',format==='A4'?'Descargar PDF A4':'Descargar / reimprimir 80 mm');download.type='button';
        download.onclick=async()=>{download.disabled=true;try{const blob=await api.document(body,format),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='vicora-'+(value.environment==='PRODUCCION'?'factura-arca':'homologacion')+'-'+format+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_){view.d.append(node('p','No se pudo verificar el documento. No vuelvas a registrar la venta.'));}finally{download.disabled=false;}};
        view.d.append(download);
      }
    }else view.d.append(node('p','No hay CAE verificado: no se habilitan PDF, QR ni impresión fiscal.'));
    if(['RESULTADO_INCIERTO','PENDIENTE_CONCILIACION','CONSULTA_REGISTRADA'].includes(value.status)){
      const reconcile=node('button','Consultar y conciliar (sin reenviar)');reconcile.type='button';reconcile.onclick=async()=>{reconcile.disabled=true;try{const result=await api.reconcile(body);view.d.close();await showStatus(body,result);}catch(_){view.d.append(node('p','Conciliación no disponible. La solicitud permanece bloqueada.'));}finally{reconcile.disabled=false;}};view.d.append(reconcile);
    }
    view.d.append(view.close);view.d.showModal();return value;
  }
  const choosing=new Map();
  root.vicoraArcaIniciarEmision=async body=>{
    if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
    const {data,error}=await db.auth.getSession(),token=data?.session?.access_token;
    if(error||!token||generation!==installation)throw new Error('Iniciá sesión nuevamente.');
    async function sameSession(){const current=await db.auth.getSession();if(generation!==installation||current.error||current.data?.session?.access_token!==token)throw new Error('La sesión cambió. Consultá el estado antes de continuar.');}
    const choiceKey=token+'|'+body.saleRef;
    if(choosing.has(choiceKey))return choosing.get(choiceKey);
    const pending=(async()=>{
      const capability=await refresh();
      // Existing uncertain/rejected/authorized work is consulted, never prepared
      // or sent again just because the seller returns from sales history.
      let value=await api.status(body);await sameSession();
      if(value.status==='NO_DISPONIBLE'){
        if(capability.preparation_enabled!==true)throw new Error('El comercio no tiene preparación fiscal habilitada. El ticket común sigue disponible.');
        value=await api.prepare(body);
      }
      await sameSession();
      if(['PREPARADO_NO_EMITIDO','EMISION_BLOQUEADA'].includes(value.status)&&capability.completion_enabled===true)value=await api.requestAuthorization(body);
      await sameSession();return showStatus(body,value);
    })().finally(()=>choosing.delete(choiceKey));
    choosing.set(choiceKey,pending);return pending;
  };
  root.vicoraArcaConsultarEstado=async body=>{
    const before=await db.auth.getSession(),token=before.data?.session?.access_token;
    if(before.error||!token||generation!==installation)throw new Error('Iniciá sesión nuevamente.');
    const value=await api.status(body),after=await db.auth.getSession();
    if(after.error||after.data?.session?.access_token!==token||generation!==installation)throw new Error('La sesión cambió. Consultá el estado nuevamente.');
    return showStatus(body,value);
  };
  let capability;try{capability=await refresh();}catch(_){return;}
  if(button&&role==='ADMINISTRADOR'&&capability.configuration_enabled===true){
    button.hidden=false;button.onclick=async()=>{
      const view=dialog('Configuración · Facturación electrónica');
      view.d.append(node('p','Opcional por comercio. Usá la identidad fiscal propia del comercio. Guardar no habilita emisión ni valida representación.'));
      try{
        const registration=await api.enrollmentStatus();
        const labels={SIN_CONFIGURAR:'Sin configurar',PENDIENTE_VERIFICACION:'Pendiente de verificar ante ARCA',HABILITADO:'Emisor verificado',REQUIERE_REVALIDACION:'Necesita revalidación'};
        view.d.append(node('p','Estado fiscal del comercio: '+(labels[registration.state]||'No disponible')));
      }catch(_){view.d.append(node('p','No se pudo consultar la verificación fiscal. Esto no habilita emisión.'));}
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
        const verifyButton=node('button','Verificar permisos fiscales ARCA');
        verifyButton.type='button';
        verifyButton.disabled=profile.version<1||profile.enabled!==true;
        form.append(verifyButton);
        verifyButton.onclick=async()=>{
          if(verifyButton.disabled)return;
          verifyButton.disabled=true;save.disabled=true;
          try{
            const verified=await api.verifyEnrollment(profile.version,async()=>{
              const {data,error}=await db.auth.getUser();
              if(error||!data?.user?.email)throw new Error('No se pudo verificar tu cuenta.');
              const isolated=createAuthClient();
              let response;
              try{response=await isolated.auth.signInWithPassword({email:data.user.email,password:password.value});}
              finally{password.value='';}
              if(response.error||response.data?.user?.id!==data.user.id||!response.data?.session?.access_token)throw new Error('Reautenticación rechazada.');
              return response.data.session.access_token;
            });
            const current=await api.profile();
            profile.version=current.profile.version;
            profile.state=current.profile.state;
            message.textContent=verified.state==='HABILITADO'
              ? 'ARCA verificó el perfil de este comercio. La emisión estará disponible cuando el servidor fiscal esté habilitado.'
              : 'La verificación de ARCA no pudo completarse.';
          }catch(_){
            message.textContent='No se pudo verificar ARCA. Revisá la autorización del comercio y la conexión fiscal. No se emitió ninguna factura.';
            try{const current=await api.profile();profile.version=current.profile.version;profile.state=current.profile.state;}catch(_){}
          }finally{password.value='';save.disabled=false;verifyButton.disabled=profile.enabled!==true;}
        };
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
            profile.version=result.profile.version;profile.enabled=result.profile.enabled;verifyButton.disabled=profile.enabled!==true;try{await refresh();}catch(_){root.VICORA_ARCA_UI_HABILITADA=false;}message.textContent='Solicitud guardada. Verificá los permisos ante ARCA para continuar; todavía no se emitió ninguna factura.';
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
