# Meilenstein 4 – Kamera: Design

Stand: 14.10.2026. Ergänzt Abschnitt 13 der Spec `2026-10-11-sehtraining-design.md`, die übrigen Abschnitte gelten unverändert. Die Entscheidungen hat der Nutzer am 14.10.2026 im Gespräch getroffen.

## 1. Zweck

Mit der Frontkamera des iPads misst die App, wohin er schaut. Das dient genau zwei Dingen:

1. **Fixationsprüfung.** Der Lichtreiz kommt erst, wenn sein Blick 500 ms stabil auf dem Kreuz liegt (Toleranz 4°). Nach 5 s ohne stabile Fixation kommt der Reiz trotzdem, dann mit `fixationOk = false`.
2. **Erster Blicksprung nach dem Reiz.** Gemessen werden Richtung (links/rechts), Latenz und Amplitude. So wird sichtbar, ob er im Lauf der Wochen öfter nach links erkundet, auch wenn er nicht tippt.

Datenschutz: Es wird kein Kamerabild gespeichert, angezeigt (außer für den Angehörigen in Einrichtung und Testseite) oder übertragen. Gespeichert werden nur berechnete Winkel.

## 2. Entscheidungen (Nutzer, 14.10.2026)

1. **Kalibrierung mit gleitenden Punkten.** Jeder Kalibrierpunkt erscheint am Kreuz, wo er ihn sieht. Dann gleitet er in 1,5 s an seinen Platz, auch in das blinde linke Feld. Er folgt ihm mit den Augen. Am Ziel spielt ein kurzer Ton aus der Richtung des Punkts (wie beim Training, Kopfhörer oder Lautsprecher).
2. **Kalibrierung vor jeder Sitzung,** zusätzlich einmal in der Einrichtung. Liegt der Restfehler über 5°, läuft die Sitzung ohne Kamera, wie bisher.
3. **Querformat bleibt.** Beim jetzigen iPad sitzt die Kamera an der schmalen Seite. Das iPad wird so aufgestellt, dass die Kamera **rechts** ist, nahe am Kreuz.
4. **Schalter „Kamera-Lage“** im PIN-Bereich: *seitlich (älteres iPad, Kamera rechts)* oder *oben mittig (neueres iPad)*.
   - Der Schalter steuert die Aufstellhinweise in Einrichtung und Testseite.
   - Er steuert die Prüfung, ob das Gesicht im Bild ungefähr dort liegt, wo es bei dieser Lage liegen sollte („Bitte das iPad so drehen, dass die Kamera rechts ist“).
   - Die Abbildung auf Blickwinkel lernt die Kalibrierung ohnehin neu.
5. **Kamera-Testseite zuerst.** Sie liegt im PIN-Bereich: kalibrieren, dann ein Punkt dort, wo die App den Blick vermutet, dazu Restfehler und Bilder pro Sekunde. Daran wird am echten iPad geprüft, ob die Genauigkeit reicht, bevor die Kamera ins Training geht.

## 3. Festlegungen dieses Designs (bei der Durchsicht bestätigen)

1. **Abbildung Merkmale → Blick** je Achse mit drei Parametern, nach kleinsten Quadraten:
   - blickX = a·irisX + b·Kopfdrehung + c
   - blickY = d·irisY + e·Kopfneigung + f
   - `irisX`/`irisY` sind die Iris-Mitte relativ zu den Augenwinkeln, normiert und über beide Augen gemittelt.
   - Fünf Punkte und drei Parameter je Achse lassen einen echten Restfehler übrig. Eine volle affine Abbildung hätte bei fünf Punkten immer Restfehler 0 und wäre damit wertlos.
2. **Restfehler** = Wurzel des mittleren quadratischen Abstands zwischen Zielpunkt und abgebildetem Mittel je Punkt, in Grad. Über 5° → Warnung, Sitzung ohne Kamera.
3. **Kalibrierpunkte:**
   - Die Mitte ist das Kreuz selbst, ohne Gleiten.
   - Dazu kommen die vier Ecken des nutzbaren Bereichs, mit 1,5° Rand.
   - Je Punkt wird 1,5 s gehalten. Ausgewertet wird die letzte Sekunde, nach dem Ausreißer-Filter (Median ± 3 MAD).
   - Gesamtdauer etwa 15 s.
   - Ansage vorher: „Folge dem Punkt mit den Augen.“ Der Text ist änderbar und kann aufgenommen werden.
