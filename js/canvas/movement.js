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

  // ── Mappatura marcatura a uomo (speculare del semicerchio) ───────────────
  // Chi attacca in pos X difende sull'avversario che occupa posX_OPPONENT.
  // Il semicerchio è simmetrico: ali si fronteggiano, laterali si fronteggiano,
  // CB marca il C avversario e viceversa.
  //   pos1 (ala sx/bassa) ↔ opp pos5 (ala sx/bassa avv)
  //   pos2 (laterale sx)  ↔ opp pos4 (laterale sx avv)
  //   pos3 (C centrov.)   ↔ opp pos6 (CB centroboa avv)  ← già gestito separatamente
  //   pos4 (laterale dx)  ↔ opp pos2 (laterale dx avv)
  //   pos5 (ala dx/alta)  ↔ opp pos1 (ala dx/alta avv)
  //   pos6 (CB centroboa) ↔ opp pos3 (C centrov. avv)   ← già gestito separatamente
  var MARK_OPP_FOR_MY = {'1':'5','2':'4','4':'2','5':'1','6':'3'};  // my_pk difende su opp_MARK[pk]
  var MARK_MY_FOR_OPP = {'1':'5','2':'4','4':'2','5':'1','6':'3'};  // opp_pk difende su my_MARK[pk]

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
  var _phase       = 'idle';
  var _attack      = 'my';
  var _ballOwnerKey= null;
  var _pressTarget = null;
  var _gameSpeed   = 1;   // velocita' di gioco corrente (per calcolare i tempi di volo)

  // Timer aggiornamenti tattici
  var _tacticalT   = 0;
  var TACTICAL_INT = 0.8;

  // Timer passaggio automatico
  var _passT    = 0;
  var _passNext = 0;

  // ── Shot clock (30s regolamentari) ────────────────────────────
  var SHOT_CLOCK_MAX = 30.0;
  var _shotClock     = 0;   // secondi di possesso dell'azione corrente

  // ── Giocatore libero → nuota verso porta ──────────────────────
  // Se nessun avversario entro FREE_PLAYER_DIST, il possessore avanza
  var FREE_PLAYER_DIST = 0.10;  // ~3m proporzionali

  // Micro-oscillazione: ogni giocatore ha una fase individuale
  var _microPhase  = {};    // key → float 0..2π
  var MICRO_AMP    = 0.022; // ampiezza oscillazione laterale

  // Coda azioni sequenziali (per sprint, rimessa, rigore)
  var _seq=[], _seqT=0, _seqIdx=0, _seqActive=false;

  // ── Eventi in attesa durante una cinetica ────────────────────────────────
  // Le cinetiche (gol, rimessa, rigore) riportano la fase a 'play' con un
  // passo della coda _seq. Un evento che arriva nel mezzo non deve svuotare
  // quella coda: se lo facesse, il passo di ripristino andrebbe perso, la
  // fase resterebbe 'goal_cel' per il resto della partita e le pedine
  // congelerebbero mentre la telecronaca continuerebbe a scorrere.
  // L'evento viene quindi accodato e riprodotto quando il gioco riprende.
  var _deferred = [];
  var DEFERRED_MAX = 12;

  // true se una cinetica e' in corso: la fase non e' 'play' e nessun
  // passaggio automatico deve partire.
  // 'sprint' e' una cinetica come le altre: durante il rimpetto agli occhi un
  // evento che azzera la coda (onShot, onSave, ...) cancella il passo che
  // riporta la fase a 'play'. Il campo resterebbe fermo per tutta la partita
  // mentre gli eventi continuano ad essere elencati. Quindi si differisce
  // anche durante il rimpetto. 'idle' resta fuori: e' l'intervallo, e la coda
  // di eventi viene comunque svuotata a inizio tempo.
  function _inCinematic(){ return _phase!=='play' && _phase!=='idle'; }

  function _deferEvent(fn,args){
    // Non accumulare senza limite: se la partita resta ferma a lungo
    // (intervallo, partita sospesa) gli eventi in attesa non servono piu'.
    if(_deferred.length>=DEFERRED_MAX)_deferred.shift();
    _deferred.push({fn:fn,args:Array.prototype.slice.call(args)});
  }

  function _dropDeferred(){ _deferred.length=0; }

  // Riproduce gli eventi accodati. Va chiamato solo quando la fase e'
  // tornata 'play' e nessuna coda e' attiva: un evento riprodotto puo'
  // infatti avviare una nuova cinetica.
  function _drainDeferred(){
    if(_phase!=='play'||_seqActive||_deferred.length===0)return false;
    var q=_deferred; _deferred=[];
    for(var i=0;i<q.length;i++){
      if(_inCinematic()){ // un evento ha avviato una cinetica: il resto aspetta
        _deferred=q.slice(i); return true;
      }
      try{ q[i].fn.apply(null,q[i].args); }catch(e){}
    }
    return true;
  }


  // ── Telecronaca canvas-driven ───────────────────────────────────────────
  // Chiama dispatchCommentary() ogni volta che avviene un'azione visibile.
  // Il commento appare esattamente nel frame in cui l'azione è eseguita.
  // Solo eventi significativi: passaggi saltuari (1/3), tiri, goal, intercetti.
  var _commentaryPassCount   = 0;   // conta i passaggi per commentarne solo 1 ogni 3
  var _freeAdvanceCooldown   = 0;   // cooldown globale tra commenti 'libero' (s di gioco)
  var FREE_ADVANCE_CD_SEC    = 4.0; // almeno 4s tra un commento e l'altro

  function _emitComment(type, data) {
    try {
      if (typeof dispatchCommentary === 'function') {
        dispatchCommentary(type, data || {});
      }
    } catch(e) {
      // Mai interrompere il flusso di gioco per un errore di telecronaca
    }
  }

  // CB vincitore dello sprint
  var _cbWinner='my', _myCBSpd=BASE_SPD, _oppCBSpd=BASE_SPD;
  // Stile difesa in inferiorità: alterna pressing/zonaM a ogni episodio
  var _infDefStyle = 'press';
  // Cooldown tiro CB (evita tiri consecutivi troppo rapidi)
  var _cbShotCooldown = false;

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

  // ── Eventi di palla: GOL e FUORI, decisi dalla geometria ───────────
  // Chiamato da pool.js quando la palla ha davvero superato una linea.
  // Qui non si guarda "dove doveva andare": si registra quello che e' successo.
  var _shotShooterKey = null;   // chi ha tirato (per la telecronaca)
  var _shotShooterName = '';
  var _outPending     = null;   // rimessa in corso dopo un "fuori"

  function _onBallEvent(ev) {
    if(!ev) return;
    if(ev.type === 'goal') _onScoredGoal(ev);
    else if(ev.type === 'out') _onBallOut(ev);
    else if(ev.type === 'save') _onKeeperSave(ev);
  }

