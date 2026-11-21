/* Installation-only public configuration. Never put tokens, keys or passwords here.
   Enable preparation only after HTTPS API, exact origins and trusted ports pass
   acceptance. This switch NEVER permits fiscal reservation or emission. */
// showSetup permits explicit per-business draft/request saves via Supabase RLS; never authorizes WSFE.
// enabled:false is essential until the vetted HTTPS fiscal API is operational.
window.VICORA_ARCA_CONFIG=Object.freeze({enabled:false,apiOrigin:'',showSetup:true});
