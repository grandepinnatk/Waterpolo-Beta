// ─────────────────────────────────────────────
// engine/match.js  — Motore partita
// ─────────────────────────────────────────────

const PERIOD_SECONDS = 8 * 60;
const TOTAL_PERIODS  = 4;
const MAX_TEMP_EXP   = 3;    // gialli → espulsione definitiva
const MAX_EXPELLED   = 3;    // hard cap: mai sotto 4 giocatori in campo

// Boost tattico sulla forza squadra
const TACTIC_BOOST = {
  balanced: 0, attack: 8, defense: -5, counter: 3, press: 5,
};

// Probabilità base di fallo per evento × moltiplicatore tattico
// Calibrato su 200.000 simulazioni Monte Carlo.
// Risultati attesi:
//   defense:  ~0    esp/partita
//   balanced: ~0-1  esp/partita, raramente 2
//   counter:  ~0-1  esp/partita, talvolta 2
//   attack:   ~1-2  esp/partita, raramente 3
//   press:    ~1-3  esp/partita (stile aggressivo)
const BASE_FOUL_PROB = 0.050;
const TACTIC_FOUL_MULT = {
  defense:  0.40,
  balanced: 0.75,
  counter:  0.90,
  attack:   1.00,
  press:    1.10,
};

// Pesi per selezione giocatore che commette fallo:
// un giocatore già ammonito gioca più cauto
const YELLOW_WEIGHTS = [1.0, 0.35, 0.08]; // 0 gialli, 1 giallo, 2 gialli

// Affinità ruolo ↔ posizione: usata per il malus fuori-ruolo
// Ogni posizione ha un ruolo "nativo"; se il giocatore ha un ruolo diverso
// la sua efficacia in quella posizione viene ridotta
const POS_NATIVE_ROLE = {
  GK: 'POR',
  1:  'ATT',  // RW
  2:  'DIF',  // DR
  3:  'CEN',  // ATT centro
  4:  'DIF',  // DL
  5:  'ATT',  // LW
  6:  'CB',   // centroboa
};

// Fattore di efficacia quando il giocatore è fuori ruolo
// 'native' = ruolo corretto, 'adjacent' = ruolo simile, 'alien' = ruolo distante
// Fattore efficacia per ruolo giocatore → ruolo nativo della posizione
// ATT in pos 3 (native CEN): penalizzato perché pos 3 richiede visione di gioco, non finalizzazione
const ROLE_ADJACENCY = {
  POR: { POR: 1.0, DIF: 0.55, CEN: 0.40, ATT: 0.35, CB: 0.35 },
  DIF: { POR: 0.40, DIF: 1.0, CEN: 0.75, ATT: 0.60, CB: 0.55 },
  CEN: { POR: 0.40, DIF: 0.80, CEN: 1.0, ATT: 0.85, CB: 0.75 },
  ATT: { POR: 0.35, DIF: 0.60, CEN: 0.70, ATT: 1.0,  CB: 0.80 },
  CB:  { POR: 0.35, DIF: 0.60, CEN: 0.75, ATT: 0.80, CB: 1.0 },
};

// Penalità mano/posizione: fattore moltiplicativo applicato all'efficacia
// Mancini (L) in pos 4 e 5: penalizzati (braccio dominante a sfavore)
// Destri (R) in pos 1 e 2: penalizzati
// Pos 3 e 6: indifferente (gioco frontale/centrale)
// AMB: nessuna penalità ovunque
const HAND_POS_PENALTY = {
  L: { GK: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 0.82, 5: 0.82, 6: 1.0 },
  R: { GK: 1.0, 1: 0.82, 2: 0.82, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0 },
  AMB: { GK: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0 },
};

// ── Costanti stamina ──────────────────────────
// Sistema a fasce calibrato:
// - Giovane ≤22, fit 95, spe 75, balanced → ~5% residuo dopo 4 tempi
// - Anziano 32+, fit bassa → esaurisce nel 3°-4° tempo
// - Over 35, fit bassa → esaurisce nel 2° tempo
const STAMINA_BASE_DRAIN     = 0.05251; // drain/s (tempo di gioco)
const STAMINA_BENCH_RECOVERY = 0.018;   // recupero/s in panchina (più rapido: ~55s per +1%)
// Soglie per i deficit:
const STAMINA_FIT_THRESHOLD  = 85;      // sopra questa soglia: nessun malus fitness
const STAMINA_AGE_THRESHOLD  = 28;      // sopra questa soglia: malus età
const STAMINA_K_FIT          = 1.2;     // peso del deficit fitness
const STAMINA_K_AGE          = 2.2;     // peso del deficit età

// Moltiplicatori tattici globali (applicati a tutti i giocatori in campo)
const TACTIC_STAMINA_MULT = {
  defense:  0.70,
  balanced: 1.00,
  counter:  1.10,
  attack:   1.30,
  press:    1.60,  // massimo consumo
};

