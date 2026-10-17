# Aggiornamento 11/10/2026

## Scheda cliente → Articoli

Riorganizzata ogni scheda articolo in quattro righe con priorità per la consultazione da smartphone:

1. **CODICE | PREZZO | QTA | STATO**
2. **SERIE | PROVENIENZA**
3. **DESCRIZIONE**
4. **PAGATO | RESIDUO | MODIFICA**

Il prezzo visualizzato è il prezzo unitario del movimento di vendita; per le sole assegnazioni senza vendita collegata viene mostrato `—`, senza inventare un importo. Per gli articoli spediti il codice spedizione resta accanto allo stato. La modifica di un movimento o di un'assegnazione rimane disponibile nella quarta riga.


## v23 — Correzione larghezza scheda articolo su smartphone

- Corretto il vincolo CSS ereditato `.movement > div:last-child { max-width: 42% }`, che restringeva il contenuto di ogni scheda articolo al 42% circa.
- Le singole schede e il blocco dati ora occupano tutta la larghezza disponibile nel pannello; il controllo di selezione mantiene soltanto la propria colonna laterale.
- Codice, prezzo, quantità, stato e metadati non vanno a capo: i testi lunghi sono troncati con ellissi; le note restano su una sola riga.
- Nessuna modifica a Supabase, GitHub o Vercel.
