# VICORA Comercial · Alta opcional de facturación electrónica

**Estado:** configuraciones de cada negocio (borrador / solicitud), sin emisión fiscal.

**Qué puede hacer el cliente administrador:** completar CUIT, condición IVA, punto Web Services, representación, razón social, domicilio, Ingresos Brutos e inicio de actividades; guardar borrador; enviar solicitud de activación a revisión y consultar su estado. La UI no recibe claves fiscales ni certificados.

**Privacidad:** la tabla `public.vicora_arca_solicitudes_comercio` contiene un registro por negocio; RLS + FORCE RLS permite lectura y escritura solo a un administrador activo de ese negocio autenticado. No existe DELETE del lado del navegador; una solicitud no puede convertirse en `HABILITADA` mediante SQL ni por un navegador. La emisión real depende de Contabo/WSFE, registro del titular, aprobación, numeración R100 y CAE independientes.

**Suscripciones:** el trigger de vigencia comercial existente se aplica a esta tabla, para conservar modo solo consulta cuando una suscripción vence.

**Publicación:** PR #10 fusionado en `main`, pruebas de navegador aprobadas en Ubuntu/Windows, migración aplicada al proyecto `VICORA ADMIN`, RLS/FORCE y trigger comercial comprobados. Una inserción sintética de borrador bajo un administrador autenticado y vigente se ensayó en transacción con `ROLLBACK`; las filas actuales siguen en cero. ARCA, R100 y la emisión permanecen OFF.

**Operación:** la recepción de solicitudes se almacena para el futuro flujo de revisión; NO dispara correos ni autoriza automáticamente a ningún comercio. Actualmente las solicitudes pueden revisarse administrativamente desde la tabla protegida en Supabase (no hay bandeja de recepción automática en VICORA ADMIN). No debe publicitarse como facturación operativa.