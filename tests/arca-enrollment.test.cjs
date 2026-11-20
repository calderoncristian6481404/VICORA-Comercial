'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {client}=require('../arca.js');
const db={auth:{getSession:async()=>({data:{session:{access_token:'SESSION'}}})}};
function api(fetchImpl){return client({db,apiOrigin:'https://fiscal.invalid',fetchImpl});}
const approved={state:'HABILITADO',environment:'PRODUCCION',verified_until:1795150000,can_send:false,runtime_enabled:false};
function ok(value){return {ok:true,json:async()=>value};}

test('status scoped to current user: no business, CUIT or credentials in browser request',async()=>{
  const a=api(async(url,opts)=>{
    assert.equal(url,'https://fiscal.invalid/v1/fiscal/enrollment');
    assert.equal(opts.method,'GET');
    assert.equal(opts.headers.Authorization,'Bearer SESSION');
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.body,undefined);
    return ok(approved);
  });
  assert.deepEqual(await a.enrollmentStatus(),approved);
});
test('self-service verification sends only version and password reauth token in protected header',async()=>{
  let calls=0;
  const a=api(async(url,opts)=>{
    calls++;
    assert.equal(url,'https://fiscal.invalid/v1/fiscal/enrollment');
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers.Authorization,'Bearer SESSION');
    assert.equal(opts.headers['X-Vicora-Reauth'],'RECENT_PASSWORD_SESSION');
    assert.deepEqual(JSON.parse(opts.body),{version:2});
    assert.equal(opts.credentials,'omit');
    assert.ok(!url.includes('SESSION'));assert.ok(!opts.body.includes('RECENT_PASSWORD_SESSION'));
    return ok(approved);
  });
  assert.deepEqual(await a.verifyEnrollment(2,async()=>'RECENT_PASSWORD_SESSION'),approved);
  assert.equal(calls,1);
});
test('no self-approval from browser field and no reuse of main user session',async()=>{
  let calls=0;
  const a=api(async()=>{calls++;return ok(approved);});
  await assert.rejects(a.verifyEnrollment(0,async()=>'ANOTHER'));
  await assert.rejects(a.verifyEnrollment(2,async()=>'SESSION'));
  await assert.rejects(a.verifyEnrollment(2,undefined));
  assert.equal(calls,0);
});
test('HOMO approval, fake READY state or can_send spoofing never authorizes enrollment',async()=>{
  for(const bad of [
    {...approved,environment:'HOMOLOGACION'},
    {...approved,state:'PREPARADO_NO_EMITIDO'},
    {...approved,can_send:true},
    {...approved,runtime_enabled:true}
  ]){
    await assert.rejects(api(async()=>ok(bad)).verifyEnrollment(1,async()=>'REAUTH'));
  }
});
test('verification UI is only a gated admin option, never auto-emits or stores credentials',()=>{
  const js=fs.readFileSync(require.resolve('../arca.js'),'utf8');
  assert.ok(js.includes("role==='ADMINISTRADOR'"));
  assert.ok(js.includes("Verificar permisos fiscales ARCA"));
  assert.ok(js.includes("password.value=''"));
  assert.ok(js.includes("signInWithPassword"));
  assert.ok(!js.includes('localStorage'));
  assert.ok(!js.includes('/v1/fiscal/emit'));
  assert.ok(!js.includes('/v1/fiscal/reserve'));
});
