// ─────────────────────────────────────────────
// ui/tabs.js
// Navigazione tra i tab del gioco principale
// ─────────────────────────────────────────────

const TAB_IDS = ['dash','rosa','train','goals','stand','cal','playoff','market','finance','history','stadium','credits'];

// ── Mostra un tab e nasconde gli altri ────────
function showTab(tab) {
  TAB_IDS.forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });

  // Vecchi .nb (retrocompatibilità)
  document.querySelectorAll('.nb').forEach(b => {
    const active = b.getAttribute('onclick')?.includes("'" + tab + "'") ?? false;
    b.classList.toggle('active', active);
  });
  // Nuovi pulsanti sidebar BS
  document.querySelectorAll('.bs-nav-btn').forEach(b => {
    const active = b.getAttribute('onclick')?.includes("'" + tab + "'") ?? false;
    b.classList.toggle('active', active);
  });

  // Renderizza il contenuto del tab attivo
  const renderers = {
    dash:    renderDash,
    rosa:    renderRosa,
    train:   renderTrain,
    goals:   renderGoals,
    stand:   renderStand,
    cal:     renderCal,
    playoff: renderPlayoff,
    market:  renderMarket,
    finance: renderFinance,
    credits:  renderCredits,
    history:  renderHistory,
    stadium:  renderStadium,
  };
  if (renderers[tab]) renderers[tab]();
}

// ── Aggiorna header (team + fase + budget) ────
function updateHeader() {
  document.getElementById('hdr-team').textContent = G.myTeam.name;
  const phaseLabel = {
    regular: `G${Math.min(currentRound() + 1, 26)} Regular Season`,
    playoff: 'PLAYOFF',
    playout: 'PLAY-OUT',
    done:    'Fine Stagione',
  }[G.phase] || G.phase;
  const infoEl = document.getElementById('hdr-info');
  if (infoEl) infoEl.textContent = phaseLabel + ' · ' + formatMoney(G.budget);
  // Aggiorna stelle nella topbar
  const starsEl = document.getElementById('bs-stars-val');
  if (starsEl && G) starsEl.textContent = G.stars || 0;
}

// ── Mostra/nasconde le schermate principali ───
// Ogni schermata ha il proprio display corretto (flex per quelle centrate)
const SCREEN_DISPLAY = {
  'sc-welcome': 'flex',
  'sc-game':    'flex',   // flex column — necessario per il layout sidebar fisso
  'sc-lineup':  'block',
  'sc-match':   'block',
};
function showScreen(id) {
  Object.keys(SCREEN_DISPLAY).forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    el.style.display = s === id ? SCREEN_DISPLAY[s] : 'none';
  });
  // Quando si torna alla lobby, ricarica gli slot con overlay di attesa
  if (id === 'sc-welcome') {
    _showSlotsLoadingOverlay();
    setTimeout(function() {
      if (typeof _buildSlotsPanel === 'function') _buildSlotsPanel();
      if (typeof _buildTeamList   === 'function') _buildTeamList();
      _hideSlotsLoadingOverlay();
    }, 350); // breve delay per render animazione
  }
}

function _showSlotsLoadingOverlay() {
  var existing = document.getElementById('slots-loading-overlay');
  if (existing) return;
  var ov = document.createElement('div');
  ov.id = 'slots-loading-overlay';
  ov.style.cssText = [
    'position:fixed;inset:0;background:rgba(10,20,40,.82)',
    'display:flex;flex-direction:column;align-items:center;justify-content:center',
    'z-index:9999;backdrop-filter:blur(4px)',
    'transition:opacity .25s'
  ].join(';');
  ov.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:18px">
      <div style="position:relative;width:56px;height:56px">
        <div style="position:absolute;inset:0;border-radius:50%;border:4px solid rgba(0,194,255,.15)"></div>
        <div style="position:absolute;inset:0;border-radius:50%;border:4px solid transparent;
             border-top-color:var(--blue);animation:slots-spin .9s linear infinite"></div>
        <div style="position:absolute;inset:8px;display:flex;align-items:center;justify-content:center;font-size:22px">🤽</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.9);letter-spacing:.5px">
        Caricamento lista salvataggi in corso…
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,.4)">Attendere</div>
    </div>
    <style>
      @keyframes slots-spin { to { transform:rotate(360deg); } }
    </style>`;
  document.body.appendChild(ov);
}

function _hideSlotsLoadingOverlay() {
  var ov = document.getElementById('slots-loading-overlay');
  if (!ov) return;
  ov.style.opacity = '0';
  setTimeout(function(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }, 280);
}
