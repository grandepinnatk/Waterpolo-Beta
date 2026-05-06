# CHANGELOG — Waterpolo Manager

---

## [0.9.4-beta] — 2026-05-06

### Nuove funzionalità e fix

**Shot clock 30 secondi (`movement.js`):**
- Il contatore parte quando un giocatore prende possesso e avanza col tempo di gioco scalato.
- Se scade senza una conclusione: cambio palla con evento testuale motivato ("⏱ Fallo in attacco — 30s scaduti").
- La palla rimane ferma nel punto del fallo; il giocatore `moverKey` della squadra che batte nuota verso di essa.
- Il clock si azzera ad ogni cambio possesso (`onPossessChange`) e ad ogni conclusione.

**Giocatore libero → avanza verso porta:**
- Se il possessore non ha nessun avversario entro ~3m (0.10 unità normalizzate), smette di aspettare il passaggio e avanza verso la porta avversaria per concludere.

**Cambio possesso sempre motivato:**
- Rimosso "Cambio possesso palla" dagli eventi neutri generati casualmente.
- Il cambio possesso avviene solo per: shot clock scaduto, fallo, intercetto, parata, goal.

**Palla ferma al punto del fallo:**
- Per eventi `cls:'fl'`, la palla si ferma alle coordinate `ballTarget` (punto del fallo/out).
- Il `moverKey` della squadra che batte nuota fisicamente verso la palla; il possesso si assegna a contatto.

**Marcatura pos3/pos6 corretta:**
- Il CB difensore (pos6) si posiziona al 30% tra il C avversario e la propria porta (era 55% → troppo lontano).

---

## [0.9.3-beta] — 2026-05-06

### Fix — Corsa alla palla: un giocatore per squadra

**Comportamento corretto:** quando la palla è libera, **il giocatore più vicino di ogni squadra** nuota verso di essa simultaneamente. Chi arriva prima prende possesso; l'avversario che ha corso verso la palla diventa automaticamente il pressore più vicino.

- Dopo 1 secondo senza possessore, sia `bestMy` che `bestOpp` ricevono come target la posizione della palla e scattano verso di essa.
- La palla rimane ferma.
- La condizione di vittoria: distanza < 0.055 unità. In caso di parità vince il giocatore nostro (tie-break).
- Al momento del possesso, `MovementController.onPossessChange(winner.team)` aggiorna formazione e marcatura.

---

## [0.9.2-beta] — 2026-05-06

### Fix — Logica raccolta palla invertita

**Principio corretto:** la palla non si sposta mai verso un giocatore. È sempre il giocatore che nuota verso la palla e la raccoglie fisicamente.

**Palla libera (`pool.js`):**
- Dopo 1 secondo senza possessore, il giocatore più vicino riceve come **target** la posizione della palla e nuota verso di essa.
- La **palla rimane ferma** fino a quando il giocatore non la raggiunge (distanza < 0.055 unità).
- Solo a contatto avvenuto, la palla viene assegnata al giocatore con l'offset corretto per la mano.
- Il meccanismo è disattivato mentre `MovementController` ha un `_pendingReceiver` attivo (passaggio in volo).

**Passaggio attivo (`movement.js`):**
- Nel passaggio tra compagni, la palla vola verso la posizione del ricevitore (comportamento fisico corretto — la palla è lanciata).
- Il ricevitore nuota verso il punto di atterraggio della palla (non si ferma ad aspettarla).
- Rimosso il `poolMoveToken` che "fermava" artificialmente il ricevitore prima che la palla arrivasse.

**Nuovo metodo esportato:** `MovementController._hasPendingReceiver()` — permette a `pool.js` di sapere se un passaggio è in corso.

---

## [0.9.1-beta] — 2026-05-06

### Bugfix — Portieri sempre sulla linea + palla mai libera

**Portieri sulla linea di porta (X fisso):**
- `poolAnimStep`: la coordinata X del portiere viene forzata a `PLAY.myGKX` / `PLAY.oppGKX` ad ogni frame (sia `tok.x` che `tok.tx`), eliminando qualsiasi possibilità di deriva laterale.
- `poolInitTokens`: i portieri nascono già sulla linea corretta (non sulla posizione kickoff generica).
- La Y rimane clampata tra i pali (`myGoalY0+0.02` ↔ `myGoalY1-0.02`).

**Palla sempre in possesso:**
- Aggiunto `_ballFreeTimer` in `pool.js`: se la palla non ha possessore per più di **1.5 secondi** in fase di gioco (`_phase==='play'`), il giocatore di campo più vicino la raccoglie automaticamente.
- Il timer si azzera ogni volta che un token prende possesso.
- Reset in `poolInitTokens` e `poolStartPeriod`.

### Promemoria per release future
- Aggiornare sempre CHANGELOG.md e README.md ad ogni release.

---

## [0.8.1-beta] — 2026-04-20

### Nuovo — Schemi di superiorità e inferiorità numerica

Implementazione completa degli schemi tattici per la situazione 6v5 e 5v6.

**Motore (`engine/match.js`):** timer superiorità/inferiorità 20s, espulsioni avversarie, nuovi campi stato.

**Superiorità (6v5) — attacco 4-2:** pos1=ala dx, pos6=Palo1 (ai 2m dx), pos3=Palo5 (ai 2m sx), pos5=ala sx, pos2/4=esterni 4m. Avversario espulso (opp_4) scompare; 5 difensori in pressing.

**Inferiorità (5v6) — difesa 5:** my_4 scompare; difesa alterna pressing / zona M. Avversario attacca in 4-2.

Al termine dei 20s tutti tornano alla formazione normale automaticamente.

