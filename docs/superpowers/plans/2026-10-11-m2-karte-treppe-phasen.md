# Meilenstein 2 – Schwellen-Karte, Ortswahl, Treppe, Phasen, simulierter Proband – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Training wählt Ort und Reizstärke adaptiv: Eine Schwellen-Karte des linken Halbfelds, eine Ortswahl an der Grenzzone, eine 2-down-1-up-Treppe je Region und die Phasensteuerung des Tons laufen in reiner Logik, sind mit einem simulierten Probanden abgenommen, werden über Sitzungen gespeichert und treiben den Trainingsbildschirm.

**Architecture:** Alle neuen Bausteine liegen in `src/core/` (rein, deterministisch, Zufall nur über `Rng`). `core/controller.ts` setzt sie zu einem Sitzungsplaner zusammen, der `TrialPlan`s liefert und `TrialRecord`s verarbeitet; sein Zustand (`ControllerState`) ist reines JSON und wird in IndexedDB (Schema v2) gespeichert. Die UI ersetzt den M1-Grundplaner durch den Controller und zeigt die Karte live auf der Testseite.

**Tech Stack:** wie M1 (Vite 8, TypeScript 5.9 strict, Preact 10, Vitest 5, idb 8, fake-indexeddb).

**Spec:** `docs/superpowers/specs/2026-10-11-sehtraining-design.md` (Abschnitte 7, 8, 9, 12 teilweise, 16, 17 Zeile M2). M1-Code ist Bestand: `src/core/{rng,geometry,stimulus,safety,trial,blocks,types}.ts`, `src/store/*`, `src/ui/*`.

## Global Constraints

- Alle Regeln aus dem M1-Plan gelten weiter (`docs/superpowers/plans/2026-10-11-m1-grundgeruest.md`, Global Constraints), insbesondere: `src/core/**` ohne DOM/Uhr/`Math.random`; Texte deutsch, Bezeichner englisch; Commit-Trailer.
- Schwellengitter θ = −1,0 bis 14,0 in Schritten von 0,5 (31 Werte); Werte > 11 = „mit keiner Stufe sichtbar“.
- Psychometrische Funktion: p = γ + (1 − γ − λ) / (1 + exp(−(L − θ)/s)), s = 1, λ = 0,04.
- γ: Beta(1, 19)-Prior, Mittelwert aus Durchgängen ohne Reiz (falscher Alarm = Erfolg).
- Glättung: w = exp(−d²/(2·4²)), d = `angularDistanceDeg`, w < 0,05 ignoriert; nur linke Punkte, nur linke Durchgänge.
- Vergessen zu Beginn jeder Sitzung: Log-Likelihoods × 0,5^(1/H), H Standard 7.
- Referenzstufe 6 (`REFERENCE_LEVEL`) für Heatmap und rechte Durchgänge.
- Ortswahl: Score = u · exp(−((p − 0,625)/0,15)²); 85 % proportional zum Score, 15 % gleichverteilt; kein Punkt zweimal direkt hintereinander; alle Scores 0 → gleichverteilt.
- Treppe: Regionen oben φ > +30°, Mitte −30° ≤ φ ≤ +30°, unten φ < −30°; 2-down-1-up; Schritt 2 bis zur ersten Umkehr, dann 1; Grenzen 0..11; Start 6. Zählt nur linke Durchgänge mit Reiz, ohne Falsch-Ton, ohne Vorwegnahme/Abbruch.
- Phasenstufen in Reihenfolge: `1, 2, 3a, 3b, 3c, 4a, 4b, 4c, 5`. SOA ab Phase 2: Ton 100–300 ms vor dem Licht (`soaMs` = −U(100, 300)). Pegel 3a −6, 3b −12, 3c −18, 4x −18 dB. Tonanteil 4a 75 %, 4b 50 %, 4c 25 %.
- Nur-Licht 10 % der linken Durchgänge in Phase 1–3; Falsch-Ton 10 % der linken Durchgänge ab Phase 2 (in Phase 4 nur unter den Durchgängen mit Ton).
- Wechselkriterium und Rückschritt exakt nach Spec 9 (siehe Task 4).
- Karte und Treppe werden nie von rechten Durchgängen, Durchgängen ohne Reiz, Vorwegnahmen oder Abbrüchen verändert.

## Review Focus

1. **Geometrie geändert nach Wochen Training** (neue Einrichtung mit anderem Abstand): Das Raster ändert sich. Erwartet: neue leere Karte, die alte bleibt als Snapshot erhalten, Treppe und Phase bleiben. → Test in Task 5 (`gridSignature`).
2. **Sehr lange Pause zwischen Sitzungen** (Urlaub, 3 Wochen): Vergessen wird pro Sitzung angewendet, nicht pro Tag. Erwartet: kein Absturz, Karte bleibt gültig; dokumentiert, dass Kalenderzeit nicht zählt. → Test in Task 1 (Vergessen über 100 Sitzungen bleibt endlich, Posterior normiert).
3. **Treppe am Rand** (blind: viele Fehlversuche hintereinander auf Stufe 11; oder alles gesehen auf Stufe 0): Erwartet: Stufe bleibt in 0..11, keine Umkehr-Zählung durch Klemmen. → Test in Task 2.
4. **Alter Datenbestand aus M1** (DB-Version 1, Export `sehtraining-export/1`, Trials ohne Treppenfelder): Erwartet: Migration ohne Datenverlust, Import alter Sicherungen funktioniert. → Tests in Task 7.
5. **Manuell gesetzte Phase im PIN-Bereich** (kommt in M3, Logik jetzt): Erwartet: Zähler zurückgesetzt, protokolliert, Sperre wie nach Rückschritt nicht nötig. → Test in Task 4 (`setStageManually`).

---

## Dateistruktur

