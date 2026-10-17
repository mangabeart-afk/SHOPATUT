# SHOPATUT — aggiornamento v25 — 11/10/2026

## Correzione cancellazione articolo e annullamento vendita

- Ripristinata nel progetto Supabase `uzpjvukwzuaadovyxsur` la RPC `public.admin_delete_customer_sale(uuid)`, richiamata da `public.admin_delete_articles(uuid[])` e dalla pagina di gestione degli acquisti cliente.
- La RPC supporta vendite a casella e vendite a clienti occasionali senza casella. Le vendite occasionali non generano utenti, clienti, codici o caselle.
- La procedura rispetta il vincolo `article_assignments.quantity_assigned > 0`: quando annulla un assegnamento ne cambia lo stato senza azzerare la quantità storica.
- La procedura conserva il movimento originale come `ANNULLAMENTO` e registra il movimento compensativo `STORNO`, impedendo il doppio conteggio dei ricavi.
- Se esiste un acconto allocato alla vendita annullata, l'incasso resta registrato; viene rimossa soltanto la sua allocazione alla vendita annullata, così il pagamento non viene cancellato.
- Per le vendite assegnate a una casella, la cancellazione è bloccata se la quantità coinvolta risulta già spedita; le assegnazioni vengono stornate solo quando la rimozione è sicura.
- Stato articolo ricalcolato considerando sia le quantità vendute legacy sia le vendite collegate.
- Permesso `EXECUTE` concesso ad `authenticated`, negato ad `anon` e `PUBLIC`; richiesta la ricarica dello schema PostgREST.

## Verifiche effettuate

- La funzione è presente nel database con firma esatta `admin_delete_customer_sale(uuid)`.
- `authenticated_can_execute = true`; `anon_can_execute = false`.
- La funzione contiene la gestione delle allocazioni obsolete e non richiede una casella per annullare una vendita occasionale.
- Verificato il secondo fix: l’annullamento non tenta più di salvare `quantity_assigned = 0`, che violerebbe il vincolo del database.
- Il tentativo precedente non ha modificato i dati: articolo `A26/1138`, vendita `M26/0995` da €15 e acconto `P26/0427` da €5 risultano ancora presenti; l'allocazione di €5 risulta ancora collegata alla vendita. Non ho cancellato né modificato tali record durante la correzione.
- Non eseguito un test distruttivo sulla vendita reale di prova. L'utente può riprovare la cancellazione dall'app.
- Build Next.js completa non dichiarata come superata in questa operazione.
- Nessuna modifica a GitHub o Vercel.
