# CHANGELOG — Waterpolo Manager

---

## [0.7.3-beta] — 2026-04-19

### Bugfix — Sincronizzazione eventi canvas e telecronaca

**Problema risolto:** gli eventi della telecronaca testuale (parate, tiri, passaggi) erano completamente scorrelati dalla visualizzazione canvas. Era possibile vedere una parata nel log senza che ci fosse stato un tiro visivo, o la palla ferma nel nulla dopo una rimessa del portiere.

**Causa root:** il loop `_animLoop` usava un `while` che consumava tutti gli eventi pendenti in un singolo frame (soprattutto a velocità alta), inviandoli tutti contemporaneamente al canvas senza attendere che il precedente fosse completato.

**Soluzione — architettura a coda canvas (`_canvasQueue`):**
- Il **motore di gioco** genera eventi e aggiunge il testo al log immediatamente (ordine cronologico corretto)
- Gli **eventi canvas** vengono accodati in `_canvasQueue` e riprodotti **uno alla volta**, ciascuno con la propria durata visiva reale:
  - Tiro: 0.9s
  - Parata: 1.1s (include ripartenza portiere)
  - Passaggio: 0.7s
  - Fallo: 0.5s
  - Neutro: 0.5s
  - Goal: gestito da `MovementController` (celebrazione + rimessa)
- A **velocità ≥ 10x**: la coda viene svuotata istantaneamente mostrando solo la posizione finale (nessuna animazione, massima velocità di simulazione)
- La coda viene resettata all'avvio partita, a fine periodo e durante `skipPeriod`

**Altre correzioni:**
- Rimossa funzione orfana `_poolPhaseIsSprint` (non più necessaria)
- `renderFieldLists()` ora chiamata solo quando un evento viene processato, non ogni frame
- `_applyEventLog` non duplica più il log testuale

---

## [0.7.2-beta] — 2026-04-19

### Nuovo — Movimento segnalini realistico

**Velocità proporzionale a VEL:**
- Ricalibrata la formula di velocità: VEL=100, stamina=100 → percorre tutto il campo (porta→porta) in **12 secondi reali**. VEL=50 → 24s, VEL=75 → 16s, ecc.
- Sostituito il vecchio modello lerp moltiplicativo con **movimento lineare a velocità costante** (unità/secondo), proporzionale al parametro VEL del giocatore.
- La stamina influisce tra il 50% (giocatore esausto) e il 100% (fresco).
- Avversari NPC calibrati a VEL effettiva 65.

**7 situazioni di gioco animate (`movement.js` riscritto):**

1. **Sprint iniziale** — tutti i giocatori nuotano dalla propria porta verso centrocampo. I CB (pos 6) si contendono la palla: vince chi ha VEL più alta; a parità decide il morale; a ulteriore parità, random. Il vincitore passa al C (pos 3), la squadra si mette in formazione.
2. **Goal — esultanza** — i compagni della squadra che ha segnato nuotano verso il marcatore. Timer fermato durante la celebrazione.
3. **Rimessa dal centro** — dopo l'esultanza, il CB della squadra che ha subito va al centro, batte al proprio C (pos 3), poi il timer riparte.
4. **Passaggio** — la palla si sposta fisicamente da un token all'altro. Posizione palla: a destra del token se mano destra (`hand='R'`), a sinistra se `hand='L'`, al centro se ambidestro (`hand='AMB'`).
5. **Tiro** — la palla parte dal segnalino tiratore e viaggia verso la porta avversaria.
6. **Parata** — la palla si ferma davanti al portiere; dopo ~0.9s il portiere rilancia verso il C (pos 3) avviando il proprio contrattacco.
7. **Rigore** — il CB si posiziona sulla linea dei 6 metri, il portiere al centro porta. Se goal: palla in rete; se parata: palla al portiere.

**Formazione semicerchio attacco (dalla foto):**
- CB (pos 6): centroboa sotto porta avversaria
- AD/AS (pos 5/1): ali sui lati alti/bassi
- AT/AT (pos 4/2): laterali del semicerchio
- C (pos 3): centro campo con palla

**Portiere:** segue la palla scorrendo da palo a palo.
**Difensori:** seguono i movimenti dei giocatori avversari nel semicerchio.

**Nuove funzioni API in `pool.js`:**
`poolGetTokenSpeeds`, `poolGetToken`, `poolGetKickoffPos`, `poolMoveBallDirect`, `poolSetBallOn`, `poolMoveBallToToken`, `poolSetPhaseFromMC`, `poolTriggerGoalAnim`, `poolUpdateKeepers`

---

## [0.7.1-beta] — 2026-04-19

### Bugfix
- **Parziali partita live**: corretto bug che mostrava `function () { [native code] }1° T` nella tabella parziali durante la partita. La variabile di loop `tp` era stata scritta come `t` (nome della funzione i18n globale), causando la visualizzazione del toString della funzione invece del numero del tempo.

---

## [0.7-beta] — 2026-04-16

### Sistema i18n — Internazionalizzazione completa IT/EN

