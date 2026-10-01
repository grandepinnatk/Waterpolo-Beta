
// ── Normalizza potential >= overall per tutti i giocatori ────────────
// Chiamata dopo il caricamento di un salvataggio per correggere
// giocatori con potential mancante o inferiore all'overall
function _normalizeRosters(G) {
  if (!G || !G.rosters) return;
  Object.values(G.rosters).forEach(function(roster) {
    if (!roster) return;
    roster.forEach(function(p) {
      if (!p) return;
      // Se potential è mancante o inferiore all'overall, correggilo
      if (!p.potential || p.potential < p.overall) {
        p.potential = p.overall;
      }
    });
  });
}

// ─────────────────────────────────────────────
// engine/save.js  —  sistema salvataggio a 3 slot
// ─────────────────────────────────────────────
// Ogni slot è indipendente. Metadati leggibili
// senza caricare l'intero payload.
// G.ms (stato partita live) non viene serializzato:
// contiene riferimenti canvas non serializzabili.
// ─────────────────────────────────────────────

const SAVE_VERSION = 4;
const TOTAL_SLOTS  = 3;
const SLOT_PREFIX  = 'wp_slot_';

// ── Stati di uno slot ───────────────────────────
// Prima questi casi finivano tutti in null e la schermata li mostrava come
// "slot vuoto". Un JSON troncato e un salvataggio v3 erano indistinguibili da
// uno slot mai usato, quindi il giocatore vedeva tre slot vuoti senza sapere
// che dentro ci sono ancora tre carriere, e senza poter recuperarle.
//
// empty   : nessun dato, niente da recuperare
// valid   : leggibile e compatibile
// legacy  : leggibile ma di una versione precedente. I dati ci sono, ma non li
//           carichiamo: SAVE_VERSION e' 4 e la decisione presa e' rifiutare
//           i salvataggi vecchi invece di migrarli. restorable=false perche'
//           non si puo' caricare, il che non vuol dire che il dato sia perso
// corrupt : presente ma illeggibile o strutturalmente sbagliato
const SLOT_EMPTY   = 'empty';
const SLOT_VALID   = 'valid';
const SLOT_LEGACY  = 'legacy';
const SLOT_CORRUPT = 'corrupt';

// Struttura minima perché un payload sia considerato caricabile.
// Serve a distinguere "JSON valido ma non e' un salvataggio" da un salvataggio
// rotto: senza questo, un file contenente per esempio '{}' passerebbe il
// controllo della versione e produrrebbe un G senza rose ne' calendario.
const _REQUIRED_PAYLOAD_KEYS = [
  'version', 'myId', 'myTeam', 'rosters', 'schedule', 'stand', 'phase',
];

function _isPayloadStructurallySound(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (typeof p.version !== 'number') return false;
  for (const k of _REQUIRED_PAYLOAD_KEYS) {
    if (p[k] === undefined || p[k] === null) return false;
  }
  if (typeof p.myId !== 'string') return false;
  if (!p.rosters || typeof p.rosters !== 'object') return false;
  if (!p.rosters[p.myId] || !Array.isArray(p.rosters[p.myId]) || !p.rosters[p.myId].length) return false;
  if (!Array.isArray(p.schedule) || !p.schedule.length) return false;
  if (!p.stand || typeof p.stand !== 'object' || !p.stand[p.myId]) return false;
  if (typeof p.phase !== 'string') return false;
  return true;
}

// ── Ispeziona uno slot senza modificarlo ────────
// Ritorna { state, meta, version, restorable }.
// E' l'unica funzione che decide se uno slot e' vuoto, valido, legacy o
// corrotto. readSlotMeta e loadFromSlot passano entrambi da qui, cosi' la
// schermata e il caricamento non possono contraddirsi: un slot che appare
// caricabile e' davvero caricabile, e viceversa.
function inspectSlot(slotIndex) {
  let raw;
  try {
    raw = localStorage.getItem(_slotKey(slotIndex));
  } catch (e) {
    console.warn('[save] lettura slot', slotIndex, e);
    return { state: SLOT_CORRUPT, meta: null, version: null, restorable: false };
  }
  if (!raw) return { state: SLOT_EMPTY, meta: null, version: null, restorable: false };

  let p;
  try {
    p = JSON.parse(raw);
  } catch (e) {
    // JSON troncato o scritto a meta': il dato potrebbe essere recuperabile a
    // mano, quindi non lo distruggiamo e non lo dichiariamo vuoto.
    return { state: SLOT_CORRUPT, meta: null, version: null, restorable: false };
  }

  if (!_isPayloadStructurallySound(p)) {
    return { state: SLOT_CORRUPT, meta: null, version: (p && p.version) || null, restorable: false };
  }

  if (p.version !== SAVE_VERSION) {
    // Dati leggibili ma versione diversa. Mostriamo comunque i metadati, cosi'
    // il giocatore vede di quale squadra si tratta e capisce che non e' un
    // errore di lettura, prima di decidere se azzerare.
    return {
      state: SLOT_LEGACY,
      meta: (p.meta && typeof p.meta === 'object') ? { ...p.meta, savedAt: p.savedAt } : null,
      version: p.version,
      restorable: false,
    };
  }

  return {
    state: SLOT_VALID,
    meta: (p.meta && typeof p.meta === 'object') ? { ...p.meta, savedAt: p.savedAt } : null,
    version: p.version,
    restorable: true,
  };
}

