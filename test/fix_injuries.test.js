'use strict';
// Regressione FIX 3 — gli infortuni simulati non esistevano.
//
// simulateInjuries era definita dentro simulateMatchStats, quindi non era
// visibile al modulo. main.js la chiamava dietro la guardia
// `typeof simulateInjuries === 'function'`, che valutava sempre false: la rosa
// del giocatore non si infortunava mai nelle giornate simulate.
//
// La funzione è ora globale e simulateMatchStats la applica alle rose delle
// partite IA-IA quando il chiamante passa opts.injuries. Insieme agli
// infortuni è nato tickInjuries, perché il decremento delle settimane esisteva
// solo per la mia rosa: senza quello gli infortuni IA sarebbero permanenti.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

const NO_INJ = 0; // injProb 0 → immune, serve per i test di controllo

// Gli array e gli oggetti creati dentro la vm hanno prototype diverso da quelli
// dell'host: deepStrictEqual li rifiuta anche a parità di struttura. Qui li
// ricostruiamo nel realm dell'host.
const host = (v) => JSON.parse(JSON.stringify(v));

function rosterOf(h, { n = 14, injProb = 0.04, fitness = 80 } = {}) {
  h.run(`
    __mk = function (n) {
      const r = [];
      for (let i = 0; i < n; i++) r.push({
        name: 'P' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
        fitness: __F, overall: 70, morale: 80, value: 1000,
        stats: { att: 60, def: 60, spe: 60, str: 60, tec: 60, res: 50 },
        injProb: __I, injured: false, injuryWeeks: 0,
      });
      return r;
    };
  `, { __I: injProb, __F: fitness });
  return h.run('__mk(__n)', { __n: n });
}

test('FIX 3: simulateInjuries è globale e non più annidata', () => {
  const h = loadGame();
  assert.strictEqual(h.run('typeof simulateInjuries'), 'function',
    'simulateInjuries deve essere globale, altrimenti main.js non la raggiunge');
  assert.strictEqual(h.run('simulateInjuries.length'), 1);
  // Non deve esistere una seconda copia annidata: due copie divergerebbero.
  assert.strictEqual(h.run('simulateMatchStats.toString().includes("function simulateInjuries")'), false,
    'esiste ancora una copia annidata di simulateInjuries dentro simulateMatchStats');
});

test('FIX 3: la guardia di main.js trova davvero la funzione', () => {
  const h = loadGame();
  // Il bug era letteralmente questa condizione: se è falsa, nessun infortunio
  // viene mai simulato per la rosa del giocatore.
  assert.strictEqual(h.run('typeof simulateInjuries === "function"'), true);
});

// matchProb è limitato a 0.35, quindi nessun injProb può forzare il 100%:
// per i test "infortunio certo" si azzera Math.random, che è esattamente la
// leva che il codice usa (Math.random() < matchProb).
function alwaysInjured(h) {
  h.run('__savedRandom = Math.random; Math.random = function () { return 0; };');
}
function restoreRandom(h) {
  h.run('Math.random = __savedRandom;');
}

test('FIX 3: simulateInjures marcati applicano lo stato al giocatore', () => {
  const h = loadGame();
  rosterOf(h);
  alwaysInjured(h);

  h.run('__r = __mk(14); __inj = simulateInjuries(__r)');
  const injuredNames = host(h.get('__inj'));
  const roster = h.get('__r');

  assert.strictEqual(injuredNames.length, 14, 'tutti i 14 devono risultare infortunati');
  assert.ok(roster.every((p) => p.injured === true), 'il flag injured va scritto sui giocatori');
  assert.ok(roster.every((p) => p.injuryWeeks >= 1 && p.injuryWeeks <= 4),
    'la durata deve essere fra 1 e 4 giornate');
  assert.ok(roster.every((p) => p.fitness < 80), 'l\'infortunio deve costare forma');
});

test('FIX 3: nessun doppio infortunino per lo stesso giocatore', () => {
  const h = loadGame();
  rosterOf(h);
  alwaysInjured(h);
  h.run('__r = __mk(14); simulateInjuries(__r); simulateInjuries(__r)');
  const roster = h.get('__r');
  assert.ok(roster.every((p) => p.injuryWeeks <= 4),
    'la seconda chiamata deve saltare chi è già infortunato');
});

test('FIX 3: senza il flag, simulateMatchStats non ha effetti collaterali', () => {
  const h = loadGame();
  rosterOf(h);
  alwaysInjured(h);
  h.run('__a = __mk(14); __b = __mk(14);');
  // simulateMatchStats è usata anche come helper "quali marcatori?"
  // (match.js passa oppRoster due volte): lì non deve infortunare nessuno.
  h.run('__det = simulateMatchStats(__a, __b, { home: 3, away: 2 })');
  assert.strictEqual(h.run('__a.some(p => p.injured)'), false);
  assert.strictEqual(h.run('__b.some(p => p.injured)'), false);
  assert.deepStrictEqual(host(h.get('__det')._injuredH), []);
  assert.deepStrictEqual(host(h.get('__det')._injuredA), []);
});

