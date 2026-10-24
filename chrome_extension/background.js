/**
 * CS2 Nade Scraper - Service Worker (Background Script)
 * Verwaltet Datei-Downloads und Speicherpfade
 */

// Standard-Einstellungen
const DEFAULT_SETTINGS = {
  baseFolder: 'CS2_Lineups',
  folderStructure: 'nested', // 'nested' (Map/Type/Slug) oder 'flat' (Ordner pro Nade)
  videoQuality: 'lq', // 'lq' (Komprimiert, ~75% kleiner), 'reencode' (Maximal komprimiert, ~90-95% kleiner), 'hq' (Original 30-60MB)
  downloadVideo: true,
  downloadImage: true,
  downloadThumbnail: false,
  saveInfoTxt: true,
  saveInfoJson: true,
  saveCfg: true
};

// Initialisiere Einstellungen bei Installation
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const updated = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(updated);
  console.log('[CS2 Scraper] Extension installiert. Einstellungen initialisiert:', updated);
});

// Nachrichten-Empfänger
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadLineup') {
    handleDownload(request.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Asynchrone Antwort
  }

  if (request.action === 'getSettings') {
    chrome.storage.local.get(null).then((settings) => {
      sendResponse({ success: true, settings: { ...DEFAULT_SETTINGS, ...settings } });
    });
    return true;
  }

  if (request.action === 'saveSettings') {
    chrome.storage.local.set(request.settings).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Download-Handler
async function handleDownload(data) {
  if (!data || !data.isNadePage) {
    throw new Error('Ungültige Granatendaten.');
  }

  const stored = await chrome.storage.local.get(null);
  const settings = { ...DEFAULT_SETTINGS, ...stored };

  // Basis-Verzeichnis bereinigen
  let baseFolder = (settings.baseFolder || 'CS2_Lineups').trim().replace(/^[/\\]+|[/\\]+$/g, '');
  if (!baseFolder) baseFolder = 'CS2_Lineups';

  // Zielordner zusammenstellen
  const cleanMap = sanitize(data.mapName || data.mapSlug || 'Map');
  let typeStr = data.nadeTypeLabel || data.nadeType || 'Grenade';
  if (typeStr.toLowerCase().includes('molotov')) {
    typeStr = 'Molotov';
  }
  const cleanType = sanitize(typeStr);
  const cleanSlug = sanitize(data.nadeSlug || 'lineup');

  let targetFolder = '';
  if (settings.folderStructure === 'nested') {
    targetFolder = `${baseFolder}/${cleanMap}/${cleanType}/${cleanSlug}`;
  } else {
    targetFolder = `${baseFolder}/${cleanMap}_${cleanType}_${cleanSlug}`;
  }

  const downloadPromises = [];
  let downloadedCount = 0;

  // 1. Video herunterladen (unterstützt Kompression & Original)
  if (settings.downloadVideo) {
    let videoUrl = data.videoUrl;
    let videoFilename = `${targetFolder}/video.mp4`;

    if (data.compressedVideoBlobUrl) {
      // Client-seitig re-kodiertes Video
      videoUrl = data.compressedVideoBlobUrl;
      const ext = data.compressedVideoExt || 'mp4';
      videoFilename = `${targetFolder}/video.${ext}`;
    } else if (settings.videoQuality === 'lq') {
      // Bevorzuge komprimierte CDN-Version (LQ ~7-10 MB statt 35-50 MB)
      videoUrl = data.videoLqUrl || data.videoUrl;
      videoFilename = `${targetFolder}/video.mp4`;
    } else if (settings.videoQuality === 'hq') {
      // Unkomprimierte Originalversion
      videoUrl = data.videoUrl;
      videoFilename = `${targetFolder}/video.mp4`;
    }

    if (videoUrl) {
      downloadPromises.push(
        downloadFile(videoUrl, videoFilename).then(() => downloadedCount++)
      );
    }
  }

  // 2. Lineup-Bild herunterladen (lineup.webp)
  if (settings.downloadImage && data.lineupImageUrl) {
    const imageFilename = `${targetFolder}/lineup.webp`;
    downloadPromises.push(
      downloadFile(data.lineupImageUrl, imageFilename).then(() => downloadedCount++)
    );
  }

  // 3. Thumbnail (Vorschaubild) optional
  if (settings.downloadThumbnail && data.thumbnailUrl) {
    const thumbFilename = `${targetFolder}/thumbnail.webp`;
    downloadPromises.push(
      downloadFile(data.thumbnailUrl, thumbFilename).then(() => downloadedCount++)
    );
  }

  // 4. Text-Info-Datei (info.txt)
  if (settings.saveInfoTxt) {
    const txtContent = generateInfoTxt(data);
    const txtDataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(txtContent);
    const txtFilename = `${targetFolder}/info.txt`;
    downloadPromises.push(
      downloadFile(txtDataUrl, txtFilename).then(() => downloadedCount++)
    );
  }

  // 5. JSON-Metadaten (info.json)
  if (settings.saveInfoJson) {
    const jsonContent = JSON.stringify(data, null, 2);
    const jsonDataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonContent);
    const jsonFilename = `${targetFolder}/info.json`;
    downloadPromises.push(
      downloadFile(jsonDataUrl, jsonFilename).then(() => downloadedCount++)
    );
  }

  // 6. CS2 Practice CFG (lineup.cfg)
  if (settings.saveCfg && data.consoleCommand) {
    const cfgContent = generateCfg(data);
    const cfgDataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(cfgContent);
    const cfgFilename = `${targetFolder}/lineup.cfg`;
    downloadPromises.push(
      downloadFile(cfgDataUrl, cfgFilename).then(() => downloadedCount++)
    );
  }

  await Promise.all(downloadPromises);

  return {
    success: true,
    downloadedCount,
    folder: targetFolder,
    message: `${downloadedCount} Dateien in "${targetFolder}" gespeichert!`
  };
}

