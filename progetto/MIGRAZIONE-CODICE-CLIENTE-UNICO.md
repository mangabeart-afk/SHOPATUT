# Identificativo cliente unico

## Regola applicativa

`public.customers.customer_code` è l'unico codice visibile, ricercabile e modificabile per identificare un cliente.

La tabella `public.mailboxes` resta una relazione tecnica: `mailboxes.id` e `mailboxes.customer_id` continuano a collegare profili, articoli assegnati, pagamenti, crediti, spedizioni e movimenti. Non viene più generato né usato un secondo codice testuale per la casella.

## Migrazione Supabase

La migrazione coordinata è:

`supabase/migrations/20261004190000_remove_mailbox_code_use_customer_code.sql`

La migrazione:

- conserva i riferimenti UUID alle caselle e le relative chiavi esterne;
- riallinea i riferimenti storici al codice cliente canonico dove il valore storico era il vecchio codice duplicato;
- aggiorna le funzioni RPC di creazione cliente, registrazione vendite, modifica codice e audit;
- garantisce che `customers.customer_code` non sia nullo;
- elimina il trigger e le funzioni di generazione/modifica del codice duplicato;
- rimuove la colonna `mailboxes.mailbox_code`.

Le vecchie migrazioni SQL non sono state riscritte: fanno parte della cronologia e servono a ricostruire gli aggiornamenti precedenti. La migrazione più recente porta lo schema finale al modello con un solo codice cliente.

## Rilascio

Questa versione applicativa e la migrazione devono essere rilasciate come un unico aggiornamento coordinato. **Non applicare la migrazione di produzione lasciando online il vecchio codice dell'applicazione**, perché la vecchia versione può ancora interrogare la colonna rimossa. Dopo il rilascio, verificare almeno ricerca cliente, creazione cliente, vendita, pagamento e spedizione.

La migrazione è inclusa nel pacchetto ma non è stata applicata al progetto Supabase di produzione da questo aggiornamento.
