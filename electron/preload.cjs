const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitorStatsShell', {
  setRunAtStartup: (enabled) => ipcRenderer.send('monitorstats:set-run-at-startup', Boolean(enabled)),
  setFpsMonitor: (monitor) => ipcRenderer.send('monitorstats:set-fps-monitor', /^\d+$/.test(String(monitor)) ? String(monitor) : '1'),
  setPollingInterval: (intervalMs) => ipcRenderer.send('monitorstats:set-polling-interval', intervalMs),
  refreshHardware: () => ipcRenderer.send('monitorstats:refresh-hardware'),
  setWidgetLayout: (layout) => ipcRenderer.send('monitorstats:set-widget-layout', layout),
  minimizeWindow: () => ipcRenderer.send('monitorstats:minimize-window'),
  toggleWindowMaximized: () => ipcRenderer.invoke('monitorstats:toggle-window-maximized'),
  getDisplays: () => ipcRenderer.invoke('monitorstats:get-displays'),
  getAppVersion: () => ipcRenderer.invoke('monitorstats:get-app-version'),
  getWindowsBuildInfo: () => ipcRenderer.invoke('monitorstats:get-windows-build-info'),
  checkForUpdates: () => ipcRenderer.invoke('monitorstats:check-for-updates'),
  openLatestRelease: () => ipcRenderer.invoke('monitorstats:open-latest-release'),
  getOntConfig: () => ipcRenderer.invoke('monitorstats:get-ont-config'),
  saveOntConfig: (config) => ipcRenderer.invoke('monitorstats:save-ont-config', config),
  onDisplays: (callback) => {
    const handler = (_event, displays) => callback(displays);
    ipcRenderer.on('monitorstats:displays', handler);
    return () => ipcRenderer.removeListener('monitorstats:displays', handler);
  },
  onGameFps: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('monitorstats:game-fps', handler);
    return () => ipcRenderer.removeListener('monitorstats:game-fps', handler);
  },
  onHardwareStats: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('monitorstats:hardware', handler);
    return () => ipcRenderer.removeListener('monitorstats:hardware', handler);
  },
  onHardwareError: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('monitorstats:hardware-error', handler);
    return () => ipcRenderer.removeListener('monitorstats:hardware-error', handler);
  },
  onRefreshState: (callback) => {
    const handler = (_event, refreshing) => callback(Boolean(refreshing));
    ipcRenderer.on('monitorstats:refresh-state', handler);
    return () => ipcRenderer.removeListener('monitorstats:refresh-state', handler);
  },
});
