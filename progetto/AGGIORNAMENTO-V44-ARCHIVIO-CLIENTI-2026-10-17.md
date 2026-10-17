# ShopATUT v44 — archivio articoli e contatori cliente

## Modifiche
- Dashboard amministratore: mantiene i clienti raggruppati per situazione (saldo da pagare, saldo zero con articoli in arrivo, pronti da spedire) e i sei KPI nell'ordine concordato.
- Gestione clienti: aggiunti i contatori IN BOX, IN STOCK e IN ARRIVO. La funzione di riepilogo calcola i tre contatori dallo stato logistico dell'assegnazione alla casella, non dallo stato globale dell'articolo.
- Archivio articoli: su mobile ogni articolo usa due righe. Riga 1: checkbox, codice cliccabile, serie e stato allineato a destra. Riga 2: descrizione a sinistra e Q/S allineati a destra.
- Rimossa la colonna/lente foto dalla lista; il codice apre un popup dettagli con immagine originale, serie, descrizione, prezzo d'acquisto in valuta, cambio, costi accessori e accessori dogana/spedizione/commissioni, costo finale, prezzo unitario quando l'articolo ha almeno due copie, vendite per cliente, ricavo e margine quando venduto.
- Popup con layout mobile a pannello, scorrimento interno e chiusura accessibile.

## Verifica
- Da eseguire `npm run build` con dipendenze installate prima del deploy. Nessuna modifica a Supabase live e nessun deploy Vercel effettuato in questa versione.
