// ─────────────────────────────────────────────────────────────────────────────
// engine/live_engine.js  —  Motore partita GIOCATA  v0.9.0
//
// ARCHITETTURA: il canvas guida il motore.
// Il motore non genera eventi random indipendenti — legge lo stato del canvas
// (posizioni token, possesso palla, fase di gioco) e decide quale evento
// è fisicamente plausibile in quel momento.
//
// Separato da engine/match.js che continua a gestire:
//   - createMatchState / advanceTime
//   - simNextRound (partite simulate senza canvas)
//   - simulateMatchStats (statistiche simulate)
// ─────────────────────────────────────────────────────────────────────────────

// ── Costanti geometria (specchio di pool.js) ──────────────────────────────
var LIVE = {
  cx: 0.50, cy: 0.50,
  myGKX:  0.09,  oppGKX: 0.91,
  myGoalY0: 0.38, myGoalY1: 0.62,
  // Zona tiro: entro questi X dalla porta
  MY_SHOT_ZONE:  0.28,   // attaccanti avv in zona tiro se x < 0.28
  OPP_SHOT_ZONE: 0.72,   // nostri attaccanti in zona tiro se x > 0.72
  // Zona pericolo CB (5m proporzionali)
  FIVE_M: 0.16,
  // Distanza "contatto" per furto palla / duello
  DUEL_DIST: 0.08,
};

// ── Tipi di evento canvas ─────────────────────────────────────────────────
// Il canvas chiama generateLiveEvent(ms, canvasState) invece di generateMatchEvent(ms)
// canvasState viene popolato da movement.js ogni frame

var _liveState = {
  attack:        'my',     // chi ha il possesso
  ballOwnerKey:  null,     // es. 'my_3'
  ballX:         0.5,
  ballY:         0.5,
  ballFree:      false,    // palla libera (dopo tiro)
  cbInShotZone:  false,    // my_6 è in zona tiro
  cbMarkerDist:  999,      // distanza tra CB e suo marcatore
  passCount:     0,        // passaggi consecutivi senza tiro
  phaseTime:     0,        // secondi con lo stesso possesso
};

// Chiamato da movement.js ogni frame per aggiornare lo stato canvas
function liveUpdateState(patch) {
  if (!patch) return;
  Object.keys(patch).forEach(function(k) { _liveState[k] = patch[k]; });
}

function liveGetState() { return _liveState; }

// ── Generatore eventi basato su canvas ───────────────────────────────────
// Sostituisce generateMatchEvent per le partite giocate.

