'use strict';
// Regressione FIX 1 — la partita si congelava per sempre dopo due goal ravvicinati.
//
// Causa: showGoalAnimation() calcolava wasPaused a ogni chiamata e cancellava il
// timer del goal precedente. Il secondo goal leggeva come "già in pausa" la
// pausa che era lui stesso aver messo, quindi la condizione !wasPaused non era
// mai soddisfatta e ms.running restava false per il resto della partita.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

const ANIM_MS = 1800;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeMs(over = {}) {
  return {
    running: true,
    finished: false,
    isHome: true,
    // totalSeconds è un contatore ELTRASCORSO che parte da 0 e cresce di
    // dt*speed: con periodo 2 e 580 s trascorsi siamo a 100 s dentro il secondo
    // tempo, quindi la guardia curPeriodSec < 480 permette la ripresa.
    period: 2,
    totalSeconds: 480 + 100,
    myTeam: { id: 'recco' },
    oppTeam: { id: 'brescia' },
    // forma minima perché togglePlay() possa chiamare renderFieldLists()
    onField: { GK: 0, '1': 1, '2': 2 },
    bench: [3, 4],
    expelled: new Set(),
    shirtNumbers: {},
    myRoster: [],
    oppRoster: [],
    stamina: {},
    matchGoals: {},
    matchAssists: {},
    _everOnField: new Set(),
    ...over,
  };
}

function primeGame(h, ms) {
  h.run(`
    G.teams = [{ id:'recco', logo:null, col:'#185FA5', abbr:'REC' }];
    G.myTeam = { id:'recco', abbr:'REC' };
    G.ms = __ms;
  `, { __ms: ms });
  return ms;
}

test('FIX 1: due goal ravvicinati non bloccano la partita', async () => {
  const h = loadGame();
  const ms = primeGame(h, makeMs());

  h.run('showGoalAnimation("Rossi", "my", __ms)', { __ms: ms });
  assert.strictEqual(ms.running, false, 'il primo goal deve mettere in pausa');

  // Secondo goal mentre il primo è ancora in overlay: è il caso che congelava.
  await wait(400);
  h.run('showGoalAnimation("Bianchi", "opp", __ms)', { __ms: ms });

  await wait(ANIM_MS + 400);
  assert.strictEqual(ms.running, true,
    'la partita deve riprendere dopo la seconda animazione');
});

test('FIX 1: tre goal ravvicinati lasciano un solo overlay e riprendono', async () => {
  const h = loadGame();
  const ms = primeGame(h, makeMs());

  h.run('showGoalAnimation("A", "my", __ms)', { __ms: ms });
  await wait(300);
  h.run('showGoalAnimation("B", "opp", __ms)', { __ms: ms });
  await wait(300);
  h.run('showGoalAnimation("C", "my", __ms)', { __ms: ms });

  await wait(ANIM_MS + 400);
  assert.strictEqual(ms.running, true);
  assert.strictEqual(h.get('_goalAnimTimer'), null, 'il timer deve essere stato liberato');
  assert.strictEqual(h.get('_goalPauseOwned'), false,
    '_goalPauseOwned deve essere rilasciato quando l\'animazione finisce');
});

test('FIX 1: una pausa volontaria dell\'utente non viene mai sovrascritta', async () => {
  const h = loadGame();
  const ms = primeGame(h, makeMs({ running: false })); // utente ha già messo in pausa

  h.run('showGoalAnimation("Rossi", "my", __ms)', { __ms: ms });
  await wait(ANIM_MS + 400);

  assert.strictEqual(ms.running, false,
    'il goal non deve riprendere una partita che l\'utente aveva già fermato');
});

test('FIX 1: la pausa dell\'utente prevail se clicca play durante l\'animazione', async () => {
  const h = loadGame();
  const ms = primeGame(h, makeMs());

  h.run('showGoalAnimation("Rossi", "my", __ms)', { __ms: ms });
  h.run('togglePlay()', { __ms: ms });          // l'utente riprende a mano durante l'overlay
  h.run('togglePlay()', { __ms: ms });          // e la mette di nuovo in pausa: intenzione netta
  assert.strictEqual(ms.running, false);

  await wait(ANIM_MS + 400);
  assert.strictEqual(ms.running, false,
    'il timer del goal non deve sovrascrivere la pausa messa a mano');
});

test('FIX 1: a fine tempo l\'animazione non riprende la partita', async () => {
  const h = loadGame();
  // totalSeconds a fine del primo tempo: la guardia curPeriodSec deve bloccare
  const ms = primeGame(h, makeMs({ period: 1, totalSeconds: 8 * 60 }));

  h.run('showGoalAnimation("Rossi", "my", __ms)', { __ms: ms });
  await wait(ANIM_MS + 400);

  assert.strictEqual(ms.running, false,
    'a fine periodo la partita deve restare in pausa');
});
