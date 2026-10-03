// ─────────────────────────────────────────────────────────────────────
// canvas/pool.js  —  Rendering e simulazione campo  v0.7.5
//
// Modello: tutti i token si muovono CONTINUAMENTE ogni frame verso
// target aggiornati da MovementController. Nessuna animazione bloccante.
// ─────────────────────────────────────────────────────────────────────

const POOL_W = 760;
const POOL_H = 430;

// ── Geometria ──────────────────────────────────────────────────────
// Due sistemi di coordinate, con una sola scala fra i due.
//
// 1. Spazio "tattico" (quello storico): x 0.10..0.90, y 0.12..0.88.
//    Formazioni, clamp e costanti di movement.js parlano questo linguaggio.
//    Non va toccato: rifarlo significa riscrivere otto formazioni.
//
// 2. Spazio "acqua": quello che si VEDE. Le coordinate sono misurate
//    sull'immagine del campo (campo-goal.jpg): il rettangolo rosso e' il
//    confine oltre il quale la palla e' "fuori", i box neri sono le porte.
//    Il rettangolo dell'acqua e' un po' piu piccolo e rientrato rispetto a
//    quello tattico, ma ha la stessa forma: basta una scala uniforme attorno
//    al centro per passare dall'uno all'altro.
//
// Le costanti dell'acqua sono la verita' per quello che si vede e per i
// regolamenti (fuori, porta). Tutto quello che entra nel campo come
// bersaglio viene convertito qui, in un solo punto, con _w().

const WATER_SCALE = 0.9575;   // 0.10 -> 0.1170, 0.90 -> 0.8830 (misurati)

// Coordinate dell'acqua: confine "fuori", linee di porta, pali, reti.
const WATER = {
  x0: 0.117, x1: 0.883,        // linea rossa verticale (sx, dx)
  y0: 0.139, y1: 0.861,        // linea rossa orizzontale (alto, basso)
  goalY0: 0.414, goalY1: 0.586,// palo alto e basso (misurati, simmetrizzati su cy)
  myNetX0: 0.067, myNetX1: 0.117,   // box nero sinistro, dietro la linea
  oppNetX0: 0.883, oppNetX1: 0.933,  // box nero destro
  postR: 0.009,               // raggio del palo
  // Portiere: sta IN PIEDI sulla linea di porta, come in acquaolo. Con la
  // scala uniforme il vecchio myGKX (0.115, spazio tattico) cadrebbe dietro
  // la linea di porta (0.117), quindi va ricalcolato in spazio acqua.
  myGKX: 0.141, oppGKX: 0.859,
  gkPadY: 0.022,              // quanto il portiere resta dentro dai pali
};

// Spazio tattico -> spazio acqua. Applicata a ogni bersaglio in entrata.
function _w(v){ return 0.5 + (v - 0.5)*WATER_SCALE; }

// Braccia del portiere: quanto copre intorno a se'. Regolabile perche' e' il
// parametro che decide la percentuale di gol: troppo largo e il portiere
// salva tutto (0.048 dava 0 gol su 49 tiri), troppo stretto e non para piu'
// niente. 0.025 e' tarato su 198 tiri: conversione del 20.7%.
var GK_REACH = 0.025;
function poolSetKeeperReach(v){ GK_REACH = v; }
function poolGetKeeperReach(){ return GK_REACH; }

const PLAY = {
  x0: 0.10, x1: 0.90, y0: 0.12, y1: 0.88,
  cx: 0.50, cy: 0.50,
  myGoalX: 0.08,  oppGoalX: 0.92,
  myGoalY0: 0.38, myGoalY1: 0.62,
  oppGoalY0: 0.38, oppGoalY1: 0.62,
  // Portiere: rimane SULLA linea di porta (x fisso, solo y varia tra i pali)
  myGKX:    0.115,  // x fisso portiere: 2m avanti dalla linea di porta
  oppGKX:   0.885,  // x fisso portiere avversario: 2m avanti dalla linea
  myGKminX: 0.08,  myGKmaxX: 0.10,   // range strettissimo attorno alla linea
  oppGKminX: 0.90, oppGKmaxX: 0.92,
  // Zona dei 2 metri: area vietata agli attaccanti (regolamento Art.8)
  // Il CB (pos6) in attacco NON può entrare nei 2m avversari
  myTwoMeterX:  0.20,   // limite 2m zona nostra  (pos6 avv non può andare a sx di questo)
  oppTwoMeterX: 0.80,   // limite 2m zona avv     (pos6 my non può andare a dx di questo)
  myNetX0: 0.02,  myNetX1: 0.09,  myNetY0: 0.38, myNetY1: 0.62,
  oppNetX0: 0.91, oppNetX1: 0.98, oppNetY0: 0.38, oppNetY1: 0.62,
};

// ── Posizioni di partenza (kickoff) ───────────────────────────────
const KICKOFF_MY = {
  GK: {x:0.09,y:0.50}, '5':{x:0.13,y:0.20}, '4':{x:0.13,y:0.35},
  '6':{x:0.13,y:0.50}, '3':{x:0.13,y:0.50}, '2':{x:0.13,y:0.65}, '1':{x:0.13,y:0.80},
};
const KICKOFF_OPP = {
  GK: {x:0.91,y:0.50}, '1':{x:0.87,y:0.20}, '2':{x:0.87,y:0.35},
  '6':{x:0.87,y:0.50}, '3':{x:0.87,y:0.50}, '4':{x:0.87,y:0.65}, '5':{x:0.87,y:0.80},
};