test('FIX 3: col flag, entrambe le rose vengono infortunate e i nomi tornano', () => {
  const h = loadGame();
  rosterOf(h);
  alwaysInjured(h);
  h.run('__a = __mk(14); __b = __mk(14);');
  h.run('__det = simulateMatchStats(__a, __b, { home: 1, away: 1 }, { injuries: true })');

  assert.strictEqual(h.run('__a.some(p => p.injured)'), true, 'rosa casa deve infortunarsi');
  assert.strictEqual(h.run('__b.some(p => p.injured)'), true, 'rosa ospite deve infortunarsi');
  assert.strictEqual(h.get('__det')._injuredH.length, 14);
  assert.strictEqual(h.get('__det')._injuredA.length, 14);
});

test('FIX 3: tickInjuries scala tutte le rose, non solo la mia', () => {
  const h = loadGame();
  rosterOf(h);
  h.run(`
    __rosters = {
      'me':   __mk(2),   // P0 infortunato da 1, P1 sano
      'rival': __mk(2),  // P0 infortunato da 1, P1 sano
    };
    __rosters.me[0].injured = true;    __rosters.me[0].injuryWeeks = 1;
    __rosters.rival[0].injured = true; __rosters.rival[0].injuryWeeks = 1;
    __rec = tickInjuries(__rosters, 'me', []);
  `);

  assert.strictEqual(h.get('__rosters').me[0].injured, false,
    'la mia rosa deve scalare gli infortuni');
  assert.strictEqual(h.get('__rosters').rival[0].injured, false,
    'la rosa IA deve scalare gli infortuni: senza questo nessuno guarirebbe mai');
  assert.strictEqual(h.get('__rec').length, 2, 'entrambi i guariti vanno restituiti');
});

test('FIX 3: un infortunio da 1 giornata non sparisce nella stessa giornata', () => {
  const h = loadGame();
  rosterOf(h);
  h.run(`
    __rosters = { 'me': __mk(2) };
    __rosters.me[0].injured = true; __rosters.me[0].injuryWeeks = 1;
    // skipMyIdx = indice del giocatore infortunato proprio in questa giornata
    tickInjuries(__rosters, 'me', [0]);
  `);
  assert.strictEqual(h.get('__rosters').me[0].injured, true,
    'chi si è infortunato oggi deve restare infortunato');
  assert.strictEqual(h.get('__rosters').me[0].injuryWeeks, 1,
    'non deve essere scalato a zero nella stessa giornata in cui è avvenuto');
});

test('FIX 3: multi-giornata, l\'infortunio scala di una settimana per volta', () => {
  const h = loadGame();
  rosterOf(h);
  h.run(`
    __rosters = { 'me': __mk(2) };
    __rosters.me[0].injured = true; __rosters.me[0].injuryWeeks = 3;
    tickInjuries(__rosters, 'me', []);
  `);
  assert.strictEqual(h.get('__rosters').me[0].injuryWeeks, 2);
  assert.strictEqual(h.get('__rosters').me[0].injured, true);

  h.run('tickInjuries(__rosters, "me", [])');
  assert.strictEqual(h.get('__rosters').me[0].injuryWeeks, 1);
  h.run('tickInjuries(__rosters, "me", [])');
  assert.strictEqual(h.get('__rosters').me[0].injured, false, 'alla quarta giornata guarisce');
});

test('FIX 3: i giocatori immuni non si infortunano mai', () => {
  const h = loadGame();
  rosterOf(h, { injProb: NO_INJ });
  h.run('__r = __mk(14); __inj = simulateInjuries(__r)');
  assert.strictEqual(host(h.get('__inj')).length, 0);
  assert.strictEqual(h.run('__r.some(p => p.injured)'), false);
});

test('FIX 3: una rosa vuota o assente non rompe nulla', () => {
  const h = loadGame();
  assert.deepStrictEqual(host(h.run('simulateInjuries(null)')), []);
  assert.deepStrictEqual(host(h.run('simulateInjuries(undefined)')), []);
  assert.deepStrictEqual(host(h.run('simulateInjuries([])')), []);
  assert.deepStrictEqual(host(h.run('tickInjuries(null, "me", [])')), []);
});

// ── Integrazione sul percorso reale ──────────────────────────────────
// Costruisce un campionato completo ed esegue simNextRound(), che è il punto
// in cui il bug era invisibile: la guardia typeof falliva e non succedeva
// niente, senza errori né avvisi.

