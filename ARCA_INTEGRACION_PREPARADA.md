> Actualización posterior 18/11/2026: los dos contratos SQL ya están instalados y OFF,
> y el operador confirmó los 26 archivos instalados en Contabo. No repetirlos, ni
> passwords/HTTPS/TLS/VEN-000040. La configuración privada y su aceptación completa
> siguen pendientes; no se fabrican. Esta revisión no cambia interfaz, ventas o Auth.
> Código fiscal 028b9d372e6077ef3008ae0b196e0c17d0cf8cf7; CI 44424236973 SUCCESS,
> 30 casos nuevos (22 configuración + 8 portabilidad), 71 regresiones y navegador.
> Único procedimiento sin reinstalación: DOCUMENTACION_LAB/CONTABO_CONFIGURACION_UNICA.md
> del PR11. Informe vigente: CIERRE_FINAL_VICORA_ARCA.md del repositorio fiscal.
> No se declara el preparador operativo: servicios OFF, can_send=false/runtime_enabled=false.

## Decisión final de producto — comprobante opcional POR VENTA (19/11/2026)

**Regla solicitada por el titular:**
1. VICORA registra la venta **una única vez**, con los movimientos comerciales normales de stock, cobro y caja. La elección del comprobante se hace **después** de confirmar esa venta, no la sustituye ni vuelve a insertarla.
2. Si el comercio tiene facturación electrónica legítimamente configurada y autorizada **una vez a nivel del comercio**, el vendedor elige para **cada venta** entre **Ticket VICORA (NO FISCAL)** o **Comprobante fiscal ARCA**; también puede decidir más tarde desde el historial. **El vendedor NO activa ni habilita la integración fiscal cada vez que vende.** Elegir fiscal en una venta no obliga ni preselecciona fiscal para la siguiente.
3. Ticket común debe estar siempre disponible y nunca llamar a ARCA ni necesitar certificado, permiso, perfil fiscal o vinculación. Si ARCA no está operativo, la venta y ticket común funcionan igual.
4. Elegir comprobante fiscal debe operar solo sobre el `saleRef` de la venta confirmada, con identidad, negocio, rol, suscripción y emisor determinados y autorizados **en el servidor**. No modificar stock/caja, crear otra venta ni aceptar CUIT/tipo/CAE desde el navegador. El sistema determina tipo A/B/C según condición fiscal real.
5. **No confundir situación actual con funcionamiento terminado:** el código de esta rama únicamente solicita preparación y muestra `PREPARADO_NO_EMITIDO`; no genera ni imprime comprobante fiscal, PDF/QR con CAE auténtico. Al completar el circuito ARCA se habilitará la emisión real solamente después de WSFE, CAE, persistencia y consulta independiente, con bloqueo duradero de resultados inciertos y sin reenvío duplicado. En producción actual los controles siguen apagados.
6. Una habilitación inicial de facturación corresponde al **administrador/comercio emisor**, no a cada venta. No debe confundirse `config.enabled` de instalación, autorización fiscal de un emisor legítimo y la simple elección del vendedor en la pantalla.
7. El modo ordinario es compatible con comercios que nunca utilizarán ARCA; el módulo fiscal es opcional, sin afectar VICORA Comercial 1.0 ni exigir que el desarrollador sea contribuyente por sus clientes.

**Criterio de aceptación futuro:** comercio configurado una sola vez → venta A, ticket VICORA → venta B, fiscal ARCA → venta C, ticket VICORA; exactamente **3 ventas comerciales**, solo **1 operación fiscal** solicitada y ninguna reconfiguración entre ventas. Para declarar completo se debe emitir en homologación autorizada con CAE genuino y después probar permiso/recuperación en producción, no con mocks.

# Integración opcional Ticket VICORA / preparación ARCA

Estado experimental, PR4 coordinado con PR11 y seguimiento fiscal #12. Sin publicación,
merge, envío fiscal o cambios de módulos comerciales productivos.

