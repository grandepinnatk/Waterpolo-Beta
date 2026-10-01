'use strict';
// Regressione FIX 7 — validazione dei salvataggi e azzeramento.
//
// Il problema di fondo: readSlotMeta e loadFromSlot ritornavano entrambi null
// per tre situazioni diverse, slot mai usato, JSON illeggibile e versione non
// supportata. La schermata li mostrava tutte come "slot vuoto". Con un
// salvataggio v3 che diventa non caricabile, un giocatore con tre carriere
// avrebbe visto tre slot vuoti senza sapere che i dati erano ancora lì.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

// localStorage in memoria, con ispezione dello stato grezzo.
function wireStore(h) {
  h.run(`
    __store = {};
    localStorage.setItem    = function (k, v) { __store[k] = String(v); };
    localStorage.getItem    = function (k) { return __store[k] === undefined ? null : __store[k]; };
    localStorage.removeItem = function (k) { delete __store[k]; };
  `);
}

// Uno stato di gioco minimo ma strutturalmente valido.
function prime(h) {
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    G.myId   = G.myTeam.id;
    G.budget = 500000;
    G.msgs   = [];
    G.phase  = 'regular';
    G.stand  = {};
    G.stand[G.myId] = { id: G.myId, g:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 };
    __mk = function (n) {
      const r = [];
      for (let i = 0; i < n; i++) r.push({
        name: 'G' + i, role: i === 0 ? 'POR' : 'CEN', hand: 'D', age: 24,
        fitness: 90, overall: 70, potential: 70, morale: 80, value: 1000, salary: 0,
        stats: { att: 70, def: 60, spe: 60, str: 60, tec: 50, res: 50 },
        injProb: 0.05, injured: false, injuryWeeks: 0, contractYears: 2,
        goals: 0, assists: 0, careerGoals: 0, careerAssists: 0,
        careerApps: 0, lastRatings: [],
      });
      return r;
    };
    G.teams = [G.myTeam, { id: 'brescia', name: 'Brescia', short: 'BRE', str: 70, budget: 500000 }];
    G.rosters = { [G.myTeam.id]: __mk(14), brescia: __mk(14) };
    G.schedule = [{ id: 'm1', round: 1, home: G.myTeam.id, away: 'brescia', played: false }];
    G._currentSlot = 0;
  `);
}

const save = (h, slot) => h.run(`saveToSlot(G, ${slot === undefined ? 0 : slot}).ok`);
const state = (h, slot) => h.run(`inspectSlot(${slot === undefined ? 0 : slot}).state`);

// Oggetti e array che arrivano dal VM hanno prototipi diversi da quelli del
// processo dei test, quindi deepStrictEqual li considera diseguali anche a
// contenuto identico. Confronto via JSON.
const same = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);

// ── La versione del formato ──────────────────────
test('FIX 7: SAVE_VERSION e\' 4', () => {
  const h = loadGame();
  assert.strictEqual(h.run('SAVE_VERSION'), 4,
    'il formato del salvataggio deve essere stato portato alla versione 4');
});

test('FIX 7: gli stati degli slot sono definiti', () => {
  const h = loadGame();
  ['SLOT_EMPTY', 'SLOT_VALID', 'SLOT_LEGACY', 'SLOT_CORRUPT'].forEach((name) => {
    assert.strictEqual(h.run(`typeof ${name}`), 'string',
      `manca lo stato ${name}: senza di lui vuoto, legacy e corrotto tornano indistinguibili`);
  });
  // Devono essere valori distinti, altrimenti ispezionare non distingue nulla.
  const all = h.run('[SLOT_EMPTY, SLOT_VALID, SLOT_LEGACY, SLOT_CORRUPT]');
  assert.strictEqual(new Set(all).size, 4, 'i quattro stati devono essere valori diversi');
});

// ── I quattro stati ──────────────────────────────
test('FIX 7: uno slot mai usato e\' empty', () => {
  const h = loadGame();
  wireStore(h);
  assert.strictEqual(state(h), 'empty');
});

test('FIX 7: un salvataggio appena scritto e\' valid', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  assert.strictEqual(save(h), true);
  assert.strictEqual(state(h), 'valid');
  assert.strictEqual(h.run('inspectSlot(0).restorable'), true);
});

test('FIX 7: un JSON troncato e\' corrupt, non empty', () => {
  const h = loadGame();
  wireStore(h);
  h.run('localStorage.setItem("wp_slot_0", \'{"version":4,"rosters":{\');');

  assert.strictEqual(state(h), 'corrupt',
    'un JSON illeggibile non deve apparire come slot vuoto: i dati ci sono, solo non si possono leggere');
  assert.strictEqual(h.run('inspectSlot(0).restorable'), false);
  // E non deve nemmeno fingere di essere vuoto: hasAnySave deve vederlo.
  assert.strictEqual(h.run('hasAnySave()'), true,
    'uno slot corrotto contiene ancora qualcosa da cui il giocatore potrebbe voler salvare il resto');
});

test('FIX 7: un salvataggio v3 e\' legacy, non empty', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  // Scrive a mano un payload v3 strutturalmente valido.
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3,
      savedAt: '2026-01-01T00:00:00.000Z',
      meta: { teamId: G.myId, teamName: 'Roma', teamAbbr: 'ROM', phase: 'regular' },
      myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, budget: 1000, phase: 'regular',
    }));
  `);

  assert.strictEqual(state(h), 'legacy',
    'un salvataggio v3 deve essere riconosciuto come legacy, non mostrato come vuoto');
  assert.strictEqual(h.run('inspectSlot(0).version'), 3, 'la versione originale deve restare visibile');
  assert.strictEqual(h.run('inspectSlot(0).restorable'), false);
});