function buildSeason(h, { teams = 4, rounds = 6, injProb = 0.10 } = {}) {
  h.run('console.log = console.group = console.warn = function () {};');
  h.run(`
    G.myTeam  = TEAMS_DATA[0];
    G.teams   = TEAMS_DATA.slice(0, ${teams});
    G.myId    = G.teams[0].id;
    G.rosters = {};
    G.teams.forEach(t => {
      G.rosters[t.id] = [];
      for (let i = 0; i < 14; i++) G.rosters[t.id].push({
        name: 'P' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
        fitness: 80, overall: 70, morale: 80, value: 1000, salary: 1000,
        stats: { att: 60, def: 60, spe: 60, str: 60, tec: 60, res: 50 },
        injProb: __I, injured: false, injuryWeeks: 0,
        goals: 0, assists: 0, lastRatings: [],
      });
    });
    G.budget = 500000;
    G.msgs   = [];
    G.stand  = {};
    G.teams.forEach(t => G.stand[t.id] = { id: t.id, g:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 });
    G.schedule = [];
    let n = 0;
    for (let rd = 1; rd <= ${rounds}; rd++) {
      for (let i = 0; i < G.teams.length; i += 2) {
        G.schedule.push({ id: 'm' + (n++), round: rd,
          home: G.teams[i].id, away: G.teams[i+1].id, played: false });
      }
    }
    G.phase = 'regular';
    G.round = 0;
    __injuredCount = function () {
      return Object.values(G.rosters).flat().filter(p => p.injured).length;
    };
    __totalPlayers = function () {
      return Object.values(G.rosters).flat().length;
    };
  `, { __I: injProb });
}

test('FIX 3: simNextRound genera infortuni anche per la mia rosa', () => {
  const h = loadGame();
  buildSeason(h, { teams: 4, rounds: 8, injProb: 0.15 });

  let mineEverInjured = false;
  for (let i = 0; i < 8 && !mineEverInjured; i++) {
    h.run('simNextRound()');
    mineEverInjured = h.run('(G.rosters[G.myId] || []).some(p => p.injured)');
  }
  assert.strictEqual(mineEverInjured, true,
    'prima della fix la rosa del giocatore non si infortunava MAI nelle giornate simulate');
});

test('FIX 3: simNextRound non lascia infortuni permanenti', () => {
  const h = loadGame();
  // injProb 0.045 è la media reale (generator.js lo tiene in [0.02, 0.15]).
  buildSeason(h, { teams: 4, rounds: 8, injProb: 0.045 });

  const counts = [];
  for (let i = 0; i < 8; i++) {
    h.run('simNextRound()');
    counts.push(h.run('__injuredCount()'));
  }

  const total = h.run('__totalPlayers()');
  // Il bug grave sarebbe l'assenza di tickInjuries per le rose IA: il numero
  // di infortunati crescerebbe senza mai tornare giù, perché un giocatore
  // "infortunato" non tornerebbe mai disponibile.
  assert.ok(counts.some((c, i) => i > 0 && c < counts[i - 1]),
    `nessuno è mai guarito, il recupero non gira: ${counts.join(',')}`);
  assert.ok(counts[counts.length - 1] < total * 0.30,
    `troppi infortunati a fine stagione: ${counts[counts.length - 1]} su ${total}`);
});

test('FIX 3: un infortunato IA guarisce davvero alla giornata successiva', () => {
  const h = loadGame();
  buildSeason(h, { teams: 4, rounds: 1, injProb: 0 });
  // Immettiamo a forza un infortunio IA di 1 giornata: senza tickInjuries su
  // tutte le rose resterebbe infortunato per sempre.
  h.run(`
    __rid = G.teams[1].id;
    G.rosters[__rid][3].injured = true;
    G.rosters[__rid][3].injuryWeeks = 1;
  `);
  h.run('simNextRound()');
  assert.strictEqual(h.run('G.rosters[__rid][3].injured'), false,
    'il giocatore IA doveva guarire: il tick degli infortuni non copre le rose IA');
  assert.strictEqual(h.run('G.rosters[__rid][3].injuryWeeks'), 0);
});

test('FIX 3: la partita del giocatore non genera infortuni doppi', () => {
  const h = loadGame();
  buildSeason(h, { teams: 2, rounds: 1, injProb: 0.15 });
  // Con una sola giornata e 2 squadre, l'unica partita è quella del giocatore:
  // viene simulata una volta da simulateMatchStats (senza flag) e una volta dal
  // blocco dedicato in main.js. Devono restare due squadre da 14.
  h.run('simNextRound()');
  assert.strictEqual(h.run('Object.keys(G.rosters).length'), 2);
  assert.strictEqual(h.run('(G.rosters[G.myId] || []).length'), 14);
});
