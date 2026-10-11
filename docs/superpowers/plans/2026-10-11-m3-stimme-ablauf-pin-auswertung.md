# Meilenstein 3 – Stimme, Patientenablauf, PIN-Bereich, Auswertung, Monatsbericht – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Er trainiert allein: Ansagen per Stimme (oder eigener Aufnahme), 30-Minuten-Sitzungen mit Pause alle 5 Minuten, Tageslimit 2 und gesprochene Tagesrückmeldung. Der Angehörige erreicht über langes Drücken und PIN einen geschützten Bereich mit Einstellungen, Ansagen, Auswertung (Karte mit Regler und Differenz, Verläufe mit Phasenlinien), Export mit Monatserinnerung und Monatsbericht zum Drucken.

**Architecture:** Neue reine Logik: `src/core/schedule.ts` (Sitzungstakt, Tageslimit), einstellbares Raster und „offene Sitzung“ in `core/blocks`/`core/controller`. Die Browser-Anbindung der Stimme liegt in `src/io/voice.ts` und `src/io/recorder.ts`. Der Patientenablauf ist ein reiner Zustandsautomat (`ui/patient/flow.ts`), den `TrainingScreen` mit Effekten verdrahtet. Der PIN-Bereich besteht aus Hash-Routen unter `#/admin/*`, die nur nach PIN-Eingabe erreichbar sind (Entsperrung nur im Speicher). Auswertung und Bericht rechnen in reinen Funktionen (`ui/admin/analysis.ts`, `ui/admin/report.ts`) und zeichnen mit eigenen SVG-Diagrammen. IndexedDB geht auf Schema v3 (Speicher `recordings`).

**Tech Stack:** wie M2 (Vite 8, TypeScript 5.9 strict, Preact 10, Vitest 5 mit jsdom und fake-indexeddb, idb 8, vite-plugin-pwa 2). Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-10-11-sehtraining-design.md` (Abschnitte 10 Sitzung/Tageslimit, 11, 12; 7 „Raster konfigurierbar“; 9 „Phase von Hand“; 17 Zeile M3). Bestand: M1/M2-Code, offene Kleinpunkte in `docs/offene-punkte-m2.md`.

## Festlegungen dieses Plans (Spec lässt sie offen – bitte bei der Durchsicht bestätigen)

1. **Pausenansage in zwei Teilen:** Zu Beginn der Pause „Kurze Pause.“, nach den 30 s Mindestpause „Wenn du weitermachen willst, tippe auf den Bildschirm.“ Vorher wirkt Tippen nicht. Zusammen ergibt das den Spec-Text, aber er wird nie zum Tippen aufgefordert, wenn Tippen noch nicht wirkt.
2. **Sitzungsdauer einstellbar 10–30 Minuten** in 5er-Schritten, Standard 30. Länger als 30 Minuten geht nicht (Sicherheit). Unter 10 Minuten zählt eine Sitzung nicht für das Phasenkriterium.
3. **Gezählt wird nur aktive Zeit.** Die 5 Minuten bis zur Pause und die Sitzungsdauer zählen Zeit, in der Durchgänge laufen. Pausen und Ansagen zählen nicht (wie `durationMin` in M2).
4. **Unterbrechung** (App im Hintergrund, Drehen) führt wie bisher zur Pause. Weitermachen geht dort sofort, ohne 30 s Mindestzeit. Der 5-Minuten-Takt läuft weiter.
5. **„Gestern“ heißt der Kalendertag davor.** Gab es gestern kein Training, folgt „Schön, dass du dabei warst.“
6. **PIN und Aufnahmen gehen nicht in den Export.** Ein 4-stelliger Hash ist in Sekunden zu knacken und gehört nicht in eine Datei für den Arzt. Beim Import bleiben PIN und Aufnahmen des Geräts erhalten.
7. **Begrüßung** als fester, änderbarer Text „Hallo! Schön, dass du da bist.“, ohne Tageszeit. So passt eine Aufnahme immer.
8. **Optionales Zeigen auf den Reizort** (Spec 6.5, Standard aus) und **Blicksprung-Verlauf** (Kamera) gehören nicht zu M3. Im Diagramm steht dafür „ab Meilenstein 4“.

## Global Constraints

- Alle Regeln aus M1 und M2 gelten weiter, insbesondere:
  - `src/core/**` ohne DOM, Uhr und `Math.random`.
  - Texte deutsch, Bezeichner englisch.
  - Kein Netz zur Laufzeit.
  - Keine neuen npm-Abhängigkeiten.
  - Commit-Trailer (siehe M1-Plan).
  - Vor jedem Commit laufen `npm run typecheck` und `npm test`, beide grün.
- **Sitzung:**
  - Standard 30 min, einstellbar 10–30 min in 5er-Schritten.
  - Pause nach je 5 min aktiver Zeit (`PAUSE_EVERY_MS = 300000`), Mindestdauer einer geplanten Pause 30 s (`PAUSE_MIN_MS = 30000`).
  - Ist die Sitzungsdauer erreicht, endet die Sitzung (Ende hat Vorrang vor Pause).
  - Höchstens 2 Sitzungen je Kalendertag (`MAX_SESSIONS_PER_DAY = 2`). Gezählt werden Sitzungen mit `kind === 'training'`, `trialCount ≥ 1` und `dayKey` des Starttags.
  - Schutzgrenze `MAX_TRIALS_PER_SESSION = 800`.
- **Ansagen** (duzen, Standardtexte genau so, im PIN-Bereich änderbar):
  - `greeting`: „Hallo! Schön, dass du da bist.“
  - `instruction`: „Schau auf das Kreuz. Tippe, sobald du ein Licht siehst.“
  - `pauseStart`: „Kurze Pause.“
  - `pauseReady`: „Wenn du weitermachen willst, tippe auf den Bildschirm.“
  - `end`: „Gut gemacht. Die Übung ist zu Ende.“
  - `dailyLimit`: „Für heute ist genug, morgen geht es weiter.“
  - `encouragement`: „Schön, dass du dabei warst.“
- **Sätze mit Zahlen** spricht immer die Systemstimme, sie sind nicht änderbar: „Heute X von Y gefunden.“ und „Gestern waren es Z.“
- **Ansagen und Durchgänge überlappen nie.** Der erste Durchgang beginnt erst, wenn die Ansage beendet ist (Promise erfüllt). Während eines Durchgangs gibt es keine Ansage.
- **Stimme:**
  - Wahl in dieser Reihenfolge: `localService && lang === 'de-DE'` → `localService && lang` beginnt mit `de` → `lang` beginnt mit `de` → keine.
  - Sprechtempo `rate = 0.9`.
  - Jede Ansage endet spätestens nach `speechTimeoutMs(text) = 3000 + 120 · Zeichenzahl` (iOS feuert `end` nicht immer).
  - Eine Aufnahme hat Vorrang. Scheitert ihre Wiedergabe, spricht die Systemstimme.
  - Die Aufnahme wird über die `AudioEngine` abgespielt, also mit Deckel und Limiter.
- **Aufnahmen:**
  - Höchstens 15 s (`RECORDING_MAX_MS = 15000`).
  - MIME in dieser Reihenfolge: `audio/mp4`, `audio/webm;codecs=opus`, `audio/webm`.
  - Gespeichert als `ArrayBuffer` mit `mimeType` (kein `Blob` in IndexedDB).
- **PIN:**
  - Genau 4 Ziffern.
  - Salz aus 16 Zufallsbytes (hex). `hashHex = SHA-256(UTF-8(saltHex + pin))` als hex über `crypto.subtle`.
  - Langes Drücken 3000 ms auf einer Fläche von 64×64 CSS-Pixeln oben rechts im Startbildschirm.
  - Entsperrung nur im Speicher: Zurück zum Start oder Neuladen sperrt wieder.
  - Falsche PIN: Hinweis „Falsche PIN.“, keine Sperre.
- **Export-Erinnerung:** fällig, wenn es mindestens eine Trainingssitzung gibt und noch nie exportiert wurde oder der letzte JSON-Export ≥ 30 Tage zurückliegt.
- **Patientenbildschirme:**
  - Hintergrund `#3c3c3c`.
  - Text in `--text` (#e0e0e0, ≥ 7:1). Für Hinweise auf Patientenbildschirmen kein `--muted`.
  - Schrift ≥ 48 px für Haupttexte.
  - Bedienelemente rechts oder Mitte.
  - 300 ms Überblendung.
  - Fortschrittsbalken der Pause bewegt sich gleichmäßig (CSS-`transition` auf `width`), ohne Blinken.
- Der Hinweis `DISCLAIMER_TEXT` (aus `src/ui/setup/steps/Disclaimer.tsx`) steht dauerhaft auf der PIN-Startseite und im Monatsbericht.

## Review Focus

1. **Stimme hängt oder fehlt:**
   - Bedingungen: iOS feuert `end` nicht, keine deutsche Stimme, `speechSynthesis` fehlt, Aufnahme defekt.
   - Erwartet: Der Ablauf geht nach der Zeitgrenze weiter, er sitzt nie vor einem stummen, stehenden Bildschirm.
   - Tests: Task 3 (Zeitgrenze, kein `synth`, Aufnahme scheitert → Systemstimme) und Task 7 (Einleitung mit hängender Stimme führt zum ersten Durchgang).
2. **App mitten in der Sitzung geschlossen oder in den Hintergrund:**
   - Erwartet: Die nächste Sitzung vergisst die Karte nicht doppelt.
   - Erwartet: Die alte offene Sitzung wird mit dem Zeitpunkt ihres letzten Durchgangs beendet.
   - Erwartet: Das Tageslimit zählt sie.
   - Tests: Task 2 (`openSession`) und Task 5 (offene Sitzungen schließen).
3. **Tagesgrenzen:**
   - Fälle: Sitzung um 23:55, 1. Januar → gestern 31. Dezember, Schaltjahr, Zeitumstellung.
   - Erwartet: Limit und „gestern“ stimmen nach Kalendertag.
   - Tests: Task 1 (`sessionsStartedOn`) und Task 6 (`previousDayKey`).
4. **Tippen zur falschen Zeit:**
   - Fall: Tippen in den ersten 30 s der Pause, im Hochformat oder auf „Fertig für heute“. Erwartet: kein Weitermachen.
   - Fall: Langes Drücken in der Ecke. Erwartet: startet kein Training.
   - Tests: Task 6 (Automat), Task 7 (Knopf), Task 8 (Ecke).
5. **Sicherung von einem anderen Gerät oder einer alten Version importiert:**
   - Erwartet: Die PIN des Geräts bleibt, Aufnahmen bleiben.
   - Erwartet: Fehlende neue Einstellungsfelder bekommen Standardwerte.
   - Erwartet: Der Export enthält keine PIN.
   - Tests: Task 4.

---

## Dateistruktur

```
src/core/schedule.ts               Sitzungstakt, Tageslimit (Task 1)
src/core/blocks.ts                 + GridConfig, gridPoints(g, side, grid) (Task 2)
src/core/controller.ts             + Raster, openSession (Task 2)
src/io/voice.ts                    Ansagen: Texte, Stimmenwahl, Voice (Task 3)
src/io/recorder.ts                 MediaRecorder-Anbindung (Task 3)
src/io/audio.ts                    + playClip (Task 3)
src/store/db.ts                    Schema v3, neue Einstellungen, recordings (Task 4)
src/store/exportData.ts            PIN nicht exportieren, beim Import behalten (Task 4)
src/ui/session.ts                  zeitgesteuerte Läufe, offene Sitzungen (Task 5)
src/ui/patient/flow.ts             Zustandsautomat des Ablaufs (Task 6)
src/ui/patient/dailyFeedback.ts    Tagesrückmeldung (Task 6)
src/ui/patient/TrainingScreen.tsx  Ablauf mit Ansagen, Pausen, Limit, Rückmeldung (Task 7)
src/ui/App.tsx                     Stimme, Entsperrung, Routen (Task 7, 8)
src/ui/patient/AdminCorner.tsx     langes Drücken oben rechts (Task 8)
src/ui/admin/pin.ts, PinScreen.tsx, AdminHome.tsx, exportReminder.ts   (Task 8)
src/ui/setup/steps/PinStep.tsx     PIN im Einrichtungsassistenten (Task 8)
src/ui/admin/SettingsPage.tsx, TempoSection.tsx, settingsActions.ts    (Task 9)
src/ui/admin/VoicePage.tsx         Ansagetexte und Aufnahmen (Task 10)
src/ui/admin/analysis.ts, LineChart.tsx, EvaluationPage.tsx            (Task 11)
src/ui/admin/MapView.tsx, src/ui/mapColors.ts                          + Differenz (Task 11)
src/ui/admin/report.ts, ReportPage.tsx                                 (Task 12)
README.md, docs/offene-punkte-m2.md, Spec §18                          (Task 13)
```

---

### Task 1: Sitzungstakt und Tageslimit (`core/schedule`)

**Files:**
- Create: `src/core/schedule.ts`
- Test: `tests/core/schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PAUSE_EVERY_MS = 300_000;
  export const PAUSE_MIN_MS = 30_000;
  export const MAX_SESSIONS_PER_DAY = 2;
  export const MAX_TRIALS_PER_SESSION = 800;
  export const SESSION_MINUTES_DEFAULT = 30;
  export const SESSION_MINUTES_LIMITS = { min: 10, max: 30, step: 5 } as const;
  /** Auf 5er-Schritte runden, auf 10..30 begrenzen; NaN/undefiniert → 30. */
  export function clampSessionMinutes(m: number | undefined): number;
  export type ScheduleStep = 'trial' | 'pause' | 'end';
  /** Vor jedem Durchgang: 'end' wenn activeMs ≥ Sitzungsdauer, sonst 'pause' wenn segmentActiveMs ≥ PAUSE_EVERY_MS, sonst 'trial'. */
  export function nextStep(a: { activeMs: number; segmentActiveMs: number; sessionMinutes: number }): ScheduleStep;
  export interface DaySessionLike { dayKey: string; kind: string; trialCount: number }
  /** Begonnene Trainingssitzungen (trialCount ≥ 1) mit diesem dayKey. */
  export function sessionsStartedOn(sessions: readonly DaySessionLike[], day: string): number;
  export function dailyLimitReached(sessions: readonly DaySessionLike[], day: string): boolean;
  ```

- [ ] **Step 1: Failing tests** in `tests/core/schedule.test.ts`
  - `nextStep({activeMs: 0, segmentActiveMs: 0, sessionMinutes: 30})` → `'trial'`; `segmentActiveMs: 299_999` → `'trial'`; `300_000` → `'pause'`.
  - `activeMs: 1_800_000, segmentActiveMs: 300_000, sessionMinutes: 30` → `'end'` (Vorrang); `sessionMinutes: 10, activeMs: 600_000` → `'end'`.
  - `clampSessionMinutes`: 30→30, 7→10, 45→30, 22→20, 23→25, `NaN`→30, `undefined`→30.
  - `sessionsStartedOn`: zählt `{dayKey:'2026-10-11', kind:'training', trialCount:1}`, nicht `trialCount: 0`, nicht `kind: 'reference'`, nicht `dayKey: '2026-10-10'`. Eine Sitzung, die um 23:55 am 10. begann, zählt für den 10., nicht für den 11. (Review Focus 3).
  - `dailyLimitReached` bei 1 → false, bei 2 → true.
- [ ] **Step 2: Run** `npx vitest run tests/core/schedule.test.ts` → FAIL (Modul fehlt)
- [ ] **Step 3: Implementieren** gemäß Interfaces.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` grün.
- [ ] **Step 5: Commit** `feat(core): Sitzungstakt mit Pausen und Tageslimit`