```
src/core/map.ts          Schwellen-Karte (Task 1)
src/core/guessRate.ts    γ-Schätzung (Task 1)
src/core/staircase.ts    Treppe je Region (Task 2)
src/core/selector.ts     Ortswahl (Task 3)
src/core/phases.ts       Tonbedingungen und Phasenwechsel (Task 4)
src/core/controller.ts   Sitzungsplaner aus allem (Task 5)
src/core/sim.ts          simulierter Proband (Task 6)
src/core/blocks.ts       + export jitterPosition (Task 5)
src/core/types.ts        + TrialRecord.stairBefore/stairAfter (Task 5)
src/store/db.ts          Schema v2 (Task 7)
src/store/exportData.ts  Export v2, Import v1+v2 (Task 7)
src/ui/patient/TrainingScreen.tsx   Controller statt Grundplaner (Task 8)
src/ui/admin/MapView.tsx            SVG-Heatmap (Task 8)
src/ui/admin/TestPage.tsx           Live-Karte, Simulation (Task 8)
tests/core/{map,guessRate,staircase,selector,phases,controller,sim,acceptance}.test.ts
```

---

### Task 1: Schwellen-Karte und γ-Schätzung

**Files:**
- Create: `src/core/map.ts`, `src/core/guessRate.ts`
- Test: `tests/core/map.test.ts`, `tests/core/guessRate.test.ts`

**Interfaces:**
- Consumes: `VisualPos` (types), `angularDistanceDeg` (geometry), `GridPoint` (blocks), `REFERENCE_LEVEL` (stimulus)
- Produces:
  ```ts
  // map.ts
  export const THETA_GRID: readonly number[];          // -1, -0.5, …, 14 (31)
  export const PSY_SLOPE = 1; export const PSY_LAPSE = 0.04;
  export const KERNEL_SIGMA_DEG = 4; export const KERNEL_CUTOFF = 0.05; export const DEFAULT_HALF_LIFE_SESSIONS = 7;
  export function psychometric(level: number, theta: number, gamma: number): number;
  export interface MapState { points: GridPoint[]; logLik: number[][] /* [point][theta] */ }  // reines JSON
  export function createMap(points: GridPoint[]): MapState;            // nur linke Punkte; wirft bei rechten
  export function updateMap(m: MapState, obs: { pos: VisualPos; level: number; hit: boolean }, gamma: number): void; // in place; pos.side 'R' → keine Änderung
  export function forgetMap(m: MapState, halfLifeSessions: number): void;    // in place, × 0.5^(1/H)
  export function posterior(m: MapState, i: number): number[];          // normiert, Summe 1
  export interface PointSummary { thetaMean: number; thetaSd: number; p: number; pSd: number }
  export function summarizePoint(m: MapState, i: number, level: number, gamma: number): PointSummary; // p, pSd über Posterior
  // guessRate.ts
  export interface GuessRateState { falseAlarms: number; catchTrials: number }
  export const GUESS_PRIOR = { a: 1, b: 19 } as const;
  export function guessRate(s: GuessRateState): number;  // (a + fa) / (a + b + n)
  export function updateGuessRate(s: GuessRateState, falseAlarm: boolean): GuessRateState;
  ```
  Posterior numerisch stabil: vor `exp` das Maximum der Log-Gewichte abziehen.

- [ ] **Step 1: Failing tests (guessRate)** — leer → 0,05; nach 10 Durchgängen ohne Alarm → 1/30; nach 1 Alarm in 10 → 2/30; Update erzeugt neues Objekt.
- [ ] **Step 2: Failing tests (map)**
  ```ts
  it('THETA_GRID: 31 Werte von -1 bis 14', …);
  it('psychometric: bei L = θ genau γ + (1-γ-λ)/2; sehr hohe L → 1-λ; sehr niedrige → γ', () => {
    expect(psychometric(6, 6, 0.05)).toBeCloseTo(0.05 + 0.91 / 2);
    expect(psychometric(30, 0, 0.05)).toBeCloseTo(0.96, 3);
    expect(psychometric(-30, 0, 0.05)).toBeCloseTo(0.05, 3);
  });
  it('leere Karte: Posterior gleichverteilt, Mittel 6,5', …);
  it('Treffer auf Stufe 4 am Punkt senkt dort das Schwellenmittel; Fehlversuch hebt es', …);
  it('Nachbar in 5° bekommt schwächere Änderung als der Punkt selbst; Punkt in 12° unverändert', …);
  it('rechte Beobachtung verändert nichts', …);
  it('createMap wirft bei rechten Punkten', …);
  it('pSd sinkt mit Evidenz', …);       // 20 Treffer/Fehlversuche gemischt an einem Punkt
  it('Vergessen mit H = 1 halbiert die Log-Likelihoods', …);
  it('100× Vergessen + Updates: alle Werte endlich, Posterior summiert auf 1', …);
  it('MapState übersteht JSON.stringify/parse unverändert', …);
  ```
  Raster für die Tests: `gridPoints(makeGeometry({24, 30, 2/3, 0.5}, 1200, 800), 'L')`.
- [ ] **Step 3: Run → FAIL** (`npx vitest run tests/core/map.test.ts tests/core/guessRate.test.ts`)
- [ ] **Step 4: Implementieren**
- [ ] **Step 5: Run → PASS; `npm run typecheck`**
- [ ] **Step 6: Commit** `feat(core): Schwellen-Karte und Rate-Wahrscheinlichkeit`

---

### Task 2: Treppe je Region

**Files:**
- Create: `src/core/staircase.ts`
- Test: `tests/core/staircase.test.ts`

**Interfaces:**
- Consumes: `LEVEL_COUNT`, `REFERENCE_LEVEL`
- Produces:
  ```ts
  export type Region = 'upper' | 'middle' | 'lower';
  export const REGIONS: readonly Region[];
  export function regionOf(angleDeg: number): Region;        // > 30 upper, < -30 lower, sonst middle
  export interface StairState { level: number; hitStreak: number; reversals: number; lastDirection: -1 | 0 | 1 }
  export type StairSet = Record<Region, StairState>;
  export function createStairs(startLevel?: number): StairSet;  // Start REFERENCE_LEVEL
  export function updateStair(s: StairState, hit: boolean): StairState; // rein, neues Objekt
  ```
  Regel: Treffer → `hitStreak + 1`; bei 2 → Richtung −1 (leichter = niedrigere Stufe), Schritt, `hitStreak = 0`. Fehlversuch → Richtung +1, Schritt, `hitStreak = 0`. Schritt = 2 solange `reversals === 0`, sonst 1. Umkehr = neue Richtung ≠ `lastDirection` und `lastDirection ≠ 0` **und** die Stufe hat sich tatsächlich bewegt (Klemmen an 0/11 ist keine Bewegung und keine Umkehr; `lastDirection` bleibt dann unverändert).

