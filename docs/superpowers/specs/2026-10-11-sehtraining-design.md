# Sehtraining – Design (Spec v1)

Stand: 11.10.2026. Grundlage: Implementierungs-Prompt „Audiovisuelles Sehtraining bei Hemianopsie“ und die Entscheidungen im Gespräch vom 11.10.2026 (Abschnitt 18).

## 1. Zweck und Rahmen

Tägliches Heimtraining für einen 72-jährigen Mann mit homonymer Hemianopsie nach links (ohne Makulaaussparung) nach Posteriorinfarkt rechts 2021, mit Thalamusbeteiligung und leichten visuell-räumlichen und kognitiven Einschränkungen. Er liest schlecht, ist nicht technikaffin und bedient die App allein. Ein Angehöriger (Entwickler) richtet sie ein und wertet aus.

Ziel des Trainings: bessere Exploration nach links und schnelleres Erkennen von Dingen links, über audiovisuelle Kopplung (räumlich und zeitlich passender Ton zum Lichtreiz). Nicht Ziel: Wiederherstellung des Gesichtsfelds.

Die App ist **kein Medizinprodukt** und stellt keine Diagnosen. Sie ergänzt ärztlich begleitetes Training. Der Hinweis erscheint im Einrichtungsassistenten und muss dort bestätigt werden. Er steht außerdem dauerhaft im PIN-Bereich und im Monatsbericht.

**Erfolg heißt:** Er trainiert allein und gern. Die Karte zeigt nachvollziehbar Veränderungen an der Grenzzone. Angehöriger und Arzt bekommen saubere, exportierbare Daten.

## 2. Plattform und Auslieferung

- **Gerät:** iPad (iPadOS, Safari/WebKit). Jeder Browser auf dem iPad nutzt WebKit.
- **Auslieferung:** PWA, statisch ausgeliefert über Cloudflare (Workers mit statischen Assets, `wrangler.jsonc`) aus dem öffentlichen Repo `mauricexvdl7-spec/hemianopsie-av-training`. Er installiert sie einmal über „Zum Home-Bildschirm“. Danach läuft sie offline über einen Service Worker, Updates kommen beim nächsten Start mit Netz.
- **Datenschutz:** kein Backend, keine Cloud, keine Telemetrie, keine Analytics, keine externen Schriften oder CDNs. Alle Daten liegen in IndexedDB auf dem iPad. Ins Repo kommt nur Code, nie Exporte, Fotos oder Aufnahmen.
- **Dieselbe PWA läuft auch in Chrome am Windows-PC.** Das ist nur für Auswertung und den optionalen Serial-Trigger gedacht.
- **Plattformgrenzen iPad:**
  - Kein Web Serial.
  - Hardware-Lautstärke ist nicht lesbar.
  - Audio und Sprache erst nach einer Berührung.
  - Fullscreen-API nicht verfügbar, die Home-Bildschirm-PWA läuft aber randlos.

## 3. Technik

- Vite + TypeScript (strict), Preact für Bildschirme, Canvas 2D für Reize, eigene SVG-Diagramme.
- Vitest für Unit-Tests (Node-Umgebung für `core/`, jsdom wo nötig), `fake-indexeddb` für Speicher-Tests.
- `vite-plugin-pwa` (Workbox) mit Precache aller Assets, auch MediaPipe-WASM und Modell.
- `@mediapipe/tasks-vision` (Face Landmarker) ab Meilenstein 4, lokal gebündelt.
- GitHub-Actions-Workflow: Tests → Build → Deploy auf Pages bei Push auf `main`.
- Sprache: Code und Bezeichner englisch, alle Texte für Nutzer, README und Doku deutsch.

## 4. Architektur

```
src/
  core/        reine Logik, kein DOM, kein Audio, keine Uhr, Zufall nur über seedbaren RNG
    geometry   Grad ↔ Pixel
    safety     prüft jeden Reizplan
    map        Schwellen-Karte
    selector   Ortswahl
    staircase  2-down-1-up je Region
    phases     Phasen, Wechselkriterium, Tonbedingungen
    session    Durchgangsplan, Mischung, Zeitplan, Pausen, Tageslimit, Ergebnisverarbeitung
    sim        simulierter Proband
    rng        seedbarer Zufallsgenerator
  io/          Browser-Anbindung
    audio      Web Audio: HRTF-Panner (Kopfhörer) oder StereoPanner (Lautsprecher), Hüllkurven, Deckel
    voice      speechSynthesis (lokale deutsche Stimme bevorzugt) + eigene Aufnahmen
    input      Tippen (Pointer Events) und Tasten (Buzzer als Tastatur), Zeitstempel
    camera     MediaPipe, Blickabbildung, Fixation, Sakkaden (M4)
    trigger    TriggerOutput, LogTrigger, SerialTrigger (M6)
    wakelock   Bildschirm wach halten
  store/       IndexedDB, Schema-Versionen, Export JSON/CSV, Import
  ui/
    patient    Start, Durchgang, Pause, Tagesrückmeldung
    setup      Einrichtungsassistent
    admin      PIN-Bereich: Einstellungen, Auswertung, Export, Bericht, Testseite
    daily      Alltagsmodule (M5)
```

