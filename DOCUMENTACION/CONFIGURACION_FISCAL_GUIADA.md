# Configuración fiscal guiada

La modalidad disponible es **Emisión mediante representante autorizado**. El comercio debe autorizar la representación correspondiente en ARCA. El formulario mantiene DELEGADA internamente; no cambia perfiles existentes ni habilita emisión por mostrar esa opción. Una representación histórica diferente queda pendiente de revisión, sin conversión silenciosa.

Ingresos Brutos conserva el contrato comercial existente `ingresos_brutos` (texto):

- Inscripto: requiere número, guarda `Inscripto: número`.
- Exento: permite indicar condición o motivo, guarda `Exento` o `Exento: motivo` según declaración del comercio.
- Necesito asesoramiento: guarda un borrador pendiente, sin inventar un valor ni permitir enviar la solicitud fiscal.

Los valores históricos se preservan sin reinterpretarlos cuando no se modifica esta configuración. La aplicación no determina una condición tributaria. Desde la configuración fiscal operativa, “Datos del comprobante e Ingresos Brutos” abre el mismo formulario comercial existente, con consulta autenticada de los datos del propio comercio.

No se modifican comprobantes autorizados, ventas, caja, stock, suscripciones ni autorizaciones reales. El ticket común sigue siendo no fiscal y la facturación continúa siendo opcional por venta. La publicación de este PR queda condicionada a la aceptación real del backend; los tests de interfaz no acreditan emisión ni homologación ARCA.