**Architettura**
- Nuovo modulo `js/i18n/i18n.js`: funzione globale `t(key, vars)` con interpolazione `{{var}}`, `setLang()` con reload automatico, `getSavedLang()` da `localStorage['wp_lang']`
- Dizionario italiano `js/i18n/it.js` (~700 chiavi) e inglese `js/i18n/en.js` (~700 chiavi), organizzati in sezioni: `common`, `nav`, `welcome`, `header`, `dash`, `roster`, `training`, `goals`, `standings`, `calendar`, `playoff`, `market`, `finance`, `stadium`, `history`, `lineup`, `match`, `positions`, `roles`, `hand`, `attrs`, `tier`, `national`, `injuries`, `offers`, `contracts`, `morale`, `stars`, `seasonEnd`, `logout`, `credits`, `errors`, `extra`, `training_data`, `obj`
- Bootstrap lingua in `index.html`: il dizionario corretto viene caricato prima di tutti gli altri script

**Selettore lingua — Lobby**
- Dropdown `🇮🇹 Italiano / 🇬🇧 English` sopra la lista squadre nella schermata di scelta squadra
- La scelta viene salvata in `localStorage['wp_lang']` e ricordata tra sessioni e dopo login/logout

**Selettore lingua — Topbar di gioco**
- Nuovo box `🇮🇹 IT` / `🇬🇧 EN` nella barra in alto, tra il box Salva e il box Tema
- Un click cicla direttamente tra italiano e inglese (`_cycleLang()`)
- Stile coerente con gli altri box topbar (clip-path, hover, ombra)
- Si sincronizza automaticamente con la lingua corrente ad ogni render

**File tradotti**
- `js/ui/tabs.js` — header, fasi, etichette sidebar (`_updateNavLabels`), box lingua topbar
- `js/ui/welcome.js` — slot panel, bottoni, etichette statiche lobby (`_applyLangToWelcome`)
- `js/ui/lineup.js` — campo, panchina, badge INF/NAZ, mano, messaggi stato formazione
- `js/ui/match.js` — periodo, GOAL, cambi, log partita, messaggi fine partita, infortuni, pausa
- `js/ui/tabs_renderers.js` — tutti i tab: Dashboard (stat bar, badge notizie, sezioni, popup), Rosa (scheda giocatore, rinnovo, vendita, rescissione), Allenamento (popup conferma), Obiettivi (progress), Classifica (intestazioni colonne), Calendario, Playoff, Mercato (offerte, popup), Finanza, Storico, Stadio, Credits
- `js/main.js` — tutti i `G.msgs`, popup "Simula Giornata", popup "Nuova Stagione", popup "Convocazione Nazionale", popup offerta mercato, popup "Salva Partita", messaggi contratti/infortuni/stadio/playoff
- `js/data/training.js` — nomi e descrizioni allenamenti via `t('training_data.*')`
- `js/data/objectives.js` — nomi e descrizioni obiettivi via `t('obj.*')`
- `index.html` — selettore lingua lobby, id sidebar nav, script bootstrap, box topbar lingua

**Badge notizie tradotti e bilingue**
- Tutti i 9 badge (CONTRATTO, MERCATO, RISULTATO, ECONOMIA, ALLENAMENTO, RECUPERO, PLAYOFF, NAZIONALE, NOTIZIA) usano `t()` per la label
- Regex aggiornate con parole chiave inglesi per rilevare correttamente il tipo di notizia in entrambe le lingue

---

## [0.6.21-fix13] — 2026-04-15
Fix tombstone cancellazione slot cloud: `cloud-save.js` scrive `{_deleted:true, savedAtMs}` invece di cancellare il nodo. `syncOnLogin` gestisce correttamente la pulizia.

## [0.6.21-fix12] — 2026-04-15
Fix offerte mercato ritardate: rimosso wrapper `_origSimNextRound` duplicato che bloccava la generazione offerte.

## [0.6.21-fix11] — 2026-04-15
Fix playout: `m2.home = perdente di m1` (non vincitore). Corretti 3 punti in `main.js` e `tabs_renderers.js`.

## [0.6.21-fix10] — 2026-04-14
Fix nazionali al caricamento: `save.js` resetta `_national=false, _nationalNext=false` per tutti i giocatori al load per evitare blocchi persistenti.

## [0.6.21-fix9] — 2026-04-14
Fix voti simulazione: `fieldConv.findIndex(pl => pl.name === p.name)` invece di `indexOf` (bug confronto oggetti). Sort per OVR prima; `hasContrib` garantisce voto a marcatori anche se riserve.

## [0.6.21-fix8] — 2026-04-14
Fix _recalcTiers: spostato PRIMA di `initStandings` per leggere la classifica reale dell'ultima stagione.

## [0.6.21-fix7] — 2026-04-14
Fix penalità uomo in meno: `Math.pow(0.80, shortage)` sia in simulazione (`_effectiveStr`) che in partita live (`myEffective`). Drain +25% per giocatore mancante.

## [0.6.21-fix6] — 2026-04-14
Fix convocazioni manuali: `_nationalNext` blocca selezione e auto-formazione. Badge NAZ visibile in `lineup.js`.

