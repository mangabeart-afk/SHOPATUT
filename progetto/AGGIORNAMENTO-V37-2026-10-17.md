# ShopATUT v37 — aggiornamento grafico e logistico

Base di partenza: `SHOPATUT-v36-dashboard-caselle-uniche.zip`.

## Area utente
- Dashboard: saldo contabile caricato dal riepilogo completo, senza ricavarlo dai soli ultimi cinque movimenti; codice cliente e saldo restano affiancati.
- Pannello rapido con i tre contatori richiesti: IN ARRIVO, IN STOCK e IN BOX. Il saldo non è ripetuto come quarto contatore e SPEDITO resta fuori dai contatori.
- Pagina Articoli: sezioni separate in base allo stato esplicito dell'assegnazione (IN ARRIVO, IN STOCK, IN BOX e SPEDITO); le assegnazioni ancora `ATTIVA` sono indicate come DA VERIFICARE, senza dedurre uno stato logistico dallo stato globale dell'articolo.
- Prezzo in pagina Articoli indicato come PREZZO DI VENDITA e recuperato dall'ultimo movimento di vendita associato, con calcolo unitario dal totale/quantità quando il prezzo unitario non è valorizzato.
- La voce BUSTE WR è visualizzata con quantità 1 e nota “21 unità”, senza mostrare una quantità di spedizione duplicata.
- Navigazione utente a barra inferiore con Home, Articoli, Pagamenti e Altro; nome e cognome sono accompagnati dal codice cliente e la dicitura del profilo è UTENTE.
- Galleria: anteprime ritagliate al centro senza deformazioni, immagine originale all'apertura; 3 colonne su smartphone verticale e 4 in orizzontale. La galleria degli ultimi 12 articoli continua a includere gli articoli con foto senza filtro di stato; rimossa la vista aggiuntiva paginata da 120 articoli, già annullata.

## Area amministratore
- Dashboard gestionale con CLIENTI, SALDO, IN ARRIVO, QT ACQ, VALORE ACQUISTI, MEDIA, QT VND, VALORE VENDITE e MARGINE.
- Sezioni operative per clienti con saldo da pagare, saldo zero con articoli in arrivo e articoli pronti da spedire; la preparazione alla spedizione viene conteggiata usando lo stato esplicito IN BOX.
- Analisi complessiva e per provenienza spostata nella nuova pagina `/admin/analisi`; la dashboard resta focalizzata sul riepilogo e sulle caselle che richiedono attenzione.
- Il riepilogo esclude le vendite annullate.
- Archivio articoli con paginazione server-side da 100 righe per pagina; vendite, assegnazioni e annullamenti vengono caricati per gli articoli della pagina visualizzata. I record eliminati logicamente non vengono mostrati nell'archivio.

## Logistica e sicurezza
- Nuova migrazione `supabase/migrations/20261017103000_fix_assignment_logistics_and_client_visibility.sql` e pulizia `supabase/migrations/20261017110000_remove_cancelled_120_photo_gallery.sql` per dismettere la RPC della vista aggiuntiva annullata.
- La migrazione formalizza gli stati assegnazione `ATTIVA`, `IN_ARRIVO`, `IN_STOCK`, `IN_BOX`, `SPEDITO` e `ANNULLATA`.
- La registrazione dell'arrivo porta da IN ARRIVO a IN STOCK solo le assegnazioni esplicitamente in arrivo; non modifica assegnazioni IN BOX o SPEDITO e non forza lo stato ATTIVA.
- La policy di lettura degli articoli per l'utente è limitata alle assegnazioni della propria casella, attive/non annullate e con quantità positiva; vengono esclusi gli articoli eliminati logicamente.
- Notifiche push con messaggi corretti e controllo che gli articoli assegnati risultino effettivamente arrivati prima di inviare la notifica che la casella è pronta.

## Verifiche e limiti
- È stato eseguito il controllo di sintassi TypeScript/TSX per i file modificati.
- Non è stato possibile completare `npm install` nell'ambiente di lavoro; quindi non dichiaro superata una build Next.js completa né il controllo dei tipi con le dipendenze installate.
- La migrazione Supabase è inclusa nel pacchetto ma NON è stata applicata al database live. Applicarla durante il rilascio, dopo backup/verifica dello schema.
- Nessun deploy Vercel è stato eseguito da questo aggiornamento.
