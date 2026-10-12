# Sehtraining

Audiovisuelles Heimtraining bei Hemianopsie nach links, als Web-App für das iPad. Die App läuft nach der Installation offline. Alle Trainingsdaten bleiben auf dem iPad.

> **Hinweis:** Diese App ist kein Medizinprodukt und stellt keine Diagnosen. Sie ergänzt ein ärztlich begleitetes Training und ersetzt es nicht.

Stand: Meilenstein 3. Die App führt Sitzungen von bis zu 30 Minuten mit Pausen und Sprachansagen, lernt die Karte der Sehschwelle, passt Reizstärke und Ton in Phasen an und hat einen PIN-Bereich für Angehörige mit Einstellungen, Auswertung, Monatsbericht und Datensicherung. Kamera, Alltagsmodule und Trigger folgen in späteren Meilensteinen. Das fachliche Design steht in `docs/superpowers/specs/2026-10-11-sehtraining-design.md`.

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

Beim ersten Start öffnet sich der Einrichtungsassistent. Er hat 5 Schritte. Später erreichst du ihn im Bereich für Angehörige über „Einrichtung wiederholen“ (siehe unten, dafür brauchst du die PIN).

1. **Hinweis** „kein Medizinprodukt“ lesen und bestätigen. Ohne Bestätigung startet kein Training.
2. **Bildschirm und Abstand:** die sichtbare Bildbreite mit dem Lineal messen (Komma erlaubt, z. B. „24,5“) und den Abstand Augen–Bildschirm eintragen. Der Schieber setzt das Fixationskreuz nach rechts, damit links mehr Platz ist (Standard 67 %). Darunter steht, wie weit das Bild in Grad reicht.
3. **Ton:** Kopfhörer (empfohlen) oder iPad-Lautsprecher wählen, links und rechts testen, Lautstärke und Balance so einstellen, dass beide Seiten für ihn gleich laut sind.
4. **Reaktionszeit rechts:** 20 kurze Durchgänge ohne Ton im sehenden rechten Feld. Daraus berechnet die App, wie lange sie nach einem Licht auf sein Tippen wartet (zwischen 1,5 und 3 Sekunden).
5. **PIN:** Du legst eine 4-stellige PIN fest, zweimal eingegeben. Sie schützt den Bereich für Angehörige. **Bitte die PIN aufschreiben.** Ohne PIN kommst du nicht an den Export. Bei einer wiederholten Einrichtung kannst du die alte PIN behalten.

## Tägliche Nutzung

**Start.** Auf dem Startbildschirm tippt er auf den runden Knopf „Start“ (oder irgendwo auf den Bildschirm). Darunter steht „Lautstärke etwa halb“. Das iPad sollte dann auf etwa halber Lautstärke stehen.

**Begrüßung und Anleitung.** Die App spricht: „Hallo! Schön, dass du da bist.“ und „Schau auf das Kreuz. Tippe, sobald du ein Licht siehst.“ Erst danach kommt das erste Licht. Während ein Licht läuft, spricht die App nie.

**Takt.** Eine Sitzung dauert standardmäßig 30 Minuten. Alle 5 Minuten gibt es eine kurze Pause. Es zählt nur die Zeit, in der Lichter laufen. Pausen und Ansagen zählen nicht. Die Pause dauert mindestens 30 Sekunden. Ein Balken zeigt, wie lange es noch dauert. Danach sagt die App: „Wenn du weitermachen willst, tippe auf den Bildschirm.“ Vorher wirkt Tippen nicht. Wird die App verlassen oder das iPad gedreht, pausiert das Training ebenfalls. Dann geht es sofort mit einem Tippen weiter, ohne 30 Sekunden Wartezeit. Karte und Treppe verlieren dabei nichts.

**Fertig für heute.** In jeder Pause gibt es unten den Knopf „Fertig für heute“. Er beendet die Sitzung sofort. Sie gilt wie jede andere.

**Tageslimit.** Es sind höchstens 2 Sitzungen pro Kalendertag möglich. Danach sagt die App: „Für heute ist genug, morgen geht es weiter.“ Eine Sitzung zählt, sobald mindestens ein Durchgang gemacht wurde.

**Tagesrückmeldung.** Am Ende zeigt und spricht die App: „Gut gemacht. Die Übung ist zu Ende.“ und „Heute X von Y gefunden.“ Danach folgt „Gestern waren es Z.“, wenn gestern trainiert wurde und heute mindestens so viel gefunden wurde. Sonst folgt „Schön, dass du dabei warst.“ „Gestern“ ist der Kalendertag davor. Tippen führt zurück zum Start.

**Lautstärke.** Etwa halb. Die App begrenzt ihre eigene Lautstärke zusätzlich.

