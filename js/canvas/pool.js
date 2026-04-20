// ─────────────────────────────────────────────────────────────────────
// canvas/pool.js  —  Rendering e simulazione campo  v0.7.5
//
// Modello: tutti i token si muovono CONTINUAMENTE ogni frame verso
// target aggiornati da MovementController. Nessuna animazione bloccante.
// ─────────────────────────────────────────────────────────────────────

const POOL_W = 760;
const POOL_H = 430;

// ── Geometria ──────────────────────────────────────────────────────
const PLAY = {
  x0: 0.10, x1: 0.90, y0: 0.12, y1: 0.88,
  cx: 0.50, cy: 0.50,
  myGoalX: 0.08,  oppGoalX: 0.92,
  myGoalY0: 0.38, myGoalY1: 0.62,
  oppGoalY0: 0.38, oppGoalY1: 0.62,
  myGKminX: 0.07,  myGKmaxX: 0.13,
  oppGKminX: 0.87, oppGKmaxX: 0.93,
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
var _phase      = 'idle';   // 'idle'|'play'
var _attack     = 'my';     // chi ha il possesso
var _pressKey   = null;     // chiave del token sotto pressione (per visual)
var _goalAnim   = null;     // overlay goal canvas
var _pendingGoal= null;

// ── Asset ──────────────────────────────────────────────────────────
var _bgImg=null, _bgReady=false, _ballImg=null, _ballReady=false;
(function(){var i=new Image();i.onload=function(){_bgImg=i;_bgReady=true;};i.src='campo-per-pallanuoto.jpg';})();
(function(){var i=new Image();i.onload=function(){_ballImg=i;_ballReady=true;};i.src='palla.png';})();

// ── Helpers ────────────────────────────────────────────────────────
function _clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function _rnd(lo,hi){return lo+Math.random()*(hi-lo);}
function _shortName(p){return (p&&p.name)?p.name:'';}
function _dist2d(x1,y1,x2,y2){var dx=x2-x1,dy=y2-y1;return Math.sqrt(dx*dx+dy*dy);}

function _ballOffsetForToken(tok) {
  var hand = 'R';
  if (tok.team==='my' && typeof G!=='undefined' && G.ms && G.ms.myRoster) {
    var p = G.ms.myRoster[tok.pi];
    if (p && p.hand) hand = p.hand;
  }
  // Direzione di attacco determina quale mano è in alto/basso:
  //   Attacco sx→dx (attackRight=true):  mano R = basso (+dy),  mano L = alto (-dy)
  //   Attacco dx→sx (attackRight=false): mano R = alto  (-dy),  mano L = basso (+dy)
  var attackRight = (tok.team==='my') ? (_attack==='my') : (_attack==='opp');
  if (hand === 'AMB') { return {dx:0, dy:0}; }
  if (hand === 'R') {
    return { dx: attackRight ?  0.024 : -0.024,
             dy: attackRight ?  0.020 : -0.020 };
  }
  // L
  return   { dx: attackRight ? -0.024 :  0.024,
             dy: attackRight ? -0.020 :  0.020 };
}

// ── Inizializzazione ───────────────────────────────────────────────
function poolInitTokens(ms) {
  _tokens={};_ball={x:PLAY.cx,y:PLAY.cy,tx:PLAY.cx,ty:PLAY.cy};
  _ballOwner=null;_phase='idle';_attack='my';_goalAnim=null;_pendingGoal=null;_pressKey=null;

  Object.entries(ms.onField).forEach(function(e){
    var pk=e[0],pi=e[1],p=ms.myRoster[pi];
    var pos=KICKOFF_MY[pk]||{x:0.13,y:0.50};
    _tokens['my_'+pk]={x:pos.x,y:pos.y,tx:pos.x,ty:pos.y,
      team:'my',pk:pk,pi:pi,isGK:pk==='GK',posLabel:pk==='GK'?'P':pk,
      shortName:_shortName(p),shirt:ms.shirtNumbers[pi]||'',yellows:0,expelled:false};
  });
  Object.keys(KICKOFF_OPP).forEach(function(pk){
    var pos=KICKOFF_OPP[pk];
    _tokens['opp_'+pk]={x:pos.x,y:pos.y,tx:pos.x,ty:pos.y,
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
function poolGetKickoffPos(team,pk){
  var t=team==='my'?KICKOFF_MY:KICKOFF_OPP;
  return t[pk]?{x:t[pk].x,y:t[pk].y}:{x:PLAY.cx,y:PLAY.cy};
}

// ── Movimento token ────────────────────────────────────────────────
function poolMoveToken(key,tx,ty) {
  var tok=_tokens[key];if(!tok)return;
  if(tok.isGK){
    tx=tok.team==='my'?_clamp(tx,PLAY.myGKminX,PLAY.myGKmaxX):_clamp(tx,PLAY.oppGKminX,PLAY.oppGKmaxX);
    ty=_clamp(ty,PLAY.myGoalY0+0.02,PLAY.myGoalY1-0.02);
  }
  tok.tx=_clamp(tx,PLAY.x0+0.01,PLAY.x1-0.01);
  tok.ty=_clamp(ty,PLAY.y0+0.01,PLAY.y1-0.01);
}

// ── Palla ──────────────────────────────────────────────────────────
function poolMoveBall(tx,ty) {
  _ball.tx=_clamp(tx,PLAY.x0,PLAY.x1);_ball.ty=_clamp(ty,PLAY.y0,PLAY.y1);
}
function poolMoveBallDirect(tx,ty) {
  // Registra la traiettoria di volo partendo dalla posizione corrente
  var fx=_ball.x, fy=_ball.y;
  var ftx=_clamp(tx,PLAY.x0,PLAY.x1), fty=_clamp(ty,PLAY.y0,PLAY.y1);
  var dx=ftx-fx, dy=fty-fy;
  var dist=Math.sqrt(dx*dx+dy*dy);
  _ballOwner=null;
  _ball.tx=ftx; _ball.ty=fty;
  _ballFly=(dist>0.01)?{x0:fx,y0:fy,x1:ftx,y1:fty,dist:dist}:null;
}
function poolSetBallOn(key) {
  if(_tokens[key]){_ballOwner=key; _ballFly=null;}  // possessore: nessuna parabola
}
function poolReleaseBall() {
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
  _phase='idle';_goalAnim=null;_pendingGoal=null;_ballOwner=null;_pressKey=null;
  _ball.tx=PLAY.cx;_ball.ty=PLAY.cy;
  Object.values(_tokens).forEach(function(tok){
    if(tok.expelled)return;
    var pos=tok.team==='my'?KICKOFF_MY[tok.pk]:KICKOFF_OPP[tok.pk];
    if(pos){tok.x=pos.x;tok.y=pos.y;tok.tx=pos.x;tok.ty=pos.y;}
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
  _pendingGoal=null;
  _goalAnim={timer:0,total:2.5,scorer:scorer||'',team:team||'my',teamName:teamName||''};
}
function poolShowGoal(scorer,team,teamName){poolTriggerGoalAnim(scorer,team,teamName);}

// ── Portieri ───────────────────────────────────────────────────────
function _updateKeepers() {
  var by=_ball.y;
  var myGK=_tokens['my_GK'];
  if(myGK&&!myGK.expelled){
    myGK.tx=_clamp(PLAY.myGoalX+0.03,PLAY.myGKminX,PLAY.myGKmaxX);
    myGK.ty=_clamp(by,PLAY.myGoalY0+0.03,PLAY.myGoalY1-0.03);
  }
  var oppGK=_tokens['opp_GK'];
  if(oppGK&&!oppGK.expelled){
    oppGK.tx=_clamp(PLAY.oppGoalX-0.03,PLAY.oppGKminX,PLAY.oppGKmaxX);
    oppGK.ty=_clamp(by,PLAY.oppGoalY0+0.03,PLAY.oppGoalY1-0.03);
  }
}
function poolUpdateKeepers(){_updateKeepers();}

// ── Formazioni helper ──────────────────────────────────────────────
function poolResetToken(key){}  // compat stub

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

  // Goal pendente: controlla entrata in rete
  if(_pendingGoal&&!_goalAnim){
    var bx=_ball.x,by=_ball.y;
    if((bx>=PLAY.myNetX0&&bx<=PLAY.myNetX1&&by>=PLAY.myNetY0&&by<=PLAY.myNetY1)||
       (bx>=PLAY.oppNetX0&&bx<=PLAY.oppNetX1&&by>=PLAY.oppNetY0&&by<=PLAY.oppNetY1)){
      poolTriggerGoalAnim(_pendingGoal.scorer,_pendingGoal.team,_pendingGoal.teamName||'');
      _pendingGoal=null;
    }
  }

  // Portieri seguono sempre la palla
  if(_phase!=='idle')_updateKeepers();

  // Palla segue il possessore (ogni frame)
  if(_ballOwner){
    var ow=_tokens[_ballOwner];
    if(ow&&!ow.expelled){
      var off=_ballOffsetForToken(ow);
      _ball.tx=_clamp(ow.x+off.dx,PLAY.x0,PLAY.x1);
      _ball.ty=_clamp(ow.y+off.dy,PLAY.y0,PLAY.y1);
    } else { _ballOwner=null; }
  }

  // ── Movimento token — velocità scalata con gameSpeed ──────────
  Object.values(_tokens).forEach(function(tok){
    if(tok.expelled)return;
    var dx=tok.tx-tok.x, dy=tok.ty-tok.y;
    var d=Math.sqrt(dx*dx+dy*dy);
    if(d<0.001){ tok.x=tok.tx; tok.y=tok.ty; return; }
    var spd=(_tokenSpd[tok.team+'_'+tok.pk]||_BASE_SPD) * gameSpeed;
    var s=spd*f;
    if(s>=d){ tok.x=tok.tx; tok.y=tok.ty; }
    else { tok.x+=dx/d*s; tok.y+=dy/d*s; }
  });

  // ── Movimento palla — anche scalato con gameSpeed ──────────────
  if(!_ballOwner){
    var bspd=_BASE_SPD*5.0*gameSpeed;
    var bdx=_ball.tx-_ball.x, bdy=_ball.ty-_ball.y;
    var bd=Math.sqrt(bdx*bdx+bdy*bdy);
    if(bd<0.002){ _ball.x=_ball.tx; _ball.y=_ball.ty; _ballFly=null; }
    else{ var bs=bspd*f; if(bs>=bd){_ball.x=_ball.tx;_ball.y=_ball.ty;_ballFly=null;}else{_ball.x+=bdx/bd*bs;_ball.y+=bdy/bd*bs;} }
  } else {
    _ball.x=_ball.tx; _ball.y=_ball.ty;
  }
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
    if(tok.expelled)return;
    var px=tok.x*W,py=tok.y*H;
    var isMy=tok.team==='my',isGK=tok.isGK;
    var R=19;
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
    if(isGK){ctx.fillStyle='#fff';ctx.font='bold 13px sans-serif';ctx.fillText('P',px,py);}
    else if(isMy){
      ctx.fillStyle='#111';ctx.font='bold 10px sans-serif';ctx.fillText(tok.shirt,px,py-3);
      ctx.fillStyle='#666';ctx.font='7px sans-serif';ctx.fillText(tok.posLabel,px,py+6);
    } else {
      ctx.fillStyle='#b3d9ff';ctx.font='bold 12px sans-serif';ctx.fillText(tok.posLabel,px,py);
    }

    // Nome: solo sul possessore (dinamico)
    if(isOwner && tok.shortName){
      ctx.font='bold 10px sans-serif';
      var tw=ctx.measureText(tok.shortName).width+10;
      ctx.fillStyle='rgba(0,0,0,0.72)';
      _pill(ctx,px-tw/2,py+R+3,tw,16,4);ctx.fill();
      ctx.fillStyle='#fdd835';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(tok.shortName,px,py+R+3+8);
    } else if(isMy&&!isGK&&!isOwner&&tok.shortName){
      // Nome piccolo e semitrasparente per tutti gli altri
      ctx.font='8px sans-serif';
      var tw2=ctx.measureText(tok.shortName).width+6;
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
