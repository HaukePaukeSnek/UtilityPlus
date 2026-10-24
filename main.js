const { app, BrowserWindow, globalShortcut, protocol, net, ipcMain, shell } = require('electron');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Register custom protocol for local media streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: {
      bypassCSP: true,
      stream: true,
      supportFetchAPI: true,
      standard: true,
      secure: true
    }
  }
]);

let mainWindow = null;

function toAssetUrl(filePath) {
  if (!filePath) return null;
  return 'asset://media/?path=' + encodeURIComponent(path.resolve(filePath));
}

function isLineupFolder(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    return files.some(f => /\.(mp4|webm|mkv|png|webp|jpe?g)$/i.test(f) || f === 'info.txt' || f === 'info.json');
  } catch (e) {
    return false;
  }
}

function parseLineupDetails(lPath, folderName) {
  let txtInfo = {};
  const txtPath = path.join(lPath, 'info.txt');
  if (fs.existsSync(txtPath)) {
    try {
      const content = fs.readFileSync(txtPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          txtInfo[match[1].trim()] = match[2].trim();
        }
      }
    } catch (e) {
      console.error(`Fehler beim Lesen von ${txtPath}:`, e);
    }
  }

  let jsonInfo = {};
  const jsonPath = path.join(lPath, 'info.json');
  if (fs.existsSync(jsonPath)) {
    try {
      jsonInfo = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {}
  }

  const name = txtInfo['Anzeige'] || jsonInfo.displayName || jsonInfo.name || folderName;
  const techniqueLabel = txtInfo['Technik'] || jsonInfo.techniqueLabel || 'Standard';
  const movementLabel = txtInfo['Bewegung'] || jsonInfo.movementLabel || 'Standard';
  const precisionLabel = txtInfo['Präzision'] || jsonInfo.precisionLabel || 'Standard';

  let rawMap = txtInfo['Map'] || jsonInfo.mapName || '';
  if (rawMap.includes('(')) rawMap = rawMap.split('(')[0].trim();

  let rawCat = txtInfo['Typ'] || jsonInfo.nadeTypeLabel || '';
  if (rawCat.includes('(')) rawCat = rawCat.split('(')[0].trim();

  const files = fs.readdirSync(lPath);
  const video = files.find(f => /\.(mp4|webm|mkv)$/i.test(f));
  let image = files.find(f => /\.(webp|png|jpe?g)$/i.test(f) && !f.toLowerCase().includes('thumb'));
  if (!image) {
    image = files.find(f => /\.(webp|png|jpe?g)$/i.test(f));
  }

  return {
    folder: folderName,
    name: name,
    techniqueLabel: techniqueLabel,
    movementLabel: movementLabel,
    precisionLabel: precisionLabel,
    videoUrl: video ? toAssetUrl(path.join(lPath, video)) : null,
    imageUrl: image ? toAssetUrl(path.join(lPath, image)) : null,
    mapHint: rawMap || null,
    catHint: rawCat || null
  };
}

function normalizeMapName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^de_/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/ii$/, '2');
}

function getDocumentsLineupsDir() {
  try {
    return path.join(app.getPath('documents'), 'UtilityPlus', 'CS2_Lineups');
  } catch (e) {
    return path.join(process.cwd(), 'CS2_Lineups');
  }
}

function copyDirectoryRecursively(src, dest, ignoreFilters = true) {
  if (!fs.existsSync(src)) return;
  if (path.resolve(src) === path.resolve(dest)) return;
  if (!fs.existsSync(dest)) {
    try {
      fs.mkdirSync(dest, { recursive: true });
    } catch (e) {}
  }
  let entries = [];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (ignoreFilters && (entry.name.toLowerCase().includes('hier_lineups') || entry.name.toLowerCase().includes('readme'))) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursively(srcPath, destPath, ignoreFilters);
    } else {
      if (!fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (e) {}
      }
    }
  }
}

function getDownloadsLineupsCandidates() {
  const dirs = [];
  try {
    const downloads = app.getPath('downloads');
    if (downloads) {
      dirs.push(path.join(downloads, 'CS2_Lineups'));
      dirs.push(path.join(downloads, 'Lineups'));
    }
  } catch (e) {}
  return dirs;
}