test('FIX 7: un salvataggio legacy conserva i metadati per essere identificato', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, savedAt: '2026-01-01T00:00:00.000Z',
      meta: { teamId: G.myId, teamName: 'Roma', teamAbbr: 'ROM', phase: 'regular' },
      myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, budget: 1, phase: 'regular',
    }));
  `);
  // Serve alla schermata per dire di che squadra si parla: "non caricabile" e
  // "inesistente" sono due notizie diverse per il giocatore.
  assert.strictEqual(h.run('inspectSlot(0).meta.teamName'), 'Roma');
});

// ── Validazione strutturale ─────────────────────
test('FIX 7: un JSON valido che non e\' un salvataggio e\' corrupt', () => {
  const h = loadGame();
  wireStore(h);
  // Caso peggiore: JSON perfettamente valido, contenuto sbagliato. Il
  // controllo della sola versione lo lascerebbe passare, producendo un G senza
  // rose ne' calendario.
  h.run('localStorage.setItem("wp_slot_0", JSON.stringify({ hello: "mondo" }));');
  assert.strictEqual(state(h), 'corrupt');
  assert.strictEqual(h.run('loadFromSlot(0)'), null,
    'non deve produrre un G utilizzabile da spazzatura');
});

test('FIX 7: un payload senza la rosa della mia squadra e\' corrupt', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    __p = _buildPayload(G);
    delete __p.rosters[G.myId];
    localStorage.setItem('wp_slot_0', JSON.stringify(__p));
  `);
  assert.strictEqual(state(h), 'corrupt',
    'una rosa mancante lascerebbe il gioco senza giocatori, deve essere respinto');
});

test('FIX 7: un payload con calendario vuoto e\' corrupt', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    __p = _buildPayload(G);
    __p.schedule = [];
    localStorage.setItem('wp_slot_0', JSON.stringify(__p));
  `);
  assert.strictEqual(state(h), 'corrupt');
});

test('FIX 7: un payload senza classificazione della mia squadra e\' corrupt', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    __p = _buildPayload(G);
    delete __p.stand[G.myId];
    localStorage.setItem('wp_slot_0', JSON.stringify(__p));
  `);
  assert.strictEqual(state(h), 'corrupt');
});

