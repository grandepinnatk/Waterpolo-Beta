// ─────────────────────────────────────────────
// ui/lineup.js  — Convocazioni e formazione
//
// Feature:
//  1. Numerazione manuale camicie (1-13) nella lista
//  2. Formazione ricordata tra una gara e l'altra (G.savedLineup)
//  3. Drag-and-drop dalla lista → slot in campo
// ─────────────────────────────────────────────

let luState = {
  formation: {}, convocati: new Set(), shirtNumbers: {},
  selectedPlayer: null, selectedPos: null, dragSrc: null,
  match: null, isHome: true, opp: null, poType: null, poMatch: null,
};

const MAX_CONVOCATI = 13;
const MIN_CONVOCATI = 5;

// ── Apre la schermata ─────────────────────────
function openLineup(match, isHome, opp, poType = null, poMatch = null) {
  const saved = G.savedLineup || {};
  luState = {
    formation:      { ...(saved.formation || {}) },
    convocati:      new Set(saved.convocati || []),
    shirtNumbers:   { ...(saved.shirtNumbers || {}) },
    selectedPlayer: null, selectedPos: null, dragSrc: null,
    match, isHome, opp, poType, poMatch,
  };
  const label = poType === 'sf' ? match.label
              : poType === 'final' ? t('playoff.final')
              : poType === 'pl' ? 'Play-out'
              : t('common.round') + ' ' + match.round;
  document.getElementById('lu-lbl').textContent   = label + ' · ' + (isHome ? t('common.home') : t('common.away'));
  document.getElementById('lu-title').textContent = G.myTeam.name + ' vs ' + opp.name;
  showScreen('sc-lineup');
  renderLineupPool(); renderPlayerSelList(); updateLuStatus();
}

function cancelLineup() { showScreen('sc-game'); updateHeader(); showTab('dash'); }

// ── Campo visuale con drag-and-drop ───────────
// Posizione semplificata per lo slot campo: GK→POR, numeri senza etichetta
function _simplePos(pk) {
  if (!pk || pk === 'GK') return 'POR';
  return String(pk); // '1','2','3','4','5','6'
}

// Formato nome per slot campo: "Cognome I." (es. "Rossi M.")
function _slotName(p) {
  if (!p) return '—';
  // Formato nuovo: "M. Rossi" → "Rossi M."
  if (/^[A-Z]\.\s/.test(p.name)) {
    const parts = p.name.split(' ');
    const init  = parts[0];        // "M."
    const cogn  = parts.slice(1).join(' '); // "Rossi"
    return cogn + ' ' + init;
  }
  // Formato vecchio: "Marco Rossi" → "Rossi M."
  const parts = p.name.trim().split(' ');
  if (parts.length >= 2) {
    return parts[parts.length - 1] + ' ' + parts[0][0] + '.';
  }
  return p.name;
}

// Etichetta mano: include Ambidestro
function _handLabel(hand) {
  if (hand === 'AMB') return t('hand.AMB');
  if (hand === 'L')   return t('hand.L');
  return t('hand.R');
}

// Badge ruolo colorato (stessa CSS del tab Rosa)
function _luRoleBadge(role) {
  const cls = role==='POR'?'S': role==='DIF'?'A': role==='CB'?'B': 'C';
  return `<span class="badge ${cls}">${role}</span>`;
}

// Badge mano colorato
function _luHandBadge(hand) {
  const cls = hand==='AMB'?'AMB': hand==='L'?'L': 'R';
  return `<span class="badge ${cls}">${hand}</span>`;
}