4. **Wartezeit mit Kamera.**
   - Die zufällige Wartezeit bleibt als Mindestzeit, sonst könnte er den Reiz vorhersehen.
   - Danach wartet die App zusätzlich auf 500 ms stabile Fixation, höchstens 5 s lang.
   - Die Sicherheitsregel „≥ 1 s zwischen zwei Reizen“ bleibt dadurch automatisch erfüllt.
5. **Blicksprung-Erkennung** auf dem Blicksignal ab t0 bis zum Ende des Antwortfensters:
   - Geglättet wird über 3 Bilder.
   - Der Blicksprung beginnt beim ersten Überschreiten der Geschwindigkeitsschwelle, Standard 80°/s. Die Schwelle ist im PIN-Bereich einstellbar (40–200°/s).
   - Das Ende ist erreicht, sobald die Geschwindigkeit wieder unter der halben Schwelle liegt.
   - Die Amplitude ist der Abstand Start→Ende. Unter 2° zählt der Sprung nicht.
   - Ergebnis: `{ direction: 'left' | 'right', latencyMs, amplitudeDeg }` oder `null`, wenn es keinen Sprung gab oder das Signal unbrauchbar war.
6. **Gesicht verloren:**
   - Während der Wartezeit: still zurück auf die reine Zufallswartezeit, mit `fixationOk = null`.
   - Nach t0: kein Blicksprung (`null`).
   - Drei Durchgänge in Folge ohne Gesicht → Kamera für den Rest der Sitzung aus.
7. **Kamera standardmäßig aus.** Sie wird im PIN-Bereich oder in der Einrichtung eingeschaltet. Lehnt das iPad den Kamerazugriff ab oder zeigt es eine Rückfrage, die er nicht beantwortet, läuft das Training ohne Kamera. Er wird damit nie aufgehalten.
8. **MediaPipe-Dateien:**
   - Das Modell `face_landmarker.task` (etwa 3,6 MB, Apache-2.0) lädt der Build bei Cloudflare herunter. Die WASM-Dateien kommen aus dem npm-Paket `@mediapipe/tasks-vision`.
   - Alles wird lokal ausgeliefert und vom Service Worker vorgehalten. Zur Laufzeit gibt es kein Netz und kein CDN.
   - Fehlt das Modell im Build, bricht der Build ab, außer wenn `SKIP_MEDIAPIPE_MODEL=1` gesetzt ist. Das gilt nur für Entwicklung und Tests.

## 4. Architektur

```
src/core/gaze.ts        reine Mathematik: Merkmale, Kalibrierfit (kleinste Quadrate), Restfehler, Abbildung
src/core/fixation.ts    stabile Fixation (Toleranz, Dauer) über eine Blickfolge
src/core/saccade.ts     erster Blicksprung (Glättung, Schwelle, Start, Ende, Amplitude, Richtung)
src/core/calibration.ts Ablauf der Kalibrierung als reiner Plan: Punkte, Gleitbahnen, Auswertefenster
src/io/camera.ts        Frontkamera + MediaPipe Face Landmarker → Merkmalsstrom (GPU, sonst CPU), Gesicht verloren → null
src/ui/patient/CalibrationStage.tsx  gleitende Punkte, Ton am Ziel, sammelt Merkmale
src/ui/admin/CameraTestPage.tsx       Testseite: Kalibrieren, Live-Blickpunkt, Restfehler, fps
src/ui/setup/steps/CameraStep.tsx     Einrichtung (optional): Aufstellhinweis, Kamera-Lage, Probe-Kalibrierung
scripts/fetch-mediapipe.mjs           Build: Modell holen, WASM kopieren
```

Die Grenzen sind wie bisher: `core/` ist rein, nutzt keine Uhr und kein DOM und läuft mit synthetischen Daten in Node.

## 5. Datenfluss im Training

1. **Sitzungsstart:** Begrüßung → Kalibrierung, wenn die Kamera eingeschaltet ist → Anleitung → Durchgänge.
   - Ist die Kalibrierung brauchbar, wird ein `GazeMapper` erzeugt. Sonst läuft die Sitzung ohne Kamera.
   - Der Restfehler wird an der Sitzung gespeichert.