test('FIX 7: myId non stringa e\' corrupt', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    __p = _buildPayload(G);
    __p.myId = 42;
    localStorage.setItem('wp_slot_0', JSON.stringify(__p));
  `);
  assert.strictEqual(state(h), 'corrupt');
});

test('FIX 7: un array invece di un oggetto e\' corrupt', () => {
  const h = loadGame();
  wireStore(h);
  h.run('localStorage.setItem("wp_slot_0", JSON.stringify([1,2,3]));');
  assert.strictEqual(state(h), 'corrupt');
});

// ── Coerenza fra ispezione e caricamento ─────────
// Il punto su cui piu' facile disaccordare: la schermata dice una cosa e il
// caricamento ne fa un'altra.
test('FIX 7: ispezione e caricamento concordano sempre', () => {
  const h = loadGame();
  prime(h); wireStore(h);

  const cases = {
    empty:   null,
    corrupt: '{"version":4,"rosters":{',
    legacy:  JSON.stringify({ version: 3, myId: 'x', rosters: { x: [{}] }, schedule: [{}], stand: { x: {} }, phase: 'regular' }),
  };
  Object.keys(cases).forEach((name) => {
    wireStore(h);
    if (cases[name] === null) h.run('__store = {}');
    else h.run(`localStorage.setItem('wp_slot_0', ${JSON.stringify(cases[name])})`);

    const st = state(h);
    const loaded = h.run('loadFromSlot(0)');
    if (st === 'valid') {
      assert.ok(loaded, `lo slot e' valido ma non si carica: ${name}`);
    } else {
      assert.strictEqual(loaded, null, `lo slot e' ${st} ma si e' caricato comunque: ${name}`);
    }
  });
});

test('FIX 7: slotUnusableReason distingue i tre casi non caricabili', () => {
  const h = loadGame();
  prime(h); wireStore(h);

  save(h);
  assert.strictEqual(h.run('slotUnusableReason(0)'), null, 'uno slot valido non ha motivo di rifiuto');

  h.run('localStorage.setItem("wp_slot_1", \'{"broken\');');
  assert.strictEqual(h.run('slotUnusableReason(1)'), 'corrupt');

  h.run(`
    localStorage.setItem('wp_slot_2', JSON.stringify({
      version: 3, myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
  `);
  assert.strictEqual(h.run('slotUnusableReason(2)'), 'legacy');

  h.run('delete __store["wp_slot_0"];');
  assert.strictEqual(h.run('slotUnusableReason(0)'), 'empty');
});

// ── I v3 non vengono migrati ─────────────────────
// Decisione presa: rifiutare, non migrare. Il test esiste perche' il codice
// di migrazione era ancora lì e avrebbe potuto resuscitare i v3 per inerzia.
test('FIX 7: un salvataggio v3 non viene caricato', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, savedAt: '2026-01-01T00:00:00.000Z',
      meta: { teamId: G.myId, teamName: 'Roma' },
      myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, budget: 1, phase: 'regular',
    }));
  `);
  assert.strictEqual(h.run('loadFromSlot(0)'), null,
    'un v3 non deve essere caricato: SAVE_VERSION e\' 4 e la scelta e\' rifiutare');
});

test('FIX 7: il v3 non viene promosso a v4', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
  `);
  // Se _migratePayload promuovesse la versione, il salvataggio successivo
  // risulterebbe v4 e i dati inventati passerebbero come legittimi.
  assert.strictEqual(h.run('_migratePayload({ version: 3, myId: "x" })'), null,
    'la migrazione non deve promuovere un payload di un\'altra versione');
  assert.strictEqual(h.run('_migratePayload({ version: 99, myId: "x" })'), null);
});

