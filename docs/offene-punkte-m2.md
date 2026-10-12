# Offene Punkte nach Meilenstein 2 (Stand 11.10.2026, M3-Erledigungen markiert)

Punkte, die Meilenstein 3 erledigt hat, sind mit **ERLEDIGT (M3)** markiert und im Text durchgestrichen. Kleinere Funde aus den Prüfungen von Meilenstein 2, bewusst zurückgestellt. Die Gesamtprüfung hat sie als „kann warten“ eingestuft; alles, was vor dem Einsatz nötig war, ist behoben.

- **Task 1:** Stabilitätstest deckt fehlende Max-Subtraktion nicht ab (logLik −1000/−2000 direkt testen)
- **Task 1:** keine Schutzprüfung für γ = 0 (log 0) und H ≤ 0 in forgetMap
- **Task 1:** summarizePoint nur teilweise getestet (thetaSd, p nicht geprüft; pSd-Test mit widersprüchlicher Evidenz)
- **Task 1:** Testtitel „12°“ passt nicht zu 10°/15°
- **Task 1:** summarizePoint rechnet psychometric doppelt
- **Task 2:** vorhandene jsdom-Warnung 'HTMLCanvasElement getContext not implemented' aus tests/ui/trialStage.test.tsx (M1) — Testausgabe nicht sauber
- **Task 2:** Klemmen an Stufe 0 prüft reversals/lastDirection nicht; kein Test für Teilklemmen (10→11) oder eigene Startstufe
- **Task 3:** kein Test, in dem nur lastIndex positiven Score hat; Score-Orakel im Test mit Literalen statt Konstanten
- **Task 4:** Sperre (lockSessions) nicht isoliert getestet; kein Reinheitstest (Eingabe-Zustand unverändert); schwache Assertion not.toBe('2'); keine Grenzfälle beim Rückschritt (genau +2,0; nicht aufeinanderfolgend); Stufe 3x-Anteile nicht geprüft; NONE ist geteiltes Objekt; summary.stage wird nicht geprüft
- **Task 5:** kein Test für die gridPointId-Region bei Verschiebung über ±30°; next() erhöht index nicht bei Wurf aus checkTrialPlan; doppelte Schutzprüfung „kein Rasterpunkt rechts“ (blocks.ts/controller.ts); doppeltes clone in endSession; doppelter Import in controller.test.ts
- **Task 6:** Ortswahl-Abnahme nutzt nominale statt verschobene Position; Sicherheitsprüfung der Pläne teils tautologisch; TrialPlan.waitMs ohne Doku der neuen Bedeutung (bis 2800 ms); SIM_*-Konstanten unnötig exportiert
- **Task 7:** toter Ausdruck controller !== undefined in exportData.ts:257; Validierung v2 bleibt flach
- **Task 8:** ~~App mitten in der Sitzung geschlossen → Planer weg, Sitzung ohne Ende, Vergessen wird in der nächsten Sitzung erneut angewendet~~ **ERLEDIGT (M3)**; Kartenkreise (2,2°) überlappen nahe dem Kreuz
- **Task 8:** Simulationstest prüft leere DB, kann strukturell nicht scheitern; MapView-Test prüft nur einen Kreis; ~~abgebrochene Sitzung speichert bereits vergessene Karte (doppeltes Vergessen nach App-Schließen)~~ **ERLEDIGT (M3)**; doppelter gridChanged-Snapshot bei Absturz vor dem Speichern; ~~durationMin enthält Pausen~~ **ERLEDIGT (schon in M2 behoben, zählt nur aktive Zeit)**; Gradient-ID entfernt Umlaute
- **Task 9:** kein Controller-Test für geklemmte Timing-Eingaben; Fensteranhebung für Altinstallationen inline in TrainingScreen ungetestet; RAMP_PAIR_MS doppelt; README „setzt alles zurück“ ungenau; SAFETY.stimulusDurationMs veraltet; Grenzfall Plateau 1500 + Fenster 1500 → Tippen 1,5–1,8 s bei noch sichtbarem Licht zählt als verpasst (Klassifikationsfenster sollte ≥ Reizdauer sein)
- **Task 10:** ~~Drehen ins Hochformat während Pause zeigt weiter Pausentext statt „quer halten“ (bekannt aus M1)~~ **ERLEDIGT (M3)**; Dateiauswahl auf Export-Seite noch Browser-Standard
- **Task 10:** Patienten-Nebentext (--muted) nur 4,8–5,6:1 (Großschrift-Schwelle, Test prüft nur --text auf 7:1); tote Klassen .overlay-message/.summary; Schieber-Spur kaum sichtbar; MapView mit festen #666/#777
- **Task 6:** kein direkter Test für presentedLevel (indirekt abgedeckt); Lerntest-Datei ~20 s (Timeout 120 s)
- **Final:** bei gegenläufig abweichender Fensterbreite/-höhe (±2 %) können verschobene Reize ~0,1° vom Rand angeschnitten werden; ~~MIN_SESSION_MIN 10 in M2 nicht erreichbar (60 Durchgänge ≈ 4–5 min)~~ **ERLEDIGT (M3)**: Sitzungen dauern 10–30 min (Standard 30)