// ── Chiave localStorage per slot N ───────────
function _slotKey(i) { return SLOT_PREFIX + i; }

// ── Helper: giornata corrente dal calendario ──
function _roundFromSchedule(schedule) {
  if (!schedule || !schedule.length) return 0;
  const played = schedule.filter(m => m.played);
  return played.length ? Math.max(...played.map(m => m.round)) : 0;
}

// ── Helper: posizione dal giocatore ──────────
function _posFromStand(stand, myId) {
  if (!stand || !myId) return '—';
  const sorted = Object.values(stand).sort((a, b) =>
    b.pts !== a.pts ? b.pts - a.pts : (b.gf - b.ga) - (a.gf - a.ga)
  );
  const idx = sorted.findIndex(s => s.id === myId);
  return idx >= 0 ? idx + 1 : '—';
}

// ── Costruisce il payload completo ────────────
function _buildPayload(G) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    savedAtMs: Date.now(),
    // Metadati leggibili senza caricare tutto il gioco
    meta: {
      teamId:       G.myId,
      teamName:     G.myTeam.name,
      teamAbbr:     G.myTeam.abbr,
      teamCol:      G.myTeam.col,
      teamTier:     G.myTeam.tier,
      phase:        G.phase,
      round:        _roundFromSchedule(G.schedule),   // 0 = nessuna partita ancora
      seasonNumber: G.seasonNumber || 1,
      position:     _posFromStand(G.stand, G.myId),
      points:       G.stand[G.myId]?.pts ?? 0,
      wins:         G.stand[G.myId]?.w   ?? 0,
      budget:       G.budget,
      savedAtMs:    Date.now(),
    },
    // Stato completo
    myId:          G.myId,
    myTeam:        G.myTeam,
    teams:         G.teams,
    rosters:       G.rosters,
    schedule:      G.schedule,
    stand:         G.stand,
    budget:        G.budget,
    msgs:          (G.msgs || []).slice(-20),
    phase:         G.phase,
    objectives:    G.objectives,
    trainWeeks:    G.trainWeeks    || 0,
    trainHistory:  G.trainHistory  || [],
    lineup:        G.lineup        || { formation: {}, convocati: [] },
    poTeams:       G.poTeams       || null,
    ploTeams:      G.ploTeams      || null,
    relegated:     G.relegated     || null,
    poBracket:     G.poBracket     || null,
    plBracket:     G.plBracket     || null,
    playoffResult: G.playoffResult || null,
    savedLineup:   G.savedLineup   || null,
    transferList:  G.transferList  || [],
    marketPool:    G.marketPool    || [],
    ledger:        G.ledger        || [],
    prevPos:       G.prevPos       || null,
    // Campi aggiunti progressivamente
    stars:         G.stars         !== undefined ? G.stars : 5,
    pendingPurchases: G.pendingPurchases || [],
    seasonHistory: G.seasonHistory  || [],
    seasonNumber:  G.seasonNumber   || 1,
    tactic:        G.tactic         || 'balanced',
    _newsPage:     G._newsPage      || 0,
    stadium:       G.stadium          || null,
  };
}

// ── Salva in uno slot specifico ───────────────
// Ritorna { ok: bool, error: string|null }
// Se CloudSave è disponibile (utente loggato), salva anche su cloud (fire-and-forget)
function saveToSlot(G, slotIndex) {
  if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS)
    return { ok: false, error: 'Indice slot non valido' };
  try {
    const jsonStr = JSON.stringify(_buildPayload(G));
    localStorage.setItem(_slotKey(slotIndex), jsonStr);
    // Sync cloud in background (non blocca il gioco)
    if (window.CloudSave && window.CloudSave.isLoggedIn()) {
      window.CloudSave.saveSlot(slotIndex, jsonStr).catch(e =>
        console.warn('[save] cloud sync error:', e)
      );
    }
    return { ok: true, error: null };
  } catch (e) {
    console.warn('[save] slot ' + slotIndex, e);
    return { ok: false, error: e.message || 'Errore localStorage' };
  }
}

