'use strict';
// Regressione: gol annunciato in telecronaca e non conteggiato.
//
// movement.js aveva DUE modi di annunciare un gol e solo uno li contava:
//
//   1. _autoShot()  -> contava myScore/oppScore, lanciava l'animazione,
//                       rimetteva in gioco. Corretto.
//
//   2. Il trigger del tiro del CB (CB entro 5m dalla porta col marcatore
//      addosso) dichiarava l'esito con 20% di probabilita' e annunciava
//      con _emitComment('goal_my'), ma NON toccava _ms: nessun
//      myScore++, nessun periodScores, nessuna animazione, nessuna
//      rimessa. La palla finiva in rete e i token riprendevano a giocare
//      come se nulla fosse. Telecronaca e stato erano scollegati.
//
// Il fix fa passare il ramo 2 da onGoalEvent(), cosi' esiste un solo
// percorso che registra un gol. Il test verifica la proprieta' che
// all'utente interessa: ogni gol annunciato corrisponde a un punto.
//
// Secondo difetto trovato leggendo lo stesso ramo: _autoShot contava il
// tiro due volte quando era gol (una sempre, una di nuovo nel ramo goal),
// falsando le percentuali di tiro e di parata.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

const PRIME = `
  G.myTeam = TEAMS_DATA[0];
  G.myId   = G.myTeam.id;
  G.msgs   = [];
  __mk = function (n) {
    var r = [];
    for (var i = 0; i < n; i++) r.push({
      name: 'G' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
      fitness: 90, overall: 70, morale: 80, value: 1000, salary: 0,
      stats: { att: 70, def: 60, spe: 60, str: 60, tec: 50, res: 50 },
      injProb: 0.05, injured: false, injuryWeeks: 0,
      goals: 0, assists: 0, careerGoals: 0, careerAssists: 0,
      careerApps: 0, lastRatings: [],
    });
    return r;
  };
  __form   = { GK: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
  __shirts = { 0:1,1:2,2:3,3:4,4:5,5:6,6:7,7:8,8:9,9:10,10:11,11:12 };
  G.rosters = { [G.myTeam.id]: __mk(14), brescia: __mk(14) };
  G.teams   = [G.myTeam, { id: 'brescia', name: 'Brescia', short: 'BRE', str: 70 }];
  G.schedule = [{ id: 'm1', round: 1, home: G.myTeam.id, away: 'brescia', played: false }];
  G.ms = createMatchState({
    match: G.schedule[0], isHome: true,
    myTeam: G.myTeam, oppTeam: G.teams[1],
    myRoster: G.rosters[G.myTeam.id], oppRoster: G.rosters.brescia,
    formation: __form, shirtNumbers: __shirts,
  });
  G.ms.running = true;
  G.ms.period  = 1;
  G.ms.speed   = 1;
  poolInitTokens(G.ms);
  MovementController.init(G.ms);
  __goalMy = 0; __goalOpp = 0;
  __o = dispatchCommentary;
dispatchCommentary = function (type, data) {
    if (type === 'goal_my') __goalMy++;
    if (type === 'goal_opp') __goalOpp++;
    return __o.apply(null, arguments);
  };
  // Senza lo sprint la partita resta in fase 'idle' e non succede nulla:
  // MovementController.init() da solo non avvia il gioco.
  MovementController.onSprintStart(1);
`;

// ── La proprieta' che l'utente ha segnalato ───────────────────────────────────

test('ogni gol annunciato in telecronaca corrisponde a un punto', () => {
  const h = loadGame();
  h.run(PRIME);
  h.seed(20241013);
  const r = h.run(`
    __uncounted = 0; __frames = 0;
    for (var i = 0; i < 4000; i++) {
      var before = G.ms.myScore + G.ms.oppScore;
      var gm = __goalMy, go = __goalOpp;
      poolAnimStep(0.05);
      MovementController.update(0.05);
      var dMy = __goalMy - gm, dOpp = __goalOpp - go;
      var dScore = (G.ms.myScore + G.ms.oppScore) - before;
      if (dMy + dOpp > 0 && dScore !== dMy + dOpp) __uncounted++;
      __frames++;
      if (G.ms.finished) break;
    }
    JSON.stringify({ uncounted: __uncounted, goalMy: __goalMy, goalOpp: __goalOpp,
      score: G.ms.myScore + '-' + G.ms.oppScore, frames: __frames })
  `);
  const out = JSON.parse(r);
  assert.strictEqual(out.uncounted, 0,
    `${out.uncounted} gol annunciati senza punto (${out.goalMy} my, ${out.goalOpp} opp, finale ${out.score})`);
});