- [ ] **Step 1: Failing tests**
  - `regionOf(31) 'upper'`, `regionOf(30) 'middle'`, `regionOf(-30) 'middle'`, `regionOf(-31) 'lower'`.
  - Start 6; Treffer, Treffer → 4 (Schritt 2); dann Fehlversuch → 6, `reversals 1`; dann Treffer, Treffer → 5 (Schritt 1).
  - Ein Treffer allein ändert nichts außer `hitStreak`.
  - 20 Fehlversuche ab 6 → 11, `reversals` bleibt 0 (Review Focus 3); danach 2 Treffer → 9 (noch Schritt 2), `reversals 1`.
  - 40 Treffer ab 6 → 0, nie < 0.
  - **Konvergenz:** simulierter Beobachter mit `psychometric(L, θ = 5, γ = 0.04)` (aus `map.ts`), 2000 Durchgänge, Seed 11 → Trefferquote ∈ [0.65, 0.76]; ebenso θ = 8, Seed 12.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `feat(core): 2-down-1-up-Treppe je Region`

---

### Task 3: Ortswahl

**Files:**
- Create: `src/core/selector.ts`
- Test: `tests/core/selector.test.ts`

**Interfaces:**
- Consumes: `MapState`, `summarizePoint`, `StairSet`, `regionOf`, `Rng`
- Produces:
  ```ts
  export const SELECT_TARGET_P = 0.625; export const SELECT_WIDTH = 0.15; export const SELECT_EPSILON = 0.15;
  export function selectionScores(m: MapState, stairs: StairSet, gamma: number): number[]; // je Punkt u·exp(-((p-0.625)/0.15)²), p/u bei Stufe der Region des Punkts
  export function choosePoint(m: MapState, stairs: StairSet, gamma: number, rng: Rng, lastIndex: number | null): number; // Index in m.points
  ```
- [ ] **Step 1: Failing tests**
  - Karte, in der ein Punkt durch konstruierte Beobachtungen p ≈ 0,6 bei seiner Stufe und hohe Unsicherheit hat, alle anderen p ≈ 0 oder ≈ 1 mit kleiner Unsicherheit (je 60 eindeutige Beobachtungen): dieser Punkt wird in ≥ 60 % von 2000 Ziehungen gewählt (Seed 3).
  - Über 2000 Ziehungen auf einer leeren Karte wird jeder Punkt mindestens einmal gewählt.
  - `choosePoint(..., lastIndex = k)` liefert nie k (über 500 Ziehungen, auch wenn k der beste Punkt ist).
  - Alle Scores 0 (Karte mit allen Punkten sicher blind) → Ziehungen ungefähr gleichverteilt (jeder Punkt ≥ 1 % bei 5000 Ziehungen).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `feat(core): Ortswahl an der Grenzzone`

---

### Task 4: Phasen – Tonbedingungen und Wechselkriterium

**Files:**
- Create: `src/core/phases.ts`
- Test: `tests/core/phases.test.ts`

**Interfaces:**
- Consumes: `Rng`, `SoundCondition`, `TrialKind`
- Produces:
  ```ts
  export type Stage = '1' | '2' | '3a' | '3b' | '3c' | '4a' | '4b' | '4c' | '5';
  export const STAGES: readonly Stage[];
  export const LIGHT_ONLY_SHARE = 0.1; export const WRONG_SIDE_SHARE = 0.1;
  export interface SoundAssignment { sound: SoundCondition; soaMs: number; soundGainDb: number }
  export function assignSound(stage: Stage, kind: TrialKind, rng: Rng): SoundAssignment;
  export interface SessionSummary { stage: Stage; durationMin: number; meanLeftLevel: number; leftHitRate: number /* ohne Falsch-Ton, ohne Vorwegnahme/Abbruch */ }
  export interface PhaseState { stage: Stage; sessionsInStage: number; levelBeforeChange: number | null; sessionsSinceChange: number; lockSessions: number; history: SessionSummary[] /* nur aktuelle Stufe */ ; log: Array<{ atIso: string; from: Stage; to: Stage; reason: 'advance' | 'regress' | 'manual' }> }
  export const MIN_SESSION_MIN = 10;
  export function createPhaseState(): PhaseState;   // Stufe '1'
  export function evaluatePhase(s: PhaseState, summary: SessionSummary, atIso: string): PhaseState; // rein
  export function setStageManually(s: PhaseState, stage: Stage, atIso: string): PhaseState;
  ```
  `assignSound` – links:
  - `1`: 10 % `none`, sonst `sync` (SOA 0, 0 dB).
  - `2`/`3x`: 10 % `none`; 10 % `wrongSide`; sonst `lead`. `lead` und `wrongSide` mit SOA −U(100, 300), Pegel 0 / −6 / −12 / −18.
  - `4x`: mit Tonanteil q (0,75 / 0,5 / 0,25) Ton, sonst `none`; unter den Tondurchgängen 10 % `wrongSide`; Ton mit SOA −U(100, 300), −18 dB.
  - `5`: `none`.
  Rechts: wie links, aber ohne `none`-Zusatzanteil und ohne `wrongSide` (Phase 1 `sync`, 2/3 `lead`, 4 Tonanteil q, 5 `none`). `catch`: immer `none`, SOA 0, 0 dB.
  `evaluatePhase` – Reihenfolge:
  1. Sitzungen mit `durationMin < 10` zählen nicht (Zustand unverändert zurück).
  2. `history += summary`, `sessionsInStage += 1`, `sessionsSinceChange += 1`, `lockSessions = max(0, lockSessions − 1)`.
  3. **Rückschritt** (nicht in Stufe `1`, nur wenn `levelBeforeChange !== null`): die letzten 3 Einträge in `history` haben alle `meanLeftLevel > levelBeforeChange + 2.0` → eine Stufe zurück, `reason 'regress'`, `lockSessions = 3`, `levelBeforeChange = null`, `history = []`, `sessionsInStage = 0`.
  4. **Wechsel** (nicht in Stufe `5`, nur wenn `lockSessions === 0`): `sessionsInStage ≥ (stage === '1' ? 5 : 3)`; über die letzten 3: max − min der `meanLeftLevel` ≤ 1,0 und letzter ≤ erster; alle `leftHitRate ≥ 0.6` → nächste Stufe, `reason 'advance'`, `levelBeforeChange = Mittel der letzten 3 meanLeftLevel`, `history = []`, `sessionsInStage = 0`, `sessionsSinceChange = 0`.
  `setStageManually`: setzt Stufe, `history = []`, `sessionsInStage = 0`, `levelBeforeChange = null`, `lockSessions = 0`, Logeintrag `manual`.

