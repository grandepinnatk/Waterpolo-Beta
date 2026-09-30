'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Harness di test — carica il gioco (script classici, non moduli) in un contesto
// vm con stub minimi di DOM / storage, e rende Math.random riproducibile.
//
// Non modifica il codice di produzione: il PRNG seedabile è uno shim installato
// SOLO dentro il contesto di test, per cui i 132 Math.random() del progetto
// diventano deterministici senza toccare una riga di gameplay.
// ─────────────────────────────────────────────────────────────────────────────

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Ordine di caricamento: deve rispecchiare i <script> di index.html
const LOAD_ORDER = [
  'js/i18n/i18n.js',
  'js/i18n/it.js',
  'js/i18n/en.js',
  'BOOTSTRAP_LANG', // script inline in index.html: deve precedere i data file,
                    // perché objectives.js e training.js chiamano t() a top-level
  'js/data/teams.js',
  'js/data/positions.js',
  'js/data/training.js',
  'js/data/objectives.js',
  'js/data/names.js',
  'js/engine/generator.js',
  'js/engine/standings.js',
  'js/engine/match.js',
  'js/engine/live_engine.js',
  'js/engine/save.js',
  'js/canvas/pool.js',
  'js/canvas/movement.js',
  'js/ui/tabs.js',
  'js/ui/welcome.js',
  'js/ui/lineup.js',
  'js/ui/match.js',
  'js/ui/tabs_renderers.js',
  'js/main.js',
];

// Bootstrap: replica lo script inline di index.html (lingua) + installa il PRNG.
const BOOTSTRAP = `
var __rngState = 0x9e3779b9;
function __seedRnd(s) { __rngState = (s >>> 0) || 0x9e3779b9; }
function __rnd() {                       // mulberry32
  __rngState = __rngState + 0x6D2B79F5 | 0;
  var t = Math.imul(__rngState ^ __rngState >>> 15, 1 | __rngState);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
Math.random = __rnd;
__seedRnd(0x9e3779b9);
`;

// ── Stub DOM ─────────────────────────────────────────────────────────────────
function makeElement(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    _html: '',
    _text: '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    parentNode: null,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    focus() {},
    click() {},
    insertAdjacentHTML() {},
    getContext() { return makeCtx2d(); },
  };
  return el;
}

function makeCtx2d() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

function makeDocument() {
  const byId = new Map();
  const body = makeElement('body');
  return {
    body,
    documentElement: makeElement('html'),
    createElement: (t) => makeElement(t),
    createTextNode: (s) => ({ textContent: s }),
    createDocumentFragment: () => makeElement('fragment'),
    getElementById: (id) => {
      if (!byId.has(id)) byId.set(id, makeElement('div'));
      return byId.get(id);
    },
    querySelector: (sel) => makeElement('div'),
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    addEventListener() {},
    removeEventListener() {},
    _byId: byId,
  };
}

// ── Caricamento ──────────────────────────────────────────────────────────────
function loadGame({ seed = 12345, storage } = {}) {
  const document = makeDocument();
  const localStorage = storage || makeStorage();

  // I warning emessi durante il caricamento vengono raccolti invece che
  // stampati: sporcano l'output di ogni test, ma sono segnale (chiavi i18n
  // mancanti costruite dinamicamente nei data file).
  const warnings = [];
  const quietConsole = Object.create(console);
  quietConsole.warn = (...a) => { warnings.push(a.join(' ')); };
  quietConsole.error = (...a) => { warnings.push('[error] ' + a.join(' ')); };

  const sandbox = {
    console: quietConsole,
    document,
    localStorage,
    sessionStorage: makeStorage(),
    navigator: { language: 'it-IT', userAgent: 'node-test', maxTouchPoints: 0 },
    location: { href: 'http://test/', protocol: 'http:', host: 'test' },
    history: { replaceState() {} },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    alert: () => {},
    confirm: () => true,
    prompt: () => null,
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    fetch: () => Promise.reject(new Error('network disabled in test')),
    Image: class { constructor() { this.width = 0; this.height = 0; this.complete = true; }
                   set src(v) { this._src = v; if (this.onload) setTimeout(this.onload, 0); } },
    Audio: class { constructor() { this.volume = 1; this.muted = false; this.playbackRate = 1; }
                   play() { return Promise.resolve(); } pause() {} },
    HTMLCanvasElement: function () {},
    HTMLElement: function () {},
    Node: function () {},
    Event: function (t) { this.type = t; },
    CustomEvent: function (t) { this.type = t; },
    performance: { now: () => Date.now() },
    crypto: require('node:crypto').webcrypto,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);

  vm.runInContext(BOOTSTRAP, ctx, { filename: 'bootstrap.js' });
  vm.runInContext('__seedRnd(' + seed + ');', ctx);

  for (const rel of LOAD_ORDER) {
    if (rel === 'BOOTSTRAP_LANG') {
      vm.runInContext(`
        (function () {
          var lang = I18N.getSavedLang();
          I18N.load(lang, lang === 'en' ? LANG_EN : LANG_IT);
        })();
      `, ctx, { filename: 'i18n-bootstrap.js' });
      continue;
    }
    const file = path.join(ROOT, rel);
    const code = fs.readFileSync(file, 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: rel });
    } catch (e) {
      throw new Error(`Caricamento fallito di ${rel}: ${e.message}`);
    }
  }

  return {
    ctx,
    sandbox,
    document,
    localStorage,
    warnings,
    /**
     * Valuta un'espressione nel contesto del gioco e ne restituisce il valore.
     * Il secondo argomento inietta variabili nel contesto passandogli gli
     * OGGETTI VIVI (non copie): le mutazioni fatte dal codice di gioco sono
     * quindi visibili dal test, che è ciò che serve per osservare lo stato.
     */
    run(expr, vars) {
      if (vars) {
        for (const k of Object.keys(vars)) sandbox[k] = vars[k];
      }
      return vm.runInContext(expr, ctx);
    },
    /** Legge un globale (incluse le dichiarazioni `let`, non solo `var`). */
    get(name) { return vm.runInContext(name, ctx); },
    /** Riassegna un globale. */
    set(name, value) { vm.runInContext(`${name} = globalThis.__v`, ctx, { __v: value }); },
    /** Chiama una funzione globale. */
    call(fnName, ...args) {
      const a = args.map((x) => JSON.stringify(x === undefined ? null : x)).join(',');
      return vm.runInContext(`${fnName}(${a})`, ctx);
    },
    /** Riavvia il PRNG con un seed noto: rende ogni test deterministico. */
    seed(s) { vm.runInContext(`__seedRnd(${s >>> 0});`, ctx); },
  };
}

module.exports = { loadGame, makeElement, makeStorage, LOAD_ORDER, ROOT };
