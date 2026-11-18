# Cierre vigente de integración gestionada — PR4 + PR11

Orden PR4 #6976659412 implementada en candidata SQL/cliente/composición. Se reutiliza
la evidencia managed Auth real del LAB, sin repetir sus instalaciones ni LAB14.
[Informe único](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/CIERRE_FINAL_VICORA_ARCA.md).

Código comercial aa525cd3a089077b5a908299b331b6a85df88f75; fiscal
f50e90d17eb04fe1d958cd7c27dc782ad59468ec. 39 pruebas finales aprobadas (13 métodos
nuevos, 26 regresiones); no se suman las 95 anteriores. SQL sobre columnas reales,
roles separados, outbox/load/pending/ACK, perfiles y binding de preparación existentes.
server/candidate contiene migración, roles, preflight, rollback y amenaza SD/owner.

La excepción SD postgres y ACL efectiva necesitan aprobación; no usar su login en
servidor ni aplicar fixtures a producción. No está conectado VICORA real ni arrancado
Contabo. Ticket simple sigue opcional e independiente; cada comercio es su emisor.
can_send=false y runtime_enabled=false. No se emite, reserva ni modifica producción.