// In contropiede le posizioni offensive corrono molto di più
const COUNTER_POS_MULT = {
  GK: 0.80, 2: 1.00, 4: 1.00,  // difensivi: normale o meno
  1: 1.35, 3: 1.25, 5: 1.35,   // attaccanti: molto più fatica
  6: 1.10,                       // centroboa: leggermente più fatica
};

// Soglie per il controllo infortuni
const INJ_STAMINA_THRESHOLD = 30;  // stamina % sotto cui scatta il rischio
const INJ_FITNESS_THRESHOLD = 75;  // forma % sotto cui scatta il rischio

const NEUTRAL_EVENTS = [
  'Azione di attacco neutralizzata', 'Contrattacco sventato',
  'Rimessa in gioco', 'Cambio possesso palla',
  'Superiorità numerica gestita', 'Tiro fuori misura', 'Fallo in attacco',
];

/*
// Cerca dove viene gestito il passaggio (probabilmente in una funzione tipo processStep)
// Quando viene scelto un nuovo ricevitore:
ms.ballStatus = 'passing'; // Nuovo stato per la palla
ms.targetReceiver = nextPlayerId; // Il segnalino verso cui deve andare la palla
// Invece di cambiare il possessore istantaneamente:
_ms.isBallInFlight = true;
_ms.ballTargetToken = nextPlayerId;
*/


// ── Crea lo stato iniziale ────────────────────
function createMatchState({ match, isHome, myTeam, oppTeam, myRoster, oppRoster, formation, shirtNumbers }) {
  const onFieldIdxs = new Set(Object.values(formation));
  // In panchina vanno SOLO i giocatori convocati con numero assegnato
  // (i giocatori senza numero non sono stati convocati per questa gara)
  const numberedIdxs = new Set(Object.keys(shirtNumbers || {}).map(Number));
  const bench = myRoster
    .map((_, i) => i)
    .filter(i => !onFieldIdxs.has(i) && numberedIdxs.has(i));

  const tempExp = {};
  myRoster.forEach((_, i) => { tempExp[i] = 0; });

  // stamina: { rosterIdx → 0-100 } inizializzata dal fitness del giocatore
  const stamina = {};
  myRoster.forEach((p, i) => { stamina[i] = p.fitness; });

	var ms = { // Qui ms viene DEFINITA
			//home: matchObj.home,
			//away: matchObj.away,
			// ...
			ballStatus: 'held', // Non serve scrivere ms.ballStatus, sei già nell'oggetto
			possessor: 'my_3'
		};

	  return {
		match, isHome, myTeam, oppTeam,
		onField: { ...formation },
		bench,
		myScore: 0, oppScore: 0,
		period: 1, totalSeconds: 0,
		running: false, finished: false,
		myShots: 0, oppShots: 0, mySaves: 0, myFouls: 0,
		gkSaves: {},   // { rosterIndex: savesCount } — per ogni GK che ha parato
		tactic: 'balanced',
		actions: [],
		myRoster, oppRoster,
		subs: 0, subOut: null, subIn: null,
		lastActionTime: 0, nextActionIn: rnd(7, 14),
		poType: null, poMatch: null,
		shirtNumbers: shirtNumbers || {},
		tempExp,
		expelled: new Set(),
		stamina,
		speed: 1,
		// Gol segnati IN QUESTA PARTITA: { rosterIdx → count }
		matchGoals:   {},
		matchAssists: {},
		matchRatings: {},   // { rosterIdx → voto live 0-10 }
		matchDuels:   {},   // { rosterIdx → { won, lost } } confronti vinti/persi
		injuries:     [],   // [ rosterIdx ] giocatori infortunati in questa partita
		// Parziali per periodo: array di { my, opp } per ciascuno dei 4 tempi
		periodScores: [ {my:0,opp:0}, {my:0,opp:0}, {my:0,opp:0}, {my:0,opp:0} ],
		// Punteggio al termine del periodo precedente (per calcolare il parziale corrente)
		_prevScore: { my:0, opp:0 },
		// [File: js/engine/match.js]
		possessor: 'my_3',       // Chi ha la palla (es. squadra_posizione)
		ballStatus: 'held',      // 'held' (in mano) o 'passing' (in volo)
		targetReceiver: null,    // ID del giocatore che deve ricevere
		ms
	};
};


// ── Avanza il tempo ───────────────────────────
function advanceTime(ms, dt) {
  ms.totalSeconds += dt * ms.speed;

  // Cala la stamina dei giocatori in campo
  _drainStamina(ms, dt * ms.speed);

  const curPeriodSec = ms.totalSeconds - (ms.period - 1) * PERIOD_SECONDS;
  if (curPeriodSec >= PERIOD_SECONDS) {
    if (ms.period < TOTAL_PERIODS) {
      ms.period++;
      // Avvia animazione scatto per il nuovo periodo
      if (typeof poolStartPeriod === 'function') poolStartPeriod();
      return { periodEnded: true, matchEnded: false };
    } else {
      ms.finished = true; ms.running = false;
      return { periodEnded: true, matchEnded: true };
    }
  }
  return { periodEnded: false, matchEnded: false };
}