// ── Legge SOLO i metadati di uno slot ─────────
// Veloce: non deserializza le rose o il calendario.
// Ritorna l'oggetto meta per uno slot valido, altrimenti null.
//
// null non significa piu' "slot vuoto": uno slot legacy o corrotto restituisce
// anch'esso null, perche' non e' caricabile. La schermata usa inspectSlot per
// distinguerli e mostrare il motivo, invece di far sembrare vuoto uno slot con
// dentro tre anni di partite.
function readSlotMeta(slotIndex) {
  const info = inspectSlot(slotIndex);
  return info.state === SLOT_VALID ? info.meta : null;
}

// ── Versione e stato di tutti gli slot ─────────
// Ritorna array[3] di { state, meta, version, restorable }.
function inspectAllSlots() {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => inspectSlot(i));
}

// ── Legge metadati di tutti gli slot ─────────
// Ritorna array[3] di meta|null
function readAllSlotsMeta() {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => readSlotMeta(i));
}

// ── Completa un payload v4 ─────────────────────
// Non e' una migrazione di versione: i salvataggi di versione diversa vengono
// rifiutati prima di arrivare qui. Questo riempie i campi che un payload v4
// valido puo' comunque non avere, perche' sono stati aggiunti al gioco dopo
// l'ultima partita salvata dal giocatore.
//
// Nota: le righe "// v2 -> v3" qui sotto indicano l'origine dei campi, non un
// percorso ancora attivo. Sono rimaste come documentazione di cosa serve a un
// payload quando manca, e valgono per ogni versione.
function _migratePayload(p) {
  if (!p) return null;
  // Se per qualche motivo arriva qui un payload di un'altra versione, non
  // tocchiamolo: promuoverlo a v4 inventerebbe dati che non ci sono. Chi
  // arriva a questo punto e' gia' stato validato da loadFromSlot.
  if (p.version !== SAVE_VERSION) return null;
  if (!p.marketPool)  p.marketPool  = [];
  if (p.stars === undefined) p.stars = 5;
  if (!p.pendingPurchases) p.pendingPurchases = [];
  if (!p.seasonHistory)   p.seasonHistory   = [];
  // contractYears migrazione vecchi giocatori
  if (p.rosters) {
    Object.values(p.rosters).forEach(function(roster) {
      (roster || []).forEach(function(pl) {
        if (pl && pl.contractYears === undefined) pl.contractYears = Math.floor(Math.random() * 3) + 1;
        // Resetta sempre il flag nazionale al caricamento: viene riassegnato da simNextRound
        if (pl) { pl._national = false; pl._nationalNext = false; pl._nationalNat = undefined; }
        // Riallinea overall/potential dagli attributi (usa funzioni globali da main.js)
        if (pl && pl.stats && typeof _calcOverallRaw === 'function') {
          var rawOvr = _calcOverallRaw(pl);  // senza cap potential
          // Se gli attributi superano il potential, aggiorna il potential
          if (rawOvr > (pl.potential || 0)) pl.potential = Math.min(99, rawOvr);
          // Overall = raw capped al potential aggiornato
          pl.overall = Math.min(pl.potential || 99, rawOvr);
        }
      });
    });
  } // stelle: default 5 per salvataggi vecchi
  // Aggiunge injProb a giocatori senza (salvataggi vecchi)
  if (p.rosters) {
    Object.values(p.rosters).forEach(function(roster) {
      (roster || []).forEach(function(pl) {
        if (pl && pl.injProb === undefined) {
          var raw = -Math.log(1 - Math.random()) * 0.045;
          pl.injProb = Math.round(Math.max(0.02, Math.min(0.15, raw)) * 1000) / 1000;
        }
      });
    });
  }
  // Aggiunge retirementAge a giocatori senza (salvataggi vecchi)
  if (p.rosters) {
    Object.values(p.rosters).forEach(function(roster) {
      (roster || []).forEach(function(pl) {
        if (pl && pl.ambition === undefined) {
          const u1 = Math.random(), u2 = Math.random();
          const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          pl.ambition = Math.round(Math.max(10, Math.min(90, 50 + z * 20)));
        }
        if (pl && pl.retirementAge === undefined) {
          const u1 = Math.random(), u2 = Math.random();
          const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          pl.retirementAge = Math.round(Math.max(32, Math.min(40, 35 + z * 2)));
        }
      });
    });
  }
  // Aggiunge res a tutti i giocatori di salvataggi vecchi
  if (p.rosters) {
    Object.values(p.rosters).forEach(function(roster) {
      (roster || []).forEach(function(pl) {
        if (pl && pl.ambition === undefined) {
          const u1 = Math.random(), u2 = Math.random();
          const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          pl.ambition = Math.round(Math.max(0, Math.min(100, 50 + z * 20)));
        }
        if (pl && pl.stats && pl.stats.res === undefined) {
          pl.stats.res = Math.max(1, Math.min(99, Math.round(pl.overall + (Math.random()*16-8))));
        }
      });
    });
  }
  if (!p.savedAtMs)   p.savedAtMs   = p.meta?.savedAtMs || (p.savedAt ? new Date(p.savedAt).getTime() : 0);
  if (!p.meta?.savedAtMs && p.savedAtMs) p.meta = { ...p.meta, savedAtMs: p.savedAtMs };

  // Ripara calendario con round corrotti (tutti round=1 o round non sequenziali)
  if (p.schedule && p.schedule.length > 0) {
    const rounds = p.schedule.map(m => m.round);
    const uniqueRounds = new Set(rounds);
    const maxRound = Math.max(...rounds);
    // Se ci sono meno round unici del dovuto o il max è 1, ricalcola
    if (uniqueRounds.size < 3 || maxRound <= 1) {
      _repairScheduleRounds(p.schedule);
    }
  }

  p.version = SAVE_VERSION;
  return p;
}

