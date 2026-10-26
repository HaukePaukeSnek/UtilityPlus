# 🎯 CS2 Nade Scraper - Browser Extension (Firefox, Chrome, Brave & Edge)

Browser-Erweiterung zum automatischen Herunterladen von CS2 Lineups von [csnades.gg](https://csnades.gg) direkt in dein UtilityPlus.

---

## 🦊 Installation in Mozilla Firefox

1. Öffne **Firefox**.
2. Gib in die Adresszeile ein:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Klicke auf den Button **"Temporäres Add-on laden..."** (*Load Temporary Add-on...*).
4. Navigiere in diesen Ordner (`chrome_extension`) und wähle die Datei **`manifest.json`** aus.
5. **Fertig!** Das Add-on ist geladen und das CS2-Icon erscheint in der Symbolleiste.

---

## 🦁 Installation in Brave, Chrome oder Edge

1. Öffne deinen Browser (**Brave**, **Google Chrome** oder **Edge**).
2. Gib in die Adresszeile ein:
   ```text
   brave://extensions    (in Brave)
   chrome://extensions   (in Chrome / Edge)
   ```
3. Aktiviere oben rechts den Schalter **Entwicklermodus** (*Developer mode*).
4. Klicke oben links auf **"Entpackte Erweiterung laden"** (*Load unpacked*).
5. Wähle diesen Ordner (`chrome_extension`) aus.
6. **Fertig!** Pinne das CS2-Symbol oben rechts an deine Menüleiste.

---

## ⚙️ Einstellungen & Videokompression
Klicke im Popup auf das **Zahnrad (⚙️)**, um deine Einstellungen anzupassen:
- **Download-Ordner**: Standardmäßig `CS2_Lineups` (wird in `Downloads/CS2_Lineups` gespeichert; **UtilityPlus importiert neue Lineups daraus automatisch in Echtzeit**!)
- **Video-Qualität & Speicherbedarf**:
  - ⚡ **Komprimiert (LQ / 720p - Empfohlen)**: Nutzt die CDN-optimierten 720p-Streams von csnades.gg (~8–10 MB statt 40 MB, ~75% Ersparnis, blitzschnell ohne Wartezeit).
  - 🗜️ **Maximale Kompression (Re-Encode)**: Rekomprimiert das Video clientseitig im Browser (~1.5–2.5 MB, ~95% Ersparnis, dauert ca. 2–3 Sekunden pro Download).
  - 🎬 **Original (HQ / 1080p)**: Originaldateien (~30–50 MB).

---

## 🔄 Erweiterung aktualisieren
- **In Firefox**: Auf `about:debugging#/runtime/this-firefox` beim Add-on auf **"Neu laden"** klicken.
- **In Brave/Chrome**: Auf `chrome://extensions` beim Add-on auf das **Aktualisieren-Symbol (Kreispfeil 🔄)** klicken.

