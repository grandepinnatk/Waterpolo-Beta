// ─────────────────────────────────────────────
// ui/match.js — Schermata partita live
// ─────────────────────────────────────────────

let _animReqId  = null;
let _lastFrameT = null;

// ── Coda eventi canvas ───────────────────────
// Disaccoppia il motore (che genera eventi ogni 7-14s di gioco) dalla
// visualizzazione (che mostra ogni evento con la sua durata reale).
// A speed >= ANIM_SKIP_SPEED le animazioni vengono saltate.
const ANIM_SKIP_SPEED = 10;   // da 10x in poi: solo posizione finale, niente animazioni

// Durata visiva (secondi REALI) per tipo di evento
const ANIM_DURATIONS = {
  goal:    0.0,   // gestito interamente da MovementController (celebrazione lunga)
  shot:    0.9,   // tiro verso porta
  save:    1.1,   // parata + ripartenza portiere
  pass:    0.7,   // passaggio
  foul:    0.5,   // fallo
  neutral: 0.5,   // evento neutro
};

// Coda: array di { event, animType, duration }
let _canvasQueue   = [];
let _canvasPlaying = false;  // true: stiamo riproducendo un evento
let _canvasTimer   = 0;      // secondi reali trascorsi sull'evento corrente
let _canvasCurrent = null;   // evento corrente in riproduzione

// ── Avvia partita live ────────────────────────
function startLiveMatch(match, isHome, opp, poType = null, poMatch = null) {
  // Assegna numeri di maglia dalla convocazione
  const shirtNumbers = G.lineup.shirtNumbers || {};

  G.ms = createMatchState({
    match, isHome,
    myTeam:   G.myTeam,
    oppTeam:  opp,
    myRoster:  G.rosters[G.myId],
    oppRoster: G.rosters[opp.id],
    formation: G.lineup.formation,
    shirtNumbers,
  });
  G.ms.poType  = poType;
  G.ms.poMatch = poMatch;
  G.ms.speed   = 192;  // 2.5s reali per periodo

  poolInitTokens(G.ms);
  if (typeof MovementController !== 'undefined') MovementController.init(G.ms);
  if (typeof poolSetSpeeds === 'function') poolSetSpeeds(G.ms);

  // Reset coda canvas
  _canvasQueue   = [];
  _canvasPlaying = false;
  _canvasCurrent = null;
  _canvasTimer   = 0;

  const homeTeam = isHome ? G.myTeam : opp;
  const awayTeam = isHome ? opp : G.myTeam;
  document.getElementById('m-lbl').textContent   = poType === 'final' ? t('playoff.final')
                                                  : poType === 'sf'   ? match.label
                                                  : poType === 'pl'   ? 'Play-out'
                                                  : t('common.round') + ' ' + match.round;
  document.getElementById('m-title').textContent = homeTeam.name + ' vs ' + awayTeam.name;
  document.getElementById('my-team-lbl').textContent = G.myTeam.name;
  document.getElementById('btn-end').style.display   = 'none';
  document.getElementById('btn-play').style.display  = '';
  document.getElementById('btn-play').textContent    = '▶ Avvia';
  // sub-panel rimosso — selezione ora inline
  document.getElementById('action-log').innerHTML    = '';
  document.getElementById('m-clock').textContent     = '08:00';
  _setSpeedUI(10);

  if (_animReqId) cancelAnimationFrame(_animReqId);
  _lastFrameT = null;
  _animReqId  = requestAnimationFrame(_animLoop);

  refreshMatchUI();
  renderFieldLists();
}

// ── Classifica il tipo di animazione da usare per un evento motore ─────────
function _animTypeOf(event) {
  if (!event) return 'neutral';
  if (event.goalScored)                           return 'goal';
  if (event.cls === 'sv')                         return 'save';
  if (event.moverKey && event.ballTarget)         return 'shot';
  if (event.cls === 'fl')                         return 'foul';
  if (event.ballTarget)                           return 'pass';
  return 'neutral';
}

// ── Esegue visivamente un evento (lo invia a MovementController/pool) ───────
function _dispatchCanvasEvent(event) {
  if (!event) return;
  poolSyncTokens(G.ms);
  if (typeof poolSetSpeeds === 'function') poolSetSpeeds(G.ms);

  if (event.goalScored) {
    if (typeof MovementController !== 'undefined' && MovementController.onGoalEvent) {
      MovementController.onGoalEvent(event);
      // onGoalEvent chiama internamente showGoalAnimation e onPossessChange
    } else {
      // fallback senza MovementController
      showGoalAnimation(event.goalScorer || '', event.goalTeam || 'my', G.ms);
    }

  } else if (event.cls === 'sv') {
    if (typeof MovementController !== 'undefined' && MovementController.onSave) {
      MovementController.onSave(event);
    } else if (event.ballTarget) {
      poolMoveBall(event.ballTarget.x, event.ballTarget.y);
    }
    if (typeof MovementController !== 'undefined')
      MovementController.onPossessChange(
        event.ballTarget && event.ballTarget.x < 0.5 ? 'my' : 'opp'
      );

  } else if (event.moverKey && event.ballTarget) {
    if (typeof MovementController !== 'undefined' && MovementController.onShot) {
      MovementController.onShot(event);
    } else {
      poolMoveBall(event.ballTarget.x, event.ballTarget.y);
      poolMoveToken(event.moverKey, event.moverTarget?.x || 0.5, event.moverTarget?.y || 0.5);
    }

  } else if (event.cls === 'fl') {
    if (event.ballTarget) poolMoveBall(event.ballTarget.x, event.ballTarget.y);
    if (event.moverKey)   poolMoveToken(event.moverKey, event.moverTarget?.x || 0.5, event.moverTarget?.y || 0.5);

  } else if (event.ballTarget) {
    if (typeof MovementController !== 'undefined' && MovementController.onPassOrNeutral) {
      MovementController.onPassOrNeutral(event);
    } else {
      poolMoveBall(event.ballTarget.x, event.ballTarget.y);
    }
  }

  if (event.expelled !== undefined) _handleExpulsion(event.expelled, event.moverKey);
}

// ── Applica l'evento: log testuale + sync stato ──────────────────────────────
function _applyEventLog(event) {
  if (!event) return;
  _appendLog(event.txt, event.cls);
  if (event.expelled !== undefined) _handleExpulsion(event.expelled, event.moverKey);
  poolSyncTokens(G.ms);
  if (typeof poolSetSpeeds === 'function') poolSetSpeeds(G.ms);
}

// ── Tick della coda canvas ─────────────────────────────────────────────────
// La coda non blocca più il canvas frame-by-frame.
// A velocità < ANIM_SKIP_SPEED: invia al massimo 1 evento per frame,
//   rispettando un gap minimo tra eventi per non sovrascrivere animazioni in corso.
// A velocità >= ANIM_SKIP_SPEED: svuota tutta la coda istantaneamente.
function _tickCanvasQueue(rawDt) {
  if (_canvasQueue.length === 0) return;
  const speed = G.ms ? (G.ms.speed || 1) : 1;

  if (speed >= ANIM_SKIP_SPEED) {
    // Alta velocità: applica tutti gli eventi in blocco, nessuna animazione
    while (_canvasQueue.length > 0) {
      const item = _canvasQueue.shift();
      _applyEventLog(item.event);
      _dispatchCanvasEvent(item.event);
    }
    _canvasPlaying = false;
    _canvasCurrent = null;
    _canvasTimer   = 0;
    return;
  }

  // Velocità normale: aggiorna timer dell'evento corrente
  if (_canvasPlaying) {
    _canvasTimer += rawDt;
    if (_canvasTimer < _canvasCurrent.duration) return; // ancora in corso
    _canvasPlaying = false;
    _canvasCurrent = null;
    _canvasTimer   = 0;
  }

  // Prendi il prossimo evento
  if (_canvasQueue.length > 0) {
    const item = _canvasQueue.shift();
    _applyEventLog(item.event);
    _dispatchCanvasEvent(item.event);
    if (item.duration > 0) {
      _canvasCurrent = item;
      _canvasTimer   = 0;
      _canvasPlaying = true;
    }
  }
}

// ── Loop animazione principale ────────────────
function _animLoop(timestamp) {
  _animReqId = requestAnimationFrame(_animLoop);
  const rawDt = _lastFrameT ? Math.min((timestamp - _lastFrameT) / 1000, 0.1) : 0;
  _lastFrameT = timestamp;

  if (G.ms && G.ms.running && !G.ms.finished) {
    const { periodEnded, matchEnded } = advanceTime(G.ms, rawDt);

    if (periodEnded && !matchEnded) {
      G.ms.running = false;
      document.getElementById('btn-play').textContent = '▶ ' + t('match.resume');
      _lastFrameT = null;
      if (typeof applyPeriodBreakRecovery === 'function') {
        applyPeriodBreakRecovery({ ...G.ms, period: G.ms.period - 1 });
      }
      const _breakMin = (G.ms.period - 1) === 2 ? '5' : '2';
      _appendLog('⏸ Fine ' + (G.ms.period - 1) + '° Tempo — Intervallo ' + _breakMin + ' min. Puoi effettuare sostituzioni.', 'sv');
      renderFieldLists();
      if (typeof MovementController !== 'undefined') MovementController.onPeriodStart();
      // Svuota la coda canvas a fine periodo
      _canvasQueue   = [];
      _canvasPlaying = false;
      _canvasCurrent = null;
    }
    if (matchEnded) {
      document.getElementById('btn-end').style.display  = '';
      document.getElementById('btn-play').style.display = 'none';
      if (typeof MovementController !== 'undefined') MovementController.stop();
      _canvasQueue   = [];
      _canvasPlaying = false;
    }

    // ── Genera eventi motore → accoda nella coda canvas ──────────────────────
    G.ms.lastActionTime += rawDt * (G.ms.speed || 1);
    while (G.ms.lastActionTime >= G.ms.nextActionIn && !G.ms.finished) {
      G.ms.lastActionTime -= G.ms.nextActionIn;
      G.ms.nextActionIn    = rnd(7, 14);
      const event = generateMatchEvent(G.ms);
      if (event) {
        const animType = _animTypeOf(event);
        const duration = ANIM_DURATIONS[animType] ?? ANIM_DURATIONS.neutral;
        _canvasQueue.push({ event, animType, duration });
      }
    }

    // ── Riproduci coda canvas ────────────────────────────────────────────────
    const _hadEvent = _canvasQueue.length > 0 || _canvasPlaying;
    _tickCanvasQueue(rawDt);
    // Aggiorna _everOnField e re-render lista campo solo se c'è stato un evento
    if (_hadEvent || !_canvasPlaying) {
      if (G.ms && G.ms._everOnField) {
        Object.values(G.ms.onField).forEach(pi => G.ms._everOnField.add(pi));
      }
      renderFieldLists();
    }

    const _gameSpeed = G.ms ? (G.ms.speed || 1) : 1;
    poolAnimStep(rawDt, _gameSpeed);
    if (typeof MovementController !== 'undefined') MovementController.update(rawDt);

    _checkExhaustedPlayers();
    refreshMatchUI();
  } else {
    poolAnimStep(rawDt, G.ms ? (G.ms.speed || 1) : 1);
    if (typeof MovementController !== 'undefined') MovementController.update(rawDt);
  }

  const canvas = document.getElementById('pool-canvas');
  drawPool(canvas, G.myTeam.abbr, G.ms ? G.ms.oppTeam.abbr : '');
}// ── Animazione GOAL ──────────────────────────────────────────────────
let _goalAnimTimer = null;

