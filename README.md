# Sehtraining

Audiovisuelles Heimtraining bei Hemianopsie nach links, als Web-App für das iPad. Die App läuft nach der Installation offline. Alle Trainingsdaten bleiben auf dem iPad.

> **Hinweis:** Diese App ist kein Medizinprodukt und stellt keine Diagnosen. Sie ergänzt ein ärztlich begleitetes Training und ersetzt es nicht.

Stand: Meilenstein 1 (Grundgerüst). Es gibt einen Trainingsblock mit 20 Durchgängen auf fester mittlerer Reizstärke. Karte, Treppenregel, Phasen, Sprachansagen und PIN-Bereich folgen in den nächsten Meilensteinen. Das fachliche Design steht in `docs/superpowers/specs/2026-10-11-sehtraining-design.md`.

## Installation auf dem iPad

1. In Safari die Adresse der App öffnen (Cloudflare Pages, z. B. `https://sehtraining.pages.dev/`).
2. Auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.
3. Die App ab jetzt nur über das neue Symbol auf dem Home-Bildschirm starten. Nur so läuft sie offline und im Vollbild, und nur dort bleiben die Daten erhalten.

Updates kommen automatisch, wenn das iPad beim Start Internet hat.

## iPad vorbereiten

- **Helligkeit:** Einstellungen → Anzeige & Helligkeit: „True Tone“ aus, „Automatisch“ (unter Bedienungshilfen → Anzeige & Textgröße) aus, Helligkeit fest auf einen mittleren Wert. Sonst ändern sich die Reizstärken von Tag zu Tag.
- **Lautstärke:** etwa auf die Hälfte. Die App begrenzt ihre eigene Lautstärke zusätzlich.
- **Nach einem Update (Pegel neu abgestimmt):** Die Tonpegel der App wurden neu abgestimmt, bei gleicher Einstellung ist der Ton jetzt etwa 11 dB lauter. Deshalb nach dem Update den Einrichtungsschritt „Ton“ (`#/setup`) wiederholen und eine angenehme Lautstärke einstellen.
- **Halterung:** das iPad quer in eine stabile Halterung, immer im gleichen Abstand zu den Augen (Standard 30 cm). Den Abstand gibst du bei der Einrichtung ein.
- **Geführter Zugriff:** Einstellungen → Bedienungshilfen → Geführter Zugriff einschalten. In der App dreimal die Seitentaste drücken, dann kann er die App nicht versehentlich verlassen.

## Einrichtung

Beim ersten Start öffnet sich der Einrichtungsassistent. Später erreichst du ihn über `#/export` → „Einrichtung wiederholen“.

1. **Hinweis** „kein Medizinprodukt“ lesen und bestätigen. Ohne Bestätigung startet kein Training.
2. **Bildschirm und Abstand:** die sichtbare Bildbreite mit dem Lineal messen (Komma erlaubt, z. B. „24,5“) und den Abstand Augen–Bildschirm eintragen. Der Schieber setzt das Fixationskreuz nach rechts, damit links mehr Platz ist (Standard 67 %). Darunter steht, wie weit das Bild in Grad reicht.
3. **Ton:** Kopfhörer (empfohlen) oder iPad-Lautsprecher wählen, links und rechts testen, Lautstärke und Balance so einstellen, dass beide Seiten für ihn gleich laut sind.
4. **Reaktionszeit rechts:** 20 kurze Durchgänge ohne Ton im sehenden rechten Feld. Daraus berechnet die App, wie lange sie nach einem Licht auf sein Tippen wartet (zwischen 1,5 und 3 Sekunden).

## Tägliche Nutzung

Auf dem Startbildschirm auf „Start“ tippen (oder irgendwo). Er schaut auf das Kreuz und tippt auf den Bildschirm, sobald er ein Licht sieht. Eine Sitzung hat seit M2 60 Durchgänge; danach erscheint „Heute X von Y gefunden.“ Wird die App verlassen oder das iPad gedreht, pausiert das Training; ein Tippen setzt dieselbe Sitzung fort, ohne dass Karte und Treppe etwas verlieren.

Sprachansagen, Pausen alle 5 Minuten, 30-Minuten-Sitzungen und das Tageslimit kommen mit Meilenstein 3. Bis dahin dauert eine Sitzung mit dem ruhigeren Standard-Tempo nur etwa vier Minuten. Das Phasenkriterium verlangt aber mindestens 10 Minuten je Sitzung. Deshalb erreicht vorerst keine echte Sitzung dieses Kriterium, und das Training bleibt in Phase 1, bis M3 die zeitgesteuerten Sitzungen bringt.

## Wie das Training sich anpasst

**Die Karte.** Die App führt für jeden Punkt im linken Halbfeld Buch darüber, wie hell ein Licht dort sein muss, damit er es sieht (die „Schwelle“). Jeder Treffer und jeder Fehlversuch verbessert die Schätzung, auch für die Nachbarpunkte, weil benachbarte Orte ähnlich sehen. Ältere Messungen zählen mit der Zeit weniger (nach etwa sieben Sitzungen nur noch halb), damit Fortschritte sichtbar werden. Durchgänge ganz ohne Licht zeigen, wie oft er rät; das wird herausgerechnet.

