'use strict';
// Regressione: i passaggi e la palla libera.
//
// Sintomi segnalati:
//   - "la palla dovrebbe raggiungere la pedina";
//   - "se il passaggio è sbagliato, non deve essere un passaggio perfetto:
//     la pedina più vicina si muove per prenderla";
//   - "la palla non si muove mai autonomamente se non c'è una pedina vicino
//     che ne detiene il possesso".
//
// ── Causa 1: il passatore mirava a dove il ricevitore era, non dove sarebbe
//    stato ────────────────────────────────────────────────────────────────────
//
// _autoPass() puntava alla posizione corrente del ricevitore, che cambia a
// ogni _updateAllTargets(). La palla arrivava dove il ricevitore non c'era più.
// Ora _passAim() calcola dove sarà il ricevitore all'arrivo (lead sul tempo di
// volo) e glielo comanda come destinazione.
//
// ── Causa 2: il ricevitore venuto riposizionato mentre la palla era in aria ──
//
// _updateAllTargets() riscrive il target di tutti i token ogni 0.8s. Il
// ricevitore tornava in formazione a ogni aggiornamento tattico, quindi la
// palla arrivava sempre in un punto che aveva appena lasciato. Con la marcatura
// a uomo il risultato era che quasi nessun passaggio arrivava a destinazione.
//
// ── Causa 3: l'intercettazione veniva ricalcolata a ogni frame ──────────────
//
// Il controllo proiettava il difensore sul segmento palla→ricevitore, che si
// accorcia a ogni frame man mano che la palla avanza: il marcatore del
// ricevitore finiva sempre "sulla traiettoria" e il 59% dei passaggi risultava
// intercettato. La domanda va posta una volta sola, al lancio: se un difensore
// è in linea quando la palla parte, si lancia un dado e l'intercettazione
// avviene davvero, nel punto della linea in cui si trova.
//
// ── Causa 4: i fallimenti erano sempre "intercettazioni" ─────────────────────
//
// L'errore di mira era una uniforme centrata sul raggio di presa, quindi la
// soglia decideva tutto e i passaggi sbagliati non capitavano mai. Ora l'esito
// si decide prima: sotto pressione il passaggio può finire fuori bersaglio, la
// palla arriva in acqua e non la prende nessuno.
//
// ── Causa 5: la corsa alla palla libera era irraggiungibile ─────────────────
//
// pool.js restava in fase 'idle': nessuno chiamava poolSetPhaseFromMC(), quindi
// il ramo che fa scattare il più vicino di ogni squadra non girava mai. La
// corsa scattava inoltre solo dopo 1s di attesa, troppo tardi: ora scatta
// subito e chi arriva prende il possesso fisicamente.

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
  // Passa la palla a un token e forza un passaggio: i tempi del passaggio
  // automatico sono casuali e renderebbero il test non deterministico.
  __passaA = function (key) {
    poolSetBallOn(key);
    MovementController.onPossessChange(key.split('_')[0], key);
    MovementController.forcePass();
    return MovementController.pendingReceiver();
  };
  __dist = function (ax, ay, bx, by) {
    return Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
  };
  // Token di campo piu' vicino a un punto, per squadra.
  __vicino = function (px, py, team) {
    var toks = poolGetTokens(), best = null, bd = 9;
    Object.keys(toks).forEach(function (k) {
      var t = toks[k];
      if (t.expelled || t.tempAbsent || t.isGK || t.team !== team) return;
      var d = __dist(t.x, t.y, px, py);
      if (d < bd) { bd = d; best = k; }
    });
    return { key: best, dist: bd };
  };
