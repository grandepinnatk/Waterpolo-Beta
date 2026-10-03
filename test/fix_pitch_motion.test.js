'use strict';
// Regressione: il campo immobile e la palla che teletrasporta.
//
// Sintomi segnalati: "le pedine sono ferme e la telecronaca continua" e
// "la palla scompare e riappare in zone del campo, invece di passare da una
// pedina all'altra".
//
// ── Causa 1: la coda di un tiro congelava tutto il campo ────────────────────
//
// update() aveva:
//
//     if(_seqActive){_tickSeq(dt);return;}
//
// La coda _seq non e' una lista di cose che sostituiscono il gioco: e' una
// lista di azioni da eseguire alle loro scadenze. Ma quel return faceva
// saltare tutto il ramo if(_phase==='play'), quindi durante una coda non
// giravano niente _tickMicro(), niente _tacticalT e niente
// _updateAllTargets(). I target dei token restavano quelli dell'ultimo
// frame e le pedine si fermavano.
//
// onShot() e onSave() accodano un passo di fallback a 2.25s ("se la palla
// e' ancora libera, il difensore piu' vicino la prende"). Quindi OGNI tiro e
// OGNI parata immobilizzava l'intero campo per 2.25 secondi. A velocita' 10
// i tiri arrivano ogni 2-4 secondi: il campo passava la partita immobile.
//
// ── Causa 2: la palla viaggiava 150 volte piu' veloce del nuotatore ────────
//
// In pool.js la velocita' della palla era _BASE_SPD*15*gameSpeed. La base
// (0.0667 unita'/s) e' gia' tarata per attraversare il campo in 12s; con 15
// e gameSpeed 10 la palla copriva l'intero bacino in 2-3 frame. I salti
// misurati erano esattamente 0.333, un terzo di campo per frame.
//
// ── Causa 3: la palla compariva addosso al nuovo possessore ────────────────
//
// Il ramo "la palla segue il possessore" faceva _ball.x=_ball.tx ogni frame.
// Al cambio di possesso poolSetBallOn() agganciava la palla alla nuova
// pedina dovunque si trovasse: sparisca e riappare dall'altra parte del
// campo. Ora la palla viaggia verso il possessore e si aggancia all'arrivo.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./harness.js');

// Impostazione minima di una partita, senza logica di rendering.
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
  G.lineup  = { formation: __form };
  G.ms = createMatchState({
    match: G.schedule[0], isHome: true,
    myTeam: G.myTeam, oppTeam: G.teams[1],
    myRoster: G.rosters[G.myTeam.id], oppRoster: G.rosters.brescia,
    formation: __form, shirtNumbers: __shirts,
  });
  G.ms.running = true;
  G.ms.speed   = 1;

  __DT = 1 / 30;
  __step = function (frames) {
    for (var i = 0; i < frames; i++) {
      poolAnimStep(__DT, G.ms.speed);
      MovementController.update(__DT);
    }
  };
  __fieldKeys = function () {
    var toks = poolGetTokens();
    return Object.keys(toks).filter(function (k) { return !toks[k].isGK && !toks[k].expelled; });
  };
  // Spostamento totale dei token di campo fra due istanti consecutivi.
  __move = function (keys, prev) {
    var toks = poolGetTokens(), tot = 0;
    for (var i = 0; i < keys.length; i++) {
      var tk = toks[keys[i]];
      tot += Math.sqrt(Math.pow(tk.x - prev[i].x, 2) + Math.pow(tk.y - prev[i].y, 2));
    }
    return tot;
  };
  __snap = function (keys) {
    var toks = poolGetTokens();
    return keys.map(function (k) { return { x: toks[k].x, y: toks[k].y }; });
  };
