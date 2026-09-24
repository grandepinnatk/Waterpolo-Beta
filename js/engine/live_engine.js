// ─────────────────────────────────────────────────────────────────────────────
// engine/live_engine.js  —  Motore partita GIOCATA  v1.0.0
//
// ARCHITETTURA — 3 FASI:
//
//   FASE A: "stato di fase" esplicito del canvas
//     Il canvas pubblica ogni 0.8s uno stato strutturato con la fase corrente
//     (BUILD_UP, ATTACK_CB, FREE_PLAYER, SHOT, SAVE, LOOSE_BALL, COUNTER…)
//
//   FASE B: il motore genera eventi SOLO quando la fase canvas cambia
//     Non più ogni 7-14s random. Genera quando il canvas transita a una
//     nuova fase significativa, o quando le frequenze reali lo richiedono.
//
//   FASE C: telecronaca descrive CIÒ CHE IL CANVAS STA MOSTRANDO
//     Tutte le stringhe sono i18n (js/i18n/commentary_it.js ecc.)
//     Il testo è generato DOPO che l'animazione è già in corso.
//
// FREQUENZE REALI (calibrate su pallanuoto d'élite, 8 minuti per tempo):
//   • ~18-22 tiri per tempo (≈1 ogni 22s di possesso)
//   • ~8-10 falli per tempo (≈1 ogni 48s)
//   • ~3-5 goal per tempo (conversion rate ~18-22%)
//   • ~4-6 azioni di superiorità per tempo
//   • Azione media: 6-12 passaggi prima del tiro
//   • Shot clock: 30s, media utilizzo ~20-24s
// ─────────────────────────────────────────────────────────────────────────────

// ── FASE A: Tipi di fase canvas ───────────────────────────────────────────
var CANVAS_PHASE = {
  BUILD_UP:    'BUILD_UP',    // circolazione palla in costruzione
  ATTACK_WING: 'ATTACK_WING', // azione da ala (pos1/5 con palla)
  ATTACK_CB:   'ATTACK_CB',   // centroboa (pos6) in zona 2m con palla
  FREE_PLAYER: 'FREE_PLAYER', // giocatore libero in avanzata verso porta
  SHOT:        'SHOT',        // tiro in corso
  SAVE:        'SAVE',        // parata
  LOOSE_BALL:  'LOOSE_BALL',  // palla libera contesa
  COUNTER:     'COUNTER',     // contrattacco (cambio veloce di possesso)
  PENALTY:     'PENALTY',     // rigore
  SUPERIORITY: 'SUPERIORITY', // 6 vs 5
  INFERIORITY: 'INFERIORITY', // 5 vs 6
};

// ── Geometria (specchio di pool.js) ───────────────────────────────────────
var LIVE = {
  cx: 0.50,
  myGKX: 0.115, oppGKX: 0.885,
  MY_SHOT_ZONE:  0.26,   // zona tiro avversario (x < 0.26)
  OPP_SHOT_ZONE: 0.74,   // zona tiro nostro (x > 0.74)
  FIVE_M: 0.165,          // ~5m dalla porta
  TWO_M:  0.08,           // ~2m dalla porta
};

// ── Stato live (pubblicato da movement.js via liveUpdateState) ────────────
var _liveState = {
  // Fase corrente (CANVAS_PHASE)
  canvasPhase:   CANVAS_PHASE.BUILD_UP,
  prevPhase:     null,
  phaseChanged:  false,

  // Possesso
  attack:        'my',
  ballOwnerKey:  null,
  ballOwnerPk:   null,
  ballX: 0.5, ballY: 0.5,
  ballFree:      false,
  ballInFlight:  false,

  // Distanze per rilevamento fase
  cbInShotZone:  false,
  cbMarkerDist:  999,
  closestDefDist: 999,

  // Contatori azione
  passCount:     0,
  phaseTime:     0,
  actionTime:    0,   // secondi totali nell'azione corrente

  // Eventi speciali pending
  shotClockExpired:  false,
  interceptionEvent: false,
  interceptTeam:     null,
  prevAttack:        null,

  // Nomi giocatori (per telecronaca)
  ballOwnerName: '',
  gkMyName:      '',
  gkOppName:     '',
};

