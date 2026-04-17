// ─────────────────────────────────────────────
// main.js
// Punto di ingresso: stato globale G, utility,
// logica playoff/playout, auto-save, init.
// ─────────────────────────────────────────────

// ── Stato globale ─────────────────────────────
// G è l'unico oggetto di stato condiviso tra tutti i moduli.
// Viene inizializzato in welcome.js (startNewGame / continueGame)
// e poi aggiornato da engine/* e ui/*.
let G = {};

// ── Utility globali ───────────────────────────
// Disponibili a tutti i moduli senza import (vanilla JS).
// ── Calcola overall da attributi pesati per ruolo ────────────────────────
// Usata da allenamento, invecchiamento e caricamento salvataggio
function _calcOverallFromStats(p) {
  if (!p || !p.stats) return p ? (p.overall || 60) : 60;
  const s = p.stats;
  const weights = {
    POR: { att:0.05, def:0.30, spe:0.15, str:0.20, tec:0.15, res:0.15 },
    DIF: { att:0.10, def:0.35, spe:0.15, str:0.20, tec:0.10, res:0.10 },
    CEN: { att:0.20, def:0.20, spe:0.20, str:0.15, tec:0.15, res:0.10 },
    ATT: { att:0.35, def:0.05, spe:0.20, str:0.15, tec:0.15, res:0.10 },
    CB:  { att:0.25, def:0.15, spe:0.20, str:0.15, tec:0.15, res:0.10 },
  };
  const w = weights[p.role] || weights['CEN'];
  const raw = (s.att||0)*w.att + (s.def||0)*w.def + (s.spe||0)*w.spe +
              (s.str||0)*w.str + (s.tec||0)*w.tec + (s.res||0)*w.res;
  const potCap = (p.potential !== undefined && p.potential > 0) ? p.potential : 99;
  return Math.min(potCap, Math.max(40, Math.round(raw)));
}

// Versione senza cap potential — usata per aggiornare il potential stesso
function _calcOverallRaw(p) {
  if (!p || !p.stats) return p ? (p.overall || 60) : 60;
  const s = p.stats;
  const weights = {
    POR: { att:0.05, def:0.30, spe:0.15, str:0.20, tec:0.15, res:0.15 },
    DIF: { att:0.10, def:0.35, spe:0.15, str:0.20, tec:0.10, res:0.10 },
    CEN: { att:0.20, def:0.20, spe:0.20, str:0.15, tec:0.15, res:0.10 },
    ATT: { att:0.35, def:0.05, spe:0.20, str:0.15, tec:0.15, res:0.10 },
    CB:  { att:0.25, def:0.15, spe:0.20, str:0.15, tec:0.15, res:0.10 },
  };
  const w = weights[p.role] || weights['CEN'];
  return Math.max(40, Math.round((s.att||0)*w.att + (s.def||0)*w.def + (s.spe||0)*w.spe +
              (s.str||0)*w.str + (s.tec||0)*w.tec + (s.res||0)*w.res));
}

