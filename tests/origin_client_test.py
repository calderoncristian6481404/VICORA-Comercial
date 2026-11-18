import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('preparation_origin',Path(__file__).resolve().parents[1]/'server/preparation_origin.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ClientContract(unittest.TestCase):
 def test_default_disabled_without_pool_access(self):
  c=m.OriginClient(None,None,lambda t:(_ for _ in ()).throw(AssertionError()))
  with self.assertRaisesRegex(m.OriginRejected,'ORIGIN_DISABLED'):c.prepare('synthetic','sale')
 def test_forged_browser_receipt_and_invalid_hash_are_not_authorizations(self):
  for v in ({},{'payload_text':'{}','seal':'0'*64},{'id':'bad'}):
   with self.assertRaises(m.OriginRejected):m.receipt(v)
 def test_signature_verifier_is_called_before_SQL(self):
  c=m.OriginClient(None,None,lambda t:(_ for _ in ()).throw(PermissionError('SIGNED_IDENTITY_REJECTED')),enabled=True)
  with self.assertRaisesRegex(PermissionError,'SIGNED_IDENTITY_REJECTED'):c.prepare('synthetic','sale')
 def test_identity_commands_default_closed_and_verifier_precedes_SQL(self):
  c=m.OriginClient(None,None,lambda t:(_ for _ in ()).throw(AssertionError()))
  with self.assertRaisesRegex(m.OriginRejected,'ORIGIN_DISABLED'):c.identity('synthetic',lambda *_:None)
  c=m.OriginClient(None,None,lambda t:(_ for _ in ()).throw(PermissionError('SIGNED_IDENTITY_REJECTED')),enabled=True)
  with self.assertRaisesRegex(PermissionError,'SIGNED_IDENTITY_REJECTED'):c.identity('synthetic',lambda *_:None)
if __name__=='__main__':unittest.main()