---

### Task 2: Einstellbares Raster und offene Sitzung im Controller

**Files:**
- Modify: `src/core/blocks.ts`, `src/core/controller.ts`
- Test: `tests/core/blocks.test.ts`, `tests/core/controller.test.ts`

**Interfaces:**
- Consumes: `gridPoints`, `createControllerState`, `beginSession`, `createSessionPlanner`, `endSession` (Bestand).
- Produces:
  ```ts
  // blocks.ts
  export interface GridConfig { eccStartDeg: number; eccStepDeg: number; angleStepDeg: number }
  export const DEFAULT_GRID: GridConfig; // { eccStartDeg: 3, eccStepDeg: 5, angleStepDeg: 15 } (aus den bisherigen GRID_*-Konstanten)
  export const GRID_LIMITS: { eccStartDeg: [2, 6]; eccStepDeg: [3, 8]; angleStepDeg: readonly [10, 15, 20, 30] };
  /** Ganzzahlig runden und begrenzen; angleStepDeg auf den nächsten erlaubten Wert; fehlende Felder → Standard. */
  export function clampGrid(g: Partial<GridConfig> | undefined): GridConfig;
  export function gridPoints(g: Geometry, side: Side, grid?: GridConfig): GridPoint[]; // Standard DEFAULT_GRID, IDs unverändert `${side}-e${ecc}-a${angle}`
  // controller.ts
  export interface ControllerState { /* wie bisher */ openSession?: boolean }
  export function createControllerState(g: Geometry, grid?: GridConfig): ControllerState;
  export function beginSession(s: ControllerState, g: Geometry, grid?: GridConfig): { state: ControllerState; replacedMap: MapState | null };
  export interface SessionPlannerOptions { /* wie bisher */ grid?: GridConfig }
  ```
  - `beginSession` setzt `openSession = true`. Bei `s.openSession === true` überspringt es das Vergessen, die Rasterprüfung bleibt. `endSession` setzt `openSession = false`.
  - Ein fehlendes Feld (alter Zustand) gilt als `false`.
  - Der Planer nutzt `opts.grid` für die rechten Rasterpunkte.

- [ ] **Step 1: Failing tests**
  - blocks: `gridSignature(gridPoints(g, 'L'))` gleich `gridSignature(gridPoints(g, 'L', DEFAULT_GRID))` (keine Änderung für Bestandsnutzer). Mit `{eccStartDeg: 2, eccStepDeg: 4, angleStepDeg: 30}` sind alle Winkel Vielfache von 30 in −90..90 und die Exzentrizitäten in {2, 6, 10, …}.
  - `clampGrid({eccStartDeg: 1, eccStepDeg: 9.4, angleStepDeg: 17})` → `{2, 8, 15}`. `clampGrid(undefined)` → `DEFAULT_GRID`.
  - controller: `beginSession(createControllerState(g), g, {…DEFAULT_GRID, angleStepDeg: 30})` liefert `replacedMap !== null`.
  - Offene Sitzung (Review Focus 2):
    - `beginSession` liefert `state.openSession === true`.
    - Zweimal hintereinander `beginSession` (zweites Mal auf dem Ergebnis des ersten, nach einem `updateMap`): Die Log-Likelihoods des zweiten Aufrufs sind gleich der Eingabe, also nicht noch einmal × 0,5^(1/7).
    - `endSession(...).openSession === false`.
    - Zustand ohne Feld `openSession` wird vergessen wie bisher.
  - Planer mit `grid: {…, angleStepDeg: 30}`: Über 200 Pläne liegen alle rechten `gridPointId` auf Winkeln, die Vielfache von 30 sind.
