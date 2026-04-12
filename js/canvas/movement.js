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


/**
 * Calcola lo spostamento dei segnalini
 */
function updateMovement(tokens, ball, matchState) {
    const poolWidth = canvas.width; // Assumendo che il campo occupi il canvas
    const baseUnitSpeed = poolWidth / (REALISM_CONFIG.SECONDS_TO_CROSS * REALISM_CONFIG.FPS);

    tokens.forEach(token => {
        // 1. Calcolo Velocità Proporzionale
        let playerStatSpeed = token.playerData.speed || 50;
        let currentSpeed = (playerStatSpeed / REALISM_CONFIG.MAX_SPEED_STAT) * baseUnitSpeed;

        // 2. Logica Contropiede (Posizioni 1, 5, 6 più veloci)
        if (matchState.tactic === 'CONTROPIEDE' && ['1', '5', '6'].includes(token.position)) {
            currentSpeed *= 1.3; // Boost del 30%
        }

        // 3. Logica Attacco/Difesa (tipo Basket)
        let targetX, targetY;
        if (matchState.possession === token.team) {
            // Fase OFFENSIVA: nuota verso la porta avversaria
            targetX = token.team === 'home' ? poolWidth - 50 : 50;
            targetY = token.strategicPos.y;
        } else {
            // Fase DIFENSIVA: nuota verso la propria porta
            targetX = token.team === 'home' ? 50 : poolWidth - 50;
            targetY = token.strategicPos.y;

            // Logica PRESSIONE FORTE
            if (matchState.tactic === 'PRESSIONE_FORTE') {
                let opponent = findAssignedOpponent(token, tokens);
                targetX = opponent.x;
                targetY = opponent.y;
            }
        }

        // Muovi effettivamente il segnalino verso il target
        moveTowards(token, targetX, targetY, currentSpeed);
    });
}


// Cerca la funzione che calcola la velocità (interna a MovementController)
function getPlayerSpeed(player) {
    // POOL_W è 760px. Velocità per 100 stat = 76px/s
    // Calcoliamo la velocità per frame: (760 / 10) / 60 = 1.26 px/frame
    const baseSpeed = POOL_W / G.REALISM.SECONDS_TO_CROSS / G.REALISM.FPS;
    let statFactor = (player.stats.spe || 50) / G.REALISM.SPEED_REF_STAT;
    
    let speed = baseSpeed * statFactor;

    // Logica CONTROPIEDE: Posizioni 1, 5, 6 corrono il 20% più veloci
    if (_ms.tactic === 'counter' && ['1', '5', '6'].includes(player.pos)) {
        speed *= 1.2;
    }
    return speed;
}

// Nella logica di aggiornamento target (TACTICAL_INTERVAL)
function updateTacticalTargets() {
    const isAttacking = _ms.possession === 'my';
    
    Object.keys(_ms.myRoster).forEach(pk => {
        let p = _ms.myRoster[pk];
        let tok = _ms.tokens['my_' + pk];
        if (!tok) return;

        if (isAttacking) {
            // Comportamento Basket: tutti verso la porta avversaria (MY_SEMICIRCLE_ATK)
            tok.targetX = MY_SEMICIRCLE_ATK[p.pos].x;
            tok.targetY = MY_SEMICIRCLE_ATK[p.pos].y;
        } else {
            // Fase Difesa: tutti verso la propria porta (MY_DEFENSE)
            tok.targetX = MY_DEFENSE[p.pos].x;
            tok.targetY = MY_DEFENSE[p.pos].y;

            // Logica PRESSIONE FORTE
            if (_ms.tactic === 'press' && p.pos !== 'GK') {
                let opp = _ms.tokens['opp_' + p.pos]; // Marcatura a uomo sulla stessa posizione
                if (opp) {
                    tok.targetX = opp.x + 0.05; // Molto vicino all'avversario
                    tok.targetY = opp.y;
                }
            }
        }
    });
}

// Esponi globalmente
window.MovementController = MovementController;
