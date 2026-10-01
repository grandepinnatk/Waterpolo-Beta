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
  _applyLangToWelcome();
  _buildTeamList();
  _buildSlotsPanel();
  selectTeamInWelcome(TEAMS_DATA[0].id);
}

// ── Applica lingua alle label statiche della welcome ──
function _applyLangToWelcome() {
  // Sincronizza il select con la lingua corrente
  var sel = document.getElementById('lang-select');
  if (sel) sel.value = I18N.getLang();

  var langLabel = document.getElementById('lang-label');
  if (langLabel) langLabel.textContent = t('welcome.language');

  var chooseTeam = document.getElementById('wc-choose-team');
  if (chooseTeam) chooseTeam.textContent = t('welcome.chooseTeam');

  var savedGames = document.getElementById('wc-saved-games');
  if (savedGames) savedGames.textContent = t('welcome.loadSave');

  var newCareerBtn = document.getElementById('wc-new-career');
  if (newCareerBtn) newCareerBtn.textContent = t('welcome.newCareer') + ' →';
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
  const slots = inspectAllSlots(); // [{state, meta, version, restorable}]

  slots.forEach((info, i) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.id = 'slot-card-' + i;
    const meta = info.meta;

    if (info.state === SLOT_VALID) {
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
          <div class="slot-stat"><span class="slot-stat-val">${meta.wins}</span><span class="slot-stat-lbl">${I18N.getLang()==='en'?'Gls':t('common.goals').substring(0,3)}</span></div>
          <div class="slot-stat"><span class="slot-stat-val">${formatMoney(meta.budget)}</span><span class="slot-stat-lbl">Budget</span></div>
        </div>
        <div class="slot-actions">
          <button class="btn primary sm" onclick="loadSlot(${i})">${t('welcome.loadSave')}</button>
          <button class="btn sm"         onclick="saveCurrentToSlot(${i})" id="btn-save-slot-${i}" style="display:none">💾 Salva qui</button>
          <button class="btn sm"         onclick="confirmOverwriteSlot(${i})">${t('welcome.newCareer')}</button>
          <button class="btn danger sm"  onclick="confirmDeleteSlot(${i})">${t('welcome.deleteSlot')}</button>
        </div>`;
    } else if (info.state === SLOT_LEGACY) {
      // ── Slot con dati di una versione precedente ──
      // I dati ci sono ma non li carichiamo. Mostro la squadra, se i
      // metadati si leggono, cosi' il giocatore distingue "non caricabile" da
      // "inesistente". Niente bottone Carica: caricarlo fallirebbe.
      const who = meta && meta.teamName
        ? `<div class="slot-team-name">${meta.teamName}</div>
           <div class="slot-meta">${t('welcome.saveSlot', {n: i+1})}</div>`
        : `<div class="slot-empty-label">${t('welcome.saveSlot', {n: i+1})}</div>`;
      card.innerHTML = `
        <div class="slot-header">
          <div class="slot-team-info">${who}</div>
        </div>
        <div class="slot-warning" style="margin:8px 0;padding:8px;border-radius:6px;background:rgba(240,180,60,.12);color:var(--amber,#f0b040);font-size:12px;line-height:1.4">
          ${t('welcome.legacySlot', {v: info.version, n: SAVE_VERSION})}
        </div>
        <div class="slot-actions">
          <button class="btn sm"        onclick="startNewGameInSlot(${i})">${t('welcome.newCareer')}</button>
          <button class="btn danger sm" onclick="confirmDeleteSlot(${i})">${t('welcome.deleteSlot')}</button>
        </div>`;
    } else if (info.state === SLOT_CORRUPT) {
      // ── Slot illeggibile ──
      // Non mostro "slot vuoto": qualcosa c'è ma non è leggibile. Il dato non
      // viene buttato via qui, lascio che sia la cancellazione esplicita a
      // rimuoverlo, nel caso serva un recupero manuale.
      card.innerHTML = `
        <div class="slot-header">
          <div class="slot-team-info">
            <div class="slot-team-name">${t('welcome.saveSlot', {n: i+1})}</div>
          </div>
        </div>
        <div class="slot-warning" style="margin:8px 0;padding:8px;border-radius:6px;background:rgba(231,76,60,.12);color:var(--red,#e74c3c);font-size:12px;line-height:1.4">
          ${t('welcome.corruptSlot')}
        </div>
        <div class="slot-actions">
          <button class="btn sm"        onclick="startNewGameInSlot(${i})">${t('welcome.newCareer')}</button>
          <button class="btn danger sm" onclick="confirmDeleteSlot(${i})">${t('welcome.deleteSlot')}</button>
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

  _buildWipeAllButton(panel.parentNode || panel);
  // Mostra il bottone "Salva nel gioco corrente" solo se G è attivo
  _refreshInGameSaveButtons();
}

// ── Pulsante "Azzera tutto" ─────────────────────
// Appare solo se c'è qualcosa da cancellare: con tre slot vuoti è inutile
// e un bottone rosso in permanenza su una schermata iniziale è rumore.
function _buildWipeAllButton(container) {
  const existing = document.getElementById('btn-wipe-all');
  if (existing) existing.remove();

  const occupied = listOccupiedSlots();
  if (!occupied.length) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:16px;text-align:center';
  const btn = document.createElement('button');
  btn.id = 'btn-wipe-all';
  btn.className = 'btn danger';
  btn.textContent = t('welcome.wipeAll');
  btn.onclick = confirmWipeAllSaves;
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

// ─────────────────────────────────────────────
// AZIONI SLOT
// ─────────────────────────────────────────────

// Carica uno slot ed entra nel gioco
function loadSlot(slotIndex) {
  // Controllo lo stato prima di tentare: loadFromSlot ritorna anche null per
  // legacy e corrotti, e il messaggio "errore nel caricamento" sarebbe falso
  // per entrambi. Meglio due secondi di inspectSlot che una diagnosi sbagliata.
  const reason = slotUnusableReason(slotIndex);
  if (reason === 'legacy') {
    _showSlotFeedback(t('welcome.legacySlotShort'), 'warn');
    return;
  }
  if (reason === 'corrupt') {
    _showSlotFeedback(t('welcome.corruptSlotShort'), 'danger');
    return;
  }
  if (reason === 'empty') {
    _showSlotFeedback(t('errors.saveLoad'), 'warn');
    return;
  }

  const payload = loadFromSlot(slotIndex);
  if (!payload) {
    // ispezionato come valido ma non caricabile: incoerenza reale, non un
    // salvataggio vecchio. Vale la pena saperlo.
    console.error('[save] slot', slotIndex, 'ispezionato come valido ma loadFromSlot ha fallito');
    _showSlotFeedback(t('errors.saveLoad'), 'danger');
    return;
  }
  G = applyLoadedSave(payload);
  if (typeof _normalizeRosters === 'function') _normalizeRosters(G);
  if (typeof _refreshAllPlayerValues === 'function') _refreshAllPlayerValues();
  G._currentSlot = slotIndex;
  localStorage.setItem('wp_last_slot', slotIndex);
  showScreen('sc-game');
  updateHeader();
  // requestAnimationFrame garantisce che sc-game sia visibile prima del render
  requestAnimationFrame(function() { showTab('dash'); });
}

// Avvia nuova carriera in uno slot specifico
function startNewGameInSlot(slotIndex) {
  localStorage.setItem('wp_last_slot', slotIndex);
  _pendingNewGameSlot = slotIndex;
  _doStartNewGame(slotIndex);
}

// Chiede conferma prima di sovrascrivere uno slot occupato
function confirmOverwriteSlot(slotIndex) {
  const info = inspectSlot(slotIndex);
  if (info.state === SLOT_EMPTY) { startNewGameInSlot(slotIndex); return; }
  // readSlotMeta darebbe null su legacy e corrotti, e la conferma nominerebbe
  // uno slot anonimo. Su questi due casi il testo dice che ci sono dati.
  const what = info.state === SLOT_VALID && info.meta && info.meta.teamName
    ? info.meta.teamName
    : t('welcome.wipeSlotWithData');
  const ok = confirm(
    t('welcome.confirmDelete', {n: slotIndex+1}) + '\n' + what
  );
  if (ok) startNewGameInSlot(slotIndex);
}

// Elimina uno slot con conferma
function confirmDeleteSlot(slotIndex) {
  const info = inspectSlot(slotIndex);
  if (info.state === SLOT_EMPTY) return;
  // Su legacy e corrotti readSlotMeta darebbe null, quindi il messaggio
  // nominerebbe uno slot anonimo. Meglio dire che c'è contenuto da perdere.
  const what = info.state === SLOT_VALID && info.meta && info.meta.teamName
    ? info.meta.teamName
    : t('welcome.wipeSlotWithData');
  const ok = confirm(t('welcome.confirmDelete', {n: slotIndex+1}) + '\n' + what);
  if (!ok) return;
  deleteSlot(slotIndex);
  _showSlotFeedback(t('welcome.saveSlot', {n: slotIndex+1}) + ' — ' + t('welcome.deleteSlot'), 'warn');
  _buildSlotsPanel();
}

// ── Azzera tutti gli slot, con doppia conferma ──
// Una sola conferma non basta su un'azione che cancella tre carriere senza
// ritorno. La prima conferma dice cosa sta per succedere, la seconda
// richiede di ripetere: due tap ravvicinati non possono farlo, che è il modo
// normale in cui un pulsante rosso viene premasto per errore.
function confirmWipeAllSaves() {
  const occupied = listOccupiedSlots();
  if (!occupied.length) return;

  const withData = occupied.filter(s => s.state !== SLOT_EMPTY);
  const first = confirm(
    t('welcome.confirmWipeAll', {n: withData.length}) +
    '\n\n' + t('welcome.confirmWipeAllWarn')
  );
  if (!first) return;

  // La seconda conferma non può essere un semplice sì/no: se la prima è già
  // stata data per sbaglio, ripetere lo stesso tap deve poter annullare.
  const second = prompt(t('welcome.confirmWipeAllType'));
  if (second === null) return;
  if (second.trim().toUpperCase() !== 'RESET') {
    _showSlotFeedback(t('welcome.wipeAllCancelled'), 'warn');
    return;
  }

  const result = wipeAllSaves();
  _buildSlotsPanel();

  if (result.local.length === 0) {
    _showSlotFeedback(t('welcome.wipeAllDone', {n: 0}), 'warn');
    return;
  }
  // Se l'utente è loggato la cancellazione cloud è partita ma non è confermata:
  // dirgli "fatto" sarebbe falso. Dico quello che so.
  if (result.cloud && result.cloudError) {
    _showSlotFeedback(t('welcome.wipeAllLocalOnly', {n: result.local.length}) + ' ' + result.cloudError, 'warn');
  } else if (result.cloud) {
    _showSlotFeedback(t('welcome.wipeAllLocalOnly', {n: result.local.length}), 'warn');
  } else {
    _showSlotFeedback(t('welcome.wipeAllDone', {n: result.local.length}), 'success');
  }
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
  const slots = inspectAllSlots();
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (slots[i].state === SLOT_EMPTY) { slot = i; break; }
  }
  // Se tutti occupati chiede quale sovrascrivere.
  // "Occupato" qui comprende legacy e corrotti: hanno ancora dati dentro, quindi
  // sovrascriverli non e' una decisione che va presa di nascosto.
  if (slots.every(s => s.state !== SLOT_EMPTY)) {
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

  // Questa finestra si apre quando non c'è nessuno slot vuoto, quindi qui
  // possono comparire anche legacy e corrotti. Prima readAllSlotsMeta
  // restituiva null per entrambi e il codice leggeva m.teamCol su un null:
  // eccezione, e il pannello di scelta non compariva. Con inspectAllSlots ogni
  // slot ha sempre dei dati da mostrare, anche quando non sono caricabili.
  const slots = inspectAllSlots();
  const ov = document.createElement('div');
  ov.id = 'slot-chooser-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:300;backdrop-filter:blur(6px)';

  let rows = slots.map((info, i) => {
    const m = info.meta || {};
    if (info.state === SLOT_VALID) {
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;background:var(--panel2);margin-bottom:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:${m.teamCol};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700">${m.teamAbbr}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${m.teamName}</div>
            <div style="font-size:11px;color:var(--muted)">Slot ${i+1} · G${m.round} · ${m.position}° posto</div>
          </div>
          <button class="btn danger sm" onclick="document.getElementById('slot-chooser-modal').remove();confirmOverwriteSlot(${i})">Sovrascrivi</button>
        </div>`;
    }
    // Legacy o corrotto: niente squadra, niente classifica, ma si dice che
    // il slot contiene dati prima di chiedere di sovrascriverli.
    const note = info.state === SLOT_LEGACY
      ? t('welcome.slotLegacyShort', {v: info.version})
      : t('welcome.slotCorruptShort');
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;background:var(--panel2);margin-bottom:8px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--muted,#666);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700">${i+1}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${t('welcome.saveSlot', {n: i+1})}</div>
          <div style="font-size:11px;color:var(--muted)">${note}</div>
        </div>
        <button class="btn danger sm" onclick="document.getElementById('slot-chooser-modal').remove();confirmOverwriteSlot(${i})">Sovrascrivi</button>
      </div>`;
  }).join('');

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
