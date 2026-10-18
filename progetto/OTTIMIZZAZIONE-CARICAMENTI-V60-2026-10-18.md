# ShopATUT / MangaBEART — V60 ottimizzazione caricamenti

Data: 18/10/2026
Base: pacchetto v59 con riepilogo riconciliato.

## Interventi applicati

- Dashboard amministrativa e riepilogo utenti: le query di vendita recuperano solo i movimenti `VENDITA`; le cancellazioni sono lette tramite il solo `reference_id`. Il riepilogo utenti carica solo le assegnazioni negli stati necessari ai contatori (`IN_ARRIVO`, `IN_STOCK`, `IN_BOX`).
- Analisi amministrativa: la query delle vendite filtra sul database prima di trasferire i risultati.
- Area utente — Articoli: i prezzi di vendita vengono recuperati solo per gli articoli assegnati alla casella corrente, invece che per tutto lo storico delle vendite della casella.
- Area utente — Pagamenti: il saldo usa la RPC `customer_dashboard_summary`, già impiegata nella dashboard, evitando di scaricare e sommare sul server tutti i movimenti. Storico pagamenti paginato a 100 righe.
- Area utente — Movimenti: storico paginato a 100 righe, con ordinamento stabile per data e ID.
- Admin — Movimenti: filtri per data, tipo, ricerca e casella eseguiti lato database; paginazione server-side a 100 righe invece del limite fisso di 500 risultati filtrati in memoria.
- Admin — Pagamenti: 100 righe per caricamento ordinario; la ricerca completa continua a consultare tutte le pagine di pagamento solo quando l'utente avvia una ricerca, mantenendo la ricerca anche su nome, codice utente, riferimenti e note.
- Creazione pagamenti/crediti: il codice utente viene risolto con query mirate su `customers` e `mailboxes`, evitando di trasferire l'elenco completo delle caselle per ogni registrazione.
- Navigazione e prompt PWA: per mostrare l'etichetta utente e preparare il prompt notifiche viene letto il `session` locale anziché chiamare `getUser()`; l'autorizzazione effettiva delle pagine e delle azioni server continua a usare le verifiche server-side esistenti.
- Service worker: cache locale per risorse statiche non personali (`/_next/static`, icone, logo e font). Aggiunta una pagina offline statica come fallback; non viene più usata la home dinamica come app shell, evitando il rischio di conservare HTML potenzialmente personale. Pagine autenticate, API e dati dinamici non vengono messi in cache.

## Verifiche eseguite

- Parsing TypeScript/TSX: 87 file analizzati, zero errori di sintassi.
- `node --check public/sw.js`: superato.
- Controllo integrità ZIP: verrà effettuato sul pacchetto finale.
- Build Next.js e type-check completo: non verificabili in questo ambiente, perché `npm install --ignore-scripts --no-audit --no-fund` è andato in timeout e le dipendenze Next/React non sono presenti. L'esecuzione locale di `tsc` senza le dipendenze ha quindi prodotto errori di moduli mancanti/JSX non risolvibili, non un esito attendibile del type-check del progetto.
- Nessuna modifica al database Supabase e nessuna pubblicazione su Vercel.

## Fuori perimetro di questa passata

Non è stata introdotta una cache IndexedDB dei dati amministrativi (saldi, note, pagamenti, utenti). La cache contiene solo risorse statiche non personali; per i dati gestionali, una modalità stale-while-refresh va implementata con invalidazione a ogni modifica e cancellazione al logout, così da non mostrare dati finanziari personali non aggiornati.