- [ ] **Step 1: Failing tests (Anteile)** — je Stufe 10.000 linke Ziehungen, Seed fest:
  - `1`: `none` 10 % ± 1,5; Rest `sync`, SOA 0.
  - `2`: `none` 10 % ± 1,5; `wrongSide` 10 % ± 1,5; alle Ton-SOAs in [−300, −100]; Pegel 0.
  - `3b`: Pegel −12 für alle Tondurchgänge.
  - `4b`: Ton 50 % ± 2; `wrongSide` 5 % ± 1 (10 % von 50 %); Pegel −18.
  - `5`: nur `none`.
  - rechts `2`: nie `wrongSide`, nie `none`; `catch` immer `none`.
- [ ] **Step 2: Failing tests (Wechsel)** mit Hilfsfunktion `s(level, rate = 0.7, min = 30)`:
  - Stufe 1, 5 stabile Sitzungen (6, 6.5, 6, 6, 6) → nach der 5. `stage '2'`, `levelBeforeChange = 6`; nach der 4. noch `'1'`.
  - Stufe 2, 3 Sitzungen 6, 6, 6 → `'3a'`.
  - Schwankung 6, 7.5, 6 → kein Wechsel; steigend 5.5, 6, 6.4 (letzter > erster) → kein Wechsel; Trefferquote 0,55 in einer → kein Wechsel.
  - Sitzung mit 8 Minuten zählt nicht.
  - Rückschritt: in `'3a'` mit `levelBeforeChange 6`, drei Sitzungen 8.5, 8.6, 9 → `'2'`, `lockSessions 3`. Danach drei stabile Sitzungen 7, 7, 7: nach der 1. und 2. noch `'2'`, nach der 3. `'3a'` (Sperre ist dann abgelaufen und `sessionsInStage = 3`).
  - Kein Rückschritt in `'1'`; kein Wechsel über `'5'` hinaus.
  - `setStageManually` (Review Focus 5): Stufe gesetzt, Zähler 0, Log `manual`.
- [ ] **Step 3: Run → FAIL**
- [ ] **Step 4: Implementieren**
- [ ] **Step 5: Run → PASS**
- [ ] **Step 6: Commit** `feat(core): Phasen mit Tonbedingungen, Wechsel und Rückschritt`

---

### Task 5: Sitzungsplaner (Controller)

**Files:**
- Create: `src/core/controller.ts`
- Modify: `src/core/blocks.ts` (export `jitterPosition(rng, g, p)` – bisher internes `jitter`), `src/core/types.ts` (TrialRecord + `stairBefore: number | null; stairAfter: number | null`), `src/store/exportData.ts` (CSV-Spalten `stairBefore;stairAfter` nach `soundPlayed`), `src/ui/runner.ts` (Record-Felder mit `null` vorbelegen), `tests/helpers/plans.ts`, `tests/store/exportData.test.ts` (Kopfzeile)
- Test: `tests/core/controller.test.ts`

**Interfaces:**
- Consumes: alles aus Task 1–4, `makeBlock`, `gridPoints`, `jitterPosition`, `checkTrialPlan`, `Geometry`, `RAMP_MS`, `PLATEAU_MS`, `WAIT_MIN_MS`, `WAIT_MAX_MS`
- Produces:
  ```ts
  export interface ControllerState { version: 1; gridSignature: string; map: MapState; stairs: StairSet; guess: GuessRateState; phase: PhaseState; halfLifeSessions: number; sessionCount: number }
  export function gridSignature(points: GridPoint[]): string;       // Punkt-IDs sortiert, mit '|' verbunden
  export function createControllerState(g: Geometry): ControllerState;
  /** Neue Sitzung: Raster prüfen (bei anderer Signatur neue Karte, alte zurückgeben), Vergessen anwenden. */
  export function beginSession(s: ControllerState, g: Geometry): { state: ControllerState; replacedMap: MapState | null };
  export interface SessionPlanner {
    next(): TrialPlan;
    /** Verarbeitet ein Ergebnis: Karte, Treppe, γ; ergänzt stairBefore/stairAfter. */
    apply(r: TrialRecord): TrialRecord;
    /** Summe für das Phasenkriterium (Dauer übergibt die UI). */
    summary(durationMin: number): SessionSummary;
    state(): ControllerState;   // aktueller Zustand (tiefe Kopie)
  }
  export function createSessionPlanner(s: ControllerState, opts: { rng: Rng; geometry: Geometry; sessionId: string; responseWindowMs: number }): SessionPlanner;
  export function endSession(s: ControllerState, summary: SessionSummary, atIso: string): ControllerState; // evaluatePhase, sessionCount + 1
  ```
  `next()`: Art aus `makeBlock`; links → `choosePoint` (letzter linker Index als `lastIndex`), Stufe = `stairs[regionOf(angle)].level`, `jitterPosition`; rechts → zufälliger Punkt aus `gridPoints(g, 'R')`, Stufe `REFERENCE_LEVEL`; Ton aus `assignSound(phase.stage, kind, rng)`; `phase` = Stufe; Plan durch `checkTrialPlan` (wirft bei Verstoß).
  `apply(r)`: nur bei `r.outcome` ∈ {hit, miss}: links → `updateMap` (Rasterpunkt-Position = tatsächliche `r.pos`) und, wenn `r.sound !== 'wrongSide'`, `updateStair` der Region (`stairBefore/After` setzen); `catch` mit `falseAlarm`/`correctRejection` → `updateGuessRate`. Sonst Felder `null`, nichts ändern.
  `summary`: `meanLeftLevel` = Mittel von `stairBefore` aller linken Durchgänge mit Treppenwertung; `leftHitRate` = Treffer / (Treffer + Fehlversuche) links ohne `wrongSide`.

