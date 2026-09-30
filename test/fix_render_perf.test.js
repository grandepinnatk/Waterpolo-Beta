'use strict';
// Regressione FIX 4 — il loop di animazione ricostruiva il DOM delle rose a
// ogni frame.
//
// renderFieldLists() assegnava innerHTML ai contenitori field-players e
// bench-players. _animLoop la chiama a ogni frame, quindi a 60 fps le due liste
// venivano distrutte e ricreate 120 volte al secondo.
//
// Il punto non e' solo il costo: riassegnare innerHTML ricrea i nodi, quindi la
// transition CSS della barra stamina riparte da zero a ogni ricostruzione, e
// scroll, hover e focus vanno persi mentre l'utente sta usando i pulsanti.
//
// La stringa pero' cambia di rado: la stamina passa per Math.round, quindi
// varia ogni ~19 secondi di gioco, non ogni frame. Su 180 frame a velocita 20x
// la lista produceva 4 HTML distinti.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

const FRAMES = 180;

function prime(h) {
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    __mk = function (n) {
      const r = [];
      for (let i = 0; i < n; i++) r.push({
        name: 'G' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
        fitness: 90, overall: 70, morale: 80, value: 1000,
        stats: { att: 60, def: 60, spe: 60, str: 60, tec: 60, res: 50 },
        injProb: 0.05, injured: false, injuryWeeks: 0,
      });
      return r;
    };
    __form   = { GK: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
    __shirts = { 0:1,1:2,2:3,3:4,4:5,5:6,6:7,7:8,8:9,9:10,10:11,11:12 };
    G.ms = createMatchState({
      match: { id: 1, home: 'recco', away: 'brescia' }, isHome: true,
      myTeam: G.myTeam, oppTeam: TEAMS_DATA[1],
      myRoster: __mk(14), oppRoster: __mk(14),
      formation: __form, shirtNumbers: __shirts,
    });
    G.ms.running = true;
    G.ms.speed   = 20;
  `);
}

const domWrites = (h) => h.run(
  'document.getElementById("field-players")._htmlWrites'
  + ' + document.getElementById("bench-players")._htmlWrites'
);

test('FIX 4: renderFieldLists non riscrive il DOM se il contenuto non cambia', () => {
  const h = loadGame();
  prime(h);

  h.run('for (let i = 0; i < __F; i++) { advanceTime(G.ms, 1/60); renderFieldLists(); }',
    { __F: FRAMES });

  const writes = domWrites(h);
  // Prima della fix erano 2 * FRAMES. Ora devono essere poche: la stamina
  // arrotondata cambia ogni ~19 s di gioco, non ogni frame.
  assert.ok(writes < FRAMES / 4,
    `troppe scritture al DOM: ${writes} su ${FRAMES} frame (prima della fix erano ${FRAMES * 2})`);
});

test('FIX 4: il risparmio non nasce da una lista vuota o da un errore', () => {
  const h = loadGame();
  prime(h);
  h.run('renderFieldLists()');

  // Le liste devono contenere davvero i giocatori, e il testo deve arrivare al DOM.
  const fieldHtml = h.run('document.getElementById("field-players")._lastHTML || ""');
  const benchHtml = h.run('document.getElementById("bench-players")._lastHTML || ""');
  assert.ok(fieldHtml.includes('G0'), 'la formazione deve contenere il portiere');
  assert.ok(fieldHtml.includes('G6'), 'la formazione deve contenere 7 giocatori in campo');
  assert.ok(benchHtml.includes('G7'), 'la panchina deve contenere i giocatori non schierati');
  // Solo chi ha un numero di maglia è convocato: con 12 maglie la panchina
  // finisce a G11, e G12/G13 restano fuori per scelta.
  assert.ok(benchHtml.includes('G11'), 'la panchina deve arrivare all\'ultimo convocato');
  assert.ok(!benchHtml.includes('G12'), 'un giocatore senza maglia non è in panchina');
  assert.ok(fieldHtml.length > 1000, 'la formazione non può essere vuota');
});

test('FIX 4: un cambio di stamina viene comunque scritto', () => {
  const h = loadGame();
  prime(h);
  h.run('renderFieldLists()');
  const before = domWrites(h);

  h.run('G.ms.stamina[3] = 40; renderFieldLists()');
  assert.ok(domWrites(h) > before, 'un cambio di stamina deve aggiornare il DOM');
  assert.ok(h.run('document.getElementById("field-players")._lastHTML.includes("40%")'),
    'la nuova percentuale deve comparire nel DOM');
});

test('FIX 4: una sostituzione viene comunque scritta', () => {
  const h = loadGame();
  prime(h);
  h.run('renderFieldLists()');
  const before = domWrites(h);

  // Fuori il portiere: cambia la formazione e la panchina.
  h.run('__swap = G.ms.onField["2"]; G.ms.onField["2"] = G.ms.bench[0]; G.ms.bench[0] = __swap; renderFieldLists()');
  assert.ok(domWrites(h) > before, 'una sostituzione deve aggiornare il DOM');
});

test('FIX 4: il cache non trattiene contenuto vecchio dopo un cambio partita', () => {
  const h = loadGame();
  prime(h);
  h.run('renderFieldLists()');

  // Nuova partita, stessa rosa ma lineup diversa: il contenuto cambia e deve
  // finire nel DOM.
  h.run('G.ms.onField = { GK: 1, "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 0 }; renderFieldLists()');
  const html = h.run('document.getElementById("field-players")._lastHTML');
  assert.ok(html.includes('G1'), 'il nuovo portiere deve comparire nel DOM');
});

test('FIX 4: la cache si invalida quando serve un aggiornamento forzato', () => {
  const h = loadGame();
  prime(h);
  h.run('renderFieldLists()');
  const before = domWrites(h);

  // Invalidazione esplicita: dopo, anche contenuto identico viene riscritto.
  h.run('_invalidateFieldHtmlCache()');
  h.run('renderFieldLists()');
  assert.ok(domWrites(h) > before,
    'dopo _invalidateFieldHtmlCache() il contenuto deve essere riscritto');
});

test('FIX 4: il riquadro vuoto della panchina resta corretto', () => {
  const h = loadGame();
  prime(h);
  h.run('G.ms.bench = []; renderFieldLists()');
  assert.ok(h.run('document.getElementById("bench-players")._lastHTML').includes('Panchina vuota'),
    'con panchina vuota deve comparire il messaggio');
});
