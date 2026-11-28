# Experiencia fiscal opcional

Candidata para revisión, no publicación automática. Conserva ticket no fiscal, venta única y controles del servidor. La disponibilidad proviene de capacidades reales; se retiró la dependencia de un ID de comercio publicado en arca.config.js.

Todas las ventanas fiscales comparten tipografía, controles accesibles, tamaños táctiles y desplazamiento. Factura azul, nota ámbar, impresión azul, PDF secundario y cierre gris; ticket turquesa y anulación comercial roja. Procesamiento sin porcentajes ficticios. Autorización y recuperación comparten una sola operación por venta/sesión; cinco ciclos con espera, consultas y conciliación, nunca otro POST de emisión por timeout. Configuración y capacidades mantienen15s; transporte fiscal lento y documentos60s.

Facturas y notas ofrecen Imprimir y Descargar separados para A4/80mm. Vista imprimible con alternativa de descarga si el navegador bloquea ventanas o no imprime PDFs. No existe impresión silenciosa. Object URL conservada mientras la vista esté abierta, sin descargar involuntariamente. Preferencias de papel son por comercio en este navegador, no permisos fiscales.

Caja cerrada: cancelar no registra, continuar conserva el circuito comercial y abrir caja usa su RPC existente sin salir de la venta. El carrito no se pierde. Aviso optativo en configuración de impresión por negocio/navegador. No se obliga a usar Caja ni se reasignan cobros anteriores a un turno nuevo. Pagos/gastos con reglas explícitas de caja/origen de fondos mantienen sus restricciones; no se les habilita una excepción nueva.

Ingresos Brutos guiados y DELEGADA permanecen compatibles con el campo existente y valores históricos. El nombre comercial se guarda explícitamente como configuración de presentación y se fotografía con instrucciones nuevas; no se reescribe un documento sellado ni se usa el catálogo actual para cambiar productos históricos.

Notas totales A/B/C y facturas A/B/C se seleccionan en el servidor según emisor/receptor/tipos admitidos. Los tipos A/B de crédito requieren la ampliación SQL y la admisión privada revisada; no se habilitan por mostrar un botón. No hay notas parciales, M, exportación, FCE MiPyME, CAEA, servicios/turismo ni regímenes especiales nuevos.

Alta: completar datos, enviar solicitud por cuenta autenticada, delegar WSFE en ARCA, revisión administrativa y verificación técnica independiente. La instalación actualmente autorizada sigue acotada a VITALIA. El alta automática multiempresa completa y el controlador alojado de políticas90/15 no se consideran validados por estas pruebas de interfaz; ver el informe privado de integración y los bloqueos pendientes.