- [ ] **Step 2: Run** `npx vitest run tests/core/blocks.test.ts tests/core/controller.test.ts` → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS. Danach die ganze Suite (`npm test`, die Abnahmetests müssen unverändert grün sein) und `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(core): Raster einstellbar, offene Sitzung ohne doppeltes Vergessen`

---

### Task 3: Stimme, Aufnahme, Wiedergabe von Aufnahmen

**Files:**
- Create: `src/io/voice.ts`, `src/io/recorder.ts`
- Modify: `src/io/audio.ts` (+ `playClip`)
- Test: `tests/io/voice.test.ts`, `tests/io/recorder.test.ts`, `tests/io/audio.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // voice.ts
  export type AnnouncementKey = 'greeting' | 'instruction' | 'pauseStart' | 'pauseReady' | 'end' | 'dailyLimit' | 'encouragement';
  export const ANNOUNCEMENT_KEYS: readonly AnnouncementKey[];          // in obiger Reihenfolge
  export const DEFAULT_ANNOUNCEMENTS: Record<AnnouncementKey, string>; // Texte aus Global Constraints
  export const SPEECH_RATE = 0.9;
  export function speechTimeoutMs(text: string): number;              // 3000 + 120 · text.length
  /** Getrimmter eigener Text, sonst Standard. */
  export function textFor(key: AnnouncementKey, overrides: Partial<Record<AnnouncementKey, string>>): string;
  export interface VoiceLike { name: string; lang: string; localService: boolean }
  export function pickGermanVoice<V extends VoiceLike>(voices: readonly V[]): { voice: V; local: boolean } | null;
  export interface SpeechLike {
    speak(u: SpeechSynthesisUtterance): void; cancel(): void; getVoices(): SpeechSynthesisVoice[];
    addEventListener?(type: 'voiceschanged', cb: () => void): void; removeEventListener?(type: 'voiceschanged', cb: () => void): void;
  }
  export interface VoiceDeps {
    synth: SpeechLike | null;
    makeUtterance(text: string): SpeechSynthesisUtterance;
    playClip(data: ArrayBuffer): Promise<void>;
    setTimeout(cb: () => void, ms: number): unknown;
    clearTimeout(id: unknown): void;
  }
  export class Voice {
    constructor(deps: VoiceDeps);
    setTexts(overrides: Partial<Record<AnnouncementKey, string>>): void;
    setRecordings(recs: ReadonlyMap<AnnouncementKey, ArrayBuffer>): void;
    /** Synchron im Tipp-Handler aufrufen: leere Äußerung, damit iOS spätere Ansagen erlaubt. */
    unlock(): void;
    /** Aufnahme, sonst Systemstimme; erfüllt sich immer (Ende, Fehler oder Zeitgrenze), nie reject. */
    say(key: AnnouncementKey): Promise<void>;
    /** Nur Systemstimme (Sätze mit Zahlen). */
    speakText(text: string): Promise<void>;
    cancel(): void;
    hasLocalGermanVoice(): boolean;
    /** Meldet geänderte Stimmenliste; liefert Abmeldefunktion. */
    onVoicesChanged(cb: () => void): () => void;
  }
  export function createBrowserVoice(audio: { playClip(data: ArrayBuffer): Promise<void> }): Voice;
  // recorder.ts
  export const RECORDING_MAX_MS = 15_000;
  export const RECORDING_MIME_CANDIDATES: readonly string[]; // ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  export function pickRecordingMime(isSupported: (t: string) => boolean): string | null;
  export interface ActiveRecording { mimeType: string; stop(): Promise<{ data: ArrayBuffer; mimeType: string }> }
  /** Mikrofon öffnen, aufnehmen; stoppt spätestens nach RECORDING_MAX_MS; beendet die Spuren des Streams beim Stopp. */
  export function startRecording(getStream?: () => Promise<MediaStream>): Promise<ActiveRecording>;
  // audio.ts (AudioEngine)
  /** Dekodiert eine Kopie (`data.slice(0)`) und spielt sie über Master-Gain und Limiter; erfüllt sich bei 'ended'. */
  playClip(data: ArrayBuffer): Promise<void>;
  ```
  - `say`/`speakText`: `utterance.lang = 'de-DE'`, `rate = SPEECH_RATE`, `voice` aus `pickGermanVoice(synth.getVoices())`, falls vorhanden.
  - Die Zeitgrenze `speechTimeoutMs` gilt für Sprache. Für Aufnahmen gilt `RECORDING_MAX_MS + 2000`.
  - Ein neues `say` bricht keine laufende Ansage ab. Der Aufrufer wartet.

- [ ] **Step 1: Failing tests**
  - `pickGermanVoice`:
    - `[en-US local, de-DE remote, de-DE local "Anna"]` → Anna, `local: true`.
    - `[de-AT local]` → de-AT, `local: true`.
    - `[de-DE remote]` → `local: false`.
    - `[en-US]` → `null`.
  - `textFor('pauseStart', {pauseStart: '  '})` → „Kurze Pause.“. `textFor('end', {end: 'Fertig!'})` → „Fertig!“.
  - `say('greeting')` mit Fake-`synth` (ruft `onend` per Microtask): `speak` einmal mit Text „Hallo! Schön, dass du da bist.“, `rate` 0,9. Das Promise erfüllt sich.
  - Aufnahme vorhanden: `playClip` wird aufgerufen, `speak` nicht. `playClip` rejected: danach `speak` mit dem Text (Review Focus 1).
  - `speakText('Heute 3 von 4 gefunden.')` spricht auch bei vorhandenen Aufnahmen über `synth`.
  - Hängende Stimme (`speak` ruft nie `onend`), Fake-Timer: Das Promise erfüllt sich genau nach `speechTimeoutMs(text)`, nicht früher (Review Focus 1).
  - `synth: null` → `say` erfüllt sich sofort. `hasLocalGermanVoice()` → false.
  - `unlock()` ruft `speak` mit leerem Text auf.
  - `pickRecordingMime(t => t === 'audio/webm')` → `'audio/webm'`. Ohne Unterstützung → `null`.
  - `startRecording` mit Fake-`MediaRecorder` (global gestubbt) und Fake-Stream:
    - `stop()` liefert `ArrayBuffer` der gesammelten Daten und den `mimeType`.
    - Jede Spur bekommt `stop()`.
    - Nach `RECORDING_MAX_MS` (Fake-Timer) stoppt der Recorder von selbst.
  - `AudioEngine.playClip` mit Fake-Context (wie im bestehenden `tests/io/audio.test.ts`):
    - `decodeAudioData` bekommt eine Kopie, das Original bleibt nutzbar (`byteLength` unverändert).
    - Die Quelle wird mit dem Master verbunden.
    - Das Promise erfüllt sich bei `onended`.