// ── Calo stamina in campo + recupero in panchina ──
//
// Formula: drain = BASE × tacticMult × posMult × resFactor × formFactor × ageFactor
//
// Fattori moltiplicativi (tutti ≥ 0, si compongono):
//
// ── resFactor (Resistenza 0-100) ──────────────────────────────────
//   RES riduce il drain: range da 1.18 (RES=0) a 0.82 (RES=100)
//   Formula: 1.18 - (res / 278)  → media RES=50 → factor≈1.00
//
// ── formFactor (Forma/Fitness 0-100, soglia 85) ───────────────────
//   Sotto 85: ogni punto mancante aggiunge malus (K_FIT = 1.2)
//   Forma 85  → factor = 1.00
//   Forma 65  → factor = 1.24
//   Forma 50  → factor = 1.42
//
// ── ageFactor (Età, soglia 28) ────────────────────────────────────
//   Sopra 28: ogni anno aggiuntivo aumenta drain (K_AGE = 2.2)
//   Età 28   → factor = 1.00
//   Età 32   → factor = 1.088
//   Età 36   → factor = 1.176
//
// ── tacticMult (tattica globale) ──────────────────────────────────
//   defense×0.70, balanced×1.00, counter×1.10, attack×1.30, press×1.60
//
// ── posMult (posizione × tattica contropiede) ─────────────────────
//   In contropiede: ali(1,5)×1.35, centro(3)×1.25, CB(6)×1.10
//

// ── Recupero stamina a fine periodo (intervallo) ─────────────────────
// Intervalli: T1→T2 e T3→T4 = 2 min, T2→T3 (cambio campo) = 5 min
function applyPeriodBreakRecovery(ms) {
  if (!ms) return;
  const period = ms.period; // periodo APPENA finito (prima dell'incremento)
  // Durata intervallo in secondi di gioco
  const breakSecs = (period === 2) ? 300 : 120; // T2→T3 = 5min, altri = 2min
  ms.myRoster.forEach(function(p, pi) {
    if (!p) return;
    // Tutti recuperano: in campo, panchina, espulsi temporanei
    ms.stamina[pi] = Math.min(100, (ms.stamina[pi] || 0) + STAMINA_BENCH_RECOVERY * breakSecs);
  });
}

function _drainStamina(ms, dtGame) {
  const tactic     = ms.tactic || 'balanced';
  const tacticMult = TACTIC_STAMINA_MULT[tactic] || 1.0;

  const fieldMap = {};
  Object.entries(ms.onField).forEach(([pk, pi]) => {
    if (!ms.expelled.has(pi)) fieldMap[pi] = pk;
  });
  const onFieldSet = new Set(Object.keys(fieldMap).map(Number));

  ms.myRoster.forEach((p, pi) => {
    if (!p) return;

    if (onFieldSet.has(pi)) {
      // ── IN CAMPO ──────────────────────────
      const pk = fieldMap[pi];

      // Moltiplicatore tattico posizione (solo contropiede)
      const posMult = (tactic === 'counter') ? (COUNTER_POS_MULT[pk] || 1.0) : 1.0;

      // Deficit fitness: ogni punto sotto soglia 85 aumenta il drain
      const defFit = Math.max(0, STAMINA_FIT_THRESHOLD - p.fitness) / 100;

      // Deficit età: ogni anno oltre soglia 28 aumenta il drain
      const defAge = Math.max(0, p.age - STAMINA_AGE_THRESHOLD) / 100;

      // RES (Resistenza 0-100): riduce il drain — range da 1.18 (res=0) a 0.82 (res=100)
      // Media res=50 → factor=1.00 (neutro). 1.18 - (res/278)
      const res       = (p.stats && p.stats.res !== undefined) ? p.stats.res : 50;
      const resFactor = 1.18 - (res / 278);

      // Forma (fitness): deficit sotto soglia 85 aumenta il drain
      const formFactor = 1 + defFit * STAMINA_K_FIT;

      // Età: deficit sopra soglia 28 aumenta il drain
      const ageFactor  = 1 + defAge * STAMINA_K_AGE;

      // Con uomo in meno i giocatori in campo si affaticano di più
      const _onFieldCount = Object.values(ms.onField)
        .filter(pi2 => !ms.expelled.has(pi2)).length;
      const _undermanned = Math.max(0, 7 - _onFieldCount);
      const underMannedDrain = 1 + _undermanned * 0.25; // +25% drain per ogni mancante
      const drain = STAMINA_BASE_DRAIN
        * tacticMult * posMult
        * resFactor * formFactor * ageFactor
        * underMannedDrain
        * dtGame;

      ms.stamina[pi] = Math.max(0, ms.stamina[pi] - drain);

    } else {
      // ── IN PANCHINA o espulso: recupero graduale ──
      ms.stamina[pi] = Math.min(100, ms.stamina[pi] + STAMINA_BENCH_RECOVERY * dtGame);
    }
  });
}

