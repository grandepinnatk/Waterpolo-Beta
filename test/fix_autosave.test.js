'use strict';
// Regressione FIX 6 — autoSave() a meta' partita congelava metà partita.
//
// Lo stato live (G.ms) non viene serializzato, ma le rose sì, e ms.myRoster è
// lo stesso oggetto di G.rosters[G.myId]. Durante la partita quei giocatori
// vengono mutati sul posto: p.injured sugli infortuni live e il fitness perso.
//
// Salvare a meta' partita persisteva quelle modifiche mentre la partita
// risultava ancora non disputata nel calendario. Ricaricando, l'infortunio o la
// perdita di forma venivano applicati una seconda volta.
//
// La sostituzione che faceva scattare il salvataggio vive in
// ms.onField/ms.bench, che non vengono serializzati: quel salvataggio non
// conservava niente della sostituzione.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

function prime(h) {
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    G.myId   = G.myTeam.id;
    G.budget = 500000;
    G.msgs   = [];
    G.stars  = 0;
    G.phase  = 'regular';
    G.stand  = {};
    [G.myTeam.id, 'brescia'].forEach(id => {
      G.stand[id] = { id, g:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 };
    });
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
    G.rosters = { [G.myTeam.id]: __mk(14), brescia: __mk(14) };
    G.teams   = [G.myTeam, { id: 'brescia', name: 'Brescia', short: 'BRE', str: 70, budget: 500000 }];
    G.schedule = [{ id: 'm1', round: 1, home: G.myTeam.id, away: 'brescia', played: false }];
    __mine = G.rosters[G.myTeam.id];

    G.ms = createMatchState({
      match: G.schedule[0], isHome: true,
      myTeam: G.myTeam, oppTeam: G.teams[1],
      myRoster: G.rosters[G.myTeam.id], oppRoster: G.rosters.brescia,
      formation: __form, shirtNumbers: __shirts,
    });
    G.ms.running = true;
    G.ms._everOnField = new Set(Object.values(G.ms.onField));

    // confirmSub chiama la vista del campo, che il mio stub DOM non copre.
    poolUpdateToken = function () {};
  `);
}

// Conta quanti salvataggi sono finiti a localStorage.
function wireStore(h) {
  h.run(`
    __saves = 0;
    __store = {};
    localStorage.setItem = function (k, v) { __store[k] = v; __saves++; };
    localStorage.getItem = function (k) { return __store[k] === undefined ? null : __store[k]; };
    G._currentSlot = 0;
  `);
}

const saves = (h) => h.run('__saves');

test('FIX 6: autoSave non scrive mentre la partita e\' in corso', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);

  h.run('autoSave()');
  assert.strictEqual(saves(h), 0,
    'autoSave ha scritto un salvataggio a meta\' partita');
});

test('FIX 6: la sostituzione non salva piu\' a meta\' partita', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);

  // Squadra in panchina pronta per entrare al posto del centrocampo.
  h.run('__out = G.ms.onField["2"]; __in = G.ms.bench[0];');
  h.run('G.ms.subOut = __out; G.ms.subIn = __in;');
  h.run('confirmSub()');

  assert.strictEqual(saves(h), 0,
    'confirmSub ha chiamato autoSave: la sostituzione vive in G.ms, che non viene serializzato');
});

test('FIX 6: le rose non vengono scritte a meta\' partita', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);

  // Infortunio live: scrive sugli oggetti reali della rosa, non su una copia.
  h.run('__p = G.ms.myRoster[3]; __p.injured = true; __p.injuryWeeks = 3; __p.fitness = 55;');
  h.run('autoSave()');

  const stored = h.run('Object.keys(__store).length');
  assert.strictEqual(stored, 0,
    'le rose non devono essere serializzate a meta\' partita, altrimenti l\'infortunio viene congelato');
});

test('FIX 6: a fine partita il salvataggio avviene normalmente', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);

  // _doEndMatch azzera G.ms prima di chiamare autoSave: il salvataggio di fine
  // partita deve passare, altrimenti la fix romperebbe il salvataggio vero.
  h.run('_doEndMatch()');
  assert.ok(saves(h) > 0,
    'il salvataggio di fine partita non e\' avvenuto: la guardia ha bloccato il salvataggio utile');
});

test('FIX 6: la guardia lascia passare i salvataggi fuori partita', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);

  h.run('G.ms = null; autoSave()');
  assert.ok(saves(h) > 0, 'fuori partita si deve poter salvare normalmente');
});

test('FIX 6: partita ferma ma non finita si puo\' ancora salvare', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);

  // In pausa l'utente sta ancora giocando la partita, ma la rosa non viene
  // mutata: la guardia guarda a running, non all'esistenza di G.ms.
  h.run('G.ms.running = false; autoSave()');
  assert.ok(saves(h) > 0,
    'in pausa il salvataggio dovrebbe passare: nessun giocatore e\' stato mutato');
});

test('FIX 6: G.ms non viene serializzato nemmeno a fine partita', () => {
  const h = loadGame();
  prime(h);
  wireStore(h);
  h.run('_doEndMatch()');

  assert.ok(saves(h) > 0, 'il salvataggio di fine partita deve esserci');
  const keys = h.run('Object.keys(__store).join(",")');
  assert.ok(keys.includes('wp_slot_'),
    'il salvataggio deve usare le chiavi degli slot: ' + keys);
  // Il payload non deve contenere lo stato live.
  const raw = h.run('JSON.stringify(__store).includes("\\"ms\\"")');
  assert.strictEqual(raw, false, 'lo stato della partita live non deve finire nel salvataggio');
});