`;

// ── Causa 1 ────────────────────────────────────────────────────────────────
// Un tiro non deve immobilizzare il campo. onShot accoda un fallback a 2.25s:
// durante quei 2.25s gli altri giocatori continuano a nuotare.
//
// Il test lascia prima assestare i token sui loro target (60s di gioco).
// Conta perche': finche' i token sono in viaggio continuano a muoversi anche
// col campo "bloccato", perche' pool.js li porta verso il target vecchio. Il
// difetto si vede solo quando sono arrivati: a quel punto l'unica cosa che
// li muove e' _updateAllTargets(), che proprio la coda bloccava.
test('un tiro non immobilizza il campo per i 2.25s del fallback', () => {
  const h = loadGame();
  h.run(PRIME);
  h.run('poolInitTokens(G.ms); MovementController.init(G.ms); MovementController.onSprintStart(1);');
  h.seed(7);

  const r = h.run(`
    __step(1800);                                 // 60s: i token arrivano ai target
    var keys = __fieldKeys();
    MovementController.onShot({
      moverKey: 'my_3', ballTarget: { x: 0.12, y: 0.5 },
      moverTarget: { x: 0.20, y: 0.5 },
    });
    var fermo = 0, tot = 0, prev = __snap(keys);
    for (var i = 0; i < 60; i++) {                // 2s: copre il fallback da 2.25s
      __step(1);
      var d = __move(keys, prev);
      prev = __snap(keys);
      tot++;
      if (d < 0.0002) fermo++;
    }
    JSON.stringify({ campi: tot, fermi: fermo })
  `);

  const out = JSON.parse(r);
  // Durante la coda di un tiro il campo non puo' restare fermo: il fallback
  // serve a chiudere una corsa, non a sospendere la partita.
  assert.ok(out.fermi / out.campi < 0.25,
    `il campo resta fermo per ${out.fermi}/${out.campi} frame durante un tiro: la coda blocca il gioco`);
});

// ── Causa 2 ────────────────────────────────────────────────────────────────
// La palla non puo' spostarsi di un terzo di campo in un frame.
test('la palla non si teletrasporta: nessun salto di piu\' di 0.2 per frame', () => {
  const h = loadGame();
  h.run(PRIME);
  // La velocita' della palla e' un fattore della velocita' di gioco: va
  // verificata sul comportamento, non con una regex sul sorgente (che si
  // rompeva a ogni rifattoraggio della formula).
  const base = h.run('JSON.stringify(poolGetBallSpeed(1))');
  const baseSpd = Number(base);
  // _BASE_SPD = 0.80/12 = 0.0667 unita'/s, campo utile 0.80 unita'.
  // Per non superare 0.2 unita' per frame a 30fps servono meno di 0.2*30/0.0667
  // = 90 unita'/s, cioe' un fattore sotto 90 con gameSpeed 1: il controllo
  // vero e' sul prodotto, ma il fattore non deve essere piu' di 6.
  assert.ok(baseSpd > 0,
    'poolGetBallSpeed non restituisce una velocita\' utilizzabile');
  assert.ok(baseSpd <= 6 * (0.80 / 12),
    `a velocita' 1 la palla viaggia a ${baseSpd.toFixed(4)} unita'/s: `
    + `a velocita' 10 attraversa il campo in 2-3 frame (teletrasporto)`);

  // E deve crescere in modo lineare con la velocita' di gioco.
  const r = h.run(`
    var a = poolGetBallSpeed(1), b = poolGetBallSpeed(10);
    JSON.stringify({ a: a, b: b, rapporto: b / a })
  `);
  const out = JSON.parse(r);
  assert.ok(Math.abs(out.rapporto - 10) < 0.001,
    `la velocita' della palla non scala con gameSpeed: x10 = x${out.rapporto.toFixed(2)}`);
});

