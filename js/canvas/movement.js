// ─────────────────────────────────────────────
// canvas/movement.js
// Gestione autonoma dei movimenti dei segnalini
// durante la partita (AI tattica + micro-movimenti).
// Si interfaccia con pool.js tramite le funzioni
// poolMoveToken / poolMoveBall / poolStartPeriod.
// ─────────────────────────────────────────────

var MovementController = (function() {

  // ── Stato interno ─────────────────────────
  var _ms          = null;   // riferimento allo stato partita
  var _active      = false;
  var _ticker      = 0;      // timer accumulatore in secondi di gioco
  var _microTick   = 0;
  var _lastPossess = 'my';   // chi aveva la palla l'ultimo tick

  // Intervalli (secondi di gioco reale)
  var TACTICAL_INTERVAL = 4.0;   // riposizionamento tattico
  var MICRO_INTERVAL    = 1.8;   // micro-movimenti

  // ── API pubblica ───────────────────────────

  function init(ms) {
    _ms     = ms;
    _active = true;
    _ticker = 0;
    _microTick = 0;
    _lastPossess = 'my';
  }

  function stop() {
    _active = false;
    _ms = null;
  }

  // Chiamata ogni frame con dt in secondi (già moltiplicato per speed se necessario)
  function update(dt) {
    if (!_active || !_ms || !_ms.running) return;

    _ticker    += dt;
    _microTick += dt;

    // ── Micro-movimenti ──────────────────────
    if (_microTick >= MICRO_INTERVAL) {
      _microTick = 0;
      _applyMicroMovements();
    }

    // ── Riposizionamento tattico ─────────────
    if (_ticker >= TACTICAL_INTERVAL) {
      _ticker = 0;
      _applyTacticalPosition();
    }
  }

  // Chiamata quando c'è un cambio di possesso esplicito
  function onPossessChange(team) {
    _lastPossess = team;
    _applyTacticalPosition();
  }

  // Chiamata a inizio periodo
  function onPeriodStart() {
    if (typeof poolStartPeriod === 'function') poolStartPeriod();
    _ticker = 0;
    _microTick = 0;
  }

  // ── Logica interna ─────────────────────────

  // Piccoli aggiustamenti casuali per simulare il nuotare sul posto
  function _applyMicroMovements() {
    if (typeof poolMoveToken !== 'function') return;
    var PLAY_X0 = 0.10, PLAY_X1 = 0.90;
    var PLAY_Y0 = 0.12, PLAY_Y1 = 0.88;

    ['1','2','3','4','5','6'].forEach(function(pk) {
      // Nostra squadra
      var myTok = _getToken('my_' + pk);
      if (myTok && !myTok.expelled) {
        var nx = _clampV(myTok.tx + _rndV(-0.018, 0.018), PLAY_X0 + 0.02, PLAY_X1 - 0.02);
        var ny = _clampV(myTok.ty + _rndV(-0.015, 0.015), PLAY_Y0 + 0.02, PLAY_Y1 - 0.02);
        poolMoveToken('my_' + pk, nx, ny);
      }
      // Avversario
      var oppTok = _getToken('opp_' + pk);
      if (oppTok && !oppTok.expelled) {
        var ox = _clampV(oppTok.tx + _rndV(-0.018, 0.018), PLAY_X0 + 0.02, PLAY_X1 - 0.02);
        var oy = _clampV(oppTok.ty + _rndV(-0.015, 0.015), PLAY_Y0 + 0.02, PLAY_Y1 - 0.02);
        poolMoveToken('opp_' + pk, ox, oy);
      }
    });
  }

  // Riposizionamento basato su chi ha il possesso
  // Legge la posizione corrente della palla da pool.js se disponibile
  function _applyTacticalPosition() {
    // Non fare nulla se siamo in fase goal/kickoff
    if (typeof poolGetPhase === 'function') {
      var phase = poolGetPhase();
      if (phase === 'goal' || phase === 'kickoff' || phase === 'idle') return;
    }
    // Il riposizionamento tattico vero è già gestito da pool.js
    // tramite poolMoveBall → _triggerTactical.
    // Qui gestiamo solo un eventuale refresh periodico leggero
    // per mantenere le posizioni aggiornate se la palla non si muove.
  }

  // ── Helpers ───────────────────────────────
  function _getToken(key) {
    // Accede ai token interni di pool.js (esposti tramite variabile globale
    // oppure tramite funzione helper se disponibile)
    if (typeof poolGetTokens === 'function') return poolGetTokens()[key];
    return null;
  }
 
/* AGGIUNTA REALISMO **/ 
  function _getRealismSpeed(p) {
    let fieldWidth = 0.8; // Lunghezza relativa del campo
    let baseSpeed = (fieldWidth / G.REALISM.SECONDS_TO_CROSS) / G.REALISM.FPS;
    let statFactor = (p.stats && p.stats.spe) ? p.stats.spe / G.REALISM.REF_SPEED_STAT : 0.5;
    return baseSpeed * statFactor;
	}

	function _updatePlayerTarget(tokenKey) {
		let tok = _getTok(tokenKey);
		if (!tok) return;
		let isHome = tokenKey.startsWith('my_');

		if (!_ms || !_ms.phase) {
				console.error("[MOVEMENT ERROR] Impossibile aggiornare target: fase mancante!");
				return;
			}

		if (_ms.phase === 'sprint') {
			if (tok.pos === '6') {
				tok.tx = 0.5; tok.ty = 0.5; // I n. 6 scattano verso la palla
				console.log(`[MOVE] ${tokenKey} scatta verso il centro`);
			} else {
				tok.tx = isHome ? 0.6 : 0.4; // Gli altri avanzano a supporto
				tok.ty = tok.sy; 
			}
		} else if (_ms.phase === 'celebration') {
			let scorer = _getTok(_ms.lastScorerId);
			if (scorer && tok.team === _ms.lastScorerTeam) {
				tok.tx = scorer.x; tok.ty = scorer.y; // Esultanza di gruppo
			}
		}
		console.log(`[TARGET] Assegnato a ${tokenKey}: x=${tok.tx}, y=${tok.ty} per fase ${_ms.phase}`);
	}
/* FINE AGGIUNTA REALISMO **/

  function _clampV(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function _rndV(lo, hi)      { return lo + Math.random() * (hi - lo); }

  // ── Esportazione ──────────────────────────
  return {
    init:             init,
    stop:             stop,
    update:           update,
    onPossessChange:  onPossessChange,
    onPeriodStart:    onPeriodStart,
  };

})();

// Esponi globalmente
window.MovementController = MovementController;