- [ ] **Step 2: Run** `npx vitest run tests/io` → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(io): Ansagen mit Systemstimme oder eigener Aufnahme`

---

### Task 4: Speicherung v3

**Files:**
- Modify: `src/store/db.ts`, `src/store/exportData.ts`
- Test: `tests/store/db.test.ts`, `tests/store/migration.test.ts`, `tests/store/exportData.test.ts`

**Interfaces:**
- Consumes: `GridConfig`, `DEFAULT_GRID`, `clampGrid` (Task 2), `AnnouncementKey` (Task 3), `clampSessionMinutes`, `SESSION_MINUTES_DEFAULT` (Task 1), `GuessRateState`.
- Produces:
  ```ts
  export const DB_VERSION = 3;
  export interface PinRecord { saltHex: string; hashHex: string }
  export interface Settings {
    /* bisherige Felder */
    pin: PinRecord | null;
    sessionMinutes: number;                                   // Standard 30
    announcements: Partial<Record<AnnouncementKey, string>>;  // Standard {}
    lastExportAtIso: string | null;
    grid: GridConfig;                                         // Standard DEFAULT_GRID
  }
  export interface MapSnapshot { /* bisherige Felder */ guess?: GuessRateState }
  export interface RecordingRecord { key: AnnouncementKey; mimeType: string; data: ArrayBuffer; createdAtIso: string }
  export interface Db {
    /* bisherige Methoden */
    listRecordings(): Promise<RecordingRecord[]>;
    saveRecording(r: RecordingRecord): Promise<void>;   // überschreibt je key
    deleteRecording(key: AnnouncementKey): Promise<void>;
  }
  // exportData.ts
  export function shareOrDownload(file: File): Promise<boolean>; // false nur, wenn das Teilen-Menü abgebrochen wurde
  ```
  - Upgrade `oldVersion < 3`: neuer Speicher `recordings` (keyPath `key`). Sonst bleibt alles unverändert.
  - `getSettings` füllt fehlende Felder mit Standardwerten und wendet `clampSessionMinutes` und `clampGrid` an.
  - `clearAll` leert auch `recordings`. `replaceAll` lässt `recordings` unberührt.
  - `exportAll` setzt `settings.pin = null`.
  - `importAll` übernimmt `pin` aus den aktuellen Geräteeinstellungen, nicht aus der Sicherung. `EXPORT_SCHEMA` bleibt `'sehtraining-export/2'`.

- [ ] **Step 1: Failing tests**
  - Migration:
    - Datenbank in Version 2 mit roher `idb` anlegen (wie im bestehenden Migrationstest), mit Einstellungen, einer Sitzung und einem Durchgang.
    - Danach `openDb` öffnen: alles vorhanden, `listRecordings()` liefert `[]`.
    - `getSettings()` liefert `sessionMinutes 30`, `grid` gleich `DEFAULT_GRID`, `announcements {}`, `pin null` und `lastExportAtIso null` (Review Focus 5).
  - Aufnahmen speichern, lesen und löschen:
    - `ArrayBuffer` mit Bytes [1, 2, 3] speichern, gleiche Bytes wieder lesen.
    - `saveRecording` mit gleichem key ersetzt den Eintrag.
  - `replaceAll` (Import) lässt eine vorhandene Aufnahme stehen. `clearAll` entfernt sie.
  - `getSettings` mit gespeichertem `sessionMinutes: 45` liefert 30. Mit `grid: {eccStartDeg: 1}` liefert es `eccStartDeg 2` und die übrigen Felder als Standard.
  - Export und Import (Review Focus 5):
    - Gerät mit `pin {saltHex:'aa', hashHex:'bb'}`: `exportAll(...).settings.pin === null`.
    - Import einer Sicherung, deren Einstellungen eine andere PIN enthalten: Danach liefert `getSettings().pin` weiter `{aa, bb}`.
    - Import einer v1- oder v2-Sicherung ohne neue Felder: Einstellungen mit Standardwerten, PIN des Geräts.
  - `MapSnapshot` mit `guess` wird verlustfrei gespeichert.
- [ ] **Step 2: Run** `npx vitest run tests/store` → FAIL
- [ ] **Step 3: Implementieren.** Die Aufrufer von `shareOrDownload` übersetzen weiter (Rückgabewert darf ignoriert werden).
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(store): Schema v3 mit Aufnahmen, PIN und Sitzungseinstellungen`

---

### Task 5: Zeitgesteuerte Sitzungsläufe

**Files:**
- Modify: `src/ui/session.ts`
- Test: `tests/ui/trainingSession.test.ts`, `tests/ui/session.test.ts`

**Interfaces:**
- Consumes: `MAX_TRIALS_PER_SESSION` (Task 1), `GridConfig`, `beginSession(s, g, grid)`, `createControllerState(g, grid)`, `SessionPlannerOptions.grid` (Task 2), `MapSnapshot.guess` (Task 4).
- Produces:
  ```ts
  export async function runBlock(args: { /* wie bisher */ shouldStop?(): boolean }): Promise<TrialRecord[]>; // prüft shouldStop vor jedem Durchgang
  export interface TrainingSessionArgs { /* wie bisher, aber */ trials?: number; grid?: GridConfig }
  export interface TrainingSession {
    /* wie bisher, aber */
    run(deps: RunnerDeps, opts?: { stopWhen?(): boolean }): Promise<{ records: TrialRecord[]; aborted: boolean }>;
    /** Aktive Zeit in ms: Summe abgeschlossener Läufe plus laufender Lauf. */
    activeMs(): number;
  }
  ```
  - `trials` undefiniert heißt: so lange, bis `stopWhen()` wahr ist. Höchstens `MAX_TRIALS_PER_SESSION` gewertete Durchgänge je Sitzung.
  - `startTrainingSession` schließt vor dem Anlegen alle anderen Sitzungen mit `kind === 'training'` und `endedAtIso === null`:
    - `endedAtIso` = `startedAtIso` ihres letzten Durchgangs, sonst ihr eigenes `startedAtIso`.
    - `summary` bleibt `null`, es gibt keine Phasenbewertung.
  - `finish` speichert den Snapshot mit `guess: planner.state().guess`.
  - `SESSION_TRIALS_M2` bleibt bis Task 7 stehen.

- [ ] **Step 1: Failing tests** (fake-indexeddb, `fakeDeps` aus `tests/helpers/fakeRunner.ts` bzw. die vorhandenen Helfer der Sitzungstests)
  - `run(deps, {stopWhen})` mit `stopWhen`, das nach 3 Aufrufen wahr wird: genau 3 Durchgänge, `aborted: false`.
  - `activeMs()` während eines Laufs (Fake-`now`, das je Durchgang 4000 ms weiterzählt) wächst. Nach dem Lauf entspricht es der Summe der Laufzeiten. Zeit zwischen zwei `run`-Aufrufen zählt nicht.
  - Ohne `trials` und mit `stopWhen: () => false` stoppt der Lauf nach `MAX_TRIALS_PER_SESSION` gewerteten Durchgängen. Dazu `MAX_TRIALS_PER_SESSION` per `vi.mock` auf 5 setzen.
  - Offene Sitzungen (Review Focus 2):
    - Eine vorhandene offene Sitzung mit Durchgang am `2026-10-11T09:10:00Z` wird beim Start einer neuen Sitzung mit diesem `endedAtIso` geschlossen, `summary null`.
    - Die neue Sitzung bleibt offen.
  - Abbruch, dann neue Sitzung (zweites `startTrainingSession`): Die gespeicherte Karte wird nicht noch einmal vergessen. Prüfung: Die Log-Likelihoods im neuen Planer sind gleich denen des beim Abbruch gespeicherten Controllers.
  - `finish` schreibt einen Snapshot mit `guess`.
  - `grid: {…DEFAULT_GRID, angleStepDeg: 30}`: Der gespeicherte Controller hat eine andere `gridSignature` als mit Standardraster.
- [ ] **Step 2: Run** `npx vitest run tests/ui/trainingSession.test.ts tests/ui/session.test.ts` → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Sitzungsläufe nach Zeit, offene Sitzungen werden geschlossen`

---

### Task 6: Ablaufautomat und Tagesrückmeldung (rein)

**Files:**
- Create: `src/ui/patient/flow.ts`, `src/ui/patient/dailyFeedback.ts`
- Test: `tests/ui/flow.test.ts`, `tests/ui/dailyFeedback.test.ts`

**Interfaces:**
- Consumes: `PAUSE_MIN_MS` (Task 1), `blockSummary` (routing.ts), `dayKey` (session.ts), `SessionRecord`.
- Produces:
  ```ts
  // dailyFeedback.ts
  export function previousDayKey(day: string): string; // lokales Datum, über Mittag gerechnet (sommerzeitfest)
  /** Linke Durchgänge mit Reiz aller Trainingssitzungen dieses Tages (ohne Abbrüche). */
  export function dayCounts(sessions: readonly Pick<SessionRecord, 'id' | 'dayKey' | 'kind'>[], trials: readonly TrialRecord[], day: string): { found: number; total: number };
  export interface DailyFeedback {
    found: number; total: number;
    numbersText: string;                                   // „Heute X von Y gefunden.“
    follow: { kind: 'yesterday'; text: string } | { kind: 'encouragement' }; // „Gestern waren es Z.“
  }
  /** yesterday null oder total 0 → encouragement; found ≥ yesterday.found → yesterday; sonst encouragement. */
  export function dailyFeedback(today: { found: number; total: number }, yesterday: { found: number; total: number } | null): DailyFeedback;
  // flow.ts
  export type FlowState =
    | { kind: 'checking' }
    | { kind: 'limit' }
    | { kind: 'intro' }
    | { kind: 'running'; run: number; newSegment: boolean }
    | { kind: 'pause'; reason: 'scheduled' | 'interrupted'; sinceMs: number; ready: boolean }
    | { kind: 'ending' }
    | { kind: 'feedback'; feedback: DailyFeedback };
  export type FlowEvent =
    | { type: 'checked'; limitReached: boolean }
    | { type: 'introDone' }
    | { type: 'segmentDone'; step: 'pause' | 'end'; nowMs: number }
    | { type: 'interrupted'; nowMs: number }
    | { type: 'tick'; nowMs: number }
    | { type: 'tap'; nowMs: number; windowOk: boolean }
    | { type: 'finishToday' }
    | { type: 'ended'; feedback: DailyFeedback };
  export const INITIAL_FLOW: FlowState; // { kind: 'checking' }
  export function flowReducer(s: FlowState, e: FlowEvent): FlowState;
  ```
  Übergänge (alle anderen Kombinationen liefern denselben Zustand, `===`):
  | Zustand | Ereignis | Ergebnis |
  |---|---|---|
  | checking | checked | `limitReached` → limit, sonst intro |
  | intro | introDone | running `{run: 1, newSegment: true}` |
  | running | segmentDone pause | pause `{scheduled, sinceMs: nowMs, ready: false}` |
  | running | segmentDone end | ending |
  | running | interrupted | pause `{interrupted, sinceMs: nowMs, ready: true}` |
  | pause | tick | `ready` wird wahr, sobald `nowMs − sinceMs ≥ PAUSE_MIN_MS` (neues Objekt nur bei Änderung) |
  | pause | tap | nur wenn (`ready` oder `nowMs − sinceMs ≥ PAUSE_MIN_MS`) und `windowOk`: running `{run: nowMs, newSegment: reason === 'scheduled'}` |
  | pause | finishToday | ending |
  | ending | ended | feedback |

- [ ] **Step 1: Failing tests**
  - `previousDayKey` (Review Focus 3):
    - `'2026-10-11'` → `'2026-10-10'`
    - `'2027-01-01'` → `'2026-12-31'`
    - `'2028-03-01'` → `'2028-02-29'`
    - `'2026-03-30'` → `'2026-03-29'` (Tag nach der Zeitumstellung)
  - `dayCounts`:
    - Zwei Trainingssitzungen am selben Tag werden addiert.
    - Rechte Durchgänge, Durchgänge ohne Reiz und abgebrochene Durchgänge zählen nicht.
    - Eine Referenzsitzung (`kind 'reference'`) zählt nicht.
    - Durchgänge eines anderen Tages zählen nicht.
  - `dailyFeedback`:
    - `({5,8}, {4,8})` → numbersText „Heute 5 von 8 gefunden.“, follow „Gestern waren es 4.“
    - `({4,8}, {4,9})` → yesterday (Gleichstand zählt)
    - `({3,8}, {4,8})` → encouragement
    - `({3,8}, null)` → encouragement
    - `({3,8}, {0,0})` → encouragement
  - Automat: jede Zeile der Tabelle einmal. Dazu (Review Focus 4):
    - tap in einer geplanten Pause bei `sinceMs + 29_999` → gleicher Zustand.
    - tap bei `+30_000` → running mit `newSegment: true`.
    - tap mit `windowOk: false` nach 60 s → gleicher Zustand.
    - unterbrochene Pause: tap sofort → running mit `newSegment: false`.
    - tap in intro, ending, feedback → gleicher Zustand.
- [ ] **Step 2: Run** `npx vitest run tests/ui/flow.test.ts tests/ui/dailyFeedback.test.ts` → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Ablaufautomat mit Pausen und Tagesrückmeldung`