**Regel:** `core/` hängt von nichts außerhalb von `core/` ab. Zeit kommt als Parameter herein (ms), Zufall über `rng`. Das ganze Trainingsprotokoll läuft damit in Node-Tests und mit dem simulierten Probanden.

**Datenfluss pro Durchgang:**
1. `session.nextTrial(state, rng)` liefert einen `TrialPlan`. Darin stehen Typ, Ort in Grad, Stufe, Tonbedingung, SOA, Wartezeit und Antwortfenster.
2. `safety.check(plan)` prüft den Plan. Bei Verstoß wird der Durchgang verworfen und protokolliert.
3. `ui/patient` und `io` führen den Plan aus. Zeiten kommen von `performance.now()`, Eingaben über `event.timeStamp`.
4. `session.applyResult(state, plan, response)` aktualisiert Karte, Treppe, γ-Schätzung und Zähler und liefert einen `TrialRecord`.
5. `store` schreibt den Datensatz sofort, damit bei einem Abbruch nichts verloren geht.

## 5. Geometrie

- Eingaben: sichtbare Bildschirmbreite in cm (Lineal), Sitzabstand d in cm, Fixationskreuz-Position (Anteil der Breite, Standard 2/3, also nach rechts versetzt).
- Pixel pro cm = Fensterbreite in CSS-Pixeln / Breite in cm.
- Ort in Polarkoordinaten (Exzentrizität e, Winkel φ; φ = +90° oben, 0° links horizontal bzw. rechts für das rechte Feld, −90° unten). Umrechnung auf den flachen Bildschirm über Zentralprojektion: Abstand vom Kreuz = d · tan(e), Richtung φ.
- Größen (σ des Gauß-Flecks) werden lokal am Reizort in Pixel umgerechnet, mit dem radialen Maßstab d · (tan(e + σ) − tan(e)).
- Funktionen: `degToPx`, `pxToDeg`, `screenExtentDeg` (größte Exzentrizität je Richtung), `fitsOnScreen(pos, marginDeg)`.
- Tests: Hin- und Rückrechnung, Werte gegen Hand-Rechnung, Randfälle.

## 6. Reize, Ton und Durchgang

