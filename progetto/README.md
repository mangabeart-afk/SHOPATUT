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