// Ripara i round del calendario raggruppando le partite in giornate coerenti
// Usa il fatto che ogni giornata ha N/2 partite (7 per 14 squadre)
function _repairScheduleRounds(schedule) {
  const MATCHES_PER_ROUND = 7; // 14 squadre / 2
  // Mantieni l'ordine esistente e riassegna round sequenziali
  schedule.forEach((m, i) => {
    m.round = Math.floor(i / MATCHES_PER_ROUND) + 1;
  });
}

// ── Motivo per cui uno slot non e' caricabile ───
// Serve alla schermata per non dire "errore di caricamento" quando in realta
// il salvataggio e' semplicamente di una versione che non carichiamo piu'.
function slotUnusableReason(slotIndex) {
  const info = inspectSlot(slotIndex);
  if (info.state === SLOT_VALID) return null;
  if (info.state === SLOT_EMPTY) return 'empty';
  if (info.state === SLOT_LEGACY) return 'legacy';
  return 'corrupt';
}

// ── Carica payload completo di uno slot ───────
// Ritorna payload caricabile, oppure null.
//
// Il perche' del null e' importante: con SAVE_VERSION 4 i salvataggi v3 non
// vengono migrati, per scelta. Restano sul dispositivo e il giocatore puo'
// azzerare lo slot, ma non vengono caricati. _migratePayload resta perche'
// normalizza i payload v4 mancanti di campi opzionali recenti (injProb,
// ambition, contractYears): non e' una migrazione di versione, e' un
// completamento difensivo dello schema corrente.
function loadFromSlot(slotIndex) {
  const info = inspectSlot(slotIndex);
  if (info.state === SLOT_EMPTY) return null;
  if (info.state === SLOT_LEGACY) {
    console.warn('[save] slot', slotIndex, 'versione', info.version,
      'rifiutata: SAVE_VERSION e\'', SAVE_VERSION);
    return null;
  }
  if (info.state === SLOT_CORRUPT) {
    console.warn('[save] slot', slotIndex, 'corrotto — caricamento rifiutato');
    return null;
  }
  try {
    const p = JSON.parse(localStorage.getItem(_slotKey(slotIndex)));
    return _migratePayload(p);
  } catch (e) {
    console.warn('[save] caricamento slot', slotIndex, e);
    return null;
  }
}

// ── Elimina uno slot ──────────────────────────
function deleteSlot(slotIndex) {
  localStorage.removeItem(_slotKey(slotIndex));
  // Elimina anche dal cloud se loggato
  if (window.CloudSave && window.CloudSave.isLoggedIn()) {
    window.CloudSave.deleteSlot(slotIndex).catch(e =>
      console.warn('[save] cloud delete error:', e)
    );
  }
}

// ── Verifica se almeno uno slot e' occupato ────
// Vale per qualunque dato presente, anche non caricabile: uno slot corrotto o
// legacy ha ancora contenuto che il giocatore potrebbe voler esportare, quindi
// non e' "vuoto" ai fini di questa funzione. Usata per decidere se esiste una
// carriera da mettere in pausa o avvisare, non per decidere cosa caricare.
function hasAnySave() {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => inspectSlot(i).state !== SLOT_EMPTY).some(Boolean);
}

