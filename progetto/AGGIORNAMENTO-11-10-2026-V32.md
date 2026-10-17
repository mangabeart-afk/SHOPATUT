# ShopATUT v32 — 11/10/2026

## UI Cliente → Articoli
- Rimosse le didascalie descrittive sotto i titoli IN BOX, IN STOCK, IN ARRIVO e SPEDITO.
- Rafforzata la separazione visiva tra sezioni con bordo superiore, margine e linea sotto il titolo.
- Nascosta la visualizzazione delle note all'interno delle schede articoli cliente; i dati note non vengono cancellati dal database.

## Verifica contabile iniziale
- Per la casella 2608VLR il calcolo basato sui movimenti VENDITA e sui pagamenti restituisce saldo €24, in linea con dashboard.
- Il residuo delle singole vendite (somma dei movimenti di vendita meno importi allocati direttamente) risulta €66. La differenza è €42: ci sono €42 di pagamenti non allocati ai movimenti di vendita, quindi il saldo di €66 nella scheda articoli è una metrica per singole vendite non ancora allocate e non coincide con il saldo contabile complessivo.
- Altre caselle mostrano lo stesso tipo di differenza tra residuo dei movimenti non allocati e saldo dashboard; occorre riconciliare allocazioni pagamenti prima di cambiare saldi contabili.

## Lavori non eseguiti in questa versione
- Non sono stati creati movimenti vendita o assegnazioni mancanti automaticamente: l'abbinamento fra descrizioni Excel e righe di archivio deve essere univoco per non duplicare vendite/quantità.
- Non sono stati cambiati prezzi o stati live sulla base di corrispondenze fuzzy. Il workbook ha righe con l'importo cliente in colonna E e stato in H; l'allineamento richiede abbinamento per cliente, descrizione, quantità e articolo.