// ── Efficacia giocatore in posizione ─────────
// Combina: malus fuori-ruolo × penalità mano/posizione
// Considera anche il secondo ruolo (bi-ruolo): usa il migliore tra i due
function _roleEffectiveness(player, posKey) {
  if (!player) return 0.5;
  const nativeRole = POS_NATIVE_ROLE[posKey];
  if (!nativeRole) return 1.0;

  // Calcola efficacia ruolo (considera anche secondRole se presente)
  function _roleAdj(role) {
    const adj = ROLE_ADJACENCY[role];
    return adj ? (adj[nativeRole] || 0.60) : 0.60;
  }
  let roleFactor = _roleAdj(player.role);
  if (player.secondRole) {
    roleFactor = Math.max(roleFactor, _roleAdj(player.secondRole));
  }

  // Penalità mano/posizione (AMB non ha penalità)
  const hand = player.hand || 'R';
  const handPenaltyMap = HAND_POS_PENALTY[hand] || HAND_POS_PENALTY['R'];
  const handFactor = handPenaltyMap[posKey] !== undefined ? handPenaltyMap[posKey] : 1.0;

  return roleFactor * handFactor;
}

// ── Genera evento di gioco ────────────────────
// ── Calcola voto live di un giocatore ────────────────────────────
// Base 6.0 per tutti i giocatori in campo
// +1.5 per gol, +0.8 per assist
// +0.3 per duel vinto, -0.2 per duel perso
// Portiere: base 6.5, ogni parata +0.4
// Arrotondato a 0.5
function calcPlayerRating(pi, ms) {
  const p = ms.myRoster[pi]; if (!p) return 6.0;
  const isGK    = p.role === 'POR';
  let rating    = isGK ? 6.0 : 6.0;   // stesso punto di partenza
  const goals   = ms.matchGoals[pi]   || 0;
  const assists = ms.matchAssists[pi] || 0;
  const duels   = ms.matchDuels[pi]   || { won: 0, lost: 0 };
  const saves   = ms.mySaves          || 0;

  if (isGK || ms.onField['GK'] === pi) {
    // Portiere (o giocatore di movimento in porta): usa le parate specifiche di questo slot
    const myGkSaves = (ms.gkSaves && ms.gkSaves[pi]) || 0;
    const goalsConceded = ms.oppScore || 0;
    rating += myGkSaves    * 0.4;   // parate di questo portiere +0.4 cad.
    rating -= goalsConceded * 0.25; // gol subiti (divisi tra i portieri se ci sono stati cambi)
    // Bonus clean sheet: solo se la partita è finita (ms.finished) o a fine periodo
    if (ms.finished || ms.period > 1) {
      if (goalsConceded === 0) rating += 0.8;
      else if (goalsConceded <= 2) rating += 0.3;
    }
  } else {
    // Giocatori di movimento
    rating += goals   * 1.5;
    rating += assists * 0.8;
    rating += duels.won  * 0.3;
    rating -= duels.lost * 0.2;
  }

  // Stamina bassa penalizza (tutti)
  const st = ms.stamina[pi] !== undefined ? ms.stamina[pi] : 100;
  if (st < 30) rating -= 0.5;
  else if (st < 50) rating -= 0.25;

  // Clamp 3.0-10.0, arrotonda a 0.5
  rating = Math.max(3.0, Math.min(10.0, rating));
  return Math.round(rating * 2) / 2;
}