// ── Formazioni tattica ─────────────────────────────────────────────
// Attacco: semicerchio davanti alla porta avversaria (da foto)
const ATK_MY = {
  GK:{x:0.09,y:0.50},
  '5':{x:0.68,y:0.17}, '4':{x:0.60,y:0.32}, '6':{x:0.87,y:0.50},
  '3':{x:0.55,y:0.50}, '2':{x:0.60,y:0.68}, '1':{x:0.68,y:0.83},
};
const ATK_OPP = {
  GK:{x:0.91,y:0.50},
  '1':{x:0.32,y:0.17}, '2':{x:0.40,y:0.32}, '6':{x:0.13,y:0.50},
  '3':{x:0.45,y:0.50}, '4':{x:0.40,y:0.68}, '5':{x:0.32,y:0.83},
};
// Difesa: compatta davanti alla propria porta
const DEF_MY = {
  GK:{x:0.09,y:0.50},
  '5':{x:0.23,y:0.21}, '4':{x:0.30,y:0.35}, '6':{x:0.37,y:0.50},
  '3':{x:0.30,y:0.50}, '2':{x:0.30,y:0.65}, '1':{x:0.23,y:0.79},
};
const DEF_OPP = {
  GK:{x:0.91,y:0.50},
  '1':{x:0.77,y:0.21}, '2':{x:0.70,y:0.35}, '6':{x:0.63,y:0.50},
  '3':{x:0.70,y:0.50}, '4':{x:0.70,y:0.65}, '5':{x:0.77,y:0.79},
};
// Rimessa post-goal
const RESET_MY_ATK  = {GK:{x:0.09,y:0.50},'5':{x:0.51,y:0.18},'4':{x:0.47,y:0.34},'6':{x:0.50,y:0.50},'3':{x:0.48,y:0.50},'2':{x:0.47,y:0.66},'1':{x:0.51,y:0.82}};
const RESET_OPP_DEF = {GK:{x:0.91,y:0.50},'1':{x:0.78,y:0.22},'2':{x:0.72,y:0.36},'6':{x:0.66,y:0.50},'3':{x:0.72,y:0.50},'4':{x:0.72,y:0.64},'5':{x:0.78,y:0.78}};
const RESET_OPP_ATK = {GK:{x:0.91,y:0.50},'1':{x:0.49,y:0.18},'2':{x:0.53,y:0.34},'6':{x:0.50,y:0.50},'3':{x:0.52,y:0.50},'4':{x:0.53,y:0.66},'5':{x:0.49,y:0.82}};
const RESET_MY_DEF  = {GK:{x:0.09,y:0.50},'5':{x:0.22,y:0.22},'4':{x:0.28,y:0.36},'6':{x:0.34,y:0.50},'3':{x:0.28,y:0.50},'2':{x:0.28,y:0.64},'1':{x:0.22,y:0.78}};

// ── Velocità ───────────────────────────────────────────────────────
// VEL=100, stamina=100 → tutto il campo (0.80 unità) in 12s reali
var _FIELD_W    = 0.80;
var _VEL100_T   = 12.0;
var _BASE_SPD   = _FIELD_W / _VEL100_T;   // ≈ 0.0667 unità/s

// ── Stato ──────────────────────────────────────────────────────────
var _tokens     = {};
var _tokenSpd   = {};       // key → unità/s
var _ball       = {x:0.5, y:0.5, tx:0.5, ty:0.5};
var _ballOwner  = null;     // chiave token possessore
var _ballFly    = null;     // {x0,y0,x1,y1,dist} — traiettoria del volo corrente (parabola)
var _ballAttach = false;    // la palla sta viaggiando verso il possessore: non e' ancora agganciata
var _phase      = 'idle';   // 'idle'|'play'
var _attack     = 'my';     // chi ha il possesso
var _pressKey   = null;     // chiave del token sotto pressione (per visual)
var _goalAnim   = null;     // overlay goal canvas

// ── Asset ──────────────────────────────────────────────────────────
var _bgImg=null, _bgReady=false, _ballImg=null, _ballReady=false;
(function(){var i=new Image();i.onload=function(){_bgImg=i;_bgReady=true;};i.src='campo-per-pallanuoto.jpg';})();
(function(){var i=new Image();i.onload=function(){_ballImg=i;_ballReady=true;};i.src='palla.png';})();

// ── Helpers ────────────────────────────────────────────────────────
function _clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function _rnd(lo,hi){return lo+Math.random()*(hi-lo);}
function _rndSmall(){return _rnd(-0.008,0.008);}  // piccolo jitter posizione
function _shortName(p){return (p&&p.name)?p.name:'';}
function _dist2d(x1,y1,x2,y2){var dx=x2-x1,dy=y2-y1;return Math.sqrt(dx*dx+dy*dy);}

function _ballOffsetForToken(tok) {
  var hand = 'R';
  if (tok.team==='my' && typeof G!=='undefined' && G.ms && G.ms.myRoster) {
    var p = G.ms.myRoster[tok.pi];
    if (p && p.hand) hand = p.hand;
  }
  if (hand === 'AMB') { return {dx:0, dy:0}; }

  // La palla sta SOPRA o SOTTO il segnalino in base alla mano e alla direzione di attacco.
  // Attacco sx→dx (attackRight=true):  mano R → sotto (+dy),  mano L → sopra (-dy)
  // Attacco dx→sx (attackRight=false): mano R → sopra (-dy),  mano L → sotto (+dy)
  var attackRight = (tok.team==='my') ? (_attack==='my') : (_attack==='opp');
  var dyVal = 0.032;   // distanza verticale dal centro del segnalino
  if (hand === 'R') {
    return { dx: 0, dy: attackRight ? +dyVal : -dyVal };
  }
  // L
  return   { dx: 0, dy: attackRight ? -dyVal : +dyVal };
}

// ── Inizializzazione ───────────────────────────────────────────────
function poolInitTokens(ms) {
  _tokens={};_ball={x:PLAY.cx,y:PLAY.cy,tx:PLAY.cx,ty:PLAY.cy};
  _ballOwner=null;_ballFreeTimer=0;_ballInFlight=false;_ballStuckTimer=0;_phase='idle';_attack='my';_goalAnim=null;_pressKey=null;_ballFly=null;_ballAttach=false;
  // Stato del rilevamento di gol/fuori: riparte pulito a ogni inizio partita
  _shotTeam=null;_lastBallX=null;_lastBallY=null;

  Object.entries(ms.onField).forEach(function(e){
    var pk=e[0],pi=e[1],p=ms.myRoster[pi];
    var pos=KICKOFF_MY[pk]||{x:0.13,y:0.50};
    // Il portiere parte sempre sulla linea di porta (x fisso)
    var initX = (pk==='GK') ? WATER.myGKX : _w(pos.x);
    var initY = (pk==='GK') ? PLAY.cy : _w(pos.y);
    _tokens['my_'+pk]={x:initX,y:initY,tx:initX,ty:initY,
      team:'my',pk:pk,pi:pi,isGK:pk==='GK',posLabel:pk==='GK'?'P':pk,
      shortName:_shortName(p),shirt:ms.shirtNumbers[pi]||'',yellows:0,expelled:false};
  });
  Object.keys(KICKOFF_OPP).forEach(function(pk){
    var pos=KICKOFF_OPP[pk];
    var initX = (pk==='GK') ? WATER.oppGKX : _w(pos.x);
    var initY = (pk==='GK') ? PLAY.cy : _w(pos.y);
    _tokens['opp_'+pk]={x:initX,y:initY,tx:initX,ty:initY,
      team:'opp',pk:pk,pi:-1,isGK:pk==='GK',posLabel:pk==='GK'?'P':pk,
      shortName:'',shirt:'',yellows:0,expelled:false};
  });
}