// Evento per shot clock scaduto
function generateShotClockEvent(ms, prevAttack) {
  var newTeam = prevAttack === 'my' ? 'opp' : 'my';
  var bPos = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:0.5,y:0.5};
  return {
    txt: '⏱ Fallo in attacco — Palla a ' + (newTeam==='my'?ms.myTeam.name:ms.oppTeam.name) + ' (30s scaduti)',
    cls: 'fl',
    ballTarget: { x: _clampX(bPos.x + (newTeam==='my'?0.03:-0.03)), y: _clampY(bPos.y) },
    moverKey:   newTeam + '_3',
  };
}
// Viene chiamato dal loop _animLoop quando nextActionIn scade.
function generateLiveEvent(ms) {
  if (!ms) return null;

  var st = _liveState;

  // Shot clock scaduto → evento motivato immediatamente
  if(st.shotClockExpired) {
    liveUpdateState({shotClockExpired:false});
    return generateShotClockEvent(ms, st.prevAttack || _liveState.attack);
  }

  st = _liveState;
  var attack  = st.attack || 'my';
  var ownerKey = st.ballOwnerKey;
  var ownerPk  = ownerKey ? ownerKey.split('_')[1] : null;
  var bx = st.ballX || 0.5, by = st.ballY || 0.5;

  // ── Calcola forza attuale (come generateMatchEvent) ──────────────────
  var myEffective = _calcMyEffective(ms);
  var oppStr      = ms.oppTeam.str * (ms.oppTeam._staminaFactor || 1.0);

  // ── Selezione evento basata sullo stato canvas ────────────────────────

  // 1. CB avversario in zona tiro con marcatore vicino → tiro (evento visivo già
  //    triggerato da movement.js, ma il motore deve registrarlo statisticamente)
  if (st.cbInShotZone && st.cbMarkerDist < 0.07 && attack !== 'my') {
    return _buildOppShotEvent(ms, myEffective, oppStr, bx, by);
  }
  if (st.cbInShotZone && st.cbMarkerDist < 0.07 && attack === 'my') {
    return _buildMyShotEvent(ms, myEffective, oppStr, bx, by);
  }

  // 2. Palla in zona tiro nostra (x > OPP_SHOT_ZONE) e attaccanti nostri → tiro
  if (attack === 'my' && bx > LIVE.OPP_SHOT_ZONE && st.passCount >= 2) {
    return _buildMyShotEvent(ms, myEffective, oppStr, bx, by);
  }

  // 3. Palla in zona tiro avversaria (x < MY_SHOT_ZONE) → tiro avversario
  if (attack === 'opp' && bx < LIVE.MY_SHOT_ZONE && st.passCount >= 2) {
    return _buildOppShotEvent(ms, myEffective, oppStr, bx, by);
  }

  // 4. Possesso lungo (> 8s) → probabilità crescente di perdere palla o tirare
  if (st.phaseTime > 8) {
    var shotProb = Math.min(0.60, (st.phaseTime - 8) * 0.07);
    if (Math.random() < shotProb) {
      return attack === 'my'
        ? _buildMyShotEvent(ms, myEffective, oppStr, bx, by)
        : _buildOppShotEvent(ms, myEffective, oppStr, bx, by);
    }
    // Possesso molto lungo → palla persa
    if (st.phaseTime > 30 && Math.random() < 0.4) {
      return _buildTurnoverEvent(ms, attack, bx, by);
    }
  }

  // 5. Fallo: basato su probabilità tattica (come prima)
  var foulEvent = _tryFoulEvent(ms, attack, bx, by);
  if (foulEvent) return foulEvent;

  // 6. Evento neutro: azione di costruzione
  return _buildNeutralEvent(ms, attack, bx, by);
}

// ── Builder eventi specifici ──────────────────────────────────────────────

function _buildMyShotEvent(ms, myEff, oppStr, bx, by) {
  ms.myShots++;
  var activePlayers = _getActivePlayers(ms);
  if (!activePlayers.length) return _buildNeutralEvent(ms, 'my', bx, by);

  var attacker = _weightedPick(activePlayers, function(x) { return x.eff; });
  var tec = (attacker.p.stats && attacker.p.stats.tec) ? attacker.p.stats.tec : 50;
  var tecBonus = (tec - 50) / 100 * 0.08;
  var goalProb = 0.18 + ((myEff - oppStr) / 500) + tecBonus * 0.5;

  // Usa posizione canvas reale della palla per il target
  var shotY = _clampY(by + _rnd(-0.06, 0.06));

  if (Math.random() < goalProb) {
    ms.myScore++;
    attacker.p.goals = (attacker.p.goals || 0) + 1;
    ms.matchGoals[attacker.pi] = (ms.matchGoals[attacker.pi] || 0) + 1;
    if (ms.periodScores && ms.period >= 1 && ms.period <= 4)
      ms.periodScores[ms.period - 1].my++;
    if (!ms.matchDuels[attacker.pi]) ms.matchDuels[attacker.pi] = {won:0,lost:0};
    ms.matchDuels[attacker.pi].won++;
    _liveState.passCount = 0;
    return {
      txt: '⚽ GOL! ' + attacker.p.name + ' (#' + (ms.shirtNumbers[attacker.pi] || '?') + ') segna!',
      cls: 'myg',
      shotTeam:    'my',
      ballTarget:  { x: 0.94, y: shotY },
      moverKey:    'my_' + attacker.pk,
      moverTarget: { x: Math.min(bx + 0.05, 0.88), y: by },
      goalScored:  true, goalTeam: 'my', goalScorer: attacker.p.name,
    };
  } else {
    var oppGk = ms.oppRoster.find(function(p){ return p.role === 'POR'; });
    if (!ms.matchDuels[attacker.pi]) ms.matchDuels[attacker.pi] = {won:0,lost:0};
    ms.matchDuels[attacker.pi].lost++;
    _liveState.passCount = 0;
    return {
      txt: 'Tiro di ' + attacker.p.name + ' — parata' + (oppGk ? ' di ' + oppGk.name : ''),
      cls: 'sv',
      shotTeam:    'my',
      ballTarget:  { x: LIVE.oppGKX, y: shotY },
      moverKey:    'my_' + attacker.pk,
      moverTarget: { x: Math.max(bx - 0.05, 0.12), y: by },
    };
  }
}

