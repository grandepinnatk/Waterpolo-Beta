// ════════════════════════════════════════════
// POPUP ROSA SQUADRA — richiamabile da ovunque
// showTeamRosterPopup(teamId) apre un modale con la rosa completa
// ════════════════════════════════════════════
function showTeamRosterPopup(teamId) {
  const team   = G.teams.find(tm => tm.id === teamId);
  if (!team) return;
  const roster = G.rosters[teamId] || [];
  const rl     = { POR:t('roles.POR'), DIF:t('roles.DIF'), CEN:'Centromediano', ATT:t('roles.ATT'), CB:t('roles.CB') };
  const isMe   = teamId === G.myId;

  const existing = document.getElementById('team-roster-popup');
  if (existing) existing.remove();

  // Ordina: POR → DIF → CEN → ATT → CB
  const roleOrder = { POR:0, DIF:1, CEN:2, ATT:3, CB:4 };
  const sorted = [...roster].sort((a, b) =>
    (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5) ||
    b.overall - a.overall
  );

  // Calcola OVR medio
  const avgOvr = roster.length
    ? Math.round(roster.reduce((s, p) => s + p.overall, 0) / roster.length)
    : 0;

  const rows = sorted.map(p => {
    const rCls = p.role==='POR'?'S': p.role==='DIF'?'A': p.role==='CB'?'B':'C';
    const hCls = p.hand==='AMB'?'AMB': p.hand==='L'?'L':'R';
    const rCls2 = p.secondRole ? (p.secondRole==='POR'?'S':p.secondRole==='DIF'?'A':p.secondRole==='CB'?'B':'C') : null;
    return `<tr>
      <td style="font-size:12px;font-weight:600">${p.name}</td>
      <td><span class="badge ${rCls}">${p.role}</span>${rCls2 ? ` <span class="badge ${rCls2}" style="opacity:.85">${p.secondRole}</span>` : ''}</td>
      <td><span class="badge ${hCls}">${p.hand}</span></td>
      <td style="font-size:11px;color:var(--muted);text-align:center">${p.age}</td>
      <td style="font-weight:700;color:var(--blue);text-align:center">${p.overall}</td>
      <td style="font-size:11px;color:var(--muted);text-align:right">${p.nat}</td>
      <td style="font-size:11px;color:var(--gold);text-align:right">${formatMoney(p.salary||0)}</td>
    </tr>`;
  }).join('');

  const ov = document.createElement('div');
  ov.id = 'team-roster-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(6px);overflow-y:auto;padding:20px';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;
                padding:20px;max-width:580px;width:95%;max-height:85vh;overflow-y:auto">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:50%;background:${team.col || 'var(--blue)'};
                      display:flex;align-items:center;justify-content:center;font-size:12px;
                      font-weight:700;color:#fff;flex-shrink:0">${team.abbr}</div>
          <div>
            <div style="font-weight:700;font-size:16px;color:var(--blue)">${team.name}${isMe ? ' ★' : ''}</div>
            <div style="font-size:11px;color:var(--muted)">${team.city || ''} · OVR medio: ${avgOvr} · ${roster.length} giocatori · Budget: ${formatMoney(team.budget||0)}</div>
          </div>
        </div>
        <button onclick="document.getElementById('team-roster-popup').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <!-- Tabella rosa -->
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border);font-size:10px;color:var(--muted);text-transform:uppercase">
            <th style="text-align:left;padding:4px 6px">${t('roster.title')}</th>
            <th>${t('roster.sortRole')}</th>
            <th>Mano</th>
            <th style="text-align:center">Età</th>
            <th style="text-align:center">OVR</th>
            <th style="text-align:right">${t('roster.nat')}</th>
            <th style="text-align:right">${t('extra.wage')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
// Esponi globalmente
window.showTeamRosterPopup = showTeamRosterPopup;

// Sostituisce i nomi squadra in un testo con link cliccabili
function _linkTeamNames(text) {
  if (!G || !G.teams) return text;
  let result = text;
  G.teams.forEach(tm => {
    if (!tm.name || tm.name.length < 3) return;
    // Escape caratteri speciali nel nome per regex
    const escaped = tm.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(' + escaped + ')', 'g');
    result = result.replace(re,
      `<span onclick="showTeamRosterPopup('${tm.id}')" ` +
      `style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;color:inherit" ` +
      `title="${tm.name}">$1</span>`
    );
  });
  return result;
}



// Badge SCAD — contratto in scadenza a fine stagione (contractYears <= 1)
// Non mostra il badge se il contratto è stato appena rinnovato questa stagione
function _scadBadge(p) {
  if (!p || (p.contractYears === undefined) || p.contractYears > 1) return '';
  if (p._justRenewed) return '';  // rinnovato di recente, non è in scadenza
  if (p._renewalPending)
    return ' <span style="font-size:9px;background:#0a6a2a;color:#fff;font-weight:700;' +
           'padding:1px 4px;border-radius:3px;margin-left:3px" title="Proposta di rinnovo inviata">📨</span>';
  return ' <span style="font-size:9px;background:#7b2fbe;color:#fff;font-weight:700;' +
         'padding:1px 4px;border-radius:3px;margin-left:3px" title="Contratto in scadenza a fine stagione">SCAD</span>';
}

// Badge RIT — visibile accanto al nome in tutte le liste

// ── Badge nazionale ──────────────────────────
function _nationalBadge(p) {
  if (!p || (!p._national && !p._nationalNext)) return '';
  const flags = { ITA:'🇮🇹', CRO:'🇭🇷', SRB:'🇷🇸', HUN:'🇭🇺', GRE:'🇬🇷', MNE:'🇲🇪', ESP:'🇪🇸' };
  const flag = flags[p._nationalNat] || '';
  return ' <span style="font-size:9px;background:#1565c0;color:#fff;font-weight:700;' +
         'padding:1px 5px;border-radius:3px;margin-left:3px" title="Convocato in Nazionale ' + (p._nationalNat||'') + '">NAZ ' + flag + '</span>';
}

// ── Badge diamante grezzo ─────────────────────
function _diamondBadge(p) {
  if (!p || !p._diamond) return '';
  return '<span style="font-size:11px;cursor:default" title="Diamante Grezzo — OVR basso, potenziale ' + (p.potential||'?') + '">💎</span>';
}

function _ritBadge(p) {
  if (!p || p.retirementAge === undefined) return '';
  if ((p.age + 1) < p.retirementAge) return '';
  return ' <span style="font-size:9px;background:#c0392b;color:#fff;font-weight:700;' +
         'padding:1px 4px;border-radius:3px;margin-left:3px" title="Si ritira a fine stagione">RIT</span>';
}

// Restituisce il nome completo nel formato "Cognome I."
function _shortPlayerName(p) {
  if (!p || !p.name) return "—";
  return p.name;
}

// ─────────────────────────────────────────────
// ui/dashboard.js  · ui/roster.js · ui/training.js
// ui/objectives.js · ui/standings.js · ui/calendar.js
// ui/playoff.js    · ui/market.js
//
// Tutti i renderer dei tab del gioco principale.
// Ogni funzione scrive l'innerHTML del suo contenitore.
// ─────────────────────────────────────────────

// ── Popup dettaglio partita (clic sul punteggio in calendario) ──

// ── Popup giocatore universale (qualsiasi squadra) ──────────────────
function showAnyPlayerPopup(playerName, teamId) {
  const roster = G.rosters[teamId] || [];
  const p = roster.find(function(x){ return x && x.name === playerName; });
  if (!p) return;
  const isMe = teamId === G.myId;
  const myIdx = isMe ? G.rosters[G.myId].indexOf(p) : -1;
  if (isMe && myIdx >= 0) { showPlayerModal(myIdx); return; }
  // Popup semplificato per giocatori avversari
  const rl = { POR:t('roles.POR'), DIF:t('roles.DIF'), CEN:'Centromediano', ATT:t('roles.ATT'), CB:t('roles.CB') };
  const existing = document.getElementById('any-player-popup');
  if (existing) existing.remove();
  const ov = document.createElement('div');
  ov.id = 'any-player-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:600;backdrop-filter:blur(4px)';
  const rCls  = p.role==='POR'?'S':p.role==='DIF'?'A':p.role==='CB'?'B':'C';
  const rCls2 = p.secondRole ? (p.secondRole==='POR'?'S':p.secondRole==='DIF'?'A':p.secondRole==='CB'?'B':'C') : null;
  const hCls  = p.hand==='AMB'?'AMB':p.hand==='L'?'L':'R';
  const fc    = p.fitness>70?'var(--green)':p.fitness>45?'var(--gold)':'var(--red)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px 20px;max-width:340px;width:92%">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--blue)">${p.name}</div>
          <div style="font-size:12px;color:var(--muted)">${rl[p.role]||p.role}${p.secondRole?' / '+(rl[p.secondRole]||p.secondRole):''} · ${p.nat} · ${p.age} anni</div>
        </div>
        <button onclick="document.getElementById('any-player-popup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <span class="badge ${rCls}">${p.role}</span>
        ${rCls2 ? `<span class="badge ${rCls2}" style="opacity:.85">${p.secondRole}</span>` : ''}
        <span class="badge ${hCls}">${p.hand}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:10px">
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.overall')}</span><span style="font-size:16px;font-weight:700;color:var(--blue)">${p.overall}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.potential')}</span><span>${p.potential||'—'}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.fitness')}</span><span style="color:${fc}">${Math.round(p.fitness||0)}%</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.morale')}</span><span>${p.morale||0}%</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">Gol / Ass.</span><span>${p.goals||0} / ${p.assists||0}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('extra.wage')}</span><span style="color:var(--gold)">${formatMoney(p.salary||0)}</span></div>
        ${(p.nationalCaps||0)>0 ? '<div class="irow" style="margin:0"><span class="ilbl">'+t('roster.nat')+'</span><span style="color:#1565c0;font-weight:700">'+(p.nationalCaps||0)+' caps ' + ({'ITA':'🇮🇹','CRO':'🇭🇷','SRB':'🇷🇸','HUN':'🇭🇺','GRE':'🇬🇷','MNE':'🇲🇪','ESP':'🇪🇸'}[p._nationalNat]||'🏳')+'</span></div>' : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:11px">
        ${['att','def','spe','str','tec','res'].map(k=>`
          <div style="background:rgba(255,255,255,.04);border-radius:6px;padding:4px 6px;text-align:center">
            <div style="color:var(--muted);font-size:9px;text-transform:uppercase">${k.toUpperCase()}</div>
            <div style="font-weight:700">${(p.stats&&p.stats[k])||'—'}</div>
          </div>`).join('')}
      </div>
    </div>`;
  ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}
window.showAnyPlayerPopup = showAnyPlayerPopup;

function showMatchDetailPopup(matchIdx) {
  const m  = G.schedule[matchIdx];
  if (!m || !m.played || !m.score) return;

  const hT = G.teams.find(tm => tm.id === m.home);
  const aT = G.teams.find(tm => tm.id === m.away);
  const d  = m.details || null;

  const existing = document.getElementById('match-detail-popup');
  if (existing) existing.remove();

  // Parziali
  let partialsHtml = '';
  if (d && d.partials) {
    partialsHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Parziali</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:center;padding:3px 6px;color:var(--muted);font-weight:600;font-size:10px">Tempo</th>
              <th style="text-align:center;padding:3px 8px;color:${m.home===G.myId?'var(--blue)':'var(--muted)'};font-weight:700;font-size:11px">${hT?hT.abbr:'?'}</th>
              <th style="text-align:center;padding:3px 8px;color:${m.away===G.myId?'var(--blue)':'var(--muted)'};font-weight:700;font-size:11px">${aT?aT.abbr:'?'}</th>
            </tr>
          </thead>
          <tbody>
            ${d.partials.map((p,i) => `
              <tr style="border-bottom:1px solid rgba(255,255,255,.04)">
                <td style="text-align:center;color:var(--muted);padding:4px">${i+1}° T</td>
                <td style="text-align:center;font-weight:600;padding:4px">${p.h}</td>
                <td style="text-align:center;font-weight:600;padding:4px">${p.a}</td>
              </tr>`).join('')}
            <tr style="border-top:1px solid var(--border);font-weight:700">
              <td style="text-align:center;color:var(--muted);padding:5px">Tot.</td>
              <td style="text-align:center;color:var(--blue);padding:5px">${m.score.home}</td>
              <td style="text-align:center;color:var(--blue);padding:5px">${m.score.away}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else {
    partialsHtml = `<div style="margin-bottom:14px;font-size:12px;color:var(--muted)">${t('extra.noPartials')}</div>`;
  }

  // Marcatori per squadra
  function buildScorersList(list, label) {
    if (!list || !list.length) return `<div style="color:var(--muted);font-size:12px;padding:4px 0">—</div>`;
    return list
      .filter(s => s.goals > 0 || s.assists > 0)
      .sort((a,b) => b.goals - a.goals || b.assists - a.assists)
      .map(s => {
        const goalsStr   = s.goals   > 0 ? `<span style="color:var(--blue);font-weight:700">⚽${s.goals}</span>` : '';
        const assistsStr = s.assists > 0 ? `<span style="color:var(--green);font-size:11px"> 🤝${s.assists}</span>` : '';
        const _sTeamId = label === (hT?hT.abbr:t('common.home')) ? m.home : m.away;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px">
          <span style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px" onclick="showAnyPlayerPopup('${s.name}','${m.home}')">${s.name}</span>
          <span style="display:flex;gap:6px;align-items:center">${goalsStr}${assistsStr}</span>
        </div>`;
      }).join('') || `<div style="color:var(--muted);font-size:12px;padding:4px 0">—</div>`;
  }

  const homeIsMe = m.home === G.myId;
  const awayIsMe = m.away === G.myId;

  const ov = document.createElement('div');
  ov.id = 'match-detail-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(6px);overflow-y:auto;padding:20px';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;
                padding:20px;max-width:540px;width:95%;max-height:85vh;overflow-y:auto">

      <!-- Header risultato -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:11px;color:var(--muted)">G${m.round}</div>
        <button onclick="document.getElementById('match-detail-popup').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
      </div>

      <!-- Tabellone -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:center;gap:16px">
          <div style="flex:1;text-align:right">
            <span onclick="showTeamRosterPopup('${m.home}')" style="font-size:15px;font-weight:${homeIsMe?700:500};cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;color:${homeIsMe?'var(--blue)':'var(--text)'}">${hT?hT.name:'?'}</span>
          </div>
          <div style="background:var(--panel2);border-radius:10px;padding:8px 20px;font-size:24px;font-weight:700;flex-shrink:0">
            ${m.score.home} - ${m.score.away}
          </div>
          <div style="flex:1;text-align:left">
            <span onclick="showTeamRosterPopup('${m.away}')" style="font-size:15px;font-weight:${awayIsMe?700:500};cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;color:${awayIsMe?'var(--blue)':'var(--text)'}">${aT?aT.name:'?'}</span>
          </div>
        </div>
        ${m.attendance > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">
          👥 Spettatori: <strong style="color:rgba(255,255,255,.7)">${m.attendance.toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT')}</strong>
          — ${Math.round(m.attendance / (m.capacity||500) * 100)}% sul totale di ${(m.capacity||500).toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT')}
        </div>` : ''}
      </div>

      <!-- Parziali -->
      ${partialsHtml}

      <!-- Marcatori -->
      ${d ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div style="font-size:11px;font-weight:700;color:${homeIsMe?'var(--blue)':'var(--muted)'};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${hT?hT.abbr:t('common.home')}</div>
          ${buildScorersList(d.home, m.home)}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:${awayIsMe?'var(--blue)':'var(--muted)'};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${aT?aT.abbr:'Ospiti'}</div>
          ${buildScorersList(d.away, m.away)}
        </div>
      </div>` : '<div style="font-size:12px;color:var(--muted)">Statistiche dettagliate non disponibili per questa partita.</div>'}

    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
window.showMatchDetailPopup = showMatchDetailPopup;

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
function renderDash() {
  // Reset cache notizie ad ogni render (gli indici devono ricominciare da 0)
  window._newsCache = [];

  // Rileva tema corrente
  var _isDark    = document.body.classList.contains('theme-dark');
  var _isLight   = document.body.classList.contains('theme-light');
  // Colori widget coerenti con il tema CSS
  var _wBg, _wText, _wMuted, _wLabel, _wTitle, _wBorder;
  if (_isLight) {
    // Chiaro — usa --panel light: rgba(255,255,255,.82), testo scuro
    _wBg     = 'rgba(255,255,255,0.88)';
    _wText   = '#1a2a3a';
    _wMuted  = '#4a6a8a';
    _wLabel  = '#1a2a3a';
    _wTitle  = '#4a6a8a';
    _wBorder = 'rgba(0,60,160,.12)';
  } else if (_isDark) {
    // Scuro — usa --panel dark: #141820
    _wBg     = '#141820';
    _wText   = '#d0d8e8';
    _wMuted  = '#607080';
    _wLabel  = '#a0b0c8';
    _wTitle  = '#607080';
    _wBorder = 'rgba(42,48,64,.8)';
  } else {
    // Classic — usa --panel: #12243a
    _wBg     = '#12243a';
    _wText   = '#e8edf5';
    _wMuted  = '#7a9bb5';
    _wLabel  = '#c0d0e0';
    _wTitle  = '#7a9bb5';
    _wBorder = 'rgba(30,58,92,.8)';
  }

  var ms      = G.stand[G.myId];
  var pos     = getTeamPosition(G.stand, G.myId);
  var nm      = (typeof nextMyMatch === 'function')
    ? nextMyMatch()
    : (G.schedule.filter(function(m) { return (m.home === G.myId || m.away === G.myId) && !m.played; })
        .sort(function(a, b) { return a.round - b.round; })[0] || null);
  var nextOpp = nm ? G.teams.find(function(t) { return t.id === (nm.home === G.myId ? nm.away : nm.home); }) : null;
  var roster  = G.rosters[G.myId] || [];

  // ── Trend posizione ──
  var played = G.schedule ? G.schedule.filter(function(m) { return m.played && (m.home === G.myId || m.away === G.myId); }).length : 0;
  var trendHtml = '';
  if (played > 1) {
    if (!G.prevPos || G.prevPos === pos) trendHtml = '<span style="color:#f0a030;font-size:13px">—</span>';
    else if (pos < G.prevPos) trendHtml = '<span style="color:#2ecc71;font-size:13px">▲</span>';
    else trendHtml = '<span style="color:#e74c3c;font-size:13px">▼</span>';
  }

  // ── V/P/S ciambella mini ──
  function vpsDoughnut(w, d, l) {
    var total = w + d + l || 1;
    var r = 22, circ = 2 * Math.PI * r;
    var sw = w / total * circ;
    var sd = d / total * circ;
    var sl = l / total * circ;
    var offP = circ - sw;
    var offS = circ - sw - sd;
    return '<svg width="52" height="52" style="flex-shrink:0">'
      + '<circle cx="26" cy="26" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7"/>'
      + '<circle cx="26" cy="26" r="' + r + '" fill="none" stroke="#2ecc71" stroke-width="7"'
      + ' stroke-dasharray="' + sw.toFixed(1) + ' ' + (circ-sw).toFixed(1) + '" stroke-linecap="butt" transform="rotate(-90 26 26)"/>'
      + '<circle cx="26" cy="26" r="' + r + '" fill="none" stroke="#f0c040" stroke-width="7"'
      + ' stroke-dasharray="' + sd.toFixed(1) + ' ' + (circ-sd).toFixed(1) + '" stroke-linecap="butt" transform="rotate(-90 26 26)"'
      + ' stroke-dashoffset="-' + sw.toFixed(1) + '"/>'
      + '<circle cx="26" cy="26" r="' + r + '" fill="none" stroke="#e74c3c" stroke-width="7"'
      + ' stroke-dasharray="' + sl.toFixed(1) + ' ' + (circ-sl).toFixed(1) + '" stroke-linecap="butt" transform="rotate(-90 26 26)"'
      + ' stroke-dashoffset="-' + (sw+sd).toFixed(1) + '"/>'
      + '<text x="26" y="30" text-anchor="middle" font-size="9" font-weight="700" fill="rgba(255,255,255,.6)">'
      + w + '/' + d + '/' + l + '</text>'
      + '</svg>';
  }

  // ── Classifica tag ──
  function posColor(p) {
    if (p <= 4)  return '#2ecc71';
    if (p <= 8)  return '#00c2ff';
    if (p <= 10) return '#f0c040';
    return '#e74c3c';
  }

  // ── Categoria notizia ──
  function msgTag(txt) {
    // Stesso ordine di NEWS_CATEGORIES in tabs.js — le specifiche prima delle generiche
    if (/infortun|injur|injury|exhausted|out of energy|🚑/i.test(txt))
      return [t('nav.training').toUpperCase(), '#e74c3c'];
    if (/guarit|recover|torna disponibile|available again/i.test(txt))
      return [t('goals.inProgress').toUpperCase(), '#27ae60'];
    if (/nazional|convocazione|nazionale|national|call.up|called up|internazional/i.test(txt))
      return [t('national.badge'), '#1565c0'];
    if (/playoff|playout|retrocessione|scudetto|relegat|survived|champion|semifinal|finale scudetto/i.test(txt))
      return [t('nav.playoff').toUpperCase(), '#c62828'];
    if (/allenamento|allenament|sessione|training:|athletic|conditioning|goalkeeper training|technical training|endurance training|rest.*recovery|attack training|defence training|tactical session|giocatori migliorati|players improved/i.test(txt))
      return [t('nav.training').toUpperCase(), '#00838f'];
    if (/contratto|rinnov|scadenz|resciss|contract|renew|expir|terminat|rescind|proposta.*rinnovo|renewal/i.test(txt))
      return [t('roster.contract').toUpperCase(), '#9c27b0'];
    if (/mercato|offerta|acquist|svinc|vend|market|transfer|signed|sold|offer|ceduto|🛒|💼/i.test(txt))
      return [t('nav.market').toUpperCase(), '#ff8c42'];
    if (/ingaggi|budget|bonus|penale|finanz|salary|wages|finance|balance|💸|spettatori|incasso|monte/i.test(txt))
      return [t('nav.finance').toUpperCase(), '#2e7d32'];
    if (/giocato|pareggi|vince|perde|matchday|wins|loses|draws/i.test(txt) || /^G\d+:/.test(txt))
      return [t('common.result').toUpperCase(), '#1565c0'];
    return [t('dash.news').toUpperCase(), '#455a64'];
  }

  // ── Focus giocatore: miglior morale nella rosa ──
  var focusPlayer = null;
  var bestMorale = -1;
  roster.forEach(function(p) {
    if (p && !p.injured && (p.morale || 0) > bestMorale) { bestMorale = p.morale; focusPlayer = p; }
  });

  // Top scorer
  var topScorer = null;
  roster.forEach(function(p) { if (p && (!topScorer || (p.goals || 0) > (topScorer.goals || 0))) topScorer = p; });

  var h = '';

  // ═══════════════════════════════════════════
  // STAT BAR in cima
  // ═══════════════════════════════════════════
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:14px">';

  // Posizione
  var pc = posColor(pos);
  h += '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px">'
    + '<div style="font-size:22px;opacity:.7">🛡️</div>'
    + '<div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.5px">' + t('extra.position') + '</div>'    + '<div style="font-size:22px;font-weight:800;color:' + pc + ';line-height:1.2">' + pos + '° ' + trendHtml + '</div>'
    + '</div></div>';

  // Punti
  h += '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px">'
    + '<div style="font-size:22px;opacity:.7">📍</div>'
    + '<div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.5px">' + t('standings.points') + '</div>'
    + '<div style="font-size:26px;font-weight:900;color:#fff;line-height:1.1;font-variant-numeric:tabular-nums">' + ms.pts + '</div>'
    + '</div></div>';

  // V/P/S ciambella
  h += '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px 16px;display:flex;align-items:center;gap:12px">'
    + vpsDoughnut(ms.w, ms.d, ms.l)
    + '<div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.5px">' + t('dash.winRate') + '</div>'
    + '<div style="display:flex;gap:6px;margin-top:2px">'
    + '<span style="font-size:13px;font-weight:700;color:#2ecc71">' + ms.w + ' ' + t('standings.won')[0] + '</span>'
    + '<span style="font-size:13px;font-weight:700;color:#f0c040">' + ms.d + ' ' + t('standings.drawn')[0] + '</span>'
    + '<span style="font-size:13px;font-weight:700;color:#e74c3c">' + ms.l + ' ' + t('standings.lost')[0] + '</span>'
    + '</div></div></div>';

  // Budget monospaced
  h += '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px">'
    + '<div style="font-size:22px;opacity:.7">🪙</div>'
    + '<div style="min-width:0">'
    + '<div style="font-size:10px;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.5px">Budget</div>'
    + '<div style="font-size:15px;font-weight:800;color:#f0c040;letter-spacing:-.5px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
    + formatMoney(G.budget) + '</div>'
    + '</div></div>';

  h += '</div>';

  // ═══════════════════════════════════════════
  // ALERT CONTRATTI IN SCADENZA
  // ═══════════════════════════════════════════
  var expiringPlayers = (G.rosters[G.myId] || []).filter(function(p) {
    return p && (p.contractYears === undefined || p.contractYears <= 1);
  });
  if (expiringPlayers.length > 0) {
    h += '<div style="background:rgba(123,47,190,.1);border:1px solid rgba(123,47,190,.4);border-radius:12px;' +
      'padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:18px;flex-shrink:0">📋</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:700;color:#ce93d8;margin-bottom:3px">' +
          expiringPlayers.length + ' ' + t('roster.contract').toLowerCase() + ' ' + t('roster.expiring').toLowerCase() + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          expiringPlayers.slice(0, 4).map(function(p) { return p.name; }).join(', ') +
          (expiringPlayers.length > 4 ? ' +' + t('common.all').toLowerCase() : '') +
        '</div>' +
      '</div>' +
      '<button onclick="showTab(\'rosa\')\" style="flex-shrink:0;padding:5px 12px;font-size:11px;font-weight:700;' +
        'border-radius:6px;background:rgba(123,47,190,.3);border:1px solid rgba(123,47,190,.6);' +
        'color:#ce93d8;cursor:pointer">' + t('common.details') + '</button>' +
      '</div>';
  }

  // ═══════════════════════════════════════════
  // ULTIMA GARA + MATCHDAY HUB (1/3 + 2/3)
  // ═══════════════════════════════════════════

  // Trova l'ultima partita giocata dalla mia squadra
  var lastMatch = null;
  if (G.schedule) {
    var playedMy = G.schedule.filter(function(m) {
      return m.played && m.score && (m.home === G.myId || m.away === G.myId);
    });
    if (playedMy.length) lastMatch = playedMy[playedMy.length - 1];
  }

  // Wrapper 1/3 + 2/3
  h += '<div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-bottom:14px">';

  // ── Widget Ultima Gara (1/3) ──
  h += '<div style="position:relative;border-radius:16px;overflow:hidden;'
    + 'background:linear-gradient(135deg,#1a0d2e 0%,#12091e 40%,#1a0d2e 100%);'
    + 'border:1px solid rgba(120,80,200,.25);min-height:140px">';
  h += '<div style="position:absolute;inset:0;opacity:.06;background:repeating-linear-gradient('
    + '135deg,transparent,transparent 8px,rgba(120,80,200,.5) 8px,rgba(120,80,200,.5) 9px);pointer-events:none"></div>';
  h += '<div style="position:relative;padding:14px 16px">';
  h += '<div style="font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;'
    + 'letter-spacing:1.2px;margin-bottom:10px">' + t('dash.lastMatch') + '</div>';

  if (lastMatch) {
    var lih    = lastMatch.home === G.myId;
    var lOppId = lih ? lastMatch.away : lastMatch.home;
    var lOpp   = G.teams.find(function(t){return t.id===lOppId;}) || {name:'?',abbr:'?'};
    var lMyS   = lih ? lastMatch.score.home : lastMatch.score.away;
    var lOppS  = lih ? lastMatch.score.away : lastMatch.score.home;
    var lWon   = lMyS > lOppS, lDrew = lMyS === lOppS;
    var lCol   = lWon ? '#2ecc71' : lDrew ? '#f0c040' : '#e74c3c';
    var lRes   = lWon ? t('standings.won')[0].toUpperCase() : lDrew ? t('standings.drawn')[0].toUpperCase() : t('standings.lost')[0].toUpperCase();
    var lMIdx  = G.schedule.indexOf(lastMatch);
    // Badge risultato
    h += '<div style="display:flex;justify-content:center;margin-bottom:8px">';
    h += '<span style="font-size:13px;font-weight:900;color:' + lCol + ';background:' + lCol + '22;'
      + 'border:1px solid ' + lCol + '55;border-radius:8px;padding:2px 12px;letter-spacing:1px">' + lRes + '</span>';
    h += '</div>';
    // Squadre e punteggio — casa a sinistra, ospite a destra
    var lHomeName = lih ? G.myTeam.name : lOpp.name;
    var lAwayName = lih ? lOpp.name : G.myTeam.name;
    var lHomeScore = lastMatch.score.home;
    var lAwayScore = lastMatch.score.away;
    var lHomeIsMe  = lih;
    h += '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px">';
    h += '<div style="font-size:11px;font-weight:' + (lHomeIsMe ? 700 : 500) + ';color:#fff;text-align:right;flex:1;'
      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + lHomeName + '</div>';
    h += '<div style="font-size:18px;font-weight:900;color:#fff;flex-shrink:0;background:rgba(0,0,0,.3);'
      + 'border-radius:8px;padding:3px 10px;letter-spacing:1px">' + lHomeScore + '–' + lAwayScore + '</div>';
    h += '<div style="font-size:11px;font-weight:' + (!lHomeIsMe ? 700 : 500) + ';color:#fff;text-align:left;flex:1;'
      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + lAwayName + '</div>';
    h += '</div>';
    // Giornata e casa/trasferta
    h += '<div style="text-align:center;font-size:10px;color:#fff;opacity:.85;margin-bottom:10px">'
      + 'G' + lastMatch.round + ' · ' + (lih ? t('common.home') : t('common.away')) + '</div>';
    // Pulsante
    h += '<button onclick="showMatchDetailPopup(' + lMIdx + ')"'
      + ' style="width:100%;padding:7px 0;font-size:11px;font-weight:700;border-radius:8px;'
      + 'background:transparent;border:1.5px solid rgba(120,80,200,.5);color:rgba(180,140,255,.9);'
      + 'cursor:pointer;transition:border-color .15s;letter-spacing:.3px"'
      + ' onmouseover="this.style.borderColor=\'rgba(180,140,255,.8)\'"'
      + ' onmouseout="this.style.borderColor=\'rgba(120,80,200,.5)\'">🔍 ' + t('common.details') + '</button>';
  } else {
    h += '<div style="text-align:center;font-size:12px;color:rgba(255,255,255,.25);padding:20px 0">Nessuna partita ancora giocata.</div>';
  }
  h += '</div></div>';

  // ── Matchday Hub (2/3) ──
  h += '<div>';

  if (G.phase === 'regular') {
    if (nm && nextOpp) {
      var ih = nm.home === G.myId;
      var homeTeamName = ih ? G.myTeam.name : nextOpp.name;
      var awayTeamName = ih ? nextOpp.name   : G.myTeam.name;
      var homeTeamId   = ih ? G.myId         : nextOpp.id;
      var awayTeamId   = ih ? nextOpp.id      : G.myId;

      h += '<div style="position:relative;border-radius:16px;overflow:hidden;margin-bottom:14px;'
        + 'background:linear-gradient(135deg,#0d2a4a 0%,#0a1e38 40%,#0d2a4a 100%);'
        + 'border:1px solid rgba(0,194,255,.2);min-height:140px">';

      // Texture acqua di sfondo
      h += '<div style="position:absolute;inset:0;opacity:.07;background:repeating-linear-gradient('
        + '45deg,transparent,transparent 8px,rgba(0,194,255,.5) 8px,rgba(0,194,255,.5) 9px);pointer-events:none"></div>';

      // Radial glow
      h += '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
        + 'width:300px;height:200px;background:radial-gradient(ellipse,rgba(0,194,255,.12) 0%,transparent 70%);pointer-events:none"></div>';

      h += '<div style="position:relative;padding:16px 20px">';

      // Header hub
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        + '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1.2px">' + t('extra.nextMatch') + '</div>'        + '<div style="font-size:10px;font-weight:700;color:#00c2ff;text-transform:uppercase;letter-spacing:1.2px">' + t('dash.matchday') + '</div>'
        + '<div style="font-size:11px;color:rgba(255,255,255,.45);background:rgba(0,194,255,.1);'
        + 'border:1px solid rgba(0,194,255,.2);border-radius:6px;padding:2px 8px">'
        + (ih ? t('common.home') : t('common.away')) + '</div>'
        + '</div>';

      // Squadre
      h += '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px">';

      // Team badge home con logo
      var _homeTeam = G.teams.find(function(t){return t.id===homeTeamId;}) || {abbr:'?'};
      h += '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;cursor:pointer" onclick="showTeamRosterPopup(\'' + homeTeamId + '\')">'
        + '<div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.25);'
        + 'display:flex;align-items:center;justify-content:center;overflow:hidden">'
        + (_homeTeam.logo
            ? '<img src="' + _homeTeam.logo + '" style="width:52px;height:52px;object-fit:contain;border-radius:50%" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" /><span style="display:none;font-size:11px;font-weight:800;color:#fff">' + _homeTeam.abbr + '</span>'
            : '<span style="font-size:11px;font-weight:800;color:#fff">' + _homeTeam.abbr + '</span>')
        + '</div>'
        + '<div style="font-size:12px;font-weight:700;color:#fff;text-align:center">' + homeTeamName + '</div>'
        + '</div>';

      // VS
      h += '<div style="display:flex;flex-direction:column;align-items:center;gap:2px">'
        + '<div style="font-size:22px;font-weight:900;color:rgba(255,255,255,.2)">vs</div>'
        + '<div style="font-size:10px;color:rgba(255,255,255,.35)">Giornata ' + nm.round + '</div>'
        + '</div>';

      // Team badge away con logo
      var _awayTeam = G.teams.find(function(t){return t.id===awayTeamId;}) || {abbr:'?'};
      h += '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;cursor:pointer;text-align:center" onclick="showTeamRosterPopup(\'' + awayTeamId + '\')">'
        + '<div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.25);'
        + 'display:flex;align-items:center;justify-content:center;overflow:hidden">'
        + (_awayTeam.logo
            ? '<img src="' + _awayTeam.logo + '" style="width:52px;height:52px;object-fit:contain;border-radius:50%" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" /><span style="display:none;font-size:11px;font-weight:800;color:#fff">' + _awayTeam.abbr + '</span>'
            : '<span style="font-size:11px;font-weight:800;color:#fff">' + _awayTeam.abbr + '</span>')
        + '</div>'
        + '<div style="font-size:12px;font-weight:700;color:#fff">' + awayTeamName + '</div>'
        + '</div>';

      h += '</div>';

      // Pulsanti
      h += '<div style="display:flex;gap:8px;justify-content:center">';

      // Ghost button - Convocazioni
      var nm2 = nm;
      h += '<button onclick="openLineup(G.schedule.find(function(m){return(m.home===G.myId||m.away===G.myId)&&!m.played;}),G.schedule.find(function(m){return(m.home===G.myId||m.away===G.myId)&&!m.played;})&&G.schedule.find(function(m){return(m.home===G.myId||m.away===G.myId)&&!m.played;}).home===G.myId,G.teams.find(function(t){var m=G.schedule.find(function(x){return(x.home===G.myId||x.away===G.myId)&&!x.played;});return t.id===(m?(m.home===G.myId?m.away:m.home):null);}))"'
        + ' style="padding:9px 22px;font-size:12px;font-weight:700;border-radius:8px;'
        + 'background:transparent;border:2px solid rgba(255,255,255,.4);color:#fff;cursor:pointer;letter-spacing:.3px;'
        + 'transition:border-color .15s"'
        + ' onmouseover="this.style.borderColor=\'rgba(255,255,255,.8)\'"'
        + ' onmouseout="this.style.borderColor=\'rgba(255,255,255,.4)\'">'
        + '📋 ' + t('lineup.title') + '</button>';

      // Primary button - Simula
      h += '<button onclick="confirmSimNextRound()"'
        + ' style="padding:9px 24px;font-size:12px;font-weight:800;border-radius:8px;letter-spacing:.3px;'
        + 'background:linear-gradient(135deg,#ff8c42,#e65100);border:none;color:#fff;cursor:pointer;'
        + 'box-shadow:0 3px 14px rgba(255,140,66,.4);transition:transform .15s,box-shadow .15s"'
        + ' onmouseover="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 5px 18px rgba(255,140,66,.55)\'"'
        + ' onmouseout="this.style.transform=\'none\';this.style.boxShadow=\'0 3px 14px rgba(255,140,66,.4)\'">'
        + '▶ ' + t('dash.simulate') + '</button>';

      h += '</div></div></div>';

    } else {
      h += '<div style="background:rgba(46,204,113,.08);border:1px solid rgba(46,204,113,.3);border-radius:12px;'
        + 'padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px">'
        + '<span style="font-size:20px">🏆</span>'
        + '<div style="flex:1"><div style="font-weight:700;color:#2ecc71">Regular season conclusa!</div>'
        + '<div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:2px">Passa alla fase finale.</div></div>'
        + '<button onclick="initPostSeason();showTab(\'playoff\')" style="padding:8px 16px;font-size:12px;font-weight:700;'
        + 'border-radius:8px;background:linear-gradient(135deg,#2e7d32,#1b5e20);border:none;color:#fff;cursor:pointer">'
        + 'Playoff & Playout →</button>'
        + '</div>';
    }
  } else if (G.phase === 'playoff' || G.phase === 'playout') {
    h += '<div style="background:rgba(255,140,66,.08);border:1px solid rgba(255,140,66,.3);border-radius:12px;'
      + 'padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px">'
      + '<span style="font-size:20px">⚡</span>'
      + '<div style="flex:1"><div style="font-weight:700;color:#ff8c42">Fase finale in corso.</div></div>'
      + '<button onclick="showTab(\'playoff\')" style="padding:8px 16px;font-size:12px;font-weight:700;'
      + 'border-radius:8px;background:linear-gradient(135deg,#ff8c42,#e65100);border:none;color:#fff;cursor:pointer">'
      + 'Vai ai Playoff →</button>'
      + '</div>';
  } else {
    h += '<div style="background:rgba(46,204,113,.08);border:1px solid rgba(46,204,113,.3);border-radius:12px;'
      + 'padding:14px 16px;margin-bottom:14px">'
      + '<div style="font-weight:700;color:#2ecc71;margin-bottom:8px">🏆 Stagione ' + (G.seasonNumber||1) + ' conclusa! Budget: ' + formatMoney(G.budget) + '</div>'
      + '<div style="display:flex;gap:8px">'
      + '<button onclick="showTab(\'goals\')" style="padding:8px 14px;font-size:12px;font-weight:700;border-radius:8px;'
      + 'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;cursor:pointer">📋 Obiettivi</button>'
      + '<button onclick="_confirmNewSeason()" style="padding:8px 14px;font-size:12px;font-weight:700;border-radius:8px;'
      + 'background:linear-gradient(135deg,#2e7d32,#1b5e20);border:none;color:#fff;cursor:pointer">🤽 Nuova Stagione →</button>'
      + '</div></div>';
  }

  // Chiudi wrapper 2/3 e grid 1/3+2/3
  h += '</div></div>';

  // ═══════════════════════════════════════════
  // LAYOUT A 2 COLONNE: Notizie | Focus
  // ═══════════════════════════════════════════
  h += '<div style="display:grid;grid-template-columns:1fr 240px;gap:12px">';

  // ── COLONNA SINISTRA: Notizie ──
  var NEWS_PER_PAGE = 15, NEWS_MAX = 90;
  var allMsgs   = G.msgs.slice(-NEWS_MAX).reverse();
  var newsPage  = G._newsPage || 0;
  var totalPgs  = Math.max(1, Math.ceil(allMsgs.length / NEWS_PER_PAGE));
  var safePg    = Math.min(newsPage, totalPgs - 1);
  var pageItems = allMsgs.slice(safePg * NEWS_PER_PAGE, (safePg + 1) * NEWS_PER_PAGE);

  h += '<div style="background:' + _wBg + ';border:1px solid ' + _wBorder + ';border-radius:14px;overflow:hidden">';

  // Header notizie
  h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;'
    + 'border-bottom:1px solid rgba(255,255,255,.06)">'
    + '<div style="font-size:11px;font-weight:700;color:' + _wText + ';text-transform:uppercase;letter-spacing:.7px">' + t('dash.news').toUpperCase() + '</div>'
    + '<div style="display:flex;align-items:center;gap:5px">'
    + '<span style="font-size:11px;color:' + _wMuted + '">' + (safePg+1) + '/' + totalPgs + '</span>'
    + '<button onclick="G._newsPage=Math.max(0,(G._newsPage||0)-1);renderDash()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:2px 8px;color:rgba(255,255,255,.5);font-size:12px;' + (safePg===0?'opacity:.3;pointer-events:none;':'cursor:pointer;') + '">‹</button>'
    + '<button onclick="G._newsPage=Math.min(' + (totalPgs-1) + ',(G._newsPage||0)+1);renderDash()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:2px 8px;color:rgba(255,255,255,.5);font-size:12px;' + (safePg>=totalPgs-1?'opacity:.3;pointer-events:none;':'cursor:pointer;') + '">›</button>'
    + '</div></div>';

  // Feed notizie
  h += '<div style="padding:6px 0">';
  if (pageItems.length === 0) {
    h += '<div style="padding:16px;font-size:12px;color:' + _wMuted + ';text-align:center">Nessuna notizia ancora.</div>';
  } else {
    pageItems.forEach(function(m) {
      var tag      = msgTag(m);
      var tagLabel = tag[0];
      var tagColor = tag[1];

      // Trova categoria dalla config popup
      var _cfg  = typeof getConfig === 'function' ? getConfig() : { newsPopup: {} };
      var _cats = typeof NEWS_CATEGORIES !== 'undefined' ? NEWS_CATEGORIES : [];
      var _cat  = null;
      for (var _ci = 0; _ci < _cats.length; _ci++) {
        if (_cats[_ci].regex && _cats[_ci].regex.test(m)) { _cat = _cats[_ci]; break; }
      }
      if (!_cat && _cats.length) _cat = _cats[_cats.length - 1];
      var _catId   = _cat ? _cat.id : 'news';
      var _popupOn = _cfg.newsPopup[_catId] !== false;

      // Cerca indice partita per risultati
      var mIdx = -1;
      var isResult = /risultato|result|wins|loses|draws|vince|perde|pareggi/i.test(tagLabel);
      if (isResult && G.schedule) {
        var _rndM = m.match(/G(\d+):/);
        var _rnd  = _rndM ? parseInt(_rndM[1]) : null;
        if (_rnd !== null) {
          var _found = G.schedule.findIndex(function(s) {
            return s.round === _rnd && s.played && (s.home === G.myId || s.away === G.myId);
          });
          if (_found >= 0) mIdx = _found;
        }
      }

      // Click handler basato sulla config
      var rowClick;
      if (!_popupOn) {
        // Popup disabilitato per questa categoria
        rowClick = ' style="cursor:default"';
      } else if (isResult && mIdx >= 0) {
        // Risultato con partita trovata → popup dettaglio partita
        rowClick = ' onclick="showMatchDetailPopup(' + mIdx + ')" style="cursor:pointer"';
      } else {
        // Tutte le altre notizie con popup abilitato → popup testo generico
        if (!window._newsCache) window._newsCache = [];
        var nIdx = window._newsCache.length;
        window._newsCache.push({ text: m, color: tagColor, label: tagLabel });
        rowClick = ' onclick="showNewsPopupIdx(' + nIdx + ')" style="cursor:pointer"';
      }

      h += '<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 14px;'        + 'border-bottom:1px solid rgba(255,255,255,.04);transition:background .12s"'        + rowClick        + (_popupOn ? ' onmouseover="this.style.background=\'rgba(255,255,255,.03)\'" onmouseout="this.style.background=\'transparent\'"' : '')        + '>'        + '<span style="flex-shrink:0;margin-top:1px;font-size:9px;font-weight:800;padding:2px 5px;border-radius:4px;'        + 'background:' + tagColor + '33;color:' + tagColor + ';border:1px solid ' + tagColor + '55;letter-spacing:.3px;white-space:nowrap">'        + tagLabel + '</span>'        + '<span style="font-size:12px;color:' + _wText + ';line-height:1.45">' + _linkTeamNames(m) + '</span>'        + '</div>';
    });
  }
  h += '</div></div>';

  // ── COLONNA DESTRA: Focus giocatore + Top Scorer ──
  h += '<div style="display:flex;flex-direction:column;gap:10px">';

  // Focus giocatore
  if (focusPlayer) {
    var fp = focusPlayer;
    var mc = fp.morale > 70 ? '#2ecc71' : fp.morale > 40 ? '#f0c040' : '#e74c3c';
    var ratings = (fp.lastRatings || []).filter(function(r) { return r !== null; });
    var avgR = ratings.length ? (ratings.reduce(function(s,r){return s+r;},0)/ratings.length).toFixed(1) : null;
    h += '<div style="background:' + _wBg + ';border:1px solid ' + _wBorder + ';border-radius:14px;padding:14px">'
      + '<div style="font-size:10px;font-weight:700;color:' + _wTitle + ';text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px">' + t('dash.focusPlayer').toUpperCase() + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
      + '<div style="width:44px;height:44px;border-radius:10px;background:rgba(0,194,255,.1);border:1px solid rgba(0,194,255,.2);'
      + 'display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🤽</div>'
      + '<div>'
      + '<div style="font-size:14px;font-weight:700;color:' + _wText + '">' + fp.name + '</div>'
      + '<div style="font-size:11px;color:' + _wMuted + '">' + fp.role + ' · ' + fp.age + 'a · OVR ' + fp.overall + '</div>'
      + '</div></div>'
      + '<div style="margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:10px;color:' + _wLabel + ';font-weight:600">' + t('roster.morale').toUpperCase() + '</span>'
      + '<span style="font-size:10px;font-weight:700;color:' + mc + '">' + fp.morale + '%</span>'
      + '</div>'
      + '<div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden">'
      + '<div style="width:' + fp.morale + '%;height:100%;background:' + mc + ';box-shadow:0 0 6px ' + mc + '"></div></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px">'
      + '<span style="color:' + _wLabel + ';font-weight:600">' + t('roster.apps') + '</span>'
      + '<span style="font-weight:700;color:' + (avgR >= 7.5 ? '#2ecc71' : avgR >= 6.5 ? '#f0c040' : '#e74c3c') + '">' + (avgR || '—') + '</span>'
      + '</div>'
      + (fp.goals > 0 ? '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px">'
        + '<span style="color:' + _wLabel + ';font-weight:600">' + t('extra.seasonGoals') + '</span>'        + '<span style="font-weight:700;color:#4db6ff">' + fp.goals + ' ⚽</span></div>' : '')
      + '</div>';
  }

  // Top Scorer
  if (topScorer && (topScorer.goals || 0) > 0) {
    var ts = topScorer;
    h += '<div style="background:' + _wBg + ';border:1px solid ' + _wBorder + ';border-radius:14px;padding:14px">'
      + '<div style="font-size:10px;font-weight:700;color:' + _wTitle + ';text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px">' + t('dash.topScorer').toUpperCase() + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<div style="width:38px;height:38px;border-radius:8px;background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.25);'
      + 'display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚽</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:700;color:' + _wText + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + ts.name + '</div>'
      + '<div style="font-size:11px;color:' + _wMuted + '">' + ts.role + ' · ' + ts.age + 'a</div>'
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0">'
      + '<div style="font-size:22px;font-weight:900;color:#f0c040;line-height:1">' + ts.goals + '</div>'
      + '<div style="font-size:9px;color:' + _wMuted + ';font-weight:600">GOL</div>'
      + '</div></div></div>';
  }

  h += '</div>'; // fine colonna destra
  h += '</div>'; // fine griglia 2 colonne

  document.getElementById('tab-dash').innerHTML = h;
}


// ── Ordinamento Rosa ──────────────────────────
function _rosaSortClick(key) {
  if (!G._rosaSort) G._rosaSort = { key: null, dir: 1 };
  if (G._rosaSort.key === key) G._rosaSort.dir *= -1;
  else { G._rosaSort.key = key; G._rosaSort.dir = 1; }
  G._rosaPage = 0;
  renderRosa();
}

function _rosaSortArrow(key) {
  if (!G._rosaSort || G._rosaSort.key !== key)
    return '<span style="color:rgba(255,255,255,.18);font-size:8px">⇅</span>';
  return G._rosaSort.dir === 1
    ? '<span style="color:#00c2ff;font-size:8px">▲</span>'
    : '<span style="color:#00c2ff;font-size:8px">▼</span>';
}

// ════════════════════════════════════════════
// ROSA
// ════════════════════════════════════════════

// ── Popup notizia generica ────────────────────────────────────────────────
function showNewsPopupIdx(idx) {
  var item = window._newsCache && window._newsCache[idx];
  if (!item) return;
  showNewsPopup(item.text, item.color, item.label);
}
window.showNewsPopupIdx = showNewsPopupIdx;

function showNewsPopup(text, color, label) {
  var existing = document.getElementById('news-popup-overlay');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'news-popup-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:600;backdrop-filter:blur(6px)';

  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid ${color}44;border-radius:16px;
                padding:24px 28px;max-width:420px;width:92%;position:relative;
                box-shadow:0 8px 40px rgba(0,0,0,.5),0 0 0 1px ${color}22">
      <!-- Badge + close -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:5px;
                     background:${color}22;color:${color};border:1px solid ${color}44;
                     letter-spacing:.4px">${label}</span>
        <button onclick="document.getElementById('news-popup-overlay').remove()"
                style="background:none;border:none;font-size:20px;cursor:pointer;
                       color:var(--muted);line-height:1;padding:0">✕</button>
      </div>
      <!-- Testo notizia -->
      <div style="font-size:14px;color:var(--text);line-height:1.7;word-break:break-word">
        ${text.split('\n').join('<br>')}
      </div>
      <!-- Bottone chiudi -->
      <button onclick="document.getElementById('news-popup-overlay').remove()"
              style="width:100%;margin-top:20px;padding:10px;
                     background:${color}22;border:1px solid ${color}44;
                     border-radius:8px;color:${color};font-weight:700;
                     font-size:13px;cursor:pointer;transition:background .15s"
              onmouseover="this.style.background='${color}33'"
              onmouseout="this.style.background='${color}22'">
        ${t('common.close')}
      </button>
    </div>`;

  ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
window.showNewsPopup = showNewsPopup;

// ── Popup generico multi-messaggio per categoria ──────────────────────
// Usato dalla coda popup per injuries, recovery, contract, finance, playoff, news, market testuale
function _showMsgCategoryPopup(catId, msgs) {
  var existing = document.getElementById('msgcat-popup');
  if (existing) existing.remove();

  // Trova colore e label dalla categoria
  var cats  = typeof NEWS_CATEGORIES !== 'undefined' ? NEWS_CATEGORIES : [];
  var cat   = cats.find(function(c) { return c.id === catId; });
  var color = cat ? cat.color : '#455a64';

  // Label badge — stessa logica di msgTag
  var label = (function() {
    if (catId === 'injuries')  return t('nav.training').toUpperCase();
    if (catId === 'recovery')  return t('goals.inProgress').toUpperCase();
    if (catId === 'national')  return t('national.titleShort').toUpperCase();
    if (catId === 'playoff')   return t('nav.playoff').toUpperCase();
    if (catId === 'contract')  return t('roster.contract').toUpperCase();
    if (catId === 'market')    return t('nav.market').toUpperCase();
    if (catId === 'finance')   return t('nav.finance').toUpperCase();
    if (catId === 'training')  return t('nav.training').toUpperCase();
    if (catId === 'news')      return t('dash.news').toUpperCase();
    return catId.toUpperCase();
  })();

  var rows = msgs.map(function(m) {
    return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px;color:var(--text);line-height:1.5">'
      + m.split('\n').join('<br>')
      + '</div>';
  }).join('');

  var ov = document.createElement('div');
  ov.id = 'msgcat-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:700;backdrop-filter:blur(6px)';

  ov.innerHTML = '<div style="background:var(--panel);border:1px solid ' + color + '44;border-radius:16px;'
    + 'padding:24px 28px;max-width:440px;width:92%;max-height:80vh;overflow-y:auto;'
    + 'box-shadow:0 8px 40px rgba(0,0,0,.5)">'

    // Header badge + chiudi
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    + '<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:5px;'
    + 'background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;letter-spacing:.4px">'
    + label + '</span>'
    + '<button onclick="_closeMsgCatPopupAndNext()" '
    + 'style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);line-height:1;padding:0">✕</button>'
    + '</div>'

    // Lista messaggi
    + '<div style="margin-bottom:16px">' + rows + '</div>'

    // Bottone chiudi
    + '<button onclick="_closeMsgCatPopupAndNext()" '
    + 'style="width:100%;padding:10px;background:' + color + '22;border:1px solid ' + color + '44;'
    + 'border-radius:8px;color:' + color + ';font-weight:700;font-size:13px;cursor:pointer">'
    + t('common.close') + '</button>'
    + '</div>';

  ov.onclick = function(e) { if (e.target === ov) _closeMsgCatPopupAndNext(); };
  document.body.appendChild(ov);
}
window._showMsgCategoryPopup = _showMsgCategoryPopup;

function _closeMsgCatPopupAndNext() {
  var popup = document.getElementById('msgcat-popup');
  if (popup) popup.remove();
  setTimeout(function() {
    if (typeof _nextPopupInQueue === 'function') _nextPopupInQueue();
  }, 200);
}
window._closeMsgCatPopupAndNext = _closeMsgCatPopupAndNext;

function renderRosa() {
  const roster = G.rosters[G.myId];
  const tlSet  = new Set((G.transferList || []).map(function(e) { return e.rosterIdx; }));
  const PER_PAGE = 20;
  if (G._rosaPage === undefined) G._rosaPage = 0;
  if (!G._rosaSort) G._rosaSort = { key: null, dir: 1 };

  // Ordine fisso ruoli e mano per sort
  var ROLE_ORDER = { POR: 0, CEN: 1, DIF: 2, ATT: 3, CB: 4 };
  var HAND_ORDER = { R: 0, L: 1, AMB: 2 };

  // Costruisce array con indici originali e applica ordinamento
  var indexed = roster.map(function(p, i) { return { p: p, i: i }; });
  if (G._rosaSort.key) {
    indexed.sort(function(a, b) {
      var pa = a.p, pb = b.p, d = G._rosaSort.dir;
      switch (G._rosaSort.key) {
        case 'role':    return d * ((ROLE_ORDER[pa.role] ?? 9) - (ROLE_ORDER[pb.role] ?? 9));
        case 'age':     return d * ((pa.age || 0) - (pb.age || 0));
        case 'hand':    return d * ((HAND_ORDER[pa.hand] ?? 9) - (HAND_ORDER[pb.hand] ?? 9));
        case 'fitness': return d * ((pa.fitness || 0) - (pb.fitness || 0));
        case 'overall': return d * ((pa.overall || 0) - (pb.overall || 0));
        case 'goals':   return d * ((pa.goals || 0) - (pb.goals || 0));
        case 'assists': return d * ((pa.assists || 0) - (pb.assists || 0));
        case 'value':   return d * ((pa.value || 0) - (pb.value || 0));
        default: return 0;
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(indexed.length / PER_PAGE));
  const safePage   = Math.min(G._rosaPage, totalPages - 1);
  const pageItems  = indexed.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  // OVR circle SVG
  function ovrCircle(ovr) {
    var col = ovr >= 80 ? '#00c2ff' : ovr >= 65 ? '#2ecc71' : ovr >= 50 ? '#f0c040' : '#e74c3c';
    var r = 15, circ = 2 * Math.PI * r;
    var dash = (circ * ovr / 99).toFixed(1);
    var gap  = (circ - dash).toFixed(1);
    return '<svg width="40" height="40" style="flex-shrink:0;display:block">'
      + '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/>'
      + '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="3"'
      + ' stroke-dasharray="' + dash + ' ' + gap + '" stroke-linecap="round"'
      + ' transform="rotate(-90 20 20)" style="filter:drop-shadow(0 0 5px ' + col + ')"/>'
      + '<text x="20" y="25" text-anchor="middle" font-size="11" font-weight="800" fill="' + col + '">' + ovr + '</text>'
      + '</svg>';
  }

  // Sparkline dai voti
  function sparkline(ratings) {
    var all = ratings || [];
    // all può contenere null (non convocato/non giocato) o numeri (voto)
    if (all.length === 0) return '<span style="color:rgba(255,255,255,.2);font-size:10px;letter-spacing:2px">· · · ·</span>';

    var pts = all.filter(function(r) { return r !== null; });
    if (pts.length === 0) return '<span style="color:rgba(255,255,255,.2);font-size:10px;letter-spacing:2px">· · · ·</span>';

    // Con un solo voto mostriamo solo il numero colorato
    if (all.length === 1 && pts.length === 1) {
      var v0 = pts[0];
      var sc0 = v0 >= 7.5 ? '#2ecc71' : v0 >= 6.5 ? '#f0c040' : v0 >= 5.5 ? '#7a9bb5' : '#e74c3c';
      return '<span style="font-size:12px;font-weight:800;color:' + sc0 + '">' + v0.toFixed(1) + '</span>';
    }

    var W = 72, H = 28, padX = 4, padY = 6;
    // Scala basata solo sui voti reali
    var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), rng = mx - mn || 0.1;
    // Posizione X uniforme su tutte le partite (inclusi null)
    var N = all.length;
    var xFor = function(j) { return padX + j * (W - padX*2) / Math.max(1, N - 1); };
    var yFor = function(v) { return H - padY - (v - mn) / rng * (H - padY*2); };

    var last = pts[pts.length - 1];
    var col  = last >= 7.5 ? '#2ecc71' : last >= 6.5 ? '#f0c040' : last >= 5.5 ? '#7a9bb5' : '#e74c3c';

    var svg = '<svg width="' + W + '" height="' + H + '" style="overflow:visible;display:block;cursor:default">';

    // Costruisce segmenti di linea spezzati: salta i null
    // Ogni segmento connette voti consecutivi non-null
    var segStart = null;
    var segPoints = [];
    all.forEach(function(v, j) {
      var x = xFor(j);
      if (v !== null) {
        var y = yFor(v);
        segPoints.push({ x: x, y: y, v: v });
        if (segStart === null) segStart = segPoints.length - 1;
      } else {
        // Null: chiudi il segmento corrente se ha almeno 2 punti
        segStart = null;
      }
    });

    // Ridisegna i segmenti in modo corretto: linee tra punti consecutivi non-null
    var lineSegs = []; // array di array di punti connessi
    var currentSeg = [];
    all.forEach(function(v, j) {
      if (v !== null) {
        currentSeg.push({ x: xFor(j), y: yFor(v), v: v, j: j });
      } else {
        if (currentSeg.length > 0) { lineSegs.push(currentSeg); currentSeg = []; }
      }
    });
    if (currentSeg.length > 0) lineSegs.push(currentSeg);

    // Area fill: solo per l'ultimo segmento (quello più recente)
    if (lineSegs.length > 0) {
      var lastSeg = lineSegs[lineSegs.length - 1];
      if (lastSeg.length >= 2) {
        var areaD = 'M' + lastSeg[0].x.toFixed(1) + ',' + lastSeg[0].y.toFixed(1);
        lastSeg.forEach(function(pt, k) { if (k > 0) areaD += ' L' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1); });
        areaD += ' L' + lastSeg[lastSeg.length-1].x.toFixed(1) + ',' + (H-padY+2)
               + ' L' + lastSeg[0].x.toFixed(1) + ',' + (H-padY+2) + ' Z';
        svg += '<path d="' + areaD + '" fill="' + col + '" opacity=".12"/>';
      }
    }

    // Linee per ogni segmento continuo
    lineSegs.forEach(function(seg) {
      if (seg.length < 2) return;
      var poly = seg.map(function(pt) { return pt.x.toFixed(1) + ',' + pt.y.toFixed(1); }).join(' ');
      svg += '<polyline points="' + poly + '" fill="none" stroke="' + col + '" stroke-width="1.8"'
        + ' stroke-linejoin="round" stroke-linecap="round"/>';
    });

    // Punti per tutte le partite
    all.forEach(function(v, j) {
      var cx = xFor(j);
      var isLast = j === all.length - 1;
      if (v !== null) {
        // Punto voto reale
        var cy = yFor(v);
        var pc = v >= 7.5 ? '#2ecc71' : v >= 6.5 ? '#f0c040' : v >= 5.5 ? '#7a9bb5' : '#e74c3c';
        var r  = isLast ? 3 : 2;
        var labelY = cy - 5;
        if (labelY < 2) labelY = cy + 10;
        svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r + '" fill="' + pc + '"'
          + (isLast ? ' style="filter:drop-shadow(0 0 3px ' + pc + ')"' : '')
          + '><title>Voto: ' + v.toFixed(1) + '</title></circle>';
        svg += '<text x="' + cx.toFixed(1) + '" y="' + labelY.toFixed(1) + '"'
          + ' text-anchor="middle" font-size="7" font-weight="700" fill="' + pc + '"'
          + ' style="pointer-events:none;text-shadow:0 0 3px rgba(0,0,0,.8)">'
          + v.toFixed(1) + '</text>';
      } else {
        // Punto null: piccolo trattino grigio a metà altezza, con tooltip
        var midY = (H / 2).toFixed(1);
        svg += '<line x1="' + (cx-2).toFixed(1) + '" y1="' + midY + '" x2="' + (cx+2).toFixed(1) + '" y2="' + midY + '"'
          + ' stroke="rgba(255,255,255,.2)" stroke-width="1.5" stroke-linecap="round">'
          + '<title>' + t('extra.notCalled') + '</title></line>';
      }
    });

    svg += '</svg>';
    return svg;
  }

  // Morale emoji + barra
  function moraleBar(m) {
    var em  = m >= 80 ? '😄' : m >= 60 ? '🙂' : m >= 40 ? '😐' : '😟';
    var col = m >= 70 ? '#2ecc71' : m >= 40 ? '#f0c040' : '#e74c3c';
    return '<div style="display:flex;align-items:center;gap:4px">'
      + '<span style="font-size:12px">' + em + '</span>'
      + '<span style="font-size:10px;color:' + col + ';font-weight:700">' + m + '%</span>'
      + '</div>';
  }

  // Forma: cerchio SVG come OVR
  function formaBar(f) {
    var fv  = Math.min(100, Math.max(0, f || 0));  // clamp 0-100
    var col = fv > 70 ? '#2ecc71' : fv > 45 ? '#f0c040' : '#e74c3c';
    var r = 15, circ = 2 * Math.PI * r;
    var dash = (circ * fv / 100).toFixed(1);
    var gap  = Math.max(0, circ - parseFloat(dash)).toFixed(1);
    return '<svg width="40" height="40" style="flex-shrink:0;display:block">'
      + '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/>'
      + '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="3"'
      + ' stroke-dasharray="' + dash + ' ' + gap + '" stroke-linecap="round"'
      + ' transform="rotate(-90 20 20)" style="filter:drop-shadow(0 0 4px ' + col + ')"/>'
      + '<text x="20" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="' + col + '">' + fv + '%</text>'
      + '</svg>';
  }

  var h = '';

  // ── Header ──
  h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(0,194,255,.12)">'
    + '<div style="width:38px;height:38px;border-radius:10px;background:rgba(0,194,255,.1);border:1px solid rgba(0,194,255,.25);'
    + 'display:flex;align-items:center;justify-content:center;font-size:18px">🤽</div>'
    + '<div>'
    + '<div style="font-size:17px;font-weight:800;color:#fff;letter-spacing:-.3px">'
    + G.myTeam.name
    + ' <span style="color:rgba(0,194,255,.6);font-weight:400">— Rosa</span>'
    + ' <span style="font-size:12px;font-weight:500;color:rgba(255,255,255,.3)">(' + roster.length + ')</span></div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,.3);margin-top:1px">'
    + 'Clicca un giocatore per i dettagli &middot; <strong style="color:rgba(255,255,255,.45)">Vendi</strong> nel modale per il mercato</div>'
    + '</div></div>';

  // ── Intestazioni con ordinamento ──
  function _hdr(label, key, align) {
    var base = 'cursor:pointer;user-select:none;display:flex;align-items:center;gap:2px;'
      + (align === 'center' ? 'justify-content:center;' : '');
    return '<div onclick="_rosaSortClick(\'' + key + '\')" style="' + base + '">'
      + label + ' ' + _rosaSortArrow(key) + '</div>';
  }
  h += '<div style="display:grid;grid-template-columns:1.8fr 62px 54px 40px 36px 50px 98px 64px 38px 38px 80px 96px;'
    + 'gap:0 6px;padding:0 10px 5px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.28)">'
    + '<div>' + t('roster.title') + '</div>'    + _hdr(t('roster.sortRole'), 'role', '')
    + _hdr(t('roster.sortHand'), 'hand', '')
    + '<div>Naz</div>'
    + _hdr(t('common.age'), 'age', '')
    + _hdr(t('roster.sortOvr'), 'overall', 'center')
    + '<div>' + t('roster.morale') + '</div>'
    + _hdr(t('roster.fitness'), 'fitness', '')
    + _hdr(t('common.goals'), 'goals', 'center')
    + _hdr('Ass', 'assists', 'center')
    + '<div style="color:rgba(240,192,64,.5)">Voti</div>'
    + _hdr(t('roster.value'), 'value', '')
    + '</div>';

  // ── Righe giocatori ──
  var ROLE_COL = { POR:'#e53935', DIF:'#2e7d32', CEN:'#e65100', ATT:'#7b1fa2', CB:'#1565c0' };

  pageItems.forEach(function(item) {
    var p = item.p, i = item.i;
    var onMarket = tlSet.has(i);
    var ritB  = _ritBadge(p);
    var scadB = _scadBadge(p);
    var infW  = p.injuryWeeks || '';
    var infB  = p.injured
      ? '<span style="font-size:9px;background:#e74c3c;color:#fff;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:3px">INF+' + (infW ? infW + 'G' : '') + '</span>'
      : '';
    var mkB = onMarket
      ? '<span style="font-size:9px;background:rgba(240,192,64,.18);color:#f0c040;font-weight:700;padding:1px 5px;border-radius:3px;border:1px solid rgba(240,192,64,.3);margin-left:3px">VENDITA</span>'
      : '';
    var rc  = ROLE_COL[p.role] || '#555';
    var hc  = p.hand === 'L' ? '#4db6ff' : p.hand === 'AMB' ? '#69f0ae' : 'rgba(255,255,255,.38)';
    var bg  = onMarket ? 'rgba(240,192,64,.05)' : p.injured ? 'rgba(229,57,53,.04)' : (p._national||p._nationalNext) ? 'rgba(21,101,192,.06)' : 'rgba(255,255,255,.025)';

    h += '<div onclick="showPlayerModal(' + i + ')" style="'
      + 'display:grid;grid-template-columns:1.8fr 62px 54px 40px 36px 50px 98px 64px 38px 38px 80px 96px;'
      + 'gap:0 6px;align-items:center;padding:7px 10px;margin-bottom:2px;'
      + 'background:' + bg + ';border:1px solid rgba(255,255,255,.05);'
      + 'border-radius:8px;cursor:pointer;transition:outline .12s;"'
      + ' onmouseover="this.style.outline=\'1.5px solid rgba(0,194,255,.35)\'"'
      + ' onmouseout="this.style.outline=\'none\'"'
      + '>';

    // Nome
    h += '<div style="min-width:0">'
      + '<div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + p.name + '</div>'
      + '<div style="display:flex;gap:2px;margin-top:2px;flex-wrap:wrap">' + ritB + scadB + infB + mkB + _diamondBadge(p) + _nationalBadge(p) + '</div>'
      + '</div>';

    // Ruolo badge (con secondRole affianco)
    var rc2 = p.secondRole ? (ROLE_COL[p.secondRole] || '#555') : null;
    h += '<div style="display:flex;flex-direction:row;align-items:center;gap:2px;flex-wrap:wrap">'
      + '<span style="display:inline-block;padding:1px 4px;border-radius:4px;font-size:9px;font-weight:800;'
      + 'background:' + rc + '33;color:' + rc + ';border:1px solid ' + rc + '66">' + p.role + '</span>'
      + (p.secondRole && rc2
          ? '<span style="display:inline-block;padding:1px 4px;border-radius:4px;font-size:9px;font-weight:700;'
            + 'background:' + rc2 + '22;color:' + rc2 + ';border:1px solid ' + rc2 + '44;opacity:.75">' + p.secondRole + '</span>'
          : '')
      + '</div>';

    // Mano — badge CSS come nel mercato
    var handCls = p.hand === 'AMB' ? 'AMB' : p.hand === 'L' ? 'L' : 'R';
    h += '<div><span class="badge ' + handCls + '">' + p.hand + '</span></div>';

    // Naz
    h += '<div style="font-size:11px;color:rgba(255,255,255,.38)">' + p.nat + '</div>';

    // Età
    h += '<div style="font-size:12px;color:rgba(255,255,255,.55)">' + p.age + '</div>';

    // OVR cerchio
    h += '<div style="display:flex;justify-content:center">' + ovrCircle(p.overall) + '</div>';

    // Morale
    h += '<div>' + moraleBar(p.morale) + '</div>';

    // Forma
    h += '<div>' + formaBar(p.fitness) + '</div>';

    // Gol
    var gc = p.goals > 0 ? '#1565c0' : 'rgba(128,128,128,.5)';
    var gcDark = p.goals > 0 ? '#4db6ff' : 'rgba(255,255,255,.25)';
    h += '<div style="text-align:center;font-size:12px;font-weight:700" class="stat-goals">' + (p.goals > 0 ? p.goals : '—') + '</div>';

    // Assist
    h += '<div style="text-align:center;font-size:12px;font-weight:700" class="stat-assists">' + (p.assists > 0 ? p.assists : '—') + '</div>';

    // Sparkline voti
    h += '<div>' + sparkline(p.lastRatings) + '</div>';

    // Valore
    h += '<div style="font-size:11px;color:rgba(255,255,255,.45);font-variant-numeric:tabular-nums;white-space:nowrap">'
      + '<span style="color:#f0c040">🪙</span> ' + formatMoney(p.value) + '</div>';

    h += '</div>';
  });

  // ── Paginazione ──
  if (totalPages > 1) {
    var prevD = safePage === 0 ? 'opacity:.3;pointer-events:none;' : 'cursor:pointer;';
    var nextD = safePage >= totalPages - 1 ? 'opacity:.3;pointer-events:none;' : 'cursor:pointer;';
    h += '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px;'
      + 'padding-top:8px;border-top:1px solid rgba(255,255,255,.06)">'
      + '<span style="font-size:11px;color:rgba(255,255,255,.3)">PAGINA ' + (safePage+1) + '/' + totalPages + '</span>'
      + '<button onclick="G._rosaPage=Math.max(0,(G._rosaPage||0)-1);renderRosa()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:3px 10px;color:rgba(255,255,255,.6);font-size:13px;' + prevD + '">&#8249;</button>'
      + '<button onclick="G._rosaPage=Math.min(' + (totalPages-1) + ',(G._rosaPage||0)+1);renderRosa()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:3px 10px;color:rgba(255,255,255,.6);font-size:13px;' + nextD + '">&#8250;</button>'
      + '</div>';
  }

  document.getElementById('tab-rosa').innerHTML = h;
}


// ── Popup conferma rinnovo con dettaglio bonus firma ────────────────
function showRenewalConfirm(rosterIdx, years, popupEl) {
  const p          = (G.rosters[G.myId] || [])[rosterIdx];
  if (!p) return;
  const salary     = _calcRenewalSalary(p);
  const total      = salary * years;
  const bonus      = Math.round(total * 0.10);
  const canAfford  = G.budget >= bonus;

  const existing = document.getElementById('renewal-confirm-popup');
  if (existing) existing.remove();

  const ov = document.createElement('div');
  ov.id = 'renewal-confirm-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:300;backdrop-filter:blur(4px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:360px;width:92%">
      <div style="font-size:15px;font-weight:700;color:var(--blue);margin-bottom:4px">🔄 ${t('roster.renewContract')}</div>
      <div style="font-size:13px;color:var(--text);margin-bottom:14px">${p.name}</div>
      <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <span style="color:var(--muted)">Durata</span><span style="font-weight:700">${years} ann${years===1?'o':'i'}</span>
        <span style="color:var(--muted)">Ingaggio/anno</span><span style="font-weight:700;color:var(--gold)">${formatMoney(salary)}</span>
        <span style="color:var(--muted)">Totale contratto</span><span style="font-weight:700">${formatMoney(total)}</span>
        <span style="color:var(--muted)">Bonus firma (10%)</span><span style="font-weight:700;color:var(--red)">${formatMoney(bonus)}</span>
      </div>
      <div style="background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.25);border-radius:8px;padding:10px;font-size:12px;color:var(--gold);margin-bottom:14px">
        💡 Il bonus firma di <strong>${formatMoney(bonus)}</strong> verrà detratto immediatamente dal budget al momento della proposta.
        Budget disponibile: <strong>${formatMoney(G.budget)}</strong>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="renewContractWithBonus(${rosterIdx},${years})" style="flex:1;padding:9px;font-size:13px;font-weight:700;border-radius:8px;background:linear-gradient(135deg,var(--blue),#0080cc);border:none;color:#fff;cursor:pointer">
          ${t('common.confirm')} →
        </button>
        <button onclick="document.getElementById('renewal-confirm-popup').remove()" style="padding:9px 14px;font-size:13px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--muted);cursor:pointer">
          ${t('common.cancel')}
        </button>
      </div>
    </div>`;
  ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}
window.showRenewalConfirm = showRenewalConfirm;

function showPlayerModal(i) {
  const p   = G.rosters[G.myId][i];
  const rl  = { POR:t('roles.POR'), DIF:t('roles.DIF'), CEN:'Centromediano', ATT:t('roles.ATT'), CB:t('roles.CB') };
  const cy  = p.contractYears !== undefined ? p.contractYears : 1;
  const isExpiring = cy <= 1 && !p._justRenewed;
  // Calcola ingaggio richiesto per rinnovo
  const renewSalary = _calcRenewalSalary(p);

  const ov = document.createElement('div');
  ov.id = 'player-modal-' + i;
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(4px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px 20px;max-width:380px;width:92%;max-height:92vh;overflow-y:auto">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--blue)">${p.name}${_ritBadge(p)}${_scadBadge(p)}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:5px">${p.nat} · ${p.age} anni</div>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            <span class="badge ${p.role==='POR'?'S':p.role==='DIF'?'A':p.role==='CB'?'B':'C'}">${p.role}</span>
            ${p.secondRole ? `<span class="badge ${p.secondRole==='POR'?'S':p.secondRole==='DIF'?'A':p.secondRole==='CB'?'B':'C'}" style="opacity:.85">${p.secondRole}</span>` : ''}
            <span class="badge ${p.hand==='AMB'?'AMB':p.hand==='L'?'L':'R'}">${p.hand==='AMB'?'AMB':p.hand==='L'?'L':'R'}</span>
          </div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <!-- Stats grid 2 colonne -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:12px">
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.overall')}</span><span style="font-size:16px;font-weight:700;color:var(--blue)">${p.overall}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.potential')}</span><span>${p.potential||'—'}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.value')}</span><span style="font-size:12px">${formatMoney(p.value)}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('common.salary')}</span><span style="font-size:12px">${formatMoney(p.salary)}/a</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.fitness')}</span><span style="color:${p.fitness>70?'var(--green)':'var(--gold)'}">${p.fitness}%</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.morale')}</span><span>${p.morale}%</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t(t('roster.apps'))}</span><span style="font-weight:700">${p.careerApps||0}</span></div>
        <div class="irow" style="margin:0"><span class="ilbl">${t('common.goals')} / ${t('common.assists')}</span><span>${p.goals||0} / ${p.assists||0}</span></div>
        ${(p.nationalCaps||0)>0 ? '<div class="irow" style="margin:0"><span class="ilbl">'+t('roster.nat')+'</span><span style="color:#1565c0;font-weight:700">'+(p.nationalCaps||0)+' caps ' + ({'ITA':'🇮🇹','CRO':'🇭🇷','SRB':'🇷🇸','HUN':'🇭🇺','GRE':'🇬🇷','MNE':'🇲🇪','ESP':'🇪🇸'}[p._nationalNat]||'🏳')+'</span></div>' : ''}
        <div class="irow" style="margin:0"><span class="ilbl">${t('roster.contract')}</span>
          <span style="font-weight:700;color:${isExpiring?'#7b2fbe':'var(--text)'}">
            ${cy} ${cy===1?t('common.year'):'anni'}${isExpiring?' ⚠️':''}
          </span>
        </div>
      </div>
      <!-- Attributi compatti -->
      <div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Attributi</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">
          ${[['att','ATT'],['def','DIF'],['spe','VEL'],['str','FOR'],['tec','TEC'],['res','RES']].map(([a,lbl]) =>
            '<div style="display:flex;align-items:center;gap:5px">' +
            '<span style="font-size:10px;color:var(--muted);width:24px">' + lbl + '</span>' +
            '<div style="flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden">' +
            '<div style="width:' + (p.stats[a]||0) + '%;height:100%;background:var(--blue)"></div></div>' +
            '<span style="font-size:11px;width:20px;font-weight:600">' + (p.stats[a]||0) + '</span></div>'
          ).join('')}
        </div>
      </div>
      <!-- Rinnovo contratto -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">
          🔄 ${t('roster.renewContract')}
          <span style="font-size:11px;font-weight:400;color:var(--muted)"> — ${t('roster.renewRequest')} <strong style="color:var(--gold)">${formatMoney(renewSalary)}/a</strong></span>
        </div>
        ${p._renewalPending
          ? '<div style="background:rgba(0,194,255,.08);border:1px solid rgba(0,194,255,.3);border-radius:8px;padding:10px;font-size:12px">' +
            '<div style="color:var(--blue);font-weight:700;margin-bottom:4px">📨 ' + t('contracts.renewProposal', {name: ''}) + ' — ' + t('extra.willReplyNext') + '</div>' +
            '<div style="color:var(--muted)">' + p._renewalPending.years + ' ann' + (p._renewalPending.years===1?'o':'i') +
            ' · ' + formatMoney(p._renewalPending.salary) + '/anno</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:4px">Il giocatore risponderà alla prossima giornata.</div>' +
            '</div>'
          : '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
            [1,2,3,4,5].map(function(y) {
              const elId    = 'player-modal-' + i;
              const total   = renewSalary * y;
              const bonus   = Math.round(total * 0.10);
              const canAfford = G.budget >= bonus;
              const title   = canAfford
                ? y + ' ' + (y===1?t('common.year'):t('common.years')) + ' + bonus ' + formatMoney(bonus)
                : t('market.notEnoughBudget') + ' (bonus: ' + formatMoney(bonus) + ')';
              return '<button ' +
                (canAfford
                  ? 'onclick="showRenewalConfirm(' + i + ',' + y + ',document.getElementById(&quot;' + elId + '&quot;))"'
                  : 'disabled title="' + title + '"') +
                ' style="padding:5px 10px;font-size:12px;font-weight:700;border-radius:6px;' +
                'border:1.5px solid ' + (canAfford ? 'var(--blue)' : 'rgba(255,255,255,.15)') + ';' +
                'background:var(--panel2);color:' + (canAfford ? 'var(--blue)' : 'rgba(255,255,255,.25)') + ';' +
                'cursor:' + (canAfford ? 'pointer' : 'not-allowed') + '">' +
                y + ' ' + (y===1?t('common.year'):t('common.years')) + ' — ' + formatMoney(total) +
                (canAfford ? '' : ' 🔒') +
                '</button>';
            }).join('') +
            '</div>'
        }
        <div style="font-size:11px;color:${isExpiring?'#7b2fbe':'var(--muted)'};margin-top:6px">
          ${isExpiring?'⚠️ Contratto in scadenza — se non rinnovato andrà sul mercato a costo zero.':''}
        </div>
      </div>
      <!-- Vendita / Rescissione -->
      <div style="border-top:1px solid var(--border);padding-top:10px" id="modal-sell-section-${i}">
        ${_buildSellSection(i)}
      </div>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ── Modale giocatore sul mercato (acquisti) ──