function liveUpdateState(patch) {
  if (!patch) return;
  var prev = _liveState.canvasPhase;
  Object.keys(patch).forEach(function(k) { _liveState[k] = patch[k]; });
  // Rileva cambio di fase
  if (patch.canvasPhase && patch.canvasPhase !== prev) {
    _liveState.prevPhase   = prev;
    _liveState.phaseChanged = true;
  }
}

function liveGetState() { return _liveState; }

// ── FASE B: Frequenze eventi calibrate ────────────────────────────────────
// Basate su analisi pallanuoto d'élite (LEN Champions League, Mondiali):
// 8 minuti per tempo → 480s di gioco
// Tiri: 18-22 per tempo → ogni 22-27s in possesso
// Falli: 8-10 per tempo → prob ~0.018 per secondo di gioco
// Goal: ~20% dei tiri
// Passaggi medi per azione: 5-9
// ── Frequenze calibrate per ~3-6 gol totali per periodo ─────────────────────
// Timer unificato: 18-25s → ~22 chiamate/periodo
// Target: 6-8 tiri/squadra/periodo × ~20% conversione = 1.2-1.6 gol/squadra/periodo
// Totale atteso: 2.5-3.0 gol/periodo → 10-12 gol/partita (simile alla modalità simulata)
var FREQ = {
  MIN_PASSES_BEFORE_SHOT: 2,    // passaggi minimi (abbassato: timer più lungo)
  SHOT_PROB_PER_PASS:     0.22, // prob tiro per chiamata in BUILD_UP/WING
  SHOT_PROB_IN_ZONE:      0.60, // prob tiro in zona 5m (ATTACK_CB)
  SHOT_PROB_FREE:         0.75, // prob tiro con giocatore libero (FREE_PLAYER)
  SHOT_PROB_BASE:         0.28, // prob tiro base per ogni chiamata timer
  FOUL_PROB_PER_CALL:     0.12, // prob fallo per chiamata (~2-3 falli/periodo)
  COUNTER_PASS_MAX:       1,    // max passaggi in contropiede prima del tiro
  SHOT_CLOCK:             30,   // secondi
};

// ── i18n telecronaca ─────────────────────────────────────────────────────
function _getLang() {
  if (typeof window !== 'undefined' && window.LANG_COMMENTARY) {
    var lang = (typeof G !== 'undefined' && G.settings && G.settings.lang) || 'it';
    return window.LANG_COMMENTARY[lang] || window.LANG_COMMENTARY['it'];
  }
  return null;
}

function _pick(arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// Sostituisce {player}, {passer}, {receiver}, {scorer}, {gk}, {team}, {opp}, {shirt}
function _fmt(template, vars) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, function(_, k) {
    return vars[k] !== undefined ? vars[k] : '{' + k + '}';
  });
}

function _txt(key, subkey, vars) {
  // Prova a usare il file i18n commentary se caricato
  var lang = _getLang();
  if (lang && lang[key]) {
    var pool = subkey ? lang[key][subkey] : lang[key];
    if (pool) {
      var tpl = Array.isArray(pool) ? _pick(pool) : pool;
      return vars ? _fmt(tpl, vars) : tpl;
    }
  }

  // ── Fallback italiano hardcoded (usato se commentary_it.js non è caricato) ──
  var v = vars || {};
  var team    = v.team    || '';
  var opp     = v.opp     || '';
  var player  = v.player  || v.shooter || v.scorer || v.passer || '';
  var gk      = v.gk      || '';
  var shirt   = v.shirt   || '';

  var FALLBACK = {
    goal_my:            '⚽ GOL! ' + (v.scorer||player) + ' segna per ' + team + '!',
    goal_opp:           '⚽ ' + team + ' segna' + (v.scorer ? ' con ' + v.scorer : '') + '.',
    shot_saved:         'Tiro di ' + player + (gk ? ' — parata di ' + gk : ' — parata!'),
    shot_wide:          'Tiro di ' + player + ' — fuori!',
    shot_blocked:       'Tiro di ' + player + ' — murato.',
    save:               'Parata' + (gk ? ' di ' + gk : '') + '!',
    pass:               player ? player + ' in possesso.' : 'Circolazione palla.',
    free_advance:       (player||'Attaccante') + ' libero — avanza verso la porta!',
    counter:            'Contrattacco di ' + team + '!',
    gk_launch:          (gk||'Portiere') + ' rilancia.',
    foul_temp_exp:      '🟡 Esp. temporanea #' + shirt + ' — ' + team + ' in inferiorità.',
    foul_opp_exp:       '🟡 Fallo di ' + opp + ' — ' + team + ' in superiorità!',
    foul_perm_exp:      '🔴 Espulso definitivamente #' + shirt + '.',
    shot_clock_expired: '⏱ 30 secondi scaduti — palla a ' + team + '.',
    interception:       '⚡ Palla intercettata da ' + team + '!',
    loose_ball_won:     (player||'Giocatore') + ' raccoglie la palla.',
    sup_start:          '🔵 ' + team + ' in superiorità numerica.',
    inf_start:          '🔴 ' + team + ' in inferiorità numerica.',
    neutral:            'Manovra di attacco.',
  };

  return FALLBACK[key] || (player ? player + '.' : 'Azione di gioco.');
}