---

## [0.7.6-beta] — 2026-04-19

### Bugfix — Correlazione velocità di gioco e movimento segnalini

**Problema:** aumentando la velocità di gioco (2x, 10x, 15x, 20x) i segnalini continuavano a muoversi alla stessa velocità lenta mentre gli eventi del motore scorrevano molto più veloci, creando una totale scorrelazione tra visuale e telecronaca.

**Causa:** `poolAnimStep(rawDt)` riceveva solo il delta-time reale del frame (~16ms a 60fps), senza sapere la velocità di gioco (`G.ms.speed`). I token si muovevano quindi sempre alla stessa velocità fisica indipendentemente dal moltiplicatore selezionato.

**Fix — sistema a due modalità:**

- **Velocità 1x–2x** (< 5x): movimento fisico fluido e animato, i token nuotano visibilmente verso i target con velocità proporzionale al parametro VEL del giocatore.
- **Velocità 5x–20x** (≥ 5x): snap istantaneo — i token si teletrasportano direttamente al target ogni frame. Il risultato è coerente con gli eventi che scorrono veloci: le posizioni cambiano di colpo ad ogni azione, come un replay accelerato.

`poolAnimStep(dt, gameSpeed)` ora riceve la velocità di gioco come secondo parametro. Stessa logica applicata alla palla libera (tiri/passaggi).

`MovementController.update` scala la frequenza degli aggiornamenti tattici con la velocità di gioco, così i target vengono ricalcolati abbastanza spesso anche a velocità alta.

---

## [0.7.5-beta] — 2026-04-19

### Nuovo — Gameplay continuo stile Football Manager

Riscrittura completa di `pool.js` e `movement.js` per passare da un modello **event-driven** (token fermi tra un evento e l'altro) a un modello **simulation-driven** (tutti i token si muovono continuamente ogni frame).

**Cambiamenti principali:**

1. **Movimento continuo di tutti i token** — ogni giocatore ha un'oscillazione sinusoidale individuale (fase randomizzata) che simula il nuoto sul posto. I target vengono aggiornati ogni ~2.5s in background, indipendentemente dagli eventi del motore.

2. **Compressione/espansione difensiva** — quando cambia il possesso, la formazione di difesa si comprime compatta verso la propria porta, quella di attacco si espande verso la porta avversaria con una lieve deriva progressiva.

3. **Pressione sul possessore** — 2 difensori avversari si avvicinano continuamente a chi ha la palla: il primo pressa (~0.09 di distanza), il secondo copre lo spazio a zona (~0.16). Indicatore visivo: alone rosso sul difensore che pressa.

4. **Nome solo sul possessore** — il nome del giocatore appare in evidenza (testo giallo su sfondo scuro) solo sul token che ha la palla. Gli altri giocatori hanno il nome in piccolo e semitrasparente.

5. **Alone sul possessore** — cerchio giallo attorno al token che ha la palla per identificarlo a colpo d'occhio.

6. **Nessun blocco su goal/eventi** — `poolAnimStep` gira sempre, `_goalAnim.timer` avanza sempre. Gli eventi sono microeventi nel flusso continuo.

**Architettura:**
- `pool.js`: rendering + step fisico (movimento lineare, palla segue possessore)
- `movement.js`: simulazione tattica continua (target, pressione, oscillazioni)
- `match.js`: genera eventi, li accoda, li dispatcha — senza bloccare il canvas

---

## [0.7.4-beta] — 2026-04-19

### Bugfix — 4 problemi canvas risolti

**1. Overlay GOAL resta fisso**
Il timer `_goalAnim.timer` veniva incrementato solo dentro certi branch di fase (`goal_cel`), ma `MovementController` cambiava la fase prima che il timer completasse. Ora il timer avanza **sempre** in `poolAnimStep`, indipendentemente dalla fase corrente.

**2. Palla che non segue il possessore**
Introdotto il sistema `_ballOwner`: quando un token prende possesso della palla (`poolSetBallOn`), la palla aggiorna la propria posizione **ogni frame** seguendo il token con l'offset corretto per la mano (`R/L/AMB`). Quando la palla viene tirata o passata (`poolReleaseBall`), il possesso viene cancellato e la palla vola libera verso il target.

**3. Scatti / movimento a singhiozzo**
La vecchia coda canvas bloccava tutto il canvas per la durata dell'animazione (0.7–1.1s), durante la quale i token non ricevevano nuovi target e sembravano congelati fino allo scatto successivo. La nuova `_tickCanvasQueue` non blocca mai il canvas: gestisce il gap minimo tra eventi ma lascia `poolAnimStep` girare fluidamente ogni frame.

**4. Velocità di simulazione (1x/2x/10x/15x/20x)**
Il vecchio `_BASE_LIN_SPD` era fisso e non legato a `G.ms.speed`. Chiarito il modello: le velocità di simulazione accelerano il **timer di gioco** (quanti secondi di partita passano per secondo reale), non la velocità fisica dei segnalini sul campo. I giocatori nuotano sempre alla stessa velocità visiva — è il mondo di gioco che scorre più veloce.

**Sequenza eventi aggiornata:**
- **Tiro**: il tiratore appare con la palla → `poolReleaseBall()` → palla vola verso porta
- **Parata**: palla vola libera → portiere prende possesso → rilancio al pos 3 → pos 3 prende possesso
- **Passaggio**: palla vola libera → ricevitore prende possesso
- **Sprint/rimessa**: CB prende possesso → passa al pos 3 → pos 3 prende possesso
- **Goal**: palla vola in rete → overlay GOAL 2.5s → esultanza → rimessa

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
