# Waterpolo Manager

**Versione:** 0.7.1-beta  
**Campionato:** Serie A1 Maschile — Stagione 2025/26  
**Piattaforma:** Browser (HTML5 + CSS3 + JavaScript vanilla)  
**Dipendenze:** Firebase Auth + Realtime Database (autenticazione e sync cloud)  
**Lingue:** 🇮🇹 Italiano · 🇬🇧 English

---

## Cos'è

Waterpolo Manager è un gioco manageriale di pallanuoto ispirato a Championship Manager. Il giocatore assume il ruolo di allenatore di una delle 14 squadre della Serie A1 italiana e guida il club attraverso una stagione completa: dalla gestione della rosa, degli allenamenti e del mercato, alle convocazioni prima di ogni partita, fino a playoff, playout e gestione dello stadio.

Le partite sono giocabili in modalità live con una vasca animata su Canvas HTML5, dove i token mostrano nome, numero di maglia e cartellini, e il pallone si sposta in tempo reale seguendo le azioni di gioco.

---

## Come si gioca

1. Aprire `index.html` in un browser moderno (Chrome, Firefox, Safari, Edge)
2. Scegliere la lingua dal menu a tendina nella lobby (🇮🇹 Italiano / 🇬🇧 English) — la scelta viene ricordata
3. Accedere o registrarsi con Firebase (opzionale — il gioco funziona anche offline)
4. Scegliere una squadra e premere **Nuova Carriera**
5. Ogni giornata: allenare la rosa, scegliere i convocati e giocare o simulare la partita
6. Gestire il mercato: mettere giocatori in vendita, fare offerte, rinnovare contratti
7. Sviluppare lo stadio per aumentare le entrate match-day
8. Al termine della regular season (26 giornate), affrontare playoff e playout

> Il gioco funziona **offline** e non richiede alcun server. Il salvataggio cloud è disponibile solo con account Firebase.

---

## Struttura del progetto

```
waterpolo/
├── index.html                  ← Entry point — carica tutto in ordine
├── campo-per-pallanuoto.jpg    ← Immagine campo (usata nel tab Stadio)
├── img_tribuna.svg             ← Illustrazione tribuna (tab Stadio)
├── img_curva.svg               ← Illustrazione curva (tab Stadio)
├── img_gru.svg                 ← Icona gru cantiere (tab Stadio)
├── css/
│   └── styles.css              ← Tutti gli stili + temi (Classic/Chiaro/Scuro)
└── js/
    ├── i18n/
    │   ├── i18n.js             ← Modulo i18n: t(), setLang(), getSavedLang()
    │   ├── it.js               ← Dizionario italiano (~700 chiavi)
    │   └── en.js               ← Dizionario inglese (~700 chiavi)
    ├── data/
    │   ├── teams.js            ← 14 squadre con forza, budget, tier
    │   ├── names.js            ← Nomi italiani per generazione procedurale
    │   ├── positions.js        ← Posizioni in vasca
    │   ├── training.js         ← Tipi di allenamento e effetti
    │   └── objectives.js       ← Obiettivi stagionali per tier (S/A/B/C)
    ├── engine/
    │   ├── generator.js        ← Generazione: giocatori, rose, calendario
    │   ├── standings.js        ← Classifica, simulazione risultati
    │   ├── match.js            ← Motore partita: eventi, timer, infortuni, cambi
    │   └── save.js             ← Salvataggio a 3 slot (localStorage + Firebase)
    ├── canvas/
    │   ├── pool.js             ← Rendering vasca, token, pallone
    │   └── movement.js         ← Fisica e interpolazione movimento (MovementController)
    ├── firebase/
    │   ├── firebase.js         ← Configurazione Firebase
    │   ├── auth.js             ← Autenticazione utente
    │   └── cloud-save.js       ← Sync localStorage ↔ Firebase RTDB
    ├── ui/
    │   ├── tabs.js             ← Navigazione tab, header, selettore lingua topbar
    │   ├── welcome.js          ← Lobby: selezione squadra, slot, selettore lingua
    │   ├── lineup.js           ← Convocazioni, formazione, numeri di maglia
    │   ├── match.js            ← Partita live: controlli, cambi, rigori, fine partita
    │   └── tabs_renderers.js   ← Renderer di tutti i tab del gioco
    └── main.js                 ← Stato globale G, logica playoff/playout/stadio, utility
```

