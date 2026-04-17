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

  // Aggiorna etichette sidebar e box lingua con lingua corrente
  _updateNavLabels();
  _updateLangBox();
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
  const saveEl = document.getElementById('topbar-save-lbl');
  if (saveEl) saveEl.textContent = t('common.save');
  _updateConfigBox();
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

// ── Selettore lingua nella topbar ─────────────────
const LANG_CONFIG = {
  it: { flag: '🇮🇹', label: 'IT' },
  en: { flag: '🇬🇧', label: 'EN' },
};

function _updateLangBox() {
  const lang = I18N.getLang();
  const cfg  = LANG_CONFIG[lang] || LANG_CONFIG['it'];
  const flag = document.getElementById('lang-flag');
  const lbl  = document.getElementById('lang-top-label');
  if (flag) flag.textContent  = cfg.flag;
  if (lbl)  lbl.textContent   = cfg.label;
}

function _cycleLang() {
  const current = I18N.getLang();
  const next    = current === 'it' ? 'en' : 'it';
  I18N.setLang(next);   // salva in localStorage e fa reload
}

// ══════════════════════════════════════════════════════════════════════
// PANNELLO CONFIGURAZIONE
// ══════════════════════════════════════════════════════════════════════

// Chiavi localStorage per le preferenze
const CFG_KEY = 'wp_config';

// Categorie notizie — id, chiave i18n, regex di rilevamento, colore
const NEWS_CATEGORIES = [
  // Ordine importante: le regex più specifiche vanno PRIMA di quelle generiche

  // 1. Infortuni — prima di result perché "infortunato" può contenere numeri
  { id: 'injuries',  labelKey: 'nav.training',
    regex: /infortun|injur|injury|exhausted|out of energy|🚑/i,
    color: '#e74c3c' },

  // 2. Recupero — prima di injuries per match più specifico
  { id: 'recovery',  labelKey: 'goals.inProgress',
    regex: /guarit|recover|torna disponibile|available again/i,
    color: '#27ae60' },

  // 3. Nazionale — prima di result (contiene nomi giocatori con gol/assist)
  { id: 'national',  labelKey: 'national.badge',
    regex: /nazional|convocazione|nazionale|national|call.up|called up|internazional/i,
    color: '#1565c0' },

  // 4. Playoff — prima di result
  { id: 'playoff',   labelKey: 'nav.playoff',
    regex: /playoff|playout|retrocessione|scudetto|relegat|survived|champion|semifinal|finale scudetto/i,
    color: '#c62828' },

  // 5. Allenamento — PRIMA di result (i testi "X players improved" matcherebbero result)
  { id: 'training',  labelKey: 'nav.training',
    regex: /allenamento|allenament|sessione|training:|athletic|conditioning|goalkeeper training|technical training|endurance training|rest.*recovery|attack training|defence training|tactical session|giocatori migliorati|players improved/i,
    color: '#00838f' },

  // 6. Contratto
  { id: 'contract',  labelKey: 'roster.contract',
    regex: /contratto|rinnov|scadenz|resciss|contract|renew|expir|terminat|rescind|proposta.*rinnovo|renewal/i,
    color: '#9c27b0' },

  // 7. Mercato
  { id: 'market',    labelKey: 'nav.market',
    regex: /mercato|offerta|acquist|svinc|vend|market|transfer|signed|sold|offer|ceduto|🛒|💼/i,
    color: '#ff8c42' },

  // 8. Finanza
  { id: 'finance',   labelKey: 'nav.finance',
    regex: /ingaggi|budget|bonus|penale|finanz|salary|wages|finance|balance|💸|spettatori|incasso|monte/i,
    color: '#2e7d32' },

  // 9. Risultato — ultima tra le categorie specifiche (regex generica con gol/assist)
  { id: 'result',    labelKey: 'common.result',
    regex: /^G\d+:|giocato|pareggi|vince|perde|matchday|wins|loses|draws/i,
    color: '#1565c0' },

  // 10. Notizia generica — default catch-all
  { id: 'news',      labelKey: 'dash.news',
    regex: null,
    color: '#455a64' },
];

// Legge la configurazione salvata (o default: tutte attive tranne finance)
function getConfig() {
  var cfg = null;
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) cfg = JSON.parse(raw);
  } catch(e) {}

  // Default o migrazione: assicura che tutte le categorie siano presenti
  if (!cfg) cfg = { newsPopup: {} };
  if (!cfg.newsPopup) cfg.newsPopup = {};

  // Aggiunge eventuali categorie mancanti (nuove o mai impostate) con default true
  NEWS_CATEGORIES.forEach(function(cat) {
    if (cfg.newsPopup[cat.id] === undefined) {
      cfg.newsPopup[cat.id] = true;
    }
  });

  return cfg;
}

