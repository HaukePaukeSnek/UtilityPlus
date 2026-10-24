const { app, BrowserWindow, globalShortcut, protocol, net, ipcMain } = require('electron');
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

function scanLineupDirectory(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const maps = [];
  const mapEntries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const mapEntry of mapEntries) {
    if (mapEntry.name.startsWith('.') || !mapEntry.isDirectory()) continue;
    const mapPath = path.join(baseDir, mapEntry.name);

    const categories = [];
    const catEntries = fs.readdirSync(mapPath, { withFileTypes: true });

    for (const catEntry of catEntries) {
      if (catEntry.name.startsWith('.') || !catEntry.isDirectory()) continue;
      const catPath = path.join(mapPath, catEntry.name);

      const lineups = [];
      const lineupEntries = fs.readdirSync(catPath, { withFileTypes: true });

      for (const lEntry of lineupEntries) {
        if (lEntry.name.startsWith('.') || !lEntry.isDirectory()) continue;
        const lPath = path.join(catPath, lEntry.name);

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

        const name = txtInfo['Anzeige'] || jsonInfo.displayName || jsonInfo.name || lEntry.name;
        const techniqueLabel = txtInfo['Technik'] || jsonInfo.techniqueLabel || 'Standard';
        const movementLabel = txtInfo['Bewegung'] || jsonInfo.movementLabel || 'Standard';
        const precisionLabel = txtInfo['Präzision'] || jsonInfo.precisionLabel || 'Standard';

        const files = fs.readdirSync(lPath);
        const video = files.find(f => /\.(mp4|webm|mkv)$/i.test(f));
        let image = files.find(f => /\.(webp|png|jpe?g)$/i.test(f) && !f.toLowerCase().includes('thumb'));
        if (!image) {
          image = files.find(f => /\.(webp|png|jpe?g)$/i.test(f));
        }

        lineups.push({
          folder: lEntry.name,
          name: name,
          techniqueLabel: techniqueLabel,
          movementLabel: movementLabel,
          precisionLabel: precisionLabel,
          videoUrl: video ? toAssetUrl(path.join(lPath, video)) : null,
          imageUrl: image ? toAssetUrl(path.join(lPath, image)) : null
        });
      }

      lineups.sort((a, b) => a.name.localeCompare(b.name));

      if (lineups.length > 0) {
        categories.push({
          name: catEntry.name,
          lineups
        });
      }
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));

    if (categories.length > 0) {
      maps.push({
        name: mapEntry.name,
        categories
      });
    }
  }

  maps.sort((a, b) => a.name.localeCompare(b.name));
  return maps;
}

function registerGlobalHotkeys() {
  const directions = [
    { key: 'Up', dir: 'up' },
    { key: 'Down', dir: 'down' },
    { key: 'Left', dir: 'left' },
    { key: 'Right', dir: 'right' }
  ];

  directions.forEach(({ key, dir }) => {
    try {
      globalShortcut.register(key, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('global-navigate', dir);
        }
      });
    } catch (err) {
      console.warn(`Konnte globalen Hotkey '${key}' nicht registrieren:`, err);
    }
  });
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

function getLineupsDirectory() {
  if (app.isPackaged) {
    const resourcePath = path.join(process.resourcesPath, 'CS2_Lineups');
    if (fs.existsSync(resourcePath)) {
      return resourcePath;
    }
    const execPath = path.join(path.dirname(process.execPath), 'CS2_Lineups');
    if (fs.existsSync(execPath)) {
      return execPath;
    }
  }
  const devPath = path.join(__dirname, 'CS2_Lineups');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return path.join(process.cwd(), 'CS2_Lineups');
}

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[AutoUpdater] Info:', err.message);
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4000);
  }
}

  // Handle IPC request for data
  ipcMain.handle('get-lineup-data', async () => {
    const rootDir = getLineupsDirectory();
    return scanLineupDirectory(rootDir);
  });

  ipcMain.handle('restart-and-install-update', () => {
    if (autoUpdater) {
      autoUpdater.quitAndInstall();
    }
  });

  createWindow();
  registerGlobalHotkeys();
  setupAutoUpdater();

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