// Führt einzelnen Download aus
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: url,
        filename: filename,
        conflictAction: 'overwrite',
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[CS2 Scraper] Download Fehler:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(downloadId);
        }
      }
    );
  });
}

// Generiert die strukturierte Textdatei
function generateInfoTxt(data) {
  return `======================================================================
CS2 GRANATEN LINEUP: ${data.name || data.displayName}
======================================================================

Name:         ${data.name}
Anzeige:      ${data.displayName || data.name}
Map:          ${data.mapName} (${data.mapSlug})
Typ:          ${data.nadeTypeLabel} (${data.nadeType})
Ziel (To):    ${data.titleTo || '-'}
Von (From):   ${data.titleFrom || '-'}
Team:         ${data.teamLabel}
Technik:      ${data.techniqueLabel}
Bewegung:     ${data.movementLabel}
Präzision:    ${data.precisionLabel}

----------------------------------------------------------------------
CS2 PRAXIS TELEPORT-BEFEHL (In Konsole einfügen):
----------------------------------------------------------------------
${data.consoleCommand || '// Kein setpos-Befehl verfügbar'}

----------------------------------------------------------------------
ANLEITUNG / STEPS:
----------------------------------------------------------------------
${data.instructions && data.instructions.length > 0
  ? data.instructions.map((step, idx) => `${idx + 1}. ${step}`).join('\n')
  : 'Keine Text-Anleitung hinterlegt. Bitte Video & Lineup-Foto beachten.'}

----------------------------------------------------------------------
QUELLEN & ASSETS:
----------------------------------------------------------------------
Webseite:     ${data.url}
Video MP4:    ${data.videoUrl}
Lineup Foto:  ${data.lineupImageUrl}
Gescraped am: ${new Date().toLocaleString('de-DE')}
======================================================================
`;
}

// Generiert eine fertige CS2 .cfg Datei zum Üben auf dem Server
function generateCfg(data) {
  return `// ==================================================================
// CS2 Lineup Config: ${data.displayName || data.name}
// Map: ${data.mapName} | Typ: ${data.nadeTypeLabel} | Technik: ${data.techniqueLabel}
// ==================================================================

sv_cheats 1
bot_kick

// Spieler-Position & Blickwinkel setzen:
${data.consoleCommand}

say_team "Lineup geladen: ${data.mapName} ${data.titleTo || ''} (${data.techniqueLabel})"
echo ">>> CS2 LINEUP GELADEN: ${data.name} <<<"
echo ">>> Technik: ${data.techniqueLabel} | Bewegung: ${data.movementLabel} <<<"
`;
}

// Dateinamen bereinigen
function sanitize(name) {
  return String(name)
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}
