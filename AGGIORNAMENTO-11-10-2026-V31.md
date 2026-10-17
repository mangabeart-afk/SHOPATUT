# ShopATUT v31 — Galleria articoli cliente

- Nella dashboard cliente, sotto la galleria "ULTIMI ARTICOLI INSERITI", aggiunto il collegamento "Vedi altro…" in basso a destra.
- Aggiunta la pagina `/dashboard/ultimi-articoli`, accessibile agli utenti autenticati non amministratori.
- La nuova pagina mostra gli ultimi 120 articoli non eliminati con foto, ordinati dal più recente, senza filtro per stato o assegnazione al cliente.
- Gli articoli sono suddivisi in pagine da 12, con griglia a 3 colonne e navigazione numerata, precedente/successiva.
- Aggiunta la migrazione Supabase `20261011161500_customer_dashboard_recent_photo_articles_120.sql`, che definisce una funzione RPC autenticata per leggere gli ultimi 120 articoli con foto.

- Nel riepilogo della dashboard amministratore, ridotta l'altezza delle schede, eliminata l'altezza minima e ridotto lo spazio tra etichetta e valore e il padding inferiore, per mostrare schede più compatte.
- La nuova pagina dedicata mantiene la griglia da 3 colonne anche su schermi ampi e mobili.

Nota: la migrazione SQL deve essere applicata al progetto Supabase prima che la nuova pagina possa recuperare i 120 articoli in produzione. Non è stata eseguita alcuna pubblicazione su GitHub o Vercel.
