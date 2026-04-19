// ─────────────────────────────────────────────
// canvas/pool.js — Pallanuoto realistica v2
// ─────────────────────────────────────────────

const POOL_W = 760;
const POOL_H = 430;

// ── Geometria del campo ───────────────────────
const PLAY = {
  x0: 0.10,  x1: 0.90,
  y0: 0.12,  y1: 0.88,
  cx: 0.50,  cy: 0.50,
  myGoalX:   0.08,  oppGoalX:  0.92,
  myGoalY0:  0.38,  myGoalY1:  0.62,
  oppGoalY0: 0.38,  oppGoalY1: 0.62,
  myGKminX:  0.07,  myGKmaxX:  0.12,
  oppGKminX: 0.88,  oppGKmaxX: 0.93,
  // Area rete (rettangolo DIETRO il portiere, dove entra la palla per essere goal)
  // Porta nostra (sinistra): la rete è a x < myGoalX
  myNetX0:   0.02,  myNetX1:   0.09,
  myNetY0:   0.38,  myNetY1:   0.62,
  // Porta avversario (destra): la rete è a x > oppGoalX
  oppNetX0:  0.91,  oppNetX1:  0.98,
  oppNetY0:  0.38,  oppNetY1:  0.62,
};

// ── Posizioni kickoff: schierate sui bordi ────
// Nostra squadra (bianca, porta sx): colonna verticale a sx
const KICKOFF_MY = {
  GK:  { x: 0.09, y: 0.50 },
  '5': { x: 0.13, y: 0.20 },
  '4': { x: 0.13, y: 0.35 },
  '6': { x: 0.13, y: 0.50 },
  '3': { x: 0.13, y: 0.50 },  // scattista: partirà da qui verso centro
  '2': { x: 0.13, y: 0.65 },
  '1': { x: 0.13, y: 0.80 },
};
// Avversario (blu, porta dx): colonna verticale a dx
const KICKOFF_OPP = {
  GK:  { x: 0.91, y: 0.50 },
  '1': { x: 0.87, y: 0.20 },
  '2': { x: 0.87, y: 0.35 },
  '6': { x: 0.87, y: 0.50 },
  '3': { x: 0.87, y: 0.50 },  // scattista
  '4': { x: 0.87, y: 0.65 },
  '5': { x: 0.87, y: 0.80 },
};

// ── Semicerchio attacco davanti porta avversario (nostra squadra attacca DX) ──
// Dalla foto "tipico-schieramento-a-semicerchio":
// 1-2-3-4-5 formano un arco davanti alla porta avv, 6 è il centroboa sotto porta
const MY_SEMICIRCLE_ATK = {   // nostra squadra attacca (verso dx)
  GK:  { x: 0.09, y: 0.50 },
  '5': { x: 0.70, y: 0.18 },  // ala alta
  '4': { x: 0.62, y: 0.32 },  // semicerchio alto
  '6': { x: 0.88, y: 0.50 },  // centroboa vicino porta avv
  '3': { x: 0.55, y: 0.50 },  // centro semicerchio (con pallone spesso)
  '2': { x: 0.62, y: 0.68 },  // semicerchio basso
  '1': { x: 0.70, y: 0.82 },  // ala bassa
};
const OPP_SEMICIRCLE_ATK = {  // avversario attacca (verso sx)
  GK:  { x: 0.91, y: 0.50 },
  '1': { x: 0.30, y: 0.18 },
  '2': { x: 0.38, y: 0.32 },
  '6': { x: 0.12, y: 0.50 },
  '3': { x: 0.45, y: 0.50 },
  '4': { x: 0.38, y: 0.68 },
  '5': { x: 0.30, y: 0.82 },
};

// ── Difesa compatta davanti alla propria porta ──
const MY_DEFENSE = {          // nostra squadra difende (porta a sx)
  GK:  { x: 0.09, y: 0.50 },
  '5': { x: 0.24, y: 0.22 },
  '4': { x: 0.30, y: 0.36 },
  '6': { x: 0.38, y: 0.50 },
  '3': { x: 0.30, y: 0.50 },
  '2': { x: 0.30, y: 0.64 },
  '1': { x: 0.24, y: 0.78 },
};
const OPP_DEFENSE = {         // avversario difende (porta a dx)
  GK:  { x: 0.91, y: 0.50 },
  '1': { x: 0.76, y: 0.22 },
  '2': { x: 0.70, y: 0.36 },
  '6': { x: 0.62, y: 0.50 },
  '3': { x: 0.70, y: 0.50 },
  '4': { x: 0.70, y: 0.64 },
  '5': { x: 0.76, y: 0.78 },
};