---

### Task 7: Trainingsbildschirm mit Ansagen, Pausen, Tageslimit und Rückmeldung

**Files:**
- Modify: `src/ui/patient/TrainingScreen.tsx` (neu aufgebaut auf `flowReducer`), `src/ui/App.tsx` (Voice anlegen, Texte und Aufnahmen laden, `voice.unlock()` im Start-Tipp), `src/ui/session.ts` (`SESSION_TRIALS_M2` entfernen), `src/styles.css` (Pause, Knopf „Fertig für heute“, Folgesatz)
- Test: `tests/ui/trainingScreen.test.tsx` (neu geschrieben)

**Interfaces:**
- Consumes: Task 1 (`nextStep`, `dailyLimitReached`, `clampSessionMinutes`), Task 3 (`Voice`, `createBrowserVoice`, `textFor`), Task 4 (`Settings`, `db.listRecordings`), Task 5 (`TrainingSession.run(deps, {stopWhen})`, `activeMs()`, `grid`), Task 6 (`flowReducer`, `dailyFeedback`, `dayCounts`, `previousDayKey`).
- Produces: `TrainingScreen(props: { db: Db; audio: AudioEngine; voice: Voice; settings: Settings; onExit(): void; now?: () => number })`. `now` ist standardmäßig `performance.now` und nur für Tests da.
- Ablauf der Effekte je Zustand:
  - **checking:** `db.listSessions()` lesen und `checked` mit `dailyLimitReached(sessions, dayKey(new Date()))` senden.
  - **limit:** Text `textFor('dailyLimit')` groß anzeigen, einmal `voice.say('greeting')`, dann `voice.say('dailyLimit')`. Tippen → `onExit`.
  - **intro:** Fixationskreuz-Hintergrund (leerer Patientenbildschirm), `await voice.say('greeting')`, `await voice.say('instruction')`, dann `introDone`.
  - **running:** `TrialStage` mit `key = run`:
    - Beim ersten Lauf `startTrainingSession` mit `grid: settings.grid` und ohne `trials`.
    - Bei `newSegment` die Marke `segStart = ts.activeMs()` setzen.
    - `stopWhen = () => nextStep({ activeMs: ts.activeMs(), segmentActiveMs: ts.activeMs() − segStart, sessionMinutes: clampSessionMinutes(settings.sessionMinutes) }) !== 'trial'`.
    - Bei Abbruch `interrupted`, sonst `segmentDone` mit dem Ergebnis von `nextStep`.
  - **pause:**
    - Bei `scheduled` einmal `voice.say('pauseStart')`.
    - Alle 500 ms `tick`. Beim Wechsel auf `ready` einmal `voice.say('pauseReady')`.
    - Anzeige: „Kurze Pause“ (unterbrochen: „Pause“), Fortschrittsbalken über 30 s, nach `ready` „Tippe zum Weitermachen.“
    - Rechts der Knopf „Fertig für heute“ (`stopPropagation`, sendet `finishToday`).
    - Hochformat oder falsches Fenster: „Bitte das iPad quer halten.“ bzw. „Bitte die App im Vollbild verwenden.“
    - Tippen → `tap` mit `windowOk` (wie bisher `viewportMatches`), dabei `unlockAudio`.
  - **ending:**
    - `await ts.finish()`, falls eine Sitzung läuft.
    - Sitzungen und Durchgänge lesen, `dailyFeedback(dayCounts(heute), dayCounts(gestern) | null)` berechnen und `ended` senden.
  - **feedback:**
    - Anzeige „Heute gefunden“, „X von Y“, Balken und Folgesatz (`follow.text` bzw. `textFor('encouragement')`).
    - Sprechen: `say('end')`, dann `speakText(numbersText)`, dann `speakText(follow.text)` bzw. `say('encouragement')`.
    - Tippen → `voice.cancel()`, `onExit`.
- In `App`:
  - `const voice = useMemo(() => createBrowserVoice(audio), [audio])`.
  - Beim Laden und in `reload()`: `voice.setTexts(settings.announcements)` und `voice.setRecordings(new Map(recs.map(r => [r.key, r.data])))`.
  - Start-Tipp: `unlockAudio(audio); voice.unlock();`, dann Wake Lock wie bisher.

- [ ] **Step 1: Failing tests** in `tests/ui/trainingScreen.test.tsx`
  - Vorbereitung:
    - `TrialStage` per `vi.mock` ersetzen durch eine Komponente, die `props.run({} as RunnerDeps)` beim Mount aufruft.
    - `startTrainingSession` per `vi.mock` liefert eine Fake-Sitzung: `run` erhöht `activeMs` je Aufruf um 300 000 und liefert `aborted: false` (pro Test überschreibbar), `finish` ist ein `vi.fn`.
    - Fake-`Voice` protokolliert `say`/`speakText`-Aufrufe und erfüllt sofort.
    - Fake-`Db` mit `listSessions`/`listTrials`.
    - Fake-Timer, `now` injiziert.
  - Tageslimit: 2 heutige Sitzungen mit `trialCount 1` → Text „Für heute ist genug, morgen geht es weiter.“, Stimme `['greeting', 'dailyLimit']`, `startTrainingSession` nicht aufgerufen.
  - Einleitung: `say('greeting')`, dann `say('instruction')`, erst danach `run`.
  - Hängende Stimme (Review Focus 1): `say('instruction')` erfüllt sich erst nach Fake-Timer-Vorlauf, `run` startet erst danach.
  - Geplante Pause:
    - Nach dem ersten `run` steht „Kurze Pause“ und der Knopf „Fertig für heute“ ist da. `say('pauseStart')` wurde aufgerufen.
    - Tippen bei 10 s → kein zweites `run`.
    - Bei 30 s `say('pauseReady')`. Tippen → zweites `run`.
  - „Fertig für heute“ (Review Focus 4):
    - Klick → `finish` einmal, kein weiteres `run`.
    - Anzeige „5 von 8“ mit passendem Fake-Datenbestand.
    - Stimme: `say('end')`, `speakText('Heute 5 von 8 gefunden.')`, dann `speakText('Gestern waren es 4.')`.
  - Sitzungsende: `settings.sessionMinutes = 10`. Nach dem zweiten `run` (600 000 ms) direkt Rückmeldung ohne Pause, `finish` einmal.
  - Unterbrechung:
    - `run` liefert `aborted: true` → „Pause“, Tippen sofort → weiter.
    - Mit Fensterhochformat (`innerWidth < innerHeight`) → „Bitte das iPad quer halten.“, Tippen → kein `run`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/trainingScreen.test.tsx` → FAIL
- [ ] **Step 3: Implementieren** (TrainingScreen, App, Styles; `SESSION_TRIALS_M2` und sein Import entfernen).
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`; `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): Patientenablauf mit Ansagen, Pausen, Tageslimit und Tagesrückmeldung`

---

### Task 8: PIN-Bereich – Zugang, Startseite, Routen, PIN in der Einrichtung

**Files:**
- Create:
  - `src/ui/admin/pin.ts`
  - `src/ui/admin/PinScreen.tsx`
  - `src/ui/admin/AdminHome.tsx`
  - `src/ui/admin/exportReminder.ts`
  - `src/ui/patient/AdminCorner.tsx`
  - `src/ui/setup/steps/PinStep.tsx`
