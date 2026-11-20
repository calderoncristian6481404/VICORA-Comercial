# Resultados de integración — 16/11/2026

Código `8b1afe78efcc62a00714bb77694a57e511f10abe`, PR #4 sobre PR #3.
[GitHub Actions 43953764269](https://github.com/calderoncristian6481404/VICORA-Comercial/actions/runs/43953764269):
**9/9 métodos en Linux y 9/9 en Windows, 18 ejecuciones, 0 fallos**.

Backend complementario: [VICORA-ARCA-Experimental PR #11](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/pull/11),
código `6a271bea6a12584e8d012c89c0717bf5d951a9d1`,
[Actions 43953404437](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/actions/runs/43953404437):
82 ejecuciones aprobadas (Linux/Windows/PostgreSQL 17.12). Total ambos: 100.

Escenario adicional local con Chromium real móvil y API Python HTTPS: misma cuenta
con contraseña sintética, configuración, una venta, elección fiscal tipo C,
reintento y una sola intención sin reserva. Se observó una confirmación comercial,
un movimiento de stock y un cobro. JWT/Auth/fuente comercial/intenciones de ese
escenario son sintéticos, no se certifica Supabase Auth ni servicios alojados.
Pruebas PostgreSQL concurrentes son reales en contenedor descartable separado.

Corregidos: callback faltante, doble confirmación durante diálogo y falsa indicación
de venta fallida ante error de refresco posterior. Datos fiscales y tipo no se
confían al navegador. Admin y reautenticación se verifican de nuevo en el backend.
El módulo permanece apagado y sin documentos fiscales para una preparación/MOCK.

Solo resta aprobación de PR e instalación experimental HTTPS, aceptación de puertos
privados/roles/binding fiscal y Auth real por administrador autorizado, y verificación
de identidad/representación/certificado/punto con HOMO autorizada por el titular.
Los detalles están en DOCUMENTACION_LAB/RESULTADOS_API_FISCAL.md del repositorio fiscal.
No fusión, producción, Supabase o Contabo modificados. can_send=false/runtime_enabled=false.