function renderLineupPool() {
  const container = document.getElementById('lineup-pool');
  container.innerHTML = '';
  const W = container.offsetWidth || 380;
  const H = Math.round(W / 1.6);
  container.style.height = H + 'px';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '0 0 380 238');
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  svg.innerHTML = `
    <rect width="380" height="238" fill="#00a8c8"/>
    <rect x="2" y="2" width="376" height="234" fill="none" stroke="#fff" stroke-width="1.5" stroke-opacity=".4" rx="6"/>
    <line x1="190" y1="2" x2="190" y2="236" stroke="#fff" stroke-width=".8" stroke-opacity=".2" stroke-dasharray="6,4"/>
    <path d="M95,190 Q190,145 285,190" fill="none" stroke="#fff" stroke-width="1.2" stroke-opacity=".4"/>
    <path d="M40,190 Q190,100 340,190" fill="none" stroke="#f0c040" stroke-width="1" stroke-opacity=".4"/>
    <rect x="155" y="218" width="70" height="16" rx="3" fill="none" stroke="#fff" stroke-width="2" stroke-opacity=".6"/>
    <text x="190" y="230" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.5)">${G.myTeam.abbr}</text>
    <rect x="155" y="4" width="70" height="16" rx="3" fill="none" stroke="#e74c3c" stroke-width="2" stroke-opacity=".6"/>
    <text x="190" y="16" text-anchor="middle" font-size="8" fill="rgba(231,76,60,.6)">${luState.opp ? luState.opp.abbr : 'OPP'}</text>`;
  container.appendChild(svg);

  POS_KEYS.forEach(pk => {
    const pos   = POSITIONS[pk];
    const pi    = luState.formation[pk];
    const filled = pi !== undefined;
    const p     = filled ? G.rosters[G.myId][pi] : null;
    const isSel = luState.selectedPos === pk;
    const shirt = filled ? (luState.shirtNumbers[pi] || '') : '';

    const slot = document.createElement('div');
    slot.dataset.poskey = pk;
    slot.style.cssText = [
      'position:absolute',
      `left:calc(${pos.x * 100}% - 22px)`,
      `top:calc(${pos.y * 100}% - 22px)`,
      'width:44px', 'height:44px', 'border-radius:50%',
      'display:flex', 'align-items:center', 'justify-content:center',
      'cursor:pointer', 'z-index:5', 'transition:all .15s',
      'text-align:center', 'line-height:1.2', 'user-select:none',
    ].join(';');

    if (filled && p) {
      slot.style.background = '#185FA5';
      slot.style.border     = isSel ? '3px solid var(--gold)' : '2px solid #00c2ff';
      slot.style.boxShadow  = isSel ? '0 0 14px var(--gold)' : '';
      slot.style.color      = '#fff';
      // Nome formato: "Cognome I." su riga dedicata
      const sn = _slotName(p); // es. "Rossi M."
      slot.innerHTML = `<div style="font-weight:700;text-align:center;line-height:1.25;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:11px;color:#f0c040;line-height:1">${shirt}</div>
        <div style="font-size:8px;white-space:nowrap;overflow:hidden;width:48px;text-overflow:ellipsis;text-align:center;line-height:1.2">${sn}</div>
      </div>`;
      slot.title = `#${shirt} ${p.name} · ${_simplePos(pk)}`;
    } else {
      slot.style.background = 'rgba(0,0,0,.3)';
      slot.style.border     = isSel ? '3px solid var(--gold)' : '2px dashed rgba(255,255,255,.4)';
      slot.style.boxShadow  = isSel ? '0 0 14px var(--gold)' : '';
      slot.style.color      = 'rgba(255,255,255,.6)';
      slot.innerHTML        = `<div style="font-size:9px">${_simplePos(pk)}</div>`;
    }

    slot.onclick = () => selectPos(pk);

    // Drop target
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.style.outline = '2px solid #f0c040'; });
    slot.addEventListener('dragleave', () => { slot.style.outline = ''; });
    slot.addEventListener('drop', e => {
      e.preventDefault(); slot.style.outline = '';
      const srcPi = parseInt(e.dataTransfer.getData('rosterIdx'), 10);
      if (!isNaN(srcPi)) _assignToPos(pk, srcPi);
    });

    container.appendChild(slot);
  });
}

