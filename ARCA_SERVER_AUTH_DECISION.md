# Cierre vigente de integración gestionada — PR4 + PR11

La instalación de origen en VICORA ADMIN del 18/11/2026 ya está realizada y se
verificó por metadatos READ ONLY: control apagado, cero decisiones, 23 triggers
habilitados, dos roles LOGIN restringidos sin contraseña y sin permisos directos.
Las tres correcciones PUBLIC están aplicadas. NO repetir migraciones ni grants.
Ver server/candidate/PRODUCTION_DISABLED_INSTALL_20261118.md.

Se conservan el cliente comercial aa525cd3 y los contratos originales sin cambios.
El PR11 añade conexión a ambos roles, credenciales cifradas mediante systemd,
inspección TLS/ACL con preparación apagada, aceptación privada de casos autorizados
y un único incremento reproducible con instalación/reversión temporal probadas.
No acredita credenciales, sesiones o materialización reales en Contabo.

[Informe único y evidencias actuales](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/CIERRE_FINAL_VICORA_ARCA.md).
[Guía de instalación y reversión](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/DOCUMENTACION_LAB/CONTABO_FINAL_CONEXION_DESACTIVADA.md).

Ticket interno NO FISCAL y factura opcional por venta se conservan; no hay nuevos
movimientos de venta, stock, caja o cobros. Cada comercio utiliza su propia identidad
fiscal. can_send=false, runtime_enabled=false. No se reserva ni emite; no se ha
fusionado, desplegado ni modificado producción durante esta intervención.
