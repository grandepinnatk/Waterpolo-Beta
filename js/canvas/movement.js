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
	function activate(matchState) {
		_ms = matchState; // <-- Qui viene "riempita" la variabile
		_active = true;
	}

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

	  // Log "silenzioso" (appare solo ogni 100 frame per non intasare)
    if (Math.random() < 0.01) console.log("[MOVEMENT] Loop attivo, fase:", _ms.phase);

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
    // Quando cambia il possesso, inviamo tutti i giocatori ai nuovi target
    ['1','2','3','4','5','6','GK'].forEach(function(pk) {
        _updatePlayerTarget('my_' + pk);
        _updatePlayerTarget('opp_' + pk);
    });
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


/**
 * Calcola la velocità reale basata sulla scala del campo
 */
function getCalculatedSpeed(playerStat) {
    // Calcoliamo la larghezza utile del campo (da porta a porta)
    // Usando le costanti del tuo file pool.js: PLAY.x1 - PLAY.x0
    const fieldWidthInPixels = (PLAY.x1 - PLAY.x0) * canvas.width; 
    
    // Velocità necessaria per fare il campo in 10 secondi (stat 100)
    const pixelsPerSecondAt100 = fieldWidthInPixels / G.REALISM.SECONDS_TO_CROSS;
    
    // Velocità per singolo frame (assumendo 60fps)
    const baseFrameSpeed = pixelsPerSecondAt100 / G.REALISM.FPS;

    // Proporzione in base alla statistica del giocatore (spe)
    let finalSpeed = baseFrameSpeed * (playerStat / G.REALISM.SPEED_REF_STAT);

    // TATTICA CONTROPIEDE: Boost per posizioni 1, 5, 6
    if (_ms.tactic === 'counter' && ['1', '5', '6'].includes(player.pos)) {
        finalSpeed *= 1.25; // 25% più veloci
    }

    return finalSpeed;
}

// Funzione per calcolare la velocità normalizzata
function getRealismSpeed(player) {
    const DISTANCE = PLAY.x1 - PLAY.x0; // 0.80
    const SECONDS = 10;
    const FPS = 60; // Assumendo che il gioco giri a 60fps
    
    // Velocità base per frame per un giocatore con 100 di velocità
    const baseSpeedPerFrame = (DISTANCE / SECONDS) / FPS; 
    
    // Proporzionale alla statistica 'spe' del giocatore
    let statFactor = (player.stats && player.stats.spe) ? player.stats.spe / 100 : 0.5;
    
    let finalSpeed = baseSpeedPerFrame * statFactor;

    // LOGICA CONTROPIEDE: 1, 5, 6 più veloci
    if (_ms.tactic === 'counter' && ['1', '5', '6'].includes(player.pos)) {
        finalSpeed *= 1.3; // +30% velocità
    }
    
    return finalSpeed;
}

function _getRealismSpeed(tokenKey) {
    // Distanza campo in unità relative (PLAY_X1 - PLAY_X0 = 0.80)
    var FIELD_DIST = 0.80; 
    var unitsPerSecond = FIELD_DIST / G.REALISM.SECONDS_TO_CROSS;
    var unitsPerFrame = unitsPerSecond / G.REALISM.FPS;

    // Recupera il giocatore per leggere la sua statistica 'spe' (velocità)
    var tok = _getToken(tokenKey);
    if (!tok) return unitsPerFrame;

    // Supponendo che tok.player.stats.spe contenga la velocità (0-100)
    var spe = (tok.player && tok.player.stats) ? tok.player.stats.spe : 50;
    var finalSpeed = unitsPerFrame * (spe / G.REALISM.REF_SPEED_STAT);

    // Tattica Contropiede: boost per posizioni 1, 5, 6
    if (_ms.tactic === 'counter' && (tok.pos === '1' || tok.pos === '5' || tok.pos === '6')) {
        finalSpeed *= 1.3;
    }
    return finalSpeed;
}

// Funzione per calcolare la velocità proporzionale (10s per il campo)
function _getPlayerSpeed(player) {
    // Il campo utile è PLAY.x1 - PLAY.x0 (circa 0.80 unità)
    const FIELD_DISTANCE = 0.80; 
    const unitsPerSecond = FIELD_DISTANCE / G.REALISM.SECONDS_TO_CROSS;
    const unitsPerFrame = unitsPerSecond / G.REALISM.FPS;

    // Velocità basata sulla stat 'spe' del giocatore
    let statFactor = (player.spe || 50) / G.REALISM.BASE_SPEED_STAT;
    let finalSpeed = unitsPerFrame * statFactor;

    // Tattica Contropiede: posizioni 1, 5, 6 più veloci
    if (_ms.tactic === 'counter' && ['1', '5', '6'].includes(player.pos)) {
        finalSpeed *= 1.25; 
    }
    return finalSpeed;
}