function rnd(a, b)  { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function cap(n)     { return Math.min(100, Math.max(0, Math.round(n))); }
function formatMoney(n) { return Math.round(n).toLocaleString('it-IT') + '€'; }

// ── Ledger finanziario ────────────────────────
// Tipi: 'vittoria' | 'pareggio' | 'ingaggi' | 'acquisto' | 'vendita'
//       'allenamento' | 'obiettivo' | 'playoff'
function addLedger(type, amount, note, round) {
  if (!G.ledger) G.ledger = [];
  G.ledger.push({
    type,
    amount,          // positivo = entrata, negativo = uscita
    note:   note || '',
    round:  round != null ? round : (currentRound ? currentRound() : 0),
    ts:     Date.now(),
  });
}

// ── Monte ingaggi ─────────────────────────────
// Somma annuale degli stipendi diviso le giornate di regular season (26).
const REGULAR_SEASON_ROUNDS = 26;
// Aggiorna il box stelle in topbar
function _updateStarsBox() {
  const el = document.getElementById('bs-stars-val');
  if (el && G) el.textContent = G.stars || 0;
}

function calcWageBill() {
  if (!G.rosters || !G.myId) return 0;
  const total = (G.rosters[G.myId] || []).reduce((s, p) => s + (p.salary || 0), 0);
  return Math.round(total / REGULAR_SEASON_ROUNDS);
}

function currentRound() {
  if (!G.schedule) return 0;
  // Giornata dell'ultima partita DELLA MIA SQUADRA giocata
  const myPlayed = G.schedule.filter(m =>
    m.played && (m.home === G.myId || m.away === G.myId)
  );
  return myPlayed.length ? Math.max(...myPlayed.map(m => m.round)) : 0;
}

// Giornata della prossima partita della mia squadra (round minimo non giocato)
function nextMyRound() {
  if (!G.schedule) return 1;
  const notPlayed = G.schedule.filter(m =>
    !m.played && (m.home === G.myId || m.away === G.myId)
  );
  if (!notPlayed.length) return null;
  return Math.min(...notPlayed.map(m => m.round));
}

// Prossima partita della mia squadra (oggetto match)
function nextMyMatch() {
  if (!G.schedule) return null;
  const r = nextMyRound();
  if (!r) return null;
  return G.schedule.find(m =>
    !m.played && (m.home === G.myId || m.away === G.myId) && m.round === r
  );
}

// ── Auto-save ─────────────────────────────────
function autoSave() {
  if (G && G.myId) autoSaveToCurrentSlot(G);
}

// ── Simulazione rapida giornata ───────────────
function confirmSimNextRound() {
  const ov = document.createElement('div');
  ov.id = 'sim-confirm-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(6px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:380px;width:90%;text-align:center">
      <div style="font-size:22px;margin-bottom:12px">⏩</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:10px;color:var(--text)">${t('dash.simulate')}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:20px;line-height:1.6">
        ${t('match.skipConfirm')}<br><strong style="color:var(--text)">${t('common.confirm')}?</strong>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn primary" style="padding:10px 28px;font-size:14px"
          onclick="document.getElementById('sim-confirm-popup').remove();simNextRound()">
          ${t('common.yes')}
        </button>
        <button class="btn" style="padding:10px 28px;font-size:14px"
          onclick="document.getElementById('sim-confirm-popup').remove()">
          ${t('common.no')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// Genera voti simulati per la rosa dopo una partita simulata.
// matchDetails: l'oggetto m.details con { home/away: [{name, goals, assists}] }
// scorerKey: 'home' o 'away' secondo se la mia squadra giocava in casa o fuori
// goalsConceded: gol subiti dalla mia squadra
function _assignSimulatedRatings(roster, goalsConceded, matchDetails, scorerKey) {
  if (!roster) return;
  console.log('[ASSIGN] goalsConceded=' + goalsConceded + ' scorerKey=' + scorerKey +
              ' | details?', !!matchDetails, matchDetails ? '| home:' + (matchDetails.home||[]).length + ' away:' + (matchDetails.away||[]).length : '');

  // ── Costruisce la convocazione simulata (13 giocatori) ──────────────────
  // Regola: 2 POR (titolare + riserva) + 11 di campo selezionati per overall
  // Rispecchia il limite reale di convocazione in pallanuoto A1 (max 13).
  const goalies  = roster.filter(p => p && p.role === 'POR' && !p.injured && !p._national)
                         .sort((a, b) => b.overall - a.overall);
  const field    = roster.filter(p => p && p.role !== 'POR' && !p.injured && !p._national)
                         .sort((a, b) => b.overall - a.overall);

  // Usa _buildSimSquad se disponibile per la selezione convocati
  let squad13;
  if (typeof _buildSimSquad === 'function') {
    squad13 = _buildSimSquad(roster.filter(p => p && !p.injured && !p._national));
  } else {
    const calledGK  = goalies.slice(0, 2);
    const calledFld = field.slice(0, 11);
    squad13 = [...calledGK, ...calledFld];
  }
  const convocati = new Set(squad13.map(p => p.name));
  console.log('[ASSIGN] Convocati (' + squad13.length + '):', Array.from(convocati).join(', '));
  // Portieri convocati in ordine (titolare = primo per score)
  const calledGK = squad13.filter(p => p.role === 'POR')
                           .sort((a, b) => b.overall - a.overall);

  // ── Mappa nome → { goals, assists } dai details ────────────────────────
  const matchMap = {};
  if (matchDetails && scorerKey && matchDetails[scorerKey]) {
    matchDetails[scorerKey].forEach(s => {
      matchMap[s.name] = { goals: s.goals || 0, assists: s.assists || 0 };
    });
  }
  if (Object.keys(matchMap).length) {
    console.log('[ASSIGN] matchMap:', JSON.stringify(matchMap));
  } else {
    console.warn('[ASSIGN] matchMap VUOTO — nessun marcatore trovato per scorerKey=' + scorerKey);
    if (matchDetails) console.log('[ASSIGN] matchDetails keys:', Object.keys(matchDetails));
  }

  // ── Assegna voti / null ────────────────────────────────────────────────
  roster.forEach(p => {
    if (!p) return;
    if (!p.lastRatings) p.lastRatings = [];

    if (!convocati.has(p.name)) {
      // Non convocato → null
      p.lastRatings.push(null);
    } else if (p.role === 'POR') {
      // Portiere titolare (il migliore): voto basato su gol subiti e parate stimate
      // Portiere riserva (secondo): voto neutro fisso (non ha giocato ma è convocato)
      const isTitolare = p === calledGK[0];
      let rating;
      if (isTitolare) {
        const estSaves = Math.max(0, Math.round(goalsConceded * 0.5 + Math.random() * 1.5));
        rating = 6.0 + estSaves * 0.4 - goalsConceded * 0.3;
        if (goalsConceded === 0)     rating += 1.0;
        else if (goalsConceded <= 3) rating += 0.3;
      } else {
        // Portiere riserva: entra solo se il titolare ha una brutta partita
        // Probabilità cambio: cresce con i gol subiti (0% con 0 gol, ~40% con 9+ gol)
        const changeProbability = Math.min(0.40, goalsConceded * 0.04);
        if (Math.random() < changeProbability) {
          // Entra in campo nel finale → voto neutro con lieve varianza
          rating = 6.0 + (Math.random() * 0.6 - 0.3);
        } else {
          // Rimane in panchina → null
          p.lastRatings.push(null);
          if (p.lastRatings.length > 4) p.lastRatings.shift();
          return;
        }
      }
      rating = Math.max(3.0, Math.min(10.0, rating));
      p.lastRatings.push(Math.round(rating * 2) / 2);
      // Conta presenza per il portiere
      p.careerApps = (p.careerApps || 0) + 1;
    } else {
      // Giocatori di campo convocati
      // Nella simulazione tutti i convocati sono considerati potenzialmente in campo.
      // La squad13 può avere max 13 giocatori: i primi 7 di campo titolari,
      // gli altri 4 riserve con 30% probabilità di entrare.
      // Ordiniamo per OVR per determinare chi è titolare, indipendentemente dall'ordine
      // di inserimento nel Set restituito da _buildSimSquad.
      const fieldConv = squad13
        .filter(pl => pl.role !== 'POR')
        .sort((a, b) => (b.overall || 0) - (a.overall || 0));
      const posInSquad = fieldConv.findIndex(pl => pl.name === p.name);
      const isTitolare = posInSquad >= 0 && posInSquad < 7;
      const isRiserva  = posInSquad >= 7;

      // Riserva: 30% di probabilità di entrare a partita in corso
      // ECCEZIONE: se ha segnato o fatto assist è SICURAMENTE entrato → voto garantito
      const hasContrib = !!(matchMap[p.name] && (matchMap[p.name].goals || matchMap[p.name].assists));
      if (isRiserva && !hasContrib && Math.random() > 0.30) {
        p.lastRatings.push(null);
        if (p.lastRatings.length > 4) p.lastRatings.shift();
        return;
      }

      const contrib  = matchMap[p.name] || { goals: 0, assists: 0 };
      const roleBase = p.role === 'ATT' ? 0.2 : p.role === 'CB' ? 0.15 : p.role === 'CEN' ? 0.1 : 0;
      let rating = 6.0
        + contrib.goals   * 1.5
        + contrib.assists * 0.8
        + roleBase
        + (Math.random() * 0.6 - 0.3);
      if (isRiserva) rating -= 0.3;
      rating = Math.max(3.0, Math.min(10.0, rating));
      const _r = Math.round(rating * 2) / 2;
      p.lastRatings.push(_r);
      // Conta presenza e aggiorna statistiche stagionali
      p.careerApps = (p.careerApps || 0) + 1;
      p.goals   = (p.goals   || 0) + (contrib.goals   || 0);
      p.assists = (p.assists || 0) + (contrib.assists || 0);
      console.log('[ASSIGN]', p.name, '| pos:', posInSquad, isTitolare ? '(TIT)' : '(RIS)',
                  '| voto:', _r, contrib.goals ? '⚽'+contrib.goals : '', contrib.assists ? '🤝'+contrib.assists : '');
    }

    if (p.lastRatings.length > 4) p.lastRatings.shift();
  });
}

// ── Simula acquisto di mercato per una squadra avversaria ────────────
// La squadra usa il proprio budget simulato per acquistare giocatori
// compatibili con il ruolo mancante. Budget avversari inizialmente stimato.
function _replenishRoster(teamId) {
  const MIN_ROSTER = 13;
  if (teamId === G.myId) return;
  const team   = G.teams.find(tm => tm.id === teamId);
  if (!team) return;
  const roster = G.rosters[teamId];
  if (!roster) return;
  const needed = MIN_ROSTER - roster.length;
  if (needed <= 0) return;

  // Budget simulato della squadra (se non esiste, stima da team.str)
  if (team._budget === undefined) team._budget = team.str * 40000;

  // Identifica ruoli carenti
  const roleCounts = { POR:0, DIF:0, CEN:0, ATT:0, CB:0 };
  roster.forEach(p => { if (p && p.role) roleCounts[p.role] = (roleCounts[p.role]||0) + 1; });
  const rolesByNeed = Object.entries(roleCounts).sort((a,b) => a[1]-b[1]).map(e => e[0]);

  for (let i = 0; i < needed; i++) {
    const role = rolesByNeed[i % rolesByNeed.length];
    // Forza del nuovo giocatore in base al budget disponibile
    // Budget alto → giocatore più forte; budget basso → giovane economico
    const budgetRatio = Math.min(1, (team._budget || 0) / (team.str * 20000));
    const ovr = Math.round(team.str * (0.70 + budgetRatio * 0.30) + (Math.random() * 10 - 5));
    const np  = typeof generatePlayer === 'function' ? generatePlayer(Math.max(50, Math.min(90, ovr)), role) : null;
    if (!np) continue;
    const cost = np.value;
    if ((team._budget || 0) >= cost) {
      team._budget -= cost;
      roster.push(np);
    } else if ((team._budget || 0) >= 0) {
      // Budget esaurito → ingaggia giovane economico
      const youngOvr = Math.max(50, team.str - 15 + Math.floor(Math.random() * 10));
      const youngP   = typeof generatePlayer === 'function' ? generatePlayer(youngOvr, role) : null;
      if (youngP) { youngP.age = 18 + Math.floor(Math.random() * 5); roster.push(youngP); }
    }
  }
}

function simNextRound() {
  const r = nextMyRound();
  if (!r) { G.msgs.push(t('dash.noMatches')); renderDash(); return; }

  console.group('%c[SIM] Giornata ' + r, 'color:#00c2ff;font-weight:bold');
  console.log('[SIM] Squadra:', G.myTeam?.name, '| Fase:', G.phase, '| Budget:', G.budget);

  // Converti _nationalNext → _national: la giornata nazionale inizia ora
  // (resetta _national precedente, promuove _nationalNext ad _national)
  _activateNationalCalls();

  // Salva posizione attuale PRIMA di aggiornare la classifica
  G.prevPos = getTeamPosition(G.stand, G.myId);
  console.log('[SIM] Posizione pre-giornata:', G.prevPos);

  // Simula TUTTE le partite della giornata, inclusa quella della mia squadra
  const roundMatches = G.schedule.filter(m => m.round === r && !m.played);
  console.log('[SIM] Partite da simulare:', roundMatches.length);
  var _myMatchResult = null; // dati partita mia squadra per popup risultato
  roundMatches.forEach(m => {
    const hT = G.teams.find(tm => tm.id === m.home);
    const aT = G.teams.find(tm => tm.id === m.away);
    // Calcola spettatori per la partita (solo se c'è lo stadio)
    var _isHomeGame = m.home === G.myId;
    var _homeBoost  = 0;
    if (_isHomeGame && G.stadium) {
      var _rev = stadiumMatchRevenue();
      m.attendance = _rev.paying;
      m.capacity   = _rev.activeCap;
      // Bonus fino al 5% sulla forza casa proporzionale al riempimento
      _homeBoost = Math.round((_rev.fill || stadiumFillRate()) * 5);
    } else if (!_isHomeGame && m.home === G.myId) {
      // partita fuori casa: nessun bonus stadio
    }
    m.score  = simulateResult(hT, aT, _homeBoost, G.rosters);
    m.played = true;
    updateStandings(G.stand, m.home, m.away, m.score);
    // Aggiorna budget squadre CPU (incasso simulato partita casa)
    if (m.home !== G.myId) {
      var _hTeam = G.teams.find(function(tm){ return tm.id === m.home; });
      if (_hTeam) {
        var _cpuRev = Math.round((_hTeam.budget || 500000) * 0.003 * (0.8 + Math.random() * 0.4));
        _hTeam.budget = (_hTeam.budget || 0) + _cpuRev;
      }
    }

    // Distribuisce gol/assist ai giocatori e salva i dettagli del match.
    // Per la squadra del manager usa i 13 convocati simulati; per le altre l'intera rosa.
    const _simRoster = (roster) => {
      // Usa _buildSimSquad se disponibile (ruoli minimi + score composito)
      // Passa sempre il roster pre-filtrato (no injured, no _national)
      const filtered = (roster || []).filter(p => p && !p.injured && !p._national);
      if (typeof _buildSimSquad === 'function') return _buildSimSquad(filtered);
      // Fallback: POR + migliori per OVR
      const available = filtered;
      const gk  = available.filter(p => p.role === 'POR').sort((a,b) => b.overall - a.overall).slice(0, 2);
      const fld = available.filter(p => p.role !== 'POR').sort((a,b) => b.overall - a.overall).slice(0, 11);
      return [...gk, ...fld];
    };
    // Filtra sempre injured e _national da entrambe le squadre
    const homeRoster = _simRoster(G.rosters[m.home] || []);
    const awayRoster = _simRoster(G.rosters[m.away] || []);
    const det = simulateMatchStats(homeRoster, awayRoster, m.score);
    if (det) m.details = det;

    // Se è la partita della mia squadra, registra risultato e premi
    if (m.home === G.myId || m.away === G.myId) {
      const ih      = m.home === G.myId;
      const opp     = G.teams.find(tm => tm.id === (ih ? m.away : m.home));
      const myScore = ih ? m.score.home : m.score.away;
      const opScore = ih ? m.score.away : m.score.home;
      const res     = myScore > opScore ? 'VINCE' : myScore < opScore ? 'perde' : 'pareggia';
      const reward  = myScore > opScore ? getMatchReward(myScore, opScore) : 0;
      if (reward) {
        G.budget += reward;
        const tipo = myScore > opScore ? t('extra.ledgerWin') : t('finance.types.pareggio');
        addLedger(tipo, reward, `G${r}: ${G.myTeam.name} vs ${opp.name} (${myScore}-${opScore})`, r);
      }
      G.msgs.push(`G${r}: ${G.myTeam.name} ${res} vs ${opp.name} (${myScore}-${opScore})` +
                  (reward ? ` +${formatMoney(reward)}` : ''));
      // Salva dati per popup risultato
      _myMatchResult = {
        round: r, ih, myScore, opScore, res, reward,
        opp, details: m.details,
        myScorers: (m.details ? (ih ? m.details.home : m.details.away) : []) || [],
        oppScorers: (m.details ? (ih ? m.details.away : m.details.home) : []) || [],
      };
      console.log('[SIM] Mia partita: ' + G.myTeam.name + ' ' + myScore + '-' + opScore + ' ' + opp.name +
                  ' | ' + (ih ? 'Casa' : 'Trasferta') + ' | Premio: +' + (reward||0) + '€');
      if (m.details) {
        const myScorers = (ih ? m.details.home : m.details.away) || [];
        if (myScorers.length) console.log('[SIM] Marcatori:', myScorers.map(s => s.name + ' ⚽' + s.goals + (s.assists?' 🤝'+s.assists:'')).join(', '));
      }

      // Genera voti simulati per i giocatori della mia rosa
      const _sk = ih ? 'home' : 'away';
      console.log('[SIM] Assegno voti simulati (scorerKey=' + _sk + ')...');
      _assignSimulatedRatings(G.rosters[G.myId], opScore, m.details, _sk);
      console.log('[SIM] Voti assegnati:', (G.rosters[G.myId]||[]).filter(p=>p&&p.lastRatings&&p.lastRatings[p.lastRatings.length-1]!==null).map(p=>p.name+' '+p.lastRatings[p.lastRatings.length-1]).join(', '));

      // Simula infortuni per la nostra rosa
      if (typeof simulateInjuries === 'function') {
        const _simRosterForInjury = (G.rosters[G.myId] || []).filter(p => p && !p.injured);
        const _injured = simulateInjuries(_simRosterForInjury);
        if (_injured.length) {
          _injured.forEach(name => {
            const inj = (G.rosters[G.myId] || []).find(p => p && p.name === name);
            if (inj) G.msgs.push(t('injuries.injurySim', {name: inj.name, weeks: inj.injuryWeeks}));
          });
        }
      }
    }
  });

  // ── Rimpiazzo giocatori avversari (simulazione mercato) ──
  // Ogni 3 giornate le squadre avversarie valutano acquisti se sotto organico
  const _curRnd = typeof currentRound === 'function' ? currentRound() : 0;
  if (_curRnd % 3 === 0) {
    G.teams.forEach(tm => {
      if (tm.id === G.myId) return;
      const _roster = G.rosters[tm.id] || [];
      if (_roster.length < 13) _replenishRoster(tm.id);
    });
  }

  // ── Processa risposte ai rinnovi contrattuali ──
  _processRenewalResponses();

  // ── Aggiorna infortuni: decrementa settimane e riabilita guariti ──
  // Saltato se la partita è stata giocata dal vivo (già gestito in _doEndMatch)
  if (!G._skipWageAndInjury) {
    (G.rosters[G.myId] || []).forEach(p => {
      if (!p || !p.injured) return;
      p.injuryWeeks = (p.injuryWeeks || 1) - 1;
      if (p.injuryWeeks <= 0) {
        p.injured     = false;
        p.injuryWeeks = 0;
        G.msgs.push(t('injuries.recovered', {name: p.name}));
      }
    });
  }

  // ── Decadimento forma se non allenato ─────────────────────────────
  // Ogni giornata senza allenamento la forma cala in base all'età:
  // Under 24: -1, 24-28: -2, 29-32: -3, Over 32: -4 (±1 varianza)
  const trainedThisRound = G._lastTrainRound === r;
  if (!trainedThisRound) {
    (G.rosters[G.myId] || []).forEach(p => {
      if (!p || p.injured) return;
      const age = p.age || 25;
      // Decadimento forma +15% rispetto alla baseline
      const decay = age < 24 ? 1.15 : age < 29 ? 2.30 : age < 33 ? 3.45 : 4.60;
      const variance = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
      p.fitness = Math.round(Math.max(20, (p.fitness || 70) - decay + variance));
    });
  }

  // ── Deduzione monte ingaggi (solo regular season) ──
  // Saltata se la partita è stata giocata dal vivo (già detratta in _doEndMatch)
  if (!G._skipWageAndInjury && G.phase === 'regular') {
    const wage = calcWageBill();
    if (wage > 0) {
      G.budget -= wage;
      addLedger(t('extra.ledgerWages'), -wage, `${t('extra.wagesRound')}${r}`, r);
      G.msgs.push(`💸 ${t('finance.wages')} G${r}: -${formatMoney(wage)}`);
    }
  }

  // ── Aggiorna costruzioni stadio ──
  _updateStadiumConstruction();
  // ── Incasso match day e usura (solo partite in casa) ──
  const _isHomeMatch = roundMatches.some(function(m) { return m.home === G.myId; });
  if (_isHomeMatch) { _collectStadiumRevenue(); _stadiumWear(); }
  // +4 stelle per giornata
  if (G.stars !== undefined) G.stars = (G.stars || 0) + 2;
  refreshMarketPool();
  generateTransferOffers();
  _updateStarsBox();
  // I flag nazionali restano attivi fino all'inizio della prossima simNextRound
  // dove _processNationalCalls chiama _clearNationalCalls prima di tutto
  console.log('[SIM] ✓ Fine giornata | Budget: ' + G.budget + ' | Stelle: ' + G.stars);
  console.groupEnd();
  // ── Convocazioni nazionali per la giornata SUCCESSIVA ──
  // Vengono assegnate ADESSO così il manager vede i badge prima di giocare
  const _nextR = nextMyRound();
  if (_nextR && NATIONAL_ROUNDS.includes(_nextR)) {
    _processNationalCalls(_nextR);
  }

  updateHeader(); autoSave(); renderDash();
  // Popup risultato partita simulata
  if (_myMatchResult) {
    setTimeout(() => _showSimResultPopup(_myMatchResult), 150);
  }
  // Popup convocazione nazionale
  if (G._pendingNationalPopup && G._pendingNationalPopup.length > 0) {
    const _toShow = G._pendingNationalPopup;
    G._pendingNationalPopup = null;
    setTimeout(() => _showNationalPopup(_toShow), 300);
  }
  // Popup offerte di mercato (sequenziali)
  if (G._pendingOfferPopups && G._pendingOfferPopups.length > 0) {
    const _offers = G._pendingOfferPopups;
    G._pendingOfferPopups = [];
    setTimeout(() => _showOfferPopupQueue(_offers, 0), 500);
  }
}

function simEntireSeason() {
  simulateAllRemaining(G.schedule, G.stand, G.teams, G.myId, G.rosters);
  G.msgs.push(t('dash.noMatches'));
  updateHeader(); autoSave(); renderDash();
}

// ── Post-season: inizializza playoff/playout ──
function initPostSeason() {
  if (G.phase !== 'regular') return;
  const s = getSortedStandings(G.stand);

  G.poTeams  = s.slice(0, 4).map(tm => tm.id);   // 1°-4°: playoff
  G.ploTeams = s.slice(10, 13).map(tm => tm.id);  // 11°-13°: playout
  G.relegated = s[13].id;                        // 14°: retrocessa diretta
  G.phase    = 'playoff';

  G.poBracket = {
    sf: [
      { home: G.poTeams[0], away: G.poTeams[3], scores: [], winner: null, label: 'Semifinale 1' },
      { home: G.poTeams[1], away: G.poTeams[2], scores: [], winner: null, label: 'Semifinale 2' },
    ],
    final: { home: null, away: null, scores: [], winner: null },
    done:  false,
  };
  G.plBracket = {
    m1: { home: G.ploTeams[0], away: G.ploTeams[2], scores: [], winner: null, label: 'Play-out: 11° vs 13°' },
    m2: { home: null, away: G.ploTeams[1],           scores: [], winner: null, label: 'Play-out Finale' },
    done: false, relegated: null,
  };

  const relName = G.teams.find(tm => tm.id === G.relegated)?.name || '—';
  G.msgs.push(t('nav.playoff') + ': ' + G.poTeams.map(id => G.teams.find(tm => tm.id === id)?.name).join(', '));
  G.msgs.push(t('seasonEnd.relegated', {team: relName}));
  updateHeader(); autoSave();
}

// ── Simula partita playoff (senza play live) ──

// ═══════════════════════════════════════════════════════
// SISTEMA RIGORI — supplementari + penalty shootout
// ═══════════════════════════════════════════════════════
function _penaltyProb(p, stamina) {
  if (!p) return 0.50;
  var tec       = (p.stats && p.stats.tec) || 50;
  var str       = (p.stats && p.stats.str) || 50;
  var base      = (tec * 0.55 + str * 0.45) / 100;
  var roleBonus = ({ ATT:0.08, CEN:0.03, CB:0.00, DIF:-0.04, POR:-0.10 })[p.role] || 0;
  var stamPct   = (stamina !== undefined ? stamina : (p.fitness || 70)) / 100;
  var stamMalus = (1 - stamPct) * 0.20;
  var formMalus = (p.fitness || 70) < 60 ? (60 - (p.fitness||70)) / 100 * 0.08 : 0;
  return Math.max(0.25, Math.min(0.92, base + roleBonus - stamMalus - formMalus));
}

function _simPenaltyShootout(homeId, awayId) {
  var homeR = (G.rosters[homeId] || []).filter(function(p){return p && !p.injured && p.role !== 'POR';})
               .sort(function(a,b){return b.overall - a.overall;}).slice(0,5);
  var awayR = (G.rosters[awayId] || []).filter(function(p){return p && !p.injured && p.role !== 'POR';})
               .sort(function(a,b){return b.overall - a.overall;}).slice(0,5);
  var hG = 0, aG = 0, sd = 0;
  for (var i = 0; i < 5; i++) {
    if (homeR[i] && Math.random() < _penaltyProb(homeR[i], homeR[i].fitness)) hG++;
    if (awayR[i] && Math.random() < _penaltyProb(awayR[i], awayR[i].fitness)) aG++;
  }
  while (hG === aG && sd < 20) {
    sd++;
    var hSD = homeR[sd % homeR.length] || homeR[0];
    var aSD = awayR[sd % awayR.length] || awayR[0];
    if (hSD && Math.random() < _penaltyProb(hSD, hSD.fitness)) hG++;
    if (aSD && Math.random() < _penaltyProb(aSD, aSD.fitness)) aG++;
  }
  return { winner: hG >= aG ? homeId : awayId, hG: hG, aG: aG };
}


// ═══════════════════════════════════════════════════════
// SISTEMA STADIO
// ═══════════════════════════════════════════════════════

// Configurazione sezioni stadio
var STADIUM_SECTIONS = {
  nord:  { label: 'Tribuna Nord',  type: 'tribuna', capPerLevel: 200 },
  sud:   { label: 'Tribuna Sud',   type: 'tribuna', capPerLevel: 200 },
  ovest: { label: 'Curva Ovest',   type: 'curva',   capPerLevel: 100 },
  est:   { label: 'Curva Est',     type: 'curva',   capPerLevel: 100 },
};

// Costi e tempi di costruzione per livello
var STADIUM_LEVEL_COST    = [0, 150000, 280000, 450000, 700000]; // indice = livello target
var STADIUM_LEVEL_DAYS    = [0, 3, 4, 5, 6];  // giornate di lavori
var STADIUM_BAR_COST      = 50000;
var STADIUM_SHOP_COST     = 80000;
var STADIUM_BAR_DAYS      = 2;
var STADIUM_SHOP_DAYS     = 2;
var STADIUM_BAR_BONUS     = 0.06;   // +6% incasso per biglietti venduti
var STADIUM_SHOP_BONUS    = 0.08;   // +8% incasso

// Inizializza struttura stadio su G
function _initStadium() {
  if (!G.stadium) {
    G.stadium = {
      ticketPrice: 15,  // prezzo biglietto default
      sections: {
        nord:  { level: 0, bar: false, shop: false, construction: null },
        sud:   { level: 0, bar: false, shop: false, construction: null },
        ovest: { level: 0, bar: false, shop: false, construction: null },
        est:   { level: 0, bar: false, shop: false, construction: null },
      },
    };
  }
}

// Capienza totale stadio
function stadiumCapacity() {
  _initStadium();
  var base = 500;
  var extra = 0;
  Object.entries(G.stadium.sections).forEach(function(kv) {
    var key = kv[0], sec = kv[1];
    extra += sec.level * STADIUM_SECTIONS[key].capPerLevel;
  });
  return base + extra;
}

// ── Tipo di evento corrente ────────────────────────────────────────
// 'regular' | 'playoff' | 'final'
function _currentMatchType() {
  if (!G) return 'regular';
  if (G.phase !== 'playoff') return 'regular';
  var pb = G.poBracket, plb = G.plBracket;
  if (!pb || !plb) return 'playoff';
  // Finale scudetto o finale playout
  var sfDone = pb.sf && pb.sf.every(function(s){ return !!s.winner; });
  var m1Done = plb.m1 && !!plb.m1.winner;
  if (sfDone || m1Done) return 'final';
  return 'playoff';
}

// Fascia di prezzo ottimale per tipo di partita
function _ticketPriceRange(matchType) {
  if (matchType === 'final')   return { min: 12, max: 30 };
  if (matchType === 'playoff') return { min: 8,  max: 20 };
  // Regular: range dinamico in base a posizione e serie di vittorie
  var st     = (G && G.stand && G.stand[G.myId]) || {};
  var pos    = (typeof getTeamPosition === 'function') ? getTeamPosition(G.stand, G.myId) : 7;
  var wins   = st.w || 0;
  var losses = st.l || 0;
  var tot    = wins + (st.d || 0) + losses;
  // Serie: ultime 5 partite dal calendario
  var streak = 0;
  if (G && G.schedule) {
    var myMatches = G.schedule
      .filter(function(m){ return m.played && (m.home === G.myId || m.away === G.myId); })
      .slice(-5);
    myMatches.forEach(function(m) {
      var ih = m.home === G.myId;
      var mw = ih ? m.score.home > m.score.away : m.score.away > m.score.home;
      var ml = ih ? m.score.home < m.score.away : m.score.away < m.score.home;
      streak += mw ? 1 : ml ? -1 : 0;
    });
  }
  // Più sei in alto e in forma → puoi alzare il prezzo
  var posBonus  = Math.max(0, (14 - pos) / 13);  // 0 (14°) → 1 (1°)
  var streakMod = streak / 5;                     // -1 → +1
  var maxPrice  = Math.round(6 + posBonus * 6 + streakMod * 1); // 6–13€
  var minPrice  = Math.max(1, Math.round(maxPrice * 0.4));
  return { min: minPrice, max: Math.min(12, maxPrice) };
}

// Percentuale riempimento (0-1) basata su performance, tipo evento e prezzo biglietto
function stadiumFillRate(matchType, ticketPrice) {
  if (!G || !G.stand) return 0.30;
  matchType   = matchType   || _currentMatchType();
  ticketPrice = ticketPrice || (G.stadium && G.stadium.ticketPrice) || 15;
  var st   = G.stand[G.myId] || {};
  var tot  = (st.w || 0) + (st.d || 0) + (st.l || 0);
  var wr   = tot > 0 ? (st.w || 0) / tot : 0.40;
  var tier = { S:1.0, A:0.85, B:0.65, C:0.45 }[G.myTeam.tier || 'B'] || 0.65;
  // Base riempimento da performance
  var base = 0.25 + wr * 0.45 + tier * 0.12;
  // Bonus evento: playoff +10%, finale +20%
  var eventBonus = matchType === 'final' ? 0.20 : matchType === 'playoff' ? 0.10 : 0;
  base += eventBonus;
  // Malus prezzo: se il biglietto supera il range ottimale, gli spettatori calano
  var range = _ticketPriceRange(matchType);
  var priceMalus = 0;
  if (ticketPrice > range.max) {
    // Malus proporzionale: ogni euro sopra il max → -1.5% di fill
    priceMalus = Math.min(0.60, (ticketPrice - range.max) * 0.015);
  }
  // Cap fill per tier: evita che squadre piccole riempiano al massimo
  var tierCap = { S: 0.82, A: 0.76, B: 0.68, C: 0.58 }[G.myTeam.tier || 'B'] || 0.68;
  return Math.min(tierCap, Math.max(0.05, base - priceMalus));
}

// Entrate match day
function stadiumMatchRevenue() {
  _initStadium();
  // Capienza effettiva: esclude le sezioni con lavori in corso
  var base = 500;
  var activeCap = base;
  Object.entries(G.stadium.sections).forEach(function(kv) {
    var key = kv[0], sec = kv[1];
    if (!sec.construction) {
      activeCap += sec.level * STADIUM_SECTIONS[key].capPerLevel;
    }
  });
  var price     = G.stadium.ticketPrice || 15;
  var matchType = _currentMatchType();
  var fill      = stadiumFillRate(matchType, price);
  var paying    = Math.round(activeCap * fill);
  var rev    = paying * price;
  // Bonus bar/shop — solo per sezioni NON in costruzione
  Object.values(G.stadium.sections).forEach(function(sec) {
    if (sec.construction) return;  // lavori in corso: niente incassi
    if (sec.bar)  rev += paying * price * STADIUM_BAR_BONUS;
    if (sec.shop) rev += paying * price * STADIUM_SHOP_BONUS;
  });
  var ticketRange = _ticketPriceRange(matchType);
  return { paying: paying, revenue: Math.round(rev), activeCap: activeCap,
           matchType: matchType, ticketRange: ticketRange, fill: fill };
}

// Avvia costruzione / upgrade
function stadiumBuild(sectionKey, type) {  // type: 'level'|'bar'|'shop'
  _initStadium();
  var sec  = G.stadium.sections[sectionKey];
  var cost, days, label;

  if (type === 'level') {
    var nextLv = (sec.level || 0) + 1;
    if (nextLv > 4) { G.msgs.push('⚠️ ' + STADIUM_SECTIONS[sectionKey].label + ' — ' + t('stadium.maxLevel') + '.'); return; }
    if (sec.construction) { G.msgs.push('⚠️ ' + STADIUM_SECTIONS[sectionKey].label + ' — ' + t('stadium.building') + '.'); return; }
    cost  = STADIUM_LEVEL_COST[nextLv];
    days  = STADIUM_LEVEL_DAYS[nextLv];
    label = STADIUM_SECTIONS[sectionKey].label + ' → Livello ' + nextLv;
  } else if (type === 'bar') {
    if (sec.bar) { G.msgs.push('⚠️ ' + t('stadium.bar') + ' — ' + t('stadium.building') + '.'); return; }
    if (sec.level === 0) { G.msgs.push('⚠️ ' + t('stadium.requiresLevel', {n:1})); return; }
    if (sec.construction) { G.msgs.push('⚠️ ' + t('stadium.building') + '.'); return; }
    cost  = STADIUM_BAR_COST;
    days  = STADIUM_BAR_DAYS;
    label = 'Bar — ' + STADIUM_SECTIONS[sectionKey].label;
  } else if (type === 'shop') {
    if (sec.shop) { G.msgs.push('⚠️ ' + t('stadium.shop') + ' — ' + t('stadium.building') + '.'); return; }
    if (sec.level === 0) { G.msgs.push('⚠️ ' + t('stadium.requiresLevel', {n:1})); return; }
    if (sec.construction) { G.msgs.push('⚠️ Lavori già in corso.'); return; }
    cost  = STADIUM_SHOP_COST;
    days  = STADIUM_SHOP_DAYS;
    label = 'Shop — ' + STADIUM_SECTIONS[sectionKey].label;
  } else return;

  if (G.budget < cost) {
    G.msgs.push('❌ ' + t('stadium.notEnoughBudget') + ' ' + label + ' (' + formatMoney(cost) + ')');
    renderStadium(); return;
  }
  G.budget -= cost;
  addLedger(t('nav.stadium'), -cost, 'Lavori: ' + label, typeof currentRound === 'function' ? currentRound() : 0);
  sec.construction = { type: type, daysLeft: days, label: label };
  G.msgs.push('🏗️ ' + t('stadium.upgradeQueued') + ' ' + label + ' — ' + t('common.round') + ' +' + days + '. ' + formatMoney(cost));
  updateHeader(); autoSave(); renderStadium();
}

// Aggiorna costruzioni (chiamato ogni giornata in simNextRound)
function _updateStadiumConstruction() {
  if (!G.stadium) return;
  Object.entries(G.stadium.sections).forEach(function(kv) {
    var key = kv[0], sec = kv[1];
    if (!sec.construction) return;
    sec.construction.daysLeft = (parseInt(sec.construction.daysLeft) || 1) - 1;
    if (sec.construction.daysLeft <= 0) {
      var ctype = sec.construction.type;
      if (ctype === 'level')  sec.level = (sec.level || 0) + 1;
      else if (ctype === 'bar')  sec.bar  = true;
      else if (ctype === 'shop') sec.shop = true;
      G.msgs.push('✅ ' + sec.construction.label + ' — ' + t('stadium.capacity') + ': ' + stadiumCapacity().toLocaleString() + '.');
      sec.construction = null;
    }
  });
}


// ── Usura stadio (chiamato ogni giornata in casa) ──────────────────
function _stadiumWear() {
  if (!G.stadium) return;
  var rev  = stadiumMatchRevenue();
  var cap  = stadiumCapacity();
  var fill = rev.paying / Math.max(1, cap); // 0-1

  // Usura solo se riempimento > 50%
  if (fill <= 0.50) return;

  // Probabilità usura per sezione: proporzionale al riempimento oltre il 50%
  // fill=0.50 → 0%, fill=0.75 → 5%, fill=1.00 → 10%
  var wearProb = (fill - 0.50) * 0.20;

  Object.entries(G.stadium.sections).forEach(function(kv) {
    var key = kv[0], sec = kv[1];
    if (sec.level === 0 || sec.construction) return; // niente da usurarsi
    if (Math.random() > wearProb) return;

    var sname = { nord:'Tribuna Nord', sud:'Tribuna Sud', ovest:'Curva Ovest', est:'Curva Est' }[key] || key;

    // Prima chiudi bar e shop se presenti (prima di scendere al livello 0)
    if (sec.level === 1) {
      if (sec.shop) { sec.shop = false; G.msgs.push('⚠️ ' + t('stadium.worn') + ' — ' + t('stadium.shop') + ' ' + sname + '.'); return; }
      if (sec.bar)  { sec.bar  = false; G.msgs.push('⚠️ ' + t('stadium.worn') + ' — ' + t('stadium.bar') + ' ' + sname + '.'); return; }
    }
    // Scendi di livello
    sec.level = Math.max(0, sec.level - 1);
    G.msgs.push('🏚️ ' + sname + ' — ' + t('stadium.level', {n: sec.level}));
  });
}

// Incasso match day (chiamato in simNextRound dopo ogni partita giocata/simulata)
function _collectStadiumRevenue() {
  if (!G.stadium) return;
  var r = stadiumMatchRevenue();
  if (r.revenue > 0) {
    G.budget += r.revenue;
    addLedger(t('nav.stadium'), r.revenue, 'Incasso stadio (' + r.paying.toLocaleString() + ' spettatori)', typeof currentRound === 'function' ? currentRound() : 0);
    G.msgs.push('🏟️ ' + t('stadium.attendance') + ': ' + r.paying.toLocaleString() + ' · +' + formatMoney(r.revenue));
  }
}

// Aggiorna prezzo biglietto
function setTicketPrice(val) {
  _initStadium();
  var price = parseInt(val) || 15;
  G.stadium.ticketPrice = Math.max(5, Math.min(150, price));
  autoSave(); renderStadium();
}


// ── Distribuisce gol su 4 tempi ────────────────────────────────────
function _splitIntoPeriods(totalHome, totalAway) {
  var periods = [{home:0,away:0},{home:0,away:0},{home:0,away:0},{home:0,away:0}];
  // Distribuisce randomicamente i gol nei 4 periodi
  for (var i = 0; i < totalHome; i++) {
    var p = Math.floor(Math.random() * 4);
    periods[p].home++;
  }
  for (var i = 0; i < totalAway; i++) {
    var p = Math.floor(Math.random() * 4);
    periods[p].away++;
  }
  return periods;
}

function simPOMatch(type, idx) {
  const pb = G.poBracket;
  const m  = type === 'sf' ? pb.sf[idx] : pb.final;
  const hT = G.teams.find(tm => tm.id === m.home);
  const aT = G.teams.find(tm => tm.id === m.away);
  const sc = simulateResult(hT, aT, 0, G.rosters);
  // Parziali per 4 tempi
  if (!m.scores) m.scores = [];
  const periods = _splitIntoPeriods(sc.home, sc.away);
  m.scores = periods;
  // Genera marcatori/assist
  const homeRoster = G.rosters[m.home] || [];
  const awayRoster = G.rosters[m.away] || [];
  if (typeof simulateMatchStats === 'function') {
    m.details = simulateMatchStats(homeRoster, awayRoster, sc);
  }
  // Pareggio → supplementari → rigori
  let poWinner;
  if (sc.home > sc.away)      poWinner = m.home;
  else if (sc.away > sc.home) poWinner = m.away;
  else {
    // Supplementari: 2 tempi extra con piccola varianza
    const extH = sc.home + (Math.random() < 0.40 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
    const extA = sc.away + (Math.random() < 0.40 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
    if (extH !== extA) {
      poWinner = extH > extA ? m.home : m.away;
      // Aggiunge periodo supplementari (gol extra distribuiti su 1 periodo)
      m.scores.push({ home: extH - sc.home, away: extA - sc.away, label: 'Sup.' });
      G.msgs.push('⏱️ Supplementari: ' + (hT?.name||'?') + ' ' + extH + '-' + extA + ' ' + (aT?.name||'?'));
    } else {
      // Rigori
      const ps = _simPenaltyShootout(m.home, m.away);
      poWinner = ps.winner;
      m.scores.push({ home: ps.hG, away: ps.aG, label: 'Rig.' });
      m._extraInfo = '🎯 ' + t('lineup.penaltyOrder') + ': ' + ps.hG + '-' + ps.aG;
      G.msgs.push('🎯 ' + t('lineup.penaltyOrder') + ': ' + (hT?.name||'?') + ' ' + ps.hG + '-' + ps.aG + ' ' + (aT?.name||'?') + '. ' + t('playoff.advances') + ' ' + (G.teams.find(t=>t.id===poWinner)?.name||'?') + '.');
    }
  }
  m.winner = poWinner;
  if (type === 'sf') {
    if (pb.sf.every(s => s.winner)) { pb.final.home = pb.sf[0].winner; pb.final.away = pb.sf[1].winner; }
  } else {
    pb.done = true;
    const wname = G.teams.find(tm => tm.id === m.winner)?.name;
    if (m.winner === G.myId) {
      G.playoffResult = 'champion';
      G.msgs.push(t('seasonEnd.champion', {team: G.myTeam.name}));
    }
    // Aumento ingaggi +20% per la squadra campione
    const champRoster = G.rosters[m.winner] || [];
    champRoster.forEach(function(p) {
      if (p && p.salary) p.salary = Math.round(p.salary * 1.20);
    });
    const champTeam = G.teams.find(tm => tm.id === m.winner);
    if (champTeam) {
      const msg = (m.winner === G.myId)
        ? '💰 Scudetto! Gli ingaggi di tutta la rosa aumentano del 20%.'
        : '💰 ' + wname + ' campione: ingaggi rosa +20%.';
      G.msgs.push(msg);
    }
    if (m.winner !== G.myId) G.msgs.push(t('playoff.champion') + ' ' + wname);
  }
  autoSave(); renderPlayoff();
}

function simPLMatch(key) {
  const plb = G.plBracket;
  const m   = plb[key];
  // m2.home = perdente di m1 (chi va alla finale di salvezza)
  if (!m.home) {
    const m1w = plb.m1.winner;
    if (m1w) {
      m.home = (plb.m1.home === m1w) ? plb.m1.away : plb.m1.home; // perdente
    }
  }
  const hT   = G.teams.find(tm => tm.id === m.home);
  const aT   = G.teams.find(tm => tm.id === m.away);
  const sc  = simulateResult(hT, aT, 0, G.rosters);
  // Parziali per 4 tempi
  if (!m.scores) m.scores = [];
  const plPeriods = _splitIntoPeriods(sc.home, sc.away);
  m.scores = plPeriods;
  // Genera marcatori/assist
  const plHomeRoster = G.rosters[m.home] || [];
  const plAwayRoster = G.rosters[m.away] || [];
  if (typeof simulateMatchStats === 'function') {
    m.details = simulateMatchStats(plHomeRoster, plAwayRoster, sc);
  }
  // Chi VINCE si salva, chi PERDE retrocede
  let winner;
  if (sc.home !== sc.away) {
    winner = sc.home > sc.away ? m.home : m.away;
  } else {
    // Pareggio → tempi supplementari
    const extH = sc.home + (Math.random() < 0.45 ? 1 : 0);
    const extA = sc.away + (Math.random() < 0.45 ? 1 : 0);
    if (extH !== extA) {
      winner = extH > extA ? m.home : m.away;
      m.scores.push({ home: extH - sc.home, away: extA - sc.away, label: 'Sup.' });
      G.msgs.push('⏱️ Supplementari: ' + (hT?.name||'?') + ' ' + extH + '-' + extA + ' ' + (aT?.name||'?'));
    } else {
      // Ancora pari → rigori
      const ps = _simPenaltyShootout(m.home, m.away);
      winner = ps.winner;
      const wName = G.teams.find(tm => tm.id === winner)?.name || '?';
      G.msgs.push('🎯 ' + t('lineup.penaltyOrder') + ' ' + t('playoff.playout').toLowerCase() + ': ' + (hT?.name||'?') + ' ' + ps.hGoals + '-' + ps.aGoals + ' ' + (aT?.name||'?') + '. ' + t('playoff.saves') + ' ' + wName + '.');
    }
  }
  const loser  = winner === m.home ? m.away : m.home;
  m.winner     = winner;
  if (key === 'm1') {
    // Il PERDENTE dell'11° vs 13° va alla finale rischio retrocessione
    // Il VINCITORE si salva direttamente
    plb.m2.home = loser;
    const savedName = G.teams.find(tm => tm.id === winner)?.name || '?';
    if (winner === G.myId) {
      G.playoffResult = 'survived';
      G.msgs.push(t('seasonEnd.survived'));
    } else {
      G.msgs.push('✅ ' + savedName + ' — ' + t('playoff.saves'));
    }
  } else {
    // Finale playout: il perdente retrocede
    plb.relegated = loser; plb.done = true;
    if (loser === G.myId) { G.playoffResult = 'relegated'; G.msgs.push(t('seasonEnd.relegated', {team: G.myTeam.name})); }
    else if (winner === G.myId) { G.playoffResult = 'survived'; G.msgs.push(t('seasonEnd.survived')); }
    else G.msgs.push(G.teams.find(tm => tm.id === loser)?.name + ' — ' + t('playoff.relegated'));
  }
  autoSave(); renderPlayoff();
}

// ── Avvia playoff live (apre convocazioni) ────
function startPOMatch(type, idx) {
  const pb  = G.poBracket;
  const plb = G.plBracket;
  let m;
  if (type === 'sf')    m = pb.sf[idx];
  else if (type === 'final') m = pb.final;
  else {
    m = plb[idx];
    if (!m.home) {
      const m1w = plb.m1.winner;
      if (m1w) m.home = (plb.m1.home === m1w) ? plb.m1.away : plb.m1.home; // perdente di m1
    }
  }

  const ih  = m.home === G.myId;
  const opp = G.teams.find(tm => tm.id === (ih ? m.away : m.home));
  openLineup(m, ih, opp, type, m);
}

// ── Chiusura stagione ─────────────────────────
function closeSeason() {
  // Aggiorna i valori di tutti i giocatori a fine stagione
  var champId = null, relegId = null;
  if (G.poBracket && G.poBracket.final && G.poBracket.final.winner) champId = G.poBracket.final.winner;
  if (G.plBracket && G.plBracket.relegated) relegId = G.plBracket.relegated;
  if (G.relegated) relegId = G.relegated;  // retrocessione diretta 14°
  _refreshAllPlayerValues({ champion: champId, relegated: relegId });
  G.phase = 'done';
  const reward = finalizeObjectives(G.objectives, G.stand, G.myId, G.playoffResult);
  G.budget += reward;
  if (reward) addLedger(t('finance.types.obiettivo'), reward, 'Bonus obiettivi fine stagione', currentRound());
  G.msgs.push(t('nav.endSeason') + ' · Budget: ' + formatMoney(G.budget));

  // ── Salva record stagione nello storico ──
  if (!G.seasonHistory) G.seasonHistory = [];
  const pos       = typeof getTeamPosition === 'function' ? getTeamPosition(G.stand, G.myId) : '?';
  const st        = G.stand[G.myId] || {};
  const myRoster  = G.rosters[G.myId] || [];

  // Fase playoff/playout raggiunta
  function _playoffPhaseLabel() {
    const pr = G.playoffResult;
    if (pr === 'champion')  return '🏆 Campione';
    if (pr === 'relegated') return '⬇️ Retrocesso';
    if (pr === 'finalist')  return '🥈 Finalista';
    if (pr === 'semifinal') return '🥉 Semifinale';
    if (G.ploTeams && G.ploTeams.includes(G.myId)) {
      if (pr === 'survived') return '✅ Playout: salvato';
      return '⚠️ Playout';
    }
    if (G.poTeams && G.poTeams.includes(G.myId)) return '🏅 Playoff';
    return '—';
  }

  // Miglior marcatore, assistman, presenza stagionale
  let topScorer = null, topAssist = null, topSaves = null;
  myRoster.forEach(p => {
    if (!p) return;
    if (!topScorer  || p.goals   > topScorer.goals)   topScorer  = p;
    if (!topAssist  || p.assists > topAssist.assists)  topAssist  = p;
    if (!topSaves   || p.saves   > topSaves.saves)     topSaves   = p;
  });

  G.seasonHistory.push({
    season:       G.seasonNumber || 1,
    tier:         G.myTeam.tier || 'B',
    pos:          pos,
    pts:          st.pts || 0,
    w: st.w || 0, d: st.d || 0, l: st.l || 0,
    gf: st.gf || 0, ga: st.ga || 0,
    playoffPhase: _playoffPhaseLabel(),
    budget:       G.budget,
    topScorer:    topScorer  ? { name: topScorer.name,  val: topScorer.goals }   : null,
    topAssist:    topAssist  ? { name: topAssist.name,  val: topAssist.assists } : null,
    topSaves:     topSaves   ? { name: topSaves.name,   val: topSaves.saves }    : null,
  });

  updateHeader(); autoSave(); showTab('goals');
}

// ── Popup conferma nuova stagione ────────────
function _confirmNewSeason() {
  const sNum = (G.seasonNumber || 1) + 1;
  const pos  = typeof getTeamPosition === 'function' ? getTeamPosition(G.stand, G.myId) : '?';

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(6px)';

  const box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(180deg,#0d1f3c,#091525);border:2px solid #2a5aaa;border-radius:16px;padding:24px;max-width:400px;width:92%;box-shadow:0 8px 40px rgba(0,0,0,.8)';
  box.innerHTML = `
    <div style="font-size:28px;text-align:center;margin-bottom:10px">🏊</div>
    <div style="font-size:16px;font-weight:800;color:var(--blue);text-align:center;margin-bottom:6px">${t('seasonEnd.newSeason', {n: sNum})}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.65);text-align:center;margin-bottom:16px">
      ${t('common.season')} ${sNum}
    </div>
    <div style="background:rgba(0,194,255,.06);border:1px solid rgba(0,194,255,.2);border-radius:10px;padding:12px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--blue);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">✅ ${t('common.save')}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.75);line-height:2">
        ${t('nav.rosa')} · ${t('common.budget')}: <strong style="color:var(--gold)">${formatMoney(G.budget)}</strong><br>
        ⭐ ${G.stars || 0}<br>
        ${t('history.title')} · ${t('finance.ledger')}
      </div>
    </div>
    <div style="background:rgba(240,80,80,.06);border:1px solid rgba(240,80,80,.2);border-radius:10px;padding:12px;margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#e07070;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">🔄 ${t('common.cancel')}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.75);line-height:2">
        ${t('nav.calendar')} · ${t('nav.standings')}<br>
        ${t('common.goals')} · ${t('common.assists')} · ${t('common.saves')}<br>
        ${t('nav.goals')}<br>
        ${t('common.age')} +1
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <button id="ns-confirm" style="flex:1;padding:11px;font-size:13px;font-weight:800;border-radius:8px;border:2px solid var(--green);background:linear-gradient(135deg,#0a6a2a,#055020);color:#fff;cursor:pointer">
        ✓ Inizia Stagione ${sNum}
      </button>
      <button id="ns-cancel" style="padding:11px 16px;font-size:13px;font-weight:700;border-radius:8px;border:2px solid var(--border);background:var(--panel2);color:var(--muted);cursor:pointer">
        Annulla
      </button>
    </div>`;

  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.getElementById('ns-confirm').onclick = function() { ov.remove(); startNewSeason(); };
  document.getElementById('ns-cancel').onclick  = function() { ov.remove(); };
}

// ── Nuova stagione in continuità ──────────────
// Preserva: roster (con progressi), budget, stelle, ledger storico, storico msgs
// Resetta: calendario, classifica, statistiche stagionali, fase, playoff, obiettivi
// ═══════════════════════════════════════════════════════
// RICALCOLO TIER SQUADRE A INIZIO STAGIONE
// Tiene conto di: piazzamento precedente, valore rosa, budget
// ═══════════════════════════════════════════════════════
function _recalcTiers() {
  if (!G || !G.stand || !G.teams) return;

  const sorted = getSortedStandings(G.stand); // classifica stagione appena terminata

  G.teams.forEach(team => {
    const tid     = team.id;
    const roster  = G.rosters[tid] || [];

    // ── 1. Piazzamento: posizione in classifica (1 = primo) ──
    const posIdx  = sorted.findIndex(s => s.id === tid);
    const pos     = posIdx >= 0 ? posIdx + 1 : 7; // default medio se non trovato
    const numTeams = sorted.length || 14;

    // ── 2. Forza rosa: media overall top-13 ──
    const avail   = roster.filter(p => p && !p.injured).sort((a, b) => b.overall - a.overall).slice(0, 13);
    const avgOvr  = avail.length ? avail.reduce((s, p) => s + (p.overall || 70), 0) / avail.length : 70;

    // ── 3. Budget (solo per la squadra del manager) ──
    const budget  = tid === G.myId ? (G.budget || 0) : (team._budget || team.budget || 0);

    // ── Score composito (0–100) ──
    // Piazzamento: peso 50% (pos 1 → 100, pos 14 → 0)
    const posScore    = Math.round((1 - (pos - 1) / (numTeams - 1)) * 100);
    // OVR rosa: peso 35% (OVR 50 → 0, OVR 99 → 100)
    const ovrScore    = Math.round(Math.max(0, Math.min(100, (avgOvr - 50) / 49 * 100)));
    // Budget: peso 15% (budget 0 → 0, budget ≥ 3M → 100)
    const budgetScore = Math.round(Math.min(100, budget / 30000));

    const composite = Math.round(posScore * 0.50 + ovrScore * 0.35 + budgetScore * 0.15);

    // ── Assegna tier in base allo score ──
    let newTier;
    if      (composite >= 75) newTier = 'S';
    else if (composite >= 50) newTier = 'A';
    else if (composite >= 25) newTier = 'B';
    else                       newTier = 'C';

    // ── Smorzamento: non cambiare più di 1 livello alla volta ──
    const tierOrder = ['C','B','A','S'];
    const prevIdx   = tierOrder.indexOf(team.tier || 'B');
    const newIdx    = tierOrder.indexOf(newTier);
    const clampedIdx = Math.max(prevIdx - 1, Math.min(prevIdx + 1, newIdx));
    newTier = tierOrder[clampedIdx];

    // Aggiorna tier
    const oldTier = team.tier;
    team.tier = newTier;

    // Aggiorna anche str della squadra avversaria sulla base dell'OVR reale
    if (tid !== G.myId) {
      team.str = Math.round(Math.max(50, Math.min(95, avgOvr)));
    }

    // Notifica cambiamento tier per la nostra squadra
    if (tid === G.myId && newTier !== oldTier) {
      const tierLabels = { S:'Elite (S)', A:'Alta (A)', B:'Media (B)', C:'Bassa (C)' };
      const direction  = clampedIdx > prevIdx ? '⬆️ ' + t('tier.promoted') : '⬇️ ' + t('tier.relegated');
      G.msgs.push('📊 ' + G.myTeam.name + ' ' + direction + ' in fascia ' + tierLabels[newTier] +
        ' (pos. ' + pos + '°, OVR medio ' + Math.round(avgOvr) + ', budget ' + formatMoney(budget) + ')');
    }
  });

  // Ricalcola obiettivi per la nostra squadra in base al nuovo tier
  G.myTeam.tier = G.teams.find(tm => tm.id === G.myId)?.tier || G.myTeam.tier;
}

function startNewSeason() {
  if (!G) return;

  const seasonNum = (G.seasonNumber || 1) + 1;

  // ── Aging, ritiri e reset statistiche ──────────────────────────────────
  const retiredNames = []; // nomi giocatori ritirati (solo squadra del manager)
  Object.entries(G.rosters).forEach(([tid, roster]) => {
    if (!roster) return;
    roster.forEach((p, i) => {
      if (!p) return;
      // Accumula statistiche di carriera PRIMA del reset stagionale
      p.careerGoals   = (p.careerGoals   || 0) + (p.goals   || 0);
      p.careerAssists = (p.careerAssists || 0) + (p.assists || 0);
      p.careerSaves   = (p.careerSaves   || 0) + (p.saves   || 0);
      // careerApps = partite con voto (aggiornato dopo ogni partita, non per stagione)
      // Reset statistiche stagionali
      p.goals      = 0;
      p.assists    = 0;
      p.saves      = 0;
      p.lastRatings = [];
      // Aging: invecchia di 1 anno (tutte le squadre)
      if (p.age !== undefined) p.age++;
      // Reset flag rinnovo: la stagione è ricominciata
      if (p._justRenewed) p._justRenewed = false;
      // Calo naturale over-30: decrementa un attributo casuale e ricalcola overall
      if ((p.age || 25) > 30 && Math.random() < 0.35 && p.stats) {
        const attrs = ['att','def','spe','str','tec','res'];
        const attr = attrs[Math.floor(Math.random() * attrs.length)];
        p.stats[attr] = Math.max(40, (p.stats[attr] || 60) - 1);
        // Ricalcola overall dagli attributi
        if (typeof _calcOverallFromStats === 'function') {
          const potCap = (p.potential || 99);
          p.overall = Math.min(potCap, Math.max(48, _calcOverallFromStats(p)));
        } else {
          p.overall = Math.max(48, p.overall - 1);
        }
      }
      // Segna come ritirato se ha raggiunto l'età massima
      if (p.retirementAge !== undefined && p.age >= p.retirementAge) {
        p._retiring = true;
        if (tid === G.myId) retiredNames.push(p.name);
      }
    });

    // Rimuovi i ritirati dalla rosa (filtra con null per preservare gli indici temporaneamente,
    // poi compatta — usiamo splice per mantenere coerenza con transferList e savedLineup)
    for (let i = roster.length - 1; i >= 0; i--) {
      if (roster[i] && roster[i]._retiring) {
        roster.splice(i, 1);
      }
    }
  });

  // Notifica ritiri nella squadra del manager
  if (retiredNames.length > 0) {
    G.msgs.push(t('seasonEnd.retired', {names: retiredNames.join(', ')}));
  }

  // Resetta lineup salvata (i ritirati potrebbero essere in campo)
  G.savedLineup = null;

  // ── Ricalcola tier in base a piazzamento/rosa/budget ──
  // DEVE essere chiamata PRIMA di resettare G.stand (usa la classifica dell'ultima stagione)
  _recalcTiers();

  // ── Nuovo calendario e classifica ──
  G.schedule = generateSchedule(G.teams);
  G.stand    = initStandings(G.teams);
  // Inizializza budget simulato delle squadre avversarie per il mercato
  G.teams.forEach(tm => { if (!tm._budget || tm.id === G.myId) tm._budget = tm.str * 40000; });

  // ── Nuovi obiettivi basati sul tier aggiornato ──
  G.objectives = initObjectives(G.myTeam.tier || 'B');

  // ── Reset stato stagione ──
  G.phase         = 'regular';
  G.poTeams       = null;
  G.ploTeams      = null;
  G.relegated     = null;
  G.poBracket     = null;
  G.plBracket     = null;
  G.playoffResult = null;
  G.prevPos       = null;
  G.ms            = null;
  G.seasonNumber  = seasonNum;
  G._newsPage     = 0;
  G.savedLineup   = null;

  // ── Messaggio inizio stagione ──
  // Decrementa contratti e attività CPU mercato
  _decrementContracts();
  // Rimuovi giocatori con contratto scaduto (messi sul mercato da _decrementContracts)
  G.rosters[G.myId] = (G.rosters[G.myId] || []).filter(p => p && !p._expired);
  _cpuMarketActivity();

  G.msgs.push('─────────────────────────────────');
  G.msgs.push(t('seasonEnd.newSeason', {n: seasonNum}) + ' · Budget: ' + formatMoney(G.budget) + ' · ⭐ ' + (G.stars || 0));

  updateHeader();
  autoSave();
  // Mostra popup giovani prima della dashboard
  requestAnimationFrame(function() {
    showTab('dash');
    setTimeout(_showYouthPopup, 400);
  });
}

// ── Init ──────────────────────────────────────
// ── Velocità simulazione (globale, sempre disponibile) ──
function setSpeed(v) {
  if (G.ms) G.ms.speed = v;
  _setSpeedUI(v);
}
function _setSpeedUI(v) {
  document.querySelectorAll('.btn-speed').forEach(b => {
    const bv = parseInt(b.dataset.speed, 10);
    b.style.background  = bv === v ? 'var(--blue)' : '';
    b.style.color       = bv === v ? '#001220'     : '';
    b.style.borderColor = bv === v ? 'var(--blue)' : '';
    b.style.fontWeight  = bv === v ? '700'         : '';
  });
}

// ═══════════════════════════════════════════════════════
// SISTEMA TEMI GRAFICI
// ═══════════════════════════════════════════════════════
var _themes = ['classic', 'light', 'dark'];
var _themeLabels = { classic: 'Classic', light: 'Chiaro', dark: 'Scuro' };
var _themeIcons  = { classic: '🎨', light: '☀️', dark: '🌙' };

function cycleTheme() {
  var cur  = localStorage.getItem('wp-theme') || 'classic';
  var idx  = _themes.indexOf(cur);
  var next = _themes[(idx + 1) % _themes.length];
  applyTheme(next);
}

function applyTheme(name) {
  document.body.classList.remove('theme-light', 'theme-dark');
  if (name === 'light') document.body.classList.add('theme-light');
  if (name === 'dark')  document.body.classList.add('theme-dark');
  localStorage.setItem('wp-theme', name);
  var icon = document.getElementById('theme-icon');
  var lbl  = document.getElementById('theme-label');
  if (icon) icon.textContent = _themeIcons[name]  || '🎨';
  if (lbl)  lbl.textContent  = _themeLabels[name] || 'Classic';
}

// Applica il tema salvato all'avvio
(function() {
  var saved = localStorage.getItem('wp-theme') || 'classic';
  applyTheme(saved);
})();

document.addEventListener('DOMContentLoaded', () => {
  buildWelcomeScreen();

  // ── Ripristino stato UI dopo cambio lingua ──────────────────────────
  // Se setLang() ha salvato una schermata in sessionStorage, torna lì
  try {
    const resumeScreen = sessionStorage.getItem('wp_resume_screen');
    const resumeTab    = sessionStorage.getItem('wp_resume_tab');

    if (resumeScreen && resumeScreen !== 'sc-welcome') {
      // Pulisci subito per non riapplicare ai reload successivi
      sessionStorage.removeItem('wp_resume_screen');
      sessionStorage.removeItem('wp_resume_tab');

      // Prova a caricare l'ultimo slot usato e torna in gioco
      const lastSlot = parseInt(localStorage.getItem('wp_last_slot') || '-1', 10);
      if (lastSlot >= 0) {
        const payload = loadFromSlot(lastSlot);
        if (payload) {
          G = applyLoadedSave(payload);
          if (typeof _normalizeRosters   === 'function') _normalizeRosters(G);
          if (typeof _refreshAllPlayerValues === 'function') _refreshAllPlayerValues();
          G._currentSlot = lastSlot;
          showScreen('sc-game');
          updateHeader();
          requestAnimationFrame(() => showTab(resumeTab || 'dash'));
          return; // non mostrare la lobby
        }
      }
    } else {
      // Reload normale o primo avvio: pulisci comunque
      sessionStorage.removeItem('wp_resume_screen');
      sessionStorage.removeItem('wp_resume_tab');
    }
  } catch(e) {}
});

// ── Torna alla welcome (con aggiornamento slot) ─
function goToWelcome() {
  if (G && G.myId) {
    const ok = confirm(t('logout.confirm'));
    if (!ok) return;
    autoSave();
  }
  showScreen('sc-welcome');
  buildWelcomeScreen(); // aggiorna i metadati degli slot
}

// ── Menu salvataggio in-game ───────────────────
// Mostra i 3 slot con opzioni salva/sovrascrivi.
function openSaveMenu() {
  const existing = document.getElementById('save-menu-modal');
  if (existing) existing.remove();

  const metas = readAllSlotsMeta();
  const ov    = document.createElement('div');
  ov.id        = 'save-menu-modal';
  ov.className = 'save-menu-overlay';

  const rows = metas.map((meta, i) => {
    const isCurrent = G._currentSlot === i;
    if (meta) {
      const savedDate = new Date(meta.savedAt).toLocaleString('it-IT', {
        day:'2-digit', month:'2-digit', year:'2-digit',
        hour:'2-digit', minute:'2-digit',
      });
      return `
        <div class="save-slot-row" style="border:1px solid ${isCurrent ? 'var(--blue)' : 'transparent'}">
          <div class="slot-team-dot" style="background:${meta.teamCol};width:32px;height:32px;font-size:9px">${meta.teamAbbr}</div>
          <div class="save-slot-info">
            <div class="save-slot-name">${meta.teamName} ${isCurrent ? '<span style="color:var(--blue);font-size:10px">(attivo)</span>' : ''}</div>
            <div class="save-slot-sub">Slot ${i+1} · G${meta.round} · ${meta.position}° posto · ${savedDate}</div>
          </div>
          <button class="btn sm primary" onclick="saveCurrentToSlot(${i});document.getElementById('save-menu-modal').remove()">
            ${isCurrent ? '💾 Aggiorna' : '💾 Salva qui'}
          </button>
        </div>`;
    } else {
      return `
        <div class="save-slot-row">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--muted)">＋</div>
          <div class="save-slot-info">
            <div class="save-slot-name">Slot ${i+1} — Vuoto</div>
          </div>
          <button class="btn sm primary" onclick="saveCurrentToSlot(${i});document.getElementById('save-menu-modal').remove()">
            💾 Salva qui
          </button>
        </div>`;
    }
  }).join('');

  ov.innerHTML = `
    <div class="save-menu-box">
      <div class="save-menu-title">💾 Salva Partita</div>
      ${rows}
      <button class="btn" style="width:100%;margin-top:8px"
              onclick="document.getElementById('save-menu-modal').remove()">${t('common.cancel')}</button>
    </div>`;

  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ══════════════════════════════════════════════
// MERCATO IN USCITA — logica offerte e morale
// ══════════════════════════════════════════════

// ── Metti un giocatore sul mercato ────────────
function putPlayerOnMarket(rosterIdx, askingPrice) {
  if (!G.transferList) G.transferList = [];
  // Rimuovi se già presente
  G.transferList = G.transferList.filter(e => e.rosterIdx !== rosterIdx);
  G.transferList.push({ rosterIdx, askingPrice });
  // Calo morale: il giocatore sa di essere sul mercato
  const p = G.rosters[G.myId][rosterIdx];
  if (p) {
    p.morale = Math.max(0, p.morale - rnd(8, 15));
    G.msgs.push(p.name + ' — ' + t('roster.willLoseMorale'));
  }
  autoSave();
}

// ── Rimuovi dal mercato ───────────────────────
function removeFromMarket(rosterIdx) {
  if (!G.transferList) return;
  const p = G.rosters[G.myId][rosterIdx];
  G.transferList = G.transferList.filter(e => e.rosterIdx !== rosterIdx);
  if (p) G.msgs.push(p.name + ' — ' + t('market.myList'));
  autoSave();
}

// ── Calcola appetibilità di un giocatore ──────
// Restituisce un fattore 0-1 che le squadre usano per offrire
function _playerAttractiveness(p, matchesPlayed) {
  // Appetibilità 0.5–1.3: può superare 1.0 per giocatori eccezionali
  let score = 0.80;
  // Morale
  score += ((p.morale || 70) - 70) / 300;   // ±0.10 attorno alla media
  // Fitness
  score += ((p.fitness || 70) - 70) / 300;
  // Contributo stagionale
  const contrib = (p.goals || 0) + (p.assists || 0);
  if (contrib >= 20)       score += 0.15;
  else if (contrib >= 10)  score += 0.08;
  else if (contrib >= 5)   score += 0.04;
  // Presenze
  const apps = (p.lastRatings || []).filter(r => r !== null).length;
  if (apps >= 20)      score += 0.08;
  else if (apps >= 10) score += 0.04;
  // Infortuni
  if (p.injured)             score -= 0.20;
  else if ((p.injProb||0.04) > 0.10) score -= 0.10;
  // Età oltre 30
  if ((p.age||25) > 33)  score -= 0.20;
  else if ((p.age||25) > 30) score -= 0.10;
  return Math.min(1.30, Math.max(0.40, score));
}

// ── Genera offerte a fine giornata ───────────
// Chiamata da simNextRound() e da endMatch() dopo ogni gara giocata
// ── Mercato acquisti persistente ─────────────
// G.marketPool = array di giocatori disponibili con durata giornate rimanenti
// Generato una volta e aggiornato ad ogni giornata

function initMarketPool() {
  if (G.marketPool && G.marketPool.length > 0) return; // già inizializzato
  G.marketPool = [];
  _fillMarketPool(16);
}

function _fillMarketPool(targetSize) {
  if (!G.marketPool) G.marketPool = [];

  // Raccoglie giocatori disponibili da tutte le squadre avversarie
  // Distribuisce per fascia: ~30% fascia bassa (OVR 50-64), ~40% media (65-79), ~30% alta (80+)
  const all = [];
  G.teams.forEach(tm => {
    if (tm.id === G.myId) return;
    G.rosters[tm.id].forEach(p => {
      if (p.overall >= 50) all.push({ ...p, _tid: tm.id, _tname: tm.name });
    });
  });

  const low    = all.filter(p => p.overall < 65).sort(() => Math.random() - 0.5);
  const mid    = all.filter(p => p.overall >= 65 && p.overall < 80).sort(() => Math.random() - 0.5);
  const high   = all.filter(p => p.overall >= 80).sort(() => Math.random() - 0.5);

  const needed = Math.max(0, targetSize - G.marketPool.length);
  const nLow  = Math.round(needed * 0.30);
  const nHigh = Math.round(needed * 0.30);
  const nMid  = needed - nLow - nHigh;

  const toAdd = [
    ...low.slice(0, nLow),
    ...mid.slice(0, nMid),
    ...high.slice(0, nHigh),
  ];

  // Esclude chi è già nel pool
  const existing = new Set(G.marketPool.map(e => (e.player ? e.player.name : '') + (e.player ? e.player._tid : '')));
  toAdd.forEach(p => {
    const key = p.name + p._tid;
    if (!existing.has(key)) {
      existing.add(key);
      G.marketPool.push({
        player:      p,
        daysLeft:    rnd(1, 5),   // rimane 1-5 giornate
        pendingOffer: null,       // { amount, roundMade } offerta fatta dal giocatore
      });
    }
  });
}

function refreshMarketPool() {
  if (!G.marketPool) { initMarketPool(); return; }

  // Decrementa durata; i giocatori con offerta accettata che scadono → pendingPurchases
  if (!G.pendingPurchases) G.pendingPurchases = [];
  const currentRnd = typeof currentRound === 'function' ? currentRound() : 0;

  G.marketPool = G.marketPool.filter(e => {
    e.daysLeft--;
    if (e.daysLeft <= 0) {
      // Se aveva offerta accettata non ancora finalizzata, salvala per 1 giornata
      if (e.offerResult === 'accepted' && e.offerResultAmount) {
        // Evita duplicati
        const already = G.pendingPurchases.find(pp => pp.player.name === e.player.name);
        if (!already) {
          G.pendingPurchases.push({
            player:          e.player,
            offerAmount:     e.offerResultAmount,
            expiresAfterRound: currentRnd + 1,  // scade dopo la giornata successiva
          });
        }
      }
      return false; // rimuovi dal pool
    }
    return true;
  });

  // Rimuovi offerte accettate scadute (non finalizzate entro la giornata)
  if (G.pendingPurchases) {
    const prevExpired = G.pendingPurchases.filter(pp => pp.expiresAfterRound < currentRnd);
    prevExpired.forEach(pp => {
      G.msgs.push('⌛ ' + pp.player.name + ' — ' + t('extra.transferExpired'));
    });
    G.pendingPurchases = G.pendingPurchases.filter(pp => pp.expiresAfterRound >= currentRnd);
  }

  // Rimpiazza con nuovi giocatori per mantenere ~16 disponibili
  _fillMarketPool(16);

  // Processa le offerte pendenti: risposta nella giornata successiva
  _processMarketOfferResponses();
}

// Meccanismo CPU per accettare offerte:
// La squadra accetta se l'offerta è ≥ 75% del valore del giocatore.
// Tra il 75% e il 100% del valore c'è una probabilità crescente (70% al 75%, 100% al 100%+).
// Questo simula una trattativa realistica: le grandi squadre sono più restie a vendere.
function _processMarketOfferResponses() {
  if (!G.marketPool) return;
  G.marketPool.forEach(entry => {
    if (!entry.pendingOffer) return;
    const p      = entry.player;
    const offer  = entry.pendingOffer.amount;
    // Per svincolati (value=0) usa il valore reale basato sull'OVR
    const realValue = (p.value && p.value > 0) ? p.value : Math.round((p.overall || 70) * rnd(5000, 8000));
    const minAcc = realValue * 0.75;
    const pct    = offer / realValue;

    let acceptProb;
    if (offer < minAcc) {
      acceptProb = 0;  // rifiuto immediato sotto il 75%
    } else if (pct >= 1.0) {
      acceptProb = 1.0; // accettazione certa sopra il 100%
    } else {
      // Tra 75% e 100%: probabilità lineare da 0.30 a 0.95
      acceptProb = 0.30 + (pct - 0.75) / 0.25 * 0.65;
    }

    const accepted = Math.random() < acceptProb;
    entry.offerResult       = accepted ? 'accepted' : 'rejected';
    entry.offerResultAmount = offer;
    entry.pendingOffer      = null; // sempre azzerata dopo la risposta

    if (accepted) {
      // Trova l'indice nell'array pendingPurchases dopo che verrà aggiunto
      // Il pulsante punta al tab Mercato dove appare la sezione "Offerte da finalizzare"
      const _btnStyle = 'display:inline-block;margin-left:8px;padding:3px 12px;font-size:11px;font-weight:800;border-radius:6px;background:linear-gradient(135deg,#0a6a2a,#055020);border:1.5px solid #2ecc71;color:#fff;cursor:pointer;vertical-align:middle';
      G.msgs.push(
        '✅ Offerta accettata! <strong>' + p._tname + '</strong> accetta ' +
        '<strong style="color:#2ecc71">' + formatMoney(offer) + '</strong> per <strong>' + p.name + '</strong>. ' +
        '<button onclick="showTab(&quot;market&quot;)" style="' + _btnStyle + '">Acquista ora</button>'
      );
    } else if (offer < minAcc) {
      G.msgs.push(`❌ Offerta rifiutata: ${p._tname} ha respinto ${formatMoney(offer)} per ${p.name} (troppo bassa).`);
    } else {
      G.msgs.push(`❌ Offerta rifiutata: ${p._tname} ha risposto di no a ${formatMoney(offer)} per ${p.name}.`);
    }
  });
}


// ── Acquisto da offerta accettata (pendingPurchases) ────────────────
function cancelPending(i) {
  if (!G.pendingPurchases || !G.pendingPurchases[i]) return;
  var p = G.pendingPurchases[i].player;
  G.msgs.push('❌ ' + t('market.offerRejected') + ' — ' + (p ? p.name : '?') + '.');
  G.pendingPurchases.splice(i, 1);
  autoSave();
  if (typeof renderMarket === 'function') renderMarket();
}

function buyFromPending(i) {
  if (!G.pendingPurchases || !G.pendingPurchases[i]) {
    G.msgs.push('❌ ' + t('market.offerRejected') + '.'); renderMarket(); return;
  }
  const pp    = G.pendingPurchases[i];
  const p     = pp.player;
  const price = pp.offerAmount;

  if (G.budget < price) {
    G.msgs.push('❌ ' + t('market.notEnoughBudget') + ' ' + p.name + ' (' + formatMoney(price) + ').');
    renderMarket(); return;
  }

  G.budget -= price;
  addLedger(t('finance.types.acquisto'), -price, 'Acquistato ' + p.name + ' da ' + p._tname, currentRound ? currentRound() : 0);

  // Aggiungi alla nostra rosa
  const np = { ...p };
  delete np._tid; delete np._tname;
  np.morale = Math.min(100, (np.morale || 70) + rnd(8, 15));
  G.rosters[G.myId].push(np);

  // Rimuovi dalla rosa avversaria
  if (p._tid && G.rosters[p._tid]) {
    G.rosters[p._tid] = G.rosters[p._tid].filter(pl => pl && pl.name !== p.name);
    _replenishRoster(p._tid);
  }

  // Rimuovi dal marketPool se presente
  if (G.marketPool) {
    G.marketPool = G.marketPool.filter(e => !e.player || e.player.name !== p.name);
  }

  // Rimuovi da pendingPurchases
  G.pendingPurchases.splice(i, 1);

  G.msgs.push('✅ Acquistato ' + p.name + ' da ' + (p._tname || '?') + ' per ' + formatMoney(price) + '. ' + t('morale.high') + '!');
  updateHeader(); autoSave();
  if (typeof renderMarket === 'function') renderMarket();
}
function generateTransferOffers() {
  if (!G.transferList || !G.transferList.length) return;

  const matchesPlayed = G.schedule.filter(m =>
    (m.home === G.myId || m.away === G.myId) && m.played
  ).length;

  G.transferList.forEach(entry => {
    const p = G.rosters[G.myId][entry.rosterIdx];
    if (!p) return;

    // Ogni giornata c'è ~40% di probabilità che arrivi un'offerta
    if (Math.random() > 0.40) return;

    const attract   = _playerAttractiveness(p, matchesPlayed);
    // Valore aggiornato del giocatore
    const realValue = _calcPlayerValue(p);
    // Range offerta: 75%–120% del valore reale, moltiplicato per l'appetibilità
    // Un giocatore in forma top (attract 1.3) può ricevere offerte fino al 156% del valore base
    // Un giocatore scarso (attract 0.4) riceve offerte attorno al 30–48% del valore base
    const offerMin  = realValue * 0.75 * attract;
    const offerMax  = realValue * 1.20 * attract;
    const offer     = Math.round((offerMin + Math.random() * (offerMax - offerMin)) / 1000) * 1000;

    // Scegli squadra offerente casuale (non la nostra)
    const buyers = G.teams.filter(tm => tm.id !== G.myId);
    const buyer  = pick(buyers);

    // Salva l'offerta nell'entry — sostituisce offerta precedente della stessa squadra
    if (!entry.offers) entry.offers = [];
    const existingIdx = entry.offers.findIndex(o => o.teamId === buyer.id);
    const offerObj = { teamId: buyer.id, teamName: buyer.name, amount: offer, round: currentRound() };
    if (existingIdx >= 0) {
      entry.offers[existingIdx] = offerObj; // aggiorna offerta esistente
    } else {
      entry.offers.push(offerObj);
    }

    const pct = Math.round((offer / entry.askingPrice) * 100);
    const vs  = offer >= entry.askingPrice
      ? `(${pct}% del prezzo richiesto ✓)`
      : `(${pct}% del prezzo richiesto)`;
    G.msgs.push(`💼 ${buyer.name} offre ${formatMoney(offer)} per ${p.name} ${vs}`);
    // Accumula per popup dedicato
    if (!G._pendingOfferPopups) G._pendingOfferPopups = [];
    G._pendingOfferPopups.push({
      buyerName: buyer.name,
      playerName: p.name,
      amount: offer,
      askingPrice: entry.askingPrice,
      pct: Math.round((offer / entry.askingPrice) * 100),
      meetsPrice: offer >= entry.askingPrice,
    });
  });
}

// ── Accetta un'offerta ────────────────────────
function acceptOffer(rosterIdx, offerIdx) {
  if (!G.transferList) return;
  const entry = G.transferList.find(e => e.rosterIdx === rosterIdx);
  if (!entry || !entry.offers || !entry.offers[offerIdx]) return;

  const offer = entry.offers[offerIdx];
  const p     = G.rosters[G.myId][rosterIdx];
  if (!p) return;

  // Incassa l'importo
  G.budget += offer.amount;
  addLedger(t('finance.types.vendita'), offer.amount, `Venduto ${p.name} a ${offer.teamName}`, currentRound());

  // Trasferisce il giocatore alla squadra acquirente
  const buyerRoster = G.rosters[offer.teamId];
  if (buyerRoster) {
    const sold = { ...p };
    delete sold._inTransfer;
    buyerRoster.push(sold);
  }

  // Rimuovi dalla rosa
  G.rosters[G.myId] = G.rosters[G.myId].filter((_, i) => i !== rosterIdx);

  // Rimuovi dalla lista trasferimenti
  G.transferList = G.transferList.filter(e => e.rosterIdx !== rosterIdx);

  // Aggiusta gli indici nella transferList se necessario
  G.transferList.forEach(e => { if (e.rosterIdx > rosterIdx) e.rosterIdx--; });

  G.msgs.push(`✅ ${p.name} ceduto a ${offer.teamName} per ${formatMoney(offer.amount)}!`);
  updateHeader(); autoSave();
  if (typeof renderMarket === 'function') renderMarket();
}

// ── Rifiuta un'offerta ────────────────────────
function rejectOffer(rosterIdx, offerIdx) {
  const entry = G.transferList && G.transferList.find(e => e.rosterIdx === rosterIdx);
  if (!entry || !entry.offers) return;
  const p     = G.rosters[G.myId][rosterIdx];
  const offer = entry.offers[offerIdx];
  if (offer) G.msgs.push(`❌ Offerta di ${offer.teamName} per ${p ? p.name : '—'} rifiutata.`);
  entry.offers.splice(offerIdx, 1);
  autoSave();
  if (typeof renderMarket === 'function') renderMarket();
}

// ── Morale: aggiornamenti post-partita ────────
// Chiamata da endMatch() dopo ogni gara
function updateMoraleAfterMatch(ms) {
  const won      = ms.myScore > ms.oppScore;
  const drew     = ms.myScore === ms.oppScore;
  const diffGoal = ms.myScore - ms.oppScore; // positivo = vincendo
  const roster   = G.rosters[G.myId];

  // Calcola quanti gol ha segnato ogni giocatore in questa partita
  const matchGoals   = ms.matchGoals   || {};
  const matchAssists = ms.matchAssists || {};

  roster.forEach((p, i) => {
    let delta = 0;
    const wasOnField   = ms.onField && Object.values(ms.onField).includes(i);
    const wasConvocato = ms.shirtNumbers && (i in ms.shirtNumbers);

    // ── Risultato della partita ──
    if (won) {
      delta += rnd(3, 6);
      if (diffGoal >= 4) delta += 2; // vittoria larga: bonus extra
    } else if (drew) {
      delta += rnd(0, 2);
    } else {
      delta -= rnd(3, 6);
      if (diffGoal <= -4) delta -= 2; // sconfitta pesante: malus extra
    }

    // ── Contributo personale ──
    const goalsThisMatch = matchGoals[i] || 0;
    if (goalsThisMatch >= 3)      delta += rnd(5, 8);  // hat-trick
    else if (goalsThisMatch >= 2) delta += rnd(3, 5);
    else if (goalsThisMatch >= 1) delta += rnd(2, 3);

    const assistsThisMatch = matchAssists[i] || 0;
    if (assistsThisMatch >= 2) delta += rnd(2, 3);
    else if (assistsThisMatch >= 1) delta += 1;

    // ── Partecipazione ──
    if (wasOnField) {
      delta += 1; // in campo: bonus base
    } else if (wasConvocato) {
      delta -= 1; // in panchina: leggero malus (frustrazione)
    } else {
      delta -= rnd(2, 3); // non convocato: morale cala di più
    }

    // ── Infortunio ──
    if (ms.injuries && ms.injuries.includes(i)) delta -= rnd(3, 6);

    // ── Voto personale ──
    const rating = (p.lastRatings && p.lastRatings.length)
      ? p.lastRatings[p.lastRatings.length - 1] : null;
    if (rating !== null && rating !== undefined) {
      if (rating >= 8.0)      delta += 3;
      else if (rating >= 7.0) delta += 1;
      else if (rating <= 5.0) delta -= 2;
      else if (rating <= 4.0) delta -= 4;
    }

    p.morale = Math.min(100, Math.max(0, p.morale + delta));
  });

  // ── Notifiche morale critico (<30) ──
  const collassi = roster.filter(p => p && p.morale < 30 && !p.injured);
  if (collassi.length > 0) {
    G.msgs.push(t('morale.critical', {name: collassi.map(p => p.name).join(', ')}));
  }
}

// generateTransferOffers è già chiamata dentro simNextRound — nessun wrapper necessario

// ═══════════════════════════════════════════════════════
// CALCOLO INGAGGIO RINNOVO
// ═══════════════════════════════════════════════════════
// Formula: base OVR × 300 + bonus età + bonus prestazioni
// ═══════════════════════════════════════════════════════
// VALORE GIOCATORE — funzione centralizzata
// Parametri: età, potenziale, OVR, morale, forma, presenze/gol/assist, infortuni
// ═══════════════════════════════════════════════════════
function _calcPlayerValue(p) {
  if (!p) return 0;
  const ovr  = p.overall   || 70;
  const pot  = p.potential || ovr;
  const age  = p.age       || 25;
  const fit  = Math.min(100, p.fitness || 70);
  const mor  = Math.min(100, p.morale  || 70);

  // ── Base esponenziale — pivot OVR70 = 300k ────────────
  // Curva: ((ovr-40)/30)^2.2 * 300k
  // OVR50=55k, OVR60=140k, OVR70=300k, OVR80=530k, OVR90=840k, OVR95=1050k
  const expBase = Math.pow(Math.max(0, ovr - 40) / 30, 2.2) * 300000;
  let base = Math.max(20000, expBase);

  // ── Età + Potenziale ──────────────────────────────────
  const growthMargin = Math.max(0, pot - ovr);
  if (age <= 20)       base *= 1.40 + growthMargin * 0.012;
  else if (age <= 23)  base *= 1.25 + growthMargin * 0.008;
  else if (age <= 27)  base *= 1.10 + growthMargin * 0.004;
  else if (age <= 30)  base *= 1.00;
  else if (age <= 33)  base *= 0.80 - (age - 30) * 0.04;
  else                 base *= 0.50;

  // ── Forma ─────────────────────────────────────────────
  base *= 0.80 + (fit / 100) * 0.20;  // 0.80–1.00

  // ── Morale ────────────────────────────────────────────
  base *= 0.92 + (mor / 100) * 0.08;  // 0.92–1.00

  // ── Presenze + gol + assist ───────────────────────────
  const apps    = (p.lastRatings || []).filter(r => r !== null).length;
  const contrib = (p.goals || 0) + (p.assists || 0);
  if (apps >= 20)        base *= 1.10;
  else if (apps >= 10)   base *= 1.05;
  if (contrib >= 25)     base *= 1.12;
  else if (contrib >= 15) base *= 1.08;
  else if (contrib >= 8)  base *= 1.04;

  // ── Infortuni ─────────────────────────────────────────
  if (p.injured)                    base *= 0.80;
  else if ((p.injProb||0.04)>0.12)  base *= 0.88;

  // ── Nazionali ─────────────────────────────────────────
  if (p._national) base *= 1.08;

  return Math.round(Math.max(20000, base) / 1000) * 1000;
}

// Aggiorna il valore di tutti i giocatori di tutte le squadre
function _refreshAllPlayerValues(opts) {
  opts = opts || {};
  G.teams.forEach(function(team) {
    var isChamp    = opts.champion   === team.id;
    var isRelegated= opts.relegated  === team.id;
    var roster = G.rosters[team.id] || [];
    roster.forEach(function(p) {
      if (!p) return;
      p.value = _calcPlayerValue(p);
      if (isChamp)     p.value = Math.round(p.value * 1.10);
      if (isRelegated) p.value = Math.round(p.value * 0.90);
    });
  });
}

function _calcRenewalSalary(p) {
  if (!p) return 0;
  // Ingaggio = 10% del valore attuale
  const currentValue = _calcPlayerValue(p);
  const salary = Math.round(currentValue * 0.10 / 1000) * 1000;
  return Math.max(10000, salary);
}

// ═══════════════════════════════════════════════════════
// RINNOVO CONTRATTO
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// PROPOSTA DI RINNOVO (asincrona — risposta alla prossima giornata)
// ═══════════════════════════════════════════════════════
// ── Rinnovo con bonus firma (chiamato dal popup di conferma) ────────
function renewContractWithBonus(rosterIdx, years) {
  const p = (G.rosters[G.myId] || [])[rosterIdx];
  if (!p) return;

  const newSalary = _calcRenewalSalary(p);
  const total     = newSalary * years;
  const bonus     = Math.round(total * 0.10);

  if (G.budget < bonus) {
    alert('Budget insufficiente per pagare il bonus firma di ' + formatMoney(bonus));
    return;
  }

  // Detrai bonus subito
  G.budget -= bonus;
  addLedger(t('extra.wage'), -bonus, 'Bonus firma ' + p.name + ' (' + years + ' ann' + (years===1?'o':'i') + ')', typeof currentRound === 'function' ? currentRound() : 0);

  // Segna proposta pendente
  p._renewalPending = { years: years, salary: newSalary, bonus: bonus, round: typeof currentRound === 'function' ? currentRound() : 0 };
  p._justRenewed = false;  // non nascondere SCAD — verrà mostrato 📨 da _scadBadge
  G.msgs.push(t('contracts.renewProposal', {name: p.name}) + ' — ' + years + ' ' + (years===1?t('common.year'):t('common.years')) + ' · ' + formatMoney(newSalary) + '/a · ' + t('extra.wage') + ' ' + formatMoney(bonus) + '. ' + t('extra.willReplyNext'));

  // Chiudi popup conferma e modal giocatore
  const cp = document.getElementById('renewal-confirm-popup');
  if (cp) cp.remove();
  const mp = document.getElementById('player-modal-' + rosterIdx);
  if (mp) mp.remove();

  updateHeader(); autoSave(); renderRosa();
}

function renewContract(rosterIdx, years, popupEl) {
  const p = (G.rosters[G.myId] || [])[rosterIdx];
  if (!p) return;

  if (p._renewalPending) {
    G.msgs.push('⏳ Hai già inviato una proposta a ' + p.name + '. Attendi la risposta.');
    if (popupEl) popupEl.remove();
    renderRosa(); return;
  }

  const newSalary = _calcRenewalSalary(p);
  // Segna proposta pendente — nessun confirm(), risposta alla giornata successiva
  p._justRenewed = false;  // non nascondere SCAD — verrà mostrato 📨 da _scadBadge
  p._renewalPending = { years: years, salary: newSalary, round: typeof currentRound === 'function' ? currentRound() : 0 };
  G.msgs.push(t('contracts.renewProposal', {name: p.name}) + ' — ' + years + ' ' + (years===1?t('common.year'):t('common.years')) + ' · ' + formatMoney(newSalary) + '/a. ' + t('extra.willReplyNext'));

  if (popupEl) popupEl.remove();
  updateHeader(); autoSave(); renderRosa();
}

// ── Calcola probabilità che il giocatore accetti la proposta ──────────
// Fattori: morale, presenze, ambizione vs tier club, storico nel club
function _calcRenewalAcceptProb(p) {
  let prob = 0.60; // base 60%

  // Morale alto → più propenso a restare
  const morale = p.morale || 70;
  prob += (morale - 70) / 100 * 0.20; // +20% se morale=100, -14% se morale=0

  // Presenze nel club (careerApps): fedeltà
  const apps = p.careerApps || 0;
  if (apps >= 3)      prob += 0.15; // veterano storico
  else if (apps >= 2) prob += 0.08;

  // Ambizione vs tier club: alta ambizione + club di fascia bassa → vuole andarsene
  const ambition = p.ambition !== undefined ? p.ambition : 50;
  const tier      = G.myTeam.tier || 'B';
  const tierScore = { S: 100, A: 75, B: 45, C: 20 }[tier] || 50;
  // Gap ambizione/tier: se ambizione > tier, il giocatore ambisce a più
  const ambGap = (ambition - tierScore) / 100;
  prob -= ambGap * 0.30; // fino a -30% se molto ambizioso in club basso

  // Ultimi voti: se ha giocato poco (voti null) → frustrato
  const ratings = (p.lastRatings || []).filter(r => r !== null);
  if (ratings.length === 0) prob -= 0.10; // non ha giocato = vuole più spazio
  else if (ratings.length >= 3) prob += 0.08; // usato spesso → felice

  // Età: over 32 più propensi a restare (sicurezza)
  if ((p.age || 25) >= 32) prob += 0.12;

  // Forma molto bassa → più dipendente dal club
  if ((p.fitness || 80) < 60) prob += 0.08;

  return Math.max(0.05, Math.min(0.95, prob));
}

// ── Processa risposte ai rinnovi a inizio giornata ─────────────────
function _processRenewalResponses() {
  const roster = G.rosters[G.myId] || [];
  roster.forEach((p, idx) => {
    if (!p || !p._renewalPending) return;
    const offer = p._renewalPending;

    const prob     = _calcRenewalAcceptProb(p);
    const accepted = Math.random() < prob;

    if (accepted) {
      p.contractYears    = offer.years;
      p.salary           = offer.salary;
      p._renewalPending  = null;
      p._justRenewed     = true;  // evita badge scadenza finché non passa una stagione
      const tierLabels   = { S:'Elite', A:'Alta', B:'Media', C:'Bassa' };
      G.msgs.push(t('contracts.renewAccepted', {name: p.name, years: offer.years, yrLabel: offer.years===1?t('common.year'):t('common.years'), salary: formatMoney(offer.salary)}));
      // renewal accepted
    } else {
      p._renewalPending = null;
      p._justRenewed = false;  // ripristina badge SCAD dopo il rifiuto
      // Motivo principale del rifiuto
      const ambition   = p.ambition !== undefined ? p.ambition : 50;
      const tierScore  = { S: 100, A: 75, B: 45, C: 20 }[G.myTeam.tier || 'B'] || 50;
      let reason = '';
      if (ambition > tierScore + 20) reason = 'cerca un club di fascia superiore';
      else if ((p.morale || 70) < 50) reason = t('extra.moraleTooLow');
      else if ((p.lastRatings||[]).filter(r=>r!==null).length === 0) reason = t('extra.wantsMoreTime');
      else reason = 'ha deciso di non rinnovare';
      G.msgs.push(t('contracts.renewRejected', {name: p.name}));
      // Marca come non rinnovato (verrà liberato da _decrementContracts)
    }
  });
}

// ═══════════════════════════════════════════════════════
// RESCISSIONE CONTRATTO
// ═══════════════════════════════════════════════════════
function rescindContract(rosterIdx) {
  const roster = G.rosters[G.myId];
  const p = roster[rosterIdx];
  if (!p) return;
  const contractLeft = Math.max(1, p.contractYears || 1);
  const penalty      = Math.round((p.salary || 0) * contractLeft * 0.5);
  if (G.budget < penalty) {
    alert('Budget insufficiente per pagare la penale di ' + formatMoney(penalty));
    return;
  }
  G.budget -= penalty;
  addLedger(t('extra.rescindContract'), -penalty, 'Rescissione ' + p.name, currentRound ? currentRound() : 0);
  // Mette il giocatore sul mercato a costo zero
  const fp = { ...p, value: 0, _fromRescission: true };
  delete fp._tid; delete fp._tname;
  if (!G.marketPool) G.marketPool = [];
  G.marketPool.push({
    player:       fp,
    daysLeft:     4,
    pendingOffer: null,
    offerResult:  null,
  });
  // Rimuove dalla rosa
  roster.splice(rosterIdx, 1);
  G.msgs.push('✂️ Contratto di ' + p.name + ' rescisso. Penale: ' + formatMoney(penalty) + '. ' + t('extra.freeAgent'));
  updateHeader(); autoSave();
}

// ═══════════════════════════════════════════════════════
// DECREMENTO CONTRATTI A INIZIO STAGIONE
// (chiamato in startNewSeason prima dei ritiri)
// ═══════════════════════════════════════════════════════
function _decrementContracts() {
  (G.rosters[G.myId] || []).forEach(p => {
    if (!p) return;
    if (p.contractYears !== undefined && p.contractYears > 0) {
      p.contractYears--;
      if (p.contractYears === 0) {
        G.msgs.push('📋 ' + t('roster.expiring') + ': ' + p.name + ' — ' + t('extra.freeAgent'));
        // Mette il giocatore sul mercato a costo zero
        const fp = { ...p, value: 0, _fromExpiry: true };
        delete fp._tid; delete fp._tname;
        if (!G.marketPool) G.marketPool = [];
        G.marketPool.push({ player: fp, daysLeft: 6, pendingOffer: null, offerResult: null });
        // Rimuove dalla rosa (marca per pulizia)
        p._expired = true;
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
// RINNOVI CONTRATTUALI CPU (squadre avversarie)
// ═══════════════════════════════════════════════════════
function _cpuContractRenewals() {
  G.teams.forEach(team => {
    if (team.id === G.myId) return;
    const roster = G.rosters[team.id];
    if (!roster) return;
    // Calcola soglia stipendio 90° percentile per questa rosa
    const salaries = roster.filter(p => p && p.salary).map(p => p.salary).sort((a,b) => a-b);
    const p90idx   = Math.floor(salaries.length * 0.9);
    const sal90    = salaries[p90idx] || Infinity;
    for (let i = roster.length - 1; i >= 0; i--) {
      const p = roster[i];
      if (!p) continue;
      if (p.contractYears !== undefined) p.contractYears--;
      if (p.contractYears <= 0) {
        // Rinnova al 90% salvo età>30 o ingaggio nel top 10%
        const overAge = (p.age || 25) > 30;
        const topSal  = (p.salary || 0) >= sal90;
        const prob    = (overAge || topSal) ? 0.50 : 0.90;
        if (Math.random() < prob) {
          p.contractYears = 2 + Math.floor(Math.random() * 3);
        } else {
          const fp = { ...p, value: 0, _fromExpiry: true, _tid: null, _tname: 'Svincolato' };
          if (!G.marketPool) G.marketPool = [];
          G.marketPool.push({ player: fp, daysLeft: 8, pendingOffer: null, offerResult: null });
          roster.splice(i, 1);
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
// ACQUISTI SIMULATI CPU (rose avversarie sotto-organico)
// ═══════════════════════════════════════════════════════
function _cpuMarketActivity() {
  const MIN_ROSTER = 13;
  G.teams.forEach(team => {
    if (team.id === G.myId) return;
    const roster = G.rosters[team.id];
    if (!roster) return;
    const avail   = roster.filter(p => p && !p.injured);
    const needed  = MIN_ROSTER - avail.length;
    if (needed <= 0) return;
    // Budget CPU simulato: ogni squadra ha un budget implicito
    // basato sulla tier. Genera direttamente senza spesa reale
    const roleCounts = { POR:0, DIF:0, CEN:0, ATT:0, CB:0 };
    avail.forEach(p => { if (p.role) roleCounts[p.role] = (roleCounts[p.role]||0) + 1; });
    // Acquista i ruoli più carenti
    const rolesByNeed = Object.entries(roleCounts).sort((a,b) => a[1]-b[1]).map(e => e[0]);
    for (let i = 0; i < needed && i < 2; i++) { // max 2 acquisti per giornata
      const role = rolesByNeed[i % rolesByNeed.length];
      if (typeof generatePlayer === 'function') {
        const np = generatePlayer(team.str, role);
        roster.push(np);
      }
    }
    if (needed > 0) G.msgs.push('🛒 ' + team.name + ' ' + t('market.available').toLowerCase() + ': +' + Math.min(needed,2));
  });
}

// ═══════════════════════════════════════════════════════
// POPUP GIOVANI DI CATEGORIA (chiamato in startNewSeason)
// ═══════════════════════════════════════════════════════
function _showYouthPopup() {
  // Genera 4 giovani dalla categoria giovanile
  // Almeno 1 su 4 ha SEMPRE probabilità aumentata di essere un diamante grezzo
  // Gli altri seguono la logica normale (5% random)
  const youth = [];
  const roles  = ['POR','DIF','DIF','CEN','CEN','ATT','ATT','CB'];

  for (let i = 0; i < 4; i++) {
    const role = roles[Math.floor(Math.random() * roles.length)];
    let p;

    if (i === 0) {
      // Primo slot: 35% di probabilità di essere un diamante grezzo garantito
      // (molto più alta della normale 5%)
      if (Math.random() < 0.35) {
        const dOvr = 52 + Math.floor(Math.random() * 17);  // OVR 52-68
        const dPot = 82 + Math.floor(Math.random() * 15);  // POT 82-96
        const dAge = 17 + Math.floor(Math.random() * 4);   // 17-20 anni
        p = typeof generatePlayer === 'function' ? generatePlayer(dOvr, role) : null;
        if (p) {
          p.age       = dAge;
          p.overall   = dOvr;
          p.potential = dPot;
          p._diamond  = true;
        }
      }
    }

    // Generazione standard se non è stato generato un diamante
    if (!p) {
      const ovr = 55 + Math.floor(Math.random() * 20); // 55-74
      const age = 18 + Math.floor(Math.random() * 5);
      p = typeof generatePlayer === 'function' ? generatePlayer(ovr, role) : null;
      if (p) { p.age = age; p.overall = ovr; }
    }

    if (!p) continue;
    // Ricalcola valore e ingaggio con la nuova formula
    if (typeof _calcPlayerValue === 'function') {
      p.value  = _calcPlayerValue(p);
      p.salary = Math.round(Math.max(10000, p.value * 0.10) / 1000) * 1000;
    } else {
      p.value  = Math.round(p.overall * 6000);
      p.salary = Math.round(p.overall * 150);
    }
    p._fromYouth = true;
    youth.push(p);
  }
  if (!youth.length) return;

  const ov = document.createElement('div');
  ov.id = 'youth-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(8px)';

  function _youthCard(p, idx) {
    const roleColors = { POR:'#cc2222', DIF:'#1a6a3a', CEN:'#8b4a00', ATT:'#8b0000', CB:'#1a3a8b' };
    const rc = roleColors[p.role] || '#333';
    const isDiamond = !!p._diamond;
    const attrBar = (val, lbl) =>
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
      '<span style="font-size:10px;color:var(--muted);width:28px">' + lbl + '</span>' +
      '<div style="flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden">' +
      '<div style="width:' + val + '%;height:100%;background:' + (isDiamond?'var(--gold)':'var(--blue)') + ';border-radius:2px"></div></div>' +
      '<span style="font-size:10px;width:22px">' + val + '</span></div>';

    const diamondBadge = isDiamond
      ? '<div style="margin-bottom:8px;background:linear-gradient(135deg,rgba(240,192,64,.15),rgba(240,192,64,.05));' +
        'border:1px solid rgba(240,192,64,.4);border-radius:8px;padding:6px 10px;font-size:11px;color:var(--gold)">' +
        '💎 <strong>Diamante Grezzo</strong> — Talento nascosto con alto potenziale di crescita</div>'
      : '';

    const borderCol = isDiamond ? 'rgba(240,192,64,.6)' : 'var(--border)';
    const bgGrad    = isDiamond
      ? 'background:linear-gradient(135deg,var(--panel) 0%,rgba(240,192,64,.06) 100%);'
      : 'background:var(--panel);';

    return '<div id="yc-' + idx + '" style="' + bgGrad + 'border:2px solid ' + borderCol + ';border-radius:12px;padding:14px;cursor:pointer;transition:border-color .15s" ' +
      'onclick="toggleYouthSelect(' + idx + ')">' +
      diamondBadge +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="background:' + rc + ';color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px">' + p.role + '</span>' +
      '<div>' +
      '<div style="font-weight:700;font-size:13px">' + p.name + (isDiamond ? ' 💎' : '') + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">' + p.age + ' anni · ' + p.nat + ' · ' + (p.hand==='AMB'?'Ambidestro':p.hand==='L'?'Mancino':'Destro') + '</div>' +
      '</div>' +
      '<div style="margin-left:auto;text-align:right">' +
      '<div style="font-size:18px;font-weight:800;color:' + (isDiamond?'var(--gold)':'var(--blue)') + '">' + p.overall + '</div>' +
      '<div style="font-size:10px;color:var(--muted)">OVR</div>' +
      '</div></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px">' +
      '<span style="color:var(--muted)">Potenziale:</span>' +
      '<span style="font-weight:800;color:' + (isDiamond?'var(--gold)':'var(--blue)') + ';font-size:14px">' + (p.potential||'?') + '</span>' +
      (isDiamond ? '<span style="font-size:10px;color:var(--gold);opacity:.8">(↑ alto)</span>' : '') +
      '</div>' +
      attrBar(p.stats.att,'ATT') + attrBar(p.stats.def,'DIF') +
      attrBar(p.stats.spe,'VEL') + attrBar(p.stats.str,'FOR') +
      attrBar(p.stats.tec,'TEC') + attrBar(p.stats.res,'RES') +
      '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px">' +
      '<span style="color:var(--muted)">Valore: <strong>' + formatMoney(p.value) + '</strong></span>' +
      '<span style="color:var(--green)">Ingaggio: <strong>' + formatMoney(p.salary) + '/anno</strong></span>' +
      '<span style="color:var(--gold);font-weight:700">GRATIS</span>' +
      '</div>' +
      '</div>';
  }

  const selected = new Set();
  window._youthPlayers = youth;
  window._youthSelected = selected;

  window.toggleYouthSelect = function(idx) {
    const el = document.getElementById('yc-' + idx);
    if (selected.has(idx)) {
      selected.delete(idx);
      el.style.borderColor = 'var(--border)';
    } else {
      if (selected.size >= 2) { alert('Puoi selezionare al massimo 2 giovani.'); return; }
      selected.add(idx);
      el.style.borderColor = 'var(--green)';
    }
    document.getElementById('youth-confirm-btn').disabled = selected.size === 0;
  };

  window.confirmYouthSignings = function() {
    selected.forEach(idx => {
      const p = youth[idx];
      const np = { ...p }; delete np._fromYouth;
      G.rosters[G.myId].push(np);
      addLedger(t('extra.youthWage'), 0, t('extra.youthWage') + ' ' + np.name, 0);
      G.msgs.push('🛒 🌟 ' + np.name + ' (' + np.role + ', ' + np.age + 'a, OVR ' + np.overall + ') ' + t('extra.youthWage') + ': ' + formatMoney(np.salary) + '/a');
    });
    document.getElementById('youth-popup').remove();
    delete window._youthPlayers; delete window._youthSelected; delete window.toggleYouthSelect; delete window.confirmYouthSignings;
    autoSave(); renderDash();
  };

  ov.innerHTML =
    '<div style="background:var(--panel);border:2px solid var(--blue);border-radius:16px;padding:22px;max-width:900px;width:96%;max-height:90vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
    '<div style="font-size:17px;font-weight:800;color:var(--blue)">🌟 Scouting Giovanile — Scegli fino a 2 talenti</div>' +
    '<button onclick="document.getElementById(\'youth-popup\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted)">✕</button>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Clicca per selezionare (max 2). Costo acquisto: <strong style="color:var(--gold)">ZERO</strong> — paghi solo l\'ingaggio.</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
    youth.map((p, i) => _youthCard(p, i)).join('') +
    '</div>' +
    // Lista rosa attuale
    '<div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px">' +
    '<div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Rosa attuale (' + (G.rosters[G.myId]||[]).length + ' giocatori)</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;max-height:160px;overflow-y:auto">' +
    (G.rosters[G.myId]||[]).map(function(p) {
      if (!p) return '';
      const rc = {POR:'#cc2222',DIF:'#1a6a3a',CEN:'#8b4a00',ATT:'#8b0000',CB:'#1a3a8b'}[p.role]||'#333';
      const rit = (p.retirementAge !== undefined && (p.age+1) >= p.retirementAge)
        ? '<span style="font-size:9px;background:#c0392b;color:#fff;padding:1px 3px;border-radius:3px;margin-left:3px">RIT</span>' : '';
      return '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--panel2);border-radius:6px;font-size:11px">' +
        '<span style="background:'+rc+';color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px">'+p.role+'</span>' +
        '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.name+rit+'</span>' +
        '<span style="color:var(--blue);font-weight:700">'+p.overall+'</span>' +
        '<span style="color:var(--muted)">'+p.age+'a</span>' +
        '</div>';
    }).join('') +
    '</div></div>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end">' +
    '<button id="youth-confirm-btn" disabled onclick="confirmYouthSignings()" ' +
    'style="padding:11px 28px;font-size:13px;font-weight:800;border-radius:8px;border:2px solid var(--green);background:linear-gradient(135deg,#0a6a2a,#055020);color:#fff;cursor:pointer;opacity:.5" ' +
    'onmouseover="if(!this.disabled)this.style.opacity=\'1\'" onmouseout="if(!this.disabled)this.style.opacity=\'1\'">Conferma ingaggi</button>' +
    '<button onclick="document.getElementById(\'youth-popup\').remove()" ' +
    'style="padding:11px 18px;font-size:13px;font-weight:700;border-radius:8px;border:2px solid var(--border);background:var(--panel2);color:var(--muted);cursor:pointer">Salta</button>' +
    '</div></div>';

  // Abilita il pulsante quando si seleziona almeno 1
  const origToggle = window.toggleYouthSelect;
  window.toggleYouthSelect = function(idx) {
    origToggle(idx);
    const btn = document.getElementById('youth-confirm-btn');
    if (btn) { btn.disabled = selected.size === 0; btn.style.opacity = selected.size > 0 ? '1' : '.5'; }
  };

  document.body.appendChild(ov);
}

// ═══════════════════════════════════════════════════════
// SISTEMA NAZIONALI
// ═══════════════════════════════════════════════════════

const NATIONAL_ROUNDS = [5, 10, 17, 23]; // giornate con convocazioni

// Slot nazionali ITA: { role, count }
const ITA_NATIONAL_SLOTS = [
  { role: 'POR', count: 2 },
  { role: 'DIF', count: 4 },
  { role: 'CEN', count: 3 },
  { role: 'ATT', count: 4 },
  { role: 'CB',  count: 3 },
];

// Score convocazione: bilancia OVR, media voto, presenze, gol, assist
function _nationalScore(p) {
  const ovr       = p.overall || 50;
  const apps      = p.careerApps || 0;
  const goals     = p.goals || 0;
  const assists   = p.assists || 0;
  const ratings   = (p.lastRatings || []).filter(r => r !== null);
  const avgRating = ratings.length > 0 ? ratings.reduce((s,r) => s+r, 0) / ratings.length : 6.0;
  // Formula: OVR pesa 50%, media voto 25%, contributi 15%, presenze 10%
  return ovr * 0.50
       + (avgRating - 6.0) * 10 * 0.25   // normalizzato 0-40 → 0-10
       + Math.min(apps, 20) * 0.5 * 0.10
       + Math.min(goals + assists * 0.7, 30) * 0.30 * 0.15;
}

// Resetta convocazioni precedenti
function _activateNationalCalls() {
  // Resetta i flag _national della giornata precedente
  // e promuove _nationalNext (badge anticipato) a _national (indisponibile)
  Object.values(G.rosters).forEach(roster => {
    (roster || []).forEach(p => {
      if (!p) return;
      p._national     = p._nationalNext || false;
      p._nationalNext = false;
    });
  });
}

function _clearNationalCalls() {
  Object.values(G.rosters).forEach(roster => {
    (roster || []).forEach(p => {
      if (p) {
        p._national     = false;
        p._nationalNext = false;
        p._nationalNat  = undefined;
      }
    });
  });
}

// Seleziona i migliori giocatori per la nazionale
function _processNationalCalls(round) {
  if (!NATIONAL_ROUNDS.includes(round)) return;

  const allPlayers = []; // { p, teamId, rosterIdx }
  Object.entries(G.rosters).forEach(([teamId, roster]) => {
    (roster || []).forEach((p, idx) => {
      if (p && !p.injured) allPlayers.push({ p, teamId, rosterIdx: idx });
    });
  });

  const myCalledNames = [];

  // ── 1. Nazionale ITA — selezione per ruolo ──
  ITA_NATIONAL_SLOTS.forEach(({ role, count }) => {
    const pool = allPlayers
      .filter(({ p }) => p.nat === 'ITA' && p.role === role)
      .sort((a, b) => _nationalScore(b.p) - _nationalScore(a.p))
      .slice(0, count);
    pool.forEach(({ p, teamId }) => {
      p._nationalNext = true;   // badge anticipato — diventa _national all'inizio della giornata
      p._nationalNat  = 'ITA';
      p.nationalCaps  = (p.nationalCaps || 0) + 1;
      // Bonus convocazione: +5% valore, +15% morale (fino al massimo)
      if (p.value)  p.value  = Math.round(p.value  * 1.05);
      if (p.morale !== undefined) p.morale = Math.min(100, Math.round((p.morale || 70) * 1.15));
      if (teamId === G.myId) myCalledNames.push({ name: p.name, role: p.role, nat: 'ITA', ita: true });
    });
  });

  // ── 2. Altre nazionalità — miglior 1 per nazione ──
  const otherNats = ['CRO','SRB','HUN','GRE','MNE','ESP'];
  otherNats.forEach(nat => {
    const best = allPlayers
      .filter(({ p }) => p.nat === nat && !p._national)
      .sort((a, b) => _nationalScore(b.p) - _nationalScore(a.p))[0];
    if (best) {
      best.p._nationalNext = true;
      best.p._nationalNat  = nat;
      best.p.nationalCaps  = (best.p.nationalCaps || 0) + 1;
      // Bonus convocazione: +5% valore, +15% morale (fino al massimo)
      if (best.p.value)  best.p.value  = Math.round(best.p.value  * 1.05);
      if (best.p.morale !== undefined) best.p.morale = Math.min(100, Math.round((best.p.morale || 70) * 1.15));
      if (best.teamId === G.myId) myCalledNames.push({ name: best.p.name, role: best.p.role, nat, ita: false });
    }
  });

  // ── 3. Notizie e popup ──
  if (myCalledNames.length > 0) {
    myCalledNames.forEach(({ name, role, nat, ita }) => {
      const flag = _natFlag(nat);
      const tagTxt = ita
        ? `🏊 ${name} (${role}) convocato in Nazionale Italiana ${flag}! Sarà indisponibile questa giornata.`
        : `🏊 ${name} convocato dalla Nazionale ${nat} ${flag}! Sarà indisponibile questa giornata.`;
      G.msgs.push(tagTxt);
    });
    // Popup celebrativo (mostrato dopo renderDash)
    G._pendingNationalPopup = myCalledNames;
  }
}

const _NAT_FLAGS = { ITA:'🇮🇹', CRO:'🇭🇷', SRB:'🇷🇸', HUN:'🇭🇺', GRE:'🇬🇷', MNE:'🇲🇪', ESP:'🇪🇸' };
function _natFlag(nat) { return _NAT_FLAGS[nat] || '🏳'; }

// Popup celebrativo convocazione nazionale
function _showNationalPopup(called) {
  const ov = document.createElement('div');
  ov.id = 'national-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(30,30,50,.88);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(6px);overflow:hidden';

  const itaPlayers = called.filter(c => c.ita);
  const othPlayers = called.filter(c => !c.ita);

  const makeRow = (c) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.06);border-radius:8px;margin-bottom:6px">
      <span style="font-size:22px">${_natFlag(c.nat)}</span>
      <div>
        <div style="font-weight:700;font-size:14px">${c.name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.55)">${c.role} · ${c.nat}</div>
      </div>
      ${c.ita ? '<span style="margin-left:auto;font-size:10px;font-weight:700;background:#1565c0;color:#fff;padding:2px 7px;border-radius:4px;letter-spacing:.5px">NAZIONALE ITA</span>' : '<span style="margin-left:auto;font-size:10px;font-weight:700;background:#1565c0;color:#fff;padding:2px 7px;border-radius:4px">NAZ ' + _natFlag(c.nat) + '</span>'}
    </div>`;

  ov.innerHTML = `
    <canvas id="national-confetti" style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1"></canvas>
    <div style="background:var(--panel);border:1px solid rgba(0,194,255,.3);border-radius:16px;padding:24px;max-width:400px;width:92%;max-height:85vh;overflow-y:auto;position:relative;z-index:2">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:40px;margin-bottom:6px">🤽</div>
        <div style="font-weight:800;font-size:18px;color:var(--blue)">${t('national.callup')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5">${t('national.callupDesc').replace('\n','<br>')}</div>
      </div>
      ${itaPlayers.length ? `<div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${t('national.italiana')}</div>${itaPlayers.map(makeRow).join('')}` : ''}
      ${othPlayers.length ? `<div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">${t('national.others')}</div>${othPlayers.map(makeRow).join('')}` : ''}
      <button onclick="document.getElementById('national-popup').remove()" style="width:100%;margin-top:18px;padding:10px;background:var(--blue);border:none;border-radius:8px;color:#fff;font-weight:700;font-size:14px;cursor:pointer">
        Ottimo! 💪
      </button>
    </div>`;

  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };

  // Coriandoli a tutto schermo
  setTimeout(() => {
    const canvas = document.getElementById('national-confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const colors = ['#1565c0','#fdd835','#e53935','#2ecc71','#00c2ff','#ff6b35','#a855f7'];
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      vx: (Math.random()-0.5) * 3,
      vy: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 6 + Math.random() * 8, h: 3 + Math.random() * 4,
      rot: Math.random() * 360, vr: (Math.random()-0.5) * 10,
    }));
    function drawConfetti() {
      if (!document.getElementById('national-confetti')) { window.removeEventListener('resize', resize); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y < canvas.height + 20) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if (alive) requestAnimationFrame(drawConfetti);
    }
    drawConfetti();
  }, 100);
}

// ═══════════════════════════════════════════════════════
// POPUP OFFERTE DI MERCATO
// ═══════════════════════════════════════════════════════

function _showOfferPopupQueue(offers, idx) {
  if (!offers || idx >= offers.length) return;
  const o = offers[idx];
  const isGood = o.meetsPrice;

  const ov = document.createElement('div');
  ov.id = 'offer-popup-' + idx;
  ov.style.cssText = [
    'position:fixed;inset:0;background:rgba(20,24,40,.80)',
    'display:flex;align-items:center;justify-content:center',
    'z-index:9998;backdrop-filter:blur(3px)',
    'animation:offerOverlayIn .2s ease-out',
  ].join(';');

  const pctColor = isGood ? '#2ecc71' : o.pct >= 80 ? '#f0c040' : 'var(--muted)';
  const pctIcon  = isGood ? '✅' : o.pct >= 80 ? '⚠️' : '💼';

  ov.innerHTML = `
    <div id="offer-card-${idx}" style="
      background:var(--panel);
      border:1px solid ${isGood ? 'rgba(46,204,113,.4)' : 'rgba(255,255,255,.1)'};
      border-radius:16px;padding:24px 28px;
      max-width:360px;width:92%;
      text-align:center;
      animation:offerBounceIn .45s cubic-bezier(.34,1.56,.64,1) both;
      box-shadow:0 8px 40px rgba(0,0,0,.5)">
      <div style="font-size:32px;margin-bottom:10px">${pctIcon}</div>
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${t('market.offerPopup.title')}</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:4px">${o.playerName}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px">${o.buyerName}</div>
      <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:26px;font-weight:800;color:var(--blue);margin-bottom:4px">${formatMoney(o.amount)}</div>
        <div style="font-size:12px;color:${pctColor};font-weight:600">
          ${o.pct}% ${t('market.offerPopup.meets')}${isGood ? ' ✓' : ''}
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:18px">
        ${t('nav.market')} → ${t('market.myList')}
      </div>
      <button onclick="_closeOfferPopup(${JSON.stringify(offers).replace(/"/g,'&quot;')},${idx+1})"
        style="width:100%;padding:11px;background:var(--blue);border:none;border-radius:8px;
               color:#fff;font-weight:700;font-size:14px;cursor:pointer;
               transition:background .15s"
        onmouseover="this.style.background='#0080cc'"
        onmouseout="this.style.background='var(--blue)'">
        OK
      </button>
    </div>
    <style id="offer-popup-style">
      @keyframes offerOverlayIn  { from{opacity:0} to{opacity:1} }
      @keyframes offerBounceIn   {
        0%   { transform:scale(.5) translateY(40px); opacity:0; }
        60%  { transform:scale(1.06) translateY(-6px); opacity:1; }
        80%  { transform:scale(.97) translateY(2px); }
        100% { transform:scale(1) translateY(0); opacity:1; }
      }
    </style>`;

  document.body.appendChild(ov);
}

function _closeOfferPopup(offers, nextIdx) {
  // Rimuovi popup corrente con fade-out
  const cur = document.getElementById('offer-popup-' + (nextIdx - 1));
  if (cur) {
    cur.style.transition = 'opacity .2s';
    cur.style.opacity = '0';
    setTimeout(() => {
      if (cur.parentNode) cur.parentNode.removeChild(cur);
      // Mostra il prossimo dopo una pausa
      setTimeout(() => _showOfferPopupQueue(offers, nextIdx), 120);
    }, 200);
  } else {
    setTimeout(() => _showOfferPopupQueue(offers, nextIdx), 120);
  }
}
