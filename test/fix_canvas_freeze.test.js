'use strict';
// Regressione: le pedine si congelano mentre la telecronaca continua.
//
// Il sintomo che l'utente ha segnalato e': "durante il gioco le pedine
// rimangono quasi tutto il tempo ferme ma la telecronaca scorre".
//
// La causa non e' il motore degli eventi, che continua a funzionare, ma la
// macchina a fasi di movement.js. Le cinetiche (gol, rimessa, rigore)
// riportano _phase a 'play' con un passo della coda _seq. Ma onShot(),
// onSave() e onPenaltyKick() iniziavano svuotando quella coda:
//
//     _seq = []; _seqActive = false;
//
// Quel vuoto cancellava anche il passo che riportava la fase a 'play'.
// La partita restava quindi in 'goal_cel' per il resto del tempo:
// update() continua a girare ma salta il ramo if(_phase==='play'), quindi
// niente _tickMicro(), niente _updateAllTargets(), e i target dei token
// restano quelli dell'ultimo frame. Le pedine arrivano dove devono e si
// fermano. La telecronaca invece dipende da G.ms.lastActionTime e
// continua a scorrere: esattamente quello che si vede.
//
//Quanto e' facile che accada dipende dalla velocita'. Gli eventi live
// arrivano ogni 18-25 secondi di GOLLO, ma la coda del gol dura 4.55
// secondi REALI (perche' _tickSeq riceve il dt non scalato). A velocita' 1
// la collisione e' rara; a velocita' 5 un evento arriva ogni ~4 secondi
// reali, a velocita' 10 ogni ~2. Per questo il difetto peggiora
// aumentando la velocita' di gioco.
//
// Il test non usa hook interni: misura quello che l'utente vede, cioe'
// se i token si muovono ancora.

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
  MovementController.onSprintStart(1);

  // Utility usate dai test: avanza il clock reale e misura quanto si
  // spostano i token di campo (i portieri hanno x fissa sulla linea).
  __DT = 1 / 30;
  __step = function (frames) {
    for (var i = 0; i < frames; i++) {
      poolAnimStep(__DT, G.ms.speed);
      MovementController.update(__DT);
    }
  };
  __fieldKeys = function () {
    var toks = poolGetTokens();
    return Object.keys(toks).filter(function (k) {
      return !toks[k].isGK && !toks[k].expelled;
    });
  };
  // Spostamento totale dei token di campo fra due istanti.
  __travel = function (keys, snapshot) {
    var toks = poolGetTokens(), tot = 0;
    for (var i = 0; i < keys.length; i++) {
      var t = toks[keys[i]], s = snapshot[i];
      tot += Math.sqrt((t.x - s.x) * (t.x - s.x) + (t.y - s.y) * (t.y - s.y));
    }
    return tot;
  };
  __snap = function (keys) {
    var toks = poolGetTokens();
    return keys.map(function (k) { return { x: toks[k].x, y: toks[k].y }; });
  };
