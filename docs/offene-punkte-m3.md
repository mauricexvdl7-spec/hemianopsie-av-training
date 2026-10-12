# Offene Punkte nach Meilenstein 3 (Stand 12.10.2026)

Kleinere Funde aus den Prüfungen von Meilenstein 3, bewusst zurückgestellt. Alles, was vor dem Einsatz nötig war, ist behoben (Abschlussprüfung: „mit Korrekturen“, Korrekturen erledigt).

## Am iPad prüfen
- Erste Begrüßung: Spielt die eigene Aufnahme, oder springt beim allerersten Start die Systemstimme ein (Audio noch nicht bereit)?
- Nach einer Aufnahme im PIN-Bereich: Klingen die Trainingstöne danach gleich laut (iOS-Audiositzung nach Mikrofonnutzung)?
- Ecke oben rechts 3 s halten: Wird das Halten von iOS-Gesten abgebrochen?
- Monatsbericht: Druckbild und PDF über das Teilen-Menü.

## Später
- Eine laufende eigene Aufnahme lässt sich nicht abbrechen; nach dem Verlassen der Rückmeldung kann sie auf dem Startbildschirm weiterlaufen (nie während eines Durchgangs).
- Sitzung über Mitternacht: Rückmeldung nimmt den Endtag, Sitzungen zählen zum Starttag („Heute 0 von 0“ möglich).
- Eine Sitzung, deren einziger Durchgang abgebrochen wurde, zählt für das Tageslimit (entspricht dem Wortlaut der Spec).
- Fehler beim Lesen der Datenbank am Sitzungsende führen still zum Startbildschirm zurück.
- Import übernimmt `lastExportAtIso` aus der Sicherung (ältere Sicherung → Erinnerung früher).
- Einstellungen: keine Fehlermeldung, wenn Speichern fehlschlägt; Lade-Logik des Controllers doppelt.
- Monatsbericht: Fehlertext bleibt nach Monatswechsel stehen.
- Tests ergänzen: App-weites Sperren beim Verlassen, Einrichtung bis PIN-Schritt, Seite Auswertung, Richtung der Differenzfarben, Treppen-Regionen oben/unten, Selbststopp der Aufnahme nach 15 s, Zeitumstellung mit festgelegter Zeitzone.
- Kleinigkeiten: `nextStep` klemmt Sitzungsminuten nicht selbst (Aufrufer tun es); geteiltes Standardraster-Objekt veränderbar; doppelte Abschluss-Logik in `voice.ts`; Name `ReportCharts` (auch von der Auswertung genutzt).
