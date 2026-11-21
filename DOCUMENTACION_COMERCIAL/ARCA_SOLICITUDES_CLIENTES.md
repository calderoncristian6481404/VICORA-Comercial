# VICORA Comercial · Alta opcional de facturación electrónica

**Estado:** configuraciones de cada negocio (borrador / solicitud), sin emisión fiscal.

**Qué puede hacer el cliente administrador:** completar CUIT, condición IVA, punto Web Services, representación, razón social, domicilio, Ingresos Brutos e inicio de actividades; guardar borrador; enviar solicitud de activación a revisión y consultar su estado. La UI no recibe claves fiscales ni certificados.

**Privacidad:** la tabla `public.vicora_arca_solicitudes_comercio` contiene un registro por negocio; RLS + FORCE RLS permite lectura y escritura solo a un administrador activo de ese negocio autenticado. No existe DELETE del lado del navegador; una solicitud no puede convertirse en `HABILITADA` mediante SQL ni por un navegador. La emisión real depende de Contabo/WSFE, registro del titular, aprobación, numeración R100 y CAE independientes.

**Suscripciones:** el trigger de vigencia comercial existente se aplica a esta tabla, para conservar modo solo consulta cuando una suscripción vence.

**Prueba antes de publicación:** validar RLS con role `authenticated`, comprobar bloqueo de cambio de negocio, bloqueo de estado `HABILITADA`, y confirmar que las otras tablas comercial y fiscal siguen intactas.

**Operación:** la recepción de solicitudes se almacena para el futuro flujo de aprobación; NO dispara correos ni autoriza automáticamente a ningún comercio y no debe publicitarse como facturación operativa.