function showMarketPlayerModal(i) {
  const p  = G._mercList[i];
  if (!p) return;
  const rl   = { POR:t('roles.POR'), DIF:t('roles.DIF'), CEN:'Centromediano', ATT:t('roles.ATT'), CB:t('roles.CB') };
  const hand = p.hand === 'AMB' ? 'Ambidestro' : p.hand === 'L' ? 'Mancino' : 'Destro';
  const mc   = p.morale > 70 ? 'var(--green)' : p.morale > 40 ? 'var(--gold)' : 'var(--red)';
  const ok   = G.budget >= p.value;

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(4px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:360px;width:90%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--blue)">${p.name}${_ritBadge(p)}</div>
          <div style="font-size:12px;color:var(--muted)">${rl[p.role] || p.role}${p.secondRole ? ' / ' + (rl[p.secondRole] || p.secondRole) : ''} · ${p.nat} · ${p.age} anni · <strong>${hand}</strong></div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">📍 ${p._tname}</div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div class="irow"><span class="ilbl">${t('roster.overall')}</span>    <span style="font-size:18px;font-weight:700;color:var(--blue)">${p.overall}</span></div>
      <div class="irow"><span class="ilbl">${t('roster.potential')}</span> <span>${p.potential}</span></div>
      <div class="irow"><span class="ilbl">${t('roster.value')}</span>     <span>${formatMoney(p.value)}</span></div>
      <div class="irow"><span class="ilbl">${t('common.salary')}</span>  <span>${formatMoney(p.salary)}/anno</span></div>
      <div class="irow"><span class="ilbl">${t('roster.fitness')}</span>    <span style="color:${p.fitness > 70 ? 'var(--green)' : 'var(--gold)'}">${p.fitness}%</span></div>
      <div class="irow"><span class="ilbl">${t('roster.morale')}</span>     <span style="color:${mc}">${p.morale}%</span></div>
      <div class="irow"><span class="ilbl">${t('common.goals')} / ${t('common.assists')}</span><span>${p.goals} / ${p.assists}</span></div>
      ${p.role === 'POR' ? `<div class="irow"><span class="ilbl">Parate</span><span>${p.saves}</span></div>` : ''}
      <div style="margin-top:10px">
        <div class="slbl" style="margin-top:0">Attributi</div>
        ${[['att','ATT'],['def','DIF'],['spe','VEL'],['str','FOR'],['tec','TEC'],['res','RES']].map(([a,lbl]) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <div style="font-size:12px;color:var(--muted);width:28px">${lbl}</div>
            <div style="flex:1;height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
              <div style="width:${(p.stats&&p.stats[a])||0}%;height:100%;background:var(--blue);border-radius:3px"></div>
            </div>
            <div style="font-size:12px;width:24px;font-weight:600">${(p.stats&&p.stats[a])||'—'}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        ${ok
          ? `<button class="btn primary" style="width:100%;padding:10px"
               onclick="buyPlayer(${i});this.closest('[style*=fixed]').remove()">
               💰 Acquista per ${formatMoney(p.value)}
             </button>`
          : `<div style="color:var(--red);font-size:13px;text-align:center;padding:8px">
               Budget insufficiente (mancano ${formatMoney(p.value - G.budget)})
             </div>`
        }
      </div>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

function _buildSellSection(i) {
  const p      = G.rosters[G.myId][i];
  if (!p) return '';
  const entry  = (G.transferList || []).find(e => e.rosterIdx === i);
  const offers = entry && entry.offers && entry.offers.length ? entry.offers : [];

  if (entry) {
    // Già in vendita
    let html = `<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px">${t('market.myList')} — ${t('roster.askingPrice')} ${formatMoney(entry.askingPrice)}</div>`;
    if (offers.length) {
      html += `<div class="slbl" style="margin-top:0;margin-bottom:6px">${t('market.offers')}</div>`;
      offers.forEach((o, oi) => {
        const accepted = o.amount >= entry.askingPrice;
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;font-size:12px"><strong>${o.teamName}</strong>: ${formatMoney(o.amount)}
            <span style="color:${accepted?'var(--green)':'var(--red)'}"> (${Math.round(o.amount/entry.askingPrice*100)}%)</span>
          </div>
          <button class="btn sm success" onclick="acceptOffer(${i},${oi});this.closest('[style*=fixed]').remove();renderRosa();">${t('market.offerPopup.accept')}</button>
          <button class="btn sm" onclick="rejectOffer(${i},${oi});document.getElementById('modal-sell-section-${i}').innerHTML=_buildSellSection(${i})">${t('market.offerPopup.reject')}</button>
        </div>`;
      });
    } else {
      html += `<div style="font-size:12px;color:var(--muted)">${t('market.noOffers')}. ${t('market.marketUpdated')}.</div>`;
    }
    html += `<button class="btn danger sm" style="margin-top:10px" onclick="removeFromMarket(${i});this.closest('[style*=fixed]').remove();renderRosa()">${t('extra.removeFromMarket')}</button>`;
    return html;
  } else {
    // Non in vendita: mostra form per mettere in vendita
    // Calcola penale rescissione: metà degli ingaggi rimanenti
    const contractLeft = Math.max(1, p.contractYears || 1);
    const rescPenalty  = Math.round((p.salary || 0) * contractLeft * 0.5);
    return `<div style="font-size:13px;font-weight:600;margin-bottom:8px">Metti in vendita</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:12px;color:var(--muted)">Prezzo richiesto:</span>
        <input type="number" id="sell-price-${i}" value="${p.value}" min="${Math.round(p.value*0.3)}" step="10000"
          style="width:110px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--panel2);color:var(--text);font-size:13px;text-align:right;padding:0 6px">
        <span style="font-size:11px;color:var(--muted)">min ${formatMoney(Math.round(p.value*0.3))}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Il giocatore perderà morale. Le offerte arriveranno nelle prossime giornate.</div>
      <button class="btn warn" onclick="
        const pr=parseInt(document.getElementById('sell-price-${i}').value,10);
        if(!pr||pr<${Math.round(p.value*0.3)}){alert(t('extra.priceTooLow'));return;}
        putPlayerOnMarket(${i},pr);
        this.closest('[style*=fixed]').remove();
        renderRosa();
      ">💰 Metti in vendita</button>
      <div style="margin-top:12px;border-top:1px solid rgba(255,80,80,.2);padding-top:12px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
          <strong>${t('extra.rescindContract')}</strong> — penale: <strong style="color:var(--red)">${formatMoney(rescPenalty)}</strong>
          (${contractLeft} ${contractLeft===1?t('common.year'):t('common.years')} ).
          ${t('extra.freeAgent')}
        </div>
        <button class="btn danger sm" onclick="rescindContract(${i});this.closest('[style*=fixed]').remove();renderRosa();">✂️ Rescindi contratto</button>
      </div>`;
  }
}

// ════════════════════════════════════════════
// ALLENAMENTO
// ════════════════════════════════════════════

function renderTrain() {
  var roster = G.rosters[G.myId];
  var avgFit = Math.round(roster.reduce(function(s, p) { return s + p.fitness; }, 0) / roster.length);
  var avgOvr = Math.round(roster.reduce(function(s, p) { return s + p.overall; }, 0) / roster.length);
  var stars  = G.stars || 0;

  function statBox(icon, label, value, accent) {
    return '<div style="flex:1;min-width:80px;background:rgba(255,255,255,.04);'
      + 'border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 10px;text-align:center">'
      + '<div style="font-size:22px;margin-bottom:4px;line-height:1">' + icon + '</div>'
      + '<div style="font-size:20px;font-weight:800;color:' + accent + ';text-shadow:0 0 10px ' + accent + '40">' + value + '</div>'
      + '<div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.6px;margin-top:3px">' + label + '</div>'
      + '</div>';
  }

  var h = '';

  // Status bar
  h += '<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">'
    + statBox('🔁', t('training.weeksDone'), G.trainWeeks, '#7cb9ff')
    + statBox('💪', t('roster.fitness') + ' ' + t('common.all').toLowerCase(), avgFit + '%', avgFit > 70 ? '#69f0ae' : '#f0c040')
    + statBox('📊', t('roster.sortOvr') + ' ' + t('common.all').toLowerCase(), avgOvr, avgOvr >= 75 ? '#00c2ff' : avgOvr >= 60 ? '#69f0ae' : '#f0c040')
    + statBox('⭐', t('header.stars'), stars, '#ffe566')
    + '</div>';

  h += '<div style="font-size:11px;color:rgba(255,255,255,.28);margin-bottom:14px;text-align:center">'
    + t('training.starsAvail') + ': <strong style="color:rgba(255,215,0,.55)" class="train-star-label">+4</strong> / ' + t('common.round').toLowerCase() + '.'
    + '</div>';

  // Griglia schede allenamento
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">';

  TRAINING_TYPES.forEach(function(tr, idx) {
    var starCost = tr.stars || 1;
    var okBudget = G.budget >= tr.cost;
    var okStars  = stars >= starCost;
    var ok       = okBudget && okStars;
    var brd      = ok ? 'rgba(255,140,66,.28)' : 'rgba(255,255,255,.07)';

    h += '<div style="background:linear-gradient(135deg,rgba(255,255,255,.05) 0%,rgba(255,255,255,.02) 100%);'
      + 'border:1px solid ' + brd + ';border-radius:14px;padding:15px;'
      + 'cursor:' + (ok ? 'pointer' : 'not-allowed') + ';'
      + 'opacity:' + (ok ? '1' : '0.52') + ';'
      + 'transition:transform .18s,box-shadow .18s;'
      + 'position:relative;overflow:hidden"'
      + (ok
          ? ' onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 20px rgba(255,140,66,.2)\'"'
            + ' onmouseout="this.style.transform=\'none\';this.style.boxShadow=\'none\'"'
          : '')
      + ' onclick="' + (ok ? 'openTrainPopup(' + idx + ')' : 'showTrainBlockedMsg(' + okStars + ',' + okBudget + ')') + '"'
      + '>';

    if (ok) {
      h += '<div style="position:absolute;top:-18px;right:-18px;width:70px;height:70px;'
        + 'background:radial-gradient(circle,rgba(255,140,66,.18) 0%,transparent 70%);pointer-events:none"></div>';
    }

    // Icona + titolo
    h += '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">'
      + '<div style="font-size:26px;line-height:1;flex-shrink:0">' + tr.icon + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:3px">' + tr.name + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,.42);line-height:1.45">' + tr.desc + '</div>'
      + '</div></div>';

    // Costi
    h += '<div style="display:flex;align-items:center;justify-content:space-between;'
      + 'background:rgba(0,0,0,.22);border-radius:8px;padding:7px 10px;margin-bottom:10px">'
      + '<div style="display:flex;align-items:center;gap:5px">'
      + '<span style="font-size:14px">⭐</span>'
      + '<span class="train-star-label" style="font-size:13px;font-weight:800;color:' + (!okStars ? '#e74c3c' : '#ffe566') + '">'
      + starCost + ' ' + t('training.stars') + '</span>'
      + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:' + (tr.cost === 0 ? '#69f0ae' : !okBudget ? '#e74c3c' : 'rgba(255,255,255,.48)') + '">'
      + (tr.cost ? formatMoney(tr.cost) : '🆓 ' + t('common.unlimited')) + '</div>'
      + '</div>';

    // Pulsante
    var btnBg  = ok ? 'linear-gradient(135deg,#ff8c42,#e65100)' : 'rgba(255,255,255,.06)';
    var btnCol = ok ? '#fff' : 'rgba(255,255,255,.22)';
    var btnLbl = ok ? '&#9654; ' + t('training.applyBtn') : (!okStars ? '&#11088; ' + t('stars.notEnough') : '&#128184; ' + t('market.notEnoughBudget'));
    h += '<button style="width:100%;padding:9px;font-size:12px;font-weight:800;border-radius:8px;'
      + 'background:' + btnBg + ';border:none;color:' + btnCol + ';'
      + 'cursor:' + (ok ? 'pointer' : 'not-allowed') + ';'
      + 'box-shadow:' + (ok ? '0 2px 10px rgba(255,140,66,.3)' : 'none') + ';'
      + 'letter-spacing:.3px">'
      + btnLbl + '</button>';

    h += '</div>';
  });

  h += '</div>';

  // Storico
  if (G.trainHistory && G.trainHistory.length) {
    h += '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px">'
      + '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;'
      + 'letter-spacing:.7px;margin-bottom:10px">&#128203; Storico Allenamenti</div>'
      + '<div style="display:flex;flex-direction:column;gap:3px">';

    G.trainHistory.slice(-8).reverse().forEach(function(th) {
      h += '<div style="display:grid;grid-template-columns:28px 1fr 1fr auto;gap:8px;align-items:center;'
        + 'padding:6px 10px;background:rgba(255,255,255,.025);border-radius:6px;font-size:11px">'
        + '<div style="font-weight:700;color:rgba(255,255,255,.28)">#' + th.n + '</div>'
        + '<div style="color:rgba(255,255,255,.7);font-weight:600">' + th.name + '</div>'
        + '<div style="color:rgba(0,194,255,.65)">' + th.eff + '</div>'
        + '<div style="color:rgba(240,192,64,.65);text-align:right">' + (th.cost ? formatMoney(th.cost) : '—') + '</div>'
        + '</div>';
    });

    h += '</div></div>';
  }

  document.getElementById('tab-train').innerHTML = h;
}

// Mostra messaggio bloccante se stelle o budget insufficienti
function showTrainBlockedMsg(hasStars, hasBudget) {
  var existing = document.getElementById('train-blocked-popup');
  if (existing) existing.remove();

  var msg, icon;
  if (!hasStars) {
    icon = '⭐';
    msg  = t('stars.notEnough');
  } else {
    icon = '💸';
    msg  = t('market.notEnoughBudget');
  }

  var ov = document.createElement('div');
  ov.id = 'train-blocked-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(6px)';

  var box = document.createElement('div');
  box.style.cssText = [
    'background:linear-gradient(180deg,#1a1a2e,#0f0f1e)',
    'border:2px solid #3a3060',
    'border-radius:16px',
    'padding:28px 24px',
    'max-width:360px',
    'width:90%',
    'text-align:center',
    'box-shadow:0 8px 40px rgba(0,0,0,.8)'
  ].join(';');
  box.innerHTML =
    '<div style="font-size:44px;margin-bottom:12px">' + icon + '</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,.8);line-height:1.7;margin-bottom:22px">' + msg + '</div>' +
    '<button id="train-blocked-ok" style="padding:10px 32px;font-size:13px;font-weight:800;' +
    'border-radius:8px;border:2px solid #00c2ff;background:linear-gradient(135deg,#0a5ca8,#0844a0);' +
    'color:#fff;cursor:pointer">OK</button>';

  ov.appendChild(box);
  document.body.appendChild(ov);

  document.getElementById('train-blocked-ok').addEventListener('click', function() {
    document.getElementById('train-blocked-popup').remove();
  });
  ov.addEventListener('click', function(e) {
    if (e.target === ov) ov.remove();
  });
}

// Apre il popup di conferma allenamento con indicatori +/-
function openTrainPopup(i) {
  const tr     = TRAINING_TYPES[i];
  const stars  = G.stars || 0;
  const starCost = tr.stars || 1;

  // Calcola effetti attesi (range min-max)
  function effRow(label, minV, maxV, color) {
    if (!maxV) return '';
    const sign = minV >= 0 ? '+' : '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;
                         padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">
      <span style="font-size:12px;color:var(--muted)">${label}</span>
      <span style="font-size:13px;font-weight:700;color:${color}">
        ${sign}${minV === maxV ? minV : minV + '→' + sign + maxV}
      </span>
    </div>`;
  }

  const eff = tr.eff;
  const fatigueSign = (tr.fatigue || 0) > 0;
  let effHTML = '';
  if (eff.fitness)  effHTML += effRow(t('roster.fitness'),          1, eff.fitness,  'var(--green)');
  if (eff.morale)   effHTML += effRow(t('roster.morale'),           1, eff.morale,   'var(--green)');
  if (eff.att)      effHTML += effRow(t('attrs.att_full'), 0, eff.att,      'var(--blue)');
  if (eff.def)      effHTML += effRow(t('attrs.def_full'), 0, eff.def,      'var(--blue)');
  if (eff.spe)      effHTML += effRow(t('extra.speedAttr'),    0, eff.spe,      'var(--blue)');
  if (eff.str)      effHTML += effRow(t('attrs.str_full'), 0, eff.str,      'var(--blue)');
  if (eff.tec)      effHTML += effRow(t('attrs.tec_full'), 0, eff.tec,      'var(--blue)');
  if (eff.res)      effHTML += effRow(t('attrs.res_full'), 0, eff.res,      'var(--blue)');
  if (eff.gk)       effHTML += effRow(t('roles.POR') + ' OVR', 2, 2,        'var(--blue)');
  if (tr.fatigue)   effHTML += effRow(t('roster.fitness') + ' (' + t('training.fatigue').toLowerCase() + ')',  fatigueSign ? -(tr.fatigue) : Math.abs(tr.fatigue),
                                                           fatigueSign ? -(tr.fatigue) : Math.abs(tr.fatigue),
                                                           fatigueSign ? 'var(--red)' : 'var(--green)');
  effHTML += effRow('OVR (' + t('goals.inProgress').toLowerCase() + ')', 0, '+1 (12% prob)', 'var(--gold)');

  const ov = document.createElement('div');
  ov.id = 'train-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(6px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:2px solid var(--border);border-radius:16px;
                padding:22px;max-width:400px;width:92%;max-height:85vh;overflow-y:auto">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:28px">${tr.icon}</span>
          <div>
            <div style="font-weight:800;font-size:15px;color:var(--blue)">${tr.name}</div>
            <div style="font-size:11px;color:var(--muted)">${tr.desc}</div>
          </div>
        </div>
        <button onclick="document.getElementById('train-popup').remove()"
                style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted)">✕</button>
      </div>

      <!-- Costi -->
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <div style="flex:1;background:rgba(255,215,0,.08);border:1px solid rgba(255,215,0,.3);
                    border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px">⭐</div>
          <div style="font-size:16px;font-weight:800;color:var(--gold)">${starCost}</div>
          <div style="font-size:10px;color:var(--muted)">${t('training.stars')} (${t('training.starsAvail')}: ${stars})</div>
        </div>
        <div style="flex:1;background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.3);
                    border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px">💰</div>
          <div style="font-size:14px;font-weight:800;color:var(--gold)">${tr.cost ? formatMoney(tr.cost) : t('common.unlimited')}</div>
          <div style="font-size:10px;color:var(--muted)">${t('training.cost')}</div>
        </div>
      </div>

      <!-- Effetti attesi -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;
                    letter-spacing:.5px;margin-bottom:8px">${t('training.effects')} (${t('roster.title').toLowerCase()})</div>
        ${effHTML}
      </div>

      <!-- Bottoni -->
      <div style="display:flex;gap:10px">
        <button onclick="doTrain(${i})"
                style="flex:1;padding:11px;font-size:13px;font-weight:800;border-radius:8px;
                       border:2px solid var(--blue);background:linear-gradient(135deg,#0a5ca8,#0844a0);
                       color:#fff;cursor:pointer">
          ${t('training.applyBtn')}
        </button>
        <button onclick="document.getElementById('train-popup').remove()"
                style="padding:11px 18px;font-size:13px;font-weight:700;border-radius:8px;
                       border:2px solid var(--border);background:var(--panel2);color:var(--muted);cursor:pointer">
          ${t('common.cancel')}
        </button>
      </div>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

function doTrain(i) {
  const tr = TRAINING_TYPES[i];
  const starCost = tr.stars || 1;
  if (G.budget < tr.cost) { alert(t('market.notEnoughBudget')); return; }
  if ((G.stars || 0) < starCost) { alert(t('stars.notEnough')); return; }

  // Rimuovi popup
  const popup = document.getElementById('train-popup');
  if (popup) popup.remove();

  G.budget -= tr.cost;
  G.stars   = (G.stars || 0) - starCost;
  if (typeof _updateStarsBox === 'function') _updateStarsBox();
  addLedger(t('nav.training'), -tr.cost, t('training.sessionDone', {name: tr.name}), currentRound());
  G.trainWeeks++;
  G._lastTrainRound = (typeof currentRound === 'function') ? currentRound() : 0;
  const roster = G.rosters[G.myId];
  let improved = 0;
  const improvedPlayers = [];

  roster.forEach(p => {
    if (!p || p.injured) return;  // infortunati: nessun effetto allenamento
    if (tr.eff.fitness) p.fitness = cap(p.fitness + rnd(1, tr.eff.fitness));
    if (tr.eff.morale)  p.morale  = cap(p.morale  + rnd(1, tr.eff.morale));
    if (tr.eff.att)     p.stats.att = cap(p.stats.att + rnd(0, tr.eff.att));
    if (tr.eff.def)     p.stats.def = cap(p.stats.def + rnd(0, tr.eff.def));
    if (tr.eff.spe)     p.stats.spe = cap(p.stats.spe + rnd(0, tr.eff.spe));
    if (tr.eff.str)     p.stats.str = cap(p.stats.str + rnd(0, tr.eff.str));
    if (tr.eff.res)     p.stats.res = cap((p.stats.res || 50) + rnd(0, tr.eff.res));
    if (tr.eff.tec) {
      const ceiling = p.maxTec !== undefined ? p.maxTec : 99;
      p.stats.tec   = Math.min(ceiling, cap(p.stats.tec + rnd(0, tr.eff.tec)));
    }
    p.fitness = Math.round(cap(p.fitness - (tr.fatigue || 0) + rnd(-2, 2)));
    // Ricalcola overall dagli attributi aggiornati (formula pesata per ruolo)
    const potCap = (p.potential !== undefined && p.potential > 0) ? p.potential : 99;
    const oldOvr = p.overall;
    const newOvr = _calcOverallFromStats(p);
    if (newOvr > oldOvr) {
      improved++;
      improvedPlayers.push({ name: p.name, role: p.role, age: p.age, oldOvr: oldOvr, newOvr: Math.min(potCap, newOvr) });
    }
    p.overall = Math.min(potCap, newOvr);
  });

  const attrMap = { fitness: t('roster.fitness'), morale: t('roster.morale'),
      att: t('attrs.att'), def: t('attrs.def'), spe: t('attrs.spe'),
      str: t('attrs.str'), tec: t('attrs.tec'), res: t('attrs.res'), gk: 'GK' };
  const effDesc = tr.eff ? Object.entries(tr.eff).map(([k, v]) => '+' + v + ' ' + (attrMap[k] || k)).join(', ') : '';
  G.trainHistory.push({ n: G.trainWeeks, name: tr.name, eff: effDesc, cost: tr.cost });
  G.msgs.push(t('training.sessionDone', {name: tr.name}) + ' ' + t('training.improved', {n: improved}));
  G._selTrain = null;
  updateHeader(); autoSave(); renderTrain();

  // Mostra popup riepilogo allenamento con lista giocatori migliorati
  _showTrainResultPopup(tr, improved, improvedPlayers);
}

// ── Popup risultato allenamento ───────────────────────────────────────
function _showTrainResultPopup(tr, improved, improvedPlayers) {
  var existing = document.getElementById('train-result-popup');
  if (existing) existing.remove();

  var rows = improvedPlayers.map(function(p) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;'
      + 'padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
      + '<span style="font-size:12px;color:var(--text);font-weight:600">' + p.name + '</span>'
      + '<span style="font-size:11px;color:var(--muted)">' + p.role + ' · ' + p.age + 'a</span>'
      + '<span style="font-size:12px;font-weight:800;color:var(--green)">OVR ' + p.oldOvr + ' → ' + p.newOvr + '</span>'
      + '</div>';
  }).join('');

  var ov = document.createElement('div');
  ov.id = 'train-result-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:600;backdrop-filter:blur(6px)';

  ov.innerHTML = '<div style="background:var(--panel);border:1px solid #00838f44;border-radius:16px;'
    + 'padding:24px 28px;max-width:440px;width:92%;max-height:80vh;overflow-y:auto;'
    + 'box-shadow:0 8px 40px rgba(0,0,0,.5)">'

    // Header
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">'
    + '<span style="font-size:30px">' + tr.icon + '</span>'
    + '<div>'
    + '<div style="font-weight:800;font-size:15px;color:var(--blue)">' + tr.name + '</div>'
    + '<div style="font-size:11px;color:var(--muted)">' + tr.desc + '</div>'
    + '</div>'
    + '<button onclick="document.getElementById(\'train-result-popup\').remove()" '
    + 'style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>'
    + '</div>'

    // Effetti applicati
    + '<div style="background:rgba(0,131,143,.08);border:1px solid rgba(0,131,143,.25);border-radius:8px;'
    + 'padding:10px 14px;margin-bottom:14px;font-size:12px;color:rgba(255,255,255,.6)">'
    + '<span style="color:#00838f;font-weight:700">' + t('training.effects') + ':</span> '
    + (tr.eff ? Object.entries(tr.eff).map(function(kv) {
        var attrMap2 = { fitness: t('roster.fitness'), morale: t('roster.morale'),
          att: t('attrs.att'), def: t('attrs.def'), spe: t('attrs.spe'),
          str: t('attrs.str'), tec: t('attrs.tec'), res: t('attrs.res') };
        return '+' + kv[1] + ' ' + (attrMap2[kv[0]] || kv[0]);
      }).join(' · ') : '—')
    + '</div>'

    // Stat: migliorati
    + '<div style="display:flex;gap:10px;margin-bottom:14px">'
    + '<div style="flex:1;text-align:center;background:rgba(46,204,113,.08);border:1px solid rgba(46,204,113,.25);border-radius:8px;padding:8px">'
    + '<div style="font-size:22px;font-weight:900;color:var(--green)">' + improved + '</div>'
    + '<div style="font-size:10px;color:var(--muted);text-transform:uppercase">' + t('training.improved', {n:''}).trim() + '</div>'
    + '</div>'
    + '</div>'

    // Lista giocatori migliorati
    + (improvedPlayers.length > 0
        ? '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">OVR ↑</div>'
          + rows
        : '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0">' + t('common.unknown') + '</div>')

    // Chiudi
    + '<button onclick="document.getElementById(\'train-result-popup\').remove()" '
    + 'style="width:100%;margin-top:16px;padding:10px;background:rgba(0,131,143,.15);border:1px solid rgba(0,131,143,.35);'
    + 'border-radius:8px;color:#00838f;font-weight:700;font-size:13px;cursor:pointer">'
    + t('common.close') + '</button>'
    + '</div>';

  ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
window._showTrainResultPopup = _showTrainResultPopup;

// ════════════════════════════════════════════
// OBIETTIVI
// ════════════════════════════════════════════
function renderGoals() {
  checkObjectivesProgress(G.objectives, G.stand, G.myId, G.playoffResult);
  const pos = getTeamPosition(G.stand, G.myId);
  const ms  = G.stand[G.myId];

  let h = `<div class="card">
    <div style="font-size:14px;font-weight:700;color:var(--blue);margin-bottom:4px">Obiettivi — ${G.myTeam.name}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px">
      Pos: ${pos}° · Pts: ${ms.pts} · V: ${ms.w} · Gol: ${ms.gf}
    </div>`;

  G.objectives.forEach(o => {
    const icon = o.achieved ? '✅' : o.failed ? '❌' : '⏳';
    let prog = '';
    let pct  = 0;
    if (o.type === 'position') { prog = t('goals.inProgress') + `: ${pos}° / Target: top ${o.target}`; pct = Math.min(100, Math.round((o.target / pos) * 100)); }
    else if (o.type === 'wins')    { prog = `${ms.w}/${o.target} ${t('history.winStreak').toLowerCase()}`;  pct = Math.min(100, Math.round(ms.w / (o.target || 1) * 100)); }
    else if (o.type === 'goals')   { prog = `${ms.gf}/${o.target} gol`;      pct = Math.min(100, Math.round(ms.gf / (o.target || 1) * 100)); }
    else if (o.type === 'survive') { prog = pos <= 12 ? t('goals.inProgress') + ' (' + pos + '°)' : '⚠️ (' + pos + '°)'; }
    else if (o.type === 'champion'){ prog = G.playoffResult === 'champion' ? 'Campione!' : G.phase === 'done' ? t('extra.notReached') : t('extra.noPlayoff'); }

    h += `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:20px">${icon}</div>
      <div style="flex:1">
        <div style="font-weight:600">${o.name}</div>
        <div style="font-size:12px;color:var(--muted)">${o.desc}</div>
        ${prog ? `<div style="font-size:12px;color:${o.achieved ? 'var(--green)' : o.failed ? 'var(--red)' : 'var(--blue)'};margin-top:3px">${prog}</div>` : ''}
        ${pct ? `<div class="prog-w" style="margin-top:5px"><div class="prog-f" style="width:${pct}%;background:${o.achieved ? 'var(--green)' : 'var(--blue)'}"></div></div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:var(--muted)">Premio</div>
        <div style="font-weight:700;color:var(--green)">+${formatMoney(o.reward)}</div>
        <div style="font-size:11px;color:var(--muted)">${o.points} pt</div>
      </div>
    </div>`;
  });
  h += `</div>`;

  if (G.phase === 'done') {
    const totPts = G.objectives.filter(o => o.achieved).reduce((s, o) => s + o.points, 0);
    const totRew = G.objectives.filter(o => o.achieved).reduce((s, o) => s + o.reward, 0);
    const sNum = G.seasonNumber || 1;
    h += `<div class="card" style="border:1px solid var(--green)">
      <div style="font-weight:700;margin-bottom:8px;color:var(--green)">Riepilogo Stagione ${sNum}</div>
      <div class="irow"><span class="ilbl">${t('extra.finalPosition')}</span><span>${pos}°</span></div>
      <div class="irow"><span class="ilbl">${t('standings.points')} ${t('goals.title').toLowerCase()}</span><span style="font-weight:700">${totPts}</span></div>
      <div class="irow"><span class="ilbl">${t('goals.reward')}</span><span style="font-weight:700;color:var(--green)">${formatMoney(totRew)}</span></div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
          ${t('common.season')} ${sNum + 1}
        </div>
        <button class="btn success" onclick="_confirmNewSeason()" style="width:100%">
          🤽 Inizia Stagione ${sNum + 1}
        </button>
      </div>
    </div>`;
  }
  document.getElementById('tab-goals').innerHTML = h;
}

// ════════════════════════════════════════════
// CLASSIFICA
// ════════════════════════════════════════════

// ── Logo squadra inline (piccolo) ──────────────────────
function _teamLogoHtml(teamId, size) {
  size = size || 22;
  var team = G.teams.find(function(t){return t.id===teamId;});
  if (!team) return '';
  if (team.logo) {
    return '<img src="' + team.logo + '" style="width:' + size + 'px;height:' + size + 'px;'
      + 'object-fit:contain;border-radius:50%;vertical-align:middle;margin-right:4px;'
      + 'background:' + team.col + '" onerror="this.style.display=\'none\'" />';
  }
  return '<span style="display:inline-flex;width:' + size + 'px;height:' + size + 'px;'
    + 'border-radius:50%;background:' + team.col + ';align-items:center;justify-content:center;'
    + 'font-size:9px;font-weight:800;color:#fff;vertical-align:middle;margin-right:4px">'
    + team.abbr + '</span>';
}

function renderStand() {
  document.getElementById('tab-stand').innerHTML = _buildStandContent('classifica');
}

function _showStandTab(tab) {
  document.getElementById('tab-stand').innerHTML = _buildStandContent(tab);
}

function _buildStandContent(activeTab) {
  // ── Tab nav ──
  let h = `<div style="display:flex;gap:6px;margin-bottom:12px">
    <button class="btn${activeTab === 'classifica' ? ' primary' : ' sm'}" onclick="_showStandTab('classifica')" style="font-size:13px">🏆 ${t('nav.standings')}</button>
    <button class="btn${activeTab === 'marcatori'  ? ' primary' : ' sm'}" onclick="_showStandTab('marcatori')"  style="font-size:13px">⚽ ${t('extra.topScorer')}</button>
  </div>`;

  if (activeTab === 'classifica') {
    // ── Classifica ──
    const s = getSortedStandings(G.stand);
    h += `<div class="card">
      <div style="font-weight:700;color:var(--blue);margin-bottom:10px">${t('nav.standings')} Serie A1 — 2025/26</div>
      <table><thead><tr>
        <th>#</th><th>${t('standings.team')}</th><th>${t('standings.played')}</th><th>${t('standings.won')}</th><th>${t('standings.drawn')}</th><th>${t('standings.lost')}</th>
        <th>${t('standings.gf')}</th><th>${t('standings.ga')}</th><th>${t('standings.diff')}</th><th>${t('standings.points')}</th>
      </tr></thead><tbody>`;

    s.forEach((t, i) => {
      const isme = t.id === G.myId;
      const pos  = i + 1;
      const pbg  = pos === 1 ? '#f0c040' : pos === 2 ? '#888' : pos === 3 ? '#cd7f32' : 'transparent';
      const zone = pos <= 4 ? 'rgba(0,194,255,.08)' : pos >= 11 && pos <= 13 ? 'rgba(240,192,64,.08)' : pos === 14 ? 'rgba(231,76,60,.08)' : '';
      h += `<tr style="background:${isme ? 'rgba(0,194,255,.12)' : zone}">
        <td><div style="width:20px;height:20px;border-radius:50%;background:${pbg};display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${pos <= 3 ? '#001220' : 'var(--muted)'}">${pos}</div></td>
        <td style="font-weight:${isme ? 700 : 400}">${_teamLogoHtml(t.id, 20)}<span onclick="showTeamRosterPopup('${t.id}')" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" title="Vedi rosa">${t.name}</span>${isme ? ' ★' : ''}</td>
        <td>${t.g}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td>
        <td>${t.gf}</td><td>${t.ga}</td>
        <td style="color:${t.gf - t.ga >= 0 ? 'var(--green)' : 'var(--red)'}">${t.gf - t.ga > 0 ? '+' : ''}${t.gf - t.ga}</td>
        <td style="font-weight:700;color:var(--blue)">${t.pts}</td>
      </tr>`;
    });

    h += `</tbody></table>
      <div style="margin-top:10px;font-size:11px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap">
        <span><span style="display:inline-block;width:10px;height:10px;background:rgba(0,194,255,.2);border-radius:2px;margin-right:4px"></span>${t('standings.playoff')} (1-4)</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:rgba(240,192,64,.2);border-radius:2px;margin-right:4px"></span>${t('standings.playout')} (11-13)</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:rgba(231,76,60,.2);border-radius:2px;margin-right:4px"></span>${t('standings.relegated')} (14)</span>
      </div>
    </div>`;

  } else {
    // ── Marcatori lega ──
    // Raccoglie tutti i giocatori di tutte le squadre con almeno 1 gol
    // Raccoglie gol di TUTTI i giocatori di tutte le squadre (incluse NPC)
    const allScorers = [];
    G.teams.forEach(tm => {
      const roster = G.rosters[tm.id] || [];
      roster.forEach(p => {
        if ((p.goals || 0) > 0) {
          allScorers.push({
            name:     _shortPlayerName ? _shortPlayerName(p) : p.name,
            team:     tm.name,
            teamAbbr: tm.abbr,
            teamId:   tm.id,
            role:     p.role,
            goals:    p.goals  || 0,
            assists:  p.assists || 0,
            isMe:     tm.id === G.myId,
          });
        }
      });
    });
    allScorers.sort((a, b) => b.goals !== a.goals ? b.goals - a.goals : b.assists - a.assists);

    h += `<div class="card">
      <div style="font-weight:700;color:var(--blue);margin-bottom:10px">${t('extra.topScorer')} — Serie A1 2025/26</div>`;

    if (!allScorers.length) {
      h += `<div style="color:var(--muted);padding:16px;text-align:center;font-size:13px">
        ${t('common.goals')} — ${t('common.unknown')}
      </div>`;
    } else {
      h += `<table><thead><tr>
        <th>#</th><th>${t('roster.title')}</th><th>' + t('standings.team') + '</th><th>${t('roster.sortRole')}</th><th style="text-align:center">⚽</th><th style="text-align:center">${t('common.assists')}</th>
      </tr></thead><tbody>`;

      allScorers.forEach((p, i) => {
        const pos = i + 1;
        const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
        h += `<tr style="background:${p.isMe ? 'rgba(0,194,255,.10)' : ''}">
          <td style="font-weight:700;color:var(--muted);font-size:12px">${medal}</td>
          <td style="font-weight:${p.isMe ? 700 : 400}">${p.name}${p.isMe ? ' ★' : ''}</td>
          <td style="font-size:12px"><span onclick="showTeamRosterPopup('${p.teamId}')" style="cursor:pointer;color:var(--muted);text-decoration:underline dotted;text-underline-offset:3px" title="Vedi rosa">${p.teamAbbr}</span></td>
          <td><span class="badge ${p.role === 'POR' ? 'S' : p.role === 'CB' ? 'B' : p.role === 'DIF' ? 'A' : 'C'}">${p.role}</span>${p.secondRole ? ` <span class="badge ${p.secondRole === 'POR' ? 'S' : p.secondRole === 'CB' ? 'B' : p.secondRole === 'DIF' ? 'A' : 'C'}">${p.secondRole}</span>` : ''}</td>
          <td style="text-align:center;font-weight:700;color:var(--blue)">${p.goals}</td>
          <td style="text-align:center;color:var(--muted)">${p.assists}</td>
        </tr>`;
      });

      h += `</tbody></table>`;
    }
    h += `</div>`;
  }

  return h;
}

// ════════════════════════════════════════════
// CALENDARIO
// ════════════════════════════════════════════
function renderCal(activeTab) {
  activeTab = activeTab || 'andata';
  const halfRounds    = 13;
  const andataRounds  = Array.from({length: halfRounds}, (_, i) => i + 1);
  const ritornoRounds = Array.from({length: halfRounds}, (_, i) => i + halfRounds + 1);
  const currentRounds = activeTab === 'andata' ? andataRounds : ritornoRounds;

  const rounds = {};
  G.schedule.forEach(function(m) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });

  function matchRow(m) {
    var hT   = G.teams.find(function(t){ return t.id === m.home; });
    var aT   = G.teams.find(function(t){ return t.id === m.away; });
    var isMe = m.home === G.myId || m.away === G.myId;
    var ih   = m.home === G.myId;
    var mIdx = G.schedule.indexOf(m);
    var scoreHtml, badge = '';

    if (m.played && m.score) {
      scoreHtml = '<span'
        + ' onclick="showMatchDetailPopup(' + mIdx + ')"'
        + ' style="background:var(--panel2);border-radius:6px;padding:3px 14px;'
        + 'font-size:14px;font-weight:700;cursor:pointer;transition:background .15s"'
        + ' onmouseover="this.style.background=\'rgba(0,194,255,.18)\'"'
        + ' onmouseout="this.style.background=\'var(--panel2)\'"'
        + 'title="' + t('common.details') + '">'        + m.score.home + ' - ' + m.score.away
        + '</span>';
      if (isMe) {
        var mw = (ih && m.score.home > m.score.away) || (!ih && m.score.away > m.score.home);
        var md = m.score.home === m.score.away;
        var vc = mw ? 'var(--green)' : md ? 'var(--gold)' : 'var(--red)';
        badge = '<span style="font-size:11px;font-weight:700;color:' + vc + ';margin-left:2px">' + (mw?'V':md?'P':'S') + '</span>';

      }
    } else {
      scoreHtml = '<span style="color:var(--muted);font-size:13px;padding:0 10px">vs</span>';
    }

    var homeName = hT ? hT.name : '?';
    var awayName = aT ? aT.name : '?';
    return '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;'
      + 'border-radius:8px;margin-bottom:3px;'
      + 'background:' + (isMe ? 'rgba(0,194,255,.06)' : 'rgba(255,255,255,.02)') + ';'
      + 'border:1px solid ' + (isMe ? 'rgba(0,194,255,.18)' : 'rgba(255,255,255,.05)') + '">'
      + '<div style="flex:1;text-align:right;font-size:13px;font-weight:' + (m.home===G.myId?700:400) + '">'
      + '<span onclick="showTeamRosterPopup(\'' + m.home + '\')" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">' + homeName + '</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0">' + scoreHtml + badge + '</div>'
      + '<div style="flex:1;text-align:left;font-size:13px;font-weight:' + (m.away===G.myId?700:400) + '">'
      + '<span onclick="showTeamRosterPopup(\'' + m.away + '\')" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">' + awayName + '</span>'
      + '</div>'
      + '</div>';
  }

  var h = '<div style="display:flex;gap:6px;margin-bottom:14px">'
    + '<button class="btn' + (activeTab==='andata'?' primary':' sm') + '" onclick="_showCalTab(\'andata\')" style="font-size:13px">&#x2B05; Andata</button>'
    + '<button class="btn' + (activeTab==='ritorno'?' primary':' sm') + '" onclick="_showCalTab(\'ritorno\')" style="font-size:13px">Ritorno &#x27A1;</button>'
    + '</div>';

  currentRounds.forEach(function(r) {
    var matches = rounds[r];
    if (!matches) return;
    var myMatch = matches.find(function(m){ return m.home === G.myId || m.away === G.myId; });
    var roundBadge = '';
    if (myMatch && myMatch.played) {
      var ih = myMatch.home === G.myId;
      var mw = (ih && myMatch.score.home > myMatch.score.away) || (!ih && myMatch.score.away > myMatch.score.home);
      var md = myMatch.score.home === myMatch.score.away;
      var col = mw ? 'rgba(46,204,113,.25)' : md ? 'rgba(240,192,64,.25)' : 'rgba(231,76,60,.25)';
      roundBadge = '<span style="font-size:10px;padding:1px 7px;border-radius:4px;background:' + col + ';font-weight:700">' + (mw?'V':md?'P':'S') + '</span>';
    }

    h += '<div style="margin-bottom:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
      + '<span style="font-size:12px;font-weight:700;color:var(--blue)">G' + r + '</span>'
      + roundBadge
      + '</div>'
      + matches.map(matchRow).join('')
      + '</div>';
  });

  document.getElementById('tab-cal').innerHTML = h;
}

function _showCalTab(tab) {
  renderCal(tab);
}


// ════════════════════════════════════════════
// PLAYOFF
// ════════════════════════════════════════════
function renderPlayoff() {
  if (G.phase === 'regular') {
    document.getElementById('tab-playoff').innerHTML = '<div class="alert info">La fase playoff inizierà al termine della regular season.</div>';
    return;
  }
  if (G.phase === 'done') {
    document.getElementById('tab-playoff').innerHTML = '<div class="alert success">Stagione conclusa! Vai su Obiettivi.</div>';
    return;
  }
  const pb = G.poBracket, plb = G.plBracket;
  const tname = function(id) { return (G.teams.find(function(t){return t.id===id;})||{name:'TBD'}).name; };

  // ── Popup dettaglio partita playoff ──

function _buildPOScorers(details, homeId, awayId) {
  if (!details) return '';
  var hT = G.teams.find(function(t){return t.id===homeId;}) || {abbr:'?'};
  var aT = G.teams.find(function(t){return t.id===awayId;}) || {abbr:'?'};
  var homeIsMe = homeId === G.myId, awayIsMe = awayId === G.myId;
  function scorerList(list) {
    var filtered = (list || []).filter(function(s){ return s.goals > 0 || s.assists > 0; });
    if (!filtered.length) return '<div style="color:var(--muted);font-size:12px;padding:2px 0">—</div>';
    return filtered.sort(function(a,b){ return (b.goals||0)-(a.goals||0)||(b.assists||0)-(a.assists||0); })
      .map(function(s) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px">'
          + '<span>' + s.name + '</span><span style="display:flex;gap:6px">'
          + (s.goals   > 0 ? '<span style="color:var(--blue);font-weight:700">⚽' + s.goals + '</span>' : '')
          + (s.assists > 0 ? '<span style="color:var(--green);font-size:11px">🤝' + s.assists + '</span>' : '')
          + '</span></div>';
      }).join('');
  }
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px">'
    + '<div><div style="font-size:11px;font-weight:700;color:' + (homeIsMe?'var(--blue)':'var(--muted)') + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + hT.abbr + '</div>'
    + scorerList(details.home) + '</div>'
    + '<div><div style="font-size:11px;font-weight:700;color:' + (awayIsMe?'var(--blue)':'var(--muted)') + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + aT.abbr + '</div>'
    + scorerList(details.away) + '</div></div>';
}

  window.showPOMatchDetail = function(scores, homeId, awayId, label, extraInfo, matchDetails) {
    var hT = G.teams.find(function(t){return t.id===homeId;}) || {name:'?',abbr:'?'};
    var aT = G.teams.find(function(t){return t.id===awayId;}) || {name:'?',abbr:'?'};
    var existing = document.getElementById('po-detail-popup');
    if (existing) existing.remove();

    var totalH = scores.reduce(function(s,x){return s+x.home;},0);
    var totalA = scores.reduce(function(s,x){return s+x.away;},0);
    var homeIsMe = homeId === G.myId, awayIsMe = awayId === G.myId;

    // Parziali
    var _regCount = 0;
    var partialsRows = scores.map(function(sc, i) {
      var lbl;
      if (sc.label) { lbl = sc.label; }
      else { _regCount++; lbl = _regCount + '° T'; }
      var isExtra = !!sc.label;
      return '<tr style="border-bottom:1px solid rgba(255,255,255,.04)' + (isExtra ? ';background:rgba(255,255,255,.03)' : '') + '">'
        + '<td style="text-align:center;color:' + (isExtra ? 'var(--gold)' : 'var(--muted)') + ';padding:4px;font-weight:' + (isExtra ? '700' : '400') + '">' + lbl + '</td>'
        + '<td style="text-align:center;font-weight:600;padding:4px">' + sc.home + '</td>'
        + '<td style="text-align:center;font-weight:600;padding:4px">' + sc.away + '</td>'
        + '</tr>';
    }).join('');

    var ov = document.createElement('div');
    ov.id = 'po-detail-popup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:600;backdrop-filter:blur(6px);padding:20px';
    ov.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:500px;width:95%;max-height:85vh;overflow-y:auto">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      + '<div style="font-size:12px;color:var(--muted);font-weight:600">' + label + '</div>'
      + '<button onclick="document.getElementById(&quot;po-detail-popup&quot;).remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>'
      + '</div>'
      // Tabellone
      + '<div style="text-align:center;margin-bottom:16px">'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:16px">'
      + '<div style="flex:1;text-align:right;font-size:15px;font-weight:' + (homeIsMe?700:500) + ';color:' + (homeIsMe?'var(--blue)':'var(--text)') + '">' + hT.name + '</div>'
      + '<div style="background:var(--panel2);border-radius:10px;padding:8px 20px;font-size:26px;font-weight:700;flex-shrink:0">' + totalH + ' - ' + totalA + '</div>'
      + '<div style="flex:1;text-align:left;font-size:15px;font-weight:' + (awayIsMe?700:500) + ';color:' + (awayIsMe?'var(--blue)':'var(--text)') + '">' + aT.name + '</div>'
      + '</div>'
      + (extraInfo ? '<div style="margin-top:8px;font-size:12px;color:var(--gold)">' + extraInfo + '</div>' : '')
      + '</div>'
      // Parziali
      + '<div style="margin-bottom:14px">'
      + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Parziali</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead>'
      + '<tr style="border-bottom:1px solid var(--border)">'
      + '<th style="text-align:center;padding:3px 6px;color:var(--muted);font-size:10px">Tempo</th>'
      + '<th style="text-align:center;padding:3px 8px;color:' + (homeIsMe?'var(--blue)':'var(--muted)') + ';font-size:11px">' + hT.abbr + '</th>'
      + '<th style="text-align:center;padding:3px 8px;color:' + (awayIsMe?'var(--blue)':'var(--muted)') + ';font-size:11px">' + aT.abbr + '</th>'
      + '</tr></thead><tbody>'
      + partialsRows
      + '<tr style="border-top:1px solid var(--border);font-weight:700">'
      + '<td style="text-align:center;color:var(--muted);padding:5px">Tot.</td>'
      + '<td style="text-align:center;color:var(--blue);padding:5px">' + totalH + '</td>'
      + '<td style="text-align:center;color:var(--blue);padding:5px">' + totalA + '</td>'
      + '</tr></tbody></table></div>'
      + (matchDetails ? _buildPOScorers(matchDetails, homeId, awayId) : '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0">Marcatori non disponibili.</div>')
      + '</div>';
    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  };

  // ── Render singolo match bracket ──
  function renderBracketMatch(m, accentColor, isPlayout) {
    var isme = m.home === G.myId || m.away === G.myId;
    var hasResult = m.winner && m.scores && m.scores.length > 0;
    var totalH = m.scores ? m.scores.reduce(function(s,x){return s+x.home;},0) : (m.score?m.score.home:null);
    var totalA = m.scores ? m.scores.reduce(function(s,x){return s+x.away;},0) : (m.score?m.score.away:null);
    // Store match data globally for popup access
    if (!window._poMatchData) window._poMatchData = {};
    var _poKey = (m.home||'') + '_' + (m.away||'') + '_' + (m.label||'').replace(/[^a-zA-Z0-9]/g,'');
    window._poMatchData[_poKey] = { scores: m.scores||[m.score]||[], home: m.home, away: m.away, label: m.label||'', extra: m._extraInfo||'' };
    var scoreHtml = (totalH !== null && totalA !== null)
      ? '<span style="background:var(--panel);border-radius:6px;padding:2px 10px;font-size:14px;font-weight:700;cursor:pointer" onclick="(function(){var d=window._poMatchData[\''+_poKey+'\'];d&&showPOMatchDetail(d.scores,d.home,d.away,d.label,d.extra,d.details);})()">'
        + totalH + ' - ' + totalA + '</span>'
      : '<span style="color:var(--muted);font-size:12px">vs</span>';

    // Etichetta esito — per playout m1 il vincitore si salva, il perdente va alla finale
    var isPloutM1   = isPlayout && (m.label && m.label.indexOf('11°') >= 0);
    var winnerLabel = isPlayout ? (isPloutM1 ? t('playoff.saves') : t('playoff.saves')) : t('playoff.advances');
    var winnerColor = isPlayout ? '#2ecc71' : 'var(--green)';
    // Per playout m1, mostra anche chi va alla finale
    var loserLabel  = isPloutM1 && m.winner
      ? '<div style="color:var(--red);font-size:12px;margin-top:2px">⚠ Alla finale: <strong>'
        + tname(m.home === m.winner ? m.away : m.home) + '</strong></div>'
      : '';

    return '<div style="background:var(--panel2);border:1px solid ' + (isme ? accentColor : 'var(--border)') + ';border-radius:8px;padding:12px;margin-bottom:6px">'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">' + (m.label||'') + '</div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">'
      + '<span style="font-weight:' + (m.home===G.myId?700:400) + ';flex:1">' + tname(m.home) + '</span>'
      + '<span style="margin:0 12px;flex-shrink:0">' + scoreHtml + '</span>'
      + '<span style="font-weight:' + (m.away===G.myId?700:400) + ';flex:1;text-align:right">' + tname(m.away) + '</span>'
      + '</div>'
      + (m.winner ? '<div style="color:' + winnerColor + ';font-size:12px;margin-top:6px">✔ ' + winnerLabel + ' <strong>' + tname(m.winner) + '</strong></div>' : '')
      + loserLabel
      + '</div>';
  }

  var h = '<div style="font-size:15px;font-weight:700;color:var(--blue);margin-bottom:12px">Fase Finale</div>';

  // ── Playoff Scudetto ──
  h += '<div class="card"><div style="font-weight:700;margin-bottom:10px;color:var(--blue)">Playoff Scudetto</div>';
  pb.sf.forEach(function(sf) { h += renderBracketMatch(sf, 'var(--blue)', false); });
  if (pb.final.home) {
    h += renderBracketMatch(Object.assign({label:t('playoff.final')}, pb.final), 'var(--gold)', false);
    if (pb.final.winner) h += '<div style="color:var(--gold);font-size:14px;margin-top:8px">🏆 Campione: <strong>' + tname(pb.final.winner) + '</strong></div>';
  }
  h += '</div>';

  // ── Play-out Retrocessione ──
  h += '<div class="card"><div style="font-weight:700;margin-bottom:10px;color:var(--red)">Play-out Retrocessione</div>';
  [plb.m1, plb.m2].forEach(function(m) {
    if (!m.home && !m.away) return;
    h += renderBracketMatch(m, 'var(--red)', true);
  });
  // Retrocessa dai playout
  if (plb.relegated) {
    var savedId = plb.m2.winner;
    if (savedId && savedId !== plb.relegated)
      h += '<div style="background:rgba(46,204,113,.12);border:1px solid rgba(46,204,113,.3);border-radius:6px;padding:8px 12px;margin-top:6px;color:#2ecc71;font-size:13px;font-weight:700">✅ Si salva: ' + tname(savedId) + '</div>';
    h += '<div class="alert danger" style="margin-top:6px">Retrocede: ' + tname(plb.relegated) + '</div>';
  }
  // Retrocessione diretta
  if (G.relegated) h += '<div class="alert danger" style="margin-top:6px">Retrocessione diretta: ' + tname(G.relegated) + '</div>';
  h += '</div>';

  // ── Azioni ──
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">';
  var sfDone  = pb.sf.every(function(s){return !!s.winner;});
  var finDone = !!pb.final.winner;

  if (!sfDone) {
    pb.sf.forEach(function(sf, i) {
      if (sf.winner) return;
      if (sf.home === G.myId || sf.away === G.myId)
        h += '<button class="btn primary" onclick="startPOMatch(\'sf\',' + i + ')">▶ Gioca ' + sf.label + '</button>';
      else
        h += '<button class="btn" onclick="simPOMatch(\'sf\',' + i + ')">Simula ' + sf.label + '</button>';
    });
  } else if (!finDone) {
    if (pb.final.home === G.myId || pb.final.away === G.myId)
      h += '<button class="btn primary" onclick="startPOMatch(\'final\',0)">▶ Gioca Finale Scudetto</button>';
    else
      h += '<button class="btn" onclick="simPOMatch(\'final\',0)">Simula Finale</button>';
  }

  if (!plb.m1.winner && plb.m1.home) {
    if (plb.m1.home === G.myId || plb.m1.away === G.myId)
      h += '<button class="btn danger" onclick="startPOMatch(\'pl\',\'m1\')">▶ Gioca Play-out 1</button>';
    else
      h += '<button class="btn" onclick="simPLMatch(\'m1\')">Simula PL1</button>';
  } else if (plb.m1.winner && !plb.m2.winner) {
    // m2.home = perdente di m1 (chi va alla finale salvezza), NON il vincitore
    if (!plb.m2.home && plb.m1.winner) {
      plb.m2.home = (plb.m1.home === plb.m1.winner) ? plb.m1.away : plb.m1.home;
    }
    if (plb.m2.home === G.myId || plb.m2.away === G.myId)
      h += '<button class="btn danger" onclick="startPOMatch(\'pl\',\'m2\')">▶ Gioca Play-out Finale</button>';
    else
      h += '<button class="btn" onclick="simPLMatch(\'m2\')">Simula PL Finale</button>';
  }
  if (finDone && plb.done)
    h += '<button class="btn success" onclick="closeSeason()">' + t('extra.closeSeason') + '</button>';
  h += '</div>';
  document.getElementById('tab-playoff').innerHTML = h;
}

// ════════════════════════════════════════════
// MERCATO
// ════════════════════════════════════════════
// Stato ordinamento e paginazione mercato
var _mktSort = { key: null, dir: 1 }; // dir: 1=asc, -1=desc
var _mktPage = 0;
var MKT_PER_PAGE = 15;

function _mktSortClick(key) {
  if (_mktSort.key === key) _mktSort.dir *= -1;
  else { _mktSort.key = key; _mktSort.dir = 1; }
  _mktPage = 0;
  renderMarket();
}

function _sortArrow(key) {
  if (_mktSort.key !== key) return '<span style="color:rgba(255,255,255,.2);font-size:9px">⇅</span>';
  return _mktSort.dir === 1 ? '<span style="color:var(--blue);font-size:9px">▲</span>' : '<span style="color:var(--blue);font-size:9px">▼</span>';
}

function renderMarket() {
  // ── Giocatori IN ENTRATA (da altre squadre) ──
  const avail = [];
  G.teams.forEach(tm => {
    if (tm.id === G.myId) return;
    G.rosters[tm.id].forEach(p => {
      if (p.overall > 55 && Math.random() > 0.55) avail.push({ ...p, _tid: tm.id, _tname: tm.name });
    });
  });
  avail.sort((a, b) => b.overall - a.overall);
  const list = avail.slice(0, 14);
  G._mercList = list;

  // ── Giocatori IN USCITA (nostra rosa sul mercato) ──
  const selling = (G.transferList || []).map(entry => ({
    entry,
    p: G.rosters[G.myId][entry.rosterIdx],
    rosterIdx: entry.rosterIdx,
  })).filter(x => x.p);

  // ── Sezione OFFERTE DA FINALIZZARE ──────────────────────────────
  const pending = G.pendingPurchases || [];
  const curRnd  = typeof currentRound === 'function' ? currentRound() : 0;

  let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div style="font-weight:700;color:var(--blue);font-size:15px">${t('extra.transferMarket')}</div>
    <div style="font-size:12px;color:var(--muted)">Budget: <strong style="color:var(--blue)">${formatMoney(G.budget)}</strong></div>
  </div>`;

  if (pending.length > 0) {
    h += `<div class="card" style="margin-bottom:12px;border:2px solid var(--green)">
      <div style="font-weight:700;color:var(--green);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        ✅ Offerte da finalizzare
        <span style="font-size:11px;font-weight:400;color:var(--muted)">(scadono alla prossima giornata)</span>
      </div>
      <table><thead><tr>
        <th>${t('roster.title')}</th><th>' + t('market.fromTeam') + '</th><th>'+ t('roster.sortRole') + '</th><th>OVR</th><th>Prezzo offerta</th><th>${t('extra.expires')}</th><th></th>
      </tr></thead><tbody>`;
    pending.forEach((pp, i) => {
      const p = pp.player;
      const canBuy = G.budget >= pp.offerAmount;
      const roundsLeft = pp.expiresAfterRound - curRnd;
      const expLbl = roundsLeft <= 0 ? '⚠️ Scaduta' : roundsLeft === 1 ? '⚠️ Ultima G!' : roundsLeft + ' G';
      const expCol = roundsLeft <= 1 ? 'var(--red)' : 'var(--gold)';
      h += `<tr>
        <td style="font-weight:600">${p.name} <span style="font-size:11px;color:var(--muted)">(${p.age}a)</span></td>
        <td style="font-size:12px;color:var(--muted)">${p._tname}</td>
        <td><span class="badge ${p.role==='POR'?'S':p.role==='CB'?'B':p.role==='DIF'?'A':'C'}">${p.role}</span>${p.secondRole ? ` <span class="badge ${p.secondRole==='POR'?'S':p.secondRole==='CB'?'B':p.secondRole==='DIF'?'A':'C'}">${p.secondRole}</span>` : ''}</td>
        <td style="font-weight:700">${p.overall}</td>
        <td style="font-size:13px;font-weight:700;color:var(--green)">${formatMoney(pp.offerAmount)}</td>
        <td style="font-size:11px;font-weight:700;color:${expCol}">${expLbl}</td>
        <td>
          ${canBuy
            ? `<div style="display:flex;gap:4px"><button class="btn sm success" onclick="buyFromPending(${i})">Conferma acquisto</button><button class="btn sm danger" onclick="cancelPending(${i})">Annulla offerta</button></div>`
            : `<div style="display:flex;gap:4px"><span style="font-size:11px;color:var(--red)">Budget insuff.</span><button class="btn sm" onclick="cancelPending(${i})">Annulla offerta</button></div>`
          }
        </td>
      </tr>`;
    });
    h += `</tbody></table></div>`;
  }

  // Sezione USCITE
  h += `<div class="card" style="margin-bottom:12px">
    <div style="font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px">
      <span style="color:var(--gold)">💰 ${t('market.myList')}</span>
      <span style="font-size:11px;color:var(--muted)">(${selling.length} ${t('market.available').toLowerCase()} — ${t('nav.rosa')})</span>
    </div>`;

  if (!selling.length) {
    h += `<div style="color:var(--muted);font-size:13px;padding:8px 0">${t('market.noPlayers')} — ${t('nav.rosa')}</div>`;
  } else {
    h += `<table><thead><tr>
      <th>${t('roster.title')}</th><th>' + t('roster.sortRole') + '</th><th>OVR</th><th>${t('roster.askingPrice')}</th><th>${t('market.offers')}</th><th></th>
    </tr></thead><tbody>`;
    selling.forEach(({ entry, p, rosterIdx }) => {
      const offerCount  = entry.offers ? entry.offers.length : 0;
      const bestOffer   = entry.offers && entry.offers.length
        ? Math.max(...entry.offers.map(o => o.amount)) : 0;
      const hasGoodOffer = bestOffer >= entry.askingPrice;
      h += `<tr>
        <td style="font-weight:600">${p.name} <span style="font-size:10px;color:var(--muted)">(${p.age}a)</span></td>
        <td><span class="badge ${p.role==='POR'?'S':p.role==='CB'?'B':p.role==='DIF'?'A':'C'}">${p.role}</span>${p.secondRole ? ` <span class="badge ${p.secondRole==='POR'?'S':p.secondRole==='CB'?'B':p.secondRole==='DIF'?'A':'C'}">${p.secondRole}</span>` : ''}</td>
        <td style="font-weight:700">${p.overall}</td>
        <td style="font-size:12px">${formatMoney(entry.askingPrice)}</td>
        <td><span style="font-size:12px;color:${hasGoodOffer?'var(--green)':offerCount>0?'var(--gold)':'var(--muted)'}">
          ${offerCount > 0 ? offerCount + ' ' + t('market.offers').toLowerCase() + (hasGoodOffer ? ' ✓' : '') : '—'}
        </span></td>
        <td style="display:flex;gap:4px">
          <button class="btn sm primary" onclick="showPlayerModal(${rosterIdx})">${t('common.details')}</button>
          <button class="btn sm" onclick="removeFromMarket(${rosterIdx});renderMarket()">✕</button>
        </td>
      </tr>`;
    });
    h += `</tbody></table>`;
  }
  h += `</div>`;

  // Sezione ACQUISTI — usa marketPool persistente
  if (!G.marketPool || !G.marketPool.length) {
    if (typeof initMarketPool === 'function') initMarketPool();
  }
  const pool = G.marketPool || [];
  G._mercList = pool.map(e => e.player); // compatibilità con showMarketPlayerModal

  h += `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:600;color:var(--blue)">🔍 ${t('market.available')}</div>
      <div style="font-size:11px;color:var(--muted)">${t('extra.marketUpdated')}</div>
    </div>
    <table><thead><tr>
      <th onclick="_mktSortClick('name')"   style="cursor:pointer">${t('roster.title')} ${_sortArrow('name')}</th>
      <th onclick="_mktSortClick('hand')"   style="cursor:pointer">${t('roster.sortHand')} ${_sortArrow('hand')}</th>
      <th>${t('market.fromTeam')}</th>
      <th onclick="_mktSortClick('role')"   style="cursor:pointer">${t('roster.sortRole')} ${_sortArrow('role')}</th>
      <th onclick="_mktSortClick('ovr')"    style="cursor:pointer">OVR ${_sortArrow('ovr')}</th>
      <th onclick="_mktSortClick('value')"  style="cursor:pointer">${t('extra.marketValue')} ${_sortArrow('value')}</th>
      <th onclick="_mktSortClick('salary')" style="cursor:pointer">${t('extra.wage')} ${_sortArrow('salary')}</th>
      <th onclick="_mktSortClick('days')"   style="cursor:pointer">${t('extra.expires')} ${_sortArrow('days')}</th>
      <th></th>
    </tr></thead><tbody>`;

  // Applica sorting
  let sortedPool = pool.slice();
  if (_mktSort.key) {
    sortedPool.sort((a, b) => {
      const p1 = a.player, p2 = b.player;
      let v1, v2;
      if (_mktSort.key === 'name')        { v1 = p1.name;    v2 = p2.name; }
      else if (_mktSort.key === 'ovr')    { v1 = p1.overall; v2 = p2.overall; }
      else if (_mktSort.key === 'age')    { v1 = p1.age;     v2 = p2.age; }
      else if (_mktSort.key === 'value')  { v1 = p1.value;   v2 = p2.value; }
      else if (_mktSort.key === 'salary') { v1 = p1.salary;  v2 = p2.salary; }
      else if (_mktSort.key === 'days')   { v1 = a.daysLeft; v2 = b.daysLeft; }
      else if (_mktSort.key === 'role')   { v1 = p1.role;    v2 = p2.role; }
      else if (_mktSort.key === 'hand')   { v1 = p1.hand;    v2 = p2.hand; }
      if (v1 === undefined) return 0;
      if (typeof v1 === 'string') return _mktSort.dir * v1.localeCompare(v2);
      return _mktSort.dir * (v1 - v2);
    });
  }
  // Paginazione
  const mktTotalPages = Math.max(1, Math.ceil(sortedPool.length / MKT_PER_PAGE));
  const mktSafePage   = Math.min(_mktPage, mktTotalPages - 1);
  const mktPageItems  = sortedPool.slice(mktSafePage * MKT_PER_PAGE, (mktSafePage + 1) * MKT_PER_PAGE);

  // Indici reali nel pool originale (per buyPlayerFromPool/openOfferPopup)
  mktPageItems.forEach((entry) => {
    const i = pool.indexOf(entry);
    const p   = entry.player;
    const ok  = G.budget >= p.value;
    const has = entry.pendingOffer !== null;
    const res = entry.offerResult;
    const daysLbl = entry.daysLeft === 1 ? '⚠️ ' + t('market.expires', {n:1}) : entry.daysLeft + ' G';
    const dayColor = entry.daysLeft === 1 ? 'var(--red)' : entry.daysLeft <= 2 ? 'var(--gold)' : 'var(--muted)';

    let offerBadge = '';
    if (res === 'accepted') {
      offerBadge = `<span style="font-size:10px;color:var(--green);font-weight:700">${t('market.offerAccepted')}</span>`;
    } else if (has) {
      offerBadge = `<span style="font-size:10px;color:var(--gold)">⏳ ${t('market.offerSent')}</span>`;
    }

    h += `<tr class="trhov" onclick="showMarketPlayerModal(${i})">
      <td style="font-weight:600;cursor:pointer">
        ${p.name}${_ritBadge(p)} <span style="font-size:11px;color:var(--muted)">(${p.age}a)</span>
        ${offerBadge ? '<br>' + offerBadge : ''}
      </td>
      <td><span class="badge ${p.hand==='AMB'?'C':p.hand==='L'?'L':'R'}">${p.hand}</span></td>
      <td style="font-size:12px">${p._fromRescission || p._fromExpiry || !p._tid
        ? '<span style="color:#7b2fbe;font-weight:700;font-size:11px">' + t('market.noOffers').split(' ')[0] + '</span>'
        : '<span onclick="showTeamRosterPopup(\''+p._tid+'\')" style="cursor:pointer;color:var(--muted);text-decoration:underline dotted;text-underline-offset:3px" title="Vedi rosa">'+p._tname+'</span>'
      }</td>
      <td><span class="badge ${p.role==='POR'?'S':p.role==='CB'?'B':p.role==='DIF'?'A':'C'}">${p.role}</span>${p.secondRole ? ` <span class="badge ${p.secondRole==='POR'?'S':p.secondRole==='CB'?'B':p.secondRole==='DIF'?'A':'C'}">${p.secondRole}</span>` : ''}</td>
      <td style="font-weight:700">${p.overall}</td>
      <td style="font-size:12px">${formatMoney(p.value)}</td>
      <td style="font-size:11px;color:var(--muted)">${formatMoney(p.salary)}/a</td>
      <td style="font-size:11px;color:${dayColor};font-weight:600">${daysLbl}</td>
      <td onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap">
        ${res === 'accepted'
          ? `<button class="btn sm primary" onclick="buyPlayerFromPool(${i})">${t('market.buyBtn')}</button>`
          : ok
            ? `<button class="btn sm primary" onclick="buyPlayerFromPool(${i})">${t('market.buyBtn')}</button>`
            : ''
        }
        ${!has && res !== 'accepted'
          ? `<button class="btn sm warn" onclick="openOfferPopup(${i})">${t('market.offerBtn')}</button>`
          : ''
        }
      </td>
    </tr>`;
  });

  if (!pool.length) {
    h += `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:16px">${t('market.noPlayers')}</td></tr>`;
  }

  h += `</tbody></table>`;

  // Paginazione
  if (mktTotalPages > 1) {
    const prevDis = mktSafePage === 0 ? 'opacity:.35;pointer-events:none' : 'cursor:pointer';
    const nextDis = mktSafePage >= mktTotalPages - 1 ? 'opacity:.35;pointer-events:none' : 'cursor:pointer';
    h += `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 0;border-top:1px solid var(--border);margin-top:4px">
      <button onclick="_mktPage=Math.max(0,_mktPage-1);renderMarket()"
              style="background:var(--panel2);border:1px solid var(--border);border-radius:5px;padding:3px 12px;color:var(--muted);font-size:13px;${prevDis}">‹</button>
      <span style="font-size:12px;color:var(--muted)">${t('welcome.round', {n: mktSafePage+1})} / ${mktTotalPages} (${sortedPool.length})</span>
      <button onclick="_mktPage=Math.min(${mktTotalPages-1},_mktPage+1);renderMarket()"
              style="background:var(--panel2);border:1px solid var(--border);border-radius:5px;padding:3px 12px;color:var(--muted);font-size:13px;${nextDis}">›</button>
    </div>`;
  }

  h += `</div>`;
  document.getElementById('tab-market').innerHTML = h;
}

function buyPlayer(i) {
  buyPlayerFromPool(i);
}

function buyPlayerFromPool(i) {
  const pool = G.marketPool || [];
  const entry = pool[i];
  if (!entry) return;
  const p = entry.player;
  // Se offerta accettata usa quel prezzo, altrimenti prezzo pieno
  const price = (entry.offerResult === 'accepted' && entry.offerResultAmount)
    ? entry.offerResultAmount
    : p.value;
  if (G.budget < price) {
    G.msgs.push('❌ Budget insufficiente per acquistare ' + p.name + '.');
    renderMarket(); return;
  }
  G.budget -= price;
  addLedger('acquisto', -price, `Acquistato ${p.name} da ${p._tname}`, currentRound());
  const np = { ...p }; delete np._tid; delete np._tname;
  np.morale = Math.min(100, np.morale + rnd(8, 15));
  G.rosters[G.myId].push(np);
  G.rosters[p._tid] = (G.rosters[p._tid] || []).filter(pl => pl.name !== p.name);
  // Se la rosa avversaria scende sotto 13, genera automaticamente un sostituto
  _replenishRoster(p._tid);
  // Rimuovi dal pool
  G.marketPool.splice(i, 1);
  G.msgs.push('✅ ' + t('market.playerBought', {name: p.name, price: formatMoney(price)}));
  updateHeader(); autoSave(); renderMarket();
}

// ── Popup offerta ─────────────────────────────
function openOfferPopup(i) {
  const pool  = G.marketPool || [];
  const entry = pool[i];
  if (!entry) return;
  const p = entry.player;

  const existing = document.getElementById('offer-popup');
  if (existing) existing.remove();

  // Per svincolati (value=0) calcola il valore reale dall'OVR
  const realValue = (p.value && p.value > 0) ? p.value : Math.round((p.overall || 70) * 6500);
  const minOffer  = Math.round(realValue * 0.10);  // svincolati: minimo 10% (solo fee d'ingaggio)
  const stepK     = Math.max(1000, Math.round(realValue / 20 / 1000) * 1000);

  const ov = document.createElement('div');
  ov.id = 'offer-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:300;backdrop-filter:blur(4px)';
  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:360px;width:90%">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:var(--blue)">Fai un'offerta</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:16px">${p.name} · ${p._tname} · OVR ${p.overall}</div>

      <div class="irow" style="margin-bottom:8px">
        <span class="ilbl">${t('extra.marketValue')}</span>
        <span style="font-weight:700">${p.value > 0 ? formatMoney(p.value) : formatMoney(realValue) + ' <span style=\"font-size:10px;color:#7b2fbe\">(svincolato)</span>'}</span>
      </div>
      <div class="irow" style="margin-bottom:16px">
        <span class="ilbl">${t('extra.budgetAvail')}</span>
        <span style="font-weight:700;color:var(--blue)">${formatMoney(G.budget)}</span>
      </div>

      <div style="margin-bottom:6px;font-size:12px;color:var(--muted);font-weight:600">${t('market.makeOffer')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <button onclick="_offerStep(-1,${i})" style="background:var(--panel2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:16px;color:var(--text)">−</button>
        <input type="number" id="offer-amount" value="${Math.round(p.value * 0.85)}"
          min="${minOffer}" step="${stepK}"
          style="flex:1;text-align:center;background:var(--panel2);border:1px solid var(--border);border-radius:6px;padding:6px;color:var(--text);font-size:14px;font-weight:700">
        <button onclick="_offerStep(1,${i})" style="background:var(--panel2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:16px;color:var(--text)">+</button>
      </div>
      <div id="offer-hint" style="font-size:11px;color:var(--muted);margin-bottom:16px;min-height:16px"></div>

      <div style="display:flex;gap:8px">
        <button class="btn primary" style="flex:1" onclick="submitOffer(${i})">${t('market.offerSent')}</button>
        <button class="btn" onclick="document.getElementById('offer-popup').remove()">Annulla</button>
      </div>
      <div style="margin-top:10px;font-size:10px;color:var(--muted);text-align:center">
        ${t('extra.willReplyNext')}
      </div>
    </div>`;

  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  _updateOfferHint(i);
}

function _offerStep(dir, i) {
  const pool  = G.marketPool || [];
  const entry = pool[i]; if (!entry) return;
  const p     = entry.player;
  // Ricalcola minOffer con la stessa logica di openOfferPopup
  const realValue = (p.value && p.value > 0) ? p.value : Math.round((p.overall || 70) * 6500);
  const minOffer  = (p._fromRescission || p._fromExpiry || !p._tid)
    ? Math.round(realValue * 0.10)
    : Math.round(realValue * 0.50);
  const step  = Math.max(1000, Math.round(realValue / 20 / 1000) * 1000);
  const inp   = document.getElementById('offer-amount');
  if (!inp) return;
  const current = parseInt(inp.value) || minOffer;
  inp.value = Math.max(minOffer, current + dir * step);
  _updateOfferHint(i);
}

function _updateOfferHint(i) {
  const pool  = G.marketPool || [];
  const entry = pool[i]; if (!entry) return;
  const p     = entry.player;
  const inp   = document.getElementById('offer-amount');
  const hint  = document.getElementById('offer-hint');
  if (!inp || !hint) return;
  const amount = parseInt(inp.value) || 0;
  const pct    = amount / p.value;
  let txt = '', color = 'var(--muted)';
  if (pct >= 1.0)      { txt = t('market.offerAccepted') + ' ✓'; color = 'var(--green)'; }
  else if (pct >= 0.90){ txt = t('market.offerPopup.meets'); color = 'var(--green)'; }
  else if (pct >= 0.75){ txt = t('market.offerPopup.meets'); color = 'var(--gold)'; }
  else if (pct >= 0.50){ txt = t('extra.offerTooLow'); color = 'var(--red)'; }
  else                 { txt = t('extra.offerTooLow'); color = 'var(--red)'; }
  hint.textContent = txt; hint.style.color = color;
}

function submitOffer(i) {
  const pool  = G.marketPool || [];
  const entry = pool[i]; if (!entry) return;
  const p     = entry.player;
  const inp   = document.getElementById('offer-amount');
  const amount = parseInt(inp?.value) || 0;
  if (amount <= 0 || G.budget < amount) {
    alert(t('market.notEnoughBudget')); return;
  }
  entry.pendingOffer = { amount, roundMade: currentRound ? currentRound() : 0 };
  entry.offerResult  = null;
  G.msgs.push('📨 ' + t('market.makeOffer') + ': ' + p.name + ' — ' + formatMoney(amount) + '. ' + t('extra.willReplyNext'));
  document.getElementById('offer-popup')?.remove();
  autoSave(); renderMarket();
}

// ════════════════════════════════════════════
// FINANZA
// ════════════════════════════════════════════
function renderFinance() {
  const ledger  = G.ledger || [];
  const roster  = G.rosters[G.myId] || [];

  // ── Totali per categoria ──
  const totals = { vittoria:0, pareggio:0, ingaggi:0, acquisto:0, vendita:0, allenamento:0, obiettivo:0, playoff:0 };
  ledger.forEach(e => { if (totals[e.type] !== undefined) totals[e.type] += e.amount; });

  const totalIn  = ledger.filter(e => e.amount > 0).reduce((s,e) => s + e.amount, 0);
  const totalOut = ledger.filter(e => e.amount < 0).reduce((s,e) => s + e.amount, 0);
  const saldo    = totalIn + totalOut;

  // ── Monte ingaggi ──
  const wageBillAnn = roster.reduce((s,p) => s + (p.salary||0), 0);
  const wageBillDay = (typeof calcWageBill === 'function') ? calcWageBill() : Math.round(wageBillAnn / (REGULAR_SEASON_ROUNDS || 26));
  const inFinal     = G.phase !== 'regular';

  // ── Introiti da vittorie/premi: vittorie + pareggi + playoff + obiettivi ──
  const totalPrize = totals.vittoria + totals.pareggio + totals.playoff + totals.obiettivo;
  // ── Acquisti/vendite ──
  const totalBuy   = totals.acquisto;  // negativo
  const totalSell  = totals.vendita;   // positivo
  // ── Ingaggi versati ──
  const totalWages = totals.ingaggi;   // negativo

  // ── Helpers ──
  const fmPos = v => `<span style="color:var(--green);font-weight:700">+${formatMoney(Math.abs(v))}</span>`;
  const fmNeg = v => `<span style="color:var(--red);font-weight:700">−${formatMoney(Math.abs(v))}</span>`;
  const fmVal = v => v >= 0 ? fmPos(v) : fmNeg(v);
  const fmSaldo = v => v >= 0
    ? `<span style="color:var(--green);font-weight:700">+${formatMoney(v)}</span>`
    : `<span style="color:var(--red);font-weight:700">${formatMoney(v)}</span>`;

  const typeIcon  = { vittoria:'🏆', pareggio:'🤝', ingaggi:'💸', acquisto:'🛒', vendita:'💰', allenamento:'🏋️', obiettivo:'🎯', playoff:'🥇' };
  const typeLabel = { vittoria:t('finance.types.vittoria'), pareggio:t('finance.types.pareggio'), ingaggi:t('finance.wages'), acquisto:t('finance.types.acquisto'), vendita:t('finance.types.vendita'), allenamento:t('finance.types.allenamento'), obiettivo:t('finance.types.obiettivo'), playoff:t('nav.playoff') };
  const recent = [...ledger].reverse().slice(0, 40);

  // Giornate di regular season giocate (per calcolare ingaggi versati vs attesi)
  const roundsPlayed = G.schedule
    ? G.schedule.filter(m => m.played && (m.home === G.myId || m.away === G.myId)).length
    : 0;

  let h = `
  <!-- ── RIEPILOGO STATO ECONOMICO ── -->
  <div class="card" style="margin-bottom:12px">
    <div class="slbl" style="margin-top:0">${t('finance_extra.econTitle')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px">

      <!-- Budget attuale -->
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(30,58,92,.3)">
        <span style="color:var(--muted)">${t('finance_extra.currentBudget')}</span>
        <span style="font-weight:700;color:var(--blue)">${formatMoney(G.budget)}</span>
      </div>
      <!-- Saldo netto -->
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(30,58,92,.3)">
        <span style="color:var(--muted)">${t('extra.netBalance')}</span>
        <span>${fmSaldo(saldo)}</span>
      </div>

      <!-- Introiti da vittorie e premi -->
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(30,58,92,.3)">
        <span style="color:var(--muted)">${t('finance_extra.prizeIncome')}</span>
        <span style="color:var(--green);font-weight:700">+${formatMoney(totalPrize)}</span>
      </div>
      <!-- Vendita giocatori -->
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(30,58,92,.3)">
        <span style="color:var(--muted)">${t('finance_extra.sellIncome')}</span>
        <span style="color:${totalSell > 0 ? 'var(--green)' : 'var(--muted)'};font-weight:700">${totalSell > 0 ? '+' + formatMoney(totalSell) : '—'}</span>
      </div>

      <!-- Acquisto giocatori -->
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(30,58,92,.3)">
        <span style="color:var(--muted)">${t('finance_extra.buyOutcome')}</span>
        <span style="color:${totalBuy < 0 ? 'var(--red)' : 'var(--muted)'};font-weight:700">${totalBuy < 0 ? '−' + formatMoney(Math.abs(totalBuy)) : '—'}</span>
      </div>
      <!-- Monte ingaggi versato -->
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(30,58,92,.3)">
        <span style="color:var(--muted)">${t('finance_extra.totalWagesPaid')}</span>
        <span style="color:${totalWages < 0 ? 'var(--red)' : 'var(--muted)'};font-weight:700">${totalWages < 0 ? '−' + formatMoney(Math.abs(totalWages)) : '—'}</span>
      </div>

    </div>
  </div>

  <!-- ── MONTE INGAGGI ── -->
  <div class="card" style="margin-bottom:12px">
    <div class="slbl" style="margin-top:0">${t('finance_extra.wageTitle')}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;text-align:center">
      <div style="background:var(--panel2);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${t('finance_extra.wageAnnual')}</div>
        <div style="font-size:16px;font-weight:700;color:var(--text)">${formatMoney(wageBillAnn)}</div>
      </div>
      <div style="background:var(--panel2);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${t('finance_extra.wagePerDay')} (÷${REGULAR_SEASON_ROUNDS || 26})</div>
        <div style="font-size:16px;font-weight:700;color:var(--red)">−${formatMoney(wageBillDay)}</div>
      </div>
      <div style="background:var(--panel2);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${t('finance_extra.rosterSize')}</div>
        <div style="font-size:16px;font-weight:700;color:var(--text)">${roster.length}</div>
      </div>
    </div>

    <div style="font-size:12px;padding:8px 12px;border-radius:8px;background:${inFinal ? 'rgba(240,192,64,.08)' : 'rgba(255,255,255,.04)'};border:1px solid ${inFinal ? 'rgba(240,192,64,.3)' : 'var(--border)'}">
      ${inFinal
        ? t('finance_extra.wageInfoFinal')
        : `ℹ️ ${t('finance_extra.wageInfo')} (${roundsPlayed}/${REGULAR_SEASON_ROUNDS || 26})`}
    </div>
  </div>

  <!-- ── STORICO TRANSAZIONI ── -->
  <div class="card">
    <div class="slbl" style="margin-top:0">${t('finance_extra.txHistory')}</div>
    ${recent.length === 0
      ? '<div style="font-size:13px;color:var(--muted);padding:8px 0">' + t('finance_extra.noTransactions') + '</div>'
      : `<table style="width:100%;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;color:var(--muted);font-weight:600;padding-bottom:6px">${t('finance_extra.description')}</th>
            <th style="text-align:center;color:var(--muted);font-weight:600;padding-bottom:6px;width:40px">G.</th>
            <th style="text-align:right;color:var(--muted);font-weight:600;padding-bottom:6px;width:110px">${t('finance_extra.importo')}</th>
          </tr></thead>
          <tbody>
            ${recent.map(e => `
              <tr style="border-bottom:1px solid rgba(30,58,92,.25)">
                <td style="padding:5px 0">${typeIcon[e.type]||'•'} ${e.note || typeLabel[e.type] || e.type}</td>
                <td style="text-align:center;color:var(--muted)">${e.round || '—'}</td>
                <td style="text-align:right;padding:5px 0">${fmVal(e.amount)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
  </div>`;

  document.getElementById('tab-finance').innerHTML = h;
}


// ════════════════════════════════════════════
// STORICO
// ════════════════════════════════════════════
function renderHistory() {
  const history = G.seasonHistory || [];
  const roster  = G.rosters[G.myId] || [];

  // ── Record di carriera (da statistiche cumulative) ──────────────────
  let topGoals = null, topAssists = null, topApps = null;
  roster.forEach(p => {
    if (!p) return;
    const cg = (p.careerGoals   || 0) + (p.goals   || 0);
    const ca = (p.careerAssists || 0) + (p.assists || 0);
    const cp = (p.careerApps    || 0);
    if (!topGoals   || cg > (topGoals.careerGoals   || 0) + (topGoals.goals   || 0))   topGoals   = p;
    if (!topAssists || ca > (topAssists.careerAssists || 0) + (topAssists.assists || 0)) topAssists = p;
    if (!topApps    || cp > (topApps.careerApps || 0))                                   topApps    = p;
  });

  // ── Record storici del club ─────────────────────────────────────────
  // Miglior stagione (più punti)
  let bestSeason = null;
  history.forEach(s => { if (!bestSeason || s.pts > bestSeason.pts) bestSeason = s; });
  // Vittorie consecutive
  let maxStreak = 0, curStreak = 0;
  history.forEach(s => {
    if (s.w > 0 && s.d === 0 && s.l === 0) { curStreak += s.w; maxStreak = Math.max(maxStreak, curStreak); }
    else { curStreak = 0; }
  });
  // Posizione migliore
  let bestPos = null;
  history.forEach(s => { if (!bestPos || s.pos < bestPos.pos) bestPos = s; });

  function _statVal(p, careerKey, seasonKey) {
    if (!p) return 0;
    return (p[careerKey] || 0) + (p[seasonKey] || 0);
  }

  let h = '<div style="max-width:860px">';

  // ── Record del club ─────────────────────────────────────────────────
  h += `<div class="card" style="margin-bottom:14px">
    <div class="slbl" style="margin-top:0">${t('history.clubRecords')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">`;

  function _recordCard(icon, label, p, val, suffix) {
    if (!p) return '<div class="sc"><div class="sc-l">' + icon + ' ' + label + '</div><div class="sc-n" style="font-size:13px;color:var(--muted)">—</div></div>';
    return '<div class="sc">' +
      '<div class="sc-l">' + icon + ' ' + label + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--blue);margin-top:4px">' + p.name + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:var(--gold)">' + val + ' <span style="font-size:11px;color:var(--muted)">' + suffix + '</span></div>' +
      '</div>';
  }

  h += _recordCard('⚽', t('history.mostGoals'), topGoals,   _statVal(topGoals, 'careerGoals', 'goals'), t('common.goals').toLowerCase());
  h += _recordCard('🤝', t('history.mostAssists'), topAssists, _statVal(topAssists, 'careerAssists', 'assists'), t('common.assists').toLowerCase());
  h += _recordCard('📅', t('history.mostApps'), topApps, topApps ? (topApps.careerApps || 0) : 0, t('roster.apps').toLowerCase());

  h += '</div></div>';

  // ── Record Storici del Club ─────────────────────────────────────────
  if (history.length > 0) {
    h += '<div class="card" style="margin-bottom:14px"><div class="slbl" style="margin-top:0">' + t('history.historicBest') + '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';

    // Miglior stagione
    if (bestSeason) {
      h += '<div class="sc"><div class="sc-l">🏆 ' + t('history.bestSeason') + '</div>' +
        '<div style="font-size:13px;font-weight:700;color:var(--gold);margin-top:4px">' + t('common.season') + ' ' + bestSeason.season + '</div>' +
        '<div style="font-size:16px;font-weight:800;color:var(--blue)">' + bestSeason.pts + ' <span style="font-size:11px;color:var(--muted)">' + t('standings.points').toLowerCase() + '</span></div>' +
        '<div style="font-size:11px;color:var(--muted)">' + bestSeason.pos + '° posto · ' + bestSeason.w + 'V/' + bestSeason.d + 'P/' + bestSeason.l + 'S</div>' +
        '</div>';
    }
    // Miglior piazzamento
    if (bestPos) {
      h += '<div class="sc"><div class="sc-l">📍 ' + t('history.bestPosition') + '</div>' +
        '<div style="font-size:13px;font-weight:700;color:var(--green);margin-top:4px">' + t('common.season') + ' ' + bestPos.season + '</div>' +
        '<div style="font-size:22px;font-weight:900;color:var(--blue)">' + bestPos.pos + '° <span style="font-size:11px;color:var(--muted)">' + t('extra.position').toLowerCase() + '</span></div>' +
        '</div>';
    }
    // Vittorie consecutive
    h += '<div class="sc"><div class="sc-l">🔥 ' + t('history.winStreak') + '</div>' +
      '<div style="font-size:22px;font-weight:900;color:var(--green);margin-top:4px">' + maxStreak + '</div>' +
      '</div>';

    h += '</div></div>';
  }

  // ── Storico stagioni ────────────────────────────────────────────────
  h += `<div class="card">
    <div class="slbl" style="margin-top:0">${t('history.title')}</div>`;

  if (!history.length) {
    h += '<div style="color:var(--muted);font-size:13px;padding:8px 0">' + t('common.loading') + '</div>';
  } else {
    h += `<table><thead><tr>
      <th style="text-align:center">N.</th>
      <th>${t('history.tier')}</th>
      <th>${t('history.position')}</th>
      <th>${t('standings.points')}</th>
      <th>${t('dash.winRate')}</th>
      <th>${t('history.gfga')}</th>
      <th>${t('history.playoff')}</th>
      <th>${t('extra.topScorer')}</th>
      <th>${t('history.topAssist')}</th>
    </tr></thead><tbody>`;

    history.slice().reverse().forEach(s => {
      const posColor = s.pos <= 3 ? 'var(--gold)' : s.pos <= 8 ? 'var(--blue)' : 'var(--muted)';
      h += `<tr>
        <td style="font-weight:700;color:var(--muted)">${s.season}</td>
        <td style="font-weight:800;font-size:14px;color:${({'S':'#ffd700','A':'#00c2ff','B':'#2ecc71','C':'#e74c3c'}[s.tier]||'var(--muted)')}">${s.tier||'?'}</td>
        <td style="font-weight:800;color:${posColor}">${s.pos}°</td>
        <td style="font-weight:700">${s.pts}</td>
        <td style="font-size:12px;color:var(--muted)">${s.w}/${s.d}/${s.l}</td>
        <td style="font-size:12px;color:var(--muted)">${s.gf}/${s.ga}</td>
        <td style="font-size:12px">${s.playoffPhase}</td>
        <td style="font-size:12px">${s.topScorer ? s.topScorer.name + ' <span style="color:var(--gold);font-weight:700">(' + s.topScorer.val + '⚽)</span>' : '—'}</td>
        <td style="font-size:12px">${s.topAssist ? s.topAssist.name + ' <span style="color:var(--blue);font-weight:700">(' + s.topAssist.val + '🤝)</span>' : '—'}</td>
      </tr>`;
    });

    h += '</tbody></table>';
  }
  h += '</div></div>';
  document.getElementById('tab-history').innerHTML = h;
}


// ════════════════════════════════════════════
// STADIO
// ════════════════════════════════════════════
function renderStadium() {
  _initStadium();
  var sec   = G.stadium.sections;
  var cap   = stadiumCapacity();
  var fill  = stadiumFillRate();
  var rev   = stadiumMatchRevenue();

  // Lavori in corso
  var inProgress = [];
  Object.entries(sec).forEach(function(kv) {
    var s = kv[1];
    if (s.construction) inProgress.push(s.construction.label + ' (' + s.construction.daysLeft + ' gg)');
  });

  var h = '<div style="font-family:system-ui,sans-serif;max-width:900px">';

  // ── Banner lavori ──
  if (inProgress.length > 0) {
    h += '<div style="background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.35);'
      + 'border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:flex-start;gap:12px">'
      + '<div style="font-size:22px;flex-shrink:0;margin-top:2px">🏗️</div>'
      + '<div><div style="font-size:12px;font-weight:800;color:#f0c040;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Lavori in corso</div>'
      + '<div style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.6">' + inProgress.join(' · ') + '</div></div>'
      + '</div>';
  }

  // ── Stat cards ──
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">';
  function statCard(icon, label, val, col, img) {
    return '<div style="background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.02) 100%);'
      + 'border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px 12px;display:flex;align-items:center;gap:10px;position:relative;overflow:hidden">'
      + (img ? '<div style="position:absolute;right:-10px;top:-10px;opacity:.15;font-size:60px">' + img + '</div>' : '')
      + '<div style="text-align:left;position:relative;z-index:1">'
      + '<div style="font-size:22px;font-weight:900;color:' + col + ';line-height:1">' + val + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.6px;margin-top:4px">' + label + '</div>'
      + '</div>'
      + '<div style="font-size:28px;margin-left:auto">' + icon + '</div>'
      + '</div>';
  }
  var activeCap  = rev.activeCap !== undefined ? rev.activeCap : cap;
  var usablePct  = cap > 0 ? Math.round(activeCap / cap * 100) : 100;
  var capCardHtml = '<div style="background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.02) 100%);'
    + 'border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px 12px;position:relative;overflow:hidden">'
    + '<div style="font-size:22px;font-weight:900;color:#00c2ff;line-height:1">' + cap.toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT') + '</div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.6px;margin-top:3px">Capienza TOT</div>'
    + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.07)">'
    + '<div style="font-size:18px;font-weight:800;color:' + (usablePct < 100 ? '#f0c040' : '#69f0ae') + ';line-height:1">'
    + activeCap.toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT') + ' <span style="font-size:12px;font-weight:600">(' + usablePct + '%)</span></div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.6px;margin-top:3px">Capienza utilizzabile</div>'
    + '</div>'
    + '<div style="position:absolute;right:10px;top:10px;font-size:28px;opacity:.15">🏟️</div>'
    + '</div>';
  h += capCardHtml;
  var fillPct = Math.round((rev.fill || 0) * 100);
  h += statCard('👥', 'Stima spettatori · ' + fillPct + '% pieni', rev.paying.toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT'), '#69f0ae');
  h += statCard('🎫', t('stadium.ticketPrice'), (G.stadium.ticketPrice || 15) + '€', '#f0c040');
  h += statCard('💰', t('extra.budgetAvail'), formatMoney(rev.revenue), '#ff8c42');
  h += '</div>';

  // ── Prezzo biglietto ──
  var tRange    = rev.ticketRange || { min: 1, max: 20 };
  var tPrice    = G.stadium.ticketPrice || 15;
  var tMtype    = rev.matchType || 'regular';
  var mtLabel   = tMtype === 'final'   ? '🏆 ' + t('playoff.final')
                : tMtype === 'playoff' ? '⚡ ' + t('nav.playoff')
                : '⚽ ' + t('header.phase.regular');
  var tooHigh   = tPrice > tRange.max;
  var tooLow    = tPrice < tRange.min;
  var priceWarn = tooHigh
    ? '⚠️ ' + t('extra.priceTooLow') + ' (-' + Math.round(Math.min(60, (tPrice - tRange.max) * 1.5)) + '%)'
    : tooLow ? '💡 ' + t('goals.inProgress') : '✅ ' + t('goals.inProgress');
  var warnCol   = tooHigh ? '#f0c040' : '#69f0ae';

  h += '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);'
    + 'border-radius:10px;padding:12px 16px;margin-bottom:16px">'

    // Header label + tipo evento
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    + '<span style="font-size:16px">🎫</span>'
    + '<span style="font-size:13px;color:rgba(255,255,255,.6);font-weight:600">' + t('stadium.ticketPrice') + '</span>'
    + '<span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,.3)">' + mtLabel + '</span>'
    + '</div>'

    // Riga −  [input]  +  [Conferma]
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + '<button onclick="_ticketStep(-1)"'
    + ' style="width:36px;height:36px;font-size:20px;font-weight:700;border-radius:8px;'
    + 'background:var(--panel2);border:1px solid var(--border);color:var(--text);cursor:pointer;'
    + 'display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">−</button>'
    + '<input type="number" id="ticket-price-inp" min="1" max="150" value="' + tPrice + '"'
    + ' oninput="_updateTicketHint()"'
    + ' style="flex:1;height:36px;border-radius:8px;border:1.5px solid rgba(0,194,255,.4);'
    + 'background:rgba(0,194,255,.08);color:#00c2ff;font-size:16px;font-weight:800;text-align:center;padding:0 8px">'
    + '<button onclick="_ticketStep(1)"'
    + ' style="width:36px;height:36px;font-size:20px;font-weight:700;border-radius:8px;'
    + 'background:var(--panel2);border:1px solid var(--border);color:var(--text);cursor:pointer;'
    + 'display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">+</button>'
    + '<button onclick="setTicketPrice(document.getElementById(\'ticket-price-inp\').value)"'
    + ' style="padding:0 18px;height:36px;font-size:12px;font-weight:800;letter-spacing:.5px;'
    + 'border-radius:8px;background:linear-gradient(135deg,#00838f,#005f69);border:none;color:#fff;cursor:pointer">'
    + t('common.confirm') + '</button>'
    + '</div>'

    // Range ottimale + avviso
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">'
    + '<div style="font-size:11px;color:rgba(255,255,255,.4)">'
    + t('common.result') + ': <strong style="color:rgba(255,255,255,.7)">' + tRange.min + '€ – ' + tRange.max + '€</strong>'
    + '</div>'
    + '<div id="ticket-hint" style="font-size:11px;font-weight:600;color:' + warnCol + '">' + priceWarn + '</div>'
    + '</div>'
    + '</div>';
  // ── Pianta SVG ──
  h += _renderStadiumMap();

  // ── Schede sezioni ──
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">';
  ['nord','sud','ovest','est'].forEach(function(key) { h += _sectionCard(key); });
  h += '</div>';

  h += '</div>';
  document.getElementById('tab-stadium').innerHTML = h;
}

function _renderStadiumMap() {
  var sec = G.stadium.sections;

  function secColor(key) {
    var s = sec[key];
    if (s.construction) return '#c8860a';
    if (s.level === 0)  return '#1a2a3a';
    var cols = ['','#1a4a2a','#1e6e35','#239b45','#2ecc71'];
    return cols[s.level] || '#2ecc71';
  }
  function secBorder(key) {
    var s = sec[key];
    if (s.construction) return '#f0c040';
    if (s.level === 0)  return 'rgba(255,255,255,.12)';
    return '#69f0ae';
  }
  function secLabel(key) {
    var s = sec[key];
    if (s.construction) return STADIUM_SECTIONS[key].label.toUpperCase() + ' · 🏗️ ' + s.construction.daysLeft + 'gg';
    if (s.level === 0)  return STADIUM_SECTIONS[key].label.toUpperCase() + ' · Liv.0/4';
    return STADIUM_SECTIONS[key].label.toUpperCase() + ' · Liv.' + s.level + '/4';
  }

  // Usa sfondo acqua per la piscina (texture CSS)
  var W = 760, H = 560;

  var svg = '<div style="position:relative;max-width:' + W + 'px;margin:0 auto;border-radius:16px;'
    + 'background:radial-gradient(ellipse at 50% 50%,#0d2a4a 0%,#060e1a 100%);'
    + 'overflow:hidden;padding:10px">';

  // Texture acqua sfondo (linee ondulate CSS simulate in SVG)
  svg += '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">';

  // Sfondo dark con texture
  svg += '<rect width="' + W + '" height="' + H + '" fill="#08182e"/>';
  // Pattern acqua
  for (var gx = 0; gx < W; gx += 60)
    svg += '<line x1="' + gx + '" y1="0" x2="' + (gx-30) + '" y2="' + H + '" stroke="rgba(0,100,180,.06)" stroke-width="30"/>';
  for (var gy = 0; gy < H; gy += 80)
    svg += '<ellipse cx="' + (W/2) + '" cy="' + gy + '" rx="' + (W*0.8) + '" ry="25" fill="none" stroke="rgba(0,150,220,.04)" stroke-width="20"/>';

  // ── TRIBUNA NORD ──
  var tn = sec.nord;
  var tnH = 80 + tn.level * 15;
  // Posti stilizzati (punti arancioni quando costruita)
  var tnFill = secColor('nord');
  svg += '<rect x="195" y="10" width="370" height="' + tnH + '" rx="8" fill="' + tnFill + '" stroke="' + secBorder('nord') + '" stroke-width="1.5"/>';
  if (tn.level > 0 || tn.construction) {
    for (var rr = 0; rr < 4; rr++) for (var cc = 0; cc < 20; cc++)
      svg += '<rect x="' + (205+cc*17) + '" y="' + (18+rr*16) + '" width="13" height="11" rx="2" fill="rgba(255,255,255,.12)"/>';
  }
  // Gru se in costruzione
  if (tn.construction) {
    svg += '<image href="img_gru.svg" x="490" y="12" width="50" height="65"/>';
  }
  // Label + bottone
  svg += '<text x="380" y="' + (tnH - 12) + '" text-anchor="middle" font-size="12" font-weight="800" fill="rgba(255,255,255,.85)" font-family="system-ui">'
    + secLabel('nord') + '</text>';
  if (!tn.construction && tn.level < 4) {
    var cost = formatMoney(STADIUM_LEVEL_COST[tn.level+1]);
    svg += '<g onclick="stadiumBuild(&quot;nord&quot;,&quot;level&quot;)" style="cursor:pointer">'
      + '<rect x="310" y="14" width="140" height="22" rx="11" fill="rgba(0,194,255,.3)" stroke="rgba(0,194,255,.6)" stroke-width="1.5"/>'
      + '<text x="380" y="29" text-anchor="middle" font-size="10" font-weight="800" fill="#00c2ff" font-family="system-ui">⬆ Liv.' + (tn.level+1) + ' — ' + cost + '</text>'
      + '</g>';
  }

  // ── TRIBUNA SUD ──
  var ts = sec.sud;
  var tsH = 80 + ts.level * 15;
  var tsY = H - tsH - 10;
  var tsFill = secColor('sud');
  svg += '<rect x="195" y="' + tsY + '" width="370" height="' + tsH + '" rx="8" fill="' + tsFill + '" stroke="' + secBorder('sud') + '" stroke-width="1.5"/>';
  if (ts.level > 0 || ts.construction) {
    for (var rr = 0; rr < 4; rr++) for (var cc = 0; cc < 20; cc++)
      svg += '<rect x="' + (205+cc*17) + '" y="' + (tsY+8+rr*16) + '" width="13" height="11" rx="2" fill="rgba(255,255,255,.12)"/>';
  }
  if (ts.construction) svg += '<image href="img_gru.svg" x="490" y="' + (tsY+5) + '" width="50" height="65"/>';
  svg += '<text x="380" y="' + (tsY+tsH-12) + '" text-anchor="middle" font-size="12" font-weight="800" fill="rgba(255,255,255,.85)" font-family="system-ui">'
    + secLabel('sud') + '</text>';
  if (!ts.construction && ts.level < 4) {
    var cost = formatMoney(STADIUM_LEVEL_COST[ts.level+1]);
    svg += '<g onclick="stadiumBuild(&quot;sud&quot;,&quot;level&quot;)" style="cursor:pointer">'
      + '<rect x="310" y="' + (tsY+tsH-32) + '" width="140" height="22" rx="11" fill="rgba(0,194,255,.3)" stroke="rgba(0,194,255,.6)" stroke-width="1.5"/>'
      + '<text x="380" y="' + (tsY+tsH-17) + '" text-anchor="middle" font-size="10" font-weight="800" fill="#00c2ff" font-family="system-ui">⬆ Liv.' + (ts.level+1) + ' — ' + cost + '</text>'
      + '</g>';
  }

  // ── CURVA OVEST ──
  var co = sec.ovest;
  var coW = 100 + co.level * 15;
  var coFill = secColor('ovest');
  var poolTop = 95 + (tn.level > 0 ? tn.level * 12 : 0);
  var poolBot = tsY - 10;
  svg += '<rect x="10" y="' + poolTop + '" width="' + coW + '" height="' + (poolBot-poolTop) + '" rx="8" fill="' + coFill + '" stroke="' + secBorder('ovest') + '" stroke-width="1.5"/>';
  if (co.level > 0 || co.construction) {
    var rows = Math.floor((poolBot-poolTop-20) / 16);
    for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < 4; cc++)
      svg += '<rect x="' + (18+cc*20) + '" y="' + (poolTop+12+rr*16) + '" width="16" height="11" rx="2" fill="rgba(255,255,255,.12)"/>';
  }
  if (co.construction) svg += '<image href="img_gru.svg" x="' + (coW-35) + '" y="' + (poolTop+5) + '" width="45" height="60"/>';
  var coMidY = poolTop + (poolBot-poolTop)/2;
  svg += '<text x="' + (coW/2+10) + '" y="' + (coMidY+5) + '" text-anchor="middle" font-size="10" font-weight="800" fill="rgba(255,255,255,.85)" font-family="system-ui" transform="rotate(-90,' + (coW/2+10) + ',' + coMidY + ')">'
    + secLabel('ovest') + '</text>';
  if (!co.construction && co.level < 4) {
    var cost = formatMoney(STADIUM_LEVEL_COST[co.level+1]);
    svg += '<g onclick="stadiumBuild(&quot;ovest&quot;,&quot;level&quot;)" style="cursor:pointer">'
      + '<rect x="14" y="' + (coMidY-11) + '" width="' + (coW-20) + '" height="22" rx="11" fill="rgba(0,194,255,.3)" stroke="rgba(0,194,255,.6)" stroke-width="1.5"/>'
      + '<text x="' + (10+coW/2-10) + '" y="' + (coMidY+4) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#00c2ff" font-family="system-ui">⬆ Liv.' + (co.level+1) + ' ' + cost + '</text>'
      + '</g>';
  }

  // ── CURVA EST ──
  var ce = sec.est;
  var ceW = 100 + ce.level * 15;
  var ceFill = secColor('est');
  var ceX = W - ceW - 10;
  svg += '<rect x="' + ceX + '" y="' + poolTop + '" width="' + ceW + '" height="' + (poolBot-poolTop) + '" rx="8" fill="' + ceFill + '" stroke="' + secBorder('est') + '" stroke-width="1.5"/>';
  if (ce.level > 0 || ce.construction) {
    var rows = Math.floor((poolBot-poolTop-20) / 16);
    for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < 4; cc++)
      svg += '<rect x="' + (ceX+10+cc*20) + '" y="' + (poolTop+12+rr*16) + '" width="16" height="11" rx="2" fill="rgba(255,255,255,.12)"/>';
  }
  if (ce.construction) svg += '<image href="img_gru.svg" x="' + (ceX+5) + '" y="' + (poolTop+5) + '" width="45" height="60"/>';
  var ceMidY = poolTop + (poolBot-poolTop)/2;
  svg += '<text x="' + (ceX+ceW/2) + '" y="' + (ceMidY+5) + '" text-anchor="middle" font-size="10" font-weight="800" fill="rgba(255,255,255,.85)" font-family="system-ui" transform="rotate(-90,' + (ceX+ceW/2) + ',' + ceMidY + ')">'
    + secLabel('est') + '</text>';
  if (!ce.construction && ce.level < 4) {
    var cost = formatMoney(STADIUM_LEVEL_COST[ce.level+1]);
    svg += '<g onclick="stadiumBuild(&quot;est&quot;,&quot;level&quot;)" style="cursor:pointer">'
      + '<rect x="' + (ceX+12) + '" y="' + (ceMidY-11) + '" width="' + (ceW-20) + '" height="22" rx="11" fill="rgba(0,194,255,.3)" stroke="rgba(0,194,255,.6)" stroke-width="1.5"/>'
      + '<text x="' + (ceX+12+ceW/2-10) + '" y="' + (ceMidY+4) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#00c2ff" font-family="system-ui">⬆ Liv.' + (ce.level+1) + ' ' + cost + '</text>'
      + '</g>';
  }

  // ── CAMPO (immagine reale) ──
  var fieldX = 10 + coW + 12;
  var fieldW = ceX - fieldX - 12;
  var fieldY = poolTop + 8;
  var fieldH = poolBot - poolTop - 16;
  svg += '<image href="campo-per-pallanuoto.jpg" x="' + fieldX + '" y="' + fieldY + '" width="' + fieldW + '" height="' + fieldH + '" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 8px)"/>';
  // Overlay semitrasparente + label
  svg += '<rect x="' + fieldX + '" y="' + fieldY + '" width="' + fieldW + '" height="' + fieldH + '" fill="rgba(0,30,60,.35)" rx="8"/>';
  svg += '<text x="' + (fieldX+fieldW/2) + '" y="' + (fieldY+fieldH/2+6) + '" text-anchor="middle" font-size="14" font-weight="800" fill="rgba(255,255,255,.5)" font-family="system-ui">CAMPO DI GIOCO</text>';

  svg += '</svg></div>';
  return svg;
}

function _sectionCard(key) {
  var sec  = G.stadium.sections[key];
  var info = STADIUM_SECTIONS[key];
  var nextLv = sec.level + 1;
  var inCons = !!sec.construction;
  var atMax  = sec.level >= 4;
  var capThis = sec.level * info.capPerLevel;

  var h = '<div style="background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));'
    + 'border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;position:relative;overflow:hidden">';

  // Immagine di sfondo sezione
  var imgType = info.type === 'tribuna' ? 'img_tribuna.svg' : 'img_curva.svg';
  h += '<div style="position:absolute;right:-10px;bottom:-10px;opacity:.12;width:100px;height:80px;'
    + 'background:url(' + imgType + ') center/contain no-repeat"></div>';

  if (inCons) {
    h += '<div style="position:absolute;top:10px;right:10px;opacity:.25;width:50px;height:60px;'
      + 'background:url(img_gru.svg) center/contain no-repeat"></div>';
  }

  // Header
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;position:relative">'
    + '<div style="font-size:14px;font-weight:700;color:#fff">' + info.label + '</div>'
    + '<div style="font-size:12px;font-weight:800;background:rgba(0,194,255,.12);border:1px solid rgba(0,194,255,.25);'
    + 'border-radius:20px;padding:3px 10px;color:' + (sec.level > 0 ? '#69f0ae' : 'rgba(255,255,255,.4)') + '">'
    + 'Liv. ' + sec.level + '/4</div>'
    + '</div>';

  // Barra livelli
  h += '<div style="display:flex;gap:4px;margin-bottom:10px">';
  for (var i = 1; i <= 4; i++) {
    var filled   = i <= sec.level;
    var building = inCons && i === nextLv;
    var bg = filled ? '#2ecc71' : building ? '#f0c040' : 'rgba(255,255,255,.1)';
    var glow = filled ? 'box-shadow:0 0 6px #2ecc71;' : building ? 'box-shadow:0 0 6px #f0c040;' : '';
    h += '<div style="flex:1;height:6px;border-radius:3px;background:' + bg + ';' + glow + '"></div>';
  }
  h += '</div>';

  // Capienza info
  h += '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px">'
    + '📐 Capienza aggiuntiva: <strong style="color:rgba(255,255,255,.7)">'
    + (capThis > 0 ? '+' + capThis.toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT') : '—') + '</strong> posti'
    + (sec.bar || sec.shop
       ? ' &nbsp;·&nbsp; ' + (sec.bar ? '🍺 +' + (STADIUM_BAR_BONUS*100|0) + '%' : '')
         + (sec.shop ? (sec.bar ? ' ' : '') + '🛍️ +' + (STADIUM_SHOP_BONUS*100|0) + '%' : '')
       : '')
    + '</div>';

  // Stato costruzione
  if (inCons) {
    h += '<div style="background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.25);border-radius:8px;'
      + 'padding:8px 12px;font-size:11px;color:#f0c040;margin-bottom:10px">'
      + '🏗️ ' + sec.construction.label + ' — <strong>' + sec.construction.daysLeft + '</strong> giornate rimanenti'
      + '</div>';
  } else if (!atMax) {
    // Bottone upgrade
    h += '<button onclick="stadiumBuild(\'' + key + '\',\'level\')" style="width:100%;padding:9px;font-size:12px;font-weight:700;'
      + 'border-radius:8px;background:linear-gradient(135deg,rgba(0,194,255,.2),rgba(0,130,180,.15));'
      + 'border:1px solid rgba(0,194,255,.3);color:#00c2ff;cursor:pointer;margin-bottom:8px;letter-spacing:.3px">'
      + '⬆️  Potenzia a Livello ' + nextLv
      + ' &nbsp;·&nbsp; ' + formatMoney(STADIUM_LEVEL_COST[nextLv])
      + ' &nbsp;·&nbsp; ' + STADIUM_LEVEL_DAYS[nextLv] + ' giornate'
      + '</button>';
  } else {
    h += '<div style="font-size:11px;color:#f0c040;text-align:center;padding:6px;margin-bottom:8px;'
      + 'background:rgba(240,192,64,.08);border-radius:8px">✨ Livello massimo raggiunto</div>';
  }

  // Bar e Shop
  if (sec.level > 0 && !inCons) {
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
    if (sec.bar) {
      h += '<div style="font-size:11px;text-align:center;padding:6px;border-radius:7px;'
        + 'background:rgba(46,204,113,.12);border:1px solid rgba(46,204,113,.25);color:#69f0ae">'
        + '🍺 Bar · <strong>+' + (STADIUM_BAR_BONUS*100|0) + '%</strong></div>';
    } else {
      h += '<button onclick="stadiumBuild(\'' + key + '\',\'bar\')" style="font-size:11px;padding:6px;'
        + 'border-radius:7px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);'
        + 'color:rgba(255,255,255,.5);cursor:pointer">🍺 Bar · ' + formatMoney(STADIUM_BAR_COST) + '</button>';
    }
    if (sec.shop) {
      h += '<div style="font-size:11px;text-align:center;padding:6px;border-radius:7px;'
        + 'background:rgba(46,204,113,.12);border:1px solid rgba(46,204,113,.25);color:#69f0ae">'
        + '🛍️ Shop · <strong>+' + (STADIUM_SHOP_BONUS*100|0) + '%</strong></div>';
    } else {
      h += '<button onclick="stadiumBuild(\'' + key + '\',\'shop\')" style="font-size:11px;padding:6px;'
        + 'border-radius:7px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);'
        + 'color:rgba(255,255,255,.5);cursor:pointer">🛍️ Shop · ' + formatMoney(STADIUM_SHOP_COST) + '</button>';
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}


// ── Funzioni prezzo biglietto ─────────────────────────────────────────
function _ticketStep(dir) {
  var inp = document.getElementById('ticket-price-inp');
  if (!inp) return;
  var step = 1;
  var val  = Math.max(1, Math.min(150, (parseInt(inp.value) || 15) + dir * step));
  inp.value = val;
  _updateTicketHint();
}
window._ticketStep = _ticketStep;

function _updateTicketHint() {
  var inp  = document.getElementById('ticket-price-inp');
  var hint = document.getElementById('ticket-hint');
  if (!inp || !hint || !G || !G.stadium) return;
  var val = parseInt(inp.value) || 15;
  var rev = typeof calcStadiumRevenue === 'function' ? calcStadiumRevenue() : {};
  var range = (rev && rev.ticketRange) || { min: 1, max: 20 };
  var tooHigh = val > range.max;
  var tooLow  = val < range.min;
  var col = tooHigh ? '#f0c040' : '#69f0ae';
  var msg = tooHigh
    ? '⚠️ ' + t('extra.priceTooLow') + ' (-' + Math.round(Math.min(60, (val - range.max) * 1.5)) + '%)'
    : tooLow ? '💡 ' + t('goals.inProgress') : '✅ ' + t('goals.inProgress');
  hint.textContent = msg;
  hint.style.color = col;
}
window._updateTicketHint = _updateTicketHint;

function renderCredits() {
  // Legge la versione attuale dal footer della pagina (aggiornato ad ogni release)
  const footerEl = document.querySelector('.wp-version-footer');
  const version  = footerEl ? footerEl.textContent.trim() : 'v0.5.17 beta';
  const year     = new Date().getFullYear();

  document.getElementById('tab-credits').innerHTML = `
    <div style="max-width:600px;margin:0 auto">

      <!-- Header -->
      <div class="card" style="padding:28px;text-align:center;margin-bottom:16px">
        <div style="font-size:48px;margin-bottom:12px">🤽</div>
        <div style="font-size:28px;font-weight:700;color:var(--blue);margin-bottom:4px">Waterpolo Manager</div>
        <div style="font-size:14px;color:var(--muted)">Serie A1 Maschile — Stagione 2025/26</div>
        <div style="display:inline-block;margin-top:12px;padding:4px 14px;border-radius:20px;background:rgba(0,194,255,.12);border:1px solid rgba(0,194,255,.3);font-size:13px;color:var(--blue);font-weight:700">${version}</div>
      </div>

      <!-- Sviluppatore -->
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">Sviluppatore</div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--blue),#0a3a6a);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🤽</div>
          <div>
            <div style="font-size:17px;font-weight:700;color:var(--text)">Sviluppato da Davide Lanza - Grandepinna</div>
          </div>
        </div>
      </div>

      <!-- Licenza -->
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Licenza</div>
        <div style="font-size:13px;color:var(--text);margin-bottom:6px;font-weight:600">MIT License</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6">
          Copyright © ${year} Davide Lanza (Grandepinna).<br>
          Il software è distribuito liberamente per uso personale e non commerciale.<br>
          È consentita la modifica e la redistribuzione con attribuzione all'autore originale.
        </div>
      </div>

      <!-- Tecnologie -->
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Tecnologie</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          <div class="irow"><span class="ilbl">Frontend</span><span>HTML5 · CSS3 · JavaScript</span></div>
          <div class="irow"><span class="ilbl">${t('extra.authentication')}</span><span>Firebase Auth</span></div>
          <div class="irow"><span class="ilbl">Database</span><span>Firebase Realtime DB</span></div>
          <div class="irow"><span class="ilbl">Grafici</span><span>Canvas HTML5</span></div>
          <div class="irow"><span class="ilbl">Hosting</span><span>GitHub Pages</span></div>
          <div class="irow"><span class="ilbl">AI Development</span><span>Claude (Anthropic)</span></div>
        </div>
      </div>

      <!-- Info versione -->
      <div class="card" style="padding:16px;text-align:center">
        <div style="font-size:11px;color:var(--muted)">
          Waterpolo Manager ${version} · ${year}<br>
          <span style="margin-top:4px;display:inline-block">
            Sviluppato da Davide Lanza - Grandepinna · con ❤️ per gli appassionati di pallanuoto italiana
          </span>
        </div>
      </div>

    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════
// POPUP RISULTATO PARTITA SIMULATA
// ══════════════════════════════════════════════════════════════════════
function _showSimResultPopup(data) {
  var existing = document.getElementById('sim-result-popup');
  if (existing) existing.remove();

  var isWin  = data.myScore > data.opScore;
  var isDraw = data.myScore === data.opScore;
  var isLoss = data.myScore < data.opScore;

  var accentColor = isWin ? '#2ecc71' : isDraw ? '#f0a030' : '#e74c3c';
  var resultLabel = isWin ? t('match.result.win') : isDraw ? t('match.result.draw') : t('match.result.loss');
  var resultEmoji = isWin ? '🏆' : isDraw ? '🤝' : '💧';

  // Tabellino marcatori
  function _scorerRows(scorers, isMyTeam) {
    if (!scorers || !scorers.length) return '<div style="font-size:12px;color:var(--muted);padding:4px 0">—</div>';
    return scorers.map(function(s) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
        + '<span style="font-size:12px;color:' + (isMyTeam ? 'var(--text)' : 'var(--muted)') + '">' + s.name + '</span>'
        + '<span style="font-size:12px;font-weight:700">'
        + (s.goals > 0 ? '⚽ ×' + s.goals : '')
        + (s.assists > 0 ? ' 🤝 ×' + s.assists : '')
        + '</span>'
        + '</div>';
    }).join('');
  }

  var myName  = G.myTeam ? G.myTeam.name : '—';
  var oppName = data.opp ? data.opp.name : '—';

  var ov = document.createElement('div');
  ov.id = 'sim-result-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:700;backdrop-filter:blur(8px)';

  ov.innerHTML = '<div id="sim-result-card" style="background:var(--panel);border:2px solid ' + accentColor + '44;border-radius:18px;'
    + 'padding:28px;max-width:460px;width:92%;position:relative;'
    + 'box-shadow:0 0 60px ' + accentColor + '22,0 8px 40px rgba(0,0,0,.6)">'

    // Canvas coriandoli (solo vittoria)
    + (isWin ? '<canvas id="sim-confetti" style="position:absolute;inset:0;width:100%;height:100%;border-radius:18px;pointer-events:none;z-index:0"></canvas>' : '')

    // Contenuto
    + '<div style="position:relative;z-index:1">'

    // Giornata
    + '<div style="text-align:center;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px">'
    + t('common.round') + ' ' + data.round + '</div>'

    // Risultato grande
    + '<div style="text-align:center;margin-bottom:20px">'
    + '<div style="font-size:42px;margin-bottom:6px">' + resultEmoji + '</div>'
    + '<div style="font-size:28px;font-weight:900;color:' + accentColor + ';text-shadow:0 0 20px ' + accentColor + '60;margin-bottom:8px">'
    + resultLabel.toUpperCase()
    + '</div>'
    // Squadre e punteggio
    + '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:4px">'
    + '<span style="font-size:14px;font-weight:700;color:var(--text);text-align:right;flex:1">' + myName + '</span>'
    + '<span style="font-size:32px;font-weight:900;color:' + accentColor + ';min-width:80px;text-align:center">'
    + data.myScore + ' — ' + data.opScore
    + '</span>'
    + '<span style="font-size:14px;font-weight:700;color:var(--muted);text-align:left;flex:1">' + oppName + '</span>'
    + '</div>'
    // Premio
    + (data.reward ? '<div style="font-size:12px;color:var(--green);font-weight:700;margin-top:6px">+' + formatMoney(data.reward) + '</div>' : '')
    + '</div>'

    // Tabellino
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">'
    // Marcatori mia squadra
    + '<div>'
    + '<div style="font-size:10px;font-weight:700;color:' + accentColor + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">'
    + myName
    + '</div>'
    + _scorerRows(data.myScorers, true)
    + '</div>'
    // Marcatori avversari
    + '<div>'
    + '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">'
    + oppName
    + '</div>'
    + _scorerRows(data.oppScorers, false)
    + '</div>'
    + '</div>'

    // Bottone chiudi
    + '<button onclick="document.getElementById(\'sim-result-popup\').remove()" '
    + 'style="width:100%;padding:12px;background:' + accentColor + '22;border:1.5px solid ' + accentColor + '55;'
    + 'border-radius:10px;color:' + accentColor + ';font-weight:800;font-size:14px;cursor:pointer;'
    + 'transition:background .15s" '
    + 'onmouseover="this.style.background=\'' + accentColor + '33\'" '
    + 'onmouseout="this.style.background=\'' + accentColor + '22\'">'
    + t('common.close')
    + '</button>'
    + '</div>'
    + '</div>';

  ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);

  // Coriandoli per la vittoria
  if (isWin) _simResultConfetti();
}
window._showSimResultPopup = _showSimResultPopup;

// ── Chiudi popup risultato e mostra eventuale popup nazionale ─────────
function _closeSimResultAndShowNational() {
  var popup = document.getElementById('sim-result-popup');
  if (popup) popup.remove();
  // Se c'è un popup nazionale in attesa, mostrarlo solo se abilitato nella config
  if (G._pendingNationalPopup && G._pendingNationalPopup.length > 0) {
    var _natCfg = typeof getConfig === 'function' ? getConfig() : { newsPopup: {} };
    if (_natCfg.newsPopup && _natCfg.newsPopup['national'] !== false) {
      var _toShow = G._pendingNationalPopup;
      G._pendingNationalPopup = null;
      setTimeout(function() {
        if (typeof _showNationalPopup === 'function') _showNationalPopup(_toShow);
      }, 200);
    } else {
      G._pendingNationalPopup = null; // scarta silenziosamente
    }
  }
}
window._closeSimResultAndShowNational = _closeSimResultAndShowNational;


function _simResultConfetti() {
  var canvas = document.getElementById('sim-confetti');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 460;
  canvas.height = canvas.offsetHeight || 520;

  var colors = ['#2ecc71','#00c2ff','#f0c040','#e74c3c','#a855f7','#ff8c42','#69f0ae'];
  var pieces = Array.from({ length: 90 }, function() {
    return {
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * .4,
      vx: (Math.random() - .5) * 2.5,
      vy: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 5 + Math.random() * 7,
      h: 3 + Math.random() * 4,
      rot: Math.random() * 360,
      vr: (Math.random() - .5) * 8,
    };
  });

  var frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var alive = false;
    pieces.forEach(function(p) {
      if (p.y > canvas.height + 20) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += .04;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.y / (canvas.height * 1.2));
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    if (alive) frame = requestAnimationFrame(draw);
  }
  draw();
  // Ferma dopo 3.5 sec
  setTimeout(function() { if (frame) cancelAnimationFrame(frame); }, 3500);
}