---

## Stato globale G

```javascript
G = {
  myId, myTeam, teams,          // squadre
  rosters,                       // { teamId: [player, ...] }
  schedule, stand,               // calendario e classifica
  budget, phase, msgs,           // stato generale
  objectives, trainWeeks, stars, // progressione e token allenamento
  lineup,                        // convocati, formazione, numeri maglia
  transferList, marketPool,      // mercato
  pendingPurchases, ledger,      // offerte in sospeso e contabilità
  poBracket, plBracket,          // bracket playoff/playout
  seasonHistory, seasonNumber,   // storico stagioni
  stadium,                       // sezioni, livelli, costruzioni, biglietto
  tactic, _newsPage,             // tattica e paginazione notizie
  lang,                          // lingua attiva ('it' | 'en')
  ms,                            // stato partita live (non serializzato)
}
```

---

## Funzionalità — v0.7-beta

### Internazionalizzazione (i18n)
- Due lingue complete: 🇮🇹 Italiano e 🇬🇧 English
- Selettore lingua nella lobby (dropdown) e nella topbar di gioco (box 🇮🇹/🇬🇧 cliccabile)
- Lingua salvata in `localStorage['wp_lang']` — ricordata tra sessioni
- Architettura modulare: dizionari separati per lingua, funzione globale `t(key, vars)` con interpolazione `{{var}}`
- Traduzione completa di: UI, popup, notifiche, badge, messaggi di sistema, tooltip

### Campionato
- 14 squadre della Serie A1 2025/26 con budget, tier (S/A/B/C) e forza reale
- Girone unico andata e ritorno (26 giornate)
- Playoff scudetto (top 4): semifinali + finale
- Play-out retrocessione (11°–13°): semifinale + finale
- Retrocessione diretta (14°)
- Supplementari + rigori in playoff/playout con selezione rigoristi
- Fasce/tier ricalcolate ogni stagione (pos 50%, OVR 35%, budget 15%)

### Rosa e giocatori
- Rosa da 15–18 giocatori per squadra, generati proceduralmente
- Ruoli: POR, CEN, DIF, ATT, CB — con secondo ruolo opzionale
- Attributi: OVR, Forma, Morale, Età, Mano (R/L/AMB), Nazionalità
- Attributi tecnici: ATT, DIF, VEL, STR, TEC, RES
- Attributi nascosti: potenziale, fragilità, ambizione, età di ritiro
- Statistiche stagionali e di carriera con voti ultimi 4 match

### Posizioni in vasca

| Slot | Ruolo ufficiale |
|------|----------------|
| GK   | Portiere |
| 1    | Ala destra (RW) |
| 2    | Difensore destro |
| 3    | Centro |
| 4    | Difensore sinistro |
| 5    | Ala sinistra (LW) |
| 6    | Centroboa (CB) |

### Convocazioni e formazione
- Campo interattivo con 7 slot titolari + 6 riserve (13 convocati max)
- Numeri di maglia personalizzabili
- Auto-formazione per ruolo, forma e morale
- Selezione rigoristi con ordine di battuta

### Partita live
- Vasca animata su Canvas HTML5 — 4 periodi × 8 minuti
- Token con cognome, numero, cartellini 🟡🟡🔴
- 5 velocità: 1x · 2x · 10x · 15x · 20x
- 5 tattiche in tempo reale
- Cambi con pannello dedicato (pausa automatica per giocatori esauriti)
- Supplementari automatici + rigori con log tiro per tiro e sudden death

### Infortuni
- Live: stamina <15% + forma <65% → probabilità proporzionale a `injProb`
- Simulati: `min(0.24, injProb × 1.6)` per partita
- Recupero: 1–6 giornate (live) / 1–4 (simulato)