- [ ] **Step 1: Failing tests**
  - 1000 Pläne aus einem frischen Zustand: alle `checkTrialPlan` leer; Anteile je 20 exakt 14/4/2; linke Orte links und auf dem Bildschirm; Stufen in 0..11; `phase === '1'`.
  - `apply` eines linken Treffers ändert Karte und Treppe; mit `sound 'wrongSide'` nur die Karte; rechter Treffer ändert nichts; `anticipation` ändert nichts; `catch` + `falseAlarm` erhöht `guess.falseAlarms`.
  - Zwei linke Treffer in derselben Region senken deren Stufe; `stairBefore/After` korrekt.
  - `beginSession` mit gleicher Geometrie: `replacedMap null`, Log-Likelihoods × 0,5^(1/7); mit anderem Abstand (Review Focus 1): neue Karte, `replacedMap` = alte, Treppe und Phase unverändert.
  - `endSession` mit 5 stabilen Zusammenfassungen ≥ 10 min → Stufe `'2'`, `sessionCount 5`.
  - `JSON.parse(JSON.stringify(state))` liefert gleichen Zustand (reines JSON).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren** (inkl. der genannten Änderungen an blocks/types/exportData/runner/Helpers)
- [ ] **Step 4: Run → PASS (ganze Suite)**
- [ ] **Step 5: Commit** `feat(core): Sitzungsplaner aus Karte, Ortswahl, Treppe und Phasen`

---

### Task 6: Simulierter Proband und Abnahmetests

**Files:**
- Create: `src/core/sim.ts`
- Test: `tests/core/sim.test.ts`, `tests/core/acceptance.test.ts`

**Interfaces:**
- Consumes: `psychometric`, `VisualPos`, `TrialPlan`, `TrialRecord`, `Rng`, `createSessionPlanner` etc.
- Produces:
  ```ts
  export interface SimOptions { learning: boolean; gamma?: number /* 0.04 */; lapse?: number /* 0.03 */ }
  /** Horizontaler Abstand links der Mittellinie in Grad (positiv = links), mit Schräge 0,1·vertikal. */
  export function trueThreshold(pos: VisualPos, sessionIndex: number, opts: SimOptions): number;
  export function isBorderZone(pos: VisualPos): boolean;     // wahre Basisschwelle (ohne Lernen) in (4, 12)
  export function simulateResponse(plan: TrialPlan, sessionIndex: number, rng: Rng, opts: SimOptions): { rtMs: number | null }; // rtMs relativ zu t0, null = keine Antwort
  export function runSimulatedSession(state: ControllerState, g: Geometry, sessionIndex: number, trials: number, rng: Rng, opts: SimOptions): { state: ControllerState; records: TrialRecord[] };
  ```
  Wahre Schwelle (Algorithmus, nicht aus Signatur ableitbar):
  ```
  x = horizontaler Sehwinkel links der Mittellinie: tan-Ebene, x = tan(e)·cos(φ) in Grad via atan; rechts x < 0
  y = vertikaler Sehwinkel (Grad, oben positiv)
  x' = x − 0.1·y                                   // leicht schräge Grenze
  base = 2 + 12 / (1 + exp(−(x' − 4) / 1.2))       // Übergang etwa 2°…6°, darüber blind (→ 14)
  Insel: Abstand zu (e = 13°, φ = −45°, links) < 3° → base = min(base, 7)
  Lernen (nur wenn opts.learning und 4 < base < 12): base − 2 · min(1, sessionIndex / 30)
  Ton: plan.sound ∈ {sync, lead} und Grenzzone → wirksame Schwelle − 1
  ```
  Antwort: Reiz → Treffer mit `psychometric(level, θ_wirksam, γ)` (λ des Probanden über `lapse` statt 0,04: eigene Formel γ + (1−γ−lapse)·logistisch); Treffer-RT log-normal mit Median 450 ms, σ_log 0,25, mindestens 160 ms; ohne Reiz: Fehlalarm mit γ, RT gleichverteilt 200–1500 ms.
  `runSimulatedSession`: `beginSession` → Planer → je Durchgang `simulateResponse` → `classifyResponse` → Record (ohne UI) → `apply` → am Ende `endSession` mit `durationMin = trials · 4.5 / 60`.