// ── Lista giocatori con numeri maglia ─────────
function renderPlayerSelList() {
  const container = document.getElementById('player-sel-list');
  container.innerHTML = '';
  const roster    = G.rosters[G.myId];
  const usedByPos = {};
  Object.entries(luState.formation).forEach(([pk, pi]) => { usedByPos[pi] = pk; });

  // Intestazione
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:grid;grid-template-columns:34px 1fr 76px 38px 22px;gap:4px;padding:3px 6px 5px;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border);margin-bottom:4px';
  hdr.innerHTML = `<div title="${t('lineup.shirt')}">#</div><div>${t('roster.title')}</div><div>Pos / ${t('roles.POR').replace('Portiere','Ruolo')}</div><div>${t('roster.fitness')}</div><div></div>`;
  container.appendChild(hdr);

  const roleOrder = { POR:0, DIF:1, CEN:2, ATT:3, CB:4 };
  const sortedRoster = roster
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const rDiff = (roleOrder[a.p.role]??5) - (roleOrder[b.p.role]??5);
      if (rDiff !== 0) return rDiff;
      return b.p.overall - a.p.overall;
    });

  sortedRoster.forEach(({ p, i }) => {
    const isSel  = luState.selectedPlayer === i;
    const usedPk = usedByPos[i];
    const isConv = luState.convocati.has(i);
    const shirt  = luState.shirtNumbers[i] || '';
    const posLabel = usedPk ? (POSITIONS[usedPk]?.label || usedPk) : (isConv ? t('lineup.panchina') : '');

    const row = document.createElement('div');
    row.style.cssText = [
      'display:grid', 'grid-template-columns:34px 1fr 76px 38px 22px',
      'gap:4px', 'align-items:center', 'padding:5px 6px',
      'border-radius:8px', 'margin-bottom:3px', 'transition:all .12s',
      'border:1.5px solid ' + (p.injured ? 'rgba(192,57,43,.3)' : (p._national||p._nationalNext) ? 'rgba(21,101,192,.25)' : isSel ? 'var(--blue)' : usedPk ? '#185FA5' : isConv ? 'rgba(255,255,255,.1)' : 'transparent'),
      'background:' + (p.injured ? 'rgba(192,57,43,.06)' : (p._national||p._nationalNext) ? 'rgba(21,101,192,.06)' : isSel ? 'rgba(0,194,255,.12)' : usedPk ? 'rgba(24,95,165,.15)' : isConv ? 'rgba(255,255,255,.04)' : 'transparent'),
      'cursor:' + ((p.injured || p._national || p._nationalNext) ? 'not-allowed' : usedPk || isConv ? 'grab' : 'pointer'),
    ].join(';');

    // Cella numero maglia
    const shirtCell = document.createElement('div');
    shirtCell.style.cssText = 'display:flex;align-items:center;justify-content:center';
    if (isConv) {
      // Mostra calottina SVG cliccabile (o placeholder se non numerato)
      const capDiv = document.createElement('div');
      capDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;cursor:pointer';
      capDiv.title = shirt ? t('lineup.shirt') + ' #' + shirt : t('lineup.shirt');
      capDiv.onclick = e => { e.stopPropagation(); openCapAssignment(i); };
      if (shirt) {
        capDiv.innerHTML = _capSVG(shirt, shirt === 1, 34);
      } else {
        capDiv.innerHTML = `<div style="width:34px;height:34px;border-radius:50%;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--muted)" title="Assegna numero">+</div>`;
      }
      shirtCell.appendChild(capDiv);
    } else {
      shirtCell.innerHTML = `<span style="font-size:11px;color:var(--muted)">—</span>`;
    }
    row.appendChild(shirtCell);

    // Cella nome
    const nameCell = document.createElement('div');
    nameCell.style.cssText = 'min-width:0';
    const infTag = p.injured ? ` <span style="font-size:9px;background:#c0392b;color:#fff;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:3px" title="${t('lineup.injured')}">INF+</span>` : '';
    const flags = { ITA:'🇮🇹', CRO:'🇭🇷', SRB:'🇷🇸', HUN:'🇭🇺', GRE:'🇬🇷', MNE:'🇲🇪', ESP:'🇪🇸' };
    const nazTag = (p._national || p._nationalNext) ? ' <span style="font-size:9px;background:#1565c0;color:#fff;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:3px" title="Nat">NAZ ' + (flags[p._nationalNat]||'') + '</span>' : '';
    const rowOpacity = (p.injured || p._national || p._nationalNext) ? '.45' : '1';
    nameCell.innerHTML = `
      <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:${rowOpacity}">${p.name}${_ritBadge(p)}${_scadBadge(p)}${infTag}${nazTag}</div>
      <div style="font-size:10px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px">
        ${_luRoleBadge(p.role)}${p.secondRole ? ' ' + _luRoleBadge(p.secondRole) : ''} ${_luHandBadge(p.hand)}
        <span style="color:var(--muted)">${p.age}a · OVR ${p.overall}</span>
      </div>`;
    row.appendChild(nameCell);

    // Cella posizione
    const posCell = document.createElement('div');
    posCell.innerHTML = `<span style="font-size:11px;font-weight:600;color:${usedPk?'var(--blue)':isConv?'var(--muted)':'rgba(255,255,255,.2)'}">${posLabel||'—'}</span>`;
    row.appendChild(posCell);

    // Cella forma
    const fc = p.fitness > 70 ? '#2ecc71' : p.fitness > 45 ? '#f0c040' : '#e74c3c';
    const fitCell = document.createElement('div');
    fitCell.innerHTML = `<span style="font-size:11px;color:${fc}">${Math.round(Math.min(100, p.fitness || 0))}%</span>`;
    row.appendChild(fitCell);

    // Cella icona ⓘ — apre scheda giocatore
    const infoCell = document.createElement('div');
    infoCell.style.cssText = 'display:flex;align-items:center;justify-content:center';
    infoCell.innerHTML = `<span
      title="Info"
      style="width:18px;height:18px;border-radius:50%;border:1px solid var(--muted);display:inline-flex;
             align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--muted);
             font-style:italic;font-weight:700;flex-shrink:0">i</span>`;
    infoCell.firstElementChild.addEventListener('click', e => {
      e.stopPropagation();
      // Riusa showPlayerModal se disponibile (siamo fuori dalla partita)
      if (typeof showPlayerModal === 'function') {
        showPlayerModal(i);
      }
    });
    row.appendChild(infoCell);

    // Click per selezionare / aggiungere ai convocati
    row.onclick = () => { if (!p.injured && !p._national && !p._nationalNext) selectPlayerLu(i); };

    // Doppio click: rimuovi dai convocati
    row.ondblclick = e => {
      e.stopPropagation();
      if (isConv) removeFromConvocati(i);
    };

    // Drag source
    if (usedPk || isConv) {
      row.draggable = true;
      row.addEventListener('dragstart', e => {
        luState.dragSrc = i;
        e.dataTransfer.setData('rosterIdx', String(i));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => { row.style.opacity = '.4'; }, 0);
      });
      row.addEventListener('dragend', () => { row.style.opacity = ''; });
    }

    container.appendChild(row);
  });

  // Footer info
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:8px;padding:6px 8px;border-radius:7px;background:var(--panel2);font-size:11px;color:var(--muted);line-height:1.5';
  footer.innerHTML = `<strong style="color:var(--blue)">${luState.convocati.size}</strong>/${MAX_CONVOCATI} convocati ·
    Clicca per selezionare · <strong>Trascina</strong> sulle posizioni ·
    Doppio click per rimuovere`;
  container.appendChild(footer);
}