// ── Dopo il goal: rimessa dal centro ──────────
const AFTERGOAL_MY_ATTACK = {   // noi battiamo (abbiamo subito)
  GK:  { x: 0.09, y: 0.50 },
  '5': { x: 0.52, y: 0.18 },
  '4': { x: 0.48, y: 0.35 },
  '6': { x: 0.56, y: 0.50 },
  '3': { x: 0.50, y: 0.50 },   // chi batte
  '2': { x: 0.48, y: 0.65 },
  '1': { x: 0.52, y: 0.82 },
};
const AFTERGOAL_OPP_DEFEND = {
  GK:  { x: 0.91, y: 0.50 },
  '1': { x: 0.80, y: 0.22 },
  '2': { x: 0.74, y: 0.36 },
  '6': { x: 0.68, y: 0.50 },
  '3': { x: 0.72, y: 0.50 },
  '4': { x: 0.74, y: 0.64 },
  '5': { x: 0.80, y: 0.78 },
};
const AFTERGOAL_OPP_ATTACK = {  // avversario batte
  GK:  { x: 0.91, y: 0.50 },
  '1': { x: 0.48, y: 0.18 },
  '2': { x: 0.52, y: 0.35 },
  '6': { x: 0.44, y: 0.50 },
  '3': { x: 0.50, y: 0.50 },
  '4': { x: 0.52, y: 0.65 },
  '5': { x: 0.48, y: 0.82 },
};
const AFTERGOAL_MY_DEFEND = {
  GK:  { x: 0.09, y: 0.50 },
  '5': { x: 0.20, y: 0.22 },
  '4': { x: 0.26, y: 0.36 },
  '6': { x: 0.32, y: 0.50 },
  '3': { x: 0.28, y: 0.50 },
  '2': { x: 0.26, y: 0.64 },
  '1': { x: 0.20, y: 0.78 },
};

// ── Costanti velocità ─────────────────────────
// VEL=100, stamina=100 → percorre il campo (0.80 unità) in 12 secondi reali
var _FIELD_WIDTH  = 0.80;
var _VEL_100_TIME = 12.0;
var _BASE_LIN_SPD = _FIELD_WIDTH / _VEL_100_TIME;  // ≈ 0.0667 unità/s

// ── Stato ─────────────────────────────────────
var _tokens      = {};
var _tokenSpeeds = {};   // key → velocità lineare (unità norm/secondo)
var _SPRINT_DUR  = 5.0;  // usato solo per compatibilità
var _ball        = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
var _ballOwner   = null;  // key del token che ha la palla (es. 'my_3') — la palla lo segue ogni frame
var _bgImg       = null;
var _bgReady    = false;
var _phase      = 'idle';    // 'idle'|'sprint'|'play'|'goal_cel'|'kickoff_after'|'penalty'
var _attack     = 'my';
var _sprintT    = 0;
var _microT     = 0;
var _goalAnim   = null;
var _pendingGoal = null;
var _prevSpeed  = 10;
var _sprintDone = false;

// ── Carica sfondo ────────────────────────────
(function() {
  var img = new Image();
  img.onload  = function() { _bgImg = img; _bgReady = true; };
  img.onerror = function() { _bgReady = false; };
  img.src = 'campo-per-pallanuoto.jpg';
})();

// Carica sprite pallone
var _ballImg   = null;
var _ballReady = false;
(function() {
  var img = new Image();
  img.onload  = function() { _ballImg = img; _ballReady = true; };
  img.onerror = function() { _ballReady = false; };
  img.src = 'palla.png';
})();