### Espulsioni temporanee
- 🟡🟡🔴 — 3ª espulsione = definitiva + cambio forzato

### Allenamento
- 8 tipi di sessione con effetti su fitness, morale e attributi
- Costo in ⭐ stelle + budget opzionale
- Decadimento forma senza allenamento: −1.15/gg (U24) · −2.30 (24–28) · −3.45 (29–32) · −4.60 (Over32)

### Mercato
- Pool dinamico di 16 giocatori aggiornato ogni giornata
- Rinnovi contrattuali, rescissioni, vendite
- Badge RIT · SCAD · INF
- Offerte da finalizzare disponibili per 1 giornata

### Nazionale
- Convocazioni casuali durante la stagione con popup coriandoli
- Giocatori convocati (`_national`) non disponibili per la partita successiva
- Badge NAZ visibile in rosa e convocazioni

### Sistema notifiche popup

Dopo ogni giornata simulata, i messaggi generati vengono classificati per categoria e mostrati come popup sequenziali nell'ordine seguente:

| # | Categoria | catId | Tipo popup | Disabilitabile |
|---|-----------|-------|------------|----------------|
| 1 | Risultato | `result` | Strutturato (punteggio, marcatori, premi) | ✅ |
| 2 | Infortuni | `injuries` | Lista messaggi infortuni della giornata | ✅ |
| 3 | Recupero | `recovery` | Lista giocatori rientrati dalla lesione | ✅ |
| 4 | Nazionale | `national` | Strutturato (giocatori convocati, flag) | ✅ |
| 5 | Contratto | `contract` | Lista rinnovi accettati/rifiutati | ✅ |
| 6 | Mercato | `market` | Offerte strutturate o lista messaggi | ✅ |
| 7 | Finanza | `finance` | Lista transazioni (ingaggi, incassi) | ✅ |
| 8 | Playoff | `playoff` | Lista avanzamenti/retrocessioni | ✅ |
| 9 | Notizie | `news` | Lista notizie generiche residue | ✅ |

> L'allenamento (`training`) ha un popup dedicato che si apre immediatamente dopo il click su "Allena" — non fa parte della coda post-giornata.

**Regola di sequenza:** ogni popup, alla chiusura, chiama `_nextPopupInQueue()` che processa il successivo elemento della coda. Se una categoria è disabilitata nelle impostazioni (⚙️ Config → Notifiche popup), viene saltata senza interrompere la sequenza.

**Configurazione:** il pannello ⚙️ Config nella topbar consente di abilitare/disabilitare ogni categoria individualmente. Le preferenze vengono salvate in `localStorage['wp_config']` con versioning (`CFG_VERSION`) per gestire reset automatici tra aggiornamenti.

**Implementazione:**
- Coda: `G._popupQueue` — array di `{ catId, data?, msgs? }` costruito in `simNextRound()`
- Dispatcher: `_nextPopupInQueue()` in `main.js`
- Popup strutturati: `_showSimResultPopup()`, `_showNationalPopup()`, `_showOfferPopupQueue()`
- Popup testo: `_showMsgCategoryPopup(catId, msgs)` in `tabs_renderers.js`


### Morale
- Aggiornato dopo partite, hat-trick, panchina, infortuni, mercato
- Alert morale critico (<30) nelle notizie

### Dashboard
- Stat bar: Posizione · Punti · V/P/S · Budget
- Matchday Hub con prossima partita e bottoni Convocazioni / Simula
- Feed notizie con 9 badge colorati (bilingue)
- Focus Giocatore e Top Scorer stagionale

### Temi grafici
- 🎨 Classic · ☀️ Chiaro · 🌙 Scuro — salvato in localStorage

### Salvataggio
- 3 slot localStorage con auto-save
- Sync cloud Firebase RTDB con timestamp `savedAtMs`

---

## Schede allenamento per ruolo

### Formula OVR (media ponderata attributi)

