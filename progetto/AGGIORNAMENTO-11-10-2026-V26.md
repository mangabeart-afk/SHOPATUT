# ShopATUT — Aggiornamento 11/10/2026 — V26

## Scheda amministrativa Cliente → Articoli

- Il pannello e ogni lista/scheda articolo sono esplicitamente dimensionati al 100% della larghezza disponibile, senza i limiti ereditati di `.movement > div:last-child`.
- Le schede senza checkbox non riservano una colonna vuota a sinistra. Le schede selezionabili mantengono la colonna checkbox.
- PROVENIENZA è stata spostata direttamente sotto STATO. La riga successiva contiene soltanto SERIE.
- È stata rimossa la linea divisoria interna sopra PAGATO/RESIDUO; la linea divisoria separa ora le schede articolo.
- I campi lunghi e le note restano su una riga con troncamento.

## Verifiche

- Controllo sintattico TypeScript/TSX e parsing CSS eseguiti sul sorgente aggiornato.
- Build Next.js completa non eseguita: l'installazione delle dipendenze non è terminata nei tempi disponibili.
- Nessuna modifica a Supabase, GitHub o Vercel.