function _buildOppShotEvent(ms, myEff, oppStr, bx, by) {
  ms.oppShots++;
  var goalProb = 0.18 + ((oppStr - myEff) / 500);
  var shotY = _clampY(by + _rnd(-0.06, 0.06));

  if (Math.random() < goalProb) {
    ms.oppScore++;
    if (ms.periodScores && ms.period >= 1 && ms.period <= 4)
      ms.periodScores[ms.period - 1].opp++;
    var oppScorer = _pickOppScorer(ms);
    _liveState.passCount = 0;
    return {
      txt: '⚽ ' + ms.oppTeam.name + ' segna!' + (oppScorer ? ' (' + oppScorer + ')' : ''),
      cls: 'og',
      shotTeam:    'opp',
      ballTarget:  { x: 0.05, y: shotY },
      goalScored:  true, goalTeam: 'opp', goalScorer: oppScorer || ms.oppTeam.name,
    };
  } else {
    var myGk = ms.myRoster[ms.onField['GK']];
    _liveState.passCount = 0;
    return {
      txt: 'Parata' + (myGk ? ' di ' + myGk.name : '') + '!',
      cls: 'sv',
      shotTeam:    'opp',
      ballTarget:  { x: LIVE.myGKX, y: shotY },
    };
  }
}

function _buildTurnoverEvent(ms, attack, bx, by) {
  _liveState.passCount = 0;
  _liveState.phaseTime = 0;
  var newTeam = attack === 'my' ? 'opp' : 'my';
  return {
    txt: 'Cambio possesso palla',
    cls: '',
    moverKey: newTeam + '_3',
    ballTarget: { x: bx + (newTeam === 'my' ? 0.05 : -0.05), y: by },
  };
}

function _buildNeutralEvent(ms, attack, bx, by) {
  _liveState.passCount = (_liveState.passCount || 0) + 1;
  // Gli eventi neutri descrivono costruzione di gioco, non eventi impossibili.
  // NON includere "Azione neutralizzata" o "Contrattacco sventato" come fallback
  // perché vengono sparati anche quando non c'è nessuno vicino al possessore.
  var NEUTRAL = [
    'Rimessa in gioco', 'Passaggio in avanti',
    'Manovra di attacco', 'Circolazione palla',
  ];
  var txt = NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)];
  // Palla rimane vicino alla sua posizione attuale
  return {
    txt: txt, cls: '',
    moverKey: attack + '_3',
    ballTarget: { x: _clampX(bx + _rnd(-0.06, 0.06)), y: _clampY(by + _rnd(-0.04, 0.04)) },
  };
}

function _tryFoulEvent(ms, attack, bx, by) {
  var tactic = (ms.tactic || 'balanced');
  var foulMult = { defense:0.40, balanced:0.75, counter:0.90, attack:1.00, press:1.10 };
  var prob = 0.050 * (foulMult[tactic] || 0.75);

  if (Math.random() >= prob) return null;

  // Fallo sulla nostra squadra → espulsione temporanea nostra
  var foulCandidates = Object.entries(ms.onField)
    .filter(function(e){ return e[0] !== 'GK' && !ms.expelled.has(e[1]); })
    .map(function(e){
      var pk=e[0], pi=e[1], p=ms.myRoster[pi];
      return p ? { pk, pi, p } : null;
    }).filter(Boolean);

  if (foulCandidates.length && Math.random() < 0.5) {
    var fp = foulCandidates[Math.floor(Math.random() * foulCandidates.length)];
    var shirt = ms.shirtNumbers[fp.pi] || '?';
    ms.myFouls++;
    ms.tempExp[fp.pi] = (ms.tempExp[fp.pi] || 0) + 1;
    var count = ms.tempExp[fp.pi];
    if (count >= 3) {
      ms.expelled.add(fp.pi);
      return { txt: '🔴 ESPULSO! ' + fp.p.name + ' (#' + shirt + ')', cls: 'exp',
               expelled: fp.pi, moverKey: 'my_'+fp.pk };
    }
    ms.inferiorityActive = true;
    ms.inferiorityTimer = 20;
    return { txt: '🟡 Esp. temp. ('+count+'/3) — ' + fp.p.name + ' — Inferiorità!',
             cls: 'fl', inferiorityStart: true,
             ballTarget: { x: _clampX(bx+0.05), y: _clampY(by) } };
  }

  // Fallo avversario → nostra superiorità
  if (!ms.superiorityActive && Math.random() < 0.5) {
    ms.oppTempExp = (ms.oppTempExp||0)+1;
    ms.superiorityActive = true;
    ms.superiorityTimer = 20;
    return { txt: '🟡 Fallo ' + (ms.oppTeam.abbr||ms.oppTeam.name) + ' — Superiorità! (20s)',
             cls: 'sv', superiorityStart: true,
             ballTarget: { x: _clampX(bx-0.05), y: _clampY(by) } };
  }

  return null;
}

