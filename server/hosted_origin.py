"""Managed-Auth source adapter; explicit verified sub/sid, no authorization GUC.
No connections at import; roles/passwords are supplied by reviewed server ports.
"""
import copy,uuid
from preparation_origin import OriginClient,OriginRejected,receipt
ROLES={'origin_gateway_lab':'vicora_origin_gateway','origin_materializer_lab':'vicora_origin_materializer'}
ACL_SQL="""SELECT
 has_schema_privilege(current_user,'auth','USAGE') OR has_schema_privilege(current_user,'public','CREATE'),
 EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('auth','public','vicora_origin_private') AND c.relkind IN('r','p')
 AND (has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES'))),
 EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('public','auth','vicora_origin_private') AND p.prosecdef AND has_function_privilege(current_user,p.oid,'EXECUTE')),
 obj_description((SELECT oid FROM pg_namespace WHERE nspname='vicora_origin_api'),'pg_namespace')
"""
class HostedOriginClient(OriginClient):
 def _guard(self,c,role):
  if role not in ROLES:raise OriginRejected('ORIGIN_ROLE_REJECTED')
  super()._guard(c,ROLES[role])
  if c.execute(ACL_SQL).fetchone()!=(False,False,False,'REVIEWED_SOURCE_V1; prepared only, no numbering or fiscal transport'):
   raise OriginRejected('ORIGIN_EFFECTIVE_ACL_OR_CONTRACT_REJECTED')
  if c.execute('SELECT vicora_origin_api.admission()').fetchone()!=(True,):raise OriginRejected('ORIGIN_INSTALLATION_DISABLED')
 def _context(self,token):
  claims=self.claims(token)
  try:
   values=tuple(claims[k] for k in ('sub','session_id','exp'))
   for value in values[:2]:
    if type(value) is not str or str(uuid.UUID(value))!=value:raise ValueError()
   if type(values[2]) is not int:raise ValueError()
   return claims,values
  except Exception:raise OriginRejected('ORIGIN_IDENTITY_CONTEXT_REJECTED') from None
 def _actor(self,value,values):
  if type(value) is not dict or set(value)!={'subject','session','business','role'} or value['subject']!=values[0] or value['session']!=values[1] or value['role'] not in ('ADMINISTRADOR','VENDEDOR'):
   raise OriginRejected('ORIGIN_ACTOR_REJECTED')
  business=value['business']
  if type(business) is not str or not 0<len(business)<=128 or any(ord(c)<32 or ord(c)==127 for c in business):raise OriginRejected('ORIGIN_ACTOR_REJECTED')
  return copy.deepcopy(value)
 def prepare(self,token,sale_ref):
  if type(sale_ref) is not str or not 0<len(sale_ref)<=128:raise OriginRejected('ORIGIN_INPUT_REJECTED')
  claims,values=self._context(token)
  try:
   with self.gateway.connection() as c,c.transaction():
    c.execute("SET LOCAL statement_timeout='3s'");c.execute("SET LOCAL lock_timeout='800ms'")
    self._guard(c,'origin_gateway_lab')
    value=c.execute('SELECT vicora_origin_api.prepare(%s,%s,%s,%s)',(*values,sale_ref)).fetchone()[0]
    result=receipt(value['decision']);actor=self._actor(value['actor'],values)
    if actor['business']!=result['business'] or self.claims(token)!=claims:raise OriginRejected('ORIGIN_ACTOR_REJECTED')
    self._before_commit()
    if self.claims(token)!=claims or self._actor(c.execute('SELECT vicora_origin_api.identity(%s,%s,%s)',values).fetchone()[0],values)!=actor:raise OriginRejected('ORIGIN_IDENTITY_CHANGED')
   return result,actor
  except OriginRejected:raise
  except Exception:raise OriginRejected('ORIGIN_COMMAND_REJECTED_OR_UNCERTAIN') from None
 def identity(self,token,consumer):
  claims,values=self._context(token)
  try:
   if not callable(consumer):raise ValueError()
   with self.gateway.connection() as c,c.transaction():
    c.execute("SET LOCAL statement_timeout='3s'");c.execute("SET LOCAL lock_timeout='800ms'")
    self._guard(c,'origin_gateway_lab')
    def actor():return self._actor(c.execute('SELECT vicora_origin_api.identity(%s,%s,%s)',values).fetchone()[0],values)
    original=actor()
    def recheck():
     if self.claims(token)!=claims or actor()!=original:raise OriginRejected('ORIGIN_IDENTITY_CHANGED')
    recheck();value=consumer(copy.deepcopy(original),recheck);recheck()
   return value
  except OriginRejected:raise
  except Exception:raise OriginRejected('ORIGIN_IDENTITY_REJECTED_OR_UNCERTAIN') from None
 def _materialize_call(self,sql,args=None):
  queries={'SELECT origin_api.load(%s)':'SELECT vicora_origin_api.load(%s)',
   'SELECT * FROM origin_api.pending()':'SELECT * FROM vicora_origin_api.pending()',
   'SELECT origin_api.ack(%s,%s,%s)':'SELECT vicora_origin_api.ack(%s,%s,%s)'}
  if sql not in queries or self.enabled is not True:raise OriginRejected('ORIGIN_RECOVERY_REJECTED')
  try:
   with self.materializer.connection() as c,c.transaction():
    c.execute("SET LOCAL statement_timeout='3s'");c.execute("SET LOCAL lock_timeout='800ms'")
    self._guard(c,'origin_materializer_lab')
    return c.execute(queries[sql],args).fetchall()
  except Exception:raise OriginRejected('ORIGIN_RECOVERY_REJECTED_OR_UNCERTAIN') from None