// ── Logica assegnazione ───────────────────────
function _assignToPos(pk, pi) {
  Object.keys(luState.formation).forEach(p => {
    if (luState.formation[p] === pi) delete luState.formation[p];
  });
  luState.formation[pk] = pi;
  luState.convocati.add(pi);
  luState.selectedPlayer = null;
  luState.selectedPos    = null;
  renderLineupPool(); renderPlayerSelList(); updateLuStatus();
  _maybeOpenCapPopup();
}

function selectPos(pk) {
  if (luState.selectedPlayer !== null) {
    _assignToPos(pk, luState.selectedPlayer);
  } else {
    luState.selectedPos = luState.selectedPos === pk ? null : pk;
    renderLineupPool(); updateLuStatus();
  }
}

function selectPlayerLu(i) {
  const roster = G.rosters[G.myId];
  // Non si possono convocare/schierare giocatori infortunati
  if (roster && roster[i] && (roster[i].injured || roster[i]._national || roster[i]._nationalNext)) return;
  if (luState.selectedPlayer === i) {
    luState.selectedPlayer = null;
  } else {
    luState.selectedPlayer = i;
    if (!luState.convocati.has(i) && luState.convocati.size < MAX_CONVOCATI) {
      luState.convocati.add(i);
      _maybeOpenCapPopup();
    }
  }
  if (luState.selectedPos !== null && luState.selectedPlayer !== null) {
    _assignToPos(luState.selectedPos, luState.selectedPlayer);
    return;
  }
  renderPlayerSelList(); updateLuStatus();
}

