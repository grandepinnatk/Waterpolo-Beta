// ─────────────────────────────────────────────────────────────────────
// canvas/movement.js  —  Simulazione movimento continuo  v0.7.5
//
// MODELLO: tutti i token si muovono continuamente ogni frame.
// Il sistema aggiorna i target autonomamente in base allo stato di gioco,
// senza aspettare eventi dall'engine. Gli eventi del motore aggiornano
// solo il "contesto" (chi ha la palla, fase di gioco) non le posizioni.
//
// Ispirato a Football Manager: campo sempre vivo, nessun blocco.
// ─────────────────────────────────────────────────────────────────────

var MovementController = (function() {

  // ── Geometria ────────────────────────────────────────────────────
  var CX=0.50, CY=0.50;
  var OPP_GOAL_Y0=0.38, OPP_GOAL_Y1=0.62;
  var FIELD_W=0.80, VEL100_T=12.0;
  var BASE_SPD=FIELD_W/VEL100_T;

  // ── Formazioni (identiche a pool.js) ────────────────────────────
  var ATK_MY  = {GK:{x:0.09,y:0.50},'5':{x:0.68,y:0.17},'4':{x:0.60,y:0.32},'6':{x:0.79,y:0.50},'3':{x:0.55,y:0.50},'2':{x:0.60,y:0.68},'1':{x:0.68,y:0.83}};
  var ATK_OPP = {GK:{x:0.91,y:0.50},'1':{x:0.32,y:0.17},'2':{x:0.40,y:0.32},'6':{x:0.21,y:0.50},'3':{x:0.45,y:0.50},'4':{x:0.40,y:0.68},'5':{x:0.32,y:0.83}};
  var DEF_MY  = {GK:{x:0.09,y:0.50},'5':{x:0.23,y:0.21},'4':{x:0.30,y:0.35},'6':{x:0.37,y:0.50},'3':{x:0.30,y:0.50},'2':{x:0.30,y:0.65},'1':{x:0.23,y:0.79}};
  var DEF_OPP = {GK:{x:0.91,y:0.50},'1':{x:0.77,y:0.21},'2':{x:0.70,y:0.35},'6':{x:0.63,y:0.50},'3':{x:0.70,y:0.50},'4':{x:0.70,y:0.65},'5':{x:0.77,y:0.79}};
  var KICKOFF_MY  = {GK:{x:0.09,y:0.50},'5':{x:0.13,y:0.20},'4':{x:0.13,y:0.35},'6':{x:0.13,y:0.50},'3':{x:0.13,y:0.50},'2':{x:0.13,y:0.65},'1':{x:0.13,y:0.80}};
  var KICKOFF_OPP = {GK:{x:0.91,y:0.50},'1':{x:0.87,y:0.20},'2':{x:0.87,y:0.35},'6':{x:0.87,y:0.50},'3':{x:0.87,y:0.50},'4':{x:0.87,y:0.65},'5':{x:0.87,y:0.80}};
  var RESET_MY_ATK  = {GK:{x:0.09,y:0.50},'5':{x:0.51,y:0.18},'4':{x:0.47,y:0.34},'6':{x:0.50,y:0.50},'3':{x:0.48,y:0.50},'2':{x:0.47,y:0.66},'1':{x:0.51,y:0.82}};
  var RESET_OPP_DEF = {GK:{x:0.91,y:0.50},'1':{x:0.78,y:0.22},'2':{x:0.72,y:0.36},'6':{x:0.66,y:0.50},'3':{x:0.72,y:0.50},'4':{x:0.72,y:0.64},'5':{x:0.78,y:0.78}};
  var RESET_OPP_ATK = {GK:{x:0.91,y:0.50},'1':{x:0.49,y:0.18},'2':{x:0.53,y:0.34},'6':{x:0.50,y:0.50},'3':{x:0.52,y:0.50},'4':{x:0.53,y:0.66},'5':{x:0.49,y:0.82}};
  var RESET_MY_DEF  = {GK:{x:0.09,y:0.50},'5':{x:0.22,y:0.22},'4':{x:0.28,y:0.36},'6':{x:0.34,y:0.50},'3':{x:0.28,y:0.50},'2':{x:0.28,y:0.64},'1':{x:0.22,y:0.78}};

  // ── SUPERIORITÀ NUMERICA: attacco 4-2 (noi 6 vs avversario 5) ─────
  // La nostra squadra attacca verso dx (porta avversaria a destra)
  // 4 esterni: pos1(ala dx), pos2(est dx), pos4(est sx), pos5(ala sx)
  // 2 Pali ai 2m: pos6=Palo1 (lato dx/basso), pos3=Palo5 (lato sx/alto)
  // Nostra squadra in 4-2, attacca verso porta dx
  var SUP_ATK_MY_42 = {
    GK:  {x:0.09, y:0.50},
    '1': {x:0.82, y:0.70},  // ala dx — ai 2m lato basso
    '6': {x:0.79, y:0.55},  // Palo 1 — davanti palo dx (in basso guardando porta)
    '3': {x:0.79, y:0.45},  // Palo 5 — davanti palo sx (in alto guardando porta)
    '5': {x:0.82, y:0.30},  // ala sx — ai 2m lato alto
    '2': {x:0.68, y:0.68},  // esterno dx — linea 4m
    '4': {x:0.68, y:0.32},  // esterno sx — linea 4m
  };
  // Avversario 5 giocatori in difesa pressing (marca stretto ogni attaccante)
  // Ogni difensore avversario copre il proprio attaccante direttamente
  var SUP_DEF_OPP_PRESS = {
    GK:  {x:0.91, y:0.50},
    '1': {x:0.84, y:0.68},  // marca pos1
    '6': {x:0.84, y:0.42},  // marca zona Palo (copre entrambi i Pali da solo)
    '3': {x:0.76, y:0.50},  // marca zona centrale
    '5': {x:0.84, y:0.32},  // marca pos5
    '2': {x:0.74, y:0.65},  // marca pos2 esterno
    // pos 4 OPP è assente (espulso)
  };

  // ── INFERIORITÀ NUMERICA: difesa 5 pressing (noi 5 vs avversario 6) ──
  // Avversario attacca verso sx (porta nostra a sx), noi difendiamo in 5
  // Schema pressing: ogni difensore marca stretto il proprio attaccante
  var INF_DEF_MY_PRESS = {
    GK:  {x:0.09, y:0.50},
    '1': {x:0.16, y:0.68},  // marca ala dx avv
    '6': {x:0.16, y:0.42},  // marca zona Palo avversario (copre entrambi)
    '3': {x:0.24, y:0.50},  // marcatore centrovasca avv — zona centrale
    '5': {x:0.16, y:0.32},  // marca ala sx avv
    '2': {x:0.26, y:0.65},  // marca esterno dx avv
    // pos 4 MY è assente (espulso temporaneamente)
  };
  // Schema zona M: difensori si posizionano a zona, raddoppio sul CB avv
  var INF_DEF_MY_ZONAM = {
    GK:  {x:0.09, y:0.50},
    '1': {x:0.18, y:0.65},  // zona dx
    '6': {x:0.14, y:0.48},  // zona CB avversario (raddoppio)
    '3': {x:0.20, y:0.50},  // centrovasca — scende a coprire CB avv
    '5': {x:0.18, y:0.35},  // zona sx
    '2': {x:0.28, y:0.60},  // esterno dx aperto
    // pos 4 MY è assente
  };
  // Avversario in superiorità attacca in 4-2 verso sx (porta nostra)
  var INF_ATK_OPP_42 = {
    GK:  {x:0.91, y:0.50},
    '1': {x:0.18, y:0.70},  // ala dx avv
    '6': {x:0.12, y:0.58},  // Palo 1 avv (CB avv)
    '3': {x:0.12, y:0.42},  // Palo 5 avv
    '5': {x:0.18, y:0.30},  // ala sx avv
    '2': {x:0.32, y:0.68},  // esterno dx avv
    '4': {x:0.32, y:0.32},  // esterno sx avv
  };

  // ── Stato interno ─────────────────────────────────────────────
  var _ms          = null;
  var _active      = false;
  var _phase       = 'idle';   // 'idle'|'sprint'|'play'|'goal_cel'|'kickoff_after'|'penalty'
  var _attack      = 'my';     // chi ha il possesso
  var _ballOwnerKey= null;     // chiave del possessore corrente
  var _pressTarget = null;     // token avversario da pressare

  // Timer per aggiornamenti periodici dei target (movimento continuo)
  var _tacticalT   = 0;
  var TACTICAL_INT = 0.8;   // secondi: target aggiornati frequentemente per movimento fluido

  // Timer passaggio automatico: ogni 1.5-2.5s il possessore passa a un compagno
  var _passT    = 0;
  var _passNext = 0;   // prossima scadenza in secondi (tempo di gioco)

  // Micro-oscillazione: ogni giocatore ha una fase individuale
  var _microPhase  = {};    // key → float 0..2π
  var MICRO_AMP    = 0.022; // ampiezza oscillazione laterale

  // Coda azioni sequenziali (per sprint, rimessa, rigore)
  var _seq=[], _seqT=0, _seqIdx=0, _seqActive=false;

  // CB vincitore dello sprint
  var _cbWinner='my', _myCBSpd=BASE_SPD, _oppCBSpd=BASE_SPD;
  // Stile difesa in inferiorità: alterna pressing/zonaM a ogni episodio
  var _infDefStyle = 'press';

  // ── Helpers ───────────────────────────────────────────────────
  function _clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
  function _rnd(lo,hi){return lo+Math.random()*(hi-lo);}
  function _dist(x1,y1,x2,y2){var dx=x2-x1,dy=y2-y1;return Math.sqrt(dx*dx+dy*dy);}

  function _spd(pk,team){
    if(typeof poolGetTokenSpeeds==='function'){
      var s=poolGetTokenSpeeds();if(s&&s[team+'_'+pk]!==undefined)return s[team+'_'+pk];
    }
    return BASE_SPD;
  }

  function _tok(key){
    if(typeof poolGetToken==='function')return poolGetToken(key);
    if(typeof poolGetTokens==='function'){var t=poolGetTokens();return t?t[key]:null;}
    return null;
  }

  function _mv(key,x,y,jit){
    jit=jit||0;
    if(typeof poolMoveToken==='function')
      poolMoveToken(key,x+_rnd(-jit,jit),y+_rnd(-jit,jit));
  }

  function _ballOn(key){
    if(typeof poolSetBallOn==='function')poolSetBallOn(key);
    _ballOwnerKey=key;
    // Resetta il timer del passaggio: il nuovo possessore ha il suo intervallo fresco
    _passT=0; _passNext=_rnd(1.5,2.5);
  }
  function _ballFree(tx,ty){if(typeof poolReleaseBall==='function')poolReleaseBall();_ballOwnerKey=null;if(tx!==undefined&&typeof poolMoveBallDirect==='function')poolMoveBallDirect(tx,ty);}

  // ── Coda sequenziale ──────────────────────────────────────────
  function _qA(delay,fn){_seq.push({delay:delay,fn:fn});}
  function _startSeq(){_seqIdx=0;_seqT=0;_seqActive=_seq.length>0;}
  function _tickSeq(dt){
    if(!_seqActive||_seqIdx>=_seq.length){_seqActive=false;return;}
    _seqT+=dt;
    while(_seqIdx<_seq.length&&_seqT>=_seq[_seqIdx].delay){
      try{_seq[_seqIdx].fn();}catch(e){}
      _seqIdx++;
    }
    if(_seqIdx>=_seq.length)_seqActive=false;
  }

  // ── Riposizionamento tattico base ──────────────────────────────
  // Aggiorna i TARGET di tutti i token in base al possesso corrente.
  // Aggiunge variazione individuale (oscillazione sinusoidale) per
  // simulare il movimento continuo di tipo Football Manager.
  function _updateAllTargets(time) {
    if(_phase==='idle')return;
    var f = _getFormations();
    var sup = _ms && _ms.superiorityActive;
    var inf = _ms && _ms.inferiorityActive;
    var ALL=['GK','1','2','3','4','5','6'];
    ALL.forEach(function(pk){
      // ── NOSTRA SQUADRA ──
      var mKey='my_'+pk;
      // In inferiorità pos4 nostra è assente
      if(inf && pk==='4') return;
      var mTok=_tok(mKey);
      if(mTok&&!mTok.expelled&&pk!=='GK'){
        var base=_attack==='my'?f.myAtk[pk]:f.myDef[pk];
        if(base){
          var ph=_microPhase[mKey]||_rnd(0,Math.PI*2);
          _microPhase[mKey]=ph;
          var oscX=Math.sin(ph*1.1)*0.030;
          var oscY=Math.cos(ph*0.9)*0.024;
          // In superiorità: più aggressivi verso porta, oscillazione ridotta per precisione
          var pushX = sup ? 0.010 : (_attack==='my' ? 0.018 : -0.018);
          var tx=_clamp(base.x+oscX+pushX,0.11,0.89);
          var ty=_clamp(base.y+oscY,0.13,0.87);
          if(_ballOwnerKey!==mKey) poolMoveToken(mKey,tx,ty);
        }
      }
      // ── AVVERSARIO ──
      var oKey='opp_'+pk;
      // In superiorità pos4 avversario è assente (espulso)
      if(sup && pk==='4') return;
      var oTok=_tok(oKey);
      if(oTok&&!oTok.expelled&&pk!=='GK'){
        var obase=_attack==='opp'?f.oppAtk[pk]:f.oppDef[pk];
        if(obase){
          var ph2=_microPhase[oKey]||_rnd(0,Math.PI*2);
          _microPhase[oKey]=ph2;
          var oscX2=Math.sin(ph2*1.1)*0.030;
          var oscY2=Math.cos(ph2*0.9)*0.024;
          var pushX2 = inf ? -0.010 : (_attack==='opp' ? -0.018 : 0.018);
          var tx2=_clamp(obase.x+oscX2+pushX2,0.11,0.89);
          var ty2=_clamp(obase.y+oscY2,0.13,0.87);
          if(_ballOwnerKey!==oKey) poolMoveToken(oKey,tx2,ty2);
        }
      }
    });

    // ── Fix 3: il difensore pos3 marca sempre il CB avversario (pos6) ──────
    // Regola: il centrovasca (pos3) della squadra in DIFESA segue sempre il pos6 avversario.
    // Questo è il marcatore del centroboa: si affianca a ~0.06 unità dal pos6 avversario.
    var defTeam3 = (_attack === 'my') ? 'opp' : 'my';   // squadra che difende
    var atkCBKey = (_attack === 'my') ? 'my_6' : 'opp_6'; // CB della squadra in attacco
    var def3Key  = defTeam3 + '_3';
    var cbTok3   = _tok(atkCBKey);
    var d3Tok    = _tok(def3Key);
    if(cbTok3 && d3Tok && !d3Tok.expelled && !d3Tok.tempAbsent && _ballOwnerKey !== def3Key) {
      // Il difensore pos3 deve stare TRA il CB avversario e LA PROPRIA PORTA (che deve difendere).
      // - Se noi (my) attacchiamo: CB=my_6 attacca verso dx, difensore=opp_3 difende porta opp (0.91)
      //   → opp_3 si mette tra my_6 e porta opp, cioè a DX di my_6
      // - Se avv (opp) attacca: CB=opp_6 attacca verso sx, difensore=my_3 difende porta my (0.09)
      //   → my_3 si mette tra opp_6 e porta my, cioè a SX di opp_6
      var goalX = (_attack === 'my') ? 0.91 : 0.09;  // porta che il difensore protegge
      // 35% del percorso CB→porta: abbastanza vicino al CB da marcarlo, non troppo vicino alla porta
      var markX = _clamp(cbTok3.tx + (goalX - cbTok3.tx) * 0.35, 0.13, 0.87);
      var markY = _clamp(cbTok3.ty + _rnd(-0.018, 0.018), 0.14, 0.86);
      poolMoveToken(def3Key, markX, markY);
    }
  }

  // Avanza le fasi dell'oscillazione ogni frame
  function _tickMicro(dt) {
    var OMEGA=0.8; // velocità oscillazione (rad/s)
    Object.keys(_microPhase).forEach(function(k){
      _microPhase[k]+=OMEGA*dt+_rnd(-0.05,0.05)*dt;
    });
  }

  // ── Passaggi automatici continui ─────────────────────────────
  // Il possessore passa ogni 1.5-2.5s di gioco.
  // Fix 2b: palla inviata sulla posizione FUTURA del ricevitore ("sulla nuotata").
  //         Il ricevitore si ferma ad aspettare la palla (target = pos attuale).
  //         Il possesso viene assegnato per prossimità nel loop update.
  var _pendingReceiver = null;  // { key, team }

  function _autoPass() {
    if(!_ballOwnerKey) return;
    var ownerTeam = _ballOwnerKey.split('_')[0];
    var ownerTok  = _tok(_ballOwnerKey);
    if(!ownerTok) return;

    // Compagni disponibili
    var teammates = [];
    ['1','2','3','4','5','6'].forEach(function(pk){
      var key = ownerTeam + '_' + pk;
      if(key === _ballOwnerKey) return;
      var tok = _tok(key);
      if(!tok || tok.expelled || tok.tempAbsent) return;
      teammates.push({key:key, tok:tok});
    });
    if(teammates.length === 0) return;

    var pick = teammates[Math.floor(Math.random() * teammates.length)];
    var recTok = pick.tok;

    // Calcola tempo di volo della palla (distanza / velocità palla)
    var ballSpd = BASE_SPD * 15.0;  // stessa costante di pool.js
    var dx = recTok.x - ownerTok.x, dy = recTok.y - ownerTok.y;
    var dist = Math.sqrt(dx*dx + dy*dy);
    var flightTime = dist / Math.max(ballSpd, 0.001);  // secondi

    // Posizione futura del ricevitore: dove sarà quando la palla arriva
    // (il ricevitore nuota verso il suo target corrente a velocità tok)
    var recSpd = (typeof poolGetTokenSpeeds==='function'
      ? (poolGetTokenSpeeds()[pick.key] || BASE_SPD)
      : BASE_SPD);
    var tdx = recTok.tx - recTok.x, tdy = recTok.ty - recTok.y;
    var tdist = Math.sqrt(tdx*tdx + tdy*tdy);
    var futX, futY;
    if(tdist < 0.01) {
      // Ricevitore già fermo: palla va sulla sua posizione attuale
      futX = recTok.x; futY = recTok.y;
    } else {
      // Anticipa: posizione = pos_attuale + vel * flightTime (capped a target)
      var moveFrac = Math.min(1, (recSpd * flightTime) / tdist);
      futX = recTok.x + tdx * moveFrac;
      futY = recTok.y + tdy * moveFrac;
    }

    // Aggiungi piccolo jitter
    futX += _rnd(-0.012, 0.012);
    futY += _rnd(-0.008, 0.008);

    // Libera il possesso
    _ballOwnerKey = null;
    if(typeof poolReleaseBall === 'function') poolReleaseBall();

    // Ferma il ricevitore: il suo target diventa la posizione futura calcolata
    // così si ferma ad aspettare la palla invece di continuare a nuotare via
    if(typeof poolMoveToken === 'function')
      poolMoveToken(pick.key, futX + _rnd(-0.008, 0.008), futY + _rnd(-0.006, 0.006));

    // Lancia la palla verso la posizione futura
    if(typeof poolMoveBallDirect === 'function')
      poolMoveBallDirect(futX, futY);

    // Salva posizione di lancio per il cooldown (la palla deve percorrere almeno 40% prima di essere raccolta)
    var lBall = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:ownerTok.x, y:ownerTok.y};
    var _tdx = futX - lBall.x, _tdy = futY - lBall.y;
    _pendingReceiver = {
      key: pick.key, team: ownerTeam,
      startX: lBall.x, startY: lBall.y,
      totalDist: Math.max(0.02, Math.sqrt(_tdx*_tdx + _tdy*_tdy)),
      ready: false,
    };
  }

  // ── Pressione sul possessore avversario ───────────────────────
  // 1-2 difensori si avvicinano a chi ha la palla
  function _applyPressure() {
    if(!_ballOwnerKey)return;
    var ownerTeam=_ballOwnerKey.split('_')[0];
    var defTeam=ownerTeam==='my'?'opp':'my';
    var ownerTok=_tok(_ballOwnerKey);
    if(!ownerTok)return;
    var bx=ownerTok.x,by=ownerTok.y;

    // Scegli i 2 difensori più vicini della squadra avversaria
    var candidates=[];
    ['1','2','3','4','5','6'].forEach(function(pk){
      var key=defTeam+'_'+pk;
      var tok=_tok(key);
      if(!tok||tok.expelled)return;
      var d=_dist(tok.x,tok.y,bx,by);
      candidates.push({key:key,tok:tok,d:d});
    });
    candidates.sort(function(a,b){return a.d-b.d;});

    // Il difensore più vicino pressa (si avvicina a ~0.10 dal possessore)
    if(candidates[0]){
      var p=candidates[0];
      var angle=Math.atan2(p.tok.y-by,p.tok.x-bx);
      var pressDist=0.09+_rnd(-0.01,0.01);
      var px=_clamp(bx+Math.cos(angle)*pressDist,0.12,0.88);
      var py=_clamp(by+Math.sin(angle)*pressDist,0.13,0.87);
      poolMoveToken(p.key,px,py);
      if(typeof poolSetPressTarget==='function')poolSetPressTarget(p.key);
      _pressTarget=p.key;
    }

    // Il secondo difensore copre lo spazio vicino (pressione a zona)
    if(candidates[1]){
      var p2=candidates[1];
      var angle2=Math.atan2(p2.tok.y-by,p2.tok.x-bx);
      var pd2=0.16+_rnd(-0.02,0.02);
      poolMoveToken(p2.key,
        _clamp(bx+Math.cos(angle2)*pd2,0.12,0.88),
        _clamp(by+Math.sin(angle2)*pd2,0.13,0.87));
    }
  }

  // ── API pubblica ──────────────────────────────────────────────

  function init(ms) {
    _ms=ms;_active=true;_phase='idle';_attack='my';
    _ballOwnerKey=null;_pressTarget=null;_microPhase={};
    _tacticalT=0;_passT=0;_passNext=_rnd(1.5,2.5);
    _prevSup=false;_prevInf=false;
    _pendingReceiver=null;
    _seq=[];_seqActive=false;
  }

  function stop(){_active=false;_ms=null;_seq=[];_seqActive=false;}

  // dt = secondi REALI (non moltiplicati per speed)
  // Traccia lo stato precedente per rilevare cambiamenti
  var _prevSup = false, _prevInf = false;

  function update(dt) {
    if(!_active||!_ms)return;
    var canRun=_ms.running||_phase==='goal_cel'||_phase==='kickoff_after'||_phase==='penalty';
    if(!canRun)return;

    var gameSpeed = _ms.speed || 1;

    if(_seqActive){_tickSeq(dt);return;}

    if(_phase==='play'){
      var curSup = !!_ms.superiorityActive;
      var curInf = !!_ms.inferiorityActive;

      // Riposiziona quando la superiorità/inferiorità TERMINA (ritorno a parità)
      if(_prevSup && !curSup) {
        _repositionAll(0.025);
        _passT=0; _passNext=_rnd(1.5,2.5);
      }
      if(_prevInf && !curInf) {
        _repositionAll(0.025);
      }
      _prevSup = curSup;
      _prevInf = curInf;

      var eff = dt * gameSpeed;
      _tacticalT += eff;
      _tickMicro(eff);

      if(_tacticalT >= TACTICAL_INT){
        _tacticalT = 0;
        _updateAllTargets(dt);
      }

      _applyPressure();

      // ── Fix 4: assegna possesso quando palla arriva fisicamente al ricevitore ──
      // _pendingReceiver.minDist = distanza minima che la palla deve percorrere
      //   prima di poter essere raccolta (evita assegnazione immediata)
      if(_pendingReceiver) {
        var recTok = _tok(_pendingReceiver.key);
        if(recTok && !recTok.expelled) {
          var ballPos = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:0.5,y:0.5};

          // Aggiorna la distanza minima percorsa dalla palla
          if(_pendingReceiver.startX !== undefined) {
            var sdx = ballPos.x - _pendingReceiver.startX;
            var sdy = ballPos.y - _pendingReceiver.startY;
            var traveled = Math.sqrt(sdx*sdx + sdy*sdy);
            // Pronto a raccogliere solo dopo aver percorso almeno il 40% della distanza totale
            _pendingReceiver.ready = (traveled >= _pendingReceiver.totalDist * 0.40);
          }

          if(_pendingReceiver.ready) {
            var prDx = recTok.x - ballPos.x, prDy = recTok.y - ballPos.y;
            var prDist = Math.sqrt(prDx*prDx + prDy*prDy);
            if(prDist < 0.060) {
              _ballOn(_pendingReceiver.key);
              _attack = _pendingReceiver.team;
              _pendingReceiver = null;
            }
          }
        } else {
          _pendingReceiver = null;
        }
      }

      if(_ballOwnerKey){
        _passT += eff;
        if(_passT >= _passNext) _autoPass();
      }

      if(typeof poolUpdateKeepers==='function')poolUpdateKeepers();
    }
  }

  // ── 1. INIZIO PERIODO ─────────────────────────────────────────
  function onPeriodStart() {
    _phase='idle';_seq=[];_seqActive=false;_ballOwnerKey=null;
    _microPhase={};_tacticalT=0;_passT=0;_passNext=_rnd(1.5,2.5);
    _pendingReceiver=null;
    if(typeof poolStartPeriod==='function')poolStartPeriod();
  }

  // ── SPRINT KICKOFF ────────────────────────────────────────────
  function onSprintStart(prevSpeed) {
    if(_phase!=='idle')return;
    _phase='sprint';_seq=[];_seqActive=false;
    _myCBSpd=_spd('6','my');_oppCBSpd=_spd('6','opp');

    var myK=typeof poolGetKickoffPos==='function'?poolGetKickoffPos('my','6'):{x:0.13,y:CY};
    var opK=typeof poolGetKickoffPos==='function'?poolGetKickoffPos('opp','6'):{x:0.87,y:CY};
    var myETA=_dist(myK.x,myK.y,CX,CY)/Math.max(_myCBSpd,0.001);
    var opETA=_dist(opK.x,opK.y,CX,CY)/Math.max(_oppCBSpd,0.001);

    if(Math.abs(myETA-opETA)<0.3){
      var myM=_getCBMorale('my'),opM=_getCBMorale('opp');
      _cbWinner=Math.abs(myM-opM)<5?(Math.random()<0.5?'my':'opp'):(myM>=opM?'my':'opp');
    } else { _cbWinner=myETA<=opETA?'my':'opp'; }

    var winDist=_cbWinner==='my'?_dist(myK.x,myK.y,CX,CY):_dist(opK.x,opK.y,CX,CY);
    var winSpd=_cbWinner==='my'?_myCBSpd:_oppCBSpd;
    var sprintDur=Math.max(winDist/Math.max(winSpd,0.001),1.5);

    // Tutti nuotano in linea retta verso la porta avversaria (ognuno sulla sua corsia)
    // Manteniamo la y originale di kickoff: nuotata parallela, non convergente
    ['1','2','3','4','5'].forEach(function(pk){
      var myKick  = KICKOFF_MY[pk]  || {x:0.13, y:0.50};
      var oppKick = KICKOFF_OPP[pk] || {x:0.87, y:0.50};
      // Target a centrocampo sulla stessa y di partenza (linea retta)
      _mv('my_'+pk,  CX - 0.10 + _rnd(-0.03,0.03), myKick.y  + _rnd(-0.02,0.02));
      _mv('opp_'+pk, CX + 0.10 + _rnd(-0.03,0.03), oppKick.y + _rnd(-0.02,0.02));
    });
    _mv('my_6',  CX-0.015, CY);
    _mv('opp_6', CX+0.015, CY);

    _qA(sprintDur, function(){_ballOn(_cbWinner+'_6');});
    _qA(sprintDur+0.3, function(){
      if(typeof poolReleaseBall==='function')poolReleaseBall();
      var tar3=_cbWinner==='my'?ATK_MY['3']:ATK_OPP['3'];
      var tX3=tar3.x+_rnd(-0.02,0.02), tY3=tar3.y+_rnd(-0.02,0.02);
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(tX3,tY3);
      // Usa pendingReceiver con dati di lancio per il cooldown
      var lb3=typeof poolGetBallPos==='function'?poolGetBallPos():{x:CX,y:CY};
      var d3x=tX3-lb3.x, d3y=tY3-lb3.y;
      _pendingReceiver={key:_cbWinner+'_3',team:_cbWinner,
        startX:lb3.x,startY:lb3.y,
        totalDist:Math.max(0.02,Math.sqrt(d3x*d3x+d3y*d3y)),ready:false};
    });
    _qA(sprintDur+0.8, function(){
      _repositionAll(0.025);_phase='play';_tacticalT=0;_microPhase={};
      if(prevSpeed&&typeof setSpeed==='function')setSpeed(prevSpeed);
    });
    _startSeq();
  }

  // ── GOAL ──────────────────────────────────────────────────────
  function onGoalEvent(event) {
    var scorerTeam=event.goalTeam||'my';
    var scorerKey=event.moverKey||(scorerTeam+'_3');
    if(typeof poolReleaseBall==='function')poolReleaseBall();
    _ballOwnerKey=null;
    if(event.ballTarget&&typeof poolMoveBallDirect==='function')
      poolMoveBallDirect(event.ballTarget.x,event.ballTarget.y);

    _phase='goal_cel';_seq=[];_seqActive=false;

    _qA(0.5, function(){
      if(typeof poolTriggerGoalAnim==='function'){
        var tn=scorerTeam==='my'?(_ms&&_ms.myTeam?_ms.myTeam.name:''):(_ms&&_ms.oppTeam?_ms.oppTeam.name:'');
        poolTriggerGoalAnim(event.goalScorer||'',scorerTeam,tn);
      }
      showGoalAnimation(event.goalScorer||'',scorerTeam,_ms);
      // Compagni corrono verso il marcatore
      var st=_tok(scorerKey);
      var sx=st?st.tx:CX,sy=st?st.ty:CY;
      ['1','2','3','4','5','6'].forEach(function(pk){
        var k=scorerTeam+'_'+pk;if(k===scorerKey)return;
        var t2=_tok(k);if(!t2||t2.expelled)return;
        _mv(k,sx+_rnd(-0.07,0.07),sy+_rnd(-0.06,0.06));
      });
    });

    _qA(3.0, function(){
      // Rimessa: chi ha subito batte dal centro
      var batter=scorerTeam==='my'?'opp':'my';
      var myL=batter==='my'?RESET_MY_ATK:RESET_MY_DEF;
      var opL=batter==='my'?RESET_OPP_DEF:RESET_OPP_ATK;
      ['GK','1','2','3','4','5','6'].forEach(function(pk){
        if(myL[pk])_mv('my_'+pk,myL[pk].x,myL[pk].y,0.01);
        if(opL[pk])_mv('opp_'+pk,opL[pk].x,opL[pk].y,0.01);
      });
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(CX,CY);
      _phase='kickoff_after';
    });

    _qA(3.8, function(){
      var batter=scorerTeam==='my'?'opp':'my';
      _ballOn(batter+'_6');
    });

    _qA(4.2, function(){
      var batter=scorerTeam==='my'?'opp':'my';
      if(typeof poolReleaseBall==='function')poolReleaseBall();
      var tar3=batter==='my'?ATK_MY['3']:ATK_OPP['3'];
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(tar3.x+_rnd(-0.02,0.02),tar3.y+_rnd(-0.02,0.02));
      setTimeout(function(){
        _ballOn(batter+'_3');
        _attack=batter;
        _repositionAll(0.022);
        _phase='play';_tacticalT=0;_microPhase={};
      },350);
    });

    _startSeq();
  }

  // ── TIRO ──────────────────────────────────────────────────────
  function onShot(event) {
    if(!event||!event.ballTarget)return;
    if(event.moverKey)_ballOn(event.moverKey);
    setTimeout(function(){
      if(typeof poolReleaseBall==='function')poolReleaseBall();
      _ballOwnerKey=null;
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(event.ballTarget.x,event.ballTarget.y);
      if(event.moverKey&&event.moverTarget)_mv(event.moverKey,event.moverTarget.x,event.moverTarget.y,0.015);
    },230);
  }

  // ── PARATA ────────────────────────────────────────────────────
  function onSave(event) {
    if(!event||!event.ballTarget)return;
    if(typeof poolReleaseBall==='function')poolReleaseBall();
    _ballOwnerKey=null;
    if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(event.ballTarget.x,event.ballTarget.y);

    var gkTeam=event.ballTarget.x<CX?'my':'opp';
    setTimeout(function(){
      _ballOn(gkTeam+'_GK');
      setTimeout(function(){
        if(typeof poolReleaseBall==='function')poolReleaseBall();
        _ballOwnerKey=null;
        var tar3=gkTeam==='my'?ATK_MY['3']:ATK_OPP['3'];
        if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(tar3.x+_rnd(-0.05,0.05),tar3.y+_rnd(-0.04,0.04));
        setTimeout(function(){
          _ballOn(gkTeam+'_3');
          _attack=gkTeam;
          _repositionAll(0.022);
        },350);
      },650);
    },700);
  }

  // ── PASSAGGIO / NEUTRO ────────────────────────────────────────
  function onPassOrNeutral(event) {
    if(!event||!event.ballTarget)return;
    var bx=event.ballTarget.x,by=event.ballTarget.y;
    var team=bx>CX?'my':'opp';
    var closest=_findClosestToken(team,bx,by);
    if(typeof poolReleaseBall==='function')poolReleaseBall();
    _ballOwnerKey=null;
    if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(bx,by);
    if(closest){
      setTimeout(function(){
        _ballOn(closest);
        _attack=team;
      },280);
    }
  }

  // ── RIGORE ────────────────────────────────────────────────────
  function onPenaltyKick(shooterTeam,isGoal,shooterPk) {
    _phase='penalty';_seq=[];_seqActive=false;
    var pk=shooterPk||'6',sTeam=shooterTeam||'my';
    var penX=sTeam==='my'?0.86:0.14;
    var gkKey=sTeam==='my'?'opp_GK':'my_GK';
    var gkX=sTeam==='my'?0.89:0.11;

    _qA(0,function(){_mv(sTeam+'_'+pk,penX,CY);_mv(gkKey,gkX,CY);_ballOn(sTeam+'_'+pk);});
    _qA(1.0,function(){
      if(typeof poolReleaseBall==='function')poolReleaseBall();_ballOwnerKey=null;
      var ty=_rnd(OPP_GOAL_Y0+0.04,OPP_GOAL_Y1-0.04);
      if(isGoal){if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(sTeam==='my'?0.96:0.04,ty);}
      else{if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(gkX+(sTeam==='my'?-0.02:0.02),CY+_rnd(-0.05,0.05));setTimeout(function(){_ballOn(gkKey);},400);}
    });
    _qA(isGoal?2.0:1.5,function(){
      _attack=isGoal?(sTeam==='my'?'opp':'my'):sTeam;
      _repositionAll(0.022);_phase='play';_tacticalT=0;_microPhase={};
    });
    _startSeq();
  }

  // ── CAMBIO POSSESSO ───────────────────────────────────────────
  function onPossessChange(team) {
    _attack=team;
    if(_phase==='play')_repositionAll(0.022);
  }

  // Chiamato quando scatta superiorità o inferiorità numerica
  function onNumericalChange(type) {
    if (!_ms) return;
    if (type === 'inferiority') {
      // Alterna lo schema difensivo ad ogni episodio
      _infDefStyle = (_infDefStyle === 'press') ? 'zonam' : 'press';
    }
    // Riposiziona immediatamente tutte le squadre
    if (_phase === 'play') {
      _repositionAll(0.018);
      // Resetta i passaggi automatici: la palla va al centro della superiorità
      _passT = 0;
      _passNext = _rnd(1.5, 2.5);
    }
  }

  // ── Riposizionamento tattico completo ─────────────────────────
  // Restituisce le formazioni corrette in base allo stato di gioco
  function _getFormations() {
    var sup = _ms && _ms.superiorityActive;
    var inf = _ms && _ms.inferiorityActive;
    // Sceglie difesa avversaria in inferiorità: alterna pressing/zonaM casualmente
    var oppDef5 = (_infDefStyle === 'zonam') ? INF_DEF_MY_ZONAM : INF_DEF_MY_PRESS;

    if (sup) {
      // Noi in superiorità: attacchiamo in 4-2, loro difendono in 5
      return {
        myAtk:  SUP_ATK_MY_42,
        myDef:  DEF_MY,             // non usata (siamo in attacco)
        oppAtk: ATK_OPP,            // non usata (loro difendono)
        oppDef: SUP_DEF_OPP_PRESS,  // 5 difensori in pressing
      };
    } else if (inf) {
      // Noi in inferiorità: difendiamo in 5, loro attaccano in 4-2
      return {
        myAtk:  ATK_MY,             // non usata (noi difendiamo)
        myDef:  oppDef5,            // pressing o zona M con 5 giocatori
        oppAtk: INF_ATK_OPP_42,     // avversario attacca in 4-2
        oppDef: DEF_OPP,            // non usata
      };
    } else {
      return { myAtk: ATK_MY, myDef: DEF_MY, oppAtk: ATK_OPP, oppDef: DEF_OPP };
    }
  }

  function _repositionAll(jit) {
    jit = jit || 0.020;
    var f = _getFormations();
    var sup = _ms && _ms.superiorityActive;
    var inf = _ms && _ms.inferiorityActive;
    var ALL = ['GK','1','2','3','4','5','6'];
    ALL.forEach(function(pk) {
      // In superiorità pos4 avversario è assente (espulso) → salta
      if (sup && pk === '4') {
        // Non muoviamo opp_4 (è fuori campo)
        var mb = f.myAtk[pk] || (f.myDef[pk]);
        if (mb) _mv('my_'+pk, mb.x, mb.y, pk==='GK'?0:jit);
        return;
      }
      // In inferiorità pos4 nostra è assente → salta
      if (inf && pk === '4') {
        var ob2 = _attack==='opp' ? f.oppAtk[pk] : f.oppDef[pk];
        if (ob2) _mv('opp_'+pk, ob2.x, ob2.y, pk==='GK'?0:jit);
        return;
      }
      var mb = _attack==='my' ? f.myAtk[pk] : f.myDef[pk];
      var ob = _attack==='opp' ? f.oppAtk[pk] : f.oppDef[pk];
      if (mb) _mv('my_'+pk,  mb.x, mb.y, pk==='GK'?0:jit);
      if (ob) _mv('opp_'+pk, ob.x, ob.y, pk==='GK'?0:jit);
    });
    if (typeof poolUpdateKeepers==='function') poolUpdateKeepers();
  }

  // ── Helpers ───────────────────────────────────────────────────
  function _getCBMorale(team) {
    if(!_ms)return 50;
    if(team==='my'){var pi=_ms.onField?_ms.onField['6']:undefined;if(pi!==undefined&&_ms.myRoster&&_ms.myRoster[pi])return _ms.myRoster[pi].morale||50;}
    return 50;
  }

  function _findClosestToken(team,bx,by) {
    if(typeof poolGetTokens!=='function')return null;
    var toks=poolGetTokens();if(!toks)return null;
    var best=null,bestD=999;
    ['1','2','3','4','5','6'].forEach(function(pk){
      var key=team+'_'+pk,tok=toks[key];
      if(!tok||tok.expelled)return;
      var d=_dist(tok.x,tok.y,bx,by);
      if(d<bestD){bestD=d;best=key;}
    });
    return best;
  }

  // ── Esportazione ──────────────────────────────────────────────
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
    onPossessChange:     onPossessChange,
    onNumericalChange:   onNumericalChange,
  };

})();

window.MovementController = MovementController;