- Modify:
  - `src/ui/routing.ts`
  - `src/ui/App.tsx`: Entsperrstatus, neue Routen. Seiten aus Task 9–12 zeigen vorerst `AdminHome`.
  - `src/ui/patient/StartScreen.tsx`: `AdminCorner` mit `onAdmin`.
  - `src/ui/setup/SetupWizard.tsx`: Schritt `pin` als 5. Schritt.
  - `src/ui/admin/ExportPage.tsx`: Nach erfolgreichem JSON-Export `lastExportAtIso` setzen. Kopfkommentar „Stand M1 ohne PIN“ entfernen. Link „Zurück“ → `#/admin`.
  - `src/ui/admin/TestPage.tsx`: Link „Zurück“.
  - `src/styles.css`
- Test:
  - `tests/ui/pin.test.ts`
  - `tests/ui/app.test.ts` (resolveRoute)
  - `tests/ui/adminCorner.test.tsx`
  - `tests/ui/pinScreen.test.tsx`
  - `tests/ui/exportReminder.test.ts`
  - `tests/ui/setupStepper.test.tsx` (5 Schritte)

**Interfaces:**
- Consumes: `PinRecord`, `Settings.pin`, `Settings.lastExportAtIso` (Task 4), `Voice.hasLocalGermanVoice`, `Voice.onVoicesChanged` (Task 3), `DISCLAIMER_TEXT`.
- Produces:
  ```ts
  // pin.ts
  export const isValidPin: (pin: string) => boolean;                 // /^\d{4}$/
  export async function hashPin(pin: string, saltHex: string): Promise<string>;
  export async function createPinRecord(pin: string, randomBytes?: (n: number) => Uint8Array): Promise<PinRecord>; // 16 Bytes
  export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean>;
  // routing.ts
  export type Route = 'start' | 'train' | 'setup' | 'pin' | 'admin' | 'settings' | 'voice' | 'eval' | 'report' | 'export' | 'test';
  /** unlocked: PIN in dieser App-Sitzung eingegeben. */
  export function resolveRoute(hash: string, s: Settings, unlocked: boolean): Route;
  // exportReminder.ts
  export const EXPORT_REMINDER_DAYS = 30;
  export function exportReminderDue(lastExportAtIso: string | null, now: Date, hasTrainingSessions: boolean): boolean;
  // AdminCorner.tsx
  export const ADMIN_HOLD_MS = 3000;
  export function AdminCorner(props: { onLongPress(): void; holdMs?: number }): JSX.Element;
  // PinScreen.tsx – create-Modus, wenn settings.pin null (PIN + Wiederholung), sonst Eingabe
  export function PinScreen(props: { db: Db; settings: Settings; onUnlocked(): void; onCancel(): void }): JSX.Element;
  // AdminHome.tsx
  export function AdminHome(props: { db: Db; voice: Voice; onLeave(): void }): JSX.Element;
  ```
  - Hash-Routen:
    - `#/admin` → admin
    - `#/admin/settings` → settings
    - `#/admin/voice` → voice
    - `#/admin/eval` → eval
    - `#/admin/report` → report
    - `#/admin/export` und alt `#/export` → export
    - `#/admin/test` und alt `#/test` → test
    - `#/setup` → setup
    - `#/train` → train
    - sonst → start
  - `resolveRoute`, in dieser Reihenfolge:
    1. ohne Hinweis → `setup`
    2. Admin-Routen sowie `setup` bei vorhandener Geometrie ohne `unlocked` → `pin`
    3. ohne Geometrie und nicht `export` → `setup`
    4. sonst die Route
  - `AdminCorner`:
    - Feste Fläche 64×64 oben rechts, unsichtbar, `aria-label="Bereich für Angehörige"`.
    - `pointerdown` startet einen Timer über `holdMs`.
    - `pointerup`, `pointercancel` und `pointerleave` brechen ab.
    - `click` und `pointerdown` werden mit `stopPropagation` abgefangen.
  - `App`: `onLongPress` → `location.hash = '#/admin'`. `onUnlocked` → entsperrt. `onLeave` → sperren, `#/`.
  - `AdminHome` zeigt:
    - Karten mit Links: Auswertung, Monatsbericht, Einstellungen, Ansagen, Export und Sicherung, Testseite, Einrichtung wiederholen, „Zurück zum Training“.
    - Erinnerungskarte bei `exportReminderDue`: „Bitte die Daten sichern: Wird die App gelöscht, sind alle Daten weg.“
    - Warnkarte, wenn keine lokale deutsche Stimme da ist: „Auf diesem Gerät fehlt eine deutsche Stimme. Bitte in den iPad-Einstellungen unter Bedienungshilfen → Gesprochene Inhalte → Stimmen eine deutsche Stimme laden oder eigene Aufnahmen machen.“
    - `DISCLAIMER_TEXT` als Fußzeile.
  - `PinStep`:
    - Zwei Felder (`inputmode="numeric"`, `type="password"`, `maxLength 4`), „PIN speichern“ nur bei gültiger und gleicher PIN.
    - Bei vorhandener PIN zusätzlich „PIN behalten“.

- [ ] **Step 1: Failing tests**
  - `hashPin('1234', '00')` gleich `createHash('sha256').update('001234').digest('hex')` aus `node:crypto`.
  - `createPinRecord('1234', n => new Uint8Array(n).fill(171))` → `saltHex` `'ab'.repeat(16)`.
  - `verifyPin` richtig → true, `'1235'` → false.
  - `isValidPin`: `'123'`, `'12345'` und `'12a4'` → false.
  - `resolveRoute`:
    - `('#/admin', ready, false)` → `'pin'`; `('#/admin', ready, true)` → `'admin'`.
    - `('#/test', ready, false)` → `'pin'`.
    - `('#/setup', ready, false)` → `'pin'`.
    - `('#/setup', {…ready, geometry: null}, false)` → `'setup'` (Ersteinrichtung ohne PIN).
    - `('#/export', {…ready, geometry: null}, true)` → `'export'`.
    - ohne Hinweis → immer `'setup'`.
    - `('#/', ready, false)` → `'start'`.
    - die bestehenden Fälle mit `unlocked: true` angepasst.
  - `AdminCorner` mit Fake-Timern:
    - `pointerdown`, 2999 ms → nicht ausgelöst; 3000 ms → einmal.
    - `pointerdown`, 1000 ms, `pointerup`, 5000 ms → nicht ausgelöst.
    - Im `StartScreen` (Review Focus 4): Klick auf die Ecke ruft `onStart` nicht auf. Langes Drücken auch nicht, aber `onAdmin` einmal.
  - `PinScreen`:
    - Bei gespeicherter PIN führt die richtige Eingabe zu `onUnlocked`.
    - Eine falsche Eingabe zeigt „Falsche PIN.“.
    - Ohne PIN (create): Zwei gleiche gültige Eingaben speichern `settings.pin` und rufen `onUnlocked`.
  - `exportReminderDue`:
    - `(null, d, false)` → false; `(null, d, true)` → true.
    - Letzter Export vor 29 Tagen → false, vor 30 Tagen → true.
  - Einrichtung zeigt „Schritt 5 von 5“ im PIN-Schritt.
- [ ] **Step 2: Run** die genannten Testdateien → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`; `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): PIN-Bereich mit langem Drücken, PIN-Eingabe und Startseite`

---

### Task 9: Einstellungen im PIN-Bereich

**Files:**
- Create: `src/ui/admin/SettingsPage.tsx`, `src/ui/admin/TempoSection.tsx` (aus `ExportPage.tsx` herausgelöst, unverändert im Verhalten), `src/ui/admin/settingsActions.ts`
- Modify: `src/ui/admin/ExportPage.tsx` (ohne Tempo), `src/ui/App.tsx` (Route `settings`), `tests/ui/tempoSection.test.tsx` (Importpfad)
- Test: `tests/ui/settingsActions.test.ts`, `tests/ui/settingsPage.test.tsx`

**Interfaces:**
- Consumes: `clampSessionMinutes`, `SESSION_MINUTES_LIMITS` (Task 1), `GridConfig`, `GRID_LIMITS`, `clampGrid`, `createControllerState(g, grid)` (Task 2), `setStageManually`, `STAGES`, `planningGeometry`.
- Produces:
  ```ts
  export const HALF_LIFE_LIMITS = { min: 3, max: 20 } as const;
  export function applySessionMinutes(s: Settings, minutes: number): Settings;  // clampSessionMinutes
  export function applyGrid(s: Settings, grid: Partial<GridConfig>): Settings;  // clampGrid
  export function withManualStage(c: ControllerState, stage: Stage, atIso: string): ControllerState; // phase = setStageManually(...)
  export function withHalfLife(c: ControllerState, sessions: number): ControllerState; // gerundet, begrenzt auf 3..20
  /** Gespeicherter Controller oder neu angelegt aus Einstellungen (Geometrie der Einrichtung, Raster); null ohne Geometrie. */
  export async function loadOrCreateController(db: Db, s: Settings): Promise<ControllerState | null>;
  export function SettingsPage(props: { db: Db; onChanged(): void }): JSX.Element;
  ```
  Abschnitte der Seite (je eine `.card`, jede mit eigenem Speichern und Rückmeldung „Gespeichert. Gilt ab der nächsten Sitzung.“):
  1. Sitzungsdauer: Auswahl 10/15/20/25/30 Minuten.
  2. Tempo: `TempoSection`.
  3. Raster: drei Auswahlen (Start 2–6°, Abstand 3–8°, Winkel 10/15/20/30°). Darunter der Hinweis: „Eine Änderung legt eine neue Karte an. Die alte bleibt gespeichert und ist in der Auswertung sichtbar.“
  4. Phase:
     - Aktuelle Stufe und die letzten 5 Einträge aus `phase.log` (Datum, von → zu, Grund deutsch: Wechsel/Rückschritt/von Hand).
     - Auswahl aus `STAGES` und „Phase setzen“ mit `confirm()`-Rückfrage.
  5. Vergessen: Halbwertszeit in Sitzungen (Zahl 3–20).
  6. Geometrie und Kreuzposition: Knopf „Einrichtung wiederholen“ → `#/setup`.