// ── FASE C: Generatore eventi sincronizzato con canvas ────────────────────
function generateLiveEvent(ms) {
  if (!ms) return null;

  var st = _liveState;

  // ── Priorità 1: eventi speciali pendenti ──────────────────────────────
  if (st.shotClockExpired) {
    liveUpdateState({ shotClockExpired: false });
    return _buildShotClockEvent(ms);
  }

  if (st.interceptionEvent) {
    liveUpdateState({ interceptionEvent: false });
    var intTeam = st.interceptTeam === 'my' ? ms.myTeam.name : ms.oppTeam.name;
    return {
      txt: _txt('interception', null, { team: intTeam }),
      cls: 'sv',
    };
  }

  // ── Priorità 2: cambio di fase canvas → evento sincronizzato ──────────
  if (st.phaseChanged) {
    liveUpdateState({ phaseChanged: false });
    var phaseEvent = _buildPhaseEvent(ms, st);
    if (phaseEvent) return phaseEvent;
  }

  var attack = st.attack || 'my';
  var bx = st.ballX || 0.5, by = st.ballY || 0.5;
  var myEff  = _calcMyEffective(ms);
  var oppStr = ms.oppTeam.str * (ms.oppTeam._staminaFactor || 1.0);

  // ── Priorità 3: logica fase corrente ──────────────────────────────────
  switch (st.canvasPhase) {

    case CANVAS_PHASE.ATTACK_CB:
      // CB in zona 2m: alta probabilità di tiro
      if (st.passCount >= 1 || Math.random() < FREQ.SHOT_PROB_IN_ZONE) {
        return attack === 'my'
          ? _buildMyShotEvent(ms, myEff, oppStr, bx, by)
          : _buildOppShotEvent(ms, myEff, oppStr, bx, by);
      }
      break;

    case CANVAS_PHASE.FREE_PLAYER:
      // Giocatore libero → tiro molto probabile
      if (Math.random() < FREQ.SHOT_PROB_FREE) {
        return attack === 'my'
          ? _buildMyShotEvent(ms, myEff, oppStr, bx, by)
          : _buildOppShotEvent(ms, myEff, oppStr, bx, by);
      }
      break;

    case CANVAS_PHASE.COUNTER:
      // Contrattacco: tiro quasi immediato
      if (st.passCount >= FREQ.COUNTER_PASS_MAX || Math.random() < 0.65) {
        return attack === 'my'
          ? _buildMyShotEvent(ms, myEff, oppStr, bx, by)
          : _buildOppShotEvent(ms, myEff, oppStr, bx, by);
      }
      break;

    case CANVAS_PHASE.SUPERIORITY:
      // Superiorità: maggiore probabilità di tiro
      if (Math.random() < 0.50) {
        return attack === 'my'
          ? _buildMyShotEvent(ms, myEff, oppStr, bx, by)
          : _buildOppShotEvent(ms, myEff, oppStr, bx, by);
      }
      break;

    case CANVAS_PHASE.BUILD_UP:
    case CANVAS_PHASE.ATTACK_WING:
      // Costruzione: prob. tiro base + bonus se in zona
      var zoneMult = (attack === 'my' && bx > LIVE.OPP_SHOT_ZONE) ||
                     (attack === 'opp' && bx < LIVE.MY_SHOT_ZONE) ? 2.2 : 1.0;
      var shotProb = st.passCount >= FREQ.MIN_PASSES_BEFORE_SHOT
        ? FREQ.SHOT_PROB_PER_PASS * zoneMult
        : FREQ.SHOT_PROB_BASE * 0.5;  // anche senza passaggi c'è una prob. minima
      if (Math.random() < shotProb) {
        return attack === 'my'
          ? _buildMyShotEvent(ms, myEff, oppStr, bx, by)
          : _buildOppShotEvent(ms, myEff, oppStr, bx, by);
      }
      break;

    default:
      // Fase non specifica: prob. tiro base
      if (Math.random() < FREQ.SHOT_PROB_BASE) {
        return attack === 'my'
          ? _buildMyShotEvent(ms, myEff, oppStr, bx, by)
          : _buildOppShotEvent(ms, myEff, oppStr, bx, by);
      }
  }

  // ── Priorità 4: fallo (frequenza calibrata per chiamata) ─────────────
  var foulEvent = _tryFoulEvent(ms, attack, bx, by);
  if (foulEvent) return foulEvent;

  // ── Priorità 5: evento neutro descrittivo (telecronaca in fase C) ─────
  return _buildNeutralEvent(ms, attack, bx, by, st.canvasPhase);
}