// ── Slot che contengono ancora del contenuto ───
// Serve al pulsante "Azzera tutto" per dire quanti slot stanno per essere
// cancellati, invece di chiedere una conferma generica.
function listOccupiedSlots() {
  return inspectAllSlots()
    .map((info, i) => ({ index: i, ...info }))
    .filter(s => s.state !== SLOT_EMPTY);
}

// ── Azzera tutti gli slot ──────────────────────
// Cancella i tre slot locali e anche dal cloud, se l'utente e' loggato.
//
// Attenzione: la cancellazione cloud e' fire-and-forget, come in deleteSlot. Se
// la rete fallisce, lo slot resta sul cloud e la cancellazione locale non e'
// stata sufficiente a rimuovere tutto. Non posso controllarlo da qui: i dati
// cloud vivono su Firebase e questo ambiente non ci arriva.
//
// wp_last_slot indica quale slot stava usando il giocatore: senza azzerarlo,
// un reload automatico riporterebbe alla partita appena cancellata e
// rigenererebbe un salvataggio vuoto al primo autosave.
function wipeAllSaves() {
  const result = { local: [], cloud: false, cloudError: null };
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (inspectSlot(i).state === SLOT_EMPTY) continue;
    localStorage.removeItem(_slotKey(i));
    result.local.push(i);
    if (window.CloudSave && window.CloudSave.isLoggedIn()) {
      result.cloud = true;
      window.CloudSave.deleteSlot(i).catch(e => {
        result.cloudError = e && e.message ? e.message : String(e);
        console.warn('[save] cloud delete slot', i, e);
      });
    }
  }
  localStorage.removeItem('wp_last_slot');
  return result;
}

// ── Ricostruisce G da payload caricato ────────
function applyLoadedSave(payload) {
  return {
    myId:          payload.myId,
    myTeam:        payload.myTeam,
    teams:         payload.teams,
    rosters:       payload.rosters,
    schedule:      payload.schedule,
    stand:         payload.stand,
    budget:        payload.budget,
    msgs:          payload.msgs          || [],
    phase:         payload.phase         || 'regular',
    objectives:    payload.objectives    || [],
    trainWeeks:    payload.trainWeeks    || 0,
    trainHistory:  payload.trainHistory  || [],
    lineup:        payload.lineup        || { formation: {}, convocati: [] },
    poTeams:       payload.poTeams       || null,
    ploTeams:      payload.ploTeams      || null,
    relegated:     payload.relegated     || null,
    poBracket:     payload.poBracket     || null,
    plBracket:     payload.plBracket     || null,
    playoffResult: payload.playoffResult || null,
    // runtime — mai serializzati
    ms:            null,
    _selTrain:     null,
    _mercList:     [],
    savedLineup:   payload.savedLineup || null,
    transferList:  payload.transferList  || [],
    marketPool:    payload.marketPool    || [],
    ledger:        payload.ledger        || [],
    prevPos:       payload.prevPos       || null,
    stars:         payload.stars         !== undefined ? payload.stars : 5,
    pendingPurchases: payload.pendingPurchases || [],
    seasonHistory: payload.seasonHistory  || [],
    seasonNumber:  payload.seasonNumber   || 1,
    tactic:        payload.tactic         || 'balanced',
    _newsPage:     payload._newsPage      || 0,
    stadium:       payload.stadium          || null,
    _currentSlot:  null,
  };
}

// ── Auto-save nello slot corrente ─────────────
// Usato internamente dal gioco dopo ogni azione
// rilevante (fine partita, acquisto, allenamento…).
// Se G._currentSlot è null usa il primo slot libero.
function autoSaveToCurrentSlot(G) {
  let slot = G._currentSlot;
  if (slot === null || slot === undefined) {
    // Primo slot davvero vuoto, altrimenti slot 0.
    // "Libero" vuol dire empty e basta: uno slot legacy o corrotto contiene
    // ancora dati e non va silenziosamente sovrascritto da un autosave, scegliendo
    // lo slot 0 per disperazione. Se nessuno e' vuoto finisce su slot 0, che e'
    // gia' il comportamento di prima, ma con l'intento dichiarato.
    slot = 0;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (inspectSlot(i).state === SLOT_EMPTY) { slot = i; break; }
    }
  }
  const result = saveToSlot(G, slot);
  if (result.ok) G._currentSlot = slot;
  return result;
}
