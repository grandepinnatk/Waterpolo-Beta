// ─────────────────────────────────────────────
// data/positions.js  —  posizioni in vasca
// Coordinate normalizzate 0-1 (x, y)
// ─────────────────────────────────────────────
//
// Posizioni ufficiali pallanuoto:
// GK = Portiere (P)
// 1  = Attaccante destro      — ATT mano L (sinistro)
// 2  = Difensore destro       — DIF mano L (sinistro)
// 3  = Centrovasca (CEN)      — CEN mano indifferente
// 4  = Difensore sinistro     — DIF mano R (destro)
// 5  = Attaccante sinistro    — ATT mano R (destro)
// 6  = Centroboa (CB)         — CB  mano indifferente

const POSITIONS = {
  GK: { label:'P',    desc:'Portiere',             role:'POR', x:0.50, y:0.88 },
  1:  { label:'1',    desc:'Attaccante destro',     role:'ATT', x:0.88, y:0.28, prefHand:'L' },
  2:  { label:'2',    desc:'Difensore destro',      role:'DIF', x:0.78, y:0.52, prefHand:'L' },
  3:  { label:'3',    desc:'Centrovasca',           role:'CEN', x:0.50, y:0.50 },
  4:  { label:'4',    desc:'Difensore sinistro',    role:'DIF', x:0.22, y:0.52, prefHand:'R' },
  5:  { label:'5',    desc:'Attaccante sinistro',   role:'ATT', x:0.12, y:0.28, prefHand:'R' },
  6:  { label:'6',    desc:'Centroboa',             role:'CB',  x:0.50, y:0.18 },
};

// Ordine di riempimento nella schermata convocazioni
const POS_KEYS = ['GK', '1', '2', '3', '4', '5', '6'];

// Posizioni avversario (specchiato verticalmente)
const OPP_POS = {
  GK: { x:0.50, y:0.12 },
  1:  { x:0.12, y:0.72 },
  2:  { x:0.22, y:0.48 },
  3:  { x:0.50, y:0.50 },
  4:  { x:0.78, y:0.48 },
  5:  { x:0.88, y:0.72 },
  6:  { x:0.50, y:0.82 },
};

// Posizioni "base" dei nostri in campo durante la partita
const MY_POS_MAP = {
  GK: { x:0.50, y:0.88 },
  1:  { x:0.88, y:0.28 },
  2:  { x:0.78, y:0.52 },
  3:  { x:0.50, y:0.50 },
  4:  { x:0.22, y:0.52 },
  5:  { x:0.12, y:0.28 },
  6:  { x:0.50, y:0.18 },
};

// Affinità ruolo → posizione (per auto-formazione)
const POS_ROLE_AFFINITY = {
  1: 'ATT',
  2: 'DIF',
  3: 'CEN',
  4: 'DIF',
  5: 'ATT',
  6: 'CB',
};
