# ShopATUT v35 — Area cliente e stato assegnazioni

Base: SHOPATUT-v34-correzione-stati-caselle.zip.

## Modifiche
- Area cliente: il contatore IN STOCK considera esclusivamente assegnazioni `IN_STOCK`.
- Area cliente: il contatore IN ARRIVO considera esclusivamente assegnazioni `IN_ARRIVO`.
- Pagina Articoli: non deduce più lo stato logistico dallo stato dell'articolo in archivio; assegnazioni con stato interno `ATTIVA` mostrano `DA VERIFICARE`.
- Dashboard: codice cliente e saldo sono visibili insieme; aggiunti collegamenti diretti affiancati a “I miei articoli” e “Pagamenti”.
- Galleria: anteprime con ritaglio centrale proporzionale; l'immagine nel modal resta originale.

## Verifiche
- Controllo statico delle modifiche effettuato.
- Build Next.js non eseguita in questo ambiente: le dipendenze npm non sono installate.
- Nessuna modifica o pubblicazione effettuata su Vercel/Supabase in questa fase.

## Da verificare prima del deploy
- Eseguire `npm install` e `npm run build`.
- Verificare su dispositivo mobile dashboard, galleria e stati assegnazione.
- Verificare con utenti cliente/admin autorizzazioni RLS e query esistenti.
