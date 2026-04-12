# CHANGELOG

## [0.6.06] — 2026-04-09
Fix: pulsante 'Conferma acquisto' nelle offerte da finalizzare non funzionava perché la funzione `buyFromPending` non era mai stata definita. Aggiunta in `main.js` con la stessa logica di `buyPlayerFromPool`: detrae il budget, aggiunge il giocatore alla rosa, rimuove dalla rosa avversaria, pulisce pool e pendingPurchases.

[0.6.05] — 2026-04-09
Dashboard: widget 'Ultima Gara' (1/3) affiancato al Matchday Hub (2/3) con risultato, squadra avversaria, giornata e pulsante 'Visualizza Dettaglio'. Notizie con badge RISULTATO diventano cliccabili e aprono il popup dettaglio partita.

[0.6.04] — 2026-04-09
Rosa: forma mostra N% senza decimali. Badge ruolo più piccoli (9px, padding ridotto) per contenere due ruoli sulla stessa riga. Convocazioni: secondo ruolo visibile affianco al primo; forma con Math.round senza decimali.

[0.6.03] — 2026-04-09
Fix: cerchio Forma nella Rosa mostra valori sballati se fitness supera 100. Aggiunto clamp 0–100 in `formaBar` e `gap` non può essere negativo.

[0.6.02] — 2026-04-09
AMB nell'auto-formazione riceve +5 come la mano preferita (non +2): può giocare a destra e sinistra senza malus, equivalente al giocatore con la mano giusta per quella posizione.

[0.6.01] — 2026-04-09
Posizioni in vasca corrette: P/1-6 con ruoli e mano preferita ufficiali. Auto-formazione considera ruolo (+10) e mano preferita (+5, AMB +2) per ogni slot.


Formato: `MAJOR.MINOR.PATCH` — beta fisso a 0.

---

## [0.6.00] — 2026-04-09
Capienza base 500 posti. Bonus spettatori sul risultato (max +5%). Spettatori mostrati nel calendario, nel popup partita e nel widget stats live.

## [0.5.99] — 2026-04-09
Prezzo biglietto influenza la stima spettatori. Range ottimale per tipo evento (campionato 1–20€, playoff 10–50€, finale 15–50€). Malus −1.5%/euro sopra il massimo. UI mostra range consigliato e avviso.

## [0.5.98] — 2026-04-09
Box capienza stadio mostra Capienza TOT e Capienza utilizzabile (%) escluse sezioni in costruzione.

## [0.5.97] — 2026-04-09
Fix: `calledGK is not defined` in simula giornata (regressione v0.5.92).

## [0.5.96] — 2026-04-09
Nessun incasso per sezioni stadio in costruzione.

## [0.5.95] — 2026-04-09
Tab Allenamento: griglia a 4 colonne fisse.

## [0.5.94] — 2026-04-09
Decadimento forma senza allenamento +15%: −1.15/−2.30/−3.45/−4.60 per fascia d'età.

## [0.5.93] — 2026-04-09
Rosa: badge secondo ruolo affiancato al primo (flex row).

## [0.5.92] — 2026-04-09
Selezione convocati simulata con ruoli minimi obbligatori (1 POR, 2 DIF, 2 ATT, 1 CB). Score composito `OVR × (0.70 + forma×0.20 + morale×0.10)` per gli slot liberi.

## [0.5.91] — 2026-04-09
Usura stadio: riempimento >50% → probabilità calo livello. Bottoni upgrade spostati dentro le sezioni. Storico: colonna stagione mostra solo numero.

## [0.5.90] — 2026-04-09
Tab Playoff: risultati cliccabili con popup parziali. Playout mostra "Si salva:" per il vincitore. Scores salvati nei match simulati.

## [0.5.89] — 2026-04-09
Incasso stadio solo per partite in casa (simulata e live).

## [0.5.88] — 2026-04-09
Redesign tab Stadio: campo reale come sfondo piscina, sezioni cliccabili con posti stilizzati, schede sezione migliorate.

## [0.5.87] — 2026-04-09
Nuovo tab Stadio: 4 sezioni espandibili (4 livelli), Bar/Shop, incasso match-day, pianta SVG 2D interattiva.

## [0.5.86] — 2026-04-09
Decadimento forma senza allenamento: −1/−2/−3/−4 per giornata in base all'età.

## [0.5.85] — 2026-04-09
Probabilità infortuni raddoppiate (live: /3 invece di /6; simulata: min 24% invece di 12%).

## [0.5.84] — 2026-04-09
Lobby e Storico: etichette "Stagione N · Giornata N" al posto di "G0"/"S1".

## [0.5.83] — 2026-04-09
Rosa: morale solo emoji+%, forma con cerchio SVG come OVR.

## [0.5.82] — 2026-04-09
Fix: `_rosaSortArrow is not defined`. Fix: pulsante "Gestisci" contratti.

## [0.5.81] — 2026-04-09
Dashboard: ciambella V/P/S colori corretti. Rosa: intestazioni colonne ordinabili.

## [0.5.80] — 2026-04-09
Fix mercato: duplicati nel listone, offerte multiple per squadra, bottoni +/- offerta.

## [0.5.79] — 2026-04-09
Fix salvataggio campi mancanti (stars, stadium, tactic…). Storico record club. Alert contratti in scadenza. Sistema morale granulare.

## [0.5.78] — 2026-04-09
Fix stelle non assegnate dopo partita live (playoff e rigori).

## [0.5.77] — 2026-04-09
Supplementari e rigori playoff/playout (live e simulati). Popup selezione rigoristi con TEC/FOR/Stamina/%.

## [0.5.76] — 2026-04-09
Fix playout: chi vince si salva (logica era invertita in simPLMatch).