function poolSyncTokens(ms) {
  Object.entries(ms.onField).forEach(function(e){
    var pk=e[0],pi=e[1],tok=_tokens['my_'+pk];if(!tok)return;
    tok.pi=pi;tok.shirt=ms.shirtNumbers[pi]||'';tok.shortName=_shortName(ms.myRoster[pi]);
    tok.yellows=ms.tempExp[pi]||0;tok.expelled=ms.expelled.has(pi);tok.posLabel=pk==='GK'?'P':pk;
  });

  // Nascondi visivamente il token assente per superiorità/inferiorità
  // Superiorità nostra (6v5): opp_4 è assente (avversario espulso)
  // Inferiorità nostra (5v6): my_4 è temporaneamente fuori
  var sup = ms.superiorityActive;
  var inf = ms.inferiorityActive;
  ['GK','1','2','3','4','5','6'].forEach(function(pk){
    var myTok  = _tokens['my_'+pk];
    var oppTok = _tokens['opp_'+pk];
    if(myTok)  myTok.tempAbsent  = (inf && pk==='4');
    if(oppTok) oppTok.tempAbsent = (sup && pk==='4');
  });

  poolSetSpeeds(ms);
}

function poolSetSpeeds(ms) {
  if(!ms)return;
  Object.entries(ms.onField).forEach(function(e){
    var pk=e[0],pi=e[1],p=ms.myRoster[pi];if(!p)return;
    var spe=(p.stats&&p.stats.spe)?p.stats.spe:50;
    var sta=(ms.stamina&&ms.stamina[pi]!==undefined)?ms.stamina[pi]:(p.fitness||50);
    _tokenSpd['my_'+pk]=_BASE_SPD*(spe/100)*(0.5+(sta/100)*0.5);
  });
  ['GK','1','2','3','4','5','6'].forEach(function(pk){_tokenSpd['opp_'+pk]=_BASE_SPD*0.65;});
}

// ── Controllo fase ─────────────────────────────────────────────────
function poolGetPhase()   {return _phase;}
function poolGetTokens()  {return _tokens;}
function poolGetToken(key){return _tokens[key]||null;}
function poolGetTokenSpeeds(){return _tokenSpd;}
function poolGetBallPos() {return {x:_ball.x, y:_ball.y};}  // espone posizione palla
function poolGetBallOwner(){return _ballOwner||null;}          // espone possessore corrente
function poolGetKickoffPos(team,pk){
  var t=team==='my'?KICKOFF_MY:KICKOFF_OPP;
  return t[pk]?{x:t[pk].x,y:t[pk].y}:{x:PLAY.cx,y:PLAY.cy};
}

// ── Movimento token ────────────────────────────────────────────────
function poolMoveToken(key,tx,ty) {
  var tok=_tokens[key];if(!tok)return;
  // Spazio tattico -> acqua. Tutto quello che arriva da movement.js e' in
  // spazio tattico e viene convertito qui, una volta sola.
  tx=_w(tx); ty=_w(ty);
  if(tok.isGK){
    // Portiere: x fisso sulla linea di porta, y solo tra i pali
    tok.tx = tok.team==='my' ? WATER.myGKX : WATER.oppGKX;
    tok.ty = _clamp(ty, WATER.goalY0+WATER.gkPadY, WATER.goalY1-WATER.gkPadY);
    return;
  }
  // Regola 2 metri (Art.8): il CB (pos6) in attacco non può entrare nell'area dei 2m avversari
  if(tok.pk==='6') {
    if(tok.team==='my')  tx = Math.min(tx, _w(PLAY.oppTwoMeterX));
    if(tok.team==='opp') tx = Math.max(tx, _w(PLAY.myTwoMeterX));
  }
  // Il campo e' l'acqua: nessuna pedina puo' stare oltre la linea rossa.
  tok.tx=_clamp(tx,WATER.x0,WATER.x1);
  tok.ty=_clamp(ty,WATER.y0,WATER.y1);
}