// ── Builder fase A → evento ───────────────────────────────────────────────
function _buildPhaseEvent(ms, st) {
  var attack = st.attack || 'my';
  var vars = _buildVars(ms, attack, null);

  switch (st.canvasPhase) {
    case CANVAS_PHASE.FREE_PLAYER:
      if (st.ballOwnerName) vars.player = st.ballOwnerName;
      return { txt: _txt('free_advance', null, vars), cls: '', _phaseOnly: true };

    case CANVAS_PHASE.COUNTER:
      if (st.ballOwnerName) vars.player = st.ballOwnerName;
      return { txt: _txt('counter', null, vars), cls: '', _phaseOnly: true };

    case CANVAS_PHASE.SUPERIORITY:
      return { txt: _txt('sup_start', null, vars), cls: 'sv', _phaseOnly: true };

    case CANVAS_PHASE.INFERIORITY:
      return { txt: _txt('inf_start', null, vars), cls: 'fl', _phaseOnly: true };

    case CANVAS_PHASE.LOOSE_BALL:
      return null; // palla libera → nessun testo finché qualcuno la prende

    default:
      return null; // altri cambi di fase → nessun testo
  }
}

// ── Builder eventi specifici ──────────────────────────────────────────────
function _buildMyShotEvent(ms, myEff, oppStr, bx, by) {
  ms.myShots = (ms.myShots||0) + 1;
  var activePlayers = _getActivePlayers(ms);
  if (!activePlayers.length) return _buildNeutralEvent(ms, 'my', bx, by);

  var attacker = _weightedPick(activePlayers, function(x){ return x.eff; });
  var tec = (attacker.p.stats && attacker.p.stats.tec) ? attacker.p.stats.tec : 50;
  var goalProb = 0.19 + (myEff - oppStr) / 600 + (tec - 50) / 400;
  goalProb = Math.max(0.10, Math.min(0.38, goalProb));

  var shotY = _clampY(by + _rnd(-0.07, 0.07));
  var oppGk = ms.oppRoster && ms.oppRoster.find(function(p){ return p.role==='POR'; });
  var gkName = oppGk ? oppGk.name : '';
  var vars = { shooter: attacker.p.name, gk: gkName, team: ms.myTeam.name };

  liveUpdateState({ passCount: 0 });

  if (Math.random() < goalProb) {
    ms.myScore++;
    attacker.p.goals = (attacker.p.goals||0) + 1;
    if (ms.matchGoals) ms.matchGoals[attacker.pi] = (ms.matchGoals[attacker.pi]||0)+1;
    if (ms.periodScores && ms.period>=1 && ms.period<=4) ms.periodScores[ms.period-1].my++;
    vars.scorer = attacker.p.name;
    return {
      txt: _txt('goal_my', null, vars),
      cls: 'myg', shotTeam: 'my',
      ballTarget:  { x: 0.94, y: shotY },
      moverKey:    'my_'+attacker.pk,
      moverTarget: { x: Math.min(bx+0.05,0.88), y: by },
      goalScored: true, goalTeam: 'my', goalScorer: attacker.p.name,
    };
  } else {
    var wide = Math.random() < 0.25;
    return {
      txt: wide ? _txt('shot_wide', null, vars) : _txt('shot_saved', null, vars),
      cls: 'sv', shotTeam: 'my',
      ballTarget:  { x: LIVE.oppGKX, y: shotY },
      moverKey:    'my_'+attacker.pk,
      moverTarget: { x: Math.max(bx-0.05,0.12), y: by },
    };
  }
}