**Die Ortswahl.** Geprüft werden vor allem Orte, an denen er ein Licht etwa zwei von drei Mal sieht. Das ist die Grenzzone, in der Üben am meisten bringt. Orte, die er sicher sieht oder gar nicht sieht, kommen seltener dran. Etwa jeder siebte Ort wird zufällig gewählt, damit nichts übersehen wird. Derselbe Ort kommt nie zweimal direkt hintereinander.

**Die Treppe.** Für oben, Mitte und unten gibt es je eine Helligkeitsstufe. Nach zwei Treffern in Folge wird das Licht schwächer, nach einem Fehlversuch stärker. Zuerst geht es in großen Schritten, nach der ersten Umkehr in kleinen. So pendelt die Schwierigkeit um das, was er gerade noch schafft. Rechte Durchgänge, Durchgänge ohne Licht und abgebrochene verändern weder Treppe noch Karte.

**Die Phasen.** In Phase 1 kommt der Ton gleichzeitig mit dem Licht. Dann kommt der Ton etwas vor dem Licht, wird in Phase 3 leiser und erklingt in Phase 4 nur noch bei einem Teil der Durchgänge. In Phase 5 gibt es keinen Ton mehr. Zwischendurch kommen gelegentlich Durchgänge nur mit Licht und Durchgänge mit einem Ton auf der falschen Seite, damit er sich nicht allein auf den Ton verlässt. Die App geht erst weiter, wenn mehrere gute Sitzungen hintereinander ähnlich schwierig waren, und einen Schritt zurück, wenn es dreimal in Folge deutlich schlechter lief.

Auf der Testseite (`#/test`) zeigt der Abschnitt **Karte** den gespeicherten Stand. Hell heißt „sieht er gut“, dunkel heißt „sieht er kaum“, wahlweise als Trefferwahrscheinlichkeit bei Stufe 6 oder als Schwelle. Die Testseite verändert die Karte nie. Unter **Simulation** durchläuft ein simulierter Proband fünf Sitzungen. Schätzung und wahre Karte erscheinen nebeneinander, dazu der mittlere Schwellenfehler. Die Simulation läuft auf einem frischen, nicht gespeicherten Zustand und schreibt nichts in die Datenbank.

## Tempo einstellen

Auf der Seite `#/export` gibt es den Abschnitt **Tempo**: wie lange das Licht sichtbar ist (Standard 1,0 s), wie lang die Pause zwischen den Lichtern ist (Standard 1,5 bis 3,5 s, nie unter 1 s) und wie viel Zeit zum Tippen mindestens bleibt (Standard 2,0 s). Mit „Tempo speichern“ gelten die Werte ab der nächsten Sitzung, eine laufende Sitzung behält ihr Tempo; „Standard wiederherstellen“ setzt alles zurück. Die Zeit zum Tippen wird beim Speichern aus den Referenz-Reaktionszeiten der Einrichtung mit der neuen Untergrenze neu berechnet.

## Datenexport

Die Seite `…/#/export` (Adresse der App plus `#/export`) (in M1 noch ohne PIN, nur über die Adresse erreichbar):

- **Alles sichern (JSON):** vollständige Sicherung aller Einstellungen, Sitzungen und Durchgänge. Auf dem iPad öffnet sich das Teilen-Menü (AirDrop, Mail, Dateien).
- **Durchgänge als Tabelle (CSV):** eine Zeile pro Durchgang, Semikolon-getrennt, öffnet direkt in Excel.
- **Sicherung einspielen:** eine JSON-Sicherung auswählen. Die vorhandenen Daten werden nach Rückfrage ersetzt.

Dort gibt es auch eine **Testseite**, auf der du einzelne Reize mit wählbarer Stufe, Ort und Ton ansehen kannst.

## Datenschutz

- Kein Server, keine Cloud, keine Telemetrie. Die App lädt zur Laufzeit nichts aus dem Internet.
- Trainingsdaten, Fotos und Aufnahmen liegen nur im Speicher der App auf dem iPad.
- **Wird die App vom iPad gelöscht, sind die Daten weg.** Deshalb regelmäßig exportieren.
- Exporte **nie** in dieses Repository legen. Es ist öffentlich.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests
npm run typecheck  # TypeScript-Prüfung
npm run build      # Produktions-Build nach dist/
npm run icons      # App-Icons neu erzeugen
```

Veröffentlicht wird über **Cloudflare Pages**: Bei jedem Push auf `main` baut Cloudflare die App neu. Einstellungen des Cloudflare-Projekts:

| Feld | Wert |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm test && npm run build` |
| Build output directory | `dist` |
| Umgebungsvariable | `NODE_VERSION` = `22` |

Weil der Build-Befehl zuerst die Tests ausführt, wird nie eine Version mit roten Tests veröffentlicht.

Der GitHub-Workflow `.github/workflows/deploy.yml` (GitHub Pages) läuft nur noch von Hand (Actions → „Test und Veröffentlichung“ → „Run workflow“). Er ist die Ausweichmöglichkeit, falls Cloudflare einmal wegfällt; dafür `base` in `vite.config.ts` wieder auf `/sehtraining/` setzen.
