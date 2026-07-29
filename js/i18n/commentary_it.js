// ─────────────────────────────────────────────────────────────────────────────
// js/i18n/commentary_it.js  —  Telecronaca Italiano  v1.0.0
//
// Tutte le stringhe della telecronaca live sono qui.
// Per aggiungere una lingua: creare commentary_en.js, commentary_es.js ecc.
// con la stessa struttura e registrarla in i18n.js con LANG_COMMENTARY['en'].
// ─────────────────────────────────────────────────────────────────────────────

const COMMENTARY_IT = {

  // ── Fasi di gioco (Phase A) ─────────────────────────────────────────────
  phase: {
    BUILD_UP:      'Costruzione',
    ATTACK_WING:   'Azione ala',
    ATTACK_CB:     'Centroboa in zona',
    FREE_PLAYER:   'Giocatore libero',
    SHOT:          'Tiro',
    SAVE:          'Parata',
    LOOSE_BALL:    'Palla contesa',
    COUNTER:       'Contrattacco',
    PENALTY:       'Rigore',
    SUPERIORITY:   'Superiorità numerica',
    INFERIORITY:   'Inferiorità numerica',
  },

  // ── Passaggi / costruzione ───────────────────────────────────────────────
  pass: [
    '{passer} per {receiver}.',
    'Palla a {receiver} da {passer}.',
    '{passer} scarica su {receiver}.',
    'Circolazione veloce, {receiver} riceve.',
    '{passer} trova {receiver} in posizione.',
    'Smistamento rapido: {receiver} ha la palla.',
  ],

  // ── Giocatore libero avanza ──────────────────────────────────────────────
  free_advance: [
    '{player} è solo! Avanza verso la porta.',
    'Spazio per {player} che punta la porta.',
    '{player} in progressione, nessun avversario davanti.',
    'Contropiede — {player} scatta verso la porta avversaria.',
  ],

  // ── Tiro (senza goal) ────────────────────────────────────────────────────
  shot_saved: [
    'Tiro di {shooter} — parata di {gk}!',
    '{shooter} in tiro, {gk} dice no!',
    'Risponde {gk} sul tiro di {shooter}.',
    'Grande intervento di {gk} su {shooter}.',
    '{gk} vola e devia il tiro di {shooter}.',
  ],
  shot_wide: [
    'Tiro di {shooter} — fuori!',
    '{shooter} tira, palla sul palo!',
    'Conclusione di {shooter} a lato.',
    'Tiro troppo largo di {shooter}.',
  ],
  shot_blocked: [
    'Tiro di {shooter} murato dalla difesa.',
    'Bloccato il tiro di {shooter}.',
    '{shooter} tira, respinta la conclusione.',
  ],

  // ── Goal ─────────────────────────────────────────────────────────────────
  goal_my: [
    '⚽ GOL! {scorer} porta in vantaggio {team}!',
    '⚽ GOL! Segna {scorer}! {team} esulta!',
    '⚽ Rete di {scorer}! {team} va avanti!',
    '⚽ {scorer} non sbaglia — GOL per {team}!',
    '⚽ Imparabile! {scorer} firma il vantaggio di {team}!',
  ],
  goal_opp: [
    '⚽ Gol di {team}: segna {scorer}.',
    '⚽ {team} pareggia — {scorer} in rete.',
    '⚽ {scorer} porta avanti {team}.',
    '⚽ {team} segna con {scorer}.',
  ],

  // ── Parata del portiere ──────────────────────────────────────────────────
  save: [
    'Parata di {gk}!',
    '{gk} vola e salva!',
    'Bravissimo {gk} — palla in corner!',
    'Risposta prontissima di {gk}!',
    '{gk} blindato in porta — nulla da fare per l\'attaccante!',
    'Miracolo di {gk}!',
  ],

  // ── Fallo / Espulsione temporanea ────────────────────────────────────────
  foul_temp_exp: [
    '🟡 Esp. temporanea #{shirt} — inferiorità per {team}!',
    '🟡 Cartellino per #{shirt} — {team} in inferiorità numerica!',
    '🟡 Fallo in attacco — #{shirt} espulso temporaneamente.',
  ],
  foul_opp_exp: [
    '🟡 Fallo di {opp} — superiorità per {team}!',
    '🟡 {opp} commette fallo — {team} in superiorità!',
    '🟡 Espulsione temporanea per {opp} — vantaggio {team}.',
  ],
  foul_perm_exp: [
    '🔴 ESPULSO DEFINITIVAMENTE #{shirt} — 3ª infrazione!',
    '🔴 Rosso per #{shirt} — fine partita anticipata!',
  ],

  // ── Shot clock ───────────────────────────────────────────────────────────
  shot_clock_expired: [
    '⏱ 30 secondi scaduti — rimessa a {team}.',
    '⏱ Tempo d\'attacco esaurito — palla a {team}.',
    '⏱ Shot clock — cambio possesso per {team}.',
  ],

  // ── Intercettazione ──────────────────────────────────────────────────────
  interception: [
    '⚡ Palla intercettata da {team}!',
    '⚡ Grande lettura di {team} — intercetta!',
    '⚡ {team} ruba la palla a metà passaggio!',
  ],

  // ── Palla contesa / raccolta ─────────────────────────────────────────────
  loose_ball_won: [
    '{player} arriva per primo sulla palla.',
    '{player} conquista il possesso.',
    'Palla raccolta da {player}.',
  ],

  // ── Superiorità / Inferiorità ────────────────────────────────────────────
  sup_start: [
    '🔵 {team} in superiorità — 20 secondi per fare male.',
    '🔵 Superiorità per {team}: 6 contro 5.',
    '🔵 {team} sfrutta il vantaggio numerico.',
  ],
  inf_start: [
    '🔴 {team} in inferiorità — muro difensivo.',
    '🔴 {team} deve reggere in inferiorità.',
    '🔴 Fase delicata per {team} — in inferiorità numerica.',
  ],

  // ── Contrattacco ─────────────────────────────────────────────────────────
  counter: [
    '{player} lancia il contrattacco!',
    'Transizione veloce — {player} in avanti!',
    'Ripartenza fulminea di {team} con {player}.',
  ],

  // ── Rimessa portiere ─────────────────────────────────────────────────────
  gk_launch: [
    '{gk} rilancia — palla a {receiver}.',
    'Rinvio lungo di {gk} per {receiver}.',
    '{gk} smista subito — {receiver} in campo aperto.',
  ],

  // ── Circolazione neutro ──────────────────────────────────────────────────
  neutral: [
    'Manovra di attacco.',
    'Circolazione palla in cerca dello spazio.',
    'Possesso gestito con pazienza.',
    'L\'attacco costruisce.',
    'Difesa ben schierata — difficile trovare varchi.',
  ],
};

// Registra nel sistema i18n globale
if (typeof window !== 'undefined') {
  window.COMMENTARY_IT = COMMENTARY_IT;
  if (!window.LANG_COMMENTARY) window.LANG_COMMENTARY = {};
  window.LANG_COMMENTARY['it'] = COMMENTARY_IT;
}