Por venta confirmada se mantiene Ticket VICORA NO FISCAL, Factura ARCA o Más tarde.
La confirmación comercial ocurre una sola vez. La opción fiscal sólo manda saleRef;
la identidad, negocio, permisos, suscripción, emisor y tipo no se eligen en el navegador.
Ahora la UI exige capabilities autenticadas del servidor y vuelve a comprobarlas antes
de preparar. Un indicador JavaScript no equivale a habilitación. Consulta de estado no
vuelve a preparar ni a confirmar ventas. UNKNOWN bloquea reenvíos.

## Administrador: Configuración → Facturación electrónica

Usar la cuenta VICORA habitual. CUIT, condición, punto y representación son una solicitud
privada, no prueba de habilitación. Guardar requiere contraseña actual mediante cliente
Auth separado sin persistencia; no se imprime ni guarda la contraseña. El backend exige
AMR password reciente, identidad/negocio coincidentes, permisos y sesión vivos, CAS y
protección contra replay. Perfil pendiente no activa emisor o emisión.

Los tipos permitidos, certificado protegido y representación efectiva provienen del
registro revisado del servidor. No hay campos para claves privadas, contraseñas fiscales,
Token o Sign. No se configura el CUIT del desarrollador como emisor de clientes.
Para revocar preparación se deshabilita el perfil por el mismo flujo administrativo;
la revocación de representación/certificado efectivo la ejecuta el operador fiscal por
canal privado autorizado. No se borran decisiones ni operaciones previas.

## Vendedor

Registrar la venta normalmente. Ticket común nunca requiere configuración fiscal.
Factura ARCA sólo aparece con habilitación comprobada del backend; Más tarde no realiza
ninguna operación fiscal. Desde el detalle de una venta confirmada se puede consultar
la preparación sin volver a registrar movimientos. Preparada NO significa emitida.
No hay PDF, QR ni impresión fiscal para estados preparados, simulados o inciertos.

## Evidencia vigente, sin repetir instalaciones

Issue fiscal #12 documenta: dos logins TLS reales/credenciales cifradas instalados,
HTTPS público de salud y renovación aprobados, JWT real ES256 y una única decisión
ACCEPTED de VEN-000040 de VITALIA ficticia. Control apagado y helper temporal retirado.
NO repetir esa preparación, instalar passwords o borrar esa decisión. No prueba
materialización LAB, logout/ban/concurrencia reales ni homologación ARCA.
VITALIA no tiene identidad fiscal: binding INACTIVO, sin CUIT/punto/certificado inventados.

La nueva API de recuperación está sólo preparada en server/candidate/recovery.review.sql;
necesita autorización de instalación separada. No altera Auth, ventas, suscripciones,
triggers o permisos existentes. No ejecutar SQL por el hecho de aprobar pruebas.

Informe único y operaciones externas:
https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/CIERRE_FINAL_VICORA_ARCA.md
can_send=false; runtime_enabled=false; funcionalidad fiscal productiva apagada.

## Cierre coordinado 18/11/2026 — sin publicación ni emisión

PR4 conserva ticket NO FISCAL por defecto, factura opcional por venta, configuración
administrativa con reautenticación y consulta autenticada del estado de preparación.
Código comercial c852370b35551fb04fa68590ed1297093cd15905; cliente funcional ec91f27,
inventario de revisión c677021. CI Linux/Windows 44407368899 (17 casos/plataforma),
44408159042 (10/plataforma), contrato del origen en HEAD 44410108674 PASS.

Cierre único, límites alojados, permisos nuevos preparados y comandos reversibles:
https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/CIERRE_FINAL_VICORA_ARCA.md
PR11 código 58b6fdbcb14488cf3b0a52790859c2b640d3e380; CI 44413881667 SUCCESS:
58 casos PostgreSQL17, navegador móvil/escritorio y entrega de 26 archivos.
El navegador real usa un backend explícitamente sintético: no acredita servicios alojados.

Issue12 conserva logins/HTTPS/JWT y UNA decisión VITALIA VEN-000040 ya comprobados;
no repetirlos ni inventar identidad tributaria de VITALIA. Recovery SQL nuevo permanece
sin instalar y requiere autorización separada. Ningún cambio de esta revisión modifica
producción, Auth, RLS o Contabo. can_send=false; runtime_enabled=false. PR sin fusionar.
