# Recuperación de decisiones comprometidas, revisión separada

Las migraciones originales de origen YA están instaladas; no repetirlas.
La preparación real VEN-000040 queda conservada. Su recuperación está bloqueada por
la compuerta general actual; no se debe encender esa compuerta para drenar outbox.

recovery.review.sql añade un esquema privado, control OFF y load/pending/ack/admission.
Reutiliza decisiones/receipt existentes y el LOGIN materializador ya aprovisionado;
no crea usuarios, contraseñas ni otra outbox. Gateway/browser no pueden ejecutarlo.
La preparación original sigue OFF. Un ACK repetido sólo admite mismo UUID/hash;
uno contradictorio falla sin reemplazar el enlace. No se borra evidencia.

Nuevo SECURITY DEFINER owner postgres constituye una delegación privilegiada adicional:
requiere revisión/aprobación EXPRESA, aunque el contrato original ya esté aprobado.
search_path fijo, sin SQL dinámico de cliente, sin EXECUTE PUBLIC, parámetros tipados;
RLS FORCE no protege contra el propio administrador. No implica testigo independiente.

Antes de instalar: endpoint exacto nxdimgzcsjnjjdfdpatp/TLS, fuente original pin validado,
control de preparación false, roles existentes/ACL, ausencia de schema previo no revisado.
Tras autorización el DBA ejecuta, en su canal privado:
SET vicora.review.recovery_installation='APPROVED_SOURCE_RECOVERY_V1';
seguido del archivo. Instalación queda OFF y replay OFF es no-op. Ningún runtime lo aplica.
Se habilita recovery únicamente con una autorización posterior, sin encender preparación.

Preflight de sólo lectura: control original=false, recovery=false, cuatro funciones
privadas owner/search_path/ACL esperadas, materializador único receptor de EXECUTE.
Pruebas sólo en cluster descartable; no leer ni materializar VEN-000040 automáticamente.
Rollback revisado: recovery_rollback.review.sql apaga/revoca sólo el acceso nuevo,
conservando decisiones/ACKs. No reinstalar funciones temporales ni reabrir PUBLIC.
