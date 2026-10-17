# ShopATUT v30 — Correzione link reimpostazione password

- Allineato il flusso Auth usato per inviare la mail di reset quando l’amministratore modifica l’indirizzo email del cliente al flusso `implicit` già gestito dalla pagina `/recupera-password/reset`.
- Il link di recupero continua a puntare direttamente a `/recupera-password/reset`, dove il client rileva la sessione di recovery dal fragment del link.
- `NEXT_PUBLIC_SITE_URL` ha ora la precedenza sull’host della richiesta, per evitare che il link punti a un dominio preview o diverso da quello stabile.
- Non sono stati modificati la procedura di sostituzione dell’account Auth, i profili, i movimenti o i dati del cliente.
- Verifiche eseguite: sintassi TypeScript/TSX e integrità archivio ZIP. Build Next.js completa e deploy non eseguiti.