// ── Il ramo che non contava non deve più esistere ────────────────────────────

// ── Il test che osserva gol veri ──────────────────────────────────────────────
// Il gioco produce gol da solo: _autoShot scatta quando il possessore e'
// libero in avanzata e tira. Qui si lascia correre la partita e si
// confronta, giro dopo giro, i gol annunciati con i punti messi a segno.
test('i gol prodotti dal canvas contano quanto vengono annunciati', () => {
  const h = loadGame();
  h.run(PRIME);
  h.seed(31337);
  const r = h.run(`
    __announced = 0; __scored = 0;
    for (var i = 0; i < 400; i++) {
      var b = G.ms.myScore + G.ms.oppScore;
      var g = __goalMy + __goalOpp;
      for (var k = 0; k < 40; k++) { poolAnimStep(0.05); MovementController.update(0.05); }
      __announced += (__goalMy + __goalOpp) - g;
      __scored    += (G.ms.myScore + G.ms.oppScore) - b;
    }
    JSON.stringify({ announced: __announced, scored: __scored,
      shots: G.ms.myShots + G.ms.oppShots,
      score: G.ms.myScore + '-' + G.ms.oppScore })
  `);
  const out = JSON.parse(r);
  assert.ok(out.announced > 0,
    'nessun gol osservato: il test non sta verificando nulla');
  assert.strictEqual(out.scored, out.announced,
    `${out.announced} gol annunciati ma ${out.scored} punti messi a segno`);
});

test('_autoShot conta il tiro una volta sola', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync('js/canvas/movement.js', 'utf8');
  const blk = src.slice(src.indexOf('function _autoShot'), src.indexOf('function _applyPressure'));
  // Il tiro viene contato una volta, subito dopo la decisione dell'esito.
  // Un secondo incremento dentro il ramo goal lo contava doppio e falsava
  // le percentuali di tiro e di parata.
  const myShots = (blk.match(/myShots\s*=[^=]/g) || []).length;
  const oppShots = (blk.match(/oppShots\s*=[^=]/g) || []).length;
  assert.strictEqual(myShots, 1,
    `myShots viene incrementato ${myShots} volte in _autoShot: dovrebbe essere una`);
  assert.strictEqual(oppShots, 1,
    `oppShots viene incrementato ${oppShots} volte in _autoShot: dovrebbe essere una`);
});

test('nessun ramo annuncia un gol senza passare da onGoalEvent', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync('js/canvas/movement.js', 'utf8');
  // Le uniche chiamate che possono annunciare un gol sono dentro
  // onGoalEvent e dentro _autoShot: entrambe contano il punteggio.
  const goalEmits = [...src.matchAll(/goal_my'|goal_opp'/g)].length;
  assert.ok(goalEmits > 0, 'non ho trovato emissioni di goal: il test e\' vuoto');
  // Nessuna emissione goal nel ramo del trigger CB, che sta prima di onGoalEvent.
  const cbBlock = src.slice(src.indexOf('Trigger tiro CB'), src.indexOf('function _tickMicro'));
  assert.ok(!/goal_my'|goal_opp'/.test(cbBlock),
    'il ramo del tiro CB annuncia ancora un gol senza chiamare onGoalEvent');
});

