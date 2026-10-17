# ShopATUT — Aggiornamento 11/10/2026 — V29

## Dashboard amministratore — Riepilogo

- Sostituito il KPI MEDIA con RESIDUO.
- RESIDUO è la somma dei residui per articolo, calcolati come quantità acquistata meno quantità venduta storica e vendite collegate ai movimenti, con residuo minimo pari a zero per ciascun articolo.
- Il valore è espresso in pezzi/copie, non in euro.

## Stato spedizioni e schede cliente

- Lo stato SPEDITO è memorizzato direttamente sull'assegnazione cliente-articolo e non dipende dalla presenza di un registro spedizione.
- La migrazione Supabase `20261011143000_add_spedito_to_article_assignments_status.sql` consente lo stato SPEDITO.
- I registri spedizione storici importati sono stati rimossi dal database e gli articoli collegati sono stati marcati SPEDITO prima della rimozione. Non è stato creato un nuovo movimento di tipo SPEDIZIONE.

## Verifiche e limiti

- Controllo sintattico TypeScript/TSX completato sul file della dashboard.
- Integrità dell'archivio ZIP verificata.
- Build Next.js completa non eseguita in questo ambiente; verificare la build prima della pubblicazione.
