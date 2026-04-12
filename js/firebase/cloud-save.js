// ─────────────────────────────────────────────
// js/firebase/cloud-save.js
// Sync salvataggi: localStorage ↔ Firebase RTDB
//
// Struttura RTDB:
//   saves/{uid}/slot_0   ← payload JSON del gioco
//   saves/{uid}/slot_1
//   saves/{uid}/slot_2
//
// Esposto su window.CloudSave per compatibilità
// con il resto del gioco (vanilla JS, no modules)
// ─────────────────────────────────────────────

import { auth, db }  from './firebase.js';
import { ref, set, get, remove }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const SLOT_PREFIX = 'wp_slot_';   // stesso prefisso di save.js
const TOTAL_SLOTS = 3;

// ── Riferimento RTDB per lo slot N dell'utente corrente ──
function _ref(slotN) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non autenticato');
  return ref(db, `saves/${uid}/slot_${slotN}`);
}

// ── Legge un singolo slot da RTDB → stringa JSON (o null) ──
async function cloudRead(slotN) {
  try {
    const snap = await get(_ref(slotN));
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    console.warn('[CloudSave] read error slot', slotN, e);
    return null;
  }
}

// ── Scrive un singolo slot su RTDB ──
async function cloudWrite(slotN, jsonStr) {
  try {
    await set(_ref(slotN), jsonStr);
    return true;
  } catch (e) {
    console.warn('[CloudSave] write error slot', slotN, e);
    return false;
  }
}

// ── Cancella un singolo slot da RTDB ──
async function cloudDelete(slotN) {
  try {
    await remove(_ref(slotN));
    return true;
  } catch (e) {
    console.warn('[CloudSave] delete error slot', slotN, e);
    return false;
  }
}

// ── Estrae il timestamp ms da un payload JSON ──
function _getTimestamp(json) {
  if (!json) return 0;
  try {
    const p = JSON.parse(json);
    // Prima prova savedAtMs (più affidabile), poi savedAt ISO
    if (p.savedAtMs) return p.savedAtMs;
    if (p.meta?.savedAtMs) return p.meta.savedAtMs;
    if (p.savedAt) return new Date(p.savedAt).getTime();
    if (p.meta?.savedAt) return new Date(p.meta.savedAt).getTime();
    return 0;
  } catch (_) { return 0; }
}

// ── Sync al login: scarica cloud → localStorage (cloud vince se più recente) ──
export async function syncOnLogin() {
  if (!auth.currentUser) return;
  let downloaded = 0, uploaded = 0;
  const uid = auth.currentUser.uid;

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    let cloudJson, localJson;
    try {
      cloudJson = await cloudRead(i);
      localJson = localStorage.getItem(SLOT_PREFIX + i);
    } catch (e) {
      console.warn(`[CloudSave] Errore lettura slot ${i}:`, e);
      continue;
    }

    if (!cloudJson && !localJson) {
      console.log(`[CloudSave] Slot ${i}: vuoto su entrambi`);
      continue;
    }

    if (cloudJson && !localJson) {
      // Controlla se è un marcatore di cancellazione
      try {
        const parsed = JSON.parse(cloudJson);
        if (parsed._deleted) {
          console.log(`[CloudSave] Slot ${i}: marcatore cancellazione — slot vuoto`);
          continue; // non ripristinare lo slot cancellato
        }
      } catch(e) {}
      console.log(`[CloudSave] Slot ${i}: cloud → locale (nuovo dispositivo)`);
      localStorage.setItem(SLOT_PREFIX + i, cloudJson);
      downloaded++;
      continue;
    }

    if (!cloudJson && localJson) {
      console.log(`[CloudSave] Slot ${i}: locale → cloud (primo upload)`);
      await cloudWrite(i, localJson);
      uploaded++;
      continue;
    }

    // Entrambi hanno dati → usa savedAtMs per confronto preciso
    const cloudTime = _getTimestamp(cloudJson);
    const localTime = _getTimestamp(localJson);

    console.log(`[CloudSave] Slot ${i}: cloud=${cloudTime} locale=${localTime}`);

    // Controlla se il cloud ha un marcatore di cancellazione
    let cloudIsDeleted = false;
    try { cloudIsDeleted = JSON.parse(cloudJson)._deleted === true; } catch(e) {}

    if (cloudIsDeleted && cloudTime > localTime) {
      // La cancellazione cloud è più recente del salvataggio locale → rispetta la cancellazione
      console.log(`[CloudSave] Slot ${i}: cancellazione cloud più recente → rimuovo locale`);
      localStorage.removeItem(SLOT_PREFIX + i);
      downloaded++;
    } else if (cloudIsDeleted && localTime >= cloudTime) {
      // Il salvataggio locale è più recente della cancellazione → ripristina sul cloud
      console.log(`[CloudSave] Slot ${i}: salvataggio locale più recente della cancellazione → carico`);
      await cloudWrite(i, localJson);
      uploaded++;
    } else if (cloudTime > localTime) {
      console.log(`[CloudSave] Slot ${i}: cloud più recente → scarico`);
      localStorage.setItem(SLOT_PREFIX + i, cloudJson);
      downloaded++;
    } else if (localTime > cloudTime) {
      console.log(`[CloudSave] Slot ${i}: locale più recente → carico`);
      await cloudWrite(i, localJson);
      uploaded++;
    } else {
      console.log(`[CloudSave] Slot ${i}: identici, nessuna azione`);
    }
  }

  console.log(`[CloudSave] Sync completato: ${downloaded} scaricati, ${uploaded} caricati`);
}

// ── Salva uno slot sia su localStorage che su cloud ──
export async function saveSlot(slotN, jsonStr) {
  localStorage.setItem(SLOT_PREFIX + slotN, jsonStr);
  if (auth.currentUser) {
    await cloudWrite(slotN, jsonStr);
  }
}

// ── Cancella uno slot da localStorage e cloud ──
// Scrive un marcatore di cancellazione con timestamp così altri dispositivi
// non riscaricano il vecchio salvataggio al prossimo login
export async function deleteSlot(slotN) {
  localStorage.removeItem(SLOT_PREFIX + slotN);
  if (auth.currentUser) {
    // Marcatore tombstone: il cloud sa che lo slot è stato cancellato deliberatamente
    const tombstone = JSON.stringify({ _deleted: true, savedAtMs: Date.now() });
    try {
      await cloudWrite(slotN, tombstone);
    } catch(e) {
      // Fallback: prova a cancellare direttamente
      await cloudDelete(slotN).catch(() => {});
    }
  }
}

// ── Espone tutto su window.CloudSave ──────────
window.CloudSave = {
  syncOnLogin,
  saveSlot,
  deleteSlot,
  isLoggedIn: () => !!auth.currentUser,
};

console.log('[CloudSave] Modulo caricato');