// Logica di movimento "Basket" (Attacco/Difesa di massa)
function _updateTacticalTargets() {
    const isAttacking = _ms.possession === 'my';
    
    Object.keys(_ms.tokens).forEach(id => {
        let tok = _ms.tokens[id];
        let isHome = id.startsWith('my_');
        let p = isHome ? _ms.myRoster[id.split('_')[1]] : _ms.oppRoster[id.split('_')[1]];
        
        if ((isAttacking && isHome) || (!isAttacking && !isHome)) {
            // FASE ATTACCO: Verso semicerchio offensivo
            let targetSet = isHome ? MY_SEMICIRCLE_ATK : OPP_SEMICIRCLE_ATK;
            tok.targetX = targetSet[p.pos].x;
            tok.targetY = targetSet[p.pos].y;
        } else {
            // FASE DIFESA: Verso zona difensiva
            let targetSet = isHome ? MY_DEFENSE : OPP_DEFENSE;
            tok.targetX = targetSet[p.pos].x;
            tok.targetY = targetSet[p.pos].y;

            // Tattica PRESSIONE FORTE: marca l'avversario da vicino
            if (_ms.tactic === 'press' && p.pos !== 'GK') {
                let oppId = isHome ? id.replace('my_', 'opp_') : id.replace('opp_', 'my_');
                if (_ms.tokens[oppId]) {
                    tok.targetX = _ms.tokens[oppId].x + (isHome ? 0.03 : -0.03);
                    tok.targetY = _ms.tokens[oppId].y;
                }
            }
        }
    });
}

// Dentro la funzione che aggiorna la palla (es. updateBall o simile)
function _animateBallPass() {
    if (_ms.ballStatus === 'passing') {
        let targetTok = _ms.tokens[_ms.targetReceiver];
        if (targetTok) {
            // Calcoliamo la velocità del passaggio (deve essere più veloce dei giocatori)
            const passSpeed = 0.02; // Regola questo valore per il realismo
            
            // Usiamo la tua funzione moveToTarget esistente
            moveToTarget(_ball, targetTok.x, targetTok.y, passSpeed);

            // Se la palla è abbastanza vicina al ricevitore, il passaggio è completato
            let dist = Math.hypot(_ball.x - targetTok.x, _ball.y - targetTok.y);
            if (dist < 0.01) {
                _ms.ballStatus = 'held'; // La palla è ora in mano al giocatore
                _ms.currentPossessor = _ms.targetReceiver;
            }
        }
    }
}

// Aggiungi questa funzione dentro MovementController
// [File: js/canvas/movement.js]