// ── Helpers ──────────────────────────────────
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _rnd(lo, hi)      { return lo + Math.random() * (hi - lo); }
function _shortName(p)     { return (p && p.name) ? p.name : ''; }
function _jitter(pos, amp) {
  amp = amp || 0.018;
  return {
    x: _clamp(pos.x + _rnd(-amp, amp), PLAY.x0 + 0.01, PLAY.x1 - 0.01),
    y: _clamp(pos.y + _rnd(-amp, amp), PLAY.y0 + 0.01, PLAY.y1 - 0.01),
  };
}
function _moveTo(tok, pos, amp) {
  var j = _jitter(pos, amp || 0.018);
  tok.tx = j.x; tok.ty = j.y;
}
function _dist(tok) {
  var dx = tok.x - _ball.x, dy = tok.y - _ball.y;
  return Math.sqrt(dx*dx + dy*dy);
}

// ── API pubblica ──────────────────────────────
function poolInitTokens(ms) {
  _tokens     = {};
  _ball       = { x: PLAY.cx, y: PLAY.cy, tx: PLAY.cx, ty: PLAY.cy };
  _ballOwner  = null;
  _phase      = 'idle';
  _attack     = 'my';
  _sprintT    = 0;
  _sprintDone = false;
  _goalAnim   = null;
  _pendingGoal = null;
  _prevSpeed  = (ms && ms.speed) ? ms.speed : 10;

  Object.entries(ms.onField).forEach(function(entry) {
    var pk = entry[0], pi = entry[1];
    var p   = ms.myRoster[pi];
    var pos = KICKOFF_MY[pk] || { x: 0.13, y: 0.50 };
    _tokens['my_' + pk] = {
      x: pos.x, y: pos.y, tx: pos.x, ty: pos.y,
      team: 'my', pk: pk, pi: pi, isGK: pk === 'GK',
      posLabel: pk === 'GK' ? 'P' : pk,
      shortName: _shortName(p),
      shirt: ms.shirtNumbers[pi] || '',
      yellows: 0, expelled: false,
    };
  });

  Object.keys(KICKOFF_OPP).forEach(function(pk) {
    var pos = KICKOFF_OPP[pk];
    _tokens['opp_' + pk] = {
      x: pos.x, y: pos.y, tx: pos.x, ty: pos.y,
      team: 'opp', pk: pk, pi: -1, isGK: pk === 'GK',
      posLabel: pk === 'GK' ? 'P' : pk,
      shortName: '', shirt: '', yellows: 0, expelled: false,
    };
  });
}

function poolSyncTokens(ms) {
  Object.entries(ms.onField).forEach(function(entry) {
    var pk = entry[0], pi = entry[1];
    var tok = _tokens['my_' + pk]; if (!tok) return;
    tok.pi        = pi;
    tok.shirt     = ms.shirtNumbers[pi] || '';
    tok.shortName = _shortName(ms.myRoster[pi]);
    tok.yellows   = ms.tempExp[pi] || 0;
    tok.expelled  = ms.expelled.has(pi);
    tok.posLabel  = pk === 'GK' ? 'P' : pk;
  });
  // Aggiorna velocità dopo ogni sync
  poolSetSpeeds(ms);
}

// Aggiorna velocità token da VEL (spe) + stamina attuale
// Calibrato su VEL=100, stamina=100 → tutto il campo (0.80 unità) in 12 secondi
function poolSetSpeeds(ms) {
  if (!ms) return;
  Object.entries(ms.onField).forEach(function(entry) {
    var pk = entry[0], pi = entry[1];
    var p       = ms.myRoster[pi]; if (!p) return;
    var spe     = (p.stats && p.stats.spe) ? p.stats.spe : 50;
    var stamina = (ms.stamina && ms.stamina[pi] !== undefined) ? ms.stamina[pi] : (p.fitness || 50);
    var speFact  = spe / 100.0;
    // La stamina influisce tra il 50% (esausto) e il 100% (fresco)
    var stamFact = 0.50 + (stamina / 100.0) * 0.50;
    _tokenSpeeds['my_' + pk] = _BASE_LIN_SPD * speFact * stamFact;
  });
  // Avversari NPC: VEL media 65 (giocatore competitivo ma non top)
  ['GK','1','2','3','4','5','6'].forEach(function(pk) {
    _tokenSpeeds['opp_' + pk] = _BASE_LIN_SPD * 0.65;
  });
}

