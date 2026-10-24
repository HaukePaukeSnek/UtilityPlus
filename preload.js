const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLineupData: () => ipcRenderer.invoke('get-lineup-data'),
  onGlobalNavigate: (callback) => {
    const handler = (event, direction) => callback(direction);
    ipcRenderer.on('global-navigate', handler);
    return () => ipcRenderer.removeListener('global-navigate', handler);
  },
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update')
});

