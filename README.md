# Waterpolo Manager

**Versione:** 0.6.21 beta  
**Campionato:** Serie A1 Maschile — Stagione 2025/26  
**Piattaforma:** Browser (HTML5 + CSS3 + JavaScript vanilla)  
**Dipendenze:** Firebase Auth + Realtime Database (autenticazione e sync cloud)

---

## Cos'è

Waterpolo Manager è un gioco manageriale di pallanuoto ispirato a Championship Manager. Il giocatore assume il ruolo di allenatore di una delle 14 squadre della Serie A1 italiana e guida il club attraverso una stagione completa: dalla gestione della rosa, degli allenamenti e del mercato, alle convocazioni prima di ogni partita, fino a playoff, playout e gestione dello stadio.

Le partite sono giocabili in modalità live con una vasca animata su Canvas HTML5, dove i token mostrano nome, numero di maglia e cartellini del giocatore, e il pallone si sposta in tempo reale seguendo le azioni di gioco.

---

## Come si gioca

1. Aprire `index.html` in un browser moderno (Chrome, Firefox, Safari, Edge)
2. Accedere o registrarsi con Firebase (opzionale — il gioco funziona anche offline)
3. Scegliere una squadra e premere **Nuova Carriera**
4. Ogni giornata: allenare la rosa, scegliere i convocati e giocare o simulare la partita
5. Gestire il mercato: mettere giocatori in vendita, fare offerte, rinnovare contratti
6. Sviluppare lo stadio per aumentare le entrate match-day
7. Al termine della regular season (26 giornate), affrontare playoff e playout

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
    ├── data/
    │   ├── teams.js            ← 14 squadre con forza, budget, tier
    │   ├── names.js            ← Nomi italiani per generazione procedurale
    │   ├── positions.js        ← Posizioni in vasca
    │   ├── training.js         ← Tipi di allenamento e effetti
    │   └── objectives.js       ← Obiettivi stagionali per tier (S/A/B/C)
    ├── engine/
    │   ├── generator.js        ← Generazione: giocatori, rose, calendario
    │   ├── standings.js        ← Classifica, simulazione risultati, selezione rosa simulata
    │   ├── match.js            ← Motore partita: eventi, timer, infortuni, cambi
    │   └── save.js             ← Salvataggio a 3 slot (localStorage + Firebase)
    ├── canvas/
    │   ├── pool.js             ← Rendering vasca, token, pallone
    │   └── movement.js         ← Fisica e interpolazione movimento
    ├── firebase/
    │   ├── firebase.js         ← Configurazione Firebase
    │   ├── auth.js             ← Autenticazione utente
    │   └── cloud-save.js       ← Sync localStorage ↔ Firebase RTDB
    ├── ui/
    │   ├── tabs.js             ← Navigazione tab, aggiornamento header
    │   ├── welcome.js          ← Lobby: selezione squadra, slot di salvataggio
    │   ├── lineup.js           ← Convocazioni, formazione, numeri di maglia
    │   ├── match.js            ← Partita live: controlli, cambi, rigori, fine partita
    │   └── tabs_renderers.js   ← Renderer di tutti i tab del gioco
    └── main.js                 ← Stato globale G, logica playoff/playout/stadio, utility