function removeFromConvocati(pi) {
  luState.convocati.delete(pi);
  delete luState.shirtNumbers[pi];
  Object.keys(luState.formation).forEach(pk => {
    if (luState.formation[pk] === pi) delete luState.formation[pk];
  });
  // Riassegna numeri sequenziali ai convocati rimanenti che ne sono privi
  _resequenceShirts();
  renderLineupPool(); renderPlayerSelList(); updateLuStatus();
}

// Riassegna numeri mancanti mantenendo quelli già assegnati
function _resequenceShirts() {
  const allNums  = new Set(Object.values(luState.shirtNumbers).filter(v => v !== undefined));
  let nextNum = 1;
  // Prima i titolari in ordine posizione
  POS_KEYS.forEach(pk => {
    const pi = luState.formation[pk];
    if (pi === undefined) return;
    if (luState.shirtNumbers[pi] === undefined) {
      while (allNums.has(nextNum)) nextNum++;
      luState.shirtNumbers[pi] = nextNum;
      allNums.add(nextNum);
    }
  });
  // Poi i convocati rimanenti
  [...luState.convocati].forEach(pi => {
    if (luState.shirtNumbers[pi] === undefined) {
      while (allNums.has(nextNum)) nextNum++;
      luState.shirtNumbers[pi] = nextNum;
      allNums.add(nextNum);
    }
  });
}

// ── Auto-formazione ───────────────────────────
function autoFillLineup() {
  luState.formation = {}; luState.convocati = new Set(); luState.shirtNumbers = {};
  const roster = G.rosters[G.myId];
  const used   = new Set();

  const por = roster.map((p, i) => ({ p, i }))
    .filter(x => x.p.role === 'POR' && !x.p.injured && !x.p._national && !x.p._nationalNext)
    .sort((a, b) => b.p.overall - a.p.overall)[0];
  if (por) { luState.formation['GK'] = por.i; used.add(por.i); luState.convocati.add(por.i); }

  ['1','2','3','4','5','6'].forEach(pk => {
    const posInfo  = POSITIONS[pk];
    const prefRole = POS_ROLE_AFFINITY[pk];
    const prefHand = posInfo && posInfo.prefHand;  // 'R', 'L' o undefined
    const cands = roster.map((p, i) => ({ p, i }))
      .filter(x => !used.has(x.i) && x.p.role !== 'POR' && !x.p.injured && !x.p._national && !x.p._nationalNext)
      .sort((a, b) => {
        // Score: ruolo corretto +10, mano preferita +5, AMB equivale alla mano preferita (+5), overall come base
        const scoreA = (a.p.role === prefRole ? 10 : 0)
                     + (prefHand ? (a.p.hand === prefHand || a.p.hand === 'AMB' ? 5 : 0) : 0)
                     + a.p.overall;
        const scoreB = (b.p.role === prefRole ? 10 : 0)
                     + (prefHand ? (b.p.hand === prefHand || b.p.hand === 'AMB' ? 5 : 0) : 0)
                     + b.p.overall;
        return scoreB - scoreA;
      });
    if (cands.length) { luState.formation[pk]=cands[0].i; used.add(cands[0].i); luState.convocati.add(cands[0].i); }
  });

  // Riserve migliori
  roster.map((p, i) => ({ p, i }))
    .filter(x => !used.has(x.i) && !x.p.injured && !x.p._national && !x.p._nationalNext)
    .sort((a, b) => b.p.overall - a.p.overall)
    .forEach(({ i }) => { if (luState.convocati.size < MAX_CONVOCATI) luState.convocati.add(i); });

  _autoAssignShirts();
  renderLineupPool(); renderPlayerSelList(); updateLuStatus();
}

