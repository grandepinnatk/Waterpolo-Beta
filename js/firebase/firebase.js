// ─────────────────────────────────────────────
// js/firebase/firebase.js
// Inizializzazione Firebase SDK (Realtime Database + Auth)
// ─────────────────────────────────────────────

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, setPersistence,
         browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase }             from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const firebaseConfig = {
  apiKey:            "AIzaSyB1n1NSMS7LMmghRCWko5qwosqWbIPebp8",
  authDomain:        "waterpolo-manager-3a673.firebaseapp.com",
  databaseURL:       "https://waterpolo-manager-3a673-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "waterpolo-manager-3a673",
  storageBucket:     "waterpolo-manager-3a673.firebasestorage.app",
  messagingSenderId: "1046960520210",
  appId:             "1:1046960520210:web:38471ef4626ab32275eccb"
};

// Nome univoco per isolare la sessione da altri progetti Firebase sullo stesso browser
export const app  = initializeApp(firebaseConfig, 'waterpolo-app');
export const auth = getAuth(app);
export const db   = getDatabase(app);

// Persistenza locale esplicita
setPersistence(auth, browserLocalPersistence).catch(e =>
  console.warn('[Firebase] setPersistence error:', e)
);