function generateMatchEvent(ms) {
  const tacticBoost = TACTIC_BOOST[ms.tactic] || 0;

  // ── Controllo infortuni ───────────────────────────────────────────────
  // Per ogni giocatore in campo: se stamina < 15% E forma < 65% c'è rischio
  for (const [pk, pi] of Object.entries(ms.onField)) {
    if (ms.expelled.has(pi)) continue;
    const p  = ms.myRoster[pi]; if (!p) continue;
    const st = ms.stamina[pi] !== undefined ? ms.stamina[pi] : 100;
    if (st > INJ_STAMINA_THRESHOLD || p.fitness > INJ_FITNESS_THRESHOLD) continue;
    // Entrambe le condizioni soddisfatte: controlla injProb
    const injP = p.injProb !== undefined ? p.injProb : 0.04;
    // La probabilità viene scalata per il dt dell'evento (~10s su ~10min)
    // → divide per ~60 per avere una prob per-evento realistica
    if (Math.random() < injP / 2) {  // aumentato: era /3
      const shirt = ms.shirtNumbers[pi] || '?';
      ms.expelled.add(pi);
      if (!ms.injuries) ms.injuries = [];
      ms.injuries.push(pi);
      // Segna il giocatore come infortunato (persiste sulla scheda)
      p.injured = true;
      return {
        txt: '🚑 INFORTUNIO! ' + p.name + ' (#' + shirt + ') lascia il campo — stamina esaurita con forma precaria.',
        cls: 'exp',
        expelled: pi,
        isInjury: true,
        moverKey: 'my_' + pk,
      };
    }
  }

  // Calcola forza effettiva: include malus fuori-ruolo e stamina
  let myEffective = 0;
  const activePlayers = [];
  Object.entries(ms.onField).forEach(([pk, pi]) => {
    const p = ms.myRoster[pi];
    if (!p || ms.expelled.has(pi)) return;
    const roleFactor    = _roleEffectiveness(p, pk);
    const staminaFactor = 0.40 + (ms.stamina[pi] / 100) * 0.60; // range 0.40-1.00 (stanca → -60% efficacia)
    const eff           = p.overall * roleFactor * staminaFactor;
    myEffective += eff;
    if (pk !== 'GK') activePlayers.push({ pk, pi, p, eff });
  });
  // Conta giocatori attivi (esclusi espulsi)
  const activeCount = Object.entries(ms.onField)
    .filter(([pk, pi]) => !ms.expelled.has(pi)).length;
  // Normalizza sulla forza dei giocatori in campo
  // Se meno di 7: penalità esponenziale uomo in meno (~20% per giocatore mancante)
  const liveShortage = Math.max(0, 7 - activeCount);
  const liveShortageFactor = Math.pow(0.80, liveShortage);
  myEffective = (myEffective / Math.max(1, activeCount)) * activeCount / 7 * liveShortageFactor + tacticBoost;

  // Bonus spettatori in casa: fino al +5% sulla forza (proporzionale al riempimento)
  if (ms.isHome && ms.attendance > 0 && ms.capacity > 0) {
    var _fillBonus = Math.min(0.05, (ms.attendance / ms.capacity) * 0.05);
    myEffective *= (1 + _fillBonus);
  }

  const oppStr = ms.oppTeam.str * (ms.oppTeam._staminaFactor !== undefined ? ms.oppTeam._staminaFactor : 1.0);
  const tot    = myEffective + oppStr;
  const myCh   = myEffective / tot;
  const r      = Math.random();

  // ── ATTACCO MIO ──────────────────────────
  if (r < myCh * 0.35) {
    ms.myShots++;
    if (!activePlayers.length) return null;

    // Probabilità di scelta proporzionale all'efficacia
    const attacker = _weightedPick(activePlayers, x => x.eff);
    const tec      = attacker.p.stats?.tec ?? 50; // Tecnica attaccante (0-100)

    // ── Passaggio sbagliato: tecnica bassa → più errori in costruzione ──
    // Prob errore passaggio: da ~15% (tec=0) a ~2% (tec=100)
    const passErrProb = 0.15 - (tec / 100) * 0.13;
    if (Math.random() < passErrProb) {
      if (!ms.matchDuels[attacker.pi]) ms.matchDuels[attacker.pi] = { won:0, lost:0 };
      ms.matchDuels[attacker.pi].lost++;
      return {
        txt: '❌ Palla persa — ' + attacker.p.name + ' sbaglia il passaggio',
        cls: 'fl',
        ballTarget: { x: 0.45 + rnd(-0.1, 0.1), y: 0.3 + rnd(0, 0.4) },
      };
    }

    // ── Finalizzazione: tecnica influenza la prob gol ──
    // Bonus tecnica: da -0.04 (tec=0) a +0.04 (tec=100), centrato su tec=50
    const tecBonus  = (tec - 50) / 100 * 0.08;
    const goalProb  = 0.18 + ((myEffective - oppStr) / 500) + tecBonus * 0.5;

    if (Math.random() < goalProb) {
      ms.myScore++;
      attacker.p.goals++;
      ms.matchGoals[attacker.pi] = (ms.matchGoals[attacker.pi] || 0) + 1;
      // Duel vinto per l'attaccante
      if (!ms.matchDuels[attacker.pi]) ms.matchDuels[attacker.pi] = { won:0, lost:0 };
      ms.matchDuels[attacker.pi].won++;
      // Aggiorna parziale del periodo corrente
      if (ms.periodScores && ms.period >= 1 && ms.period <= 4) {
        ms.periodScores[ms.period - 1].my++;
      }
      const others = activePlayers.filter(x => x.pk !== attacker.pk);

      // ── Assist: giocatore con tecnica più alta ha più probabilità di servire ──
      const ast = others.length
        ? _weightedPick(others, x => 0.5 + (x.p.stats?.tec ?? 50) / 200)
        : null;
      if (ast) {
        ast.p.assists++;
        ms.matchAssists[ast.pi] = (ms.matchAssists[ast.pi] || 0) + 1;
      }
      return {
        txt: '⚽ GOL! ' + attacker.p.name + ' (#' + (ms.shirtNumbers[attacker.pi] || '?') + ') segna!' +
             (ast ? ' Assist: ' + ast.p.name : ''),
        cls: 'myg',
        ballTarget:  { x: 0.96, y: 0.40 + rnd(0, 0.20) },   // entra nella porta destra
        moverKey:    'my_' + attacker.pk,
        moverTarget: { x: 0.80, y: 0.50 },
        goalScored:  true, goalTeam: 'my', goalScorer: attacker.p.name,
      };
    } else {
      const oppGk = ms.oppRoster.find(p => p.role === 'POR');
      // Duel perso per l'attaccante sul tiro parato
      if (!ms.matchDuels[attacker.pi]) ms.matchDuels[attacker.pi] = { won:0, lost:0 };
      ms.matchDuels[attacker.pi].lost++;
      // Duel vinto per il nostro portiere se para l'avversario
      return {
        txt: 'Tiro di ' + attacker.p.name + ' — parata' + (oppGk ? ' di ' + oppGk.name : ''),
        cls: '',
        ballTarget:  { x: 0.78, y: 0.38 + rnd(0, 0.24) },   // tiro respinto dalla porta
        moverKey:    'my_' + attacker.pk,
        moverTarget: { x: 0.68, y: 0.50 },
      };
    }
  }

  // ── ATTACCO AVVERSARIO ───────────────────
  if (r > 1 - (1 - myCh) * 0.35) {
    ms.oppShots++;
    const goalProb = 0.18 + ((oppStr - myEffective) / 500);
    if (Math.random() < goalProb) {
      ms.oppScore++;
      // Aggiorna parziale del periodo corrente
      if (ms.periodScores && ms.period >= 1 && ms.period <= 4) {
        ms.periodScores[ms.period - 1].opp++;
      }
      // Sceglie un marcatore reale dall'oppRoster (se disponibile)
      var oppScorer = '';
      if (ms.oppRoster && ms.oppRoster.length > 0) {
        var oppFieldPlayers = ms._oppOnField
          ? ms._oppOnField.map(function(i){ return ms.oppRoster[i]; }).filter(function(p){ return p && p.role !== 'POR'; })
          : ms.oppRoster.filter(function(p){ return p && p.role !== 'POR'; });
        if (oppFieldPlayers.length > 0) {
          // Pesa per ruolo: ATT più propensi a segnare
          var weights = oppFieldPlayers.map(function(p){ return p.role==='ATT'?4: p.role==='CB'?2: p.role==='CEN'?3: 1; });
          var totalW = weights.reduce(function(s,w){ return s+w; }, 0);
          var oppGoalRnd = Math.random() * totalW;
          var chosen = oppFieldPlayers[0];
          for (var wi=0; wi<oppFieldPlayers.length; wi++) { oppGoalRnd -= weights[wi]; if (oppGoalRnd <= 0) { chosen = oppFieldPlayers[wi]; break; } }
          if (chosen) {
            oppScorer = chosen.name;
            // Aggiorna statistiche stagionali avversario
            chosen.goals = (chosen.goals || 0) + 1;
            // Traccia in oppMatchGoals per il dettaglio calendario
            if (!ms.oppMatchGoals) ms.oppMatchGoals = {};
            ms.oppMatchGoals[oppScorer] = (ms.oppMatchGoals[oppScorer] || 0) + 1;
            // Assign assist: 75% di probabilità, giocatore casuale tra quelli in campo
            if (Math.random() < 0.75 && oppFieldPlayers.length > 1) {
              var assister = oppFieldPlayers.find(function(p){ return p !== chosen; });
              if (assister) {
                assister.assists = (assister.assists || 0) + 1;
                if (!ms.oppMatchAssists) ms.oppMatchAssists = {};
                ms.oppMatchAssists[assister.name] = (ms.oppMatchAssists[assister.name] || 0) + 1;
              }
            }
          }
        }
      }
      return { txt: '⚽ ' + ms.oppTeam.name + ' segna! Gol subito' + (oppScorer ? ' (' + oppScorer + ')' : '') + '.', cls: 'og', ballTarget: { x: 0.04, y: 0.40 + rnd(0, 0.20) }, goalScored: true, goalTeam: 'opp', goalScorer: oppScorer || ms.oppTeam.abbr || ms.oppTeam.name };
    } else {
      const myGkIdx = ms.onField['GK'];
      const myGk = myGkIdx !== undefined ? ms.myRoster[myGkIdx] : null;
      if (myGk) {
        ms.mySaves++;
        myGk.saves = (myGk.saves || 0) + 1;
        // Traccia per portiere corrente (chiunque sia in porta, anche giocatore di movimento)
        if (!ms.gkSaves) ms.gkSaves = {};
        ms.gkSaves[myGkIdx] = (ms.gkSaves[myGkIdx] || 0) + 1;
      }
      return {
        txt: 'Parata' + (myGk ? ' di ' + myGk.name : '') + '!',
        cls: 'sv', ballTarget: { x: 0.22, y: 0.38 + rnd(0, 0.24) },   // parata
      };
    }
  }

  // ── EVENTO NEUTRO / FALLO ────────────────
  // Hard cap: se siamo già al massimo di espulsi non ci sono altri falli
  const foulProb = BASE_FOUL_PROB * (TACTIC_FOUL_MULT[ms.tactic] || 1.0);
  if (ms.expelled.size < MAX_EXPELLED && Math.random() < foulProb && activePlayers.length) {
    ms.myFouls++;

    // Selezione pesata: giocatori già ammoniti hanno peso minore
    const foulCandidates = activePlayers.map(x => ({
      ...x,
      foulWeight: YELLOW_WEIGHTS[Math.min(ms.tempExp[x.pi] || 0, 2)],
    })).filter(x => (ms.tempExp[x.pi] || 0) < MAX_TEMP_EXP);

    if (!foulCandidates.length) return { txt: pick(NEUTRAL_EVENTS), cls: '', ballTarget: { x: 0.5, y: 0.5 + rnd(-0.15, 0.15) } };

    const fp    = _weightedPick(foulCandidates, x => x.foulWeight);
    const pi    = fp.pi;
    const shirt = ms.shirtNumbers[pi] || '?';
    ms.tempExp[pi] = (ms.tempExp[pi] || 0) + 1;
    const count = ms.tempExp[pi];

    if (count >= MAX_TEMP_EXP) {
      ms.expelled.add(pi);
      return {
        txt: '🔴 ESPULSO! ' + fp.p.name + ' (#' + shirt + ') — 3ª espulsione temporanea.',
        cls: 'exp',
        expelled: pi,
        moverKey: 'my_' + fp.pk,
      };
    } else {
      return {
        txt: '🟡 Esp. temporanea (' + count + '/3) — ' + fp.p.name + ' (#' + shirt + ')',
        cls: 'fl',
        ballTarget: { x: 0.45 + rnd(-0.1, 0.1), y: 0.3 + rnd(0, 0.4) },
      };
    }
  }

  return { txt: pick(NEUTRAL_EVENTS), cls: '', ballTarget: { x: rnd(3, 7) / 10, y: rnd(3, 7) / 10 } };
}

