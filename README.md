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
