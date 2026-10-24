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
    if (categories.length > 0) {
      result.push({ name: mName, categories });
    }
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

function getDocumentsLineupsDir() {
  try {
    return path.join(app.getPath('documents'), 'UtilityPlus', 'CS2_Lineups');
  } catch (e) {
    return path.join(process.cwd(), 'CS2_Lineups');
  }
}

function copyDirectoryRecursively(src, dest) {
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
    if (entry.name.startsWith('.') || entry.name.toLowerCase().includes('hier_lineups') || entry.name.toLowerCase().includes('readme')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursively(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (e) {}
      }
    }
  }
}

function syncAndProtectLineups() {
  const docsDir = getDocumentsLineupsDir();
  if (!fs.existsSync(docsDir)) {
    try {
      fs.mkdirSync(docsDir, { recursive: true });
    } catch (e) {}
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

function hasActualContent(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.some(e => !e.startsWith('.') && !e.toLowerCase().includes('hier_lineups') && !e.toLowerCase().includes('readme'));
  } catch (e) {
    return false;
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
let watcherDebounce = null;

function watchLineupsDirectory() {
  if (lineupsWatcher) {
    try {
      lineupsWatcher.close();
    } catch (e) {}
    lineupsWatcher = null;
  }
  const dir = getLineupsDirectory();
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
  try {
    lineupsWatcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.startsWith('.') || filename.includes('tmp') || filename.endsWith('.crdownload'))) return;
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

  // Handle IPC request for data
  ipcMain.handle('get-lineup-data', async () => {
    const rootDir = getLineupsDirectory();
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
