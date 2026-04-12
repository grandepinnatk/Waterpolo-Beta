// ─────────────────────────────────────────────
// engine/standings.js
// Classifica, aggiornamento risultati, simulazione partite
// ─────────────────────────────────────────────

// ── Calcola forza effettiva da rosa reale ─────
// Usa la media overall dei migliori 13 giocatori disponibili (non infortunati).
// Penalizza pesantemente rose sotto-organico (<7 giocatori).
// Se la rosa è vuota o non esiste, usa il valore base team.str.
// ── Score individuale per selezione convocati ──────────────────────
// Considera OVR, forma, morale, e affinità ruolo
function _playerScore(p) {
  const ovr    = p.overall || 70;
  const forma  = (p.fitness || 70) / 100;     // 0-1
  const morale = (p.morale  || 70) / 100;     // 0-1
  // Il contributo effettivo è modulato da forma e morale
  return ovr * (0.70 + forma * 0.20 + morale * 0.10);
}

// ── Costruisce la rosa di 13 simulata con ruoli minimi obbligatori ──
// Regola: almeno 1 POR, 2 DIF, 2 ATT, 1 CB obbligatori.
// I restanti slot (max 13 totali) vengono riempiti dai migliori disponibili per score.
function _buildSimSquad(roster) {
  if (!roster || !roster.length) return [];
  const avail = roster.filter(p => p && !p.injured && !p._national);
  if (!avail.length) return [];

  // Raggruppa per ruolo primario, con fallback secondRole
  // Un giocatore bi-ruolo viene considerato anche per lo slot del ruolo secondario
  const byRole = { POR:[], DIF:[], ATT:[], CB:[], CEN:[] };
  avail.forEach(p => {
    if (byRole[p.role]) byRole[p.role].push(p);
    // Aggiunge anche al secondRole (con penalità score del 10%)
    if (p.secondRole && byRole[p.secondRole]) {
      byRole[p.secondRole].push({ ...p, _asSecond: true });
    }
  });
  Object.values(byRole).forEach(g => g.sort((a, b) => {
    const sa = _playerScore(a) * (a._asSecond ? 0.90 : 1.0);
    const sb = _playerScore(b) * (b._asSecond ? 0.90 : 1.0);
    return sb - sa;
  }));

  const selected = new Set();  // usa nome come chiave univoca
  const selectedNames = new Set();
  const pick = (role, n) => {
    byRole[role]
      .filter(p => !selectedNames.has(p.name))
      .slice(0, n)
      .forEach(p => {
        // Aggiungi il giocatore originale (non la copia _asSecond)
        const orig = avail.find(x => x.name === p.name) || p;
        selected.add(orig);
        selectedNames.add(p.name);
      });
  };

  // Slot obbligatori (secondRole usato se mancano titolari del ruolo)
  pick('POR', 1);
  pick('DIF', 2);
  pick('ATT', 2);
  pick('CB',  1);

  // Riempi fino a 13 con i migliori rimasti per score (qualsiasi ruolo)
  avail
    .filter(p => !selectedNames.has(p.name))
    .sort((a, b) => _playerScore(b) - _playerScore(a))
    .forEach(p => { if (selected.size < 13) { selected.add(p); selectedNames.add(p.name); } });

  return Array.from(selected);
}

function _effectiveStr(team, rosters) {
  if (!rosters) return team.str;
  const roster = rosters[team.id];
  if (!roster || !roster.length) return team.str;
  const squad = _buildSimSquad(roster);
  if (!squad.length) return team.str * 0.4;
  const avgOvr = squad.reduce((s, p) => s + (p.overall || 70), 0) / squad.length;
  // Applica anche il contributo medio di forma e morale
  const avgScore = squad.reduce((s, p) => s + _playerScore(p), 0) / squad.length;
  // Penalità uomo in meno: esponenziale — in pallanuoto giocare in inferiorità
  // numerica è uno svantaggio enorme (espulsioni, nazionali, infortuni)
  const shortage = Math.max(0, 7 - squad.length);
  // Ogni giocatore mancante riduce l'efficacia del ~20% moltiplicativo
  const shortageFactor = Math.pow(0.80, shortage);
  return Math.max(10, avgScore * shortageFactor);
}

