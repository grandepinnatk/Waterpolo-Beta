// ─────────────────────────────────────────────────────────────────────────────
// canvas/movement.js  —  Orchestratore animazioni segnalini  v0.7.2
//
// Gestisce 7 situazioni di gioco:
//   1. SPRINT INIZIALE  — tutti verso centrocampo, CB (pos 6) si contendono la palla
//   2. GOAL CELEBRATION — compagni raggiungono il marcatore, poi tornano in metà
//   3. RIMESSA          — CB della squadra che ha subito batte dal centro al pos 3
//   4. PASSAGGIO        — palla scorre tra giocatori in attacco (offset per mano)
//   5. TIRO             — palla viaggia verso la porta avversaria
//   6. PARATA           — palla si ferma sul portiere, che rilancia
//   7. RIGORE           — CB ai 6 metri, portiere al centro, tiro verso porta
//
// Velocità: VEL=100 → tutto il campo in 12s di gioco reale.
//           Proporzionale: VEL=50 → 24s, VEL=75 → 16s.
// ─────────────────────────────────────────────────────────────────────────────

var MovementController = (function () {

  // ─── Geometria (coordinate normalizzate, stessa di pool.js) ──────────────
  var CX = 0.50, CY = 0.50;
  var OPP_GOAL_Y0 = 0.38, OPP_GOAL_Y1 = 0.62;

  // Velocità: VEL=100, stamina=100 → percorre FIELD_WIDTH in VEL_100_TIME s
  var FIELD_WIDTH   = 0.80;    // larghezza utile campo normalizzata
  var VEL_100_TIME  = 12.0;    // secondi per VEL=100
  var BASE_SPD      = FIELD_WIDTH / VEL_100_TIME; // ≈ 0.0667 unità/s

  // ─── Formazione semicerchio attacco (dalla foto allegata) ─────────────────
  var ATK_MY = {   // nostra squadra attacca → porta destra
    GK:  { x: 0.09, y: 0.50 },
    '5': { x: 0.68, y: 0.17 },  // AD  — ala sx-alto
    '4': { x: 0.60, y: 0.32 },  // AT  — laterale sx
    '6': { x: 0.87, y: 0.50 },  // CB  — centroboa sotto porta avv
    '3': { x: 0.54, y: 0.50 },  // C   — centro con palla
    '2': { x: 0.60, y: 0.68 },  // AT  — laterale dx
    '1': { x: 0.68, y: 0.83 },  // AS  — ala dx-basso
  };
  var ATK_OPP = {  // avversario attacca → porta sinistra
    GK:  { x: 0.91, y: 0.50 },
    '1': { x: 0.32, y: 0.17 },
    '2': { x: 0.40, y: 0.32 },
    '6': { x: 0.13, y: 0.50 },
    '3': { x: 0.46, y: 0.50 },
    '4': { x: 0.40, y: 0.68 },
    '5': { x: 0.32, y: 0.83 },
  };

  // ─── Difesa compatta davanti alla propria porta ───────────────────────────
  var DEF_MY = {
    GK:  { x: 0.09, y: 0.50 },
    '5': { x: 0.23, y: 0.21 },
    '4': { x: 0.30, y: 0.35 },
    '6': { x: 0.37, y: 0.50 },
    '3': { x: 0.30, y: 0.50 },
    '2': { x: 0.30, y: 0.65 },
    '1': { x: 0.23, y: 0.79 },
  };
  var DEF_OPP = {
    GK:  { x: 0.91, y: 0.50 },
    '1': { x: 0.77, y: 0.21 },
    '2': { x: 0.70, y: 0.35 },
    '6': { x: 0.63, y: 0.50 },
    '3': { x: 0.70, y: 0.50 },
    '4': { x: 0.70, y: 0.65 },
    '5': { x: 0.77, y: 0.79 },
  };

  // ─── Posizioni dopo il goal ────────────────────────────────────────────────
  // Squadra che batte (ha subito il gol): rimane in metà campo propria + CB al centro
  var RESET_MY_ATK = {  // noi abbiamo subito → noi battiamo dal centro
    GK:  { x: 0.09, y: 0.50 },
    '5': { x: 0.51, y: 0.18 },
    '4': { x: 0.47, y: 0.34 },
    '6': { x: 0.50, y: 0.50 }, // CB al centro
    '3': { x: 0.48, y: 0.50 },
    '2': { x: 0.47, y: 0.66 },
    '1': { x: 0.51, y: 0.82 },
  };
  var RESET_OPP_DEF = {
    GK:  { x: 0.91, y: 0.50 },
    '1': { x: 0.78, y: 0.22 },
    '2': { x: 0.72, y: 0.36 },
    '6': { x: 0.66, y: 0.50 },
    '3': { x: 0.72, y: 0.50 },
    '4': { x: 0.72, y: 0.64 },
    '5': { x: 0.78, y: 0.78 },
  };
  var RESET_OPP_ATK = {  // avversario ha subito → avversario batte
    GK:  { x: 0.91, y: 0.50 },
    '1': { x: 0.49, y: 0.18 },
    '2': { x: 0.53, y: 0.34 },
    '6': { x: 0.50, y: 0.50 }, // CB avv al centro
    '3': { x: 0.52, y: 0.50 },
    '4': { x: 0.53, y: 0.66 },
    '5': { x: 0.49, y: 0.82 },
  };
  var RESET_MY_DEF = {
    GK:  { x: 0.09, y: 0.50 },
    '5': { x: 0.22, y: 0.22 },
    '4': { x: 0.28, y: 0.36 },
    '6': { x: 0.34, y: 0.50 },
    '3': { x: 0.28, y: 0.50 },
    '2': { x: 0.28, y: 0.64 },
    '1': { x: 0.22, y: 0.78 },
  };

  // ─── Stato interno ────────────────────────────────────────────────────────
  var _ms        = null;
  var _active    = false;
  var _phase     = 'idle';   // 'idle'|'sprint'|'play'|'goal_cel'|'kickoff_after'|'penalty'
  var _attack    = 'my';
  var _microT    = 0;
  var _cbWinner  = 'my';
  var _myCB6Spd  = BASE_SPD;
  var _oppCB6Spd = BASE_SPD;
  var MICRO_INTERVAL = 2.0;

  // Coda di azioni sequenziali { delay: secondi, fn: Function }
  var _seq       = [];
  var _seqTimer  = 0;
  var _seqIdx    = 0;
  var _seqActive = false;

  // ─── Helpers velocità ─────────────────────────────────────────────────────

  // Velocità lineare (unità normalizzate / secondo) per un token, basata su VEL + stamina
  function _tokSpd(pk, team) {
    if (typeof poolGetTokenSpeeds === 'function') {
      var s = poolGetTokenSpeeds();
      if (s) {
        var v = s[team + '_' + pk];
        if (v !== undefined) return v;
      }
    }
    return BASE_SPD;
  }

  function _dist(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = (y2 - y1) * 0.55; // corregge aspect-ratio campo
    return Math.sqrt(dx * dx + dy * dy);
  }
  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function _rnd(lo, hi)      { return lo + Math.random() * (hi - lo); }

  // Ottieni token tramite pool.js
  function _tok(key) {
    if (typeof poolGetToken === 'function') return poolGetToken(key);
    if (typeof poolGetTokens === 'function') { var t = poolGetTokens(); return t ? t[key] : null; }
    return null;
  }

  // Muovi token (con jitter opzionale)
  function _mv(key, x, y, jit) {
    jit = jit || 0;
    if (typeof poolMoveToken === 'function')
      poolMoveToken(key, x + _rnd(-jit, jit), y + _rnd(-jit, jit));
  }

  // Muovi la palla
  function _moveBall(x, y) {
    if (typeof poolMoveBallDirect === 'function') poolMoveBallDirect(x, y);
  }

  // Metti la palla su un token (offset mano)
  function _ballOn(key) {
    if (typeof poolSetBallOn === 'function') { poolSetBallOn(key); return; }
    // fallback: posiziona la palla sulle coordinate del token
    var tok = _tok(key);
    if (tok) _moveBall(tok.x, tok.y);
  }

  // ─── Coda sequenziale ─────────────────────────────────────────────────────

  function _qA(delay, fn) { _seq.push({ delay: delay, fn: fn }); }

  function _startSeq() {
    _seqIdx   = 0;
    _seqTimer = 0;
    _seqActive = _seq.length > 0;
  }

  function _tickSeq(dt) {
    if (!_seqActive || _seqIdx >= _seq.length) { _seqActive = false; return; }
    _seqTimer += dt;
    while (_seqIdx < _seq.length && _seqTimer >= _seq[_seqIdx].delay) {
      try { _seq[_seqIdx].fn(); } catch(e) {}
      _seqIdx++;
    }
    if (_seqIdx >= _seq.length) _seqActive = false;
  }

  // ─── API pubblica ─────────────────────────────────────────────────────────

  function init(ms) {
    _ms        = ms;
    _active    = true;
    _phase     = 'idle';
    _attack    = 'my';
    _microT    = 0;
    _seq       = [];
    _seqActive = false;
  }

  function stop() {
    _active    = false;
    _ms        = null;
    _seq       = [];
    _seqActive = false;
  }

  // dt = secondi REALI (non moltiplicati per speed — la velocità di nuoto è già
  // gestita da poolSetSpeeds che scala in base a VEL e stamina)
  function update(dt) {
    if (!_active || !_ms) return;
    // Permetti animazioni anche a ms.running=false durante cel/rimessa/penalty
    var canRun = _ms.running ||
      _phase === 'goal_cel' || _phase === 'kickoff_after' || _phase === 'penalty';
    if (!canRun) return;

    if (_seqActive) { _tickSeq(dt); return; }

    if (_phase === 'sprint') {
      _tickSeq(dt); // lo sprint usa la coda
    } else if (_phase === 'play') {
      _microT += dt;
      if (_microT >= MICRO_INTERVAL) {
        _microT = 0;
        _applyMicroMovements();
      }
    }
  }

  // ── 1. INIZIO PERIODO ────────────────────────────────────────────────────
  function onPeriodStart() {
    _phase     = 'idle';
    _seq       = [];
    _seqActive = false;
    if (typeof poolStartPeriod === 'function') poolStartPeriod();
  }

  // ── SPRINT: chiamato da match.js quando si preme Avvia (kickoff) ─────────
  function onSprintStart(prevSpeed) {
    if (_phase !== 'idle') return;
    _phase = 'sprint';
    _seq   = [];
    _seqActive = false;

    // Velocità CB pos 6 di entrambe le squadre
    _myCB6Spd  = _tokSpd('6', 'my');
    _oppCB6Spd = _tokSpd('6', 'opp');

    // Posizioni kickoff dei CB
    var myK  = typeof poolGetKickoffPos === 'function' ? poolGetKickoffPos('my',  '6') : { x: 0.13, y: CY };
    var oppK = typeof poolGetKickoffPos === 'function' ? poolGetKickoffPos('opp', '6') : { x: 0.87, y: CY };

    var myDist  = _dist(myK.x, myK.y, CX, CY);
    var oppDist = _dist(oppK.x, oppK.y, CX, CY);
    var myETA   = myDist  / Math.max(_myCB6Spd,  0.001);
    var oppETA  = oppDist / Math.max(_oppCB6Spd, 0.001);

    // Chi arriva prima al centro?
    if (Math.abs(myETA - oppETA) < 0.25) {
      var myMor = _getCBMorale('my'), oppMor = _getCBMorale('opp');
      if (Math.abs(myMor - oppMor) < 5) {
        _cbWinner = Math.random() < 0.5 ? 'my' : 'opp';
      } else {
        _cbWinner = myMor >= oppMor ? 'my' : 'opp';
      }
    } else {
      _cbWinner = myETA <= oppETA ? 'my' : 'opp';
    }

    var winDist = _cbWinner === 'my' ? myDist : oppDist;
    var winSpd  = _cbWinner === 'my' ? _myCB6Spd : _oppCB6Spd;
    var sprintDur = Math.max(winDist / Math.max(winSpd, 0.001), 2.0);

    // Tutti i giocatori di campo nuotano verso centrocampo
    ['1','2','3','4','5'].forEach(function(pk) {
      var yi = (parseInt(pk) - 1) / 4;  // distribuisce in y da 0→1
      var midY = 0.20 + yi * 0.60;
      _mv('my_'  + pk, CX - 0.10 - _rnd(0, 0.06), midY);
      _mv('opp_' + pk, CX + 0.10 + _rnd(0, 0.06), midY);
    });
    // CB scattano verso il centro esatto
    _mv('my_6',  CX - 0.015, CY);
    _mv('opp_6', CX + 0.015, CY);

    // ── Sequenza eventi sprint ──
    _qA(sprintDur, function() {
      // CB vincitore tocca la palla
      _ballOn(_cbWinner + '_6');
    });
    _qA(sprintDur + 0.35, function() {
      // CB rilascia, palla vola verso il C (pos 3)
      if (typeof poolReleaseBall === 'function') poolReleaseBall();
      var tar3 = _cbWinner === 'my' ? ATK_MY['3'] : ATK_OPP['3'];
      _moveBall(tar3.x + _rnd(-0.02, 0.02), tar3.y + _rnd(-0.02, 0.02));
      // Assegna possesso al pos 3 della squadra vincitrice
      setTimeout(function() { _ballOn(_cbWinner + '_3'); }, 350);
    });
    _qA(sprintDur + 0.9, function() {
      // Tutti si mettono in formazione tattica
      _attack = _cbWinner;
      _repositionTactical(0.028);
      _phase = 'play';
      // Ripristina velocità di gioco precedente
      if (prevSpeed && typeof setSpeed === 'function') setSpeed(prevSpeed);
    });

    _startSeq();
  }

  // ── 2. GOAL ───────────────────────────────────────────────────────────────
  function onGoalEvent(event) {
    var scorerTeam = event.goalTeam || 'my';
    var scorerKey  = event.moverKey || (scorerTeam + '_3');

    // Rilascia possesso e tiro verso rete
    if (typeof poolReleaseBall === 'function') poolReleaseBall();
    if (event.ballTarget) _moveBall(event.ballTarget.x, event.ballTarget.y);

    _phase = 'goal_cel';
    _seq   = [];
    _seqActive = false;

    // 0.55s: palla entra → pool.js mostra overlay GOAL, compagni corrono
    _qA(0.55, function() {
      if (typeof poolTriggerGoalAnim === 'function') {
        var teamName = scorerTeam === 'my'
          ? (_ms && _ms.myTeam  ? _ms.myTeam.name  : '')
          : (_ms && _ms.oppTeam ? _ms.oppTeam.name : '');
        poolTriggerGoalAnim(event.goalScorer || '', scorerTeam, teamName);
      }
      // Compagni nuotano verso il marcatore
      var tok = _tok(scorerKey);
      var sx = tok ? tok.tx : CX, sy = tok ? tok.ty : CY;
      ['1','2','3','4','5','6'].forEach(function(pk) {
        var k = scorerTeam + '_' + pk;
        if (k === scorerKey) return;
        var t2 = _tok(k);
        if (!t2 || t2.expelled) return;
        _mv(k, sx + _rnd(-0.07, 0.07), sy + _rnd(-0.06, 0.06));
      });
    });

    // 3.2s: fine esultanza → reset posizioni
    _qA(3.2, function() {
      _setupAfterGoal(scorerTeam);
    });

    // 4.4s: CB della squadra che ha subito batte al centro
    _qA(4.4, function() {
      _executeKickoffAfterGoal(scorerTeam);
    });

    _startSeq();
  }

  function _setupAfterGoal(scorerTeam) {
    // Chi ha subito batte → si posiziona in metà campo propria + CB al centro
    var myLayout  = scorerTeam === 'opp' ? RESET_MY_ATK  : RESET_MY_DEF;
    var oppLayout = scorerTeam === 'my'  ? RESET_OPP_ATK : RESET_OPP_DEF;

    var ALL_PK = ['GK','1','2','3','4','5','6'];
    ALL_PK.forEach(function(pk) {
      var mp = myLayout[pk],  op = oppLayout[pk];
      if (mp) _mv('my_'  + pk, mp.x, mp.y, 0.012);
      if (op) _mv('opp_' + pk, op.x, op.y, 0.012);
    });
    // Palla al centro
    _moveBall(CX, CY);
    _phase = 'kickoff_after';
  }

  function _executeKickoffAfterGoal(scorerTeam) {
    // Chi batte: la squadra che ha subito il gol
    var batter = scorerTeam === 'my' ? 'opp' : 'my';
    var cb6Key = batter + '_6';
    var c3Key  = batter + '_3';

    _seq   = [];
    _seqActive = false;

    // Palla sul CB della squadra che batte (è già al centro)
    _ballOn(cb6Key);

    _qA(0.45, function() {
      // CB rilascia, palla vola al C (pos 3)
      if (typeof poolReleaseBall === 'function') poolReleaseBall();
      var tar = batter === 'my' ? ATK_MY['3'] : ATK_OPP['3'];
      _moveBall(tar.x + _rnd(-0.02, 0.02), tar.y + _rnd(-0.02, 0.02));
      setTimeout(function() { _ballOn(batter + '_3'); }, 350);
    });
    _qA(1.1, function() {
      _attack = batter;
      _repositionTactical(0.022);
      _phase = 'play';
    });

    _startSeq();
  }

  // ── 3/4. PASSAGGIO / NEUTRO ───────────────────────────────────────────────
  function onPassOrNeutral(event) {
    if (!event || !event.ballTarget) return;
    var bx = event.ballTarget.x, by = event.ballTarget.y;
    // Determina squadra in possesso dalla posizione palla
    var team = bx > CX ? 'my' : 'opp';
    // Trova il token più vicino alla destinazione → diventa il possessore
    var closest = _findClosestFieldToken(team, bx, by);

    if (closest) {
      // Prima libera la palla, poi la assegna al ricevitore
      if (typeof poolReleaseBall === 'function') poolReleaseBall();
      _moveBall(bx, by);
      // Dopo che la palla è arrivata, assegna il possesso
      setTimeout(function() {
        _ballOn(closest);
        _attack = team;
      }, 300);
    } else {
      if (typeof poolReleaseBall === 'function') poolReleaseBall();
      _moveBall(bx, by);
    }

    // Piccola traslazione della formazione verso la porta avversaria
    if (_phase === 'play') {
      setTimeout(function() {
        _repositionTactical(0.020);
      }, 400);
    }
  }

  // ── 5. TIRO ───────────────────────────────────────────────────────────────
  function onShot(event) {
    if (!event || !event.ballTarget) return;
    // Assegna brevemente il possesso al tiratore (appare con la palla)
    if (event.moverKey) _ballOn(event.moverKey);

    setTimeout(function() {
      // Rilascia il possesso: la palla vola libera verso la porta
      if (typeof poolReleaseBall === 'function') poolReleaseBall();
      _moveBall(event.ballTarget.x, event.ballTarget.y);
      if (event.moverKey && event.moverTarget) {
        _mv(event.moverKey, event.moverTarget.x, event.moverTarget.y, 0.015);
      }
    }, 250);
  }

  // ── 6. PARATA ─────────────────────────────────────────────────────────────
  function onSave(event) {
    if (!event || !event.ballTarget) return;
    // Palla vola libera verso il portiere
    if (typeof poolReleaseBall === 'function') poolReleaseBall();
    _moveBall(event.ballTarget.x, event.ballTarget.y);

    setTimeout(function() {
      if (_phase !== 'play') return;
      var gkTeam = event.ballTarget.x < CX ? 'my' : 'opp';
      var gkKey  = gkTeam + '_GK';
      // Il portiere prende possesso
      _ballOn(gkKey);

      // Dopo 0.7s rilancia al pos 3
      setTimeout(function() {
        var tar3 = gkTeam === 'my' ? ATK_MY['3'] : ATK_OPP['3'];
        if (typeof poolReleaseBall === 'function') poolReleaseBall();
        _moveBall(tar3.x + _rnd(-0.05, 0.05), tar3.y + _rnd(-0.04, 0.04));
        setTimeout(function() {
          _ballOn(gkTeam + '_3');
          _attack = gkTeam;
          _repositionTactical(0.022);
        }, 450);
      }, 700);
    }, 750);
  }

  // ── 7. RIGORE ─────────────────────────────────────────────────────────────
  function onPenaltyKick(shooterTeam, isGoal, shooterPk) {
    _phase = 'penalty';
    _seq   = [];
    _seqActive = false;

    var pk       = shooterPk || '6';
    var sTeam    = shooterTeam || 'my';
    var penX     = sTeam === 'my' ? 0.86 : 0.14;  // linea 6m
    var gkKey    = sTeam === 'my' ? 'opp_GK' : 'my_GK';
    var gkX      = sTeam === 'my' ? 0.89     : 0.11;

    // Posiziona tiratore ai 6m e portiere al centro porta
    _qA(0, function() {
      _mv(sTeam + '_' + pk, penX, CY);
      _mv(gkKey, gkX, CY);
      _ballOn(sTeam + '_' + pk);
    });

    // Carica
    _qA(1.0, function() {
      var ty = _rnd(OPP_GOAL_Y0 + 0.04, OPP_GOAL_Y1 - 0.04);
      if (typeof poolReleaseBall === 'function') poolReleaseBall();
      if (isGoal) {
        var netX = sTeam === 'my' ? 0.96 : 0.04;
        _moveBall(netX, ty);
      } else {
        _moveBall(gkX + (sTeam === 'my' ? -0.02 : 0.02), CY + _rnd(-0.05, 0.05));
        // Portiere prende possesso dopo parata rigore
        setTimeout(function() { _ballOn(gkKey); }, 400);
      }
    });

    _qA(isGoal ? 2.2 : 1.6, function() {
      _attack = isGoal ? (sTeam === 'my' ? 'opp' : 'my') : sTeam;
      _repositionTactical(0.022);
      _phase = 'play';
    });

    _startSeq();
  }

  // ── CAMBIO POSSESSO ───────────────────────────────────────────────────────
  function onPossessChange(team) {
    _attack = team;
    if (_phase === 'play') _repositionTactical(0.022);
  }

  // ─── Riposizionamento tattico ──────────────────────────────────────────────
  function _repositionTactical(jit) {
    jit = jit || 0.020;
    var ALL = ['GK','1','2','3','4','5','6'];
    ALL.forEach(function(pk) {
      var mb = _attack === 'my'  ? ATK_MY[pk]  : DEF_MY[pk];
      var ob = _attack === 'opp' ? ATK_OPP[pk] : DEF_OPP[pk];
      if (mb) _mv('my_'  + pk, mb.x, mb.y, pk === 'GK' ? 0 : jit);
      if (ob) _mv('opp_' + pk, ob.x, ob.y, pk === 'GK' ? 0 : jit);
    });
    if (typeof poolUpdateKeepers === 'function') poolUpdateKeepers();
  }

  // ─── Micro-movimenti ──────────────────────────────────────────────────────
  function _applyMicroMovements() {
    if (typeof poolGetTokens !== 'function') return;
    var toks = poolGetTokens();
    if (!toks) return;
    var amp = 0.015;
    Object.values(toks).forEach(function(tok) {
      if (!tok || tok.expelled || tok.isGK) return;
      // Solo token già a destinazione (non in movimento)
      if (Math.abs(tok.tx - tok.x) > 0.03 || Math.abs(tok.ty - tok.y) > 0.03) return;
      tok.tx = _clamp(tok.tx + _rnd(-amp, amp), 0.12, 0.88);
      tok.ty = _clamp(tok.ty + _rnd(-amp, amp), 0.14, 0.86);
    });
    if (typeof poolUpdateKeepers === 'function') poolUpdateKeepers();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _getCBMorale(team) {
    if (!_ms) return 50;
    if (team === 'my') {
      var pi6 = _ms.onField ? _ms.onField['6'] : undefined;
      if (pi6 !== undefined && _ms.myRoster && _ms.myRoster[pi6])
        return _ms.myRoster[pi6].morale || 50;
    }
    return 50;
  }

  function _findClosestFieldToken(team, bx, by) {
    if (typeof poolGetTokens !== 'function') return null;
    var toks = poolGetTokens();
    if (!toks) return null;
    var bestKey = null, bestDist = 999;
    ['1','2','3','4','5','6'].forEach(function(pk) {
      var key = team + '_' + pk;
      var tok = toks[key];
      if (!tok || tok.expelled) return;
      var d = _dist(tok.x, tok.y, bx, by);
      if (d < bestDist) { bestDist = d; bestKey = key; }
    });
    return bestKey;
  }

  // ─── Esportazione ─────────────────────────────────────────────────────────
  return {
    init:            init,
    stop:            stop,
    update:          update,
    onPeriodStart:   onPeriodStart,
    onSprintStart:   onSprintStart,
    onGoalEvent:     onGoalEvent,
    onShot:          onShot,
    onSave:          onSave,
    onPassOrNeutral: onPassOrNeutral,
    onPenaltyKick:   onPenaltyKick,
    onPossessChange: onPossessChange,
  };

})();

window.MovementController = MovementController;
