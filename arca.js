/* Optional per-sale fiscal client. No sale RPC or fiscal credentials in the browser. */
(function(root){
'use strict';
let installation=0;
function client({db,apiOrigin,fetchImpl=root.fetch,timeoutMs=60000,businessContext=null,recoveryDelayMs=3000,recoveryAttempts=5,sleep=ms=>new Promise(r=>setTimeout(r,ms)),onDiagnostic=()=>{}}){
  const u=new URL(apiOrigin);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Configuración fiscal no disponible.');
  const origin=u.origin,inflight=new Map(),workflows=new Map();
  const budget=path=>['capabilities','settings','config'].includes(path)?Math.min(timeoutMs,15000):timeoutMs;
  const pendingStates=['RESULTADO_INCIERTO','PENDIENTE_CONCILIACION','CONSULTA_REGISTRADA'];
  function diagnostic(stage,start,category){try{onDiagnostic({stage,duration_ms:Math.max(0,Date.now()-start),category});}catch(_){} }
  async function recover(body,expectedToken,credit,value){
    for(let n=0;n<Math.min(5,Math.max(0,recoveryAttempts))&&pendingStates.includes(value.status);n++){
      await sleep(Math.max(0,recoveryDelayMs));await boundSession(expectedToken);
      try{value=await (credit?api.creditStatus(body,expectedToken):api.status(body,expectedToken));
        if(pendingStates.includes(value.status))value=await (credit?api.creditReconcile(body,expectedToken):api.reconcile(body,expectedToken));
      }catch(error){await boundSession(expectedToken);/* retain uncertainty, never retry issuance */}
    }return value;
  }
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
    if(value.receipt!==undefined&&value.receipt!==null){
      const r=value.receipt;
      if(!verified||typeof r!=='object'||!Number.isInteger(r.number)||r.number<1||r.number>99999999||!Number.isInteger(r.point)||r.point<1||r.point>99998||![1,3,6,8,11,13].includes(r.kind)||typeof r.cae!=='string'||!/^\d{14}$/.test(r.cae)||typeof r.expiry!=='string'||!/^\d{8}$/.test(r.expiry)||r.cae==='00000000000000'||Object.keys(r).sort().join(',')!=='cae,date,expiry,kind,number,point'||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw new Error('Datos del comprobante no verificables.');
    }
    return value;
  }
  function checkedCredit(value){checkedStatus(value);if(value.status==='AUTORIZADO_PROD_VERIFICADO'&&![3,8,13].includes(value.receipt?.kind))throw new Error('La respuesta no pertenece a una Nota C.');if(['AUTORIZADO_HOMO_VERIFICADO','DEMO_CONCILIADO_NO_FISCAL'].includes(value.status))throw new Error('Una Nota C requiere evidencia auténtica de producción.');return value;}
  async function complete(body,expectedToken,credit){
    const token=(await boundSession(expectedToken)).access_token,key=(credit?'credit-flow|':'invoice-flow|')+token+'|'+body?.saleRef;
    if(workflows.has(key))return workflows.get(key);
    const work=(async()=>{let value;try{value=await (credit?api.creditRequest(body,token):api.requestAuthorization(body,token));}
      catch(error){try{value=await (credit?api.creditStatus(body,token):api.status(body,token));}catch(_){throw error;}
        if(!pendingStates.includes(value.status)&&!['AUTORIZADO_PROD_VERIFICADO','AUTORIZADO_HOMO_VERIFICADO'].includes(value.status))throw error;}
      const result=await recover(body,token,credit,value);await boundSession(token);return result;
    })().finally(()=>workflows.delete(key));workflows.set(key,work);return work;
  }
  async function session(){const {data,error}=await db.auth.getSession();if(error||!data?.session?.access_token)throw new Error('Iniciá sesión nuevamente.');return data.session;}
  async function boundSession(expected){const current=await session();if(expected&&current.access_token!==expected)throw new Error('La sesión cambió. Volvé a consultar la venta.');return current;}
  async function request(path,method,body,token,reauth){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),budget(path)),started=Date.now();
    try{
      const response=await fetchImpl(origin+'/v1/fiscal/'+path,{method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,
        headers:{Authorization:'Bearer '+token,...(businessContext?{'X-Vicora-Context':businessContext}:{}),...(body?{'Content-Type':'application/json'}:{}),...(reauth?{'X-Vicora-Reauth':reauth}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const value=await response.json();
      if(!response.ok)throw new Error('La operación fiscal está bloqueada. Revisá permisos y configuración; la venta no se vuelve a registrar.');
      if(value.can_send!==false||value.runtime_enabled!==false)throw new Error('Respuesta fiscal no válida.');
      diagnostic(path,started,'OK');return value;
    }catch(error){
      diagnostic(path,started,error.name==='AbortError'?'TIMEOUT':'UNAVAILABLE');
      if(error?.name==='AbortError')throw new Error('El resultado todavía está siendo verificado. Tu venta ya está registrada; no se reenvió la solicitud.');
      if(error instanceof TypeError)throw new Error('Conexión fiscal no disponible. La venta ya registrada no cambia.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  const api={
    async prepare(body,expectedToken){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const s=await boundSession(expectedToken),key=s.access_token+'|'+body.saleRef;
      if(inflight.has(key))return inflight.get(key);
      const promise=request('prepare','POST',{saleRef:body.saleRef},s.access_token).then(value=>{
        if(value.status!=='PREPARADO_NO_EMITIDO'||![1,6,11].includes(value.document_type)||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(value.operation)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value.operation))throw new Error('Respuesta de preparación no válida.');
        return value;
      }).finally(()=>inflight.delete(key));
      inflight.set(key,promise);return promise;
    },
    async capabilities(expectedToken){
      const value=await request('capabilities','GET',null,(await boundSession(expectedToken)).access_token);
      if(typeof value.preparation_enabled!=='boolean'||typeof value.configuration_enabled!=='boolean'||!Array.isArray(value.document_types)||value.document_types.some(k=>![1,3,6,8,11,13].includes(k)))throw new Error('Habilitación fiscal no verificable.');
      return value;
    },
    async status(body,expectedToken){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const value=await request('status','POST',{saleRef:body.saleRef},(await boundSession(expectedToken)).access_token);
      return checkedStatus(value);
    },
    async requestAuthorization(body,expectedToken){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const capability=await this.capabilities(expectedToken);
      if(capability.completion_enabled!==true||!['LAB_TLS','HOMOLOGACION','PRODUCCION'].includes(capability.completion_mode))throw new Error('La autorización fiscal sigue deshabilitada. La venta no cambia.');
      const token=(await boundSession(expectedToken)).access_token,key='completion|'+token+'|'+body.saleRef;
      if(inflight.has(key))return inflight.get(key);
      const promise=request('request','POST',body,token).then(checkedStatus).finally(()=>inflight.delete(key));inflight.set(key,promise);return promise;
    },
    async reconcile(body,expectedToken){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Referencia de venta inválida.');
      const capability=await this.capabilities(expectedToken);if(capability.completion_enabled!==true&&capability.reconciliation_enabled!==true)throw new Error('Conciliación fiscal deshabilitada.');
      return checkedStatus(await request('reconcile','POST',body,(await boundSession(expectedToken)).access_token));
    },
    async document(body,format,expectedToken){
      if(!['A4','80mm'].includes(format))throw new Error('Formato no disponible.');
      const value=await this.status(body,expectedToken);
      if(!['AUTORIZADO_HOMO_VERIFICADO','AUTORIZADO_PROD_VERIFICADO'].includes(value.status)||value.authorization_verified!==true||value.document_available!==true)throw new Error('No hay CAE verificado para descargar.');
      const token=(await boundSession(expectedToken)).access_token,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await fetchImpl(origin+'/v1/fiscal/document',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(businessContext?{'X-Vicora-Context':businessContext}:{}),'Content-Type':'application/json'},body:JSON.stringify({saleRef:body.saleRef,format})});
        if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new Error('Documento fiscal no disponible.');
        const blob=await response.blob();if(blob.size>8*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error('Documento fiscal no verificable.');return blob;
      }catch(_){throw new Error('Documento fiscal no disponible. La venta no cambia.');}finally{clearTimeout(timer);}
    },
    async creditPrepare(body,expectedToken){
      if(!body||Object.keys(body).sort().join(',')!=='reason,saleRef'||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>512)throw new Error('Venta y motivo legítimo requeridos.');
      const capability=await this.capabilities(expectedToken);if(capability.credit_c_enabled!==true)throw new Error('Notas de crédito deshabilitadas.');
      const value=await request('credit/prepare','POST',body,(await boundSession(expectedToken)).access_token);
      if(![3,8,13].includes(value.document_type)||value.status!=='PREPARADO_NO_EMITIDO'||typeof value.operation!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(value.operation))throw new Error('Preparación de Nota C no verificable.');return value;
    },
    async creditStatus(body,expectedToken){if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Venta requerida.');return checkedCredit(await request('credit/status','POST',body,(await boundSession(expectedToken)).access_token));},
    async creditRequest(body,expectedToken){
      if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Venta requerida.');
      const capability=await this.capabilities(expectedToken);if(capability.credit_c_enabled!==true||capability.completion_enabled!==true||capability.completion_mode!=='PRODUCCION')throw new Error('Autorización de nota de crédito deshabilitada.');
      const token=(await boundSession(expectedToken)).access_token,key='credit|'+token+'|'+body.saleRef;if(inflight.has(key))return inflight.get(key);
      const work=request('credit/request','POST',body,token).then(checkedCredit).finally(()=>inflight.delete(key));inflight.set(key,work);return work;
    },
    async creditReconcile(body,expectedToken){if(!body||Object.keys(body).length!==1||typeof body.saleRef!=='string'||!body.saleRef||body.saleRef.length>128)throw new Error('Venta requerida.');return checkedCredit(await request('credit/reconcile','POST',body,(await boundSession(expectedToken)).access_token));},
    async creditAuthorizeAndConfirm(body,expectedToken){return complete(body,expectedToken,true);},
    async creditDocument(body,format,expectedToken){
      if(!['A4','80mm'].includes(format))throw new Error('Formato no disponible.');const status=await this.creditStatus(body,expectedToken);
      if(status.status!=='AUTORIZADO_PROD_VERIFICADO'||![3,8,13].includes(status.receipt?.kind)||status.authorization_verified!==true||status.document_available!==true)throw new Error('Nota de crédito sin CAE verificado.');
      const token=(await boundSession(expectedToken)).access_token,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{const response=await fetchImpl(origin+'/v1/fiscal/credit/document',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(businessContext?{'X-Vicora-Context':businessContext}:{}),'Content-Type':'application/json'},body:JSON.stringify({...body,format})});if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new Error();const blob=await response.blob();if(blob.size>8*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error();return blob;}catch(_){throw new Error('Documento de Nota C no disponible; no se reenvió.');}finally{clearTimeout(timer);}
    },
    async taxSettings(expectedToken){return request('settings','GET',null,(await boundSession(expectedToken)).access_token);},
    async saveTaxSettings(version,data,expectedToken){
      if(!Number.isSafeInteger(version)||version<0||!data||typeof data!=='object')throw new Error('Datos fiscales inválidos.');
      return request('settings','PUT',{version,data},(await boundSession(expectedToken)).access_token);
    },
    async authorizeAndConfirm(body,expectedToken){return complete(body,expectedToken,false);},
    async profile(expectedToken){return request('config','GET',null,(await boundSession(expectedToken)).access_token);},
    async saveProfile(profile,reauthenticate,expectedToken){
      const s=await boundSession(expectedToken),fresh=await reauthenticate();
      if(!fresh||fresh===s.access_token)throw new Error('Es necesaria una reautenticación reciente.');
      return request('config','PUT',profile,s.access_token,fresh);
    },
    async enrollmentStatus(expectedToken){
      const value=await request('enrollment','GET',null,(await boundSession(expectedToken)).access_token);
      if(value.environment!=='PRODUCCION'||!['SIN_CONFIGURAR','PENDIENTE_VERIFICACION','HABILITADO','REQUIERE_REVALIDACION'].includes(value.state))throw new Error('Verificación fiscal no disponible.');
      return value;
    },
    async verifyEnrollment(version,reauthenticate,expectedToken){
      if(!Number.isSafeInteger(version)||version<1||typeof reauthenticate!=='function')throw new Error('Configuración fiscal incompleta.');
      const s=await boundSession(expectedToken),fresh=await reauthenticate();
      if(!fresh||fresh===s.access_token)throw new Error('Es necesaria una reautenticación reciente.');
      const value=await request('enrollment','POST',{version},s.access_token,fresh);
      if(value.environment!=='PRODUCCION'||value.state!=='HABILITADO')throw new Error('ARCA no verificó la habilitación fiscal.');
      return value;
    }
  };return api;
}
async function taxSetup(api,db,business){
  const v=dialog('Datos fiscales para facturación opcional'),msg=node('p');msg.setAttribute('role','status');
  v.d.append(node('p','Completá datos auténticos. No se supone IVA 21%. Estos datos no habilitan por sí solos a emitir ante ARCA.'),msg);
  try{
    const result=await api.taxSettings();let version=result.version,data=result.data;
    const [customers,products,merchant]=await Promise.all([db.from('clientes').select('id_cliente,nombre,apellido,documento').eq('id_negocio',business).order('id_cliente').limit(1000),db.from('productos').select('id_producto,nombre').eq('id_negocio',business).order('id_producto').limit(1000),db.from('negocios').select('nombre').eq('id_negocio',business).maybeSingle()]);
    if(customers.error||products.error)throw new Error();
    function select(label,options){const wrap=node('label',label),s=node('select');s.style.cssText='display:block;width:100%;margin:8px 0 16px;min-height:42px';for(const [key,label] of options){const o=node('option',label);o.value=key;s.append(o);}wrap.append(s);v.d.append(wrap);return s;}
    const customer=select('Cliente existente',[['','Elegí un cliente'],...(customers.data||[]).map(c=>[c.id_cliente,[c.nombre,c.apellido,c.documento].filter(Boolean).join(' · ')])]);
    const documentType=select('Documento fiscal',[['','Elegí el tipo'],['80','CUIT'],['96','DNI']]);
    const condition=select('Condición frente al IVA del receptor',[['','Elegí la condición'],['1','Responsable inscripto'],['4','Exento'],['5','Consumidor final'],['6','Monotributo'],['7','No categorizado'],['13','Monotributista social'],['16','Trabajador independiente promovido']]);
    customer.onchange=()=>{const old=data.receivers[customer.value];documentType.value=old?String(old.document_type):'';condition.value=old?String(old.tax_condition):'';};
    const saveCustomer=node('button','Guardar condición del cliente');saveCustomer.type='button';v.d.append(saveCustomer);
    const product=select('Producto existente',[['','Elegí un producto'],...(products.data||[]).map(p=>[p.id_producto,p.nombre+' · '+p.id_producto])]);
    const vat=select('Tratamiento IVA del producto',[['','Elegí según su situación fiscal'],['3','0%'],['9','2,5%'],['8','5%'],['4','10,5%'],['5','21%'],['6','27%'],['EXENTO','Exento'],['NO_GRAVADO','No gravado']]);
    product.onchange=()=>{vat.value=data.products[product.value]===undefined?'':String(data.products[product.value]);};
    const saveProduct=node('button','Guardar IVA del producto');saveProduct.type='button';v.d.append(saveProduct);
    async function save(change){saveCustomer.disabled=saveProduct.disabled=true;try{const next=structuredClone(data);change(next);const saved=await api.saveTaxSettings(version,next);version=saved.version;data=saved.data;msg.textContent='Datos fiscales guardados para este comercio. No se emitió ningún comprobante.';}catch(_){msg.textContent='No se pudo confirmar el cambio. Cerrá y consultá nuevamente antes de reintentar.';}finally{saveCustomer.disabled=saveProduct.disabled=false;}}
    saveCustomer.onclick=()=>{const row=(customers.data||[]).find(c=>c.id_cliente===customer.value);if(!row?.documento||!documentType.value||!condition.value){msg.textContent='Elegí el cliente y completá su documento real desde Clientes.';return;}return save(next=>{next.receivers[row.id_cliente]={source_document:row.documento,document_type:Number(documentType.value),tax_condition:Number(condition.value)};});};
    saveProduct.onclick=()=>{if(!product.value||!vat.value){msg.textContent='Elegí el producto y su tratamiento IVA.';return;}return save(next=>{next.products[product.value]=['EXENTO','NO_GRAVADO'].includes(vat.value)?vat.value:Number(vat.value);});};
    const tradeLabel=node('label','Nombre comercial del local (para nuevos comprobantes)'),trade=node('input');trade.maxLength=160;trade.value=data.branding?.commercial_name||(!merchant.error?merchant.data?.nombre:'')||'';tradeLabel.append(trade);const saveTrade=node('button','Guardar nombre comercial');saveTrade.onclick=()=>{const name=trade.value.trim();if(!name||name.length>160){msg.textContent='Ingresá el nombre comercial del local.';return;}return save(next=>{next.branding={...(next.branding||{}),commercial_name:name};});};v.d.append(tradeLabel,saveTrade);
    const logoLabel=node('label','Logo opcional (PNG/JPEG, máximo 32 KiB)'),logo=node('input');logo.type='file';logo.accept='image/png,image/jpeg';logoLabel.append(logo);v.d.append(logoLabel);
    const saveLogo=node('button','Guardar logo'),removeLogo=node('button','Quitar logo');saveLogo.type=removeLogo.type='button';v.d.append(saveLogo,removeLogo);
    saveLogo.onclick=async()=>{const f=logo.files?.[0];if(!f||f.size>32768||!['image/png','image/jpeg'].includes(f.type)){msg.textContent='Elegí un logo PNG o JPEG de hasta 32 KiB.';return;}saveLogo.disabled=true;try{const bytes=new Uint8Array(await f.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);await save(next=>{next.branding={...(next.branding||{}),logo_base64:btoa(text)};});logo.value='';}finally{saveLogo.disabled=false;}};
    removeLogo.onclick=()=>save(next=>{if(next.branding){delete next.branding.logo_base64;if(!Object.keys(next.branding).length)delete next.branding;}});
    if((customers.data||[]).length===1000||(products.data||[]).length===1000)v.d.append(node('p','Se muestran los primeros 1000 registros; no se presupone la configuración de otros productos o clientes.'));
  }catch(_){msg.textContent='Configuración fiscal no disponible. El ticket VICORA sigue funcionando.';}
  v.d.append(v.close);v.d.showModal();
}
function node(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;if(tag==='button'){e.type='button';e.dataset.action=/Nota|crédito/i.test(text||'')?'credit':/Descargar/i.test(text||'')?'download':/Imprimir/i.test(text||'')?'print':/Cerrar|Cancelar|Más tarde/.test(text||'')?'close':'fiscal';if(document.createElementNS){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');path.setAttribute('d',({print:'M6 9V3h12v6M6 18H4V9h16v9h-2M6 14h12v7H6Z',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',close:'M6 6l12 12M6 18L18 6',credit:'M5 7h14v14H5ZM8 3h8v4M8 12h8M8 16h6',fiscal:'M6 3h9l3 3v15H6ZM14 3v5h4M9 12h6M9 16h6'})[e.dataset.action]);svg.append(path);e.insertBefore(svg,e.firstChild);}}return e;}
function fiscalStyle(){
 if(document.getElementById('vicoraFiscalStyle'))return;
 const style=node('style');style.id='vicoraFiscalStyle';style.textContent=`
 .vf-dialog{font-family:inherit;color:#19334f!important;background:#fff!important;border:1px solid #dbe5ef!important;border-radius:22px!important;padding:clamp(18px,3vw,30px)!important;box-shadow:0 24px 80px #102a4350;max-width:calc(100vw - 24px)!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;overflow-wrap:anywhere}
 .vf-dialog::backdrop{background:#0c203a99;backdrop-filter:blur(3px)}.vf-dialog h2{font-size:clamp(21px,4vw,27px);line-height:1.25;margin:0 0 18px}.vf-dialog h3{font-size:17px;margin:20px 0 10px}.vf-dialog p{line-height:1.6}.vf-dialog label{font-weight:600;font-size:14px}.vf-dialog input:not([type=checkbox]):not([type=hidden]),.vf-dialog select,.vf-dialog textarea{box-sizing:border-box;width:100%;min-height:46px;padding:11px 13px;border:1px solid #b9cada;border-radius:11px;background:#f9fbfd;color:#19334f;font:inherit;margin:8px 0 15px}.vf-dialog textarea{min-height:100px;resize:vertical}.vf-dialog button{min-height:46px;max-width:100%;padding:12px 17px;margin:6px 8px 6px 0;border:1px solid transparent;border-radius:12px;background:#1958ad;color:#fff;font:inherit;font-weight:700;cursor:pointer;white-space:normal}.vf-dialog button{display:inline-flex;align-items:center;justify-content:center;gap:8px}.vf-dialog button svg{flex:none;width:18px;height:18px}.vf-dialog button:disabled{opacity:.55;cursor:wait}.vf-dialog button[data-action=close]{background:#e9eef3;color:#334155}.vf-dialog button[data-action=credit]{background:#9a4c05;color:#fff}.vf-dialog button[data-action=download]{background:#e8eef5;color:#24415d}.vf-dialog button[data-action=print]{background:#036eaa}.vf-dialog [data-state=success]{padding:14px;border-radius:12px;background:#e8f7ef;color:#166534}.vf-dialog [data-state=pending]{padding:14px;border-radius:12px;background:#fff4d8;color:#784800}.vf-dialog [data-state=error]{padding:14px;border-radius:12px;background:#fff0f0;color:#991b1b}.vf-spinner{width:28px;height:28px;border:3px solid #dce8f5;border-top-color:#1958ad;border-radius:50%;animation:vfspin 1s linear infinite}@keyframes vfspin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.vf-spinner{animation:none}}@media(max-width:550px){.vf-dialog button{width:100%;margin:6px 0}.vf-dialog{width:calc(100vw - 24px)!important}}
 `;document.head.append(style);
}
function dialog(title){
 fiscalStyle();const d=node('dialog');d.className='vf-dialog';d.style.cssText='box-sizing:border-box;width:min(680px,calc(100vw - 24px));max-height:90vh;overflow:auto';
 d.append(node('h2',title));const close=node('button','Cerrar');close.type='button';close.dataset.action='close';close.onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);return {d,close};
}
async function fiscalConfirm(title,text){return new Promise(resolve=>{const v=dialog(title),yes=node('button','Confirmar autorización'),no=node('button','Cancelar');yes.dataset.action='credit';no.dataset.action='close';v.d.append(node('p',text),yes,no);let result=false;yes.onclick=()=>{result=true;v.d.close();};no.onclick=()=>v.d.close();v.d.addEventListener('close',()=>resolve(result),{once:true});v.d.showModal();});}
async function processing(title,work){const v=dialog(title),spin=node('div'),message=node('p','Estamos verificando tu comprobante con ARCA. No vuelvas a emitirlo.');spin.className='vf-spinner';message.setAttribute('role','status');v.d.append(spin,message);v.d.addEventListener('cancel',e=>e.preventDefault());v.d.showModal();try{return await work();}finally{v.d.close();}}
function deliverPdf(blob,{print=false,format='A4',name='comprobante.pdf',popup=null}={}){
 const url=URL.createObjectURL(blob);let released=false;const release=()=>{if(!released){released=true;URL.revokeObjectURL(url);}};
 if(!print){const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(release,60000);return;}
 const w=popup;if(!w){const v=dialog('Impresión no disponible');const a=node('a','Descargar PDF '+format);a.href=url;a.download=name;v.d.append(node('p','El navegador bloqueó la vista. Descargá el PDF o permití las ventanas emergentes.'),a,v.close);v.d.addEventListener('close',release,{once:true});v.d.showModal();return;}
 const doc=w.document;doc.title='Comprobante fiscal · '+format;doc.body.textContent='';const hint=doc.createElement('p');hint.textContent='Si no aparece el diálogo, utilizá Imprimir. En algunos celulares corresponde descargar el PDF.';
 const btn=doc.createElement('button');btn.textContent='Imprimir';const link=doc.createElement('a');link.href=url;link.download=name;link.textContent='Descargar PDF';const frame=doc.createElement('iframe');frame.title='Comprobante fiscal '+format;frame.style.cssText='width:100%;height:85vh;border:0';frame.src=url;
 btn.onclick=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(_){hint.textContent='Utilizá la opción Descargar PDF para imprimir desde tu dispositivo.';}};frame.onload=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(_){}};doc.body.append(hint,btn,link,frame);
 const monitor=setInterval(()=>{if(w.closed){clearInterval(monitor);release();}},1000);
}
// Guided values remain text-compatible with the existing commercial contract.
// Unknown historical text is preserved; it is never classified automatically.
function grossIncomeEditor(container,field){
  const mode=field(container,'grossIncomeCondition','Ingresos Brutos',null,[['INSCRIPTO','Inscripto'],['EXENTO','Exento'],['ASESORAMIENTO','Necesito asesoramiento']]);
  const number=field(container,'grossIncomeNumber','Número de inscripción','text',null,'Inscripción del comercio');number.maxLength=120;
  const reason=field(container,'grossIncomeExemption','Condición o motivo de exención (opcional)','text',null,'Según constancia o asesoramiento');reason.maxLength=120;
  const stored=field(container,'grossIncome','Valor existente de Ingresos Brutos','hidden');stored.type='hidden';(stored.parentElement||stored).hidden=true;(stored.parentElement||stored).style.display='none';
  const note=node('p');note.style.cssText='font-size:13px;line-height:1.5';container.append(note);let original='',dirty=false;
  function update(){const n=number.parentElement||number,r=reason.parentElement||reason;n.hidden=mode.value!=='INSCRIPTO';r.hidden=mode.value!=='EXENTO';n.style.display=n.hidden?'none':'block';r.style.display=r.hidden?'none':'block';note.textContent=mode.value==='ASESORAMIENTO'?'Configuración pendiente de asesoramiento. Podés guardar un borrador; no enviar la solicitud fiscal.':(!mode.value&&original?'El valor existente se conserva sin reinterpretarlo. Elegí una opción sólo si corresponde modificarlo.':'No determina automáticamente tu condición tributaria.');}
  mode.onchange=()=>{dirty=true;update();};number.oninput=reason.oninput=()=>{dirty=true;};
  function load(value){original=String(value||'');dirty=false;stored.value=original;mode.value='';number.value='';reason.value='';let m;
    if((m=/^Inscripto: (.+)$/i.exec(original))){mode.value='INSCRIPTO';number.value=m[1];}
    else if((m=/^Exento(?:[: ]+(.+))?$/i.exec(original))){mode.value='EXENTO';reason.value=m[1]||'';}
    update();}
  function value(){if(!dirty&&original)return original;if(mode.value==='ASESORAMIENTO')return null;if(mode.value==='INSCRIPTO')return number.value.trim()?'Inscripto: '+number.value.trim():null;if(mode.value==='EXENTO')return reason.value.trim()?'Exento: '+reason.value.trim():'Exento';return stored.value.trim()?stored.value:null;}
  load('');return {load,value,pending:()=>mode.value==='ASESORAMIENTO'};
}
function delegatedRepresentation(container){
  const value=node('input');value.type='hidden';value.name='representation';value.value='DELEGADA';
  container.append(node('p','Emisión mediante representante autorizado'),node('p','Para utilizar la facturación electrónica de VICORA, deberás autorizar al representante correspondiente desde ARCA.'),value);return value;
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
  function offlineSetup(loadExisting=false,alreadyEnabled=false){
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
    const representation=delegatedRepresentation(primary);
    const invoice=section('2. Datos para el comprobante','Se necesitan para completar y revisar la presentación de las facturas; algunos requisitos varían según el contribuyente.');
    const businessName=field(invoice,'businessName','Nombre o razón social','text',null,'Nombre registrado del emisor');
    const taxAddress=field(invoice,'taxAddress','Domicilio fiscal','text',null,'Calle, número, ciudad y provincia');
    const grossIncome=grossIncomeEditor(invoice,field);
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
      if(representation.value!=='DELEGADA')errors.push('La representación histórica requiere revisión; no fue modificada.');
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
        domicilio_fiscal:clean(taxAddress),ingresos_brutos:grossIncome.value(),
        inicio_actividades:clean(activityStart),declara_responsabilidad:consent.checked===true
      };
    }
    function renderStatus(record){
      if(!record){message.textContent='No hay una solicitud guardada para este comercio.';return;}
      message.style.color='#334155';
      message.textContent=alreadyEnabled?'Datos del comercio guardados. El servidor informó facturación habilitada; un cambio fiscal puede requerir una nueva verificación.':record.estado==='SOLICITADA'
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
          representation.value=data.representacion||'DELEGADA';
          businessName.value=data.razon_social||'';
          taxAddress.value=data.domicilio_fiscal||'';
          grossIncome.load(data.ingresos_brutos);
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
        if(v.representacion!=='DELEGADA')errors.push('revisión de representación autorizada');
        if(grossIncome.pending())errors.push('asesoramiento de Ingresos Brutos pendiente');
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
    actions.append(view.close);view.d.append(message,actions);view.d.showModal();if(loadExisting)void load.onclick();
  }
  if(config?.showSetup===true && button && role==='ADMINISTRADOR'){
    button.hidden=false;
    button.onclick=()=>{
      if(generation!==installation)return;
      offlineSetup();
    };
  }
  if(config?.enabled!==true)return;
  // Derive the local UI scope from the authenticated account; never an API grant.
  let business;
  try{
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth?.user?.id||generation!==installation)return;
    const {data:members,error:memberError}=await db.from('usuarios').select('id_negocio,rol,estado').eq('auth_user_id',auth.user.id).limit(2);
    if(memberError||!Array.isArray(members)||members.length!==1||members[0].estado!=='ACTIVO'||!['ADMINISTRADOR','VENDEDOR'].includes(members[0].rol)||generation!==installation)return;
    business=members[0].id_negocio;role=members[0].rol;
    if(role!=='ADMINISTRADOR'&&button){button.hidden=true;button.onclick=null;}
  }catch(_){return;}
  let api;try{api=client({db,apiOrigin:config.apiOrigin,businessContext:business});}catch(_){return;}
  async function refresh(expectedToken){
    root.VICORA_ARCA_UI_HABILITADA=false;
    const capability=await api.capabilities(expectedToken);
    if(generation!==installation)throw new Error('La sesión cambió. Volvé a consultar desde la venta.');
    if(config.pilotBusiness!==undefined&&business!==config.pilotBusiness&&capability.daily_enabled!==true)throw new Error('La conexión fiscal de este comercio todavía no está habilitada.');
    root.VICORA_ARCA_UI_HABILITADA=capability.preparation_enabled===true;
    return capability;
  }
  root.vicoraArcaRefrescarDisponibilidad=refresh;
  async function showStatus(body,value,credit=false,expectedToken=null){
    const viewed=await db.auth.getSession(),viewToken=expectedToken||viewed.data?.session?.access_token;
    async function guardView(){const now=await db.auth.getSession();if(!viewToken||now.error||now.data?.session?.access_token!==viewToken||generation!==installation)throw new Error('La sesión cambió. Cerrá esta ventana.');}
    await guardView();
    const creditLetter=({3:'A',8:'B',13:'C'})[value.receipt?.kind||value.document_type]||'C';const view=dialog(credit?'Nota de Crédito '+creditLetter+' total':'Estado del comprobante');
    if([1,6,11].includes(value.document_type))view.d.append(node('p','Tipo '+({1:'A',6:'B',11:'C'})[value.document_type]+' determinado por el servidor fiscal.'));
    const labels={NO_DISPONIBLE:'No hay una preparación disponible.',PREPARADO_NO_EMITIDO:'Preparada: no emitida, sin CAE.',EMISION_BLOQUEADA:'Preparada; autorización fiscal deshabilitada.',RESULTADO_INCIERTO:'Resultado incierto. No reenviar; requiere conciliación.',BLOQUEADO:'Operación bloqueada. Requiere revisión.',CONFLICTO_BLOQUEADO:'Respuestas contradictorias. Operación bloqueada sin reenvío.',RECHAZADO:'Solicitud rechazada. No se reenvía automáticamente.',DEMO_CONCILIADO_NO_FISCAL:'Ensayo conciliado. NO FISCAL: no tiene CAE auténtico ni documento fiscal.',AUTORIZADO_HOMO_VERIFICADO:'Autorización de homologación verificada; no es emisión de producción.',PENDIENTE_CONCILIACION:'Solicitud fiscal registrada; falta verificar el resultado con ARCA. No reenviar.',CONSULTA_REGISTRADA:'Consulta registrada; se está verificando el comprobante.',AUTORIZADO_PROD_VERIFICADO:'Comprobante ARCA verificado en producción; CAE validado mediante consulta independiente.'};
    const statusMessage=node('p',labels[value.status]||'Preparada, sin emisión.');statusMessage.dataset.state=value.authorization_verified===true?'success':['RESULTADO_INCIERTO','PENDIENTE_CONCILIACION','CONSULTA_REGISTRADA'].includes(value.status)?'pending':['RECHAZADO','BLOQUEADO','CONFLICTO_BLOQUEADO'].includes(value.status)?'error':'pending';view.d.append(statusMessage,node('p','La venta ya fue registrada una sola vez. El ticket VICORA es NO FISCAL.'));
    if(['AUTORIZADO_HOMO_VERIFICADO','AUTORIZADO_PROD_VERIFICADO'].includes(value.status)&&value.authorization_verified===true&&value.document_available===true){
      if(value.receipt){const r=value.receipt;view.d.append(node('p','Comprobante '+String(r.point).padStart(5,'0')+'-'+String(r.number).padStart(8,'0')),node('p','CAE: '+r.cae),node('p','Vencimiento: '+r.expiry.slice(6,8)+'/'+r.expiry.slice(4,6)+'/'+r.expiry.slice(0,4)));}
      const preference=node('select'),preferenceLabel=node('label','Formato fiscal preferido (este comercio en este navegador)');
      for(const [key,text] of [['ASK','Preguntar siempre'],['A4','A4'],['80mm','80 mm']]){const o=node('option',text);o.value=key;preference.append(o);}
      const preferenceKey='vicora.fiscal.print.'+business;let preferred='ASK';try{const saved=root.localStorage.getItem(preferenceKey);if(['A4','80mm'].includes(saved))preferred=saved;}catch(_){}preference.value=preferred;
      preference.onchange=()=>{try{root.localStorage.setItem(preferenceKey,preference.value);}catch(_){}};preferenceLabel.append(preference);view.d.append(preferenceLabel);
      for(const format of (preferred==='80mm'?['80mm','A4']:['A4','80mm']))for(const print of [true,false]){
        const download=node('button',(print?'Imprimir ':'Descargar PDF ')+(credit?'Nota C ':'')+format);download.type='button';
        download.onclick=async()=>{if(download.disabled)return;download.disabled=true;const popup=print?root.open('','_blank'):null;
          try{if(popup)popup.document.body.textContent='Verificando documento fiscal…';await guardView();const blob=await (credit?api.creditDocument(body,format,viewToken):api.document(body,format,viewToken));await guardView();deliverPdf(blob,{print,format,popup,name:'vicora-'+(credit?'nota-credito-c':'factura-arca')+'-'+format+'.pdf'});}
          catch(_){if(popup)popup.close();view.d.append(node('p','No se pudo verificar el documento. Podés consultarlo nuevamente sin emitir.'));}finally{download.disabled=false;}};view.d.append(download);
      }
    }else view.d.append(node('p','No hay CAE verificado: no se habilitan PDF, QR ni impresión fiscal.'));
    if(['RESULTADO_INCIERTO','PENDIENTE_CONCILIACION','CONSULTA_REGISTRADA'].includes(value.status)){
      const reconcile=node('button','Consultar y conciliar (sin reenviar)');reconcile.type='button';reconcile.onclick=async()=>{reconcile.disabled=true;try{const result=await (credit?api.creditReconcile(body,viewToken):api.reconcile(body,viewToken));view.d.close();await showStatus(body,result,credit,viewToken);}catch(_){view.d.append(node('p','Conciliación no disponible. La solicitud permanece bloqueada.'));}finally{reconcile.disabled=false;}};view.d.append(node('p','La autorización todavía está siendo verificada. Tu venta ya está registrada. Podés consultar el comprobante más tarde sin volver a emitirlo.'),reconcile);
    }
    if(credit&&['PREPARADO_NO_EMITIDO','EMISION_BLOQUEADA'].includes(value.status)){
      const send=node('button','Solicitar autorización de esta Nota de Crédito '+creditLetter);send.type='button';send.onclick=async()=>{if(send.disabled)return;send.disabled=true;try{if(!await fiscalConfirm('Autorizar Nota de Crédito '+creditLetter+' total','La nota fiscal no devuelve productos al stock, no registra reintegros y no modifica caja, cobros ni la venta. ¿Confirmás la autorización del total del original?'))return;const result=await processing('Generando Nota de Crédito '+creditLetter,()=>api.creditAuthorizeAndConfirm(body,viewToken));view.d.close();await showStatus(body,result,true,viewToken);}catch(_){view.d.append(node('p','No se pudo confirmar la nota de crédito. Consultá su estado; no reenvíes ni prepares otra.'));}finally{send.disabled=false;}};view.d.append(send);
    }
    if(!credit&&value.status==='AUTORIZADO_PROD_VERIFICADO'&&[1,6,11].includes(value.receipt?.kind)){
      const cap=await refresh(viewToken);if(cap.credit_c_enabled===true&&(cap.credit_document_types||[13]).includes(({1:3,6:8,11:13})[value.receipt.kind])){const note=node('button','Ver / preparar Nota de Crédito '+({1:'A',6:'B',11:'C'})[value.receipt.kind]+' total');note.type='button';note.onclick=async()=>{note.disabled=true;try{const state=await api.creditStatus(body,viewToken);if(state.status!=='NO_DISPONIBLE'){view.d.close();return showStatus(body,state,true,viewToken);}const form=dialog('Preparar Nota de Crédito '+({1:'A',6:'B',11:'C'})[value.receipt.kind]+' total');view.d.close();form.d.append(node('p','Original: '+String(value.receipt.point).padStart(5,'0')+'-'+String(value.receipt.number).padStart(8,'0')+' · '+value.receipt.date),node('p','Sólo por una anulación fiscal legítima. El servidor toma el total y los datos del original verificado. Esto no registra una devolución comercial ni un reintegro.'));
      const reason=node('textarea');reason.maxLength=512;reason.placeholder='Motivo legítimo';reason.setAttribute('aria-label','Motivo legítimo de la Nota C');const prepare=node('button','Preparar nota de crédito (sin emitir)');prepare.type='button';prepare.onclick=async()=>{if(reason.value.trim().length<5)return;prepare.disabled=true;try{const result=await api.creditPrepare({...body,reason:reason.value.trim()},viewToken);form.d.close();view.d.close();await showStatus(body,result,true,viewToken);}catch(_){form.d.append(node('p','Preparación bloqueada. No se emitió ni se reservó numeración.'));}finally{prepare.disabled=false;}};form.d.append(reason,prepare,form.close);form.d.showModal();}catch(_){view.d.append(node('p','No se pudo consultar la Nota C. La factura original permanece conservada.'));}finally{note.disabled=false;}};view.d.append(note);}
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
      const capability=await refresh(token);
      // Existing uncertain/rejected/authorized work is consulted, never prepared
      // or sent again just because the seller returns from sales history.
      let value=await api.status(body,token);await sameSession();
      if(value.status==='NO_DISPONIBLE'){
        if(capability.preparation_enabled!==true)throw new Error('El comercio no tiene preparación fiscal habilitada. El ticket común sigue disponible.');
        value=await api.prepare(body,token);
      }
      await sameSession();
      if(['PREPARADO_NO_EMITIDO','EMISION_BLOQUEADA'].includes(value.status)&&capability.completion_enabled===true)value=await processing('Generando factura electrónica',()=>api.authorizeAndConfirm(body,token));
      await sameSession();return showStatus(body,value,false,token);
    })().finally(()=>choosing.delete(choiceKey));
    choosing.set(choiceKey,pending);return pending;
  };
  root.vicoraArcaConsultarEstado=async body=>{
    const before=await db.auth.getSession(),token=before.data?.session?.access_token;
    if(before.error||!token||generation!==installation)throw new Error('Iniciá sesión nuevamente.');
    const value=await api.status(body,token),after=await db.auth.getSession();
    if(after.error||after.data?.session?.access_token!==token||generation!==installation)throw new Error('La sesión cambió. Consultá el estado nuevamente.');
    return showStatus(body,value,false,token);
  };
  let capability;try{capability=await refresh();}catch(_){return;}
  if(button&&role==='ADMINISTRADOR'&&capability.configuration_enabled===true){
    button.hidden=false;button.onclick=async()=>{
      const view=dialog('Configuración · Facturación electrónica');
      view.d.append(node('p','Opcional por comercio. Usá la identidad fiscal propia del comercio. Guardar no habilita emisión ni valida representación.'));
      try{
        capability=await refresh();const registration=await api.enrollmentStatus();
        const labels={SIN_CONFIGURAR:'Sin configurar',PENDIENTE_VERIFICACION:'Pendiente de verificar ante ARCA',HABILITADO:'Emisor verificado',REQUIERE_REVALIDACION:'Necesita revalidación'};
        const active=registration.state==='HABILITADO'&&capability.completion_enabled===true;const state=node('p','Estado fiscal del comercio: '+(active?'Facturación electrónica habilitada':registration.state==='HABILITADO'?'Emisor verificado · emisión temporalmente no disponible':labels[registration.state]||'No disponible'));state.dataset.state=active?'success':'pending';view.d.append(state);if(Number.isSafeInteger(capability.operational_expires)){const days=Math.ceil((capability.operational_expires*1000-Date.now())/86400000);if(days<=15)view.d.append(node('p',days>0?'La autorización operativa requiere renovación en '+days+' días.':'Autorización operativa vencida: requiere revisión privada.'));}
      }catch(_){view.d.append(node('p','No se pudo consultar la verificación fiscal. Esto no habilita emisión.'));}
      if(capability.daily_enabled===true){
        const taxes=node('button','Condiciones fiscales de clientes e IVA de productos');taxes.type='button';taxes.onclick=()=>{view.d.close();taxSetup(api,db,business);};view.d.append(taxes);
      }
      const details=node('button','Datos del comprobante e Ingresos Brutos');details.type='button';details.onclick=()=>{view.d.close();offlineSetup(true,capability.completion_enabled===true);};view.d.append(details);
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
        fields.representation=delegatedRepresentation(form);fields.representation.value=profile.representation||'DELEGADA';
        if(fields.representation.value!=='DELEGADA')message.textContent='La representación histórica requiere revisión. No se modificó el perfil existente.';
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
          event.preventDefault();if(save.disabled)return;
          if(fields.representation.value!=='DELEGADA'){message.textContent='La representación histórica requiere revisión; no se modificó.';return;}save.disabled=true;
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
if(typeof module==='object'&&module.exports)module.exports={client,deliverPdf};
})(typeof window==='object'?window:globalThis);