test('FIX 7: un v4 incompleto viene completato, non rifiutato', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  // Un payload v4 valido ma senza i campi aggiunti di recente: si completa.
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 4, myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular', budget: 1,
    }));
  `);
  const p = h.run('loadFromSlot(0)');
  assert.ok(p, 'un v4 incompleto deve caricarsi: i campi mancanti si completano');
  assert.strictEqual(p.version, 4, 'resta v4, non viene promosso');
  assert.ok(same(p.marketPool, []), 'marketPool deve essere completato');
});

// ── Azzeramento ─────────────────────────────────
test('FIX 7: wipeAllSaves cancella tutti gli slot', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 0); save(h, 1); save(h, 2);
  assert.strictEqual(h.run('Object.keys(__store).filter(k => k.indexOf("wp_slot_") === 0).length'), 3);

  const r = h.run('wipeAllSaves()');
  assert.ok(same(r.local, [0, 1, 2]), 'tutti e tre gli slot devono risultare cancellati');
  assert.strictEqual(h.run('Object.keys(__store).filter(k => k.indexOf("wp_slot_") === 0).length'), 0,
    'gli slot devono sparire da localStorage');
});

test('FIX 7: wipeAllSaves azzera anche wp_last_slot', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 2);
  h.run('localStorage.setItem("wp_last_slot", "2");');

  h.run('wipeAllSaves()');
  // Senza questo, il riprendimento automatico del reload riporterebbe alla
  // partita appena cancellata e il primo autosave ricreerebbe un salvataggio.
  assert.strictEqual(h.run('localStorage.getItem("wp_last_slot")'), null,
    'wp_last_slot deve essere azzerato insieme ai salvataggi');
});

test('FIX 7: wipeAllSaves non tocca i salvataggi cloud senza login', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 0);
  const r = h.run('wipeAllSaves()');
  assert.strictEqual(r.cloud, false,
    'senza login non si deve dichiarare una cancellazione cloud che non e\' mai partita');
});

test('FIX 7: wipeAllSaves chiede la cancellazione cloud quando l\'utente e\' loggato', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 0);
  h.run(`
    __deleted = [];
    window.CloudSave = {
      isLoggedIn: function () { return true; },
      deleteSlot: function (n) { __deleted.push(n); return Promise.resolve(); },
      saveSlot:   function ()   { return Promise.resolve(); },
    };
  `);

  const r = h.run('wipeAllSaves()');
  assert.strictEqual(r.cloud, true, 'la cancellazione cloud deve essere richiesta');
  assert.ok(same(h.run('__deleted'), [0]), 'solo lo slot 0 doveva essere cancellato dal cloud');
});

test('FIX 7: wipeAllSaves segnala un errore cloud invece di dichiarare fatto', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 0);
  h.run(`
    window.CloudSave = {
      isLoggedIn: function () { return true; },
      deleteSlot: function () { return Promise.reject(new Error('offline')); },
      saveSlot:   function () { return Promise.resolve(); },
    };
  `);

  // Va verificato su un promise: l'errore arriva dopo che wipeAllSaves ha gia'
  // restituito il risultato, e affermare "fatto" a quel punto sarebbe falso.
  const err = h.run(`
    __r = wipeAllSaves();
    new Promise(function (res) { setTimeout(function () { res(__r.cloudError); }, 10); });
  `);
  return Promise.resolve(err).then((v) => {
    assert.ok(v && /offline/.test(String(v)),
      'un errore cloud deve essere riportato, non nascosto: ' + v);
  });
});

test('FIX 7: wipeAllSaves su slot vuoti non inventa cancellazioni', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 1);
  const r = h.run('wipeAllSaves()');
  assert.ok(same(r.local, [1]),
    'deve elencare solo gli slot che avevano contenuto, ottenuto: ' + JSON.stringify(r.local));
});

// ── Riconoscimento dei dati esistenti ───────────
test('FIX 7: hasAnySave riconosce i dati non caricabili', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  assert.strictEqual(h.run('hasAnySave()'), false, 'senza dati non deve segnalare una carriera');

  h.run('localStorage.setItem("wp_slot_0", \'{"broken\');');
  assert.strictEqual(h.run('hasAnySave()'), true,
    'un slot corrotto ha ancora qualcosa dentro: non e\' una slot vuota');

  h.run('delete __store["wp_slot_0"];');
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
  `);
  assert.strictEqual(h.run('hasAnySave()'), true, 'un v3 non caricabile e\' pur sempre un salvataggio presente');
});

test('FIX 7: listOccupiedSlots elenca solo gli slot con contenuto', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 1);
  h.run('localStorage.setItem("wp_slot_2", \'{"broken\');');

  const list = h.run('listOccupiedSlots()');
  assert.strictEqual(list.length, 2, 'devono risultare lo slot 1 (valid) e lo slot 2 (corrupt)');
  const states = list.map(s => `${s.index}:${s.state}`).sort();
  assert.ok(same(states, ['1:valid', '2:corrupt']), 'stati ottenuti: ' + JSON.stringify(states));
});

test('FIX 7: il pulsante di azzeramento compare solo se c\'e\' qualcosa', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  assert.strictEqual(h.run('listOccupiedSlots().length'), 0,
    'con tre slot vuoti il pulsante non deve comparire: sarebbe rumore');
  save(h, 0);
  assert.strictEqual(h.run('listOccupiedSlots().length'), 1);
});

