# SHOPATÜT — aggiornamento 08/10/2026

## Correzioni incluse

- Stato archivio articoli:
  - `IN_ARRIVO` resta `IN ARRIVO` fino alla registrazione dell'arrivo.
  - `IN_STOCK` resta `IN STOCK` finché esiste quantità residua.
  - `SOLD` viene mostrato solo quando l'articolo non è più `IN_ARRIVO` e la quantità residua è 0.
- Nuovo stato di gestione assegnazione cliente: `IN_BOX`.
- Scheda cliente → Articoli:
  - visualizza stato articolo (`IN ARRIVO` / `ARRIVATO`);
  - visualizza stato gestione (`DA GESTIRE`, `IN BOX`, `SPEDITO`);
  - checkbox per gli articoli arrivati e non spediti;
  - pulsante `IN BOX`, disabilitato senza selezione.
- Spedizioni:
  - gli articoli `IN BOX` sono disponibili per la spedizione;
  - anche un articolo globalmente `SOLD` può essere spedito se la quantità assegnata al cliente non è stata ancora spedita.
- Area cliente → Articoli:
  - gli articoli `IN BOX` restano visibili.
- Notifiche Push:
  - messaggio di errore distinto dal caso di permesso browser bloccato;
  - la readiness considera anche articoli globalmente `VENDUTO` ma già arrivati.
- Inclusa migration Supabase:
  `supabase/migrations/20261008193000_fix_article_status_and_in_box.sql`

## Variabili ambiente

Non vengono inclusi segreti nel progetto.
Configurare su Vercel Production:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

La coppia Public/Private deve provenire dalla stessa generazione VAPID.