`;

// Un evento di qualunque tipo che capita durante una cinetica non deve
// poter impedire alla partita di riprendere.
test('un evento durante il gol non lascia le pedine ferme per sempre', () => {
  const h = loadGame();
  h.run(PRIME);

  const r = h.run(`
    __step(360);                      // 12s: il calcio d'avvio si assesta

    // Un gol: la fase entra in 'goal_cel' e la coda deve riportarla a 'play'.
    MovementController.onGoalEvent({
      goalScored: true, goalTeam: 'my', goalScorer: 'G3',
      moverKey: 'my_3', ballTarget: { x: 0.95, y: 0.5 },
    });
    __step(30);                       // 1s: siamo dentro la cinetica

    // Arriva un tiro qualsiasi, mentre il gol e' ancora in corso.
    MovementController.onShot({
      moverKey: 'opp_3', ballTarget: { x: 0.12, y: 0.5 },
      moverTarget: { x: 0.20, y: 0.5 },
    });

    __step(360);                      // 12s: la cinetica deve concludersi
    G.ms.running = true;              // la pausa del gol si chiude

    var keys = __fieldKeys(), prima = __snap(keys);
    __step(240);                      // 8s di gioco libero
    JSON.stringify({ viaggio: __travel(keys, prima), token: keys.length })
  `);

  const out = JSON.parse(r);
  assert.ok(out.token > 0, 'nessun token di campo: il test non sta verificando nulla');
  // Con il difetto i token restano fermi e il viaggio e' esattamente 0:
  // i target non vengono piu' aggiornati, quindi nessuno si muove.
  assert.ok(out.viaggio > 0.5,
    `i token non si muovono piu' dopo un evento durante il gol (viaggio ${out.viaggio.toFixed(3)}): il canvas e' congelato`);
});

// Lo stesso vale per una parata: anche onSave cancellava la coda.
test('una parata durante il gol non lascia le pedine ferme per sempre', () => {
  const h = loadGame();
  h.run(PRIME);

  const r = h.run(`
    __step(360);
    MovementController.onGoalEvent({
      goalScored: true, goalTeam: 'opp', goalScorer: 'G3',
      moverKey: 'opp_3', ballTarget: { x: 0.05, y: 0.5 },
    });
    __step(30);
    MovementController.onSave({ shotTeam: 'opp', moverKey: 'opp_6' });
    __step(360);
    G.ms.running = true;
    var keys = __fieldKeys(), prima = __snap(keys);
    __step(240);
    JSON.stringify({
      viaggio: __travel(keys, prima),
      token: keys.length,
      fase: MovementController.phase(),
    })
  `);

  const out = JSON.parse(r);
  // Il difetto che questo test protegge non e' "quanto si muovono le pedine",
  // ma che un evento arrivato durante una cinetica lasci la partita
  // incastata in 'goal_cel': la coda che riporta la fase a 'play' veniva
  // svuotata e i target non venivano piu' aggiornati.
  //
  // Dopo che la parata e' diventata geometrica il conteso e' diverso: se il
  // portiere non arriva in tempo la palla resta nei dintorni della porta e la
  // contendono i due piu' vicini per squadra. Le altre pedine sono gia' ai
  // loro target, quindi il viaggio totale scende sotto la vecchia soglia
  // pur senza che sia successo niente di anomalo. Per questo qui si verifica
  // la fase e il fatto che qualcuno stia ancora andando a prendere la palla,
  // che e' il sintomo reale del difetto.
  assert.strictEqual(out.fase, 'play',
    `la partita e' rimasta in ${out.fase} dopo una parata durante il gol: il canvas e' congelato`);
  assert.ok(out.viaggio > 0,
    `nessuna pedina si muove dopo una parata durante il gol (viaggio ${out.viaggio.toFixed(3)}): il canvas e' congelato`);
});

// La ripresa del gioco non deve dipendere da un timer di tempo reale:
// l'ultimo passo della rimessa era in un setTimeout(350ms), che non
// scatta con il clock di gioco e non scatta affatto se la partita resta
// in pausa. Ora e' un passo della coda, come gli altri.
test('la ripresa dopo il gol non dipende da un timer di tempo reale', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync('js/canvas/movement.js', 'utf8');
  const goal = src.slice(src.indexOf('function onGoalEvent'), src.indexOf('function onShot'));
  assert.ok(goal.length > 0, 'onGoalEvent non trovato');
  // Il ripristino di _phase='play' deve stare nella coda _qA.
  const ripristini = goal.match(/_phase\s*=\s*'play'/g) || [];
  assert.ok(ripristini.length > 0, 'onGoalEvent non riporta mai la fase a play');
  ripristini.forEach(function (m) {
    const i = goal.indexOf(m);
    const finestra = goal.slice(Math.max(0, i - 400), i);
    assert.ok(!/setTimeout/.test(finestra),
      'il ripristino della fase a play e' + " dentro un setTimeout: usa la coda _qA");
  });
});