2. **Je Durchgang:**
   - Der Runner bekommt optional eine Blickquelle.
   - Nach der Mindestwartezeit wartet er auf stabile Fixation, höchstens 5 s. Daraus ergibt sich `fixationOk`.
   - Ab t0 sammelt er Blickproben bis zum Ende des Antwortfensters. `detectFirstSaccade` liefert den Blicksprung.
3. **TrialRecord** bekommt die Felder `saccadeDirection`, `saccadeLatencyMs` und `saccadeAmplitudeDeg`, jeweils `null` ohne Kamera. `fixationOk` gibt es schon.
4. **CSV** bekommt die drei neuen Spalten. Der Export bleibt Schema 2, die neuen Felder sind optional, und alte Datensätze gelten als `null`.
5. **SessionRecord** bekommt `camera: { residualDeg: number; used: boolean } | null`.
6. **Auswertung:** Die Kurve „Erste Blicksprünge nach links“ zeigt den Anteil der linken Durchgänge mit Blicksprung nach links an allen linken Durchgängen mit Blickdaten. Dazu kommt der Anteil `fixationOk`. Der Hinweis „ab Meilenstein 4“ entfällt.

## 6. Einstellungen (PIN-Bereich)

- Kamera ein/aus, Standard aus.
- Kamera-Lage: seitlich (älteres iPad, Kamera rechts) oder oben mittig (neueres iPad).
- Schwelle für Blicksprünge 40–200°/s, Standard 80°/s.
- Ansagetext „Folge dem Punkt mit den Augen.“ und eine eigene Aufnahme dafür. Die Ansagen-Seite bekommt diesen Schlüssel dazu.

## 7. Tests

Alle Tests laufen mit synthetischen Daten und festen Seeds.

- **Kalibrierfit:**
  - Eine bekannte Abbildung plus Rauschen wird auf 0,5° genau zurückgewonnen.
  - Der Restfehler wächst mit dem Rauschen.
  - Über 5° kommt die Warnung.
  - Entartete Daten (alle Punkte gleich, NaN) → Fit unbrauchbar, kein Absturz.
- **Fixation:**
  - Stabil 500 ms → ja. 499 ms → nein.
  - Ein Ausreißer über 4° setzt die Zeit zurück.
- **Blicksprung:**
  - Ein Sprung nach links von 10° bei 250 ms Latenz wird mit Richtung links erkannt, Latenz ±35 ms, Amplitude ±1,5°. Nach rechts genauso.
  - Rauschen ohne Sprung → `null`.
  - Ein Sprung unter 2° → `null`.
  - Ein Gesichtsverlust mitten im Signal stört nicht.
- **Runner** mit Fake-Blickquelle:
  - Er wartet auf Fixation und setzt `fixationOk` true/false.
  - Ohne Quelle gilt `null`.
  - Die Abstandsregel ≥ 1 s zwischen Reizen bleibt erhalten.
- **Ablauf:**
  - Kamera aus → keine Kalibrierung.
  - Kalibrierung unbrauchbar → Sitzung ohne Kamera.
  - Drei Durchgänge ohne Gesicht → Kamera aus.
- **Speicher:** Die neuen optionalen Felder gehen beim Import und Export ohne Verlust durch.

Was nur am Gerät geprüft werden kann, steht in der README-Checkliste:
- tatsächliche Genauigkeit,
- Kamerarechte in der Home-Bildschirm-App,
- Bilder pro Sekunde auf dem älteren iPad.

## 8. Reihenfolge

1. `core/gaze`, `core/calibration`, `io/camera`, Build-Skript, **Kamera-Testseite**. Danach am iPad testen.
2. `core/fixation`, `core/saccade`, Runner-Integration.
3. Kalibrierung im Patientenablauf, Einstellungen, Einrichtungsschritt.
4. Speicherung, CSV, Auswertung, README.

Bringt der Test am iPad nach Schritt 1 keine brauchbare Genauigkeit (Restfehler dauerhaft über 5°), stoppen wir dort und entscheiden neu. Mögliche Wege sind dann eine andere Aufstellung, Hochformat, nur die Fixationsprüfung oder der Verzicht auf die Kamera.
