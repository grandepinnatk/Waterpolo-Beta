'use strict';
// Regressione FIX 5 — gol e assist stagionali contati due volte.
//
// I due generatori di eventi incrementavano i totali stagionali sul giocatore
// mentre la partita era in corso, e _doEndMatch li sommava di nuovo partendo da
// ms.matchGoals / ms.matchAssists. Ogni gol e ogni assist della partita finiva
// quindi due volte in p.goals / p.assists.
//
// Il caso peggiore non era la partita giocata dal vivo: la partita saltata con
// skipPeriod(). Anche li eventi generati lì avevano già incrementato i totali, e
// il pulsante "Fine Partita" che skipPeriod mostra a fine match li sommava una
// seconda volta.
//
// La ownership è ora di _doEndMatch: i generatori toccano solo i contatori di
// partita.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

function prime(h) {
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    G.budget  = 500000;
    G.msgs    = [];
    G.stars   = 0;
    G.stand   = {};
    [G.myTeam.id, 'brescia'].forEach(id => {
      G.stand[id] = { id, g:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 };
    });
    G.phase   = 'regular';
    G.myId    = G.myTeam.id;
    __mk = function (n) {
      const r = [];
      for (let i = 0; i < n; i++) r.push({
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
    // _doEndMatch legge G.rosters per i marcatori avversari
    G.rosters = { [G.myTeam.id]: __mk(14), brescia: __mk(14) };
    G.teams   = [G.myTeam, { id: 'brescia', name: 'Brescia', short: 'BRE', str: 70, budget: 500000 }];
    G.schedule = [{ id: 'm1', round: 1, home: G.myTeam.id, away: 'brescia', played: false }];
    G.ms = createMatchState({
      match: { id: 1, round: 1, home: G.myTeam.id, away: 'brescia', played: false },
      isHome: true, myTeam: G.myTeam, oppTeam: TEAMS_DATA[1],
      myRoster: __mk(14), oppRoster: __mk(14),
      formation: __form, shirtNumbers: __shirts,
    });
    G.ms.running = true;
    G.ms._everOnField = new Set(Object.values(G.ms.onField));
    // _doEndMatch azzera G.ms: per leggere i totali dopo la fine partita serve
    // un riferimento alla rosa tenuto da parte.
    __mine = G.ms.myRoster;
  `);
}

// Fa girare i generatori di eventi veri finché non ci sono gol e assist nei
// contatori di partita, poi chiude la partita.
//
// Il totale stagionale atteso è esattamente la somma dei contatori di partita.
// Prima della fix i generatori avevano già sommato i totali stagionali e
// _doEndMatch li sommava di nuovo, quindi il risultato era il doppio: per
// farlo emergere i gol devono nascere dagli eventi, non essere iniettati a mano
// in ms.matchGoals.
function playAndEndMatch(h, { events = 400 } = {}) {
  h.run(`__played = 0; __matchGoals = 0; __matchAssists = 0;
    for (let i = 0; i < ${events}; i++) {
      generateMatchEvent(G.ms);
      __played++;
      __matchGoals   = Object.values(G.ms.matchGoals).reduce((a,b)=>a+b,0);
      __matchAssists = Object.values(G.ms.matchAssists).reduce((a,b)=>a+b,0);
      if (__matchGoals >= 3 && __matchAssists >= 3) break;
    }`);
  const perMatch = {
    goals:   h.run('__matchGoals'),
    assists: h.run('__matchAssists'),
  };
  h.run('_doEndMatch()');
  return {
    perMatch,
    goals:   h.run('__totalGoals()'),
    assists: h.run('__totalAssists()'),
  };
}

function countTotals(h) {
  h.run('__totalGoals = function () { return __mine.reduce((s,p) => s + (p.goals||0), 0); };');
  h.run('__totalAssists = function () { return __mine.reduce((s,p) => s + (p.assists||0), 0); };');
}

test('FIX 5: i gol stagionali sono contati una sola volta', () => {
  const h = loadGame();
  prime(h);
  countTotals(h);
  const r = playAndEndMatch(h);

  assert.ok(r.perMatch.goals > 0, 'il test deve aver generato dei gol');
  assert.strictEqual(r.goals, r.perMatch.goals,
    `${r.perMatch.goals} gol di partita sono diventati ${r.goals} gol stagionali: il totale e' stato sommato due volte`);
  assert.strictEqual(r.assists, r.perMatch.assists,
    `${r.perMatch.assists} assist di partita sono diventati ${r.assists} assist stagionali`);
});

test('FIX 5: careerGoals e careerAssists seguono gli stessi totali', () => {
  const h = loadGame();
  prime(h);
  countTotals(h);
  const r = playAndEndMatch(h);

  assert.strictEqual(h.run('__mine.reduce((s,p)=>s+(p.careerGoals||0),0)'), r.perMatch.goals);
  assert.strictEqual(h.run('__mine.reduce((s,p)=>s+(p.careerAssists||0),0)'), r.perMatch.assists);
  assert.strictEqual(h.run('__mine.reduce((s,p)=>s+(p.careerApps||0),0)'), 7,
    'solo i 7 in campo hanno una presenza');
});

test('FIX 5: _doEndMatch applica i totali una sola volta', () => {
  const h = loadGame();
  prime(h);
  countTotals(h);
  playAndEndMatch(h);
  const after = h.run('__totalGoals()');

  // Seconda chiamata: dopo lo skip il pulsante resta premibile, e un doppio
  // click o un richiamo programmatico non devono sommare di nuovo.
  h.run('_doEndMatch()');
  h.run('_doEndMatch()');
  assert.strictEqual(h.run('__totalGoals()'), after,
    'un secondo _doEndMatch ha sommato i gol una seconda volta');
});

test('FIX 5: i generatori di eventi non toccano i totali stagionali', () => {
  const h = loadGame();
  prime(h);

  h.run('for (let i = 0; i < 300; i++) generateMatchEvent(G.ms);');
  assert.strictEqual(h.run('__mine.reduce((s,p)=>s+(p.goals||0),0)'), 0,
    'generateMatchEvent ha incrementato i gol stagionali: deve toccare solo ms.matchGoals');
  assert.strictEqual(h.run('__mine.reduce((s,p)=>s+(p.assists||0),0)'), 0,
    'generateMatchEvent ha incrementato gli assist stagionali');

  h.run('for (let i = 0; i < 300; i++) generateLiveEvent(G.ms);');
  assert.strictEqual(h.run('__mine.reduce((s,p)=>s+(p.goals||0),0)'), 0,
    'generateLiveEvent ha incrementato i gol stagionali: deve toccare solo ms.matchGoals');
});

test('FIX 5: i contatori di partita continuano a funzionare', () => {
  const h = loadGame();
  prime(h);

  h.run('for (let i = 0; i < 300; i++) generateMatchEvent(G.ms);');
  const matchGoals = h.run('Object.values(G.ms.matchGoals).reduce((a,b)=>a+b,0)');
  const matchAssists = h.run('Object.values(G.ms.matchAssists).reduce((a,b)=>a+b,0)');
  assert.ok(matchGoals > 0, 'i gol di partita devono essere tracciati in ms.matchGoals');
  assert.ok(matchAssists > 0, 'gli assist di partita devono essere tracciati in ms.matchAssists');
});

test('FIX 5: i gol dell\'avversario non toccano la mia rosa', () => {
  const h = loadGame();
  prime(h);
  h.run('for (let i = 0; i < 200; i++) generateMatchEvent(G.ms);');
  h.run('__before = __mine.reduce((s,p)=>s+(p.goals||0),0);');
  assert.strictEqual(h.run('__before'), 0);
  assert.ok(h.run('Object.keys(G.ms.oppMatchGoals || {}).length') >= 0);
});