function _buildOppShotEvent(ms, myEff, oppStr, bx, by) {
  ms.oppShots = (ms.oppShots||0) + 1;
  var goalProb = 0.19 + (oppStr - myEff) / 600;
  goalProb = Math.max(0.10, Math.min(0.38, goalProb));
  var shotY = _clampY(by + _rnd(-0.07, 0.07));
  var myGk = ms.myRoster && ms.myRoster[ms.onField['GK']];
  var gkName = myGk ? myGk.name : '';
  var vars = { gk: gkName, team: ms.oppTeam.name };

  liveUpdateState({ passCount: 0 });

  if (Math.random() < goalProb) {
    ms.oppScore++;
    if (ms.periodScores && ms.period>=1 && ms.period<=4) ms.periodScores[ms.period-1].opp++;
    var scorer = _pickOppScorer(ms);
    vars.scorer = scorer;
    return {
      txt: _txt('goal_opp', null, vars),
      cls: 'og', shotTeam: 'opp',
      ballTarget: { x: 0.05, y: shotY },
      goalScored: true, goalTeam: 'opp', goalScorer: scorer || ms.oppTeam.name,
    };
  } else {
    return {
      txt: _txt('save', null, vars),
      cls: 'sv', shotTeam: 'opp',
      ballTarget: { x: LIVE.myGKX, y: shotY },
    };
  }
}

function _buildShotClockEvent(ms) {
  var newTeam = _liveState.prevAttack === 'my' ? 'opp' : 'my';
  var teamName = newTeam==='my' ? ms.myTeam.name : ms.oppTeam.name;
  var bPos = typeof poolGetBallPos==='function' ? poolGetBallPos() : {x:0.5,y:0.5};
  return {
    txt: _txt('shot_clock_expired', null, { team: teamName }),
    cls: 'fl',
    ballTarget: { x: _clampX(bPos.x+(newTeam==='my'?0.03:-0.03)), y: _clampY(bPos.y) },
    moverKey: newTeam+'_3',
  };
}

function _buildNeutralEvent(ms, attack, bx, by, phase) {
  liveUpdateState({ passCount: (_liveState.passCount||0)+1 });
  var vars = _buildVars(ms, attack, null);
  return {
    txt: _txt('neutral', null, vars),
    cls: '',
    moverKey: attack+'_3',
    ballTarget: { x: _clampX(bx+_rnd(-0.05,0.05)), y: _clampY(by+_rnd(-0.03,0.03)) },
  };
}