// ── Selezione pesata da array ─────────────────
function _weightedPick(arr, weightFn) {
  let total = 0;
  arr.forEach(x => { total += weightFn(x); });
  let r = Math.random() * total;
  for (const x of arr) { r -= weightFn(x); if (r <= 0) return x; }
  return arr[arr.length - 1];
}

// ── Formatta mm:ss ────────────────────────────
function formatMatchTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ── Effettua un cambio ────────────────────────
function performSubstitution(ms, outPosKey, inRosterIdx) {
  const outRosterIdx = ms.onField[outPosKey];
  if (outRosterIdx === undefined) return null;
  const outPlayer = ms.myRoster[outRosterIdx];
  const inPlayer  = ms.myRoster[inRosterIdx];
  if (!outPlayer || !inPlayer) return null;
  ms.onField[outPosKey] = inRosterIdx;
  ms.bench = ms.bench.filter(i => i !== inRosterIdx);
  ms.bench.push(outRosterIdx);
  ms.subs++;
  return { outPlayer, inPlayer, posKey: outPosKey, outRosterIdx, inRosterIdx };
}

// ── Cambio forzato per espulsione definitiva ──
function forceSubstitutionExpelled(ms, expelledRosterIdx) {
  const posKey = Object.entries(ms.onField).find(([, pi]) => pi === expelledRosterIdx)?.[0];
  if (!posKey) return null;
  ms.bench.push(expelledRosterIdx);
  const sub = ms.bench.find(i =>
    i !== expelledRosterIdx && !ms.expelled.has(i) &&
    (posKey === 'GK' ? ms.myRoster[i]?.role === 'POR' : ms.myRoster[i]?.role !== 'POR')
  );
  if (sub !== undefined) {
    ms.onField[posKey] = sub;
    ms.bench = ms.bench.filter(i => i !== sub);
    ms.subs++;
    return { posKey, inPlayer: ms.myRoster[sub], outPlayer: ms.myRoster[expelledRosterIdx] };
  } else {
    delete ms.onField[posKey];
    return { posKey, inPlayer: null, outPlayer: ms.myRoster[expelledRosterIdx] };
  }
}

