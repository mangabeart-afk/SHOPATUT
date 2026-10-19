## Aggiornamento v97 (19/10/2026)

- Scorporata la copia personale RAF da `A26/0509` (X!14): 4 copie restano nel lotto in arrivo per le caselle clienti e 1 copia diventa l'articolo autonomo `A26/1161`, `IN_STOCK`, senza assegnazione cliente né vendita.
- Il valore totale dell'acquisto resta invariato: 5 copie × 40 € = 200 €. Lo scorporo mantiene 160 € su `A26/0509` e 40 € su `A26/1161`.
- Completata l'assegnazione `2604PCL` all'OP 111 VIET, collegando il movimento già pagato da 50 € senza duplicare il pagamento.
- Eliminato il doppio conteggio legacy della vendita da 50 € ora rappresentata dal movimento collegato.
- Inclusa la correzione per registrare l'arrivo di articoli già `VENDUTO` senza data e preservare gli stati logistici delle assegnazioni.

**Nota:** la migrazione non è stata applicata al Supabase live e il progetto non è stato pubblicato su Vercel. Applicare la migrazione SQL solo dopo aver verificato backup e staging.