// ── Il percorso di riprendimento ─────────────────
test('FIX 7: il riprendimento automatico non inganna sullo stato', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  // saveToSlot deve produrre qualcosa di valid, altrimenti questa verifica
  // non starebbetestando niente.
  save(h, 0);
  assert.strictEqual(h.run('slotUnusableReason(0)'), null);

  // E su uno slot legacy wp_last_slot va rilasciato: altrimenti ogni reload
  // riproverebbe a caricare un salvataggio che non puo' funzionare.
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
    localStorage.setItem('wp_last_slot', '0');
  `);
  assert.strictEqual(h.run('slotUnusableReason(0)'), 'legacy');
});

// ── Cosa appare a schermo ────────────────────────
// Gli unit test precedenti guardano inspectSlot. Qui si verifica che la
// schermata usi davvero quello stato: una validazione corretta ma non
// usata dalla UI lascerebbe invariato il sintomo.
//
// L'harness fa restituire '' da innerHTML come fa il browser, quindi il testo
// scritto si legge da _lastHTML, che e' dove finisce il markup.
function buildPanelWith(h, seed) {
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    G.myId   = G.myTeam.id;
    G.phase  = 'regular';
    G.stand  = { [G.myId]: { id: G.myId, pts:10, w:3, gf:9, ga:4, g:7, d:1, l:0 } };
    G.teams  = [G.myTeam];
    G.rosters = { [G.myId]: [{ name:'A', role:'POR', stats:{}, fitness:90, overall:70 }] };
    G.schedule = [{ id:'m1', round:1, home:G.myId, away:'x', played:false }];
    __store = {};
    localStorage.setItem = function (k, v) { __store[k] = String(v); };
    localStorage.getItem = function (k) { return __store[k] === undefined ? null : __store[k]; };
    ${seed}
    _buildSlotsPanel();
    __cards = document.getElementById('slots-panel').children.map(function (c) { return c._lastHTML || ''; });
  `);
  return h.run('__cards');
}

test('FIX 7: lo slot valido mostra Carica e nessun avviso', () => {
  const h = loadGame();
  const cards = buildPanelWith(h, 'saveToSlot(G, 0);');
  assert.ok(cards[0].indexOf('loadSlot(0)') !== -1, 'uno slot valido deve offrire il caricamento');
  assert.ok(!/illeggibile|versione/.test(cards[0]), 'uno slot valido non deve mostrare avvisi di problema');
});

test('FIX 7: lo slot corrotto si dichiara illeggibile e non offre Carica', () => {
  const h = loadGame();
  const cards = buildPanelWith(h, 'localStorage.setItem("wp_slot_0", \'{"troncato\');');
  assert.ok(/illeggibile/.test(cards[0]),
    'il giocatore deve sapere che il dato c\'e\' ma non si legge, non che lo slot e\' vuoto');
  assert.ok(cards[0].indexOf('loadSlot(0)') === -1,
    'non si puo\' caricare uno slot illeggibile: il bottone non deve esserci');
  assert.ok(cards[0].indexOf('confirmDeleteSlot(0)') !== -1, 'deve restare il modo per liberare lo slot');
});

test('FIX 7: lo slot legacy spiega la versione e non offre Carica', () => {
  const h = loadGame();
  const cards = buildPanelWith(h, `
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, savedAt: '2026-01-01T00:00:00.000Z',
      meta: { teamId: G.myId, teamName: 'Roma', teamAbbr: 'ROM', phase: 'regular' },
      myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
  `);
  assert.ok(/versione 3/.test(cards[0]) && /versione 4/.test(cards[0]),
    'il messaggio deve dire quale versione ha e quale il gioco usa: ' + cards[0]);
  assert.ok(cards[0].indexOf('loadSlot(0)') === -1, 'un legacy non e\' caricabile, niente bottone Carica');
  assert.ok(/Roma/.test(cards[0]), 'deve mostrare di quale squadra si tratta');
});

test('FIX 7: lo slot vuoto resta normale', () => {
  const h = loadGame();
  const cards = buildPanelWith(h, '');
  assert.ok(/Slot vuoto/.test(cards[0]) || /slot vuoto/i.test(cards[0]),
    'uno slot davvero vuoto deve dirlo: ' + cards[0]);
  assert.ok(cards[0].indexOf('loadSlot(0)') === -1, 'niente Carica su uno slot vuoto');
});