```

---

## Stato globale G

```
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
  stadium,                       // stadio: sezioni, livelli, costruzioni, biglietto
  tactic, _newsPage,             // tattica e paginazione notizie
  ms,                            // stato partita live (non serializzato)
}
```

---

## Funzionalità — v0.6.21 beta

### Campionato
- 14 squadre della Serie A1 2025/26 con budget, tier (S/A/B/C) e forza reale
- Girone unico andata e ritorno (26 giornate)
- Playoff scudetto (top 4): semifinali + finale
- Play-out retrocessione (11°–13°): semifinale + finale; il vincitore "Si salva"
- Retrocessione diretta (14°)
- Parità in playoff/playout: supplementari → rigori con selezione rigoristi
- Fasce/tier ricalcolate ogni stagione (pos 50%, OVR 35%, budget 15%)

### Rosa e giocatori
- Rosa da 15–18 giocatori per squadra, generati proceduralmente con nomi italiani
- Ruoli: POR, CEN, DIF, ATT, CB — con secondo ruolo opzionale (mostrato affiancato)
- Attributi visibili: OVR, Forma (fitness), Morale, Età, Mano (R/L/AMB), Nazionalità
- Attributi tecnici: ATT, DIF, SPE, STR, TEC, RES
- Attributi nascosti: potenziale, fragilità (`injProb`), ambizione, età di ritiro
- Statistiche stagionali e di carriera: gol, assist, parate, presenze con voto
- Voti ultimi 4 match con sparkline

### Posizioni in vasca

| Slot | Ruolo |
|------|-------|
| GK   | Portiere |
| 2    | Difensore sinistro |
| 3    | Difensore centrale |
| 4    | Difensore destro |
| 5    | Centrocampista (CEN) |
| 6    | Attaccante |
| 7    | Centroboa (CB) |

### Convocazioni e formazione
- Campo visuale interattivo con 7 slot + 6 riserve
- 13 convocati con numeri di maglia (1–7 titolari, 8+ riserve)
- Auto-formazione per affinità di ruolo, forma e morale
- Selezione rigoristi (5 + ordine di battuta) prima dei tiri dal dischetto

### Partita live
- Vasca animata su Canvas HTML5
- Token con cognome, numero di maglia, indicatori 🟡🟡🔴
- Pallone animato con interpolazione fluida
- 4 periodi × 8 minuti — 5 velocità: 1x · 2x · 10x · 15x · 20x
- 5 tattiche selezionabili in tempo reale
- Cambi con pannello dedicato (pausa automatica)
- Supplementari automatici + popup rigori con log tiro per tiro e sudden death

### Infortuni
- Live: stamina <15% + forma <65% → `injProb / 3` per evento
- Simulati: `min(0.24, injProb × 1.6)` per partita
- Recupero: 1–6 giornate (live) / 1–4 (simulato)
- `injProb` nascosto: 0.02–0.15 con distribuzione esponenziale

### Espulsioni temporanee
- 🟡 con counter (1/3, 2/3) → 3ª espulsione = 🔴 definitiva + cambio forzato

### Allenamento
- 8 tipi di sessione con effetti su fitness, morale e attributi
- Costo in ⭐ stelle (4 per giornata) e opzionalmente in budget
- Decadimento forma senza allenamento: −1.15/gg (U24) · −2.30 (24–28) · −3.45 (29–32) · −4.60 (Over32)
- Griglia a 4 colonne, storico sessioni completate

### Mercato
- Pool dinamico di 16 giocatori (senza duplicati, aggiornato ogni giornata)
- Un'offerta per squadra (l'ultima sostituisce le precedenti)
- Trattativa con pulsanti +/- prezzo
- Rinnovi contrattuali con probabilità basata su morale, ambizione, OVR, età
- Badge RIT · SCAD (scadenza ≤1 anno) · INF
- Offerte da finalizzare: disponibili per 1 giornata dopo accettazione

### Sistema morale
- Aggiornato dopo ogni partita: risultato, hat-trick, panchina, non convocato, voto, infortuni
- Alert morale critico (<30) nelle notizie

### Dashboard
- Stat bar · grafico ciambella V/P/S · Matchday Hub · feed notizie con badge
- Alert contratti in scadenza con link diretto alla Rosa
- Focus Giocatore e Top Scorer stagionale

### Tab Rosa
- OVR cerchio SVG neon · morale emoji+% · forma cerchio SVG
- Badge ruolo primario + secondario affiancati · badge mano
- Ordinabile per Ruolo (POR→CEN→DIF→ATT→CB), Mano, Età, OVR, Forma, Gol, Assist, Valore
- Paginazione 20/pagina

### Tab Storico
- Tabella stagioni con fascia, piazzamento, rendimento, MVP stagionali
- Record del Club (marcatore, assistman, presenze)
- Record Storici (miglior stagione, miglior piazzamento, vittorie consecutive)

### Stadio
- Capienza base 2.000 posti; Tribuna +2.000/liv, Curva +1.000/liv
- 4 livelli per sezione — 150k/3gg · 280k/4gg · 450k/5gg · 700k/6gg
- Bar (+8%) e Shop (+12%) per sezione — richiedono Liv.1 minimo
- Incasso solo in casa; sezioni in costruzione non producono entrate
- Usura: riempimento >50% → probabilità calo livello (prima chiude bar/shop, poi scende di livello)
- Pianta SVG 2D interattiva con bottoni upgrade sulla mappa

### Temi grafici
- 🎨 Classic · ☀️ Chiaro · 🌙 Scuro — salvato in localStorage

### Salvataggio
- 3 slot localStorage con auto-save
- Sync cloud Firebase RTDB (timestamp `savedAtMs` per confronto preciso)
- Tutti i campi serializzati: stelle, storico, stadio, tattica, mercato, contratti

---

## Note tecniche

- Nessun framework, nessun bundler — vanilla JS con caricamento ordinato degli script
- `G.ms` non è mai serializzato (contiene handle di animazione Canvas)
- Separazione concettuale: `engine/` (logica pura) · `ui/` (solo DOM) · `canvas/` (animazione)
- Compatibile con Chrome, Firefox, Safari, Edge (Canvas API + localStorage)

---

## Licenza

Progetto sperimentale — uso personale e didattico.  
Dati squadre e classifiche: Serie A1 Pallanuoto FIN 2025/26.