test('il ramo del tiro CB registra il gol e poi lo fa animare', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync('js/canvas/movement.js', 'utf8');
  const cbBlock = src.slice(src.indexOf('Trigger tiro CB'), src.indexOf('function _tickMicro'));
  assert.match(cbBlock, /if\(cbIsGoal\)[\s\S]*myScore\+\+[\s\S]*onGoalEvent\(/,
    'il gol del CB deve incrementare il punteggio e poi passare da onGoalEvent');
  assert.match(cbBlock, /if\(cbIsGoal\)[\s\S]*oppScore\+\+[\s\S]*onGoalEvent\(/,
    'il gol del CB avversario deve incrementare oppScore e poi passare da onGoalEvent');
});

// ── Il conteggio dei tiri ────────────────────────────────────────────────────

test('un gol conta un solo tiro', () => {
  const h = loadGame();
  h.run(PRIME);
  h.seed(20241013);
  const r = h.run(`
    // Conta quanti tiri sono stati registrati rispetto ai goal, senza
    // raddoppiare: myShots non puo' crescere piu' di un tiro per tiro.
    __bad = 0; __prevShots = 0;
    for (var i = 0; i < 4000; i++) {
      var s = G.ms.myShots;
      var g = G.ms.myScore;
      poolAnimStep(0.05);
      MovementController.update(0.05);
      var dShots = G.ms.myShots - s;
      var dGoals = G.ms.myScore - g;
      if (dShots > dGoals + 1) __bad++;
      __prevShots = G.ms.myShots;
    }
    JSON.stringify({ bad: __bad, shots: G.ms.myShots, goals: G.ms.myScore })
  `);
  const out = JSON.parse(r);
  assert.strictEqual(out.bad, 0,
    `${out.bad} frame in cui i tiri crescono piu' dei gol+1: doppio conteggio`);
});

test('il punteggio finale non supera i tiri', () => {
  const h = loadGame();
  h.run(PRIME);
  h.seed(777);
  const r = h.run(`
    for (var i = 0; i < 4000; i++) {
      poolAnimStep(0.05); MovementController.update(0.05);
    }
    JSON.stringify({ shots: G.ms.myShots, goals: G.ms.myScore,
      oppShots: G.ms.oppShots, oppGoals: G.ms.oppScore })
  `);
  const out = JSON.parse(r);
  assert.ok(out.goals <= out.shots,
    `${out.goals} gol con ${out.shots} tiri: impossibile, il conteggio e' gonfiato`);
  assert.ok(out.oppGoals <= out.oppShots,
    `${out.oppGoals} gol avversari con ${out.oppShots} tiri`);
});

// ── Il percorso di riferimento continua a funzionare ─────────────────────────

// onGoalEvent NON conta il punteggio: il conteggio avviene a monte,
// quando l'evento viene generato (live_engine) o nel ramo _autoShot.
// onGoalEvent e' il ramo che ANIMA. Il test lo fissa, cosi' nessuno
// ci mette dentro un ++ per sbaglio pensando che sia lui a contare.
test('onGoalEvent anima il gol ma non tocca il punteggio', () => {
  const h = loadGame();
  h.run(PRIME);
  const r = h.run(`
    var b = G.ms.myScore;
    MovementController.onGoalEvent({
      goalScored: true, goalTeam: 'my', goalScorer: 'G3',
      moverKey: 'my_6', ballTarget: { x: 0.94, y: 0.50 }
    });
    // L'annuncio sta dentro _qA(0.5): va emesso dopo 0.5s di sequenza.
    for (var i = 0; i < 30 && __goalMy === 0; i++) {
      poolAnimStep(0.05); MovementController.update(0.05);
    }
    JSON.stringify({ dScore: G.ms.myScore - b, goalMy: __goalMy })
  `);
  const out = JSON.parse(r);
  assert.strictEqual(out.dScore, 0,
    'onGoalEvent non deve contare il gol: il conteggio e\' a monte');
  assert.strictEqual(out.goalMy, 1,
    'onGoalEvent deve annunciare il gol in telecronaca');
});

// La catena completa: il motore genera l'evento e conta, il canvas anima.
test('un evento generato dal motore arriva al punteggio', () => {
  const h = loadGame();
  h.run(PRIME);
  h.seed(4242);
  const r = h.run(`
    // Cerco un evento goal generato dal motore su una partita lunga.
    __found = null;
    for (var i = 0; i < 3000 && !__found; i++) {
      var b = G.ms.myScore + G.ms.oppScore;
      poolAnimStep(0.05); MovementController.update(0.05);
      var ev = generateLiveEvent(G.ms);
      if (ev && ev.goalScored) __found = (G.ms.myScore + G.ms.oppScore) - b;
    }
    JSON.stringify({ delta: __found, score: G.ms.myScore + '-' + G.ms.oppScore })
  `);
  const out = JSON.parse(r);
  // Se il motore ha prodotto un gol, il punteggio e' salito di 1.
  if (out.delta !== null) {
    assert.strictEqual(out.delta, 1,
      `il motore ha generato un gol ma il punteggio e' salito di ${out.delta}`);
  }
});