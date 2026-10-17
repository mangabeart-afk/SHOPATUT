# ShopATUT — aggiornamento 09/10/2026

## Dashboard amministratore e vendite storiche

La dashboard `app/admin/page.tsx` considera **tutte le schede importate, compresa VIET, in tutti i totali generali**: quantità e valore acquistato, quantità venduta, disponibilità, ricavi, costo del venduto e margine. Le righe VIET mantengono il loro stato `IN_ARRIVO` finché non viene registrato l'arrivo; questo stato alimenta separatamente il contatore operativo degli articoli in arrivo. Le vendite storiche sono memorizzate in `articles.legacy_quantity_sold` e `articles.legacy_sales_revenue_eur`, distinte dai nuovi movimenti `VENDITA` inseriti dall'app, così da non sommare due volte la stessa vendita. Le cinque righe Z 4–8, non compilate, sono state escluse dai dati attivi con eliminazione logica (senza cancellazione definitiva) e non vengono più conteggiate.

## Totali verificati su Supabase

| Perimetro | Copie acquistate | Valore acquisti | Copie vendute | Valore vendite | Costo del venduto | Margine | Copie residue |
|---|---:|---:|---:|---:|---:|---:|---:|
| Archivio X/Y/Z | 2.614 | € 44.902,41 | 1.719 | € 32.326,40 | € 21.993,65 | € 10.332,75 | 895 |
| Foglio VIET | 41 | € 810,56 | 41 | € 1.084,00 | € 810,56 | € 273,44 | 0 |
| **Totale con VIET** | **2.655** | **€ 45.712,98** | **1.760** | **€ 33.410,40** | **€ 22.804,21** | **€ 10.606,18** | **895** |

Il totale è calcolato includendo VIET in ogni metrica di acquisto e vendita. Le 41 copie VIET sono già conteggiate come vendute nelle quantità storiche, quindi le copie rimanenti complessive dell'archivio X/Y/Z sono 895 e il residuo complessivo, VIET compreso, è 895. Le copie rimanenti sono il risultato di copie acquistate meno copie vendute; non coincidono necessariamente con lo stock fisicamente pronto, perché lo stato operativo `IN_ARRIVO` resta separato. Per le somme economiche il margine è ricavi meno costo del venduto, sulla somma dei valori non arrotondati. Il valore acquisti del totale è arrotondato dopo la somma dei valori non arrotondati; per questo può differire di € 0,01 dalla somma dei valori di ciascun foglio già arrotondati.

Per le righe importate sono presenti `import_sheet` e `import_row`; i costi unitari sono calcolati come totale della riga diviso quantità acquistata. Le cinque righe Z 4–8 erano prive di compilazione: sono state archiviate logicamente, conservate per tracciabilità e rimosse dai conteggi attivi, così il foglio Z totalizza 1.790 copie acquistate, 1.235 vendute e 555 rimanenti.

## Prerequisiti del database

La dashboard aggiornata richiede le colonne `articles.import_sheet`, `articles.legacy_quantity_sold` e `articles.legacy_sales_revenue_eur`, oltre ai campi di importazione già presenti. Questi campi e i valori storici sono già stati aggiunti al progetto Supabase corrente.

## Verifica del sorgente

Il file TSX è stato controllato dal parser TypeScript senza errori sintattici. Non è stato possibile completare `next build` in questo ambiente perché l'installazione delle dipendenze npm è andata in timeout; il build va quindi confermato nel deployment Vercel.
