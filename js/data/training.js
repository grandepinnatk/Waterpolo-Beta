// ─────────────────────────────────────────────
// data/training.js  —  tipi di allenamento
// ─────────────────────────────────────────────
// Bilanciamento: ogni tipo cresce attributi specifici.
// L'OVR è la media ponderata per ruolo → allenamenti specializzati
// danno più OVR al ruolo corretto (es. difesa → molto OVR per DIF/POR)
// ma meno agli altri. Questo crea scelte tattiche reali.
//
// Range ΔOVR stagione (26 sess) per ruolo principale:
//   Preparazione Atletica : ~8  per tutti (fitness + spread)
//   Allenamento Attacco   : ~6 POR / ~8 DIF / ~13 CEN / ~19 ATT / ~15 CB
//   Allenamento Difesa    : ~19 POR / ~21 DIF / ~13 CEN / ~7 ATT / ~11 CB
//   Sessione Tattica      : ~11 per tutti (bilanciato, minor boost)
//   Allenamento Portieri  : ~15 POR, ~0 altri
//   Allenamento Tecnico   : ~8 per tutti (tec impatta uguale su tutti)
//   Riposo e Recupero     : 0 OVR, recupero fitness/morale
//   Allenamento Resistenza: ~7 per tutti
// ─────────────────────────────────────────────
const TRAINING_TYPES = [
  {
    id:      'physical',
    stars:   2,
    name:    t('training_data.physical.name'),
    desc:    t('training_data.physical.desc'),
    icon:    '💪',
    cost:    15000,
    eff:     { fitness:8, att:1, def:1, spe:1, str:1, res:1 },
    fatigue: 5,
  },
  {
    id:      'attack',
    stars:   2,
    name:    t('training_data.attack.name'),
    desc:    t('training_data.attack.desc'),
    icon:    '🎯',
    cost:    12000,
    eff:     { att:4, spe:2 },
    fatigue: 6,
  },
  {
    id:      'defense',
    stars:   2,
    name:    t('training_data.defense.name'),
    desc:    t('training_data.defense.desc'),
    icon:    '🛡️',
    cost:    12000,
    eff:     { def:4, str:2 },
    fatigue: 6,
  },
  {
    id:      'tactics',
    stars:   2,
    name:    t('training_data.tactics.name'),
    desc:    t('training_data.tactics.desc'),
    icon:    '📋',
    cost:    12000,
    eff:     { att:2, def:2, spe:1, str:1 },
    fatigue: 4,
  },
  {
    id:      'gk',
    stars:   2,
    name:    t('training_data.gk.name'),
    desc:    t('training_data.gk.desc'),
    icon:    '🥅',
    cost:    10000,
    eff:     { def:3, str:2, tec:1, res:1 },
    fatigue: 4,
  },
  {
    id:      'technique',
    stars:   2,
    name:    t('training_data.technique.name'),
    desc:    t('training_data.technique.desc'),
    icon:    '🤽',
    cost:    14000,
    eff:     { tec:5, spe:1 },
    fatigue: 5,
  },
  {
    id:      'rest',
    stars:   1,
    name:    t('training_data.rest.name'),
    desc:    t('training_data.rest.desc'),
    icon:    '🏖️',
    cost:    0,
    eff:     { fitness:12, morale:8 },
    fatigue: -10,
  },
  {
    id:      'endurance',
    stars:   2,
    name:    t('training_data.endurance.name'),
    desc:    t('training_data.endurance.desc'),
    icon:    '🏊',
    cost:    13000,
    eff:     { res:4, str:2, fitness:3 },
    fatigue: 7,
  },
];
