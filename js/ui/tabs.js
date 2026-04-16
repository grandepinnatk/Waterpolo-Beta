// ─────────────────────────────────────────────
// ui/tabs.js
// Navigazione tra i tab del gioco principale
// ─────────────────────────────────────────────

const TAB_IDS = ['dash','rosa','train','goals','stand','cal','playoff','market','finance','history','stadium','credits'];

// ── Mostra un tab e nasconde gli altri ────────
function showTab(tab) {
  TAB_IDS.forEach(id => {
    document.getElementById('tab-' + id).style.display = id === tab ? 'block' : 'none';
  });

  document.querySelectorAll('.nb').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes("'" + tab + "'") ?? false);
  });
  document.querySelectorAll('.bs-nav-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes("'" + tab + "'") ?? false);
  });

  const renderers = {
    dash:    renderDash,    rosa:    renderRosa,
    train:   renderTrain,   goals:   renderGoals,
    stand:   renderStand,   cal:     renderCal,
    playoff: renderPlayoff, market:  renderMarket,
    finance: renderFinance, credits: renderCredits,
    history: renderHistory, stadium: renderStadium,
  };
  if (renderers[tab]) renderers[tab]();
}

// ── Aggiorna header ────────────────────────────
function updateHeader() {
  document.getElementById('hdr-team').textContent = G.myTeam.name;
  const r = currentRound();
  const phaseLabel = G.phase === 'regular'
    ? `G${Math.min(r + 1, 26)} ${t('header.phase.regular')}`
    : G.phase === 'playoff' ? t('nav.playoff').toUpperCase()
    : G.phase === 'playout' ? 'PLAY-OUT'
    : t('nav.endSeason');
  const infoEl = document.getElementById('hdr-info');
  if (infoEl) infoEl.textContent = phaseLabel + ' · ' + formatMoney(G.budget);
  const starsEl = document.getElementById('bs-stars-val');
  if (starsEl && G) starsEl.textContent = G.stars || 0;

  // Aggiorna etichette sidebar con lingua corrente
  _updateNavLabels();
}

// ── Aggiorna le etichette della sidebar ────────
function _updateNavLabels() {
  const NAV_KEYS = {
    'nav-dash':     'nav.dashboard',
    'nav-rosa':     'nav.rosa',
    'nav-train':    'nav.training',
    'nav-goals':    'nav.goals',
    'nav-stand':    'nav.standings',
    'nav-cal':      'nav.calendar',
    'nav-playoff':  'nav.playoff',
    'nav-market':   'nav.market',
    'nav-finance':  'nav.finance',
    'nav-stadium':  'nav.stadium',
    'nav-credits':  'nav.credits',
    'nav-logout':   'nav.logout',
  };
  Object.entries(NAV_KEYS).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  });
}

// ── Mostra/nasconde le schermate principali ────
const SCREEN_DISPLAY = {
  'sc-welcome': 'flex',
  'sc-game':    'flex',
  'sc-lineup':  'block',
  'sc-match':   'block',
};

function showScreen(id) {
  Object.keys(SCREEN_DISPLAY).forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    el.style.display = s === id ? SCREEN_DISPLAY[s] : 'none';
  });
  if (id === 'sc-welcome') {
    _showSlotsLoadingOverlay();
    setTimeout(function() {
      if (typeof _buildSlotsPanel === 'function') _buildSlotsPanel();
      if (typeof _buildTeamList   === 'function') _buildTeamList();
      _hideSlotsLoadingOverlay();
    }, 350);
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
        ${t('welcome.loadingSlots')}
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,.4)">${t('welcome.pleaseWait')}</div>
    </div>
    <style>@keyframes slots-spin { to { transform:rotate(360deg); } }</style>`;
  document.body.appendChild(ov);
}

function _hideSlotsLoadingOverlay() {
  var ov = document.getElementById('slots-loading-overlay');
  if (!ov) return;
  ov.style.opacity = '0';
  setTimeout(function(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }, 280);
}
