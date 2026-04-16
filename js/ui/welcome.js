// ─────────────────────────────────────────────
// ui/welcome.js
// Schermata iniziale: selezione squadra + gestione
// slot di salvataggio (carica / sovrascrivi / elimina).
// ─────────────────────────────────────────────

let _selectedTeamId = TEAMS_DATA[0].id;
// Slot che l'utente sta per sovrascrivere con una nuova carriera
let _pendingNewGameSlot = null;

// ─────────────────────────────────────────────
// BUILD WELCOME
// ─────────────────────────────────────────────
function buildWelcomeScreen() {
  _buildTeamList();
  _buildSlotsPanel();
  selectTeamInWelcome(TEAMS_DATA[0].id);
}

function _buildTeamList() {
  const container = document.getElementById('team-list');
  if (!container) return;
  container.innerHTML = '';
  TEAMS_DATA.forEach(t => {
    const div = document.createElement('div');
    div.id = 'tsl-' + t.id;
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer;border:1.5px solid transparent;margin-bottom:3px;transition:all .15s';
    div.innerHTML = `
      <div style="width:38px;height:38px;border-radius:50%;background:${t.col};display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
        ${t.logo
          ? `<img src="${t.logo}" style="width:38px;height:38px;object-fit:contain;border-radius:50%" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><span style="display:none;color:#fff;font-size:10px;font-weight:700">${t.abbr}</span>`
          : `<span style="color:#fff;font-size:10px;font-weight:700">${t.abbr}</span>`}
      </div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${t.name}</div>
        <div style="font-size:11px;color:var(--muted)">${t.city} · ${formatMoney(t.budget)}</div>
      </div>
      <span class="badge ${t.tier}">${t.tier}</span>`;
    div.onclick = () => selectTeamInWelcome(t.id);
    container.appendChild(div);
  });
}

function selectTeamInWelcome(id) {
  document.querySelectorAll('[id^="tsl-"]').forEach(el => {
    el.style.border = '1.5px solid transparent';
    el.style.background = '';
  });
  const el = document.getElementById('tsl-' + id);
  if (el) {
    el.style.border = '1.5px solid var(--blue)';
    el.style.background = 'rgba(0,194,255,.08)';
  }
  _selectedTeamId = id;
}

// ─────────────────────────────────────────────
// SLOT PANEL
// ─────────────────────────────────────────────
function _buildSlotsPanel() {
  const panel = document.getElementById('slots-panel');
  if (!panel) return;
  panel.innerHTML = '';
  const metas = readAllSlotsMeta(); // [meta|null, meta|null, meta|null]

  metas.forEach((meta, i) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.id = 'slot-card-' + i;

    if (meta) {
      // ── Slot occupato ──
      const stagione = t('common.season') + ' ' + (meta.seasonNumber || 1);
      const giornata = t('common.round') + ' ' + Math.max(1, (meta.round || 0) + 1);
      const phaseLabel = {
        regular: stagione + ' · ' + giornata,
        playoff: stagione + ` · ${t('nav.playoff')}`,
        playout: stagione + ' · Play-out',
        done:    stagione + ` · ${t('nav.endSeason')}`,
      }[meta.phase] || (stagione + ' · ' + meta.phase);

      const savedDate = new Date(meta.savedAt).toLocaleString(I18N.getLang() === 'en' ? 'en-GB' : 'it-IT', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });

      card.innerHTML = `
        <div class="slot-header">
          <div class="slot-team-dot" style="background:${meta.teamCol};overflow:hidden;display:flex;align-items:center;justify-content:center">
            ${(TEAMS_DATA.find(t=>t.id===meta.teamId)&&TEAMS_DATA.find(t=>t.id===meta.teamId).logo)
              ? `<img src="${TEAMS_DATA.find(t=>t.id===meta.teamId).logo}" style="width:100%;height:100%;object-fit:contain;border-radius:50%" onerror="this.style.display='none'" />`
              : meta.teamAbbr}
          </div>
          <div class="slot-team-info">
            <div class="slot-team-name">${meta.teamName}</div>
            <div class="slot-meta">${phaseLabel} · ${savedDate}</div>
          </div>
          <span class="badge ${meta.teamTier}">${meta.teamTier}</span>
        </div>
        <div class="slot-stats">
          <div class="slot-stat"><span class="slot-stat-val">${meta.position}°</span><span class="slot-stat-lbl">Pos</span></div>
          <div class="slot-stat"><span class="slot-stat-val">${meta.points}</span><span class="slot-stat-lbl">${t('standings.points')}</span></div>
          <div class="slot-stat"><span class="slot-stat-val">${meta.wins}</span><span class="slot-stat-lbl">${t('common.goals').substring(0,3)}</span></div>
          <div class="slot-stat"><span class="slot-stat-val">${formatMoney(meta.budget)}</span><span class="slot-stat-lbl">Budget</span></div>
        </div>
        <div class="slot-actions">
          <button class="btn primary sm" onclick="loadSlot(${i})">${t('welcome.loadSave')}</button>
          <button class="btn sm"         onclick="saveCurrentToSlot(${i})" id="btn-save-slot-${i}" style="display:none">💾 Salva qui</button>
          <button class="btn sm"         onclick="confirmOverwriteSlot(${i})">${t('welcome.newCareer')}</button>
          <button class="btn danger sm"  onclick="confirmDeleteSlot(${i})">${t('welcome.deleteSlot')}</button>
        </div>`;
    } else {
      // ── Slot vuoto ──
      card.innerHTML = `
        <div class="slot-empty">
          <div class="slot-empty-icon">＋</div>
          <div class="slot-empty-label">${t('welcome.saveSlot', {n: i+1})} — ${t('welcome.emptySlot')}</div>
        </div>
        <div class="slot-actions">
          <button class="btn primary sm" onclick="startNewGameInSlot(${i})">${t('welcome.newCareer')}</button>
        </div>`;
    }
    panel.appendChild(card);
  });

  // Mostra il bottone "Salva nel gioco corrente" solo se G è attivo
  _refreshInGameSaveButtons();
}