function _autoAssignShirts() {
  luState.shirtNumbers = {};
  let n = 1;
  POS_KEYS.forEach(pk => {
    const pi = luState.formation[pk];
    if (pi !== undefined) luState.shirtNumbers[pi] = n++;
  });
  [...luState.convocati]
    .filter(pi => !Object.values(luState.formation).includes(pi))
    .forEach(pi => { luState.shirtNumbers[pi] = n++; });
}

function clearLineup() {
  luState.formation = {}; luState.convocati = new Set(); luState.shirtNumbers = {};
  luState.selectedPlayer = null; luState.selectedPos = null;
  renderLineupPool(); renderPlayerSelList(); updateLuStatus();
}

// ── Validazione ───────────────────────────────
function updateLuStatus() {
  const filled    = Object.keys(luState.formation).length;
  const hasGK     = luState.formation['GK'] !== undefined;
  const convCount = luState.convocati.size;

  // Giocatori in formazione: devono essere ancora convocati
  const formationPis = Object.values(luState.formation);
  const formationValid = formationPis.every(pi => luState.convocati.has(pi));

  // Numeri: tutti i convocati devono avere un numero (riserve comprese)
  const convArr    = [...luState.convocati];
  const withShirt  = convArr.filter(pi => luState.shirtNumbers[pi] !== undefined).length;
  const allHaveNum = withShirt === convCount && convCount > 0;

  // Verifica duplicati solo tra i convocati che hanno numero
  const convNums = convArr.map(pi => luState.shirtNumbers[pi]).filter(v => v !== undefined);
  const unique   = new Set(convNums).size === convNums.length;

  let msg = `Formazione: <strong>${filled}/${POS_KEYS.length}</strong> · Convocati: <strong>${convCount}/${MAX_CONVOCATI}</strong>`;
  if (!hasGK && filled > 0)    msg += ' · <span style="color:var(--red)">⚠ Portiere mancante</span>';
  if (!formationValid)          msg += ' · <span style="color:var(--red)">⚠ Riassegna le posizioni vuote</span>';
  if (convCount >= MIN_CONVOCATI && !allHaveNum) msg += ' · <span style="color:var(--gold)">Assegna un # a tutti i convocati</span>';
  if (!unique && convNums.length > 0) msg += ' · <span style="color:var(--red)">⚠ Numeri duplicati</span>';
  if (luState.selectedPlayer !== null) msg += ' · <span style="color:var(--gold)">Ora clicca una posizione</span>';
  if (luState.selectedPos !== null && luState.selectedPlayer === null) msg += ' · <span style="color:var(--gold)">Ora clicca un giocatore</span>';

  document.getElementById('lu-status').innerHTML = msg;

  // Può avviare: 7 posizioni coperte da convocati validi + GK + MIN_CONVOCATI + numeri ok
  const canGo = filled === POS_KEYS.length && hasGK && formationValid
              && convCount >= MIN_CONVOCATI && allHaveNum && unique;
  document.getElementById('btn-confirm-lu').disabled = !canGo;
}

// ── Conferma ──────────────────────────────────
function confirmLineup() {
  const data = {
    formation:    { ...luState.formation },
    convocati:    [...luState.convocati],
    shirtNumbers: { ...luState.shirtNumbers },
  };
  G.savedLineup = { ...data }; // ricorda per la prossima gara
  G.lineup      = { ...data };
  showScreen('sc-match');
  startLiveMatch(luState.match, luState.isHome, luState.opp, luState.poType, luState.poMatch);
}