// ── Simulazione risultato ─────────────────────
// Usa forza REALE della rosa (media overall top-13) + varianza casuale.
// boost: modificatore tattico del coach (+/- punti forza)
// rosters: opzionale — se passato usa la forza reale, altrimenti usa team.str
function simulateResult(homeTeam, awayTeam, boost = 0, rosters = null) {
  const hBase = rosters ? _effectiveStr(homeTeam, rosters) : homeTeam.str;
  const aBase = rosters ? _effectiveStr(awayTeam, rosters) : awayTeam.str;
  const hStr = hBase + rnd(-8, 8) + 3 + boost; // +3 fattore campo
  const aStr = aBase + rnd(-8, 8);
  const tot  = Math.max(1, hStr + aStr);
  const home = Math.max(0, Math.round((hStr / tot) * rnd(6, 18) * rnd(8, 14) / 10));
  const away = Math.max(0, Math.round((aStr / tot) * rnd(6, 18) * rnd(8, 14) / 10));
  return { home, away };
}

// ── Aggiornamento classifica dopo una partita ─
function updateStandings(standings, homeId, awayId, score) {
  const h = standings[homeId];
  const a = standings[awayId];
  h.g++; a.g++;
  h.gf += score.home; h.ga += score.away;
  a.gf += score.away; a.ga += score.home;
  if (score.home > score.away) { h.w++; h.pts += 3; a.l++; }
  else if (score.home < score.away) { a.w++; a.pts += 3; h.l++; }
  else { h.d++; a.d++; h.pts++; a.pts++; }
}

// ── Classifica ordinata ───────────────────────
// Criteri: punti > differenza reti > gol fatti
function getSortedStandings(standings) {
  return Object.values(standings).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const drA = a.gf - a.ga, drB = b.gf - b.ga;
    if (drB !== drA) return drB - drA;
    return b.gf - a.gf;
  });
}

// ── Posizione di una squadra ──────────────────
function getTeamPosition(standings, teamId) {
  return getSortedStandings(standings).findIndex(s => s.id === teamId) + 1;
}


// ── Distribuisce gol e assist ai giocatori e restituisce i dettagli della partita ──
// Restituisce { home: [{name, goals}], away: [{name, goals}], partials: [{h,a}x4] }
function simulateMatchStats(homeRoster, awayRoster, score) {
  if (!homeRoster || !awayRoster) return null;

  const homeScorers = [];
  const awayScorers = [];

  function distributeGoals(roster, numGoals, scorersList) {
    if (!numGoals || !roster.length) return;
    const scorers = roster.filter(p => p.role !== 'POR');
    if (!scorers.length) return;

    for (let i = 0; i < numGoals; i++) {
      const weights = scorers.map(p =>
        p.role === 'ATT' ? 4 : p.role === 'CEN' ? 3 : p.role === 'CB' ? 2 : 1
      );
      const totalW = weights.reduce((s, w) => s + w, 0);
      let r = Math.random() * totalW;
      let scorer = scorers[0];
      for (let j = 0; j < scorers.length; j++) {
        r -= weights[j];
        if (r <= 0) { scorer = scorers[j]; break; }
      }
      if (!scorer.goals) scorer.goals = 0;
      scorer.goals++;
      // Traccia per details
      const existing = scorersList.find(s => s.name === scorer.name);
      if (existing) existing.goals++;
      else scorersList.push({ name: scorer.name, goals: 1, assists: 0 });

      // Assist
      if (Math.random() < 0.75) {
        const candidates = roster.filter(p => p !== scorer);
        if (candidates.length) {
          const ast = candidates[Math.floor(Math.random() * candidates.length)];
          if (!ast.assists) ast.assists = 0;
          ast.assists++;
          // Traccia assist nei details
          const existingA = scorersList.find(s => s.name === ast.name);
          if (existingA) existingA.assists++;
          else scorersList.push({ name: ast.name, goals: 0, assists: 1 });
        }
      }
    }
  }

  distributeGoals(homeRoster, score.home, homeScorers);
  distributeGoals(awayRoster, score.away, awayScorers);

  // ── Simula infortuni ────────────────────────────────────────────────
  // Probabilità base ~3% per partita per giocatore a rischio
  // Solo per i giocatori passati (non l'avversario generico)
  function simulateInjuries(roster) {
    if (!roster) return [];
    const injured = [];
    roster.forEach(p => {
      if (!p || p.injured) return;
      // Rischio base: forma bassa + fragilità personale
      const formRisk = p.fitness !== undefined && p.fitness < 70
        ? (70 - p.fitness) / 70 * 0.04  // fino a +4% se forma 0
        : 0;
      const injP     = (p.injProb || 0.04) + formRisk;
      // Probabilità per partita (non per secondo): ~4-8% in condizioni normali
      const matchProb = Math.min(0.35, injP * 2.4);  // aumentato ulteriormente
      if (Math.random() < matchProb) {
        p.injured     = true;
        p.injuryWeeks = 1 + Math.floor(Math.random() * 4); // 1-4 giornate (più leggero della partita live)
        const penalty = 8 + Math.floor(Math.random() * 12);
        p.fitness     = Math.round(Math.max(5, (p.fitness || 70) - penalty));
        injured.push(p.name);
      }
    });
    return injured;
  }

  // Genera parziali verosimili distribuendo i gol nei 4 tempi
  function splitGoals(total) {
    const p = [0,0,0,0];
    for (let i = 0; i < total; i++) p[Math.floor(Math.random() * 4)]++;
    return p;
  }
  const hP = splitGoals(score.home);
  const aP = splitGoals(score.away);
  const partials = [0,1,2,3].map(i => ({ h: hP[i], a: aP[i] }));

  return { home: homeScorers, away: awayScorers, partials, _injuredH: [], _injuredA: [] };
}

