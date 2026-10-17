# ShopATUT v40 — Dashboard admin e menu Altro mobile

## Dashboard amministratore
- Rimossi gli indicatori **CLIENTI**, **SALDO DA INCASSARE** e **MEDIA PER COPIA** dal riepilogo gestionale.
- Rimossa la variabile di calcolo della media per copia e il calcolo del saldo complessivo che servivano esclusivamente a quelle card.
- Mantenuti gli indicatori logistici e di acquisti/vendite ancora richiesti.
- Nessuna modifica ai dati, ai movimenti o ai calcoli contabili sottostanti agli indicatori rimanenti.

## Dashboard area utente
- Rimossa completamente la sezione **Ultimi movimenti** dalla dashboard.
- Eliminata anche la query dedicata agli ultimi cinque movimenti per evitare lavoro di rete non più necessario.
- Restano saldo e codice cliente, azioni principali, contatori logistici, profilo e galleria dei 12 articoli con foto.

## Navigazione mobile utente
- Il pulsante **Altro** apre ora un piccolo menu a tendina sopra la barra inferiore.
- Il menu mostra solo le aree non presenti nella barra principale: **Crediti**, **Spedizioni**, **Movimenti**.
- Il menu laterale/overlay resta disponibile per l'amministratore e non viene aperto dal pulsante Altro dell'utente.
- Il menu si chiude selezionando una voce, toccando fuori o cambiando pagina.

## Verifica
- ZIP costruito a partire dal progetto v39.
- Verifica di sintassi TS/TSX e build completa da eseguire con le dipendenze del progetto prima del deploy.
- Nessun deploy Vercel eseguito.
