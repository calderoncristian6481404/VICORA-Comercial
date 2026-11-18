"""Restricted gateway for the ISOLATED source-decision protocol. No listener.
JWT verifier is injected server code (reuse approved PyJWT/JWKS), never HTTP data.
No credential storage, SQL interpolation, privileged fallback or hosted rollout.
"""
import copy,hashlib,json,uuid
class OriginRejected(PermissionError):pass

def receipt(value):
 try:
  fields={'id','business','sale','payload_text','seal','state','target_operation','target_hash'}
  if type(value) is not dict or set(value)!=fields or str(uuid.UUID(value['id']))!=value['id']:raise ValueError()
  if type(value['payload_text']) is not str or len(value['payload_text'].encode())>2097152 or hashlib.sha256(value['payload_text'].encode()).hexdigest()!=value['seal']:raise ValueError()
  if value['state'] not in ('ACCEPTED','MATERIALIZED'):raise ValueError()
  data=json.loads(value['payload_text'])
  if set(data)!={'commercial','authorizer'} or data['commercial']['header']['id_negocio']!=value['business'] or data['commercial']['header']['id_venta']!=value['sale']:raise ValueError()
  if value['state']=='MATERIALIZED':uuid.UUID(value['target_operation'])
  return copy.deepcopy(value)
 except Exception:raise OriginRejected('ORIGIN_RECEIPT_REJECTED') from None

class OriginClient:
 def __init__(self,gateway_pool,materializer_pool,verify_token,*,enabled=False):
  self.gateway=gateway_pool;self.materializer=materializer_pool;self.verify_token=verify_token;self.enabled=enabled
 def _transport(self,c):
  if not c.pgconn.ssl_in_use or c.info.get_parameters().get('sslmode')!='verify-full':raise OriginRejected('ORIGIN_TLS_REQUIRED')
 def _guard(self,c,role):
  self._transport(c)
  r=c.execute('SELECT current_user,session_user,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolinherit,EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) FROM pg_roles WHERE rolname=current_user').fetchone()
  if r!=(role,role,False,False,False,False,False,False,False):raise OriginRejected('ORIGIN_RESTRICTED_ROLE_REQUIRED')
 def _before_commit(self):pass # test pause point only; never driven by HTTP
 def prepare(self,token,sale_ref):
  if self.enabled is not True or not callable(self.verify_token):raise OriginRejected('ORIGIN_DISABLED')
  if type(token) is not str or type(sale_ref) is not str or not 0<len(sale_ref)<=128:raise OriginRejected('ORIGIN_INPUT_REJECTED')
  claims=self.verify_token(token) # full signature/issuer/audience/time verification
  try:
   context={k:claims[k] for k in ('sub','session_id','exp')}
   for k in ('sub','session_id'):
    if str(uuid.UUID(context[k]))!=context[k]:raise ValueError()
   if type(context['exp']) is not int:raise ValueError()
   with self.gateway.connection() as c,c.transaction():
    self._guard(c,'origin_gateway_lab')
    c.execute("SET LOCAL statement_timeout='3s'");c.execute("SET LOCAL lock_timeout='800ms'")
    c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps(context,separators=(',',':')),))
    value=c.execute('SELECT origin_api.prepare(%s)',(sale_ref,)).fetchone()[0]
    result=receipt(value['decision']);actor=value['actor']
    if actor['subject']!=context['sub'] or actor['session']!=context['session_id'] or actor['business']!=result['business'] or actor['role'] not in ('ADMINISTRADOR','VENDEDOR'):raise OriginRejected('ORIGIN_ACTOR_REJECTED')
    self._before_commit()
   return result,copy.deepcopy(actor)
  except OriginRejected:raise
  except Exception:raise OriginRejected('ORIGIN_COMMAND_REJECTED_OR_UNCERTAIN') from None
 def _materialize_call(self,sql,args=None):
  if self.enabled is not True:raise OriginRejected('ORIGIN_DISABLED')
  try:
   with self.materializer.connection() as c,c.transaction():
    self._guard(c,'origin_materializer_lab')
    c.execute("SET LOCAL statement_timeout='3s'")
    return c.execute(sql,args).fetchall()
  except Exception:raise OriginRejected('ORIGIN_RECOVERY_REJECTED_OR_UNCERTAIN') from None
 def load(self,key):return receipt(self._materialize_call('SELECT origin_api.load(%s)',(uuid.UUID(key),))[0][0])
 def pending(self):return [str(r[0]) for r in self._materialize_call('SELECT * FROM origin_api.pending()')]
 def acknowledge(self,key,operation,snapshot_hash):self._materialize_call('SELECT origin_api.ack(%s,%s,%s)',(uuid.UUID(key),uuid.UUID(operation),snapshot_hash))
