// ─────────────────────────────────────────────────────────────────────────────
// js/i18n/commentary_en.js  —  Live Commentary English  v1.0.0
// ─────────────────────────────────────────────────────────────────────────────

const COMMENTARY_EN = {
  phase: {
    BUILD_UP: 'Build-up', ATTACK_WING: 'Wing attack', ATTACK_CB: 'Center forward in zone',
    FREE_PLAYER: 'Free player', SHOT: 'Shot', SAVE: 'Save', LOOSE_BALL: 'Loose ball',
    COUNTER: 'Counter-attack', PENALTY: 'Penalty', SUPERIORITY: 'Man-up', INFERIORITY: 'Man-down',
  },
  pass: ['{passer} to {receiver}.', 'Ball to {receiver} from {passer}.', '{passer} feeds {receiver}.'],
  free_advance: ['{player} is free! Driving to goal.', 'Space for {player} — pushing forward.'],
  shot_saved: ['Shot by {shooter} — saved by {gk}!', '{gk} denies {shooter}!'],
  shot_wide: ['{shooter} shoots — wide!', 'Off target from {shooter}.'],
  shot_blocked: ['Blocked! {shooter}\'s effort denied.'],
  goal_my: ['⚽ GOAL! {scorer} scores for {team}!', '⚽ {scorer} finds the net — {team} lead!'],
  goal_opp: ['⚽ Goal — {scorer} scores for {team}.', '⚽ {team} level — {scorer} nets.'],
  save: ['Save by {gk}!', '{gk} denies the shot!', 'Brilliant stop from {gk}!'],
  foul_temp_exp: ['🟡 Temp. exclusion #{shirt} — {team} man-down!'],
  foul_opp_exp: ['🟡 Foul by {opp} — {team} man-up!'],
  foul_perm_exp: ['🔴 PERMANENT EXCLUSION #{shirt}!'],
  shot_clock_expired: ['⏱ Shot clock — possession to {team}.'],
  interception: ['⚡ Intercepted by {team}!'],
  loose_ball_won: ['{player} wins the ball.'],
  sup_start: ['🔵 {team} man-up — 20 seconds to convert.'],
  inf_start: ['🔴 {team} defending man-down.'],
  counter: ['{player} launches the counter-attack!'],
  gk_launch: ['{gk} launches — {receiver} receives.'],
  neutral: ['Building possession.', 'Patient play.', 'Probing the defence.'],
};

if (typeof window !== 'undefined') {
  window.COMMENTARY_EN = COMMENTARY_EN;
  if (!window.LANG_COMMENTARY) window.LANG_COMMENTARY = {};
  window.LANG_COMMENTARY['en'] = COMMENTARY_EN;
}
