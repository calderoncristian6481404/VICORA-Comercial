# Integración fiscal opcional preparada

Continuación del PR #3 (dfcc956), sin despliegue ni modificación productiva.
La API correspondiente está en VICORA-ARCA-Experimental, PR derivado de #10.

- arca.config.js está apagado por defecto; el usuario no elige empresa, CUIT o tipo
  en una petición de preparación. Solo saleRef y JWT de su sesión VICORA.
- Configuración sensible pide contraseña VICORA existente mediante cliente Auth
  en memoria, sin cambiar la sesión principal. Backend valida admin, AMR password
  reciente, membresía y sesión. No hay contraseña fiscal nueva.
- Guardar CUIT/punto/condición propios solicita verificación: no activa emisión ni
  convierte lo declarado por un administrador en evidencia fiscal auténtica.
- Ticket común permanece disponible. El botón fiscal prepara, no reserva ni emite;
  tipo A/B/C lo decide el backend con información verificada. No hay PDF/QR fiscal
  para preparación o MOCK; la impresión ordinaria sigue siendo no fiscal.
- La API no confirma ventas ni hace movimientos comerciales. Se protege la doble
  confirmación mientras se responde al diálogo y se informa éxito aunque falle
  la actualización de pantalla posterior a confirmar.

Pruebas: `node tests/arca.test.cjs` (9 métodos enfocados) en Linux/Windows.
`tests/arca-browser.cjs` es el escenario Chromium conjunto; el servidor temporal
sintético y las instrucciones están en CIERRE_LAB/run_local_commercial_browser.py
/ DOCUMENTACION_LAB/API_FISCAL_Y_VENTAS.md del repositorio fiscal.
Sin dependencia nueva del sitio publicado ni credenciales nuevas de CI.

Instalación posterior: aprobar ambos PR, puertos privados y permisos restringidos
LAB; configurar HTTPS y origen exacto del backend; verificar Auth comercial real
(incluido AMR password), identidad fiscal propia del comercio y binding antes de
activar solo preparación. Cambiar arca.config.js únicamente en instalación
experimental autorizada. Ni ese switch ni el backend habilitan envío fiscal.
Reversión: enabled:false y retirar la ruta nueva, conservando toda la evidencia.
No desplegado, no homologado, can_send=false y runtime_enabled=false.