function poolUpdateToken(key, ms) {
  var tok = _tokens[key]; if (!tok) return;
  var pk = tok.pk, pi = ms.onField[pk];
  if (pi === undefined) { tok.expelled = true; return; }
  tok.pi        = pi;
  tok.shirt     = ms.shirtNumbers[pi] || '';
  tok.shortName = _shortName(ms.myRoster[pi]);
  tok.yellows   = ms.tempExp[pi] || 0;
  tok.expelled  = ms.expelled.has(pi);
}

function poolMoveBall(tx, ty) {
  _ball.tx = _clamp(tx, PLAY.x0, PLAY.x1);
  _ball.ty = _clamp(ty, PLAY.y0, PLAY.y1);
  _attack = (tx > PLAY.cx) ? 'my' : 'opp';
  if (_phase === 'play') _triggerTactical();
}

function poolMoveToken(key, tx, ty) {
  var tok = _tokens[key]; if (!tok) return;
  if (tok.isGK) {
    tx = tok.team === 'my'
      ? _clamp(tx, PLAY.myGKminX,  PLAY.myGKmaxX)
      : _clamp(tx, PLAY.oppGKminX, PLAY.oppGKmaxX);
    ty = _clamp(ty, PLAY.myGoalY0 + 0.02, PLAY.myGoalY1 - 0.02);
  }
  tok.tx = _clamp(tx, PLAY.x0 + 0.01, PLAY.x1 - 0.01);
  tok.ty = _clamp(ty, PLAY.y0 + 0.01, PLAY.y1 - 0.01);
}

function poolResetToken(key, delay) {
  delay = delay || 1800;
  setTimeout(function() {
    var tok = _tokens[key]; if (!tok || tok.expelled) return;
    var pk = tok.pk;
    var base = tok.team === 'my'
      ? (_attack === 'my' ? MY_SEMICIRCLE_ATK[pk] : MY_DEFENSE[pk])
      : (_attack === 'opp' ? OPP_SEMICIRCLE_ATK[pk] : OPP_DEFENSE[pk]);
    if (base) _moveTo(tok, base, 0.025);
  }, delay);
}

// ── Inizio periodo: idle finché non si preme Avvia ───────────────
function poolStartPeriod() {
  _phase      = 'idle';
  _sprintT    = 0;
  _sprintDone = false;
  _ball.tx = PLAY.cx; _ball.ty = PLAY.cy;
  _goalAnim   = null;
  _pendingGoal = null;
  _ballOwner  = null;
  // Ripristina posizioni kickoff sui bordi
  Object.values(_tokens).forEach(function(tok) {
    if (tok.expelled) return;
    var pos = tok.team === 'my' ? KICKOFF_MY[tok.pk] : KICKOFF_OPP[tok.pk];
    if (pos) { tok.tx = pos.x; tok.ty = pos.y; tok.x = pos.x; tok.y = pos.y; }
  });
}

// ── Chiamata da togglePlay quando si preme Avvia dopo kickoff ────
function poolBeginSprint(prevSpeed) {
  if (_phase !== 'idle') return;
  _prevSpeed  = prevSpeed || 10;
  _phase      = 'sprint';
  _sprintT    = 0;
  _sprintDone = false;
  // Forza velocità 1x durante lo sprint (tramite main.js setSpeed)
  if (typeof setSpeed === 'function') setSpeed(1);
  // I pos 3 di entrambe le squadre scattano verso il centro
  var my3  = _tokens['my_3'];
  var opp3 = _tokens['opp_3'];
  if (my3)  { my3.tx  = PLAY.cx - 0.02; my3.ty  = PLAY.cy; }
  if (opp3) { opp3.tx = PLAY.cx + 0.02; opp3.ty = PLAY.cy; }
}

function poolGetPhase()  { return _phase; }
function poolGetTokens() { return _tokens; }  // per MovementController

// ── Tiro: anima la palla verso la porta, goal dichiarato solo all'ingresso ──
function poolShootAndScore(targetX, targetY, scorer, team, teamName) {
  _ball.tx = _clamp(targetX, PLAY.x0, PLAY.x1);
  _ball.ty = _clamp(targetY, PLAY.y0, PLAY.y1);
  _pendingGoal = { scorer: scorer || '', team: team || 'my' };
}

