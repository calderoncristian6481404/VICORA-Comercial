# Integración fiscal cotidiana: candidata para revisión

Se conserva Ticket VICORA NO FISCAL / Factura ARCA / Más tarde por venta e historial. El módulo fiscal no vuelve a ejecutar confirmar_venta ni movimientos comerciales. La publicación y el archivo de configuración actuales no se habilitan desde este PR.

El administrador puede completar condición fiscal/documento de clientes, tratamiento IVA por producto y logo opcional PNG/JPEG de hasta 32 KiB cuando el backend privado anuncie `daily_enabled`. El servidor verifica sesión, rol y negocio y conserva la configuración versionada; no se envían empresa, tipo de factura, importe, numeración, CAE o permisos para autorizar una emisión. No se presume IVA 21%.

Una solicitud explícita puede intentar la autorización una sola vez. Si falla la conexión, sólo se consulta estado/conciliación, con máximo tres consultas y sin repetir emisión. La operación queda pendiente si no existe una respuesta verificable. Los PDF sólo se descargan desde el backend autenticado que verificó evidencia fiscal.

La limitación de piloto en `arca.config.js` se conserva. Otro comercio necesita la habilitación individual auténtica del backend; la mera firma de un JWT o un campo del navegador no basta. No se considera instalado ni certificado el backend por estas pruebas HTTP sintéticas.

Este PR no despliega Pages, no toca Supabase/Contabo, no registra otra venta ni emite CAE. Coordinar con el PR privado de operación cotidiana de VICORA-ARCA-Experimental antes de publicar. La emisión de notas de crédito del runtime productivo todavía no está integrada: no confundir su selector de tipo o presentación con habilitación fiscal.
