# ShopATUT v38 — aggiornamento grafico e logistico

## Modifiche visibili
- Marchio uniforme ShopATUT su titolo browser, login/registrazione/recupero password, navigazione, testo PWA e manifest; service worker aggiornato a una nuova versione cache.
- Dashboard utente riordinata in base all'uso mobile a una mano: codice cliente e saldo per primi, pulsanti Articoli/Pagamenti affiancati, tre contatori logistici, dettagli profilo collassabili e galleria a seguire.
- Contatori utente limitati a IN ARRIVO, IN STOCK e IN BOX; SPEDITO resta consultabile nella lista Articoli, non è un contatore principale.
- Dashboard amministratore organizzata in tre righe esplicite di indicatori: clienti/logistica, acquisti, vendite/margine. L'analisi è rimossa dalla pagina Dashboard e rimane nella voce dedicata del menu.
- Analisi per provenienza include anche ALTRO/non classificato, oltre a Giappone, Vietnam ed Europa.
- Archivio su smartphone: tabella con scorrimento orizzontale esplicito per leggere tutte le colonne; date nel formato GG/MM/AA e prezzo unitario nascosto quando è presente una sola riga visibile.
- Restano attive le regole già presenti per galleria 12 foto, ritaglio centrale proporzionale (object-fit: cover), apertura dell'originale senza modificarlo, elenco Articoli per stato logistico dell'assegnazione e paginazione archivio da 100 righe.

## Correzioni logistiche
- La notifica di arrivo è inviata solo alle caselle con assegnazione effettivamente in IN_STOCK dopo la registrazione dell'arrivo.
- L'avviso "pronta per la spedizione" valuta gli stati di assegnazione della casella (IN_STOCK/IN_BOX); ATTIVA e IN_ARRIVO impediscono l'avviso. Non deduce la disponibilità dalla sola condizione globale dell'articolo in archivio.
- Il passaggio amministrativo da IN_ARRIVO a IN_STOCK passa dalla funzione centrale di registrazione arrivo e richiama la notifica alle caselle coinvolte.
- La funzione SQL di registrazione arrivo comprende sia le quantità vendute storicamente importate (`legacy_quantity_sold`) sia le vendite non annullate in `movements`, evitando di ripristinare come IN_STOCK un articolo con residuo pari a zero.
- Nessuna modifica a crediti, pagamenti o movimenti finanziari viene eseguita da queste modifiche di codice.

## Pubblicazione e verifica
- Le modifiche sono nel sorgente e nelle migrazioni incluse nello ZIP.
- Le migrazioni non vengono eseguite automaticamente sul Supabase live e non viene effettuato alcun deploy su Vercel.
- Eseguire l'installazione delle dipendenze e `npm run build` prima di pubblicare; verificare le schermate utente/amministratore e il flusso di registrazione arrivi in staging.


## Stato migrazione Supabase (17/10/2026)
- Applicata al progetto live la policy RLS che mostra agli utenti soltanto articoli assegnati alla propria casella con quantità positiva e stato logistico esplicito.
- Aggiornata la funzione `register_article_arrival(uuid[], date)`: processa soltanto articoli in `IN_ARRIVO`, aggiorna le assegnazioni ancora in `IN_ARRIVO`, mantiene `IN_BOX`/`SPEDITO` e evita il doppio conteggio tra vendite legacy e movimenti.
- Le due migrazioni SQL di arrivo sono allineate alla stessa implementazione; la migrazione che elimina la galleria da 120 articoli è un no-op sul live perché la funzione non esiste già.
- Non sono stati modificati dati di clienti, assegnazioni, pagamenti o movimenti durante l'applicazione della migrazione.
