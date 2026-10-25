## Aggiornamento v101 — lettura dal workbook Excel (23/10/2026)

Questa copia introduce una modalità di consultazione **read-only** per le sezioni gestionali. I dati operativi mostrati nelle pagine provengono dall'ultimo snapshot `READY` in `public.excel_sync_runs` / `public.excel_sync_sheets`, con `capture_schema_version = 2`, e non vengono più ricavati dai vecchi record di articoli, movimenti e pagamenti.

- Dashboard amministratore: riepilogo numerico del foglio `W`.
- Archivio articoli: fogli `X`, `Y`, `Z`, `VIET`; consultazione immagini dai relativi URL presenti nel workbook.
- Area utente e schede amministrative: schede individuali, saldo e stati letti dal foglio con codice utente; il riempimento giallo `FFFFFF00` sullo stato `IN STOCK` viene interpretato come `IN BOX`.
- PREORDER: pagina di consultazione dedicata al layout orizzontale del foglio.
- Inserimento, modifica, cancellazione, registrazione di vendita/pagamento/spedizione e sincronizzazione foto dal sito sono disattivati nelle schermate modificate. La pagina `I miei dettagli` conserva la modifica dell'indirizzo di spedizione; le operazioni di autenticazione e le preferenze delle notifiche push non sono dati gestionali.
- `supabase/SECURITY-READONLY-TO-REVIEW.sql` è un piano di hardening da verificare e applicare separatamente. **Non è stato applicato al database live**.

### Configurazione necessaria

Oltre alle variabili già usate per autenticazione (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), il runtime server deve avere `SUPABASE_SERVICE_ROLE_KEY` configurata come variabile **server-only** in Vercel. Non aggiungere questa chiave al client, non anteporre `NEXT_PUBLIC_` e non inserirla nel repository o nell'archivio di consegna. È necessaria solo per la lettura protetta dello staging. Non condividere `.env`.

### Stato dei test e limiti noti

- Snapshot verificato: run `fb09bf6c-013f-440c-8de2-c7350551cc02`, 69 fogli, 2.437 righe, 4.627 formule e 5.277 celle con fill.
- Controllo statico di sintassi: 104 file `.ts/.tsx/.js/.jsx`, nessun errore di parsing.
- Controllo TypeScript mirato con dichiarazioni temporanee per le dipendenze: superato; **non sostituisce** il build Next.js.
- Il build completo `npm run build` non è stato verificato in questa sessione perché l'installazione delle dipendenze non è andata a buon fine nell'ambiente di lavoro.
- Le differenze individuate fra workbook e database sono coerenti con gli aggiornamenti recenti del file Excel. L’audit le riporta come scostamenti fra versioni: per il sito read-only prevalgono i dati dell’ultimo snapshot `READY` del workbook; non bisogna riportare Excel ai valori del DB precedente. La verifica tecnica ancora distinta è il collegamento identità profilo↔codice per eventuali schede senza profilo associato. Non sono stati modificati i record gestionali né pubblicata questa copia su Vercel.
- La sorgente è la copia locale del pacchetto v100 fornito per il lavoro; non è stata verificata la corrispondenza binaria con l'ultima versione attualmente pubblicata.

Per verificare questa copia su una macchina con accesso ai pacchetti: `npm install`, impostare le variabili server richieste, quindi eseguire `npm run build`. Prima di un rilascio applicare e verificare separatamente l'hardening SQL, controllare i casi di riconciliazione aperti e confrontare questa copia con il sorgente effettivamente pubblicato.

---

## Aggiornamento v97 (19/10/2026)

- Scorporata la copia personale RAF da `A26/0509` (X!14): 4 copie restano nel lotto in arrivo per le caselle clienti e 1 copia diventa l'articolo autonomo `A26/1161`, `IN_STOCK`, senza assegnazione cliente né vendita.
- Il valore totale dell'acquisto resta invariato: 5 copie × 40 € = 200 €. Lo scorporo mantiene 160 € su `A26/0509` e 40 € su `A26/1161`.
- Completata l'assegnazione `2604PCL` all'OP 111 VIET, collegando il movimento già pagato da 50 € senza duplicare il pagamento.
- Eliminato il doppio conteggio legacy della vendita da 50 € ora rappresentata dal movimento collegato.
- Inclusa la correzione per registrare l'arrivo di articoli già `VENDUTO` senza data e preservare gli stati logistici delle assegnazioni.

**Nota:** la migrazione non è stata applicata al Supabase live e il progetto non è stato pubblicato su Vercel. Applicare la migrazione SQL solo dopo aver verificato backup e staging.

## Aggiornamento v43 (17/10/2026)

- Dashboard amministratore: Riga 1 QT ACQUISTATA | VALORE ACQUISTI | ARTICOLI IN ARRIVO; Riga 2 QT VENDUTA | VALORE VENDITE | MARGINE LORDO.
- Corretta etichetta ruolo nella navigazione mobile per superare il controllo TypeScript in build.

# MangaBEART [ShopÄWAY] — V1

Next.js App Router + Supabase Auth/SSR + dashboard con dati reali e RLS.

## Env
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

## Avvio
npm install
npm run dev

## Auth
Il login usa Supabase Auth. La sessione viene mantenuta tramite `@supabase/ssr`; il middleware protegge `/dashboard`. Il ruolo viene letto da `public.profiles` e le query passano attraverso le policy RLS di Supabase.

## Notifiche push mobile

SHOPATUT usa Web Push per le notifiche cliente su Android e su iPhone/iPad quando l'app è installata come PWA.

Variabili server richieste:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (es. `mailto:admin@shopatut.it`)

Per generare una coppia VAPID:
`npx web-push generate-vapid-keys`

La chiave privata deve essere configurata esclusivamente nelle variabili server di Vercel/Supabase e non va inserita nel codice pubblico.

Su iPhone l'utente deve prima aggiungere SHOPATUT alla schermata Home; successivamente può concedere il permesso alle notifiche.


## Aggiornamento v39 (17/10/2026)

Le modifiche grafiche/logistiche di questa versione sono riepilogate in `AGGIORNAMENTO-V38-2026-10-17.md`. Per i passaggi logistici sono incluse le migrazioni `supabase/migrations/20261017103000_fix_assignment_logistics_and_client_visibility.sql` e `supabase/migrations/20261017120000_fix_arrival_and_push_logistics.sql`; applicarle in ordine solo dopo verifica su staging. La consegna non applica migrazioni al database live e non pubblica su Vercel.


Il fix v39 corregge il controllo TypeScript della transizione logistico-arrivi in `app/admin/articoli/actions.ts`: usa l'accesso opzionale a `currentArticle?.status`, eliminando l'errore TS18047 quando il risultato di `maybeSingle()` è nullo. Vedi `AGGIORNAMENTO-V39-2026-10-17.md`.

## Aggiornamento v47 (17/10/2026)

- Dashboard amministratore con tre raggruppamenti di caselle per situazione, totali e numero clienti interessati.
- Elenco clienti e relativi contatori caricati con paginazione Supabase completa e rendering dinamico.
- Archivio articoli compatto: riga 1 checkbox/codice/serie/stato; riga 2 descrizione/Q/S; il codice apre il popup con i dettagli completi.
- Consultare `AGGIORNAMENTO-V47-DASHBOARD-CLIENTI-ARCHIVIO-2026-10-17.md` per dettagli e stato verifiche.