// ── Goal: dichiarato quando la palla è entrata in rete ────────────
function poolShowGoal(scorer, team) {
  _pendingGoal = null;
  _goalAnim = { timer: 0, total: 2.5, scorer: scorer || '', team: team || 'my', teamName: teamName || '' };
  _phase = 'goal';
  var mySubito = (team === 'opp');

  Object.values(_tokens).forEach(function(tok) {
    if (tok.expelled) return;
    var pos;
    if (mySubito) {
      pos = tok.team === 'my' ? AFTERGOAL_MY_ATTACK[tok.pk] : AFTERGOAL_OPP_DEFEND[tok.pk];
    } else {
      pos = tok.team === 'my' ? AFTERGOAL_MY_DEFEND[tok.pk] : AFTERGOAL_OPP_ATTACK[tok.pk];
    }
    if (pos) { tok.tx = pos.x + _rnd(-0.012, 0.012); tok.ty = pos.y + _rnd(-0.012, 0.012); }
  });

  _ball.tx = PLAY.cx; _ball.ty = PLAY.cy;
  _attack = mySubito ? 'my' : 'opp';

  setTimeout(function() {
    _phase = 'play';
    _triggerTactical();
  }, 2700);
}

// ── Logica tattica: semicerchio attacco / difesa ──────────────────
function _triggerTactical() {
  ['1','2','3','4','5','6','GK'].forEach(function(pk) {
    var myTok  = _tokens['my_'  + pk];
    var oppTok = _tokens['opp_' + pk];
    if (myTok && !myTok.expelled) {
      var base = _attack === 'my' ? MY_SEMICIRCLE_ATK[pk] : MY_DEFENSE[pk];
      if (base) _moveTo(myTok, base, 0.022);
    }
    if (oppTok && !oppTok.expelled) {
      var base2 = _attack === 'opp' ? OPP_SEMICIRCLE_ATK[pk] : OPP_DEFENSE[pk];
      if (base2) _moveTo(oppTok, base2, 0.022);
    }
  });
  _updateKeepers();
}

// ── Portieri: solo nella propria area ────────
function _updateKeepers() {
  var by = _ball.y;
  var myGK = _tokens['my_GK'];
  if (myGK && !myGK.expelled) {
    myGK.tx = _clamp(PLAY.myGoalX + 0.04, PLAY.myGKminX, PLAY.myGKmaxX);
    myGK.ty = _clamp(by, PLAY.myGoalY0 + 0.03, PLAY.myGoalY1 - 0.03);
  }
  var oppGK = _tokens['opp_GK'];
  if (oppGK && !oppGK.expelled) {
    oppGK.tx = _clamp(PLAY.oppGoalX - 0.04, PLAY.oppGKminX, PLAY.oppGKmaxX);
    oppGK.ty = _clamp(by, PLAY.oppGoalY0 + 0.03, PLAY.oppGoalY1 - 0.03);
  }
}

// ── Micro-movimenti (solo giocatori di campo in fase play) ────────
var _microTimer = 0;
function _microMovements(dt) {
  _microTimer += dt;
  if (_microTimer < 1.8) return;
  _microTimer = 0;
  Object.values(_tokens).forEach(function(tok) {
    if (tok.expelled || tok.isGK) return;
    tok.tx = _clamp(tok.tx + _rnd(-0.018, 0.018), PLAY.x0 + 0.02, PLAY.x1 - 0.02);
    tok.ty = _clamp(tok.ty + _rnd(-0.015, 0.015), PLAY.y0 + 0.02, PLAY.y1 - 0.02);
  });
}

