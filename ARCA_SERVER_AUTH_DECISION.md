# Cierre conjunto vigente — ticket opcional y preparador fiscal

Informe único: [CIERRE_FINAL_VICORA_ARCA.md en PR fiscal #11](https://github.com/calderoncristian6481404/VICORA-ARCA-Experimental/blob/codex/api-fiscal-integrada/CIERRE_FINAL_VICORA_ARCA.md).
Código comercial 49abd7291c5dc1b7a67a119e17b7d829ffca9365. El código fiscal y los
runs finales están fijados en ese informe y su JSON de evidencia. Los detalles
de delegación permanecen en server/ORIGIN_THREAT_MODEL.md y server/review/.

El ticket simple no requiere configuración fiscal. El perfil pertenece al comercio,
no al desarrollador. Preparar o guardar un perfil no autoriza emisión. La nueva
unión de perfiles está probada únicamente en laboratorio y cerrada por defecto.
No copiar el SQL aislado a Supabase. can_send=false y runtime_enabled=false.
Se conserva el historial completo de los informes anteriores mediante Git.