function saveConfig(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch(e) {}
}

// Esponi globalmente per tabs_renderers.js
window.getConfig = getConfig;
window.NEWS_CATEGORIES = NEWS_CATEGORIES;

// ── Apri il pannello ──────────────────────────────────────────────────
function openConfigPanel() {
  var existing = document.getElementById('config-panel-overlay');
  if (existing) { existing.remove(); return; }

  var cfg = getConfig();
  var ov  = document.createElement('div');
  ov.id   = 'config-panel-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:flex-end;z-index:800;backdrop-filter:blur(4px);padding-top:58px;padding-right:8px';

  // Costruisci righe categorie
  var rows = NEWS_CATEGORIES.map(function(cat) {
    var label = t(cat.labelKey);
    // Usa label specifica per categorie con la stessa chiave ma id diverso
    // Assegna label specifiche per categoria
    var labelMap = {
      injuries: 'INJ / ' + t('injuries.out', {weeks:''}).split(' ')[0],
      contract: t('roster.contract'),
      market:   t('nav.market'),
      result:   t('common.result'),
      finance:  t('nav.finance'),
      training: t('nav.training'),
      recovery: '✅ ' + t('goals.inProgress'),
      playoff:  t('nav.playoff'),
      national: t('national.badge') + ' ' + t('national.italiana').split(' ')[1],
      news:     t('dash.news'),
    };
    if (labelMap[cat.id]) label = labelMap[cat.id];
    var checked = cfg.newsPopup[cat.id] !== false;
    return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;user-select:none">'
      + '<input type="checkbox" id="cfg-news-' + cat.id + '" ' + (checked ? 'checked' : '') + ' '
      + 'onchange="toggleNewsConfig(\'' + cat.id + '\',this.checked)"'
      + ' style="width:16px;height:16px;accent-color:' + cat.color + ';cursor:pointer">'
      + '<span style="display:inline-block;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;'
      + 'background:' + cat.color + '22;color:' + cat.color + ';border:1px solid ' + cat.color + '44;'
      + 'letter-spacing:.3px;min-width:60px;text-align:center;flex-shrink:0">' + label.toUpperCase() + '</span>'
      + '</label>';
  }).join('');

  ov.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;'
    + 'padding:20px;width:300px;max-height:calc(100vh - 70px);overflow-y:auto;'
    + 'box-shadow:0 8px 40px rgba(0,0,0,.5)">'

    // Header
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<span style="font-size:20px">⚙️</span>'
    + '<span style="font-weight:800;font-size:15px;color:var(--text)">' + t('config.title') + '</span>'
    + '</div>'
    + '<button onclick="document.getElementById(\'config-panel-overlay\').remove()" '
    + 'style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted)">✕</button>'
    + '</div>'

    // Sezione Notifiche
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;'
    + 'letter-spacing:.6px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">'
    + '🔔 ' + t('config.notifTitle')
    + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">'
    + t('config.notifDesc')
    + '</div>'
    + rows

    // Seleziona tutto / nessuno
    + '<div style="display:flex;gap:8px;margin-top:12px">'
    + '<button onclick="setAllNewsConfig(true)" '
    + 'style="flex:1;padding:6px;font-size:11px;font-weight:700;border-radius:6px;'
    + 'background:rgba(0,194,255,.1);border:1px solid rgba(0,194,255,.3);color:var(--blue);cursor:pointer">'
    + t('common.all') + '</button>'
    + '<button onclick="setAllNewsConfig(false)" '
    + 'style="flex:1;padding:6px;font-size:11px;font-weight:700;border-radius:6px;'
    + 'background:rgba(255,255,255,.05);border:1px solid var(--border);color:var(--muted);cursor:pointer">'
    + t('config.none') + '</button>'
    + '</div>'
    + '</div>';

  ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
window.openConfigPanel = openConfigPanel;

// ── Toggle singola categoria ──────────────────────────────────────────
function toggleNewsConfig(catId, enabled) {
  var cfg = getConfig();
  cfg.newsPopup[catId] = enabled;
  saveConfig(cfg);
}
window.toggleNewsConfig = toggleNewsConfig;

// ── Seleziona tutto / nessuno ─────────────────────────────────────────
function setAllNewsConfig(enabled) {
  var cfg = getConfig();
  NEWS_CATEGORIES.forEach(function(cat) {
    cfg.newsPopup[cat.id] = enabled;
    var el = document.getElementById('cfg-news-' + cat.id);
    if (el) el.checked = enabled;
  });
  saveConfig(cfg);
}
window.setAllNewsConfig = setAllNewsConfig;

// ── Aggiorna label Config nella topbar ───────────────────────────────
function _updateConfigBox() {
  var lbl = document.getElementById('config-top-label');
  if (lbl) lbl.textContent = t('config.title');
}