function showGoalAnimation(scorerName, teamType, ms) {
  const overlay  = document.getElementById('goal-overlay');
  const textEl   = document.getElementById('goal-text-el');
  const scorerEl = document.getElementById('goal-scorer-el');
  const splashEl = document.getElementById('goal-splash');
  const logoWrap = document.getElementById('goal-logo-wrap');
  if (!overlay || !textEl) return;

  // Determina se è la squadra di casa o ospite
  const isHome = teamType === 'my' ? ms.isHome : !ms.isHome;
  const side   = isHome ? 'home' : 'away';

  // Logo squadra che ha segnato
  const teamId  = teamType === 'my' ? ms.myTeam.id : ms.oppTeam.id;
  const teamDat = G.teams.find(function(t){ return t.id === teamId; });
  logoWrap.innerHTML = '';
  if (teamDat && teamDat.logo) {
    const img = document.createElement('img');
    img.src = teamDat.logo;
    img.className = 'goal-logo';
    img.onerror = function() {
      img.style.display = 'none';
      const span = document.createElement('div');
      span.className = 'goal-logo-placeholder';
      span.style.background = teamDat.col || '#00c2ff';
      span.textContent = teamDat.abbr || '⚽';
      logoWrap.appendChild(span);
    };
    logoWrap.appendChild(img);
  }

  // Testo e scorer
  textEl.textContent = t('match.goalScored');
  textEl.className   = 'goal-text ' + side;
  scorerEl.textContent = scorerName || '';
  splashEl.className = 'water-splash' + (side === 'away' ? ' away' : '');

  // Reset animazioni riapplicando le classi
  [textEl, scorerEl, splashEl, logoWrap.firstChild].forEach(function(el) {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = '';
  });

  overlay.classList.add('visible');

  // Pausa il gioco durante l'animazione
  const wasPaused = ms.running === false;
  ms.running = false;

  if (_goalAnimTimer) clearTimeout(_goalAnimTimer);
  _goalAnimTimer = setTimeout(function() {
    overlay.classList.remove('visible');
    // Riprendi alla velocità precedente solo se non era già in pausa prima
    if (!wasPaused && ms && !ms.finished) {
      ms.running = true;
      document.getElementById('btn-play').textContent = '⏸ Pausa';
    }
    _goalAnimTimer = null;
  }, 1800); // durata animazione 1.8s
}

// ── Gestisce espulsione definitiva ────────────
function _handleExpulsion(expelledPi, tokenKey) {
  const result = forceSubstitutionExpelled(G.ms, expelledPi);
  if (!result) return;
  if (result.inPlayer) {
    _appendLog('↔ Auto-cambio: entra ' + result.inPlayer.name +
               ' (#' + (G.ms.shirtNumbers[G.ms.onField[result.posKey]] || '?') + ') al posto dell\'espulso', 'sub');
  } else {
    _appendLog(t('extra.noSubForPos') + ' ' + result.posKey, 'fl');
  }
  // Nasconde il token del giocatore espulso
  if (tokenKey && _tokens) {
    const tok = _tokens[tokenKey];
    if (tok) { tok.expelled = true; tok.tx = -0.2; tok.ty = -0.2; }
  }
  // Aggiorna token con il nuovo giocatore
  if (result.inPlayer && tokenKey) {
    poolUpdateToken(tokenKey, G.ms);
  }
}

// ── Aggiorna UI testuale ──────────────────────
function refreshMatchUI() {
  const ms = G.ms; if (!ms) return;
  const hS = ms.isHome ? ms.myScore : ms.oppScore;
  const aS = ms.isHome ? ms.oppScore : ms.myScore;
  document.getElementById('m-score').textContent   = hS + ' - ' + aS;
  document.getElementById('m-period').textContent  = ms.period + '° ' + t('match.period', {n:''}).replace('°','').trim();
  const _subEl = document.getElementById('sub-count'); if (_subEl) _subEl.textContent = t('match.subsDone', {n: ms.subs});

  // ── Timer countdown: mostra secondi rimanenti nel periodo corrente ──
  const elapsed  = ms.totalSeconds - (ms.period - 1) * PERIOD_SECONDS;
  const remaining = Math.max(0, PERIOD_SECONDS - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60);
  document.getElementById('m-clock').textContent =
    String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');

  // ── Barre % attacco e difesa ──
  const totShots = ms.myShots + ms.oppShots || 1;
  const myAttPct  = Math.round((ms.myShots  / totShots) * 100);
  const oppAttPct = 100 - myAttPct;
  // Difesa: % parate sul totale tiri avversari
  const myDefPct  = ms.oppShots > 0 ? Math.round((ms.mySaves / ms.oppShots) * 100) : 100;
  const oppDefPct = ms.myShots  > 0 ? Math.round(((ms.myShots - ms.myScore) / ms.myShots) * 100) : 100;
  // Normalizza difesa a 100
  const defTot    = myDefPct + oppDefPct || 1;
  const myDefBar  = Math.round(myDefPct  / defTot * 100);
  const oppDefBar = 100 - myDefBar;

  const homeLabel = ms.isHome ? ms.myTeam.abbr : ms.oppTeam.abbr;
  const awayLabel = ms.isHome ? ms.oppTeam.abbr : ms.myTeam.abbr;
  const myIsHome  = ms.isHome;

  // Attacco
  const hAttPct = myIsHome ? myAttPct : oppAttPct;
  const aAttPct = myIsHome ? oppAttPct : myAttPct;
  const hAttBar = myIsHome ? myAttPct : oppAttPct;
  _setBar('m-att-home-pct', 'm-att-away-pct', 'm-att-bar-home', 'm-att-bar-away',
          hAttPct + '%', aAttPct + '%', hAttBar);

  // Difesa
  const hDefPct = myIsHome ? myDefPct : oppDefPct;
  const aDefPct = myIsHome ? oppDefPct : myDefPct;
  const hDefBar = myIsHome ? myDefBar : oppDefBar;
  _setBar('m-def-home-pct', 'm-def-away-pct', 'm-def-bar-home', 'm-def-bar-away',
          hDefPct + '%', aDefPct + '%', hDefBar);

  // ── Stats numeriche — riga singola compatta ──
  const _att    = ms.attendance || 0;
  const _cap    = ms.capacity   || (G.stadium ? stadiumCapacity() : 500);
  const _attPct = _cap > 0 ? Math.round(_att / _cap * 100) : 0;
  const _attRow = ms.isHome && _att > 0
    ? `<span style="color:var(--muted)">Spettatori</span><span style="font-weight:700">${_att.toLocaleString('it-IT')}</span>
       <span style="color:var(--muted);font-size:9px">${_attPct}% di ${_cap.toLocaleString('it-IT')}</span><span></span>`
    : '';
  document.getElementById('m-stats').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 6px;font-size:10px">
      <span style="color:var(--muted)">Tiri</span>      <span style="font-weight:700">${ms.myShots} — ${ms.oppShots}</span>
      <span style="color:var(--muted)">Parate</span>    <span style="font-weight:700">${ms.mySaves}</span>
      <span style="color:var(--muted)">Falli/Esp.</span><span style="font-weight:700">${ms.myFouls}</span>
      ${_attRow}
    </div>`;

  // ── Parziali per tempo ──
  const partialsEl = document.getElementById('m-partials');
  if (partialsEl) {
    const homeTeam = ms.isHome ? ms.myTeam  : ms.oppTeam;
    const awayTeam = ms.isHome ? ms.oppTeam : ms.myTeam;
    const isMyHome = ms.isHome;
    const ps       = ms.periodScores || [{my:0,opp:0},{my:0,opp:0},{my:0,opp:0},{my:0,opp:0}];

    // Nomi corti per l'intestazione
    const homeLbl = homeTeam.abbr || homeTeam.name;
    const awayLbl = awayTeam.abbr || awayTeam.name;

    let html = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:3px 4px;font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">Tempo</th>
            <th style="text-align:center;padding:3px 6px;font-size:10px;font-weight:700;color:${isMyHome ? 'var(--blue)' : 'var(--muted)'}">${homeLbl}</th>
            <th style="text-align:center;padding:3px 6px;font-size:10px;font-weight:700;color:${!isMyHome ? 'var(--blue)' : 'var(--muted)'}">${awayLbl}</th>
          </tr>
        </thead>
        <tbody>`;

    for (let tp = 0; tp < 4; tp++) {
      const isCurrent = (tp + 1) === ms.period && !ms.finished;
      const isPast    = (tp + 1) < ms.period || ms.finished;
      const isFuture  = !isCurrent && !isPast;

      const homeGoals = isMyHome ? ps[tp].my  : ps[tp].opp;
      const awayGoals = isMyHome ? ps[tp].opp : ps[tp].my;

      const rowBg = isCurrent ? 'background:rgba(0,194,255,.07)' : '';
      const valStyle = isFuture
        ? 'color:rgba(255,255,255,.2)'
        : isCurrent
          ? 'font-weight:700;color:var(--text)'
          : 'color:var(--muted)';

      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,.05);${rowBg}">
          <td style="padding:5px 4px;color:${isCurrent ? 'var(--gold)' : 'var(--muted)'};font-size:11px;font-weight:${isCurrent ? 700 : 400}">
            ${isCurrent ? '▶ ' : ''}${tp + 1}° T
          </td>
          <td style="text-align:center;padding:5px 6px;${valStyle}">${isFuture ? '—' : homeGoals}</td>
          <td style="text-align:center;padding:5px 6px;${valStyle}">${isFuture ? '—' : awayGoals}</td>
        </tr>`;
    }

    html += '</tbody></table>';
    partialsEl.innerHTML = html;
  }
}

function _setBar(idHPct, idAPct, idHBar, idABar, hLabel, aLabel, hPct) {
  const hEl = document.getElementById(idHPct); if (hEl) hEl.textContent = hLabel;
  const aEl = document.getElementById(idAPct); if (aEl) aEl.textContent = aLabel;
  const hB  = document.getElementById(idHBar);  if (hB)  hB.style.width = hPct + '%';
  const aB  = document.getElementById(idABar);  if (aB)  aB.style.width = (100 - hPct) + '%';
}

// ── Aggiunge riga al log ──────────────────────
function _appendLog(txt, cls) {
  const ms = G.ms; if (!ms) return;
  ms.actions.push({ t: formatMatchTime(ms.totalSeconds), txt, cls });
  const log = document.getElementById('action-log'); if (!log) return;
  const el = document.createElement('div');
  el.className   = 'ae ' + (cls || '');
  el.textContent = '[' + formatMatchTime(ms.totalSeconds) + '] ' + txt;
  log.insertBefore(el, log.firstChild);
  while (log.children.length > 40) log.removeChild(log.lastChild);

  // Overlay flash grigio sul log per eventi goal
  if (cls === 'myg' || cls === 'og') {
    const logWrap = log.parentElement;
    if (logWrap) {
      const flash = document.createElement('div');
      flash.style.cssText = 'position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
        'background:rgba(180,180,200,.22);z-index:10;transition:opacity .5s';
      logWrap.style.position = 'relative';
      logWrap.appendChild(flash);
      setTimeout(() => { flash.style.opacity = '0'; }, 80);
      setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 600);
    }
  }
}

// ── Liste in campo / panchina ─────────────────
// Restituisce "Cognome I." per le tabelle
function _shortPlayerName(p) {
  if (!p || !p.name) return '—';
  // Formato "M. Rossi" → "Rossi M."
  if (/^[A-Z]\. /.test(p.name)) {
    const parts = p.name.split(' ');
    const init  = parts[0];
    const cogn  = parts.slice(1).join(' ');
    return cogn + ' ' + init;
  }
  // Formato "Marco Rossi" → "Rossi M."
  const parts = p.name.trim().split(' ');
  if (parts.length >= 2) return parts[parts.length - 1] + ' ' + parts[0][0] + '.';
  return p.name;
}

// Controlla giocatori esauriti (stamina = 0) in campo e li segnala

// ── Cambi automatici a fine periodo ──────────────────────────────────
// Sostituisce i giocatori più stanchi con i più freschi dalla panchina
// tenendo conto del ruolo (non si toglie il POR salvo necessità)
function _autoSubsPeriodEnd(ms) {
  if (!ms || ms.finished) return;

  // ── Efficacia effettiva: stessa formula del motore di gioco ──────────────
  // eff = overall × roleFactor × staminaFactor  (staminaFactor: 0.40–1.00)
  function _eff(p, pk, stamina) {
    if (!p) return 0;
    const rf = (typeof _roleEffectiveness === 'function') ? _roleEffectiveness(p, pk) : 1.0;
    const sf = 0.40 + (Math.min(100, Math.max(0, stamina)) / 100) * 0.60;
    return p.overall * rf * sf;
  }

  // ── Cambi squadra del manager ──────────────────────────────────────────
  // Valuta se esiste un sostituto che migliora l'efficacia sulla posizione
  const fieldEntries = Object.entries(ms.onField)
    .filter(([pk, pi]) => !ms.expelled.has(pi) && pk !== 'GK')
    .map(([pk, pi]) => {
      const p = ms.myRoster[pi];
      const stamina = ms.stamina[pi] ?? 100;
      return { pk, pi, p, stamina, eff: _eff(p, pk, stamina) };
    });

  const benchAvail = ms.bench
    .filter(pi => !ms.expelled.has(pi) && ms.myRoster[pi]?.role !== 'POR')
    .map(pi => {
      const p = ms.myRoster[pi];
      // Per il sostituto: stima la sua stamina nella posizione
      // (in panchina ha recuperato, quindi usiamo la stamina attuale)
      const stamina = ms.stamina[pi] ?? (p?.fitness ?? 80);
      return { pi, p, stamina };
    });

  for (const { pk, pi, p: outP, stamina: outSt, eff: outEff } of fieldEntries) {
    if (benchAvail.length === 0) break;

    // Per ogni riserva disponibile, calcola la sua efficacia stimata in questa posizione
    const candidates = benchAvail
      .map(b => ({
        ...b,
        eff: _eff(b.p, pk, b.stamina),
      }))
      .filter(b => b.eff > outEff) // entra solo se migliora l'efficacia
      .sort((a, b) => b.eff - a.eff); // il migliore primo

    if (candidates.length === 0) continue; // nessun sostituto vantaggioso

    // Preferenza per ruoli compatibili tra i candidati vantaggiosi
    const posRole = outP?.role;
    const sameRole = candidates.find(b =>
      b.p?.role === posRole || b.p?.secondRole === posRole
    );
    const chosen = sameRole || candidates[0];

    const result = performSubstitution(ms, pk, chosen.pi);
    if (result) {
        const outName = _shortPlayerName(result.outPlayer);
        const inName  = _shortPlayerName(result.inPlayer);
        const outSt   = Math.round(ms.stamina[pi] ?? 0);
        const inSt    = Math.round(ms.stamina[chosen.pi] ?? 100);
        _appendLog(`↔ Cambio automatico [${pk}]: ${outName} (${outSt}%) → ${inName} (${inSt}%)`, 'sub');
        // Rimuovi chosen da benchAvail
        const idx = benchAvail.indexOf(chosen);
        if (idx >= 0) benchAvail.splice(idx, 1);
      }
    }

  // ── Cambi CPU (avversario) ──
  // La CPU ha un oppRoster ma non un ms.onField per loro — simuliamo con fatigue
  if (ms.oppRoster && ms.oppRoster.length > 0) {
    // Traccia giocatori CPU in campo e panchina tramite ms._oppOnField / ms._oppBench
    if (!ms._oppOnField) {
      // Inizializza: i primi 7 non-POR + 1 POR sono in campo
      const por = ms.oppRoster.findIndex(p => p && p.role === 'POR');
      const others = ms.oppRoster.map((_,i)=>i).filter(i => ms.oppRoster[i] && ms.oppRoster[i].role !== 'POR');
      ms._oppOnField = por >= 0 ? [por, ...others.slice(0,6)] : others.slice(0,7);
      ms._oppBench   = ms.oppRoster.map((_,i)=>i).filter(i => !ms._oppOnField.includes(i));
      ms._oppStamina = {};
      ms.oppRoster.forEach((p,i) => { ms._oppStamina[i] = p ? (p.fitness || 80) : 80; });
    }

    // Drena stamina CPU proporzionalmente al periodo
    ms._oppOnField.forEach(i => {
      const p = ms.oppRoster[i];
      if (!p) return;
      const drain = 8 + Math.random() * 6; // 8-14 per periodo
      ms._oppStamina[i] = Math.max(0, (ms._oppStamina[i] || 80) - drain);
    });

    // Effettua cambi CPU
    let cpuSubs = 0;
    const oppFieldSorted = [...ms._oppOnField]
      .filter(i => ms.oppRoster[i]?.role !== 'POR')
      .map(i => ({ i, stamina: ms._oppStamina[i] || 0 }))
      .sort((a,b) => a.stamina - b.stamina);

    const oppBenchSorted = [...ms._oppBench]
      .filter(i => ms.oppRoster[i]?.role !== 'POR')
      .map(i => ({ i, stamina: ms._oppStamina[i] || (ms.oppRoster[i]?.fitness || 80) }))
      .sort((a,b) => b.stamina - a.stamina);

    for (const { i: outIdx, stamina } of oppFieldSorted) {
      if (oppBenchSorted.length === 0) break;
      const bestIn = oppBenchSorted[0];
      // CPU cambia solo se il sostituto ha efficacia stimata superiore
      const outP2 = ms.oppRoster[outIdx];
      const inP2  = ms.oppRoster[bestIn.i];
      const outEff2 = outP2 ? outP2.overall * (0.40 + stamina/100*0.60) : 0;
      const inEff2  = inP2  ? inP2.overall  * (0.40 + bestIn.stamina/100*0.60) : 0;
      if (inEff2 > outEff2) {
        const outP = ms.oppRoster[outIdx];
        const inP  = ms.oppRoster[bestIn.i];
        if (!outP || !inP) continue;
        // Esegui cambio
        ms._oppOnField = ms._oppOnField.filter(x => x !== outIdx);
        ms._oppOnField.push(bestIn.i);
        ms._oppBench   = ms._oppBench.filter(x => x !== bestIn.i);
        ms._oppBench.push(outIdx);
        oppBenchSorted.shift();
        _appendLog(`↔ ${ms.oppTeam.abbr}: ${_shortPlayerName(outP)} (${Math.round(stamina)}%) → ${_shortPlayerName(inP)}`, 'sv');
        cpuSubs++;
      }
    }

    // Aggiorna la forza CPU in base alla stamina media dei giocatori in campo
    if (ms._oppOnField.length > 0) {
      const avgStamina = ms._oppOnField.reduce((s,i) => s + (ms._oppStamina[i]||80), 0) / ms._oppOnField.length;
      ms.oppTeam._staminaFactor = 0.40 + (avgStamina / 100) * 0.60;
    }
  }

  renderFieldLists();
}

function _checkExhaustedPlayers() {
  const ms = G.ms; if (!ms || ms.finished) return;
  const exhausted = [];
  Object.entries(ms.onField).forEach(([pk, pi]) => {
    if (ms.expelled.has(pi)) return;
    const stamina = ms.stamina[pi];
    if (stamina !== undefined && stamina <= 0 && !ms._notifiedExhausted?.has(pi)) {
      if (!ms._notifiedExhausted) ms._notifiedExhausted = new Set();
      ms._notifiedExhausted.add(pi);
      const p = ms.myRoster[pi];
      const shirt = ms.shirtNumbers[pi] || '?';
      exhausted.push({ pi, pk, p, shirt });
    }
  });
  exhausted.forEach(({ pi, pk, p, shirt }) => {
    const name = p ? _shortPlayerName(p) : '#' + shirt;
    _appendLog(`⚠️ #${shirt} ${name} ${t('extra.playerExhausted')}`, 'fl');
  });
  // Pausa automatica se ci sono esauriti — SOLO se ci sono abbastanza giocatori per sostituire
  if (exhausted.length > 0 && ms.running) {
    const activePlayers = Object.values(ms.onField).filter(pi => !ms.expelled.has(pi)).length;
    const benchAvail    = ms.bench.filter(pi => !ms.expelled.has(pi)).length;
    if (activePlayers > 5 && benchAvail > 0) {
      // Può fare sostituzioni: forza pausa
      ms.running = false;
      document.getElementById('btn-play').textContent = '▶ ' + t('match.resume');
      _lastFrameT = null;
      _appendLog(t('injuries.autoPause'), 'sv');
    } else {
      // Solo 5 in campo o panchina vuota: non si può sostituire, continua con penalità
      _appendLog(t('injuries.noSub'), 'fl');
    }
  }
}

