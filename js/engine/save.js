
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

const SAVE_VERSION = 3;
const TOTAL_SLOTS  = 3;
const SLOT_PREFIX  = 'wp_slot_';

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
// Ritorna oggetto meta oppure null se slot vuoto/corrotto.
function readSlotMeta(slotIndex) {
  try {
    const raw = localStorage.getItem(_slotKey(slotIndex));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.version < 2) return null; // accetta v2 e v3
    return { ...p.meta, savedAt: p.savedAt };
  } catch (_) { return null; }
}

// ── Legge metadati di tutti gli slot ─────────
// Ritorna array[3] di meta|null
function readAllSlotsMeta() {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => readSlotMeta(i));
}

// ── Migra payload v2 → v3 ────────────────────
function _migratePayload(p) {
  if (!p) return null;
  // v2 → v3: aggiungi marketPool e savedAtMs
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

// ── Carica payload completo di uno slot ───────
// Accetta v2 (con migrazione automatica) e v3.
// Ritorna payload o null se vuoto/corrotto.
function loadFromSlot(slotIndex) {
  try {
    const raw = localStorage.getItem(_slotKey(slotIndex));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p) return null;
    // Accetta v2 e v3; versioni più vecchie incompatibili
    if (p.version < 2) {
      console.warn('[save] versione slot', slotIndex, 'troppo vecchia — scartato');
      return null;
    }
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

// ── Verifica se almeno uno slot è occupato ────
function hasAnySave() {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => readSlotMeta(i)).some(Boolean);
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
    // Primo slot libero, altrimenti slot 0
    slot = 0;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (!readSlotMeta(i)) { slot = i; break; }
    }
  }
  const result = saveToSlot(G, slot);
  if (result.ok) G._currentSlot = slot;
  return result;
}
