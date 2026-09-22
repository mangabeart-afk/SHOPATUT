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

## Email automatiche

Le notifiche email automatiche usano l'API Resend. Configurare in Vercel e nell'ambiente locale:

- `RESEND_API_KEY` = chiave API Resend
- `EMAIL_FROM` = mittente verificato, ad esempio `ShopaTüT <noreply@tuodominio.it>`
- `NEXT_PUBLIC_APP_URL` = URL pubblico dell'applicazione, ad esempio `https://tuodominio.it`

Eventi automatici: registrazione cliente, acquisto, pagamento, credito, spedizione e annullamenti. Le email di nuovi articoli vengono inviate ai clienti con email disponibile al massimo una volta ogni 4 giorni e contengono alcune anteprime fotografiche con invito ad accedere all'area personale.