| Ruolo | ATT | DIF | VEL | STR | TEC | RES |
|-------|-----|-----|-----|-----|-----|-----|
| ATT   | **35%** | 5% | **20%** | 15% | 15% | 10% |
| DIF   | 10% | **35%** | 15% | **20%** | 10% | 10% |
| CEN   | 20% | 20% | **20%** | 15% | 15% | 10% |
| CB    | **25%** | 15% | **20%** | 15% | 15% | 10% |
| POR   | 5%  | **30%** | 15% | **20%** | 15% | **15%** |

### Attributi prioritari per ruolo

| Ruolo | Priorità 1 | Priorità 2 | Priorità 3 |
|-------|-----------|-----------|-----------|
| ATT | ATT (35%) | VEL (20%) | TEC/STR (15%) |
| DIF | DIF (35%) | STR (20%) | VEL (15%) |
| CEN | ATT/DIF/VEL (20% ciascuno) | STR (15%) | TEC (15%) |
| CB  | ATT (25%) | VEL (20%) | TEC (15%) |
| POR | DIF (30%) | STR (20%) | RES/TEC (15%) |

### Efficacia allenamenti per ruolo

> **Progressione attributi tecnici:** ogni punto di guadagno ha il 50% di probabilità di essere applicato, dimezzando la crescita media rispetto al valore nominale.

| Allenamento | Costo | Effetti | Ruoli coinvolti | ΔOVR medio per sessione |
|-------------|-------|---------|-----------------|------------------------|
| 💪 Preparazione Atletica | 15k | fitness+8, att+1, def+1, spe+1, str+1, res+1 | Tutti | ~8 uniforme |
| 🎯 Attacco | 12k | att+4, spe+2 | ATT, CB, CEN, DIF, POR | **ATT +19**, CB +15, CEN +13, DIF +8, POR +6 |
| 🛡️ Difesa | 12k | def+4, str+2 | ATT, CB, CEN, DIF *(esclude POR)* | **DIF +19**, CEN +13, CB +11, ATT +7 |
| 📋 Tattica | 12k | att+2, def+2, spe+1, str+1 | Tutti | ~11 uniforme |
| 🥅 Allenamento Portieri | 10k | def+3, str+2, tec+1, res+1 | **Solo POR** | POR ~15 |
| 🤽 Tecnica | 14k | tec+5, spe+1 | Tutti | ~8 uniforme |
| 🏖️ Riposo e Recupero | 0 | fitness+12, morale+8 | Tutti | 0 (nessun attributo tecnico) |
| 🏊 Resistenza | 13k | res+4, str+2, fitness+3 | Tutti | ~7 uniforme |

**Regole di esclusione ruolo:**
- `gk` (Allenamento Portieri) → applicato **esclusivamente ai POR**; i giocatori di movimento vengono saltati
- `defense` (Allenamento Difesa) → applicato a tutti **eccetto i POR**; per i portieri usare l'allenamento dedicato

### Stamina e tattica

| Tattica | Drain | Indicato per |
|---------|-------|-------------|
| Difensiva | ×0.70 | Proteggere il vantaggio |
| Bilanciata | ×1.00 | Default |
| Contropiede | ×1.10 | Rosa veloce con VEL alta |
| Attacco | ×1.30 | Rimontare |
| Pressing | ×1.60 | Emergenza (breve periodo) |

Con uomo in meno: forza ridotta del **20% moltiplicativo** per giocatore mancante, drain degli altri +25%.

---

## Note tecniche

- Nessun framework, nessun bundler — vanilla JS con caricamento ordinato degli script
- `G.ms` non è mai serializzato (contiene handle di animazione Canvas)
- Separazione: `engine/` (logica pura) · `ui/` (solo DOM) · `canvas/` (animazione) · `i18n/` (traduzioni)
- Compatibile con Chrome, Firefox, Safari, Edge

---

## Licenza

Progetto sperimentale — uso personale e didattico.  
Dati squadre e classifiche: Serie A1 Pallanuoto FIN 2025/26.