// ─────────────────────────────────────────────
// AZIONI SLOT
// ─────────────────────────────────────────────

// Carica uno slot ed entra nel gioco
function loadSlot(slotIndex) {
  const payload = loadFromSlot(slotIndex);
  if (!payload) {
    _showSlotFeedback(t('errors.saveLoad'), 'danger');
    return;
  }
  G = applyLoadedSave(payload);
  if (typeof _normalizeRosters === 'function') _normalizeRosters(G);
  if (typeof _refreshAllPlayerValues === 'function') _refreshAllPlayerValues();
  G._currentSlot = slotIndex;
  showScreen('sc-game');
  updateHeader();
  // requestAnimationFrame garantisce che sc-game sia visibile prima del render
  requestAnimationFrame(function() { showTab('dash'); });
}

// Avvia nuova carriera in uno slot specifico
function startNewGameInSlot(slotIndex) {
  _pendingNewGameSlot = slotIndex;
  _doStartNewGame(slotIndex);
}

// Chiede conferma prima di sovrascrivere uno slot occupato
function confirmOverwriteSlot(slotIndex) {
  const meta = readSlotMeta(slotIndex);
  if (!meta) { startNewGameInSlot(slotIndex); return; }
  const ok = confirm(
    t('welcome.confirmDelete', {n: slotIndex+1}) + '\n' + meta.teamName
  );
  if (ok) startNewGameInSlot(slotIndex);
}

// Elimina uno slot con conferma
function confirmDeleteSlot(slotIndex) {
  const meta = readSlotMeta(slotIndex);
  const name = meta ? meta.teamName : 'slot ' + (slotIndex + 1);
  const ok = confirm(t('welcome.confirmDelete', {n: slotIndex+1}));
  if (!ok) return;
  deleteSlot(slotIndex);
  _showSlotFeedback(t('welcome.saveSlot', {n: slotIndex+1}) + ' — ' + t('welcome.deleteSlot'), 'warn');
  _buildSlotsPanel();
}

// Salva la partita corrente in uno slot specifico (da dentro il gioco)
function saveCurrentToSlot(slotIndex) {
  if (!G || !G.myId) return;
  const result = saveToSlot(G, slotIndex);
  if (result.ok) {
    G._currentSlot = slotIndex;
    _showSlotFeedback(t('welcome.saveSlot', {n: slotIndex+1}), 'success');
    _buildSlotsPanel();
  } else {
    _showSlotFeedback(t('errors.saveFail'), 'danger');
  }
}

