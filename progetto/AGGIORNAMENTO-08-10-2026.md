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

## Correzioni archivio — 08/10/2026

- Archivio articoli: filtri per mese/anno di acquisto e data di arrivo.
- Archivio articoli: ordinamento per mese/anno, serie, tipo e stato.
- La data inserita in REGISTRA ARRIVO viene ora persistita in `articles.arrival_date`.
- Popup Archivio: overlay vincolato alla viewport con contenuto scrollabile entro l'altezza disponibile.
- Popup clienti acquirenti: il totale viene ricavato dai movimenti di vendita; se `total_amount_eur` è nullo/zero viene ricostruito da quantità × prezzo unitario e viene gestito anche il caso in cui il movimento non abbia `mailbox_id` ma riporti il codice cliente.
- Note degli articoli migrati: nella prossima importazione Excel devono contenere esclusivamente il riferimento `scheda-riga` per X/Y oppure il solo codice articolo per Z. Nessun testo descrittivo aggiuntivo.


## Dashboard Amministratore — Riepilogo aggiornato

La sezione **Riepilogo** della Dashboard Amministratore ora mostra 9 KPI in una griglia di 3 elementi per riga, mantenuta anche su mobile:

- **Riga 1:** CLIENTI = numero clienti; SALDO = somma dei saldi dovuti non ancora incassati; IN ARRIVO = quantità di articoli ancora in arrivo.
- **Riga 2:** QT ACQ = quantità totale acquistata, comprese le quantità già vendute; VALORE = valore complessivo lordo di acquisto di tutti gli articoli; MEDIA = VALORE / QT ACQ.
- **Riga 3:** QT VND = quantità totale venduta; VALORE = valore complessivo delle vendite; MARGINE = valore complessivo delle vendite meno il costo di acquisto lordo delle quantità vendute.

Per le vendite con `total_amount_eur` mancante o pari a zero, il valore vendita viene ricostruito come quantità × `unit_price_eur`, evitando KPI falsati a zero quando il prezzo unitario è disponibile.

## Dashboard Amministratore — Riepilogo
- Le 9 metriche del riepilogo mostrano esclusivamente **titolo + valore**, senza descrizioni aggiuntive.
- La disposizione resta a 3 elementi per riga su mobile.
- Corretto inoltre l'ordine di calcolo di `saldoDovuto` affinché il riepilogo non acceda a `customerRows` prima della sua inizializzazione.
## Pulizia dati di prova

Sono stati rimossi definitivamente dal database i clienti 2609DLL, 2608TST, 2609TGL, 2609NGR e 2609LPN e gli articoli A26/0001-A26/0018, insieme alle relative dipendenze applicative.


## Gestione modifica email cliente — 08/10/2026

- Quando l'amministratore modifica l'email di un cliente, SHOPATUT non modifica più semplicemente l'email dell'account Auth esistente.
- Viene creato un nuovo account Auth con la nuova email e una password temporanea sconosciuta al cliente.
- La nuova email viene auto-confermata tecnicamente e viene inviata una mail Supabase di recupero password per consentire al cliente di scegliere la nuova password.
- Il nuovo account viene collegato al cliente e alla casella esistente.
- L'eventuale vecchio account viene scollegato dal profilo cliente e bloccato, senza cancellarlo, per preservare i riferimenti storici di movimenti e pagamenti.
- Se il cliente non aveva ancora un account di accesso, la modifica/inserimento dell'email crea direttamente il nuovo account.
- Il trigger `handle_new_user` ignora gli account creati dal flusso amministrativo tramite il flag `admin_invite`, evitando la creazione accidentale di un secondo cliente/casella.
