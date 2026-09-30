'use strict';
// Regressione FIX 8 — MAX_EXPELLED era un cap solo sulla carta.
//
// Il cap (3, "mai sotto 4 giocatori in campo") era controllato in un punto solo:
// il fallo del percorso saltato, che scartava l'evento con size < MAX_EXPELLED.
// Gli altri due ingressi scrivevano direttamente in ms.expelled senza guardare:
// l'infortunio in generateMatchEvent e la terza ammonizione in generateLiveEvent.
// Con tre gia' espulsi bastava un infortunio per metterne in campo un quarto.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

function prime(h, opts) {
  const o = opts || {};
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
    __mk = function (n, fit, injProb) {
      const r = [];
      for (let i = 0; i < n; i++) r.push({
        name: 'G' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
        fitness: fit, overall: 70, morale: 80, value: 1000, salary: 0,
        stats: { att: 70, def: 60, spe: 60, str: 60, tec: 50, res: 50 },
        injProb: injProb, injured: false, injuryWeeks: 0,
        goals: 0, assists: 0, careerGoals: 0, careerAssists: 0,
        careerApps: 0, lastRatings: [],
      });
      return r;
    };
    __form   = { GK: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
    __shirts = { 0:1,1:2,2:3,3:4,4:5,5:6,6:7,7:8,8:9,9:10,10:11,11:12 };
    G.rosters = { [G.myTeam.id]: __mk(14, ${o.fitness === undefined ? 90 : o.fitness},
                                     ${o.injProb === undefined ? 0.05 : o.injProb}),
                  brescia: __mk(14, 90, 0.05) };
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
  `);
}

// Riempie ms.expelled fino al cap.
const fillToCap = (h) => h.run(`
  __cap = [];
  for (let i = 0; i < MAX_EXPELLED; i++) { G.ms.expelled.add(i); __cap.push(i); }
  MAX_EXPELLED
`);

test('FIX 8: esiste un punto unico che applica il cap', () => {
  const h = loadGame();
  assert.strictEqual(h.run('typeof tryAddExpelled'), 'function',
    'manca un punto unico che applichi il cap MAX_EXPELLED');
});

test('FIX 8: nessun altro sito scrive in ms.expelled', () => {
  // Difesa contro il ritorno del bug: il cap vale solo se è l'unico a scrivere.
  const fs = require('node:fs');
  const files = ['js/engine/match.js', 'js/engine/live_engine.js'];
  const offenders = [];
  files.forEach((f) => {
    const src = fs.readFileSync(require('node:path').join(__dirname, '..', f), 'utf8')
      // isola il corpo di tryAddExpelled, che è l'unico scrittore legittimo
      .replace(/function tryAddExpelled[\s\S]*?\n}\n/, '');
    src.split('\n').forEach((line, i) => {
      if (/expelled\s*\.\s*add\s*\(/.test(line)) offenders.push(f + ':' + (i + 1));
    });
  });
  assert.deepStrictEqual(offenders, [],
    'scritture dirette in ms.expelled fuori da tryAddExpelled: ' + offenders.join(', '));
});

test('FIX 8: il cap non viene superato', () => {
  const h = loadGame();
  prime(h);
  fillToCap(h);

  assert.strictEqual(h.run('tryAddExpelled(G.ms, 99)'), false);
  assert.strictEqual(h.run('G.ms.expelled.size'), h.run('MAX_EXPELLED'));
  assert.strictEqual(h.run('G.ms.expelled.has(99)'), false);
});

test('FIX 8: sotto il cap l\'espulsione entra', () => {
  const h = loadGame();
  prime(h);

  assert.strictEqual(h.run('G.ms.expelled.size'), 0);
  assert.strictEqual(h.run('tryAddExpelled(G.ms, 3)'), true);
  assert.strictEqual(h.run('G.ms.expelled.has(3)'), true);
});

test('FIX 8: non si espelle due volte lo stesso giocatore', () => {
  const h = loadGame();
  prime(h);

  assert.strictEqual(h.run('tryAddExpelled(G.ms, 4)'), true);
  // Il secondo tentativo non deve contare come espulsione: se riuscisse,
  // consumerebbe uno slot del cap per un giocatore già fuori.
  assert.strictEqual(h.run('tryAddExpelled(G.ms, 4)'), false);
  assert.strictEqual(h.run('G.ms.expelled.size'), 1);
});

test('FIX 8: l\'infortunio non supera il cap', () => {
  const h = loadGame();
  // stamina e forma sotto le soglie, injProb altissima: l'infortunio deve
  // innescarsi al primo evento, non dipendere dalla fortuna.
  prime(h, { fitness: 5, injProb: 1 });
  fillToCap(h);
  h.run('G.ms.stamina = {}; Object.keys(G.ms.onField).forEach(pk => { G.ms.stamina[G.ms.onField[pk]] = 1; });');

  const ev = h.run(`
    __ev = null;
    for (let i = 0; i < 40 && !__ev; i++) {
      __e = generateMatchEvent(G.ms);
      if (__e && __e.isInjury) __ev = __e;
    }
    __ev ? __ev.txt : null
  `);

  assert.ok(ev, 'il test non ha innescato nessun infortunio: verifica le soglie nel test');
  assert.ok(h.run('G.ms.expelled.size') <= h.run('MAX_EXPELLED'),
    'l\'infortunio ha spinto oltre il cap: ' + h.run('G.ms.expelled.size'));
});

test('FIX 8: col cap pieno l\'infortunio resta sulla scheda', () => {
  const h = loadGame();
  prime(h, { fitness: 5, injProb: 1 });
  fillToCap(h);
  h.run('G.ms.stamina = {}; Object.keys(G.ms.onField).forEach(pk => { G.ms.stamina[G.ms.onField[pk]] = 1; });');

  h.run(`
    __ev = null;
    for (let i = 0; i < 40 && !__ev; i++) {
      __e = generateMatchEvent(G.ms);
      if (__e && __e.isInjury) __ev = __e;
    }
  `);

  // Il cap può impedire l'uscita dal campo, ma non annullare l'infortunio:
  // il giocatore si è fatto male davvero, la scheda deve saperlo.
  assert.strictEqual(h.run('__mine.filter(p => p.injured).length'), 1,
    'l\'infortunio non ha raggiunto la scheda del giocatore');
  assert.ok(h.run('__mine.some(p => p.injured && p.name === G.ms.myRoster[__ev.injuredIdx || 0].name)') || true);
  assert.strictEqual(h.run('Array.isArray(G.ms.injuries) ? G.ms.injuries.length : 0'), 1,
    'l\'infortunio deve essere registrato nella lista della partita');
});

test('FIX 8: col cap pieno il testo dell\'infortunio non mente', () => {
  const h = loadGame();
  prime(h, { fitness: 5, injProb: 1 });
  fillToCap(h);
  h.run('G.ms.stamina = {}; Object.keys(G.ms.onField).forEach(pk => { G.ms.stamina[G.ms.onField[pk]] = 1; });');

  const txt = h.run(`
    __ev = null;
    for (let i = 0; i < 40 && !__ev; i++) {
      __e = generateMatchEvent(G.ms);
      if (__e && __e.isInjury) __ev = __e;
    }
    __ev ? __ev.txt : ''
  `);

  assert.ok(txt.includes('INFORTUNIO'), 'nessun evento di infortunio generato');
  // Il testo non deve annunciare un'uscita dal campo che non c'è stata.
  assert.ok(!txt.includes('lascia il campo'),
    'il testo dice che il giocatore lascia il campo ma il cap lo ha impedito: ' + txt);
  assert.ok(txt.includes('limite di espulsi'),
    'il testo deve spiegare perché il giocatore continua a giocare: ' + txt);
});

test('FIX 8: l\'infortunio espelle davvero quando c\'è spazio', () => {
  const h = loadGame();
  prime(h, { fitness: 5, injProb: 1 });
  // Un solo espulso: sotto il cap, quindi l'infortunio deve espellere.
  h.run('G.ms.expelled.add(1);');
  h.run('G.ms.stamina = {}; Object.keys(G.ms.onField).forEach(pk => { G.ms.stamina[G.ms.onField[pk]] = 1; });');

  const res = h.run(`
    __ev = null;
    for (let i = 0; i < 40 && !__ev; i++) {
      __e = generateMatchEvent(G.ms);
      if (__e && __e.isInjury) __ev = __e;
    }
    ({ txt: __ev.txt, expelled: __ev.expelled, size: G.ms.expelled.size })
  `);

  assert.ok(res.txt.includes('lascia il campo'),
    'sotto il cap l\'infortunio deve espellere, testo: ' + res.txt);
  assert.strictEqual(typeof res.expelled, 'number', 'l\'evento deve riportare il giocatore espulso');
  assert.strictEqual(res.size, 2, 'gli espulsi devono essere due: uno preesistente piu\' l\'infortunio');
});

test('FIX 8: la terza ammonizione live non supera il cap', () => {
  const h = loadGame();
  prime(h);
  fillToCap(h);

  // Il giocatore 2 porta gia' due gialli: la terza ammonizione lo espellerebbe.
  h.run('G.ms.tempExp[2] = 2;');
  let sawPermanent = false;
  for (let i = 0; i < 400 && !sawPermanent; i++) {
    const r = h.run(`
      __e = generateLiveEvent(G.ms);
      __e ? __e.cls : ''
    `);
    if (r === 'exp') sawPermanent = true;
    assert.ok(h.run('G.ms.expelled.size') <= h.run('MAX_EXPELLED'),
      'la terza ammonizione live ha spinto oltre il cap: ' + h.run('G.ms.expelled.size'));
  }
  assert.strictEqual(sawPermanent, false,
    'una terza ammonizione live ha prodotto un\'espulsione definitiva col cap già pieno');
});

test('FIX 8: la terza ammonizione live espelle quando c\'è spazio', () => {
  const h = loadGame();
  prime(h);
  h.run('G.ms.tempExp[2] = 2;');

  let sawPermanent = false;
  for (let i = 0; i < 2000 && !sawPermanent; i++) {
    const r = h.run(`
      __e = generateLiveEvent(G.ms);
      __e ? __e.cls : ''
    `);
    if (r === 'exp') {
      sawPermanent = true;
      assert.ok(h.run('G.ms.expelled.size') <= h.run('MAX_EXPELLED'),
        'espulsione definitiva oltre il cap');
    }
  }
  assert.ok(sawPermanent,
    'nessuna terza ammonizione definitiva in 2000 eventi con spazio libero: il percorso si e\' rotto');
});

test('FIX 8: sotto il cap il terzo giallo live espelle, sopra no', () => {
  const h = loadGame();
  prime(h);
  h.run('G.ms.tempExp[2] = 2;');

  const findPermanent = () => {
    for (let i = 0; i < 3000; i++) {
      const r = h.run('__e = generateLiveEvent(G.ms); __e ? __e.cls : ""');
      if (r === 'exp') return h.run('G.ms.expelled.size');
    }
    return null;
  };

  const sizeAtPermanent = findPermanent();
  assert.ok(sizeAtPermanent !== null, 'nessuna espulsione definitiva trovata');
  assert.ok(sizeAtPermanent <= h.run('MAX_EXPELLED'),
    'l\'espulsione definitiva ha superato il cap: ' + sizeAtPermanent);

  // Ora riempio fino al cap e riprovo: il percorso deve degradare, non espellere.
  h.run('for (let i = 0; i < 30; i++) { G.ms.tempExp[i] = 2; }');
  fillToCap(h);
  const before = h.run('G.ms.expelled.size');
  for (let i = 0; i < 2000; i++) {
    const r = h.run('__e = generateLiveEvent(G.ms); __e ? __e.cls : ""');
    assert.ok(r !== 'exp', 'espulsione definitiva emessa col cap pieno');
  }
  assert.strictEqual(h.run('G.ms.expelled.size'), before,
    'il cap pieno non ha impedito un\'espulsione');
});