// Nel pannello il bottone di azzeramento aggiunge un elemento contenitore.
// L'harness crea un elemento per qualsiasi getElementById, quindi chiedere
// "esiste btn-wipe-all" darebbe sempre true: meglio contare gli elementi
// aggiunti al pannello (tre card, piu' il contenitore del bottone se presente).
const panelExtra = (h) => h.run(
  'document.getElementById("slots-panel").children.length - 3'
);

test('FIX 7: il pulsante di azzeramento sparisce a slot vuoti', () => {
  const h = loadGame();
  buildPanelWith(h, '');
  assert.strictEqual(panelExtra(h), 0,
    'con tre slot vuoti un bottone rosso per azzerare non deve comparire');

  const h2 = loadGame();
  buildPanelWith(h2, 'saveToSlot(G, 1);');
  assert.strictEqual(panelExtra(h2), 1,
    'con un salvataggio presente il bottone deve comparire');
});

test('FIX 7: la conferma di azzeramento chiede RESET e non si annulla da sola', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 0);

  // La seconda conferma non e' un semplice sì/no: rispondere "no" alla prima
  // deve poter annullare senza errori, e una risposta sbagliata non deve
  // cancellare nulla.
  h.run('__prompted = 0; __confirmFn = null; __promptFn = null;');
  h.run(`
    window.__origConfirm = window.confirm;
    window.confirm = function (msg) { __confirmFn = msg; return true; };
    window.prompt = function (msg) { __prompted++; return __answer; };
    __answer = 'RESET';
  `);
  // Il testo della seconda conferma deve dire cosa scrivere, altrimenti
  // "RESET" sarebbe una parola senza spiegazione.
  h.run('__promptMsgs = [];');
  h.run(`
    window.prompt = function (msg) { __promptMsgs.push(msg); return __answer; };
    __answer = 'RESET';
  `);
  h.run('confirmWipeAllSaves()');
  assert.strictEqual(h.run('Object.keys(__store).filter(function (k) { return k.indexOf("wp_slot_") === 0; }).length'), 0,
    'con RESET scritto i salvataggi devono sparire');
  assert.ok(/RESET/.test(h.run('__promptMsgs.join(" ")')),
    'la conferma deve dire di scrivere RESET: ' + JSON.stringify(h.run('__promptMsgs')));

  // Secondo caso: risposta sbagliata, nulla deve essere cancellato.
  const h2 = loadGame();
  prime(h2); wireStore(h2);
  save(h2, 0);
  h2.run(`
    window.confirm = function () { return true; };
    window.prompt = function () { return 'si'; };
  `);
  h2.run('confirmWipeAllSaves()');
  assert.strictEqual(h2.run('Object.keys(__store).filter(function (k) { return k.indexOf("wp_slot_") === 0; }).length'), 1,
    'una risposta diversa da RESET non deve cancellare nulla');

  // Terzo caso: annullare la prima conferma.
  const h3 = loadGame();
  prime(h3); wireStore(h3);
  save(h3, 0);
  h3.run('window.confirm = function () { return false; };');
  h3.run('confirmWipeAllSaves()');
  assert.strictEqual(h3.run('Object.keys(__store).filter(function (k) { return k.indexOf("wp_slot_") === 0; }).length'), 1,
    'rispondendo no alla prima conferma nulla deve essere toccato');
});

// ── Autosave e slot non vuoti ────────────────────
// L'autosave sceglie lo slot su cui scrivere. Se trattasse legacy e corrotti come
// slot liberi, potrebbe sovrascrivere dati che il giocatore non ha ancora visto
// né cancellato: uno slot illeggibile diventerebbe un salvataggio nuovo senza
// che nessuno lo avesse deciso.
test('FIX 7: l\'autosave non sovrascrive uno slot corrotto', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  // Slot 0 corrotto, slot 1 e 2 liberi: l'autosave deve scegliere il 1.
  h.run('localStorage.setItem("wp_slot_0", \'{"troncato\');');
  h.run('G._currentSlot = null;');
  h.run('autoSaveToCurrentSlot(G)');
  assert.strictEqual(h.run('G._currentSlot'), 1,
    'l\'autosave deve saltare lo slot corrotto: sovrascriverlo perderebbe dati non ancora esaminati');
  assert.strictEqual(h.run('inspectSlot(0).state'), 'corrupt',
    'il contenuto dello slot corrotto deve restare intatto');
});