// Badge ruolo colorato (stessa classe CSS della tab Rosa)
function _roleBadge(role) {
  const cls = role==='POR'?'S': role==='DIF'?'A': role==='CB'?'B': 'C';
  return `<span class="badge ${cls}">${role}</span>`;
}

// Badge mano colorato
function _handBadge(hand) {
  const cls = hand==='AMB'?'AMB': hand==='L'?'L': 'R';
  return `<span class="badge ${cls}">${hand}</span>`;
}

// Etichetta posizione semplificata: GK→POR, altrimenti il numero
function _simplePosLabel(pk) {
  if (!pk) return '—';
  if (pk === 'GK') return 'POR';
  return String(pk);  // '1','2','3','4','5','6'
}


// Badge RIT per la schermata partita

// Badge SCAD per contratto in scadenza
function _scadBadge(p) {
  if (!p || (p.contractYears === undefined) || p.contractYears > 1) return '';
  return '<span style="font-size:9px;background:#7b2fbe;color:#fff;font-weight:700;' +
         'padding:1px 4px;border-radius:3px;margin-left:3px" title="Contratto in scadenza">SCAD</span>';
}

function _ritBadge(p) {
  if (!p || p.retirementAge === undefined) return '';
  if ((p.age + 1) < p.retirementAge) return '';
  return '<span style="font-size:9px;background:#c0392b;color:#fff;font-weight:700;' +
         'padding:1px 4px;border-radius:3px;margin-left:3px" title="Si ritira a fine stagione">RIT</span>';
}


// Inietta CSS per animazione swap e selezione righe
(function() {
  if (document.getElementById('swap-sub-style')) return;
  const s = document.createElement('style');
  s.id = 'swap-sub-style';
  s.textContent = `
    .player-row { cursor:default; transition:background .15s; }
    .player-row.selectable { cursor:pointer; }
    .player-row.selectable:hover { background:rgba(0,194,255,.07) !important; }
    .player-row.sel-field { background:rgba(0,194,255,.18) !important; outline:1.5px solid var(--blue); border-radius:4px; }
    .player-row.sel-bench { background:rgba(240,192,64,.18) !important; outline:1.5px solid var(--gold); border-radius:4px; }
    .player-row.swap-anim-up   { animation: swapUp 0.35s ease-out; }
    .player-row.swap-anim-down { animation: swapDown 0.35s ease-out; }
    @keyframes swapUp   { 0%{transform:translateY(30px);opacity:0} 100%{transform:none;opacity:1} }
    @keyframes swapDown { 0%{transform:translateY(-30px);opacity:0} 100%{transform:none;opacity:1} }
    #btn-swap-sub.ready {
      background:linear-gradient(135deg,var(--blue),#0080cc) !important;
      border-color:var(--blue) !important;
      color:#fff !important;
      cursor:pointer !important;
      box-shadow:0 2px 12px rgba(0,194,255,.4);
      animation: pulse-swap 1.2s infinite;
    }
    @keyframes pulse-swap { 0%,100%{box-shadow:0 2px 12px rgba(0,194,255,.4)} 50%{box-shadow:0 2px 20px rgba(0,194,255,.7)} }
  `;
  document.head.appendChild(s);
})();


// ── Stato selezione cambio inline ──────────────
var _subSelField = null;  // pk selezionato in campo
var _subSelBench = null;  // pi selezionato in panchina

function _updateSwapButton() {
  const btn = document.getElementById('btn-swap-sub');
  const status = document.getElementById('sub-status');
  if (!btn) return;
  if (_subSelField !== null && _subSelBench !== null) {
    btn.disabled = false;
    btn.classList.add('ready');
    if (status) status.textContent = t('common.ok') + '!';
  } else {
    btn.disabled = true;
    btn.classList.remove('ready');
    if (status) {
      if (_subSelField === null && _subSelBench === null) status.textContent = '';
      else if (_subSelField === null) status.textContent = t('match.onField');
      else status.textContent = t('match.bench');
    }
  }
}