- [ ] **Step 1: Failing tests (sim)** — rechts horizontal 10° → θ ≈ 2; links horizontal 20° → θ > 13; links e = 8, φ = 90 (auf der Mittellinie) → θ < 3; Insel-Mittelpunkt → θ ≤ 7; Lernen: Grenzpunkt nach 30 Sitzungen 2 Stufen niedriger, blinder Punkt unverändert; Ton senkt nur in der Grenzzone.
- [ ] **Step 2: Failing tests (acceptance, Spec 16)** — Geometrie 24 cm / 30 cm / 2/3, Viewport 1180×820, Seeds fest:
  - **Karte:** nach 5 Sitzungen à 250 Durchgängen RMSE(θ̂_mean, θ_wahr) über Rasterpunkte mit θ_wahr ≤ 11 höchstens 1,5.
  - **Ortswahl:** ab Sitzung 3 (Sitzungen 3–5) liegen ≥ 50 % der linken Durchgänge an Punkten, deren wahres p (Probanden-Formel, ohne Ton) bei der gezogenen Stufe in [0,3; 0,9] liegt.
  - **Lernen:** 30 Sitzungen à 250; Mittel von θ̂ über Grenzzonenpunkte sinkt von Sitzung 5 bis 30 um ≥ 1,0 mit Lernen und ändert sich um ≤ 0,5 ohne.
  - **Sicherheit:** über alle Pläne der 30 Sitzungen (≥ 7500) plus je 1000 Pläne in jeder Phasenstufe (via `setStageManually`) `checkTrialPlan` leer; Lücken zwischen Reizen ≥ 1000 ms bei schnellster Taktung (wie M1-Test).
  - Laufzeit der Datei < 20 s; falls länger: Sitzungen parallelisieren ist nicht erlaubt, stattdessen Messung im Ledger notieren.
- [ ] **Step 3: Run → FAIL**
- [ ] **Step 4: Implementieren**
- [ ] **Step 5: Run → PASS** — schlägt eine Abnahme fehl, zuerst den Probanden und die Testmessung prüfen (systematic-debugging), **nicht** die Spec-Konstanten aus den Global Constraints ändern. Ist eine Konstante nachweislich ungeeignet, Ruling mit Messwerten ins Ledger und Nutzer im Abschluss informieren.
- [ ] **Step 6: Commit** `test(core): simulierter Proband und Abnahmetests der Karte`

---

### Task 7: Speicherung v2

**Files:**
- Modify: `src/store/db.ts`, `src/store/exportData.ts`
- Test: `tests/store/db.test.ts`, `tests/store/exportData.test.ts`, neu `tests/store/migration.test.ts`

**Interfaces:**
- Consumes: `ControllerState`, `MapState`, `SessionSummary`
- Produces:
  ```ts
  // db.ts
  export const DB_VERSION = 2;
  export interface MapSnapshot { sessionId: string; atIso: string; gridSignature: string; map: MapState; stage: Stage; reason: 'sessionEnd' | 'gridChanged' }
  SessionRecord += { summary: SessionSummary | null; stage: Stage | null }   // optional für alte Datensätze: beim Lesen mit null auffüllen
  Db += {
    getController(): Promise<ControllerState | null>;
    saveController(s: ControllerState): Promise<void>;
    addMapSnapshot(s: MapSnapshot): Promise<void>;
    listMapSnapshots(): Promise<MapSnapshot[]>;
  }
  // replaceAll/clearAll umfassen die neuen Stores
  // exportData.ts
  export const EXPORT_SCHEMA = 'sehtraining-export/2';
  ExportBundle += { controller: ControllerState | null; mapSnapshots: MapSnapshot[] }
  importAll akzeptiert 'sehtraining-export/1' (controller null, snapshots []) und '/2'
  ```
  Upgrade v1 → v2: neue Stores `controller` (Schlüssel `'main'`) und `mapSnapshots` (keyPath `sessionId`); vorhandene Daten bleiben.
- [ ] **Step 1: Failing tests** — Controller speichern/lesen; Snapshots anlegen/listen; **Migration** (Review Focus 4): DB mit `idb` als Version 1 und M1-Schema anlegen, Sitzung + Trial schreiben, dann `openDb` (v2) → Daten vorhanden, `getController()` null, `listSessions()[0].summary === null`; Export v2 → Import in frische DB ohne Verlust (inkl. Controller, Snapshots); Import einer v1-Sicherung funktioniert; CSV-Kopfzeile enthält `stairBefore;stairAfter`.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `feat(store): Schema v2 mit Controller-Zustand und Karten-Snapshots`

---

### Task 8: UI – Training mit Controller, Live-Karte auf der Testseite

**Files:**
- Create: `src/ui/admin/MapView.tsx`, `src/ui/mapColors.ts`
- Modify: `src/ui/patient/TrainingScreen.tsx`, `src/ui/admin/TestPage.tsx`, `README.md`
- Test: `tests/ui/mapColors.test.ts`, `tests/ui/trainingSession.test.ts`

**Interfaces:**
- Consumes: Controller, Db v2, `runBlock`, `TrialStage`, `summarizePoint`, `REFERENCE_LEVEL`, `runSimulatedSession`
- Produces:
  ```ts
  // mapColors.ts
  export function heatColor(p: number): string;     // p 0..1 → Farbe von dunkelgrau (#4a4a4a, nie schwarz) über Blau bis hellgelb (#e8d870); monoton in der Helligkeit
  // ui/session.ts (Erweiterung)
  export const SESSION_TRIALS_M2 = 60;
  export async function runTrainingSession(args: { db: Db; deps: RunnerDeps; geometry: Geometry; responseWindowMs: number; trials: number; sessionId: string; now(): Date; onTrial?(r: TrialRecord): void; rng: Rng }): Promise<{ records: TrialRecord[]; aborted: boolean }>;
  ```
  `runTrainingSession`: Controller laden oder anlegen → `beginSession` (bei `replacedMap` Snapshot `gridChanged`) → Planer → `runBlock` mit Durchgängen, deren Records vor dem Speichern durch `planner.apply` laufen → bei Abbruch Zustand speichern und `aborted: true` (Fortsetzen nutzt denselben Planer weiter; der Aufrufer hält ihn) → am Ende `endSession` mit `durationMin` aus Start/Ende, Controller speichern, Snapshot `sessionEnd`, `SessionRecord.summary/stage` setzen.
  Damit `apply` vor dem Speichern läuft, bekommt `runBlock` einen optionalen Parameter `transform?(r: TrialRecord): TrialRecord` (Test ergänzen).
  - TrainingScreen: nutzt `runTrainingSession` mit 60 Durchgängen; Rückmeldung wie bisher über `blockSummary`. (Zeitgesteuerte 30-Minuten-Sitzungen mit Pausen folgen in M3; bis dahin erreicht keine echte Sitzung die 10 Minuten des Phasenkriteriums – im README vermerken.)
  - MapView: SVG im Admin-Stil, linkes Halbfeld als Polarraster, je Punkt ein Kreis (Radius 2,2°) gefüllt mit `heatColor(p bei REFERENCE_LEVEL)`, darunter Legende; Umschalter „Trefferwahrscheinlichkeit (Stufe 6) / Schwelle“; bei Schwelle Farbe aus `1 − θ̄/14`. Titel und Achsen deutsch.
  - TestPage: Abschnitt „Karte“ mit MapView des gespeicherten Controllers (aktualisiert nach jedem Test-Reiz nicht – die Testseite ändert die Karte nicht); Abschnitt „Simulation“: Knopf „5 Sitzungen simulieren“ → `runSimulatedSession` auf einem **frischen, nicht gespeicherten** Zustand mit aktueller Geometrie, MapView von Schätzung und wahrer Karte nebeneinander, RMSE-Anzeige.