function hasActiveDownloads(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (name.endsWith('.crdownload') || name.endsWith('.part') || name.endsWith('.download') || name.endsWith('.tmp')) {
        return true;
      }
      if (entry.isDirectory()) {
        if (hasActiveDownloads(path.join(dirPath, entry.name))) {
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

function moveDirectorySafely(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (hasActiveDownloads(src)) return false;
  if (!fs.existsSync(dest)) {
    try {
      fs.mkdirSync(dest, { recursive: true });
    } catch (e) {
      return false;
    }
  }
  let entries = [];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch (e) {
    return false;
  }

  let movedAny = false;
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const srcItem = path.join(src, entry.name);
    const destItem = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (hasActiveDownloads(srcItem)) continue;
      const res = moveDirectorySafely(srcItem, destItem);
      if (res) movedAny = true;
      try {
        if (fs.existsSync(srcItem) && fs.readdirSync(srcItem).length === 0) {
          fs.rmdirSync(srcItem);
        }
      } catch (e) {}
    } else {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.crdownload') || lower.endsWith('.part') || lower.endsWith('.download') || lower.endsWith('.tmp')) continue;
      try {
        fs.copyFileSync(srcItem, destItem);
        fs.unlinkSync(srcItem);
        movedAny = true;
      } catch (err) {
        console.warn('[Auto-Import] Datei konnte nicht verschoben werden:', srcItem, err);
      }
    }
  }

  try {
    if (fs.existsSync(src) && fs.readdirSync(src).length === 0) {
      fs.rmdirSync(src);
    }
  } catch (e) {}
  return movedAny;
}

function importLineupsFromDownloads(targetDir) {
  const destDir = targetDir || (app.isPackaged ? getDocumentsLineupsDir() : path.join(__dirname, 'CS2_Lineups'));
  if (!destDir) return false;

  const candidateDirs = getDownloadsLineupsCandidates();
  let importedAny = false;

  for (let candidate of candidateDirs) {
    if (!fs.existsSync(candidate)) continue;
    if (path.resolve(candidate) === path.resolve(destDir)) continue;

    // Falls Downloads/CS2_Lineups noch einen weiteren verschachtelten CS2_Lineups Ordner hat, entpacken
    try {
      const topEntries = fs.readdirSync(candidate, { withFileTypes: true });
      const realDirs = topEntries.filter(e => !e.name.startsWith('.') && e.isDirectory());
      if (realDirs.length === 1 && (realDirs[0].name.toLowerCase() === 'cs2_lineups' || realDirs[0].name.toLowerCase() === 'lineups')) {
        candidate = path.join(candidate, realDirs[0].name);
      }
    } catch (e) {}

    const moved = moveDirectorySafely(candidate, destDir);
    if (moved) {
      console.log(`[Auto-Import] Neue Lineups aus ${candidate} nach ${destDir} importiert!`);
      importedAny = true;
    }
  }

  return importedAny;
}

function getDocumentsExtensionDir() {
  try {
    return path.join(app.getPath('documents'), 'UtilityPlus', 'Chrome_Extension');
  } catch (e) {
    return null;
  }
}

function getExtensionDirectory() {
  const docsExtDir = getDocumentsExtensionDir();

  let srcDir = null;
  if (app.isPackaged) {
    srcDir = path.join(process.resourcesPath, 'chrome_extension');
  } else {
    srcDir = path.join(__dirname, 'chrome_extension');
  }

  if (docsExtDir && srcDir && fs.existsSync(srcDir)) {
    try {
      copyDirectoryRecursively(srcDir, docsExtDir, false);
      return docsExtDir;
    } catch (e) {
      console.warn('Fehler beim Synchronisieren der Chrome-Extension:', e);
    }
  }

  if (docsExtDir && fs.existsSync(docsExtDir)) {
    return docsExtDir;
  }

  return srcDir;
}

function getDocumentsCalloutsDir() {
  try {
    return path.join(app.getPath('documents'), 'UtilityPlus', 'Map_Callouts');
  } catch (e) {
    return path.join(process.cwd(), 'Map_Callouts');
  }
}

function getCandidateCalloutDirs() {
  const dirs = [];

  // Local workspace / project directories
  dirs.push(path.join(__dirname, 'Map_Callouts'));
  dirs.push(path.join(process.cwd(), 'Map_Callouts'));

  // Packaged app paths
  if (app.isPackaged) {
    try {
      dirs.push(path.join(process.resourcesPath, 'Map_Callouts'));
      dirs.push(path.join(path.dirname(process.execPath), 'Map_Callouts'));
    } catch (e) {}
  }

  // Documents directory
  try {
    const docsDir = getDocumentsCalloutsDir();
    if (docsDir) dirs.push(docsDir);
  } catch (e) {}

  const unique = [];
  for (const d of dirs) {
    if (d && !unique.includes(d) && fs.existsSync(d)) {
      unique.push(d);
    }
  }
  return unique;
}

function getCalloutsDirectory() {
  const docsDir = getDocumentsCalloutsDir();

  let srcDir = null;
  if (app.isPackaged) {
    srcDir = path.join(process.resourcesPath, 'Map_Callouts');
  } else {
    srcDir = path.join(__dirname, 'Map_Callouts');
  }

  if (docsDir && srcDir && fs.existsSync(srcDir)) {
    try {
      copyDirectoryRecursively(srcDir, docsDir, false);
    } catch (e) {}
  }

  // In packaged mode, prefer Documents; in dev mode, prefer local project folder if it exists
  if (!app.isPackaged && srcDir && fs.existsSync(srcDir)) {
    return srcDir;
  }

  if (docsDir && fs.existsSync(docsDir)) {
    return docsDir;
  }

  return srcDir;
}

function findCalloutImage(mapName) {
  const normTarget = normalizeMapName(mapName);
  const candidateBases = getCandidateCalloutDirs();

  // 1. Search inside map subfolders of every candidate base
  for (const base of candidateBases) {
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const normDir = normalizeMapName(entry.name);
          if (normDir === normTarget || normDir.includes(normTarget) || normTarget.includes(normDir)) {
            const folderPath = path.join(base, entry.name);
            const files = fs.readdirSync(folderPath);
            const imgFile = files.find(f => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f) && !f.startsWith('.'));
            if (imgFile) {
              return {
                imagePath: path.join(folderPath, imgFile),
                folderPath: folderPath
              };
            }
          }
        }
      }
    } catch (e) {}
  }

  // 2. Search direct image file in any candidate base (e.g. Map_Callouts/Mirage.png, Map_Callouts/de_dust2.jpg)
  for (const base of candidateBases) {
    try {
      const files = fs.readdirSync(base);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const ext = path.extname(file);
        if (/\.(png|jpe?g|webp|bmp|gif)$/i.test(ext)) {
          const nameWithoutExt = path.basename(file, ext);
          if (normalizeMapName(nameWithoutExt) === normTarget) {
            return {
              imagePath: path.join(base, file),
              folderPath: base
            };
          }
        }
      }
    } catch (e) {}
  }

  // 3. Search inside CS2_Lineups/<mapName>/
  const lineupsDir = getLineupsDirectory();
  if (lineupsDir && fs.existsSync(lineupsDir)) {
    try {
      const entries = fs.readdirSync(lineupsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const normDir = normalizeMapName(entry.name);
          if (normDir === normTarget || normDir.includes(normTarget) || normTarget.includes(normDir)) {
            const folderPath = path.join(lineupsDir, entry.name);
            const files = fs.readdirSync(folderPath);
            const imgFile = files.find(f => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f) && !f.startsWith('.'));
            if (imgFile) {
              return {
                imagePath: path.join(folderPath, imgFile),
                folderPath: folderPath
              };
            }
          }
        }
      }
    } catch (e) {}
  }

  // Fallback: determine preferred folder path to open/create for this map
  let targetFolder = null;
  for (const base of candidateBases) {
    const directSub = path.join(base, mapName);
    if (fs.existsSync(directSub)) {
      targetFolder = directSub;
      break;
    }
  }

  if (!targetFolder) {
    const primaryBase = candidateBases[0] || (app.isPackaged ? getDocumentsCalloutsDir() : path.join(__dirname, 'Map_Callouts'));
    targetFolder = path.join(primaryBase, mapName);
    try {
      fs.mkdirSync(targetFolder, { recursive: true });
    } catch (e) {}
  }

  return {
    imagePath: null,
    folderPath: targetFolder
  };
}