function _updatePlayerTarget(tokenKey) {
    // CORREZIONE: Usa _getTok invece di _getToken
	
	var tok = _getTok(tokenKey);
    if (!tok) return;
	
    // Debug: vediamo se la funzione viene chiamata per ogni giocatore
	console.log(`[MOVEMENT] Aggiorno Target per ${tokenKey}. Fase: ${_ms.phase}`);
	
    var isHome = tokenKey.startsWith('my_');
	
    // Determina se la squadra del token ha il possesso
    var isAttacking = (_ms.possession === (isHome ? 'my' : 'opp'));

    if (isAttacking) {
        // Fase ATTACCO: punta al semicerchio offensivo
        // Assicurati che MY_SEMICIRCLE_ATK e OPP_SEMICIRCLE_ATK siano definiti in pool.js
        var targetSet = isHome ? MY_SEMICIRCLE_ATK : OPP_SEMICIRCLE_ATK;
        if (targetSet && targetSet[tok.pos]) {
            tok.targetX = targetSet[tok.pos].x;
            tok.targetY = targetSet[tok.pos].y;
        }
    } else {
        // Fase DIFESA: torna in posizione difensiva
        var targetSet = isHome ? MY_DEFENSE : OPP_DEFENSE;
        if (targetSet && targetSet[tok.pos]) {
            tok.targetX = targetSet[tok.pos].x;
            tok.targetY = targetSet[tok.pos].y;
        }
    }

	// A. SPRINT INIZIALE
    if (_ms.phase === 'sprint') {
        if (tok.pos === '6') {
            // I numeri 6 nuotano verso la palla al centro
            tok.tx = 0.5; tok.ty = 0.5;
        } else {
            // Gli altri si dispongono sulla linea d'attacco (es. i 2 metri)
            tok.tx = isHome ? 0.65 : 0.35; 
            tok.ty = tok.sy; // Mantengono la loro corsia laterale (start Y)
        }
    } 
    
    // B. ESULTANZA DOPO GOAL
    else if (_ms.phase === 'celebration') {
        var scorer = _getTok(_ms.lastScorerId);
        if (scorer && tok.team === _ms.lastScorerTeam) {
            // I compagni vanno verso chi ha segnato
            tok.tx = scorer.x; tok.ty = scorer.y;
        } else {
            // Chi ha subito il goal torna mestamente verso la propria porta
            tok.tx = isHome ? 0.2 : 0.8;
            tok.ty = 0.5;
        }
    }

    // C. KICKOFF (Rimessa dal centro)
    else if (_ms.phase === 'kickoff') {
        if (tok.pos === '6') {
            tok.tx = 0.5; tok.ty = 0.5; // Il 6 batte al centro
        } else if (tok.pos === '3') {
            tok.tx = isHome ? 0.45 : 0.55; // Il 3 si avvicina per ricevere
            tok.ty = 0.5;
        } else {
            // Gli altri tornano in posizione standard
            _applyStandardTacticalPosition(tok); 
        }
    }

	console.log(`[MOVEMENT] Target impostato per ${tokenKey}: tx=${tok.tx}, ty=${tok.ty}`);
}

// Assicurati che onPossessChange sia così:
function onPossessChange(team) {
    _lastPossess = team;
    // Cicla tutti i giocatori (1-6 + Portiere) per aggiornare i loro bersagli
    ['1','2','3','4','5','6','GK'].forEach(function(pk) {
        _updatePlayerTarget('my_' + pk);
        _updatePlayerTarget('opp_' + pk);
    });
}

function _getTok(key) {
    // Ora _ms è accessibile perché siamo dentro lo scope del modulo
    if (!_ms || !_ms.tokens) return null;
    return _ms.tokens[key];
  }

  function _updatePlayerTarget(tokenKey) {
    var tok = _getTok(tokenKey);
    if (!tok) return;

    var isHome = tokenKey.startsWith('my_');
    var isAttacking = (_ms.possession === (isHome ? 'my' : 'opp'));

    // Applica le coordinate (Assicurati che siano definite in pool.js)
    if (isAttacking) {
      var targetSet = isHome ? MY_SEMICIRCLE_ATK : OPP_SEMICIRCLE_ATK;
      if (targetSet && targetSet[tok.pos]) {
        tok.tx = targetSet[tok.pos].x;
        tok.ty = targetSet[tok.pos].y;
      }
    } else {
      var targetSet = isHome ? MY_DEFENSE : OPP_DEFENSE;
      if (targetSet && targetSet[tok.pos]) {
        tok.tx = targetSet[tok.pos].x;
        tok.ty = targetSet[tok.pos].y;
      }
    }
  }
	
/**
 * Calcola la velocità basata sul realismo (10s per il campo)
 * @param {Object} p - Dati del giocatore (deve contenere le stats)
 */
function _getRealismSpeed(p) {
    if (!G.REALISM) {
        console.error("[SPEED ERROR] G.REALISM non definito in main.js!");
        return 0.002; // Velocità di emergenza
    }

    // Distanza del campo in unità relative (es. 0.80)
    var dist = PLAY.x1 - PLAY.x0; 
    
    // Velocità base per frame (distanza / tempo / FPS)
    var baseSpeed = (dist / G.REALISM.SECONDS_TO_CROSS) / G.REALISM.FPS;
    
    // Proporzione basata sulla statistica 'spe' (velocità) del giocatore
    var statFactor = (p.stats && p.stats.spe) ? p.stats.spe / G.REALISM.REF_SPEED_STAT : 0.5;
    
    var finalSpeed = baseSpeed * statFactor;

    // Log di debug (apparirà ogni volta che viene ricalcolata la velocità)
    console.log(`[SPEED] Giocatore ${p.pos} (${p.name}): stat spe=${p.stats.spe} -> velocità frame=${finalSpeed.toFixed(6)}`);

    return finalSpeed;
}


})();

// Esponi globalmente
window.MovementController = MovementController;