- [ ] **Step 1: Failing tests** — `heatColor`: 0 → `#4a4a4a`, 1 → `#e8d870`, Helligkeit monoton steigend über 11 Stützstellen, nie `#000000`/`#ffffff`; `runTrainingSession` mit Fake-Deps (wie `tests/ui/session.test.ts`, alle Antworten Treffer bei 400 ms) und fake-indexeddb: 60 Records gespeichert mit `stairBefore` gesetzt bei linken Durchgängen, Controller gespeichert mit `sessionCount 1`, ein Snapshot `sessionEnd`, `SessionRecord.summary` gesetzt; Abbruch im 5. Durchgang → `aborted true`, Controller gespeichert, kein `endSession` (`sessionCount 0`); `runBlock` mit `transform` speichert die transformierten Records.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run → PASS; `npm run typecheck && npm run build`**
- [ ] **Step 5: Manuelle Prüfung (Playwright, wie M1, Skript in `.work/`)** — Einrichtung → Training 60 Durchgänge mit Auto-Tipper → IndexedDB: Controller `sessionCount 1`, Snapshot vorhanden; Testseite: Karte sichtbar, „5 Sitzungen simulieren“ zeigt zwei Karten und RMSE ≤ 1,5; Screenshots.
- [ ] **Step 6: README** — Abschnitt „Wie das Training sich anpasst“ (Karte, Ortswahl, Treppe, Phasen in Alltagssprache, je 2–3 Sätze), Hinweis auf M3 für Sitzungslänge.
- [ ] **Step 7: Commit und Push** `feat(ui): Training mit adaptiver Steuerung, Karte auf der Testseite`

---

### Task 9: Tempo ruhiger und einstellbar (Nutzerentscheidung 8, 11.10.2026)

**Files:**
- Create: `src/core/timing.ts`
- Modify: `src/core/stimulus.ts` (Standard-Plateau), `src/core/blocks.ts` (Grundplaner: Wartezeit/Plateau aus Timing), `src/core/controller.ts` (dto.), `src/core/trial.ts` (Fenster-Untergrenze als Parameter), `src/store/db.ts` (`Settings.timing`), `src/ui/admin/ExportPage.tsx` (Abschnitt „Tempo“), Aufrufer in `src/ui/**` (Timing aus den Einstellungen durchreichen), betroffene Tests, `README.md`
- Test: `tests/core/timing.test.ts` + Anpassungen bestehender Tests

**Interfaces:**
- Produces:
  ```ts
  // timing.ts
  export interface TimingSettings { plateauMs: number; waitMinMs: number; waitMaxMs: number; responseWindowMinMs: number }
  export const DEFAULT_TIMING: TimingSettings = { plateauMs: 700, waitMinMs: 1500, waitMaxMs: 3500, responseWindowMinMs: 2000 };
  export const TIMING_LIMITS = { plateauMs: [300, 1500], waitMinMs: [1000, 5000], waitMaxMs: [1000, 6000], responseWindowMinMs: [1500, 4000] } as const;
  export function clampTiming(t: Partial<TimingSettings>): TimingSettings; // fehlende Felder aus DEFAULT_TIMING, jedes Feld in seine Grenzen, waitMaxMs ≥ waitMinMs
  // trial.ts
  export function responseWindowFromReference(rtsMs: readonly number[], minMs?: number /* Standard DEFAULT_TIMING.responseWindowMinMs */): number; // Median + 3·MAD, begrenzt auf [minMs, max(3000, minMs)]; < 5 Werte → max(DEFAULT_WINDOW_MS, minMs)
  // stimulus.ts: PLATEAU_MS = 700 (Standard); RAMP_MS bleibt 150
  // Planer-Optionen (createBasicPlanner, createSessionPlanner): optionales `timing?: TimingSettings` (Standard DEFAULT_TIMING) → plateauMs, waitMs = U(waitMinMs, waitMaxMs) (beim Controller weiter + Vorlauf des Tons)
  // db.ts: Settings.timing: TimingSettings (DEFAULT_SETTINGS.timing = DEFAULT_TIMING; getSettings füllt fehlendes timing auf)
  ```
- Admin-Seite `#/export`, neuer Abschnitt „Tempo“ (bis M3 der PIN-Bereich kommt): drei Schieber mit Anzeige in Sekunden – „Licht sichtbar“ (Gesamtdauer = Plateau + 300 ms, 0,6–1,8 s), „Pause zwischen den Lichtern“ (zwei Schieber oder ein Bereich: von/bis), „Zeit zum Tippen mindestens“ (1,5–4,0 s); Knopf „Standard wiederherstellen“; Speichern über `clampTiming`. Antwortfenster in den Einstellungen wird beim Speichern mit der neuen Untergrenze neu berechnet, wenn Referenz-RTs vorliegen.