test('FIX 7: l\'autosave non sovrascrive uno slot legacy', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  h.run(`
    localStorage.setItem('wp_slot_0', JSON.stringify({
      version: 3, myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
  `);
  h.run('G._currentSlot = null;');
  h.run('autoSaveToCurrentSlot(G)');
  assert.strictEqual(h.run('G._currentSlot'), 1,
    'un salvataggio legacy non caricabile non deve essere sovrascritto in silenzio');
  assert.strictEqual(h.run('inspectSlot(0).version'), 3,
    'i dati legacy devono restare sul dispositivo finche\' il giocatore non decide');
});

test('FIX 7: l\'autosave scrive ancora quando tutti gli slot hanno contenuto', () => {
  const h = loadGame();
  prime(h); wireStore(h);
  save(h, 0); save(h, 1); save(h, 2);
  h.run('G._currentSlot = 1;');
  h.run('autoSaveToCurrentSlot(G)');
  assert.strictEqual(h.run('G._currentSlot'), 1,
    'con G._currentSlot impostato si scrive li, come prima');
});

// ── Finestra di scelta dello slot ────────────────
test('FIX 7: la finestra di scelta regge gli slot non caricabili', () => {
  const h = loadGame();
  // Nessuno slot vuoto, con un legacy e un corrotto: e' il caso in cui questa
  // finestra si apre. Prima leggeva m.teamCol su un null e non mostrava nulla.
  h.run(`
    G.myTeam = TEAMS_DATA[0];
    G.myId   = G.myTeam.id;
    G.phase  = 'regular';
    G.stand  = { [G.myId]: { id: G.myId, pts:10, w:3, gf:9, ga:4 } };
    G.teams  = [G.myTeam];
    G.rosters = { [G.myId]: [{ name:'A', role:'POR', stats:{}, fitness:90, overall:70 }] };
    G.schedule = [{ id:'m1', round:1, home:G.myId, away:'x', played:false }];
    __store = {};
    localStorage.setItem = function (k, v) { __store[k] = String(v); };
    localStorage.getItem = function (k) { return __store[k] === undefined ? null : __store[k]; };
    saveToSlot(G, 0);
    localStorage.setItem('wp_slot_1', '{"troncato');
    localStorage.setItem('wp_slot_2', JSON.stringify({
      version: 3, savedAt: '2026-01-01T00:00:00.000Z',
      meta: { teamId: G.myId, teamName: 'Roma', teamAbbr: 'ROM', phase: 'regular' },
      myId: G.myId, myTeam: G.myTeam, teams: G.teams, rosters: G.rosters,
      schedule: G.schedule, stand: G.stand, phase: 'regular',
    }));
  `);

  // Non deve lanciare: e' il punto del test.
  const err = h.run(`
    __caught = null;
    try { _openSlotChooser(); } catch (e) { __caught = String(e); }
    __caught;
  `);
  assert.strictEqual(err, null, 'la finestra di scelta dello slot lancia un errore: ' + err);

  // Il modal viene appeso a document.body, non cercato per id: nell'harness
  // getElementById crea un elemento vuoto per qualsiasi id, quindi leggerlo
  // restituirebbe il contenuto di un elemento mai scritto.
  const html = h.run(`
    (function () {
      var b = document.body.children;
      return b.length ? (b[b.length - 1]._lastHTML || '') : '';
    })()
  `);
  // Lo slot valido mostra squadra e posizione, come prima.
  const myTeam = h.run('G.myTeam.name');
  assert.ok(html.indexOf(myTeam) !== -1, 'lo slot valido deve mostrare la squadra: ' + myTeam);
  assert.ok(/G0/.test(html), 'lo slot valido deve mostrare la giornata');
  // I due non caricabili restano selezionabili, con la ragione per cui non si
  // possono caricare.
  assert.ok(html.indexOf('confirmOverwriteSlot(0)') !== -1 &&
            html.indexOf('confirmOverwriteSlot(1)') !== -1 &&
            html.indexOf('confirmOverwriteSlot(2)') !== -1,
    'tutti e tre gli slot devono essere sovrascrivibili, anche i non caricabili');
  assert.ok(/versione 3/.test(html), 'lo slot legacy deve essere identificato: ' + html);
  assert.ok(/illeggibile/.test(html), 'lo slot corrotto deve essere identificato');
});