Die Texte der Ansagen kannst du ändern oder durch eigene Aufnahmen ersetzen (siehe „Ansagen“ unten). Die Sätze mit Zahlen spricht immer die Systemstimme.

## Bereich für Angehörige

**Zugang.** Auf dem Startbildschirm die Ecke oben rechts 3 Sekunden lang gedrückt halten. Die Fläche ist unsichtbar und etwa 64 × 64 Punkte groß. Dann die 4-stellige PIN eingeben. Bei falscher PIN erscheint „Falsche PIN.“ und du kannst es neu versuchen. Es gibt keine Sperre. Der Bereich sperrt sich wieder, wenn du „Zurück zum Training“ wählst oder die App neu lädst.

**Die PIN aufschreiben.** Ohne PIN gibt es keinen Zugang zu Einstellungen, Auswertung und Export. Die PIN steht nicht in der Sicherung. Hast du sie vergessen, hilft nur, die App vom iPad zu löschen. Dann sind alle Daten weg.

Auch die alten Direktadressen `#/export` und `#/test` fragen jetzt nach der PIN.

Auf der Startseite des Bereichs stehen der Hinweis „kein Medizinprodukt“, die Erinnerung zur Sicherung und ein Hinweis, falls auf dem iPad keine deutsche Stimme vorhanden ist. Von dort geht es zu diesen Seiten:

- **Einstellungen**
  - *Sitzungsdauer:* 10 bis 30 Minuten in 5er-Schritten, Standard 30. Länger als 30 Minuten geht nicht. Eine Sitzung unter 10 Minuten zählt nicht für den Wechsel der Phase.
  - *Tempo:* wie lange das Licht sichtbar ist (Standard 1,0 s), wie lang die Pause zwischen den Lichtern ist (Standard 1,5 bis 3,5 s, nie unter 1 s) und wie viel Zeit zum Tippen mindestens bleibt (Standard 2,0 s). „Standard wiederherstellen“ setzt die drei Werte zurück.
  - *Raster der Messpunkte:* Start, Abstand und Winkel. Eine Änderung legt eine neue Karte an. Die alte bleibt gespeichert und ist in der Auswertung sichtbar.
  - *Phase von Hand:* die aktuelle Phase ansehen und nach Rückfrage eine andere setzen.
  - *Vergessen:* die Halbwertszeit in Sitzungen. Nach dieser Zahl zählt ein älterer Messwert nur noch halb.
  - *Einrichtung wiederholen:* Bildschirm, Abstand, Ton, Reaktionszeit und PIN.
  - Änderungen gelten ab der nächsten Sitzung.
- **Ansagen:** Die sieben Ansagetexte ändern. Zu jedem Text kannst du eine eigene Aufnahme machen (höchstens 15 Sekunden). Gibt es eine Aufnahme, spielt die App sie statt der Stimme. Klappt das Abspielen nicht, spricht die Systemstimme.
- **Auswertung:** Siehe „Auswertung lesen“ unten.
- **Monatsbericht:** Eine Seite pro Monat mit Sitzungen, Übungszeit, Phase am Monatsende, Karte am Anfang und Ende und den Verläufen. Mit „Vormonat“ und „Folgemonat“ wechselst du den Monat. „Drucken oder als PDF sichern“ öffnet den Druckdialog. Im Teilen-Menü (Teilen-Symbol im Druckdialog) kannst du ein PDF sichern oder verschicken. Der Bericht trägt den Hinweis „kein Medizinprodukt“.
- **Export und Sicherung:** siehe „Datenexport“ unten.
- **Testseite:** einzelne Lichter mit wählbarer Stufe, Ort und Ton ansehen, außerdem Karte und Simulation (siehe unten).

**Deutsche Stimme auf dem iPad laden.** Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch. Dort eine Stimme laden. Fehlt eine deutsche Stimme, weist die App im Bereich für Angehörige darauf hin. Dann bleibt nur, eigene Aufnahmen zu machen.

### Auswertung lesen

Die Seite **Auswertung** hat zwei Teile.

**Karte.** Mit dem Schieber wählst du eine Sitzung. Hell heißt „sieht er gut“, dunkel heißt „sieht er kaum“. Mit „Vergleich“ wählst du eine zweite, frühere Sitzung und siehst, wo sich etwas verändert hat. Wurde das Raster dazwischen geändert, ist kein Vergleich möglich.