// Aggiorna visibilità bottoni "Salva qui" in base a G attivo
function _refreshInGameSaveButtons() {
  const hasActiveGame = G && G.myId;
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const btn = document.getElementById('btn-save-slot-' + i);
    if (btn) btn.style.display = hasActiveGame ? 'inline-block' : 'none';
  }
}

// ─────────────────────────────────────────────
// NUOVA PARTITA
// ─────────────────────────────────────────────
function _doStartNewGame(slotIndex) {
  const myTeam = TEAMS_DATA.find(t => t.id === _selectedTeamId);
  if (!myTeam) return;

  G = {
    myId:          myTeam.id,
    myTeam:        { ...myTeam },
    teams:         TEAMS_DATA.map(t => ({ ...t })),
    rosters:       {},
    schedule:      [],
    stand:         {},
    budget:        myTeam.budget,
    tactic:        'balanced',
    msgs:          ['Benvenuto! Guida ' + myTeam.name + ' verso la gloria!'],
    phase:         'regular',
    ms:            null,
    poTeams:       null,
    ploTeams:      null,
    relegated:     null,
    poBracket:     null,
    plBracket:     null,
    playoffResult: null,
    trainWeeks:    0,
    trainHistory:  [],
    stars:         5,   // stelle disponibili (5 iniziali, +4 per giornata)
    _selTrain:     null,
    _mercList:     [],
    savedLineup:   null,
    transferList:  [],   // [{ rosterIdx, askingPrice }]
    _currentSlot:  slotIndex,
    lineup:        { formation: {}, convocati: [] },
    objectives:    [],
    ledger:        [],   // registro transazioni finanziarie
  };

  G.teams.forEach(t => { G.rosters[t.id] = generateRoster(t); });
  G.schedule   = generateSchedule(G.teams);
  G.stand      = initStandings(G.teams);
  G.objectives = initObjectives(myTeam.tier);

  // Salva subito nello slot scelto
  saveToSlot(G, slotIndex);

  showScreen('sc-game');
  updateHeader();
  requestAnimationFrame(function() { showTab('dash'); });
}

// Pulsante "Nuova Carriera" dalla welcome (sceglie primo slot libero)
function startNewGame() {
  let slot = 0;
  const metas = readAllSlotsMeta();
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (!metas[i]) { slot = i; break; }
  }
  // Se tutti occupati chiede quale sovrascrivere
  if (metas.every(Boolean)) {
    _openSlotChooser();
    return;
  }
  _doStartNewGame(slot);
}

// ─────────────────────────────────────────────
// SLOT CHOOSER MODAL (tutti gli slot sono pieni)
// ─────────────────────────────────────────────
function _openSlotChooser() {
  const existing = document.getElementById('slot-chooser-modal');
  if (existing) existing.remove();

  const metas = readAllSlotsMeta();
  const ov = document.createElement('div');
  ov.id = 'slot-chooser-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:300;backdrop-filter:blur(6px)';

  let rows = metas.map((m, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;background:var(--panel2);margin-bottom:8px">
      <div style="width:30px;height:30px;border-radius:50%;background:${m.teamCol};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700">${m.teamAbbr}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${m.teamName}</div>
        <div style="font-size:11px;color:var(--muted)">Slot ${i+1} · G${m.round} · ${m.position}° posto</div>
      </div>
      <button class="btn danger sm" onclick="document.getElementById('slot-chooser-modal').remove();confirmOverwriteSlot(${i})">Sovrascrivi</button>
    </div>`).join('');

  ov.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:420px;width:90%">
      <div style="font-size:15px;font-weight:700;color:var(--blue);margin-bottom:4px">Tutti gli slot sono occupati</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:16px">Scegli quale slot sovrascrivere per iniziare una nuova carriera.</div>
      ${rows}
      <button class="btn" style="width:100%;margin-top:8px" onclick="this.closest('[id=slot-chooser-modal]').remove()">Annulla</button>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ─────────────────────────────────────────────
// FEEDBACK TOAST
// ─────────────────────────────────────────────
function _showSlotFeedback(msg, type = 'info') {
  const existing = document.getElementById('slot-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'slot-toast';
  toast.className = 'alert ' + type;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:400;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
