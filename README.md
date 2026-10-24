# UtilityPlus

Ein modernes, minimalistisches Programm zur Anzeige von Counter-Strike 2 Granaten-Lineups neben dem Spiel.

## Entwicklungsmodus starten

Im Projektordner einfach folgenden Befehl ausführen:

```bash
npm start
```

## Installer für Freunde erstellen (Windows / Mac / Linux)

Deine Freunde müssen **weder Node.js noch ein Terminal noch sonstige Pakete installieren**. Das Programm wird als ganz normaler Windows-Installer (`.exe`) oder Mac-Installer (`.dmg`) verpackt:

```bash
# Windows-Installer erstellen (erzeugt UtilityPlus Setup.exe)
npm run build:win

# Mac-Installer erstellen (erzeugt UtilityPlus.dmg)
npm run build:mac
```

### Was der Installer macht:
1. **Installation:** Installiert UtilityPlus als echtes Programm (unter Windows in `ProgramFiles` bzw. App-Verzeichnis).
2. **Desktop-Shortcut:** Erstellt automatisch eine **Verknüpfung auf dem Desktop** mit dem offiziellen UtilityPlus-Icon.
3. **Startmenü-Eintrag:** Fügt das Programm dem Windows-Startmenü hinzu.
4. **Lineup-Ordner für Utilitys:** Der Ordner `CS2_Lineups` liegt unkomprimiert direkt im Installationsverzeichnis unter `resources/CS2_Lineups`. Deine Freunde können dort jederzeit neue Videos, Fotos oder Ordner hineinkopieren.
5. **Saubere Deinstallation:** Erscheint in den Windows-Systemeinstellungen („Installierte Apps“) und kann sauber deinstalliert werden.

---

## Interner Auto-Update-Checker (GitHub Releases)

UtilityPlus verfügt über einen integrierten Updater:
- Wenn du eine neue Version baust und auf GitHub als Release veröffentlichst, prüft UtilityPlus automatisch im Hintergrund nach Updates.
- Sobald ein Update verfügbar ist, erscheint in der App ein diskretes Banner:
  `🚀 Update v1.1.0 wird geladen...`
- Nach dem Download erscheint ein Klick-Button:
  `✨ Update v1.1.0 bereit! [Jetzt installieren]`
- Ein Klick installiert das Update automatisch und startet das Programm neu – ohne manuelles Herunterladen von GitHub.

---

## Steuerung (Funktioniert auch während Counter-Strike im Fokus ist)

Das Programm reagiert systemweit auf die **Pfeiltasten** (Global Hotkeys) mit weichen, flüssigen Animationen:

- **Pfeiltaste Rechts (→):** In tiefere Ebene / Unterordner navigieren (z. B. Karte öffnen oder Lineup-Ansicht öffnen).
- **Pfeiltaste Links (←):** In höhere Ebene navigieren (z. B. von Lineups zurück zu Kategorien oder von Kategorien zu Karten).
- **Pfeiltaste Hoch (↑) & Runter (↓):**
  - **In der Ordner-Ansicht (Karten / Kategorien):** Unterordner auswählen (aktiver Eintrag schiebt sich sanft nach rechts).
  - **In der Lineup-Ansicht:** Zwischen den verfügbaren Lineups der Kategorie cyclen (vor / zurück) mit weichen Übergangsanimationen.

---

## Features

- **Full-Frame Media:** Video und Foto füllen den gesamten Bereich rechteckig aus (`cover`).
- **Loop-Video mit 1.5x Speed:** Das Granatenvideo läuft flüssig in Dauerschleife mit 1.5x Wiedergabegeschwindigkeit.
- **Ziel-Frame Inset (Picture-in-Picture):** Im oberen rechten Bereich des Videos wird ein Frame genau 1.5 Sekunden vor Videoende vergrößert eingeblendet (50% Videobreite, abgerundete Ecken, Buffer zum Rand, Umrandung in Hintergrundfarbe), um die Landestelle der Utility sofort zu sehen.
- **Pixel-perfektes CS-Fadenkreuz:** Genau in der Bildmitte des Lineup-Fotos ist ein Fadenkreuz mit rundherum absolut gleichmäßiger 1px schwarzer Outline eingeblendet.
- **Weiche Wechsel-Animationen:** Flüssige, richtungsbezogene Übergänge (240–250 ms) beim Navigieren durch Ebenen und Lineups.
- **Individuelles App-Logo:** CS-Orange Hintergrund mit blauem CS-Schriftzug `UTILITY` und leuchtendem Cyberpunk-Pink `+`.
- **Daten aus `info.txt`:**
  - **Titel:** `Anzeige`
  - **Infobereich:** `Technik`, `Bewegung` und `Präzision`
- **Global Hotkeys:** Lineups und Kategorien direkt während des Spielens per Pfeiltasten umschalten.