`;

function partita(speed = 1, seed = 4242) {
  const h = loadGame();
  h.run(PRIME);
  h.run(`poolInitTokens(G.ms); MovementController.init(G.ms);
         MovementController.onSprintStart(${speed}); G.ms.speed = ${speed};`);
  h.seed(seed);
  return h;
}

test('il ricevitore nuota verso il punto d\'incontro e non viene riposizionato', () => {
  const h = partita();
  const r = h.run(`
    __step(120);
    var pend = __passaA('my_3');
    var out = { err: null, deltaIniziale: 9, deltaDopo: 9 };
    if (!pend) out.err = 'nessun passaggio lanciato';
    else {
      var toks = poolGetTokens();
      var targetIniziale = { x: toks[pend.key].tx, y: toks[pend.key].ty };
      // Distanza del punto comandato dal punto di incontro: deve essere ~0.
      out.deltaIniziale = __dist(targetIniziale.x, targetIniziale.y, pend._meetX, pend._meetY);
      // _updateAllTargets() gira ogni 0.8s: 30 frame a 1/30 lo attraversano.
      __step(30);
      out.key = pend.key;
      out.ancoraPending = !!MovementController.pendingReceiver();
      var t2 = poolGetTokens()[pend.key];
      out.deltaDopo = __dist(t2.tx, t2.ty, pend._meetX, pend._meetY);
    }
    JSON.stringify(out)
  `);

  const out = JSON.parse(r);
  assert.ok(!out.err, out.err);
  assert.ok(out.deltaIniziale < 0.02,
    `il ricevitore non e' stato comandato verso il punto d'incontro `
    + `(scarto ${out.deltaIniziale.toFixed(3)}): la palla arriva dove lui non c'e')`);
  assert.ok(out.deltaDopo < 0.02,
    `il ricevitore e' stato riposizionato tatticamente mentre la palla era in aria `
    + `(scarto ${out.deltaDopo.toFixed(3)} dal punto d'incontro)`);
});

test('il passaggio arriva al ricevitore: la palla finisce addosso a una pedina', () => {
  const h = partita(1, 11);
  const r = h.run(`
    __step(120);
    var esiti = { lanciati: 0, arrivati: 0, salti: 0, maxSalto: 0 };
    for (var n = 0; n < 40; n++) {
      var pend = __passaA(n % 2 ? 'my_4' : 'opp_5');
      if (!pend) continue;
      esiti.lanciati++;
      var prev = poolGetBallPos();
      var toccata = false;
      for (var i = 0; i < 90 && !toccata; i++) {
        __step(1);
        var b = poolGetBallPos();
        var d = Math.hypot(b.x - prev.x, b.y - prev.y);
        if (d > esiti.maxSalto) esiti.maxSalto = d;
        if (d > 0.15) esiti.salti++;
        prev = { x: b.x, y: b.y };
        if (poolGetBallOwner()) toccata = true;
      }
      if (poolGetBallOwner()) esiti.arrivati++;
      if (poolGetBallOwner() || MovementController._hasPendingReceiver()) continue;
    }
    JSON.stringify(esiti)
  `);

  const out = JSON.parse(r);
  assert.ok(out.lanciati >= 20, `pochi passaggi lanciati (${out.lanciati})`);
  assert.ok(out.arrivati / out.lanciati >= 0.5,
    `solo ${out.arrivati}/${out.lanciati} passaggi raggiungono una pedina: `
    + 'la palla non arriva piu\' a destinazione');
  assert.equal(out.salti, 0,
    `la palla ha saltato ${out.salti} volte di piu' di 0.15 in un frame `
    + `(max ${out.maxSalto.toFixed(3)}): compare addosso a qualcuno invece di viaggiare`);
});

test('la palla libera non si muove da sola', () => {
  const h = partita(1, 77);
  const r = h.run(`
    var c = { looseFrames: 0, looseMoved: 0, maxStep: 0 };
    for (var n = 0; n < 3000; n++) {
      var before = poolGetBallPos();
      poolAnimStep(__DT, G.ms.speed);
      MovementController.update(__DT);
      var b = poolGetBallPos();
      // "In acqua" = nessuno la detiene e nessun passaggio e' in arrivo
      if (poolGetBallOwner()) continue;
      if (MovementController._hasPendingReceiver()) continue;
      if (poolBallInFlight()) continue;
      c.looseFrames++;
      var d = Math.hypot(b.x - before.x, b.y - before.y);
      if (d > 0.0005) { c.looseMoved++; if (d > c.maxStep) c.maxStep = d; }
    }
    JSON.stringify(c)
  `);

  const out = JSON.parse(r);
  assert.ok(out.looseFrames > 100,
    `pochi frame con la palla in acqua (${out.looseFrames}): il test non verifica nulla`);
  assert.ok(out.looseMoved / out.looseFrames < 0.05,
    `la palla si e' mossa da sola in ${out.looseMoved}/${out.looseFrames} frame `
    + `con la palla in acqua (max ${out.maxStep.toFixed(4)}): si trascina`);
});