function getFinalScore(ms) {
  return {
    home: ms.isHome ? ms.myScore : ms.oppScore,
    away: ms.isHome ? ms.oppScore : ms.myScore,
  };
}

function getMatchReward(myScore, oppScore) {
  if (myScore > oppScore) return 75000;
  if (myScore === oppScore) return 25000;
  return 0;
}


/**
 * Logica del Motore di Gara
 */
function processMatchStep(match) {
    // Gestione Contropiede: 2, 3, 4 lanciano per 1, 5, 6
    if (match.tactic === 'CONTROPIEDE' && ['2', '3', '4'].includes(match.currentPossessor.pos)) {
        let potentialReceivers = match.team.filter(p => ['1', '5', '6'].includes(p.pos));
        if (potentialReceivers.length > 0) {
            match.instruction = 'LONG_PASS';
            match.targetPlayer = potentialReceivers[Math.floor(Math.random() * potentialReceivers.length)];
        }
    }

    // Tiro: se indicato dall'engine, attiva l'animazione verso la porta
    if (match.shouldShoot) {
        executeShot(match.ball, match.targetGoal);
    }
}

// All'interno della logica di gestione possesso (processStep)
function handlePossessionLogic(ms) {
    if (ms.tactic === 'counter' && ['2', '3', '4'].includes(ms.currentPossessor.pos)) {
        // Se chi ha palla è in posizione 2,3,4, cerca un compagno in 1,5,6 per lancio lungo
        let targets = ['1', '5', '6'];
        ms.nextAction = 'LONG_PASS';
        ms.actionTarget = targets[Math.floor(Math.random() * targets.length)];
    }
	
		// Nella logica di passaggio (processStep)
	if (ms.tactic === 'counter' && ['2', '3', '4'].includes(ms.currentPossessor.pos)) {
		// I difensori (2,3,4) cercano subito le ali o il centro (1,5,6) in avanti
		ms.preferredReceiverPos = ['1', '5', '6'];
	}
    
    if (ms.instruction === 'SHOOT') {
        // Logica tiro chiamata da UI o Engine
        executeShot(ms);
    }
}