// ── Step animazione ───────────────────────────
function poolAnimStep(dt) {
  // dt = secondi reali del frame (max 0.1 per evitare salti a tab in background)
  var f = Math.min(dt, 0.1);

  // ── 1. Timer overlay GOAL — avanza SEMPRE indipendentemente dalla fase ──
  if (_goalAnim) {
    _goalAnim.timer += f;
    if (_goalAnim.timer >= _goalAnim.total) {
      _goalAnim = null;  // nasconde l'overlay
    }
  }

  // ── 2. Goal pendente: controlla se la palla è entrata in rete ──
  if (_pendingGoal && !_goalAnim) {
    var bx = _ball.x, by = _ball.y;
    var inMyNet  = bx >= PLAY.myNetX0  && bx <= PLAY.myNetX1  && by >= PLAY.myNetY0  && by <= PLAY.myNetY1;
    var inOppNet = bx >= PLAY.oppNetX0 && bx <= PLAY.oppNetX1 && by >= PLAY.oppNetY0 && by <= PLAY.oppNetY1;
    if (inOppNet || inMyNet) {
      poolShowGoal(_pendingGoal.scorer, _pendingGoal.team);
    }
  }

  // ── 3. Aggiornamenti specifici per fase ──
  if (_phase === 'idle') {
    // Token fermi sui bordi — nessun aggiornamento posizioni
  } else if (_phase === 'play') {
    _updateKeepers();
    _microMovements(f);
  }
  // Le fasi sprint/goal_cel/kickoff_after/penalty sono orchestrate da MovementController

  // ── 4. Palla segue il token possessore (aggiornata ogni frame) ──
  if (_ballOwner) {
    var ownerTok = _tokens[_ballOwner];
    if (ownerTok && !ownerTok.expelled) {
      var off = _ballOffsetForToken(ownerTok);
      // Snap diretto sulla posizione corrente del token (non sul target)
      _ball.tx = _clamp(ownerTok.x + off.dx, PLAY.x0, PLAY.x1);
      _ball.ty = _clamp(ownerTok.y + off.dy, PLAY.y0, PLAY.y1);
    } else {
      _ballOwner = null;  // token non più disponibile
    }
  }

  // ── 5. Movimento token — velocità lineare proporzionale a VEL ──
  // spd = unità normalizzate/secondo a velocità 1x.
  // NON moltiplichiamo per G.ms.speed qui: le velocità di simulazione
  // accelerano il motore (timer), non i corpi fisici in campo.
  // Altrimenti a 20x i giocatori teleportano invece di nuotare.
  Object.values(_tokens).forEach(function(tok) {
    if (tok.expelled) return;
    var spd = _tokenSpeeds[tok.team + '_' + tok.pk] || _BASE_LIN_SPD;
    var dx = tok.tx - tok.x, dy = tok.ty - tok.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) {
      tok.x = tok.tx; tok.y = tok.ty;
    } else {
      var step = spd * f;
      if (step >= dist) { tok.x = tok.tx; tok.y = tok.ty; }
      else { tok.x += (dx / dist) * step; tok.y += (dy / dist) * step; }
    }
  });

  // ── 6. Movimento palla — più veloce dei giocatori (tiri/passaggi) ──
  // Se ha un possessore la palla è già aggiornata al punto 4 (snap).
  // Se è libera (tiro, palla persa) si muove velocemente verso il target.
  if (!_ballOwner) {
    var ballSpd = _BASE_LIN_SPD * 4.5;
    var bdx = _ball.tx - _ball.x, bdy = _ball.ty - _ball.y;
    var bdist = Math.sqrt(bdx * bdx + bdy * bdy);
    if (bdist < 0.002) {
      _ball.x = _ball.tx; _ball.y = _ball.ty;
    } else {
      var bstep = ballSpd * f;
      if (bstep >= bdist) { _ball.x = _ball.tx; _ball.y = _ball.ty; }
      else { _ball.x += (bdx / bdist) * bstep; _ball.y += (bdy / bdist) * bstep; }
    }
  } else {
    // Possessore attivo: snap palla sulla posizione tx/ty già calcolata al punto 4
    _ball.x = _ball.tx;
    _ball.y = _ball.ty;
  }
}

