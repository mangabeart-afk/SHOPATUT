# ShopATUT — aggiornamento vendite occasionali (v24)

- La vendita a cliente occasionale resta limitata a un movimento `VENDITA`: nessun cliente, profilo, codice cliente, casella, assegnazione o pagamento contestuale viene creato.
- Il nome inserito dall'amministratore viene conservato nel movimento senza trasformarlo in anagrafica registrata.
- L'archivio conteggia le quantità delle vendite senza casella nella giacenza residua, aggiunge i ricavi ai totali dell'articolo e aggiorna il margine del riepilogo selezione.
- La colonna UTENTI mostra il nominativo occasionale; nella finestra acquirenti non viene creato un link a una scheda cliente inesistente.
- I movimenti `VENDITA` stornati da `ANNULLAMENTO` sono esclusi dai totali usati per la tabella archivio.

Verifiche: sintassi TypeScript/TSX dei due file modificati passata tramite parser TypeScript. La build Next.js completa non è stata verificata: `npm install` termina per timeout e le dipendenze (`next`) non vengono installate.
