# SHOPATÜT — aggiornamento 08/10/2026

## Correzioni incluse

- Stato archivio articoli:
  - `IN_ARRIVO` resta `IN ARRIVO` fino alla registrazione dell'arrivo.
  - `IN_STOCK` resta `IN STOCK` finché esiste quantità residua.
  - `SOLD` viene mostrato solo quando l'articolo non è più `IN_ARRIVO` e la quantità residua è 0.
- Nuovo stato di gestione assegnazione cliente: `IN_BOX`.
- Scheda cliente → Articoli:
  - visualizza stato articolo (`IN ARRIVO` / `IN STOCK`);
  - `IN BOX` è lo stato della singola assegnazione cliente, non dell'Archivio;
  - gli articoli spediti vengono mostrati in una sezione separata `Articoli spediti`;
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
- Incluse le migration Supabase:
  - `supabase/migrations/20261008193000_fix_article_status_and_in_box.sql`
  - `supabase/migrations/20261008220000_fix_customer_article_states.sql`

## Variabili ambiente

Non vengono inclusi segreti nel progetto.
Configurare su Vercel Production:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

La coppia Public/Private deve provenire dalla stessa generazione VAPID.

Correzione aggiuntiva 08/10/2026 (REGISTRA ARRIVO):
- Il pulsante REGISTRA ARRIVO nell'Archivio ora dipende dallo stato reale IN_ARRIVO e non dalla quantità residua.
- Un articolo può essere stato già tutto venduto/assegnato mentre è ancora IN_ARRIVO: in questo caso S=0 non impedisce più la registrazione dell'arrivo.


## Regole definitive Excel → stati applicativi

### Archivio
- `IN ARRIVO` + quantità residua >= 0 → `IN ARRIVO`.
- `IN STOCK` + quantità residua > 0 → `IN STOCK`.
- `IN STOCK` + quantità residua = 0 → `SOLD`.
- La quantità residua da sola non può trasformare un articolo `IN ARRIVO` in `SOLD`.

### Casella cliente
- `IN ARRIVO` → articolo assegnato al cliente ma non ancora arrivato.
- `IN STOCK` → articolo arrivato e disponibile nella casella.
- `IN BOX` → in Excel è rappresentato da una cella `IN STOCK` evidenziata in giallo; nel database corrisponde a `article_assignments.status = IN_BOX`.
- `SPEDITO` → deriva dalla registrazione della spedizione e viene mostrato nella sezione dedicata agli articoli spediti.