test('il passaggio sbagliato finisce in acqua e la pedina piu\' vicina la prende', () => {
  const h = partita(1, 909);
  const r = h.run(`
    var c = { persi: 0, corsa: 0, corsaConEntrambi: 0,
              assegnazioni: 0, presaLontana: 0, peggioreScalo: 0,
              salti: 0, chiusi: 0, attesaMax: 0 };
    var inEp = false, ownerPrec = null, frameConPossesso = 0, attesa = 0;
    var inCorso = false, inLibero = false;
    for (var n = 0; n < 2600; n++) {
      var before = poolGetBallPos();
      poolAnimStep(__DT, G.ms.speed);
      MovementController.update(__DT);
      var b = poolGetBallPos();
      var owner = poolGetBallOwner();
      var pend  = MovementController._hasPendingReceiver();

      // Passaggio di PROPRIETA' a partita avviata: quando la palla passa da
      // una pedina a un'altra, il nuovo possessore deve gia' essere sulla
      // palla. Se e' lontano, la palla non e' stata raggiunta: gli e'
      // comparsa addosso.
      //
      // Non si conta la messa in gioco (ripresa, inizio periodo): li' non c'era
      // un possessore precedente e la palla viene semplicemente appoggiata in
      // campo, poi la raggiunge da sola.
      if (owner) frameConPossesso++;
      if (owner && owner !== ownerPrec && ownerPrec && frameConPossesso >= 30) {
        c.assegnazioni++;
        var tOwn = poolGetTokens()[owner];
        var dOwn = __dist(tOwn.x, tOwn.y, b.x, b.y);
        if (dOwn > 0.075) { c.presaLontana++; if (dOwn > c.peggioreScalo) c.peggioreScalo = dOwn; }
      }
      if (owner !== ownerPrec) frameConPossesso = 0;
      ownerPrec = owner;

      if (owner || pend || poolBallInFlight()) {
        if (inEp) { inEp = false; c.chiusi++; }
        attesa = 0;
        continue;
      }

      // QUI la palla è in acqua e nessuno la detiene
      if (!inEp) { inEp = true; c.persi++; }
      var d = Math.hypot(b.x - before.x, b.y - before.y);
      if (d > 0.15) c.salti++;

// Quanto ha aspettato la squadra prima di muoversi? Deve essere breve:
      // la palla appena mancata la cerca subito qualcuno.
      //
      // Si misura solo in fase 'play', cioè a gioco aperto: è lì che
      // capitano i passaggi. In fase 'sprint' c'è la sequenza di tiro, e il
      // recupero di un tiro sbagliato è già gestito dalla coda con il suo
      // fallback.
      //
      // L'attesa parte dall'istante in cui la palla resta in acqua e si
      // ferma quando qualcuno la va' a prendere.
      if (poolGetPhase() !== 'play') { attesa = 0; inCorso = false; inLibero = false; continue; }
      if (!inLibero) { inLibero = true; attesa = 0; }
      else attesa += __DT;
      var toks = poolGetTokens(), corso = false;
      Object.keys(toks).forEach(function (k) {
        if (toks[k]._raceTo) corso = true;
      });
      if (corso && !inCorso && attesa > c.attesaMax) c.attesaMax = attesa;
      inCorso = corso;

      // Mentre la corsa è attiva, il più vicino di ogni squadra deve puntare
      // alla palla: nessuno può restare in formazione a guardare.
      //
      // La soglia è 0.08 e non 0.06: il bersaglio viene impostato a inizio
      // frame mentre la distanza è misurata a fine frame, e un pedone già
      // arrivato sulla palla (a 0.056) ha il bersaglio un filo più indietro.
      // Resta comunque un ordine di grandezza sotto le posizioni di
      // formazione, che sono a 0.2 o più dalla palla.
      if (corso) {
        var my  = __vicino(b.x, b.y, 'my');
        var opp = __vicino(b.x, b.y, 'opp');
        if (my.key && opp.key) {
          c.corsa++;
          var tm = poolGetTokens()[my.key], to = poolGetTokens()[opp.key];
          if (tm.tx !== undefined && to.tx !== undefined
              && __dist(tm.tx, tm.ty, b.x, b.y) < 0.08
              && __dist(to.tx, to.ty, b.x, b.y) < 0.08) c.corsaConEntrambi++;
        }
      }
    }
    JSON.stringify(c)
  `);

  const out = JSON.parse(r);
  assert.ok(out.persi >= 3,
    `pochi passaggi persi osservati (${out.persi}): il test non verifica nulla`);
  assert.equal(out.chiusi, out.persi,
    `${out.persi - out.chiusi} episodi di palla libera non si chiudono mai: `
    + 'nessuno va a prenderla e il gioco si blocca');
  assert.equal(out.presaLontana, 0,
    `il possesso e' stato assegnato ${out.presaLontana} volte a una pedina lontana `
    + `dalla palla (fino a ${out.peggioreScalo.toFixed(3)}): `
    + 'la palla le compare addosso invece di essere raggiunta');
  assert.equal(out.salti, 0,
    `la palla libera ha saltato ${out.salti} volte di piu' di 0.15 in un frame`);
  assert.ok(out.corsa >= 20,
    `pochi frame con la corsa alla palla attiva (${out.corsa}): il test non verifica nulla`);
  assert.equal(out.corsaConEntrambi, out.corsa,
    `in ${out.corsa - out.corsaConEntrambi} frame di corsa almeno una squadra `
    + 'non manda il suo piu\' vicino verso la palla');
  assert.ok(out.attesaMax <= 0.4,
    `la palla e' rimasta in acqua ${out.attesaMax.toFixed(2)}s prima che qualcuno `
    + 'la cercasse: nessuno si muove verso la palla libera');
});