- [ ] **Step 1: Failing tests** — `clampTiming({})` = `DEFAULT_TIMING`; Werte außerhalb werden geklemmt; `waitMaxMs < waitMinMs` → `waitMaxMs = waitMinMs`; `waitMinMs` nie < 1000; `responseWindowFromReference([500..580])` = 2000 (neue Untergrenze), mit `minMs 1500` = 1500, mit `minMs 3500` und kleinen RTs = 3500; Grundplaner und Controller: Standard-Pläne haben `plateauMs 700`, Wartezeit in [1500, 3500] (Controller: abzüglich SOA-Vorlauf, d. h. Zeit bis zum ersten Reiz in [1500, 3500]); mit `timing = { plateauMs: 300, waitMinMs: 1000, waitMaxMs: 1000 }` bleibt die Lücke zwischen Reizen bei schnellster Taktung ≥ 1000 ms (Sicherheit); `getSettings` alter Einstellungen ohne `timing` liefert `DEFAULT_TIMING`.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren** (bestehende Tests, die 300 ms / 1000–2500 ms / 1500 ms fest erwarten, auf die neuen Standards bzw. explizite Timing-Optionen umstellen – nicht abschwächen)
- [ ] **Step 4: Run → PASS; `npm run typecheck && npm run build`**
- [ ] **Step 5: README** — Abschnitt „Tempo einstellen“ (2–3 Sätze).
- [ ] **Step 6: Commit** `feat: ruhigeres Tempo, einstellbar (Licht, Pause, Antwortzeit)`

---

### Task 10: Gestaltung – ruhiger Feinschliff, Akzent Petrol (Nutzerentscheidung 9, 11.10.2026)

**Files:**
- Modify: `src/styles.css` (Design-Tokens, Komponentenstile), `src/ui/patient/StartScreen.tsx`, `src/ui/patient/TrainingScreen.tsx` (nur Pause-/Ergebnisansicht, **nicht** die Bühne), `src/ui/setup/**` (Schritt-Anzeige, Karten), `src/ui/admin/**` (Karten-Layout), `index.html` (theme-color unverändert #3c3c3c)
- Create: `src/ui/greeting.ts`
- Test: `tests/ui/greeting.test.ts`, bestehende UI-Tests grün halten

**Interfaces / Werte:**
- Design-Tokens in `:root` (CSS-Variablen): `--bg #3c3c3c` (unverändert, alle Bildschirme), `--surface #454545`, `--surface-2 #4f4f4f`, `--border #5c5c5c`, `--text #e6e6e6`, `--muted #b8b8b8`, `--accent #4f9a94` (gedämpftes Petrol), `--accent-strong #5fb0a9`, `--accent-ink #10302d` (Text auf Akzentflächen); Radius 14 px (Knöpfe/Karten), 999 px (runder Start); Schatten nur dezent (`0 6px 24px rgba(0,0,0,.25)`). Kein reines Schwarz/Weiß, keine gesättigten Farben, keine großflächig hellen Flächen (größte helle Fläche: Start-Knopf).
- Kontrast: Text auf `--bg`/`--surface` ≥ 7:1 (Patient) bzw. ≥ 4,5:1 (Admin); Text auf `--accent` ≥ 4,5:1 → Test berechnet die WCAG-Kontraste aus den Token-Werten (Token-Werte zusätzlich als TS-Konstanten in `src/ui/theme.ts` exportieren und in `styles.css` identisch verwenden).
- `greeting.ts`: `export function greeting(d: Date): string` → 5–10:59 „Guten Morgen“, 11–17:59 „Guten Tag“, 18–22:59 „Guten Abend“, sonst „Hallo“; `export function formatDateDe(d: Date): string` → z. B. „Sonntag, 11. Oktober“.
- **Start:** rechts der Mitte gestapelt: Begrüßung (56 px), Datum (32 px, `--muted`), runder Start-Knopf (Durchmesser wie bisher, Petrol-Verlauf `--accent`→`--accent-strong`, weicher Glow, Text „Start“ in `--accent-ink`, 64 px fett), darunter klein „Lautstärke etwa halb“ (28 px, `--muted`). Weiterhin: Tippen irgendwo startet (onClick), keine Bedienelemente links.
- **Ergebnis:** Karte rechts der Mitte, große Zahl „X von Y“ (96 px), Satz darüber („Heute gefunden“), schmaler Balken X/Y in Petrol, Hinweis „Tippe, um zurückzugehen“; Einblenden 300 ms (Opazität, keine Bewegung über 8 px).
- **Pause/Hinweise** („Pause. Tippe zum Weitermachen.“, „Bitte das iPad quer halten.“, Fehler): gleiche Karte, großer Text.
- **Admin/Einrichtung:** Inhalt zentriert, max. 760 px; jeder Abschnitt eine Karte (`--surface`, Rand `--border`); Primärknopf Petrol, Sekundärknopf Kontur; Eingabefelder und Schieberegler gestaltet (Petrol-Daumen, `accent-color`); Assistent mit Schritt-Anzeige „Schritt 2 von 4“ und Punkten; Überschriften 28 px, Fließtext 20 px, Hinweise `--muted`.
- **Unverändert:** Trainingsbühne (Canvas, Kreuz, Fleck), alle Texte/Logik, Bedienung per onClick, Farben auf der Bühne.

- [ ] **Step 1: Failing tests** — `greeting` an den Grenzen (4:59 „Hallo“, 5:00 „Guten Morgen“, 10:59, 11:00, 17:59, 18:00, 22:59, 23:00), `formatDateDe(new Date(2026, 9, 11))` = „Sonntag, 11. Oktober“; Theme-Kontraste (s. o.) und „kein #000000/#ffffff“; StartScreen rendert Begrüßung + Start-Knopf und startet weiterhin bei click, nicht bei pointerdown.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run → PASS; typecheck; build**
- [ ] **Step 5: Screenshots** (Playwright, 1180×820): Start, Ergebnis, Pause, Einrichtung Schritt 2, Export-Seite, Testseite → `.work/design/*.png` (nicht committen) und im Bericht auflisten.
- [ ] **Step 6: Commit** `feat(ui): ruhiger Feinschliff mit Akzent Petrol`