**Lichtreiz:**
- Gauß-Fleck, hell auf dunkelgrauem Hintergrund (#3c3c3c).
- Hüllkurve standardmäßig 1000 ms: 150 ms Cosinus-Rampe hoch, 700 ms Plateau, 150 ms Rampe runter. Das Plateau ist einstellbar (300–1500 ms, Entscheidung 8).

**Reizstufen:**
- 12 Stufen L = 0…11, logarithmisch abgestuft.
- Stufen 0–8 erhöhen den Kontrast (Weber-Kontrast von etwa 0,05 bis zum Deckel), σ bleibt 0,5°.
- Stufen 9–11 lassen σ bis 1,5° wachsen, der Kontrast bleibt am Deckel.
- Die Tabelle steht in `core/stimulus` und ist konfigurierbar.

**Ton:**
- Rosa Rauschen mit derselben Hüllkurve (Rampen mindestens 100 ms).
- Position in Grad entspricht dem Lichtort (Azimut, Elevation).
- Ausgabe Kopfhörer: `PannerNode` mit `panningModel = "HRTF"`.
- Ausgabe Lautsprecher: `StereoPannerNode`, Pan = sin(Azimut). Damit gibt es nur die horizontale Richtung.

**Ablauf eines Durchgangs:**
1. Fixationskreuz (1°, hellgrau). Ansage „Schau auf das Kreuz.“ beim ersten Durchgang jeder Sitzung.
2. Ohne Kamera: zufällige Wartezeit standardmäßig 1,5–3,5 s, gleichverteilt, einstellbar (untere Grenze nie unter 1,0 s). Mit Kamera: Start, sobald der Blick 500 ms stabil auf dem Kreuz liegt (Toleranz 4°). Nach 5 s ohne stabile Fixation startet der Reiz trotzdem, mit `fixationOk = false`.
3. Reiz und Ton nach Phase (Abschnitt 9). Die Reizzeit t0 ist der Beginn der Lichtrampe.
4. Antwort: Tippen irgendwo auf den Bildschirm oder ein Tastendruck (Buzzer).
   - Antwort 150 ms bis T nach t0: Treffer.
   - Antwort vor 150 ms: vorweggenommen.
   - Antwort bei einem Durchgang ohne Reiz: falscher Alarm.
   - T = Median + 3 · MAD der Referenz-Reaktionszeiten, begrenzt auf 2000–3000 ms (Untergrenze einstellbar 1500–4000 ms; liegt sie über 3000 ms, gilt sie auch als Obergrenze).
5. Optional (Einstellung, Standard aus): Nach dem Treffer zeigt er auf die Stelle. Gespeichert werden der Zeigeort und der Fehler in Grad.
6. Rückmeldung: Bei einem Treffer ein leiser, weicher Glockenton. Sonst nichts. Es gibt keine negativen Geräusche.
7. Zwischen dem Ende eines Reizes und dem Beginn des nächsten liegt mindestens 1 s.

**Mischung je Block:**
- 70 % links mit Reiz.
- 20 % rechts mit Reiz. Ort gespiegelt aus dem linken Raster, soweit er auf den Bildschirm passt. Stufe = Referenzstufe.
- 10 % ohne Reiz.
- Die Anteile werden blockweise (je 20 Durchgänge) ausgelost und gemischt.

## 7. Schwellen-Karte (`core/map`)

**Entscheidung A (11.10.2026):** eine Schwellen-Karte statt einer Beta-Karte. Begründung: Die Treppe hält die Trefferquote bei etwa 70 %. Eine Karte, die nur Treffer zählt, würde in jeder geregelten Region gegen 0,7 laufen und Fortschritt nicht von Reizänderung trennen. Die Schwellen-Karte nutzt die Stufe jedes Durchgangs als bekannte Größe und damit alle Durchgänge. Sie braucht nur Arrays fester Größe und keine Optimierung, ist also numerisch stabil.

**Raster:**
- Exzentrizitäten ab 3° in Schritten von 5° (3, 8, 13, …), Winkel von +90° bis −90° in Schritten von 15°.
- Punkte, die mit 1° Rand nicht auf den Bildschirm passen, entfallen.
- Rastergröße und Schritte sind konfigurierbar. Bei einer Änderung wird die Karte neu angelegt, die alte bleibt als Snapshot erhalten.
- Jeder Reiz wird in der Zelle um bis zu ±1° verschoben, gespeichert wird die tatsächliche Position.

**Zustand je Punkt:** Log-Gewichte über das Schwellengitter θ ∈ {−1,0; −0,5; …; 14,0} (31 Werte). Werte über 11 bedeuten „mit keiner verfügbaren Stufe sichtbar“.

**Psychometrische Funktion (fest):**
p(Treffer | L, θ) = γ + (1 − γ − λ) · 1 / (1 + exp(−(L − θ) / s))
mit s = 1 Stufe und λ = 0,04. Dabei ist γ die Rate-Wahrscheinlichkeit. Sie wird aus den Durchgängen ohne Reiz als Beta(1, 19)-Posterior geschätzt (Mittelwert, Prior ≈ 5 %).

**Update** bei einem Durchgang am Ort x mit Stufe L und Antwort r:
- Jeder Punkt j bekommt w_j · log p(r | L, θ) auf seine Log-Gewichte, mit w_j = exp(−d(x, j)² / (2 · 4°²)).
- Gewichte w_j < 0,05 werden ignoriert.
- Der Abstand d ist der Winkelabstand zwischen den Richtungen.

**Vergessen:** Zu Beginn jeder Sitzung werden die angesammelten Log-Likelihoods mit ρ = 0,5^(1/H) multipliziert, wobei H die Halbwertszeit in Sitzungen ist (Standard 7). Der Prior ist gleichverteilt über das θ-Gitter.

**Ausgaben je Punkt:**
- Posterior von θ (normiert), Mittelwert und Standardabweichung.
- p bei Stufe L: Erwartungswert über die Posterior.
- Unsicherheit von p: Standardabweichung über die Posterior.
- p bei der Referenzstufe (Standard L = 6) für die Heatmap.

Nach jeder Sitzung wird ein Snapshot der Karte gespeichert.

**Durchgänge, die die Karte aktualisieren:** alle linken Durchgänge mit Reiz, bei denen eine Antwort ausgewertet werden konnte, gleich welche Tonbedingung. Vorweggenommene Antworten zählen nicht. Rechte Kontrolldurchgänge aktualisieren die Karte nicht, und die Glättung überschreitet die vertikale Mittellinie nicht. Sonst würden Treffer im sehenden Feld die Schwellen nahe der Mittellinie links fälschlich senken, gerade an der scharfen Grenze einer Hemianopsie.

## 8. Ortswahl (`core/selector`) und Treppe (`core/staircase`)

**Ortswahl für linke Durchgänge:**
- Für jeden linken Punkt j: p_j bei der aktuellen Stufe seiner Region und die Unsicherheit u_j.
- Score_j = u_j · exp(−((p_j − 0,625) / 0,15)²).
- Mit Wahrscheinlichkeit 0,85 wird proportional zum Score gezogen, sonst gleichverteilt über alle linken Punkte.
- Derselbe Punkt kommt nicht zweimal direkt hintereinander.
- Sind alle Scores 0, wird gleichverteilt gezogen.

**Treppe:**
- Drei Regionen links: oben (φ > +30°), Mitte (−30° ≤ φ ≤ +30°), unten (φ < −30°).
- Je Region gilt 2-down-1-up auf der Stufe. Bis zur ersten Umkehr wird um 2 Stufen verstellt, danach um 1. Die Grenzen sind 0 und 11. Ziel sind ≈ 70,7 % Treffer.
- Der Zustand (Stufe, Zähler, Umkehrungen) bleibt über Sitzungen erhalten.
- Die Startstufe ist die Mitte (6).
- Für die Treppe zählen nur linke Durchgänge mit Reiz und ohne Falsch-Ton.
- Rechte Durchgänge laufen auf der Referenzstufe.

## 9. Phasen (`core/phases`)

| Phase | Unterstufen | Ton |
|---|---|---|
| 1 | – | gleichzeitig mit dem Licht (SOA 0), gleicher Ort |
| 2 | – | Ton führt um 100–300 ms (gleichverteilt) |
| 3 | 3a −6 dB, 3b −12 dB, 3c −18 dB | wie 2, leiser |
| 4 | 4a 75 %, 4b 50 %, 4c 25 % | wie 3c (Pegel −18 dB), Ton nur in diesem Anteil der linken Durchgänge |
| 5 | – | kein Ton |

**Besondere Durchgänge:**
- **Nur-Licht-Durchgänge:** In jeder Phase sind 10 % der linken Durchgänge reine Lichtdurchgänge. Sie liefern die phasenübergreifende Fortschrittskurve. In Phase 4 und 5 sind die tonlosen Durchgänge schon enthalten, dann wird nichts zusätzlich eingeplant.
- **Falsch-Ton-Durchgänge:** Ab Phase 2 kommt in 10 % der linken Durchgänge der Ton vom an der Mittellinie gespiegelten Ort rechts. In Phase 4 gilt das nur in Durchgängen mit Ton. Diese Durchgänge werden getrennt ausgewertet und zählen nicht für die Treppe. Für die Karte zählen sie, wie alle Durchgänge, siehe 7.
- **Rechte Kontrolldurchgänge:** Der Ton folgt der Phase, mit gleichem Ort rechts.

**Wechselkriterium** (geprüft am Sitzungsende). Die Trefferquote eignet sich nicht, weil die Treppe sie konstant hält. Maßgeblich ist die **benötigte Reizstärke**. Weiter zur nächsten Phase bzw. Unterstufe geht es, wenn alle Bedingungen gelten:
1. Mindestens 3 abgeschlossene Sitzungen (≥ 10 Minuten) in der aktuellen Stufe, in Phase 1 mindestens 5.
2. Die mittlere Treppenstufe links (Mittel über Regionen und Durchgänge der Sitzung) schwankt über die letzten 3 Sitzungen um höchstens 1,0 und ist in der letzten Sitzung nicht höher als in der ersten der drei.
3. Die Trefferquote links (ohne Falsch-Ton) liegt in den letzten 3 Sitzungen jeweils bei mindestens 60 %.

**Rückschritt:** Liegt die mittlere Treppenstufe nach einem Wechsel in 3 aufeinanderfolgenden Sitzungen um mehr als 2,0 über dem Wert vor dem Wechsel, geht es eine Unterstufe zurück. Phase 1 hat keinen Rückschritt. Nach einem Rückschritt ist frühestens nach weiteren 3 Sitzungen wieder ein Wechsel möglich.

Im PIN-Bereich kann die Phase von Hand gesetzt werden. Das wird protokolliert. Phasenwechsel erscheinen in allen Verläufen als senkrechte Linien.

## 10. Sicherheit (`core/safety`)

Das Modul `core/safety` prüft jeden `TrialPlan` und jeden UI-Übergang. Bei einem Verstoß wird der Plan verworfen, ein Fehler protokolliert und ein Ersatzplan gezogen.

- Licht- und Tonrampen ≥ 100 ms (Standard 150 ms).
- Mindestens 1 s zwischen zwei Reizen. Damit liegt die Reizfolge bei höchstens 1 Hz, also unter 3 Hz. Es gibt keine periodischen Muster zwischen 3 und 30 Hz.
- Reizgröße σ ≤ 1,5°, Kontrast ≤ Deckel.
- Hintergrund fest #3c3c3c, Text #e0e0e0. Kein reines Schwarz oder Weiß.
- Bildschirmwechsel mit 300 ms Überblendung. Keine großflächigen Helligkeitssprünge.
- Audio:
  - Master-Gain mit festem Deckel.
  - Beim App-Start steht der Gain auf dem eingestellten Wert, höchstens 50 % des Deckels.
  - Ein Kompressor/Limiter steht vor dem Ausgang.
  - Im Einrichtungsassistenten und vor jeder Sitzung kommt der Hinweis „iPad-Lautstärke etwa halb“.
- Sitzung standardmäßig 30 Minuten, Pause alle 5 Minuten. Höchstens 2 Sitzungen pro Kalendertag, gezählt sind begonnene Sitzungen mit mindestens einem Durchgang.
- Tests: Der Planer wird über mindestens 10.000 simulierte Durchgänge in allen Phasen gegen alle Regeln geprüft.

## 11. Bedienung

**Für ihn:**
- Startbildschirm: ein großer Knopf „Start“ rechts von der Mitte. Ein Tippen irgendwo startet ebenfalls.
- Das erste Tippen schaltet Audio und Stimme frei und setzt die Wake-Lock-Sperre.
- Sehr große Schrift (≥ 48 px), hoher Kontrast. Alle Bedienelemente rechts oder in der Mitte.
- Ansagen (duzen, Texte änderbar):
  - Begrüßung.
  - „Schau auf das Kreuz. Tippe, sobald du ein Licht siehst.“
  - Pause: „Kurze Pause. Wenn du weitermachen willst, tippe auf den Bildschirm.“ Die Pause dauert mindestens 30 s.
  - Ende.
  - Tageslimit: „Für heute ist genug, morgen geht es weiter.“
- Nur in Pausen erscheint rechts der Knopf „Fertig für heute“.
- Tagesrückmeldung, gesprochen und groß angezeigt: „Heute X von Y gefunden.“ Gezählt werden die linken Durchgänge mit Reiz. Ist X ≥ dem gestrigen Wert, folgt „Gestern waren es Z.“, sonst „Schön, dass du dabei warst.“
- **Stimme:** `speechSynthesis`, bevorzugt eine lokale deutsche Stimme (`localService`, `lang` de-DE, z. B. „Anna“). Zu jedem Ansagetext kann der Angehörige im PIN-Bereich eine eigene Aufnahme machen (MediaRecorder, lokal gespeichert). Gibt es eine Aufnahme, hat sie Vorrang. Zahlen in der Tagesrückmeldung spricht immer die Systemstimme. Fehlt eine lokale deutsche Stimme, warnt der PIN-Bereich.

**Für den Angehörigen:**
- Zugang über 3 s Drücken oben rechts, dann eine 4-stellige PIN. Gespeichert wird sie gesalzen mit SHA-256 (SubtleCrypto). Das ist ein Schutz vor versehentlichem Zugriff.
- **Einrichtungsassistent** beim ersten Start, später im PIN-Bereich wiederholbar:
  1. Hinweis „kein Medizinprodukt“ mit Bestätigung.
  2. Geometrie: Breite, Abstand, Kreuzposition, Vorschau der Rastergröße in Grad.
  3. Audio: Ausgabemodus, Test links/rechts, Lautstärkeabgleich mit Deckel.
  4. Reaktionszeit-Referenz: 20 Durchgänge rechts mit Referenzstufe, daraus T.
  5. Kamera: optional, ab M4.
  6. PIN.
- Empfehlungen in der README: Auto-Helligkeit und True Tone aus, feste Helligkeit, Halterung mit festem Abstand, „Geführter Zugriff“.

## 12. Speicherung, Auswertung, Export

**IndexedDB-Stores** (versioniertes Schema mit Migrationen):
`settings`, `sessions`, `trials`, `mapSnapshots`, `controllerState` (Karte, Treppen, Phase, γ), `recordings`, `photos` (M5), `dailyTrials` (M5), `triggerLog` (M6).

**TrialRecord:**
- Kennung, Sitzung, Zeitstempel.
- Typ: links, rechts, ohne Reiz.
- Ort: Rasterpunkt, tatsächliche Position (e, φ) und Pixel.
- Stufe, Kontrast, σ.
- Phase und Unterstufe, Tonbedingung (gleichzeitig, voraus, leiser, kein Ton, falsche Seite), SOA, Tonpegel.
- Wartezeit.
- Antwort: Treffer, verpasst, vorweggenommen, falscher Alarm. Reaktionszeit.
- Zeigeort und Fehler (optional).
- `fixationOk` (bzw. null ohne Kamera), erster Blicksprung (Richtung, Latenz, Amplitude; null ohne Kamera).
- Treppenstufe der Region vorher und nachher.
- Trigger-Latenz (M6).

**Auswertung im PIN-Bereich:**
- **Karte:** Heatmap von p bei Referenzstufe über dem linken Halbfeld, daneben die Schwellenkarte (Mittelwert θ). Ein Regler wählt die Sitzung, ein Differenzmodus zeigt den Vergleich zweier Sitzungen.
- **Verläufe je Sitzung:**
  - Trefferquote „nur Licht“ links.
  - Trefferquote links gesamt.
  - Reaktionszeit links gegen rechts (Median).
  - Mittlere Treppenstufe je Region.
  - Anteil erster Blicksprünge nach links (Kamera).
  - Treffer in Falsch-Ton-Durchgängen.
  - Falsch-Alarm-Rate.
  - Phasenlinien.
- **Export:**
  - JSON (vollständig, mit Schema-Version) und CSV (Durchgänge, eine Zeile je Durchgang) über `navigator.share` mit Dateien, ersatzweise als Download.
  - Import der JSON-Datei zur Wiederherstellung, mit Rückfrage und Vorschau.
  - Monatliche Erinnerung im PIN-Bereich an den Export: Wird die App gelöscht, sind die Daten weg.
- **Monatsbericht:** Druckansicht mit Zeitraum, Anzahl Sitzungen und Minuten, Karte am Anfang und Ende des Monats, Kernverläufe, Phase und Hinweis „kein Medizinprodukt“. Als PDF über das Teilen-Menü.
- **Testseite:** Reize einzeln auslösen (alle Stufen, Orte, Tonbedingungen), die Karte live sehen, den simulierten Probanden im Schnelllauf sehen.

## 13. Kamera (Meilenstein 4)

- MediaPipe Face Landmarker (Iris-Landmarks) mit Frontkamera, 15–30 Bilder pro Sekunde. Fällt GPU aus, wird auf CPU zurückgefallen.
- Merkmale: Iris-Mittelpunkt relativ zu den Augenwinkeln (beide Augen gemittelt) und grobe Kopfdrehung aus den Landmarks.
- Kalibrierung: 5 Punkte (Mitte und vier Ecken des nutzbaren Bereichs), je 1,5 s Fixation. Daraus wird eine affine Abbildung Merkmale → Blickrichtung (Grad) nach kleinsten Quadraten bestimmt. Ausgegeben wird auch der Restfehler. Liegt er über 5°, gibt es eine Warnung.
- Genutzt wird das nur für zwei Dinge:
  - Fixationsprüfung vor dem Reiz (Toleranz 4°, 500 ms stabil).
  - Erster Blicksprung nach t0: die erste Geschwindigkeitsüberschreitung (Schwelle konfigurierbar), mit Richtung links/rechts, Latenz und Amplitude.
- Geht das Gesicht verloren, wird still auf die Zufallswartezeit zurückgefallen.
- Kein Kamerabild wird gespeichert oder übertragen.

## 14. Alltagsmodule (Meilenstein 5)

Eine Sitzung ist standardmäßig 25 Minuten Lichttraining plus 5 Minuten Alltagsmodul, mit wechselndem Modul. Das ist einstellbar und kann ganz aus sein.

- **Suchbilder:**
  - Der Angehörige lädt Fotos hoch (Dateiauswahl bzw. Fotomediathek). Er zieht Rechtecke um Zielobjekte und gibt je Ziel den Fragetext ein, optional mit Aufnahme.
  - Aufgabe: „Wo ist die Brille?“ Er tippt auf die Stelle. Ein Treffer liegt im Rechteck plus 1° Rand.
  - Gespeichert werden Suchzeit, Treffer und Zielseite (links/rechts vom Kreuz bzw. von der Bildmitte).
- **Uhren:**
  - Analoge SVG-Uhr, große Zeiger, keine Sekunden. Drei Antworten untereinander am rechten Rand, jede wird beim Erscheinen vorgelesen.
  - Die Schwierigkeit steigt adaptiv: volle Stunden → halbe → Viertel → 5-Minuten-Schritte.
  - Keine Spracheingabe, weil die Spracherkennung auf dem Gerät nicht zugesichert offline läuft.
- **Zeilenanfang:**
  - Großer Textblock. Am rechten Ende einer Zeile erscheint ein Punkt, er tippt auf das erste Wort dieser Zeile.
  - Ein farbiger Randbalken links wird in Stufen (100 %, 70 %, 40 %, 0 %) blasser, sobald in 2 Sitzungen ≥ 80 % richtig waren.

## 15. Trigger (Meilenstein 6)

- `interface TriggerOutput { fire(event: TriggerEvent): void }`, mit `TriggerEvent { t: number; trialId: string; latencyMs: number }`.
- `fire` wird bei jedem Treffer im linken Feld aufgerufen.
- Die Latenz wird vom Eingabe-Zeitstempel (`event.timeStamp`) bis zum Aufruf von `fire()` gemessen und gespeichert.
- `LogTrigger` (Standard) schreibt in `triggerLog`.
- `SerialTrigger`:
  - Nur verfügbar, wenn `navigator.serial` existiert, also in Chrome am PC und nicht am iPad.
  - Standardmäßig aus, nur in den Entwicklereinstellungen einschaltbar.
  - Vorher kommt ein deutlicher Hinweis, der bestätigt werden muss: nur im Rahmen einer ärztlich begleiteten Studie mit zugelassenen Geräten.
  - Er sendet ein einzelnes Markierungsbyte.
- Kein Code erzeugt oder steuert Stromimpulse.

## 16. Simulierter Proband (`core/sim`) und Tests

**Proband:**
- Wahre Schwelle θ*(e, φ): im rechten Feld niedrig (≈ 2).
- Im linken Feld blind (θ* = 14) mit weicher, leicht schräger Grenze nahe der vertikalen Mittellinie. Der Übergang verläuft über etwa 6°, dazu kommt eine Restinsel unten links.
- Antworten nach der Kurve aus 7 mit γ = 0,04 und λ = 0,03, Reaktionszeiten log-normal.
- Ein passender Ton senkt die wirksame Schwelle in der Grenzzone um 1 Stufe.
- Lernkurve: Die Schwellen in der Grenzzone sinken über 30 Sitzungen um bis zu 2 Stufen.

**Abnahmetests:**
- **Karte:** Nach 5 simulierten Sitzungen zu je 250 Durchgängen ist der RMSE zwischen geschätzter und wahrer Schwelle an den Rasterpunkten mit wahrer Schwelle ≤ 11 höchstens 1,5 Stufen.
- **Ortswahl:** Ab Sitzung 3 liegen mindestens 50 % der linken Durchgänge an Punkten, deren wahres p bei der gezogenen Stufe zwischen 0,3 und 0,9 liegt.
- **Lernen:** Mit eingebauter Lernkurve sinkt die geschätzte mittlere Schwelle in der Grenzzone zwischen Sitzung 5 und 30 um mindestens 1 Stufe. Ohne Lernkurve ändert sie sich um höchstens 0,5.
- **Treppe:** Sie konvergiert auf ≈ 70,7 % (Simulation mit fester Schwelle: 0,65–0,76 über 2000 Durchgänge). Grenzen und Schrittweiten werden eingehalten.
- **Phasen:** Wechsel, kein Wechsel und Rückschritt an konstruierten Sitzungsfolgen. Anteile für Falsch-Ton und Nur-Licht liegen im Toleranzband.
- **Geometrie:** Hin- und Rückrechnung, Referenzwerte.
- **Sicherheit:** Prüfung aller Regeln über mindestens 10.000 Durchgänge.
- **Speicher:** Schreiben, Lesen, Migration, Export und Import als Runde ohne Verlust (fake-indexeddb).

Alle Simulationstests laufen mit festen Seeds und sind deterministisch.

## 17. Meilensteine

| M | Inhalt | Abnahme |
|---|---|---|
| 1 | Gerüst (Vite, TS, Preact, Vitest, PWA, Pages-Workflow), `rng`, `geometry`, `safety`, Reizdarstellung und Audio, Durchgang mit Phase 1 fest und zufälligem Ort, Einrichtung (Hinweis, Geometrie, Audio, Reaktionszeit), IndexedDB, Export und Import, einfache Testseite, README-Grundgerüst | Tests grün, Build läuft, ein Durchgang auf dem iPad bedienbar |
| 2 | `map`, `selector`, `staircase`, `phases`, `session`, `sim`, Abnahmetests aus 16, Live-Karte auf der Testseite | Simulationstests grün |
| 3 | Stimme und Aufnahmen, Patientenablauf mit Pausen und Tageslimit, Tagesrückmeldung, PIN-Bereich, Auswertung, Monatsbericht, README für die tägliche Nutzung | Tests grün, kompletter Ablauf am iPad |
| 4 | Kamera: Kalibrierung, Fixation, erster Blicksprung | Tests der Blickabbildung und Sakkadenerkennung mit synthetischen Daten |
| 5 | Alltagsmodule | Tests der Logik (Treffer, Adaption, Randbalken) |
| 6 | Trigger-Schnittstelle | Tests mit Mock, Latenzmessung |

Nach jedem Meilenstein: Commit, Push, kurzer Bericht an den Angehörigen, README aktualisiert.

## 18. Entscheidungen (Gespräch 11.10.2026)

1. Auslieferung als PWA über statisches Hosting.
2. Stimme: Systemstimme, eigene Aufnahmen optional.
3. Gerät: alles auf dem iPad, Eingabe durch Tippen auf den Bildschirm, Buzzer optional.
4. Karte: Variante A (Schwellen-Karte).
5. Architektur (Abschnitt 4), Kartenmathematik (7, 8), Ablauf, Phasen und Sicherheit (6, 9, 10) bestätigt.
6. Phasenwechsel nach benötigter Reizstärke statt nach Trefferquote (Abweichung vom Prompt, begründet in 9). Nur-Licht-Anteil von 10 % in jeder Phase.
7. Eigenes öffentliches Repo, nur Code im Repo. Seit 11.10.2026 `mauricexvdl7-spec/hemianopsie-av-training`, Auslieferung über Cloudflare (GitHub Pages scheiterte an einer Kontosperre).
8. Tempo ruhiger (Nutzer, 11.10.2026, nach erstem Test: „Licht zu kurz, zu wenig Pause“): Licht 1,0 s sichtbar (Plateau 700 ms), Wartezeit 1,5–3,5 s, Antwortfenster mindestens 2,0 s. Alle drei Werte einstellbar; die Sicherheitsregel ≥ 1 s zwischen zwei Reizen bleibt unverändert. Folge: Bei längerem Licht kann er öfter vor dem Ende zum Reiz blicken; das stärkt das Erkunden nach links, macht die Karte aber etwas großzügiger. Ab Meilenstein 4 (Kamera) wird das über den ersten Blicksprung sichtbar.
9. Gestaltung (Nutzer, 11.10.2026: „sieht hart nach Win95 aus“): ruhiger Feinschliff mit Akzentfarbe gedämpftes Petrol. Grundton aller Bildschirme bleibt Dunkelgrau #3c3c3c (keine Helligkeitssprünge beim Wechsel ins Training), Trainingsbildschirm (Kreuz, Lichtfleck) bleibt unverändert. Start mit Begrüßung nach Tageszeit, Ergebnis als Karte, Admin-Seiten als Karten mit Schritt-Anzeige.

## 19. Bewusst nicht enthalten

- Spracherkennung (Cloud).
- Synchronisation zwischen Geräten.
- Mehrere Patienten.
- Diagnosen, Normwerte oder Aussagen über das Gesichtsfeld im medizinischen Sinn.
- Steuerung von Stimulationsgeräten.