// ── Palla ──────────────────────────────────────────────────────────
function poolMoveBall(tx,ty) {
  // Alias di poolMoveBallDirect — imposta sempre _ballInFlight
  poolMoveBallDirect(tx,ty);
}
function poolGetBallSpeed(gameSpeed) {
  return _BASE_SPD*4.0*(gameSpeed||1);
}
// true solo mentre la palla e' lanciata verso un bersaglio. False = la palla
// e' ferma e in attesa che qualcuno la raggiunga.
function poolBallInFlight() { return !!_ballInFlight; }
function poolMoveBallDirect(tx,ty) {
  // LANCIO: la palla parte dalla posizione corrente verso tx,ty.
  // La palla è "in volo" fino a quando non viene raccolta fisicamente.
  var fx=_ball.x, fy=_ball.y;
  tx=_w(tx); ty=_w(ty);
  // Il clamp precedente fermava la palla sul confine del campo (0.117/0.883):
  // un tiro mirato alla rete finiva sempre un centimetro PRIMA della linea di
  // porta, quindi il gol non poteva mai avvenire. Ora la palla può arrivare
  // fino al fondo della rete: e' _checkBallEvent a stabilire se quel punto e'
  // un gol (tra i pali) o un tiro fuori.
  var ftx=_clamp(tx,WATER.myNetX0,WATER.oppNetX1), fty=_clamp(ty,WATER.y0,WATER.y1);
  var dx=ftx-fx, dy=fty-fy;
  var dist=Math.sqrt(dx*dx+dy*dy);
  _ballOwner=null;
  // Stacca la palla dalla pedina che la stava ancora ricevendo. Senza questo
  // un tiro lanciato mentre la palla viaggiava verso un giocatore veniva
  // ignorato: restava attaccata al passaggio vecchio e andava al suo target,
  // mentre il nuovo tiro spariva.
  _ballAttach=false;
  _ball.tx=ftx; _ball.ty=fty;
  _ballFly=(dist>0.005)?{x0:fx,y0:fy,x1:ftx,y1:fty,dist:dist}:null;
  // La palla è in volo: il timer di raccolta libera si azzera
  // (non si può raccogliere prima che arrivi a destinazione)
  _ballFreeTimer=0;
  _ballInFlight=true;
}
// Segna il volo in corso come TIRO della squadra `team` verso la porta
// avversaria. Solo i tiri possono finire in rete: un passaggio che esce dal
// campo e' "fuori", non un gol.
function poolMarkShot(team){ _shotTeam = team || null; }
function poolShotTeam(){ return _shotTeam; }
function poolSetBallOn(key) {
  if(_tokens[key]){
    _ballOwner=key; _ballFly=null; _ballInFlight=false;
    // Se la palla e' lontana dal nuovo possessore non gli compare addosso:
    // la fa' viaggiare. Altrimenti al cambio di possesso spariva e
    // ri compariva dall'altra parte del campo.
    var tok=_tokens[key];
    var ddx=tok.x-_ball.x, ddy=tok.y-_ball.y;
    _ballAttach=(Math.sqrt(ddx*ddx+ddy*ddy)>0.03);
  }
}
function poolReleaseBall() {
  _ballInFlight=false;  // il lancio avviene subito dopo con poolMoveBallDirect
  // Quando la palla viene rilasciata con un target già impostato, inizia il volo
  if(_ballOwner){
    var tok=_tokens[_ballOwner];
    if(tok){ var fx=tok.x,fy=tok.y,ftx=_ball.tx,fty=_ball.ty;
      var dx=ftx-fx,dy=fty-fy,dist=Math.sqrt(dx*dx+dy*dy);
      _ballFly=(dist>0.01)?{x0:fx,y0:fy,x1:ftx,y1:fty,dist:dist}:null; }
  }
  _ballOwner=null;
}

// ── Possesso / fase ────────────────────────────────────────────────
function poolSetAttack(team) {_attack=team;}
function poolSetPhaseFromMC(phase,attack) {
  if(phase!==undefined)_phase=phase;
  if(attack!==undefined)_attack=attack;
}
function poolSetPressTarget(key) {_pressKey=key;}  // token avversario sotto pressione

// ── Inizio periodo ─────────────────────────────────────────────────
function poolStartPeriod() {
  _phase='idle';_goalAnim=null;_ballOwner=null;
  _ballFreeTimer=0;_ballInFlight=false;_ballStuckTimer=0;_pressKey=null;_ballFly=null;
  _ball.tx=PLAY.cx;_ball.ty=PLAY.cy;
  _shotTeam=null;_lastBallX=null;_lastBallY=null;
  Object.values(_tokens).forEach(function(tok){
    if(tok.expelled)return;
    var pos=tok.team==='my'?KICKOFF_MY[tok.pk]:KICKOFF_OPP[tok.pk];
    if(pos){var px=_w(pos.x),py=_w(pos.y);tok.x=px;tok.y=py;tok.tx=px;tok.ty=py;}
  });
}

// ── Sprint kickoff (compat) ────────────────────────────────────────
function poolBeginSprint(prevSpeed) {
  if(_phase!=='idle')return;
  _phase='sprint';
  if(typeof MovementController!=='undefined'&&MovementController.onSprintStart)
    MovementController.onSprintStart(prevSpeed);
}

// ── Goal canvas overlay ────────────────────────────────────────────
function poolTriggerGoalAnim(scorer,team,teamName) {
  _goalAnim={timer:0,total:2.5,scorer:scorer||'',team:team||'my',teamName:teamName||''};
}
function poolShowGoal(scorer,team,teamName){poolTriggerGoalAnim(scorer,team,teamName);}

// ── Rilevamento di gol e di palla fuori ───────────────────────────
// Fin qui non esisteva NULLA di tutto questo: la palla veniva bloccata dal
// clamp sul confine del campo, quindi non poteva ne' entrare in porta ne'
// uscire, e goal/fuori erano decidedi a probabilita' prima di muovere la
// palla. Qui la palla arriva davvero dove e' stata lanciata e si guarda DOVE
// e' arrivata.
//
// Gli eventi sono consegnati a movement.js con poolSetBallEventHandler, che
// decide punteggio, animazioni e rimesse. Qui sotto c'e' solo geometria.

var _shotTeam = null;                 // squadra che ha tirato, se e' un tiro
var _lastBallX = null, _lastBallY = null;  // posizione precedente (per il attraversamento)
var _ballEventHandler = null;

function poolSetBallEventHandler(fn){ _ballEventHandler = fn; }

// La palla e' dentro la porta? (tra i pali, non solo nel box nero)
function _ballInMouth(bx,by,side){
  if(by < WATER.goalY0 || by > WATER.goalY1) return false;
  return side==='my' ? (bx <= WATER.x0 + WATER.postR) : (bx >= WATER.x1 - WATER.postR);
}

// Punto in cui il segmento palla precedente -> attuale ha superato la linea
// `line` sull'asse `axis`. Serve a fermare la palla ESATTAMENTE sulla linea
// rossa e non centimeters oltre: a velocita' 10 un frame porta la palla piu'
// in la' del confine, e senza questo la palla si fermerebbe gia' fuori.
// Restituisce null se il segmento non ha superato la linea.
function _crossPoint(prev, cur, axis, line){
  var a = prev[axis], b = cur[axis];
  if(a === b) return null;
  var t = (line - a)/(b - a);
  if(t < 0 || t > 1) return null;
  return {
    t: t,
    x: axis==='x' ? line : cur.x + (prev.x - cur.x)*t,
    y: axis==='y' ? line : cur.y + (prev.y - cur.y)*t,
  };
}

