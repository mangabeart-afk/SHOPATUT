# ShopATUT v42 — Dashboard amministratore responsive

## Modifiche effettive
- Dashboard amministratore riorganizzata con sei KPI in una griglia unica 3 colonne × 2 righe: ARTICOLI IN ARRIVO, QT ACQUISTATA, VALORE ACQUISTI, QT VENDUTA, VALORE VENDITE e MARGINE LORDO.
- Rimossi dalla vista i KPI CLIENTI, SALDO e MEDIA.
- Rimossi i raggruppamenti separati che producevano una sezione logistica con una sola scheda e rendevano la gerarchia visiva incoerente.
- Stile crema/bordeaux/sabbia, schede con bordo superiore bordeaux, valori ben leggibili e griglia responsive che resta 3 colonne anche su smartphone; su schermi molto stretti riduce spazi e caratteri.
- Le tre liste “Clienti con saldo da pagare”, “Saldo zero con articoli in arrivo” e “Articoli pronti da spedire” restano sotto il riepilogo.
- La dashboard non mostra gli ultimi movimenti; la pagina Analisi rimane separata in `/admin/analisi`.

## Verifiche
Build da eseguire con `npm run build` nell'ambiente con dipendenze installate. Nessun deploy Vercel eseguito.
