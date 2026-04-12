// ─────────────────────────────────────────────
// data/objectives.js  —  obiettivi per tier
// ─────────────────────────────────────────────
const OBJECTIVES_BY_TIER = {
  S: [
    { id:'champ', name:'Vinci lo Scudetto',    desc:'Campione d\'Italia',               reward:500000, type:'champion',  points:1000 },
    { id:'top2',  name:'Finisci top 2',        desc:'Regular season tra le prime 2',    reward:200000, type:'position', target:2,  points:400 },
    { id:'g40',   name:'40+ gol stagionali',   desc:'Almeno 40 reti in regular season', reward:80000,  type:'goals',    target:40, points:150 },
  ],
  A: [
    { id:'playoff', name:'Raggiungi i playoff', desc:'Qualificati tra le prime 4',       reward:200000, type:'position', target:4,  points:500 },
    { id:'top6',    name:'Finisci top 6',       desc:'Evita i play-out',                 reward:120000, type:'position', target:6,  points:300 },
    { id:'surv',    name:'Rimani in A1',        desc:'No retrocessione',                 reward:80000,  type:'survive',             points:200 },
  ],
  B: [
    { id:'top8', name:'Finisci top 8',    desc:'Supera le aspettative del club', reward:150000, type:'position', target:8,  points:400 },
    { id:'surv', name:'Rimani in A1',     desc:'No retrocessione',               reward:100000, type:'survive',             points:300 },
    { id:'w10',  name:'Vinci 10 partite', desc:'Almeno 10 vittorie stagionali',  reward:60000,  type:'wins',     target:10, points:150 },
  ],
  C: [
    { id:'surv',  name:'Rimani in A1',    desc:'Sopravvivi alla stagione',   reward:150000, type:'survive',             points:500 },
    { id:'top12', name:'Non ultimo',      desc:'Finisci almeno al 13° posto', reward:80000,  type:'position', target:13, points:300 },
    { id:'w5',    name:'Vinci 5 partite', desc:'Almeno 5 vittorie',           reward:50000,  type:'wins',     target:5,  points:100 },
  ],
};
