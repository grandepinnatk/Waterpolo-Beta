'use strict';
// Smoke test dell'harness: verifica che l'ambiente di test sia attendibile.
// Se questo file fallisce, tutti gli altri test sono sospetti.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame, LOAD_ORDER } = require('./harness.js');

test('l harness carica tutti gli script del gioco', () => {
  const h = loadGame();
  assert.ok(LOAD_ORDER.length >= 20, 'ordine di caricamento incompleto');
  assert.strictEqual(h.run('TEAMS_DATA.length'), 14);
  assert.strictEqual(h.run('typeof G'), 'object');
});

test('il PRNG seedabile rende Math.random deterministico', () => {
  const h = loadGame();
  h.seed(99);
  const a = h.run('[Math.random(), Math.random(), Math.random()]');
  h.seed(99);
  const b = h.run('[Math.random(), Math.random(), Math.random()]');
  assert.deepStrictEqual(a, b, 'stesso seed deve produrre stessa sequenza');

  h.seed(1234);
  const c = h.run('[Math.random(), Math.random(), Math.random()]');
  assert.notDeepStrictEqual(a, c, 'seed diversi devono produrre sequenze diverse');
});

test('il dizionario i18n è caricato e t() risolve', () => {
  const h = loadGame();
  const v = h.run("t('common.ok')");
  assert.notStrictEqual(v, 'common.ok', 't() non sta risolvendo le chiavi');
});

test('nessuna chiave i18n mancante durante il caricamento', () => {
  // t() è chiamato a top-level nei data file: se il dizionario non è pronto
  // quando girano, i nomi degli allenamenti e degli obiettivi diventano
  // letteralmente "obj.champ.name" e simili. Zero warning = zero chiave rotta.
  const h = loadGame();
  assert.deepStrictEqual(h.warnings, [], `warning i18n al caricamento:\n${h.warnings.join('\n')}`);
  assert.strictEqual(h.run('OBJECTIVES_BY_TIER.S[0].name'), 'Vinci lo Scudetto');
});

// ── Tetto contro le regressioni sui finding del primo audit ──────────────────
// Questi sono i bug che il branch fix/stabilita corregge. Finché falliscono,
// il gioco è rotto: sono la definizione di "affidabile" per questo progetto.

test('FIX 2: skipPeriod usa _drainStamina, non una funzione inesistente', () => {
  const h = loadGame();
  assert.strictEqual(h.run('typeof _drainStamina'), 'function',
    '_drainStamina deve esistere');
  assert.strictEqual(h.run('typeof _drainStaminaChunk'), 'undefined',
    '_drainStaminaChunk non deve più essere invocata: il guard typeof la faceva '
    + 'sempre cadere sul fallback con drain 4,4 volte più basso');
});

test('FIX 3: simulateInjuries è globale e simula davvero gli infortuni', () => {
  const h = loadGame();
  assert.strictEqual(h.run('typeof simulateInjuries'), 'function',
    'simulateInjuries è annidata dentro simulateMatchStats: non è mai chiamabile');
});

test('FIX 8: l\'espulsione è sempre soggetta a MAX_EXPELLED', () => {
  const h = loadGame();
  assert.strictEqual(h.run('typeof tryAddExpelled'), 'function',
    'manca un punto unico che applichi il cap MAX_EXPELLED');
});