// ── Disegno ──────────────────────────────────
function drawPool(canvas, myTeamAbbr, oppTeamAbbr) {
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = POOL_W, H = POOL_H;

  if (_bgReady && _bgImg) {
    ctx.drawImage(_bgImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#1a7fa0'; ctx.fillRect(0, 0, W, H);
  }

  Object.values(_tokens).forEach(function(tok) {
    if (tok.expelled) return;
    var px = tok.x * W, py = tok.y * H;
    var isMy = tok.team === 'my', isGK = tok.isGK;
    var R = 19;

    // Ombra
    ctx.save(); ctx.globalAlpha = 0.20; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(px+2, py+3, R, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Cerchio
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI*2);
    if (isGK) {
      ctx.fillStyle='#cc2222'; ctx.fill();
      ctx.strokeStyle='#ff7777'; ctx.lineWidth=2.5; ctx.stroke();
    } else if (isMy) {
      ctx.fillStyle='#ffffff'; ctx.fill();
      ctx.strokeStyle='#333333'; ctx.lineWidth=2.5; ctx.stroke();
    } else {
      ctx.fillStyle='#1a3faa'; ctx.fill();
      ctx.strokeStyle='#4488ff'; ctx.lineWidth=2.5; ctx.stroke();
    }

    // Cartellini gialli
    if (isMy && !isGK && tok.yellows > 0) {
      for (var i=0; i<tok.yellows; i++) {
        ctx.fillStyle = (tok.yellows>=MAX_TEMP_EXP)?'#e74c3c':'#f0c040';
        ctx.fillRect(px-7+i*9, py-R-9, 7, 10);
      }
    }

    // Testo
    ctx.textAlign='center'; ctx.textBaseline='middle';
    if (isGK) {
      ctx.fillStyle='#fff'; ctx.font='bold 13px sans-serif'; ctx.fillText('P', px, py);
    } else if (isMy) {
      ctx.fillStyle='#111'; ctx.font='bold 10px sans-serif'; ctx.fillText(tok.shirt, px, py-3);
      ctx.fillStyle='#666'; ctx.font='7px sans-serif'; ctx.fillText(tok.posLabel, px, py+6);
    } else {
      ctx.fillStyle='#b3d9ff'; ctx.font='bold 12px sans-serif'; ctx.fillText(tok.posLabel, px, py);
    }

    // Nome sotto (nostra squadra, non portiere)
    if (isMy && !isGK && tok.shortName) {
      ctx.font='bold 9px sans-serif';
      var tw = ctx.measureText(tok.shortName).width+8;
      ctx.fillStyle='rgba(0,0,0,0.58)';
      _pill(ctx, px-tw/2, py+R+3, tw, 14, 4); ctx.fill();
      ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(tok.shortName, px, py+R+3+7);
    }
  });

  // ── Pallone ──
  var bx = _ball.x * W, by = _ball.y * H;
  var BR = 13; // raggio palla — leggermente più piccolo dei segnalini (R=19)

  // Ombra
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(bx + 2, by + BR + 1, BR * 0.65, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (_ballReady && _ballImg) {
    // Ritaglia il JPEG con una maschera circolare (elimina sfondo nero)
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, BR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(_ballImg, bx - BR, by - BR, BR * 2, BR * 2);
    ctx.restore();
    // Bordo sottile di definizione
    ctx.beginPath();
    ctx.arc(bx, by, BR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  } else {
    // Fallback gradiente giallo
    ctx.beginPath();
    ctx.arc(bx, by, BR, 0, Math.PI * 2);
    var g = ctx.createRadialGradient(bx - 4, by - 4, 1, bx, by, BR);
    g.addColorStop(0, '#fff9c4');
    g.addColorStop(0.55, '#fdd835');
    g.addColorStop(1, '#f9a825');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#c17900'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // GOAL overlay
  if (_goalAnim) {
    var t=_goalAnim.timer/_goalAnim.total;
    var pulse=0.5+0.5*Math.abs(Math.sin(t*Math.PI*6));
    var alpha=t<0.85?1:1-(t-0.85)/0.15;
    ctx.save(); ctx.globalAlpha=alpha;
    // Overlay scuro pieno per leggibilità massima
    ctx.fillStyle='rgba(0,0,0,.72)';
    ctx.fillRect(0,0,W,H);
    // Pannello colorato centrato
    var myGoal=_goalAnim.team==='my';
    var panW=W*0.82, panH=H*0.52, panX=(W-panW)/2, panY=(H-panH)/2;
    ctx.fillStyle=myGoal?'rgba(0,100,30,.85)':'rgba(120,20,20,.85)';
    ctx.beginPath(); ctx.roundRect(panX,panY,panW,panH,14); ctx.fill();
    ctx.strokeStyle=myGoal?'rgba(100,220,100,.6)':'rgba(255,80,80,.6)';
    ctx.lineWidth=2; ctx.stroke();
    // Testo GOAL
    ctx.textAlign='center'; ctx.textBaseline='middle';
    var fs=Math.round(58+pulse*14);
    ctx.font='900 '+fs+'px sans-serif';
    ctx.shadowColor='rgba(0,0,0,.9)'; ctx.shadowBlur=16;
    ctx.fillStyle=myGoal?'#fdd835':'#ff6b6b';
    ctx.fillText('GOAL!!!',W/2,panY+panH*0.32);
    // Scorer
    if (_goalAnim.scorer) {
      ctx.font='bold 20px sans-serif'; ctx.fillStyle='#fff'; ctx.shadowBlur=8;
      ctx.fillText('⚽  '+_goalAnim.scorer,W/2,panY+panH*0.60);
    }
    // Team name
    if (_goalAnim.teamName) {
      ctx.font='14px sans-serif'; ctx.fillStyle='rgba(255,255,255,.75)'; ctx.shadowBlur=4;
      ctx.fillText(_goalAnim.teamName,W/2,panY+panH*0.82);
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════
// NUOVE API — usate da movement.js  v0.7.2
// ═══════════════════════════════════════════════════════════════════

// Restituisce la mappa delle velocità { key → unità/s }
function poolGetTokenSpeeds() { return _tokenSpeeds; }

// Restituisce un singolo token per chiave (es. 'my_6')
function poolGetToken(key) { return _tokens[key] || null; }

// Restituisce la posizione kickoff di un token (team='my'|'opp', pk='GK'|'1'…'6')
function poolGetKickoffPos(team, pk) {
  var tbl = team === 'my' ? KICKOFF_MY : KICKOFF_OPP;
  return tbl[pk] ? { x: tbl[pk].x, y: tbl[pk].y } : { x: PLAY.cx, y: PLAY.cy };
}

// Muove la palla direttamente al target (cancella il possesso)
function poolMoveBallDirect(tx, ty) {
  _ballOwner   = null;  // palla libera: nessun token la segue
  _ball.tx = _clamp(tx, PLAY.x0, PLAY.x1);
  _ball.ty = _clamp(ty, PLAY.y0, PLAY.y1);
}

// Assegna la palla a un token — la palla lo seguirà ogni frame (offset per mano)
function poolSetBallOn(key) {
  var tok = _tokens[key];
  if (!tok) return;
  _ballOwner = key;  // la palla seguirà questo token ogni frame in poolAnimStep
}

// Muove la palla verso un token (ricevitore) — diventa il nuovo possessore
function poolMoveBallToToken(key) {
  poolSetBallOn(key);
}

// Helper interno: calcola offset palla in base alla mano del token
function _ballOffsetForToken(tok) {
  var hand = 'R';
  if (tok.team === 'my' && typeof G !== 'undefined' && G.ms && G.ms.myRoster) {
    var p = G.ms.myRoster[tok.pi];
    if (p && p.hand) hand = p.hand;
  }
  return {
    dx: (hand === 'L') ? -0.028 : (hand === 'AMB') ? 0 : 0.028,
    dy: 0.008,
  };
}

// Imposta la fase canvas da movement.js (per sincronizzare _attack e _phase)
function poolSetPhaseFromMC(phase, attack) {
  if (phase !== undefined) _phase  = phase;
  if (attack !== undefined) _attack = attack;
}

// Triggera l'animazione GOAL su canvas (chiamata da movement.js)
function poolTriggerGoalAnim(scorer, team, teamName) {
  _pendingGoal = null;
  _goalAnim = {
    timer:    0,
    total:    2.5,
    scorer:   scorer   || '',
    team:     team     || 'my',
    teamName: teamName || '',
  };
  // Non cambia _phase — la gestione della fase è delegata a movement.js
}

// Aggiorna portieri in base alla posizione attuale della palla
function poolUpdateKeepers() {
  _updateKeepers();
}

// ── poolBeginSprint: rimanda a MovementController ─────────────────────────────
// Mantenuto per compatibilità con ui/match.js
function poolBeginSprint(prevSpeed) {
  if (_phase !== 'idle') return;
  _phase = 'sprint';
  if (typeof MovementController !== 'undefined' && MovementController.onSprintStart) {
    MovementController.onSprintStart(prevSpeed);
  }
}

// poolShowGoal: ora delega a poolTriggerGoalAnim
// Mantenuto per compatibilità con vecchie chiamate
function poolShowGoal(scorer, team, teamName) {
  poolTriggerGoalAnim(scorer, team, teamName);
}

// Rilascia il possesso palla (la palla vola libera verso il target)
function poolReleaseBall() {
  _ballOwner = null;
}

function _pill(ctx,x,y,w,h,r) {
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
