'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  detectSources: () => ipcRenderer.invoke('sources:detect'),
  browseSource: () => ipcRenderer.invoke('sources:browse'),
  listSourceTree: (source) => ipcRenderer.invoke('sources:tree', source),

  startExport: (config) => ipcRenderer.invoke('export:start', config),
  estimateExport: (config) => ipcRenderer.invoke('export:estimate', config),
  pauseExport: () => ipcRenderer.invoke('export:pause'),
  resumeExport: () => ipcRenderer.invoke('export:resume'),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),

  listHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  openPath: (dirPath) => ipcRenderer.invoke('shell:openPath', dirPath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', String(text || '')),

  onExportProgress: (callback) => subscribe('export:progress', callback),
  onExportLog: (callback) => subscribe('export:log', callback),
  onExportComplete: (callback) => subscribe('export:complete', callback),
});

function subscribe(channel, callback) {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
