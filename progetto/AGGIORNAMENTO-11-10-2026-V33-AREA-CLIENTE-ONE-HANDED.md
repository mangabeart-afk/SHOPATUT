# Aggiornamento V33 — Area Cliente One-Handed

## Obiettivo
Rendere l'Area Cliente più comoda da usare da smartphone con una sola mano, mantenendo la palette grafica esistente e tutte le funzionalità applicative.

## Modifiche
- Aggiunta una barra di navigazione inferiore fissa su smartphone per il profilo CLIENTE: Home, Articoli, Pagamenti e Altro.
- Il pulsante Altro apre il menu esistente e mantiene accessibili Crediti, Spedizioni, Movimenti e la disconnessione.
- Il menu laterale desktop resta invariato; il menu mobile dell'amministratore resta invariato.
- La barra inferiore rispetta le safe area dei dispositivi con bordo arrotondato/notch.
- Adeguato lo spazio inferiore dei contenuti per evitare che la barra copra pulsanti o informazioni.
- Migliorata la disposizione mobile dei dati cliente e dei riepiloghi della Dashboard.
- Conservata la palette esistente (`#FDFBF7`, `#703834`, `#D9B48F`) e mantenuta la logica dati/permessi senza modifiche.

## Verifiche
- Controllo statico dei file modificati completato.
- Il build Next.js non è stato eseguito in questo ambiente: l'installazione delle dipendenze è andata in timeout.