function selFieldRow(pk) {
  const ms = G.ms; if (!ms || ms.finished) return;
  if (ms.expelled.has(ms.onField[pk])) return;
  _subSelField = (_subSelField === pk) ? null : pk;
  _updateSwapButton();
  renderFieldLists();
}

function selBenchRow(pi) {
  const ms = G.ms; if (!ms || ms.finished) return;
  if (ms.expelled.has(pi)) return;
  _subSelBench = (_subSelBench === pi) ? null : pi;
  _updateSwapButton();
  renderFieldLists();
}

function confirmSwap() {
  const ms = G.ms;
  if (!ms || _subSelField === null || _subSelBench === null) return;
  const result = performSubstitution(ms, _subSelField, _subSelBench);
  if (!result) return;

  const shirtOut = ms.shirtNumbers[result.outRosterIdx] || '?';
  const shirtIn  = ms.shirtNumbers[result.inRosterIdx]  || '?';
  _appendLog('↔ Cambio: #' + shirtOut + ' ' + _shortPlayerName(result.outPlayer) +
             ' → #' + shirtIn + ' ' + _shortPlayerName(result.inPlayer), 'sub');
  // Congela il voto del giocatore uscente al momento del cambio
  if (!ms.frozenRatings) ms.frozenRatings = {};
  if (typeof calcPlayerRating === 'function') {
    ms.frozenRatings[result.outRosterIdx] = calcPlayerRating(result.outRosterIdx, ms);
  }

  // Reset selezione
  const _animIn  = result.inRosterIdx;
  const _animOut = result.outRosterIdx;
  _subSelField = null;
  _subSelBench = null;
  _updateSwapButton();
  // Render con animazione solo sulle righe coinvolte
  renderFieldLists({ animIn: _animIn, animOut: _animOut });
}

