# ShopATUT — Aggiornamento 11/10/2026 — V27

## Ottimizzazione caricamento pagine

- Aggiunta una variante WebP del logo, ridimensionata a 512×512: circa 137 KB invece dei 2,67 MB del PNG, con trasparenza conservata. Le pagine di accesso, recupero password, menu e installazione PWA usano la variante ottimizzata; il PNG originale è conservato come riferimento.
- Il menu cliente recupera profilo e dati cliente con una sola query relazionale, evitando una chiamata separata per nome e codice.
- I collegamenti del menu usano la navigazione client-side di Next.js con prefetch disattivato: si evitano i ricaricamenti completi del documento e le richieste anticipate a tutte le pagine del menu.
- La galleria dashboard carica in modo prioritario solo la prima immagine; le altre usano lazy loading.
- Nell'Archivio articoli i totali venduti per articolo/acquirente vengono aggregati in un'unica passata, invece di rifiltrare tutte le vendite per ogni articolo e cliente.

## Verifiche e limiti

- Controllo sintattico TypeScript/TSX completato sui file modificati.
- Verificata la presenza del logo WebP e la riduzione della dimensione del file.
- Build Next.js completa non eseguita: le dipendenze del progetto non sono installate nell'ambiente di lavoro; un tentativo precedente di installazione aveva superato il tempo disponibile.
- Questo aggiornamento del codice non applica migrazioni né modifiche al database Supabase, a GitHub o a Vercel.
