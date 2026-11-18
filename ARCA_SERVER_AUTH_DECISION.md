# Estado vigente PR4 / PR11 — seguimiento Issue #12

Las tres migraciones de origen YA están instaladas y NO se repiten. Evidencia posterior
reportada por operador y verificada en Issue fiscal #12: ambas credenciales técnicas
cifradas instaladas, logins reales TLSv1.3/verify-full aprobados, HTTPS de salud y
renovación aprobados, JWT real ES256 comprobado y una decisión ACCEPTED VEN-000040
conservada. Helper temporal retirado, control OFF, cero materializaciones fiscales.
No volver a preparar esa venta ni pedir passwords. VITALIA es totalmente ficticia.

Cambio actual: UI con habilitación autenticada del backend y consulta de estado sin
nueva preparación; contrato de recuperación privada revisable y desactivado; coordinación
con materializador y contratos LAB que reutilizan R100. Sin nueva autoridad fiscal.

La API recovery es una delegación SD adicional que requiere aprobación aparte; no está
instalada. No se modifica Auth/RLS/triggers/ventas o permisos productivos en esta tarea.

[Informe único y evidencias](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/CIERRE_FINAL_VICORA_ARCA.md).
Ticket NO FISCAL y factura opcional, por venta, sin duplicar movimientos; cada comercio
es su emisor. can_send=false y runtime_enabled=false. No merge/despliegue/emisión.
