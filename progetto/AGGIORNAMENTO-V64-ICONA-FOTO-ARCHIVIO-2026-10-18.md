# Aggiornamento v64 — icona foto nel codice articolo

## Modifica
- Nell'elenco **Admin → Articoli → Archivio**, accanto al codice articolo è mostrata una piccola icona lente solo quando `photo_url` contiene un URL foto valido.
- L'icona utilizza il componente già presente `ArticlePhotoButton` e apre il popup foto dell'archivio.
- Gli articoli senza foto non mostrano alcuna icona e il codice continua ad aprire i dettagli come prima.
- La modifica riguarda esclusivamente la lista dell'archivio; non modifica le altre liste, i dati Supabase o la pubblicazione.

## File modificati
- `app/admin/articoli/archivio/ArchiveArticleActions.tsx`
- `app/globals.css`

## Verifiche
- Controlli statici mirati sul rendering condizionale e sul collegamento al popup foto: superati.
- Parsing TypeScript/TSX con TypeScript `transpileModule`: esito riportato al momento del confezionamento.
- Integrità dello ZIP controllata dopo la creazione.
- La build completa Next.js non è stata eseguita in assenza delle dipendenze locali (`node_modules` / binario `next`).
- Nessuna modifica a Supabase e nessuna pubblicazione su Vercel.