// ── Helpers interni ───────────────────────────────────────────────────────

function _calcMyEffective(ms) {
  var myEff = 0;
  var activePlayers = _getActivePlayers(ms);
  activePlayers.forEach(function(x){ myEff += x.eff; });
  var activeCount = Object.entries(ms.onField)
    .filter(function(e){ return !ms.expelled.has(e[1]); }).length;
  var shortage = Math.max(0, 7 - activeCount);
  myEff = (myEff / Math.max(1, activeCount)) * activeCount / 7 * Math.pow(0.80, shortage);
  var tactic = ms.tactic || 'balanced';
  var boosts = { balanced:0, attack:8, defense:-5, counter:3, press:5 };
  myEff += (boosts[tactic] || 0);
  if (ms.isHome && ms.attendance > 0 && ms.capacity > 0)
    myEff *= (1 + Math.min(0.05, ms.attendance/ms.capacity*0.05));
  return myEff;
}

function _getActivePlayers(ms) {
  var result = [];
  Object.entries(ms.onField).forEach(function(e) {
    var pk=e[0], pi=e[1];
    if (pk === 'GK' || ms.expelled.has(pi)) return;
    var p = ms.myRoster[pi]; if (!p) return;
    var eff = _calcPlayerEff(p, pk, ms);
    result.push({ pk, pi, p, eff });
  });
  return result;
}

function _calcPlayerEff(p, pk, ms) {
  var ovr = p.ovr || 50;
  var sta = (ms.stamina && ms.stamina[Object.entries(ms.onField).find(function(e){return e[0]===pk;})?.[1]])
    || p.fitness || 50;
  return ovr * (0.5 + sta/200);
}

function _pickOppScorer(ms) {
  if (!ms.oppRoster) return '';
  var fp = ms._oppOnField
    ? ms._oppOnField.map(function(i){ return ms.oppRoster[i]; }).filter(function(p){ return p && p.role!=='POR'; })
    : ms.oppRoster.filter(function(p){ return p && p.role!=='POR'; });
  if (!fp.length) return '';
  var w = fp.map(function(p){ return p.role==='ATT'?4:p.role==='CB'?2:p.role==='CEN'?3:1; });
  var tot = w.reduce(function(s,v){ return s+v; }, 0);
  var r = Math.random()*tot;
  for (var i=0; i<fp.length; i++) { r-=w[i]; if(r<=0){ fp[i].goals=(fp[i].goals||0)+1; return fp[i].name; } }
  return fp[0] ? fp[0].name : '';
}

function _weightedPick(arr, weightFn) {
  var tot=0; arr.forEach(function(x){ tot+=weightFn(x); });
  var r=Math.random()*tot;
  for (var i=0;i<arr.length;i++){ r-=weightFn(arr[i]); if(r<=0) return arr[i]; }
  return arr[arr.length-1];
}

function _rnd(lo,hi){ return lo+Math.random()*(hi-lo); }
function _clampX(x){ return Math.max(0.11, Math.min(0.89, x)); }
function _clampY(y){ return Math.max(0.13, Math.min(0.87, y)); }
