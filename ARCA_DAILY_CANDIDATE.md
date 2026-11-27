# Integración opcional por venta — candidata de revisión

La venta, stock, caja y cobros conservan su circuito actual. El ticket VICORA es
NO FISCAL y no requiere configuración ARCA. La opción fiscal sólo se ofrece tras
consultar la habilitación del servidor para la cuenta y negocio autenticados.

El frontend transmite referencias de venta y preferencias de presentación. El
servidor decide identidad, permisos, suscripción, emisor, impuestos, numeración y
autorización. `X-Vicora-Context` es una precondición contra pantallas de otra
cuenta: nunca sustituye la autorización del servidor. Cambiar de sesión bloquea
acciones de una pantalla anterior.

- Una sola solicitud explícita de emisión. Tras timeout sólo consulta/conciliación;
  no se reenvía el POST de emisión ni se vuelve a confirmar la venta.
- Configuración de IVA/receptor y logo por negocio; nunca pide clave fiscal.
- Facturas A/B/C según habilitación y condición fiscal verificadas por servidor.
- Nota de Crédito C **total**, asociada a una factura C original verificada.
  Primero prepara con motivo legítimo, después requiere consentimiento separado.
  No admite un importe libre, notas parciales o acreditaciones de un MOCK.
  No efectúa por sí misma una devolución comercial ni movimientos de caja/stock.
- PDF A4/80 mm y datos CAE sólo con autorización y consulta independiente verificadas.
- La lectura/conciliación tiene permiso separado de la emisión. Un CAE simulado
  no se publica como comprobante auténtico.

Este PR contiene únicamente frontend y pruebas sintéticas, sin código privado de
servidor, credenciales, certificados o datos fiscales de clientes. No modifica
la configuración publicada ni despliega Pages. Su servidor compatible se revisa
en el PR privado de integración; requiere instalación y aceptación independientes.

Pruebas: ejecutar `node tests/arca-daily.test.cjs`,
`node tests/arca-credit-c.test.cjs` y las regresiones afectadas de cliente/UI.
El escenario Chromium sobre HTTPS loopback usa Auth y servicios sintéticos;
no acredita instalación alojada ni autorización fiscal real.