test('il possesso nella corsa va a chi arriva davvero, non a chi e\' piu\' vicino', () => {
  const h = partita(1, 5150);
  const r = h.run(`
    // Palla lasciata in acqua lontana da entrambe le squadre: la pedina
    // più vicina deve nuotare e prendere il possesso all'arrivo.
    poolReleaseBall();
    poolMoveBallDirect(0.5, 0.5);
    __step(60);
    var b = poolGetBallPos();
    var prima = __vicino(b.x, b.y, 'my');
    if (!prima.key) { JSON.stringify({ err: 'nessuna pedina vicina' }); }
    else {
    var distanza = prima.dist;
    var salti = 0, prev = poolGetBallPos();
    var preso = null;
    for (var i = 0; i < 200; i++) {
      poolAnimStep(__DT, G.ms.speed);
      MovementController.update(__DT);
      var q = poolGetBallPos();
      if (Math.hypot(q.x - prev.x, q.y - prev.y) > 0.15) salti++;
      prev = { x: q.x, y: q.y };
      var own = poolGetBallOwner();
      if (own) { preso = { own: own, dist: __vicino(q.x, q.y, own.split('_')[0]).dist }; break; }
    }
    JSON.stringify({ distanza: distanza, salti: salti, preso: preso });
    }
  `);

  const out = JSON.parse(r);
  assert.ok(!out.err, out.err);
  assert.ok(out.distanza > 0.06,
    `la pedina piu' vicina era gia' addosso alla palla (${out.distanza.toFixed(3)}): `
    + 'il test non verifica nessuna corsa');
  assert.ok(out.preso,
    'nessuno ha preso la palla in acqua: la corsa non funziona');
  assert.equal(out.salti, 0,
    `la palla ha saltato ${out.salti} volte durante la corsa: `
    + 'compare addosso al pedone che la prende');
  assert.ok(out.preso.dist < 0.06,
    `il possessore e' a ${out.preso.dist.toFixed(3)} dalla palla: `
    + 'il possesso e\' stato assegnato senza che la pedina la raggiungesse');
});