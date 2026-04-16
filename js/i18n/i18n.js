// ─────────────────────────────────────────────
// js/i18n/i18n.js  —  modulo internazionalizzazione
// ─────────────────────────────────────────────
// Uso:
//   t('nav.dashboard')           → "Dashboard"
//   t('msg.budget', {v: '€50k'}) → "Budget: €50k"
//
// Le traduzioni sono in js/i18n/it.js e js/i18n/en.js
// La lingua è salvata in localStorage['wp_lang'] e in G.lang
// ─────────────────────────────────────────────

const I18N = (() => {
  const SUPPORTED = ['it', 'en'];
  const DEFAULT   = 'it';
  const STORAGE_KEY = 'wp_lang';

  let _lang = DEFAULT;
  let _strings = {};   // dizionario attivo (flat: 'key.sub' → stringa)

  // ── Appiattisce un oggetto annidato in chiavi dot-notation ──
  function _flatten(obj, prefix, out) {
    out = out || {};
    prefix = prefix || '';
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      const full = prefix ? prefix + '.' + k : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        _flatten(obj[k], full, out);
      } else {
        out[full] = obj[k];
      }
    }
    return out;
  }

  // ── Carica un dizionario di traduzioni ──
  function load(lang, dict) {
    if (!SUPPORTED.includes(lang)) return;
    _strings = _flatten(dict);
    _lang = lang;
  }

  // ── Ottieni la stringa tradotta ──
  // Supporta interpolazione: t('msg', {name: 'Rossi'}) → "Ciao Rossi"
  // dove il dizionario contiene "msg": "Ciao {{name}}"
  function t(key, vars) {
    let str = _strings[key];
    if (str === undefined) {
      // Fallback: restituisce la chiave stessa con prefisso per debug
      console.warn('[i18n] Missing key:', key, 'lang:', _lang);
      return key;
    }
    if (vars) {
      str = str.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        vars[k] !== undefined ? vars[k] : '{{' + k + '}}'
      );
    }
    return str;
  }

  // ── Lingua corrente ──
  function getLang() { return _lang; }

  // ── Salva scelta in localStorage ──
  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    localStorage.setItem(STORAGE_KEY, lang);
    // Il reload della pagina applica la lingua (più semplice di una re-render completa)
    location.reload();
  }

  // ── Leggi lingua salvata (chiamata prima del bootstrap) ──
  function getSavedLang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT;
  }

  // ── Formato data breve localizzato ──
  function fmtRound(n) {
    return t('common.round') + ' ' + n;
  }

  return { load, t, getLang, setLang, getSavedLang, SUPPORTED, fmtRound };
})();

// Esponi globalmente
window.t = I18N.t.bind(I18N);
window.I18N = I18N;
