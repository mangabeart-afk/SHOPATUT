# Aggiornamento ShopATUT — 10/10/2026

## Correzioni incluse

1. Ripristinata in Supabase la RPC `public.admin_delete_articles(p_article_ids uuid[])`, con autorizzazione amministratore, controllo delle spedizioni attive, gestione delle relazioni e grant a `authenticated`. Aggiunta la migration `20261010100000_restore_admin_delete_articles_rpc.sql` e richiesta la ricarica dello schema PostgREST.
2. I popup dell'archivio articoli vengono renderizzati tramite portal su `document.body`, per evitare che trasformazioni o contenitori di scorrimento dei pannelli li ancorino al pannello invece che alla finestra.
3. La scheda cliente ora unisce gli articoli delle vendite ai record di `article_assignments`: le assegnazioni Excel prive di un movimento `VENDITA` non vengono più nascoste.
4. Gli articoli nella scheda cliente sono raggruppati nell'ordine IN BOX, IN STOCK, IN ARRIVO, SPEDITO. Le prime tre sezioni mostrano il totale copie; SPEDITO non mostra il contatore.
5. Righe cliente ridisegnate in tre righe compatte; per gli articoli spediti la terza riga mostra soltanto il codice spedizione. Gli articoli importati come assegnazioni senza movimento finanziario mostrano importi a zero senza creare prezzi, pagamenti o saldi fittizi; l'assegnazione può essere modificata dal popup dedicato.
6. Elenco spedizioni in due righe: codice/data/cliente e azioni ARTICOLI, MODIFICA, ANNULLA. ARTICOLI apre un popup con codice, serie, descrizione e quantità; ANNULLA richiede conferma.
7. La modifica crediti nella pagina amministrativa usa un popup coerente con le altre pagine, includendo data, importo, stato, motivo e note.

## Verifiche

- La RPC `admin_delete_articles(uuid[])` è presente nel progetto Supabase `uzpjvukwzuaadovyxsur` e il ruolo `authenticated` dispone di `EXECUTE`.
- Le TSX modificate hanno superato il controllo sintattico TypeScript (transpile); il build Next.js completo non è stato eseguito in questo ambiente perché le dipendenze locali non sono installate.
- Il pacchetto ZIP contiene sorgenti e migration. Questo non equivale a un push GitHub o a un deploy Vercel.

## Aggiornamento v17 — paginazione archivio e dashboard completa

8. Archivio articoli: introdotta paginazione client-side con un massimo di 100 righe visibili per pagina, navigazione Prima/Precedente/Successiva/Ultima e indicazione dell'intervallo visualizzato. Ricerca, filtri, ordinamento, riepilogo e selezione operano sull'intero insieme dei risultati; gli articoli selezionati restano selezionati passando da una pagina all'altra.
9. Archivio articoli: le query per articoli, vendite, assegnazioni, caselle e clienti recuperano i risultati in blocchi da 1.000 righe, evitando il limite predefinito di Supabase che poteva nascondere dati oltre la prima pagina.
10. Dashboard amministratore: clienti, caselle, articoli attivi, movimenti, pagamenti, crediti e assegnazioni vengono caricati in blocchi da 1.000 righe. Il valore complessivo degli acquisti viene quindi calcolato sull'intero archivio e non soltanto sulle prime 1.000 righe.

### Verifiche v17

- Controllo di sintassi TypeScript/TSX superato sui tre file modificati.
- Il totale degli acquisti attualmente presente nel database, verificato prima della modifica, è **45.732,98 €**; dopo il deploy la card della dashboard dovrebbe riflettere il totale completo secondo le policy dell'account amministratore.
- Build Next.js completo non eseguito in questo ambiente perché le dipendenze non sono installate.
- Il pacchetto ZIP non implica automaticamente aggiornamenti GitHub o deploy Vercel.
