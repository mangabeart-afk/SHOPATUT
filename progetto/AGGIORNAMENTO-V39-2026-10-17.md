# ShopATUT v39 — correzione build TypeScript

Data: 17 ottobre 2026

## Errore corretto

Vercel interrompeva la build TypeScript in `app/admin/articoli/actions.ts` perché `currentArticle` può essere `null` e il codice accedeva direttamente a `currentArticle.status`.

La condizione è stata aggiornata a `currentArticle?.status === 'IN_ARRIVO' && payload.status === 'IN_STOCK'`. Il guard mantiene il comportamento previsto: la transizione viene riconosciuta solo quando è stato caricato un articolo e il suo stato attuale è `IN_ARRIVO`. Il controllo esistente per articolo mancante resta invariato.

## Verifica

- Verificata la presenza della correzione nel sorgente incluso nello ZIP.
- Integrità dell'archivio controllata dopo la creazione.
- La build completa `npm run build` non è stata eseguita qui: l'installazione delle dipendenze non è terminata entro il tempo disponibile. Dopo il commit su GitHub, verificare il nuovo log Vercel per intercettare eventuali altri errori di tipo.
- Nessuna pubblicazione o modifica a GitHub è stata eseguita da questa attività.