// Segnala e ferma la palla appena supera una linea. Non aggiorna la
// posizione precedente: quella la registra poolAnimStep a fine frame, anche
// nei frame in cui questo controllo non gira. Se la registrazione stesse qui,
// un lancio che porta la palla fuori campo in un solo frame (a velocita' 10
// capita) partirebbe da una posizione vecchia di molti frame e
// l'attraversamento non verrebbe visto.
function _checkBallEvent() {
    var bx=_ball.x, by=_ball.y;
    if(_lastBallX === null) return;
    var prev = {x:_lastBallX, y:_lastBallY};

  // ── PARATA ──────────────────────────────────────────────────────────────
  // Se il tiro in volo passa entro il raggio d'azione del portiere che
  // difende, lo blocca. Non c'e' nessun dado: conta la distanza fra palla e
  // portiere in quell'istante. Il portiere insegue la palla in y ma ha una
  // velocita' limitata, quindi sui tiri veloci e angolati arriva tardi e la
  // palla passa. Se il tiro arriva fuori dalla sua portata non c'e' nessuna
  // parata e la palla prosegue: sara' un tiro fuori.

  var gkKey = _shotTeam ? (_shotTeam==='my' ? 'opp_GK' : 'my_GK') : null;
  var gk = gkKey ? _tokens[gkKey] : null;
  if(gk && !gk.expelled && !gk.tempAbsent) {
    if(Math.sqrt((bx-gk.x)*(bx-gk.x) + (by-gk.y)*(by-gk.y)) < GK_REACH) {
      // La palla resta DOVE e' stata presa, davanti alla porta. Non la si
      // sposta: spostarla qui la farebbe teletrasportare. Se il portiere la
      // prende davvero ha il possesso, se no resta in acqua e se la
      // contendono i piu' vicini: e' movement.js a decidere, guardando se il
      // portiere e' arrivato in tempo.
      _fireEvent({ type:'save', team:_shotTeam, gkTeam:gk.team, x:bx, y:by });
      return;
    }
  }

  // ── Linee di fondo (lungo x) ────────────────────────────────────────────
  var cp = _crossPoint(prev, {x:bx,y:by}, 'x', WATER.x0);
  if(!cp) cp = _crossPoint(prev, {x:bx,y:by}, 'x', WATER.x1);
  if(cp) {
    var lato = cp.x <= WATER.x0 ? 'my' : 'opp';   // rete di chi subisce
    // Superata la linea di porta: se la palla passa tra i pali e il volo e'
    // un TIRO, e' gol. Se passa fuori dai pali, e' un tiro fuori.
    if(_shotTeam && _ballInMouth(cp.x, cp.y, lato)) {
      _fireEvent({ type:'goal', team: lato==='my' ? 'opp' : 'my',
                   shooter:_shotTeam, x:cp.x, y:cp.y });
    } else {
      _fireEvent({ type:'out', team:_shotTeam, x:cp.x, y:cp.y });
    }
    return;
  }

  // ── Linee laterali (lungo y) ───────────────────────────────────────────
  cp = _crossPoint(prev, {x:bx,y:by}, 'y', WATER.y0);
  if(!cp) cp = _crossPoint(prev, {x:bx,y:by}, 'y', WATER.y1);
  if(cp) { _fireEvent({ type:'out', team:_shotTeam, x:cp.x, y:cp.y }); }
}

function _fireEvent(ev) {
  // La palla si ferma sul punto in cui e' successo: un "fuori" non la riporta
  // al centro campo, e un gol la lascia in rete.
  _ball.x = ev.x; _ball.y = ev.y;
  _ball.tx = ev.x; _ball.ty = ev.y;
  _ballFly = null;
  _ballInFlight = false;
  _ballAttach = false;
  _lastBallX = null; _lastBallY = null;   // azzera: evita eventi a raffica
  _shotTeam = null;
  if(typeof _ballEventHandler === 'function') _ballEventHandler(ev);
}

// ── Portieri ───────────────────────────────────────────────────────
function _updateKeepers() {
  var by = _ball.y;
  var myGK = _tokens['my_GK'];
  if(myGK && !myGK.expelled) {
    // Portiere SEMPRE sulla linea di porta (x fisso), solo y segue la palla tra i pali
    myGK.tx = WATER.myGKX;
    myGK.ty = _clamp(by, WATER.goalY0+WATER.gkPadY, WATER.goalY1-WATER.gkPadY);
  }
  var oppGK = _tokens['opp_GK'];
  if(oppGK && !oppGK.expelled) {
    oppGK.tx = WATER.oppGKX;
    oppGK.ty = _clamp(by, WATER.goalY0+WATER.gkPadY, WATER.goalY1-WATER.gkPadY);
  }
}
function poolUpdateKeepers(){_updateKeepers();}

// ── Formazioni helper ──────────────────────────────────────────────
function poolResetToken(key){}  // compat stub

// Timer palla libera: se la palla non ha possessore per più di 1.5s,
// il giocatore più vicino la raccoglie automaticamente
var _ballFreeTimer   = 0;
var _ballInFlight    = false; // true mentre la palla è in volo (lanciata)
var _ballStuckTimer  = 0;     // safety: forza pickup se palla è bloccata troppo a lungo
var BALL_FREE_MAX    = 1.5;
var BALL_STUCK_MAX   = 2.5;   // secondi massimi senza possessore prima del reset forzato
// Attesa prima che i giocatori si muovano verso la palla rimasta in acqua.
// Piccola: la palla appena mancata la cercano subito i piu' vicini di ogni
// squadra. Con 1.0s la palla restava ferma a terra mentre nessuno reagiva.
var BALL_RACE_DELAY  = 0.25;

