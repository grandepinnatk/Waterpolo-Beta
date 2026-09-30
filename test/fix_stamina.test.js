'use strict';
// Regressione FIX 2 — saltare un tempo consumava 4,4 volte meno stamina.
//
// skipPeriod() chiamava _drainStaminaChunk(ms, SIM_INTERVAL), funzione che non
// esiste in tutto il progetto: la guardia typeof valutava sempre false e si
// entrava sempre nel fallback inline, con DRAIN_BASE = 0.012 contro lo
// STAMINA_BASE_DRAIN = 0.05251 del modello live. Il fallback ignorava inoltre
// tattica, posizione, eta', RES, undermanned e il recupero in panchina.
//
// Il fix chiama _drainStamina, che accetta gia' i secondi di gioco come
// secondo parametro ed e' la stessa funzione del loop live.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadGame, ROOT } = require('./harness.js');

const PERIOD = 8 * 60; // 480 secondi di gioco

// Prepara un contesto con G popolato e la generazione eventi disattivata,
// cosi' il confronto isola il solo drain della stamina.
function prime(h) {
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    G.teams   = TEAMS_DATA.slice();
    __mk = function (n) {
      const r = [];
      for (let i = 0; i < n; i++) r.push({
        name: 'G' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
        fitness: 90, overall: 70, morale: 80, value: 1000,
        stats: { att: 60, def: 60, spe: 60, str: 60, tec: 60, res: 50 },
        injProb: 0.05,
      });
      return r;
    };
    __form   = { GK: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
    __shirts = { 0:1,1:2,2:3,3:4,4:5,5:6,6:7,7:8,8:9,9:10,10:11,11:12 };
    __mkms = function () {
      return createMatchState({
        match: { id: 1, home: 'recco', away: 'brescia' }, isHome: true,
        myTeam: G.myTeam, oppTeam: TEAMS_DATA[1],
        myRoster: __mk(12), oppRoster: __mk(12),
        formation: __form, shirtNumbers: __shirts,
      });
    };
    generateMatchEvent = function () { return null; };  // nessun cambio di rosa
    applyPeriodBreakRecovery = function () {};          // isoliamo il solo drain
  `);
}

const staminaOf = (ms, n = 12) => Array.from({ length: n }, (_, i) => ms.stamina[i]);

test('FIX 2: saltare il tempo consuma la stessa stamina del percorso live', () => {
  const h = loadGame();
  prime(h);
  h.run('__msSkip = __mkms(); __msLive = __mkms();');

  // percorso live: il game loop chiama advanceTime, che drena e avanza il clock
  h.run('advanceTime(__msLive, __P);', { __P: PERIOD });
  // percorso skip: l'utente preme "salta tempo"
  h.run('G.ms = __msSkip; skipPeriod()');

  const live = staminaOf(h.get('__msLive'));
  const skip = staminaOf(h.get('G.ms'));

  // skipPeriod lavora a chunk di 7 s: 69 chunk = 483 s contro i 480 reali, quindi
  // lo scarto atteso e' di poche decine di centesimi di punto stamina.
  for (let i = 0; i < 7; i++) {
    assert.ok(Math.abs(live[i] - skip[i]) < 0.5,
      `giocatore in campo ${i}: live ${live[i].toFixed(2)} vs skip ${skip[i].toFixed(2)}`);
  }
});

test('FIX 2: il drain non e\' piu` irrilevante come con il vecchio fallback', () => {
  const h = loadGame();
  prime(h);
  h.run('G.ms = __mkms(); skipPeriod()');
  const ms = h.get('G.ms');

  // Il fallback vecchio toglieva 0.012 * 480 = ~5,8 punti: un tempo saltato
  // lasciava il giocatore quasi fresco. Il modello live ne toglie ~25.
  const lost = 90 - ms.stamina[0];
  assert.ok(lost > 20 && lost < 28,
    `drain atteso ~25 punti, misurati ${lost.toFixed(2)} (il vecchio fallback ne toglieva ~5,8)`);
});

test('FIX 2: chi salta il tempo recupera in panchina come nel live', () => {
  const h = loadGame();
  prime(h);
  h.run('G.ms = __mkms(); skipPeriod()');
  const ms = h.get('G.ms');

  // Indice 7-11 non sono in campo: il fallback non li toccava mai.
  assert.ok(ms.stamina[7] > 90, `la panchina deve recuperare, trovato ${ms.stamina[7].toFixed(2)}`);
});

test('FIX 2: la tattica incide sul drain anche nel percorso skip', () => {
  const h = loadGame();
  prime(h);

  const drainOf = (tactic) => {
    h.run('__m = __mkms(); __m.tactic = __t;', { __t: tactic });
    h.run('__before = __m.stamina[0]; _drainStamina(__m, __P);', { __P: PERIOD });
    return h.run('__before - __m.stamina[0]');
  };

  const balanced = drainOf('balanced');
  const pressing = drainOf('press');
  assert.ok(pressing > 0, 'press deve costare piu stamina');
  assert.ok(Math.abs(pressing - balanced) > 1,
    `il moltiplicatore tattico deve cambiare il drain: balanced ${balanced.toFixed(2)} vs pressing ${pressing.toFixed(2)}`);
});

test('FIX 2: nessun riferimento resta a _drainStaminaChunk', () => {
  // I commenti descrivono proprio il bug: il check deve valutare solo il codice.
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const files = ['js/ui/match.js', 'js/engine/match.js', 'js/engine/live_engine.js',
    'js/engine/standings.js', 'js/main.js'];
  for (const rel of files) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    assert.ok(!src.includes('_drainStaminaChunk'),
      `${rel} contiene ancora un riferimento alla funzione inesistente _drainStaminaChunk`);
  }
  assert.strictEqual(loadGame().run('typeof _drainStamina'), 'function');
});
