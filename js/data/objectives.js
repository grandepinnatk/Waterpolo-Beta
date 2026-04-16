// ─────────────────────────────────────────────
// data/objectives.js  —  obiettivi per tier
// ─────────────────────────────────────────────
const OBJECTIVES_BY_TIER = {
  S: [
    { id:'champ', name:t('obj.champ.name'),    desc:t('obj.champ.desc'),               reward:500000, type:'champion',  points:1000 },
    { id:'top2',  name:t('obj.top2.name'),        desc:t('obj.top2.desc'),    reward:200000, type:'position', target:2,  points:400 },
    { id:'g40',   name:t('obj.g40.name'),   desc:t('obj.g40.desc'), reward:80000,  type:'goals',    target:40, points:150 },
  ],
  A: [
    { id:'playoff', name:t('obj.playoff_a.name'), desc:t('obj.playoff_a.desc'),       reward:200000, type:'position', target:4,  points:500 },
    { id:'top6',    name:t('obj.top6.name'),       desc:t('obj.top6.desc'),                 reward:120000, type:'position', target:6,  points:300 },
    { id:'surv',    name:t('obj.surv.name'),        desc:t('obj.surv.desc'),                 reward:80000,  type:'survive',             points:200 },
  ],
  B: [
    { id:'top8', name:t('obj.top8.name'),    desc:t('obj.top8.desc'), reward:150000, type:'position', target:8,  points:400 },
    { id:'surv', name:t('obj.surv.name'),     desc:t('obj.surv.desc'),               reward:100000, type:'survive',             points:300 },
    { id:'w10',  name:t('obj.w10.name'), desc:t('obj.w10.desc'),  reward:60000,  type:'wins',     target:10, points:150 },
  ],
  C: [
    { id:'surv',  name:t('obj.surv.name'),    desc:t('obj.surv_c.desc'),   reward:150000, type:'survive',             points:500 },
    { id:'top12', name:t('obj.top12.name'),      desc:t('obj.top12.desc'), reward:80000,  type:'position', target:13, points:300 },
    { id:'w5',    name:t('obj.w5.name'), desc:t('obj.w5.desc'),           reward:50000,  type:'wins',     target:5,  points:100 },
  ],
};