// ── Step animazione ────────────────────────────────────────────────
// gameSpeed = G.ms.speed (1=normale, 2=doppio, 10x…)
// I token nuotano SEMPRE — la velocità fisica scala con gameSpeed.
// A 2x nuotano il doppio, a 10x dieci volte più veloci.
function poolAnimStep(dt, gameSpeed) {
  var f = Math.min(dt, 0.1);
  gameSpeed = gameSpeed || 1;

  // Timer overlay GOAL — avanza sempre
  if(_goalAnim){
    _goalAnim.timer+=f;
    if(_goalAnim.timer>=_goalAnim.total)_goalAnim=null;
  }

  // Goal e "fuori" NON si decidono piu' qui dentro: non c'e' nessun
  // _pendingGoal da aspettare (era una variabile che non veniva mai
  // assegnata, quindi questo ramo era codice morto). La palla arriva dove e'
  // stata lanciata e _checkBallEvent(), in fondo a questo step, guarda dove
  // si trova davvero.

  // Portieri seguono sempre la palla
  if(_phase!=='idle')_updateKeepers();

  // ── Safety timer: palla bloccata troppo a lungo → forza reset ──────────
  // Solo se la palla e' FERMA e non posseduta: durante un volo la palla si
  // muove, e un passaggio lunghetto non e' "bloccata".
  if(_phase==='play' && !_ballOwner && !_ballInFlight) {
    _ballStuckTimer += f;
    if(_ballStuckTimer >= BALL_STUCK_MAX) {
      // Palla ferma da troppo tempo: azzera tutti i flag e forza corsa immediata
      _ballInFlight = false;
      _ballFreeTimer = BALL_RACE_DELAY;  // triggera subito la corsa
      _ballStuckTimer = 0;
      // Notifica movement.js di resettare pendingReceiver
      if(typeof MovementController !== 'undefined' && MovementController.clearPendingReceiver)
        MovementController.clearPendingReceiver();
    }
  } else {
    _ballStuckTimer = 0;
  }

  // ── Corsa alla palla libera: un giocatore per squadra nuota verso la palla ──
  // Dopo 1s senza possessore, il giocatore più vicino di OGNI squadra scatta
  // verso la palla. Chi arriva prima prende possesso; l'altro diventa il pressore.
  // La palla rimane ferma — è raggiunta dai giocatori, non spostata.
  if(_phase==='play' && !_ballOwner) {
    var hasPending = (typeof MovementController !== 'undefined' &&
      typeof MovementController._hasPendingReceiver === 'function' &&
      MovementController._hasPendingReceiver());

    if(!hasPending && !_ballInFlight) {
      _ballFreeTimer += f;

      if(_ballFreeTimer >= BALL_RACE_DELAY) {
        var bpx=_ball.x, bpy=_ball.y;

        // Il flag _raceTo dice a movement.js chi sta cercando la palla: quei
        // due non vanno riposizionati tatticamente, altrimenti il
        // riposizionamento li rimanda in formazione proprio mentre stanno
        // arrivando a raccoglierla.
        Object.values(_tokens).forEach(function(t){ t._raceTo = false; });

        // Trova il più vicino per ciascuna squadra
        var bestMy=null, bestMyDist=999, bestOpp=null, bestOppDist=999;
        Object.values(_tokens).forEach(function(tok){
          if(tok.expelled||tok.tempAbsent||tok.isGK)return;
          var ddx=tok.x-bpx, ddy=tok.y-bpy;
          var dd=Math.sqrt(ddx*ddx+ddy*ddy);
          if(tok.team==='my'  && dd<bestMyDist) { bestMyDist=dd;  bestMy=tok;  }
          if(tok.team==='opp' && dd<bestOppDist){ bestOppDist=dd; bestOpp=tok; }
        });

        // Entrambi scattano verso la palla
        if(bestMy)  { bestMy.tx  = bpx + _rndSmall(); bestMy.ty  = bpy + _rndSmall(); bestMy._raceTo = true; }
        if(bestOpp) { bestOpp.tx = bpx + _rndSmall(); bestOpp.ty = bpy + _rndSmall(); bestOpp._raceTo = true; }

        // Chi raggiunge prima prende possesso
        var myReached  = bestMy  ? Math.sqrt(Math.pow(bestMy.x -bpx,2)+Math.pow(bestMy.y -bpy,2))  : 999;
        var oppReached = bestOpp ? Math.sqrt(Math.pow(bestOpp.x-bpx,2)+Math.pow(bestOpp.y-bpy,2)) : 999;

        var winner = null;
        if(myReached  < 0.055 && myReached  <= oppReached) winner = bestMy;
        else if(oppReached < 0.055 && oppReached < myReached) winner = bestOpp;

        if(winner) {
          _ballFreeTimer = 0;
          // Stessa via di ogni altra presa di possesso: se la palla e'
          // ancora qualche centimetro lontana la raggiunge, non compare
          // addosso al giocatore.
          poolSetBallOn(winner.team+'_'+winner.pk);
          // Aggiorna possesso in MovementController. Il token vincitore va
          // comunicato esplicitamente: senza, MovementController continua a
          // credere che nessuno abbia la palla e il giocatore che l'ha
          // recuperata non passa e non tira mai.
          if(typeof MovementController!=='undefined' && MovementController.onPossessChange)
            MovementController.onPossessChange(winner.team, _ballOwner);
        }
      }
    } else {
      _ballFreeTimer = 0;
    }
  } else if(_ballOwner) {
    _ballFreeTimer=0;
  }
  // La corsa e' finita: nessuno e' piu' in caccia della palla e il
  // riposizionamento tattico puo' tornare a valere.
  if(_ballOwner || _ballInFlight || hasPending || _phase!=='play') {
    Object.values(_tokens).forEach(function(t){ t._raceTo = false; });
  }

  // Palla segue il possessore (ogni frame)
  if(_ballOwner){
    var ow=_tokens[_ballOwner];
    if(ow&&!ow.expelled){
      var off=_ballOffsetForToken(ow);
      _ball.tx=_clamp(ow.x+off.dx,WATER.x0,WATER.x1);
      _ball.ty=_clamp(ow.y+off.dy,WATER.y0,WATER.y1);
    } else { _ballOwner=null; _ballAttach=false; }
  }

  // ── Movimento token — velocità scalata con gameSpeed ──────────
  Object.values(_tokens).forEach(function(tok){
    if(tok.expelled)return;
    var dx=tok.tx-tok.x, dy=tok.ty-tok.y;

    if(tok.isGK) {
      // Portiere: x SEMPRE fissa sulla linea di porta, in ogni condizione
      var gkFixedX = tok.team==='my' ? WATER.myGKX : WATER.oppGKX;
      tok.x  = gkFixedX;   // posizione reale
      tok.tx = gkFixedX;   // target (evita derive future)
      var ddy = tok.ty - tok.y;
      if(Math.abs(ddy) < 0.001) { tok.y = tok.ty; }
      else {
        var gkSpd = (_tokenSpd[tok.team+'_GK'] || _BASE_SPD) * gameSpeed * 1.5;
        var gs = gkSpd * f;
        if(gs >= Math.abs(ddy)) { tok.y = tok.ty; }
        else { tok.y += (ddy > 0 ? 1 : -1) * gs; }
      }
      // Clamp y tra i pali
      tok.y  = _clamp(tok.y,  WATER.goalY0+WATER.gkPadY, WATER.goalY1-WATER.gkPadY);
      tok.ty = _clamp(tok.ty, WATER.goalY0+WATER.gkPadY, WATER.goalY1-WATER.gkPadY);
      return;
    }

    var d=Math.sqrt(dx*dx+dy*dy);
    if(d<0.001){ tok.x=tok.tx; tok.y=tok.ty; return; }
    var spd=(_tokenSpd[tok.team+'_'+tok.pk]||_BASE_SPD) * gameSpeed;
    var s=spd*f;
    if(s>=d){ tok.x=tok.tx; tok.y=tok.ty; }
    else { tok.x+=dx/d*s; tok.y+=dy/d*s; }
  });

  // ── Movimento palla ────────────────────────────────────────────
  // REGOLA: la palla si muove SOLO se una pedina la detiene, oppure se e'
  // in un volo lanciato verso un bersaglio. In ogni altro caso e' FERMA.
  //
  // Prima il ramo "senza possessore" inseguiva _ball.tx/_ball.ty a qualunque
  // velocita': se il target era un punto vecchio (la posizione di un
  // giocatore che non c'era piu') la palla continuava a scivolare da sola
  // attraverso il campo, e nessuna pedina la toccava. Il rilascio del
  // possessore su una parata faceva esattamente questo: la palla veniva
  // lanciata verso la linea di porta e attraversava il bacino da sola.
  //
  // Se invece la palla e' ferma e nessuno la possiede, e' "palla libera": la
  // corsa qui sopra fa muovere i giocatori piu' vicini di ogni squadra verso
  // di lei. La palla non si sposta da sola.
  if(_ballOwner){
    // Possesso piu' la palla viaggia verso il nuovo possessore invece di
    // comparirgli addosso: al cambio di possesso la palla attraversava il
    // campo di colpo. _ballAttach resta true finche' non arriva.
    if(_ballAttach){
      var adx=_ball.tx-_ball.x, ady=_ball.ty-_ball.y;
      var ad=Math.sqrt(adx*adx+ady*ady);
      var aspd=poolGetBallSpeed(gameSpeed)*f;
      if(aspd>=ad){ _ball.x=_ball.tx; _ball.y=_ball.ty; _ballAttach=false; }
      else { _ball.x+=adx/ad*aspd; _ball.y+=ady/ad*aspd; }
    } else {
      _ball.x=_ball.tx; _ball.y=_ball.ty;
    }
  } else if(_ballInFlight){
    // Volo in corso: la palla viaggia piu' veloce di un nuotatore (un
    // passaggio e' lanciato, non nuotato) ma non cosi' veloce da spostarsi di
    // un terzo di campo per frame. Con il fattore 15 e gameSpeed la palla
    // attraversava l'intero bacino in 2-3 frame: da qui i "teletrasporti".
    // 4x la velocita' base: un passaggio da 10m dura ~1s di gioco.
    var bspd=poolGetBallSpeed(gameSpeed);
    var bdx=_ball.tx-_ball.x, bdy=_ball.ty-_ball.y;
    var bd=Math.sqrt(bdx*bdx+bdy*bdy);
    if(bd<0.002){ _ball.x=_ball.tx; _ball.y=_ball.ty; _ballFly=null; _ballInFlight=false; }
    else{ var bs=bspd*f; if(bs>=bd){_ball.x=_ball.tx;_ball.y=_ball.ty;_ballFly=null;_ballInFlight=false;}else{_ball.x+=bdx/bd*bs;_ball.y+=bdy/bd*bs;} }
  } else {
    // Palla libera: resta ferma dove e' arrivata. Non si sposta di un
    // millimetro finche' una pedina non la raggiunge e la prende.
    _ball.tx=_ball.x; _ball.ty=_ball.y;
    _ballFly=null; _ballAttach=false;
  }

  // ── La palla e' arrivata dove e' stata lanciata: si guarda se e' gol ─────
  // Chiamato DOPO il movimento, per vedere la posizione vera. La palla va
  // controllata in due casi: mentre vola (e allora conta poco chi fosse il
  // possessore precedente: un tiro lanciato da una pedina che aveva ancora la
  // palla deve poter uscire dal campo) e quando e' libera a riposo. Se invece
  // appartiene a una pedina e non vola, la sua posizione e' gia' dentro il
  // campo e controllarla produrrebbe falsi positivi sui bordi.
  //
  // _lastBallX/Y viene comunque aggiornato qui sotto, anche nei frame in cui il
  // controllo non gira: cosi' il segmento esaminato e' sempre quello davvero
  // percorso nell'ultimo frame, e un lancio che porta la palla fuori campo
  // dentro un solo frame (a velocita' 10 capita) viene visto lo stesso.
  if(_phase!=='idle' && (_ballInFlight || (!_ballOwner && !_ballAttach))) _checkBallEvent();
  _lastBallX = _ball.x; _lastBallY = _ball.y;
}