function renderFieldLists(anim) {
  const ms = G.ms; if (!ms) return;
  const isPaused = !ms.running && !ms.finished;
  // anim: { animIn: pi, animOut: pi } oppure undefined
  const _animIn  = anim && anim.animIn  !== undefined ? anim.animIn  : null;
  const _animOut = anim && anim.animOut !== undefined ? anim.animOut : null;

  // Helper badge ruolo (standard)
  function roleBadge(role) {
    if (!role) return '';
    const cls = role==='POR'?'S': role==='DIF'?'A': role==='CB'?'B': 'C';
    return `<span class="badge ${cls}" style="font-size:9px;padding:1px 3px">${role}</span>`;
  }

  // Helper badge mano (standard)
  function handBadge(hand) {
    const cls = hand==='AMB'?'AMB': hand==='L'?'L': 'R';
    return `<span class="badge ${cls}" style="font-size:9px;padding:1px 3px">${hand}</span>`;
  }

  // Pallini espulsioni temporanee
  function expDots(pi) {
    const count = ms.tempExp[pi] || 0;
    if (count === 0) return '';
    return Array.from({ length: count }).map((_, i) => {
      const color = (count >= MAX_TEMP_EXP || i === MAX_TEMP_EXP - 1) ? '#e74c3c' : '#f0c040';
      return `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:1px"></span>`;
    }).join('');
  }

  // Stamina cell
  function staminaCell(pi) {
    const st  = Math.round(ms.stamina[pi] ?? 100);
    const col = st > 65 ? '#2ecc71' : st > 35 ? '#f0c040' : '#e74c3c';
    return `<div style="display:flex;align-items:center;gap:2px">
      <div style="width:28px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;flex-shrink:0">
        <div style="width:${st}%;height:100%;background:${col};border-radius:2px;transition:width .4s"></div>
      </div>
      <span style="font-size:9px;color:${col};font-weight:700;min-width:22px">${st}%</span>
    </div>`;
  }

  // Griglia: #(18) | Nome(1fr) | VOT(28) | Pos(22) | Ruolo(44) | Mano(28) | Età(20) | OVR(24) | Stamina(58) | Esp(24) | ⚽(18) | 🤝(18)
  const COL = '18px minmax(0,.75fr) 28px 22px 44px 30px 20px 24px 58px 24px 18px 18px';

  const hdr = `<div style="display:grid;grid-template-columns:${COL};
    gap:2px;padding:2px 3px 4px;border-bottom:1px solid var(--border);
    font-size:8px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;user-select:none">
    <div>#</div><div>Nome</div>
    <div style="text-align:center;color:var(--gold)">VOT</div>
    <div style="text-align:center">Pos</div>
    <div>Ruolo</div>
    <div>Mano</div>
    <div style="text-align:center">Età</div>
    <div style="text-align:center">OVR</div>
    <div>Stamina</div>
    <div style="text-align:center">Esp</div>
    <div style="text-align:center" title="Gol">⚽</div>
    <div style="text-align:center" title="Assist">🤝</div>
  </div>`;

  function playerRow(pi, pk, isBench, selClass, animClass) {
    const p = ms.myRoster[pi]; if (!p) return '';
    const shirt = ms.shirtNumbers[pi] || '—';
    const isExp = ms.expelled.has(pi);
    const mGoals   = (ms.matchGoals   && ms.matchGoals[pi])   || 0;
    const mAssists = (ms.matchAssists && ms.matchAssists[pi]) || 0;
    const posLabel = pk ? _simplePosLabel(pk) : '';
    const rating   = (typeof calcPlayerRating === 'function') ? calcPlayerRating(pi, ms) : 6.0;
    const rc = rating >= 7.5 ? 'var(--green)' : rating >= 6.5 ? 'var(--gold)' : rating >= 5.5 ? 'var(--muted)' : 'var(--red)';
    const canSel   = isPaused && !isExp;
    const selFn    = canSel ? (isBench ? `selBenchRow(${pi})` : `selFieldRow('${pk}')`) : '';
    const rowBg    = selClass === 'sel-field' ? 'rgba(0,194,255,.15)' : selClass === 'sel-bench' ? 'rgba(240,192,64,.15)' : '';
    const bHasPlayed = ms._everOnField && ms._everOnField.has(pi);
    // Per chi è in panchina dopo essere uscito: usa il voto congelato al momento del cambio
    const frozenRating = ms.frozenRatings && ms.frozenRatings[pi] !== undefined ? ms.frozenRatings[pi] : null;
    const dispRating = isBench
      ? (frozenRating !== null ? frozenRating.toFixed(1) : (bHasPlayed ? rating.toFixed(1) : '—'))
      : rating.toFixed(1);
    const dispRc = isBench && frozenRating !== null
      ? (frozenRating >= 7.5 ? 'var(--green)' : frozenRating >= 6.5 ? 'var(--gold)' : frozenRating >= 5.5 ? 'var(--muted)' : 'var(--red)')
      : rc;
    // Ogni cella cliccabile (eccetto il nome) chiama selFn
    const c_ = (content, extraStyle) => canSel
      ? `<div onclick="${selFn}" style="cursor:pointer;${extraStyle||''}">${content}</div>`
      : `<div style="${extraStyle||''}">${content}</div>`;
    return `<div class="player-row ${selClass} ${animClass}"
      style="display:grid;grid-template-columns:${COL};
             gap:2px;align-items:center;padding:4px 3px;
             border-bottom:1px solid rgba(30,58,92,.3);
             background:${rowBg};
             opacity:${isExp ? '.4' : '1'}">
      ${c_(`<span style="font-weight:700;color:${isBench?'var(--muted)':'var(--blue)'};font-size:10px">#${shirt}</span>`)}
      <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                  cursor:pointer;color:var(--blue);text-decoration:underline dotted;text-underline-offset:2px"
           onclick="showMatchPlayerInfo(${pi})" title="Info">${_shortPlayerName(p)}</div>
      ${c_(`<span style="font-size:11px;font-weight:800;color:${dispRc}">${dispRating}</span>`, 'text-align:center')}
      ${c_(`<span style="font-size:10px;font-weight:700;color:var(--blue)">${posLabel}</span>`, 'text-align:center')}
      ${c_(`<span style="display:flex;gap:1px;flex-wrap:wrap;align-items:center">${roleBadge(p.role)}${p.secondRole ? roleBadge(p.secondRole) : ''}</span>`)}
      ${c_(handBadge(p.hand))}
      ${c_(`<span style="font-size:10px;color:var(--muted)">${p.age}</span>`, 'text-align:center')}
      ${c_(`<span style="font-size:10px;font-weight:700;color:var(--blue)">${p.overall}</span>`, 'text-align:center')}
      ${c_(isExp
        ? '<span style="font-size:9px;color:var(--red)">ESP</span>'
        : staminaCell(pi) + (p.injured
            ? '<span style="font-size:8px;background:#e74c3c;color:#fff;font-weight:700;padding:0 3px;border-radius:2px;margin-left:2px">INF</span>'
            : '')
      )}
      ${c_(expDots(pi), 'text-align:center')}
      ${c_(`<span style="font-size:10px;font-weight:700;color:${mGoals>0?'var(--blue)':'var(--muted)'}">${mGoals||'—'}</span>`, 'text-align:center')}
      ${c_(`<span style="font-size:10px;font-weight:700;color:${mAssists>0?'var(--green)':'var(--muted)'}">${mAssists||'—'}</span>`, 'text-align:center')}
    </div>`;
  }

  // ── IN CAMPO — ordine GK poi 1→2→3→4→5→6 ──────────────
  const POS_ORDER = { GK:0, '1':1, '2':2, '3':3, '4':4, '5':5, '6':6 };
  const onFieldEntries = Object.entries(ms.onField)
    .sort(([pkA], [pkB]) => (POS_ORDER[pkA]??9) - (POS_ORDER[pkB]??9));

  let fieldHtml = hdr;
  onFieldEntries.forEach(([pk, pi]) => {
    const selCls  = (_subSelField === pk) ? 'sel-field' : '';
    const animCls = (_animIn === pi) ? 'swap-anim-up' : '';
    fieldHtml += playerRow(pi, pk, false, selCls, animCls);
  });
  document.getElementById('field-players').innerHTML = fieldHtml;

  // ── PANCHINA — ordine POR→DIF→CEN→ATT→CB ──────────────
  const ROLE_ORDER = { POR:0, DIF:1, CEN:2, ATT:3, CB:4 };
  const benchSorted = [...ms.bench].sort((a, b) => {
    const pa = ms.myRoster[a], pb = ms.myRoster[b];
    const ra = pa ? (ROLE_ORDER[pa.role]??5) : 9;
    const rb = pb ? (ROLE_ORDER[pb.role]??5) : 9;
    return ra !== rb ? ra - rb : (pb?.overall||0) - (pa?.overall||0);
  });

  let benchHtml = hdr;
  benchSorted.forEach(pi => {
    const selCls  = (_subSelBench === pi) ? 'sel-bench' : '';
    const animCls = (_animOut === pi) ? 'swap-anim-down' : '';
    benchHtml += playerRow(pi, null, true, selCls, animCls);
  });
  document.getElementById('bench-players').innerHTML =
    benchSorted.length ? benchHtml : '<div style="color:var(--muted);font-size:12px;padding:8px">Panchina vuota</div>';
}
// ── Controlli partita ─────────────────────────
function togglePlay() {
  const ms = G.ms; if (!ms || ms.finished) return;
  ms.running = !ms.running;
  document.getElementById('btn-play').textContent = ms.running ? '⏸ Pausa' : '▶ Avvia';
  if (ms.running) { _subSelField = null; _subSelBench = null; _updateSwapButton(); }
  if (!ms.running) renderFieldLists(); // re-render con isPaused=true per abilitare i click
  _lastFrameT = null;

  // Se stiamo avviando e il canvas è in fase 'idle' (kickoff),
  // inizia lo sprint — la velocità verrà ripristinata da MovementController
  if (ms.running && typeof poolGetPhase === 'function' && poolGetPhase() === 'idle') {
    const prevSpeed = ms.speed;
    // Forza velocità 1x durante lo sprint per rendere l'animazione visibile
    setSpeed(1);
    if (typeof MovementController !== 'undefined' && MovementController.onSprintStart) {
      MovementController.onSprintStart(prevSpeed);
    } else if (typeof poolBeginSprint === 'function') {
      poolBeginSprint(prevSpeed);
    }
  }
}


function skipPeriod() {
  const ms = G.ms; if (!ms || ms.finished) return;
  ms.running = false;
  document.getElementById('btn-play').textContent = '▶ ' + t('match.resume');

  // Svuota la coda canvas — in fase skip non ci sono animazioni
  _canvasQueue   = [];
  _canvasPlaying = false;
  _canvasCurrent = null;
  _canvasTimer   = 0;

  // Calcola quanti secondi di gioco restano nel periodo corrente
  const periodStart  = (ms.period - 1) * PERIOD_SECONDS;
  const periodEnd    = ms.period * PERIOD_SECONDS;
  const secsLeft     = periodEnd - ms.totalSeconds;

  if (secsLeft <= 0) { refreshMatchUI(); return; }

  // Simula gli eventi rimanenti del periodo: ogni evento si ripete
  // ogni ~7s di gioco (media dell'intervallo 4-11s usato nel loop reale)
  const SIM_INTERVAL = 7; // secondi di gioco per evento
  let simTime = 0;

  _appendLog(t('extra.simEnd') + ' ' + ms.period + '°...', '');

  // Registra i giocatori attualmente in campo come "hanno giocato"
  if (!ms._everOnField) ms._everOnField = new Set();
  Object.values(ms.onField).forEach(function(pi) { ms._everOnField.add(pi); });

  while (simTime < secsLeft) {
    // Avanza la stamina per questo chunk di tempo
    if (typeof _drainStaminaChunk === 'function') {
      _drainStaminaChunk(ms, SIM_INTERVAL);
    } else {
      // Fallback inline: applica drain proporzionale
      const DRAIN_BASE = 0.012;
      Object.entries(ms.onField).forEach(([pk, pi]) => {
        if (ms.expelled.has(pi)) return;
        const p = ms.myRoster[pi];
        if (!p) return;
        const drain = DRAIN_BASE * SIM_INTERVAL * (pk === 'GK' ? 0.4 : 1.0);
        if (ms.stamina[pi] === undefined) ms.stamina[pi] = p.fitness;
        ms.stamina[pi] = Math.max(0, ms.stamina[pi] - drain);
      });
    }

    // Genera un evento simulato
    const event = generateMatchEvent(ms);
    if (event && event.txt) {
      _appendLog(event.txt, event.cls);
      // Aggiorna animazione canvas
      // Skip: nessuna animazione — solo aggiornamento posizione finale palla
      // (poolShowGoal e poolMoveToken non vengono chiamati)
      if (event.expelled !== undefined) _handleExpulsion(event.expelled, event.moverKey);
    }

    simTime += SIM_INTERVAL;
  }

  // Porta il tempo esattamente a fine periodo
  ms.totalSeconds = periodEnd;

  // Triggera la fine periodo come fa il game loop
  if (ms.period < TOTAL_PERIODS) {
    // Applica recupero stamina durante l'intervallo
    if (typeof applyPeriodBreakRecovery === 'function') {
      applyPeriodBreakRecovery(ms); // ms.period è ancora il periodo appena finito
    }
    ms.period++;
    if (typeof poolStartPeriod === 'function') poolStartPeriod();
    _autoSubsPeriodEnd(ms);
    const _skipBreakMin = (ms.period - 1) === 2 ? '5' : '2';
    _appendLog('⏸ Fine ' + (ms.period - 1) + '° Tempo — Intervallo ' + _skipBreakMin + ' min. Puoi effettuare ulteriori sostituzioni.', 'sv');
  } else {
    ms.finished = true;
    document.getElementById('btn-end').style.display  = '';
    document.getElementById('btn-play').style.display = 'none';
    _appendLog(t('extra.fullTime'), 'sv');
    // Le stelle e la deduzione ingaggi vengono assegnate in _doEndMatch
    // quando l'utente clicca "Fine Partita". Segniamo un flag per sicurezza.
    ms._skipEndedMatch = true;
  }

  poolSyncTokens(ms);
  renderFieldLists();
  refreshMatchUI();
}

// ── Pannello cambi ────────────────────────────
// Apre il pannello e mette in pausa la partita
function openSub() {
  const ms = G.ms; if (!ms || ms.finished) return;
  // Metti in pausa e reset selezione inline
  if (ms.running) {
    ms.running = false;
    document.getElementById('btn-play').textContent = '▶ ' + t('match.resume');
    _lastFrameT = null;
  }
  _subSelField = null; _subSelBench = null;
  _updateSwapButton();
  renderFieldLists();
}
function closeSub() {
  // sub-panel rimosso — selezione ora inline
  if (G.ms) { G.ms.subOut = null; G.ms.subIn = null; }
}

function _renderSubLists() {
  const ms = G.ms; if (!ms) return;

  function expDots(pi) {
    const count  = ms.tempExp[pi] || 0;
    const isLast = count >= MAX_TEMP_EXP;
    if (count === 0) return '';
    return Array.from({ length: count }).map((_, i) => {
      const color = (isLast || i === MAX_TEMP_EXP - 1) ? '#e74c3c' : '#f0c040';
      return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-left:3px;vertical-align:middle;border:1px solid rgba(0,0,0,.25)"></span>`;
    }).join('');
  }

  function staminaBadge(pi) {
    const st  = Math.round(ms.stamina[pi] ?? 100);
    const col = st > 65 ? '#2ecc71' : st > 35 ? '#f0c040' : '#e74c3c';
    return `<span style="font-size:11px;font-weight:600;color:${col};margin-left:6px">⚡${st}%</span>`;
  }

  // Mostra avviso se il giocatore entrante è fuori ruolo per quella posizione
  function roleBadge(pi, pk) {
    if (!pk) return '';
    const p = ms.myRoster[pi]; if (!p) return '';
    const nativeRole = POS_NATIVE_ROLE[pk];
    if (!nativeRole) return '';
    // Se il ruolo primario O il secondRole corrisponde alla posizione → nessun avviso
    if (p.role === nativeRole || p.secondRole === nativeRole) return '';
    // Prendi l'efficacia migliore tra ruolo primario e secondario
    const adj1 = ROLE_ADJACENCY[p.role];
    const adj2 = p.secondRole ? ROLE_ADJACENCY[p.secondRole] : null;
    const eff1 = adj1 ? (adj1[nativeRole] || 0.6) : 1.0;
    const eff2 = adj2 ? (adj2[nativeRole] || 0.6) : 0;
    const eff  = Math.max(eff1, eff2);
    if (eff >= 0.85) return '';
    const label = eff >= 0.70 ? '⚠ fuori ruolo' : '⚠⚠ molto fuori ruolo';
    const col   = eff >= 0.70 ? '#f0c040' : '#e74c3c';
    return `<span style="font-size:10px;color:${col};margin-left:5px">${label}</span>`;
  }

  // ESCE DAL CAMPO
  let outHtml = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Seleziona il giocatore che deve uscire:</div>';
  Object.entries(ms.onField).forEach(([pk, pi]) => {
    const p     = ms.myRoster[pi]; if (!p) return;
    const shirt = ms.shirtNumbers[pi] || '—';
    const isExp = ms.expelled.has(pi);
    const sel   = ms.subOut === pk;
    outHtml += `
      <div class="player-card${sel ? ' selected' : ''}" onclick="${isExp ? '' : "selSubOut('" + pk + "')"}"
           style="margin-bottom:6px;${isExp ? 'opacity:.35;cursor:not-allowed' : ''}">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:2px">
            <span style="color:var(--blue);margin-right:4px">#${shirt}</span>
            ${p.name}${_ritBadge(p)}${_scadBadge(p)}
            ${expDots(pi)}
            ${staminaBadge(pi)}
            ${(function(){ const r = (typeof calcPlayerRating==='function') ? calcPlayerRating(pi,ms) : null; const col = r?(r>=7.5?'var(--green)':r>=6.5?'var(--gold)':r>=5.5?'var(--muted)':'var(--red)'):'var(--muted)'; return '<span style="font-size:11px;font-weight:800;color:'+col+';margin-left:5px">'+( r!==null ? r.toFixed(1) : '—')+'</span>'; })()}
            ${isExp ? '<span style="color:var(--red);font-size:10px;margin-left:4px">ESPULSO</span>' : ''}
          </div>
          <div style="font-size:11px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px">${_simplePosLabel(pk)} · ${_roleBadge(p.role)}${p.secondRole ? " " + _roleBadge(p.secondRole) : ""} ${_handBadge(p.hand)} <span style="color:var(--muted)">${p.age}a · OVR <strong style="color:var(--blue)">${p.overall}</strong></span></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span onclick="event.stopPropagation();showMatchPlayerInfo(${pi})"
                title="Info"
                style="width:18px;height:18px;border-radius:50%;border:1px solid var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--muted);font-style:italic;font-weight:700;flex-shrink:0">i</span>
          ${sel ? '<span style="color:var(--blue);font-size:18px">✓</span>' : ''}
        </div>
      </div>`;
  });
  document.getElementById('sub-out-list').innerHTML = outHtml;

  // ENTRA IN CAMPO — mostra stamina e avviso fuori-ruolo rispetto alla posizione che andrà a coprire
  const targetPk = ms.subOut; // posizione che verrà occupata dall'entrante
  let inHtml = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Seleziona il giocatore che deve entrare:</div>';
  ms.bench.forEach(pi => {
    const p     = ms.myRoster[pi]; if (!p) return;
    const shirt = ms.shirtNumbers[pi] || '—';
    const isExp = ms.expelled.has(pi);
    const sel   = ms.subIn === pi;
    inHtml += `
      <div class="player-card${sel ? ' selected' : ''}" onclick="${(isExp || p.injured) ? '' : 'selSubIn(' + pi + ')'}"
           style="margin-bottom:6px;${(isExp || p.injured) ? 'opacity:.35;cursor:not-allowed' : ''}">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:2px">
            <span style="color:var(--muted);margin-right:4px">#${shirt}</span>
            ${p.name}${_ritBadge(p)}
            ${p.injured ? '<span style="font-size:9px;background:#c0392b;color:#fff;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">INF+</span>' : ''}
            ${expDots(pi)}
            ${staminaBadge(pi)}
            ${(function(){ const played = ms.matchDuels && ms.matchDuels[pi]!==undefined; const r = played&&(typeof calcPlayerRating==='function') ? calcPlayerRating(pi,ms) : null; const col = r?(r>=7.5?'var(--green)':r>=6.5?'var(--gold)':r>=5.5?'var(--muted)':'var(--red)'):'var(--muted)'; return '<span style="font-size:11px;font-weight:800;color:'+col+';margin-left:5px">'+(r!==null?r.toFixed(1):'—')+'</span>'; })()}
            ${targetPk ? roleBadge(pi, targetPk) : ''}
            ${isExp ? '<span style="color:var(--red);font-size:10px;margin-left:4px">ESPULSO</span>' : ''}
          </div>
          <div style="font-size:11px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px">${_roleBadge(p.role)}${p.secondRole ? " " + _roleBadge(p.secondRole) : ""} ${_handBadge(p.hand)} <span style="color:var(--muted)">${p.age}a · OVR ${p.overall}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span onclick="event.stopPropagation();showMatchPlayerInfo(${pi})"
                title="Info"
                style="width:18px;height:18px;border-radius:50%;border:1px solid var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--muted);font-style:italic;font-weight:700;flex-shrink:0">i</span>
          ${sel ? '<span style="color:var(--blue);font-size:18px">✓</span>' : ''}
        </div>
      </div>`;
  });
  document.getElementById('sub-in-list').innerHTML = inHtml;
}