- [ ] **Step 1: Failing tests**
  - `applySessionMinutes(s, 45).sessionMinutes === 30`.
  - `applyGrid(s, {angleStepDeg: 30}).grid` gleich `{3, 5, 30}`.
  - `withManualStage(c, '3a', iso)`:
    - `phase.stage === '3a'`
    - `phase.log.at(-1)` gleich `{from: '1', to: '3a', reason: 'manual', atIso: iso}`
    - Eingabe unverändert (tiefer Vergleich mit Kopie)
  - `withHalfLife(c, 2.4).halfLifeSessions === 3`, `withHalfLife(c, 50).halfLifeSessions === 20`.
  - `loadOrCreateController` ohne gespeicherten Controller und mit Geometrie: Signatur passt zu `settings.grid`. Ohne Geometrie → `null`.
  - Seite (jsdom, fake-indexeddb):
    - Sitzungsdauer 20 wählen und speichern → `getSettings().sessionMinutes === 20`, `onChanged` aufgerufen.
    - Phase „2“ setzen mit gestubbtem `confirm → true` → `getController().phase.stage === '2'`. Mit `confirm → false` → unverändert.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Einstellungen für Sitzung, Raster, Phase und Vergessen`

---

### Task 10: Ansagen im PIN-Bereich – Texte und eigene Aufnahmen

**Files:**
- Create: `src/ui/admin/VoicePage.tsx`
- Modify: `src/ui/App.tsx` (Route `voice`; nach Änderungen `reload()` lädt Texte und Aufnahmen in die Voice)
- Test: `tests/ui/voicePage.test.tsx`

**Interfaces:**
- Consumes: `ANNOUNCEMENT_KEYS`, `DEFAULT_ANNOUNCEMENTS`, `textFor`, `Voice` (Task 3), `startRecording`, `pickRecordingMime`, `RECORDING_MAX_MS` (Task 3), `db.listRecordings/saveRecording/deleteRecording`, `Settings.announcements` (Task 4).
- Produces: `VoicePage(props: { db: Db; voice: Voice; audio: AudioEngine; onChanged(): void; startRec?: typeof startRecording })`. `startRec` ist nur für Tests injizierbar.
  - Bezeichnungen je Ansage:
    - greeting „Begrüßung“
    - instruction „Anleitung zu Beginn“
    - pauseStart „Pause beginnt“
    - pauseReady „Pause: weitermachen“
    - end „Ende der Übung“
    - dailyLimit „Tageslimit erreicht“
    - encouragement „Ermutigung“
  - Je Ansage eine Zeile:
    - Textfeld (Platzhalter = Standardtext), „Standard“ (leert das Feld), „Anhören“ (`voice.setTexts(Entwurf)`, dann `voice.say(key)`).
    - Aufnahme: „Aufnehmen“ → „Stopp (max. 15 s)“ → „Probe anhören“ (`audio.playClip`) / „Speichern“ / „Verwerfen“.
    - Bei gespeicherter Aufnahme: „Aufnahme gilt“, „Aufnahme anhören“, „Aufnahme löschen“.
  - Hinweis oben: „Gibt es eine Aufnahme, wird sie statt der Stimme abgespielt. Zahlen in der Tagesrückmeldung spricht immer die Systemstimme.“
  - Warnkarte wie auf der Startseite, wenn `!voice.hasLocalGermanVoice()`.
  - Ohne MediaRecorder (`pickRecordingMime` → null): „Aufnehmen“ deaktiviert, mit Hinweis „Aufnahmen werden von diesem Browser nicht unterstützt.“
  - „Texte speichern“ schreibt nur Texte, die vom Standard abweichen und nicht leer sind, nach `settings.announcements`, dann `onChanged()`.

- [ ] **Step 1: Failing tests** (jsdom, fake-indexeddb, Fake-Voice, Fake-`startRec`)
  - Text für `end` auf „Prima, fertig.“ ändern und speichern → `getSettings().announcements` gleich `{end: 'Prima, fertig.'}`, `onChanged` aufgerufen. Text gleich dem Standard → nicht gespeichert.
  - Aufnehmen, Stopp, Speichern: `listRecordings()` enthält `{key: 'greeting', mimeType: 'audio/mp4', data}` mit den Bytes des Fakes. Die Zeile zeigt „Aufnahme gilt“.
  - „Aufnahme löschen“ entfernt den Eintrag.
  - Fake-Voice mit `hasLocalGermanVoice() → false` → Warntext sichtbar.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Ansagetexte und eigene Aufnahmen im PIN-Bereich`

---

### Task 11: Auswertung – Karte mit Regler und Differenz, Verläufe mit Phasenlinien

**Files:**
- Create: `src/ui/admin/analysis.ts`, `src/ui/admin/LineChart.tsx`, `src/ui/admin/EvaluationPage.tsx`
- Modify: `src/ui/admin/MapView.tsx` (Differenzdarstellung), `src/ui/mapColors.ts` (+ `diffColor`), `src/ui/App.tsx` (Route `eval`)
- Test: `tests/ui/analysis.test.ts`, `tests/ui/lineChart.test.tsx`, `tests/ui/mapView.test.tsx`, `tests/ui/mapColors.test.ts`

**Interfaces:**
- Consumes: `TrialRecord`, `SessionRecord`, `MapSnapshot` (mit `guess`), `regionOf`, `REGIONS`, `Stage`, `cellsFromMap`.
- Produces:
  ```ts
  // analysis.ts
  export function median(xs: readonly number[]): number | null;
  /** Winkel aus der Rasterpunkt-ID `L-e8-a-30` → -30; null bei fremdem Format. */
  export function gridAngleFromId(id: string | null): number | null;
  export interface SessionPoint {
    sessionId: string; startedAtIso: string; stage: Stage | null; minutes: number | null;
    lightOnlyHitRate: number | null;  // links, sound 'none', hit/(hit+miss)
    leftHitRate: number | null;       // links, alle Tonbedingungen, hit/(hit+miss)
    rtLeftMedianMs: number | null;    // Median rtMs der linken Treffer
    rtRightMedianMs: number | null;   // Median rtMs der rechten Treffer
    stairMean: Record<Region, number | null>; // Mittel stairBefore je Region (Region über gridAngleFromId)
    wrongSideHitRate: number | null;  // links, sound 'wrongSide', hit/(hit+miss)
    falseAlarmRate: number | null;    // catch: falseAlarm/(falseAlarm+correctRejection)
  }
  /** Trainingssitzungen mit ≥ 1 nicht abgebrochenem Durchgang, nach startedAtIso sortiert; minutes = summary.durationMin. */
  export function sessionPoints(sessions: readonly SessionRecord[], trials: readonly TrialRecord[]): SessionPoint[];
  /** Index jedes Punkts, dessen Stufe sich von der letzten bekannten Stufe davor unterscheidet. */
  export function phaseLines(points: readonly SessionPoint[]): Array<{ index: number; stage: Stage }>;
  // MapView.tsx
  /** to − from je Punkt (p und theta); null, wenn die Punkt-IDs nicht übereinstimmen (Raster geändert). */
  export function diffCells(from: MapCell[], to: MapCell[]): MapCell[] | null;
  export function MapView(props: { title: string; cells: MapCell[]; mode: MapMode; diff?: boolean }): JSX.Element;
  // mapColors.ts
  /** improvement in [-1, 1]: 0 neutral grau, > 0 Richtung Akzent Petrol, < 0 Richtung Bernstein; geklemmt. */
  export function diffColor(improvement: number): string;
  // LineChart.tsx
  export interface Series { label: string; values: ReadonlyArray<number | null>; color: string }
  export function LineChart(props: {
    title: string; series: Series[]; count: number; yMin: number; yMax: number; yTicks: number[];
    formatY(v: number): string; phaseLines: Array<{ index: number; label: string }>;
  }): JSX.Element;
  ```
  - MapView mit `diff`:
    - Bei `mode 'prob'` ist die Verbesserung = Δp. Bei `'theta'` ist sie = −Δθ / 4. Beides wird auf [−1, 1] geklemmt.
    - Legende „schlechter – gleich – besser“.
  - LineChart:
    - SVG mit `role="img"` und `aria-label` = Titel.
    - Je Serie ein `path`. `null` unterbricht die Linie (neues `M`). Jeder Wert hat einen Kreis.
    - Phasenlinien sind senkrechte gestrichelte Linien mit Beschriftung „Phase 2“ usw.
    - Bei `count < 2` steht statt des Diagramms „Noch zu wenige Sitzungen.“
  - EvaluationPage:
    - **Karte:**
      - Snapshots `reason 'sessionEnd'` nach `atIso`.
      - Regler „Sitzung“ (Datum der Sitzung).
      - Nebeneinander „Trefferwahrscheinlichkeit (Stufe 6)“ und „Schwelle“.
      - Schalter „Vergleich“ mit zweitem Regler „mit Sitzung“, der Standard ist die erste. Dann zeigen beide Karten die Differenz.
      - `diffCells` → null: „Das Raster wurde dazwischen geändert, ein Vergleich ist nicht möglich.“
      - Ohne Snapshot: „Noch keine abgeschlossene Sitzung.“
      - `guess` aus dem Snapshot, sonst aus dem aktuellen Controller, sonst `{falseAlarms: 0, catchTrials: 0}`.
    - **Verläufe:**
      1. Trefferquote links (nur Licht und gesamt), 0–100 %
      2. Reaktionszeit Median links/rechts, ms
      3. Mittlere Treppenstufe oben/Mitte/unten, 0–11
      4. Falsch-Ton-Treffer und Falsch-Alarm-Rate, 0–100 %
      5. Textzeile „Erste Blicksprünge nach links: ab Meilenstein 4 (Kamera).“
    - Phasenlinien in allen Diagrammen.