// ── Simula tutte le partite di una giornata ───
// Salta le partite del giocatore (home o away = myId)
function simulateRound(schedule, standings, teams, roundNum, myId, rosters) {  // rosters usato per forza effettiva
  const roundMatches = schedule.filter(m => m.round === roundNum && !m.played);
  roundMatches.forEach(m => {
    if (m.home === myId || m.away === myId) return; // partita del giocatore → skip
    const hT = teams.find(t => t.id === m.home);
    const aT = teams.find(t => t.id === m.away);
    m.score  = simulateResult(hT, aT);
    m.played = true;
    updateStandings(standings, m.home, m.away, m.score);
    // Distribuisce gol/assist e salva details sul match
    if (rosters) {
      const det = simulateMatchStats(rosters[m.home], rosters[m.away], m.score);
      if (det) m.details = det;
    }
  });
}

// ── Simula tutte le rimanenti (campionato rapido) ─
function simulateAllRemaining(schedule, standings, teams, myId, rosters) {
  schedule
    .filter(m => !m.played && m.home !== myId && m.away !== myId)
    .forEach(m => {
      const hT = teams.find(t => t.id === m.home);
      const aT = teams.find(t => t.id === m.away);
      m.score  = simulateResult(hT, aT, 0, rosters);
      m.played = true;
      updateStandings(standings, m.home, m.away, m.score);
      if (rosters) { const det = simulateMatchStats(rosters[m.home], rosters[m.away], m.score); if (det) m.details = det; }
    });
}

// ── Verifica e finalizza obiettivi ───────────
function checkObjectivesProgress(objectives, standings, myId, playoffResult) {
  const pos = getTeamPosition(standings, myId);
  const ms  = standings[myId];
  objectives.forEach(o => {
    if (o.achieved || o.failed) return;
    if (o.type === 'position') o.progress = pos;
    if (o.type === 'wins')     o.progress = ms.w;
    if (o.type === 'goals')    o.progress = ms.gf;
    if (o.type === 'survive')  o.progress = pos <= 12 ? 1 : 0;
    if (o.type === 'champion') o.progress = playoffResult === 'champion' ? 1 : 0;
  });
}

function finalizeObjectives(objectives, standings, myId, playoffResult) {
  const pos = getTeamPosition(standings, myId);
  const ms  = standings[myId];
  let totalReward = 0;

  objectives.forEach(o => {
    if (o.achieved) return;
    switch (o.type) {
      case 'champion': o.achieved = (playoffResult === 'champion'); break;
      case 'position': o.achieved = (pos <= o.target); break;
      case 'survive':  o.achieved = (pos <= 12); break;
      case 'wins':     o.achieved = (ms.w >= (o.target || 0)); break;
      case 'goals':    o.achieved = (ms.gf >= (o.target || 0)); break;
    }
    if (o.achieved) totalReward += o.reward;
    else            o.failed = true;
  });

  return totalReward;
}