// Apre la scheda del giocatore durante la partita (popup riutilizzando showPlayerModal se disponibile)
function showMatchPlayerInfo(pi) {
  const ms = G.ms; if (!ms) return;
  const p  = ms.myRoster[pi]; if (!p) return;
  const mc   = p.morale > 70 ? 'var(--green)' : p.morale > 40 ? 'var(--gold)' : 'var(--red)';
  const shirt = ms.shirtNumbers[pi] || '—';
  const stam  = Math.round(ms.stamina[pi] ?? p.fitness);
  const mGoals   = ms.matchGoals?.[pi]   || 0;
  const mAssists = ms.matchAssists?.[pi] || 0;
  const piSaves  = (ms.gkSaves && ms.gkSaves[pi]) || 0;
  // Voto: congelato se è uscito, calcolato live se è ancora in campo
  const frozen = ms.frozenRatings && ms.frozenRatings[pi] !== undefined ? ms.frozenRatings[pi] : null;
  const liveRating = typeof calcPlayerRating === 'function' ? calcPlayerRating(pi, ms) : null;
  const dispRat = frozen !== null ? frozen : (ms._everOnField && ms._everOnField.has(pi) ? liveRating : null);
  const ratCol  = dispRat === null ? 'var(--muted)' : dispRat >= 7.5 ? 'var(--green)' : dispRat >= 6.5 ? 'var(--gold)' : dispRat >= 5.5 ? 'var(--muted)' : 'var(--red)';
  const potLabel = p.potential ? `<span style="font-size:11px;color:var(--gold);font-weight:600">${p.potential}</span>` : '';

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(4px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;max-width:320px;width:90%;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--blue);display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            #${shirt} ${p.name} ${_ritBadge(p)} ${p._diamond ? '💎' : ''}
            ${p.injured ? `<span style="font-size:9px;background:#e74c3c;color:#fff;font-weight:700;padding:1px 4px;border-radius:3px">INF${p.injuryWeeks ? '+' + p.injuryWeeks + 'G' : ''}</span>` : ''}
            ${p._national ? (typeof _nationalBadge === 'function' ? _nationalBadge(p) : '') : ''}
          </div>
          <div style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px">
            ${_roleBadge(p.role)}${p.secondRole ? ' ' + _roleBadge(p.secondRole) : ''}
            ${_handBadge(p.hand)}
            <span>${p.nat} · ${p.age}a</span>
          </div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:rgba(0,194,255,.08);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">OVR</div>
          <div style="font-size:22px;font-weight:800;color:var(--blue)">${p.overall}</div>
        </div>
        <div style="background:rgba(240,192,64,.08);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Potenziale</div>
          <div style="font-size:22px;font-weight:800;color:var(--gold)">${p.potential || '—'}</div>
        </div>
        <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Voto</div>
          <div style="font-size:20px;font-weight:800;color:${ratCol}">${dispRat !== null ? dispRat.toFixed(1) : '—'}</div>
        </div>
        <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Stamina</div>
          <div style="font-size:20px;font-weight:800;color:${stam>60?'var(--green)':stam>30?'var(--gold)':'var(--red)'}">${stam}%</div>
        </div>
      </div>
      <div class="irow"><span class="ilbl">Morale</span>   <span style="color:${mc};font-weight:700">${p.morale}%</span></div>
      <div class="irow"><span class="ilbl">Fitness</span>  <span>${p.fitness}%</span></div>
      <div class="irow"><span class="ilbl">Gol</span>      <span style="color:var(--blue);font-weight:700">${mGoals}</span></div>
      <div class="irow"><span class="ilbl">Assist</span>   <span style="color:var(--green);font-weight:700">${mAssists}</span></div>
      ${piSaves > 0 ? `<div class="irow"><span class="ilbl">Parate</span><span style="color:var(--gold);font-weight:700">${piSaves}</span></div>` : ''}
      <div style="margin-top:10px">
        <div class="slbl" style="margin-top:0">Attributi</div>
        ${[['att','ATT'],['def','DIF'],['spe','VEL'],['str','FOR'],['tec','TEC'],['res','RES']].map(([a,lbl]) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <div style="font-size:11px;color:var(--muted);width:28px">${lbl}</div>
            <div style="flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden">
              <div style="width:${p.stats?.[a]||0}%;height:100%;background:var(--blue)"></div>
            </div>
            <div style="font-size:11px;width:24px;font-weight:600">${p.stats?.[a]||'—'}</div>
          </div>`).join('')}
      </div>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

function selSubOut(pk) {
  if (!G.ms || G.ms.expelled.has(G.ms.onField[pk])) return;
  selFieldRow(pk);
}
function selSubIn(pi) {
  if (!G.ms || G.ms.expelled.has(pi)) return;
  selBenchRow(pi);
}
function _checkSubReady() {
  const ready = G.ms && G.ms.subOut !== null && G.ms.subIn !== null;
  // btn-confirm-sub rimosso — usa btn-swap-sub inline
}

function confirmSub() {
  const ms = G.ms;
  if (!ms || ms.subOut === null || ms.subIn === null) return;
  const result = performSubstitution(ms, ms.subOut, ms.subIn);
  if (!result) return;
  poolUpdateToken('my_' + result.posKey, ms);
  const shirtOut = ms.shirtNumbers[result.outRosterIdx] || '?';
  const shirtIn  = ms.shirtNumbers[result.inRosterIdx]  || '?';
  _appendLog('↔ Esce #' + shirtOut + ' ' + result.outPlayer.name +
             ' — Entra #' + shirtIn + ' ' + result.inPlayer.name +
             ' (' + POSITIONS[result.posKey].label + ')', 'sub');
  closeSub();
  renderFieldLists();
  refreshMatchUI();
  autoSave();
}

// ── Fine partita ──────────────────────────────
function _showEndMatchPopup(ms) {
  const hS    = ms.isHome ? ms.myScore : ms.oppScore;
  const aS    = ms.isHome ? ms.oppScore : ms.myScore;
  const homeN = ms.isHome ? ms.myTeam.name  : ms.oppTeam.name;
  const awayN = ms.isHome ? ms.oppTeam.name : ms.myTeam.name;
  const won   = ms.myScore > ms.oppScore;
  const drew  = ms.myScore === ms.oppScore;
  const resultLabel = won ? t('extra.victory') : drew ? '🤝 PAREGGIO' : '😞 SCONFITTA';
  const resultColor = won ? 'var(--green)' : drew ? 'var(--gold)' : 'var(--red)';

  // Parziali
  const ps = ms.periodScores || [{my:0,opp:0},{my:0,opp:0},{my:0,opp:0},{my:0,opp:0}];
  let partialsHtml = `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px">
    <thead><tr style="border-bottom:1px solid var(--border)">
      <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--muted)">Tempo</th>
      <th style="text-align:center;padding:3px 8px;font-size:10px;color:${ms.isHome?'var(--blue)':'var(--muted)'}">${ms.isHome?ms.myTeam.abbr:ms.oppTeam.abbr}</th>
      <th style="text-align:center;padding:3px 8px;font-size:10px;color:${!ms.isHome?'var(--blue)':'var(--muted)'}">${ms.isHome?ms.oppTeam.abbr:ms.myTeam.abbr}</th>
    </tr></thead><tbody>`;
  ps.forEach((p, t) => {
    const hG = ms.isHome ? p.my : p.opp;
    const aG = ms.isHome ? p.opp : p.my;
    partialsHtml += `<tr style="border-bottom:1px solid rgba(255,255,255,.05)">
      <td style="padding:4px 6px;color:var(--muted)">${t+1}° T</td>
      <td style="text-align:center;padding:4px 8px;font-weight:600">${hG}</td>
      <td style="text-align:center;padding:4px 8px;font-weight:600">${aG}</td>
    </tr>`;
  });
  partialsHtml += `</tbody></table>`;

  // Marcatori
  const scorers = Object.entries(ms.matchGoals || {})
    .filter(([,g]) => g > 0).sort(([,a],[,b]) => b-a);
  let scorersHtml = scorers.length
    ? scorers.map(([piStr, goals]) => {
        const pi = parseInt(piStr);
        const p  = ms.myRoster[pi];
        const shirt = ms.shirtNumbers[pi] || '?';
        const name  = p ? _shortPlayerName(p) : '#'+shirt;
        const ast   = ms.matchAssists?.[pi] || 0;
        return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
          <span>#${shirt} ${name}</span>
          <span>
            <span style="color:var(--blue);font-weight:700">⚽ ${goals}</span>
            ${ast ? `<span style="color:var(--green);margin-left:8px">🤝 ${ast}</span>` : ''}
          </span>
        </div>`;
      }).join('')
    : '<div style="color:var(--muted);font-size:12px">Nessun marcatore</div>';

  // Assist (chi ha assist ma non gol)
  const pureAst = Object.entries(ms.matchAssists || {})
    .filter(([piStr, ast]) => ast > 0 && !(ms.matchGoals?.[piStr] > 0));
  if (pureAst.length) {
    scorersHtml += pureAst.map(([piStr, ast]) => {
      const pi = parseInt(piStr);
      const p  = ms.myRoster[pi];
      const shirt = ms.shirtNumbers[pi] || '?';
      const name  = p ? _shortPlayerName(p) : '#'+shirt;
      return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
        <span style="color:var(--muted)">#${shirt} ${name}</span>
        <span style="color:var(--green);font-weight:700">🤝 ${ast}</span>
      </div>`;
    }).join('');
  }

  // Stats
  const statsHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:12px">
      <div class="irow"><span class="ilbl">Tiri miei</span><span>${ms.myShots}</span></div>
      <div class="irow"><span class="ilbl">Tiri avv.</span><span>${ms.oppShots}</span></div>
      <div class="irow"><span class="ilbl">Parate</span><span>${ms.mySaves}</span></div>
      <div class="irow"><span class="ilbl">Falli/Esp.</span><span>${ms.myFouls}</span></div>
    </div>`;

  const ov = document.createElement('div');
  ov.id = 'end-match-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.80);display:flex;align-items:center;justify-content:center;z-index:400;backdrop-filter:blur(6px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;
                padding:24px;max-width:420px;width:92%;max-height:88vh;overflow-y:auto">

      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:28px;font-weight:800;color:${resultColor};letter-spacing:2px">${resultLabel}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">${homeN} vs ${awayN}</div>
        <div style="font-size:42px;font-weight:800;color:var(--blue);letter-spacing:6px;margin:8px 0">${hS} – ${aS}</div>
      </div>

      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Parziali</div>
      ${partialsHtml}

      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Statistiche</div>
      ${statsHtml}

      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Marcatori & Assist</div>
      <div style="margin-bottom:16px">${scorersHtml}</div>

      <button class="btn primary" style="width:100%;padding:12px;font-size:14px;font-weight:700"
        onclick="document.getElementById('end-match-popup').remove();endMatchConfirm()">
        Chiudi e torna al menu →
      </button>
    </div>`;

  document.body.appendChild(ov);
}

// Eseguito dopo che l'utente chiude il popup fine partita
function endMatchConfirm() {
  _doEndMatch();
}

function endMatch() {
  if (_animReqId) { cancelAnimationFrame(_animReqId); _animReqId = null; }
  _lastFrameT = null;
  const ms = G.ms; if (!ms) return;
  // Mostra prima il popup fine partita (solo per partite di campionato e playoff)
  if (!ms.poMatch || true) {
    _showEndMatchPopup(ms);
    return; // il flusso continua dopo che l'utente chiude il popup
  }
  _doEndMatch();
}

function _doEndMatch() {
  const ms = G.ms; if (!ms) return;
  const score = getFinalScore(ms);

  // +4 stelle per giornata — assegnate per ogni tipo di partita (campionato e playoff)
  if (window.G && G.stars !== undefined) {
    G.stars = (G.stars || 0) + 2;
    if (typeof _updateStarsBox === 'function') _updateStarsBox();
  }

  if (ms.poMatch) {
    ms.poMatch.scores.push(score);
    const totHome = ms.poMatch.scores.reduce((s, x) => s + x.home, 0);
    const totAway = ms.poMatch.scores.reduce((s, x) => s + x.away, 0);

    if (totHome !== totAway) {
      // Vincitore chiaro — risolvi normalmente
      const winner = totHome > totAway ? ms.poMatch.home : ms.poMatch.away;
      ms.poMatch.winner = winner;
      _resolvePlayoffMatch(ms.poType, ms.poMatch, winner);
      const earned = winner === G.myId ? 120000 : 40000;
      G.budget += earned;
      addLedger('playoff', earned, t('nav.playoff') + ': ' + G.myTeam.name + ' vs ' + ms.oppTeam.name + ' (' + ms.myScore + '-' + ms.oppScore + ')', currentRound());
      G.msgs.push(G.myTeam.name + (winner === G.myId ? ' ' + t('match.result.win') : ' ' + t('match.result.loss')) + ' (' + ms.myScore + '-' + ms.oppScore + ') +' + formatMoney(earned));
      G.ms = null;
      showScreen('sc-game'); updateHeader(); showTab('playoff');
    } else if (!ms.extraTime) {
      // Pareggio → 2 tempi supplementari
      ms.extraTime = true;
      ms.myScore  = totHome; ms.oppScore = totAway;
      _showExtraTimePopup();
    } else {
      // Supplementari finiti ancora pari → rigori
      _showPenaltyPopup();
    }
  } else {
    // Salva posizione PRIMA di aggiornare la classifica
    G.prevPos = getTeamPosition(G.stand, G.myId);
    ms.match.score  = score; ms.match.played = true;
    updateStandings(G.stand, ms.match.home, ms.match.away, score);

    // Salva dettagli partita (marcatori + parziali) sul match per il calendario
    const homeScorers = [], awayScorers = [];
    const isHomeMe = ms.isHome;
    // Marcatori miei (dal matchGoals)
    Object.entries(ms.matchGoals || {}).forEach(([piStr, goals]) => {
      const p = ms.myRoster[+piStr];
      if (p && goals > 0) {
        const assists = ms.matchAssists?.[+piStr] || 0;
        (isHomeMe ? homeScorers : awayScorers).push({ name: p.name, goals, assists });
      }
    });
    // Marcatori avversari: usa quelli tracciati durante la partita live
    if (ms.oppMatchGoals && Object.keys(ms.oppMatchGoals).length > 0) {
      Object.entries(ms.oppMatchGoals).forEach(([name, goals]) => {
        if (goals > 0) {
          const assists = (ms.oppMatchAssists && ms.oppMatchAssists[name]) || 0;
          (isHomeMe ? awayScorers : homeScorers).push({ name, goals, assists });
        }
      });
    } else if (typeof simulateMatchStats === 'function') {
      // Fallback: simula se non ci sono dati reali (non dovrebbe accadere)
      const oppRoster = G.rosters[ms.oppTeam.id] || [];
      const det = simulateMatchStats(oppRoster, oppRoster, { home: ms.oppScore, away: 0 });
      if (det) (isHomeMe ? awayScorers : homeScorers).push(...det.home);
    }
    // Parziali dalla partita giocata
    const ps = ms.periodScores || [{my:0,opp:0},{my:0,opp:0},{my:0,opp:0},{my:0,opp:0}];
    const partials = ps.map(p => isHomeMe ? {h:p.my, a:p.opp} : {h:p.opp, a:p.my});
    ms.match.details = {
      home: isHomeMe ? homeScorers : awayScorers,
      away: isHomeMe ? awayScorers : homeScorers,
      partials,
    };
    const mw = (ms.isHome && ms.myScore > ms.oppScore) || (!ms.isHome && ms.myScore > ms.oppScore);
    const md = ms.myScore === ms.oppScore;
    const earned = getMatchReward(ms.myScore, ms.oppScore);
    G.budget += earned;
    if (earned) {
      const tipo = mw ? t('extra.ledgerWin') : 'pareggio';
      addLedger(tipo, earned, `G${ms.match.round}: ${G.myTeam.name} vs ${ms.oppTeam.name} (${ms.myScore}-${ms.oppScore})`, ms.match.round);
    }
    // Deduzione ingaggi (solo regular season)
    if (G.phase === 'regular') {
      const wage = calcWageBill();
      if (wage > 0) {
        G.budget -= wage;
        addLedger(t('extra.ledgerWages'), -wage, `${t('extra.wagesRound')}${ms.match.round}`, ms.match.round);
        G.msgs.push(`💸 ${t('finance.wages')} G${ms.match.round}: -${formatMoney(wage)}`);
      }
    }
    G.msgs.push('G' + ms.match.round + ': ' + G.myTeam.name + ' ' +
                (mw ? t('match.result.win').toUpperCase() : md ? t('match.result.draw') : t('match.result.loss')) + ' vs ' + ms.oppTeam.name +
                ' (' + ms.myScore + '-' + ms.oppScore + ')' + (earned ? ' +' + formatMoney(earned) : ''));
    // Giocatori infortunati: penalizza fitness e assegna durata infortunio (2-6 giornate)
    if (ms.injuries && ms.injuries.length) {
      ms.injuries.forEach(pi => {
        const p = ms.myRoster[pi]; if (!p) return;
        const penalty = 15 + Math.floor(Math.random() * 16);
        p.fitness = Math.max(5, (p.fitness || 70) - penalty);
        p.injured      = true;
        p.injuryWeeks  = 2 + Math.floor(Math.random() * 5); // 2-6 giornate
        G.msgs.push(t('injuries.injurySim', {name: p.name, weeks: p.injuryWeeks}));
      });
    }
    // Salva voti finali nelle ultime 4 partite di ogni giocatore
    // null = non convocato / non ha giocato
    if (typeof calcPlayerRating === 'function') {
      const convocati = new Set(Object.keys(ms.shirtNumbers || {}).map(Number));
      ms.myRoster.forEach((p, pi) => {
        if (!p) return;
        if (!p.lastRatings) p.lastRatings = [];
        if (!convocati.has(pi)) {
          // Non convocato → null
          p.lastRatings.push(null);
        } else if (!ms._everOnField || !ms._everOnField.has(pi)) {
          // Convocato ma rimasto in panchina tutta la partita → null (nessun voto)
          p.lastRatings.push(null);
        } else {
          // Ha giocato → voto calcolato
          const _lr = calcPlayerRating(pi, ms);
          p.lastRatings.push(_lr);
          // Conta presenza e aggiorna statistiche stagionali
          if (_lr !== null) {
            p.careerApps = (p.careerApps || 0) + 1;
            // Gol e assist stagionali
            const pGoals   = (ms.matchGoals   && ms.matchGoals[pi])   || 0;
            const pAssists = (ms.matchAssists && ms.matchAssists[pi]) || 0;
            p.goals   = (p.goals   || 0) + pGoals;
            p.assists = (p.assists || 0) + pAssists;
            // Parate stagionali: usa gkSaves[pi] per ogni giocatore che ha fatto il GK
            // (include portieri cambiati e giocatori di movimento messi in porta)
            const piSaves = (ms.gkSaves && ms.gkSaves[pi]) || 0;
            if (piSaves > 0) {
              p.saves = (p.saves || 0) + piSaves;
            }
            // Career stats
            p.careerGoals   = (p.careerGoals   || 0) + pGoals;
            p.careerAssists = (p.careerAssists || 0) + pAssists;
          }
        }
        if (p.lastRatings.length > 4) p.lastRatings.shift();
      });
    }
    updateMoraleAfterMatch(ms);
    // Incasso stadio solo in casa (partite di campionato)
    if (ms.isHome && typeof _collectStadiumRevenue === 'function') _collectStadiumRevenue();
    generateTransferOffers();
    if (typeof refreshMarketPool === 'function') refreshMarketPool();
    // Decrementa infortuni preesistenti (non causati da questa partita)
    (G.rosters[G.myId] || []).forEach(p => {
      if (!p || !p.injured) return;
      if (ms.injuries && ms.injuries.includes(
        G.rosters[G.myId].indexOf(p)
      )) return; // già gestiti sopra
      p.injuryWeeks = (p.injuryWeeks || 1) - 1;
      if (p.injuryWeeks <= 0) {
        p.injured     = false;
        p.injuryWeeks = 0;
        G.msgs.push(t('injuries.recovered', {name: p.name}));
      }
    });
    simulateRound(G.schedule, G.stand, G.teams, ms.match.round, G.myId, G.rosters);
    // Avanza alla giornata successiva (stelle, decadimento forma, rinnovi, costruzioni)
    // Il flag evita di fare doppio su ingaggi e infortuni già processati sopra
    G._skipWageAndInjury = true;
    if (typeof simNextRound === 'function') simNextRound();
    G._skipWageAndInjury = false;
    _subSelField = null; _subSelBench = null;
    G.ms = null;
    showScreen('sc-game'); updateHeader(); showTab('dash');
  }
  autoSave();
}

function _resolvePlayoffMatch(poType, poMatch, winner) {
  const pb = G.poBracket, plb = G.plBracket;
  if (poType === 'sf') {
    if (pb.sf.every(s => s.winner)) { pb.final.home = pb.sf[0].winner; pb.final.away = pb.sf[1].winner; }
  } else if (poType === 'final') {
    pb.done = true;
    if (winner === G.myId) { G.playoffResult = 'champion'; G.msgs.push('HAI VINTO LO SCUDETTO! 🏆'); }
    else G.msgs.push("Campione d'Italia: " + G.teams.find(t => t.id === winner)?.name);
  } else if (poType === 'pl') {
    const loser = winner === poMatch.home ? poMatch.away : poMatch.home;
    if (poMatch === plb.m2) {
      plb.relegated = loser; plb.done = true;
      if (loser === G.myId) { G.playoffResult = 'relegated'; G.msgs.push('Sei retrocesso in Serie A2!'); }
      else G.msgs.push(G.teams.find(t => t.id === loser)?.name + ' retrocede in A2.');
    } else { plb.m2.home = winner; }
  }
}


// ── Supplementari: popup informativo ────────────────────────────────────
function _showExtraTimePopup() {
  const ms = G.ms;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(6px)';
  const hN = ms.isHome ? G.myTeam.name : ms.oppTeam.name;
  const aN = ms.isHome ? ms.oppTeam.name : G.myTeam.name;
  const sc = ms.isHome ? ms.myScore + '-' + ms.oppScore : ms.oppScore + '-' + ms.myScore;
  ov.id = 'penalty-et-popup';
  ov.innerHTML = '<div style="background:var(--panel);border:2px solid #f0c040;border-radius:16px;padding:28px 24px;max-width:380px;width:92%;text-align:center">'  +
    '<div style="font-size:36px;margin-bottom:8px">⏱️</div>' +
    '<div style="font-size:18px;font-weight:800;color:#f0c040;margin-bottom:6px">TEMPI SUPPLEMENTARI</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,.7);margin-bottom:6px">' + hN + ' vs ' + aN + '</div>' +
    '<div style="font-size:32px;font-weight:900;color:#fff;margin-bottom:12px">' + sc + '</div>' +
    '<div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:20px">Parità al 90\'. Si giocano 2 tempi supplementari da 3 minuti.</div>' +
    '<button onclick="document.getElementById(\'penalty-et-popup\').remove();continueMatchET()" style="width:100%;padding:12px;font-size:14px;font-weight:800;' +
    'background:linear-gradient(135deg,#f0c040,#b8860b);border:none;border-radius:8px;color:#000;cursor:pointer">' +
    '▶ Gioca i Supplementari</button>' +
    '</div>';
  document.body.appendChild(ov);
}

// Riprende la partita per i supplementari (resetta il timer, mantiene i giocatori)
function continueMatchET() {
  const ms = G.ms; if (!ms) return;
  ms.periodScores = ms.periodScores || [];
  ms._etDone = false;
  // Riparte la simulazione con 2 periodi extra
  G.ms._extraPeriods = 2;
  G.ms._extraGoals   = { my: 0, opp: 0 };
  // Simula 2 periodi supplementari rapidamente
  for (let ep = 0; ep < 2; ep++) {
    const myStr  = (ms.myRoster || []).filter(p => p && !p.injured).reduce((s, p) => s + p.overall, 0) / 7;
    const oppStr = ms.oppTeam.str;
    const tot    = myStr + oppStr;
    const myG    = Math.random() < 0.3 ? (Math.random() < myStr/tot ? 1 : 0) : 0;
    const oppG   = Math.random() < 0.3 ? (Math.random() < oppStr/tot ? 1 : 0) : 0;
    ms._extraGoals.my   += myG;
    ms._extraGoals.opp  += oppG;
    ms.myScore  += myG;
    ms.oppScore += oppG;
  }
  // Aggiorna scores per la risoluzione
  const hS = ms.isHome ? ms.myScore : ms.oppScore;
  const aS = ms.isHome ? ms.oppScore : ms.myScore;
  ms.poMatch.scores[ms.poMatch.scores.length - 1] = { home: hS, away: aS };

  G.msgs.push('⏱️ Supplementari: ' + (ms.isHome ? G.myTeam.name : ms.oppTeam.name) + ' ' + ms.myScore + '-' + ms.oppScore + ' ' + (ms.isHome ? ms.oppTeam.name : G.myTeam.name));

  if (ms.myScore !== ms.oppScore) {
    // Qualcuno ha segnato nei supplementari → fine
    _doEndMatch();
  } else {
    // Ancora pari → rigori
    _showPenaltyPopup();
  }
}

// ── Popup rigori ────────────────────────────────────────────────────────
function _showPenaltyPopup() {
  const ms = G.ms; if (!ms) return;
  const roster = (G.rosters[G.myId] || []).map((p, i) => ({ p, i }))
                   .filter(({ p }) => p && !p.injured && p.role !== 'POR')
                   .sort((a, b) => b.p.overall - a.p.overall);
  const PENALTY_COUNT = 5;
  const selected = [];

  const ov = document.createElement('div');
  ov.id = 'penalty-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(8px)';

  function renderPopup() {
    const hN = ms.isHome ? G.myTeam.name : ms.oppTeam.name;
    const aN = ms.isHome ? ms.oppTeam.name : G.myTeam.name;
    const sc = ms.isHome ? ms.myScore + '-' + ms.oppScore : ms.oppScore + '-' + ms.myScore;

    let rows = roster.map(({ p, i }) => {
      const idx    = selected.indexOf(i);
      const order  = idx >= 0 ? idx + 1 : null;
      const stamp  = Math.round(ms.stamina[i] ?? p.fitness);
      const prob   = Math.round(_penaltyProb(p, stamp) * 100);
      const probCol = prob >= 75 ? '#2ecc71' : prob >= 60 ? '#f0c040' : '#e74c3c';
      const selBg  = order ? 'rgba(0,194,255,.15)' : 'transparent';
      const selBdr = order ? 'rgba(0,194,255,.5)' : 'rgba(255,255,255,.1)';
      return '<div onclick="window._penaltyToggle(' + i + ')" style="' +
        'display:grid;grid-template-columns:24px 1fr 50px 50px 60px 50px;align-items:center;gap:8px;' +
        'padding:8px 10px;border:1px solid ' + selBdr + ';border-radius:8px;margin-bottom:4px;' +
        'background:' + selBg + ';cursor:pointer;transition:background .12s">' +
        '<div style="font-size:14px;font-weight:900;color:' + (order ? '#00c2ff' : 'rgba(255,255,255,.2)') + ';text-align:center">' +
          (order || '·') + '</div>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600;color:#fff">' + p.name + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,.4)">' + p.role + (p.secondRole ? '/' + p.secondRole : '') + ' · ' + p.age + 'a</div>' +
        '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center">' +
          '<div style="font-size:9px;color:rgba(255,255,255,.3)">TEC</div>' + (p.stats.tec||'—') + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center">' +
          '<div style="font-size:9px;color:rgba(255,255,255,.3)">FOR</div>' + (p.stats.str||'—') + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center">' +
          '<div style="font-size:9px;color:rgba(255,255,255,.3)">STAM</div>' + stamp + '%</div>' +
        '<div style="font-size:12px;font-weight:800;color:' + probCol + ';text-align:right">' + prob + '%</div>' +
        '</div>';
    }).join('');

    const canShoot = selected.length === PENALTY_COUNT;
    ov.innerHTML = '<div style="background:var(--panel);border:2px solid rgba(0,194,255,.4);border-radius:16px;' +
      'padding:20px;max-width:520px;width:95%;max-height:90vh;overflow-y:auto">' +
      // Header
      '<div style="text-align:center;margin-bottom:16px">' +
        '<div style="font-size:30px;margin-bottom:6px">🎯</div>' +
        '<div style="font-size:18px;font-weight:800;color:#00c2ff">RIGORI</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:4px">' + hN + ' vs ' + aN + ' · ' + sc + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:8px">' +
        'Seleziona <strong style="color:#00c2ff">5 rigoristi</strong> nell\'ordine di battuta (clicca per selezionare/deselezionare). ' +
        t('extra.penaltyTip') +
      '</div>' +
      // Header colonne
      '<div style="display:grid;grid-template-columns:24px 1fr 50px 50px 60px 50px;gap:8px;padding:0 10px 6px;' +
        'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.28)">' +
        '<div>#</div><div>Giocatore</div><div style="text-align:center">TEC</div><div style="text-align:center">FOR</div>' +
        '<div style="text-align:center">Stamina</div><div style="text-align:right">%</div>' +
      '</div>' +
      rows +
      '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);' +
        'display:flex;align-items:center;justify-content:space-between">' +
        '<div style="font-size:12px;color:rgba(255,255,255,.4)">Selezionati: <strong style="color:#00c2ff">' +
          selected.length + '</strong> / 5</div>' +
        '<button id="pen-shoot-btn" onclick="window._executePenalties()" style="padding:10px 24px;font-size:13px;font-weight:800;' +
          'border-radius:8px;background:' + (canShoot ? 'linear-gradient(135deg,#00c2ff,#0066cc)' : 'rgba(255,255,255,.1)') + ';' +
          'border:none;color:' + (canShoot ? '#000' : 'rgba(255,255,255,.3)') + ';cursor:' + (canShoot ? 'pointer' : 'not-allowed') + '">' +
          '🎯 Batti i rigori</button>' +
      '</div>' +
      '</div>';
  }

  window._penaltySelected = selected;
  window._penaltyRoster   = roster;

  window._penaltyToggle = function(i) {
    const idx = selected.indexOf(i);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else if (selected.length < PENALTY_COUNT) {
      selected.push(i);
    }
    renderPopup();
  };

  window._executePenalties = function() {
    if (selected.length < PENALTY_COUNT) return;
    const ms = G.ms;
    // Nostri rigoristi nell'ordine scelto
    const myShooters  = selected.map(i => ({ p: G.rosters[G.myId][i], stamina: Math.round(ms.stamina[i] ?? G.rosters[G.myId][i]?.fitness ?? 70) }));
    // Rigoristi avversari: i top 5 per OVR
    const oppRoster   = (G.rosters[ms.oppTeam.id] || []).filter(p => p && !p.injured && p.role !== 'POR')
                          .sort((a,b) => b.overall - a.overall).slice(0,5);

    let myG = 0, oppG = 0;
    const log = [];
    for (let k = 0; k < PENALTY_COUNT; k++) {
      const mine = myShooters[k]; const oppP = oppRoster[k];
      const myScore  = mine && Math.random() < _penaltyProb(mine.p, mine.stamina);
      const oppScore = oppP && Math.random() < _penaltyProb(oppP, oppP.fitness);
      if (myScore)  myG++;
      if (oppScore) oppG++;
      log.push({ myName: mine?.p?.name || '?', myScore, oppName: oppP?.name || '?', oppScore });
    }
    // Sudden death se pari dopo 5
    let sd = 0;
    while (myG === oppG && sd < 20) {
      sd++;
      const mine = myShooters[sd % PENALTY_COUNT]; const oppP = oppRoster[sd % PENALTY_COUNT];
      const myScore  = mine && Math.random() < _penaltyProb(mine.p, mine.stamina);
      const oppScore = oppP && Math.random() < _penaltyProb(oppP, oppP.fitness);
      if (myScore) myG++; if (oppScore) oppG++;
      log.push({ myName: mine?.p?.name || '?', myScore, oppName: oppP?.name || '?', oppScore, sd: true });
    }

    // Mostra risultato
    ov.remove();
    _showPenaltyResult(log, myG, oppG);
  };

  document.body.appendChild(ov);
  renderPopup();
}

// Mostra il risultato dei rigori e poi chiude la partita
function _showPenaltyResult(log, myG, oppG) {
  const ms = G.ms;
  const myWin = myG > oppG;
  const hN = ms.isHome ? G.myTeam.name : ms.oppTeam.name;
  const aN = ms.isHome ? ms.oppTeam.name : G.myTeam.name;
  const myTeamLabel  = G.myTeam.name;
  const oppTeamLabel = ms.oppTeam.name;

  let rows = log.map((r, i) => {
    const num = r.sd ? 'SD' : String(i + 1);
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.05)">' +
      '<td style="padding:5px 8px;font-size:11px;color:rgba(255,255,255,.4);text-align:center">' + num + '</td>' +
      '<td style="padding:5px 8px;font-size:12px;font-weight:' + (r.myScore ? '700' : '400') + ';color:' + (r.myScore ? '#2ecc71' : '#e74c3c') + '">' +
        r.myName + ' ' + (r.myScore ? '✓' : '✗') + '</td>' +
      '<td style="padding:5px 8px;font-size:12px;font-weight:' + (r.oppScore ? '700' : '400') + ';color:' + (r.oppScore ? '#2ecc71' : '#e74c3c') + ';text-align:right">' +
        (r.oppScore ? '✓' : '✗') + ' ' + r.oppName + '</td>' +
    '</tr>';
  }).join('');

  const res  = document.createElement('div');
  res.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(8px)';
  res.id = 'pen-result-popup';
  res.innerHTML = '<div style="background:var(--panel);border:2px solid ' + (myWin ? '#2ecc71' : '#e74c3c') + ';border-radius:16px;padding:22px;max-width:460px;width:95%;max-height:85vh;overflow-y:auto">' +
    '<div style="text-align:center;margin-bottom:14px">' +
      '<div style="font-size:30px;margin-bottom:6px">' + (myWin ? '🎯✅' : '🎯❌') + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:' + (myWin ? '#2ecc71' : '#e74c3c') + '">' + (myWin ? 'AVANTI! RIGORI VINTI' : 'RIGORI PERSI') + '</div>' +
      '<div style="font-size:28px;font-weight:900;color:#fff;margin:8px 0">' + myTeamLabel + ' ' + myG + ' - ' + oppG + ' ' + oppTeamLabel + '</div>' +
    '</div>' +
    '<table style="width:100%;margin-bottom:14px"><thead>' +
      '<tr><th style="padding:4px 8px;font-size:10px;color:rgba(255,255,255,.3)">#</th>' +
      '<th style="padding:4px 8px;font-size:10px;color:rgba(255,255,255,.3)">' + myTeamLabel + '</th>' +
      '<th style="padding:4px 8px;font-size:10px;color:rgba(255,255,255,.3);text-align:right">' + oppTeamLabel + '</th></tr>' +
    '</thead><tbody>' + rows + '</tbody></table>' +
    '<button onclick="document.getElementById(\'pen-result-popup\').remove();_finalizePenaltyMatch(' + (myWin ? 'true' : 'false') + ')" style="width:100%;padding:12px;font-size:14px;font-weight:800;' +
    'background:linear-gradient(135deg,#0a5ca8,#0844a0);border:none;border-radius:8px;color:#fff;cursor:pointer">' +
    'Continua →</button>' +
    '</div>';
  document.body.appendChild(res);
}

// Finalizza la partita dopo i rigori
function _finalizePenaltyMatch(myWin) {
  const ms = G.ms; if (!ms) return;
  // +4 stelle (partita playoff ai rigori)
  if (window.G && G.stars !== undefined) {
    G.stars = (G.stars || 0) + 2;
    if (typeof _updateStarsBox === 'function') _updateStarsBox();
  }
  const winner = myWin ? G.myId : ms.oppTeam.id;
  ms.poMatch.winner = winner;
  G.msgs.push('🎯 Rigori: ' + G.myTeam.name + (myWin ? ' VINCE e avanza!' : ' eliminato ai rigori.'));
  _resolvePlayoffMatch(ms.poType, ms.poMatch, winner);
  const earned = winner === G.myId ? 120000 : 40000;
  G.budget += earned;
  addLedger('playoff', earned, 'Playoff rigori: ' + G.myTeam.name + ' vs ' + ms.oppTeam.name, currentRound ? currentRound() : 0);
  G.ms = null;
  showScreen('sc-game'); updateHeader(); showTab('playoff');
}
