const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLineupData: () => ipcRenderer.invoke('get-lineup-data'),
  openLineupsDirectory: () => ipcRenderer.invoke('open-lineups-directory'),
  onLineupsUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('lineups-updated', handler);
    return () => ipcRenderer.removeListener('lineups-updated', handler);
  },
  onGlobalNavigate: (callback) => {
    const handler = (event, direction) => callback(direction);
    ipcRenderer.on('global-navigate', handler);
    return () => ipcRenderer.removeListener('global-navigate', handler);
  },
  onGlobalPlayPause: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('global-play-pause', handler);
    return () => ipcRenderer.removeListener('global-play-pause', handler);
  },
  getHotkeys: () => ipcRenderer.invoke('get-hotkeys'),
  setHotkeys: (hotkeys) => ipcRenderer.invoke('set-hotkeys', hotkeys),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateChecking: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update-checking', handler);
    return () => ipcRenderer.removeListener('update-checking', handler);
  },
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (event, percent) => callback(percent);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onUpdateNotAvailable: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  },
  onUpdateError: (callback) => {
    const handler = (event, err) => callback(err);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update')
});

