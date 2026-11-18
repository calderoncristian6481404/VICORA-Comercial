/* Static contract evidence only. PASS is NOT hosted/backend compatibility. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const inventory=JSON.parse(fs.readFileSync(path.join(root,'ARCA_SOURCE_INVENTORY.json'),'utf8'));
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function routes(s){return {
 rpc:[...new Set([...s.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)].map(x=>x[1]))].sort(),
 writes:[...new Set([...s.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)\s*\.\s*(insert|update|delete|upsert)\s*\(/g)].map(x=>x[1]+':'+x[2]))].sort(),
 auth:[...new Set([...s.matchAll(/\.auth\.(\w+)\s*\(/g)].map(x=>x[1]))].sort()
};}
test('inventory identifies the reviewed runtime sources without changing them',()=>{
 assert.equal(inventory.commercial_commit,'161c44d34da687587f454a1cd8d1dd9c8ae4a802');
 const files=fs.readdirSync(root).filter(n=>n.endsWith('.js')||n==='index.html').sort();
 assert.deepEqual(files,Object.keys(inventory.files).sort());
 for(const [name,proof] of Object.entries(inventory.files))assert.equal(sha(fs.readFileSync(path.join(root,name))),proof.sha256,name);
});
test('literal routes and RPC calls match the actual inspected files',()=>{
 for(const [name,proof] of Object.entries(inventory.files))assert.deepEqual(routes(text(name)),proof.routes,name);
 assert(inventory.files['ventas.js'].routes.rpc.includes('confirmar_venta'));
 assert(inventory.files['index.html'].routes.writes.includes('clientes:update'));
 assert(inventory.files['index.html'].routes.auth.includes('signOut'));
 assert(inventory.files['arca.js'].routes.auth.includes('signInWithPassword'));
});
test('publication remains disabled; the contract does not claim an implemented admitted backend',()=>{
 const context={window:{}};vm.runInNewContext(text('arca.config.js'),context);
 assert.equal(context.window.VICORA_ARCA_CONFIG.enabled,false);
 assert.equal(context.window.VICORA_ARCA_CONFIG.apiOrigin,'');
 assert.equal(inventory.managed_auth_writer_participation_verified,false);
 assert.equal(inventory.hosted_adapter_admitted,false);
 assert.equal(inventory.server_adapter_implemented,false);
 assert.equal(inventory.can_send,false);assert.equal(inventory.runtime_enabled,false);
});
test('existing subscription enforcement remains byte-identical',()=>{
 for(const [name,pin] of Object.entries(inventory.subscription_guards))assert.equal(sha(fs.readFileSync(path.join(root,name))),pin,name);
 assert(text('DB/MIGRACIONES/20261112_guardia_suscripcion_escrituras.sql').includes('SIS-000001'));
});