// ── PARATA: il portiere ha intercettato il tiro davvero ────────────
  // La geometria ha stabilito che il tiro e' passato dove il portiere
  // poteva arrivare. Da qui si usa ilGestioneParata gia' esistente, che
  // distingue i due casi che l'utente ha descritto: il portiere arriva in
  // tempo e blocca tenendo la palla, oppure non arriva e la palla resta nei
  // dintorni della porta, dove se la contendono i due piu' vicini per
  // squadra (la corsa alla palla libera gia' esistente).
  function _onKeeperSave(ev) {
    onSave({
      shotTeam: ev.team,
      ballTarget: { x: ev.x, y: ev.y },
    });
  }

  // ── GOL: la palla e' dentro la porta. Qui si segna e si festeggia ─────
  function _onScoredGoal(ev) {
    var team  = ev.team;                       // squadra che segna
    var other = team==='my' ? 'opp' : 'my';
    var shooterName = _shotShooterName || '';

    // Il tiro non e' piu' un tiro: niente intercettazioni in corso.
    _pendingReceiver = null;
    _ballOwnerKey = null;

    if(_ms) {
      if(team==='my'){
        _ms.myScore++;
        if(_ms.periodScores&&_ms.period>=1&&_ms.period<=4) _ms.periodScores[_ms.period-1].my++;
        var sc = _shotShooterKey ? _tok(_shotShooterKey) : null;
        var spi = sc ? sc.pi : undefined;
        if(spi===undefined){
          // Il tiro e' entrato in porta senza un tirante registrato: per
          // esempio un tiro lanciato mentre la palla viaggiava verso un altro
          // giocatore, cosi' il nome si era gia' perso. Il gol e' reale e non
          // puo' sparire dai tabelloni, quindi si attribuisce al giocatore in
          // campo piu' vicino alla palla, che e' l'autore piu' probabile.
          var bp = (typeof poolGetBallPos==='function') ? poolGetBallPos() : {x:CX, y:CY};
          var bd = 1e9;
          for(var pk0 in _ms.onField){
            var aPi0 = _ms.onField[pk0];
            if(aPi0===undefined) continue;
            if(_ms.myRoster && _ms.myRoster[aPi0] && _ms.myRoster[aPi0].role==='POR') continue;
            var t0 = _tok('my_'+pk0);
            if(!t0) continue;
            var d0 = (t0.x-bp.x)*(t0.x-bp.x) + (t0.y-bp.y)*(t0.y-bp.y);
            if(d0<bd){ bd=d0; spi=aPi0; }
          }
        }
        if(spi!==undefined) {
          if(_ms.matchGoals) _ms.matchGoals[spi] = (_ms.matchGoals[spi]||0)+1;
          // Assistente: il compagno piu' probabile, pesato sulla tecnica. Va
          // contato qui perche' il gol ora nasce dalla geometria e non da un
          // evento che portava gia' dentro l'assistenza.
          if(_ms.matchAssists && _ms.myRoster && _ms.onField){
            var best=null, bw=-1;
            for(var pk in _ms.onField){
              var aPi=_ms.onField[pk];
              if(aPi===spi || aPi===undefined) continue;
              var p=_ms.myRoster[aPi];
              if(!p || p.role==='POR') continue;
              var w=0.5+((p.stats&&p.stats.tec)||50)/200;
              if(w>bw){ bw=w; best=aPi; }
            }
            if(best!==null) _ms.matchAssists[best]=(_ms.matchAssists[best]||0)+1;
          }
        }
      } else {
        _ms.oppScore++;
        if(_ms.periodScores&&_ms.period>=1&&_ms.period<=4) _ms.periodScores[_ms.period-1].opp++;
      }
    }

    _phase = 'goal_cel';
    _seq=[]; _seqActive=false;
    var tn = team==='my' ? ((_ms&&_ms.myTeam&&_ms.myTeam.name)||'')
                         : ((_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'');

    // Punto e telecronaca nello stesso istante. Prima il punto veniva
    // segnato qui e l'annuncio arrivava mezzo secondo dopo, dentro la coda:
    // per qualche frame la telecronaca diceva gol mentre il punteggio era
    // ancora quello di prima.
    _emitComment(team==='my'?'goal_my':'goal_opp', { scorer:shooterName, team:tn });

    // Festeggiamento e rimessa: la stessa sequenza che c'era prima, ma
    // adesso parte quando la palla entra davvero in rete.
    _qA(0.5, function(){
      if(typeof poolTriggerGoalAnim==='function') poolTriggerGoalAnim(shooterName, team, tn);
      if(typeof showGoalAnimation==='function') showGoalAnimation(shooterName, team, _ms);
      var st = _shotShooterKey ? _tok(_shotShooterKey) : null;
      var sx = st ? st.tx : CX, sy = st ? st.ty : CY;
      ['1','2','3','4','5','6'].forEach(function(pk){
        var k = team+'_'+pk;
        if(k === _shotShooterKey) return;
        var t2 = _tok(k); if(!t2 || t2.expelled) return;
        _mv(k, sx+_rnd(-0.07,0.07), sy+_rnd(-0.06,0.06));
      });
    });

    _qA(3.0, function(){
      var batter = team==='my' ? 'opp' : 'my';
      var myL = batter==='my' ? RESET_MY_ATK : RESET_MY_DEF;
      var opL = batter==='my' ? RESET_OPP_DEF : RESET_OPP_ATK;
      ['GK','1','2','3','4','5','6'].forEach(function(pk){
        if(myL[pk]) _mv('my_'+pk, myL[pk].x, myL[pk].y, 0.01);
        if(opL[pk]) _mv('opp_'+pk, opL[pk].x, opL[pk].y, 0.01);
      });
      if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(CX,CY);
      _phase='kickoff_after';
    });

    _qA(3.8, function(){
      var batter = team==='my' ? 'opp' : 'my';
      _ballOn(batter+'_6');
    });

    _qA(4.55, function(){
      var batter = team==='my' ? 'opp' : 'my';
      if(typeof poolReleaseBall==='function') poolReleaseBall();
      var tar3 = batter==='my' ? ATK_MY['3'] : ATK_OPP['3'];
      if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(tar3.x+_rnd(-0.02,0.02), tar3.y+_rnd(-0.02,0.02));
      _ballOn(batter+'_3');
      _attack=batter;
      _repositionAll(0.022);
      _phase='play'; _tacticalT=0; _microPhase={};
      _shotShooterKey=null; _shotShooterName='';
    });

    _startSeq();
  }

  // ── FUORI: la palla ha superato la linea rossa ─────────────────────
  // La palla e' gia' ferma sul punto in cui e' uscita (pool.js l'ha fermata
  // li'). La pedina piu' vicina della squadra che NON ha tirato fuori va a
  // prenderla e la rimette in gioco: e' la battuta.
  function _onBallOut(ev) {
    _pendingReceiver = null;
    _ballOwnerKey = null;
    _outPending = null;
    // La battuta si fa solo se la partita sta giocando. Durante un
    // festeggiamento o un rigore la palla fuori la rimette chi gestisce la
    // cinetica, non questo ramo: altrimenti due rimesse si sovrapponono.
    if(_phase !== 'play' && _phase !== 'kickoff_after' && _phase !== 'sprint') return;

    var shooter = ev.team || null;             // squadra che ha causato l'uscita
    var inerte = shooter || 'my';              // se non si sa, resta con una
    var other  = inerte==='my' ? 'opp' : 'my';
    var bx = ev.x, by = ev.y;

    // Il giocatore piu' vicino alla palla fra le due squadre, escluso chi ha
    // tirato fuori: e' lui che va a battere.
    var best=null, bestD=999;
    Object.keys(_tokens).forEach(function(k){
      var t=_tokens[k];
      if(!t || t.expelled || t.tempAbsent || t.isGK) return;
      if(k.indexOf(inerte+'_')===0) return;    // non chi ha tirato fuori
      var d=_dist(t.x,t.y,bx,by);
      if(d<bestD){bestD=d;best=t;}
    });

    _emitComment('ball_out', { team: other==='my'
      ? ((_ms&&_ms.myTeam&&_ms.myTeam.name)||'')
      : ((_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'') });

    if(!best) { _ballOwnerKey=null; return; }

    // Va sul punto d'uscita e rimette in gioco da li'.
    var bkey = best.team+'_'+best.pk;
    poolMoveToken(bkey, bx, by);
    _outPending = { key:bkey, x:bx, y:by, t:0 };
  }

  // ── Battuta dopo un "fuori": la rimessa in gioco ────────────────────
  function _updateThrowIn(dt) {
    if(!_outPending) return;
    var tok = _tok(_outPending.key);
    if(!tok || tok.expelled || tok.tempAbsent){ _outPending=null; return; }
    // Finche' non arriva sul punto, la palla resta ferma li'.
    if(_dist(tok.x,tok.y,_outPending.x,_outPending.y) > 0.06){
      poolMoveToken(_outPending.key, _outPending.x, _outPending.y);
      return;
    }
    // Arrivato: prende la palla e la rimette in gioco verso un compagno.
    var k=_outPending.key, team=k.split('_')[0];
    _ballOn(k);
    var mate=null, mD=999;
    ['1','2','3','4','5','6'].forEach(function(pk){
      if(k===team+'_'+pk) return;
      var t=_tok(team+'_'+pk);
      if(!t||t.expelled||t.tempAbsent) return;
      var d=_dist(t.x,t.y,tok.x,tok.y);
      if(d<mD){mD=d;mate=team+'_'+pk;}
    });
    if(!mate) mate = team+'_3';
    if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(mate ? 0.5 : 0.5, _rnd(0.42,0.58));
    _pendingReceiver = {
      key: mate, team: team,
      startX: tok.x, startY: tok.y,
      totalDist: Math.max(0.02, _dist(tok.x,tok.y,0.5,_ball.y)),
      ready: true, _landed:false, _landedGrace:0,
      _meetX: 0.5, _meetY: _rnd(0.42,0.58),
      _aimX: 0.5, _aimY: _ball.y, _intercettore: null,
    };
    poolMoveToken(mate, 0.5, _rnd(0.42,0.58));
    _attack = team;
    _outPending = null;
  }

  // ── Punto di arrivo di un passaggio ────────────────────────────
  // Un passaggio va "sulla nuotata": il ricevitore si muove mentre la palla
  // viaggia, quindi mirare dove si trova ORA fa arrivare la palla a vuoto.
  // Prima la palla veniva lanciata a (posizione attuale + rumore di 1.5cm) e
  // il ricevitore proseguiva verso la propria meta tattica: la palla
  // arrivava in acqua libera e il possesso finiva assegnato a caso.
  //
  // Restituisce dove mirare (lead) e l'esito del passaggio. Se il passaggio
  // fallisce l'errore supera il raggio di presa: e' un passaggio sbagliato, e
  // la palla resta in acqua perche' nessuno la prende.
  //
  //   arrivato  -> il ricevitore prende la palla
  //   fallito   -> palla libera, corsa dei piu' vicini

  // Larghezza del "corridoio" entro cui un difensore puo' leggere il
  // passaggio. Circa 1.5m: se e' piu' largo, con la marcatura a uomo tutti i
  // difensori risultano in linea e quasi ogni passaggio verrebbe dato per
  // intercettato.
  var INTERCEPT_WIDTH = 0.040;

  // ── Difensore in linea di passaggio ──────────────────────────────
  // Restituisce l'avversario meglio piazzato sulla traiettoria di un
  // passaggio, con la sua posizione lungo la linea (t) e quanto e' scarto
  // perpendicolare. Serve a stabilire se il passaggio puo' essere
  // intercettato: la domanda va posta UNA volta, al lancio.
  function _laneDefender(sx, sy, ex, ey, oppTeam) {
    var dx = ex-sx, dy = ey-sy;
    var len = Math.sqrt(dx*dx + dy*dy);
    if(len < 0.02) return null;              // passaggio troppo corto: niente lane
    var best = null;
    ['1','2','3','4','5','6'].forEach(function(pk){
      var tok = _tok(oppTeam+'_'+pk);
      if(!tok || tok.expelled || tok.tempAbsent) return;
      var vx = tok.x-sx, vy = tok.y-sy;
      var t = (vx*dx + vy*dy)/(len*len);
      // Solo la parte "centralmente" della traiettoria: un difensore
      // addosso al lanciatore o addosso al ricevitore non e' un
      // intercettore, e' solo il suo marcatore.
      if(t < 0.12 || t > 0.85) return;
      var perp = Math.abs(vx*dy - vy*dx)/len;
      if(perp > INTERCEPT_WIDTH) return;
      if(!best || perp < best.perp) best = { key: oppTeam+'_'+pk, t: t, perp: perp };
    });
    return best;
  }

  function _passAim(recKey, recTok, fromX, fromY) {
    var gs = _gameSpeed||1;
    // Velocita' della palla e del nuotatore, entrambe in unita'/secondo REALE
    var bSpd = (typeof poolGetBallSpeed==='function')
      ? poolGetBallSpeed(gs)
      : BASE_SPD*4*gs;
    var rSpd = _spd(recKey.split('_')[1], recKey.split('_')[0])*gs;

    var dist = _dist(fromX, fromY, recTok.x, recTok.y);
    var flightT = bSpd>0 ? dist/bSpd : 0;   // secondi reali di volo

    // Dove sara' il ricevitore tra flightT secondi: continua dritto verso il
    // suo target attuale, per un tratto limitato dalla distanza che deve
    // davvero percorrere.
    var leadX = recTok.x, leadY = recTok.y;
    var tdx = recTok.tx - recTok.x, tdy = recTok.ty - recTok.y;
    var td = Math.sqrt(tdx*tdx + tdy*tdy);
    if(td > 0.001) {
      var canGo = Math.min(td, rSpd*flightT);
      leadX += tdx/td*canGo;
      leadY += tdy/td*canGo;
    }

    // ── Esito del passaggio: lo colpisce o lo sbaglia ─────────────────
    // Un passaggio non e' mai perfetto. Se il ricevitore e' marcato stretto
    // il passatore rischia piu' di mandare la palla fuori bersaglio: in
    // quel caso la palla arriva in acqua, NON la prende nessuno, e la pedina
    // piu' vicina di ogni squadra si mette a nuotare per prenderla.
    //
    // L'errore e'|esplicito| e non una uniforme: con un errore uniforme
    // casuale la soglia di errore decideva tutto e i passaggi "sbagliati"
    // non capitavano mai. Qui l'esito e' deciso prima, quindi la frequenza
    // di passaggi persi e' controllata.
    var recTeam = recKey.split('_')[0];
    var oppT = recTeam==='my' ? 'opp' : 'my';
    var press = 9;
    ['1','2','3','4','5','6'].forEach(function(pk){
      var ot=_tok(oppT+'_'+pk);
      if(!ot||ot.expelled||ot.tempAbsent)return;
      var d=_dist(ot.x,ot.y,recTok.x,recTok.y);
      if(d<press)press=d;
    });
    // pressione 0..1: 0 = ricevitore libero, 1 = marcato a due spanne
    var pressione = press < 0.15 ? (0.15-press)/0.15 : 0;
    // Raggio di presa: sotto questa distanza il ricevitore prende la palla
    var CATCH = 0.060;
    var probFallire = _clamp(0.05 + pressione*0.22, 0, 0.35);   // 5%..27%
    var fallito = Math.random() < probFallire;
    // Se fallisce l'errore e' SEMPRE oltre il raggio di presa, cosi' la
    // palla finisce davvero in acqua e non torna addosso a una pedina.
    var err = fallito ? CATCH + _rnd(0.015, 0.070) : _rnd(0.004, 0.028);

    var aimX = leadX + _rnd(-err, err);
    var aimY = leadY + _rnd(-err, err);
    return { leadX: leadX, leadY: leadY, aimX: aimX, aimY: aimY,
             dist: dist, fallito: fallito };
  }

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
      // Oscillazione individuale per movimento continuo
      var phM = _microPhase['my_'+pk] || _rnd(0,Math.PI*2);
      _microPhase['my_'+pk] = phM;
      var phO = _microPhase['opp_'+pk] || _rnd(0,Math.PI*2);
      _microPhase['opp_'+pk] = phO;
      var oscX  = Math.sin(phM*1.1)*0.025, oscY  = Math.cos(phM*0.9)*0.020;
      var oscX2 = Math.sin(phO*1.1)*0.025, oscY2 = Math.cos(phO*0.9)*0.020;

      // ── NOSTRA SQUADRA ──
      var mKey='my_'+pk;
      if(inf && pk==='4') return;
      var mTok=_tok(mKey);
      // Un giocatore in corsa alla palla libera non viene riposizionato:
      // la corsa e' un obiettivo a breve termine e il riposizionamento
      // tattico lo annullerebbe proprio mentre lo sta vincendo.
      if(mTok && !mTok.expelled && !mTok._raceTo && pk!=='GK' && pk!=='3') {
        // pos6 in attacco: va alla sua posizione di attacco (CB attaccante)
        if(pk==='6') {
          if(_attack==='my') {
            var cb6Base = f.myAtk['6'];
            if(cb6Base && _ballOwnerKey!==mKey && !mTok._raceTo) poolMoveToken(mKey, cb6Base.x+oscX*0.3, cb6Base.y+oscY*0.3);
          }
          // In difesa: gestito dal blocco CB-marker
          return;
        }
        if(_attack==='my') {
          // In attacco: formazione semicerchio
          var base=f.myAtk[pk];
          if(base){var pushX=sup?0.010:0.018;
            if(_ballOwnerKey!==mKey && !mTok._raceTo) poolMoveToken(mKey,_clamp(base.x+oscX+pushX,0.11,0.89),_clamp(base.y+oscY,0.13,0.87));}
        } else {
          // In difesa: marcatura SPECULARE — ogni giocatore marca l'avversario
          // che occupa la posizione simmetrica nel semicerchio avversario
          var markPk = MARK_OPP_FOR_MY[pk] || pk;  // posizione da marcare
          var oppMark = _tok('opp_'+markPk);
          if(oppMark && !oppMark.expelled) {
            // Si posiziona tra il suo attaccante e la propria porta (sx)
            var defX = _clamp(oppMark.x + (0.09 - oppMark.x)*0.30 + oscX*0.5, 0.11, 0.89);
            var defY = _clamp(oppMark.y + oscY*0.5, 0.13, 0.87);
            if(_ballOwnerKey!==mKey && !mTok._raceTo) poolMoveToken(mKey, defX, defY);
          } else {
            // Avversario assente: posizione difensiva base
            var base2=f.myDef[pk];
            if(base2 && _ballOwnerKey!==mKey && !mTok._raceTo) poolMoveToken(mKey,_clamp(base2.x+oscX,0.11,0.89),_clamp(base2.y+oscY,0.13,0.87));
          }
        }
      }

      // ── AVVERSARIO ──
      var oKey='opp_'+pk;
      if(sup && pk==='4') return;
      var oTok=_tok(oKey);
      if(oTok && !oTok.expelled && !oTok._raceTo && pk!=='GK' && pk!=='3') {
        if(pk==='6') {
          if(_attack==='opp') {
            var ocb6Base = f.oppAtk['6'];
            if(ocb6Base && _ballOwnerKey!==oKey && !oTok._raceTo) poolMoveToken(oKey, ocb6Base.x+oscX2*0.3, ocb6Base.y+oscY2*0.3);
          }
          return;
        }
        if(_attack==='opp') {
          // In attacco: formazione semicerchio avversario
          var obase=f.oppAtk[pk];
          if(obase){var pushX2o=inf?-0.010:-0.018;
            if(_ballOwnerKey!==oKey && !oTok._raceTo) poolMoveToken(oKey,_clamp(obase.x+oscX2+pushX2o,0.11,0.89),_clamp(obase.y+oscY2,0.13,0.87));}
        } else {
          // In difesa: marcatura SPECULARE
          var oMarkPk = MARK_MY_FOR_OPP[pk] || pk;
          var myMark = _tok('my_'+oMarkPk);
          if(myMark && !myMark.expelled) {
            var odefX = _clamp(myMark.x + (0.91 - myMark.x)*0.30 + oscX2*0.5, 0.11, 0.89);
            var odefY = _clamp(myMark.y + oscY2*0.5, 0.13, 0.87);
            if(_ballOwnerKey!==oKey && !oTok._raceTo) poolMoveToken(oKey, odefX, odefY);
          } else {
            var obase2=f.oppDef[pk];
            if(obase2 && _ballOwnerKey!==oKey && !oTok._raceTo) poolMoveToken(oKey,_clamp(obase2.x+oscX2,0.11,0.89),_clamp(obase2.y+oscY2,0.13,0.87));
          }
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
    if(cbTok3 && d3Tok && !d3Tok.expelled && !d3Tok.tempAbsent) {
      // Il difensore pos3 segue SEMPRE il CB avversario (anche quando il CB ha la palla).
      // Si posiziona tra il CB e la propria porta, usando la posizione ATTUALE del CB (non il target).
      var goalX = (_attack === 'my') ? 0.91 : 0.09;
      var markX = _clamp(cbTok3.x + (goalX - cbTok3.x) * 0.35, 0.13, 0.87);
      var markY = _clamp(cbTok3.y + _rnd(-0.012, 0.012), 0.14, 0.86);
      // Non muovere il marcatore se lui stesso ha la palla
      if(_ballOwnerKey !== def3Key) poolMoveToken(def3Key, markX, markY);

      // ── Trigger tiro CB: se il CB ha la palla, è entro 5m dalla porta
      // avversaria e il marcatore è a meno di 2m (proporzionali) → tiro ────
      if(_ballOwnerKey === atkCBKey && _phase === 'play') {
        var oppGoalX = (_attack === 'my') ? 0.91 : 0.09;
        var distToGoal = Math.abs(cbTok3.x - oppGoalX);
        var FIVE_M_NORM = 0.16;   // 5m proporzionale (campo ~30m → 5/30 ≈ 0.167)
        var TWO_M_NORM  = 0.065;  // 2m proporzionale
        var markerDist  = _dist(cbTok3.x, cbTok3.y, d3Tok.x, d3Tok.y);
        if(distToGoal < FIVE_M_NORM && markerDist < TWO_M_NORM) {
          // CB in zona pericolosa con marcatore vicino → triggerare tiro
          if(!_cbShotCooldown) {
            _cbShotCooldown = true;
            // Telecronaca tiro CB
            var cbShooterName = '';
            if(_ms && _attack==='my' && _ms.myRoster && cbTok3.pi!==undefined)
              cbShooterName = (_ms.myRoster[cbTok3.pi]||{}).name||'';
            var cbGkName = '';
            if(_attack==='my' && _ms && _ms.oppRoster)
              cbGkName = ((_ms.oppRoster.find(function(p){return p&&p.role==='POR';})||{}).name)||'';
            // Anche il tiro del centrocampo e' un tiro vero: si mira a un
            // punto e poi decidono portiere e geometria. Prima decideva un
            // dado e il gol veniva registrato PRIMA che la palla arrivasse.
            var cbTeamN = _attack==='my'?(_ms&&_ms.myTeam&&_ms.myTeam.name)||'':(_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'';
            var shotX = (_attack === 'my') ? 0.93 : 0.07;  // dentro la rete, non oltre il fondo
            var shotY = _shotAimY(cbTok3, _attack);
            // Cooldown 3s per evitare tiri continui
            setTimeout(function(){ _cbShotCooldown = false; }, 3000);

            _shotShooterKey = atkCBKey;
            _shotShooterName = cbShooterName;
            if(_ms) {
              if(_attack==='my') _ms.myShots=(_ms.myShots||0)+1;
              else                 _ms.oppShots=(_ms.oppShots||0)+1;
            }
            if(typeof poolReleaseBall==='function') poolReleaseBall();
            _ballOwnerKey = null;
            _pendingReceiver = null;
            if(typeof poolMarkShot==='function') poolMarkShot(_attack);
            if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(shotX, shotY);
          }
        }
      }
    }
  }

  // ── Il ricevitore tiene il punto d'incontro ──────────────────────────
  // Il passaggio finiva sempre in acqua. Per questo il punto d'incontro viene
  // reimposto qui, DOPO il ciclo tattico.
  function _holdReceiverTarget() {
    if(!_pendingReceiver || _pendingReceiver._meetX === undefined) return;
    if(typeof poolMoveToken !== 'function') return;
    var tok=_tok(_pendingReceiver.key);
    if(!tok || tok.expelled) return;
    poolMoveToken(_pendingReceiver.key, _pendingReceiver._meetX, _pendingReceiver._meetY);
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

    // ── Telecronaca passaggio (1 ogni 3 per non saturare il log) ──────────
    _commentaryPassCount++;
    if(_commentaryPassCount >= 3) {
      _commentaryPassCount = 0;
      // Nomi per telecronaca
      var passerName = '', receiverName = '';
      if(_ms) {
        if(ownerTeam==='my' && _ms.myRoster && ownerTok.pi!==undefined)
          passerName = (_ms.myRoster[ownerTok.pi]||{}).name||'';
        var recPk = pick.key.split('_')[1];
        var recTm = pick.key.split('_')[0];
        if(recTm==='my' && _ms.myRoster) {
          var recOnField = _ms.onField[recPk];
          receiverName = recOnField!==undefined ? ((_ms.myRoster[recOnField]||{}).name||'') : '';
        }
      }
      _emitComment('pass', { passer: passerName, receiver: receiverName,
                              team: ownerTeam==='my' ? (_ms&&_ms.myTeam&&_ms.myTeam.name)||'' : (_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'' });
    }

    // ── Punto di arrivo: "sulla nuotata" del ricevitore ────────────────
    // _passAim stima dove sara' il ricevitore al momento dell'arrivo e
    // aggiunge l'errore naturale del passatore. Se l'errore supera il raggio
    // di presa la palla finisce in acqua libera: e' un passaggio sbagliato,
    // e non se ne accorge nessuno (la corsa alla palla libera la recupera).
    var lBall0 = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:ownerTok.x, y:ownerTok.y};
    var aim = _passAim(pick.key, recTok, lBall0.x, lBall0.y);
    var futX = aim.aimX, futY = aim.aimY;

    // ── Un difensore può intercettare? ────────────────────────────
    // Si decide qui, una volta sola. Prima il controllo veniva rifatto a
    // ogni frame sul segmento palla→ricevitore: siccome quel segmento si
    // accorcia mentre la palla avanza, il marcatore del ricevitore finiva
    // sempre "sulla traiettoria" e gli passaggi risultavano intercettati
    // una volta su due.
    //
    // Ora: se un difensario è realmente in linea quando la palla parte,
    // si lancia un dado una volta sola. Se esce bene, quel difensore
    // intercetterà davvero, nel punto della linea in cui si trova.
    var _intercettore = null;
    var _lane = _laneDefender(lBall0.x, lBall0.y, futX, futY,
                              pick.key.split('_')[0]==='my' ? 'opp' : 'my');
    if(_lane) {
      // Più il difensore è centrato sulla linea, più è probabile che
      // legga il passaggio.
      var _centro = 1 - _lane.perp/INTERCEPT_WIDTH;
      var _probInt = _clamp(0.16 + _centro*0.30, 0, 0.55);
      if(Math.random() < _probInt) _intercettore = _lane;
    }

    // Libera il possesso
    _ballOwnerKey = null;
    if(typeof poolReleaseBall === 'function') poolReleaseBall();

    // Registra il ricevitore PRIMA del lancio (blocca pool.js dalla raccolta libera)
    var lBall = lBall0;
    var _tdx = futX - lBall.x, _tdy = futY - lBall.y;
    // ready:true — pool.js garantisce già che la palla sia in volo tramite _ballInFlight
    // Non serve il check 40%: quello causava freeze quando la palla arrivava troppo veloce
    _pendingReceiver = {
      key: pick.key, team: ownerTeam,
      startX: lBall.x, startY: lBall.y,
      totalDist: Math.max(0.02, Math.sqrt(_tdx * _tdx + _tdy * _tdy)),
      ready: true,
      // Grace dopo l'arrivo: se la palla e' arrivata e nessuno la prende
      // entro _landedGrace, il passaggio e' perso e diventa palla libera.
      _landed: false, _landedGrace: 0,
      // Punto d'incontro: il ricevitore nuota qui e il sistema tattico non
      // lo sposta finche' la palla non arriva.
      _meetX: aim.leadX, _meetY: aim.leadY,
      // Bersaglio del passaggio: serve al controllo d'intercettazione, che
      // deve valutare la traiettoria reale e non il segmento che si
      // accorcia a ogni frame.
      _aimX: futX, _aimY: futY,
      // Difensore che puo' intercettare questo passaggio, se s'e' avverta
      _intercettore: _intercettore,
    };

    // Il ricevitore nuota verso il punto di incontro previsto (il lead), non
    // verso l'errore: cosi' un passaggio centrato arriva su di lui, e uno
    // sbagliato lo costringe a rincorrere la palla in acqua.
    if(typeof poolMoveToken === 'function')
      poolMoveToken(pick.key, aim.leadX, aim.leadY);

    // Lancia la palla (ora _pendingReceiver è già impostato)
    if(typeof poolMoveBallDirect === 'function')
      poolMoveBallDirect(futX, futY);
  }


  // ── Tiro automatico (giocatore libero arriva in zona) ─────────────────
  // ── Dove si tira ─────────────────────────────────────────────────────
  // Prima il tiro andava a un punto fisso e l'esito era un dado. Ora il
  // tiratore sceglie davvero dove mandare la palla: un angolo o il
  // centro-basso, sbagliando in proporzione inversa alla sua tecnica e in
  // proporzione diretta alla qualita' del portiere che lo aspetta.
  // Il tiro puo' cosi' finire in gol, essere parato o uscire dai pali, ma e'
  // sempre una conseguenza di dove e' andata la palla.
  var SHOT_AIM_CORNERS = [0.428, 0.572];   // angoli basso-alto (poco sotto il palo)

  function _shooterSkill(tok, team) {
    var tec = null;
    if(_ms && team==='my' && _ms.myRoster && _ms.onField && tok){
      var pi = _ms.onField[tok.pk];
      if(pi!==undefined) tec = (_ms.myRoster[pi]||{}).stats;
    } else if(_ms && team==='opp' && _ms.oppRoster){
      // La CPU non espone una formazione: si usa la media della rosa, cosi'
      // l'avversario tira con una qualita' plausibile e non casuale.
      var sum=0, n=0;
      _ms.oppRoster.forEach(function(r){
        if(r && r.role!=='POR' && r.stats && r.stats.tec!==undefined){ sum+=r.stats.tec; n++; }
      });
      if(n) tec = {tec: sum/n};
    }
    var v = (tec && tec.tec!==undefined) ? tec.tec : 50;
    return Math.max(0, Math.min(100, v)) / 100;
  }

  function _keeperSkill(gkTeam) {
    if(!_ms) return 0.5;
    var p = null;
    if(gkTeam==='my' && _ms.myRoster && _ms.onField)
      p = (_ms.myRoster[_ms.onField['GK']]||{});
    else if(gkTeam==='opp' && _ms.oppRoster)
      p = (_ms.oppRoster.find(function(r){return r&&r.role==='POR';})||null);
    var v = (p && p.stats && p.stats.tec!==undefined) ? p.stats.tec : 50;
    return Math.max(0, Math.min(100, v)) / 100;
  }

  function _shotAimY(tok, team) {
    var defTeam = team==='my' ? 'opp' : 'my';
    var skill   = _shooterSkill(tok, team);
    var gkSkill = _keeperSkill(defTeam);
    // Sceglie un angolo o il centro-basso
    var r = Math.random();
    var aim = (r < 0.32) ? SHOT_AIM_CORNERS[0]
            : (r < 0.64) ? SHOT_AIM_CORNERS[1]
            : (r < 0.82) ? 0.470 : 0.530;
    // Errore: un bravo sbaglia poco, un portiere bravo stringe le finestre.
    var err = (1 - skill*0.55) * (0.030 + gkSkill*0.055);
    return Math.max(0.06, Math.min(0.94, aim + (Math.random()*2-1)*err));
  }

  function _autoShot() {
    if(!_ballOwnerKey) return;
    var ownerTeam = _ballOwnerKey.split('_')[0];
    var ownerTok  = _tok(_ballOwnerKey);
    if(!ownerTok) return;

    // Porta avversaria: my attacca verso dx (0.91), opp attacca verso sx (0.09)
    // shotX: per goal entra nella rete avversaria; per parata si ferma davanti al portiere
    // La rete avversaria (opp): oppNetX0=0.91, oppNetX1=0.98 → shot a 0.93 ok
    // La rete nostra (my):    myNetX0=0.02,  myNetX1=0.09  → shot a 0.07 ok
    // IMPORTANTE: per una PARATA il ball non deve superare le linee di porta (myNetX1=0.09 / oppNetX0=0.91)
    // Bersaglio: un angolo o il centro-basso, con errore legato alla tecnica.
    // Prima l'esito era un dado (20% gol) e la mira era fissa: la palla e il
    // punteggio non avevano nessun rapporto. Ora si sceglie DOVE si tira e
    // l'esito lo decide portiere e geometria.
    var shotX = ownerTeam==='my' ? 0.93 : 0.07;
    var shotY = _shotAimY(ownerTok, ownerTeam);

    // Nomi per telecronaca
    var shooterName = '';
    if(_ms && ownerTeam==='my' && _ms.myRoster && ownerTok.pi!==undefined)
      shooterName = (_ms.myRoster[ownerTok.pi]||{}).name||'';
    else if(_ms && ownerTeam==='opp' && _ms.oppRoster)
      shooterName = ((_ms.oppRoster.find(function(p){return p&&p.role!=='POR';})||{}).name)||'';
    var gkTeamShot = ownerTeam==='my' ? 'opp' : 'my';
    var gkName = '';
    if(gkTeamShot==='opp' && _ms && _ms.oppRoster)
      gkName = ((_ms.oppRoster.find(function(p){return p&&p.role==='POR';})||{}).name)||'';
    else if(gkTeamShot==='my' && _ms && _ms.myRoster && _ms.onField)
      gkName = (_ms.myRoster[_ms.onField['GK']]||{}).name||'';
    var teamName = ownerTeam==='my'?(_ms&&_ms.myTeam&&_ms.myTeam.name)||'':(_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'';

    // Ripristina timer
    _passT=0; _passNext=_rnd(1.5,2.5);

    // Chi ha tirato e come si chiama: serve alla telecronaca quando la palla
    // arriva davvero (gol, parata o fuori), non prima.
    _shotShooterKey = _ballOwnerKey;
    _shotShooterName = shooterName;

    // Lancia la palla verso la porta avversaria. poolMarkShot dice a pool.js
    // che questo volo e' un TIRO: solo cosi puo' finire in gol, mentre un
    // passaggio che esce dal campo e' solo "fuori".
    _ballOwnerKey=null;
    _pendingReceiver=null;
    if(typeof poolReleaseBall==='function') poolReleaseBall();
    if(typeof poolMarkShot==='function') poolMarkShot(ownerTeam);
    if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(shotX, shotY);

    // Conta il tiro: e' avvenuto qualunque cosa succeda dopo.
    if(_ms) {
      if(ownerTeam==='my') _ms.myShots=(_ms.myShots||0)+1;
      else                  _ms.oppShots=(_ms.oppShots||0)+1;
    }

    // Niente coda e niente messaggio qui: gol, parata e fuori vengono decisi
    // quando la palla arriva, e ognuno dirà la sua telecronaca al momento
    // giusto. _seq=[] evita che una sequenza precedente fermi il tiro.
    _seq=[];_seqActive=false;
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
    _cbShotCooldown=false;
    _shotClock=0;
      _freeAdvanceCooldown=0;
      _seq=[];_seqActive=false;
      _dropDeferred();
      // pool.js ora guarda dove arriva davvero la palla e segnala qui gol e
      // fuori. Senza questo collegamento nessuno dei due eventi esisteva: il
      // punteggio veniva deciso a dado e la palla non poteva ne' entrare in
      // porta ne' uscire dal campo.
      if(typeof poolSetBallEventHandler==='function') poolSetBallEventHandler(_onBallEvent);
    }

  function stop(){_active=false;_ms=null;_seq=[];_seqActive=false;_dropDeferred();}

  // dt = secondi REALI (non moltiplicati per speed)
  // Traccia lo stato precedente per rilevare cambiamenti
  var _prevSup = false, _prevInf = false;

  function update(dt) {
    if(!_active||!_ms)return;
    var canRun=_ms.running||_phase==='goal_cel'||_phase==='kickoff_after'||_phase==='penalty';
    if(!canRun)return;

    var gameSpeed = _ms.speed || 1;
    _gameSpeed = gameSpeed;

    // La fase della partiera segue il controller. Senza questa sincronizzazione
    // pool.js resta in 'idle' per tutta la partita (poolStartPeriod la mette a
    // idle e nessuno la riporta a 'play'), e la corsa alla palla libera — che
    // richiede _phase==='play' — non parte MAI. Il pallone quindi restava
    // fermo in acqua per sempre dopo un passaggio perso, e il possesso
    // tornava solo per il safety che assegnava la palla a una pedina a caso.
    if(typeof poolSetPhaseFromMC==='function') poolSetPhaseFromMC(_phase, _attack);

    // Battuta dopo un "fuori": la pedina avversaria piu' vicina va sul punto
    // d'uscita e rimette la palla in gioco. Finche' non arriva la palla resta
    // ferma sul punto in cui e' uscita.
    _updateThrowIn(dt);

    // Una coda di azioni non deve immobilizzare il campo. I suoi passi sono
    // eventi da eseguire alle loro scadenze, non un motivo per sospendere il
    // gioco: il ramo 'play' qui sotto resta l'unico arbitro di cosa si muove.
    // Prima, con il return, ogni tiro e ogni parata congelava TUTTO il campo
    // per i 2.25s di attesa del difensore, e a velocita' 10 i tiri arrivano
    // ogni 2-4s: il campo passava la partita immobile.
    // Le cinetiche (gol, rimessa, rigore) restano congelate senza bisogno di
    // questo guard, perche' durante _phase='goal_cel'|'kickoff_after'|'penalty'
    // e il ramo 'play' non viene raggiunto.
    if(_seqActive)_tickSeq(dt);
    else if(_phase==='sprint'||_phase==='goal_cel'||_phase==='kickoff_after'){
      // La fase dice "sto mostrando una cinetica" ma la coda e' finita: e'
      // successo solo se un evento ha azzerato la coda togliendo il passo che
      // riportava il campo a play. Senza questo il campo resta immobile per
      // sempre, con la partita in corso e gli eventi che si accumulano nel log.
      _phase='play'; _microPhase={}; _tacticalT=0;
      _passT=0; _passNext=_rnd(1.8,2.5);
    }

    // La cinetica e' finita e la fase e' tornata 'play': riproduci gli eventi
    // arrivati nel frattempo. Se uno di loro riapre una cinetica, il frame
    // viene lasciato alla sequenza.
    if(_drainDeferred())return;

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

      if(_freeAdvanceCooldown > 0) _freeAdvanceCooldown -= eff;

      if(_tacticalT >= TACTICAL_INT){
        _tacticalT = 0;
        _updateAllTargets(dt);
        // Il ricevitore tiene il punto d'incontro: il riposizionamento
        // tattico non deve rubargli la palla che sta per arrivare.
        _holdReceiverTarget();

        // ── FASE A: Pubblica stato canvas + FASE corrente al live engine ──
        if(typeof liveUpdateState === 'function') {
          var ballPos = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:0.5,y:0.5};
          var cbKey   = _attack+'_6';
          var cbTok   = _tok(cbKey);
          var markKey = (_attack==='my'?'opp':'my')+'_3';
          var markTok = _tok(markKey);
          var cbDist  = (cbTok && markTok)
            ? _dist(cbTok.x, cbTok.y, markTok.x, markTok.y) : 999;
          var oppShotZone = 0.74, myShotZone = 0.26;
          var cbInZone = _attack==='my'
            ? (cbTok && cbTok.x > oppShotZone)
            : (cbTok && cbTok.x < myShotZone);

          // Rileva la fase canvas corrente
          var ownerPk = _ballOwnerKey ? _ballOwnerKey.split('_')[1] : null;
          var ownerTokP = _ballOwnerKey ? _tok(_ballOwnerKey) : null;

          // Distanza avversario più vicino al possessore
          var closestDef = 999;
          if(_ballOwnerKey && ownerTokP) {
            var defTm = _attack==='my'?'opp':'my';
            ['1','2','3','4','5','6'].forEach(function(pk){
              var dt2=_tok(defTm+'_'+pk);
              if(!dt2||dt2.expelled||dt2.tempAbsent)return;
              var ddx=dt2.x-ownerTokP.x,ddy=dt2.y-ownerTokP.y;
              closestDef=Math.min(closestDef,Math.sqrt(ddx*ddx+ddy*ddy));
            });
          }

          // Determina CANVAS_PHASE
          var newPhase;
          if(!_ballOwnerKey && !_pendingReceiver) {
            newPhase = 'LOOSE_BALL';
          } else if(_ms && _ms.superiorityActive) {
            newPhase = 'SUPERIORITY';
          } else if(_ms && _ms.inferiorityActive) {
            newPhase = 'INFERIORITY';
          } else if(ownerPk==='6' && cbInZone && cbDist < 0.12) {
            newPhase = 'ATTACK_CB';
          } else if(closestDef > (FREE_PLAYER_DIST||0.10)) {
            newPhase = 'FREE_PLAYER';
          } else if((ownerPk==='1'||ownerPk==='5') && _ballOwnerKey) {
            newPhase = 'ATTACK_WING';
          } else {
            newPhase = 'BUILD_UP';
          }

          // Nome possessore per telecronaca
          var ownerName = '';
          if(_ballOwnerKey && ownerTokP && _ms) {
            var pi2 = ownerTokP.pi;
            if(_attack==='my' && _ms.myRoster && _ms.myRoster[pi2])
              ownerName = _ms.myRoster[pi2].name || '';
          }

          liveUpdateState({
            canvasPhase:    newPhase,
            attack:         _attack,
            ballOwnerKey:   _ballOwnerKey,
            ballOwnerPk:    ownerPk,
            ballOwnerName:  ownerName,
            ballX:          ballPos.x,
            ballY:          ballPos.y,
            ballFree:       !_ballOwnerKey && !_pendingReceiver,
            cbInShotZone:   !!cbInZone,
            cbMarkerDist:   cbDist,
            closestDefDist: closestDef,
            passCount:      _passT > 0 ? Math.floor(_passT / 1.5) : 0,
            phaseTime:      _shotClock,
          });
        }
      }

      _applyPressure();

      // ── Shot clock: 30 secondi per azione ───────────────────────────
      // Il clock avanza solo quando c'è un possessore (azione in corso).
      // Se scade: cambio palla con evento motivato.
      if(_ballOwnerKey) {
        _shotClock += eff;
        if(_shotClock >= SHOT_CLOCK_MAX) {
          _shotClock = 0;
          // Cambio possesso per scadenza shot clock
          var prevAttack = _attack;
          _attack = (_attack === 'my') ? 'opp' : 'my';
          if(typeof poolReleaseBall==='function') poolReleaseBall();
          _ballOwnerKey = null;
          _pendingReceiver = null;
          _passT = 0; _passNext = _rnd(1.5, 2.5);
          _repositionAll(0.022);
          // Telecronaca shot clock diretta
          var scTeamName = _attack==='my'?(_ms&&_ms.myTeam&&_ms.myTeam.name)||'':(_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'';
          _emitComment('shot_clock_expired', { team: scTeamName });
        }
      } else {
        _shotClock = 0;   // reset quando palla è libera
      }

      // ── Giocatore libero → nuota verso porta ─────────────────────
      // Se il possessore non ha nessun avversario entro FREE_PLAYER_DIST,
      // non aspetta il passaggio automatico ma avanza direttamente verso
      // la porta avversaria per concludere.
      if(_ballOwnerKey && _phase==='play') {
        var ownerTok2 = _tok(_ballOwnerKey);
        var ownerTeam2 = _ballOwnerKey.split('_')[0];
        var defTeam2   = ownerTeam2==='my'?'opp':'my';
        if(ownerTok2 && !ownerTok2.expelled) {
          var closestDef = 999;
          ['1','2','3','4','5','6'].forEach(function(pk){
            var dtok = _tok(defTeam2+'_'+pk);
            if(!dtok||dtok.expelled||dtok.tempAbsent)return;
            var dx=dtok.x-ownerTok2.x, dy=dtok.y-ownerTok2.y;
            closestDef = Math.min(closestDef, Math.sqrt(dx*dx+dy*dy));
          });
          // ── Check percorso verso porta (non solo distanza dal difensore) ───
      // Il giocatore è libero se nessun difensore è davanti a lui nella corsia
      var goalXfp2 = ownerTeam2==='my' ? 0.91 : 0.09;
      var attackDirfp2 = ownerTeam2==='my' ? 1 : -1;
      var isPathClear = true;
      var emergencyDefKey = null, emergencyDefDist = 999;
      ['1','2','3','4','5','6'].forEach(function(pk){
        var dtok2=_tok((ownerTeam2==='my'?'opp':'my')+'_'+pk);
        if(!dtok2||dtok2.expelled||dtok2.tempAbsent)return;
        var aheadOfAttacker = attackDirfp2*(dtok2.x - ownerTok2.x) > 0.03; // davanti
        var sameCorsia = Math.abs(dtok2.y - ownerTok2.y) < 0.18;           // stessa corsia
        if(aheadOfAttacker && sameCorsia) isPathClear = false;
        // Tieni traccia del difensore più vicino per l'emergenza
        var ddfp=_dist(dtok2.x,dtok2.y,ownerTok2.x,ownerTok2.y);
        if(ddfp<emergencyDefDist){emergencyDefDist=ddfp;emergencyDefKey=(ownerTeam2==='my'?'opp':'my')+'_'+pk;}
      });

      if(isPathClear) {
            // Strada libera: avanza verso la PORTA AVVERSARIA
            // Il difensore più vicino lascia la sua marcatura e pressiona il libero
            if(emergencyDefKey && _ballOwnerKey!==emergencyDefKey) {
              poolMoveToken(emergencyDefKey, ownerTok2.x + attackDirfp2*0.06,
                            ownerTok2.ty + _rnd(-0.05,0.05));
            }
            var twoMX = ownerTeam2==='my' ? 0.79 : 0.21;
            poolMoveToken(_ballOwnerKey, twoMX, ownerTok2.ty + _rnd(-0.015,0.015));

            // Telecronaca: emetti solo se il cooldown è scaduto
            if(_freeAdvanceCooldown <= 0) {
              var fpName = '';
              if(_ms && ownerTeam2==='my' && _ms.myRoster && ownerTok2.pi!==undefined)
                fpName = (_ms.myRoster[ownerTok2.pi]||{}).name||'';
              _emitComment('free_advance', { player: fpName,
                team: ownerTeam2==='my'?(_ms&&_ms.myTeam&&_ms.myTeam.name)||'':(_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'' });
              _freeAdvanceCooldown = FREE_ADVANCE_CD_SEC;
            }

            // Porta avversaria: my→dx (0.91), opp→sx (0.09)
            var distToGoalfp = Math.abs(ownerTok2.x - goalXfp2);
            if(distToGoalfp < 0.18) {
              // Entro ~5m dalla porta → tira subito
              _passT = _passNext + 1;
            } else {
              // In avvicinamento → blocca i passaggi
              _passT = 0; _passNext = 9999;
            }
          } else {
            // Percorso bloccato → ripristina passaggi normali
            if(_passNext === 9999) { _passT=0; _passNext=_rnd(1.5,2.5); }
          }
        }
      }

      // ── Sync: se pool.js ha già un possessore ma movement.js non lo sa ────
      // Questo rompe il deadlock _ballOwner≠null / _ballOwnerKey=null
      if(!_ballOwnerKey && !_pendingReceiver && _phase==='play') {
        var poolOwner = typeof poolGetBallOwner==='function' ? poolGetBallOwner() : null;
        if(poolOwner) {
          _ballOwnerKey = poolOwner;
          _passT = 0; _passNext = _rnd(1.5, 2.5);
          var syncTeam = poolOwner.split('_')[0];
          if(syncTeam !== _attack) {
            _attack = syncTeam;
            _repositionAll(0.022);
          }
        }
      }

      // ── Fix 4: assegna possesso quando palla arriva al ricevitore ──────────
      // Se un avversario intercetta il passaggio in volo → evento intercetto
      if(_pendingReceiver) {
        // Safety: se pendingReceiver è attivo da troppo tempo, forza pickup
        _pendingReceiver._age = (_pendingReceiver._age || 0) + eff;

        var recTok = _tok(_pendingReceiver.key);
        if(recTok && !recTok.expelled) {
          var ballPos = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:0.5,y:0.5};

          if(_pendingReceiver.ready) {
            var recTeam = _pendingReceiver.team;
            var oppTeamP = recTeam === 'my' ? 'opp' : 'my';
            var prDx = recTok.x - ballPos.x, prDy = recTok.y - ballPos.y;
            var prDist = Math.sqrt(prDx*prDx + prDy*prDy);

            // ── Intercettazione ────────────────────────────────────────────
            //
            // La decisione e' gia' stata presa al lancio (vedi _autoPass):
            // se un difensore era in linea, si e' lanciato un dado e qui si
            // esegue. Niente controlli geometrici a ogni frame.
            var sx0 = _pendingReceiver.startX, sy0 = _pendingReceiver.startY;
            var ex  = _pendingReceiver._aimX!==undefined ? _pendingReceiver._aimX : recTok.x;
            var ey  = _pendingReceiver._aimY!==undefined ? _pendingReceiver._aimY : recTok.y;
            var trajDx = ex - sx0, trajDy = ey - sy0;
            var trajLen = Math.sqrt(trajDx*trajDx + trajDy*trajDy);
            var trav = trajLen>0.005
              ? Math.sqrt(Math.pow(ballPos.x-sx0,2)+Math.pow(ballPos.y-sy0,2))/trajLen
              : 1;
            var interc = _pendingReceiver._intercettore;
            var intercetta = false;
            if(interc && trajLen > 0.005) {
              var intTok = _tok(interc.key);
              // Se il difensore e' stato espulso o non si muove piu' la
              // palla passa: l'intercettazione non avviene.
              if(!intTok || intTok.expelled || intTok.tempAbsent) {
                _pendingReceiver._intercettore = null;
              } else if(trav >= interc.t) {
                // La palla arriva addosso al difensore: gli si rietira il
                // bersaglio sul punto in cui lui si trova, cosi' la presa
                // avviene davvero e non a caso.
                var ix = sx0 + trajDx*interc.t, iy = sy0 + trajDy*interc.t;
                if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(ix, iy);
                if(typeof poolMoveToken==='function') poolMoveToken(interc.key, ix, iy);
                _pendingReceiver = {
                  key: interc.key, team: oppTeamP,
                  startX: ballPos.x, startY: ballPos.y,
                  totalDist: Math.max(0.02, Math.sqrt(Math.pow(ballPos.x-ix,2)+Math.pow(ballPos.y-iy,2))),
                  ready: true,
                  _meetX: ix, _meetY: iy,
                  _aimX: ix, _aimY: iy,
                  _landed: false, _landedGrace: 0,
                  _intercettore: null,
                };
                _ballOwnerKey = null;
                _attack = oppTeamP;
                _passT = 0; _passNext = _rnd(1.5, 2.5);
                intercetta = true;
                // Telecronaca intercettazione
                var intTeamName = oppTeamP==='my'
                  ? ((_ms&&_ms.myTeam&&_ms.myTeam.name)||'')
                  : ((_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'');
                _emitComment('interception', { team: intTeamName });
              }
            }

            if(!intercetta && prDist < 0.060) {
              // Ricevitore previsto prende la palla normalmente
              _ballOn(_pendingReceiver.key);
              _attack = _pendingReceiver.team;
              _pendingReceiver = null;
            }
          }
        } else {
          // Ricevitore scaduto o espulso
          _pendingReceiver = null;
        }
      }

      // ── Passaggio arrivato a destinazione senza essere preso ─────────────
      // Se la palla ha finito il volo e nessuno la prende entro il grace,
      // il passaggio e' perso. La palla resta ferma in acqua e la corsa alla
      // palla libera muove i giocatori piu' vicini di OGNI squadra verso di
      // lei: uno vince la corsa, l'altro preme.
      //
      // Prima, dopo 3s, il possesso veniva assegnato al compagno piu' vicino
      // comunque, anche a 10 metri: la palla compariva addosso a una pedina
      // che non era mai stata lontano da li', e il possessore risultava
      // "comparso" in mezzo al campo.
      if(_pendingReceiver) {
        var inVolo = (typeof poolBallInFlight==='function') ? poolBallInFlight() : false;
        if(!inVolo) {
          _pendingReceiver._landedGrace += eff;
          if(_pendingReceiver._landedGrace > 0.45 || _pendingReceiver._age > 3.0)
            _pendingReceiver = null;   // palla libera: se ne occupa la corsa
        }
      }

      if(_ballOwnerKey){
        _passT += eff;
        if(_passT >= _passNext && !_pendingReceiver) {
          // Se _passNext era 9999 (giocatore libero in avanzata), tira invece di passare
          if(_passNext >= 9999) {
            _autoShot();
          } else {
            _autoPass();
          }
        }
      }

      if(typeof poolUpdateKeepers==='function')poolUpdateKeepers();
    }
  }

  // ── 1. INIZIO PERIODO ─────────────────────────────────────────
  function onPeriodStart() {
    _phase='idle';_seq=[];_seqActive=false;_dropDeferred();_ballOwnerKey=null;
    _microPhase={};_tacticalT=0;_passT=0;_passNext=_rnd(1.5,2.5);
    _pendingReceiver=null;_cbShotCooldown=false;_shotClock=0;
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
    // Scala la durata con gameSpeed: a 10x i token arrivano 10x più veloce
    var gameSpeedNow = _ms && _ms.speed ? _ms.speed : 1;
    var sprintDur=Math.max(winDist/Math.max(winSpd*gameSpeedNow,0.001),0.5);

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

    _qA(sprintDur, function(){
      _ballOn(_cbWinner+'_6');
      _attack = _cbWinner;  // La squadra che prende la palla attacca
      if(typeof poolSetAttack==='function') poolSetAttack(_cbWinner);
    });
    _qA(sprintDur+0.2, function(){
      // CB6 lancia la palla verso pos3 (passaggio visivo)
      if(typeof poolReleaseBall==='function')poolReleaseBall();
      _ballOwnerKey=null; _pendingReceiver=null;
      var tar3=_cbWinner==='my'?ATK_MY['3']:ATK_OPP['3'];
      var tX3=tar3.x+_rnd(-0.02,0.02), tY3=tar3.y+_rnd(-0.02,0.02);
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(tX3,tY3);
    });
    _qA(sprintDur+0.5, function(){
      // Assegna direttamente il possesso a pos3 (no _pendingReceiver: evita il bug del null)
      _ballOn(_cbWinner+'_3');
      _attack=_cbWinner;
      _repositionAll(0.025);_phase='play';_tacticalT=0;_microPhase={};
      // Timer più lungo: i giocatori devono posizionarsi prima della prima passata
      _passT=0; _passNext=_rnd(1.8,2.5);
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
      // Telecronaca goal sincrona con l'animazione
      var goalTN=scorerTeam==='my'?(_ms&&_ms.myTeam&&_ms.myTeam.name)||'':(_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'';
      _emitComment(scorerTeam==='my'?'goal_my':'goal_opp',
        { scorer:event.goalScorer||'', team:goalTN });
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

      _qA(4.55, function(){
        var batter=scorerTeam==='my'?'opp':'my';
        if(typeof poolReleaseBall==='function')poolReleaseBall();
        var tar3=batter==='my'?ATK_MY['3']:ATK_OPP['3'];
        if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(tar3.x+_rnd(-0.02,0.02),tar3.y+_rnd(-0.02,0.02));
        _ballOn(batter+'_3');
        _attack=batter;
        _repositionAll(0.022);
        _phase='play';_tacticalT=0;_microPhase={};
      });

    _startSeq();
  }

  // ── TIRO ──────────────────────────────────────────────────────
  // Usa _qA (tempo di gioco scalato) invece di setTimeout (tempo reale)
  function onShot(event) {
      if(!event||!event.ballTarget)return;
      // Durante una cinetica non si tocca la coda: si aspetta il riprimo.
      if(_inCinematic()){_deferEvent(onShot,[event]);return;}
      if(event.moverKey)_ballOn(event.moverKey);
    _pendingReceiver=null;
    var shotX=event.ballTarget.x, shotY=event.ballTarget.y;
    // È un TIRO: pool.js deve poterlo distinguere da un passaggio, altrimenti
    // una palla che entra in porta viene letta come un semplice "fuori".
    var shooterTeam = event.shotTeam || (event.moverKey ? event.moverKey.split('_')[0] : _attack);
    _shotShooterKey = event.moverKey || null;
    var st = event.moverKey ? _tok(event.moverKey) : null;
    _shotShooterName = (_ms && shooterTeam==='my' && _ms.myRoster && st && st.pi!==undefined)
      ? ((_ms.myRoster[st.pi]||{}).name||'')
      : (_ms && shooterTeam==='opp' && _ms.oppRoster && st)
        ? (((_ms.oppRoster.filter(function(p){return p&&p.role!=='POR';})[0]||{}).name)||'')
        : '';
    _seq=[];_seqActive=false;
    _qA(0.25, function(){
      if(typeof poolReleaseBall==='function')poolReleaseBall();
      _ballOwnerKey=null;
      if(typeof poolMarkShot==='function')poolMarkShot(shooterTeam);
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(shotX,shotY);
      if(event.moverKey&&event.moverTarget)
        _mv(event.moverKey,event.moverTarget.x,event.moverTarget.y,0.015);
    });
    // Fallback (2s di gioco): se palla ancora libera, difensore più vicino la prende
    _qA(2.25, function(){
      if(_ballOwnerKey===null&&_pendingReceiver===null&&_phase==='play'){
        var defTeam=_attack==='my'?'opp':'my';
        var bPos=typeof poolGetBallPos==='function'?poolGetBallPos():{x:shotX,y:shotY};
        var closest=_findClosestToken(defTeam,bPos.x,bPos.y)||_findClosestToken(_attack,bPos.x,bPos.y);
        if(closest){
          var recTok=_tok(closest);
          if(recTok){
            if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(recTok.x,recTok.y);
            _pendingReceiver={key:closest,team:closest.split('_')[0],
              startX:bPos.x,startY:bPos.y,totalDist:0.001,ready:true};
            _attack=closest.split('_')[0];
          }
        }
      }
    });
    _startSeq();
  }

  // ── PARATA ────────────────────────────────────────────────────
  // Usa _qA (tempo di gioco scalato) invece di setTimeout (tempo reale).
  // Questo evita la race condition ad alta velocità dove _autoPass
  // scatta sul GK prima che il relaunch avvenga.
function onSave(event) {
      if(!event)return;
      // Durante una cinetica non si tocca la coda: si aspetta il riprimo.
      if(_inCinematic()){_deferEvent(onSave,[event]);return;}
      if(typeof poolReleaseBall==='function')poolReleaseBall();
    _ballOwnerKey=null;
    _pendingReceiver=null;

    var shooterTeam = event.shotTeam || (_attack === 'my' ? 'my' : 'opp');
    var gkTeam = (shooterTeam === 'my') ? 'opp' : 'my';

    // Telecronaca parata sincrona
    var saveGkName = '';
    if(gkTeam==='my' && _ms && _ms.myRoster && _ms.onField)
      saveGkName = (_ms.myRoster[_ms.onField['GK']]||{}).name||'';
    else if(gkTeam==='opp' && _ms && _ms.oppRoster)
      saveGkName = ((_ms.oppRoster.find(function(p){return p&&p.role==='POR';})||{}).name)||'';
    _emitComment('save', { gk: saveGkName,
      team: gkTeam==='my'?(_ms&&_ms.myTeam&&_ms.myTeam.name)||'':(_ms&&_ms.oppTeam&&_ms.oppTeam.name)||'' });

    // Palla bloccata dal portiere: resta DOVE il tiro e' stato parato.
    //
    // Prima la palla veniva lanciata a (gkX, gkY), cioe' sulla linea di porta
    // del portiere: se il tiro era da 8 metri la palla attraversava il bacino
    // da sola, senza possessore e senza nessuno che la toccasse. Era la
    // principale sorgente di palla "autonoma".
    //
    // Ora: il portiere nuota dove si e' fermata la palla e la prende
    // davvero. Se non arriva in tempo, la palla resta in acqua e la corsa
    // alla palla libera la mette in gioco.
    var gkX = (gkTeam==='my') ? (typeof PLAY!=='undefined'?PLAY.myGKX:0.115)
                               : (typeof PLAY!=='undefined'?PLAY.oppGKX:0.885);
    var gkY = event.ballTarget ? event.ballTarget.y : 0.50;
    var gkTok = _tok(gkTeam+'_GK');
    var blockedBall = typeof poolGetBallPos==='function'
      ? poolGetBallPos() : {x:gkX, y:gkY};
    var gkTargetX = gkTok ? gkTok.x : gkX;
    var gkTargetY = gkTok ? gkTok.y : gkY;
    if(typeof poolMoveToken==='function') poolMoveToken(gkTeam+'_GK', gkTargetX, gkTargetY);
    // Il portiere e' il destinatario della palla ferma: si registra come
    // ricevente, cosi' la prende davvero quando arriva.
    _pendingReceiver = {
      key: gkTeam+'_GK', team: gkTeam,
      startX: blockedBall.x, startY: blockedBall.y,
      totalDist: Math.max(0.02, _dist(gkTargetX, gkTargetY, blockedBall.x, blockedBall.y)),
      ready: true, _landed: true, _landedGrace: 0,
      _meetX: blockedBall.x, _meetY: blockedBall.y,
      _aimX: blockedBall.x, _aimY: blockedBall.y,
    };

    // Step 1 (0.5s di gioco): il portiere prende la palla SE E' VICINO.
    // Non si assegna il possesso a distanza: se il GK non e' arrivato, la
    // palla resta in acqua e la corsa alla palla libera la mette in gioco.
    _seq=[];_seqActive=false;
    _qA(0.5, function(){
      var gk=_tok(gkTeam+'_GK');
      if(!gk)return;
      var b=typeof poolGetBallPos==='function'?poolGetBallPos():{x:gkX,y:gkY};
      if(_dist(gk.x,gk.y,b.x,b.y) < 0.075){
        _ballOn(gkTeam+'_GK');  // assegna direttamente — siamo in _seq
        if(_ms) {
          if(gkTeam==='my') _ms.mySaves=(_ms.mySaves||0)+1;
          else               _ms.oppSaves=(_ms.oppSaves||0)+1;
        }
      }
    });

    // Step 2 (1.2s di gioco): rilancio del portiere verso il pos3.
    // E' un passaggio come tutti gli altri: punta sul lead del ricevitore e
    // può fallire. Prima la palla veniva lanciata alla posizione attuale del
    // pos3, che nel frattempo si spostava, e poi lo stesso pos3 si trovava
    // il possesso assegnato a forza.
    _qA(1.2, function(){
      if(_ballOwnerKey !== gkTeam+'_GK') return;   // palla non presa: corsa libera
      if(typeof poolReleaseBall==='function')poolReleaseBall();
      _ballOwnerKey=null;
      _pendingReceiver=null;

      var c3Key=gkTeam+'_3';
      var c3Tok=_tok(c3Key);
      var launchX,launchY;
      if(c3Tok&&!c3Tok.expelled){
        var gkNow=_tok(gkTeam+'_GK');
        var from=gkNow?{x:gkNow.x,y:gkNow.y}:{x:gkX,y:gkY};
        var aimGk=_passAim(c3Key, c3Tok, from.x, from.y);
        launchX=aimGk.aimX; launchY=aimGk.aimY;
        // Il pos3 nuota verso il punto di incontro
        if(typeof poolMoveToken==='function') poolMoveToken(c3Key, aimGk.leadX, aimGk.leadY);
        _pendingReceiver={
          key:c3Key, team:gkTeam, startX:from.x, startY:from.y,
          totalDist:Math.max(0.02, _dist(from.x,from.y,launchX,launchY)),
          ready:true, _landed:false, _landedGrace:0,
          _meetX:aimGk.leadX, _meetY:aimGk.leadY,
          _aimX:launchX, _aimY:launchY,
        };
      } else {
        var t3fb=gkTeam==='my'?ATK_MY['3']:ATK_OPP['3'];
        launchX=t3fb.x;launchY=t3fb.y;
      }
      if(typeof poolMoveBallDirect==='function')poolMoveBallDirect(launchX,launchY);
    });
    // Step 3 separato (no nesting): il pos3 ha la palla solo se l'ha presa
    _qA(1.6, function(){
      if(_ballOwnerKey)return;                 // il passaggio e' andato a buon fine
      if(_pendingReceiver)return;               // ancora in volo: lascia i tempi
      if(_ballOwnerKey !== null) return;
      _attack=gkTeam;
      _repositionAll(0.022);
    });
    _startSeq();
  }

  // ── PASSAGGIO / NEUTRO ────────────────────────────────────────
  function onPassOrNeutral(event) {
    if(!event||!event.ballTarget)return;
    var bx=event.ballTarget.x, by=event.ballTarget.y;

    // Determina la squadra in base a moverKey o possessore corrente
    var newTeam;
    if(event.moverKey) {
      newTeam = event.moverKey.split('_')[0];
    } else if(_ballOwnerKey) {
      newTeam = _ballOwnerKey.split('_')[0];
    } else {
      var cmY=_findClosestToken('my',bx,by), cmO=_findClosestToken('opp',bx,by);
      var tmY=cmY?_tok(cmY):null, tmO=cmO?_tok(cmO):null;
      var dY=tmY?_dist(tmY.x,tmY.y,bx,by):999, dO=tmO?_dist(tmO.x,tmO.y,bx,by):999;
      newTeam=(dY<=dO)?'my':'opp';
    }

    var oldTeam = _attack;
    var isStealing = (newTeam !== oldTeam) && _ballOwnerKey !== null;

    if(isStealing) {
      // Trova il difensore più vicino alla posizione palla corrente
      var ballPos = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:bx,y:by};
      var stealerTok = null, stealerKey = null, bestD = 999;
      ['1','2','3','4','5','6'].forEach(function(pk){
        var key = newTeam+'_'+pk;
        var tok = _tok(key);
        if(!tok||tok.expelled||tok.tempAbsent) return;
        var d = _dist(tok.x,tok.y,ballPos.x,ballPos.y);
        if(d<bestD){bestD=d;stealerKey=key;stealerTok=tok;}
      });
      if(stealerKey) {
        // Il difensore scatta sulla posizione della palla
        if(typeof poolMoveToken==='function') poolMoveToken(stealerKey, ballPos.x, ballPos.y);
        // Rilascia il vecchio possessore
        if(typeof poolReleaseBall==='function') poolReleaseBall();
        _ballOwnerKey = null;
        // La palla va verso il difensore che ha "rubato"
        if(typeof poolMoveBallDirect==='function') poolMoveBallDirect(ballPos.x, ballPos.y);
        // Assegna possesso al ladro dopo breve cooldown (palla ha distanza quasi 0)
        var launchBall2 = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:ballPos.x,y:ballPos.y};
        _pendingReceiver = {
          key: stealerKey, team: newTeam,
          startX: launchBall2.x, startY: launchBall2.y,
          totalDist: 0.001,   // distanza quasi zero: prende subito
          ready: true,        // pronto immediatamente (è già lì)
        };
        _attack = newTeam;
        return;
      }
    }

    // Il giocatore più vicino NUOTA verso la palla — la palla NON si muove
    var closest = event.moverKey || _findClosestToken(newTeam, bx, by);
    if(!closest) closest = _findClosestToken(oldTeam, bx, by);

    if(closest) {
      // Manda il giocatore sulla palla
      if(typeof poolMoveToken==='function') poolMoveToken(closest, bx, by);
      // Libera il possesso corrente
      if(typeof poolReleaseBall==='function') poolReleaseBall();
      _ballOwnerKey = null;
      _attack = newTeam;
      // Possesso assegnato quando il giocatore arriva (ready:true = distanza già 0)
      _pendingReceiver = {
        key: closest, team: newTeam,
        startX: bx, startY: by,
        totalDist: 0.001, ready: true,
      };
    }
  }

  // ── RIGORE ────────────────────────────────────────────────────
function onPenaltyKick(shooterTeam,isGoal,shooterPk) {
      // Durante una cinetica non si tocca la coda: si aspetta il riprimo.
      if(_inCinematic()){_deferEvent(onPenaltyKick,[shooterTeam,isGoal,shooterPk]);return;}
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
  // key: token che ha preso la palla. Opzionale, perche' non tutti i
  // chiamanti sanno chi ha il possesso (rimesse, inizio periodo): in quel
  // caso si aggiorna solo la squadra in attacco.
  function onPossessChange(team, key) {
    _attack=team;
    if(key) {
      // Il vincitore della corsa alla palla libera e' un possessore reale:
      // senza questo il suo _passT non ripartiva e non passava piu' mai.
      _ballOwnerKey=key;
      _pendingReceiver=null;
      _passT=0; _passNext=_rnd(1.5,2.5);
    }
    _shotClock=0;   // nuovo possesso → shot clock repart da 0
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
_hasPendingReceiver: function(){ return !!_pendingReceiver; },
      // Fase corrente: i test devono poter verificare che un evento capitato
      // durante una cinetica non lasci la partita incastata in 'goal_cel'.
      phase:  function(){ return _phase; },
      clearPendingReceiver: function(){ _pendingReceiver=null; _passT=0; _passNext=_rnd(1.5,2.5); },
    // Ricevitore in attesa: serve ai test e alla diagnostica per capire
    // dove il passatore ha mirato e cosa sta facendo il ricevitore.
    pendingReceiver: function(){ return _pendingReceiver; },
    // Forza un passaggio: i test non possono fare affidamento sui tempi
    // casuali del passaggio automatico.
    forcePass: function(){ return _autoPass(); },
  };

})();

window.MovementController = MovementController;