// ── Disegno ────────────────────────────────────────────────────────
function drawPool(canvas, myTeamAbbr, oppTeamAbbr) {
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var W=POOL_W,H=POOL_H;

  // Sfondo
  if(_bgReady&&_bgImg){ctx.drawImage(_bgImg,0,0,W,H);}
  else{ctx.fillStyle='#1a7fa0';ctx.fillRect(0,0,W,H);}

  var ownerKey = _ballOwner;

  Object.values(_tokens).forEach(function(tok){
    if(tok.expelled || tok.tempAbsent) return;  // nasconde espulsi e temporaneamente assenti
    var px=tok.x*W,py=tok.y*H;
    var isMy=tok.team==='my',isGK=tok.isGK;
    var R = 15;   // raggio segnalino (-20% rispetto a 19)
    var isOwner=(ownerKey===tok.team+'_'+tok.pk);
    var isPressed=(_pressKey===tok.team+'_'+tok.pk);

    // Alone "possessore palla"
    if(isOwner){
      ctx.save();ctx.globalAlpha=0.35;
      ctx.beginPath();ctx.arc(px,py,R+6,0,Math.PI*2);
      ctx.fillStyle='#fdd835';ctx.fill();
      ctx.restore();
    }

    // Alone "sotto pressione"
    if(isPressed&&!isOwner){
      ctx.save();ctx.globalAlpha=0.25;
      ctx.beginPath();ctx.arc(px,py,R+5,0,Math.PI*2);
      ctx.fillStyle='#ff4444';ctx.fill();
      ctx.restore();
    }

    // Ombra
    ctx.save();ctx.globalAlpha=0.20;ctx.fillStyle='#000';
    ctx.beginPath();ctx.ellipse(px+2,py+3,R,4,0,0,Math.PI*2);ctx.fill();
    ctx.restore();

    // Cerchio
    ctx.beginPath();ctx.arc(px,py,R,0,Math.PI*2);
    if(isGK){ctx.fillStyle='#cc2222';ctx.fill();ctx.strokeStyle='#ff7777';ctx.lineWidth=2.5;ctx.stroke();}
    else if(isMy){ctx.fillStyle='#ffffff';ctx.fill();ctx.strokeStyle='#333333';ctx.lineWidth=2.5;ctx.stroke();}
    else{ctx.fillStyle='#1a3faa';ctx.fill();ctx.strokeStyle='#4488ff';ctx.lineWidth=2.5;ctx.stroke();}

    // Cartellini gialli
    if(isMy&&!isGK&&tok.yellows>0){
      for(var i=0;i<tok.yellows;i++){
        ctx.fillStyle=(tok.yellows>=MAX_TEMP_EXP)?'#e74c3c':'#f0c040';
        ctx.fillRect(px-7+i*9,py-R-9,7,10);
      }
    }

    // Testo dentro il cerchio
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(isGK){ctx.fillStyle='#fff';ctx.font='bold '+Math.round(R*0.87)+'px sans-serif';ctx.fillText('P',px,py);}
    else if(isMy){
      ctx.fillStyle='#111';ctx.font='bold '+Math.round(R*0.67)+'px sans-serif';ctx.fillText(tok.shirt,px,py-3);
      ctx.fillStyle='#666';ctx.font=Math.round(R*0.47)+'px sans-serif';ctx.fillText(tok.posLabel,px,py+Math.round(R*0.40));
    } else {
      ctx.fillStyle='#b3d9ff';ctx.font='bold '+Math.round(R*0.80)+'px sans-serif';ctx.fillText(tok.posLabel,px,py);
    }

    // Nome: solo sul possessore (dinamico)
    if(isOwner && tok.shortName){
      ctx.font='bold '+Math.round(R*0.67)+'px sans-serif';
      var tw=ctx.measureText(tok.shortName).width+8;
      ctx.fillStyle='rgba(0,0,0,0.72)';
      _pill(ctx,px-tw/2,py+R+3,tw,16,4);ctx.fill();
      ctx.fillStyle='#fdd835';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(tok.shortName,px,py+R+3+8);
    } else if(isMy&&!isGK&&!isOwner&&tok.shortName){
      // Nome piccolo e semitrasparente per tutti gli altri
      ctx.font=Math.round(R*0.53)+'px sans-serif';
      var tw2=ctx.measureText(tok.shortName).width+5;
      ctx.fillStyle='rgba(0,0,0,0.35)';
      _pill(ctx,px-tw2/2,py+R+2,tw2,12,3);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.6)';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(tok.shortName,px,py+R+2+6);
    }
  });

  // Pallone
  var bx=_ball.x*W, by=_ball.y*H;
  var BR_BASE = 9;   // raggio base -30% rispetto al precedente 13

  // Parabola durante il volo: picco +20% a metà traiettoria
  var BR = BR_BASE;
  if(_ballFly && !_ballOwner){
    var dx=_ball.x-_ballFly.x0, dy=_ball.y-_ballFly.y0;
    var traveled=Math.sqrt(dx*dx+dy*dy);
    var t=_ballFly.dist>0?Math.min(traveled/_ballFly.dist,1):0;
    // Parabola: 4*t*(1-t) vale 1 a t=0.5, 0 agli estremi
    var arc=4*t*(1-t);
    BR=BR_BASE*(1+0.20*arc);
  }

  ctx.save();ctx.globalAlpha=0.28;ctx.fillStyle='#000';
  ctx.beginPath();ctx.ellipse(bx+2,by+BR+1,BR*0.65,3,0,0,Math.PI*2);ctx.fill();ctx.restore();
  if(_ballReady&&_ballImg){
    ctx.save();ctx.beginPath();ctx.arc(bx,by,BR,0,Math.PI*2);ctx.clip();
    ctx.drawImage(_ballImg,bx-BR,by-BR,BR*2,BR*2);ctx.restore();
    ctx.beginPath();ctx.arc(bx,by,BR,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,0,0,0.30)';ctx.lineWidth=1.0;ctx.stroke();
  } else {
    ctx.beginPath();ctx.arc(bx,by,BR,0,Math.PI*2);
    var g=ctx.createRadialGradient(bx-4,by-4,1,bx,by,BR);
    g.addColorStop(0,'#fff9c4');g.addColorStop(0.55,'#fdd835');g.addColorStop(1,'#f9a825');
    ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#c17900';ctx.lineWidth=1.5;ctx.stroke();
  }

  // Overlay GOAL
  if(_goalAnim){
    var t=_goalAnim.timer/_goalAnim.total;
    var pulse=0.5+0.5*Math.abs(Math.sin(t*Math.PI*6));
    var alpha=t<0.85?1:1-(t-0.85)/0.15;
    ctx.save();ctx.globalAlpha=alpha;
    ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(0,0,W,H);
    var myGoal=_goalAnim.team==='my';
    var panW=W*0.82,panH=H*0.52,panX=(W-panW)/2,panY=(H-panH)/2;
    ctx.fillStyle=myGoal?'rgba(0,100,30,.85)':'rgba(120,20,20,.85)';
    ctx.beginPath();ctx.roundRect(panX,panY,panW,panH,14);ctx.fill();
    ctx.strokeStyle=myGoal?'rgba(100,220,100,.6)':'rgba(255,80,80,.6)';ctx.lineWidth=2;ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';
    var fs=Math.round(58+pulse*14);
    ctx.font='900 '+fs+'px sans-serif';ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=16;
    ctx.fillStyle=myGoal?'#fdd835':'#ff6b6b';ctx.fillText('GOAL!!!',W/2,panY+panH*0.32);
    if(_goalAnim.scorer){ctx.font='bold 20px sans-serif';ctx.fillStyle='#fff';ctx.shadowBlur=8;ctx.fillText('⚽  '+_goalAnim.scorer,W/2,panY+panH*0.60);}
    if(_goalAnim.teamName){ctx.font='14px sans-serif';ctx.fillStyle='rgba(255,255,255,.75)';ctx.shadowBlur=4;ctx.fillText(_goalAnim.teamName,W/2,panY+panH*0.82);}
    ctx.restore();
  }
}

function _pill(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
