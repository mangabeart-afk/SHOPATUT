# MangaBEART v46 — correzione build archivio articoli

Data: 17 ottobre 2026

## Errore corretto

Vercel segnalava in `app/admin/articoli/archivio/ArchiveArticleActions.tsx` l'uso di `setEditingArticle`, identificatore non dichiarato, nel pulsante **Modifica articolo** del popup dettagli.

Il pulsante ora seleziona l'articolo del popup attraverso lo stato già esistente `selectedIds` e apre il modal di modifica. Il form esistente ricava quindi `editingArticle` dalla selezione e carica i dati dell'articolo selezionato. Non è stato aggiunto uno stato duplicato e non sono cambiati gli handler server di aggiornamento.

## Verifiche

- Ricerca nel sorgente: nessun riferimento residuo a `setEditingArticle` nei componenti `app` e `components`.
- Verificato il nuovo handler nel popup.
- Archivio ZIP creato e testato con `zip -T`.
- La build completa Next.js/TypeScript non è stata eseguita perché `npm install` è scaduto nel tempo disponibile; la correzione è mirata al nome non definito riportato nel log Vercel, ma il successo della build deve essere confermato da Vercel.

## Rilascio

Nessun deploy Vercel o aggiornamento del branch GitHub effettuato. Supabase non è stato modificato.