function hasActualContent(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.some(e => !e.startsWith('.') && !e.toLowerCase().includes('hier_lineups') && !e.toLowerCase().includes('readme'));
  } catch (e) {
    return false;
  }
}

function syncAndProtectLineups() {
  const docsDir = getDocumentsLineupsDir();
  if (!fs.existsSync(docsDir)) {
    try {
      fs.mkdirSync(docsDir, { recursive: true });
    } catch (e) {}
  }

  // Automatischer Import von neuen Lineups aus dem Downloads-Ordner (Browser-Extension)
  try {
    importLineupsFromDownloads(docsDir);
  } catch (e) {
    console.warn('[Auto-Import] Fehler beim Synchronisieren aus Downloads:', e);
  }

  if (app.isPackaged) {
    // Check if any old lineups exist in Program Files (resources or root) and safely migrate them to Documents
    const resourcePath = path.join(process.resourcesPath, 'CS2_Lineups');
    const execPath = path.join(path.dirname(process.execPath), 'CS2_Lineups');

    if (hasActualContent(resourcePath)) {
      copyDirectoryRecursively(resourcePath, docsDir);
    }
    if (hasActualContent(execPath)) {
      copyDirectoryRecursively(execPath, docsDir);
    }
  }
}

function getLineupsDirectory() {
  syncAndProtectLineups();

  const docsDir = getDocumentsLineupsDir();
  if (hasActualContent(docsDir)) {
    return docsDir;
  }

  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(path.dirname(process.execPath), 'CS2_Lineups'));
    candidates.push(path.join(process.resourcesPath, 'CS2_Lineups'));
  } else {
    candidates.push(path.join(__dirname, 'CS2_Lineups'));
    candidates.push(path.join(process.cwd(), 'CS2_Lineups'));
  }

  for (const candidate of candidates) {
    if (hasActualContent(candidate)) {
      return candidate;
    }
  }

  return docsDir;
}

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // File logging to inspect update status on Windows
  let logFile = '';
  try {
    logFile = path.join(app.getPath('userData'), 'updater.log');
  } catch (e) {}

  function logUpdate(msg) {
    console.log('[AutoUpdater]', msg);
    if (logFile) {
      try {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
      } catch (e) {}
    }
  }

  autoUpdater.logger = {
    info: (msg) => logUpdate(`[INFO] ${msg}`),
    warn: (msg) => logUpdate(`[WARN] ${msg}`),
    error: (msg) => logUpdate(`[ERROR] ${msg}`)
  };

  logUpdate(`Initialized. App version: ${app.getVersion()}`);

  autoUpdater.on('checking-for-update', () => {
    logUpdate('Checking for update on GitHub...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    logUpdate(`Update available: v${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', percent);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logUpdate(`Update downloaded successfully: v${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    logUpdate(`No update available. Current version is up to date (${info ? info.version : ''})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available');
    }
  });

  autoUpdater.on('error', (err) => {
    logUpdate(`Error: ${err ? err.stack || err.message : err}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err ? err.message : 'Fehler beim Update');
    }
  });

  if (app.isPackaged) {
    // Initial check after window opens
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        logUpdate(`Check error: ${err.message}`);
      });
    }, 2500);

    // Periodic check every 15 minutes
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        logUpdate(`Periodic check error: ${err.message}`);
      });
    }, 15 * 60 * 1000);
  }
}

let lineupsWatcher = null;
let downloadsWatcher = null;
let downloadsTopWatcher = null;
let calloutsWatchers = [];
let watcherDebounce = null;

function watchLineupsDirectory() {
  if (lineupsWatcher) {
    try {
      lineupsWatcher.close();
    } catch (e) {}
    lineupsWatcher = null;
  }
  const dir = getLineupsDirectory();
  if (dir && !fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
  if (dir && fs.existsSync(dir)) {
    try {
      lineupsWatcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.startsWith('.') || filename.includes('tmp') || filename.endsWith('.crdownload') || filename.endsWith('.part'))) return;
        clearTimeout(watcherDebounce);
        watcherDebounce = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lineups-updated');
          }
        }, 500);
      });
    } catch (err) {
      console.warn('Lineup directory watch error:', err);
    }
  }

  // Watcher für Downloads/CS2_Lineups (Browser-Downloads)
  if (downloadsWatcher) {
    try { downloadsWatcher.close(); } catch (e) {}
    downloadsWatcher = null;
  }
  if (downloadsTopWatcher) {
    try { downloadsTopWatcher.close(); } catch (e) {}
    downloadsTopWatcher = null;
  }

  const dlCandidates = getDownloadsLineupsCandidates();
  for (const dlDir of dlCandidates) {
    if (fs.existsSync(dlDir)) {
      try {
        downloadsWatcher = fs.watch(dlDir, { recursive: true }, (eventType, filename) => {
          if (filename && (filename.startsWith('.') || filename.endsWith('.crdownload') || filename.endsWith('.part') || filename.endsWith('.tmp'))) return;
          clearTimeout(watcherDebounce);
          watcherDebounce = setTimeout(() => {
            const imported = importLineupsFromDownloads(dir);
            if (imported && mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('lineups-updated');
            }
          }, 800);
        });
        break;
      } catch (err) {
        console.warn('Downloads directory watch error:', err);
      }
    }
  }

  // Falls Downloads/CS2_Lineups noch nicht existiert, Haupt-Downloads-Verzeichnis überwachen
  try {
    const dlTop = app.getPath('downloads');
    if (dlTop && fs.existsSync(dlTop)) {
      downloadsTopWatcher = fs.watch(dlTop, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        const fn = filename.toLowerCase();
        if (fn.includes('cs2_lineups') || fn.includes('lineup')) {
          clearTimeout(watcherDebounce);
          watcherDebounce = setTimeout(() => {
            watchLineupsDirectory();
            const imported = importLineupsFromDownloads(dir);
            if (imported && mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('lineups-updated');
            }
          }, 1000);
        }
      });
    }
  } catch (err) {}

  // Clear existing callout watchers
  calloutsWatchers.forEach(w => {
    try { w.close(); } catch (e) {}
  });
  calloutsWatchers = [];

  const calloutDirs = getCandidateCalloutDirs();
  for (const cDir of calloutDirs) {
    try {
      const w = fs.watch(cDir, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.startsWith('.') || filename.includes('tmp') || filename.endsWith('.crdownload') || filename.endsWith('.part'))) return;
        clearTimeout(watcherDebounce);
        watcherDebounce = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lineups-updated');
          }
        }, 500);
      });
      calloutsWatchers.push(w);
    } catch (err) {
      console.warn('Callouts directory watch error for', cDir, err);
    }
  }
}

function scanLineupDirectory(baseDir) {
  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (e) {}
    return [];
  }

  // If baseDir contains a nested CS2_Lineups or Lineups directory, unwrap it
  try {
    const topEntries = fs.readdirSync(baseDir, { withFileTypes: true });
    const realDirs = topEntries.filter(e => !e.name.startsWith('.') && e.isDirectory());
    if (realDirs.length === 1 && (realDirs[0].name.toLowerCase() === 'cs2_lineups' || realDirs[0].name.toLowerCase() === 'lineups')) {
      baseDir = path.join(baseDir, realDirs[0].name);
    }
  } catch (e) {}

  const mapsMap = new Map(); // mapName -> Map of categoryName -> Array of lineups

  function addLineup(mapName, catName, lineupObj) {
    if (!mapsMap.has(mapName)) {
      mapsMap.set(mapName, new Map());
    }
    const catMap = mapsMap.get(mapName);
    if (!catMap.has(catName)) {
      catMap.set(catName, []);
    }
    catMap.get(catName).push(lineupObj);
  }

  let entries = [];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (e) {
    return [];
  }

  for (const entry1 of entries) {
    if (entry1.name.startsWith('.') || !entry1.isDirectory()) continue;
    const path1 = path.join(baseDir, entry1.name);

    // Case 1: Level 1 is already a lineup folder (flat list of lineups)
    if (isLineupFolder(path1)) {
      const parsed = parseLineupDetails(path1, entry1.name);
      const mName = parsed.mapHint || 'Standard';
      const cName = parsed.catHint || 'Allgemein';
      addLineup(mName, cName, parsed);
      continue;
    }

    // Otherwise level 1 is a Map folder
    let entries2 = [];
    try {
      entries2 = fs.readdirSync(path1, { withFileTypes: true });
    } catch (e) {
      continue;
    }

    for (const entry2 of entries2) {
      if (entry2.name.startsWith('.') || !entry2.isDirectory()) continue;
      const path2 = path.join(path1, entry2.name);

      // Case 2: Level 2 is a lineup folder (Map -> Lineup without category)
      if (isLineupFolder(path2)) {
        const parsed = parseLineupDetails(path2, entry2.name);
        const mName = parsed.mapHint || entry1.name;
        const cName = parsed.catHint || 'Allgemein';
        addLineup(mName, cName, parsed);
        continue;
      }

      // Case 3: Level 2 is a Category folder (Map -> Category -> Lineup)
      let entries3 = [];
      try {
        entries3 = fs.readdirSync(path2, { withFileTypes: true });
      } catch (e) {
        continue;
      }

      for (const entry3 of entries3) {
        if (entry3.name.startsWith('.') || !entry3.isDirectory()) continue;
        const path3 = path.join(path2, entry3.name);

        if (isLineupFolder(path3)) {
          const parsed = parseLineupDetails(path3, entry3.name);
          const mName = parsed.mapHint || entry1.name;
          const cName = parsed.catHint || entry2.name;
          addLineup(mName, cName, parsed);
        }
      }
    }
  }

  // Also discover any maps from Map_Callouts (S5 Premier Pool, etc.)
  const candidateBases = getCandidateCalloutDirs();
  for (const calloutBase of candidateBases) {
    try {
      const cEntries = fs.readdirSync(calloutBase, { withFileTypes: true });
      for (const cEntry of cEntries) {
        if (cEntry.isDirectory() && !cEntry.name.startsWith('.')) {
          const exists = Array.from(mapsMap.keys()).some(k => normalizeMapName(k) === normalizeMapName(cEntry.name));
          if (!exists) {
            mapsMap.set(cEntry.name, new Map());
          }
        }
      }
    } catch (e) {}
  }

  const result = [];
  for (const [mName, catMap] of mapsMap.entries()) {
    const categories = [];
    for (const [cName, lineups] of catMap.entries()) {
      lineups.sort((a, b) => a.name.localeCompare(b.name));
      if (lineups.length > 0) {
        categories.push({ name: cName, lineups });
      }
    }
    categories.sort((a, b) => a.name.localeCompare(b.name));

    const calloutData = findCalloutImage(mName);
    result.push({
      name: mName,
      calloutImageUrl: calloutData.imagePath ? toAssetUrl(calloutData.imagePath) : null,
      calloutFolderPath: calloutData.folderPath,
      categories
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

const DEFAULT_HOTKEYS = {
  playPause: { accelerator: 'num0', label: 'Numpad 0', domCode: 'Numpad0' },
  up: { accelerator: 'Up', label: '↑ Oben', domCode: 'ArrowUp' },
  down: { accelerator: 'Down', label: '↓ Unten', domCode: 'ArrowDown' },
  left: { accelerator: 'Left', label: '← Links', domCode: 'ArrowLeft' },
  right: { accelerator: 'Right', label: '→ Rechts', domCode: 'ArrowRight' }
};

let currentHotkeys = { ...DEFAULT_HOTKEYS };

function getHotkeysFilePath() {
  try {
    return path.join(app.getPath('userData'), 'hotkeys.json');
  } catch (e) {
    return null;
  }
}

function loadHotkeysFromDisk() {
  const filePath = getHotkeysFilePath();
  if (filePath && fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      currentHotkeys = { ...DEFAULT_HOTKEYS, ...data };
    } catch (e) {
      console.warn('Fehler beim Laden der Hotkeys:', e);
    }
  }
  return currentHotkeys;
}

function saveHotkeysToDisk(hotkeys) {
  const filePath = getHotkeysFilePath();
  if (filePath) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(hotkeys, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Fehler beim Speichern der Hotkeys:', e);
    }
  }
}

function registerGlobalHotkeys(hotkeys) {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}

  currentHotkeys = hotkeys || loadHotkeysFromDisk();

  for (const [action, item] of Object.entries(currentHotkeys)) {
    if (!item || !item.accelerator) continue;

    const registerKey = (acc) => {
      try {
        globalShortcut.register(acc, () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (action === 'playPause') {
              mainWindow.webContents.send('global-play-pause');
            } else {
              mainWindow.webContents.send('global-navigate', action);
            }
          }
        });
      } catch (err) {
        console.warn(`Konnte globalen Hotkey '${acc}' für '${action}' nicht registrieren:`, err);
      }
    };

    registerKey(item.accelerator);

    // If playPause is num0, also register Insert as fallback for when NumLock is off on Windows
    if (action === 'playPause' && item.accelerator.toLowerCase() === 'num0') {
      registerKey('Insert');
    }
  }
}

app.setName('UtilityPlus');
app.name = 'UtilityPlus';

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 800,
    minHeight: 520,
    backgroundColor: '#0a0d14',
    title: 'UtilityPlus',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    try {
      app.dock.setIcon(iconPath);
    } catch (e) {}
  }
  // Protocol handler for asset:// with full HTTP Range (206 Partial Content) support for smooth video streaming
  protocol.handle('asset', (request) => {
    try {
      const u = new URL(request.url);
      const targetPath = u.searchParams.get('path');
      if (!targetPath) {
        return new Response('Missing path', { status: 400 });
      }
      const resolvedPath = path.resolve(targetPath);
      if (!fs.existsSync(resolvedPath)) {
        return new Response('File not found', { status: 404 });
      }

      const stat = fs.statSync(resolvedPath);
      const fileSize = stat.size;
      const rangeHeader = request.headers.get('range');

      const ext = path.extname(resolvedPath).toLowerCase();
      let mime = 'application/octet-stream';
      if (ext === '.mp4') mime = 'video/mp4';
      else if (ext === '.webm') mime = 'video/webm';
      else if (ext === '.webp') mime = 'image/webp';
      else if (ext === '.png') mime = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;

        const nodeStream = fs.createReadStream(resolvedPath, { start, end });
        const webStream = Readable.toWeb(nodeStream);

        return new Response(webStream, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': mime
          }
        });
      } else {
        const nodeStream = fs.createReadStream(resolvedPath);
        const webStream = Readable.toWeb(nodeStream);

        return new Response(webStream, {
          status: 200,
          headers: {
            'Content-Length': fileSize.toString(),
            'Content-Type': mime,
            'Accept-Ranges': 'bytes'
          }
        });
      }
    } catch (err) {
      console.error('Fehler beim Laden von Asset:', request.url, err);
      return new Response('Asset not found', { status: 404 });
    }
  });

  // Handle IPC request for data
  ipcMain.handle('get-lineup-data', async () => {
    const rootDir = getLineupsDirectory();
    try {
      importLineupsFromDownloads(rootDir);
    } catch (e) {}
    watchLineupsDirectory();
    return scanLineupDirectory(rootDir);
  });

  // Handle opening lineups directory in native file explorer / Finder
  ipcMain.handle('open-lineups-directory', async () => {
    const dir = getLineupsDirectory();
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {}
    }
    await shell.openPath(dir);
    return dir;
  });

  // Handle opening chrome extension directory in native file explorer / Finder
  ipcMain.handle('open-extension-directory', async () => {
    const dir = getExtensionDirectory();
    if (dir && fs.existsSync(dir)) {
      await shell.openPath(dir);
      return dir;
    }
    return null;
  });

  // Handle opening callout map directory for a specific map or base
  ipcMain.handle('open-callout-folder', async (event, mapName) => {
    try {
      const calloutData = findCalloutImage(mapName);
      const folder = calloutData ? calloutData.folderPath : null;
      if (folder && fs.existsSync(folder)) {
        await shell.openPath(folder);
        return folder;
      }
      const candidateBases = getCandidateCalloutDirs();
      for (const base of candidateBases) {
        if (fs.existsSync(base)) {
          await shell.openPath(base);
          return base;
        }
      }
    } catch (e) {
      console.error('Fehler in open-callout-folder:', e);
    }
    return null;
  });

  ipcMain.handle('restart-and-install-update', () => {
    if (autoUpdater) {
      autoUpdater.quitAndInstall();
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    if (autoUpdater && app.isPackaged) {
      try {
        return await autoUpdater.checkForUpdates();
      } catch (e) {
        return { error: e.message };
      }
    }
    return null;
  });

  ipcMain.handle('get-hotkeys', () => {
    return loadHotkeysFromDisk();
  });

  ipcMain.handle('set-hotkeys', (event, newHotkeys) => {
    if (newHotkeys && typeof newHotkeys === 'object') {
      currentHotkeys = { ...DEFAULT_HOTKEYS, ...newHotkeys };
      saveHotkeysToDisk(currentHotkeys);
      registerGlobalHotkeys(currentHotkeys);
    }
    return currentHotkeys;
  });

  createWindow();
  registerGlobalHotkeys();
  setupAutoUpdater();
  watchLineupsDirectory();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