test('la velocita\' della palla a velocita\' 10 non sposta piu\' di 0.2 per frame', () => {
  const h = loadGame();
  h.run(PRIME);
  h.run('poolInitTokens(G.ms); MovementController.init(G.ms); MovementController.onSprintStart(10); G.ms.speed = 10;');
  h.seed(7);

  const r = h.run(`
    __step(180);
    poolReleaseBall();
    poolMoveBallDirect(0.05, 0.5);                // palla a fondo campo
    var keys = __fieldKeys();
    var peggiore = 0, salti = 0;
    var b = poolGetBallPos(), prev = { x: b.x, y: b.y };
    for (var i = 0; i < 120; i++) {
      __step(1);
      var q = poolGetBallPos();
      var d = Math.sqrt(Math.pow(q.x - prev.x, 2) + Math.pow(q.y - prev.y, 2));
      if (d > peggiore) peggiore = d;
      if (d > 0.2) salti++;
      prev = { x: q.x, y: q.y };
    }
    JSON.stringify({ peggiore: peggiore, salti: salti })
  `);

  const out = JSON.parse(r);
  assert.equal(out.salti, 0,
    `la palla ha fatto ${out.salti} salti oltre 0.2 per frame (max ${out.peggiore.toFixed(3)}): si teletrasporta`);
});

// ── Causa 3 ────────────────────────────────────────────────────────────────
// Al cambio di possesso la palla viaggia, non compare gia' addosso al
// nuovo possessore.
//
// Il salto non si vede subito dopo poolSetBallOn(): nel codice precedente la
// palla scattava sul possessore al frame successivo, dentro poolAnimStep. Va
// quindi misurato lo spostamento frame per frame mentre la palla e' in
// viaggio.
test('la palla viaggia verso il nuovo possessore invece di comparirgli addosso', () => {
  const h = loadGame();
  h.run(PRIME);
  h.run('poolInitTokens(G.ms); MovementController.init(G.ms); MovementController.onSprintStart(1);');
  h.seed(7);

  const r = h.run(`
    __step(360);
    var toks = poolGetTokens();
    // Palla a fondo campo, poi possesso a un token dall'altra parte.
    poolReleaseBall();
    poolMoveBallDirect(0.06, 0.5);
    var b0 = poolGetBallPos();
    // Il token piu' LONTANO dalla palla: scegliere "il primo con x>0.7"
    // dipendeva dalla formazione e poteva capitare a 0.17 dalla palla,
    // rendendo il test incapace di verificare un viaggio vero.
    var lontano = null, distanzaAlToken = 0;
    for (var key in toks) {
      if (toks[key].isGK || toks[key].expelled) continue;
      var d = Math.sqrt(Math.pow(toks[key].x - b0.x, 2)
                      + Math.pow(toks[key].y - b0.y, 2));
      if (d > distanzaAlToken) { distanzaAlToken = d; lontano = key; }
    }
    poolSetBallOn(lontano);
    // Segui lo spostamento della palla mentre raggiunge il possessore.
    var peggiore = 0, prev = poolGetBallPos();
    for (var i = 0; i < 40; i++) {
      __step(1);
      var q = poolGetBallPos();
      var d = Math.sqrt(Math.pow(q.x - prev.x, 2) + Math.pow(q.y - prev.y, 2));
      if (d > peggiore) peggiore = d;
      prev = { x: q.x, y: q.y };
    }
    JSON.stringify({
      lontano: lontano,
      peggiore: peggiore,
      distanzaAlToken: distanzaAlToken,
    })
  `);

  const out = JSON.parse(r);
  assert.ok(out.lontano, 'nessun token lontano trovato: il test non verifica nulla');
  assert.ok(out.distanzaAlToken > 0.2,
    `il token scelto e' troppo vicino (${out.distanzaAlToken.toFixed(3)}): il test non verifica nulla`);
  // Sul campo (0.80 unita') attraversare mezzo campo in un solo frame non e'
  // un passaggio: e' la palla che compare gia' addosso al possessore.
  assert.ok(out.peggiore < 0.1,
    `la palla si e' spostata di ${out.peggiore.toFixed(3)} in un frame su una distanza `
    + `di ${out.distanzaAlToken.toFixed(3)}: compare addosso al possessore invece di viaggiare`);
});