- [ ] **Step 1: Failing tests**
  - `median([3, 1, 2]) === 2`, `median([1, 2, 3, 4]) === 2.5`, `median([]) === null`.
  - `gridAngleFromId('L-e8-a-30') === -30`, `('L-e13-a90') === 90`, `('x') === null`, `(null) === null`.
  - `sessionPoints` mit konstruierten Durchgängen einer Sitzung:
    - Links: 3 Treffer und 1 Fehlversuch mit `sound 'none'`, 2 Treffer mit `sync`, 1 Fehlversuch mit `wrongSide`, 1 Vorwegnahme.
    - Rechts: 2 Treffer mit `rtMs` 400/600.
    - Ohne Reiz: 1 Falschalarm und 3 korrekte Zurückweisungen.
    - Erwartet:
      - `lightOnlyHitRate` 0,75
      - `leftHitRate` 5/7
      - `wrongSideHitRate` 0
      - `falseAlarmRate` 0,25
      - `rtRightMedianMs` 500
    - Eine Sitzung nur mit abgebrochenen Durchgängen fehlt in der Liste. Eine Referenzsitzung fehlt auch.
  - `stairMean`: Zwei linke Durchgänge am Punkt `L-e8-a30` mit `stairBefore` 4 und 6 ergeben Mitte 5 (30° gehört zu Mitte, auch bei verschobenem `pos.angleDeg = 30.8`). Oben und unten sind `null`.
  - `phaseLines` für Stufen `['1', '1', null, '2', '2', '3a']` → `[{index: 3, stage: '2'}, {index: 5, stage: '3a'}]`.
  - `diffCells`: gleiche IDs → `p` = Differenz. Andere IDs → `null`.
  - `diffColor(0)` neutral (gleich `diffColor(-0)`). `diffColor(2)` gleich `diffColor(1)`. `diffColor(1) !== diffColor(-1)`.
  - LineChart:
    - Serie `[0.5, null, 0.7, 0.8]` → ein `path`, dessen `d` zwei `M` enthält, und 3 Kreise.
    - `phaseLines` mit 2 Einträgen → 2 Linien mit Text „Phase 2“ / „Phase 3a“.
    - `count 1` → Text „Noch zu wenige Sitzungen.“
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Auswertung mit Kartenvergleich und Verläufen`

---

### Task 12: Monatsbericht als Druckansicht

**Files:**
- Create: `src/ui/admin/report.ts`, `src/ui/admin/ReportPage.tsx`
- Modify: `src/ui/App.tsx` (Route `report`), `src/styles.css` (`@media print`)
- Test: `tests/ui/report.test.ts`, `tests/ui/reportPage.test.tsx`

**Interfaces:**
- Consumes: `sessionPoints`, `phaseLines`, `LineChart`, `MapView`, `cellsFromMap` (Task 11), `DISCLAIMER_TEXT`.
- Produces:
  ```ts
  export function monthKeyOf(dayKey: string): string;            // '2026-10-11' → '2026-10'
  export function shiftMonth(month: string, delta: number): string; // '2026-01', -1 → '2025-12'
  export function monthLabel(month: string): string;              // '2026-10' → 'Oktober 2026'
  export interface MonthReport {
    month: string; fromDay: string; toDay: string;          // erster und letzter Kalendertag
    sessionCount: number;                                   // Trainingssitzungen mit trialCount ≥ 1 im Monat
    minutes: number;                                        // Summe summary.durationMin, gerundet
    startSnapshot: MapSnapshot | null;                      // letzter sessionEnd-Snapshot vor Monatsbeginn, sonst erster im Monat
    endSnapshot: MapSnapshot | null;                        // letzter sessionEnd-Snapshot im Monat
    points: SessionPoint[];                                 // sessionPoints der Sitzungen des Monats
    stageAtEnd: Stage | null;                               // Stufe der letzten Sitzung des Monats
  }
  export function monthReport(month: string, sessions: readonly SessionRecord[], trials: readonly TrialRecord[], snapshots: readonly MapSnapshot[]): MonthReport;
  export function ReportPage(props: { db: Db; now?: Date }): JSX.Element;
  ```
  - Inhalt der Seite:
    - Monatsauswahl „‹ Vormonat“ und „Folgemonat ›“, `.no-print`.
    - Titel „Monatsbericht Oktober 2026“.
    - Zeitraum „1.10.2026 – 31.10.2026“.
    - Sitzungen, Minuten, Phase am Monatsende.
    - Karten „Anfang des Monats“ / „Ende des Monats“ (Trefferwahrscheinlichkeit).
    - Verläufe 1 und 2 aus Task 11.
    - `DISCLAIMER_TEXT`.
    - Knopf „Drucken oder als PDF sichern“ → `window.print()` (`.no-print`).
  - Druck-CSS: Navigation und Knöpfe ausblenden, Seitenumbruch vor den Verläufen vermeiden, Diagramme in voller Breite. Heller Hintergrund nur im Druck.

- [ ] **Step 1: Failing tests**
  - `shiftMonth('2026-01', -1) === '2025-12'`, `shiftMonth('2026-12', 1) === '2027-01'`.
  - `monthLabel('2026-10') === 'Oktober 2026'`.
  - `monthReport('2026-10', …)`:
    - Daten: Sitzungen am 30.9., 2.10. (20 min), 15.10. (30 min), eine Sitzung am 16.10. mit `trialCount 0`, 1.11.
    - Erwartet: `sessionCount 2`, `minutes 50`, `fromDay '2026-10-01'`, `toDay '2026-10-31'`.
    - `startSnapshot` ist der vom 30.9.
    - `endSnapshot` ist der vom 15.10.
    - `stageAtEnd` ist die Stufe der Sitzung vom 15.10.
  - Ohne Sitzungen: `sessionCount 0`, Snapshots `null`, `stageAtEnd null`.
  - Seite:
    - zeigt Titel und `DISCLAIMER_TEXT`.
    - Klick auf „Drucken oder als PDF sichern“ ruft gestubbtes `window.print` einmal auf.
    - „‹ Vormonat“ wechselt auf „September 2026“.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Run** → PASS; ganze Suite; `npm run typecheck`; `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): Monatsbericht als Druckansicht`

---

### Task 13: README, offene Punkte, Spec-Entscheidungen

**Files:**
- Modify: `README.md`, `docs/offene-punkte-m2.md`, `docs/superpowers/specs/2026-10-11-sehtraining-design.md` (§18 Punkt 11)

- [ ] **Step 1: README „Tägliche Nutzung“ neu.** Für den Angehörigen geschrieben, in kurzen Sätzen:
  - Start-Tipp.
  - Begrüßung und Anleitung.
  - Takt: 30 Minuten mit Pause alle 5 Minuten, mindestens 30 s.
  - Knopf „Fertig für heute“.
  - Tageslimit 2.
  - Tagesrückmeldung.
  - Lautstärke etwa halb.
- [ ] **Step 2: README „Bereich für Angehörige“.**
  - Zugang: 3 s oben rechts drücken, dann PIN. Die PIN notieren: Ohne PIN gibt es keinen Zugang zum Export.
  - Seiten: Einstellungen, Ansagen und Aufnahmen, Auswertung (Karte und Verläufe lesen), Monatsbericht (Drucken → PDF über das Teilen-Menü), Export und Erinnerung.
  - PIN und Aufnahmen sind nicht im Export enthalten.
  - Deutsche Stimme auf dem iPad laden: Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch.
  - Der Abschnitt „Einrichtung“ bekommt den PIN-Schritt.
- [ ] **Step 3:** In `docs/offene-punkte-m2.md` die durch M3 erledigten Punkte als erledigt markieren:
  - Task 8: App geschlossen bzw. doppeltes Vergessen.
  - Task 10: Hochformat in der Pause.
  - Final: MIN_SESSION_MIN erreichbar.
  - Task 8: durationMin (schon in M2 behoben).
- [ ] **Step 4:** Spec §18 um Punkt 11 ergänzen: die acht „Festlegungen dieses Plans“ in je einem Satz, mit Datum der Bestätigung.
- [ ] **Step 5: Prüfen:** `npm test`, `npm run typecheck` und `npm run build` grün.
- [ ] **Step 6: Commit** `docs: README für tägliche Nutzung und PIN-Bereich, Entscheidungen M3`