// Da inserire nel ciclo principale del motore
function updateTacticalPhase() {
    const isMyTeamAttacking = (_ms.possession === 'my');

    // Applica a tutti i segnalini
    Object.keys(_ms.tokens).forEach(id => {
        let token = _ms.tokens[id];
        let isHome = id.startsWith('my_');

        if ((isMyTeamAttacking && isHome) || (!isMyTeamAttacking && !isHome)) {
            // SQUADRA IN ATTACCO: Target verso la porta avversaria
            token.targetX = isHome ? PLAY.oppNetX0 - 0.1 : PLAY.myNetX0 + 0.1;
        } else {
            // SQUADRA IN DIFESA: Rientro rapido verso la propria porta
            token.targetX = isHome ? PLAY.myNetX0 + 0.1 : PLAY.oppNetX0 - 0.1;
            
            // PRESSIONE FORTE: se attiva, il target diventa l'avversario
            if (_ms.tactic === 'press') {
                let oppId = isHome ? id.replace('my_', 'opp_') : id.replace('opp_', 'my_');
                if (_ms.tokens[oppId]) {
                    token.targetX = _ms.tokens[oppId].x + (isHome ? -0.02 : 0.02);
                    token.targetY = _ms.tokens[oppId].y;
                }
            }
        }
    });
}

// Dentro il loop di match.js
function updateMatchPhase(ms) {
    // Se la palla passa di mano, inverti i target di tutti i giocatori
    let attackingTeam = ms.ballPossession; 
    
    ms.players.forEach(p => {
        if (p.team === attackingTeam) {
            p.mode = 'ATTACK'; // Nuotano verso la porta avversaria
        } else {
            p.mode = 'DEFENSE'; // Nuotano verso la propria porta
        }
    });
}

// Logica per il possesso e il goal
function updateBallLogic() {
    if (_ms.phase === 'goal') {
        // Palla dietro il portiere nel rettangolo di porta
        var goalX = (_ms.lastScorer === 'home') ? 0.95 : 0.05; 
        _ball.x = goalX;
        _ball.y = 0.5; // Centro porta
    } else if (_ms.status === 'saved') {
        // Aggancio al portiere
        var gk = _tokens[_ms.possession + '_GK'];
        if (gk) {
            _ball.x = gk.x;
            _ball.y = gk.y;
        }
    }
}

function updateBall(ms) { // Aggiungi ms qui tra le parentesi
   ms.ballStatus = 'passing'; 
}

function startLiveMatch(data) {
    // Assicurati di passare 'data' (o come si chiama l'oggetto con le squadre)
    var ms = createMatchState(data); 
    // ...
}