**Verläufe.** Diagramme über alle Sitzungen mit den Phasenwechseln als Linien: Trefferquote links, Reaktionszeit, mittlere Treppenstufe sowie Falsch-Ton-Treffer und Falsch-Alarm-Rate. Steigende Trefferquote bei gleicher oder schwächerer Reizstärke ist ein gutes Zeichen. Einzelne schlechte Tage sind normal (Müdigkeit, Licht im Raum). Wichtig ist der Trend über mehrere Wochen. Der Blicksprung-Verlauf steht erst ab Meilenstein 4 (Kamera) zur Verfügung.

## Wie das Training sich anpasst

**Die Karte.** Die App führt für jeden Punkt im linken Halbfeld Buch darüber, wie hell ein Licht dort sein muss, damit er es sieht (die „Schwelle“). Jeder Treffer und jeder Fehlversuch verbessert die Schätzung, auch für die Nachbarpunkte, weil benachbarte Orte ähnlich sehen. Ältere Messungen zählen mit der Zeit weniger (nach etwa sieben Sitzungen nur noch halb), damit Fortschritte sichtbar werden. Durchgänge ganz ohne Licht zeigen, wie oft er rät; das wird herausgerechnet.

**Die Ortswahl.** Geprüft werden vor allem Orte, an denen er ein Licht etwa zwei von drei Mal sieht. Das ist die Grenzzone, in der Üben am meisten bringt. Orte, die er sicher sieht oder gar nicht sieht, kommen seltener dran. Etwa jeder siebte Ort wird zufällig gewählt, damit nichts übersehen wird. Derselbe Ort kommt nie zweimal direkt hintereinander.

**Die Treppe.** Für oben, Mitte und unten gibt es je eine Helligkeitsstufe. Nach zwei Treffern in Folge wird das Licht schwächer, nach einem Fehlversuch stärker. Zuerst geht es in großen Schritten, nach der ersten Umkehr in kleinen. So pendelt die Schwierigkeit um das, was er gerade noch schafft. Rechte Durchgänge, Durchgänge ohne Licht und abgebrochene verändern weder Treppe noch Karte.

**Die Phasen.** In Phase 1 kommt der Ton gleichzeitig mit dem Licht. Dann kommt der Ton etwas vor dem Licht, wird in Phase 3 leiser und erklingt in Phase 4 nur noch bei einem Teil der Durchgänge. In Phase 5 gibt es keinen Ton mehr. Zwischendurch kommen gelegentlich Durchgänge nur mit Licht und Durchgänge mit einem Ton auf der falschen Seite, damit er sich nicht allein auf den Ton verlässt. Die App geht erst weiter, wenn mehrere gute Sitzungen hintereinander ähnlich schwierig waren, und einen Schritt zurück, wenn es dreimal in Folge deutlich schlechter lief.

## Datenexport

Die Seite **Export und Sicherung** erreichst du im Bereich für Angehörige (mit PIN):

- **Alles sichern (JSON):** vollständige Sicherung aller Einstellungen, Sitzungen und Durchgänge. Auf dem iPad öffnet sich das Teilen-Menü (AirDrop, Mail, Dateien). Erst dann gilt die Sicherung als gemacht.
- **Durchgänge als Tabelle (CSV):** eine Zeile pro Durchgang, Semikolon-getrennt, öffnet direkt in Excel. Sie zählt nicht als Sicherung.
- **Sicherung einspielen:** eine JSON-Sicherung auswählen. Die vorhandenen Daten werden nach Rückfrage ersetzt.

**Erinnerung.** Auf der Startseite des Bereichs erscheint „Bitte die Daten sichern“, wenn es Trainingssitzungen gibt und noch nie gesichert wurde oder die letzte JSON-Sicherung mindestens 30 Tage zurückliegt.

**Nicht in der Sicherung:** die PIN und die eigenen Aufnahmen. Ein 4-stelliger Code ließe sich in Sekunden knacken und gehört nicht in eine Datei für die Ärztin oder den Arzt. Beim Einspielen bleiben PIN und Aufnahmen des iPads erhalten. Auf einem neuen iPad musst du eine neue PIN festlegen und die Aufnahmen neu machen.

Die **Testseite** zeigt einzelne Reize mit wählbarer Stufe, Ort und Ton. Der Abschnitt **Karte** zeigt den gespeicherten Stand, wahlweise als Trefferwahrscheinlichkeit bei Stufe 6 oder als Schwelle. Unter **Simulation** durchläuft ein simulierter Proband fünf Sitzungen. Schätzung und wahre Karte erscheinen nebeneinander, dazu der mittlere Schwellenfehler. Die Testseite verändert die Karte nie und die Simulation schreibt nichts in die Datenbank.

## Datenschutz

- Kein Server, keine Cloud, keine Telemetrie. Die App lädt zur Laufzeit nichts aus dem Internet.
- Trainingsdaten, PIN und Aufnahmen liegen nur im Speicher der App auf dem iPad.
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