// ══════════════════════════════════════════════
// POPUP ASSEGNAZIONE CALOTTINE
// ══════════════════════════════════════════════

const CAP_RED_COL  = '#C0392B';   // calottina n.1 sempre rossa
const CAP_TEXT_COL = '#ffffff';

// Genera SVG di una calottina da nuoto con numero
// isGK=true → sempre rossa; altrimenti usa il colore passato (bianco in casa, blu in trasferta)
function _capSVG(num, isGK, size = 64, overrideColor) {
  const CAP_HOME_COL = '#FFFFFF';   // bianca in casa
  const CAP_AWAY_COL = '#1a4fa0';   // blu in trasferta
  const isHome = luState.isHome;
  let fill, stroke;
  if (isGK) {
    fill   = CAP_RED_COL;           // portiere sempre rosso
    stroke = '#8B0000';
  } else if (overrideColor) {
    fill   = overrideColor;
    stroke = _darken(overrideColor);
  } else {
    fill   = isHome ? CAP_HOME_COL : CAP_AWAY_COL;
    stroke = isHome ? '#cccccc'     : _darken(CAP_AWAY_COL);
  }
  const textColor = (fill === '#FFFFFF') ? '#003060' : '#ffffff'; // testo scuro su bianco
  const txt = String(num);
  const fs  = num >= 10 ? 18 : 22;

  // Forma calottina: ellisse superiore + fascia laterale
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <!-- Calottina base -->
    <ellipse cx="32" cy="28" rx="26" ry="22" fill="${fill}"/>
    <!-- Fascia laterale sinistra -->
    <path d="M6 28 Q6 50 32 52 Q32 52 32 52" fill="${stroke}" opacity=".35"/>
    <!-- Fascia laterale destra -->
    <path d="M58 28 Q58 50 32 52 Q32 52 32 52" fill="${stroke}" opacity=".35"/>
    <!-- Bordo -->
    <ellipse cx="32" cy="28" rx="26" ry="22" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
    <!-- Strap sinistro -->
    <path d="M9 34 Q8 42 14 46" stroke="${stroke}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>
    <!-- Strap destro -->
    <path d="M55 34 Q56 42 50 46" stroke="${stroke}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>
    <!-- Numero -->
    <text x="32" y="33" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial Black, sans-serif" font-weight="900" font-size="${fs}"
          fill="${textColor}" letter-spacing="0">${txt}</text>
  </svg>`;
}

function _darken(hex) {
  try {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.max(0, (n >> 16) - 40);
    const g = Math.max(0, ((n >> 8) & 0xff) - 40);
    const b = Math.max(0, (n & 0xff) - 40);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  } catch { return '#003060'; }
}

// Apre il popup calottine per il giocatore indicato
// Se playerRosterIdx è null mostra le calottine libere per tutti i non-numerati
function openCapAssignment(playerRosterIdx) {
  const existing = document.getElementById('cap-popup');
  if (existing) existing.remove();

  const p = playerRosterIdx !== null ? G.rosters[G.myId][playerRosterIdx] : null;
  const usedNums = new Set(Object.values(luState.shirtNumbers));

  const overlay = document.createElement('div');
  overlay.id = 'cap-popup';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,.72)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'z-index:500', 'backdrop-filter:blur(6px)',
  ].join(';');

  const playerName = p ? p.name : t('lineup.available');
  const subtitle   = p ? `${t('lineup.shirt')}: <strong>${playerName}</strong>`
                       : t('lineup.subtitle');

  let capsHtml = '';
  for (let n = 1; n <= 13; n++) {
    const taken    = usedNums.has(n);
    // Chi ce l'ha già?
    const ownerIdx = taken ? parseInt(Object.entries(luState.shirtNumbers).find(([,v]) => v === n)?.[0], 10) : -1;
    const owner    = ownerIdx >= 0 ? G.rosters[G.myId][ownerIdx] : null;
    const isAssignedToThis = playerRosterIdx !== null && luState.shirtNumbers[playerRosterIdx] === n;

    capsHtml += `
      <div onclick="assignCapNumber(${playerRosterIdx}, ${n})"
           title="${taken && !isAssignedToThis ? t('lineup.shirt') + ' — ' + (owner ? _slotName(owner) : '?') : t('lineup.shirt') + ' #' + n}"
           style="
             display:flex; flex-direction:column; align-items:center; gap:4px;
             cursor:${taken && !isAssignedToThis ? 'not-allowed' : 'pointer'};
             opacity:${taken && !isAssignedToThis ? '.35' : '1'};
             border:3px solid ${isAssignedToThis ? 'var(--gold)' : 'transparent'};
             border-radius:12px; padding:6px;
             background:${isAssignedToThis ? 'rgba(240,192,64,.15)' : 'transparent'};
             transition:all .12s;
           "
           onmouseover="if(!${taken && !isAssignedToThis}) this.style.background='rgba(255,255,255,.08)'"
           onmouseout="this.style.background='${isAssignedToThis ? 'rgba(240,192,64,.15)' : 'transparent'}'">
        ${_capSVG(n, n === 1, 56)}
        ${taken && !isAssignedToThis
          ? `<span style="font-size:9px;color:var(--muted)">${owner ? _slotName(owner) : '?'}</span>`
          : `<span style="font-size:9px;color:var(--muted)">#${n}</span>`
        }
      </div>`;
  }

  overlay.innerHTML = `
    <div style="
      background:var(--panel); border:1px solid var(--border); border-radius:16px;
      padding:22px; max-width:560px; width:95%; max-height:90vh; overflow-y:auto;
    ">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--blue);margin-bottom:4px">
            Assegna Calottina
          </div>
          <div style="font-size:13px;color:var(--muted)">${subtitle}</div>
        </div>
        <button onclick="document.getElementById('cap-popup').remove()"
                style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);line-height:1">✕</button>
      </div>
      <div style="
        display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:16px;
      ">${capsHtml}</div>
      <div style="font-size:11px;color:var(--muted);text-align:center">
        La calottina <span style="color:${CAP_RED_COL};font-weight:700">#1</span> è riservata al marcatore del centroboa (rossa per regolamento)
      </div>
    </div>`;

  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// Assegna il numero scelto nel popup al giocatore
function assignCapNumber(playerRosterIdx, num) {
  if (playerRosterIdx === null) return; // non dovrebbe accadere

  const usedNums = new Set(Object.values(luState.shirtNumbers));
  // Se il numero è già preso da un altro, non fare niente
  const currentOwnerKey = Object.entries(luState.shirtNumbers)
    .find(([k, v]) => v === num && parseInt(k, 10) !== playerRosterIdx)?.[0];
  if (currentOwnerKey !== undefined) return; // già assegnata ad altro

  // Assegna
  luState.shirtNumbers[playerRosterIdx] = num;

  // Chiudi popup e aggiorna
  document.getElementById('cap-popup')?.remove();
  renderLineupPool();
  renderPlayerSelList();
  updateLuStatus();

  // Se ci sono ancora convocati senza numero, riapri subito per il prossimo
  const unnumbered = [...luState.convocati].filter(pi => !luState.shirtNumbers[pi]);
  if (unnumbered.length > 0) {
    // Piccolo delay per dare il tempo al DOM di aggiornarsi
    setTimeout(() => openCapAssignment(unnumbered[0]), 120);
  }
}

// Trigger automatico: appena i convocati raggiungono MAX_CONVOCATI
// e c'è almeno un non-numerato, apri il popup sequenziale
function _maybeOpenCapPopup() {
  // Apre il popup per ogni convocato senza numero, indipendentemente dal totale
  const unnumbered = [...luState.convocati].filter(pi => !luState.shirtNumbers[pi]);
  if (unnumbered.length > 0) {
    setTimeout(() => openCapAssignment(unnumbered[0]), 200);
  }
}
