# ShopATUT / MangaBEART — V61 cache IndexedDB amministrativa

Data: 18/10/2026  
Base: pacchetto v60 ottimizzazione caricamenti.  
Scopo: cache locale selettiva per rendere più rapido l'avvio dell'area amministrativa, senza cache HTTP di pagine private e senza modifiche a Supabase o Vercel.

## Funzionalità implementate

- Nuovo endpoint `GET /api/admin/cache`, accessibile solo dopo `auth.getUser()` e verifica server-side del ruolo `AMMINISTRATORE`.
- Indice IndexedDB per singolo ID utente con directory minima (codice, nome) e indice articoli (codice, serie, dettaglio, stato, quantità e soli codici fornitore riconosciuti nelle note come `asxn...`/`gwvs...`). Non vengono scaricati o memorizzati nell'indice locale email, telefoni, indirizzi, pagamenti, note libere degli articoli, crediti o saldi per singolo utente.
- Prima sincronizzazione completa; sincronizzazioni incrementali basate su `updated_at`, con riallineamento completo almeno ogni 12 ore per recuperare cancellazioni/righe non più presenti.
- Indicatore visivo dell'archivio locale con stato sincronizzazione, orario e possibilità di ritentare in caso di errore. Aggiornamento all'avvio, al focus/ritorno in primo piano, dopo submit di form amministrativi e ogni 2 minuti mentre la pagina è visibile.
- `CustomerAutocomplete` usa l'indice locale come fallback quando la lista server è assente. Le azioni restano sempre validate dalle pagine/server action e dal database; il contenuto cache non autorizza alcuna scrittura.
- Cache per-user e cancellazione locale al logout / sessione assente, oltre alla separazione delle voci per ID utente.
- Cache separata del riepilogo aggregato della dashboard (sei KPI, nessun dato individuale) scritta dopo il rendering dei dati freschi. Il loading della dashboard mostra l'ultimo riepilogo locale mentre attende la query nuova, solo dopo controllo del ruolo corrente.

## Scelte di sicurezza

- Nessuna pagina HTML autenticata, API o risposta finanziaria viene aggiunta alla cache del service worker.
- L'API di sincronizzazione è `private, no-store`; i permessi vengono verificati lato server ogni richiesta.
- Il riepilogo offline contiene soltanto KPI aggregati. Directory e indice articoli sono confinati al browser dell'amministratore e cancellati al logout. I dati dell'indice sono suggerimenti di ricerca, non fonte autorevole per operazioni contabili.
- In caso di errore di rete, l'indice esistente rimane disponibile come fallback e l'interfaccia indica chiaramente che potrebbe non essere aggiornato.

## Verifiche eseguite

- Parsing TypeScript/TSX dei 10 file nuovi/modificati: superato, zero errori di parsing usando il transpiler TypeScript disponibile.
- Parsing dei sorgenti TypeScript/TSX: 91 file analizzati (file di dichiarazione `.d.ts` escluso), zero errori di parsing e zero errori del transpiler.
- `node --check public/sw.js`: superato.
- Integrità ZIP finale: verificata dopo la creazione del pacchetto.
- Build Next.js: tentata con `npm run build`, bloccata da `next: not found` perché non è presente `node_modules`. Il controllo `tsc --noEmit` non è attendibile in assenza delle dipendenze e dei tipi (`next`, React, Supabase, `web-push`, JSX).
- Non è stato eseguito alcun deploy. Nessuna query di scrittura è stata eseguita su Supabase.

## Limiti noti / prossimi controlli

- La sincronizzazione incrementale si basa sui campi `updated_at` delle tabelle `customers` e `articles`; per cancellazioni definitive l'allineamento completo periodico rimuove le righe non restituite.
- La cache indice non sostituisce ancora il rendering completo di tutte le pagine amministrative con view-model offline. Gli articoli/utenti mostrati dalle pagine restano caricati dal server; il loading cache è applicato al riepilogo KPI dashboard e l'indice locale serve come fallback dei campi di ricerca.
- Prima del rilascio è necessario eseguire `npm install` e `npm run build` in un ambiente con accesso alle dipendenze, quindi provare login admin, cache al secondo accesso, aggiornamento dopo modifica, logout e cambio account.
