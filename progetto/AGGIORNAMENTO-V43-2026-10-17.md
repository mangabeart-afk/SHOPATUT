# ShopATUT v43 — ordine indicatori e correzione build

Data: 17 ottobre 2026

## Modifiche

- Dashboard amministratore: griglia KPI ordinata precisamente come richiesto.
  - Riga 1: QT ACQUISTATA | VALORE ACQUISTI | ARTICOLI IN ARRIVO
  - Riga 2: QT VENDUTA | VALORE VENDITE | MARGINE LORDO
- `components/navigation.tsx`: eliminato il confronto TypeScript impossibile tra ruolo già ristretto ad `AMMINISTRATORE` e `CLIENTE` dentro il menu mobile amministratore. L'etichetta mostra esplicitamente `AMMINISTRATORE`.

## Verifiche

La modifica alla dashboard conserva la griglia responsive a 3 colonne già presente nei CSS. La correzione al ruolo risolve l'errore di tipo riportato dal log Vercel in `components/navigation.tsx:199`.

Non è stato effettuato un deploy Vercel. La build completa deve essere rieseguita dopo il caricamento di questo pacchetto nel repository collegato.