## [0.6.21-fix5] — 2026-04-14
Fix nazionali non esclusi dalla simulazione: `_simRoster` ora applicato a ENTRAMBE le squadre.

## [0.6.21-fix4] — 2026-04-14
Fix nazionali timing: due flag separati `_nationalNext` (badge anticipato, fine G4) e `_national` (indisponibile durante G5). `_activateNationalCalls()` promuove `_nationalNext→_national` all'inizio della simulazione.

## [0.6.21-fix3] — 2026-04-14
Bonus convocazione nazionale: +5% valore di mercato, +15 morale (cap 100).

## [0.6.21-fix2] — 2026-04-14
Overall = media ponderata attributi. Funzioni globali `_calcOverallFromStats(p)` e `_calcOverallRaw(p)` in `main.js`. Allenamento usa ricalcolo deterministico (non più 8% prob). Aging decrementa un attributo casuale e ricalcola. `save.js` riallinea l'OVR al caricamento.

## [0.6.21-fix1] — 2026-04-13
Fix portieri `careerApps`: incrementato anche per portieri simulati.

## [0.6.21] — 2026-04-13
Allenamenti ribilanciati: `training.js` rivisitato con nuovi pesi. Tattica portata a 12k. Tecnica `tec:5+spe:1`. Resistenza `res:4+str:2`. Popup nazionali con coriandoli fullscreen e emoji 🤽.

## [0.6.20] — 2026-04-12
Drain stamina multi-fattore: `base × tactic × positionFactor × (1 - res/300) × (1 + age/180) × formMalus`. Evita iper-semplificazione con valore fisso.

## [0.6.19] — 2026-04-12
`stats.spe` rinominato VEL (Velocità) in tutti i renderer. `stats.res` aggiunto come attributo RES (Resistenza) con influenza sulla stamina drain.

## [0.6.18] — 2026-04-12
`MovementController` estratto in `js/canvas/movement.js`: separazione logica movimento/rendering migliora la manutenibilità.

## [0.6.17] — 2026-04-12
Fix "Fine Periodo" congelava il punteggio: bottone ora chiama correttamente `_skipToEndOfPeriod()` senza bloccare il timer.

## [0.6.16] — 2026-04-12
Fix sidebar scrollabile sotto la topbar: struttura flex corretta su `sc-game` con `overflow: hidden` sul contenitore principale.

## [0.6.15] — 2026-04-11
Fix bottone Logout non visibile: `wp-btn-logout` ora mostrato correttamente dopo login Firebase.

## [0.6.14] — 2026-04-11
Fix crash dashboard al render: null-safety su `hdr-info` e altri elementi DOM che potevano essere assenti durante il caricamento.

## [0.6.13] — 2026-04-11
Logout a due step: popup di conferma con opzione "Salva ed esci" / "Esci senza salvare".

## [0.6.12] — 2026-04-11
Fix probabilità gol e intervalli eventi: tuning combinato per scoreline realistiche (media 8–12 gol/partita). Frequenza eventi calibrata per 4 periodi × 8 minuti.

## [0.6.11] — 2026-04-11
Rating giocatori `calcPlayerRating`: formula che pesa duelli, gol, assist, stamina. Ultimi 4 voti visualizzati in Rosa con sparkline.

## [0.6.10] — 2026-04-11
Voti simulati per la rosa: `_assignSimulatedRatings` assegna voti realistici basati su gol/assist/parate simulati.

## [0.6.09] — 2026-04-10
Calendario: tab Andata/Ritorno, popup dettaglio partita con parziali e marcatori.

## [0.6.08] — 2026-04-10
Firebase Auth + cloud-save con `savedAtMs`: confronto timestamp preciso per evitare sovrascritture errate.

## [0.6.07] — 2026-04-10
Visualizzazione vasca Canvas: campo orizzontale, token bianchi/blu/rossi, sprite pallone, animazione GOAL overlay.

## [0.6.06] — 2026-04-09
Fix: `buyFromPending` non era definita. Aggiunta in `main.js` con logica identica a `buyPlayerFromPool`.

## [0.6.05] — 2026-04-09
Dashboard: widget "Ultima Gara" (1/3) affiancato al Matchday Hub (2/3). Notizie RISULTATO cliccabili aprono popup dettaglio.

## [0.6.04] — 2026-04-09
Rosa: forma N% senza decimali. Badge ruolo più compatti. Convocazioni: secondo ruolo visibile.

## [0.6.03] — 2026-04-09
Fix: cerchio Forma clampato 0–100. Gap non può essere negativo.

## [0.6.02] — 2026-04-09
AMB in auto-formazione riceve +5 come la mano preferita.

## [0.6.01] — 2026-04-09
Posizioni in vasca corrette P/1–6 con ruoli e mano preferita. Auto-formazione considera ruolo (+10) e mano (+5, AMB +2).

## [0.6.00] — 2026-04-09
Capienza base 500 posti. Bonus spettatori sul risultato. Spettatori in calendario, popup e widget live.

---

*Versioni precedenti alla 0.6.00 non documentate in questo file.*

---

**Formato versioni:** `MAJOR.MINOR[.PATCH][-fix N]` — beta fisso a 0.