function _tryFoulEvent(ms, attack, bx, by) {
  // Frequenza calibrata: ~2-3 falli per periodo (timer 18-25s)
  var prob = FREQ.FOUL_PROB_PER_CALL;
  if (Math.random() >= prob) return null;

  var myFoulCandidates = Object.entries(ms.onField)
    .filter(function(e){ return e[0]!=='GK' && !ms.expelled.has(e[1]); })
    .map(function(e){
      var pk=e[0],pi=e[1],p=ms.myRoster[pi];
      return p?{pk,pi,p}:null;
    }).filter(Boolean);

  // 50% fallo su di noi, 50% fallo avversario
  if (myFoulCandidates.length && Math.random() < 0.50) {
    var fp = myFoulCandidates[Math.floor(Math.random()*myFoulCandidates.length)];
    var shirt = ms.shirtNumbers[fp.pi]||'?';
    ms.myFouls = (ms.myFouls||0)+1;
    ms.tempExp[fp.pi] = (ms.tempExp[fp.pi]||0)+1;
    var count = ms.tempExp[fp.pi];
    var vars = { shirt: shirt, team: ms.myTeam.name };
    if (count>=3) {
      ms.expelled.add(fp.pi);
      return { txt: _txt('foul_perm_exp',null,vars), cls:'exp', expelled:fp.pi, moverKey:'my_'+fp.pk };
    }
    ms.inferiorityActive=true; ms.inferiorityTimer=20;
    return { txt:_txt('foul_temp_exp',null,vars), cls:'fl', inferiorityStart:true,
             ballTarget:{x:_clampX(bx+0.05),y:_clampY(by)} };
  }

  if (!ms.superiorityActive && Math.random()<0.50) {
    ms.oppTempExp=(ms.oppTempExp||0)+1;
    ms.superiorityActive=true; ms.superiorityTimer=20;
    var varsF = { opp: ms.oppTeam.abbr||ms.oppTeam.name, team: ms.myTeam.name };
    return { txt:_txt('foul_opp_exp',null,varsF), cls:'sv', superiorityStart:true,
             ballTarget:{x:_clampX(bx-0.05),y:_clampY(by)} };
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _buildVars(ms, attack, player) {
  var myGk = ms.myRoster && ms.myRoster[ms.onField && ms.onField['GK']];
  var oppGk = ms.oppRoster && ms.oppRoster.find(function(p){ return p&&p.role==='POR'; });
  return {
    team:     attack==='my' ? ms.myTeam.name : ms.oppTeam.name,
    opp:      attack==='my' ? ms.oppTeam.name : ms.myTeam.name,
    gk:       attack==='my' ? (oppGk?oppGk.name:'') : (myGk?myGk.name:''),
    player:   player || (_liveState.ballOwnerName||''),
    passer:   _liveState.ballOwnerName||'',
    receiver: '',
    shooter:  _liveState.ballOwnerName||'',
    scorer:   _liveState.ballOwnerName||'',
  };
}

function _calcMyEffective(ms) {
  var act = _getActivePlayers(ms);
  var tot = 0; act.forEach(function(x){tot+=x.eff;});
  var cnt = act.length; if(!cnt) return 50;
  var base = (tot/cnt) * (cnt/7);
  var boost = {balanced:0,attack:8,defense:-5,counter:3,press:5};
  return base + (boost[ms.tactic||'balanced']||0);
}

function _getActivePlayers(ms) {
  var r=[];
  Object.entries(ms.onField).forEach(function(e){
    var pk=e[0],pi=e[1];
    if(pk==='GK'||ms.expelled.has(pi))return;
    var p=ms.myRoster[pi]; if(!p)return;
    var ovr=p.ovr||50;
    var sta=(ms.stamina&&ms.stamina[pi])||p.fitness||50;
    r.push({pk,pi,p,eff:ovr*(0.5+sta/200)});
  });
  return r;
}

function _pickOppScorer(ms) {
  if(!ms.oppRoster)return'';
  var fp=ms.oppRoster.filter(function(p){return p&&p.role!=='POR';});
  if(!fp.length)return'';
  var w=fp.map(function(p){return p.role==='ATT'?4:p.role==='CB'?2:p.role==='CEN'?3:1;});
  var tot=w.reduce(function(s,v){return s+v;},0);
  var r=Math.random()*tot;
  for(var i=0;i<fp.length;i++){r-=w[i];if(r<=0){fp[i].goals=(fp[i].goals||0)+1;return fp[i].name;}}
  return fp[0]?fp[0].name:'';
}

function _weightedPick(arr,wFn){
  var t=0;arr.forEach(function(x){t+=wFn(x);});
  var r=Math.random()*t;
  for(var i=0;i<arr.length;i++){r-=wFn(arr[i]);if(r<=0)return arr[i];}
  return arr[arr.length-1];
}

function _rnd(lo,hi){return lo+Math.random()*(hi-lo);}
function _clampX(x){return Math.max(0.11,Math.min(0.89,x));}
function _clampY(y){return Math.max(0.13,Math.min(0.87,y));}

// ── API pubblica (Cambiamento 4) ──────────────────────────────────────────
// live_engine non è più chiamato su timer. Espone:
//   liveCommentaryText(type, data) → stringa i18n per dispatchCommentary()
//   generateFoulEvent(ms)          → solo falli e superiorità (nessun altro evento)

function liveCommentaryText(type, data) {
  return _txt(type, null, data || {});
}

// Genera SOLO falli/superiorità — tutto il resto viene da movement.js
function generateFoulEvent(ms) {
  if (!ms) return null;
  var st = _liveState;

  // Intercettazione pending → testo (già emesso da movement.js, ma log duplica)
  // Non fare nulla: movement.js già chiama dispatchCommentary()

  var attack = st.attack || 'my';
  var bx = st.ballX || 0.5, by = st.ballY || 0.5;
  return _tryFoulEvent(ms, attack, bx, by);
}
