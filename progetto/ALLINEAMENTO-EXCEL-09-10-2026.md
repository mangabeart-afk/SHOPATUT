# Allineamento Excel → Supabase — 09/10/2026

## Dati verificati dopo l'allineamento

- Pagamenti: 422 righe `RICEVUTO`, tutte abbinate a un movimento `PAGAMENTO` tramite codice, casella e importo; totale € 25.795,31. Nessun pagamento duplicato è stato inserito.
- Assegnazioni correnti: 546 righe `ATTIVA`, 31 righe `IN_BOX`; 7 associazioni sono state conservate nello storico come `ANNULLATA` quando l'abbinamento Excel indicava un'altra casella/articolo.
- Spedizioni storiche: 18 record logici `SPEDITA`, 81 righe articolo spedito, 167 unità. Le righe hanno `shipped_at` e tracking non valorizzati quando Excel non li riportava; non sono state inventate date o tracking.
- Verifica quantità: nessun articolo attivo ha la somma delle assegnazioni `ATTIVA` + `IN_BOX` superiore alla quantità acquistata.

## Regole usate

- La cella gialla con `STOCK` nel foglio cliente viene rappresentata con `article_assignments.status = 'IN_BOX'`.
- Le righe cliente `SPEDITO` sono registrate come `shipment_items` collegati a una spedizione storica `SPEDITA` della casella.
- I pagamenti già contabilizzati sono stati lasciati intatti se esisteva già il movimento corrispondente.
- Gli abbinamenti con più articoli candidati o descrizioni non sufficientemente precise non sono stati forzati. Un foglio cliente contiene molte descrizioni composite, riferimenti ripetuti e righe `CLAIM`/buste senza un articolo di archivio univoco: questi casi richiedono verifica separata.

## Migrazione schema

`supabase/migrations/20261009120000_allow_in_box_assignment_status.sql` mantiene nel progetto la modifica allo schema applicata al database: lo stato `IN_BOX` è consentito insieme a `ATTIVA` e `ANNULLATA`.

> Il presente report descrive l'allineamento del database di produzione. Non reinserisce i dati di migrazione quando la migration viene eseguita su un altro ambiente.
